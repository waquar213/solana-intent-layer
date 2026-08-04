import { describe, expect, it } from 'vitest';
import {
  createSettlementEngine,
  createTestEnv,
  InMemorySettlementStore,
  settlementIdFor,
  type ExecutionPlan,
  type Settlement,
  type StageCapability,
  type StageRecord,
} from '../src/index.js';

function plan(over: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    planId: 'plan-1',
    intentId: 'intent-1',
    intentKind: 'swap',
    assets: ['ETH', 'USDC'],
    sourceChains: ['ethereum'],
    destChains: ['ethereum'],
    steps: [{ seq: 0, kind: 'swap', chainId: 'ethereum', description: 'swap ETH→USDC', dependsOn: [], params: {} }],
    quote: {
      youSend: { symbol: 'ETH', base: '1000000000000000000', decimals: 18 },
      youReceiveMin: { symbol: 'USDC', base: '1900000000', decimals: 6 },
      totalFeeMicros: '210000',
      feePct: 0.1,
      slippageBps: 50,
      etaSeconds: 30,
    },
    risk: { level: 'low', reasons: [] },
    requiresStepUp: false,
    fallback: 'parked safely',
    rollback: null,
    confirmation: 'Swap ETH to USDC',
    ...over,
  };
}

class SpyExecutor implements StageCapability {
  calls = 0;
  run(): Promise<{ ok: boolean; detail: string; ids?: { txids?: string[]; executionId?: string } }> {
    this.calls += 1;
    return Promise.resolve({
      ok: true,
      detail: 'executed via device signature',
      ids: { txids: ['0xtx'], executionId: 'exec-1' },
    });
  }
}

describe('SettlementEngine — happy path', () => {
  it('drives a plan through the full pipeline to settled, recording ids + ledger', async () => {
    const engine = createSettlementEngine();
    const s = await engine.settle(plan());
    expect(s.status).toBe('settled');
    expect(s.stage).toBe('notify');
    expect(s.txids).toContain('0xtx');
    expect(s.executionId).toBe('exec-1');
    expect(s.stages.filter((x) => x.status === 'ok')).toHaveLength(10); // all 10 pipeline stages
    const history = await engine.history(s.id);
    expect(history[0]?.event).toBe('created');
    expect(history.at(-1)?.event).toBe('settled');
  });
});

describe('SettlementEngine — MANDATORY pre-flight (the CRITICAL#1 gate)', () => {
  it('PARKS an approved-but-stale plan at pre-flight and NEVER executes', async () => {
    const executor = new SpyExecutor();
    const engine = createSettlementEngine({
      sources: {
        executor,
        preflight: {
          validate: () =>
            Promise.resolve({
              ok: false,
              checks: [{ name: 'balance', ok: false, detail: 'insufficient after a prior spend' }],
            }),
        },
      },
    });
    const s = await engine.settle(plan());
    expect(s.status).toBe('parked');
    expect(s.stage).toBe('preflight');
    expect(s.reason).toMatch(/pre-flight failed/);
    expect(executor.calls).toBe(0); // a stale plan can never reach broadcast
  });
});

describe('SettlementEngine — an irreversible stage is never blind-retried', () => {
  it('PARKS instead of re-broadcasting when execute fails with an RPC error', async () => {
    // The execute stage is sign → broadcast → confirm. If the broadcast LANDED and only the
    // confirm hit an RPC failure (the most common failure mode), retrying the stage would sign
    // and send the transfer a SECOND time. "Did my transaction land?" cannot be answered by
    // sending it again — the safe action is to park and let reconcile/a human resolve it.
    let calls = 0;
    const executor: StageCapability = {
      run: () => {
        calls += 1;
        return Promise.resolve({
          ok: false,
          detail: 'confirm failed',
          error: { class: 'rpc_failure', message: 'rpc timeout polling receipt', retryable: true },
        });
      },
    };
    const engine = createSettlementEngine({ sources: { executor } });
    const s = await engine.settle(plan());
    expect(calls).toBe(1); // ← exactly ONE attempt at the money-moving stage
    expect(s.status).toBe('parked');
    expect(s.stage).toBe('execute');
  });

  it('still retries a REVERSIBLE stage on the same rpc_failure', async () => {
    // Read/build stages carry no on-chain effect, so retrying them is free and correct.
    let calls = 0;
    const liquidity: StageCapability = {
      run: () => {
        calls += 1;
        return calls < 3
          ? Promise.resolve({ ok: false, detail: 'flaky', error: { class: 'rpc_failure', message: 'rpc blip', retryable: true } })
          : Promise.resolve({ ok: true, detail: 'reserved' });
      },
    };
    const engine = createSettlementEngine({ sources: { liquidity } });
    const s = await engine.settle(plan());
    expect(calls).toBe(3);
    expect(s.status).toBe('settled');
  });
});

