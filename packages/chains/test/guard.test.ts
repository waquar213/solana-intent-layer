/**
 * Broadcast guardrails — the deterministic gate that can only REFUSE. These prove
 * the three defenses: EIP-55 recipient validation, the mainnet acknowledgment gate,
 * and the mainnet spend cap. All pure, no network.
 */
import { describe, expect, it } from 'vitest';
import {
  assertBroadcastAllowed,
  assertSameRealism,
  assessRecipientOnChain,
  checkEvmRecipient,
  checkSameRealism,
  classifyHistoryForPoisoning,
  detectPoisoningLookalike,
  guardBroadcast,
  MAINNET_SPEND_CAP_USD,
  ChainError,
} from '../src/index.js';

// Real, EIP-55-valid Sepolia/mainnet-shaped addresses.
const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
// The same 20 bytes as WETH but with one letter's case flipped → breaks the checksum.
const WETH_BAD_CHECKSUM = '0xFff9976782d46CC05630D1f6eBAb18b2324d6B14';

describe('checkEvmRecipient', () => {
  it('accepts a correctly checksummed address', () => {
    expect(checkEvmRecipient(WETH).valid).toBe(true);
    expect(checkEvmRecipient(USDC).valid).toBe(true);
  });

  it('accepts all-lowercase / all-uppercase (no checksum info to contradict)', () => {
    expect(checkEvmRecipient(WETH.toLowerCase()).valid).toBe(true);
    expect(checkEvmRecipient(`0x${WETH.slice(2).toUpperCase()}`).valid).toBe(true);
  });

  it('rejects a mixed-case address that fails EIP-55 (a typo)', () => {
    const res = checkEvmRecipient(WETH_BAD_CHECKSUM);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/checksum/i);
  });

  it('rejects malformed addresses', () => {
    expect(checkEvmRecipient('0x1234').valid).toBe(false); // too short
    expect(checkEvmRecipient(`${WETH}00`).valid).toBe(false); // too long
    expect(checkEvmRecipient('not-an-address').valid).toBe(false);
  });

  it('rejects the zero address (a transfer there is an unrecoverable burn)', () => {
    const res = checkEvmRecipient(`0x${'0'.repeat(40)}`);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/zero address|burn/i);
  });
});

describe('guardBroadcast — testnet', () => {
  it('allows a well-formed testnet transfer with no acknowledgment', () => {
    const d = guardBroadcast({ chain: 'sepolia', toAddress: WETH });
    expect(d.ok).toBe(true);
    expect(d.blocked).toHaveLength(0);
    expect(d.warnings).toHaveLength(0); // no "irreversible" warning on testnet
  });

  it('blocks a testnet transfer to a checksum-invalid recipient', () => {
    const d = guardBroadcast({ chain: 'sepolia', toAddress: WETH_BAD_CHECKSUM });
    expect(d.ok).toBe(false);
    expect(d.blocked[0]).toMatch(/checksum/i);
  });

  it('blocks a transfer to the zero (burn) address even on testnet', () => {
    const d = guardBroadcast({ chain: 'sepolia', toAddress: `0x${'0'.repeat(40)}` });
    expect(d.ok).toBe(false);
    expect(d.blocked.join(' ')).toMatch(/zero address|burn/i);
  });

  it('validates non-EVM recipients only for emptiness (their builder decodes the rest)', () => {
    expect(guardBroadcast({ chain: 'solana-devnet', toAddress: 'SomeBase58Addr' }).ok).toBe(true);
    expect(guardBroadcast({ chain: 'bitcoin-testnet', toAddress: '   ' }).ok).toBe(false);
  });
});

