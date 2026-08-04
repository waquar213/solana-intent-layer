/**
 * The PolicyGate — the SINGLE chokepoint to a `ready` plan and the integration
 * seam with the Policy Engine. The LLM has no tool that returns a `ProposedPlan`;
 * the orchestrator constructs one ONLY here. Because `PolicyEngine.evaluate`
 * composes Risk internally, the gate reads the one authoritative `permission.gate`
 * (no composition drift). It FAILS CLOSED: if no policy engine is wired, a plan
 * is never presented as ready.
 */
import type { ExecutionPermission, PolicyRequest, PolicyType, SecurityDecision } from '@intent-wallet/policy';
import type { CopilotCapabilities } from './capabilities.js';
import type { PlanProposal, PolicyDisclosure, ProposedPlan, RiskDisclosure } from './types.js';

const POLICY_TYPES: PolicyType[] = [
  'transaction',
  'automation',
  'approval',
  'risk',
  'bridge',
  'swap',
  'gas',
  'device',
  'ai',
  'enterprise',
  'emergency',
  'recovery',
];

const toPolicyType = (s: string): PolicyType =>
  (POLICY_TYPES as string[]).includes(s) ? (s as PolicyType) : 'transaction';

function riskDisclosureFrom(risk: SecurityDecision): RiskDisclosure {
  return {
    level: risk.report.level,
    reasons: risk.report.signals.map((s) => s.reason),
    blocking: risk.verdict === 'block',
  };
}

function policyDisclosureFrom(perm: ExecutionPermission): PolicyDisclosure {
  return {
    gate: perm.gate,
    reasons: perm.reasons,
    requirements: perm.requirements.map((r) => r.kind),
    blocking: perm.gate === 'block',
  };
}

function toPolicyRequest(candidate: PlanProposal, principalId: string, requestId: string): PolicyRequest {
  return {
    requestId,
    policyType: toPolicyType(candidate.policyType),
    intentKind: candidate.intentKind,
    principalId,
    ...(candidate.amountMicros !== undefined ? { amountMicros: candidate.amountMicros } : {}),
    ...(candidate.recipient ? { recipient: candidate.recipient } : {}),
    ...(candidate.approval ? { approval: candidate.approval } : {}),
    ...(candidate.planId !== undefined ? { planId: candidate.planId } : {}),
    ...(candidate.intentId !== undefined ? { intentId: candidate.intentId } : {}),
  };
}

export class PolicyGate {
  constructor(
    private readonly evaluatePolicy: CopilotCapabilities['evaluatePolicy'],
    private readonly idFor: () => string,
  ) {}

  private failClosed(candidate: PlanProposal, reason: string): ProposedPlan {
    return {
      status: 'explained_gate',
      plan: null,
      security: { level: 'low', reasons: [], blocking: false },
      policy: { gate: 'block', reasons: [reason], requirements: [], blocking: true },
      approvalPrompt: candidate.summary,
      signed: false,
    };
  }

  async evaluate(candidate: PlanProposal, principalId: string): Promise<ProposedPlan> {
    if (!this.evaluatePolicy) return this.failClosed(candidate, 'policy engine unavailable — failing closed');
    let permission: ExecutionPermission;
    try {
      permission = await this.evaluatePolicy(toPolicyRequest(candidate, principalId, this.idFor()));
    } catch {
      // Any failure to authorize (e.g. an unresolvable plan quote) fails closed.
      return this.failClosed(candidate, 'policy evaluation failed — failing closed');
    }
    const status: ProposedPlan['status'] =
      permission.gate === 'allow' && permission.mayProceedToSign
        ? 'ready'
        : permission.gate === 'block'
          ? 'explained_gate'
          : 'needs_confirmation';
    return {
      status,
      plan: status === 'explained_gate' ? null : candidate,
      security: riskDisclosureFrom(permission.risk),
      policy: policyDisclosureFrom(permission),
      permission,
      approvalPrompt: candidate.summary,
      signed: false,
    };
  }
}
