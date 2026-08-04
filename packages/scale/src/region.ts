/**
 * Multi-region routing & failover. Two modes, one rule: never send traffic to an
 * unhealthy region, and never silently pretend a dead region is alive.
 *
 *  - active_active  → split traffic across all healthy regions by capacity weight
 *                     (optionally biased away from a saturated one), with a
 *                     deterministic failover order for single-request routing.
 *  - active_passive → route to the highest-priority healthy region; if the
 *                     requested/primary region is down, fail over to the next
 *                     healthy standby and flag it.
 *
 * When EVERY region is unhealthy the decision is an explicit `primary: null`
 * (reason: no healthy region) — the caller must fail safe, not fall back onto a
 * region we know is down. Pure and shuffle-invariant: the input order of regions
 * never changes the outcome (all ordering is by weight/priority then region id).
 */
import type { RegionHealth, RegionMode, RoutingDecision } from './types.js';

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** effective active-active weight: capacity discounted by current saturation. */
function effectiveWeight(r: RegionHealth): number {
  const sat = r.saturation ?? 0;
  return Math.max(0, r.weight) * (1 - Math.min(1, Math.max(0, sat)));
}

export function route(regions: RegionHealth[], mode: RegionMode, requestedRegion?: string): RoutingDecision {
  const healthy = regions.filter((r) => r.healthy && r.weight > 0);

  if (healthy.length === 0) {
    return { mode, primary: null, failover: [], weights: {}, failedOver: false, reason: 'no healthy region available' };
  }

  if (mode === 'active_active') {
    // Order for single-request routing / failover: highest effective weight, then id.
    const ordered = [...healthy].sort((a, b) => effectiveWeight(b) - effectiveWeight(a) || byId(a.region, b.region));
    const totalEff = ordered.reduce((s, r) => s + effectiveWeight(r), 0);
    const weights: Record<string, number> = {};
    if (totalEff > 0) {
      for (const r of ordered) weights[r.region] = effectiveWeight(r) / totalEff;
    } else {
      // All saturated to 0 effective weight but still "healthy" → spread evenly rather than drop.
      for (const r of ordered) weights[r.region] = 1 / ordered.length;
    }
    const naturalPrimary = ordered[0]?.region ?? null;
    // Honour the requested region only if it will actually receive traffic (> 0 weight):
    // a healthy-but-fully-saturated region has 0 effective weight and must NOT be named
    // the serving primary, and NOT be reported as a clean (failedOver:false) route.
    const usedRequested = requestedRegion !== undefined && (weights[requestedRegion] ?? 0) > 0;
    const primary = usedRequested ? requestedRegion : naturalPrimary;
    // The failover chain is every OTHER region by preference — never the chosen primary
    // itself (that would fail straight back onto the region that just failed).
    const failover = ordered.map((r) => r.region).filter((r) => r !== primary);
    return {
      mode,
      primary,
      failover,
      weights,
      failedOver: requestedRegion !== undefined && !usedRequested,
      reason: `active-active across ${ordered.length} region(s)`,
    };
  }

  // active_passive: highest priority (lowest number) healthy region wins.
  const ordered = [...healthy].sort((a, b) => a.priority - b.priority || byId(a.region, b.region));
  const primary = ordered[0]; // guaranteed by healthy.length > 0
  const failover = ordered.slice(1).map((r) => r.region);

  if (requestedRegion !== undefined) {
    const req = ordered.find((r) => r.region === requestedRegion);
    if (req) {
      return {
        mode,
        primary: req.region,
        failover: ordered.filter((r) => r.region !== req.region).map((r) => r.region),
        weights: {},
        failedOver: false,
        reason: `routed to requested region ${req.region}`,
      };
    }
    // Requested region is unhealthy/unknown → fail over to the best standby.
    return {
      mode,
      primary: primary?.region ?? null,
      failover,
      weights: {},
      failedOver: true,
      reason: `requested region ${requestedRegion} unavailable — failed over to ${primary?.region}`,
    };
  }

  return {
    mode,
    primary: primary?.region ?? null,
    failover,
    weights: {},
    failedOver: false,
    reason: `active-passive primary ${primary?.region}`,
  };
}
