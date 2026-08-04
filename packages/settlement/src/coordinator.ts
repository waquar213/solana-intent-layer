/**
 * SettlementCoordinator — the state machine that drives a plan through the
 * pipeline. Guarantees:
 *  - MANDATORY pre-flight: the first stage re-validates the plan against current
 *    state; a failure PARKS the settlement before any transaction is prepared or
 *    broadcast. An approved-but-stale plan can never reach execution.
 *  - Idempotent: the settlement id is derived from the plan id; a claimed id is
 *    never re-executed, so re-settling the same plan is a no-op that returns the
 *    existing result (no double-send).
 *  - Resumable: state is saved after every stage; `resume` continues from the
 *    remaining stages.
 *  - Recoverable: a stage failure is classified and handled (retry / requote /
 *    wait / compensate / ignore / park) — never stranding funds.
 *  - Observable: every transition is appended to the ledger.
 * It never owns funds and never holds keys — signing/broadcast happen inside the
 * injected executor (the Execution engine), on device.
 */
import { settlementIdFor, type SettlementEnv } from './env.js';
import { SettlementError } from './errors.js';
import { ledgerEntry } from './ledger.js';
import { classifyRecovery } from './recovery.js';
import type { SettlementSources } from './sources.js';
import { remainingStages } from './stages.js';

import type { ExecutionPlan, Settlement, SettlementStage, SettlementStatus, StageResult } from './types.js';
/**
 * Stages whose failure may leave an IRREVERSIBLE on-chain effect behind.
 *
 * `execute` is sign → broadcast → confirm: if the broadcast landed and only the confirm failed
 * (an RPC timeout while polling the receipt is the most common failure of all), re-running the
 * stage signs and sends the transfer a SECOND time. "Did my transaction land?" cannot be answered
 * by sending it again, so a retry decision on these stages is downgraded to `park` — reconcile or
 * a human resolves it with the txids already recorded.
 *
 * Every other stage is a read, a build, or a projection update, and is safe to retry.
 */
const IRREVERSIBLE_STAGES = new Set<SettlementStage>(['execute']);

export interface CoordinatorOptions {
  /** Max attempts per retryable stage before parking. Default 3. */
  maxAttemptsPerStage?: number;
  /** Settlement is timed out if it exceeds this wall-clock budget. Default 3600s. */
  maxSettlementSeconds?: number;
}

const elapsedSeconds = (fromIso: string, toIso: string): number => (Date.parse(toIso) - Date.parse(fromIso)) / 1000;

export class SettlementCoordinator {
  private readonly maxAttempts: number;
  private readonly maxSeconds: number;

  constructor(
    private readonly sources: SettlementSources,
    private readonly env: SettlementEnv,
    options: CoordinatorOptions = {},
  ) {
    this.maxAttempts = options.maxAttemptsPerStage ?? 3;
    this.maxSeconds = options.maxSettlementSeconds ?? 3600;
  }

  /** Settle an approved plan. Idempotent on the plan id. */
  async settle(plan: ExecutionPlan): Promise<Settlement> {
    if (plan.steps.length === 0) throw new SettlementError('INVALID_PLAN', 'plan has no steps');
    const id = settlementIdFor(plan.planId, this.env);

    const claimed = await this.sources.store.claim(id);
    if (!claimed) {
      // Another settle() already claimed this id. Do NOT drive it here — a second concurrent driver would
      // run every remaining stage IN PARALLEL with the first, double-broadcasting / double-executing an
      // irreversible plan (the in-drive IRREVERSIBLE_STAGES retry-suppression guards a single driver, not
      // two). Return the current persisted settlement as-is; recovery is an explicit resume(), never a
      // second concurrent driver.
      const existing = await this.sources.store.load(id);
      if (existing) return existing;
      // Claim lost but nothing persisted yet = the winner is between its claim and its first save.
      // Surface a retriable IN_PROGRESS rather than falling through to CREATE A SECOND settlement with the
      // same id (which would then also double-drive).
      throw new SettlementError('IN_PROGRESS', `settlement ${id} is being created by a concurrent settle — retry or resume`);
    }

    const now = this.env.now();
    const settlement: Settlement = {
      id,
      correlationId: this.env.ids.correlation(),
      planId: plan.planId,
      intentId: plan.intentId,
      status: 'in_progress',
      stage: 'preflight',
      stages: [],
      txids: [],
      bridgeIds: [],
      providerIds: [],
      createdAtIso: now,
      updatedAtIso: now,
    };
    await this.sources.store.save(settlement);
    await this.log(settlement, 'lifecycle', 'created', `settlement for plan ${plan.planId}`, 0);
    return this.drive(settlement, plan);
  }

