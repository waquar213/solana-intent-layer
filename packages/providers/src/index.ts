/**
 * @intent-wallet/providers — the universal provider (aggregator) framework.
 * Pluggable swap/bridge/price/gas/simulation providers behind health-scored,
 * circuit-broken registries with automatic failover and quote aggregation. It
 * is the integration layer for every third-party service; nothing downstream
 * ever depends on a specific vendor (ADR-0034). It backs the Route Optimizer
 * and fills the Intent/Execution engines' injected route/price/gas interfaces.
 */
export type {
  Provider,
  ProviderKind,
  SwapProvider,
  SwapRequest,
  SwapQuote,
  BridgeProvider,
  BridgeRequest,
  BridgeQuote,
  CrossChainSwapProvider,
  CrossChainSwapRequest,
  CrossChainSwapQuote,
  CrossChainSwapExecution,
  PriceProvider,
  GasProvider,
  SimulationProvider,
  SimulationRequest,
} from './provider.js';
export { HealthTracker, type HealthSnapshot, type HealthOptions, type CircuitState } from './health.js';
export { ProviderRegistry, type ProviderRegistryOptions } from './registry.js';
export { ProviderError, type ProviderErrorCode } from './errors.js';
export { bestSwapQuote, isValidSwapQuote, type QuoteValidationOptions } from './aggregate.js';
export { makeLifiProvider, usdStringToMicros, type LifiProviderOptions, type FetchLike } from './lifi.js';
export { bestCrossChainQuote, netValueMicros, type BestCrossChainOptions, type RankedCrossChainQuote } from './crosschain.js';
export { RouteOptimizer, type Route, type RouteLeg, type RouteOptimizerOptions } from './route.js';
