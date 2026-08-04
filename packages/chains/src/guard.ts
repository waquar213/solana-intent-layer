/**
 * Broadcast guardrails — the deterministic safety gate that sits between a signed
 * transaction and the wire. It holds no keys and moves no funds; its only power is
 * to REFUSE. This is the doctrine's "deterministic code verifies, device signature
 * disposes" made concrete for the single most dangerous moment in the whole system:
 * a real, mainnet, irreversible transfer.
 *
 * Every rule here is pure and total — no network, no clock, no keys, no I/O — so it
 * is exhaustively testable and cannot itself become an attack surface. It fails
 * CLOSED: anything it cannot positively verify (an unknown chain, a malformed
 * recipient) is blocked, never waved through.
 */
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import { ChainError } from './errors.js';
import { getChain, type ChainId } from './registry.js';

/** Above this USD, a single MAINNET transfer needs explicit high-value confirmation. */
export const MAINNET_SPEND_CAP_USD = 1_000;

const HEX_40 = /^0x[0-9a-fA-F]{40}$/u;

/** EIP-55 mixed-case checksum encoding (kept local so `chains` needs no `core` dep). */
function toChecksumAddress(bare40Lower: string): string {
  const hashHex = bytesToHex(keccak_256(new TextEncoder().encode(bare40Lower)));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    out += parseInt(hashHex[i] as string, 16) >= 8 ? (bare40Lower[i] as string).toUpperCase() : bare40Lower[i];
  }
  return out;
}

/**
 * Validate an EVM recipient. Well-formedness is required. Checksum casing is only
 * *checked* when the address is mixed-case — an all-lowercase (or all-uppercase)
 * address carries no EIP-55 information, so it is well-formed-but-unverifiable, not
 * wrong. A MIXED-case address whose casing fails EIP-55 is almost always a
 * transcription typo and is rejected — the cheapest possible defense against sending
 * to a subtly-wrong address.
 */
export function checkEvmRecipient(address: string): { valid: boolean; reason?: string } {
  if (!HEX_40.test(address)) return { valid: false, reason: 'recipient is not a well-formed 20-byte EVM address' };
  const bare = address.slice(2);
  // The all-zero address is well-formed and carries no EIP-55 casing, so the checksum
  // gate below waves it through — but a transfer to 0x000…000 is an unrecoverable BURN
  // (no key controls it). The wallet has no burn feature, so this is always a mistake:
  // fail closed on it, consistent with rejecting a checksum typo.
  if (/^0{40}$/u.test(bare)) {
    return { valid: false, reason: 'recipient is the zero address (0x000…000) — a transfer here permanently burns the funds' };
  }
  const hasUpper = /[A-F]/u.test(bare);
  const hasLower = /[a-f]/u.test(bare);
  if (hasUpper && hasLower && toChecksumAddress(bare.toLowerCase()) !== address) {
    return { valid: false, reason: 'recipient address failed its EIP-55 checksum — likely a typo' };
  }
  return { valid: true };
}

export interface BroadcastGuardInput {
  readonly chain: ChainId;
  readonly toAddress: string;
  /** The transfer's value in whole USD, when known — enables the mainnet spend cap. */
  readonly amountUsd?: number;
  /** The user explicitly confirmed this mainnet (real-funds) broadcast. */
  readonly acknowledgeMainnet?: boolean;
  /** The user explicitly confirmed a high-value (> cap) mainnet broadcast. */
  readonly acknowledgeHighValue?: boolean;
  /**
   * The user's KNOWN-GOOD recipients (saved contacts + prior send targets). The guard
   * compares the target against these to catch ADDRESS POISONING — a lookalike that shares
   * the visible ends but differs in the middle. Empty/omitted ⇒ the check is skipped.
   */
  readonly knownAddresses?: readonly string[];
}

/**
 * Minimum prefix/suffix character overlap that counts as a poisoning "lookalike".
 *
 * Calibrated to the measured attack corpus (Tsuchiya et al., "Blockchain Address Poisoning",
 * USENIX Security '25 / arXiv:2501.16681 — 270M attacks, 17M victims, ≥$83.8M stolen): real
 * attackers grind vanity addresses matching at least the first 3 and last 4 characters, because
 * that is what wallet UIs abbreviate to. 3+4 = 7 hex characters ⇒ a coincidence is ~1 in 268
 * million, so a match is an attack, not luck.
 */