describe('guardBroadcast — mainnet gate', () => {
  it('blocks a mainnet broadcast that is not explicitly acknowledged', () => {
    const d = guardBroadcast({ chain: 'ethereum', toAddress: WETH });
    expect(d.ok).toBe(false);
    expect(d.blocked.join(' ')).toMatch(/MAINNET/);
  });

  it('allows an acknowledged, priced, under-cap mainnet broadcast, but still warns it is irreversible', () => {
    // A priced under-cap amount is supplied so this isolates the mainnet-ack behavior
    // from the spend-cap gate — an UNPRICED mainnet transfer is deliberately over-cap
    // (fail-closed), covered by its own regression block below.
    const d = guardBroadcast({ chain: 'ethereum', toAddress: WETH, acknowledgeMainnet: true, amountUsd: 100 });
    expect(d.ok).toBe(true);
    expect(d.warnings.join(' ')).toMatch(/cannot be undone/i);
  });

  it('enforces the mainnet spend cap above the threshold', () => {
    const over = guardBroadcast({
      chain: 'ethereum',
      toAddress: WETH,
      acknowledgeMainnet: true,
      amountUsd: MAINNET_SPEND_CAP_USD + 1,
    });
    expect(over.ok).toBe(false);
    expect(over.blocked.join(' ')).toMatch(/spend cap/i);

    const underCap = guardBroadcast({
      chain: 'ethereum',
      toAddress: WETH,
      acknowledgeMainnet: true,
      amountUsd: MAINNET_SPEND_CAP_USD,
    });
    expect(underCap.ok).toBe(true);

    const overButAcked = guardBroadcast({
      chain: 'ethereum',
      toAddress: WETH,
      acknowledgeMainnet: true,
      acknowledgeHighValue: true,
      amountUsd: MAINNET_SPEND_CAP_USD + 1,
    });
    expect(overButAcked.ok).toBe(true);
  });
});

describe('guardBroadcast — spend cap fails closed on invalid amounts (regression)', () => {
  // Regression for the NaN/negative bypass: a mainnet transfer whose USD value is not a
  // finite, non-negative number must be treated as OVER the cap, so a tampered/corrupt
  // amount can never skip the high-value gate. The old check (`amountUsd === undefined ||
  // amountUsd > cap`) let NaN and negatives sail UNDER the cap: `NaN === undefined` is
  // false and `NaN > cap` is false, so a $10M transfer smuggled through as NaN would
  // broadcast with only the ordinary mainnet ack.
  for (const bad of [NaN, -1, -0.01, -Infinity, Infinity]) {
    it(`treats amountUsd=${String(bad)} as over-cap (high-value confirmation required)`, () => {
      const d = guardBroadcast({ chain: 'ethereum', toAddress: WETH, acknowledgeMainnet: true, amountUsd: bad });
      expect(d.ok).toBe(false);
      expect(d.blocked.join(' ')).toMatch(/cap|high-value/i);
    });
  }

  it('a valid finite non-negative amount at/under the cap still passes', () => {
    expect(guardBroadcast({ chain: 'ethereum', toAddress: WETH, acknowledgeMainnet: true, amountUsd: 0 }).ok).toBe(true);
    expect(
      guardBroadcast({ chain: 'ethereum', toAddress: WETH, acknowledgeMainnet: true, amountUsd: MAINNET_SPEND_CAP_USD }).ok,
    ).toBe(true);
  });
});

