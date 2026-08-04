/**
 * The deterministic slice of the marketplace: the trust BADGE + install WARNINGS a
 * listing shows (so users make informed decisions, per the trust-level design), and
 * rating aggregation. The store UI, developer profiles, downloads, revenue sharing,
 * licensing and subscriptions are product/infra; what belongs here is the pure
 * mapping from trust + permissions → what the user is told before they install.
 */
import { TRUST_POLICY } from './trust.js';
import { SENSITIVE_PERMISSIONS, type Permission, type TrustLevel } from './types.js';

const BADGE: Record<TrustLevel, string> = {
  official: 'Official',
  verified: 'Verified Partner',
  community: 'Community',
  experimental: 'Experimental',
};

export interface ListingSignals {
  badge: string;
  trustLevel: TrustLevel;
  warnings: string[];
}

export function listingSignals(trustLevel: TrustLevel, requestedPermissions: readonly Permission[]): ListingSignals {
  const sensitive = new Set(SENSITIVE_PERMISSIONS);
  const warnings: string[] = [];
  if (TRUST_POLICY[trustLevel].requiresWarning) {
    warnings.push(
      trustLevel === 'experimental'
        ? 'Experimental plugin — not reviewed. Install at your own risk.'
        : 'Community plugin — reviewed by the community, not by the platform.',
    );
  }
  for (const p of requestedPermissions) {
    if (sensitive.has(p)) warnings.push(`Requests sensitive permission: ${p}`);
  }
  return { badge: BADGE[trustLevel], trustLevel, warnings };
}

export interface Review {
  rating: number; // 1..5
}

export interface RatingSummary {
  count: number;
  average: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export function aggregateRating(reviews: readonly Review[]): RatingSummary {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let count = 0;
  for (const r of reviews) {
    const clamped = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
    distribution[clamped] += 1;
    sum += clamped;
    count += 1;
  }
  return { count, average: count === 0 ? 0 : Math.round((sum / count) * 10) / 10, distribution };
}
