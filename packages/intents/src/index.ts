/**
 * @intent-wallet/intents — the Universal Intent Engine. Natural language →
 * validated Intent → ExecutionPlan. The decision engine that orchestrates the
 * wallet: AI proposes a typed Intent; deterministic code resolves, plans, and
 * checks it; nothing executes without a plan + a device signature.
 */
export { IntentError, isIntentError, type IntentErrorCode } from './errors.js';
export {
  SCHEMA_VERSION,
  IntentSchema,
  AmountSchema,
  ExecutionPlanSchema,
  PlanStepSchema,
  RiskReportSchema,
  ACTIONABLE_KINDS,
  type Intent,
  type IntentKind,
  type Amount,
  type Schedule,
  type ExecutionPlan,
  type PlanStep,
  type PlanAmount,
  type RiskReport,
} from './schema.js';
export { decimalToBase, baseToDecimal, extractAmountAndAsset, detectAsset, KNOWN_ASSETS } from './amount.js';
export { previewBalanceChanges, type AssetMovement, type BalanceChange } from './preview.js';
export { parseDeterministic, looksNegatedOrDeferred, looksObfuscated } from './parse/deterministic.js';
export { parseBridgeUtterance, type BridgeRoute, type BridgeChainId, type BridgeAsset } from './parse/bridge.js';
export {
  CompositeParser,
  type IntentParser,
  type LlmClient,
  type ParseContext,
  type CompositeParserOptions,
} from './parse/parser.js';
export { resolveAmountToBase } from './plan/resolve.js';
export { planIntent, type PlanOutcome } from './plan/planner.js';
export {
  MapHoldings,
  type EngineContext,
  type HoldingsProvider,
  type PriceProvider,
  type RouteProvider,
  type RiskProvider,
  type Route,
  type RouteLeg,
  type Holding,
} from './plan/context.js';
export { IntentEngine, looksLikeInjection, type EngineResult } from './engine.js';
