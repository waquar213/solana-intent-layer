/**
 * @intent-wallet/router — the Global Route Optimizer. Standalone routing
 * intelligence: discovers candidate routes across DEX/bridge aggregators,
 * gates them through simulation, scores them with a weighted multi-factor model
 * (tunable by user preference), optionally ML-re-ranks, and returns the best
 * route + alternatives + a confidence score. It PROPOSES the optimal strategy;
 * the Execution Engine runs it. Designed to power third-party wallets via a
 * public API (ADR-0035).
 */
export type {
  RouteCandidate,
  RiskLevel,
  ScoreBreakdown,
  ScoringWeights,
  ScoredCandidate,
  RouteResult,
} from './types.js';
export type { RouteRequest } from './request.js';
export { scoreCandidates, normalizeWeights, WEIGHT_PRESETS, type WeightPreset } from './scoring.js';
export { CandidateGenerator, simulateCandidates, type CandidateGeneratorOptions } from './candidates.js';
export { identityPredictor, boundedPredictor, type RoutePredictor } from './predictor.js';
export { GlobalRouteOptimizer, type RouteOptimizerDeps, type OptimizeOptions } from './optimizer.js';
export { RouterError, type RouterErrorCode } from './errors.js';
