/**
 * ML predictor boundary — kept DELIBERATELY SEPARATE from deterministic scoring
 * and execution (a hard requirement). The deterministic scorer produces the
 * baseline ranking; an optional `RoutePredictor` may then nudge scores using
 * learned signals (historical provider reliability, latency/failure/gas
 * prediction). It can only RE-RANK viable, already-simulated candidates — it
 * can never bypass simulation, the safety checks, or move funds. If ML is wrong,
 * the worst case is a suboptimal (still-valid, still-simulated) route.
 */
import type { RouteCandidate } from './types.js';

export interface RoutePredictor {
  /**
   * Returns an adjusted score for a candidate given its deterministic score.
   * MUST stay within a bounded band so ML tweaks the order without overriding
   * the deterministic model wholesale.
   */
  adjust(candidate: RouteCandidate, deterministicScore: number): number;
}

/** The default: no ML. Pure deterministic scoring — the ranking is unchanged. */
export const identityPredictor: RoutePredictor = {
  adjust: (_candidate, deterministicScore) => deterministicScore,
};

/**
 * Clamps an ML adjustment to ±`band` around the deterministic score, so a
 * misbehaving model can reorder near-ties but never crown a clearly-worse route.
 */
export function boundedPredictor(predict: (candidate: RouteCandidate) => number, band = 0.1): RoutePredictor {
  return {
    adjust(candidate, deterministicScore) {
      // A misbehaving/adversarial predictor can return NaN; without this guard NaN flows through
      // (Math.max/min pass it, both range comparisons are false) and poisons the re-rank sort, which can
      // crown a clearly-worse route. Treat a non-finite prediction as "no adjustment" — the same
      // Number.isFinite discipline scoring.ts uses.
      const raw = predict(candidate);
      const delta = Number.isFinite(raw) ? Math.max(-band, Math.min(band, raw)) : 0;
      const adjusted = deterministicScore + delta;
      return adjusted < 0 ? 0 : adjusted > 1 ? 1 : adjusted;
    },
  };
}
