import { describe, expect, it } from 'vitest';
import {
  admissionDecision,
  backoffMs,
  Bulkhead,
  CircuitBreaker,
  classify,
  createScalingController,
  DEFAULT_CACHE_NAMESPACES,
  decideScale,
  desiredForSignal,
  emptyScalingState,
  mutableClock,
  nextRetryDelayMs,
  planInvalidation,
  route,
  sheddingFloor,
  TokenBucket,
  type CacheNamespace,
  type RegionHealth,
  type ScaleActuator,
  type ScaleInput,
  type ScalingDecision,
  type ScalingPolicy,
} from '../src/index.js';

const POLICY: ScalingPolicy = {
  minReplicas: 2,
  maxReplicas: 100,
  maxScaleUpRatio: 1.0,
  maxScaleDownRatio: 0.25,
  scaleDownStabilizationMs: 300_000,
  cooldownMs: 30_000,
  tolerance: 0.1,
};

const input = (over: Partial<ScaleInput> = {}): ScaleInput => ({
  service: 'api',
  currentReplicas: 10,
  signals: [],
  ...over,
});

describe('autoscaler — bounded multi-signal decisions', () => {
  it('scales to the MOST-stressed signal, not the average', () => {
    const d = decideScale(
      input({
        signals: [
          { kind: 'cpu', value: 0.9, target: 0.6 }, // wants ceil(10×1.5)=15
          { kind: 'queue', value: 100, target: 200 }, // wants ceil(10×0.5)=5
        ],
      }),
      POLICY,
      emptyScalingState(),
      0,
    );
    expect(d.direction).toBe('up');
    expect(d.desiredReplicas).toBe(15); // the CPU pressure wins, not the slack queue
  });

  it('clamps to maxReplicas AND rate-limits the step — no scale storm', () => {
    const d = decideScale(
      input({ currentReplicas: 50, signals: [{ kind: 'cpu', value: 1.0, target: 0.1 }] }), // asks for 500
      POLICY,
      emptyScalingState(),
      0,
    );
    expect(d.rawDesired).toBe(500);
    expect(d.desiredReplicas).toBe(100); // ceiling AND ≤ 2× step both cap it here
    expect(d.bounded).toBe(true);
  });

  it('never scales below minReplicas — no scale-to-zero', () => {
    const d = decideScale(
      input({ currentReplicas: 2, signals: [{ kind: 'cpu', value: 0.01, target: 0.6 }] }), // asks for 1
      POLICY,
      emptyScalingState(),
      0,
    );
    expect(d.desiredReplicas).toBe(2); // floored at min
    expect(d.direction).toBe('hold');
    expect(d.bounded).toBe(true);
  });

  it('suppresses scale-DOWN inside the stabilization window after a scale-UP (anti-flap)', () => {
    const state = { ...emptyScalingState(), lastScaleUpMs: { api: 0 } };
    const d = decideScale(
      input({ signals: [{ kind: 'cpu', value: 0.05, target: 0.6 }] }), // wants to shrink
      POLICY,
      state,
      1_000, // only 1s after the scale-up
    );
    expect(d.direction).toBe('hold');
    expect(d.reason).toMatch(/stabilization/i);
  });

  it('honours the cooldown between actions', () => {
    const state = { ...emptyScalingState(), lastActionMs: { api: 0 } };
    const d = decideScale(input({ signals: [{ kind: 'cpu', value: 0.9, target: 0.6 }] }), POLICY, state, 1_000);
    expect(d.direction).toBe('hold');
    expect(d.reason).toMatch(/cooldown/i);
  });

  it('holds within the tolerance band', () => {
    const d = decideScale(
      input({ signals: [{ kind: 'cpu', value: 0.6, target: 0.6 }] }),
      POLICY,
      emptyScalingState(),
      0,
    );
    expect(d.direction).toBe('hold');
  });

  it('a malformed signal (target 0) has no opinion — it cannot drive scaling', () => {
    expect(desiredForSignal({ kind: 'cpu', value: 0.9, target: 0 }, 10)).toBe(10);
  });
});

