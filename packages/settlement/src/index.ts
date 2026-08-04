/**
 * @intent-wallet/settlement — the Universal Settlement Engine (the Stripe of
 * Web3). Drives an approved ExecutionPlan through a deterministic, resumable,
 * idempotent pipeline (pre-flight → liquidity → quote-lock → gas → prepare →
 * execute → cross-chain → reconcile → portfolio → notify) to its financial
 * outcome, or a safe, explained stop. It is the mandatory front door to
 * execution and makes pre-flight re-validation a non-skippable stage, so an
 * approved-but-stale plan can never reach broadcast. It owns no funds and holds
 * no keys.
 */
export type {
  ExecutionPlan,
  SettlementStage,
  SettlementStatus,
  StageRecord,
  Settlement,
  LedgerEntry,
  RecoveryClass,
  RecoveryAction,
  RecoveryDecision,
  PreflightCheck,
  PreflightResult,
  StageError,
  StageResult,
} from './types.js';
export { SETTLEMENT_STAGES } from './types.js';

export { stableHash, createTestEnv, settlementIdFor, type SettlementEnv, type TestEnvOptions } from './env.js';
export { stageIndex, remainingStages } from './stages.js';
export { classifyRecovery } from './recovery.js';
export { ledgerEntry, replay } from './ledger.js';
export {
  InMemorySettlementStore,
  createInMemorySources,
  type PreflightValidator,
  type StageCapability,
  type PortfolioUpdater,
  type SettlementNotifier,
  type SettlementStore,
  type SettlementSources,
  type SourceOverrides,
} from './sources.js';
export { SettlementCoordinator, type CoordinatorOptions } from './coordinator.js';
export { SettlementEngine, createSettlementEngine, type CreateSettlementEngineOptions } from './engine.js';
export { SettlementError, type SettlementErrorCode } from './errors.js';
