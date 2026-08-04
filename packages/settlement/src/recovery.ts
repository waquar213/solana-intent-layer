/**
 * Recovery classification — deterministic mapping from a failure class to an
 * action. This is the Recovery Manager's brain: given how a stage failed, decide
 * whether to retry (transient RPC/provider), wait (bridge still settling),
 * requote (quote expired / gas spiked — the amounts are stale), compensate
 * (bridge failed / partial execution — reverse what completed), ignore
 * (duplicate / already-confirmed — idempotency), or park (chain halt / unknown —
 * stop safely, funds untouched).
 */
import type { RecoveryAction, RecoveryClass, RecoveryDecision, StageError } from './types.js';

const ACTION_BY_CLASS: Record<RecoveryClass, RecoveryAction> = {
  rpc_failure: 'retry',
  provider_outage: 'retry',
  bridge_delay: 'wait',
  bridge_failure: 'compensate',
  partial_execution: 'compensate',
  quote_expiry: 'requote',
  gas_spike: 'requote',
  chain_halt: 'park',
  duplicate_execution: 'ignore',
  unexpected_confirmation: 'ignore',
  unknown: 'park',
};

export function classifyRecovery(error: StageError | undefined): RecoveryDecision {
  const cls: RecoveryClass = error?.class ?? (error?.retryable ? 'rpc_failure' : 'unknown');
  return { class: cls, action: ACTION_BY_CLASS[cls], reason: error?.message ?? 'stage failed' };
}
