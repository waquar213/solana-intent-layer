import { describe, expect, it } from 'vitest';
import { HealthTracker } from '../src/health.js';

describe('HealthTracker scoring', () => {
  it('gives an untried provider a neutral prior and a successful one a high score', () => {
    const h = new HealthTracker();
    expect(h.score('new')).toBe(0.5);
    h.recordSuccess('good', 100);
    expect(h.score('good')).toBeGreaterThan(0.7);
  });

  it('penalizes providers with failures and high latency', () => {
    const h = new HealthTracker();
    h.recordSuccess('fast', 50);
    h.recordSuccess('slow', 5000);
    expect(h.score('fast')).toBeGreaterThan(h.score('slow'));

    h.recordSuccess('mixed', 100);
    h.recordFailure('mixed');
    expect(h.score('mixed')).toBeLessThan(h.score('fast'));
  });
});

describe('circuit breaker', () => {
  it('opens after the failure threshold and reports unavailable', () => {
    const clock = 0;
    const h = new HealthTracker({ failureThreshold: 3, cooldownMs: 1000, now: () => clock });
    h.recordFailure('p');
    h.recordFailure('p');
    expect(h.available('p')).toBe(true); // 2 < threshold
    h.recordFailure('p');
    expect(h.available('p')).toBe(false); // tripped
    expect(h.circuit('p')).toBe('open');
    expect(h.score('p')).toBe(0);
  });

  it('half-opens after the cooldown to allow one probe, then closes on success', () => {
    let clock = 0;
    const h = new HealthTracker({ failureThreshold: 2, cooldownMs: 1000, now: () => clock });
    h.recordFailure('p');
    h.recordFailure('p');
    expect(h.available('p')).toBe(false);

    clock = 1001; // cooldown elapsed
    expect(h.available('p')).toBe(true); // half-open probe allowed
    expect(h.circuit('p')).toBe('half_open');

    h.recordSuccess('p', 100); // probe succeeds → closed
    expect(h.circuit('p')).toBe('closed');
    expect(h.available('p')).toBe(true);
  });

  it('re-opens if the half-open probe fails', () => {
    let clock = 0;
    const h = new HealthTracker({ failureThreshold: 2, cooldownMs: 1000, now: () => clock });
    h.recordFailure('p');
    h.recordFailure('p');
    clock = 1001;
    expect(h.available('p')).toBe(true); // probe allowed
    h.recordFailure('p'); // probe fails
    expect(h.available('p')).toBe(false);
    expect(h.circuit('p')).toBe('open');
  });

  it('exposes a health snapshot', () => {
    const h = new HealthTracker();
    h.recordSuccess('p', 200);
    h.recordFailure('p');
    const snap = h.snapshot('p');
    expect(snap).toMatchObject({ id: 'p', successRate: 0.5, consecutiveFailures: 1 });
    expect(snap.ewmaLatencyMs).not.toBeNull();
  });
});
