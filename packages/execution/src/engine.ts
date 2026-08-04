/**
 * ExecutionEngine — runs an approved ExecutionPlan as a persisted, resumable
 * step machine. Per step, in strict dependency order:
 *
 *   simulate (sandbox gate) → broadcast (device-signed) → confirm → verify
 *
 * Guarantees:
 * - Simulate-before-broadcast: if the simulation's effects don't match the
 *   plan, the step is NEVER broadcast (the Execution Sandbox).
 * - Idempotent retries: transient failures retry the same step up to a cap.
 * - Never strand funds: an unrecoverable failure PARKS the execution, recording
 *   exactly where the funds are and stopping — it never leaves them in limbo.
 * - Resumable: state is saved after every transition, so a crash resumes at the
 *   first unconfirmed step (proven by the resume tests).
 * - Non-custodial: signing happens inside the injected driver, on-device; the
 *   engine never sees a key.
 */
import type { ExecutionPlan } from '@intent-wallet/intents';
import { allConfirmed, initExecution, nextRunnableStep, type Execution, type StepState } from './state.js';
import { DriverError, type StepDriver } from './driver.js';
import type { ExecutionStore } from './store.js';
import type { EventSink } from './events.js';
import { ExecutionError } from './errors.js';

export interface ExecutionEngineOptions {
  driver: StepDriver;
  store: ExecutionStore;
  onEvent?: EventSink;
  /** Max attempts per step before parking. Default 3. */
  maxAttempts?: number;
}

export interface ExecutionEngineDeps {
  /** Stable id generator (the package does no RNG/clock). */
  ids: { execution(): string };
  /** Optional caller-supplied timestamp for started/finished. */
  now?: () => string;
}

export class ExecutionEngine {
  readonly #driver: StepDriver;
  readonly #store: ExecutionStore;
  readonly #emit: EventSink;
  readonly #maxAttempts: number;
  readonly #deps: ExecutionEngineDeps;

  constructor(options: ExecutionEngineOptions, deps: ExecutionEngineDeps) {
    this.#driver = options.driver;
    this.#store = options.store;
    this.#emit = options.onEvent ?? (() => {});
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#deps = deps;
  }

  /** Starts executing an approved plan. Returns the terminal execution record. */
  async execute(plan: ExecutionPlan): Promise<Execution> {
    if (plan.steps.length === 0) throw new ExecutionError('INVALID_PLAN', 'plan has no steps');
    const execution = initExecution(plan, this.#deps.ids.execution(), this.#deps.now?.());
    await this.#store.save(execution);
    this.#emit({ type: 'execution.started', executionId: execution.id, planId: plan.planId });
    return this.#drive(execution, plan);
  }

  /** Resumes a persisted execution (after a crash/restart) from where it stopped. */
  async resume(executionId: string, plan: ExecutionPlan): Promise<Execution> {
    const execution = await this.#store.load(executionId);
    if (!execution) throw new ExecutionError('NOT_FOUND', `no execution ${executionId}`);
    if (execution.status !== 'running') return execution; // already terminal — nothing to do
    return this.#drive(execution, plan);
  }

  /** The step-machine loop: run the next runnable step until terminal. */
  async #drive(execution: Execution, plan: ExecutionPlan): Promise<Execution> {
    while (execution.status === 'running') {
      const step = nextRunnableStep(execution);
      if (!step) {
        // No runnable step: either all done, or a non-confirmed step is blocked.
        execution.status = allConfirmed(execution) ? 'completed' : 'failed';
        break;
      }
      const outcome = await this.#runStep(step, plan, execution);
      if (outcome === 'confirmed') {
        this.#advanceFunds(step, plan, execution);
      } else if (outcome === 'park') {
        await this.#park(execution, step);
        return execution;
      }
      await this.#store.save(execution);
    }
    this.#stampFinished(execution);
    if (execution.status === 'completed') this.#emit({ type: 'execution.completed', executionId: execution.id });
    else if (execution.status === 'failed')
      this.#emit({ type: 'execution.failed', executionId: execution.id, reason: 'a step could not complete' });
    await this.#store.save(execution);
    return execution;
  }

  /** Runs one step through simulate → broadcast → confirm → verify, with retries. */
  async #runStep(step: StepState, plan: ExecutionPlan, execution: Execution): Promise<'confirmed' | 'park'> {
    const executionId = execution.id;
    const planStep = plan.steps.find((s) => s.seq === step.seq)!;