describe('address poisoning', () => {
  const known = ['0x9858EfFD232B4033E47d90003D41EC34EcaEda94'];
  // Same first-4 (9858) and last-4 (da94) hex as `known`, all-zero middle → a grafted lookalike.
  const lookalike = '0x985800000000000000000000000000000000da94';

  it('flags a lookalike sharing the visible ends but differing in the middle', () => {
    expect(detectPoisoningLookalike(lookalike, known)).toBe(known[0]);
  });

  it('does NOT flag the exact known address (any casing)', () => {
    expect(detectPoisoningLookalike(known[0] as string, known)).toBeNull();
    expect(detectPoisoningLookalike((known[0] as string).toLowerCase(), known)).toBeNull();
  });

  it('does NOT flag an unrelated address', () => {
    expect(detectPoisoningLookalike(WETH, known)).toBeNull();
    expect(detectPoisoningLookalike(lookalike, [])).toBeNull(); // no known set ⇒ nothing to mimic
  });

  it('also catches non-EVM (Solana/base58) lookalikes', () => {
    const sol = ['4d9dyddpj6a44A1uMhDRBYWNQWVWnNLHNbj65UVpVjzZ']; // first4 "4d9d", last4 "VjzZ"
    const lookalikeSol = `4d9d${'1'.repeat(36)}VjzZ`; // 4 + 36 + 4 = 44, same ends, different middle
    expect(lookalikeSol.length).toBe(44);
    expect(detectPoisoningLookalike(lookalikeSol, sol)).toBe(sol[0]);
  });

  it('guardBroadcast BLOCKS a poisoning lookalike (all chains, incl. testnet)', () => {
    const d = guardBroadcast({ chain: 'sepolia', toAddress: lookalike, knownAddresses: known });
    expect(d.ok).toBe(false);
    expect(d.blocked.join(' ')).toMatch(/poisoning/i);
  });

  it('guardBroadcast allows a real, non-lookalike recipient with a known set present', () => {
    expect(guardBroadcast({ chain: 'sepolia', toAddress: WETH, knownAddresses: known }).ok).toBe(true);
  });
});

describe('assessRecipientOnChain — FIRST-TIME poisoning detection (no saved contacts)', () => {
  const paid = ['0xB81cbD5Bba32C44FdF851B2a6C1F5501046E82c8']; // a counterparty the user really paid
  const lookalike = '0xb81cA4E8021F6c3d5b9E07128A4D6F0B3c9582c8'; // same ends, different middle

  it('BLOCKS a lookalike of an address the user has already PAID (history is the reference set)', () => {
    const d = assessRecipientOnChain(lookalike, { paidCounterparties: paid });
    expect(d.ok).toBe(false);
    expect(d.blocked.join(' ')).toMatch(/poisoning/i);
    expect(d.blocked.join(' ')).toMatch(/already paid/i);
  });

  it('BLOCKS an address only ever seen as an inbound zero-value/dust sender (planted poison)', () => {
    const d = assessRecipientOnChain(WETH, { onlySeenAsInboundDust: true });
    expect(d.ok).toBe(false);
    expect(d.blocked.join(' ')).toMatch(/dust|zero-value/i);
  });

  it('only WARNS on an unverified-token sender (counterfeit shape, but airdrops look the same)', () => {
    const d = assessRecipientOnChain(WETH, { onlySeenAsUnverifiedTokenSender: true });
    expect(d.ok).toBe(true); // must not hard-block: every testnet token is unpriced
    expect(d.warnings.join(' ')).toMatch(/unverified|counterfeit/i);
  });

  it('allows a genuine counterparty the user has paid before', () => {
    const d = assessRecipientOnChain(paid[0] as string, { paidCounterparties: paid });
    expect(d.ok).toBe(true);
    expect(d.blocked).toHaveLength(0);
  });

  it('allows an unrelated address, and WARNS (not blocks) on a never-used passive address', () => {
    const d = assessRecipientOnChain(WETH, { paidCounterparties: paid, nonce: 0, balanceBase: 0n, isContract: false });
    expect(d.ok).toBe(true); // a fresh legitimate wallet looks identical → must not hard-block
    expect(d.warnings.join(' ')).toMatch(/never sent a transaction/i);
  });

  it('stays quiet about the profile when an active address is used', () => {
    const d = assessRecipientOnChain(WETH, { paidCounterparties: paid, nonce: 42, balanceBase: 10n ** 18n, isContract: false });
    expect(d.ok).toBe(true);
    expect(d.warnings).toHaveLength(0);
  });

  it('does not double-report: a blocked lookalike suppresses the weaker passive-profile warning', () => {
    const d = assessRecipientOnChain(lookalike, { paidCounterparties: paid, nonce: 0, balanceBase: 0n, isContract: false });
    expect(d.ok).toBe(false);
    expect(d.warnings).toHaveLength(0);
  });

  it('degrades safely when no facts could be fetched (judges nothing, blocks nothing)', () => {
    const d = assessRecipientOnChain(lookalike, {});
    expect(d.ok).toBe(true);
    expect(d.blocked).toHaveLength(0);
    expect(d.warnings).toHaveLength(0);
  });

  it('catches the researched real-world minimum overlap (prefix 3 + suffix 4)', () => {
    // Only the first THREE and last FOUR characters match — the corpus minimum (a≥3, b≥4).
    const target = '0xB81' + 'f'.repeat(33) + '82c8';
    expect(target.length).toBe(42);
    expect(detectPoisoningLookalike(target, paid)).toBe(paid[0]);
    // One fewer trailing character than the threshold ⇒ not treated as a lookalike.
    const weaker = '0xB81' + 'f'.repeat(34) + '2c8';
    expect(detectPoisoningLookalike(weaker, paid)).toBeNull();
  });
});

