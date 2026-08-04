/**
 * Scenario engine — "what if…". Applies a shock to the portfolio and re-prices
 * it deterministically, then re-derives net worth through the same normalizer so
 * debt signs stay correct.
 *
 * Price shocks are not naive:
 *  - A spot holding of the shocked asset moves linearly.
 *  - An LP / vault position re-prices by the constant-value AMM rule: its USD
 *    value scales by Πlegs (legMultiplier)^(legWeight). For a 50/50 pool where
 *    one leg moves ×r and the other is stable, that reduces to the classic √r —
 *    i.e. it captures impermanent loss, not a naive linear mark.
 *  - With `propagate`, correlated assets move by β·shock (β from the supplied
 *    return series), so "BTC −20%" ripples through the book instead of moving
 *    one ticker in isolation.
 *
 * Gas and bridge-outage scenarios don't change holdings; they surface the added
 * cost-to-act and the value newly trapped, which is the real user impact.
 */
import { beta } from './stats.js';
import { ratio, round } from './money.js';
import { normalize } from './positions.js';
import type { AssetReturnSeries, GasProfile, Position, PositionDelta, Scenario, ScenarioResult } from './types.js';

export interface ScenarioOptions {
  gasProfile?: GasProfile;
  /** Per-asset return series enabling `propagate` (β-based) price shocks. */
  assetReturns?: AssetReturnSeries[];
}

/**
 * Multiply a µUSD magnitude by a float factor at micro precision (keeps bigint exactness).
 *
 * `factor` is clamped to a finite, non-negative number FIRST: `BigInt(NaN)` and `BigInt(Infinity)`
 * both THROW a RangeError, and a non-finite factor is reachable from ordinary inputs (an LP
 * weighting can divide by a zero total; `JSON.parse('{"x":1e400}')` yields Infinity). A scenario
 * projection must degrade to "no change", never crash the request.
 */
function scaleMicros(value: bigint, factor: number): bigint {
  const safe = Number.isFinite(factor) && factor >= 0 ? factor : 1;
  const microFactor = BigInt(Math.round(safe * 1_000_000));
  return (value * microFactor) / 1_000_000n;
}

function priceShock(
  positions: Position[],
  symbol: string,
  deltaPct: number,
  propagate: boolean,
  assetReturns: AssetReturnSeries[],
): { positions: Position[]; deltas: PositionDelta[] } {
  const target = symbol.toUpperCase();
  const shockedR = 1 + deltaPct / 100;
  const bySymbol = new Map(assetReturns.map((s) => [s.symbol.toUpperCase(), s.returns]));
  const shockedReturns = bySymbol.get(target);

  const multiplierFor = (sym: string): number => {
    const s = sym.toUpperCase();
    if (s === target) return shockedR;
    if (!propagate || shockedReturns === undefined) return 1;
    const r = bySymbol.get(s);
    if (r === undefined || r.length < 2) return 1;
    const b = beta(r, shockedReturns);
    return 1 + (b * deltaPct) / 100;
  };

  const deltas: PositionDelta[] = [];
  const next = positions.map((p) => {
    let factor: number;
    if (p.kind === 'lp' && p.legs && p.legs.length > 0) {
      const total = p.legs.reduce((sum, l) => sum + Number(l.valueMicros), 0);
      factor =
        total > 0
          ? p.legs.reduce((acc, l) => acc * multiplierFor(l.symbol) ** (Number(l.valueMicros) / total), 1)
          : multiplierFor(p.symbol);
    } else {
      factor = multiplierFor(p.symbol);
    }
    if (factor === 1) return p;
    const after = scaleMicros(p.valueMicros, factor);
    deltas.push({
      id: p.id,
      symbol: p.symbol,
      beforeMicros: p.valueMicros,
      afterMicros: after,
      deltaMicros: after - p.valueMicros,
    });
    return { ...p, valueMicros: after };
  });
  return { positions: next, deltas };
}

/** Gas cost of a set of operations at a given gwei, in µUSD. */
function gasCostMicros(profile: GasProfile, gwei: number): bigint {
  // `gwei` arrives from a caller-supplied scenario spec, so it must be proven finite and
  // non-negative before BigInt(): `BigInt(Math.round(NaN | Infinity))` throws a RangeError, which
  // would surface as a 500 on an otherwise harmless what-if query.
  const safeGwei = Number.isFinite(gwei) && gwei >= 0 ? Math.round(gwei) : 0;
  return (profile.gasUnits * BigInt(safeGwei) * profile.nativePriceMicros) / 1_000_000_000n;
}

export function applyScenario(
  positions: Position[],
  scenario: Scenario,
  options: ScenarioOptions = {},
): ScenarioResult {
  const before = normalize(positions);
  const netWorthBeforeMicros = before.netWorthMicros;
  const notes: string[] = [];

  if (scenario.kind === 'priceShock') {
    const { positions: after, deltas } = priceShock(
      positions,
      scenario.symbol,
      scenario.deltaPct,
      scenario.propagate === true,
      options.assetReturns ?? [],
    );
    const afterNorm = normalize(after);
    const deltaMicros = afterNorm.netWorthMicros - netWorthBeforeMicros;
    if (scenario.propagate) notes.push('Correlated assets moved by β·shock from the supplied return series.');
    if (deltas.some((d) => positions.find((p) => p.id === d.id)?.kind === 'lp')) {
      notes.push('LP positions re-priced with the constant-value AMM rule (impermanent loss captured).');
    }
    return {
      scenario,
      netWorthBeforeMicros,
      netWorthAfterMicros: afterNorm.netWorthMicros,
      deltaMicros,
      deltaPct: netWorthBeforeMicros > 0n ? round(ratio(deltaMicros, netWorthBeforeMicros), 4) : 0,
      positionDeltas: deltas,
      notes,
    };
  }

  if (scenario.kind === 'gasPrice') {
    const profile = options.gasProfile;
    if (!profile) {
      notes.push('No gas profile supplied — cannot estimate cost impact.');
      return {
        scenario,
        netWorthBeforeMicros,
        netWorthAfterMicros: netWorthBeforeMicros,
        deltaMicros: 0n,
        deltaPct: 0,
        positionDeltas: [],
        notes,
      };
    }
    const gasCostDeltaMicros = gasCostMicros(profile, scenario.gwei) - gasCostMicros(profile, profile.currentGwei);
    notes.push(
      `Holdings unchanged; transacting your reference operations costs this much more at ${scenario.gwei} gwei.`,
    );
    return {
      scenario,
      netWorthBeforeMicros,
      netWorthAfterMicros: netWorthBeforeMicros,
      deltaMicros: 0n,
      deltaPct: 0,
      positionDeltas: [],
      gasCostDeltaMicros,
      notes,
    };
  }

  // bridgeUnavailable
  let trapped = 0n;
  for (const p of before.positions) {
    if (p.kind === 'borrowing') continue;
    if (p.bridge === scenario.bridge) trapped += p.valueMicros;
  }
  notes.push(`Value stays on-chain but becomes illiquid until ${scenario.bridge} is restored.`);
  return {
    scenario,
    netWorthBeforeMicros,
    netWorthAfterMicros: netWorthBeforeMicros,
    deltaMicros: 0n,
    deltaPct: 0,
    positionDeltas: [],
    trappedValueMicros: trapped,
    notes,
  };
}
