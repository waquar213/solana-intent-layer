/**
 * The determinism boundary. Capability facts are STATIC, so v1 queries are pure and
 * read no clock; the env exists for convention parity with the sibling engines and
 * to support effective-dated profile selection later (choose the active version as of
 * a given instant) without changing the public surface. Injected as an ISO string so
 * any future time-dependence stays deterministic and replayable.
 */
export interface CapabilityEnv {
  now(): string;
}

export function createTestEnv(nowIso = '2026-01-01T00:00:00.000Z'): CapabilityEnv {
  return { now: () => nowIso };
}
