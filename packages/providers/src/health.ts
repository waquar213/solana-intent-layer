/**
 * Provider health scoring + circuit breaking. Every call outcome updates a
 * per-provider record (success rate, latency EWMA, consecutive failures). A
 * circuit breaker sheds a failing provider (open), probes it after a cooldown
 * (half-open), and restores it on success (closed). Selection uses the
 * composite score so traffic flows to the healthiest provider automatically —
 * no manual failover.
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

export interface HealthSnapshot {
  id: string;
  available: boolean;
  score: number; // 0..1, higher is better
  successRate: number; // 0..1
  ewmaLatencyMs: number | null;
  consecutiveFailures: number;
  circuit: CircuitState;
}

export interface HealthOptions {
  /** Consecutive failures that trip the breaker. Default 3. */
  failureThreshold?: number;
  /** How long the breaker stays open before a half-open probe (ms). Default 30s. */
  cooldownMs?: number;
  /** Latency (ms) that scores 0.5; faster scores higher. Default 800. */
  latencyMidpointMs?: number;
  now?: () => number;
}

interface Record {
  successes: number;
  total: number;
  ewmaLatencyMs: number | null;
  consecutiveFailures: number;
  openUntil: number;
  halfOpen: boolean;
}

const EWMA_ALPHA = 0.3;

export class HealthTracker {
  readonly #records = new Map<string, Record>();
  readonly #failureThreshold: number;
  readonly #cooldownMs: number;
  readonly #latencyMid: number;
  readonly #now: () => number;

  constructor(options: HealthOptions = {}) {
    this.#failureThreshold = options.failureThreshold ?? 3;
    this.#cooldownMs = options.cooldownMs ?? 30_000;
    this.#latencyMid = options.latencyMidpointMs ?? 800;
    this.#now = options.now ?? Date.now;
  }

  recordSuccess(id: string, latencyMs: number): void {
    const r = this.#get(id);
    r.successes += 1;
    r.total += 1;
    r.consecutiveFailures = 0;
    r.openUntil = 0;
    r.halfOpen = false;
    r.ewmaLatencyMs =
      r.ewmaLatencyMs === null ? latencyMs : r.ewmaLatencyMs * (1 - EWMA_ALPHA) + latencyMs * EWMA_ALPHA;
  }

  recordFailure(id: string): void {
    const r = this.#get(id);
    r.total += 1;
    r.consecutiveFailures += 1;
    r.halfOpen = false;
    if (r.consecutiveFailures >= this.#failureThreshold) {
      r.openUntil = this.#now() + this.#cooldownMs;
    }
  }

  /** True if the provider may be called now (circuit closed, or a half-open probe is due). */
  available(id: string): boolean {
    const r = this.#records.get(id);
    if (!r) return true; // unknown provider → assume available (first call)
    if (r.openUntil === 0) return true;
    if (this.#now() >= r.openUntil) {
      r.halfOpen = true; // allow ONE probe
      return true;
    }
    return false;
  }

  /** Composite score in [0,1]: success rate weighted with a latency term; 0 if the circuit is open. */
  score(id: string): number {
    const r = this.#records.get(id);
    if (!r) return 0.5; // neutral prior for an untried provider
    if (!this.available(id)) return 0;
    const successRate = r.total === 0 ? 0.5 : r.successes / r.total;
    const latencyScore = r.ewmaLatencyMs === null ? 0.5 : this.#latencyMid / (this.#latencyMid + r.ewmaLatencyMs);
    return successRate * 0.7 + latencyScore * 0.3;
  }

  circuit(id: string): CircuitState {
    const r = this.#records.get(id);
    if (!r || r.openUntil === 0) return 'closed';
    if (r.halfOpen || this.#now() >= r.openUntil) return 'half_open';
    return 'open';
  }

  snapshot(id: string): HealthSnapshot {
    const r = this.#records.get(id);
    return {
      id,
      available: this.available(id),
      score: this.score(id),
      successRate: r && r.total > 0 ? r.successes / r.total : 0,
      ewmaLatencyMs: r?.ewmaLatencyMs ?? null,
      consecutiveFailures: r?.consecutiveFailures ?? 0,
      circuit: this.circuit(id),
    };
  }

  #get(id: string): Record {
    let r = this.#records.get(id);
    if (!r) {
      r = { successes: 0, total: 0, ewmaLatencyMs: null, consecutiveFailures: 0, openUntil: 0, halfOpen: false };
      this.#records.set(id, r);
    }
    return r;
  }
}
