/**
 * BIP-39 mnemonic handling, backed by the audited @scure/bip39.
 *
 * Seed derivation: PBKDF2-HMAC-SHA512, 2048 iterations, salt "mnemonic"+passphrase
 * (per BIP-39). The optional passphrase creates a distinct wallet — losing it
 * loses the funds; the UI layer must communicate this before enabling it.
 */
import {
  generateMnemonic as bip39GenerateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic as bip39ValidateMnemonic,
} from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english';
import { WalletError } from './errors.js';

/** 128 bits → 12 words (default); 256 bits → 24 words (paranoid tier). */
export type MnemonicStrength = 128 | 256;

export function generateMnemonic(strength: MnemonicStrength = 128): string {
  return bip39GenerateMnemonic(englishWordlist, strength);
}

/**
 * Normalizes user-entered mnemonics: trims, collapses internal whitespace,
 * lowercases. (BIP-39 English words are pure ASCII, so lowercasing is safe
 * and forgiving of keyboard auto-capitalization.)
 */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/u).join(' ');
}

export function validateMnemonic(mnemonic: string): boolean {
  return bip39ValidateMnemonic(normalizeMnemonic(mnemonic), englishWordlist);
}

/** @returns 64-byte BIP-39 seed. Caller owns the buffer and must zeroize it when done. */
export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  const normalized = normalizeMnemonic(mnemonic);
  if (!bip39ValidateMnemonic(normalized, englishWordlist)) {
    throw new WalletError('INVALID_MNEMONIC', 'mnemonic failed BIP-39 wordlist/checksum validation');
  }
  return mnemonicToSeedSync(normalized, passphrase);
}
