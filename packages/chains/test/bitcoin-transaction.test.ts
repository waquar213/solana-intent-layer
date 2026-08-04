import { describe, expect, it } from 'vitest';
import { Transaction } from '@scure/btc-signer';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ChainError, buildBtcTransfer, p2wpkhAddressFor } from '../src/index.js';

const priv = new Uint8Array(32).fill(1);
const pub = secp256k1.getPublicKey(priv, true); // 33-byte compressed
const recipientPub = secp256k1.getPublicKey(new Uint8Array(32).fill(2), true);
const txid = 'a'.repeat(64); // a stand-in explorer txid

describe('bitcoin P2WPKH address', () => {
  it('encodes the network in the bech32 HRP (same witness program)', () => {
    expect(p2wpkhAddressFor(pub, 'mainnet')).toMatch(/^bc1q/);
    expect(p2wpkhAddressFor(pub, 'testnet')).toMatch(/^tb1q/);
    expect(() => p2wpkhAddressFor(new Uint8Array(10), 'testnet')).toThrow(/33-byte/);
  });
});

describe('buildBtcTransfer', () => {
  const recipient = p2wpkhAddressFor(recipientPub, 'testnet');

  it('selects inputs, adds recipient + change, and computes a fee', () => {
    const built = buildBtcTransfer({
      publicKey: pub,
      utxos: [{ txid, vout: 0, value: 100_000n }],
      toAddress: recipient,
      amountSats: 50_000n,
      feeRateSatPerVb: 2,
      network: 'testnet',
    });

    expect(built.ownAddress).toBe(p2wpkhAddressFor(pub, 'testnet'));
    expect(built.inputCount).toBe(1);
    expect(built.fee).toBeGreaterThan(0n);

    // The PSBT parses; recipient + change outputs conserve value (in + 0 = out + fee).
    const tx = Transaction.fromPSBT(built.psbt);
    expect(tx.inputsLength).toBe(1);
    expect(tx.outputsLength).toBe(2);
    let out = 0n;
    for (let i = 0; i < tx.outputsLength; i++) out += tx.getOutput(i).amount ?? 0n;
    expect(out + built.fee).toBe(100_000n);
    const amounts = Array.from({ length: tx.outputsLength }, (_, i) => tx.getOutput(i).amount);
    expect(amounts).toContain(50_000n);
  });

  it('produces a PSBT the owning key can sign and finalize into a raw tx', () => {
    const built = buildBtcTransfer({
      publicKey: pub,
      utxos: [{ txid, vout: 0, value: 100_000n }],
      toAddress: recipient,
      amountSats: 40_000n,
      feeRateSatPerVb: 3,
      network: 'testnet',
    });
    const tx = Transaction.fromPSBT(built.psbt);
    expect(tx.sign(priv)).toBe(1); // signed our one input
    tx.finalize();
    expect(tx.extract().length).toBeGreaterThan(0);
    expect(tx.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a spend the UTXO set cannot fund', () => {
    expect(() =>
      buildBtcTransfer({
        publicKey: pub,
        utxos: [{ txid, vout: 0, value: 1_000n }],
        toAddress: recipient,
        amountSats: 100_000n,
        feeRateSatPerVb: 2,
        network: 'testnet',
      }),
    ).toThrow(ChainError);
  });

  // Returns the raw scriptPubKey of the single OP_RETURN (0-value, starts with 0x6a) output.
  function opReturnScript(data: Uint8Array): Uint8Array {
    const built = buildBtcTransfer({
      publicKey: pub,
      utxos: [{ txid, vout: 0, value: 200_000n }],
      toAddress: recipient,
      amountSats: 50_000n,
      feeRateSatPerVb: 2,
      network: 'testnet',
      opReturn: data,
    });
    const tx = Transaction.fromPSBT(built.psbt);
    for (let i = 0; i < tx.outputsLength; i++) {
      const script = tx.getOutput(i).script;
      if (script && script[0] === 0x6a) return script;
    }
    throw new Error('no OP_RETURN output found');
  }

  it('encodes a ≤75-byte OP_RETURN as a direct push (0x6a <len> <data>)', () => {
    const data = new Uint8Array(40).fill(0xcd);
    const script = opReturnScript(data);
    // 0x6a OP_RETURN, then a single length byte (40 = 0x28), then the data.
    expect([script[0], script[1]]).toEqual([0x6a, 40]);
    expect(script.length).toBe(2 + 40);
    expect(Array.from(script.slice(2))).toEqual(Array.from(data));
  });

  it('encodes a 76–80-byte OP_RETURN via OP_PUSHDATA1 (0x6a 0x4c <len> <data>) — not a raw length byte', () => {
    // 76 is the first size where a raw length prefix (0x4c) would collide with the
    // OP_PUSHDATA1 opcode and produce a malformed, relay-rejected script. The builder
    // MUST emit the explicit pushdata form instead.
    const data = new Uint8Array(76).fill(0xab);
    const script = opReturnScript(data);
    expect([script[0], script[1], script[2]]).toEqual([0x6a, 0x4c, 76]);
    expect(script.length).toBe(3 + 76);
    expect(Array.from(script.slice(3))).toEqual(Array.from(data));
  });

  it('rejects an OP_RETURN payload larger than 80 bytes', () => {
    expect(() =>
      buildBtcTransfer({
        publicKey: pub,
        utxos: [{ txid, vout: 0, value: 200_000n }],
        toAddress: recipient,
        amountSats: 50_000n,
        feeRateSatPerVb: 2,
        network: 'testnet',
        opReturn: new Uint8Array(81),
      }),
    ).toThrow(/exceeds 80 bytes/);
  });
});
