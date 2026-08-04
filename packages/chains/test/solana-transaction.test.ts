import { describe, expect, it } from 'vitest';
import { base58, base64 } from '@scure/base';
import {
  SYSTEM_PROGRAM_ID,
  assembleSolTransaction,
  buildSolTransferMessage,
  encodeShortVec,
} from '../src/index.js';

const from = new Uint8Array(32).fill(1); // stand-in 32-byte ed25519 pubkey
const toAddr = base58.encode(new Uint8Array(32).fill(2));
const blockhash = base58.encode(new Uint8Array(32).fill(3));

describe('solana short-vec (compact-u16)', () => {
  it('encodes single-byte and multi-byte lengths per spec', () => {
    expect([...encodeShortVec(0)]).toEqual([0]);
    expect([...encodeShortVec(1)]).toEqual([1]);
    expect([...encodeShortVec(127)]).toEqual([127]);
    expect([...encodeShortVec(128)]).toEqual([0x80, 0x01]);
    expect([...encodeShortVec(16384)]).toEqual([0x80, 0x80, 0x01]);
  });
});

describe('solana transfer message', () => {
  it('serializes a legacy transfer message with the exact on-chain layout', () => {
    const lamports = 1_000_000n; // 0.001 SOL
    const msg = buildSolTransferMessage({ fromPubkey: from, toAddress: toAddr, lamports, recentBlockhash: blockhash });

    // header: 1 required sig, 0 readonly-signed, 1 readonly-unsigned (SystemProgram)
    expect([...msg.slice(0, 3)]).toEqual([1, 0, 1]);
    // account count = 3, then from | to | SystemProgram
    expect(msg[3]).toBe(3);
    expect([...msg.slice(4, 36)]).toEqual([...from]);
    expect([...msg.slice(36, 68)]).toEqual([...base58.decode(toAddr)]);
    expect([...msg.slice(68, 100)]).toEqual([...SYSTEM_PROGRAM_ID]);
    // recent blockhash
    expect([...msg.slice(100, 132)]).toEqual([...base58.decode(blockhash)]);
    // 1 instruction, programIdIndex=2, 2 accounts [0,1], data len 12
    expect(msg[132]).toBe(1); // instruction count
    expect(msg[133]).toBe(2); // programIdIndex → SystemProgram
    expect(msg[134]).toBe(2); // account count
    expect([...msg.slice(135, 137)]).toEqual([0, 1]); // from, to
    expect(msg[137]).toBe(12); // data length
    // data: transfer discriminator (2 u32-LE) + lamports (u64-LE)
    expect([...msg.slice(138, 142)]).toEqual([2, 0, 0, 0]);
    const lamportsLE = msg.slice(142, 150);
    let decoded = 0n;
    for (let i = 7; i >= 0; i--) decoded = (decoded << 8n) | BigInt(lamportsLE[i]!);
    expect(decoded).toBe(lamports);
  });

  it('deduplicates account keys for a self-transfer (from == to)', () => {
    const selfAddr = base58.encode(from);
    const msg = buildSolTransferMessage({ fromPubkey: from, toAddress: selfAddr, lamports: 7n, recentBlockhash: blockhash });

    // only 2 distinct accounts: [from, SystemProgram] — the recipient collapses onto sender
    expect(msg[3]).toBe(2);
    expect([...msg.slice(4, 36)]).toEqual([...from]);
    expect([...msg.slice(36, 68)]).toEqual([...SYSTEM_PROGRAM_ID]);
    // recent blockhash follows the 2 accounts
    expect([...msg.slice(68, 100)]).toEqual([...base58.decode(blockhash)]);
    // 1 instruction, programIdIndex now 1 (SystemProgram), accounts [0, 0]
    expect(msg[100]).toBe(1); // instruction count
    expect(msg[101]).toBe(1); // programIdIndex → SystemProgram (index 1)
    expect(msg[102]).toBe(2); // account count
    expect([...msg.slice(103, 105)]).toEqual([0, 0]); // from and to both index 0
  });

  it('assembles the wire transaction as [1][signature][message], base64', () => {
    const msg = buildSolTransferMessage({ fromPubkey: from, toAddress: toAddr, lamports: 5n, recentBlockhash: blockhash });
    const sig = new Uint8Array(64).fill(9);
    const wire = base64.decode(assembleSolTransaction(msg, sig));
    expect(wire[0]).toBe(1); // one signature
    expect([...wire.slice(1, 65)]).toEqual([...sig]);
    expect([...wire.slice(65)]).toEqual([...msg]);
  });

  it('rejects a bad recipient or signature length', () => {
    expect(() => buildSolTransferMessage({ fromPubkey: from, toAddress: base58.encode(new Uint8Array(10)), lamports: 1n, recentBlockhash: blockhash })).toThrow(/32-byte/i);
    const msg = buildSolTransferMessage({ fromPubkey: from, toAddress: toAddr, lamports: 1n, recentBlockhash: blockhash });
    expect(() => assembleSolTransaction(msg, new Uint8Array(10))).toThrow(/64 bytes/i);
  });
});
