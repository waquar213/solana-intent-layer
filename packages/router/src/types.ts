/**
 * Route Optimizer data model. A `RouteCandidate` is one normalized way to get
 * from A to B (one or more provider legs); the optimizer scores and ranks many
 * of them. All quotes — from any DEX or bridge aggregator — are normalized into
 * this single comparable shape, so "best of N" is a fair comparison.
 */
import type { RouteLeg } from '@intent-wallet/providers';

export type RiskLevel = 'low' | 'medium' | 'high';

/** A normalized candidate route, comparable to every other candidate for the same conversion. */
export interface RouteCandidate {
  id: string;
  legs: RouteLeg[];
  providerIds: string[];
  /** Output in base units of the destination asset (all candidates share the destination). */
  outputBase: bigint;
  outputDecimals: number;
  /** Total fees across the route in micro-USD. */
  feeMicros: bigint;
  slippageBps: number;
  etaSeconds: number;
  /** Average provider health across the legs, [0,1]. */
  healthScore: number;
  riskLevel: RiskLevel;
  /** Age of the freshest→oldest quote in the route (ms). */
  quoteAgeMs: number;
  /** Optional price-impact estimate (bps); undefined = unknown (scored neutrally). */
  priceImpactBps?: number;
}

/** The seven scoring factors. Each is normalized to [0,1] where 1 is best. */
export interface ScoreBreakdown {
  output: number;
  cost: number;
  slippage: number;
  time: number;
  reliability: number;
  risk: number;
  freshness: number;
}

/** Weights per factor. Should sum to 1 (the engine normalizes if not). */
export type ScoringWeights = ScoreBreakdown;

export interface ScoredCandidate {
  candidate: RouteCandidate;
  /** Total weighted score, [0,1]. */
  score: number;
  breakdown: ScoreBreakdown;
}

export interface RouteResult {
  /** Highest-scoring route that passed simulation. */
  best: ScoredCandidate;
  /** Other viable routes, ranked — shown as alternatives / used as fallbacks. */
  alternatives: ScoredCandidate[];
  /** [0,1] — how sure we are the best route will succeed at the quoted terms. */
  confidence: number;
  weightsUsed: ScoringWeights;
}
