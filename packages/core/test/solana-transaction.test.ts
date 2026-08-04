import { describe, expect, it } from 'vitest';
import { base58 } from '@scure/base';
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils';
import { HDKeyring } from '../src/keyring.js';
import { signSolanaTransactionMessage } from '../src/signing/solana-transaction.js';
import { verifySolanaSignature } from '../src/accounts/solana.js';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('signSolanaTransactionMessage', () => {
  const keyring = HDKeyring.fromMnemonic(ABANDON);
  const account = keyring.getAccount(0);
  const publicKey = base58.decode(account.sol.address);

  it('produces a 64-byte signature that verifies against the account key', () => {
    const message = utf8ToBytes('compiled-solana-transaction-message-bytes');
    const key = keyring.exportPrivateKey('sol', 0);
    const signature = signSolanaTransactionMessage(message, key);
    expect(signature).toHaveLength(64);
    expect(verifySolanaSignature(signature, message, publicKey)).toBe(true);
  });

  it('is deterministic (ed25519) for the same message and key', () => {
    const message = randomBytes(200);
    const key = keyring.exportPrivateKey('sol', 0);
    const a = signSolanaTransactionMessage(message, key.slice());
    const b = signSolanaTransactionMessage(message, key.slice());
    expect(Buffer.from(a)).toEqual(Buffer.from(b));
  });

  it('rejects empty messages and wrong-size keys', () => {
    const key = keyring.exportPrivateKey('sol', 0);
    expect(() => signSolanaTransactionMessage(new Uint8Array(0), key)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(() => signSolanaTransactionMessage(utf8ToBytes('x'), new Uint8Array(31))).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
});
