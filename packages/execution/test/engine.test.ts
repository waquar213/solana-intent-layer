/**
 * Execution Engine — the step machine, exercised with a scriptable fake driver
 * so every path (happy, sandbox-halt, retry, park, resume, ordering, invariant)
 * is deterministic and network-free.
 */
import { describe, expect, it } from 'vitest';
import type { ExecutionPlan, PlanStep } from '@intent-wallet/intents';
import { ExecutionEngine } from '../src/engine.js';
import { DriverError, type StepDriver } from '../src/driver.js';
import { InMemoryExecutionStore } from '../src/store.js';
import type { ExecutionEvent } from '../src/events.js';

function plan(steps: Array<Partial<PlanStep> & { seq: number }>): ExecutionPlan {
  return {
    planId: 'plan-1',
    intentId: 'intent-1',
    intentKind: 'swap',
    assets: ['BTC', 'ETH'],
    sourceChains: ['bitcoin'],
    destChains: ['ethereum'],
    steps: steps.map((s) => ({
      seq: s.seq,
      kind: s.kind ?? 'swap',
      chainId: s.chainId ?? 'ethereum',
      description: s.description ?? `step ${s.seq}`,
      dependsOn: s.dependsOn ?? (s.seq === 0 ? [] : [s.seq - 1]),
      params: s.params ?? {},
    })),
    quote: {
      youSend: { symbol: 'BTC', base: '2100000', decimals: 8 },
      youReceiveMin: { symbol: 'ETH', base: '600000000000000000', decimals: 18 },
      totalFeeMicros: '210000',
      feePct: 1,
      slippageBps: 50,
      etaSeconds: 30,
    },
    risk: { level: 'low', reasons: [] },
    requiresStepUp: false,
    fallback: 'parked safely',
    rollback: null,
    confirmation: 'Convert BTC to ETH',
  };
}

/** A driver whose per-call behavior is scripted; records what it did. */
function scriptedDriver(script: Partial<StepDriver> = {}): StepDriver {
  return {
    async simulate() {
      return { ok: true };
    },
    async broadcast(step) {
      return { txid: `0xtx${step.seq}` };
    },
    async confirm() {
      return { confirmed: true, reverted: false };
    },
    async verify() {
      return { ok: true };
    },
    ...script,
  };
}

let counter = 0;
const deps = { ids: { execution: () => `exec-${++counter}` }, now: () => '2026-07-05T00:00:00.000Z' };

function engine(driver: StepDriver, store = new InMemoryExecutionStore(), onEvent?: (e: ExecutionEvent) => void) {
  return { engine: new ExecutionEngine({ driver, store, ...(onEvent ? { onEvent } : {}) }, deps), store };
}

describe('happy path', () => {
  it('runs a 2-step plan to completion, confirming each step in order', async () => {
    const events: ExecutionEvent[] = [];
    const { engine: e } = engine(scriptedDriver(), undefined, (ev) => events.push(ev));
    const exec = await e.execute(
      plan([
        { seq: 0, chainId: 'bitcoin' },
        { seq: 1, chainId: 'ethereum' },
      ]),
    );

    expect(exec.status).toBe('completed');
    expect(exec.steps.map((s) => s.status)).toEqual(['confirmed', 'confirmed']);
    expect(exec.steps.map((s) => s.txid)).toEqual(['0xtx0', '0xtx1']);
    expect(events.at(0)?.type).toBe('execution.started');
    expect(events.at(-1)?.type).toBe('execution.completed');
    expect(events.filter((ev) => ev.type === 'step.confirmed')).toHaveLength(2);
  });
});

describe('Execution Sandbox (simulate gate)', () => {
  it('never broadcasts when the simulation mismatches — parks instead', async () => {
    let broadcasts = 0;
    const driver = scriptedDriver({
      async simulate() {
        return { ok: false, reason: 'would drain an unexpected approval' };
      },
      async broadcast(step) {
        broadcasts++;
        return { txid: `0x${step.seq}` };
      },
    });
    const { engine: e } = engine(driver);
    const exec = await e.execute(plan([{ seq: 0 }]));
    expect(broadcasts).toBe(0); // the whole point — no broadcast on mismatch
    expect(exec.status).toBe('parked');
    expect(exec.steps[0]?.status).toBe('failed');
    expect(exec.steps[0]?.error).toMatch(/unexpected approval/u);
  });
});

