import { describe, expect, it } from 'vitest';
import {
  computeErrorBudget,
  computeHealth,
  createController,
  createTestEnv,
  decideRecovery,
  emptyAlertState,
  emptyHealingState,
  evaluateAlerts,
  type Actuator,
  type FailureSignal,
  type Incident,
  type RecoveryDecision,
  type Sli,
  type Slo,
} from '../src/index.js';

const slo = (over: Partial<Slo> = {}): Slo => ({
  service: 'intent',
  objective: 0.9999,
  p99BudgetMs: 500,
  budgetWindowSeconds: 2_592_000,
  ...over,
});
const sli = (over: Partial<Sli> = {}): Sli => ({
  service: 'intent',
  windowSeconds: 300,
  total: 10000,
  failures: 0,
  p50Ms: 50,
  p95Ms: 200,
  p99Ms: 300,
  saturation: 0.3,
  ...over,
});

describe('error budget + health', () => {
  it('computes burn rate relative to the objective', () => {
    const b = computeErrorBudget(sli({ failures: 5 }), slo()); // 0.05% fail vs 0.01% allowed
    expect(b.failureRate).toBeCloseTo(0.0005, 6);
    expect(b.burnRate).toBeCloseTo(5, 3); // burning 5× the allowance
    expect(b.budgetRemaining).toBe(0); // budget blown
  });

  it('maps burn / latency / saturation / no-traffic to health states', () => {
    expect(computeHealth(sli({ failures: 20 }), slo()).state).toBe('critical'); // 20× burn
    expect(computeHealth(sli({ failures: 3 }), slo()).state).toBe('degraded'); // 3× burn
    expect(computeHealth(sli({ p99Ms: 1200 }), slo()).state).toBe('critical'); // p99 ≫ budget
    expect(computeHealth(sli({ saturation: 0.95 }), slo()).state).toBe('critical');
    expect(computeHealth(sli(), slo()).state).toBe('healthy');
    expect(computeHealth(sli({ total: 0 }), slo()).state).toBe('unknown');
  });
});

describe('alerts', () => {
  it('pages on fast burn, tickets on slow burn, and respects cooldown', () => {
    const h = computeHealth(sli({ failures: 20 }), slo()); // fast burn + critical
    const first = evaluateAlerts(emptyAlertState(), [h], '2026-01-01T00:00:00.000Z');
    expect(first.alerts.some((a) => a.code === 'FAST_BUDGET_BURN' && a.severity === 'page')).toBe(true);
    const soon = evaluateAlerts(first.state, [h], '2026-01-01T00:30:00.000Z'); // +30m < 1h cooldown
    expect(soon.alerts).toHaveLength(0);
  });
});

describe('self-healing decisions — bounded by safety', () => {
  const now = '2026-01-01T00:00:00.000Z';
  const fresh = emptyHealingState();

  it('maps failures to remediations', () => {
    expect(decideRecovery({ service: 'router', kind: 'provider_failure', detail: '' }, fresh, now).action).toBe(
      'failover_provider',
    );
    expect(decideRecovery({ service: 'q', kind: 'queue_congestion', detail: '' }, fresh, now).action).toBe('scale_out');
  });

  it('a security incident is contained AND escalated — never silently auto-healed', () => {
    const d = decideRecovery({ service: 'api', kind: 'security_incident', detail: 'anomaly' }, fresh, now);
    expect(d.action).toBe('circuit_break');
    expect(d.escalate).toBe(true);
  });

  it('contains + escalates a security incident EVEN during a change freeze (N2)', () => {
    // A maintenance freeze suppresses routine auto-remediation, but must NEVER suppress security
    // containment/paging. Before N2 the security branch sat below the freeze check, so an incident
    // arriving during a freeze was silently dropped (action 'none', no page).
    const d = decideRecovery({ service: 'api', kind: 'security_incident', detail: 'intrusion' }, fresh, now, {
      maxActionsPerWindow: 5,
      windowSeconds: 300,
      cooldownSeconds: 60,
      maxAutoRecoveries: 3,
      frozen: true,
    });
    expect(d.action).toBe('circuit_break');
    expect(d.escalate).toBe(true);
  });

  it('does nothing automatically during a change freeze', () => {
    const d = decideRecovery({ service: 'api', kind: 'cpu_spike', detail: '' }, fresh, now, {
      maxActionsPerWindow: 5,
      windowSeconds: 300,
      cooldownSeconds: 60,
      maxAutoRecoveries: 3,
      frozen: true,
    });
    expect(d.action).toBe('none');
  });

  it('escalates instead of looping once the rate limit is hit', () => {
    const state = { ...emptyHealingState(), actionsInWindow: { api: 5 } };
    const d = decideRecovery({ service: 'api', kind: 'cpu_spike', detail: '' }, state, now);
    expect(d.action).toBe('escalate');
    expect(d.escalate).toBe(true);
  });
});