describe('SettlementEngine — idempotency', () => {
  it('settles the same plan at most once (no double-execution)', async () => {
    const executor = new SpyExecutor();
    const engine = createSettlementEngine({ sources: { executor } });
    const first = await engine.settle(plan());
    const second = await engine.settle(plan()); // same planId → same settlement id
    expect(first.id).toBe(second.id);
    expect(second.status).toBe('settled');
    expect(executor.calls).toBe(1); // executed exactly once
  });

  it('does not double-execute under CONCURRENT settle of the same plan', async () => {
    const executor = new SpyExecutor();
    const engine = createSettlementEngine({ sources: { executor } });
    const p = plan();
    // Two settles race for the same settlement id. Exactly ONE may drive the plan; the loser must return
    // the existing settlement or reject IN_PROGRESS — never spin up a second concurrent driver.
    const results = await Promise.allSettled([engine.settle(p), engine.settle(p)]);
    expect(executor.calls).toBe(1);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
  });
});

describe('SettlementEngine — recovery', () => {
  it('requotes (parks) when the quote has expired — before any execution', async () => {
    const executor = new SpyExecutor();
    const engine = createSettlementEngine({
      sources: {
        executor,
        quoteLock: {
          run: () =>
            Promise.resolve({ ok: false, detail: 'stale', error: { class: 'quote_expiry', message: 'quote expired' } }),
        },
      },
    });
    const s = await engine.settle(plan());
    expect(s.status).toBe('parked');
    expect(s.reason).toMatch(/requote/);
    expect(executor.calls).toBe(0);
  });

  it('retries a transient RPC failure then succeeds', async () => {
    let n = 0;
    const flakyGas: StageCapability = {
      run: () => {
        n += 1;
        return Promise.resolve(
          n < 3
            ? {
                ok: false,
                detail: 'rpc down',
                error: { class: 'rpc_failure', message: 'rpc timeout', retryable: true },
              }
            : { ok: true, detail: 'gas ok' },
        );
      },
    };
    const s = await createSettlementEngine({ sources: { gas: flakyGas } }).settle(plan());
    expect(s.status).toBe('settled');
    expect(n).toBe(3); // failed twice, succeeded on the third attempt
  });

  it('compensates on a bridge failure', async () => {
    const compensator = new SpyExecutor();
    const engine = createSettlementEngine({
      sources: {
        compensator,
        crossChain: {
          run: () =>
            Promise.resolve({
              ok: false,
              detail: 'bridge down',
              error: { class: 'bridge_failure', message: 'bridge exploit halt' },
            }),
        },
      },
    });
    const s = await engine.settle(plan());
    expect(s.status).toBe('compensated');
    expect(compensator.calls).toBe(1); // completed legs were reversed
  });
});

describe('SettlementEngine — resumability', () => {
  it('resumes from where it stopped and never re-runs a completed stage', async () => {
    const env = createTestEnv();
    const executor = new SpyExecutor();
    const store = new InMemorySettlementStore();
    const engine = createSettlementEngine({ sources: { store, executor }, env });

    const id = settlementIdFor('plan-1', env);
    await store.claim(id);
    const doneStage = (stage: StageRecord['stage']): StageRecord => ({
      stage,
      status: 'ok',
      detail: 'done',
      atIso: '2026-01-01T00:00:00.000Z',
    });
    const seeded: Settlement = {
      id,
      correlationId: 'corr-x',
      planId: 'plan-1',
      intentId: 'intent-1',
      executionId: 'exec-1',
      status: 'in_progress',
      stage: 'execute',
      stages: ['preflight', 'liquidity', 'quote_lock', 'gas', 'prepare', 'execute'].map((s) =>
        doneStage(s as StageRecord['stage']),
      ),
      txids: ['0xtx'],
      bridgeIds: [],
      providerIds: [],
      createdAtIso: '2026-01-01T00:00:00.000Z',
      updatedAtIso: '2026-01-01T00:00:00.000Z',
    };
    await store.save(seeded);

    const out = await engine.resume(id, plan());
    expect(out.status).toBe('settled');
    expect(executor.calls).toBe(0); // execute was already ok → not re-run
  });
});

describe('SettlementEngine — irreversible-stage safety (F2/F6)', () => {
  it('parks (never an escaped rejection) when an executor stage THROWS', async () => {
    // F6: a thrown stage must be classified and parked, not propagate out of drive leaving the
    // settlement stuck in_progress with an unrecorded on-chain effect.
    const executor: StageCapability = { run: () => Promise.reject(new Error('rpc exploded')) };
    const engine = createSettlementEngine({ sources: { executor } });
    const s = await engine.settle(plan());
    expect(s.status).toBe('parked');
  });

  it('does NOT re-run an irreversible stage on resume after a mid-execute crash (F2)', async () => {
    // The executor crashes on its first call (simulating a crash between the on-chain effect and the ok
    // record); the coordinator has already persisted a 'started' marker. On resume, F2 must PARK on that
    // marker rather than run the executor a SECOND time (double-broadcast).
    let calls = 0;
    const executor: StageCapability = {
      run: () => {
        calls += 1;
        return Promise.reject(new Error('crash mid-execute'));
      },
    };
    const engine = createSettlementEngine({ sources: { executor } });
    const p = plan();
    const first = await engine.settle(p);
    expect(first.status).toBe('parked');
    expect(calls).toBe(1);
    const resumed = await engine.resume(first.id, p);
    expect(resumed.status).toBe('parked');
    expect(calls).toBe(1); // executor NOT called again — the money assertion (no double-execute)
  });
});
