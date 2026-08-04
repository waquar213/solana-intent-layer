/**
 * Decision + composition. `DecisionEngine.decide` turns fired rules into a
 * `PolicyDecision` (winner, machine-readable reasoning, requirements, a stable
 * decision hash). `composeWithRisk` fuses that with the Risk engine's decision
 * into the single `ExecutionPermission` the Execution layer reads.
 *
 * The composition is MOST-RESTRICTIVE-WINS over a combined-gate rank, so:
 *  - a `block` on EITHER side is terminal;
 *  - Policy can only ever TIGHTEN Risk (raise the gate), never loosen it, and
 *    vice-versa — neither side has silent authority to downgrade the other.
 * `mayProceedToSign` (gate === 'allow' && no requirements) is the only boolean
 * Execution reads, and the permission binds to one exact planId/intentId.
 */
import { detectConflicts, resolveConflicts } from './rules.js';
import type { PolicyEnv } from './env.js';
import type {
  CombinedGate,
  ConfirmationRequirement,
  ConflictResolution,
  ExecutionPermission,
  FiredRule,
  PolicyContext,
  PolicyDecision,
  PolicyOutcome,
  SecurityDecision,
} from './types.js';

const GATE_RANK: Record<CombinedGate, number> = { allow: 0, require_confirmation: 1, defer: 2, escalate: 3, block: 4 };
const RANK_TO_GATE: CombinedGate[] = ['allow', 'require_confirmation', 'defer', 'escalate', 'block'];

const OUTCOME_TO_GATE: Record<PolicyOutcome, CombinedGate> = {
  approved: 'allow',
  approved_with_confirmation: 'require_confirmation',
  deferred: 'defer',
  escalated: 'escalate',
  expired: 'require_confirmation',
  blocked: 'block',
};

const VERDICT_TO_GATE = { allow: 'allow', require_confirmation: 'require_confirmation', block: 'block' } as const;

/** Union confirmation requirements, deduped by shape. Only relevant when the winner needs a step-up. */
function collectRequirements(fired: FiredRule[], winner: PolicyOutcome): ConfirmationRequirement[] {
  if (winner === 'approved' || winner === 'blocked') return [];
  const seen = new Set<string>();
  const out: ConfirmationRequirement[] = [];
  for (const f of fired) {
    if (!f.requirement) continue;
    const key = JSON.stringify(f.requirement);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f.requirement);
  }
  return out;
}

export class DecisionEngine {
  constructor(private readonly env: PolicyEnv) {}

  decide(fired: FiredRule[], ctx: PolicyContext, activeSetHash: string): PolicyDecision {
    const { winner, decidedBy, by } = resolveConflicts(fired);
    const conflicts: ConflictResolution[] = detectConflicts(fired).map((conflict) => ({
      conflict,
      resolvedTo: winner,
      by,
    }));
    const requirements = collectRequirements(fired, winner);

    const winningReasons = fired.filter((f) => decidedBy.includes(f.ruleId)).map((f) => f.reason);
    const summary =
      fired.length === 0
        ? 'no policy rule matched — default approved'
        : `${winner} (${by})${winningReasons.length ? ': ' + winningReasons.join('; ') : ''}`;

    // The hash is over the AUTHORITATIVE inputs, not the ids/clock — identical inputs → identical hash.
    const canonical = JSON.stringify({
      requestId: ctx.request.requestId,
      winner,
      fired: [...fired]
        .map((f) => ({ id: f.ruleId, o: f.outcome, m: f.matched }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      activeSetHash,
    });

    return {
      requestId: ctx.request.requestId,
      outcome: winner,
      firedRules: fired,
      decidedBy,
      conflicts,
      requirements,
      summary,
      decisionHash: this.env.hash(canonical),
      evaluatedAtIso: ctx.nowIso,
    };
  }
}

export interface PermissionBinding {
  planId?: string;
  intentId?: string;
}

/** Fuse a Policy decision with a Risk decision into the single execution-facing permission. */
export function composeWithRisk(
  policy: PolicyDecision,
  risk: SecurityDecision,
  binding: PermissionBinding = {},
): ExecutionPermission {
  const riskGate: CombinedGate = VERDICT_TO_GATE[risk.verdict];
  const policyGate: CombinedGate = OUTCOME_TO_GATE[policy.outcome];
  const gateRank = Math.max(GATE_RANK[riskGate], GATE_RANK[policyGate]);
  const gate = RANK_TO_GATE[gateRank] ?? 'block';

  const drivenBy: ('risk' | 'policy')[] = [];
  if (GATE_RANK[riskGate] === gateRank) drivenBy.push('risk');
  if (GATE_RANK[policyGate] === gateRank) drivenBy.push('policy');

  const requirements = gate === 'allow' ? [] : policy.requirements;
  const mayProceedToSign = gate === 'allow' && requirements.length === 0;

  const reasons: string[] = [];
  if (drivenBy.includes('risk') && riskGate !== 'allow') {
    for (const s of risk.report.signals) reasons.push(`risk: ${s.reason}`);
    for (const v of risk.policyViolations) reasons.push(`risk-policy: ${v}`);
  }
  if (drivenBy.includes('policy') && policyGate !== 'allow') reasons.push(`policy: ${policy.summary}`);
  if (reasons.length === 0) reasons.push(gate === 'allow' ? 'authorized' : policy.summary);

  return {
    gate,
    risk,
    policy,
    drivenBy,
    requirements,
    reasons,
    mayProceedToSign,
    ...(binding.planId !== undefined ? { planId: binding.planId } : {}),
    ...(binding.intentId !== undefined ? { intentId: binding.intentId } : {}),
  };
}
