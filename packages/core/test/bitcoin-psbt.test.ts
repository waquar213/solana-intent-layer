/**
 * Bitcoin PSBT signing — builds a real P2WPKH spend with @scure/btc-signer,
 * signs it with a key derived from our HD keyring, and checks the transaction
 * finalizes to a stable, extractable raw tx. This validates both our wrapper
 * and the end-to-end derive→sign path.
 */
import { describe, expect, it } from 'vitest';
import * as btc from '@scure/btc-signer';
import { hexToBytes } from '@noble/hashes/utils';
import { HDKeyring } from '../src/keyring.js';
import { signPsbt } from '../src/signing/bitcoin-psbt.js';
import { zeroize } from '../src/bytes.js';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** Builds an unsigned PSBT spending a single P2WPKH UTXO owned by `pubkey`. */
function buildP2wpkhPsbt(pubkey: Uint8Array, toAddress: string): Uint8Array {
  const p2wpkh = btc.p2wpkh(pubkey);
  const tx = new btc.Transaction();
  tx.addInput({
    txid: hexToBytes('a'.repeat(64)), // deterministic fake prevout
    index: 0,
    witnessUtxo: { script: p2wpkh.script, amount: 100_000n },
  });
  tx.addOutputAddress(toAddress, 90_000n, btc.NETWORK); // 10k sat fee
  return tx.toPSBT();
}

describe('signPsbt', () => {
  const keyring = HDKeyring.fromMnemonic(ABANDON);
  const account = keyring.getAccount(0);
  const pubkey = hexToBytes(account.btc.publicKey);

  it('signs and finalizes a single-input P2WPKH transaction', () => {
    const psbt = buildP2wpkhPsbt(pubkey, account.btc.address);
    const key = keyring.exportPrivateKey('btc', 0);
    const result = signPsbt(psbt, key);
    zeroize(key);

    expect(result.signedInputs).toBe(1);
    expect(result.finalized).toBe(true);
    expect(result.txHex).toMatch(/^[0-9a-f]+$/u);
    expect(result.txid).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('is deterministic: the same inputs produce the same txid', () => {
    const key = keyring.exportPrivateKey('btc', 0);
    const a = signPsbt(buildP2wpkhPsbt(pubkey, account.btc.address), key.slice());
    const b = signPsbt(buildP2wpkhPsbt(pubkey, account.btc.address), key.slice());
    zeroize(key);
    expect(a.txid).toBe(b.txid);
    expect(a.txHex).toBe(b.txHex);
  });

  it('does not finalize when asked to leave the PSBT partial', () => {
    const key = keyring.exportPrivateKey('btc', 0);
    const result = signPsbt(buildP2wpkhPsbt(pubkey, account.btc.address), key, { finalize: false });
    zeroize(key);
    expect(result.signedInputs).toBe(1);
    expect(result.finalized).toBe(false);
    expect(result.txHex).toBeUndefined();
    // The returned partial PSBT can still be finalized by a later step.
    expect(() => btc.Transaction.fromPSBT(result.psbt)).not.toThrow();
  });

  it('signs nothing when the key owns none of the inputs', () => {
    const otherKeyring = HDKeyring.fromMnemonic(ABANDON, { passphrase: 'different-wallet' });
    const psbt = buildP2wpkhPsbt(pubkey, account.btc.address); // input owned by main key
    const foreignKey = otherKeyring.exportPrivateKey('btc', 0);
    const result = signPsbt(psbt, foreignKey, { finalize: false });
    zeroize(foreignKey);
    expect(result.signedInputs).toBe(0);
    expect(result.finalized).toBe(false);
  });

  it('rejects malformed PSBTs and wrong-size keys', () => {
    expect(() => signPsbt(new Uint8Array([1, 2, 3]), new Uint8Array(32))).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    const psbt = buildP2wpkhPsbt(pubkey, account.btc.address);
    expect(() => signPsbt(psbt, new Uint8Array(31))).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
});
