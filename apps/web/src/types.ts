/**
 * The web app speaks the exact same wire types as the SDK — re-exported from
 * `@intent-wallet/sdk` so the two can never drift. (This file used to hand-maintain a
 * copy; the SDK's `types.ts` is now the single source of truth.)
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