describe('poisoning — reference-free detection + reference-set integrity', () => {
  const real = '0xB81cbD5Bba32C44FdF851B2a6C1F5501046E82c8';
  const attacker = '0xb81cA4E8021F6c3d5b9E07128A4D6F0B3c9582c8';

  it('BLOCKS a target that shares dust with many unrelated addresses — NO prior relationship needed', () => {
    // This is the only signal that can fire on a genuinely first-time recipient.
    const d = assessRecipientOnChain(attacker, { targetDistinctDustSenders: 12 });
    expect(d.ok).toBe(false);
    expect(d.blocked.join(' ')).toMatch(/different addresses|sprayed/i);
  });

  it('only warns on a single dust peer (one noisy contract is not a spray)', () => {
    const d = assessRecipientOnChain(attacker, { targetDistinctDustSenders: 1 });
    expect(d.ok).toBe(true);
    expect(d.warnings.join(' ')).toMatch(/dust/i);
  });

  it('BLOCKS a lookalike of someone who PAID this wallet (paying back is an ordinary flow)', () => {
    const d = assessRecipientOnChain(attacker, { receivedFromCounterparties: [real] });
    expect(d.ok).toBe(false);
    expect(d.blocked.join(' ')).toMatch(/really transacted with/i);
  });

  it('SECURITY: a dust sender never enters the reference set (else the attacker whitelists itself)', () => {
    // The attacker sends the victim a few wei / a zero-value transfer, hoping to be recorded as a
    // "counterparty" — which would make detectPoisoningLookalike treat its own address as known-good.
    const f = classifyHistoryForPoisoning(attacker, [
      { counterparty: real, outbound: true, valueBase: 10n ** 18n }, // genuine reference
      { counterparty: attacker, outbound: false, valueBase: 1n }, // 1 wei bait, flagged dust by caller
      { counterparty: attacker, outbound: false, valueBase: 0n }, // zero-value bait
    ]);
    expect(f.receivedFromCounterparties).not.toContain(attacker);
    // …so the lookalike is STILL caught against the genuine reference.
    const d = assessRecipientOnChain(attacker, f);
    expect(d.ok).toBe(false);
  });

  it('SECURITY: a caller-flagged dust inbound is excluded from references too', () => {
    const f = classifyHistoryForPoisoning(attacker, [
      { counterparty: attacker, outbound: false, valueBase: 10n ** 15n, dust: true }, // unpriced but below floor
    ]);
    expect(f.receivedFromCounterparties).toEqual([]);
  });

  it('a REAL inbound payment does make the sender a reference (when proven non-dust)', () => {
    const other = '0x' + '9'.repeat(40);
    // dust:false is what the fetcher asserts for an above-floor native receipt…
    expect(classifyHistoryForPoisoning(other, [{ counterparty: real, outbound: false, valueBase: 10n ** 18n, dust: false }]).receivedFromCounterparties).toEqual([real]);
    // …or a priced amount over the $10 dust line proves it on its own.
    expect(classifyHistoryForPoisoning(other, [{ counterparty: real, outbound: false, valueBase: 500n * 10n ** 6n, valueUsd: 500 }]).receivedFromCounterparties).toEqual([real]);
  });

  it('FAILS CLOSED: an inbound amount of unknown size is NOT promoted to a reference', () => {
    // No price, no dust verdict — the wallet cannot prove this was a real payment, so the sender
    // stays out of the reference set rather than being trusted by default.
    const f = classifyHistoryForPoisoning('0x' + '9'.repeat(40), [{ counterparty: real, outbound: false, valueBase: 1n }]);
    expect(f.receivedFromCounterparties).toEqual([]);
  });
});

