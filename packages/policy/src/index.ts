/**
 * @intent-wallet/policy — the Universal Policy Engine (the zero-trust
 * authorization layer). It answers "is the user AUTHORIZED / has the user
 * APPROVED this?" and composes with the Risk engine ("is this dangerous?") so
 * that BOTH must pass before anything reaches execution — taking the
 * most-restrictive of the two, with `block` on either side terminal. Pure and
 * deterministic over an injected `PolicyEnv`; it holds no keys and never signs.
 */
export type {
  PolicyType,
  PolicyOutcome,
  TrustLevel,
  ConfirmationRequirement,
  RuleEffect,
  ConditionExpr,
  PolicyRule,
  PolicyBasis,
  PolicySet,
  PolicyRequest,
  PolicyContext,
  FiredRule,
  ConflictKind,
  RuleConflict,
  ResolvedBy,
  ConflictResolution,
  PolicyDecision,
  CombinedGate,
  ExecutionPermission,
  DecisionRecord,
  PolicyMetrics,
  SecurityDecision,
  SecurityVerdict,
} from './types.js';
export { OUTCOME_RANK, TRUST_RANK } from './types.js';

export { stableHash, createTestEnv } from './env.js';
export type { PolicyEnv, TestEnvOptions } from './env.js';
export { evaluateCondition, UNLIMITED_APPROVAL_THRESHOLD, type ConditionResult } from './conditions.js';
export {
  ContextEngine,
  subjectFor,
  createInMemorySources,
  type ContextSources,
  type InMemorySourceOverrides,
} from './context.js';
export { RuleEngine, detectConflicts, resolveConflicts, type ResolutionOutput } from './rules.js';
export { DecisionEngine, composeWithRisk, type PermissionBinding } from './decision.js';
export { AuditLog, InMemoryAuditSink, type AuditSink, type AuditMeta, type ChainCheck } from './audit.js';
export {
  PolicyRegistry,
  InMemoryPolicyStore,
  InMemoryPolicyVersionStore,
  canonicalizeRules,
  contentHashOf,
  mergeRules,
  type PolicyStore,
  type PolicyVersionStore,
} from './registry.js';
export { POLICY_PRESETS } from './presets.js';
export { PolicySimulator, type SimulationRequest, type SimulationResult, type SimulationRow } from './simulate.js';
export { PolicyAdmin, type UpdatePatch } from './admin.js';
export { computeMetrics } from './metrics.js';
export { PolicyEngine, createPolicyEngine, type PolicyEngineDeps, type CreatePolicyEngineOptions } from './engine.js';
export { PolicyError, type PolicyErrorCode } from './errors.js';
export {
  evaluateSpendGrant,
  type SpendGrant,
  type SpendRequest,
  type SpendGrantVerdict,
  type SpendGrantDenial,
} from './grants.js';
