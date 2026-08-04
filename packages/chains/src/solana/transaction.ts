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
