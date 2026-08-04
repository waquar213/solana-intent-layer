/**
 * The Rule Engine and conflict resolution — the deterministic heart.
 *
 * `run` sorts rules by (priority desc, ruleId asc) BEFORE evaluating, so the
 * fired set is independent of input order. `resolveConflicts` picks one winner
 * by a TOTAL, shuffle-invariant order:
 *   1. hard block   — any fired `blocked` wins and is terminal.
 *   2. non-overridable floor — a non-overridable rule's outcome is a floor
 *      nothing below it may win.
 *   3. priority     — the highest-priority rule decides.
 *   4. most-restrictive — a priority tie is broken by the higher OUTCOME_RANK.
 *   5. rule-id order — a final tie is broken by ruleId for a stable `decidedBy`.
 * The same fired set in any permutation yields the same winner and decidedBy.
 */
import { evaluateCondition } from './conditions.js';
import { OUTCOME_RANK } from './types.js';
import type { FiredRule, PolicyContext, PolicyOutcome, PolicyRule, RuleConflict } from './types.js';

const RANK_TO_OUTCOME: PolicyOutcome[] = [
  'approved',
  'approved_with_confirmation',
  'deferred',
  'escalated',
  'expired',
  'blocked',
];

const outcomeOfRank = (rank: number): PolicyOutcome => RANK_TO_OUTCOME[rank] ?? 'approved';

export class RuleEngine {
  /** Evaluate rules against a context, returning fired rules in deterministic (priority desc, id asc) order. */
  run(rules: PolicyRule[], ctx: PolicyContext): FiredRule[] {
    const ordered = [...rules].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    const fired: FiredRule[] = [];
    for (const rule of ordered) {
      if (!rule.enabled) continue;
      const result = evaluateCondition(ctx, rule.when);
      if (!result.satisfied) continue;
      fired.push({
        ruleId: rule.id,
        type: rule.type,
        priority: rule.priority,
        outcome: rule.effect.outcome,
        code: rule.effect.code,
        reason: rule.effect.reason,
        matched: result.matched,
        overridable: rule.overridable,
        ...(rule.effect.requirement ? { requirement: rule.effect.requirement } : {}),
      });
    }
    return fired;
  }
}

/** Detect pairwise conflicts among fired rules (diverging outcomes). Deterministic order. */
export function detectConflicts(fired: FiredRule[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  const sorted = [...fired].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (a.outcome === b.outcome) continue;
      const ra = OUTCOME_RANK[a.outcome];
      const rb = OUTCOME_RANK[b.outcome];
      const overrideOfNonOverridable = (!a.overridable && rb < ra) || (!b.overridable && ra < rb);
      const kind = overrideOfNonOverridable
        ? 'override_of_nonoverridable'
        : a.priority === b.priority
          ? 'priority_tie_divergence'
          : 'outcome_divergence';
      conflicts.push({ ruleIds: [a.ruleId, b.ruleId], kind, a: a.outcome, b: b.outcome });
    }
  }
  return conflicts;
}

export interface ResolutionOutput {
  winner: PolicyOutcome;
  decidedBy: string[];
  by: 'hard_block' | 'nonoverridable_floor' | 'priority' | 'most_restrictive' | 'rule_id_order';
}

/** Resolve fired rules to one winning outcome via the total order above. Shuffle-invariant. */
export function resolveConflicts(fired: FiredRule[]): ResolutionOutput {
  if (fired.length === 0) return { winner: 'approved', decidedBy: [], by: 'priority' };

  // 1. Hard block — terminal.
  const blocked = fired.filter((f) => f.outcome === 'blocked');
  if (blocked.length > 0) {
    return { winner: 'blocked', decidedBy: blocked.map((f) => f.ruleId).sort(), by: 'hard_block' };
  }

  // 2. Non-overridable floor.
  const nonOverridable = fired.filter((f) => !f.overridable);
  const floorRank = nonOverridable.length > 0 ? Math.max(...nonOverridable.map((f) => OUTCOME_RANK[f.outcome])) : -1;

  // 3 + 4. Priority, then most-restrictive on a priority tie.
  const maxPriority = Math.max(...fired.map((f) => f.priority));
  const top = fired.filter((f) => f.priority === maxPriority);
  const topMaxRank = Math.max(...top.map((f) => OUTCOME_RANK[f.outcome]));

  let finalRank: number;
  let by: ResolutionOutput['by'];
  if (floorRank > topMaxRank) {
    finalRank = floorRank;
    by = 'nonoverridable_floor';
  } else {
    finalRank = topMaxRank;
    if (top.length === 1) {
      by = 'priority';
    } else {
      const topAtMaxRank = top.filter((f) => OUTCOME_RANK[f.outcome] === topMaxRank);
      by = topAtMaxRank.length < top.length ? 'most_restrictive' : 'rule_id_order';
    }
  }

  const winner = outcomeOfRank(finalRank);
  const decidedBy = fired
    .filter((f) => OUTCOME_RANK[f.outcome] === finalRank)
    .map((f) => f.ruleId)
    .sort();
  return { winner, decidedBy, by };
}
