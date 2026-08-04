/**
 * Gas sponsorship (paymaster) — decide whether the platform pays a user's gas. The
 * whole design is BOUNDED so a bug (or an attacker spamming cheap actions) can never
 * drain the sponsor: a per-transaction cap AND a per-user-per-UTC-day cap. It fails
 * toward `user_pays` — the safe direction, since the user can always pay their own
 * gas; it never fails toward over-sponsoring. Deterministic given `nowIso`.
 */
import { dayKey } from './env.js';
import type { SponsorshipDecision, SponsorshipPolicy, SponsorshipRequest, SponsorshipState } from './types.js';

export function emptySponsorshipState(): SponsorshipState {
  return { day: '', spentByUser: {} };
}

export function decideSponsorship(
  req: SponsorshipRequest,
  policy: SponsorshipPolicy,
  state: SponsorshipState,
  nowIso: string,
): SponsorshipDecision {
  const userPays = (reason: string): SponsorshipDecision => ({ verdict: 'user_pays', sponsoredMicros: 0n, reason });

  if (!policy.enabled) return userPays('sponsorship disabled');
  if (req.gasCostMicros <= 0n) return userPays('no gas to sponsor');
  if (policy.eligibleActions && policy.eligibleActions.length > 0 && !policy.eligibleActions.includes(req.action)) {
    return userPays(`action '${req.action}' is not eligible for sponsorship`);
  }
  if (req.gasCostMicros > policy.perTxCapMicros) {
    return userPays(`gas cost exceeds the per-transaction sponsorship cap`);
  }
  // Spend counts only within the current UTC day; a rolled day resets to 0.
  const spentToday = state.day === dayKey(nowIso) ? (state.spentByUser[req.userId] ?? 0n) : 0n;
  if (spentToday + req.gasCostMicros > policy.dailyCapMicros) {
    return userPays('daily sponsorship budget exhausted for this user');
  }
  return { verdict: 'sponsor', sponsoredMicros: req.gasCostMicros, reason: 'within sponsorship budget' };
}

/** Apply a granted sponsorship to the per-user daily state (rolling the day if needed). */
export function recordSponsorship(state: SponsorshipState, req: SponsorshipRequest, nowIso: string): SponsorshipState {
  const day = dayKey(nowIso);
  const spent = state.day === day ? state.spentByUser : {};
  const prior = spent[req.userId] ?? 0n;
  return { day, spentByUser: { ...spent, [req.userId]: prior + req.gasCostMicros } };
}
