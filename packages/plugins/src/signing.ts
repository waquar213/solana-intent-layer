/**
 * The signature + supply-chain gauntlet. A plugin is trustworthy only if EVERY check
 * passes; any failure ⇒ not verified (fail closed). The checks, in order:
 *
 *   1. INTEGRITY   — the delivered bundle's hash equals the manifest's codeHash, so
 *                    the code that runs is exactly the code that was signed.
 *   2. TRUST CLAIM — the signature's attested trust level equals the manifest's claim
 *                    (a plugin can't claim 'official' while signed as 'community').
 *   3. AUTHORITY   — the signer is a known, non-revoked authorized signer whose key
 *                    matches, and whose maxTrust permits the attested level (a
 *                    community signer cannot mint an 'official' plugin).
 *   4. SIGNATURE   — the attested signature verifies over the canonical manifest.
 *   5. REVOCATION  — the plugin id@version is not on the revocation list.
 *
 * All crypto is injected via `env.verify`, so the gauntlet is deterministic and the
 * default env fails closed (verify → false), rejecting unsigned plugins.
 */
import type { PluginEnv } from './env.js';
import { canonicalManifest } from './manifest.js';
import { satisfies } from './semver.js';
import {
  TRUST_RANK,
  type AuthorizedSigner,
  type PluginManifest,
  type PluginSignature,
  type RevocationEntry,
} from './types.js';

export function isRevoked(pluginId: string, version: string, revocations: readonly RevocationEntry[]): boolean {
  return revocations.some(
    (r) => r.pluginId === pluginId && (r.versionRange === '*' || safeSatisfies(version, r.versionRange)),
  );
}

const safeSatisfies = (version: string, range: string): boolean => {
  try {
    return satisfies(version, range);
  } catch {
    return false;
  }
};

export interface VerifyResult {
  verified: boolean;
  reasons: string[];
}

export interface VerifyInput {
  manifest: PluginManifest;
  signature: PluginSignature;
  /** The hash of the actually-delivered bundle (host computes it; must match the manifest). */
  deliveredCodeHash: string;
  signers: readonly AuthorizedSigner[];
  revocations?: readonly RevocationEntry[];
}

export function verifyPlugin(input: VerifyInput, env: PluginEnv): VerifyResult {
  const { manifest, signature, deliveredCodeHash, signers } = input;
  const reasons: string[] = [];
  const fail = (r: string): void => {
    reasons.push(r);
  };

  // 1. Integrity — the code that runs must be the code that was signed.
  if (deliveredCodeHash !== manifest.codeHash) fail('bundle hash does not match manifest.codeHash (integrity failure)');

  // 2. Trust claim — attested level must equal the claimed level.
  if (signature.signedTrustLevel !== manifest.trustLevel) {
    fail(`signed trust '${signature.signedTrustLevel}' != claimed '${manifest.trustLevel}'`);
  }

  // 3. Authority — a known, non-revoked signer whose key matches and whose maxTrust permits the level.
  const signer = signers.find((s) => s.signer === signature.signer);
  if (!signer) fail(`unknown signer '${signature.signer}'`);
  else if (signer.revoked) fail(`signer '${signature.signer}' is revoked`);
  else if (signer.publicKey !== signature.publicKey) fail(`signer key mismatch for '${signature.signer}'`);
  else if (TRUST_RANK[signature.signedTrustLevel] < TRUST_RANK[signer.maxTrust]) {
    // A smaller rank = more trusted; the attested level must not be MORE trusted than the signer may attest.
    fail(
      `signer '${signature.signer}' may not attest trust '${signature.signedTrustLevel}' (max '${signer.maxTrust}')`,
    );
  }

  // 4. Signature — verifies over the canonical manifest with the signer's key.
  if (signer && !signer.revoked && signer.publicKey === signature.publicKey) {
    if (!env.verify(signature.publicKey, canonicalManifest(manifest), signature.signature)) {
      fail('signature does not verify over the canonical manifest');
    }
  }

  // 5. Revocation.
  if (isRevoked(manifest.id, manifest.version, input.revocations ?? [])) {
    fail(`plugin ${manifest.id}@${manifest.version} is revoked`);
  }

  return { verified: reasons.length === 0, reasons };
}
