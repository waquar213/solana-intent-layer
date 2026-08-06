/**
 * solAMM — client message builders for our own constant-product SOL/SPL-token AMM
 * on Solana devnet (program 7Bkhe…w2c7, the on-chain twin of the GIWA SimpleAMM).
 *
 * This compiles the anchor swap instruction (8-byte `global:<name>` discriminator +
 * two u64 args) into a legacy message; core signs it and the adapter broadcasts.
 * Pure and byte-exact, and it never holds a key — the same "chains build, core signs"
 * split as the SOL/SPL transfer builders.
 */
import { base58 } from '@scure/base';
import { ChainError } from '../errors.js';
import { SYSTEM_PROGRAM_ID } from './transaction.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  compileMessage,
  findAssociatedTokenAddress,
  findProgramAddress,
} from './spl.js';

// anchor instruction discriminators, straight from the built IDL.
const DISC_SOL_FOR_TOKEN = Uint8Array.from([241, 106, 222, 44, 89, 254, 233, 161]);
const DISC_TOKEN_FOR_SOL = Uint8Array.from([253, 34, 238, 50, 70, 172, 220, 33]);

const POOL_SEED = new TextEncoder().encode('pool');
const VAULT_SEED = new TextEncoder().encode('vault');

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
  if (value < 0n) throw new ChainError('INVALID_RESPONSE', 'swap amount must be non-negative');
  if (value >= 1n << 64n) throw new ChainError('INVALID_RESPONSE', 'swap amount exceeds u64 range'); // fail closed — never wrap
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function decode32(b58: string, what: string): Uint8Array {
  const bytes = base58.decode(b58);
  if (bytes.length !== 32) throw new ChainError('INVALID_RESPONSE', `${what} must be a 32-byte base58 address`);
  return bytes;
}

export interface SolammSwap {
  /** 32-byte ed25519 public key of the trader — fee payer, signer, SOL/token owner. */
  ownerPubkey: Uint8Array;
  /** The solAMM program address (base58). */
  programId: string;
  /** The pool's SPL token mint (base58). */
  mint: string;
  /** Input amount: lamports when buying the token, token base units when selling it. */
  amountIn: bigint;
  /** Slippage floor in the output asset's base units (lamports out, or token base units out). */
  minOut: bigint;
  /** Recent blockhash (base58), from getLatestBlockhash. */
  recentBlockhash: string;
}

export interface BuiltSolammSwap {
  message: Uint8Array;
  pool: Uint8Array;
  vault: Uint8Array;
  userToken: Uint8Array;
}

/** The pool + vault PDA addresses for a (program, mint), as base58 — for quoting/reads. */
export function solammPdas(programId: string, mint: string): { pool: string; vault: string } {
  const pid = decode32(programId, 'programId');
  const m = decode32(mint, 'mint');
  return {
    pool: base58.encode(findProgramAddress([POOL_SEED, m], pid).address),
    vault: base58.encode(findProgramAddress([VAULT_SEED, m], pid).address),
  };
}

function derive(t: SolammSwap): { programId: Uint8Array; mint: Uint8Array; pool: Uint8Array; vault: Uint8Array; userToken: Uint8Array } {
  if (t.ownerPubkey.length !== 32) throw new ChainError('INVALID_RESPONSE', 'ownerPubkey must be 32 bytes');
  const programId = decode32(t.programId, 'programId');
  const mint = decode32(t.mint, 'mint');
  return {
    programId,
    mint,
    pool: findProgramAddress([POOL_SEED, mint], programId).address,
    vault: findProgramAddress([VAULT_SEED, mint], programId).address,
    userToken: findAssociatedTokenAddress(t.ownerPubkey, mint),
  };
}

/** Associated Token program CreateIdempotent — a no-op if the ATA already exists. */
function createAtaIdempotentIx(owner: Uint8Array, ata: Uint8Array, mint: Uint8Array): Instruction {
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Uint8Array.from([1]),
  };
}

/**
 * Buy the pool's token with SOL. Idempotently ensures the trader's token ATA exists
 * (so the output has somewhere to land), then calls `swap_sol_for_token`.
 */
export function buildSwapSolForTokenMessage(t: SolammSwap): BuiltSolammSwap {
  const { programId, mint, pool, vault, userToken } = derive(t);
  const swapIx: Instruction = {
    programId,
    keys: [
      { pubkey: t.ownerPubkey, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: userToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: concat(DISC_SOL_FOR_TOKEN, u64le(t.amountIn), u64le(t.minOut)),
  };
  const message = compileMessage(t.ownerPubkey, [createAtaIdempotentIx(t.ownerPubkey, userToken, mint), swapIx], t.recentBlockhash);
  return { message, pool, vault, userToken };
}

/**
 * Sell the pool's token for SOL via `swap_token_for_sol`. The trader's token ATA
 * must already hold the tokens being sold.
 */
export function buildSwapTokenForSolMessage(t: SolammSwap): BuiltSolammSwap {
  const { programId, mint, pool, vault, userToken } = derive(t);
  const swapIx: Instruction = {
    programId,
    keys: [
      { pubkey: t.ownerPubkey, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: userToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: concat(DISC_TOKEN_FOR_SOL, u64le(t.amountIn), u64le(t.minOut)),
  };
  const message = compileMessage(t.ownerPubkey, [swapIx], t.recentBlockhash);
  return { message, pool, vault, userToken };
}
