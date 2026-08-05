/**
 * Solana transaction assembly — the "chains build, core signs" split for Solana.
 * A Solana transaction is an ed25519 signature over a SERIALIZED legacy message;
 * core signs the message bytes, and this module compiles a native SOL transfer into
 * that message and assembles the final wire transaction. Pure and byte-exact — the
 * devnet/mainnet node rejects any deviation, so the format here follows the on-chain
 * spec precisely (short-vec length prefixes, message header, SystemProgram transfer).
 */
import { base58, base64 } from '@scure/base';

/** SystemProgram id — `1111…1111` base58 decodes to 32 zero bytes. */
export const SYSTEM_PROGRAM_ID = base58.decode('11111111111111111111111111111111');

/** Solana short-vec (compact-u16) length encoding: 7 bits/byte, high bit = continue. */
export function encodeShortVec(len: number): Uint8Array {
  const out: number[] = [];
  let n = len >>> 0;
  for (;;) {
    const byte = n & 0x7f;
    n >>>= 7;
    if (n === 0) {
      out.push(byte);
      break;
    }
    out.push(byte | 0x80);
  }
  return Uint8Array.from(out);
}

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

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** u64 little-endian (lamports). */
function u64le(value: bigint): Uint8Array {
  if (value < 0n) throw new Error('lamports must be non-negative');
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export interface SolTransfer {
  /** 32-byte ed25519 public key of the sender (fee payer + sole signer). */
  fromPubkey: Uint8Array;
  /** Recipient base58 address. */
  toAddress: string;
  lamports: bigint;
  /** Recent blockhash (base58), from getLatestBlockhash. */
  recentBlockhash: string;
}

/**
 * Build the serialized LEGACY message for a single native SOL transfer. This is the
 * exact byte string that must be signed (`core.signSolanaTransactionMessage`).
 * Account order: [from (signer+writable), to (writable), SystemProgram (readonly)].
 */
export function buildSolTransferMessage(t: SolTransfer): Uint8Array {
  const from = t.fromPubkey;
  const to = base58.decode(t.toAddress);
  const blockhash = base58.decode(t.recentBlockhash);
  if (from.length !== 32) throw new Error('fromPubkey must be 32 bytes');
  if (to.length !== 32) throw new Error('recipient must be a 32-byte base58 address');
  if (blockhash.length !== 32) throw new Error('recentBlockhash must decode to 32 bytes');

  // Account keys are a DEDUPLICATED, privilege-ordered set: signer+writable first,
  // then writable, then readonly. For a self-transfer (from == to) the recipient
  // collapses onto the sender; the node rejects a key appearing twice otherwise.
  const selfTransfer = bytesEqual(from, to);
  const accounts = selfTransfer ? [from, SYSTEM_PROGRAM_ID] : [from, to, SYSTEM_PROGRAM_ID];
  const toIndex = selfTransfer ? 0 : 1;
  const programIdIndex = accounts.length - 1; // SystemProgram is always last (readonly)

  // header: numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts
  const header = Uint8Array.from([1, 0, 1]);

  // SystemProgram Transfer instruction #2 (u32 LE) + lamports (u64 LE).
  const data = concat(Uint8Array.from([2, 0, 0, 0]), u64le(t.lamports));
  const instruction = concat(
    Uint8Array.from([programIdIndex]), // programIdIndex → SystemProgram (last account)
    encodeShortVec(2),
    Uint8Array.from([0, toIndex]), // account indices: from(0), to
    encodeShortVec(data.length),
    data,
  );

  return concat(
    header,
    encodeShortVec(accounts.length),
    ...accounts,
    blockhash,
    encodeShortVec(1),
    instruction,
  );
}

/** Assemble the wire transaction (signatures ++ message) and base64-encode it. */
export function assembleSolTransaction(message: Uint8Array, signature: Uint8Array): string {
  if (signature.length !== 64) throw new Error('signature must be 64 bytes');
  return base64.encode(concat(encodeShortVec(1), signature, message));
}

/** Decode a Solana short-vec (compact-u16) at `offset`; returns the value + bytes consumed. Inverse of
 *  encodeShortVec. Throws on a truncated buffer or an over-long (> u16) encoding. */
export function decodeShortVec(bytes: Uint8Array, offset = 0): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let i = offset;
  for (;;) {
    if (i >= bytes.length) throw new Error('short-vec: unexpected end of buffer');
    const byte = bytes[i]!;
    value |= (byte & 0x7f) << shift;
    i += 1;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 14) throw new Error('short-vec: length exceeds u16'); // compact-u16 is at most 3 bytes
  }
  return { value: value >>> 0, bytesRead: i - offset };
}

/**
 * Extract the SIGNABLE message from an aggregator-built, UNSIGNED Solana wire transaction (base64).
 * Wire layout: [shortvec(numSignatures)] [numSignatures × 64B signature slots] [message]. This wallet
 * holds only the fee payer's key (Solana's sole/first required signer), so a route that needs MORE than
 * one signature cannot be completed here and is REFUSED (fail-closed). Returns the raw message bytes to
 * sign; `assembleSolTransaction(message, sig)` reconstitutes the wire tx. Byte-exact — any deviation is
 * rejected by the node. The message is treated as opaque (works for legacy AND v0 versioned messages).
 */
export function extractSolSignableMessage(wireBase64: string): Uint8Array {
  const wire = base64.decode(wireBase64.trim());
  const { value: numSigs, bytesRead } = decodeShortVec(wire, 0);
  if (numSigs !== 1) {
    throw new Error(`Solana route needs ${numSigs} signature(s); this wallet can only sign as the sole fee payer.`);
  }
  const msgStart = bytesRead + numSigs * 64;
  if (wire.length <= msgStart) throw new Error('Solana wire transaction is truncated (no message).');
  return wire.slice(msgStart);
}
