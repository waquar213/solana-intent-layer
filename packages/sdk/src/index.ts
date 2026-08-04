/**
 * @intent-wallet/sdk — the official TypeScript client for the Intent Wallet API. A
 * zero-dependency, framework-agnostic typed client for the `/v1` surface: it mirrors
 * the wire exactly (money is decimal strings), surfaces problem+json as a typed
 * `ApiError`, and injects its HTTP transport so it runs and tests in any runtime.
 * A boring functional core (`plan`/`authorize`/`execute`/`getPortfolio`/`getStatus`)
 * with a thin fluent `createClient` on top. Signing stays server-side — the SDK holds
 * no keys.
 */

// Fluent client (the ergonomic entry point).
export { createClient, type ClientConfig, type IntentClient, type PlanHandle } from './client.js';

// Functional core.
export { plan, authorize, execute, getPortfolio, getInsights, getIdentity, getStatus } from './functions.js';
export type { ClientOpts } from './request.js';

// Transport seam.
export type { TransportFetch, TransportFetchInit, TransportFetchResponse } from './transport.js';

// Typed errors.
export { ApiError, isApiError, type AppErrorCode, type TransportErrorCode } from './errors.js';

// Optional non-throwing surface.
export { toResult, type Result } from './result.js';

// The wire types (the single source of truth for request/response shapes).
export type {
  RiskLevel,
  PlanAmount,
  PlanStep,
  ExecutionPlan,
  Outcome,
  PlanResponse,
  PortfolioHolding,
  PortfolioSummary,
  PortfolioInsights,
  AllocationSlice,
  InsightsAllocation,
  InsightsConcentration,
  InsightsRisk,
  InsightItem,
  Gate,
  ConfirmationRequirement,
  Permission,
  ExecutionStatus,
  StepState,
  Execution,
  ExecuteResult,
  StatusResponse,
  IdentityAddress,
  Identity,
  PlanRequest,
  AuthorizeRequest,
  ExecuteRequest,
  ProblemDetails,
} from './types.js';
