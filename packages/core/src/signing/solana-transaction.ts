/**
 * Solana transaction signing. A Solana transaction is signed by producing an
 * ed25519 signature over the SERIALIZED MESSAGE (the compiled instructions +
 * recent blockhash). Core signs that message; the chain layer (@solana/kit)
 * compiles instructions into the message and assembles the final transaction —
 * the same build/sign split we use everywhere (chains build, core signs).
 */
import { WalletError } from '../errors.js';
import { signSolanaMessage } from '../accounts/solana.js';

/**
 * Signs a serialized Solana transaction message. Returns the 64-byte ed25519
 * signature to place in the transaction's signature array. Caller must zeroize
 * `privateKey`.
 */
export function signSolanaTransactionMessage(messageBytes: Uint8Array, privateKey: Uint8Array): Uint8Array {
  if (messageBytes.length === 0) {
    throw new WalletError('INVALID_INPUT', 'refusing to sign an empty Solana message');
  }
  if (privateKey.length !== 32) {
    throw new WalletError('INVALID_INPUT', `solana private key must be 32 bytes, got ${privateKey.length}`);
  }
  return signSolanaMessage(messageBytes, privateKey);
}
