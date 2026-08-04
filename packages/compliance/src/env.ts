/**
 * The determinism boundary. Everything non-deterministic — the clock, id
 * generation, and the content hash for the tamper-evident audit chain — is
 * injected through `ComplianceEnv`. The evaluator modules have NO reachable
 * `Date.now`, `Math.random`, `crypto`, `fetch`, or `process.env`, so "the
 * compliance decision is deterministic and reproducible" is a property a test can
 * assert — which is exactly what a regulator or auditor needs: the same inputs
 * must always yield the same verdict and the same audit hash.
 *
 * In production the app injects a real clock + uuid + sha256. This module ships a
 * dependency-free deterministic env for offline tests and as a safe default; the
 * hash is a pure string hash, adequate for chain tamper-evidence in tests and
 * swappable for sha256 without touching the engine.
 */
export interface ComplianceEnv {
  /** The ONLY time source, as an ISO-8601 string. */
  now(): string;
  ids: { event(): string; request(): string; version(): string };
  /** A pure content hash of its input (the audit-chain link). */
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

export function createTestEnv(options: TestEnvOptions = {}): ComplianceEnv {
  let n = 0;
  const clock = options.clock ?? ((): string => options.nowIso ?? '2026-01-01T00:00:00.000Z');
  const hash = options.hash ?? stableHash;
  return {
    now: clock,
    ids: {
      event: () => `evt-${(++n).toString(36)}`,
      request: () => `req-${(++n).toString(36)}`,
      version: () => `ver-${(++n).toString(36)}`,
    },
    hash,
  };
}
