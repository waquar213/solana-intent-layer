/**
 * Heuristic detectors — pure functions, each returning a `RiskSignal` when it
 * finds a concern (or null). These are the on-chain-behavior heuristics that
 * catch scams the intel feeds don't list yet: honeypots, unlimited approvals,
 * fresh/illiquid tokens, concentrated ownership, admin/upgrade privileges, and
 * address poisoning. Each is independently testable.
 */
import type { AddressSubject, ApprovalSubject, RiskSignal, TokenSubject } from './types.js';

/** Approvals at/above 2^255 base units are effectively unlimited — a top drain vector. */
const UNLIMITED_THRESHOLD = 2n ** 255n;

export function detectUnlimitedApproval(subject: ApprovalSubject): RiskSignal | null {
  if (subject.amount >= UNLIMITED_THRESHOLD) {
    return {
      code: 'UNLIMITED_APPROVAL',
      category: 'approval',
      severity: 0.7,
      reason: `Unlimited ${subject.token} allowance to ${short(subject.spender)} — a compromised spender could drain it all.`,
    };
  }
  return null;
}

export function detectFreshToken(subject: TokenSubject): RiskSignal | null {
  const age = subject.meta?.ageDays;
  if (age === undefined) return null;
  if (age < 1)
    return { code: 'BRAND_NEW_TOKEN', category: 'token', severity: 0.6, reason: 'Token created less than a day ago.' };
  if (age < 7)
    return {
      code: 'FRESH_TOKEN',
      category: 'token',
      severity: 0.45,
      reason: `Token created ${Math.floor(age)} day(s) ago.`,
    };
  return null;
}

export function detectLowLiquidity(subject: TokenSubject): RiskSignal | null {
  const liq = subject.meta?.liquidityUsd;
  if (liq === undefined) return null;
  if (liq < 10_000)
    return {
      code: 'VERY_LOW_LIQUIDITY',
      category: 'liquidity',
      severity: 0.55,
      reason: 'Very low liquidity — high price impact and exit risk.',
    };
  if (liq < 50_000) return { code: 'LOW_LIQUIDITY', category: 'liquidity', severity: 0.35, reason: 'Low liquidity.' };
  return null;
}

/** A high transfer/sell tax is the classic honeypot signature → hard block. */
export function detectHoneypot(subject: TokenSubject): RiskSignal | null {
  const tax = subject.meta?.feeOnTransferBps;
  if (tax !== undefined && tax >= 2000) {
    return {
      code: 'HONEYPOT',
      category: 'token',
      severity: 0.99,
      reason: `Sell/transfer tax of ${(tax / 100).toFixed(1)}% — likely a honeypot.`,
    };
  }
  return null;
}

export function detectOwnershipConcentration(subject: TokenSubject): RiskSignal | null {
  const conc = subject.meta?.ownershipConcentrationBps;
  if (conc !== undefined && conc > 5000) {
    return {
      code: 'OWNERSHIP_CONCENTRATION',
      category: 'token',
      severity: 0.5,
      reason: `One holder controls ${(conc / 100).toFixed(0)}% of supply — rug risk.`,
    };
  }
  return null;
}

export function detectAdminPrivileges(subject: TokenSubject): RiskSignal | null {
  const admin = subject.meta?.hasAdminKey;
  const upgradeable = subject.meta?.upgradeable;
  if (admin || upgradeable) {
    return {
      code: 'ADMIN_PRIVILEGES',
      category: 'contract',
      severity: 0.3,
      reason:
        upgradeable && admin
          ? 'Contract is upgradeable and has an admin key.'
          : upgradeable
            ? 'Contract is upgradeable.'
            : 'Contract has an admin key.',
    };
  }
  return null;
}

export function detectUnaudited(subject: TokenSubject): RiskSignal | null {
  if (subject.meta?.audited === false) {
    return { code: 'UNAUDITED', category: 'contract', severity: 0.2, reason: 'Contract has no known audit.' };
  }
  return null;
}

/**
 * Address poisoning: an attacker seeds your history with an address that shares
 * your real counterparty's prefix and suffix but differs in the middle, hoping
 * you copy the wrong one. Flag any target that lookalikes a known-good address.
 */
export function detectAddressPoisoning(subject: AddressSubject): RiskSignal | null {
  const target = subject.address.toLowerCase();
  for (const known of subject.knownAddresses ?? []) {
    const k = known.toLowerCase();
    if (k === target) return null; // exact match is the real, saved address
    if (isLookalike(target, k)) {
      return {
        code: 'ADDRESS_POISONING',
        category: 'address',
        severity: 0.85,
        reason: `This address looks like ${short(known)} but is not it — possible address poisoning.`,
      };
    }
  }
  return null;
}

/**
 * Burn / null addresses are one-way holes: anything sent to them is
 * unrecoverable — no key exists that could ever move it back. The zero address
 * is the classic fat-finger sink; 0x…dEaD is the canonical burn. Flag them so an
 * irreversible loss can never happen without an explicit, informed confirmation.
 */
const BURN_ADDRESSES = new Set(['0x000000000000000000000000000000000000dead']);

export function detectBurnAddress(subject: AddressSubject): RiskSignal | null {
  const target = subject.address.trim().toLowerCase();
  if (isNullAddress(target) || BURN_ADDRESSES.has(target)) {
    return {
      code: 'BURN_ADDRESS',
      category: 'address',
      severity: 0.9,
      reason: `${short(subject.address)} is a burn address — funds sent here are permanently unrecoverable.`,
    };
  }
  return null;
}

/** `0x` followed by only zeros — the null address, matched at any length so a truncated one still fails closed. */
function isNullAddress(a: string): boolean {
  return /^0x0+$/u.test(a);
}

/** Same length, same first 6 + last 4 chars, but different overall — the poisoning pattern. */
function isLookalike(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  const head = 6;
  const tail = 4;
  if (a.length <= head + tail) return false;
  return a.slice(0, head) === b.slice(0, head) && a.slice(-tail) === b.slice(-tail);
}

function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
