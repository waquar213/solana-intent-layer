import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { utf8ToBytes } from '@noble/hashes/utils';
import {
  evmAddressFromPublicKey,
  hashPersonalMessage,
  isChecksumAddress,
  recoverEvmAddress,
  signEvmDigest,
  toChecksumAddress,
} from '../src/accounts/evm.js';

// Official EIP-55 test vectors: https://eips.ethereum.org/EIPS/eip-55
const EIP55_VECTORS = [
  '0x52908400098527886E0F7030069857D2E4169EE7', // all caps
  '0x8617E340B3D01FA5F11F306F4090FD50E238070D',
  '0xde709f2102306220921060314715629080e2fb77', // all lower
  '0x27b1fdb04752bbc536007a920d24acb045561c26',
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', // normal mixed-case
  '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
  '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
];

describe('EIP-55 checksum addresses', () => {
  it('reproduces every official EIP-55 vector', () => {
    for (const vector of EIP55_VECTORS) {
      expect(toChecksumAddress(vector.toLowerCase())).toBe(vector);
      expect(isChecksumAddress(vector)).toBe(true);
    }
  });

  it('is idempotent and case-insensitive on input', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 20, maxLength: 20 }), (raw) => {
        const hex = `0x${Buffer.from(raw).toString('hex')}`;
        const checksummed = toChecksumAddress(hex);
        expect(toChecksumAddress(checksummed)).toBe(checksummed);
        expect(toChecksumAddress(hex.toUpperCase().replace('0X', '0x'))).toBe(checksummed);
      }),
      { numRuns: 50 },
    );
  });

  it('detects a single flipped-case character as invalid', () => {
    const good = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
    const bad = good.replace('aA', 'aa');
    expect(isChecksumAddress(bad)).toBe(false);
  });

  it('rejects malformed addresses', () => {
    for (const bad of ['0x123', 'not-an-address', '0xzz08400098527886E0F7030069857D2E4169EE7']) {
      expect(() => toChecksumAddress(bad)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
      expect(isChecksumAddress(bad)).toBe(false);
    }
  });
});

describe('EVM address derivation', () => {
  it('derives the same address from compressed and uncompressed public keys', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (candidate) => {
        fc.pre(secp256k1.utils.isValidPrivateKey(candidate));
        const compressed = secp256k1.getPublicKey(candidate, true);
        const uncompressed = secp256k1.getPublicKey(candidate, false);
        expect(evmAddressFromPublicKey(compressed)).toBe(evmAddressFromPublicKey(uncompressed));
      }),
      { numRuns: 25 },
    );
  });

  it('rejects garbage public keys', () => {
    expect(() => evmAddressFromPublicKey(new Uint8Array(33))).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
});

describe('EVM digest signing', () => {
  const privateKey = keccak_256(utf8ToBytes('intent-wallet evm signing test key'));
  const address = evmAddressFromPublicKey(secp256k1.getPublicKey(privateKey, true));

  it('signs deterministically (RFC 6979) with low-s and a valid recovery bit', () => {
    const digest = keccak_256(utf8ToBytes('hello intent layer'));
    const sig1 = signEvmDigest(digest, privateKey);
    const sig2 = signEvmDigest(digest, privateKey);
    expect(sig1).toHaveLength(65);
    expect(Buffer.from(sig1).toString('hex')).toBe(Buffer.from(sig2).toString('hex'));
    expect([0, 1]).toContain(sig1[64]);
    const s = secp256k1.Signature.fromCompact(sig1.subarray(0, 64)).s;
    expect(s <= secp256k1.CURVE.n / 2n).toBe(true); // malleability protection
  });

  it('recovers the signer address', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 256 }), (message) => {
        const digest = keccak_256(message);
        const signature = signEvmDigest(digest, privateKey);
        expect(recoverEvmAddress(digest, signature)).toBe(address);
      }),
      { numRuns: 25 },
    );
  });

  it('rejects wrong-size digests and signatures', () => {
    expect(() => signEvmDigest(new Uint8Array(31), privateKey)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(() => recoverEvmAddress(new Uint8Array(32), new Uint8Array(64))).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    const sig = signEvmDigest(keccak_256(utf8ToBytes('x')), privateKey);
    sig[64] = 7;
    expect(() => recoverEvmAddress(keccak_256(utf8ToBytes('x')), sig)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
});

describe('EIP-191 personal message hashing', () => {
  it('prefixes with the standard header and byte length', () => {
    const message = utf8ToBytes('hello');
    const expected = keccak_256(utf8ToBytes('\x19Ethereum Signed Message:\n5hello'));
    expect(Buffer.from(hashPersonalMessage(message)).toString('hex')).toBe(Buffer.from(expected).toString('hex'));
  });
});