class SpyActuator implements Actuator {
  readonly calls: RecoveryDecision[] = [];
  constructor(private readonly ok = true) {}
  execute(d: RecoveryDecision): Promise<{ ok: boolean; detail: string }> {
    this.calls.push(d);
    return Promise.resolve({ ok: this.ok, detail: this.ok ? 'done' : 'failed' });
  }
}

describe('SelfHealingController — the tick loop', () => {
  it('dispatches a bounded recovery to the actuator', async () => {
    const actuator = new SpyActuator();
    const ctrl = createController({ actuator, env: createTestEnv() });
    const out = await ctrl.tick({
      slis: [sli({ failures: 20 })],
      slos: [slo()],
      signals: [{ service: 'intent', kind: 'provider_failure', detail: 'rpc down' }],
    });
    expect(actuator.calls[0]?.action).toBe('failover_provider');
    expect(out.alerts.some((a) => a.severity === 'page')).toBe(true);
  });

  it('escalates (opens an incident) after repeated auto-recovery failures — never loops forever', async () => {
    const actuator = new SpyActuator(false); // every recovery fails
    const incidents: Incident[] = [];
    const ctrl = createController(
      { actuator, env: createTestEnv(), incidents: { open: (i) => (incidents.push(i), Promise.resolve()) } },
      { healing: { maxActionsPerWindow: 99, windowSeconds: 300, cooldownSeconds: 0, maxAutoRecoveries: 3, frozen: false } },
    );
    const signal: FailureSignal = { service: 'exec', kind: 'execution_failure', detail: 'timeout' };
    for (let i = 0; i < 3; i++) await ctrl.tick({ slis: [], slos: [], signals: [signal] });
    const last = await ctrl.tick({ slis: [], slos: [], signals: [signal] }); // 4th: cf==3 → escalate
    expect(actuator.calls).toHaveLength(3); // it stopped trying after 3 failures
    expect(last.decisions[0]?.action).toBe('escalate');
    expect(incidents).toHaveLength(1);
  });

  it('takes no action during a change freeze', async () => {
    const actuator = new SpyActuator();
    const ctrl = createController(
      { actuator, env: createTestEnv() },
      { healing: { maxActionsPerWindow: 5, windowSeconds: 300, cooldownSeconds: 60, maxAutoRecoveries: 3, frozen: true } },
    );
    await ctrl.tick({ slis: [], slos: [], signals: [{ service: 'api', kind: 'cpu_spike', detail: '' }] });
    expect(actuator.calls).toHaveLength(0);
  });

  it('resets the rate-limit window after windowSeconds elapse (N1) — a busy service can heal again', async () => {
    // actionsInWindow is a per-WINDOW counter. Without the reset it climbs monotonically for the process
    // lifetime, so once a busy service hits maxActionsPerWindow it escalates FOREVER (auto-recovery
    // permanently disabled). Fill the window, confirm it escalates, then advance past windowSeconds and
    // confirm auto-recovery resumes.
    const actuator = new SpyActuator();
    const ctrl = createController(
      { actuator, env: createTestEnv() },
      { healing: { maxActionsPerWindow: 2, windowSeconds: 300, cooldownSeconds: 0, maxAutoRecoveries: 99, frozen: false } },
    );
    const signal: FailureSignal = { service: 'api', kind: 'cpu_spike', detail: '' };
    await ctrl.tick({ slis: [], slos: [], signals: [signal] }, '2026-01-01T00:00:00.000Z'); // action 1 — window opens
    await ctrl.tick({ slis: [], slos: [], signals: [signal] }, '2026-01-01T00:01:00.000Z'); // action 2 — window full
    const limited = await ctrl.tick({ slis: [], slos: [], signals: [signal] }, '2026-01-01T00:02:00.000Z'); // within window → rate-limited
    expect(limited.decisions[0]?.action).toBe('escalate');
    expect(actuator.calls).toHaveLength(2); // no 3rd dispatch while the window is full
    // +301s past the window open → counter resets → the same service auto-recovers again
    const after = await ctrl.tick({ slis: [], slos: [], signals: [signal] }, '2026-01-01T00:05:01.000Z');
    expect(after.decisions[0]?.action).toBe('scale_out');
    expect(actuator.calls).toHaveLength(3);
  });

  it('re-arms auto-recovery after a quiet window — consecutiveFailures is not a lifetime escalate', async () => {
    // consecutiveFailures only reset on a SUCCESSFUL run, but once it hits maxAutoRecoveries the decision is
    // 'escalate' (no dispatch), so the reset was unreachable and the service escalated forever. Fill it with
    // failing recoveries, confirm it escalates, then advance past windowSeconds and confirm auto-recovery
    // is re-attempted (the resolved/quiet service heals again instead of paging on every future failure).
    const actuator = new SpyActuator(false); // every recovery fails
    const incidents: Incident[] = [];
    const ctrl = createController(
      { actuator, env: createTestEnv(), incidents: { open: (i) => (incidents.push(i), Promise.resolve()) } },
      { healing: { maxActionsPerWindow: 99, windowSeconds: 300, cooldownSeconds: 0, maxAutoRecoveries: 3, frozen: false } },
    );
    const signal: FailureSignal = { service: 'exec', kind: 'execution_failure', detail: 'timeout' };
    await ctrl.tick({ slis: [], slos: [], signals: [signal] }, '2026-01-01T00:00:00.000Z'); // fail 1 — window opens
    await ctrl.tick({ slis: [], slos: [], signals: [signal] }, '2026-01-01T00:01:00.000Z'); // fail 2
    await ctrl.tick({ slis: [], slos: [], signals: [signal] }, '2026-01-01T00:02:00.000Z'); // fail 3
    const escalated = await ctrl.tick({ slis: [], slos: [], signals: [signal] }, '2026-01-01T00:03:00.000Z');
    expect(escalated.decisions[0]?.action).toBe('escalate'); // cf==3 → stopped trying
    expect(actuator.calls).toHaveLength(3);
    // +301s past the window open → consecutiveFailures resets → the same service auto-recovers again
    const rearmed = await ctrl.tick({ slis: [], slos: [], signals: [signal] }, '2026-01-01T00:05:01.000Z');
    expect(rearmed.decisions[0]?.action).not.toBe('escalate');
    expect(actuator.calls).toHaveLength(4);
  });

  it('isolates a per-signal dispatch failure — one throwing actuator does not abort the tick (N3)', async () => {
    // An injected sink that throws for ONE service must not drop every other service's recovery or the
    // whole tick result. The failing service surfaces as a bounded escalation; the rest still process.
    const seen: string[] = [];
    const actuator: Actuator = {
      execute: (d) => {
        seen.push(d.service);
        if (d.service === 'boom') throw new Error('actuator exploded');
        return Promise.resolve({ ok: true, detail: 'done' });
      },
    };
    const ctrl = createController({ actuator, env: createTestEnv() });
    const out = await ctrl.tick({
      slis: [],
      slos: [],
      signals: [
        { service: 'boom', kind: 'cpu_spike', detail: '' },
        { service: 'ok', kind: 'queue_congestion', detail: '' },
      ],
    });
    // The tick RESOLVED (didn't reject) and the second service was still dispatched after the first threw.
    expect(seen).toEqual(['boom', 'ok']);
    expect(out.decisions.some((d) => d.service === 'ok' && d.action === 'scale_out')).toBe(true);
    // The throwing service surfaced as a bounded escalation (a human is flagged) rather than vanishing.
    expect(out.decisions.some((d) => d.service === 'boom' && d.action === 'escalate' && d.escalate)).toBe(true);
  });
});
