/**
 * The mobile app speaks the exact same wire types as the SDK — re-exported (type-only) from
 * `@intent-wallet/sdk` so the two can never drift. These are pure types (no runtime), so
 * Metro never bundles the SDK; only tsc resolves them (via the tsconfig path).
 */
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
  InsightItem,
  AllocationSlice,
  Gate,
  ConfirmationRequirement,
  Permission,
  ExecutionStatus,
  StepState,
  Execution,
  ExecuteResult,
  Identity,
  IdentityAddress,
} from '@intent-wallet/sdk';
