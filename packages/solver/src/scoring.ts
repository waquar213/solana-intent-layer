/**
 * Proposal scoring + winner selection. Among the VALID proposals, each is scored
 * on a min-max-normalized weighted blend of cost, completion time, slippage,
 * confidence and the solver's REPUTATION — so a cheaper, faster, more reliable
 * solver wins, and reputation (earned by history) breaks close calls. Pure and
 * deterministic: the same proposal set in any order yields the same winner.
 */
import type { ProposalEvaluation, SolverProposal } from './types.js';

export const SOLVER_WEIGHTS = {
  cost: 0.35,
  time: 0.2,
  slippage: 0.15,
  confidence: 0.1,
  reputation: 0.2,
} as const;

/**
 * Parse a solver-supplied amount string. `feeMicros` comes from THIRD-PARTY solvers competing in
 * the marketplace, so it is adversarial input: a malformed value used to make feeMin/feeMax NaN,
 * which poisoned every HONEST proposal's score too and left `selectWinner`'s comparator returning
 * NaN — an implementation-defined ordering, i.e. an arbitrary auction winner. Unparseable ⇒ the
 * worst possible cost, never a competitive one.
 */
const num = (s: string): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY; // worst on every lower-is-better axis
};

/** Clamp to [0,1], mapping NON-FINITE to 0. `Math.max(0, Math.min(1, NaN))` is NaN — it does not clamp. */
const unit = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** Normalize where LOWER is better → [0,1], 1 = best (min), 0 = worst (max). */
function normLowerBetter(value: number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return Number.isFinite(value) ? 1 : 0;
  if (!Number.isFinite(value)) return 0; // unparseable ⇒ worst
  if (max <= min) return 1;
  return unit(1 - (value - min) / (max - min));
}

/** Score the valid proposals; returns evaluations with a composite score in [0,1]. */
export function scoreProposals(
  valid: SolverProposal[],
  reputationWeight: (solverId: string) => number,
): Array<{ proposal: SolverProposal; score: number; reputationWeight: number }> {
  if (valid.length === 0) return [];
  const fees = valid.map((p) => num(p.feeMicros));
  const etas = valid.map((p) => p.etaSeconds);
  const slips = valid.map((p) => p.slippageBps);
  // Range over the FINITE fees only — otherwise one hostile entry makes the bounds NaN and every
  // honest proposal scores NaN alongside it.
  const finiteFees = fees.filter((f) => Number.isFinite(f));
  const feeMin = finiteFees.length > 0 ? Math.min(...finiteFees) : 0;
  const feeMax = finiteFees.length > 0 ? Math.max(...finiteFees) : 0;
  const etaMin = Math.min(...etas);
  const etaMax = Math.max(...etas);
  const slipMin = Math.min(...slips);
  const slipMax = Math.max(...slips);

  return valid.map((p) => {
    const rep = unit(reputationWeight(p.solverId));
    const score =
      SOLVER_WEIGHTS.cost * normLowerBetter(num(p.feeMicros), feeMin, feeMax) +
      SOLVER_WEIGHTS.time * normLowerBetter(p.etaSeconds, etaMin, etaMax) +
      SOLVER_WEIGHTS.slippage * normLowerBetter(p.slippageBps, slipMin, slipMax) +
      SOLVER_WEIGHTS.confidence * unit(p.confidence) +
      SOLVER_WEIGHTS.reputation * rep;
    return { proposal: p, score: Math.round(unit(score) * 10000) / 10000, reputationWeight: rep };
  });
}

/** Select the winning evaluation: highest score, ties → lower fee, then solver id. */
export function selectWinner(evaluations: ProposalEvaluation[]): SolverProposal | null {
  const scored = evaluations.filter((e) => e.validation.valid);
  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // A malformed fee threw SyntaxError here and took the whole auction down. Sort unparseable
    // fees LAST rather than crashing — a bid we cannot read cannot win a tie.
    const fa = safeFee(a.proposal.feeMicros);
    const fb = safeFee(b.proposal.feeMicros);
    if (fa !== fb) return fa < fb ? -1 : 1;
    return a.proposal.solverId.localeCompare(b.proposal.solverId);
  });
  return scored[0]!.proposal;
}

/** Parse a fee for ordering; unparseable sorts LAST (never wins a tie-break). */
function safeFee(raw: string): bigint {
  try {
    return BigInt(raw);
  } catch {
    return 2n ** 255n;
  }
}
