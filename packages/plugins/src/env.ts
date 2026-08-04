/**
 * The determinism boundary. Time, ids, the content hash (code integrity + manifest
 * canonical hash), and signature VERIFICATION are injected via `PluginEnv`. The
 * policy modules have no reachable `Date.now`, `Math.random`, `crypto`, or `fetch`,
 * so every security decision — "is this signature valid", "does this hash match",
 * "may this plugin call this method" — is deterministic and reproducible in a test.
 *
 * Production injects a real clock + uuid + sha256 + an ed25519/secp256k1 verify. The
 * default env ships a dependency-free hash and a STRICT verifier that trusts nothing
 * (returns false), so a misconfigured host fails CLOSED rather than accepting
 * unsigned plugins.
 */
export interface PluginEnv {
  now(): string;
  ids: { install(): string; event(): string };
  /** Pure content hash (bundle integrity + manifest canonical hash). */
  hash(input: string): string;
  /** Verify `signature` over `message` with `publicKey`. Returns false on any doubt. */
  verify(publicKey: string, message: string, signature: string): boolean;
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
  hash?: (input: string) => string;
  /** A test verifier. Default: FAIL CLOSED (rejects everything) — tests opt in explicitly. */
  verify?: (publicKey: string, message: string, signature: string) => boolean;
}

export function createTestEnv(options: TestEnvOptions = {}): PluginEnv {
  let n = 0;
  const hash = options.hash ?? stableHash;
  return {
    now: () => options.nowIso ?? '2026-01-01T00:00:00.000Z',
    ids: { install: () => `inst-${(++n).toString(36)}`, event: () => `evt-${(++n).toString(36)}` },
    hash,
    verify: options.verify ?? ((): boolean => false),
  };
}

/**
 * A test verifier that accepts a signature iff it equals `hash("sig:" + publicKey +
 * ":" + message)` — a deterministic stand-in for real asymmetric verification, so
 * tests can produce a "valid" signature and also prove that tampering breaks it.
 */
export function fakeSignatureVerifier(hash: (s: string) => string = stableHash) {
  const sign = (publicKey: string, message: string): string => hash(`sig:${publicKey}:${message}`);
  const verify = (publicKey: string, message: string, signature: string): boolean =>
    signature === sign(publicKey, message);
  return { sign, verify };
}
