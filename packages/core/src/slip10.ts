/**
 * SLIP-0010 hierarchical key derivation for ed25519 (used by Solana).
 *
 * Implemented in-repo (~60 lines over @noble/hashes HMAC-SHA512) instead of
 * pulling `ed25519-hd-key`, which is unmaintained and drags legacy deps.
 * Correctness is enforced by the official SLIP-0010 test vectors plus a
 * property-based cross-check against `ed25519-hd-key` in the test suite.
 *
 * Spec: https://github.com/satoshilabs/slips/blob/master/slip-0010.md
 * ed25519 supports HARDENED derivation only — non-hardened paths are rejected.
 */
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { utf8ToBytes } from '@noble/hashes/utils';
import { WalletError } from './errors.js';
import { zeroize } from './bytes.js';

const ED25519_CURVE_SEED = utf8ToBytes('ed25519 seed');

export const HARDENED_OFFSET = 0x80000000;

export interface Slip10Node {
  /** 32-byte ed25519 seed/private scalar. Caller must zeroize when done. */
  privateKey: Uint8Array;
  /** 32-byte chain code. */
  chainCode: Uint8Array;
}

export function slip10MasterFromSeed(seed: Uint8Array): Slip10Node {
  if (seed.length < 16 || seed.length > 64) {
    throw new WalletError('INVALID_INPUT', `SLIP-0010 seed must be 16..64 bytes, got ${seed.length}`);
  }
  const i = hmac(sha512, ED25519_CURVE_SEED, seed);
  const node = { privateKey: i.slice(0, 32), chainCode: i.slice(32, 64) };
  zeroize(i);
  return node;
}

/** Derives the hardened child at `index` (0 ≤ index < 2^31). Does not mutate `node`. */
export function slip10DeriveHardened(node: Slip10Node, index: number): Slip10Node {
  if (!Number.isInteger(index) || index < 0 || index >= HARDENED_OFFSET) {
    throw new WalletError('INVALID_PATH', `hardened child index must be an integer in [0, 2^31), got ${index}`);
  }
  // data = 0x00 || privateKey(32) || ser32(index + 2^31)
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00;
  data.set(node.privateKey, 1);
  new DataView(data.buffer).setUint32(33, index + HARDENED_OFFSET, false);
  const i = hmac(sha512, node.chainCode, data);
  zeroize(data);
  const child = { privateKey: i.slice(0, 32), chainCode: i.slice(32, 64) };
  zeroize(i);
  return child;
}

/**
 * Parses a fully-hardened path like `m/44'/501'/0'/0'` (also accepts `h`/`H`
 * as the hardened marker). Every segment MUST be hardened — ed25519 SLIP-0010
 * has no non-hardened derivation.
 */
export function parseHardenedPath(path: string): number[] {
  const trimmed = path.trim();
  if (!/^m(\/\d+['hH])*$/u.test(trimmed)) {
    throw new WalletError('INVALID_PATH', `not a fully-hardened SLIP-0010 path: "${path}"`);
  }
  if (trimmed === 'm') return [];
  return trimmed
    .slice(2)
    .split('/')
    .map((segment) => {
      const index = Number(segment.replace(/['hH]$/u, ''));
      if (index >= HARDENED_OFFSET) {
        throw new WalletError('INVALID_PATH', `child index out of range in "${path}"`);
      }
      return index;
    });
}

/** Derives the node at `path` from a BIP-39 seed. Caller must zeroize the result. */
export function slip10DerivePath(seed: Uint8Array, path: string): Slip10Node {
  const indexes = parseHardenedPath(path);
  let node = slip10MasterFromSeed(seed);
  for (const index of indexes) {
    const next = slip10DeriveHardened(node, index);
    zeroize(node.privateKey, node.chainCode);
    node = next;
  }
  return node;
}
