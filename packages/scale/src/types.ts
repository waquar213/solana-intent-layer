/**
 * Shared vocabulary for the scale & resilience engine. Money is not modelled here
 * (this layer moves requests and replicas, not funds); everything is counts,
 * ratios in [0,1], and millisecond durations.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Autoscaling
// ─────────────────────────────────────────────────────────────────────────────

/** The signals a service can scale on. Each is a demand dimension. */
export type ScaleSignalKind =
  | 'cpu' // CPU utilization, 0..1
  | 'memory' // memory utilization, 0..1
  | 'queue' // pending work items (absolute count)
  | 'latency' // p95 latency, ms
  | 'rps' // request rate, req/s (absolute)
  | 'inflight' // concurrent in-flight requests (absolute)
  | 'chain_congestion'; // blockchain mempool pressure, 0..1

/**
 * One observed metric plus the per-replica target the autoscaler steers toward.
 * `value` and `target` must be in the SAME unit:
 *  - utilization signals (cpu/memory/chain_congestion): both a ratio in [0,1]
 *    (e.g. observed 0.85 cpu, target 0.6).
 *  - throughput/backlog signals (queue/rps/inflight): both a per-replica count
 *    (e.g. observed 4000 queued total → pass `perReplicaValue`, target 200/replica).
 *  - latency: observed p95 ms vs the p95 budget ms.
 */
export interface ScaleSignal {
  kind: ScaleSignalKind;
  /**
   * The observed value already normalized to a *per-replica* basis for the
   * throughput/backlog kinds, or the raw ratio/latency for the others.
   */
  value: number;
  /** The per-replica set point the autoscaler drives `value` toward. Must be > 0. */
  target: number;
  /**
   * Weight of this signal's opinion when the desired counts are combined. The
   * autoscaler takes the MAX desired across signals (scale to the most-stressed
   * dimension); weight only tie-breaks / dampens. Default 1.
   */
  weight?: number;
}

export interface ScalingPolicy {
  /** Never fewer than this many replicas (>= 1 for a service that must stay up). */
  minReplicas: number;
  /** Never more than this many replicas — the hard ceiling on cost / blast radius. */
  maxReplicas: number;
  /** Max fractional increase per scale-up decision (0.5 = +50%). Also honours +1 minimum. */
  maxScaleUpRatio: number;
  /** Max fractional decrease per scale-down decision (0.25 = −25%). Down is deliberately slower than up. */
  maxScaleDownRatio: number;
  /** Don't scale DOWN within this many ms of the last scale-UP (anti-flap). */
  scaleDownStabilizationMs: number;
  /** Minimum ms between any two scaling actions on a service (cooldown). */
  cooldownMs: number;
  /** Tolerance band: ignore desired/current ratios within ±this of 1.0 (default 0.1). */
  tolerance: number;
}

export type ScaleDirection = 'up' | 'down' | 'hold';

export interface ScalingDecision {
  service: string;
  currentReplicas: number;
  desiredReplicas: number;
  direction: ScaleDirection;
  /** True when a bound (min/max/step/cooldown/stabilization) constrained the raw desire. */
  bounded: boolean;
  reason: string;
  /** The unclamped desired count the signals asked for, for observability. */
  rawDesired: number;
}

/** Per-service scaling memory the controller threads across ticks (anti-flap needs history). */
export interface ScalingState {
  /** epoch ms of the last scale action per service. */
  lastActionMs: Record<string, number>;
  /** epoch ms of the last scale-UP per service (drives the down-stabilization window). */
  lastScaleUpMs: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Load shedding / graceful degradation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request priority classes, most-important first. Under load we shed from the
 * bottom up; `critical` (in-flight settlement, security actions) is protected
 * until the system is effectively down.
 */
export type Priority = 'critical' | 'high' | 'normal' | 'low' | 'bulk';

export const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  bulk: 4,
};

export interface AdmissionDecision {
  admit: boolean;
  /** The lowest priority still being admitted at this load level. */
  sheddingBelow: Priority | null;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-region routing
// ─────────────────────────────────────────────────────────────────────────────

export type RegionMode = 'active_active' | 'active_passive';

export interface RegionHealth {
  region: string;
  healthy: boolean;
  /** Relative capacity weight for active-active spread (must be > 0 to receive traffic). */
  weight: number;
  /** Lower = higher priority as an active-passive primary/standby. */
  priority: number;
  /** Optional: current utilization 0..1, used to bias away from a hot region. */
  saturation?: number;
}

export interface RoutingDecision {
  mode: RegionMode;
  /** The region chosen for a single request (active-passive), or the primary (active-active). */
  primary: string | null;
  /** Ordered failover chain after `primary`. */
  failover: string[];
  /** Active-active: normalized traffic split by region id (sums to ~1). Empty for active-passive. */
  weights: Record<string, number>;
  /** True when the requested region was unhealthy and we failed over. */
  failedOver: boolean;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache invalidation
// ─────────────────────────────────────────────────────────────────────────────

export type CacheTier = 'edge' | 'api' | 'service' | 'origin';

/**
 * A cache namespace (a family of keys) with its tier and freshness contract.
 * `dependsOn` names namespaces whose invalidation must cascade INTO this one
 * (e.g. a `portfolio` view depends on `balance` and `price`).
 */
export interface CacheNamespace {
  name: string;
  tier: CacheTier;
  ttlSeconds: number;
  /** May a stale entry be served while it is revalidated in the background? */
  staleWhileRevalidate: boolean;
  /** Namespaces that invalidate THIS one when they change. */
  dependsOn: readonly string[];
}

export interface MutationEvent {
  /** The namespace directly changed by a write (e.g. 'balance'). */
  namespace: string;
  /** Optional key/entity scope (e.g. an address) for targeted invalidation. */
  scope?: string;
}

export interface InvalidationTarget {
  namespace: string;
  tier: CacheTier;
  scope: string | null;
  /** Why this namespace is in the plan: 'direct' write, or a 'cascade' via dependency. */
  cause: 'direct' | 'cascade';
}

export interface InvalidationPlan {
  event: MutationEvent;
  targets: InvalidationTarget[];
}
