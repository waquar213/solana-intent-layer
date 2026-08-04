/**
 * @intent-wallet/compliance — the Compliance & Governance engine. A policy-driven,
 * jurisdiction-configurable authorization + governance layer kept OUTSIDE core
 * wallet logic, so a new regulatory environment is a new versioned PROFILE, not a
 * code change.
 *
 *   • profiles   — versioned JurisdictionProfile registry (rules as data; monotonic
 *                  versions; one active per id; generic templates, no country rules).
 *   • gateway    — the deterministic compliance decision (fail-closed, most-restrictive)
 *                  → verdict + obligations (report / screen / disclose / retain / audit).
 *   • consent    — required-vs-granted-vs-expired evaluation.
 *   • privacy    — retention schedules + DSAR export/erasure (erasure reconciled
 *                  against legal holds) + data minimization.
 *   • governance — RBAC + maker-checker approval workflows + emergency freeze + flags.
 *   • audit      — append-only, hash-chained, tamper-evident log + secure export.
 *   • reporting  — deterministic report generation over the audit chain.
 *   • engine     — the facade: every governance action authenticated, authorized,
 *                  auditable, versioned.
 *
 * It GATES and RECORDS; it never holds keys or moves funds — the wallet stays
 * non-custodial. Deterministic (time/ids/hash injected) and offline-testable.
 * Standalone (no internal deps).
 */

// Types
export type {
  ComplianceFeature,
  DataClass,
  ReportTrigger,
  ConsentRequirement,
  RetentionRule,
  ReportingRequirement,
  JurisdictionProfile,
  ComplianceAction,
  GrantedConsent,
  ScreeningResult,
  ComplianceContext,
  ComplianceRequest,
  ComplianceVerdict,
  ObligationKind,
  ComplianceObligation,
  ComplianceDecision,
  AuditCategory,
  AuditEventInput,
  AuditRecord,
  Permission,
  Role,
  RoleAssignment,
  ApprovalState,
  ApprovalRequest,
  FeatureFlagSet,
  DataInventoryItem,
  ErasurePlan,
  ExportManifest,
  ReportKind,
  ReportSpec,
  Report,
} from './types.js';
export { VERDICT_RANK } from './types.js';

// Determinism boundary
export { createTestEnv, stableHash, type ComplianceEnv, type TestEnvOptions } from './env.js';

// Profiles
export { ProfileRegistry, createProfileRegistry, validateProfile, templateProfile } from './profiles.js';

// Gateway
export { ComplianceGateway, type GatewayOptions } from './gateway.js';

// Consent
export { evaluateConsents, type ConsentEvaluation } from './consent.js';

// Privacy / retention / DSAR
export {
  retentionScheduleFor,
  isErasable,
  planErasure,
  planExport,
  minimizeFields,
  type RetentionSchedule,
} from './privacy.js';

// Governance
export {
  DEFAULT_ROLES,
  can,
  createApprovalRequest,
  approve,
  reject,
  markApplied,
  isApproved,
  isFeatureEnabled,
  freezeFeature,
  unfreezeFeature,
  type ApprovalResult,
} from './governance.js';

// Audit
export {
  AuditLog,
  InMemoryAuditSink,
  type AuditSink,
  type AuditFilter,
  type ChainCheck,
  type ChainAnchor,
} from './audit.js';

// Reporting
export { generateReport } from './reporting.js';

// Facade
export {
  CompliancePlatform,
  createCompliancePlatform,
  type CompliancePlatformDeps,
  type GovernanceActionResult,
} from './engine.js';

export { ComplianceError, type ComplianceErrorCode } from './errors.js';
