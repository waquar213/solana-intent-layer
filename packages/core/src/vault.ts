/**
 * Vault — password-encrypted container for the wallet secret (the mnemonic).
 *
 * Construction: scrypt(password NFKD) → 32-byte key → AES-256-GCM.
 * The envelope is versioned JSON; KDF parameters live inside it so they can be
 * strengthened later without breaking existing vaults. Envelope metadata is
 * bound to the ciphertext as GCM additional authenticated data (AAD), so
 * tampering with ANY field fails authentication, not just the ciphertext.
 *
 * Defaults (N=2^17, r=8, p=1 → 128 MiB) match current OWASP scrypt guidance for
 * a high-value secret and can be tuned down per low-end platform via SealVaultOptions.
 * The ACCEPTED lower bound on open is 2^15 (not 2^13): the KDF params are attacker-
 * supplied envelope fields, so a floor that low would let a thief downgrade a stolen
 * vault's work factor before brute-forcing it. 2^15 still opens every legacy vault.
 * Rationale for scrypt over argon2id: first-class audited implementation in
 * @noble/hashes and no native-module requirement in React Native (D4 in
 * memory.md Decisions Log).
 */
import { gcm } from '@noble/ciphers/aes';
import { scrypt } from '@noble/hashes/scrypt';
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils';
import { WalletError } from './errors.js';
import { zeroize } from './bytes.js';

export interface ScryptParams {
  /** CPU/memory cost. Power of two, 2^13 .. 2^22. */
  n: number;
  /** Block size, 1..64. Memory usage ≈ 128 · n · r bytes. */
  r: number;
  /** Parallelization, 1..16. */
  p: number;
}

export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { n: 2 ** 17, r: 8, p: 1 };
/** Minimum accepted N on open — blocks a KDF-downgrade of a stolen vault while still
 *  opening every legacy vault sealed at the old 2^15 default. */
const MIN_SCRYPT_N = 2 ** 15;

const SALT_LENGTH = 32;
const NONCE_LENGTH = 12;
const VAULT_VERSION = 1;

interface VaultEnvelopeV1 {
  v: 1;
  kdf: { algo: 'scrypt'; n: number; r: number; p: number; salt: string };
  cipher: { algo: 'aes-256-gcm'; nonce: string };
  /** Hex ciphertext with the 16-byte GCM tag appended. */
  ct: string;
}

export interface SealVaultOptions {
  scrypt?: Partial<ScryptParams>;
}

/** Encrypts `secret` under `password`. Returns the JSON envelope string. Does not consume/zeroize `secret`. */
export function sealVault(secret: Uint8Array, password: string, options: SealVaultOptions = {}): string {
  if (secret.length === 0) {
    throw new WalletError('INVALID_INPUT', 'refusing to seal an empty secret');
  }
  // The vault is the sole security boundary, so enforce a hard minimum here (belt-and-
  // suspenders alongside any UI policy). 8 chars is a floor, not a substitute for entropy.
  if (password.length < 8) {
    throw new WalletError('INVALID_PASSWORD', 'password must be at least 8 characters');
  }
  const params = validateScryptParams({ ...DEFAULT_SCRYPT_PARAMS, ...options.scrypt });
  const salt = randomBytes(SALT_LENGTH);
  const nonce = randomBytes(NONCE_LENGTH);
  const key = deriveKey(password, salt, params);
  try {
    const ciphertext = gcm(key, nonce, buildAad(VAULT_VERSION, params, salt, nonce)).encrypt(secret);
    const envelope: VaultEnvelopeV1 = {
      v: VAULT_VERSION,
      kdf: { algo: 'scrypt', n: params.n, r: params.r, p: params.p, salt: bytesToHex(salt) },
      cipher: { algo: 'aes-256-gcm', nonce: bytesToHex(nonce) },
      ct: bytesToHex(ciphertext),
    };
    return JSON.stringify(envelope);
  } finally {
    zeroize(key);
  }
}

/**
 * Decrypts a vault envelope. Throws:
 * - VAULT_CORRUPTED for malformed/tampered structure,
 * - VAULT_UNSUPPORTED_VERSION for future versions,
 * - VAULT_DECRYPT_FAILED for wrong password OR tampered content
 *   (indistinguishable by design — GCM authentication).
 * Caller owns the returned buffer and must zeroize it.
 */
