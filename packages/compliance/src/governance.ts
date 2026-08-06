/**
 * Governance: RBAC + change-approval workflows + emergency controls + feature
 * flags. Every governance action the prompt lists must be authenticated,
 * AUTHORIZED, auditable and versioned — this module owns the authorization and the
 * approval state machine; the facade (engine.ts) adds the audit record.
 *
 * The load-bearing safety property is MAKER-CHECKER: whoever proposes a change can
 * never be counted among its approvers, so no single principal can both request and
 * apply a change to the compliance posture. Emergency freeze is the one control
 * that acts immediately (to stop harm) — but activating it is itself a permissioned,
 * audited action.
 */
import type { ComplianceEnv } from './env.js';
import type { ApprovalRequest, ComplianceFeature, FeatureFlagSet, Permission, Role, RoleAssignment } from './types.js';

// ── RBAC ─────────────────────────────────────────────────────────────────────

export const DEFAULT_ROLES: readonly Role[] = [
  { id: 'viewer', label: 'Viewer', permissions: ['dashboard.view', 'report.view'] },
  {
    id: 'operator',
    label: 'Operator',
    permissions: ['dashboard.view', 'report.view', 'feature.toggle', 'approval.propose'],
  },
  {
    id: 'compliance_officer',
    label: 'Compliance Officer',
    permissions: [
      'dashboard.view',
      'report.view',
      'report.generate',
      'profile.propose',
      'approval.propose',
      'approval.decide',
      'audit.view',
    ],
  },
  { id: 'auditor', label: 'Auditor', permissions: ['audit.view', 'audit.export', 'report.view'] },
  { id: 'admin', label: 'Administrator', permissions: ['*'] },
];

export function can(
  subjectId: string,
  permission: Permission,
  assignments: readonly RoleAssignment[],
  roles: readonly Role[] = DEFAULT_ROLES,
): boolean {
  const roleById = new Map(roles.map((r) => [r.id, r]));
  for (const a of assignments) {
    if (a.subjectId !== subjectId) continue;
    const role = roleById.get(a.roleId);
    if (!role) continue;
    if (role.permissions.includes('*') || role.permissions.includes(permission)) return true;
  }
  return false;
}

// ── Approval workflow (maker-checker) ────────────────────────────────────────

export function createApprovalRequest(
  env: ComplianceEnv,
  change: string,
  proposedBy: string,
  requiredApprovals = 1,
): ApprovalRequest {
  return {
    id: env.ids.request(),
    change,
    proposedBy,
    // A non-finite requiredApprovals (from bad/derived config) would make the
    // threshold `approvedBy.length >= NaN` unsatisfiable and deadlock the request;
    // clamp to a finite integer >= 1.
    requiredApprovals: Number.isFinite(requiredApprovals) ? Math.max(1, Math.floor(requiredApprovals)) : 1,
    approvedBy: [],
    rejectedBy: [],
    state: 'pending',
    createdAtIso: env.now(),
  };
}

export interface ApprovalResult {
  request: ApprovalRequest;
  error?: string;
}

/** Record an approval. Rejects self-approval and double-approval; promotes to 'approved' at the threshold. */
export function approve(request: ApprovalRequest, approver: string): ApprovalResult {
  if (request.state !== 'pending') return { request, error: `cannot approve a ${request.state} request` };
  if (approver === request.proposedBy)
    return { request, error: 'maker-checker: the proposer cannot approve their own change' };
  if (request.approvedBy.includes(approver)) return { request, error: 'already approved by this principal' };

  const approvedBy = [...request.approvedBy, approver];
  const state = approvedBy.length >= request.requiredApprovals ? 'approved' : 'pending';
  return { request: { ...request, approvedBy, state } };
}

/** Any rejection moves the whole request to 'rejected'. */
export function reject(request: ApprovalRequest, rejector: string): ApprovalResult {
  if (request.state !== 'pending') return { request, error: `cannot reject a ${request.state} request` };
  return { request: { ...request, rejectedBy: [...request.rejectedBy, rejector], state: 'rejected' } };
}

/** Mark an approved change as applied — only valid from the 'approved' state. */
export function markApplied(request: ApprovalRequest): ApprovalResult {
  if (request.state !== 'approved') return { request, error: `cannot apply a ${request.state} request` };
  return { request: { ...request, state: 'applied' } };
}

export const isApproved = (request: ApprovalRequest): boolean =>
  request.state === 'approved' || request.state === 'applied';

// ── Feature flags + emergency controls ───────────────────────────────────────

/**
 * Is a feature operationally enabled? An emergency freeze wins over everything (a
 * kill switch), then a per-jurisdiction override, then the global default. An
 * unlisted feature defaults to enabled — profile `disabledFeatures` is the
 * authoritative availability gate (enforced in the gateway); flags are the
 * operational override on top.
 */
export const normFeature = (f: string): string => f.trim().toLowerCase();

/** Case/whitespace-insensitive lookup into a per-feature flag record. The emergency freeze already
 *  normalizes both sides; the availability flags MUST do the same, or a variant ('Swap' vs 'swap', or a
 *  stray space) misses a `false` flag and falls through to enabled — a fail-open the freeze specifically
 *  guards against. Normalizes BOTH the query and the stored keys, so it's robust to either casing. */
const lookupFlag = (record: Record<string, boolean> | undefined, feature: string): boolean | undefined => {
  if (!record) return undefined;
  const target = normFeature(feature);
  for (const [k, v] of Object.entries(record)) if (normFeature(k) === target) return v;
  return undefined;
};

export function isFeatureEnabled(feature: ComplianceFeature, jurisdiction: string, flags: FeatureFlagSet): boolean {
  // The kill switch matches case-insensitively, so a casing/whitespace variant of
  // the feature id ('Swap' vs 'swap') cannot slip past an emergency freeze.
  if (flags.emergencyFrozen?.some((f) => normFeature(f) === normFeature(feature))) return false;
  const perJurisdiction = lookupFlag(flags.byJurisdiction?.[jurisdiction], feature);
  if (perJurisdiction !== undefined) return perJurisdiction;
  const global = lookupFlag(flags.global, feature);
  // Default for an unlisted feature. Enabled by default (the profile's
  // `disabledFeatures` is the authoritative availability gate), but a
  // security-conscious deployment can set `defaultEnabled: false` to fail closed.
  return global ?? flags.defaultEnabled ?? true;
}

/** Freeze a feature everywhere (emergency kill switch). Returns a new flag set. */
export function freezeFeature(flags: FeatureFlagSet, feature: ComplianceFeature): FeatureFlagSet {
  const frozen = new Set(flags.emergencyFrozen ?? []);
  frozen.add(feature);
  return { ...flags, emergencyFrozen: [...frozen] };
}

export function unfreezeFeature(flags: FeatureFlagSet, feature: ComplianceFeature): FeatureFlagSet {
  return { ...flags, emergencyFrozen: (flags.emergencyFrozen ?? []).filter((f) => f !== feature) };
}
