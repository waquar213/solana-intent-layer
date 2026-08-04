import { describe, expect, it } from 'vitest';
import { applyScenario } from '../src/scenario.js';
import type { AssetReturnSeries, Position } from '../src/types.js';

const pos = (over: Partial<Position> & Pick<Position, 'kind' | 'symbol' | 'valueMicros'>): Position => ({
  id: over.id ?? over.symbol,
  chainId: 'ethereum',
  amount: 0n,
  decimals: 18,
  ...over,
});

describe('scenario engine', () => {
  it('reprices a spot holding linearly under a price shock', () => {
    const r = applyScenario([pos({ kind: 'token', symbol: 'BTC', valueMicros: 10_000_000_000n })], {
      kind: 'priceShock',
      symbol: 'BTC',
      deltaPct: -20,
    });
    expect(r.netWorthAfterMicros).toBe(8_000_000_000n);
    expect(r.deltaMicros).toBe(-2_000_000_000n);
    expect(r.deltaPct).toBeCloseTo(-0.2, 6);
  });

  it('reprices an LP position with impermanent loss (√r), not a naive linear mark', () => {
    const lp = pos({
      kind: 'lp',
      symbol: 'ETH/USDC',
      valueMicros: 10_000_000_000n,
      legs: [
        { symbol: 'ETH', valueMicros: 5_000_000_000n },
        { symbol: 'USDC', valueMicros: 5_000_000_000n },
      ],
    });
    const r = applyScenario([lp], { kind: 'priceShock', symbol: 'ETH', deltaPct: 100 }); // ETH doubles
    // 50/50 pool, one leg ×2 → value ×√2 ≈ 14,142, strictly below the 15,000 hold value.
    expect(Number(r.netWorthAfterMicros)).toBeGreaterThan(14_000_000_000);
    expect(Number(r.netWorthAfterMicros)).toBeLessThan(14_200_000_000);
    expect(r.netWorthAfterMicros).toBeLessThan(15_000_000_000n); // impermanent loss vs holding
  });

  it('propagates a shock to correlated assets by beta when asked', () => {
    const positions = [
      pos({ kind: 'token', symbol: 'ETH', valueMicros: 5_000_000_000n }),
      pos({ kind: 'token', symbol: 'WBTC', valueMicros: 5_000_000_000n }),
    ];
    const returns: AssetReturnSeries[] = [
      { symbol: 'ETH', returns: [0.1, -0.1, 0.2, -0.2] },
      { symbol: 'WBTC', returns: [0.1, -0.1, 0.2, -0.2] }, // β = 1 vs ETH
    ];
    const isolated = applyScenario(
      positions,
      { kind: 'priceShock', symbol: 'ETH', deltaPct: -10 },
      { assetReturns: returns },
    );
    const propagated = applyScenario(
      positions,
      { kind: 'priceShock', symbol: 'ETH', deltaPct: -10, propagate: true },
      { assetReturns: returns },
    );
    expect(isolated.deltaPct).toBeCloseTo(-0.05, 6); // only ETH moves
    expect(propagated.deltaPct).toBeCloseTo(-0.1, 6); // WBTC moves too (β=1)
  });

  it('gas scenario reports added cost, holdings unchanged', () => {
    const r = applyScenario(
      [pos({ kind: 'token', symbol: 'ETH', valueMicros: 10_000_000_000n })],
      { kind: 'gasPrice', gwei: 300 },
      {
        gasProfile: { nativeSymbol: 'ETH', nativePriceMicros: 2_000_000_000n, gasUnits: 21_000n, currentGwei: 30 },
      },
    );
    expect(r.deltaMicros).toBe(0n); // net worth unchanged
    expect(r.gasCostDeltaMicros).toBe(11_340_000n); // ($12.60 − $1.26)
  });

  it('bridge outage traps value without changing net worth', () => {
    const r = applyScenario(
      [
        pos({ kind: 'token', symbol: 'ETH', valueMicros: 7_000_000_000n }),
        pos({ id: 'bridged', kind: 'token', symbol: 'ETH', valueMicros: 3_000_000_000n, bridge: 'wormhole' }),
      ],
      { kind: 'bridgeUnavailable', bridge: 'wormhole' },
    );
    expect(r.trappedValueMicros).toBe(3_000_000_000n);
    expect(r.netWorthAfterMicros).toBe(10_000_000_000n);
  });
});

describe('scenario — hostile numeric inputs never crash the request', () => {
  // `BigInt(Math.round(NaN | Infinity))` throws a RangeError. `gwei` comes from a caller-supplied
  // scenario spec, and JSON.parse('{"gwei":1e400}') yields Infinity — so this was reachable from
  // an ordinary request body and would have surfaced as a 500.
  const positions: Position[] = [pos({ kind: 'token', symbol: 'ETH', valueMicros: 2_000_000_000n })];

  for (const gwei of [Number.NaN, Number.POSITIVE_INFINITY, -1, Number.NEGATIVE_INFINITY]) {
    it(`survives gwei=${String(gwei)}`, () => {
      expect(() => applyScenario(positions, { kind: 'gasPrice', gwei })).not.toThrow();
    });
  }

  it('still computes a normal gas scenario', () => {
    expect(() => applyScenario(positions, { kind: 'gasPrice', gwei: 30 })).not.toThrow();
  });
});
