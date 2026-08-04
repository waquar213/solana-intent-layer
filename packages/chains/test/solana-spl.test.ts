import { describe, expect, it } from 'vitest';
import { base58 } from '@scure/base';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  buildSplTransferMessage,
  findAssociatedTokenAddress,
} from '../src/index.js';

const USDC = base58.decode('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

describe('associated token address (PDA)', () => {
  // Both expected values were computed with the official @solana/spl-token
  // getAssociatedTokenAddressSync — this asserts our derivation is byte-exact.
  it('matches @solana/spl-token for two independent (owner, USDC) vectors', () => {
    expect(base58.encode(findAssociatedTokenAddress(base58.decode('5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6'), USDC))).toBe(
      'Cs2C1WHgsfcCcYJeZV9yY9YZ7DQgw2ui3qxPfPLbKM9E',
    );
    expect(base58.encode(findAssociatedTokenAddress(base58.decode('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'), USDC))).toBe(
      'FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B',
    );
  });

  it('is deterministic and 32 bytes', () => {
    const owner = base58.decode('5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6');
    const a = findAssociatedTokenAddress(owner, USDC);
    const b = findAssociatedTokenAddress(owner, USDC);
    expect([...a]).toEqual([...b]);
    expect(a.length).toBe(32);
  });
});

describe('SPL transfer message', () => {
  const owner = base58.decode('5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6');
  const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const toOwner = base58.encode(new Uint8Array(32).fill(7));
  const blockhash = base58.encode(new Uint8Array(32).fill(3));

  it('compiles a create-ATA + transferChecked message with a valid header', () => {
    const { message, sourceAta, destAta } = buildSplTransferMessage({
      ownerPubkey: owner,
      mint,
      toOwner,
      amount: 1_000_000n, // 1 USDC (6 decimals)
      decimals: 6,
      recentBlockhash: blockhash,
    });

    // Header: 1 required signature (the owner), 0 readonly-signed.
    expect(message[0]).toBe(1);
    expect(message[1]).toBe(0);
    // The owner (sole signer + fee payer) is account index 0.
    expect([...message.slice(4, 36)]).toEqual([...owner]);

    // ATAs are the derived PDAs, distinct from the owners.
    expect(base58.encode(sourceAta)).toBe(base58.encode(findAssociatedTokenAddress(owner, base58.decode(mint))));
    expect(base58.encode(destAta)).toBe(
      base58.encode(findAssociatedTokenAddress(base58.decode(toOwner), base58.decode(mint))),
    );

    // The two program ids appear in the account list.
    const accts = message.slice(4, 4 + 32 * (message[3] as number));
    const has = (id: Uint8Array): boolean => {
      for (let i = 0; i < accts.length; i += 32) if ([...accts.slice(i, i + 32)].every((b, j) => b === id[j])) return true;
      return false;
    };
    expect(has(TOKEN_PROGRAM_ID)).toBe(true);
    expect(has(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
  });

  it('rejects a bad mint / recipient', () => {
    expect(() =>
      buildSplTransferMessage({ ownerPubkey: owner, mint: base58.encode(new Uint8Array(10)), toOwner, amount: 1n, decimals: 6, recentBlockhash: blockhash }),
    ).toThrow(/32-byte|mint/i);
  });
});
