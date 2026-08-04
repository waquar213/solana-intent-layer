/**
 * @intent-wallet/runtime — the composition root. Assembles the Intent Engine over
 * real sources (Risk Engine + identity recipient resolution) plus in-memory
 * holdings and deterministic price/route stubs, into one `WalletRuntime` that turns
 * natural language into a verified plan. The seam every real vendor plugin
 * (price feed, DEX aggregator, live balances) slots into without touching the
 * planner. Proposes plans; never signs.
 */
export { createWalletRuntime, WalletRuntime, type WalletRuntimeConfig } from './runtime.js';
export { RiskEngineProvider, MapPrices, StubRouteProvider, type StubRouteOptions } from './adapters.js';

// The execution seam (NL → plan → sign → broadcast → confirm).
export {
  RuntimeStepDriver,
  executePlan,
  fakeStepSigner,
  fakeChainGateway,
  type StepSigner,
  type ChainGateway,
  type StepSimulator,
  type RuntimeStepDriverDeps,
  type ExecuteDeps,
} from './execution.js';

// The capability registry — consulted to reject provably-infeasible plans (fail-closed).
export {
  createDefaultCapabilityService,
  createCapabilityService,
  type CapabilityService,
} from '@intent-wallet/capabilities';

// The gas seam — sponsorship + bounded EIP-1559 fees + fee-token, wired into execute.
export {
  RuntimeGasPlanner,
  staticFeeMarketSource,
  isEvmChain,
  type FeeMarketSource,
  type StepGasPlan,
  type RuntimeGasPlannerDeps,
  type StaticFeeMarketConfig,
} from './gas.js';

// The demo executor — fake signer + fake gateway + real gas planner (local/dev only).
export { createDemoExecutor, type DemoExecutor, type DemoExecutorOptions } from './demo.js';

// Chain wiring — live balances + a real adapter-backed chain gateway.
export { readChainHoldings, mergeHoldings, AdapterChainGateway } from './chains.js';

// The production execution seams — real EVM signing + live executor + balance discovery.
export {
  createLocalEvmDevice,
  createEvmStepSigner,
  createLiveExecutor,
  discoverHoldings,
  type EvmDevice,
  type EvmStepSignerDeps,
  type LiveExecutor,
  type LiveExecutorDeps,
  type ChainAccount,
} from './live.js';

// The authorization gate — intent proposes, policy authorizes, device signs.
export { authorizePlan, type AuthorizeDeps } from './policy.js';
export type { ExecutionPermission } from '@intent-wallet/policy';

// Portfolio (the read side).
export { summarizePortfolio, type PortfolioSummary, type PortfolioHolding } from './portfolio.js';

// Re-exports so a caller can build config without a second import.
export type { Holding, EngineResult, PlanOutcome, ExecutionPlan } from '@intent-wallet/intents';
export type { Execution } from '@intent-wallet/execution';