describe('token-bucket rate limiter', () => {
  it('allows a burst up to capacity, then rejects with a retry-after', () => {
    const clock = mutableClock(0);
    const bucket = new TokenBucket({ capacity: 10, refillPerSec: 5 }, clock.env);
    expect(bucket.tryRemove(10).allowed).toBe(true); // drains the burst
    const rejected = bucket.tryRemove(1);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterMs).toBe(200); // 1 token ÷ 5/s = 200ms
  });

  it('refills over time, capped at capacity (idle time cannot accumulate infinite allowance)', () => {
    const clock = mutableClock(0);
    const bucket = new TokenBucket({ capacity: 10, refillPerSec: 5, initialTokens: 0 }, clock.env);
    clock.advance(100_000); // long idle
    expect(bucket.tokens).toBe(10); // NOT 500 — capped
    expect(bucket.tryRemove(10).allowed).toBe(true);
    expect(bucket.tryRemove(1).allowed).toBe(false);
  });
});

describe('bulkhead — concurrency isolation + bounded queue', () => {
  it('runs up to maxConcurrent, queues up to maxQueue, then rejects (backpressure)', () => {
    const b = new Bulkhead({ maxConcurrent: 2, maxQueue: 1 });
    expect(b.acquire()).toBe('run');
    expect(b.acquire()).toBe('run');
    expect(b.acquire()).toBe('queued');
    expect(b.acquire()).toBe('rejected');
    b.release(); // frees a slot, promotes the waiter
    expect(b.stats()).toEqual({ inUse: 2, queued: 0, maxConcurrent: 2, maxQueue: 1 });
  });

  it('never goes negative on an over-release', () => {
    const b = new Bulkhead({ maxConcurrent: 2, maxQueue: 0 });
    b.release();
    expect(b.stats().inUse).toBe(0);
  });
});

describe('circuit breaker', () => {
  it('opens after N failures, half-opens after cooldown, closes on a successful probe', () => {
    const clock = mutableClock(0);
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1_000 }, clock.env);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.canRequest()).toBe(false); // open
    clock.advance(1_000);
    expect(cb.canRequest()).toBe(true); // half-open probe allowed
    cb.recordSuccess();
    expect(cb.state).toBe('closed');
  });

  it('re-opens when the half-open probe fails', () => {
    const clock = mutableClock(0);
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000 }, clock.env);
    cb.recordFailure(); // open
    clock.advance(1_000);
    expect(cb.canRequest()).toBe(true); // half-open
    cb.recordFailure(); // probe fails → re-open
    expect(cb.canRequest()).toBe(false);
  });
});

describe('retry policy', () => {
  it('classifies transient vs terminal failures', () => {
    expect(classify('timeout')).toBe('retryable');
    expect(classify('signature_rejected')).toBe('terminal');
  });

  it('computes capped exponential backoff', () => {
    expect(backoffMs(1)).toBe(200);
    expect(backoffMs(2)).toBe(400);
    expect(backoffMs(10)).toBe(10_000); // capped at maxDelay
  });

  it('never retries a terminal error, and never past the deadline', () => {
    const noJitter = { maxAttempts: 4, baseDelayMs: 200, factor: 2, maxDelayMs: 10_000, jitter: false };
    expect(nextRetryDelayMs({ kind: 'validation', attempt: 1, nowMs: 0 }, noJitter)).toBeNull();
    expect(nextRetryDelayMs({ kind: 'timeout', attempt: 1, nowMs: 0 }, noJitter)).toBe(400);
    // next wait (400ms) would blow a 300ms deadline → give up now
    expect(nextRetryDelayMs({ kind: 'timeout', attempt: 1, nowMs: 0, deadlineMs: 300 }, noJitter)).toBeNull();
    // attempts exhausted
    expect(nextRetryDelayMs({ kind: 'timeout', attempt: 4, nowMs: 0 }, noJitter)).toBeNull();
  });
});

