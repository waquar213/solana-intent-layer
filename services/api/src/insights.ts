/**
 * Portfolio intelligence over HTTP — the bridge that finally puts the tested
 * analytics brain (@intent-wallet/intelligence: allocation, concentration, risk,
 * health, insights) on the live request path. It reuses the SAME two seams the
 * per-user runtime uses (a HoldingsSource + a PriceFetch), so the analysis runs
 * over the authenticated user's REAL holdings and live prices — never a second,
 * drifting copy of the data. The engine analyzes and recommends; it never signs.
 */
import {
  PortfolioIntelligenceEngine,
  usdToMicros,
  type PortfolioIntelligence,
  type PortfolioSnapshot,
  type Position,
} from '@intent-wallet/intelligence';
import type { Holding } from '@intent-wallet/runtime';
import type { HoldingsSource, PriceFetch } from './runtime-provider.js';

/** The two data seams the insights route reads (identical to the runtime's). */
export interface InsightsSource {
  holdingsFor: HoldingsSource;
  pricesFor: PriceFetch;
}

/**
 * Fold the planner's `Holding[]` + a USD price map into the intelligence engine's
 * `PortfolioSnapshot` — one `token` position per (asset, chain) pair, valued in
 * integer µUSD with the same math the portfolio summary uses. An asset with no
 * known price is NOT invented: it carries 0 value and is flagged `stale`, which the
 * engine propagates to the top-level `stale` bit (honest analytics, no fake data).
 */
export function snapshotFromHoldings(
  identityId: string,
  holdings: Holding[],
  prices: Record<string, string>,
  asOf: string,
): PortfolioSnapshot {
  const positions: Position[] = [];
  for (const h of holdings) {
    const price = prices[h.symbol.toUpperCase()];
    for (const chain of h.chains) {
      if (chain.base === 0n) continue; // dust-free: an empty chain row isn't a position
      positions.push({
        id: `${h.symbol}:${chain.chainId}`,
        kind: 'token',
        chainId: chain.chainId,
        symbol: h.symbol,
        amount: chain.base,
        decimals: h.decimals,
        valueMicros: price !== undefined ? (chain.base * usdToMicros(price)) / 10n ** BigInt(h.decimals) : 0n,
        ...(price === undefined ? { stale: true } : {}),
      });
    }
  }
  return { identityId, asOf, positions };
}

// One stateless engine instance — `analyze` is pure, so sharing it is safe.
const engine = new PortfolioIntelligenceEngine();

/** Run the full pipeline (allocation → concentration → risk/health → insights). */
export function analyzeSnapshot(snapshot: PortfolioSnapshot): PortfolioIntelligence {
  return engine.analyze(snapshot);
}

/** JSON-safe projection: every bigint (µUSD values) becomes a decimal string. */
export function toJsonSafe(intel: PortfolioIntelligence): unknown {
  return JSON.parse(JSON.stringify(intel, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)));
}