describe('classifyHistoryForPoisoning — deriving the facts from on-chain history', () => {
  const real = '0xB81cbD5Bba32C44FdF851B2a6C1F5501046E82c8';
  const attacker = '0xb81cA4E8021F6c3d5b9E07128A4D6F0B3c9582c8';

  it('builds the reference set from OUTBOUND value transfers only', () => {
    const f = classifyHistoryForPoisoning(WETH, [
      { counterparty: real, outbound: true, valueBase: 10n ** 18n }, // paid → reference
      { counterparty: USDC, outbound: false, valueBase: 10n ** 18n }, // received → not a reference
      { counterparty: WETH, outbound: true, valueBase: 0n }, // outbound but zero value → not a payment
    ]);
    expect(f.paidCounterparties).toEqual([real]);
  });

  it('flags a zero-value inbound-only sender as planted dust (the block signal)', () => {
    const f = classifyHistoryForPoisoning(attacker, [
      { counterparty: real, outbound: true, valueBase: 10n ** 18n },
      { counterparty: attacker, outbound: false, valueBase: 0n }, // the planted zero-value transfer
    ]);
    expect(f.onlySeenAsInboundDust).toBe(true);
    // …and the same history also catches it as a lookalike of the address we paid.
    expect(detectPoisoningLookalike(attacker, f.paidCounterparties ?? [])).toBe(real);
  });

  it('does NOT flag dust from an address we have also legitimately paid', () => {
    const f = classifyHistoryForPoisoning(real, [
      { counterparty: real, outbound: true, valueBase: 10n ** 18n }, // we paid it
      { counterparty: real, outbound: false, valueBase: 0n }, // it also sent us a 0-value tx
    ]);
    expect(f.onlySeenAsInboundDust).toBe(false);
  });

  it('treats a plain unpriced-token sender as the WEAK signal only (no testnet false positive)', () => {
    // Every testnet token is unpriced, so an ordinary faucet/AMM payout must not read as dust.
    const f = classifyHistoryForPoisoning(USDC, [{ counterparty: USDC, outbound: false, valueBase: 1_352_480n, unverifiedToken: true }]);
    expect(f.onlySeenAsInboundDust).toBe(false); // NOT a hard block
    expect(f.onlySeenAsUnverifiedTokenSender).toBe(true); // surfaced as a caution instead
    expect(assessRecipientOnChain(USDC, f).ok).toBe(true);
  });

  it('flags a priced sub-$10 inbound transfer as dust (the tiny-transfer attack type)', () => {
    const f = classifyHistoryForPoisoning(USDC, [{ counterparty: USDC, outbound: false, valueBase: 1000n, valueUsd: 0.001 }]);
    expect(f.onlySeenAsInboundDust).toBe(true);
    // A real, above-threshold payment received is NOT dust.
    const g = classifyHistoryForPoisoning(USDC, [{ counterparty: USDC, outbound: false, valueBase: 500n * 10n ** 6n, valueUsd: 500 }]);
    expect(g.onlySeenAsInboundDust).toBe(false);
  });

  it('an address absent from history yields no dust verdict either way', () => {
    const f = classifyHistoryForPoisoning(attacker, [{ counterparty: real, outbound: true, valueBase: 10n ** 18n }]);
    expect(f.onlySeenAsInboundDust).toBe(false);
    expect(f.onlySeenAsUnverifiedTokenSender).toBe(false);
  });
});

