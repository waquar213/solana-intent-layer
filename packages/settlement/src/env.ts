/**
 * The determinism boundary. Time, id generation, and the correlation/settlement
 * hash are injected via `SettlementEnv`, so the coordinator reaches no
 * `Date.now`, `Math.random`, or `crypto`. This is what makes a settlement
 * replayable and its ids stable — the settlement id is derived deterministically
 * from the plan id, which is what gives idempotency (re-settling the same plan
 * is recognized and deduped).
 */
export interface SettlementEnv {
  now(): string;
  ids: { correlation(): string };
  /** A pure content hash — used to derive the deterministic settlement id from the plan id. */
  hash(input: string): string;
}

/** Pure, dependency-free string hash → 16 hex chars (two mixed FNV-1a lanes). */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 5) | (c >>> 3)), 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export interface TestEnvOptions {
  nowIso?: string;
  clock?: () => string;
  hash?: (input: string) => string;
}

export function createTestEnv(options: TestEnvOptions = {}): SettlementEnv {
  let n = 0;
  const clock = options.clock ?? ((): string => options.nowIso ?? '2026-01-01T00:00:00.000Z');
  const hash = options.hash ?? stableHash;
  return {
    now: clock,
    ids: { correlation: () => `corr-${(++n).toString(36)}` },
    hash,
  };
}

/** The deterministic settlement id for a plan — the idempotency key. */
export function settlementIdFor(planId: string, env: SettlementEnv): string {
  return `stl-${env.hash(planId)}`;
}