export function openVault(envelopeJson: string, password: string): Uint8Array {
  const envelope = parseEnvelope(envelopeJson);
  const salt = hexField(envelope.kdf.salt, SALT_LENGTH, 'kdf.salt');
  const nonce = hexField(envelope.cipher.nonce, NONCE_LENGTH, 'cipher.nonce');
  const params = validateScryptParams({ n: envelope.kdf.n, r: envelope.kdf.r, p: envelope.kdf.p }, 'VAULT_CORRUPTED');
  const ciphertext = looseHex(envelope.ct, 'ct');
  const key = deriveKey(password, salt, params);
  try {
    return gcm(key, nonce, buildAad(envelope.v, params, salt, nonce)).decrypt(ciphertext);
  } catch (cause) {
    throw new WalletError('VAULT_DECRYPT_FAILED', 'wrong password or tampered vault', { cause });
  } finally {
    zeroize(key);
  }
}

/** Cheap structural probe (e.g. "does this stored blob look like one of ours?"). Does not authenticate. */
export function looksLikeVaultEnvelope(candidate: string): boolean {
  try {
    parseEnvelope(candidate);
    return true;
  } catch {
    return false;
  }
}

function deriveKey(password: string, salt: Uint8Array, params: ScryptParams): Uint8Array {
  // NFKD so visually-identical unicode passwords derive the same key across platforms/keyboards.
  const passwordBytes = utf8ToBytes(password.normalize('NFKD'));
  try {
    return scrypt(passwordBytes, salt, { N: params.n, r: params.r, p: params.p, dkLen: 32 });
  } finally {
    zeroize(passwordBytes);
  }
}

/** Canonical AAD string binding every envelope field to the ciphertext. */
function buildAad(version: number, params: ScryptParams, salt: Uint8Array, nonce: Uint8Array): Uint8Array {
  return utf8ToBytes(
    `intent-wallet-vault:v${version}:scrypt:n=${params.n},r=${params.r},p=${params.p}:` +
      `${bytesToHex(salt)}:aes-256-gcm:${bytesToHex(nonce)}`,
  );
}

function validateScryptParams(
  params: ScryptParams,
  errorCode: 'INVALID_INPUT' | 'VAULT_CORRUPTED' = 'INVALID_INPUT',
): ScryptParams {
  const { n, r, p } = params;
  const nOk = Number.isInteger(n) && n >= MIN_SCRYPT_N && n <= 2 ** 22 && (n & (n - 1)) === 0;
  const rOk = Number.isInteger(r) && r >= 1 && r <= 64;
  const pOk = Number.isInteger(p) && p >= 1 && p <= 16;
  if (!nOk || !rOk || !pOk) {
    // Bounds double as DoS protection: a hostile envelope cannot demand gigabytes of KDF memory.
    throw new WalletError(errorCode, 'scrypt parameters out of accepted bounds');
  }
  return { n, r, p };
}

function parseEnvelope(json: string): VaultEnvelopeV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (cause) {
    throw new WalletError('VAULT_CORRUPTED', 'vault envelope is not valid JSON', { cause });
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new WalletError('VAULT_CORRUPTED', 'vault envelope must be an object');
  }
  const env = parsed as Record<string, unknown>;
  if (env['v'] !== VAULT_VERSION) {
    throw new WalletError(
      'VAULT_UNSUPPORTED_VERSION',
      `unsupported vault version ${String(env['v'])} (this build supports v${VAULT_VERSION})`,
    );
  }
  const kdf = env['kdf'] as Record<string, unknown> | undefined;
  const cipher = env['cipher'] as Record<string, unknown> | undefined;
  if (
    kdf?.['algo'] !== 'scrypt' ||
    cipher?.['algo'] !== 'aes-256-gcm' ||
    typeof kdf['salt'] !== 'string' ||
    typeof cipher['nonce'] !== 'string' ||
    typeof env['ct'] !== 'string' ||
    typeof kdf['n'] !== 'number' ||
    typeof kdf['r'] !== 'number' ||
    typeof kdf['p'] !== 'number'
  ) {
    throw new WalletError('VAULT_CORRUPTED', 'vault envelope has missing or malformed fields');
  }
  return parsed as VaultEnvelopeV1;
}

function hexField(value: string, expectedLength: number, field: string): Uint8Array {
  const bytes = looseHex(value, field);
  if (bytes.length !== expectedLength) {
    throw new WalletError('VAULT_CORRUPTED', `${field} must be ${expectedLength} bytes`);
  }
  return bytes;
}

function looseHex(value: string, field: string): Uint8Array {
  try {
    return hexToBytes(value);
  } catch (cause) {
    throw new WalletError('VAULT_CORRUPTED', `${field} is not valid hex`, { cause });
  }
}
