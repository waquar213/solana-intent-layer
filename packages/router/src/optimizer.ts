/**
 * GlobalRouteOptimizer — the routing intelligence layer. Pipeline:
 *
 *   discover candidates → SIMULATE (gate) → score (weighted) → ML re-rank
 *   → best + alternatives + confidence
 *
 * It NEVER executes: it returns the optimal strategy; the Execution Engine runs
 * it. Standalone by design — it depends only on the provider framework, so it
 * can power third-party wallets through a public API (the infra product).
 */
import type { SimulationProvider } from '@intent-wallet/providers';
import type { RouteRequest } from './request.js';
import type { RouteResult, ScoredCandidate, ScoringWeights } from './types.js';
import { CandidateGenerator, simulateCandidates } from './candidates.js';
import { scoreCandidates, WEIGHT_PRESETS, type WeightPreset } from './scoring.js';
import { identityPredictor, type RoutePredictor } from './predictor.js';
import { RouterError } from './errors.js';

export interface RouteOptimizerDeps {
  generator: CandidateGenerator;
  /** If provided, EVERY candidate is simulated; failures are rejected before ranking. */
  simulator?: SimulationProvider;
  /** Optional ML re-ranker (bounded). Default: no ML (pure deterministic). */
  predictor?: RoutePredictor;
}

export interface OptimizeOptions {
  /** Named preset, or a custom weight vector. Default 'balanced'. */
  preset?: WeightPreset;
  weights?: ScoringWeights;
  /** How many alternative routes to return. Default 3. */
  maxAlternatives?: number;
}

export class GlobalRouteOptimizer {
  readonly #generator: CandidateGenerator;
  readonly #simulator: SimulationProvider | undefined;
  readonly #predictor: RoutePredictor;

  constructor(deps: RouteOptimizerDeps) {
    this.#generator = deps.generator;
    this.#simulator = deps.simulator;
    this.#predictor = deps.predictor ?? identityPredictor;
  }

  async optimize(request: RouteRequest, options: OptimizeOptions = {}): Promise<RouteResult> {
    // 1. Route discovery.
    const candidates = await this.#generator.generate(request);
    if (candidates.length === 0) {
      throw new RouterError('NO_ROUTE', `no route to convert ${request.fromSymbol} → ${request.toSymbol}`);
    }

    // 2. Simulation gate — reject any route that fails to simulate.
    let simulated = candidates;
    const didSimulate = this.#simulator !== undefined;
    if (this.#simulator) {
      simulated = await simulateCandidates(candidates, this.#simulator);
      if (simulated.length === 0) {
        throw new RouterError('ALL_ROUTES_FAILED_SIMULATION', 'every candidate route failed simulation');
      }
    }

    // 3. Deterministic weighted scoring.
    const weights = options.weights ?? WEIGHT_PRESETS[options.preset ?? 'balanced'];
    const scored = scoreCandidates(simulated, weights);

    // 4. Optional ML re-rank (bounded; separated from the deterministic model).
    const ranked = scored
      .map((s) => ({ ...s, score: this.#predictor.adjust(s.candidate, s.score) }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0] as ScoredCandidate;
    const maxAlt = options.maxAlternatives ?? 3;
    return {
      best,
      alternatives: ranked.slice(1, 1 + maxAlt),
      confidence: computeConfidence(best, ranked, didSimulate),
      weightsUsed: normalizedWeightsOf(weights),
    };
  }
}

/** Confidence in the winner: provider health + score margin over the runner-up + simulation. */
function computeConfidence(best: ScoredCandidate, ranked: ScoredCandidate[], simulated: boolean): number {
  const runnerUp = ranked[1]?.score ?? best.score;
  const margin = Math.min(1, Math.max(0, best.score - runnerUp) / 0.2); // a 0.2 gap = full margin term
  const health = best.candidate.healthScore;
  const conf = 0.5 * health + 0.3 * margin + 0.2 * (simulated ? 1 : 0.5);
  return Math.round(clamp01(conf) * 100) / 100;
}

function normalizedWeightsOf(weights: ScoringWeights): ScoringWeights {
  // Re-export the scorer's normalization so callers see the effective weights.
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
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

/** Clamp to [0,1], mapping NON-FINITE to 0 (worst). NaN passed straight through the comparison
 *  form, turning a confidence figure into NaN and scrambling any ordering built on it. */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
