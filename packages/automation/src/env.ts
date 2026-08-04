/**
 * The determinism boundary. Time, id generation, and the idempotency hash are
 * injected via `AutomationEnv`, so the scheduler and engine reach no `Date.now`,
 * `Math.random`, or `crypto` — the whole engine is deterministic and
 * time-travel testable (advance the injected clock, replay). The hash is reused
 * from the Policy engine.
 */
import { stableHash } from '@intent-wallet/policy';

export { stableHash };

export interface AutomationEnv {
  now(): string;
  ids: { run(): string; workflow(): string };
  hash(input: string): string;
}

export interface TestEnvOptions {
  nowIso?: string;
  clock?: () => string;
  hash?: (input: string) => string;
}

/** A deterministic env for tests and as a default. Ids are counter-based. */
export function createTestEnv(options: TestEnvOptions = {}): AutomationEnv {
  let n = 0;
  const clock = options.clock ?? ((): string => options.nowIso ?? '2026-01-01T00:00:00.000Z');
  const hash = options.hash ?? stableHash;
  return {
    now: clock,
    ids: { run: () => `run-${(++n).toString(36)}`, workflow: () => `wf-${(++n).toString(36)}` },
    hash,
  };
}
