import { describe, expect, it } from 'vitest';
import { checkSafety, evaluateCondition, runsTodayCount, upcomingRuns } from '../src/index.js';
import type { Condition, EvalContext, Workflow, WorkflowRun } from '../src/index.js';
import { dcaWorkflow } from './fakes.js';

const ctx = (over: Partial<EvalContext> = {}): EvalContext => ({
  nowIso: '2026-01-05T10:00:00.000Z',
  prices: { BTC: 100_000_000_000n },
  priceMoves: {},
  portfolio: { health: 40, drawdown: 0.25, risk_score: 70, net_worth: 5000 },
  gasGwei: 15,
  variables: { apy: 8 },
  events: [],
  ...over,
});

describe('evaluateCondition', () => {
  it('combines price, metric, gas and variable conditions', () => {
    const c: Condition = {
      op: 'and',
      all: [
        { op: 'price_gte', symbol: 'BTC', microsUsd: 50_000_000_000n },
        { op: 'metric', metric: 'drawdown', cmp: 'gte', value: 0.2 },
        { op: 'gas_below', gwei: 30 },
        { op: 'variable', name: 'apy', cmp: 'gte', value: 5 },
      ],
    };
    expect(evaluateCondition(ctx(), c)).toBe(true);
    expect(evaluateCondition(ctx({ gasGwei: 40 }), c)).toBe(false);
  });

  it('handles not / or', () => {
    expect(evaluateCondition(ctx(), { op: 'not', expr: { op: 'gas_below', gwei: 5 } })).toBe(true);
    expect(evaluateCondition(ctx(), { op: 'or', any: [{ op: 'gas_below', gwei: 5 }, { op: 'always' }] })).toBe(true);
  });
});

describe('safety', () => {
  it('enforces cooldown and daily caps', () => {
    const wf: Workflow = dcaWorkflow({ safety: { cooldownSeconds: 3600 }, lastRunAtIso: '2026-01-05T09:30:00.000Z' });
    expect(checkSafety(wf, 0, '2026-01-05T10:00:00.000Z').ok).toBe(false); // only 30 min since last run
    expect(checkSafety(wf, 0, '2026-01-05T11:00:00.000Z').ok).toBe(true); // 90 min later

    const capped = dcaWorkflow({ safety: { maxDailyRuns: 2 } });
    expect(checkSafety(capped, 2, '2026-01-05T10:00:00.000Z').ok).toBe(false);
    expect(checkSafety(capped, 1, '2026-01-05T10:00:00.000Z').ok).toBe(true);
  });

  it('counts only same-day firings', () => {
    const runs: WorkflowRun[] = [
      {
        id: 'r1',
        workflowId: 'wf-1',
        ownerId: 'u',
        firedAtIso: '2026-01-05T08:00:00.000Z',
        status: 'executed',
        idempotencyKey: 'a',
        actions: [],
        notes: [],
      },
      {
        id: 'r2',
        workflowId: 'wf-1',
        ownerId: 'u',
        firedAtIso: '2026-01-04T08:00:00.000Z',
        status: 'executed',
        idempotencyKey: 'b',
        actions: [],
        notes: [],
      },
      {
        id: 'r3',
        workflowId: 'wf-1',
        ownerId: 'u',
        firedAtIso: '2026-01-05T09:00:00.000Z',
        status: 'skipped',
        idempotencyKey: 'c',
        actions: [],
        notes: [],
      },
    ];
    expect(runsTodayCount(runs, '2026-01-05T10:00:00.000Z')).toBe(1); // one executed today; skipped + yesterday excluded
  });
});

describe('scheduler', () => {
  it('lists upcoming scheduled runs soonest first', () => {
    const daily = dcaWorkflow({ id: 'wf-2', trigger: { kind: 'schedule', every: 'day', atHourUtc: 6 } });
    const list = upcomingRuns([dcaWorkflow(), daily], '2026-01-05T10:00:00.000Z');
    expect(list).toHaveLength(2);
    expect(Date.parse(list[0]!.nextFireIso)).toBeLessThanOrEqual(Date.parse(list[1]!.nextFireIso));
  });
});
