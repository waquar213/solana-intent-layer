/**
 * Performance — PnL and the time-series metrics. Two independent truths:
 *  - UNREALIZED PnL is computed from cost basis on current positions (needs no
 *    history), and only over positions whose cost basis is known, so PnL and
 *    its denominator always refer to the same set.
 *  - TWR / volatility / drawdown come from the net-worth history and are
 *    time-weighted: deposits and withdrawals are removed so the number measures
 *    the PORTFOLIO's performance, not the user's contribution timing. When no
 *    history is supplied we return nulls and `hasHistory: false` rather than
 *    fabricating a series — the engine never invents financial data.
 */
import { annualizeVol, drawdown, simpleReturns, stdev } from './stats.js';
import { microsToUsd, ratio } from './money.js';
import type { CashFlow, NetWorthPoint, Performance } from './types.js';
import type { NormalizedPortfolio } from './positions.js';

const DEFAULT_PPY = 365;

/** Net flow (µUSD) landing in the half-open period (prevAsOf, curAsOf]. */
function flowInPeriod(flows: CashFlow[], prevAsOf: string, curAsOf: string): bigint {
  const lo = Date.parse(prevAsOf);
  const hi = Date.parse(curAsOf);
  let net = 0n;
  for (const f of flows) {
    const t = Date.parse(f.asOf);
    if (t > lo && t <= hi) net += f.amountMicros;
  }
  return net;
}

export function computePerformance(
  np: NormalizedPortfolio,
  history: NetWorthPoint[] = [],
  flows: CashFlow[] = [],
  periodsPerYear: number = DEFAULT_PPY,
): Performance {
  // --- Unrealized PnL, over positions that carry a cost basis ---
  let costBasisMicros = 0n;
  let markMicros = 0n;
  for (const p of np.positions) {
    if (p.kind === 'borrowing') continue;
    if (p.costBasisMicros === undefined) continue;
    costBasisMicros += p.costBasisMicros;
    markMicros += p.valueMicros;
  }
  const unrealizedPnlMicros = markMicros - costBasisMicros;
  const unrealizedPnlPct = costBasisMicros > 0n ? ratio(unrealizedPnlMicros, costBasisMicros) : null;

  // --- History-derived metrics ---
  const hasHistory = history.length >= 2;
  if (!hasHistory) {
    return {
      unrealizedPnlMicros,
      unrealizedPnlPct,
      costBasisMicros,
      hasHistory: false,
      twr: null,
      growthMicros: null,
      growthPct: null,
      volatilityAnnual: null,
      maxDrawdown: null,
      currentDrawdown: null,
      series: [],
    };
  }

  const first = history[0]!;
  const last = history[history.length - 1]!;
  const growthMicros = last.netWorthMicros - first.netWorthMicros;
  const growthPct = first.netWorthMicros > 0n ? ratio(growthMicros, first.netWorthMicros) : null;

  // Flow-adjusted period returns: rₜ = (Vₜ − flowₜ) / Vₜ₋₁ − 1  →  TWR = Π(1+rₜ) − 1.
  const periodReturns: number[] = [];
  let twrProduct = 1;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]!;
    const cur = history[i]!;
    const prevLevel = microsToUsd(prev.netWorthMicros);
    const flow = microsToUsd(flowInPeriod(flows, prev.asOf, cur.asOf));
    const r = prevLevel > 0 ? (microsToUsd(cur.netWorthMicros) - flow) / prevLevel - 1 : 0;
    periodReturns.push(r);
    twrProduct *= 1 + r;
  }
  const twr = twrProduct - 1;

  const levels = history.map((h) => microsToUsd(h.netWorthMicros));
  const dd = drawdown(levels);
  const volatilityAnnual = annualizeVol(stdev(periodReturns), periodsPerYear);

  return {
    unrealizedPnlMicros,
    unrealizedPnlPct,
    costBasisMicros,
    hasHistory: true,
    twr,
    growthMicros,
    growthPct,
    volatilityAnnual,
    maxDrawdown: dd.maxDrawdown,
    currentDrawdown: dd.currentDrawdown,
    series: history.map((h) => ({ asOf: h.asOf, netWorthMicros: h.netWorthMicros })),
  };
}

// Re-exported so callers can compute a return series without reaching into stats.
export { simpleReturns };