describe('priority load shedding — degrade, never brick', () => {
  it('admits everything under low load', () => {
    expect(admissionDecision(0.5, 'bulk').admit).toBe(true);
    expect(admissionDecision(0.5, 'bulk').sheddingBelow).toBeNull();
  });

  it('sheds bottom-up as load rises, and never sheds critical', () => {
    expect(sheddingFloor(0.75)).toBe('low'); // bulk shed (≥0.7), low still admitted
    expect(admissionDecision(0.75, 'bulk').admit).toBe(false);
    expect(admissionDecision(0.75, 'normal').admit).toBe(true);
    expect(admissionDecision(0.85, 'low').admit).toBe(false); // now low is shed too
    expect(admissionDecision(0.999, 'high').admit).toBe(false); // brown-out: only critical
    expect(admissionDecision(0.999, 'critical').admit).toBe(true); // ...but critical survives
  });

  it('treats an unknown load as saturated (fail safe)', () => {
    expect(admissionDecision(Number.NaN, 'low').admit).toBe(false);
  });
});

describe('multi-region routing', () => {
  const AA: RegionHealth[] = [
    { region: 'us-east', healthy: true, weight: 2, priority: 0 },
    { region: 'eu-west', healthy: true, weight: 1, priority: 1 },
    { region: 'ap-south', healthy: false, weight: 1, priority: 2 },
  ];

  it('active-active splits by weight across healthy regions only', () => {
    const d = route(AA, 'active_active');
    expect(d.primary).toBe('us-east');
    expect(d.weights['us-east']).toBeCloseTo(2 / 3, 5);
    expect(d.weights['eu-west']).toBeCloseTo(1 / 3, 5);
    expect(d.weights['ap-south']).toBeUndefined(); // unhealthy → no traffic
  });

  it('active-passive fails over to the next healthy standby when the requested region is down', () => {
    const AP: RegionHealth[] = [
      { region: 'us-east', healthy: false, weight: 1, priority: 0 },
      { region: 'eu-west', healthy: true, weight: 1, priority: 1 },
    ];
    const d = route(AP, 'active_passive', 'us-east');
    expect(d.primary).toBe('eu-west');
    expect(d.failedOver).toBe(true);
  });

  it('returns primary=null when every region is unhealthy (never routes to a dead region)', () => {
    const dead = AA.map((r) => ({ ...r, healthy: false }));
    const d = route(dead, 'active_active');
    expect(d.primary).toBeNull();
    expect(d.reason).toMatch(/no healthy region/i);
  });

  it('is shuffle-invariant', () => {
    const a = route(AA, 'active_active');
    const b = route([...AA].reverse(), 'active_active');
    expect(b.primary).toBe(a.primary);
    expect(b.weights).toEqual(a.weights);
  });
});

describe('cache invalidation cascade', () => {
  it('cascades a write to every namespace that transitively depends on it', () => {
    const plan = planInvalidation({ namespace: 'balance', scope: 'addr1' }, DEFAULT_CACHE_NAMESPACES);
    const names = plan.targets.map((t) => t.namespace);
    expect(names).toContain('balance');
    expect(names).toContain('portfolio'); // portfolio dependsOn balance
    expect(plan.targets[0]?.cause).toBe('direct');
    expect(plan.targets.every((t) => t.scope === 'addr1')).toBe(true); // scope propagates
  });

  it('terminates on a dependency cycle (finite plan, never an infinite loop)', () => {
    const cyclic: CacheNamespace[] = [
      { name: 'a', tier: 'api', ttlSeconds: 10, staleWhileRevalidate: false, dependsOn: ['b'] },
      { name: 'b', tier: 'api', ttlSeconds: 10, staleWhileRevalidate: false, dependsOn: ['a'] },
    ];
    const plan = planInvalidation({ namespace: 'a' }, cyclic);
    expect(plan.targets.map((t) => t.namespace).sort()).toEqual(['a', 'b']);
  });
});

