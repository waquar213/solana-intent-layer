/**
 * The determinism boundary. Time and ids are injected via `ReliabilityEnv`, so
 * alert cooldowns, healing rate-limits, and incident timestamps are
 * deterministic — the same inputs at the same `now` always yield the same
 * decisions, which is what makes a self-healing controller testable and its
 * behavior auditable.
 */
export interface ReliabilityEnv {
  now(): string;
  ids: { incident(): string };
}

export interface TestEnvOptions {
  nowIso?: string;
  clock?: () => string;
}

export function createTestEnv(options: TestEnvOptions = {}): ReliabilityEnv {
  let n = 0;
  const clock = options.clock ?? ((): string => options.nowIso ?? '2026-01-01T00:00:00.000Z');
  return { now: clock, ids: { incident: () => `inc-${(++n).toString(36)}` } };
}