  /** Resume a persisted settlement from where it stopped. */
  async resume(id: string, plan: ExecutionPlan): Promise<Settlement> {
    const settlement = await this.sources.store.load(id);
    if (!settlement) throw new SettlementError('NOT_FOUND', `no settlement ${id}`);
    if (settlement.status !== 'in_progress') return settlement;
    return this.drive(settlement, plan);
  }

  private async drive(settlement: Settlement, plan: ExecutionPlan): Promise<Settlement> {
    let seq = (await this.sources.store.ledger(settlement.id)).length;

    for (const stage of remainingStages(settlement.stages)) {
      if (elapsedSeconds(settlement.createdAtIso, this.env.now()) > this.maxSeconds) {
        return this.finish(settlement, 'timed_out', `exceeded ${this.maxSeconds}s budget`, stage, seq);
      }
      settlement.stage = stage;

      // MANDATORY pre-flight — the plan is re-validated against current state.
      if (stage === 'preflight') {
        const pf = await this.sources.preflight.validate(plan);
        if (!pf.ok) {
          const why =
            pf.checks
              .filter((c) => !c.ok)
              .map((c) => `${c.name}: ${c.detail}`)
              .join('; ') || 'stale plan';
          this.record(settlement, 'preflight', 'failed', why);
          seq = await this.log(settlement, 'preflight', 'failed', why, seq);
          return this.finish(settlement, 'parked', `pre-flight failed — ${why}`, 'preflight', seq);
        }
        this.record(settlement, 'preflight', 'ok', `${pf.checks.length} check(s) passed`);
        seq = await this.log(settlement, 'preflight', 'ok', 'revalidated against current state', seq);
        await this.sources.store.save(settlement);
        continue;
      }

      // F2: an IRREVERSIBLE stage (execute) must not RE-RUN on resume after a crash between its on-chain
      // effect and its 'ok' record — that would double-broadcast. If we re-enter and find a prior 'started'
      // marker for this stage, the effect may already be on-chain → PARK for reconciliation. Otherwise
      // persist 'started' BEFORE running, so a crash mid-stage is detectable on resume.
      if (IRREVERSIBLE_STAGES.has(stage)) {
        if (settlement.stages.some((r) => r.stage === stage && r.status === 'started')) {
          this.record(settlement, stage, 'failed', 'started but unconfirmed on resume');
          seq = await this.log(settlement, stage, 'recovery', 'irreversible stage started but unconfirmed on resume — parking', seq);
          return this.finish(settlement, 'parked', `irreversible stage '${stage}' started but unconfirmed — reconcile`, stage, seq);
        }
        this.record(settlement, stage, 'started', 'irreversible stage started');
        await this.sources.store.save(settlement);
      }

      // Other stages: run with recovery.
      let attempts = 0;
      let result: StageResult = { ok: false, detail: 'unrun' };
      while (attempts < this.maxAttempts) {
        attempts += 1;
        try {
          result = await this.runStage(stage, plan, settlement);
        } catch (err) {
          // F6: a stage that THREW (vs returned {ok:false}) must not escape drive unclassified — that
          // leaves the settlement stuck in_progress with an unrecorded (possibly on-chain) effect. Turn it
          // into a failed StageResult so the classify→park/compensate path below handles it (unknown→park).
          result = { ok: false, detail: 'stage threw', error: { message: err instanceof Error ? err.message : String(err), retryable: false, class: 'unknown' } };
        }
        if (result.ok) break;
        const decision = classifyRecovery(result.error);
        seq = await this.log(
          settlement,
          stage,
          'recovery',
          `${decision.class} → ${decision.action}: ${decision.reason}`,
          seq,
        );
        const mayRetry = decision.action === 'retry' && !IRREVERSIBLE_STAGES.has(stage);
        if (mayRetry && attempts < this.maxAttempts) continue;
        if (decision.action === 'retry' && !mayRetry) {
          // Irreversible stage: stop rather than risk a duplicate on-chain effect.
          this.record(settlement, stage, 'failed', decision.reason);
          seq = await this.log(settlement, stage, 'recovery', `retry suppressed on irreversible stage: ${decision.reason}`, seq);
          return this.finish(settlement, 'parked', `park (irreversible stage, unconfirmed): ${decision.reason}`, stage, seq);
        }
        if (decision.action === 'ignore') {
          result = { ok: true, detail: `ignored (${decision.class})` };
          break;
        }
        if (decision.action === 'compensate') {
          await this.compensate(plan);
          this.record(settlement, stage, 'failed', decision.reason);
          seq = await this.log(settlement, stage, 'compensated', decision.reason, seq);
          return this.finish(settlement, 'compensated', decision.reason, stage, seq);
        }
        // wait / requote / park → stop safely; resumable or needs an upstream requote.
        this.record(settlement, stage, 'failed', decision.reason);
        return this.finish(settlement, 'parked', `${decision.action}: ${decision.reason}`, stage, seq);
      }
      if (!result.ok) {
        this.record(settlement, stage, 'failed', 'exhausted retries');
        return this.finish(settlement, 'parked', `${stage}: exhausted retries`, stage, seq);
      }

      this.mergeIds(settlement, result.ids);
      this.record(settlement, stage, 'ok', result.detail);
      seq = await this.log(settlement, stage, 'ok', result.detail, seq);
      await this.sources.store.save(settlement);
    }

    return this.finish(settlement, 'settled', 'all stages complete', 'notify', seq);
  }

