/**
 * Retry policy — exponential backoff with a cap and (optional) full jitter, plus a
 * retryable/terminal classifier and deadline arithmetic. Retries are the normal
 * case at scale (transient RPC blips, brief contention), but two rules keep them
 * safe: never retry a TERMINAL error (a rejected signature, an invalid request —
 * retrying can't help and may double-spend), and never retry past the request
 * DEADLINE (a caller waiting on a 3s budget must not be kept for 30s of backoff).
 *
 * Backoff is pure: `backoffMs(attempt)` is deterministic; jitter is applied by
 * passing an explicit `rand01` in [0,1), so tests stay deterministic and prod can
 * feed it `Math.random()`.
 */
export type Retryability = 'retryable' | 'terminal';

/** Failure kinds the platform sees, mapped to whether a retry could ever help. */
export type FailureClass =
  | 'network' // transient — retry
  | 'timeout' // transient — retry
  | 'rate_limited' // transient — retry (after backoff)
  | 'server_5xx' // transient — retry
  | 'congestion' // transient — retry (chain busy)
  | 'client_4xx' // terminal — the request is wrong
  | 'validation' // terminal — deterministic rejection
  | 'insufficient_funds' // terminal — retrying won't create funds
  | 'signature_rejected' // terminal — the user said no
  | 'conflict'; // terminal — idempotency / already-applied

const TERMINAL: ReadonlySet<FailureClass> = new Set<FailureClass>([
  'client_4xx',
  'validation',
  'insufficient_funds',
  'signature_rejected',
  'conflict',
]);

export function classify(kind: FailureClass): Retryability {
  return TERMINAL.has(kind) ? 'terminal' : 'retryable';
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  /** Multiplier per attempt (2 = double each time). */
  factor: number;
  maxDelayMs: number;
  /** Apply full jitter (delay ∈ [0, computed]). Needs a rand source at call time. */
  jitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 200,
  factor: 2,
  maxDelayMs: 10_000,
  jitter: true,
};

/** Deterministic exponential backoff ceiling for a 1-based attempt number. */
export function backoffMs(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = policy.baseDelayMs * policy.factor ** (n - 1);
  return Math.min(policy.maxDelayMs, raw);
}

/**
 * The next delay to wait before `attempt`, or `null` when no further retry is
 * allowed — because the error is terminal, attempts are exhausted, or the next
 * wait would blow the deadline. `rand01` (a value in [0,1)) is only consulted when
 * `policy.jitter` is on.
 */
export interface RetryContext {
  kind: FailureClass;
  attempt: number; // the attempt that just FAILED (1-based)
  nowMs: number;
  deadlineMs?: number;
  rand01?: number;
}

export function nextRetryDelayMs(ctx: RetryContext, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number | null {
  if (classify(ctx.kind) === 'terminal') return null;
  // Corrupt inputs must fail safe (give up) — never yield a NaN delay or bypass the deadline.
  if (!Number.isFinite(ctx.attempt) || !Number.isFinite(ctx.nowMs)) return null;
  if (ctx.attempt >= policy.maxAttempts) return null;

  const ceiling = backoffMs(ctx.attempt + 1, policy);
  // EQUAL JITTER (AWS): a guaranteed half-ceiling floor plus a jittered half. A retry
  // ALWAYS backs off — never 0 ms — even when a caller omits `rand01`, so an un-threaded
  // jitter source can't collapse backoff into a synchronized retry storm.
  const delay = policy.jitter ? Math.floor(ceiling / 2 + clamp01(ctx.rand01) * (ceiling / 2)) : ceiling;

  if (ctx.deadlineMs !== undefined) {
    if (!Number.isFinite(ctx.deadlineMs)) return null; // a corrupt deadline can't be reasoned about → give up
    if (ctx.nowMs + delay >= ctx.deadlineMs) return null;
  }
  return delay;
}

/** Clamp to [0, 1); undefined / NaN / negatives all fold to 0 (the jitter floor handles the rest). */
const clamp01 = (x: number | undefined): number =>
  typeof x === 'number' && Number.isFinite(x) && x > 0 ? (x >= 1 ? 0.999999 : x) : 0;

// ── Deadline propagation ─────────────────────────────────────────────────────

/** A deadline `budgetMs` from `nowMs`. */
export const deadlineFrom = (nowMs: number, budgetMs: number): number => nowMs + Math.max(0, budgetMs);

/** Remaining budget until a deadline (never negative). */
export const remainingBudgetMs = (deadlineMs: number, nowMs: number): number => Math.max(0, deadlineMs - nowMs);

/** Has the deadline passed? */
export const isExpired = (deadlineMs: number, nowMs: number): boolean => nowMs >= deadlineMs;
