/**
 * The determinism boundary. Time, ids, and the proposal content hash are
 * injected via `SolverEnv`, so evaluation and selection are deterministic and
 * reproducible — the same proposals in any order yield the same winner. The hash
 * is what lets the platform detect a tampered proposal (its recomputed hash must
 * match the claimed one).
 */
export interface SolverEnv {
  now(): string;
  ids: { request(): string };
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

export function createTestEnv(options: TestEnvOptions = {}): SolverEnv {
  let n = 0;
  const clock = options.clock ?? ((): string => options.nowIso ?? '2026-01-01T00:00:00.000Z');
  const hash = options.hash ?? stableHash;
  return { now: clock, ids: { request: () => `req-${(++n).toString(36)}` }, hash };
}