describe('idempotent retries', () => {
  it('PARKS a broadcast that throws — never blind-retries (it could be on-chain)', async () => {
    // F4: a broadcast that reached the mempool then threw (a lost response) could already be on-chain, so
    // a retry would DOUBLE-SEND. ANY broadcast throw parks, INDEPENDENT of the DriverError retryable flag.
    let broadcasts = 0;
    const driver = scriptedDriver({
      async broadcast() {
        broadcasts++;
        throw new DriverError('rpc timeout', { retryable: true }); // even retryable:true must NOT re-broadcast
      },
    });
    const { engine: e } = engine(driver);
    const exec = await e.execute(plan([{ seq: 0 }]));
    expect(exec.status).toBe('parked');
    expect(broadcasts).toBe(1); // exactly one attempt — no blind re-send
  });

  it('retries a PENDING confirm (no receipt yet) then confirms — not mislabeled a revert', async () => {
    // F3: a real gateway returns {confirmed:false,reverted:false} while a tx is still in the mempool.
    // That must retry-and-wait at confirm (never re-broadcast), not be parked as "reverted".
    let broadcasts = 0;
    let confirms = 0;
    const driver = scriptedDriver({
      async broadcast(step) {
        broadcasts++;
        return { txid: `0xtx${step.seq}` };
      },
      async confirm() {
        confirms++;
        return confirms < 3 ? { confirmed: false, reverted: false } : { confirmed: true, reverted: false };
      },
    });
    const { engine: e } = engine(driver);
    const exec = await e.execute(plan([{ seq: 0 }]));
    expect(exec.status).toBe('completed');
    expect(broadcasts).toBe(1); // never re-broadcast while pending
    expect(confirms).toBe(3);
  });

  it('NEVER re-broadcasts after a successful broadcast whose confirm hiccups', async () => {
    // The dangerous shape: the transaction IS on-chain, and only the receipt poll failed (an
    // ordinary RPC timeout). Retrying the whole step would sign and send a SECOND transfer —
    // the user pays twice. A retry must resume at confirm, never re-broadcast.
    let broadcasts = 0;
    let confirms = 0;
    const driver = scriptedDriver({
      async broadcast(step) {
        broadcasts++;
        return { txid: `0xtx${step.seq}` };
      },
      async confirm() {
        confirms++;
        if (confirms < 3) throw new DriverError('rpc timeout polling receipt', { retryable: true });
        return { confirmed: true, reverted: false };
      },
    });
    const { engine: e } = engine(driver);
    const exec = await e.execute(plan([{ seq: 0 }]));
    expect(exec.status).toBe('completed');
    expect(broadcasts).toBe(1); // ← the money assertion: exactly ONE on-chain send
    expect(confirms).toBe(3);
    expect(exec.steps[0]?.txid).toBe('0xtx0');
  });

  it('parks WITHOUT re-broadcasting when confirm never recovers (worst case)', async () => {
    // Even when every retry is exhausted, the step must end parked with exactly one on-chain
    // send — the funds are out there once, and a human resolves it. Sending again would be the
    // worst possible outcome of a monitoring failure.
    let broadcasts = 0;
    const driver = scriptedDriver({
      async broadcast(step) {
        broadcasts++;
        return { txid: `0xtx${step.seq}` };
      },
      async confirm() {
        throw new DriverError('rpc permanently unreachable', { retryable: true });
      },
    });
    const { engine: e } = engine(driver);
    const exec = await e.execute(plan([{ seq: 0 }]));
    expect(exec.status).toBe('parked');
    expect(broadcasts).toBe(1); // one send, never more
    expect(exec.steps[0]?.txid).toBe('0xtx0'); // the txid is retained so a human can check it
  });

  it('parks after exhausting retries on a persistent transient failure', async () => {
    const driver = scriptedDriver({
      async broadcast() {
        throw new DriverError('rpc down', { retryable: true });
      },
    });
    const { engine: e } = engine(driver);
    const exec = await e.execute(plan([{ seq: 0, chainId: 'base' }]));
    expect(exec.status).toBe('parked');
    expect(exec.fundsLocation.chainId).toBe('base');
    expect(exec.fundsLocation.note).toMatch(/safely/u);
  });
});

