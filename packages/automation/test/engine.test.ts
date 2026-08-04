import { describe, expect, it } from 'vitest';
import type { Workflow } from '../src/index.js';
import { dcaWorkflow, makeEngine, NOW_MONDAY, SANCT, sanctioningRisk } from './fakes.js';

describe('AutomationEngine — the gate cannot be bypassed', () => {
  it('executes a small pre-authorized action via the session key', async () => {
    const { engine, executor } = makeEngine();
    const run = await engine.runWorkflow(dcaWorkflow());
    expect(run.status).toBe('executed');
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]!.ctx.sessionKeyId).toBe('sk-1'); // never the master key
    expect(executor.calls[0]!.ctx.permission.mayProceedToSign).toBe(true);
  });

  it('PARKS a large action for approval and never executes it', async () => {
    const { engine, executor } = makeEngine();
    const big = dcaWorkflow({
      actions: [{ kind: 'swap', fromAsset: 'USDC', toAsset: 'BTC', amountMicros: 5_000_000_000n, chainId: 'ethereum' }],
    });
    const run = await engine.runWorkflow(big);
    expect(run.status).toBe('awaiting_approval'); // $5000 > biometric threshold
    expect(executor.calls).toHaveLength(0);
    expect(run.actions[0]!.requirements.length).toBeGreaterThan(0);
  });

  it('BLOCKS an action Risk blocks (sanctioned recipient) and never executes it', async () => {
    const { engine, executor } = makeEngine({ risk: sanctioningRisk() });
    const wf = dcaWorkflow({
      actions: [{ kind: 'transfer', asset: 'USDC', toAddress: SANCT, chainId: 'ethereum', amountMicros: 100_000_000n }],
    });
    const run = await engine.runWorkflow(wf);
    expect(run.status).toBe('blocked');
    expect(executor.calls).toHaveLength(0);
  });

  it('the kill switch stops every workflow', async () => {
    const { engine, executor } = makeEngine();
    engine.setKillSwitch(true);
    const run = await engine.runWorkflow(dcaWorkflow());
    expect(run.status).toBe('skipped');
    expect(executor.calls).toHaveLength(0);
  });

  it('a paused workflow does not fire', async () => {
    const { engine, executor } = makeEngine();
    const run = await engine.runWorkflow(dcaWorkflow({ status: 'paused' }));
    expect(run.status).toBe('skipped');
    expect(executor.calls).toHaveLength(0);
  });

  it('idempotency: the same trigger instance runs at most once', async () => {
    const { engine, executor } = makeEngine();
    const wf = dcaWorkflow();
    const first = await engine.runWorkflow(wf);
    const second = await engine.runWorkflow(wf); // same now → same instance
    expect(first.status).toBe('executed');
    expect(second.status).toBe('skipped');
    expect(second.notes.join()).toMatch(/duplicate/);
    expect(executor.calls).toHaveLength(1); // executed exactly once
  });

  it('simulate authorizes but never executes or persists a run', async () => {
    const { engine, executor, runs } = makeEngine();
    const run = await engine.simulate(dcaWorkflow());
    expect(run.status).toBe('executed'); // would proceed
    expect(run.actions[0]!.detail).toMatch(/simulated/);
    expect(executor.calls).toHaveLength(0);
    expect(await runs.history('wf-1')).toHaveLength(0); // nothing persisted
  });

  it('skips a schedule whose instance already ran', async () => {
    const { engine, executor } = makeEngine();
    const wf: Workflow = dcaWorkflow({ lastRunAtIso: NOW_MONDAY }); // already ran this Monday's instance
    const run = await engine.runWorkflow(wf);
    expect(run.status).toBe('skipped');
    expect(executor.calls).toHaveLength(0);
  });
});
