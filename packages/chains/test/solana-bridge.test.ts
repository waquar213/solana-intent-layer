/**
 * Solana bridge deposit — the operator/relayer liquidity bridge's source leg. A deposit is one legacy
 * message: SystemProgram Transfer(owner -> operator) + a Memo carrying the route `BRDG:<dest>:<recip>`.
 * This is a money path (it moves SOL), so it is asserted at the BYTE level: the test parses exactly
 * what `compileMessage` emits and checks the header, account ordering, transfer discriminator + lamports
 * (LE), and the memo — nothing re-implemented, nothing hand-waved. Pure + deterministic; core signs.
 */
import { describe, expect, it } from 'vitest';
import { base58 } from '@scure/base';
import { buildBridgeDepositMessage, MEMO_PROGRAM_ID, SYSTEM_PROGRAM_ID } from '../src/index.js';

const owner = new Uint8Array(32).fill(7); // stand-in 32-byte ed25519 pubkey (the depositor)
const operatorBytes = new Uint8Array(32).fill(9);
const operator = base58.encode(operatorBytes);
const blockhashBytes = new Uint8Array(32).fill(3);
const blockhash = base58.encode(blockhashBytes);
const memo = 'BRDG:sepolia:0xB81cbD5Bba32C44FdF851B2a6C1F5501046E82c8';
const LAMPORTS = 50_000_000n; // 0.05 SOL — 0x02FAF080

/**
 * Minimal legacy-message reader — parses precisely the bytes `compileMessage` writes, so the test
 * validates the real serialization rather than a re-implementation of it. All short-vec counts in
 * this 4-account / 2-instruction / short-memo message are < 128, i.e. a single byte.
 */
function parse(msg: Uint8Array): {
  header: number[];
  accounts: Uint8Array[];
  recent: Uint8Array;
  ixs: Array<{ programIdIndex: number; keyIndexes: number[]; data: Uint8Array }>;
  consumed: number;
} {
  let o = 0;
  const u8 = (): number => msg[o++] as number;
  const take = (n: number): Uint8Array => {
    const s = msg.slice(o, o + n);
    o += n;
    return s;
  };
  const header = [u8(), u8(), u8()];
  const nAcct = u8();
  const accounts: Uint8Array[] = [];
  for (let i = 0; i < nAcct; i++) accounts.push(take(32));
  const recent = take(32);
  const nIx = u8();
  const ixs: Array<{ programIdIndex: number; keyIndexes: number[]; data: Uint8Array }> = [];
  for (let i = 0; i < nIx; i++) {
    const programIdIndex = u8();
    const nKeys = u8();
    const keyIndexes: number[] = [];
    for (let k = 0; k < nKeys; k++) keyIndexes.push(u8());
    const data = take(u8());
    ixs.push({ programIdIndex, keyIndexes, data });
  }
  return { header, accounts, recent, ixs, consumed: o };
}

const bytesEqual = (a: Uint8Array, b: Uint8Array): void => expect([...a]).toEqual([...b]);

describe('buildBridgeDepositMessage — Solana bridge deposit (transfer + BRDG memo)', () => {
  const msg = buildBridgeDepositMessage({ ownerPubkey: owner, operator, lamports: LAMPORTS, memo, recentBlockhash: blockhash });
  const p = parse(msg);

  it('serializes to exactly the parsed length (no stray trailing bytes)', () => {
    expect(p.consumed).toBe(msg.length);
  });

  it('header = [1 required signature, 0 readonly-signed, 2 readonly-unsigned]', () => {
    // The owner is the sole signer; the System and Memo programs are the readonly-unsigned accounts.
    expect(p.header).toEqual([1, 0, 2]);
  });

  it('orders accounts as [owner(payer), operator(writable), System, Memo]', () => {
    expect(p.accounts.length).toBe(4);
    bytesEqual(p.accounts[0] as Uint8Array, owner); // fee payer + signer, index 0
    bytesEqual(p.accounts[1] as Uint8Array, operatorBytes); // writable non-signer
    bytesEqual(p.accounts[2] as Uint8Array, SYSTEM_PROGRAM_ID);
    bytesEqual(p.accounts[3] as Uint8Array, MEMO_PROGRAM_ID);
  });

  it('carries the exact recent blockhash', () => {
    bytesEqual(p.recent, blockhashBytes);
  });

  it('instruction 0 = SystemProgram Transfer(owner -> operator) with lamports LE', () => {
    const ix = p.ixs[0] as { programIdIndex: number; keyIndexes: number[]; data: Uint8Array };
    expect(ix.programIdIndex).toBe(2); // System program
    expect(ix.keyIndexes).toEqual([0, 1]); // from = owner(0), to = operator(1)
    // Transfer discriminator (2, u32 LE) + lamports (u64 LE). 50_000_000 = 0x02FAF080.
    expect([...ix.data]).toEqual([2, 0, 0, 0, 0x80, 0xf0, 0xfa, 0x02, 0, 0, 0, 0]);
  });

  it('instruction 1 = Memo program carrying the BRDG route, with no accounts', () => {
    const ix = p.ixs[1] as { programIdIndex: number; keyIndexes: number[]; data: Uint8Array };
    expect(ix.programIdIndex).toBe(3); // Memo program
    expect(ix.keyIndexes).toEqual([]);
    expect(new TextDecoder().decode(ix.data)).toBe(memo);
  });

  it('is deterministic — the same input yields identical bytes', () => {
    const again = buildBridgeDepositMessage({ ownerPubkey: owner, operator, lamports: LAMPORTS, memo, recentBlockhash: blockhash });
    bytesEqual(again, msg);
  });

  it('rejects a non-32-byte owner pubkey', () => {
    expect(() => buildBridgeDepositMessage({ ownerPubkey: new Uint8Array(31), operator, lamports: 1n, memo, recentBlockhash: blockhash })).toThrow();
  });

  it('rejects a malformed operator address', () => {
    expect(() => buildBridgeDepositMessage({ ownerPubkey: owner, operator: 'not_base58_0OIl', lamports: 1n, memo, recentBlockhash: blockhash })).toThrow();
  });

  it('rejects negative lamports (never signs a malformed transfer)', () => {
    expect(() => buildBridgeDepositMessage({ ownerPubkey: owner, operator, lamports: -1n, memo, recentBlockhash: blockhash })).toThrow();
  });
});
