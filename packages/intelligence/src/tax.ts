/**
 * Tax analytics — cost-basis tracking and realized-gain computation by lot
 * matching. This is the mechanism; rates and forms are a localization layer on
 * top. Jurisdiction is abstracted to three parameters (lot-matching method,
 * long-term holding threshold, name), so US-FIFO, US-HIFO and a UK-style pooled
 * average are all the same engine with different config.
 *
 * Correctness details that matter for money:
 *  - Events are processed in chronological order, so a disposal can only match
 *    lots acquired before it; anything unmatched is surfaced, never guessed.
 *  - Cost and proceeds are split across lots with EXACT bigint arithmetic; the
 *    rounding remainder is assigned to the last line so per-disposal totals
 *    reconcile to the penny.
 */
import { daysBetween } from './money.js';
import type { RealizedGain, TaxConfig, TaxDisposal, TaxEvent, TaxReport, TaxTerm } from './types.js';

export const TAX_PRESETS = {
  us_fifo: { method: 'FIFO', longTermThresholdDays: 365, jurisdiction: 'US' },
  us_hifo: { method: 'HIFO', longTermThresholdDays: 365, jurisdiction: 'US' },
  uk_pool: { method: 'AVERAGE', longTermThresholdDays: 0, jurisdiction: 'UK' },
} satisfies Record<string, TaxConfig>;

interface Lot {
  amount: bigint;
  costBasisMicros: bigint;
  asOf: string;
}

interface Pool {
  amount: bigint;
  costBasisMicros: bigint;
  earliestAsOf: string;
}

/** A realized line before proceeds are allocated. */
interface PendingLine {
  amount: bigint;
  costBasisMicros: bigint;
  acquiredAt: string;
  disposedAt: string;
  term: TaxTerm;
}

function termOf(acquiredAt: string, disposedAt: string, thresholdDays: number): TaxTerm {
  return daysBetween(acquiredAt, disposedAt) >= thresholdDays ? 'long' : 'short';
}

/** Consume `qty` from lots in the order given (FIFO/LIFO/HIFO handled by pre-sorting). */
function consumeLots(
  lots: Lot[],
  qty: bigint,
  disposedAt: string,
  thresholdDays: number,
): { lines: PendingLine[]; matched: bigint } {
  const lines: PendingLine[] = [];
  let remaining = qty;
  for (const lot of lots) {
    if (remaining <= 0n) break;
    if (lot.amount <= 0n) continue;
    const take = remaining < lot.amount ? remaining : lot.amount;
    const chunkCost = (lot.costBasisMicros * take) / lot.amount; // exact proportional cost
    lines.push({
      amount: take,
      costBasisMicros: chunkCost,
      acquiredAt: lot.asOf,
      disposedAt,
      term: termOf(lot.asOf, disposedAt, thresholdDays),
    });
    lot.amount -= take;
    lot.costBasisMicros -= chunkCost;
    remaining -= take;
  }
  return { lines, matched: qty - remaining };
}

/** Allocate `proceeds` across lines proportionally to amount; remainder → last line so the sum is exact. */
function allocateProceeds(lines: PendingLine[], proceeds: bigint, disposalQty: bigint): RealizedGain[] {
  const out: RealizedGain[] = [];
  let allocated = 0n;
  lines.forEach((ln, i) => {
    let p = disposalQty > 0n ? (proceeds * ln.amount) / disposalQty : 0n;
    if (i === lines.length - 1) p = proceeds - allocated; // remainder to the last line
    allocated += p;
    out.push({
      asset: '',
      amount: ln.amount,
      proceedsMicros: p,
      costBasisMicros: ln.costBasisMicros,
      gainMicros: p - ln.costBasisMicros,
      term: ln.term,
      acquiredAt: ln.acquiredAt,
      disposedAt: ln.disposedAt,
    });
  });
  return out;
}

