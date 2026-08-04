/**
 * Reputation engine — a solver's earned standing, from history. Success rate is
 * the base; a security incident dominates (heavy multiplicative penalty), and
 * invalid proposals + latency shave it down. A brand-new solver gets a neutral
 * prior (0.5) so it can compete but doesn't outrank a proven one on a tie. The
 * reputation score feeds selection as a weighted factor.
 */
import type { ReputationRecord } from './types.js';

export interface OutcomeUpdate {
  success?: boolean;
  latencyMs?: number;
  invalid?: boolean;
  timeout?: boolean;
  securityIncident?: boolean;
  costSavingsMicros?: bigint;
}

const blank = (solverId: string): ReputationRecord => ({
  solverId,
  wins: 0,
  losses: 0,
  timeouts: 0,
  invalidProposals: 0,
  securityIncidents: 0,
  totalLatencyMs: 0,
  samples: 0,
  costSavingsMicros: 0n,
});

/** Clamp to [0,1]. `Math.max(0, Math.min(1, NaN))` is NaN — it does NOT clamp — so a corrupt
 *  stat would have made a solver's reputation NaN and scrambled auction ranking. */
const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const LATENCY_CEILING_MS = 5000;

export class ReputationEngine {
  private readonly records = new Map<string, ReputationRecord>();

  record(solverId: string): ReputationRecord {
    return { ...(this.records.get(solverId) ?? blank(solverId)) };
  }

  /** Reputation score in [0,1]. Neutral 0.5 with no history; security incidents dominate. */
  score(solverId: string): number {
    const r = this.records.get(solverId);
    if (!r || r.samples === 0) return 0.5;
    const decided = r.wins + r.losses + r.timeouts;
    const successRate = decided > 0 ? r.wins / decided : 0.5;
    const incidentPenalty = 1 - Math.min(1, r.securityIncidents * 0.5);
    const invalidPenalty = 1 - Math.min(0.5, r.invalidProposals * 0.05);
    const avgLatency = r.samples > 0 ? r.totalLatencyMs / r.samples : 0;
    const latencyFactor = clamp01(1 - avgLatency / LATENCY_CEILING_MS);
    return clamp01(successRate * incidentPenalty * invalidPenalty * (0.8 + 0.2 * latencyFactor));
  }

  onOutcome(solverId: string, update: OutcomeUpdate): void {
    const r = this.records.get(solverId) ?? blank(solverId);
    r.samples += 1;
    if (update.success === true) r.wins += 1;
    else if (update.success === false) r.losses += 1;
    if (update.timeout) r.timeouts += 1;
    if (update.invalid) r.invalidProposals += 1;
    if (update.securityIncident) r.securityIncidents += 1;
    if (update.latencyMs !== undefined) r.totalLatencyMs += update.latencyMs;
    if (update.costSavingsMicros !== undefined) r.costSavingsMicros += update.costSavingsMicros;
    this.records.set(solverId, r);
  }
}
