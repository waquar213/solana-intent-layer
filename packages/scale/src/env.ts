/**
 * The determinism boundary. Time is injected via `ScaleEnv.now()` (epoch millis),
 * so token-bucket refills, breaker cooldowns, and autoscaler stabilization windows
 * are all functions of an injected clock — the same inputs at the same `now` always
 * yield the same decision. That is what makes a scaling controller replayable in a
 * test and auditable in production (you can prove *why* it scaled at 03:14).
 *
 * Millis (a number), not an ISO string: everything here is time *deltas* (elapsed
 * since last refill / last scale / breaker-open), and arithmetic on numbers is
 * cleaner and cheaper than parsing timestamps on every hot-path admission check.
 */
export interface ScaleEnv {
  /** Monotonic-ish wall clock in epoch milliseconds. */
  now(): number;
}

export interface TestEnvOptions {
  /** Fixed start time (default 0). */
  startMs?: number;
  /** A custom clock; overrides `startMs`. */
  clock?: () => number;
}

/**
 * A deterministic test clock. By default it is FROZEN at `startMs` (repeated
 * `now()` returns the same value) so tests set time explicitly; pass a `clock`
 * to drive it. Real deployments inject `{ now: () => Date.now() }`.
 */
export function createTestEnv(options: TestEnvOptions = {}): ScaleEnv {
  const start = options.startMs ?? 0;
  return { now: options.clock ?? ((): number => start) };
}

/** A mutable clock helper for tests that need to advance time between steps. */
export function mutableClock(startMs = 0): { env: ScaleEnv; advance(ms: number): void; set(ms: number): void } {
  let t = startMs;
  return {
    env: { now: () => t },
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}
