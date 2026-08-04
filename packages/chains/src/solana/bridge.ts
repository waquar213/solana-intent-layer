/**
 * Cross-chain bridge deposit (Solana side) for the wallet's own operator/relayer
 * liquidity bridge. A deposit is a single message that (1) transfers native SOL to
 * the bridge operator and (2) attaches a Memo instruction carrying the destination
 * route — `BRDG:<destChain>:<recipient>`. An off-chain relayer watches the operator,
 * reads the memo, and releases the asset on the destination chain (a real tx there).
 *
 * Real on-chain both sides, operator-secured (not trustless) — the same bonded-relayer
 * model fast bridges like Hop/Across use. Pure + byte-exact; core signs, no key here.
 */
import { base58 } from '@scure/base';
import { ChainError } from '../errors.js';
import { SYSTEM_PROGRAM_ID } from './transaction.js';
import { compileMessage } from './spl.js';

/** SPL Memo program (v2). */
export const MEMO_PROGRAM_ID = base58.decode('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function u64le(value: bigint): Uint8Array {
  if (value < 0n) throw new ChainError('INVALID_RESPONSE', 'lamports must be non-negative');
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export interface SolBridgeDeposit {
  /** 32-byte ed25519 public key of the depositor — fee payer, signer, SOL owner. */
  ownerPubkey: Uint8Array;
  /** The bridge operator's Solana address (base58) that receives the deposit. */
  operator: string;
  /** Amount of SOL to bridge, in lamports. */
  lamports: bigint;
  /** Route memo, `BRDG:<destChain>:<recipient>` — read by the relayer to release. */
  memo: string;
  /** Recent blockhash (base58), from getLatestBlockhash. */
  recentBlockhash: string;
}

/** Build the serialized message for a Solana bridge deposit (transfer + route memo). */
export function buildBridgeDepositMessage(t: SolBridgeDeposit): Uint8Array {
  if (t.ownerPubkey.length !== 32) throw new ChainError('INVALID_RESPONSE', 'ownerPubkey must be 32 bytes');
  const operator = base58.decode(t.operator);
  if (operator.length !== 32) throw new ChainError('INVALID_RESPONSE', 'operator must be a 32-byte base58 address');

  const transferIx = {
    programId: SYSTEM_PROGRAM_ID,
    keys: [
      { pubkey: t.ownerPubkey, isSigner: true, isWritable: true },
      { pubkey: operator, isSigner: false, isWritable: true },
    ],
    // SystemProgram Transfer #2 (u32 LE) + lamports (u64 LE).
    data: concat(Uint8Array.from([2, 0, 0, 0]), u64le(t.lamports)),
  };
  const memoIx = {
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: new TextEncoder().encode(t.memo),
  };
  return compileMessage(t.ownerPubkey, [transferIx, memoIx], t.recentBlockhash);
}
