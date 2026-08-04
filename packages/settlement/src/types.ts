/**
 * Universal Settlement Engine — the shared vocabulary of the settlement layer.
 *
 * A settlement drives an approved `ExecutionPlan` through a fixed, ordered
 * pipeline to its financial OUTCOME (or a safe, explained stop). It is the
 * mandatory front door to execution: pre-flight re-validation, quote lock and
 * gas validation are non-skippable pipeline STAGES, so an approved-but-stale
 * plan can never reach broadcast. Everything is deterministic (time/ids
 * injected), observable (an append-only ledger), resumable (state saved after
 * every stage), and idempotent (a settlement id claim prevents double-execution).
 * It coordinates blockchain interactions; it never owns funds and never holds keys.
 */
import type { ExecutionPlan } from '@intent-wallet/intents';

export type { ExecutionPlan };

/** The ordered settlement pipeline. Each stage runs once, in order, and is recorded. */
export const SETTLEMENT_STAGES = [
  'preflight', // re-validate the plan against CURRENT state (balance, quote TTL, risk, gas, policy)
  'liquidity', // reserve provider/route liquidity
  'quote_lock', // lock the quote for the execution window
  'gas', // validate gas is affordable + a native max-send reserve
  'prepare', // build the unsigned transactions
  'execute', // sign (on device) → broadcast → confirm — delegated to the executor
  'cross_chain', // track cross-chain settlement (bridge legs) to the destination
  'reconcile', // reconcile actual on-chain effects against the plan
  'portfolio', // update the portfolio projection
  'notify', // notify the user of the outcome
] as const;
export type SettlementStage = (typeof SETTLEMENT_STAGES)[number];

export type SettlementStatus = 'in_progress' | 'settled' | 'parked' | 'compensated' | 'failed' | 'timed_out';

export interface StageRecord {
  stage: SettlementStage;
  status: 'ok' | 'failed' | 'skipped' | 'started'; // 'started' = an irreversible stage began but hasn't recorded ok (resume must PARK it, not re-run — F2)
  detail: string;
  atIso: string;
}

export interface Settlement {
  id: string;
  /** For tracing across systems/logs. */
  correlationId: string;
  planId: string;
  intentId: string;
  executionId?: string;
  status: SettlementStatus;
  /** The stage reached — where it settled, or where it stopped. */
  stage: SettlementStage;
  stages: StageRecord[];
  txids: string[];
  bridgeIds: string[];
  providerIds: string[];
  /** Why it parked / failed / compensated, when not settled. */
  reason?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

/** Append-only, replayable record of every settlement transition. */
export interface LedgerEntry {
  seq: number;
  settlementId: string;
  correlationId: string;
  stage: SettlementStage | 'lifecycle';
  event: string;
  detail: string;
  atIso: string;
}

// --- Recovery ---

export type RecoveryClass =
  | 'rpc_failure'
  | 'bridge_delay'
  | 'bridge_failure'
  | 'quote_expiry'
  | 'gas_spike'
  | 'chain_halt'
  | 'provider_outage'
  | 'partial_execution'
  | 'duplicate_execution'
  | 'unexpected_confirmation'
  | 'unknown';

export type RecoveryAction = 'retry' | 'requote' | 'wait' | 'park' | 'compensate' | 'ignore';

export interface RecoveryDecision {
  class: RecoveryClass;
  action: RecoveryAction;
  reason: string;
}

// --- Stage plumbing ---

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PreflightResult {
  ok: boolean;
  checks: PreflightCheck[];
}

export interface StageError {
  message: string;
  retryable?: boolean;
  class?: RecoveryClass;
}

export interface StageResult {
  ok: boolean;
  detail: string;
  /** Ids surfaced by the stage (txids/bridgeIds/providerIds/executionId). */
  ids?: { txids?: string[]; bridgeIds?: string[]; providerIds?: string[]; executionId?: string };
  error?: StageError;
}
