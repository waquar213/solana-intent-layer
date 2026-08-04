/**
 * Bitcoin account primitives. Launch scope: BIP-84 native SegWit (P2WPKH,
 * bech32 `bc1q…`) — lowest fees and universal support today. Taproot (BIP-86)
 * is added in the execution phase when spend support lands.
 *
 * Full transaction construction/signing (PSBT) arrives in Phase 5 via
 * @scure/btc-signer; this module owns address derivation only.
 */
import { ripemd160 } from '@noble/hashes/ripemd160';
import { sha256 } from '@noble/hashes/sha256';
import { bech32 } from '@scure/base';
import { WalletError } from '../errors.js';

export type BtcNetwork = 'mainnet' | 'testnet';

const HRP: Record<BtcNetwork, string> = { mainnet: 'bc', testnet: 'tb' };

/** hash160 = RIPEMD160(SHA256(x)) */
export function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

/** P2WPKH (witness v0) address from a 33-byte compressed public key. */
export function btcP2wpkhAddress(compressedPublicKey: Uint8Array, network: BtcNetwork = 'mainnet'): string {
  if (compressedPublicKey.length !== 33) {
    throw new WalletError(
      'INVALID_INPUT',
      `P2WPKH requires a 33-byte compressed public key, got ${compressedPublicKey.length}`,
    );
  }
  const witnessProgram = hash160(compressedPublicKey);
  return bech32.encode(HRP[network], [0, ...bech32.toWords(witnessProgram)]);
}