export const POISON_PREFIX_MIN = 3;
export const POISON_SUFFIX_MIN = 4;

const stripAddr = (s: string): string => s.trim().toLowerCase().replace(/^0x/u, '');

/**
 * Address-poisoning detector. An attacker grinds a vanity address whose visible ENDS match a
 * recipient the victim trusts, then seeds it into the victim's history (a dust / zero-value /
 * counterfeit-token transfer) so a later copy-from-history pays the attacker instead. Here we
 * compare the target's ends against every known-good address: same ends + different middle =
 * a lookalike. Returns the mimicked known address, or null if the target is safe (it IS a known
 * address, or resembles none). Pure — no I/O, no clock.
 */
export function detectPoisoningLookalike(
  target: string,
  known: readonly string[],
  prefix = POISON_PREFIX_MIN,
  suffix = POISON_SUFFIX_MIN,
): string | null {
  const t = stripAddr(target);
  if (t.length < prefix + suffix) return null;
  // Exactly a known-good address ⇒ this is a legitimate recipient, never a poisoning lookalike.
  if (known.some((k) => stripAddr(k) === t)) return null;
  const head = t.slice(0, prefix);
  const tail = t.slice(-suffix);
  for (const k of known) {
    const kk = stripAddr(k);
    if (kk.length < prefix + suffix) continue;
    if (kk.slice(0, prefix) === head && kk.slice(-suffix) === tail) return k; // same ends, different middle
  }
  return null;
}

/**
 * On-chain facts about a recipient, gathered from the chain itself rather than from anything the
 * user saved. This is what makes poisoning detectable on a FIRST-TIME send: the reference set is
 * the user's own transaction history, and the poison entry carries its own fingerprint.
 *
 * Every field is optional — whatever could not be fetched is simply not judged (the assessor
 * degrades to fewer signals rather than inventing them).
 */
export interface RecipientOnChainFacts {
  /** Addresses this wallet has previously sent REAL value to (its strongest counterparties). */
  readonly paidCounterparties?: readonly string[];
  /**
   * Addresses that sent this wallet REAL value (not dust). Paying someone back who paid you is
   * an ordinary flow, and attackers poison inbound relationships too — so these count as
   * legitimate references even though the wallet has never paid them.
   */
  readonly receivedFromCounterparties?: readonly string[];
  /**
   * How many DISTINCT addresses have sent the TARGET a zero-value / dust transfer. This is the
   * poisoning address's own fingerprint and needs NO prior relationship with the user: a
   * lookalike is sprayed at many victims, so it accumulates zero-value transfers from a crowd of
   * unrelated addresses. Ordinary wallets do not.
   */
  readonly targetDistinctDustSenders?: number;
  /** How many zero-value transfers the TARGET has been involved in at all. */
  readonly targetZeroValueTransfers?: number;
  /**
   * True when the target only ever appeared in the user's history as an INBOUND ZERO-VALUE or
   * sub-$10 dust sender, and never as a real outbound counterparty — the exact signature of a
   * planted poisoning entry. A zero-token transfer has no legitimate purpose, which is why this
   * is a hard block.
   */
  readonly onlySeenAsInboundDust?: boolean;
  /**
   * True when the target was only ever seen sending the user an UNVERIFIED / unpriced token.
   * That is the counterfeit-token poisoning shape, but it also describes ordinary testnet tokens
   * and airdrops — so it is surfaced as a caution, never a block.
   */
  readonly onlySeenAsUnverifiedTokenSender?: boolean;
  /** The target's transaction count (nonce). 0 ⇒ it has never sent a transaction. */
  readonly nonce?: number;
  /** The target's native balance in base units. */
  readonly balanceBase?: bigint;
  /** True when the target address holds contract code. */
  readonly isContract?: boolean;
}

