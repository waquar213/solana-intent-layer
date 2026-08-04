/**
 * Solana account primitives. A Solana address IS the base58-encoded ed25519
 * public key. Key derivation follows the ecosystem convention (Phantom,
 * Solflare, solana-keygen): SLIP-0010 at m/44'/501'/account'/0'.
 */
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { WalletError } from '../errors.js';

export function solanaPublicKey(privateKey: Uint8Array): Uint8Array {
  if (privateKey.length !== 32) {
    throw new WalletError('INVALID_INPUT', `ed25519 private key must be 32 bytes, got ${privateKey.length}`);
  }
  return ed25519.getPublicKey(privateKey);
}

export function solanaAddressFromPublicKey(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new WalletError('INVALID_INPUT', `ed25519 public key must be 32 bytes, got ${publicKey.length}`);
  }
  return base58.encode(publicKey);
}

/** Signs an arbitrary message (or serialized transaction message). Returns 64 bytes. */
export function signSolanaMessage(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

export function verifySolanaSignature(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
