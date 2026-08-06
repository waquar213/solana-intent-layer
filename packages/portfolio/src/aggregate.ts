/**
 * Portfolio aggregation — the pure core of the "chains are invisible" promise.
 * Groups balances by asset symbol, merges the same asset across chains (keeping
 * per-chain provenance), values everything in micro-USD with integer math, then
 * splits dust from the headline list and sorts by value.
 *
 * MVP grouping key = uppercased symbol. A canonical asset registry (mapping
 * (chain, address) → asset id, so two different tokens sharing a symbol don't
 * collide) is a documented follow-up; the function accepts an optional
 * `assetKey` override so that registry can plug in without an API change.
 */
import { assetValueMicros, scaleAmount, usdToMicros } from './money.js';
import type { PortfolioBalance, PriceInfo, UnifiedAsset, UnifiedPortfolio } from './types.js';

export interface AggregateOptions {
  /** Prices keyed by the SAME key `assetKey` produces (default: uppercased symbol). */
  prices?: Record<string, PriceInfo>;
  /** Values strictly below this (micro-USD) are dust. Default $1. */
  dustThresholdMicros?: bigint;
  /** Override the grouping key (e.g. a canonical asset registry lookup). */
  assetKey?: (balance: PortfolioBalance) => string;
}

const DEFAULT_DUST = 1_000_000n; // $1

export function aggregatePortfolio(balances: PortfolioBalance[], options: AggregateOptions = {}): UnifiedPortfolio {
  const prices = options.prices ?? {};
  const dustThreshold = options.dustThresholdMicros ?? DEFAULT_DUST;
  const keyOf = options.assetKey ?? ((b: PortfolioBalance) => b.symbol.toUpperCase());

  // Group balances by asset key.
  const groups = new Map<string, PortfolioBalance[]>();
  for (const balance of balances) {
    if (balance.amount < 0n) continue; // defensive: never negative holdings
    const key = keyOf(balance);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(balance);
  }

  const assets: UnifiedAsset[] = [];
  let anyStale = false;
  const unpricedSymbols: string[] = [];

  for (const [key, group] of groups) {
    const decimals = Math.max(...group.map((b) => b.decimals));
    // Sum base amounts normalized to the group's max decimals (exact, no floats).
    const amount = group.reduce((sum, b) => sum + scaleAmount(b.amount, b.decimals, decimals), 0n);
    if (amount === 0n) continue; // drop empty positions

    const price = prices[key];
    const priceStale = price?.stale === true;
    // A held asset with NO price (feed down, or a token the price service doesn't cover) has an UNKNOWN
    // value — NOT $0. Emitting 0 into a "complete" total and folding it into dust makes a real holding
    // vanish silently (Doctrine: a network failure is not "$0"). Flag it, surface it (never dust), and
    // record the symbol so the caller knows the total is a PARTIAL sum.
    const unpriced = price === undefined;
    const valueMicros = price ? assetValueMicros(amount, decimals, usdToMicros(price.usd)) : 0n;
    if (priceStale) anyStale = true;
    if (unpriced) unpricedSymbols.push(group[0]!.symbol);

    assets.push({
      symbol: group[0]!.symbol,
      amount,
      decimals,
      valueMicros,
      priceUsd: price?.usd ?? null,
      chains: group.map((b) => ({ chainId: b.chainId, amount: b.amount, tokenAddress: b.tokenAddress })),
      isDust: !unpriced && valueMicros < dustThreshold, // an unpriced holding is surfaced, not folded away as $0-dust
      stale: priceStale,
      unpriced,
    });
  }

  // Sort by value desc, then symbol for stable ordering of equal/unpriced assets.
  assets.sort((a, b) =>
    b.valueMicros === a.valueMicros ? a.symbol.localeCompare(b.symbol) : b.valueMicros > a.valueMicros ? 1 : -1,
  );

  const main = assets.filter((a) => !a.isDust);
  const dust = assets.filter((a) => a.isDust);
  const totalValueMicros = assets.reduce((sum, a) => sum + a.valueMicros, 0n);

  return { totalValueMicros, assets: main, dust, stale: anyStale, unpricedSymbols };
}