/** The USD ceiling below which an inbound transfer counts as a poisoning "tiny transfer".
 *  The measured corpus uses $10 to exclude implausibly large seeding transfers. */
export const POISON_DUST_USD = 10;

/**
 * How many DISTINCT addresses must share zero-value/dust transfers with a target before it is
 * treated as a poisoning address in its own right. The measured corpus shows attackers bundling
 * "more than 100 poisoning transfers in a single transaction", so a genuine poisoner accumulates
 * a crowd of unrelated dust counterparties fast, while an ordinary recipient has few.
 *
 * Set well above the incidental-dust floor: on testnets a normal active address collects spam
 * airdrops and faucet dust from a handful of senders, so a low bar (3) hard-blocks legitimate
 * recipients. A real sprayer clears this easily; fewer than this only WARNS, never blocks.
 */
export const POISONER_DUST_SENDERS_BLOCK = 10;

/** One normalized transfer from this wallet's on-chain history — the minimum the classifier needs. */
export interface HistoryTransfer {
  /** The counterparty: who this wallet sent to, or who sent to this wallet. */
  readonly counterparty: string;
  /** True when THIS wallet was the sender. */
  readonly outbound: boolean;
  /** Amount in the asset's base units — exactly 0n for a zero-value poisoning transfer. */
  readonly valueBase: bigint;
  /** USD value when known — feeds the tiny-transfer threshold. */
  readonly valueUsd?: number;
  /** True when the asset is NOT on a verified token list (counterfeit-token poisoning). */
  readonly unverifiedToken?: boolean;
  /**
   * Caller's explicit dust verdict, for chains/assets where the fetcher can judge it better than
   * a USD threshold can (e.g. an unpriced testnet native amount below a wei floor). When true it
   * forces the transfer to be treated as dust regardless of the other fields.
   */
  readonly dust?: boolean;
}

/**
 * Turn this wallet's transaction history into the two history-derived poisoning facts, with no
 * help from the user: the addresses it has really PAID (the reference set a lookalike is measured
 * against), and whether `target` appears only as a planted inbound dust sender.
 *
 * A transfer is "poisoning-shaped" when it is one of the three measured types: zero-value
 * (`valueBase === 0n`), tiny (`valueUsd < $10`), or a counterfeit/unverified token. Pure.
 */
/** Is this transfer poisoning-shaped dust — zero-value, caller-flagged, or a priced sub-$10 amount? */
function isDustTransfer(h: HistoryTransfer): boolean {
  return h.dust === true || h.valueBase === 0n || (h.valueUsd !== undefined && h.valueUsd < POISON_DUST_USD);
}

/**
 * Is this transfer POSITIVELY known to be above the dust line? Unknown ⇒ false (fail closed).
 * Only a transfer that clears this bar may promote its sender into the known-good reference set.
 */
function provenNotDust(h: HistoryTransfer): boolean {
  if (h.valueBase === 0n || h.dust === true) return false;
  if (h.dust === false) return true; // the fetcher judged it with chain-specific knowledge
  return h.valueUsd !== undefined && h.valueUsd >= POISON_DUST_USD;
}

export function classifyHistoryForPoisoning(
  target: string,
  history: readonly HistoryTransfer[],
): Pick<
  RecipientOnChainFacts,
  'paidCounterparties' | 'receivedFromCounterparties' | 'onlySeenAsInboundDust' | 'onlySeenAsUnverifiedTokenSender'