  private runStage(stage: SettlementStage, plan: ExecutionPlan, settlement: Settlement): Promise<StageResult> {
    switch (stage) {
      case 'liquidity':
        return this.sources.liquidity.run(plan);
      case 'quote_lock':
        return this.sources.quoteLock.run(plan);
      case 'gas':
        return this.sources.gas.run(plan);
      case 'prepare':
        return this.sources.prepare.run(plan);
      case 'execute':
        return this.sources.executor.run(plan);
      case 'cross_chain':
        return this.sources.crossChain.run(plan);
      case 'reconcile':
        return this.sources.reconcile.run(plan);
      case 'portfolio':
        return this.sources.portfolio.update(plan).then(() => ({ ok: true, detail: 'portfolio updated' }));
      case 'notify':
        return this.sources.notifier.notify(settlement).then(() => ({ ok: true, detail: 'user notified' }));
      default:
        return Promise.resolve({ ok: true, detail: 'skip' });
    }
  }

  private async compensate(plan: ExecutionPlan): Promise<void> {
    if (this.sources.compensator) await this.sources.compensator.run(plan);
  }

  private async finish(
    settlement: Settlement,
    status: SettlementStatus,
    reason: string,
    stage: SettlementStage,
    seq: number,
  ): Promise<Settlement> {
    settlement.status = status;
    settlement.stage = stage;
    settlement.reason = reason;
    settlement.updatedAtIso = this.env.now();
    await this.sources.store.save(settlement);
    await this.log(settlement, 'lifecycle', status, reason, seq);
    // On any non-settled terminal, still tell the user (settled already ran the notify stage).
    if (status !== 'settled') {
      try {
        await this.sources.notifier.notify(settlement);
      } catch {
        // notification is best-effort and must never mask the settlement outcome
      }
    }
    return settlement;
  }

  private record(
    settlement: Settlement,
    stage: SettlementStage,
    status: 'ok' | 'failed' | 'skipped' | 'started',
    detail: string,
  ): void {
    settlement.stages.push({ stage, status, detail, atIso: this.env.now() });
  }

  private mergeIds(settlement: Settlement, ids: StageResult['ids']): void {
    if (!ids) return;
    const add = (target: string[], values?: string[]): void => {
      for (const v of values ?? []) if (!target.includes(v)) target.push(v);
    };
    add(settlement.txids, ids.txids);
    add(settlement.bridgeIds, ids.bridgeIds);
    add(settlement.providerIds, ids.providerIds);
    if (ids.executionId !== undefined) settlement.executionId = ids.executionId;
  }

  private async log(
    settlement: Settlement,
    stage: SettlementStage | 'lifecycle',
    event: string,
    detail: string,
    seq: number,
  ): Promise<number> {
    await this.sources.store.appendLedger(ledgerEntry(seq, settlement, stage, event, detail, this.env));
    return seq + 1;
  }
}
