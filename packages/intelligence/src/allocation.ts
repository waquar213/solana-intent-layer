/**
 * Allocation + concentration — the "where is my money" view. Groups gross-asset
 * positions along five axes (asset, sector, chain, protocol, liquidity) and
 * measures concentration with the Herfindahl-Hirschman Index over asset weights.
 * Debt positions are excluded here (they are scored as leverage in `risk.ts`),
 * so every weight is a share of GROSS assets and the slices sum to 1.
 */
import { hhi } from './stats.js';
import { ratio } from './money.js';
import type { Allocation, AllocationSlice, Concentration } from './types.js';
import type { NormalizedPortfolio } from './positions.js';

function groupBy(
  positions: NormalizedPortfolio['positions'],
  grossMicros: bigint,
  keyOf: (p: NormalizedPortfolio['positions'][number]) => string,
): AllocationSlice[] {
  const sums = new Map<string, bigint>();
  for (const p of positions) {
    if (p.kind === 'borrowing') continue; // assets only
    const key = keyOf(p);
    sums.set(key, (sums.get(key) ?? 0n) + p.valueMicros);
  }
  const slices: AllocationSlice[] = [];
  for (const [key, valueMicros] of sums) {
    slices.push({ key, valueMicros, weight: ratio(valueMicros, grossMicros) });
  }
  // Descending by value, then key for a stable order among equal/zero slices.
  slices.sort((a, b) =>
    b.valueMicros === a.valueMicros ? a.key.localeCompare(b.key) : b.valueMicros > a.valueMicros ? 1 : -1,
  );
  return slices;
}

export function computeAllocation(np: NormalizedPortfolio): Allocation {
  const g = np.grossAssetsMicros;
  const byAsset = groupBy(np.positions, g, (p) => p.symbol.toUpperCase());
  const bySector = groupBy(np.positions, g, (p) => p.assetClass);
  const byChain = groupBy(np.positions, g, (p) => p.chainId);
  const byProtocol = groupBy(np.positions, g, (p) => p.protocol ?? 'wallet');
  const byLiquidity = groupBy(np.positions, g, (p) => p.liquidity);
  const stablecoinWeight = bySector.find((s) => s.key === 'stablecoin')?.weight ?? 0;
  return { byAsset, bySector, byChain, byProtocol, byLiquidity, stablecoinWeight };
}

/** Concentration is measured at the ASSET level (ETH held on 3 chains is one asset). */
export function computeConcentration(byAsset: AllocationSlice[]): Concentration {
  const weights = byAsset.map((s) => s.weight);
  const h = hhi(weights);
  const effectivePositions = h > 0 ? 1 / h : 0;
  const topAssetWeight = weights.length > 0 ? Math.max(...weights) : 0;
  const top3Weight = [...weights]
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((sum, w) => sum + w, 0);
  return { hhi: h, effectivePositions, topAssetWeight, top3Weight };
}