    while (step.attempts < this.#maxAttempts) {
      step.attempts += 1;

      // A retry must NEVER re-send a transaction that is already on-chain. Once `step.txid` is set
      // the funds have moved and only OBSERVING the result failed (an RPC timeout while polling
      // the receipt is routine). Re-running simulate+broadcast would sign and send a SECOND
      // transfer — the user pays twice — so a retry resumes at CONFIRM instead.
      const alreadyBroadcast = step.txid !== undefined;

      if (!alreadyBroadcast) {
        // 1. Simulate (the Execution Sandbox). A mismatch is NEVER broadcast.
        step.status = 'simulating';
        this.#emit({ type: 'step.simulating', executionId, seq: step.seq });
        const sim = await this.#driver.simulate(planStep, plan);
        if (!sim.ok) {
          step.status = 'failed';
          step.error = sim.reason ?? 'simulation mismatch';
          this.#emitStepFailed(executionId, step, false);
          return 'park'; // simulation mismatch is never retried or broadcast
        }
      }

      if (!alreadyBroadcast) {
        // 2. Broadcast (device-signed inside the driver). Isolated in its OWN try that parks on ANY throw,
        // independent of the DriverError's retryable flag: a broadcast that reached the mempool but then
        // threw (a lost response) could be on-chain, so a blind retry would DOUBLE-SEND. "Broadcast is
        // never blind-retryable" is now STRUCTURAL, not a convention one driver author could break.
        step.status = 'broadcasting';
        let sent: string;
        try {
          ({ txid: sent } = await this.#driver.broadcast(planStep, plan));
        } catch (err) {
          step.error = err instanceof DriverError ? err.message : String(err);
          step.status = 'failed';
          this.#emitStepFailed(executionId, step, false);
          return 'park';
        }
        step.txid = sent;
        this.#emit({ type: 'step.broadcast', executionId, seq: step.seq, txid: sent });
        // Persist the txid BEFORE the confirm await. Polling for a receipt routinely takes seconds; a
        // crash in that window would otherwise lose the txid, and resume() — seeing no txid — would
        // re-simulate and RE-BROADCAST (double-send). Saving here makes a resumed run observe
        // alreadyBroadcast===true and correctly resume at confirm, across a restart, not just in-process.
        await this.#store.save(execution);
      }

      try {
        const txid = step.txid as string;

        // 3. Confirm on-chain. A PENDING receipt (no receipt yet) is NOT a revert — it's retry-and-wait;
        // only a real revert parks. Collapsing !confirmed into the revert branch mislabeled a healthy
        // in-flight tx "reverted" and parked it (a real gateway returns {confirmed:false,reverted:false}
        // while a tx is still in the mempool).
        step.status = 'confirming';
        const conf = await this.#driver.confirm(planStep, txid);
        if (conf.reverted) {
          throw new DriverError('transaction reverted on-chain', { retryable: false, recovery: 'park' });
        }
        if (!conf.confirmed) {
          throw new DriverError('transaction not yet confirmed', { retryable: true, recovery: 'retry' });
        }

        // 4. Verify invariants (e.g. received ≥ minReceived).
        const verify = await this.#driver.verify(planStep, plan, txid);
        if (!verify.ok) {
          step.status = 'failed';
          step.error = verify.reason ?? 'post-execution invariant failed';
          this.#emitStepFailed(executionId, step, false);
          return 'park'; // funds moved but not as promised → stop and park
        }

        step.status = 'confirmed';
        this.#emit({ type: 'step.confirmed', executionId, seq: step.seq, txid });
        return 'confirmed';
      } catch (err) {
        const driverErr = err instanceof DriverError ? err : new DriverError(String(err), { retryable: false });
        step.error = driverErr.message;
        this.#emitStepFailed(executionId, step, driverErr.retryable);
        if (driverErr.retryable && step.attempts < this.#maxAttempts) {
          continue; // idempotent retry of the same step
        }
        step.status = 'failed';
        return 'park';
      }
    }
    step.status = 'failed';
    return 'park';
  }

  #advanceFunds(step: StepState, plan: ExecutionPlan, execution: Execution): void {
    const planStep = plan.steps.find((s) => s.seq === step.seq)!;
    const after = this.#driver.fundsAfter?.(planStep, plan);
    if (after) execution.fundsLocation = after;
    else execution.fundsLocation = { chainId: step.chainId, note: `Funds are on ${step.chainId}.` };
  }

  async #park(execution: Execution, step: StepState): Promise<void> {
    execution.status = 'parked';
    this.#stampFinished(execution);
    execution.fundsLocation = {
      chainId: step.chainId,
      note: `Paused safely. Your funds are on ${step.chainId} and can be resumed.`,
    };
    await this.#store.save(execution);
    this.#emit({
      type: 'execution.parked',
      executionId: execution.id,
      reason: step.error ?? 'unrecoverable step failure',
      fundsChainId: step.chainId,
    });
  }

  #stampFinished(execution: Execution): void {
    const finishedAt = this.#deps.now?.();
    if (finishedAt !== undefined) execution.finishedAt = finishedAt;
  }

  #emitStepFailed(executionId: string, step: StepState, retryable: boolean): void {
    this.#emit({
      type: 'step.failed',
      executionId,
      seq: step.seq,
      reason: step.error ?? 'step failed',
      retryable,
    });
  }
}