export function computeTaxReport(events: TaxEvent[], config: TaxConfig): TaxReport {
  // Chronological order; stable for equal timestamps (preserves input order).
  const ordered = [...events].sort((a, b) => Date.parse(a.asOf) - Date.parse(b.asOf));

  const lots = new Map<string, Lot[]>();
  const pools = new Map<string, Pool>();
  const disposals: RealizedGain[] = [];
  const unmatched: TaxDisposal[] = [];

  const emit = (asset: string, lines: RealizedGain[]): void => {
    for (const ln of lines) disposals.push({ ...ln, asset });
  };

  for (const ev of ordered) {
    if (ev.type === 'acquire') {
      if (config.method === 'AVERAGE') {
        const pool = pools.get(ev.asset);
        if (pool) {
          pool.amount += ev.amount;
          pool.costBasisMicros += ev.costBasisMicros;
        } else {
          pools.set(ev.asset, { amount: ev.amount, costBasisMicros: ev.costBasisMicros, earliestAsOf: ev.asOf });
        }
      } else {
        (lots.get(ev.asset) ?? lots.set(ev.asset, []).get(ev.asset)!).push({
          amount: ev.amount,
          costBasisMicros: ev.costBasisMicros,
          asOf: ev.asOf,
        });
      }
      continue;
    }

    // dispose
    if (config.method === 'AVERAGE') {
      const pool = pools.get(ev.asset);
      const avail = pool?.amount ?? 0n;
      const matched = ev.amount < avail ? ev.amount : avail;
      if (pool && matched > 0n) {
        const cost = (pool.costBasisMicros * matched) / pool.amount;
        const matchedProceeds = (ev.proceedsMicros * matched) / ev.amount;
        emit(ev.asset, [
          {
            asset: ev.asset,
            amount: matched,
            proceedsMicros: matched === ev.amount ? ev.proceedsMicros : matchedProceeds,
            costBasisMicros: cost,
            gainMicros: (matched === ev.amount ? ev.proceedsMicros : matchedProceeds) - cost,
            term: termOf(pool.earliestAsOf, ev.asOf, config.longTermThresholdDays),
            acquiredAt: pool.earliestAsOf,
            disposedAt: ev.asOf,
          },
        ]);
        pool.amount -= matched;
        pool.costBasisMicros -= cost;
      }
      const leftover = ev.amount - matched;
      if (leftover > 0n) {
        const leftoverProceeds =
          matched > 0n ? ev.proceedsMicros - (ev.proceedsMicros * matched) / ev.amount : ev.proceedsMicros;
        unmatched.push({ asset: ev.asset, amount: leftover, proceedsMicros: leftoverProceeds, asOf: ev.asOf });
      }
      continue;
    }

    // FIFO / LIFO / HIFO
    const assetLots = lots.get(ev.asset) ?? [];
    const ordering =
      config.method === 'FIFO'
        ? assetLots
        : config.method === 'LIFO'
          ? [...assetLots].reverse()
          : [...assetLots].sort(
              (a, b) => Number(b.costBasisMicros) / Number(b.amount) - Number(a.costBasisMicros) / Number(a.amount),
            ); // HIFO

    const { lines, matched } = consumeLots(ordering, ev.amount, ev.asOf, config.longTermThresholdDays);
    const leftover = ev.amount - matched;
    // Proceeds attributable to the matched portion (leftover keeps its share for the unmatched line).
    const matchedProceeds = leftover > 0n ? (ev.proceedsMicros * matched) / ev.amount : ev.proceedsMicros;
    emit(ev.asset, allocateProceeds(lines, matchedProceeds, matched));
    if (leftover > 0n) {
      unmatched.push({
        asset: ev.asset,
        amount: leftover,
        proceedsMicros: ev.proceedsMicros - matchedProceeds,
        asOf: ev.asOf,
      });
    }
    // Drop emptied lots to keep the list tight.
    lots.set(
      ev.asset,
      assetLots.filter((l) => l.amount > 0n),
    );
  }

  const totals = disposals.reduce(
    (acc, d) => {
      acc.proceedsMicros += d.proceedsMicros;
      acc.costBasisMicros += d.costBasisMicros;
      acc.netGainMicros += d.gainMicros;
      if (d.term === 'short') acc.shortTermGainMicros += d.gainMicros;
      else acc.longTermGainMicros += d.gainMicros;
      return acc;
    },
    { proceedsMicros: 0n, costBasisMicros: 0n, netGainMicros: 0n, shortTermGainMicros: 0n, longTermGainMicros: 0n },
  );

  return { method: config.method, jurisdiction: config.jurisdiction, disposals, totals, unmatched };
}
