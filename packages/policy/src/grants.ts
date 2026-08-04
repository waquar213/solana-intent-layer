/**
 * Agent spend-grants — the portable authorization primitive for autonomous
 * agents. A grant is a bounded, revocable permission a human approves ONCE:
 * "this agent may spend up to N of asset X, only to these recipients, until
 * time T." The agent carries the grant; it never holds the user's key. This is
 * the authorization layer intents give autonomous agents — a permission, not a
 * wallet.
 *
 * `evaluateSpendGrant` is the pure, fail-closed gate that decides whether a
 * single proposed spend falls inside an active grant: cap, allowlist, expiry,
 * per-tx ceiling and the running cumulative total — all in integer base units.
 * Deterministic over an injected `nowMs`; it holds no keys, never signs, and
 * never throws. Anything it cannot positively authorize is denied.
 */

export interface SpendGrant {
  /** Stable handle of the grant (the signed capability's id). */
  id: string;
  /** The single asset this grant authorizes (symbol or address; matched case-insensitively). */
  asset: string;
  /** Cumulative ceiling across the whole grant, in base units. */
  maxTotalBase: bigint;
  /** Optional per-transaction ceiling, in base units. */
  maxPerTxBase?: bigint;
  /** Recipients/spenders the agent may pay (matched case-insensitively). Empty ⇒ nobody. */
  allowlist: readonly string[];
  /** Expiry, unix ms. At or after this instant the grant is dead. */
  notAfterMs: number;
  /** Hard kill-switch — a revoked grant authorizes nothing, whatever else is true. */
  revoked?: boolean;
}

export interface SpendRequest {
  asset: string;
  /** Amount of this spend, base units. */
  amountBase: bigint;
  /** Recipient / spender of this spend. */
  to: string;
  /** Current time, unix ms — injected, never read from a clock in the core. */
  nowMs: number;
}

export type SpendGrantDenial =
  | 'MALFORMED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'WRONG_ASSET'
  | 'RECIPIENT_NOT_ALLOWLISTED'
  | 'OVER_PER_TX_CAP'
  | 'OVER_TOTAL_CAP';

export type SpendGrantVerdict =
  | { ok: true; remainingBase: bigint }
  | { ok: false; code: SpendGrantDenial; reason: string };

const deny = (code: SpendGrantDenial, reason: string): SpendGrantVerdict => ({ ok: false, code, reason });

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Decide whether `req` is authorized under `grant`, given how much has already
 * been `spentBase` under it. Fail-closed and total: every path returns a verdict.
 */
export function evaluateSpendGrant(grant: SpendGrant, spentBase: bigint, req: SpendRequest): SpendGrantVerdict {
  // Fail closed on nonsense inputs — a grant that can't be positively validated authorizes nothing.
  if (req.amountBase <= 0n || spentBase < 0n || grant.maxTotalBase < 0n) {
    return deny('MALFORMED', 'Grant or request carries a non-positive amount.');
  }
  if (grant.revoked === true) return deny('REVOKED', `Grant ${grant.id} has been revoked.`);
  if (req.nowMs >= grant.notAfterMs) return deny('EXPIRED', `Grant ${grant.id} has expired.`);
  if (norm(req.asset) !== norm(grant.asset)) {
    return deny('WRONG_ASSET', `Grant authorizes ${grant.asset}, not ${req.asset}.`);
  }
  const to = norm(req.to);
  if (!grant.allowlist.some((a) => norm(a) === to)) {
    return deny('RECIPIENT_NOT_ALLOWLISTED', `${req.to} is not on the grant's allowlist.`);
  }
  if (grant.maxPerTxBase !== undefined && req.amountBase > grant.maxPerTxBase) {
    return deny('OVER_PER_TX_CAP', 'Amount exceeds the grant per-transaction cap.');
  }
  const after = spentBase + req.amountBase;
  if (after > grant.maxTotalBase) {
    return deny('OVER_TOTAL_CAP', "Spend would exceed the grant's total cap.");
  }
  return { ok: true, remainingBase: grant.maxTotalBase - after };
}
