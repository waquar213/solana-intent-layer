/**
 * Execution state — the persisted, resumable record of a plan being executed.
 * Every state transition is explicit and saved, so a crash mid-execution
 * resumes exactly where it stopped, and the funds' location is ALWAYS known
 * (the park guarantee). This is the system-of-record shape the backend
 * persists; the engine is the only writer.
 */
import type { ExecutionPlan } from '@intent-wallet/intents';

export type ExecutionStatus = 'running' | 'completed' | 'parked' | 'failed';

export type StepStatus =
  | 'pending' // not started
  | 'simulating' // running the pre-broadcast simulation (the Execution Sandbox)
  | 'broadcasting' // signing on-device + broadcasting
  | 'confirming' // broadcast; awaiting on-chain confirmation
  | 'confirmed' // done, invariants verified
  | 'failed' // could not complete (execution recovers or parks)
  | 'reverted'; // included but reverted on-chain

export interface StepState {
  seq: number;
  kind: string;
  chainId: string;
  status: StepStatus;
  txid?: string;
  attempts: number;
  error?: string;
  dependsOn: number[];
}

export interface FundsLocation {
  chainId: string;
  /** Human-readable note shown to the user ("your 0.021 wBTC is safe on Ethereum"). */
  note: string;
}

export interface Execution {
  id: string;
  planId: string;
  status: ExecutionStatus;
  steps: StepState[];
  /** Where the user's funds are right now — never unknown, even when parked. */
  fundsLocation: FundsLocation;
  /** Caller-supplied timestamps (the package does no clock access). */
  startedAt?: string;
  finishedAt?: string;
}

/** Builds a fresh Execution record from an approved plan. */
export function initExecution(plan: ExecutionPlan, id: string, startedAt?: string): Execution {
  if (plan.steps.length === 0) throw new Error('cannot execute a plan with no steps');
  const firstChain = plan.sourceChains[0] ?? plan.steps[0]!.chainId;
  return {
    id,
    planId: plan.planId,
    status: 'running',
    steps: plan.steps.map((s) => ({
      seq: s.seq,
      kind: s.kind,
      chainId: s.chainId,
      status: 'pending',
      attempts: 0,
      dependsOn: s.dependsOn,
    })),
    fundsLocation: { chainId: firstChain, note: `Funds are on ${firstChain}.` },
    ...(startedAt !== undefined ? { startedAt } : {}),
  };
}

/** A step is runnable when it is pending — OR when a prior run already BROADCAST it (txid persisted) but
 *  crashed before a terminal status was recorded. Re-entering such a step lets #runStep observe
 *  alreadyBroadcast===true and resume at CONFIRM (it skips simulate+broadcast, so it never re-sends).
 *  Without this, nextRunnableStep skips a 'broadcasting'/'confirming' step and resume() wrongly reports the
 *  whole execution failed even though the tx is on-chain — defeating the persist-before-confirm save that
 *  exists precisely to make a cross-restart resume safe. In every case the dependencies must be confirmed. */
export function isRunnable(step: StepState, execution: Execution): boolean {
  const resumableInFlight = (step.status === 'broadcasting' || step.status === 'confirming') && step.txid !== undefined;
  if (step.status !== 'pending' && !resumableInFlight) return false;
  return step.dependsOn.every((dep) => execution.steps.find((s) => s.seq === dep)?.status === 'confirmed');
}

/** The next runnable step in seq order, or null if none can start right now. */
export function nextRunnableStep(execution: Execution): StepState | null {
  return execution.steps.filter((s) => isRunnable(s, execution)).sort((a, b) => a.seq - b.seq)[0] ?? null;
}

export function allConfirmed(execution: Execution): boolean {
  return execution.steps.every((s) => s.status === 'confirmed');
}
