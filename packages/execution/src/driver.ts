/**
 * StepDriver — the chain-facing boundary the engine drives each step through.
 * The real implementation (Phase 7 wiring) builds the tx, gets a DEVICE
 * signature (never a server key), broadcasts via the AdapterRegistry, and polls
 * for confirmation. The engine owns ordering, retries, recovery, parking, and
 * persistence; the driver owns the single-step chain interaction. Injecting it
 * makes the whole engine testable without a network.
 *
 * Cardinal rule: the driver SIGNS ON THE DEVICE and the engine NEVER sees a
 * key — the non-custodial invariant holds through execution.
 */
import type { ExecutionPlan, PlanStep } from '@intent-wallet/intents';

export interface SimulationResult {
  /** True iff the simulated effects match what the plan promised. */
  ok: boolean;
  /** Why the simulation was rejected (shown to the user, never broadcast). */
  reason?: string;
}

export interface ConfirmationResult {
  confirmed: boolean;
  /** Included on-chain but reverted. */
  reverted: boolean;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/** How a failed step should be recovered. */
export type RecoveryHint = 'retry' | 'requote' | 'park';

/** A driver failure carries whether it is safe to retry and the suggested recovery. */
export class DriverError extends Error {
  readonly retryable: boolean;
  readonly recovery: RecoveryHint;
  constructor(message: string, options: { retryable?: boolean; recovery?: RecoveryHint } = {}) {
    super(message);
    this.name = 'DriverError';
    this.retryable = options.retryable ?? false;
    this.recovery = options.recovery ?? (options.retryable ? 'retry' : 'park');
  }
}

export interface StepDriver {
  /** Pre-broadcast simulation (the Execution Sandbox). If !ok, the step is NEVER broadcast. */
  simulate(step: PlanStep, plan: ExecutionPlan): Promise<SimulationResult>;
  /** Build → device-sign → broadcast. Returns the txid. Throws DriverError on failure. */
  broadcast(step: PlanStep, plan: ExecutionPlan): Promise<{ txid: string }>;
  /** Await terminal on-chain state for a broadcast tx. */
  confirm(step: PlanStep, txid: string): Promise<ConfirmationResult>;
  /** Post-confirmation invariant check (e.g. received ≥ minReceived). */
  verify(step: PlanStep, plan: ExecutionPlan, txid: string): Promise<VerifyResult>;
  /**
   * Where funds sit after `step` confirms — so the engine can always report the
   * funds' location, especially on a park. Defaults to the step's chain.
   */
  fundsAfter?(step: PlanStep, plan: ExecutionPlan): { chainId: string; note: string };
}
