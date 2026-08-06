/**
 * SimpleStaking (Solana) — client message builders for our native-SOL staking program on
 * devnet (the on-chain twin of the EVM SimpleStaking pool). Compiles the anchor `stake` /
 * `unstake` instructions (8-byte `global:<name>` discriminator + one u64 arg) into a legacy
 * message; core signs, the adapter broadcasts. Pure, byte-exact, keyless — same "chains build,
 * core signs" split as the solAMM + transfer builders.
 *
 * The account order + PDA seeds MATCH solana-staking/programs/staking/src/lib.rs exactly:
 *   stake/unstake: [user(signer,w), stake_account(w), vault(w), system_program]
 *   stake_account = PDA(["stake", user], programId) · vault = PDA(["vault"], programId)
 */
import { base58 } from '@scure/base';
import { ChainError } from '../errors.js';
import { SYSTEM_PROGRAM_ID } from './transaction.js';
import { compileMessage, findProgramAddress } from './spl.js';

// anchor discriminators = sha256("global:<name>")[:8].
const DISC_STAKE = Uint8Array.from([206, 176, 202, 18, 200, 209, 179, 108]);
const DISC_UNSTAKE = Uint8Array.from([90, 95, 107, 42, 205, 124, 50, 225]);

const STAKE_SEED = new TextEncoder().encode('stake');
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
  if (value < 0n) throw new ChainError('INVALID_RESPONSE', 'stake amount must be non-negative');
  if (value >= 1n << 64n) throw new ChainError('INVALID_RESPONSE', 'stake amount exceeds u64 range'); // fail closed — never wrap
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

export interface SolStake {
  /** 32-byte ed25519 public key of the staker — fee payer + signer. */
  ownerPubkey: Uint8Array;
  /** The staking program address (base58). */
  programId: string;
  /** Amount in lamports to stake or unstake. */
  amount: bigint;
  /** Recent blockhash (base58), from getLatestBlockhash. */
  recentBlockhash: string;
}

/** The per-user stake PDA + shared vault PDA for a program, as base58 — for reads. */
export function stakingPdas(programId: string, ownerPubkey: Uint8Array): { stakeAccount: string; vault: string } {
  const pid = decode32(programId, 'programId');
  return {
    stakeAccount: base58.encode(findProgramAddress([STAKE_SEED, ownerPubkey], pid).address),
    vault: base58.encode(findProgramAddress([VAULT_SEED], pid).address),
  };
}

function build(t: SolStake, disc: Uint8Array): Uint8Array {
  if (t.ownerPubkey.length !== 32) throw new ChainError('INVALID_RESPONSE', 'ownerPubkey must be 32 bytes');
  const programId = decode32(t.programId, 'programId');
  const stakeAccount = findProgramAddress([STAKE_SEED, t.ownerPubkey], programId).address;
  const vault = findProgramAddress([VAULT_SEED], programId).address;
  const ix: Instruction = {
    programId,
    keys: [
      { pubkey: t.ownerPubkey, isSigner: true, isWritable: true },
      { pubkey: stakeAccount, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: concat(disc, u64le(t.amount)),
  };
  return compileMessage(t.ownerPubkey, [ix], t.recentBlockhash);
}

/** Build the `stake(amount)` message — locks `amount` lamports into the vault. */
export function buildStakeSolMessage(t: SolStake): Uint8Array {
  return build(t, DISC_STAKE);
}

/** Build the `unstake(amount)` message — returns `amount` lamports of principal from the vault. */
export function buildUnstakeSolMessage(t: SolStake): Uint8Array {
  return build(t, DISC_UNSTAKE);
}
