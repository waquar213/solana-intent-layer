/**
 * CompliancePlatform — the facade that composes the gateway, the hash-chained audit
 * log, RBAC and the profile registry, and enforces the prompt's rule that EVERY
 * governance action is authenticated, AUTHORIZED, AUDITABLE and versioned:
 *
 *   - `evaluate()` runs the gateway and writes a `compliance_decision` audit record
 *     (denied when blocked) — so every decision is reproducible AND on the chain.
 *   - `governanceAction()` is the single choke point for administrative changes: it
 *     checks the permission, writes a `governance`/`admin_action` record with the
 *     outcome (success or DENIED), and returns whether it was allowed — an
 *     unauthorized attempt is itself audited, never silent.
 *   - `exportAudit()` requires `audit.export` and audits the export.
 *
 * The platform GATES and RECORDS; it never signs or moves funds (non-custodial).
 */
import { AuditLog, type AuditFilter, type AuditSink, type ChainCheck } from './audit.js';
import type { ComplianceEnv } from './env.js';
import { ComplianceGateway, type GatewayOptions } from './gateway.js';
import { can, DEFAULT_ROLES } from './governance.js';
import type { ProfileRegistry } from './profiles.js';
import type {
  AuditCategory,
  AuditRecord,
  ComplianceDecision,
  ComplianceRequest,
  Permission,
  Role,
  RoleAssignment,
} from './types.js';

export interface CompliancePlatformDeps {
  registry: ProfileRegistry;
  auditSink: AuditSink;
  env: ComplianceEnv;
  roleAssignments?: readonly RoleAssignment[];
  roles?: readonly Role[];
  gateway?: GatewayOptions;
}

export interface GovernanceActionResult {
  allowed: boolean;
  record: AuditRecord;
}

export class CompliancePlatform {
  private readonly gateway: ComplianceGateway;
  private readonly audit: AuditLog;
  private readonly assignments: readonly RoleAssignment[];
  private readonly roles: readonly Role[];

  constructor(private readonly deps: CompliancePlatformDeps) {
    this.gateway = new ComplianceGateway(deps.registry, deps.gateway ?? {});
    this.audit = new AuditLog(deps.auditSink, deps.env);
    this.assignments = deps.roleAssignments ?? [];
    this.roles = deps.roles ?? DEFAULT_ROLES;
  }

  /** Evaluate an action and record the decision on the audit chain. */
  async evaluate(request: ComplianceRequest): Promise<ComplianceDecision> {
    const decision = this.gateway.evaluate(request, this.deps.env.now());
    await this.audit.record({
      category: 'compliance_decision',
      action: `evaluate:${request.action.feature}`,
      actorId: request.subjectId,
      subjectId: request.subjectId,
      jurisdiction: decision.jurisdiction,
      detail: { verdict: decision.verdict, profileVersion: decision.profileVersion },
      // Only a clean `allow` is a success; block AND the conditional verdicts
      // (require_consent / require_disclosure) did NOT pass as-is → 'denied', with the
      // precise verdict in `detail` so the audit trail isn't flattened to a binary.
      outcome: decision.verdict === 'allow' ? 'success' : 'denied',
    });
    return decision;
  }

  /**
   * The choke point for administrative changes: authorize, then audit the outcome
   * (including a DENIED attempt). Returns whether the action may proceed.
   */
  async governanceAction(
    subjectId: string,
    permission: Permission,
    action: string,
    category: AuditCategory = 'governance',
    detail: Record<string, string | number | boolean> = {},
  ): Promise<GovernanceActionResult> {
    const allowed = can(subjectId, permission, this.assignments, this.roles);
    const record = await this.audit.record({
      category,
      action,
      actorId: subjectId,
      detail: { ...detail, permission },
      outcome: allowed ? 'success' : 'denied',
    });
    return { allowed, record };
  }

  /**
   * Secure audit export — requires `audit.export`; the export itself is audited.
   * NOTE: `audit.export` is a privileged, cross-subject capability (granted only to
   * `auditor`/`admin`) — an auditor legitimately sees all records; scoping to a
   * tenant/subject is a deployment concern layered above via the `filter` and the
   * role assignments, and every export is itself recorded on the chain.
   */
  async exportAudit(
    subjectId: string,
    filter: AuditFilter = {},
  ): Promise<{ allowed: boolean; records: AuditRecord[]; chain: ChainCheck }> {
    const allowed = can(subjectId, 'audit.export', this.assignments, this.roles);
    if (!allowed) {
      await this.audit.record({
        category: 'admin_action',
        action: 'audit.export',
        actorId: subjectId,
        outcome: 'denied',
      });
      return { allowed: false, records: [], chain: { intact: true } };
    }
    const out = await this.audit.export(filter);
    await this.audit.record({
      category: 'admin_action',
      action: 'audit.export',
      actorId: subjectId,
      detail: { count: out.records.length, chainIntact: out.chain.intact },
      outcome: 'success',
    });
    return { allowed: true, records: out.records, chain: out.chain };
  }

  /** Direct access to the audit log for verification/reporting. */
  auditLog(): AuditLog {
    return this.audit;
  }
}

export function createCompliancePlatform(deps: CompliancePlatformDeps): CompliancePlatform {
  return new CompliancePlatform(deps);
}
