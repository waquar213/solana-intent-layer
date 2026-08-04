import { describe, expect, it } from 'vitest';
import { computeAllocation, computeConcentration } from '../src/allocation.js';
import { normalize } from '../src/positions.js';
import type { Position } from '../src/types.js';

const pos = (over: Partial<Position> & Pick<Position, 'kind' | 'symbol' | 'valueMicros'>): Position => ({
  id: over.id ?? `${over.symbol}-${over.chainId ?? 'ethereum'}`,
  chainId: 'ethereum',
  amount: 0n,
  decimals: 18,
  ...over,
});

describe('normalization — net worth = assets − debt', () => {
  it('subtracts borrowing and weights against gross assets', () => {
    const np = normalize([
      pos({ kind: 'token', symbol: 'ETH', valueMicros: 6_000_000_000n }),
      pos({ kind: 'token', symbol: 'USDC', valueMicros: 3_000_000_000n }),
      pos({ kind: 'borrowing', symbol: 'DAI', valueMicros: 1_000_000_000n }),
    ]);
    expect(np.grossAssetsMicros).toBe(9_000_000_000n);
    expect(np.debtMicros).toBe(1_000_000_000n);
    expect(np.netWorthMicros).toBe(8_000_000_000n);
    const eth = np.positions.find((p) => p.symbol === 'ETH')!;
    expect(eth.weight).toBeCloseTo(6 / 9, 6);
    expect(eth.assetClass).toBe('native');
    expect(np.positions.find((p) => p.symbol === 'USDC')!.assetClass).toBe('stablecoin');
    // debt carries weight 0 (scored as leverage, not allocation)
    expect(np.positions.find((p) => p.kind === 'borrowing')!.weight).toBe(0);
  });
});

describe('allocation + concentration', () => {
  it('breaks down by asset/sector/chain and folds an asset across chains', () => {
    const np = normalize([
      pos({ kind: 'token', symbol: 'ETH', chainId: 'ethereum', valueMicros: 4_000_000_000n }),
      pos({ kind: 'token', symbol: 'ETH', chainId: 'arbitrum', valueMicros: 2_000_000_000n }),
      pos({ kind: 'token', symbol: 'USDC', chainId: 'ethereum', valueMicros: 3_000_000_000n }),
    ]);
    const alloc = computeAllocation(np);
    // ETH folds across two chains into one asset slice.
    const ethSlice = alloc.byAsset.find((s) => s.key === 'ETH')!;
    expect(ethSlice.valueMicros).toBe(6_000_000_000n);
    expect(ethSlice.weight).toBeCloseTo(6 / 9, 6);
    expect(alloc.stablecoinWeight).toBeCloseTo(3 / 9, 6);
    // chain view keeps provenance
    expect(alloc.byChain.find((s) => s.key === 'arbitrum')!.weight).toBeCloseTo(2 / 9, 6);

    const conc = computeConcentration(alloc.byAsset);
    expect(conc.topAssetWeight).toBeCloseTo(6 / 9, 6);
    expect(conc.hhi).toBeCloseTo((6 / 9) ** 2 + (3 / 9) ** 2, 6);
    expect(conc.effectivePositions).toBeCloseTo(1 / conc.hhi, 6);
    expect(conc.top3Weight).toBeCloseTo(1, 6);
  });

  it('an empty portfolio is well-defined (no NaN)', () => {
    const np = normalize([]);
    const alloc = computeAllocation(np);
    const conc = computeConcentration(alloc.byAsset);
    expect(np.netWorthMicros).toBe(0n);
    expect(conc.hhi).toBe(0);
    expect(conc.effectivePositions).toBe(0);
    expect(conc.topAssetWeight).toBe(0);
  });
});
