/**
 * Injected data sources for the portfolio. The aggregation logic is pure; these
 * interfaces are how it gets real data — implemented by the chain layer
 * (balances) and the price service (prices). Keeping them as interfaces makes
 * aggregation testable with fixtures and the fetch pluggable/cacheable.
 */
import type { PortfolioBalance, PriceInfo } from './types.js';

export interface BalanceSource {
  /** All balances for an identity's addresses, across supported chains. */
  getBalances(identityId: string): Promise<PortfolioBalance[]>;
}

export interface PriceSource {
  /** USD prices keyed by the aggregation key (default: uppercased symbol). */
  getPrices(keys: string[]): Promise<Record<string, PriceInfo>>;
}
