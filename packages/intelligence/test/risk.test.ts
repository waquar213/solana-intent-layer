import { describe, expect, it } from 'vitest';
import { computeAllocation, computeConcentration } from '../src/allocation.js';
import { computePerformance } from '../src/performance.js';
import { normalize } from '../src/positions.js';
import { computeRisk } from '../src/risk.js';
import type { AssetReturnSeries, Position, RiskProfile } from '../src/types.js';

const pos = (symbol: string, valueMicros: bigint, kind: Position['kind'] = 'token'): Position => ({
  id: `${symbol}-${kind}`,
  kind,
  chainId: 'ethereum',
  symbol,
  amount: 0n,
  decimals: 18,
  valueMicros,
});

function risk(positions: Position[], assetReturns: AssetReturnSeries[] = []): RiskProfile {
  const np = normalize(positions);
  const alloc = computeAllocation(np);
  const conc = computeConcentration(alloc.byAsset);
  const perf = computePerformance(np);
  return computeRisk(np, alloc, conc, perf, assetReturns);
}

describe('diversification', () => {
  it('weights basis: even split scores high, concentration scores low', () => {
    const even = risk([pos('ETH', 5_000_000_000n), pos('WBTC', 5_000_000_000n)]);
    expect(even.diversificationBasis).toBe('weights');
    expect(even.diversificationScore).toBeCloseTo(100, 4);

    const concentrated = risk([pos('ETH', 9_000_000_000n), pos('WBTC', 1_000_000_000n)]);
    expect(concentrated.diversificationScore).toBeLessThan(30);
  });

  it('correlation basis: uncorrelated assets diversify, correlated ones do not', () => {
    const positions = [pos('ETH', 5_000_000_000n), pos('WBTC', 5_000_000_000n)];
    const correlated: AssetReturnSeries[] = [
      { symbol: 'ETH', returns: [0.1, -0.1, 0.1, -0.1] },
      { symbol: 'WBTC', returns: [0.1, -0.1, 0.1, -0.1] },
    ];
    const uncorrelated: AssetReturnSeries[] = [
      { symbol: 'ETH', returns: [0.1, -0.1, 0.1, -0.1] },
      { symbol: 'WBTC', returns: [0.1, 0.1, -0.1, -0.1] },
    ];
    const corr = risk(positions, correlated);
    const uncorr = risk(positions, uncorrelated);
    expect(corr.diversificationBasis).toBe('correlation');
    expect(corr.diversificationScore).toBeCloseTo(0, 2); // move together → no benefit
    expect(uncorr.diversificationScore).toBeCloseTo(100, 2); // √2 diversification ratio
  });
});

describe('leverage + health', () => {
  it('measures leverage as debt / gross assets', () => {
    const r = risk([pos('ETH', 8_000_000_000n), pos('DAI', 2_000_000_000n, 'borrowing')]);
    expect(r.leverage).toBeCloseTo(0.25, 6);
    const lev = r.healthFactors.find((f) => f.key === 'leverageSafety')!;
    expect(lev.score).toBeCloseTo(50, 4); // 1 − 0.25/0.5
  });

  it('fails CLOSED on an insolvent book: debt with ZERO visible gross assets is max leverage, not "safe"', () => {
    // ratio() returns 0 for a 0 denominator (fine for weights), but debt against $0 gross must NOT read as
    // "no leverage / perfectly safe" — e.g. collateral on an unsupported chain is invisible here, so the
    // wallet shows only the debt. It must be flagged, not cleared with a 100 safety score.
    const r = risk([pos('DAI', 5_000_000_000n, 'borrowing')]); // $5k debt, $0 visible gross
    expect(r.leverage).toBeGreaterThan(0.5); // NOT 0 — over the default target leverage
    const lev = r.healthFactors.find((f) => f.key === 'leverageSafety')!;
    expect(lev.score).toBe(0); // floored: insolvency is maximal danger
  });

  it('health score falls when leverage rises', () => {
    const clean = risk([pos('ETH', 5_000_000_000n), pos('USDC', 5_000_000_000n)]);
    const levered = risk([
      pos('ETH', 5_000_000_000n),
      pos('USDC', 5_000_000_000n),
      pos('DAI', 4_000_000_000n, 'borrowing'),
    ]);
    expect(levered.healthScore).toBeLessThan(clean.healthScore);
  });

  it('health factors re-normalize to sum 1, and history adds stability/drawdown factors', () => {
    const r = risk([pos('ETH', 5_000_000_000n), pos('USDC', 5_000_000_000n)]);
    expect(r.healthFactors).toHaveLength(4); // no history → 4 factors
    const total = r.healthFactors.reduce((s, f) => s + f.weight, 0);
    expect(total).toBeCloseTo(1, 4);
  });
});