describe('guardBroadcast — fail closed', () => {
  it('blocks an unknown chain rather than throwing', () => {
    // @ts-expect-error — deliberately off-registry to prove it fails closed, not open.
    const d = guardBroadcast({ chain: 'dogecoin', toAddress: WETH });
    expect(d.ok).toBe(false);
    expect(d.blocked[0]).toMatch(/unknown chain/i);
  });
});

describe('assertBroadcastAllowed', () => {
  it('throws a GUARD_BLOCKED ChainError when blocked', () => {
    try {
      assertBroadcastAllowed({ chain: 'ethereum', toAddress: WETH });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ChainError);
      expect((err as ChainError).code).toBe('GUARD_BLOCKED');
    }
  });

  it('is a no-op when allowed', () => {
    expect(() => assertBroadcastAllowed({ chain: 'sepolia', toAddress: WETH })).not.toThrow();
  });
});

describe('checkSameRealism — the cross-chain realism guard', () => {
  it('allows testnet ↔ testnet (either direction, any pair)', () => {
    expect(checkSameRealism('solana-devnet', 'sepolia').ok).toBe(true);
    expect(checkSameRealism('sepolia', 'giwa-sepolia').ok).toBe(true);
    expect(checkSameRealism('solana-devnet', 'bitcoin-testnet').ok).toBe(true);
    expect(checkSameRealism('giwa-sepolia', 'solana-devnet').ok).toBe(true);
  });

  it('allows mainnet ↔ mainnet', () => {
    expect(checkSameRealism('solana', 'ethereum').ok).toBe(true);
    expect(checkSameRealism('ethereum', 'bitcoin').ok).toBe(true);
    expect(checkSameRealism('bitcoin', 'solana').ok).toBe(true);
  });

  it('REFUSES a devnet↔mainnet cross-realism route in either direction', () => {
    const a = checkSameRealism('solana-devnet', 'ethereum');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toMatch(/cross-realism|testnet.*mainnet/i);

    const b = checkSameRealism('ethereum', 'solana-devnet');
    expect(b.ok).toBe(false);

    // The literal ask that started this: bridge devnet SOL out to real ETH — blocked.
    expect(checkSameRealism('solana-devnet', 'ethereum').ok).toBe(false);
    // …and testnet ETH to Solana mainnet.
    expect(checkSameRealism('sepolia', 'solana').ok).toBe(false);
  });

  it('names both chains and their realism in the refusal reason', () => {
    const r = checkSameRealism('solana-devnet', 'ethereum');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/testnet/i);
      expect(r.reason).toMatch(/mainnet/i);
    }
  });

  it('fails CLOSED on an unknown chain rather than waving it through', () => {
    // @ts-expect-error — off-registry chain id to prove it blocks, not opens.
    const a = checkSameRealism('dogecoin', 'sepolia');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toMatch(/unknown source chain/i);

    // @ts-expect-error — off-registry destination.
    const b = checkSameRealism('sepolia', 'litenet');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toMatch(/unknown destination chain/i);
  });
});

describe('assertSameRealism', () => {
  it('throws a GUARD_BLOCKED ChainError on a cross-realism route', () => {
    try {
      assertSameRealism('solana-devnet', 'ethereum');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ChainError);
      expect((err as ChainError).code).toBe('GUARD_BLOCKED');
    }
  });

  it('is a no-op for a same-realism route', () => {
    expect(() => assertSameRealism('solana-devnet', 'sepolia')).not.toThrow();
    expect(() => assertSameRealism('solana', 'ethereum')).not.toThrow();
  });
});