> {
  const t = stripAddr(target);
  const paid = new Set<string>();
  const paidOriginal: string[] = [];
  const received = new Set<string>();
  const receivedOriginal: string[] = [];
  let seenAsTarget = 0;
  let dustInbound = 0; // zero-value or priced-tiny — no legitimate reason to exist
  let unverifiedInbound = 0; // unpriced/counterfeit token — also matches benign testnet tokens

  for (const h of history) {
    const c = stripAddr(h.counterparty);
    const dust = isDustTransfer(h);
    if (h.outbound && h.valueBase > 0n) {
      if (!paid.has(c)) {
        paid.add(c);
        paidOriginal.push(h.counterparty);
      }
    } else if (!h.outbound && h.valueBase > 0n && h.unverifiedToken !== true && provenNotDust(h)) {
      // A REAL inbound payment makes the sender a legitimate reference (paying someone back is
      // ordinary). This FAILS CLOSED: the sender is promoted only when the transfer is POSITIVELY
      // known to be above the dust line. An unpriced, unflagged amount stays out — otherwise an
      // attacker could mail the victim a few wei to get their own lookalike whitelisted, which
      // would silently disable the entire lookalike check.
      if (!received.has(c)) {
        received.add(c);
        receivedOriginal.push(h.counterparty);
      }
    }
    if (c !== t) continue;
    seenAsTarget++;
    if (h.outbound) continue;
    if (dust) dustInbound++;
    else if (h.unverifiedToken === true) unverifiedInbound++;
  }

  // A planted poison entry: EVERY appearance of the target was an inbound zero-value/dust
  // transfer — it has only ever paid us dust, and we have never paid it.
  const neverPaid = seenAsTarget > 0 && !paid.has(t);
  return {
    paidCounterparties: paidOriginal,
    receivedFromCounterparties: receivedOriginal,
    onlySeenAsInboundDust: neverPaid && dustInbound === seenAsTarget,
    // Weaker shape: only ever sent us an unpriced token (counterfeit OR an ordinary testnet token).
    onlySeenAsUnverifiedTokenSender: neverPaid && dustInbound + unverifiedInbound === seenAsTarget && unverifiedInbound > 0,
  };
}

/**
 * Judge a recipient from on-chain evidence alone — no saved contacts, no prior local sends.
 * Pure and total; returns hard `blocked` reasons and softer `warnings`.
 *
 * The signals, in order of strength (all calibrated to the measured corpus cited above):
 *
 *  1. **Lookalike of a real counterparty.** The user's own history is the reference set, so a
 *     grafted address is caught the very first time it is pasted. BLOCK.
 *  2. **Planted-dust fingerprint.** Attackers must seed the lookalike into the victim's history
 *     via a tiny (<$10), zero-value, or counterfeit-token inbound transfer. An address the user
 *     has only ever *received* such a transfer from — never paid — is the poison entry. BLOCK.
 *  3. **Passive-recipient profile.** The paper's measurement: lookalike addresses "typically
 *     never send real value; they function as passive recipients". A never-used address (nonce 0,
 *     empty, no code) is therefore consistent with a grind — but a fresh legitimate wallet looks
 *     identical, so this is a WARNING, never a block.
 */
