/**
 * @intent-wallet/scale — the Global Scale & Resilience engine. The deterministic
 * decision core that lets the platform grow from 1k to 100M+ users without a
 * redesign:
 *
 *   • autoscaler   — multi-signal demand → BOUNDED desired replicas (clamp + rate-
 *                    limited step + anti-flap stabilization + cooldown).
 *   • ratelimit    — token-bucket rate limiter (burst ≤ capacity, exact refill).
 *   • bulkhead     — concurrency isolation + bounded queue → backpressure on full.
 *   • breaker      — generic circuit breaker (closed/open/half-open, injected clock).
 *   • retry        — exponential backoff + jitter + retryable/terminal + deadlines.
 *   • shed         — priority load shedding (degrade, never brick; critical protected).
 *   • region       — active-active weighted / active-passive failover routing.
 *   • cache        — dependency-cascade invalidation planning (cycle-safe).
 *
 * Doctrine: it DECIDES; injected actuators ACT. The engine never scales, drops,
 * reroutes, or evicts anything itself — every decision is bounded, so a bug can
 * propose a bad action but can't cause a scale-storm or a brown-out. Deterministic
 * (time injected) and offline-testable. Standalone (no internal deps).
 */

// Types
export type {
  ScaleSignalKind,
  ScaleSignal,
  ScalingPolicy,
  ScaleDirection,
  ScalingDecision,
  ScalingState,
  Priority,
  AdmissionDecision,
  RegionMode,
  RegionHealth,
  RoutingDecision,
  CacheTier,
  CacheNamespace,
  MutationEvent,
  InvalidationTarget,
  InvalidationPlan,
} from './types.js';
export { PRIORITY_RANK } from './types.js';

// Determinism boundary
export { createTestEnv, mutableClock, type ScaleEnv, type TestEnvOptions } from './env.js';

// Autoscaler
export {
  decideScale,
  desiredForSignal,
  signalHasOpinion,
  recordScaleAction,
  emptyScalingState,
  DEFAULT_SCALING_POLICY,
  MAX_SIGNAL_WEIGHT,
  type ScaleInput,
} from './autoscaler.js';

// Resilience primitives
export { TokenBucket, createRateLimiter, type RateLimitOptions, type RateLimitResult } from './ratelimit.js';
export { Bulkhead, createBulkhead, type BulkheadOptions, type AcquireOutcome, type BulkheadStats } from './bulkhead.js';
export { CircuitBreaker, createBreaker, type CircuitState, type BreakerOptions } from './breaker.js';
export {
  classify,
  backoffMs,
  nextRetryDelayMs,
  deadlineFrom,
  remainingBudgetMs,
  isExpired,
  DEFAULT_RETRY_POLICY,
  type Retryability,
  type FailureClass,
  type RetryPolicy,
  type RetryContext,
} from './retry.js';
export { admissionDecision, sheddingFloor, DEFAULT_SHEDDING_POLICY, type SheddingPolicy } from './shed.js';

// Multi-region routing
export { route } from './region.js';

// Cache invalidation
export { planInvalidation, buildDependents, DEFAULT_CACHE_NAMESPACES } from './cache.js';

// Actuator + controller (decide-not-act)
export { noopScaleActuator, type ScaleActuator } from './sources.js';
export {
  ScalingController,
  createScalingController,
  type ScalingControllerDeps,
  type ScalingControllerOptions,
  type ReconcileResult,
} from './engine.js';

export { ScaleError, type ScaleErrorCode } from './errors.js';
