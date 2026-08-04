/**
 * SPL token transfers — the "chains build, core signs" split for Solana tokens.
 * This compiles a legacy message that (1) idempotently creates the recipient's
 * Associated Token Account and (2) does a checked transfer of an SPL token from
 * the sender's ATA. Pure and byte-exact: Associated Token Accounts are Program
 * Derived Addresses (findProgramAddress over ed25519 off-curve bumps), and the
 * message account list is deduplicated + privilege-ordered exactly as the runtime
 * expects. core signs the message; this module never holds a key.
 */
import { base58 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { ed25519 } from '@noble/curves/ed25519';
import { ChainError } from '../errors.js';
import { SYSTEM_PROGRAM_ID, encodeShortVec } from './transaction.js';

/** SPL Token program. */
export const TOKEN_PROGRAM_ID = base58.decode('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
/** Associated Token Account program. */
export const ASSOCIATED_TOKEN_PROGRAM_ID = base58.decode('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');

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
  if (value < 0n) throw new ChainError('INVALID_RESPONSE', 'token amount must be non-negative');
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

const key = (b: Uint8Array): string => base58.encode(b);

/** True if the 32 bytes are a valid ed25519 point (ON the curve) — PDAs must be OFF it. */
function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Solana findProgramAddress: hash seeds‖bump‖programId‖"ProgramDerivedAddress", first off-curve bump wins. */
export function findProgramAddress(seeds: Uint8Array[], programId: Uint8Array): { address: Uint8Array; bump: number } {
  for (let bump = 255; bump >= 0; bump--) {
    const candidate = sha256(concat(...seeds, Uint8Array.from([bump]), programId, PDA_MARKER));
    if (!isOnCurve(candidate)) return { address: candidate, bump };
  }
  throw new ChainError('INVALID_RESPONSE', 'no off-curve program address found');
}

/** The Associated Token Account address for (owner, mint). */
export function findAssociatedTokenAddress(owner: Uint8Array, mint: Uint8Array): Uint8Array {
  return findProgramAddress([owner, TOKEN_PROGRAM_ID, mint], ASSOCIATED_TOKEN_PROGRAM_ID).address;
}

interface AccountMeta {
  pubkey: Uint8Array;
  isSigner: boolean;
  isWritable: boolean;
}
interface Instruction {
  programId: Uint8Array;
  keys: AccountMeta[];
  data: Uint8Array;
}

/**
 * Compile a legacy message: deduplicate accounts (merging privileges), order them
 * [writable-signers, readonly-signers, writable-nonsigners, readonly-nonsigners]
 * with the fee payer first, and reference them from each instruction by index.
 */
export function compileMessage(payer: Uint8Array, instructions: Instruction[], recentBlockhash: string): Uint8Array {
  const metas = new Map<string, AccountMeta>();
  const add = (m: AccountMeta): void => {
    const k = key(m.pubkey);
    const ex = metas.get(k);
    if (ex) {
      ex.isSigner = ex.isSigner || m.isSigner;
      ex.isWritable = ex.isWritable || m.isWritable;
    } else metas.set(k, { pubkey: m.pubkey, isSigner: m.isSigner, isWritable: m.isWritable });
  };
  add({ pubkey: payer, isSigner: true, isWritable: true });
  for (const ix of instructions) {
    for (const m of ix.keys) add(m);
    add({ pubkey: ix.programId, isSigner: false, isWritable: false });
  }

  const payerKey = key(payer);
  const accounts = [...metas.values()].sort((a, b) => {
    const ap = key(a.pubkey) === payerKey;
    const bp = key(b.pubkey) === payerKey;
    if (ap !== bp) return ap ? -1 : 1; // payer always index 0
    if (a.isSigner !== b.isSigner) return a.isSigner ? -1 : 1; // signers first
    if (a.isWritable !== b.isWritable) return a.isWritable ? -1 : 1; // writable before readonly
    return 0;
  });

  const numRequiredSignatures = accounts.filter((m) => m.isSigner).length;
  const numReadonlySigned = accounts.filter((m) => m.isSigner && !m.isWritable).length;
  const numReadonlyUnsigned = accounts.filter((m) => !m.isSigner && !m.isWritable).length;
  const header = Uint8Array.from([numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned]);

  const indexOf = (pk: Uint8Array): number => accounts.findIndex((m) => key(m.pubkey) === key(pk));
  const compiledIx = instructions.map((ix) =>
    concat(
      Uint8Array.from([indexOf(ix.programId)]),
      encodeShortVec(ix.keys.length),
      Uint8Array.from(ix.keys.map((m) => indexOf(m.pubkey))),
      encodeShortVec(ix.data.length),
      ix.data,
    ),
  );

  return concat(
    header,
    encodeShortVec(accounts.length),
    ...accounts.map((m) => m.pubkey),
    base58.decode(recentBlockhash),
    encodeShortVec(instructions.length),
    ...compiledIx,
  );
}

export interface SplTransfer {
  /** 32-byte ed25519 public key of the sender (fee payer + token authority). */
  ownerPubkey: Uint8Array;
  /** Token mint (base58). */
  mint: string;
  /** Recipient WALLET address (base58) — NOT their token account; the ATA is derived. */
  toOwner: string;
  /** Amount in the token's base units. */
  amount: bigint;
  /** The mint's decimals (asserted by transferChecked on-chain). */
  decimals: number;
  /** Recent blockhash (base58), from getLatestBlockhash. */
  recentBlockhash: string;
}

export interface BuiltSplTransfer {
  message: Uint8Array;
  sourceAta: Uint8Array;
  destAta: Uint8Array;
}

/**
 * Build the serialized message for an SPL transfer: create the recipient's ATA
 * idempotently (no-op if it exists; the sender pays rent if not), then
 * transferChecked from the sender's ATA. The returned message must be signed by
 * the owner's key (`core.signSolanaTransactionMessage`).
 */
export function buildSplTransferMessage(t: SplTransfer): BuiltSplTransfer {
  if (t.ownerPubkey.length !== 32) throw new ChainError('INVALID_RESPONSE', 'ownerPubkey must be 32 bytes');
  const mint = base58.decode(t.mint);
  const toOwner = base58.decode(t.toOwner);
  if (mint.length !== 32) throw new ChainError('INVALID_RESPONSE', 'mint must be a 32-byte base58 address');
  if (toOwner.length !== 32) throw new ChainError('INVALID_RESPONSE', 'recipient must be a 32-byte base58 address');
  if (t.decimals < 0 || t.decimals > 18) throw new ChainError('INVALID_RESPONSE', 'implausible token decimals');

  const sourceAta = findAssociatedTokenAddress(t.ownerPubkey, mint);
  const destAta = findAssociatedTokenAddress(toOwner, mint);

  // Associated Token program: CreateIdempotent (discriminator 1).
  const createIx: Instruction = {
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: t.ownerPubkey, isSigner: true, isWritable: true }, // funding payer
      { pubkey: destAta, isSigner: false, isWritable: true },
      { pubkey: toOwner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Uint8Array.from([1]),
  };

  // SPL Token: TransferChecked (instruction 12) — data = [12, amount u64 LE, decimals u8].
  const transferIx: Instruction = {
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: sourceAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destAta, isSigner: false, isWritable: true },
      { pubkey: t.ownerPubkey, isSigner: true, isWritable: false }, // authority (merges with payer)
    ],
    data: concat(Uint8Array.from([12]), u64le(t.amount), Uint8Array.from([t.decimals])),
  };

  return {
    message: compileMessage(t.ownerPubkey, [createIx, transferIx], t.recentBlockhash),
    sourceAta,
    destAta,
  };
}
