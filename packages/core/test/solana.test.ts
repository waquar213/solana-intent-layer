import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { base58 } from '@scure/base';
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils';
import {
  signSolanaMessage,
  solanaAddressFromPublicKey,
  solanaPublicKey,
  verifySolanaSignature,
} from '../src/accounts/solana.js';

describe('Solana accounts', () => {
  it('address is the base58 of the 32-byte ed25519 public key', () => {
    const privateKey = randomBytes(32);
    const publicKey = solanaPublicKey(privateKey);
    const address = solanaAddressFromPublicKey(publicKey);
    expect(publicKey).toHaveLength(32);
    expect(base58.decode(address)).toEqual(publicKey);
  });

  it('sign/verify roundtrip; verification fails for wrong key, message, or signature', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 512 }), (message) => {
        const privateKey = randomBytes(32);
        const publicKey = solanaPublicKey(privateKey);
        const signature = signSolanaMessage(message, privateKey);
        expect(signature).toHaveLength(64);
        expect(verifySolanaSignature(signature, message, publicKey)).toBe(true);

        const otherPublicKey = solanaPublicKey(randomBytes(32));
        expect(verifySolanaSignature(signature, message, otherPublicKey)).toBe(false);

        const tamperedMessage = message.slice();
        tamperedMessage[0] = (tamperedMessage[0] as number) ^ 0xff;
        expect(verifySolanaSignature(signature, tamperedMessage, publicKey)).toBe(false);

        const tamperedSignature = signature.slice();
        tamperedSignature[3] = (tamperedSignature[3] as number) ^ 0x01;
        expect(verifySolanaSignature(tamperedSignature, message, publicKey)).toBe(false);
      }),
      { numRuns: 20 },
    );
  });

  it('verify never throws on garbage input', () => {
    expect(verifySolanaSignature(new Uint8Array(3), utf8ToBytes('x'), new Uint8Array(5))).toBe(false);
  });

  it('rejects wrong-size keys', () => {
    expect(() => solanaPublicKey(new Uint8Array(31))).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => solanaAddressFromPublicKey(new Uint8Array(33))).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
});
