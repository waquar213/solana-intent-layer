/**
 * Token-bucket rate limiter — the standard, correct primitive for "N per second
 * with a burst of B". Tokens refill continuously at `refillPerSec` up to `capacity`;
 * a request costs tokens and is rejected when the bucket can't cover it. Time is
 * injected (`ScaleEnv.now`), so refill is exact and the limiter is deterministic and
 * testable — no background timer, no wall-clock read on the hot path beyond `now()`.
 *
 * Two properties the tests pin down: a burst never exceeds `capacity` (tokens are
 * clamped on refill, so idle time can't accumulate infinite allowance), and the
 * steady-state admit rate converges to `refillPerSec`.
 */
import type { ScaleEnv } from './env.js';

export interface RateLimitOptions {
  /** Max tokens (the largest instantaneous burst). */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
  /** Starting tokens (default: full — `capacity`). */
  initialTokens?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Tokens left after the (attempted) take. */
  remaining: number;
  /** If rejected, ms until enough tokens will have refilled for this request; 0 if allowed. */
  retryAfterMs: number;
}

export class TokenBucket {
  #tokens: number;
  #lastRefillMs: number;
  readonly #capacity: number;
  readonly #refillPerSec: number;
  readonly #env: ScaleEnv;

  constructor(options: RateLimitOptions, env: ScaleEnv) {
    if (!(options.capacity > 0)) throw new RangeError('capacity must be > 0');
    if (!(options.refillPerSec >= 0)) throw new RangeError('refillPerSec must be >= 0');
    this.#capacity = options.capacity;
    this.#refillPerSec = options.refillPerSec;
    this.#tokens = Math.min(options.initialTokens ?? options.capacity, options.capacity);
    this.#env = env;
    this.#lastRefillMs = env.now();
  }

  #refill(now: number): void {
    // Guard against a non-monotonic clock (never remove tokens on a backwards jump).
    const elapsedMs = Math.max(0, now - this.#lastRefillMs);
    if (elapsedMs === 0) return;
    this.#tokens = Math.min(this.#capacity, this.#tokens + (elapsedMs / 1000) * this.#refillPerSec);
    this.#lastRefillMs = now;
  }

  /** Try to consume `cost` tokens. Returns whether it was allowed and when to retry if not. */
  tryRemove(cost = 1): RateLimitResult {
    if (cost <= 0) return { allowed: true, remaining: this.#tokens, retryAfterMs: 0 };
    const now = this.#env.now();
    this.#refill(now);

    if (this.#tokens >= cost) {
      this.#tokens -= cost;
      return { allowed: true, remaining: this.#tokens, retryAfterMs: 0 };
    }
    const deficit = cost - this.#tokens;
    const retryAfterMs = this.#refillPerSec > 0 ? Math.ceil((deficit / this.#refillPerSec) * 1000) : Infinity;
    return { allowed: false, remaining: this.#tokens, retryAfterMs };
  }

  /** Current available tokens (after refilling to `now`). */
  get tokens(): number {
    this.#refill(this.#env.now());
    return this.#tokens;
  }
}

export function createRateLimiter(options: RateLimitOptions, env: ScaleEnv): TokenBucket {
  return new TokenBucket(options, env);
}
