/**
 * Universal Policy Engine — the shared vocabulary of the authorization layer.
 *
 * The Policy Engine answers a different question than the Risk Engine. Risk asks
 * "is this DANGEROUS?" (scam token, sanctioned address, honeypot). Policy asks
 * "is the user AUTHORIZED / has the user APPROVED this?" (over a limit, new
 * recipient, automation not pre-approved, biometric required). The two are
 * orthogonal and BOTH must pass. Policy composes with Risk taking the
 * MOST-RESTRICTIVE of the two verdicts — Policy can only ever TIGHTEN, never
 * loosen, a Risk decision, and a `block` on either side is terminal.
 *
 * The engine AUTHORIZES. It never accesses keys and never signs — it emits an
 * `ExecutionPermission` whose `mayProceedToSign` is the single boolean the
 * Execution layer reads.
 *
 * Money is integer bigint micro-USD (µUSD), never a float.
 */
import type { SecurityDecision, SecurityVerdict } from '@intent-wallet/risk';

export type { SecurityDecision, SecurityVerdict } from '@intent-wallet/risk';

/** The twelve policy domains a rule can govern. */
export type PolicyType =
  | 'transaction'
  | 'automation'
  | 'approval'
  | 'risk'
  | 'bridge'
  | 'swap'
  | 'gas'
  | 'device'
  | 'ai'
  | 'enterprise'
  | 'emergency'
  | 'recovery';

/** Every request resolves to exactly one outcome. Ordered least→most restrictive. */
export type PolicyOutcome =
  'approved' | 'approved_with_confirmation' | 'deferred' | 'escalated' | 'expired' | 'blocked';

/** Restrictiveness rank — higher is more restrictive. Drives most-restrictive-wins conflict resolution. */
export const OUTCOME_RANK: Record<PolicyOutcome, number> = {
  approved: 0,
  approved_with_confirmation: 1,
  deferred: 2,
  escalated: 3,
  expired: 4,
  blocked: 5,
};

export type TrustLevel = 'trusted' | 'known' | 'unknown';

/** Rank for trust comparisons — higher is more trusted. */
export const TRUST_RANK: Record<TrustLevel, number> = { unknown: 0, known: 1, trusted: 2 };

/** A step-up the user must satisfy before an authorized-with-confirmation action can sign. */
export type ConfirmationRequirement =
  | { kind: 'biometric' }
  | { kind: 'device_pin' }
  | { kind: 'passkey' }
  | { kind: 'second_approver'; role: string }
  | { kind: 'waiting_period'; seconds: number }
  | { kind: 'guardian_quorum'; m: number; n: number };

export interface RuleEffect {
  outcome: PolicyOutcome;
  requirement?: ConfirmationRequirement;
  code: string;
  reason: string;
}

/**
 * Typed condition AST — a rule's `when`. Deliberately NOT a parsed string DSL:
 * rules are pure data that typecheck at authoring time, serialize to JSON, diff
 * for simulation, and hash for tamper-evidence. Every leaf reads only the
 * immutable `PolicyContext` — never a clock, network, or the raw request's
 * money fields.
 */
export type ConditionExpr =
  | { op: 'always' }
  | { op: 'and'; all: ConditionExpr[] }
  | { op: 'or'; any: ConditionExpr[] }
  | { op: 'not'; expr: ConditionExpr }
  | { op: 'amount_gte'; microsUsd: bigint }
  | { op: 'amount_exceeds_daily_remaining' }
  | { op: 'recipient_is_new' }
  | { op: 'recipient_trust_below'; level: TrustLevel }
  | { op: 'risk_score_gte'; score: number }
  | { op: 'risk_verdict_is'; verdict: SecurityVerdict }
  | { op: 'security_score_below'; score: number }
  | { op: 'device_untrusted' }
  | { op: 'biometric_unavailable' }
  | { op: 'intent_kind_in'; kinds: string[] }
  | { op: 'policy_type_is'; type: PolicyType }
  | { op: 'automation_not_preapproved' }
  | { op: 'approval_is_unlimited' }
  | { op: 'time_within_window'; window: { startHour: number; endHour: number } }
  | { op: 'network_unhealthy' }
  | { op: 'emergency_active' }
  | { op: 'recovery_mode' };

export interface PolicyRule {
  id: string;
  type: PolicyType;
  title: string;
  description: string;
  /** Higher wins. Reserved priority bands are documented in presets.ts. */
  priority: number;
  enabled: boolean;
  when: ConditionExpr;
  effect: RuleEffect;
  /** Parent rule/template id (inheritance): a child may only be equal-or-more-restrictive. */
  extends?: string;
  /** When false, no override or child rule may downgrade this rule's effect. */
  overridable: boolean;
  version: number;
  createdAtIso: string;
  createdBy: string;
}

