/**
 * Consent evaluation — pure. A required consent is satisfied only if it was
 * granted AND (if the profile sets an expiry) not yet expired; a granted-but-lapsed
 * consent counts as MISSING, so re-consent is demanded rather than silently assumed.
 * Consents not marked `required` are ignored here (they're preferences, not gates).
 */
import type { ConsentRequirement, GrantedConsent } from './types.js';

export interface ConsentEvaluation {
  satisfied: boolean;
  missing: string[];
  expired: string[];
}

const DAY_MS = 86_400_000;

export function evaluateConsents(
  required: readonly ConsentRequirement[],
  granted: readonly GrantedConsent[],
  nowIso: string,
): ConsentEvaluation {
  const grantedByKey = new Map(granted.map((g) => [g.key, g]));
  const nowMs = Date.parse(nowIso);
  const missing: string[] = [];
  const expired: string[] = [];

  for (const req of required) {
    if (!req.required) continue;
    const g = grantedByKey.get(req.key);
    if (!g) {
      missing.push(req.key);
      continue;
    }
    if (req.expiresDays !== undefined) {
      const grantedMs = Date.parse(g.grantedAtIso);
      // A non-parseable or future-dated grant is treated as invalid → re-consent.
      if (!Number.isFinite(grantedMs) || nowMs - grantedMs >= req.expiresDays * DAY_MS) {
        expired.push(req.key);
        missing.push(req.key);
      }
    }
  }

  return { satisfied: missing.length === 0, missing, expired };
}
