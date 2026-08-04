import { describe, expect, it } from 'vitest';
import { computePerformance } from '../src/performance.js';
import { normalize } from '../src/positions.js';
import type { CashFlow, NetWorthPoint, Position } from '../src/types.js';

const point = (asOf: string, usd: number): NetWorthPoint => ({ asOf, netWorthMicros: BigInt(usd) * 1_000_000n });

describe('performance', () => {
  it('computes unrealized PnL from cost basis, and reports no history cleanly', () => {
    const np = normalize([
      {
        id: 'x',
        kind: 'token',
        chainId: 'ethereum',
        symbol: 'X',
        amount: 0n,
        decimals: 18,
        valueMicros: 1_200_000_000n,
        costBasisMicros: 1_000_000_000n,
      } satisfies Position,
    ]);
    const perf = computePerformance(np);
    expect(perf.unrealizedPnlMicros).toBe(200_000_000n);
    expect(perf.unrealizedPnlPct).toBeCloseTo(0.2, 6);
    expect(perf.hasHistory).toBe(false);
    expect(perf.twr).toBeNull();
    expect(perf.volatilityAnnual).toBeNull();
  });

  it('derives TWR, growth and drawdown from a net-worth series', () => {
    const history = [
      point('2026-01-01', 1000),
      point('2026-02-01', 1100),
      point('2026-03-01', 990),
      point('2026-04-01', 1050),
    ];
    const perf = computePerformance(normalize([]), history);
    expect(perf.hasHistory).toBe(true);
    expect(perf.twr).toBeCloseTo(0.05, 6); // no flows → last/first − 1
    expect(perf.growthMicros).toBe(50_000_000n);
    expect(perf.growthPct).toBeCloseTo(0.05, 6);
    expect(perf.maxDrawdown).toBeCloseTo(0.1, 6); // 1100 → 990
    expect(perf.currentDrawdown).toBeCloseTo((1100 - 1050) / 1100, 6);
    expect(perf.volatilityAnnual).not.toBeNull();
    expect(perf.series).toHaveLength(4);
  });

  it('is time-weighted: a deposit does not count as performance', () => {
    const history = [point('2026-01-01', 1000), point('2026-02-01', 1500)];
    const flows: CashFlow[] = [{ asOf: '2026-01-15', amountMicros: 400_000_000n }];
    const withFlow = computePerformance(normalize([]), history, flows);
    const withoutFlow = computePerformance(normalize([]), history);
    expect(withFlow.twr).toBeCloseTo(0.1, 6); // (1500 − 400)/1000 − 1
    expect(withoutFlow.twr).toBeCloseTo(0.5, 6); // deposit wrongly counted if flows ignored
  });
});
