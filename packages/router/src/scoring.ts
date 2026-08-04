/**
 * The scoring engine — the optimizer's crown-jewel IP. It normalizes each
 * candidate's factors against the candidate SET (min-max, correct direction),
 * then combines them with weights into a single [0,1] score. Because scoring is
 * a pure function of the candidates + weights, it is fully deterministic and
 * testable, and its behavior changes with user preference (the weight presets).
 *
 * Every factor is normalized so 1 = best among the candidates:
 *   output      more of the destination asset is better
 *   cost        lower fees are better
 *   slippage    lower slippage is better
 *   time        faster is better
 *   reliability higher provider health is better
 *   risk        lower risk is better
 *   freshness   fresher quotes are better
 */
import type { RouteCandidate, ScoreBreakdown, ScoredCandidate, ScoringWeights } from './types.js';

const RISK_SCORE: Record<RouteCandidate['riskLevel'], number> = { low: 1, medium: 0.6, high: 0.25 };
const MAX_QUOTE_AGE_MS = 30_000;

/** Preset weight profiles selected by user preference. Each sums to 1. */
export const WEIGHT_PRESETS = {
  balanced: { output: 0.3, cost: 0.2, slippage: 0.15, time: 0.1, reliability: 0.1, risk: 0.1, freshness: 0.05 },
  cheapest: { output: 0.25, cost: 0.4, slippage: 0.2, time: 0.02, reliability: 0.05, risk: 0.05, freshness: 0.03 },
  fastest: { output: 0.2, cost: 0.1, slippage: 0.1, time: 0.4, reliability: 0.12, risk: 0.05, freshness: 0.03 },
  safest: { output: 0.15, cost: 0.1, slippage: 0.1, time: 0.05, reliability: 0.3, risk: 0.27, freshness: 0.03 },
} as const satisfies Record<string, ScoringWeights>;

export type WeightPreset = keyof typeof WEIGHT_PRESETS;

/** Normalizes weights to sum to 1 (so callers can pass raw relative weights). */
export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const sum =
    weights.output +
    weights.cost +
    weights.slippage +
    weights.time +
    weights.reliability +
    weights.risk +
    weights.freshness;
  if (sum <= 0) return WEIGHT_PRESETS.balanced;
  const k = 1 / sum;
  return {
    output: weights.output * k,
    cost: weights.cost * k,
    slippage: weights.slippage * k,
    time: weights.time * k,
    reliability: weights.reliability * k,
    risk: weights.risk * k,
    freshness: weights.freshness * k,
  };
}

/** min-max normalize where LOWER raw is better (cost/slippage/time). Returns 1 for the min. */
function normLowerBetter(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0; // unscorable → worst
  if (max <= min) return 1; // all equal → neutral-best
  return clamp01(1 - (value - min) / (max - min));
}
/** min-max normalize where HIGHER raw is better (output). Returns 1 for the max. */
function normHigherBetter(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0; // unscorable → worst
  if (max <= min) return 1;
  return clamp01((value - min) / (max - min));
}

function breakdown(candidate: RouteCandidate, set: RouteCandidate[]): ScoreBreakdown {
  const outputs = set.map((c) => Number(c.outputBase));
  const fees = set.map((c) => Number(c.feeMicros));
  const slips = set.map((c) => c.slippageBps);
  const times = set.map((c) => c.etaSeconds);
  return {
    output: normHigherBetter(Number(candidate.outputBase), Math.min(...outputs), Math.max(...outputs)),
    cost: normLowerBetter(Number(candidate.feeMicros), Math.min(...fees), Math.max(...fees)),
    slippage: normLowerBetter(candidate.slippageBps, Math.min(...slips), Math.max(...slips)),
    time: normLowerBetter(candidate.etaSeconds, Math.min(...times), Math.max(...times)),
    reliability: clamp01(candidate.healthScore),
    risk: RISK_SCORE[candidate.riskLevel] ?? 0, // unknown risk from a provider ⇒ treated as worst
    freshness: clamp01(1 - candidate.quoteAgeMs / MAX_QUOTE_AGE_MS),
  };
}

function weighted(b: ScoreBreakdown, w: ScoringWeights): number {
  return clamp01(
    b.output * w.output +
    b.cost * w.cost +
    b.slippage * w.slippage +
    b.time * w.time +
    b.reliability * w.reliability +
    b.risk * w.risk +
    b.freshness * w.freshness
  );
}

/** Scores and ranks candidates (highest first). Weights are normalized to sum to 1. */
export function scoreCandidates(candidates: RouteCandidate[], weights: ScoringWeights): ScoredCandidate[] {
  const w = normalizeWeights(weights);
  return candidates
    .map((candidate) => {
      const b = breakdown(candidate, candidates);
      return { candidate, breakdown: b, score: weighted(b, w) };
    })
    .sort((a, b) =>
      b.score === a.score ? Number(b.candidate.outputBase - a.candidate.outputBase) : b.score - a.score,
    );
}

/**
 * Clamp to [0,1], mapping anything NON-FINITE to 0 (the worst score).
 *
 * The comparison form alone let NaN through — `NaN < 0` and `NaN > 1` are both false — so one
 * malformed provider field (an unknown riskLevel, a missing healthScore) turned the whole weighted
 * score into NaN. `Array.sort` with a NaN-returning comparator is implementation-defined, so that
 * unscored route could land ANYWHERE in the ranking, including first — i.e. get selected. A route
 * we cannot score must lose deterministically.
 */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
