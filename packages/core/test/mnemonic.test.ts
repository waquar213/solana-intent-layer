import { describe, expect, it } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils';
import { generateMnemonic, mnemonicToSeed, normalizeMnemonic, validateMnemonic } from '../src/mnemonic.js';

const ABANDON_12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('BIP-39 mnemonics', () => {
  it('generates valid 12-word mnemonics by default', () => {
    const mnemonic = generateMnemonic();
    expect(mnemonic.split(' ')).toHaveLength(12);
    expect(validateMnemonic(mnemonic)).toBe(true);
  });

  it('generates valid 24-word mnemonics at strength 256', () => {
    const mnemonic = generateMnemonic(256);
    expect(mnemonic.split(' ')).toHaveLength(24);
    expect(validateMnemonic(mnemonic)).toBe(true);
  });

  it('generates unique mnemonics (entropy sanity)', () => {
    const seen = new Set(Array.from({ length: 32 }, () => generateMnemonic()));
    expect(seen.size).toBe(32);
  });

  it('matches the official Trezor test vector (all-zero entropy, passphrase "TREZOR")', () => {
    // https://github.com/trezor/python-mnemonic/blob/master/vectors.json — first vector.
    expect(validateMnemonic(ABANDON_12)).toBe(true);
    const seed = mnemonicToSeed(ABANDON_12, 'TREZOR');
    expect(bytesToHex(seed)).toBe(
      'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04',
    );
  });

  it('produces a different seed per passphrase (25th-word wallets are distinct)', () => {
    const a = mnemonicToSeed(ABANDON_12);
    const b = mnemonicToSeed(ABANDON_12, 'TREZOR');
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });

  it('normalizes whitespace and case on import', () => {
    const messy = `  Abandon abandon ABANDON abandon abandon abandon\tabandon abandon abandon abandon abandon   about `;
    expect(normalizeMnemonic(messy)).toBe(ABANDON_12);
    expect(validateMnemonic(messy)).toBe(true);
    expect(bytesToHex(mnemonicToSeed(messy))).toBe(bytesToHex(mnemonicToSeed(ABANDON_12)));
  });

  it('rejects wrong checksum and unknown words', () => {
    const badChecksum = ABANDON_12.replace(/about$/u, 'abandon');
    expect(validateMnemonic(badChecksum)).toBe(false);
    expect(validateMnemonic('definitely not a mnemonic at all')).toBe(false);
    expect(() => mnemonicToSeed(badChecksum)).toThrowError(expect.objectContaining({ code: 'INVALID_MNEMONIC' }));
  });
});
