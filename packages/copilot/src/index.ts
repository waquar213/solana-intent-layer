/**
 * @intent-wallet/copilot — the AI Financial Copilot (the decision layer). An
 * orchestration shell above every engine, constrained BY them: the LLM only
 * picks tools and drafts prose, while recommendations, plan gating, risk/policy
 * surfacing, confidence and fact-verification are deterministic code. It
 * proposes; it never signs and never executes. Every figure it states is grounded
 * in a verified fact; every proposed action must clear Risk AND Policy.
 */
export type {
  Confidence,
  FactSource,
  CitedFact,
  RiskDisclosure,
  PolicyDisclosure,
  Alternative,
  PlanProposal,
  PlanStatus,
  ProposedPlan,
  Recommendation,
  AutomationIntent,
  AutomationSuggestion,
  FollowUp,
  CopilotResponseKind,
  CopilotResponse,
  CopilotRequest,
} from './types.js';

export type { CopilotCapabilities, RouteSummary } from './capabilities.js';
export {
  ScriptedLlmClient,
  type CopilotLlmClient,
  type LlmMessage,
  type LlmTurn,
  type LlmToolSchema,
  type ToolCall,
  type ToolResultMsg,
} from './boundary.js';
export { FactLedger } from './ledger.js';
export {
  ToolDispatcher,
  DEFAULT_TOOLS,
  assertNoExecuteTools,
  type ToolSpec,
  type ToolScope,
  type ToolDeps,
  type ToolOutput,
} from './tools.js';
export { PolicyGate } from './gate.js';
export { verifyResponse, hasUncitedNumerics } from './verify.js';
export { computeConfidence, type ConfidenceInput, type ConfidenceResult } from './confidence.js';
export { ContextAssembler, seedFacts, redact, type ContextBundle } from './context.js';
export { RecommendationBuilder, AutomationSuggester } from './recommend.js';
export {
  defaultPreferences,
  sanitizePreferences,
  InMemoryPreferenceStore,
  PreferenceLearner,
  SYMBOL_RE,
  type UserPreferences,
  type PreferenceStore,
  type Language,
  type RiskTolerance,
  type RoutePreference,
} from './memory.js';
export { Copilot, type CopilotDeps } from './copilot.js';
export { CopilotError, type CopilotErrorCode } from './errors.js';