export function assessRecipientOnChain(target: string, facts: RecipientOnChainFacts): GuardDecision {
  const blocked: string[] = [];
  const warnings: string[] = [];

  // 1a. Lookalike of an address the wallet has PAID — the strongest reference.
  const mimickedPaid = facts.paidCounterparties?.length ? detectPoisoningLookalike(target, facts.paidCounterparties) : null;
  // 1b. Lookalike of an address that PAID the wallet. Paying someone back is an ordinary flow and
  //     attackers poison inbound relationships too, so these are references as well.
  const mimickedInbound =
    !mimickedPaid && facts.receivedFromCounterparties?.length
      ? detectPoisoningLookalike(target, facts.receivedFromCounterparties)
      : null;
  const mimicked = mimickedPaid ?? mimickedInbound;
  if (mimicked) {
    blocked.push(
      `On-chain check: this address mimics the first & last characters of ${shortAddr(mimicked)} — an address you have ${mimickedPaid ? 'ALREADY PAID' : 'REALLY TRANSACTED WITH'} — but differs in the middle. That is the signature of an ADDRESS-POISONING attack. Verify the full address character by character.`,
    );
  }

  // 2. The TARGET's own poisoner fingerprint — needs NO relationship with this wallet. A lookalike
  //    is sprayed at many victims, so it collects zero-value/dust transfers from a crowd of
  //    unrelated addresses. A normal wallet essentially never does.
  const dustSenders = facts.targetDistinctDustSenders ?? 0;
  if (dustSenders >= POISONER_DUST_SENDERS_BLOCK) {
    blocked.push(
      `On-chain check: this address has been involved in zero-value / dust transfers with ${dustSenders} different addresses. That is how a poisoning address behaves — it is sprayed at many victims at once. A normal recipient does not look like this.`,
    );
  } else if (dustSenders > 0 && blocked.length === 0) {
    warnings.push(
      `This address has zero-value / dust transfers involving ${dustSenders} other address${dustSenders === 1 ? '' : 'es'} — a pattern associated with poisoning. Confirm the full address out-of-band.`,
    );
  }

  if (facts.onlySeenAsInboundDust) {
    blocked.push(
      'On-chain check: the only time this address ever appeared in your history was a zero-value / dust transfer it sent TO you — never a payment you made. That is exactly how a poisoning address is planted into a wallet history. Do not pay it from history.',
    );
  } else if (facts.onlySeenAsUnverifiedTokenSender) {
    // Counterfeit-token poisoning has this shape — but so do ordinary testnet tokens and
    // airdrops, so this informs rather than blocks.
    warnings.push(
      'This address only ever sent you an unpriced/unverified token and you have never paid it. That is one poisoning pattern (counterfeit-token seeding), though ordinary airdrops look the same — confirm the full address before paying it.',
    );
  }

  // Only worth saying when nothing stronger already fired, and only for a plain (non-contract) address.
  if (blocked.length === 0 && facts.nonce === 0 && facts.isContract === false) {
    const empty = facts.balanceBase === undefined || facts.balanceBase === 0n;
    warnings.push(
      empty
        ? 'This address has never sent a transaction and holds no balance. Poisoning addresses are passive by design, so confirm the full address out-of-band before sending.'
        : 'This address has never sent a transaction. Confirm the full address out-of-band before sending.',
    );
  }

  return { ok: blocked.length === 0, blocked, warnings };
}