class SpyActuator implements ScaleActuator {
  readonly calls: ScalingDecision[] = [];
  constructor(private readonly ok = true) {}
  apply(decision: ScalingDecision): Promise<{ ok: boolean; detail: string }> {
    this.calls.push(decision);
    return Promise.resolve({ ok: this.ok, detail: this.ok ? 'applied' : 'failed' });
  }
}

describe('ScalingController — reconcile loop (decide-not-act)', () => {
  const upSignals: ScaleInput = {
    service: 'api',
    currentReplicas: 10,
    signals: [{ kind: 'cpu', value: 0.9, target: 0.6 }],
  };

  it('dispatches a bounded scale decision to the actuator and records it for cooldown', async () => {
    const clock = mutableClock(0);
    const actuator = new SpyActuator();
    const ctrl = createScalingController({ actuator, env: clock.env }, { defaultPolicy: POLICY });

    const first = await ctrl.reconcile([upSignals]);
    expect(actuator.calls).toHaveLength(1);
    expect(first.applied[0]?.desiredReplicas).toBe(15);

    clock.advance(1_000); // still inside the 30s cooldown
    const second = await ctrl.reconcile([upSignals]);
    expect(second.applied).toHaveLength(0); // cooldown held it
  });

  it('does NOT start the cooldown when the actuator fails to apply — so it can retry', async () => {
    const clock = mutableClock(0);
    const actuator = new SpyActuator(false); // every apply fails
    const ctrl = createScalingController({ actuator, env: clock.env }, { defaultPolicy: POLICY });

    await ctrl.reconcile([upSignals]);
    clock.advance(1_000);
    await ctrl.reconcile([upSignals]);
    expect(actuator.calls).toHaveLength(2); // retried, because the failed apply didn't lock scaling
    expect(ctrl.snapshotState().lastActionMs.api).toBeUndefined();
  });
});

// ── Regressions pinned from the adversarial review ───────────────────────────
describe('autoscaler review regressions', () => {
  it('a malformed signal cannot BLOCK a legitimate scale-down (down-desire is over valid signals only)', () => {
    const d = decideScale(
      input({
        currentReplicas: 20,
        signals: [
          { kind: 'cpu', value: 0.1, target: 0.6 }, // idle → wants down
          { kind: 'queue', value: 5, target: 0 }, // malformed (target 0) → must be ignored, not pin at 20
        ],
      }),
      POLICY,
      emptyScalingState(),
      0,
    );
    expect(d.direction).toBe('down'); // before the fix the malformed signal pinned it at 20 (stuck hot)
    expect(d.desiredReplicas).toBe(15);
  });

  it('a negative-weight signal is dropped — it cannot flip an idle signal into a scale-UP', () => {
    const d = decideScale(
      input({ signals: [{ kind: 'cpu', value: 0.1, target: 0.6, weight: -5 }] }),
      POLICY,
      emptyScalingState(),
      0,
    );
    expect(d.direction).toBe('hold'); // dropped, not inverted into an up-demand
  });

  it('an inverted policy (min > max) does NOT bypass the ceiling — the ceiling wins', () => {
    const inverted: ScalingPolicy = { ...POLICY, minReplicas: 50, maxReplicas: 10 };
    const d = decideScale(
      input({ currentReplicas: 20, signals: [{ kind: 'cpu', value: 0.1, target: 0.6 }] }),
      inverted,
      emptyScalingState(),
      0,
    );
    expect(d.desiredReplicas).toBe(10); // capped at max, NOT scaled up to min=50
    expect(d.direction).toBe('down');
  });
});

