/**
 * Priority load shedding — the mechanism behind "degrade, never brick". When the
 * system is saturated, admitting every request equally means everyone gets a slow,
 * failing experience; instead we shed from the BOTTOM of the priority ladder (bulk
 * analytics, then low, then normal…) so the capacity that remains serves the
 * requests that matter. `critical` (an in-flight settlement, a security action) is
 * never shed by load alone — those must complete or fail safe, not be dropped.
 *
 * A pure function of (load, priority, policy). Monotone by construction: raising
 * the load can only shed MORE classes, never fewer — even if the thresholds are
 * mis-ordered — so behaviour is predictable under a brown-out.
 */
import { PRIORITY_RANK, type AdmissionDecision, type Priority } from './types.js';

/** Non-critical classes, cheapest to most valuable — the order we shed in. */
const SHEDDABLE: readonly Exclude<Priority, 'critical'>[] = ['bulk', 'low', 'normal', 'high'];

export interface SheddingPolicy {
  /** Load (0..1) at or above which each class starts being shed. */
  shedThresholds: Record<Exclude<Priority, 'critical'>, number>;
}

export const DEFAULT_SHEDDING_POLICY: SheddingPolicy = {
  shedThresholds: { bulk: 0.7, low: 0.8, normal: 0.9, high: 0.97 },
};

/**
 * The lowest priority still admitted at this load. Everything strictly cheaper is
 * shed. Returns 'critical' when only critical survives. Computed with a running
 * max threshold so a mis-ordered policy still sheds monotonically bottom-up.
 */
export function sheddingFloor(load: number, policy: SheddingPolicy = DEFAULT_SHEDDING_POLICY): Priority {
  const l = Number.isFinite(load) ? load : 1; // an unknown load is treated as saturated (fail safe)
  let effective = -Infinity;
  for (const cls of SHEDDABLE) {
    effective = Math.max(effective, policy.shedThresholds[cls]);
    if (l < effective) return cls; // cheapest class NOT shed → the floor
  }
  return 'critical';
}

export function admissionDecision(
  load: number,
  priority: Priority,
  policy: SheddingPolicy = DEFAULT_SHEDDING_POLICY,
): AdmissionDecision {
  const floor = sheddingFloor(load, policy);
  const admit = PRIORITY_RANK[priority] <= PRIORITY_RANK[floor];
  const sheddingBelow = floor === 'bulk' ? null : floor;
  return {
    admit,
    sheddingBelow,
    reason: admit
      ? sheddingBelow === null
        ? 'admitting all priorities'
        : `admitted (>= ${floor}); shedding below ${floor}`
      : `shed: ${priority} is below the admission floor ${floor} at load ${l2(load)}`,
  };
}

const l2 = (x: number): number => Math.round(x * 100) / 100;
