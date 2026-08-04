/**
 * Portfolio types. A `PortfolioBalance` is one asset on one chain (the shape the
 * chain adapters produce); aggregation merges these across chains into
 * `UnifiedAsset`s and one `UnifiedPortfolio` — the "one number, one asset list"
 * the product promises, with per-chain provenance kept for the expand view.
 */
export interface PortfolioBalance {
  chainId: string;
  symbol: string;
  /** Base units (bigint). */
  amount: bigint;
  decimals: number;
  /** null for a native asset; contract/mint address for a token. */
  tokenAddress: string | null;
}

export interface PriceInfo {
  /** USD price per whole token, as a decimal string. */
  usd: string;
  /** ISO-8601 timestamp of the quote (opaque to this package). */
  asOf?: string;
  /** True if the price source flagged this quote as stale. */
  stale?: boolean;
}

/** Per-chain provenance for one asset. */
export interface ChainHolding {
  chainId: string;
  amount: bigint;
  tokenAddress: string | null;
}

export interface UnifiedAsset {
  symbol: string;
  /** Total across chains, normalized to `decimals`. */
  amount: bigint;
  decimals: number;
  /** Total value in micro-USD (0 if unpriced). */
  valueMicros: bigint;
  /** The price used, or null if unpriced. */
  priceUsd: string | null;
  chains: ChainHolding[];
  /** value below the dust threshold. */
  isDust: boolean;
  /** any contributing price/balance was stale. */
  stale: boolean;
}

export interface UnifiedPortfolio {
  totalValueMicros: bigint;
  /** Non-dust assets, sorted by value descending. */
  assets: UnifiedAsset[];
  /** Assets below the dust threshold, folded away in the UI. */
  dust: UnifiedAsset[];
  /** True if any input (balance or price) was stale. */
  stale: boolean;
}