describe('breaker review regressions', () => {
  it('admits exactly ONE half-open probe (no thundering herd)', () => {
    const clock = mutableClock(0);
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000 }, clock.env);
    cb.recordFailure(); // open
    clock.advance(1_000);
    expect(cb.canRequest()).toBe(true); // the single probe
    expect(cb.canRequest()).toBe(false); // second concurrent caller is NOT admitted
    expect(cb.canRequest()).toBe(false);
  });

  it('a `.state`-gated caller can close the breaker — record honours the same transition the getter reports', () => {
    const clock = mutableClock(0);
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000 }, clock.env);
    cb.recordFailure(); // open
    clock.advance(1_000);
    expect(cb.state).toBe('half_open'); // read via the getter (never calling canRequest)
    cb.recordSuccess(); // before the fix this hit the wrong branch and stuck open forever
    expect(cb.state).toBe('closed');
  });
});

describe('region review regressions', () => {
  it('does NOT name a fully-saturated (zero-weight) requested region as the serving primary', () => {
    const d = route(
      [
        { region: 'us', healthy: true, weight: 10, priority: 0, saturation: 1 }, // effective weight 0
        { region: 'eu', healthy: true, weight: 10, priority: 1, saturation: 0 },
      ],
      'active_active',
      'us',
    );
    expect(d.primary).toBe('eu'); // fell back to the region that actually serves traffic
    expect(d.failedOver).toBe(true); // and reported the degradation, not a clean route
    expect(d.weights.us).toBe(0);
  });

  it('never leaves the chosen primary inside its own failover chain', () => {
    const d = route(
      [
        { region: 'us', healthy: true, weight: 2, priority: 0 },
        { region: 'eu', healthy: true, weight: 1, priority: 1 },
      ],
      'active_active',
      'eu',
    );
    expect(d.primary).toBe('eu'); // honoured (it has > 0 weight)
    expect(d.failover).not.toContain('eu'); // ...and excluded from its own failover list
  });
});

describe('retry review regressions', () => {
  it('equal-jitter guarantees a non-zero backoff even when rand01 is omitted (no retry storm)', () => {
    const delay = nextRetryDelayMs({ kind: 'timeout', attempt: 1, nowMs: 0 }); // default policy, jitter on, no rand01
    expect(delay).toBe(200); // half of the 400ms ceiling — NOT 0
  });

  it('a NaN deadline fails safe (gives up) instead of bypassing the deadline check', () => {
    const noJitter = { maxAttempts: 4, baseDelayMs: 200, factor: 2, maxDelayMs: 10_000, jitter: false };
    expect(nextRetryDelayMs({ kind: 'timeout', attempt: 1, nowMs: 0, deadlineMs: Number.NaN }, noJitter)).toBeNull();
  });
});

class SelectiveActuator implements ScaleActuator {
  readonly calls: string[] = [];
  apply(decision: ScalingDecision): Promise<{ ok: boolean; detail: string }> {
    this.calls.push(decision.service);
    if (decision.service === 'B') return Promise.reject(new Error('cluster API 5xx'));
    return Promise.resolve({ ok: true, detail: 'ok' });
  }
}

describe('ScalingController review regression', () => {
  it('a REJECTED actuator apply for one service does not abort scaling for the rest of the batch', async () => {
    const clock = mutableClock(0);
    const actuator = new SelectiveActuator();
    const ctrl = createScalingController({ actuator, env: clock.env }, { defaultPolicy: POLICY });
    const up = (service: string): ScaleInput => ({
      service,
      currentReplicas: 10,
      signals: [{ kind: 'cpu', value: 0.9, target: 0.6 }],
    });

    const res = await ctrl.reconcile([up('A'), up('B'), up('C')]); // B throws
    expect(actuator.calls).toEqual(['A', 'B', 'C']); // C was still reached
    expect(res.applied.map((d) => d.service)).toEqual(['A', 'C']); // A and C applied despite B failing
  });
});
