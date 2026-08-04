import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { secp256k1 } from '@noble/curves/secp256k1';
import * as btcSigner from '@scure/btc-signer';
import { btcP2wpkhAddress } from '../src/accounts/bitcoin.js';

describe('Bitcoin P2WPKH addresses', () => {
  it('encodes bech32 witness v0 with the right prefix per network', () => {
    const publicKey = secp256k1.getPublicKey(new Uint8Array(32).fill(7), true);
    expect(btcP2wpkhAddress(publicKey, 'mainnet')).toMatch(/^bc1q[a-z0-9]{38}$/u);
    expect(btcP2wpkhAddress(publicKey, 'testnet')).toMatch(/^tb1q[a-z0-9]{38}$/u);
  });

  it('matches @scure/btc-signer (independent implementation) on arbitrary keys', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (candidate) => {
        fc.pre(secp256k1.utils.isValidPrivateKey(candidate));
        const publicKey = secp256k1.getPublicKey(candidate, true);
        expect(btcP2wpkhAddress(publicKey)).toBe(btcSigner.p2wpkh(publicKey).address);
      }),
      { numRuns: 50 },
    );
  });

  it('rejects uncompressed and malformed public keys', () => {
    const uncompressed = secp256k1.getPublicKey(new Uint8Array(32).fill(9), false);
    expect(() => btcP2wpkhAddress(uncompressed)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => btcP2wpkhAddress(new Uint8Array(20))).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
});
