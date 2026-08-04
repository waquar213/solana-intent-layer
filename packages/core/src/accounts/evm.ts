/**
 * EVM account primitives: address derivation (keccak-256 + EIP-55 checksum),
 * digest signing (RFC 6979 deterministic ECDSA, low-s normalized), recovery,
 * and EIP-191 personal-message hashing.
 *
 * One secp256k1 key = ONE address across every EVM chain — this is the
 * "Universal EVM Address" of the product's universal identity.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import { WalletError } from '../errors.js';

/** Accepts a compressed (33B) or uncompressed (65B) secp256k1 public key. */
export function evmAddressFromPublicKey(publicKey: Uint8Array): string {
  let point;
  try {
    point = secp256k1.ProjectivePoint.fromHex(publicKey);
  } catch (cause) {
    throw new WalletError('INVALID_INPUT', 'not a valid secp256k1 public key', { cause });
  }
  const uncompressed = point.toRawBytes(false); // 0x04 || X(32) || Y(32)
  const hash = keccak_256(uncompressed.subarray(1));
  return toChecksumAddress(bytesToHex(hash.subarray(12)));
}

/** Validate a 32-byte secp256k1 private key and return its Universal EVM address. */
export function evmAddressFromPrivateKey(privateKey: Uint8Array): string {
  if (privateKey.length !== 32) {
    throw new WalletError('INVALID_INPUT', 'private key must be 32 bytes');
  }
  let publicKey: Uint8Array;
  try {
    publicKey = secp256k1.getPublicKey(privateKey, false); // uncompressed
  } catch (cause) {
    throw new WalletError('INVALID_INPUT', 'not a valid secp256k1 private key', { cause });
  }
  return evmAddressFromPublicKey(publicKey);
}

/** EIP-55 mixed-case checksum encoding. */
export function toChecksumAddress(address: string): string {
  const bare = address.toLowerCase().replace(/^0x/u, '');
  if (!/^[0-9a-f]{40}$/u.test(bare)) {
    throw new WalletError('INVALID_INPUT', 'expected a 20-byte hex EVM address');
  }
  const hash = bytesToHex(keccak_256(utf8ToBytes(bare)));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i] as string, 16) >= 8 ? (bare[i] as string).toUpperCase() : (bare[i] as string);
  }
  return out;
}

/** True iff `address` is well-formed AND its EIP-55 checksum casing is exact. */
export function isChecksumAddress(address: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(address)) return false;
  return toChecksumAddress(address) === address;
}

/**
 * Signs a 32-byte digest. Returns 65 bytes: r(32) || s(32) || recovery(1),
 * where recovery ∈ {0,1} (EIP-1559 yParity form; add 27 for legacy contexts).
 * Deterministic per RFC 6979; s is low-s normalized (malleability protection).
 */
export function signEvmDigest(digest: Uint8Array, privateKey: Uint8Array): Uint8Array {
  if (digest.length !== 32) {
    throw new WalletError('INVALID_INPUT', `EVM signing expects a 32-byte digest, got ${digest.length}`);
  }
  const sig = secp256k1.sign(digest, privateKey); // lowS: true is the default
  const out = new Uint8Array(65);
  out.set(sig.toCompactRawBytes(), 0);
  out[64] = sig.recovery;
  return out;
}

/** Recovers the EIP-55 signer address from a 65-byte r||s||v signature. */
export function recoverEvmAddress(digest: Uint8Array, signature: Uint8Array): string {
  if (digest.length !== 32 || signature.length !== 65) {
    throw new WalletError('INVALID_INPUT', 'expected 32-byte digest and 65-byte signature');
  }
  const recovery = signature[64] as number;
  if (recovery !== 0 && recovery !== 1) {
    throw new WalletError('INVALID_INPUT', `recovery byte must be 0 or 1, got ${recovery}`);
  }
  const sig = secp256k1.Signature.fromCompact(signature.subarray(0, 64)).addRecoveryBit(recovery);
  const publicKey = sig.recoverPublicKey(digest);
  return evmAddressFromPublicKey(publicKey.toRawBytes(false));
}

/** EIP-191 v0x45: keccak256("\x19Ethereum Signed Message:\n" + len + message). */
export function hashPersonalMessage(message: Uint8Array): Uint8Array {
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${message.length}`);
  return keccak_256(concatBytes(prefix, message));
}
