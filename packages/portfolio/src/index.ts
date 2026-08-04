/**
 * @intent-wallet/portfolio — the unified portfolio engine. Pure aggregation
 * (chains merged into one asset list, integer-math fiat totals) plus the
 * injected source interfaces the chain + price layers implement.
 */
export { usdToMicros, assetValueMicros, formatUsd, scaleAmount, MICRO, MoneyError } from './money.js';
export {
  type PortfolioBalance,
  type PriceInfo,
  type ChainHolding,
  type UnifiedAsset,
  type UnifiedPortfolio,
} from './types.js';
export { aggregatePortfolio, type AggregateOptions } from './aggregate.js';
export { type BalanceSource, type PriceSource } from './source.js';