export type PolicyBasis = 'strict' | 'balanced' | 'permissive' | 'custom';

export interface PolicySet {
  id: string;
  name: string;
  version: number;
  parentSetId?: string;
  rules: PolicyRule[];
  basis: PolicyBasis;
  createdAtIso: string;
  createdBy: string;
  /** env.hash(canonicalize(rules)) — tamper-evidence + simulation diffing. */
  contentHash: string;
}

export interface PolicyRequest {
  requestId: string;
  policyType: PolicyType;
  intentKind: string;
  /** ADVISORY ONLY — the ContextEngine re-derives the authoritative amount from the plan quote. */
  amountMicros?: bigint;
  recipient?: { address: string; chainId: string };
  approval?: { token: string; spender: string; amountBase: bigint; decimals: number };
  automationRuleId?: string;
  planId?: string;
  intentId?: string;
  principalId: string;
}

/** Immutable, deeply-frozen snapshot the rules evaluate against. Built by the ContextEngine. */
export interface PolicyContext {
  request: PolicyRequest;
  /** From RiskEngine.evaluate(subjectFor(request)). */
  risk: SecurityDecision;
  /** Portfolio health score [0,100] from the Intelligence engine, or 100 if unavailable. */
  securityScore: number;
  recipient: { trust: TrustLevel; isNew: boolean };
  device: { trusted: boolean; biometricAvailable: boolean };
  limits: { dailyRemainingMicros: bigint };
  network: { healthy: boolean };
  flags: { emergency: boolean; recovery: boolean };
  /** env.now() stamped exactly once; every time-based condition reads this. */
  nowIso: string;
}

export interface FiredRule {
  ruleId: string;
  type: PolicyType;
  priority: number;
  outcome: PolicyOutcome;
  code: string;
  reason: string;
  requirement?: ConfirmationRequirement;
  /** The condition op-codes that matched — the machine-readable "why". */
  matched: string[];
  overridable: boolean;
}

export type ConflictKind = 'outcome_divergence' | 'override_of_nonoverridable' | 'priority_tie_divergence';

export interface RuleConflict {
  ruleIds: [string, string];
  kind: ConflictKind;
  a: PolicyOutcome;
  b: PolicyOutcome;
}

export type ResolvedBy = 'hard_block' | 'nonoverridable_floor' | 'priority' | 'most_restrictive' | 'rule_id_order';

export interface ConflictResolution {
  conflict: RuleConflict;
  resolvedTo: PolicyOutcome;
  by: ResolvedBy;
}

export interface PolicyDecision {
  requestId: string;
  outcome: PolicyOutcome;
  firedRules: FiredRule[];
  decidedBy: string[];
  conflicts: ConflictResolution[];
  requirements: ConfirmationRequirement[];
  summary: string;
  decisionHash: string;
  evaluatedAtIso: string;
  latencyMs?: number;
}

/** The single execution-facing verdict after Risk and Policy are composed. */
export type CombinedGate = 'allow' | 'require_confirmation' | 'defer' | 'escalate' | 'block';

export interface ExecutionPermission {
  gate: CombinedGate;
  /** The Risk decision, verbatim. */
  risk: SecurityDecision;
  policy: PolicyDecision;
  /** Which side(s) forced the gate — no silent authority. */
  drivenBy: ('risk' | 'policy')[];
  requirements: ConfirmationRequirement[];
  reasons: string[];
  /** Binds this permission to one exact plan — a permission for plan A cannot authorize plan B. */
  planId?: string;
  intentId?: string;
  /** The ONLY boolean the Execution layer reads. True IFF gate==='allow' and no requirements remain. */
  mayProceedToSign: boolean;
}

// --- Audit ---

export interface DecisionRecord {
  seq: number;
  requestId: string;
  decision: PolicyDecision;
  permission?: ExecutionPermission;
  principalId: string;
  activeSetHash: string;
  recordedAtIso: string;
  /** Hash of the previous record — the chain link. */
  prevHash: string;
  hash: string;
}

// --- Metrics ---

export interface PolicyMetrics {
  total: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  approvalRate: number;
  confirmationRate: number;
  blocked: number;
  escalated: number;
  deferred: number;
  expired: number;
  automationOverrides: number;
  violationsByCode: Record<string, number>;
}
