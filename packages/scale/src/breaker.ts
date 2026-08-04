/**
 * Generic circuit breaker — the reusable primitive any dependency can wrap (a DB,
 * a cache, a downstream service). It trips OPEN after N consecutive failures, fails
 * fast for a cooldown instead of hammering a sick dependency, then allows exactly
 * ONE half-open probe: success closes it, failure re-opens the cooldown. Time is
 * injected, so state transitions are deterministic.
 *
 * This is deliberately separate from `@intent-wallet/providers` HealthTracker, which
 * is a *specialized* breaker fused with latency scoring and provider SELECTION. This
 * one is the plain building block for everything that isn't provider selection —
 * same state machine, no scoring, no registry.
 *
 * The time-driven open→half_open transition is committed in ONE place (`#sync`),
 * called by every entry point (`canRequest`, `recordSuccess`, `recordFailure`, and
 * the `state` getter) so a caller that gates on `.state` sees the same state the
 * record methods act on — no read/commit split. Only a single probe is admitted in
 * half-open (`#probeInFlight`), so the instant the cooldown elapses a burst of
 * callers can't all stampede the still-sick dependency.
 */
import type { ScaleEnv } from './env.js';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface BreakerOptions {
  /** Consecutive failures that trip the breaker open. Default 5. */
  failureThreshold?: number;
  /** How long the breaker stays open before a half-open probe (ms). Default 30s. */
  cooldownMs?: number;
  /** Consecutive half-open successes required to fully close. Default 1. */
  successThreshold?: number;
}

export class CircuitBreaker {
  #consecutiveFailures = 0;
  #halfOpenSuccesses = 0;
  #openedAtMs = 0;
  #state: CircuitState = 'closed';
  /** True while a half-open probe has been admitted but not yet resolved. */
  #probeInFlight = false;
  readonly #failureThreshold: number;
  readonly #cooldownMs: number;
  readonly #successThreshold: number;
  readonly #env: ScaleEnv;

  constructor(options: BreakerOptions, env: ScaleEnv) {
    this.#failureThreshold = options.failureThreshold ?? 5;
    this.#cooldownMs = options.cooldownMs ?? 30_000;
    this.#successThreshold = options.successThreshold ?? 1;
    this.#env = env;
  }

  /** Commit the time-driven open→half_open transition once the cooldown has elapsed. */
  #sync(): void {
    if (this.#state === 'open' && this.#env.now() - this.#openedAtMs >= this.#cooldownMs) {
      this.#state = 'half_open';
      this.#halfOpenSuccesses = 0;
      this.#probeInFlight = false;
    }
  }

  /** May a call proceed now? Admits at most ONE probe while half-open. */
  canRequest(): boolean {
    this.#sync();
    if (this.#state === 'closed') return true;
    if (this.#state === 'open') return false;
    // half_open: exactly one probe in flight at a time.
    if (this.#probeInFlight) return false;
    this.#probeInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.#sync();
    if (this.#state === 'half_open') {
      this.#probeInFlight = false;
      this.#halfOpenSuccesses += 1;
      if (this.#halfOpenSuccesses >= this.#successThreshold) this.#close();
      return;
    }
    // A success in the closed (or freshly-synced) state resets the failure streak.
    this.#consecutiveFailures = 0;
  }

  recordFailure(): void {
    this.#sync();
    if (this.#state === 'half_open') {
      // The probe failed — re-open for another full cooldown.
      this.#open();
      return;
    }
    this.#consecutiveFailures += 1;
    if (this.#consecutiveFailures >= this.#failureThreshold) this.#open();
  }

  get state(): CircuitState {
    this.#sync();
    return this.#state;
  }

  #open(): void {
    this.#state = 'open';
    this.#openedAtMs = this.#env.now();
    this.#halfOpenSuccesses = 0;
    this.#probeInFlight = false;
  }

  #close(): void {
    this.#state = 'closed';
    this.#consecutiveFailures = 0;
    this.#halfOpenSuccesses = 0;
    this.#openedAtMs = 0;
    this.#probeInFlight = false;
  }
}

export function createBreaker(options: BreakerOptions, env: ScaleEnv): CircuitBreaker {
  return new CircuitBreaker(options, env);
}