/** Short 0xABCD…WXYZ form for guard messages (does not alter case-sensitive comparisons). */
function shortAddr(a: string): string {
  const s = a.trim();
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

export interface GuardDecision {
  readonly ok: boolean;
  /** Hard blocks — the broadcast MUST NOT proceed while any is present. */
  readonly blocked: readonly string[];
  /** Non-fatal cautions worth surfacing to the user (e.g. "this is irreversible"). */
  readonly warnings: readonly string[];
}

/**
 * Decide whether a broadcast may proceed. Pure: given the same input it always
 * returns the same decision. The rules, in order:
 *
 *  1. The chain must be known (fail closed on anything else).
 *  2. An EVM recipient must be well-formed and, if mixed-case, EIP-55-valid.
 *  3. A MAINNET broadcast requires an explicit `acknowledgeMainnet` — testnets are
 *     free. Above the spend cap it additionally requires `acknowledgeHighValue`.
 *     Every mainnet send carries an "irreversible" warning even once acknowledged.
 */
export function guardBroadcast(input: BroadcastGuardInput): GuardDecision {
  const blocked: string[] = [];
  const warnings: string[] = [];

  let chain;
  try {
    chain = getChain(input.chain);
  } catch {
    return { ok: false, blocked: [`unknown chain "${input.chain}" — refusing to broadcast`], warnings };
  }

  if (chain.ecosystem === 'evm') {
    const recipient = checkEvmRecipient(input.toAddress.trim());
    if (!recipient.valid && recipient.reason) blocked.push(recipient.reason);
  } else if (input.toAddress.trim().length === 0) {
    // Non-EVM addresses are validated for real by their ecosystem's builder (base58 /
    // bech32 decode); here we only reject an empty recipient early and clearly.
    blocked.push('recipient address is empty');
  }

  // Address poisoning: a target that mimics a trusted recipient's visible ends but differs in
  // the middle is almost certainly an attacker's grafted lookalike — block it (all chains).
  if (input.knownAddresses && input.knownAddresses.length > 0) {
    const mimicked = detectPoisoningLookalike(input.toAddress, input.knownAddresses);
    if (mimicked) {
      blocked.push(
        `This address mimics the first & last characters of one you trust (${shortAddr(mimicked)}) but differs in the middle — the signature of an ADDRESS-POISONING attack. Verify the FULL address, character by character, before sending.`,
      );
    }
  }

  if (!chain.testnet) {
    if (!input.acknowledgeMainnet) {
      blocked.push(`MAINNET broadcast on ${chain.name} moves REAL funds — explicit confirmation required`);
    }
    // Fail CLOSED: a mainnet transfer whose USD value is missing OR not a finite,
    // non-negative number — undefined, NaN, ±Infinity, or negative (e.g. a tampered/
    // MITM'd plan response, or `Number()` of a bad/absent field) — is treated as OVER
    // the cap, so the high-value gate can never be silently skipped by dropping OR
    // corrupting the amount. Only a real, finite, non-negative price may prove a
    // transfer is UNDER the cap. (M5 + NaN/negative bypass.)
    const priced = typeof input.amountUsd === 'number' && Number.isFinite(input.amountUsd) && input.amountUsd >= 0;
    const overCap = !priced || (input.amountUsd as number) > MAINNET_SPEND_CAP_USD;
    if (overCap && !input.acknowledgeHighValue) {
      blocked.push(
        !priced
          ? `Unpriced or invalid MAINNET transfer value — treated as over the $${MAINNET_SPEND_CAP_USD.toLocaleString('en-US')} cap; high-value confirmation required`
          : `$${(input.amountUsd as number).toLocaleString('en-US')} exceeds the $${MAINNET_SPEND_CAP_USD.toLocaleString('en-US')} mainnet spend cap — high-value confirmation required`,
      );
    }
    warnings.push(`This is a live ${chain.name} transaction and cannot be undone.`);
  }

  return { ok: blocked.length === 0, blocked, warnings };
}

/**
 * The imperative form used at the broadcast call site: run the guard and THROW a
 * `ChainError('GUARD_BLOCKED')` if anything blocks. Callers that need the warnings
 * (e.g. to render a confirmation dialog) should use `guardBroadcast` directly.
 */
export function assertBroadcastAllowed(input: BroadcastGuardInput): void {
  const decision = guardBroadcast(input);
  if (!decision.ok) {
    throw new ChainError('GUARD_BLOCKED', decision.blocked.join('; '));
  }
}

/**
 * Cross-chain realism guard — the bridge half of the fail-closed doctrine.
 *
 * A bridge must never cross REALISM: both legs testnet, or both mainnet. A route with
 * a testnet asset on one side (free faucet value) and a mainnet asset on the other
 * (real value) is not a bridge — it either MINTS real value from valueless test funds
 * (deposit free devnet SOL, withdraw real ETH and the operator liquidity is drained
 * instantly) or STRANDS real value against test funds. Neither can be positively
 * verified as a fair move, so both are refused. `getChain` throws on an unknown chain
 * and is caught here as blocked — fail closed, never waved through.
 */
export function checkSameRealism(from: ChainId, to: ChainId): { ok: true } | { ok: false; reason: string } {
  let f, t;
  try {
    f = getChain(from);
  } catch {
    return { ok: false, reason: `unknown source chain "${from}" — refusing to bridge` };
  }
  try {
    t = getChain(to);
  } catch {
    return { ok: false, reason: `unknown destination chain "${to}" — refusing to bridge` };
  }
  if (f.testnet !== t.testnet) {
    const realism = (isTestnet: boolean): string => (isTestnet ? 'testnet' : 'mainnet');
    return {
      ok: false,
      reason:
        `cross-realism bridge refused: ${f.name} is ${realism(f.testnet)} but ${t.name} is ${realism(t.testnet)} — ` +
        `a testnet↔mainnet route would move real value against valueless test funds. Bridge testnet↔testnet or mainnet↔mainnet.`,
    };
  }
  return { ok: true };
}

/**
 * Imperative form for the deposit call site: THROW `ChainError('GUARD_BLOCKED')` when the
 * two legs are not the same realism. Defense-in-depth beneath the UI's deliverability
 * check — a mixed-realism deposit can never be signed even if a caller forgets to ask.
 */
export function assertSameRealism(from: ChainId, to: ChainId): void {
  const decision = checkSameRealism(from, to);
  if (!decision.ok) {
    throw new ChainError('GUARD_BLOCKED', decision.reason);
  }
}
