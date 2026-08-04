/**
 * The determinism boundary. Only the clock is injected (as an ISO-8601 string) —
 * the sponsorship budget resets per UTC day, so "how much has this user's gas been
 * sponsored today" is a function of an injected `now`, which keeps the decision
 * deterministic and replayable. Everything else is pure arithmetic over bigints.
 */
export interface GasEnv {
  now(): string;
}

export function createTestEnv(nowIso = '2026-01-01T00:00:00.000Z'): GasEnv {
  return { now: () => nowIso };
}

/** The UTC day key (YYYY-MM-DD) a timestamp falls in — the sponsorship budget window. */
export function dayKey(nowIso: string): string {
  return nowIso.slice(0, 10);
}
