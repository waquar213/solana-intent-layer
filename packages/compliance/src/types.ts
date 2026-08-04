/**
 * Compliance & Governance vocabulary. The design rule (from the prompt): NO
 * hardcoded country rules. Every jurisdiction-specific value lives in a
 * `JurisdictionProfile` — versioned DATA loaded at deploy time — and the engine is
 * generic over it. Money follows the platform convention: integer micro-USD as a
 * bigint; ratios/thresholds that are not money are `number` in [0,1].
 */

// ─────────────────────────────────────────────────────────────────────────────
// Jurisdiction profiles (versioned configuration, not code)
// ─────────────────────────────────────────────────────────────────────────────

/** A capability the wallet may or may not offer in a given jurisdiction. Opaque/config-defined. */
export type ComplianceFeature = string;

/** Classes of personal data, for retention + DSAR. */
export type DataClass = 'identity' | 'contact' | 'financial' | 'behavioral' | 'device' | 'audit' | 'security';

/** What event obliges a report, and how fast. */
export type ReportTrigger =
  'high_value_transfer' | 'sanctions_hit' | 'security_incident' | 'suspicious_activity' | 'periodic';

export interface ConsentRequirement {
  /** Stable key, e.g. 'tos', 'privacy', 'data_sharing', 'marketing'. */
  key: string;
  purpose: string;
  required: boolean;
  /** Consent expires after this many days (re-consent needed); omitted = never expires. */
  expiresDays?: number;
}

export interface RetentionRule {
  dataClass: DataClass;
  /** How long this class must be retained. */
  retainDays: number;
  /** A legal/regulatory hold — this data CANNOT be erased on request while the rule stands. */
  legalHold: boolean;
}

export interface ReportingRequirement {
  key: string;
  trigger: ReportTrigger;
  /** Report must be filed within this many hours of the trigger. */
  withinHours: number;
}

/**
 * The complete, versioned rule set for one jurisdiction / deployment. Loaded as
 * data; the `id` is opaque ('eu', 'sg', 'us-ny', 'default', 'enterprise-acme') so
 * no country logic leaks into code.
 */