describe('park guarantee (never strand funds)', () => {
  it('parks with a known funds location on an unrecoverable failure', async () => {
    const events: ExecutionEvent[] = [];
    const driver = scriptedDriver({
      async broadcast() {
        throw new DriverError('permanent failure', { retryable: false });
      },
    });
    const { engine: e } = engine(driver, undefined, (ev) => events.push(ev));
    const exec = await e.execute(plan([{ seq: 0, chainId: 'ethereum' }]));
    expect(exec.status).toBe('parked');
    const parked = events.find((ev) => ev.type === 'execution.parked');
    expect(parked).toMatchObject({ fundsChainId: 'ethereum' });
  });

  it('parks when a post-confirmation invariant fails (funds moved but not as promised)', async () => {
    const driver = scriptedDriver({
      async verify() {
        return { ok: false, reason: 'received less than the minimum' };
      },
    });
    const { engine: e } = engine(driver);
    const exec = await e.execute(plan([{ seq: 0 }]));
    expect(exec.status).toBe('parked');
    expect(exec.steps[0]?.error).toMatch(/minimum/u);
  });

  it('parks when a broadcast tx reverts on-chain', async () => {
    const driver = scriptedDriver({
      async confirm() {
        return { confirmed: false, reverted: true };
      },
    });
    const { engine: e } = engine(driver);
    const exec = await e.execute(plan([{ seq: 0 }]));
    expect(exec.status).toBe('parked');
  });
});

describe('resumability (crash recovery)', () => {
  it('resumes from the first unconfirmed step after a mid-execution crash', async () => {
    const store = new InMemoryExecutionStore();
    // First run: step 0 confirms, step 1 fails transiently and parks.
    const failing = scriptedDriver({
      async broadcast(step) {
        if (step.seq === 1) throw new DriverError('flaky', { retryable: true });
        return { txid: `0xtx${step.seq}` };
      },
    });
    const first = new ExecutionEngine({ driver: failing, store, maxAttempts: 1 }, deps);
    const p = plan([
      { seq: 0, chainId: 'bitcoin' },
      { seq: 1, chainId: 'ethereum' },
    ]);
    const parked = await first.execute(p);
    expect(parked.status).toBe('parked');
    expect(parked.steps[0]?.status).toBe('confirmed'); // step 0 already done + persisted

    // Resume with a now-healthy driver: it must NOT re-run step 0, only finish step 1.
    let step0Broadcasts = 0;
    const healthy = scriptedDriver({
      async broadcast(step) {
        if (step.seq === 0) step0Broadcasts++;
        return { txid: `0xretry${step.seq}` };
      },
    });
    const second = new ExecutionEngine({ driver: healthy, store }, deps);
    // Reset step 1 to pending to simulate the recovery re-arming it (park→resume).
    const reloaded = (await store.load(parked.id))!;
    reloaded.status = 'running';
    reloaded.steps[1]!.status = 'pending';
    reloaded.steps[1]!.attempts = 0;
    await store.save(reloaded);

    const done = await second.resume(parked.id, p);
    expect(done.status).toBe('completed');
    expect(step0Broadcasts).toBe(0); // step 0 never re-broadcast — idempotent resume
    expect(done.steps[1]?.txid).toBe('0xretry1');
  });

  it('resume of an already-terminal execution is a no-op', async () => {
    const store = new InMemoryExecutionStore();
    const { engine: e } = { engine: new ExecutionEngine({ driver: scriptedDriver(), store }, deps) };
    const p = plan([{ seq: 0 }]);
    const done = await e.execute(p);
    const again = await e.resume(done.id, p);
    expect(again.status).toBe('completed');
  });
});

describe('dependency ordering', () => {
  it('does not start a step until its dependency is confirmed', async () => {
    const order: number[] = [];
    const driver = scriptedDriver({
      async broadcast(step) {
        order.push(step.seq);
        return { txid: `0x${step.seq}` };
      },
    });
    const { engine: e } = engine(driver);
    // seq 2 depends on seq 0; seq 1 depends on seq 0 too.
    await e.execute(
      plan([
        { seq: 0, dependsOn: [] },
        { seq: 1, dependsOn: [0] },
        { seq: 2, dependsOn: [1] },
      ]),
    );
    expect(order).toEqual([0, 1, 2]);
  });
});

describe('validation', () => {
  it('rejects an empty plan', async () => {
    const { engine: e } = engine(scriptedDriver());
    await expect(e.execute(plan([]))).rejects.toThrowError(expect.objectContaining({ code: 'INVALID_PLAN' }));
  });

  it('throws NOT_FOUND when resuming an unknown execution', async () => {
    const { engine: e } = engine(scriptedDriver());
    await expect(e.resume('nope', plan([{ seq: 0 }]))).rejects.toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });
});