export interface JurisdictionProfile {
  id: string;
  /** Monotonic per id; a new version is published, never mutated in place. */
  version: number;
  label: string;
  status: 'draft' | 'active' | 'retired';
  effectiveFromIso: string;
  /** Features NOT offered in this jurisdiction (a hard gate). */
  disabledFeatures: readonly ComplianceFeature[];
  /** Composite risk score (0..1) above which the risk/policy engines must block — consumed downstream. */
  riskThreshold: number;
  /** Transfers at/above this (micro-USD) are "high value" → reporting/disclosure obligations. */
  highValueThresholdMicroUsd: bigint;
  consents: readonly ConsentRequirement[];
  retention: readonly RetentionRule[];
  reporting: readonly ReportingRequirement[];
  /** Counterparties must be screened (sanctions/PEP) before an action proceeds. */
  screeningRequired: boolean;
  /** A sanctions hit is a hard block here (vs. report-and-disclose elsewhere). */
  blockOnSanctions: boolean;
  /** Optional data-residency region tag. */
  dataResidency?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance gateway request / decision
// ─────────────────────────────────────────────────────────────────────────────

export interface ComplianceAction {
  feature: ComplianceFeature;
  /** Transfer amount, if this action moves value (micro-USD). */
  amountMicroUsd?: bigint;
  category?: string;
}

export interface GrantedConsent {
  key: string;
  grantedAtIso: string;
}

/** A counterparty-screening result produced by the risk engine (passed IN — compliance never screens itself). */
export interface ScreeningResult {
  screened: boolean;
  sanctioned: boolean;
  pep?: boolean;
  source: string;
}

export interface ComplianceContext {
  consents: readonly GrantedConsent[];
  screening?: ScreeningResult;
}

export interface ComplianceRequest {
  subjectId: string;
  jurisdictionId: string;
  action: ComplianceAction;
  context: ComplianceContext;
}

/** Most-restrictive wins; ranked so a combiner can pick the worst outcome. */
export type ComplianceVerdict = 'allow' | 'require_consent' | 'require_disclosure' | 'block';

export const VERDICT_RANK: Record<ComplianceVerdict, number> = {
  allow: 0,
  require_disclosure: 1,
  require_consent: 2,
  block: 3,
};

export type ObligationKind = 'report' | 'audit' | 'disclose' | 'screen' | 'retain' | 'consent';

export interface ComplianceObligation {
  kind: ObligationKind;
  detail: string;
  /** For reports: the reporting-requirement key + deadline. */
  reportKey?: string;
  dueWithinHours?: number;
}

export interface ComplianceDecision {
  verdict: ComplianceVerdict;
  jurisdiction: string;
  profileVersion: number;
  reasons: string[];
  /** Consent keys that are required but missing or expired. */
  missingConsents: string[];
  requiredDisclosures: string[];
  obligations: ComplianceObligation[];
  /** The risk threshold this jurisdiction wants the risk/policy engines to enforce. */
  riskThreshold: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────────────────────────────────────

export type AuditCategory =
  | 'login'
  | 'policy_change'
  | 'security'
  | 'automation'
  | 'api_usage'
  | 'admin_action'
  | 'execution_lifecycle'
  | 'governance'
  | 'compliance_decision'
  | 'consent'
  | 'privacy';

export interface AuditEventInput {
  category: AuditCategory;
  action: string;
  actorId: string;
  subjectId?: string;
  jurisdiction?: string;
  /** Non-sensitive structured detail. PII must be referenced by id, never inlined. */
  detail?: Record<string, string | number | boolean>;
  outcome: 'success' | 'failure' | 'denied';
}

export interface AuditRecord extends AuditEventInput {
  seq: number;
  id: string;
  recordedAtIso: string;
  prevHash: string;
  hash: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RBAC + governance
// ─────────────────────────────────────────────────────────────────────────────

/** A governance permission, e.g. 'profile.publish', 'audit.export', 'emergency.activate'. */
export type Permission = string;

export interface Role {
  id: string;
  label: string;
  permissions: readonly Permission[];
}

export interface RoleAssignment {
  subjectId: string;
  roleId: string;
}

export type ApprovalState = 'pending' | 'approved' | 'rejected' | 'applied';

export interface ApprovalRequest {
  id: string;
  /** What is being changed, e.g. 'profile.publish:eu@3'. */
  change: string;
  proposedBy: string;
  /** Distinct approvals required before it can be applied (maker-checker ⇒ ≥ 1, excluding the proposer). */
  requiredApprovals: number;
  approvedBy: readonly string[];
  rejectedBy: readonly string[];
  state: ApprovalState;
  createdAtIso: string;
}

export interface FeatureFlagSet {
  /** Global default enablement per feature. */
  global: Record<ComplianceFeature, boolean>;
  /** Per-jurisdiction overrides. */
  byJurisdiction?: Record<string, Record<ComplianceFeature, boolean>>;
  /** Emergency freeze: features here are OFF everywhere regardless of the above (case-insensitive). */
  emergencyFrozen?: readonly ComplianceFeature[];
  /** Default enablement for an unlisted feature (default true; set false to fail closed). */
  defaultEnabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Privacy / retention / DSAR
// ─────────────────────────────────────────────────────────────────────────────

export interface DataInventoryItem {
  dataClass: DataClass;
  ref: string;
  createdAtIso: string;
}

export interface ErasurePlan {
  subjectId: string;
  erase: DataInventoryItem[];
  retained: Array<{ item: DataInventoryItem; reason: string; untilIso: string | null }>;
}

export interface ExportManifest {
  subjectId: string;
  items: DataInventoryItem[];
  generatedAtIso: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────────────────────

export type ReportKind = 'operational_metrics' | 'security_events' | 'audit_export' | 'compliance_summary';

export interface ReportSpec {
  kind: ReportKind;
  fromIso: string;
  toIso: string;
  jurisdiction?: string;
}

export interface Report {
  kind: ReportKind;
  spec: ReportSpec;
  generatedAtIso: string;
  summary: Record<string, number>;
  records: AuditRecord[];
}
