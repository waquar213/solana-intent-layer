/**
 * Automation & Workflow Engine — the shared vocabulary of the autonomous layer.
 *
 * A `Workflow` is a typed rule: TRIGGER → CONDITIONS → ACTIONS. It is DATA (a
 * discriminated-union model, not a string DSL), so it typechecks at authoring
 * time, serializes to JSON, versions, and diffs. When a workflow fires it does
 * NOT act on its own authority — it builds a proposed action and runs it through
 * the SAME Policy (+Risk) gate a manual action uses, then executes via a
 * pre-authorized, policy-bounded session key. The engine orchestrates; it holds
 * no keys and never bypasses the gate.
 *
 * Money is integer bigint micro-USD (µUSD); every timestamp is injected, never
 * read from the clock — the whole engine is deterministic and time-travel testable.
 */
import type { ConfirmationRequirement, ExecutionPermission } from '@intent-wallet/policy';

export type WorkflowStatus = 'active' | 'paused' | 'disabled';

// --- Triggers: what starts a workflow ---

export type Trigger =
  | { kind: 'schedule'; every: 'day' | 'week' | 'month'; atHourUtc: number; dayOfWeek?: number; dayOfMonth?: number }
  | { kind: 'price'; symbol: string; direction: 'above' | 'below'; thresholdMicros: bigint }
  | { kind: 'price_move'; symbol: string; direction: 'drops' | 'rises'; pct: number }
  | {
      kind: 'portfolio';
      metric: 'health' | 'drawdown' | 'risk_score' | 'net_worth';
      direction: 'above' | 'below';
      value: number;
    }
  | { kind: 'risk_event'; minSeverity: 'low' | 'medium' | 'high' }
  | { kind: 'volatility'; annualAbove: number }
  | { kind: 'chain_event'; eventType: string }
  | { kind: 'bridge_incident'; bridge: string }
  | { kind: 'gas'; direction: 'above' | 'below'; gwei: number }
  | { kind: 'ai_recommendation'; code: string }
  | { kind: 'webhook'; endpointId: string };

// --- Conditions: a typed AST gating whether the actions run ---

export type Condition =
  | { op: 'always' }
  | { op: 'and'; all: Condition[] }
  | { op: 'or'; any: Condition[] }
  | { op: 'not'; expr: Condition }
  | { op: 'price_gte'; symbol: string; microsUsd: bigint }
  | { op: 'price_lte'; symbol: string; microsUsd: bigint }
  | { op: 'metric'; metric: 'health' | 'drawdown' | 'risk_score' | 'net_worth'; cmp: 'gte' | 'lte'; value: number }
  | { op: 'gas_below'; gwei: number }
  | { op: 'day_of_week'; day: number }
  | { op: 'variable'; name: string; cmp: 'gte' | 'lte' | 'eq'; value: number };

// --- Actions: what the workflow does (each authorized before it runs) ---

export type Action =
  | { kind: 'swap'; fromAsset: string; toAsset: string; amountMicros: bigint; chainId: string }
  | { kind: 'bridge'; asset: string; fromChain: string; toChain: string; amountMicros: bigint }
  | { kind: 'transfer'; asset: string; toAddress: string; chainId: string; amountMicros: bigint }
  | { kind: 'stake'; asset: string; protocol: string; amountMicros: bigint; chainId: string }
  | { kind: 'unstake'; asset: string; protocol: string; amountMicros: bigint; chainId: string }
  | { kind: 'claim_rewards'; protocol: string; chainId: string }
  | { kind: 'approve'; token: string; spender: string; amountBase: bigint; decimals: number; chainId: string }
  | { kind: 'notify'; message: string }
  | { kind: 'report'; report: string }
  | { kind: 'pause_workflow'; workflowId: string }
  | { kind: 'disable_workflow'; workflowId: string }
  | { kind: 'execute_intent'; utterance: string };

/** Scheduling-level safety. Authorization limits (amount, recipient, biometric) are the Policy Engine's job. */
export interface Safety {
  /** Max runs per UTC day. */
  maxDailyRuns?: number;
  /** Minimum seconds between two runs of this workflow. */
  cooldownSeconds?: number;
  /** A run older than this (from fire to execute) is abandoned. */
  timeoutSeconds?: number;
  /** Force user approval even when Policy would allow. */
  requireApproval?: boolean;
}

export interface Workflow {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  trigger: Trigger;
  condition: Condition;
  actions: Action[];
  safety: Safety;
  status: WorkflowStatus;
  version: number;
  createdAtIso: string;
  /** The pre-authorized, policy-bounded session key automated execution uses (non-custodial). */
  sessionKeyId?: string;
  /** ISO timestamp of the last run (for cooldown + next-fire). */
  lastRunAtIso?: string;
  /** Missed-schedule policy: fire once on catch-up, or skip entirely. */
  catchUp: 'skip' | 'once';
}

// --- Evaluation context the trigger + conditions read (all injected, never fetched) ---

export interface EvalContext {
  nowIso: string;
  prices: Record<string, bigint>; // symbol → µUSD per whole token
  /** Percent moves over the trigger's reference window, per symbol (e.g. -0.1 = down 10%). */
  priceMoves: Record<string, number>;
  portfolio: { health: number; drawdown: number; risk_score: number; net_worth: number };
  gasGwei: number;
  variables: Record<string, number>;
  /** Active market/security events (risk alerts, bridge incidents, chain events). */
  events: Array<{ kind: string; subject: string; severity: 'low' | 'medium' | 'high' }>;
}

// --- Runs: one firing of a workflow through the gate ---

export type RunStatus = 'skipped' | 'condition_unmet' | 'awaiting_approval' | 'executed' | 'blocked' | 'failed';

export interface ActionResult {
  action: Action;
  status: 'authorized_executed' | 'awaiting_approval' | 'blocked' | 'skipped' | 'failed';
  permission?: ExecutionPermission;
  requirements: ConfirmationRequirement[];
  detail: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  ownerId: string;
  firedAtIso: string;
  status: RunStatus;
  /** Dedup key — one logical firing executes at most once. */
  idempotencyKey: string;
  actions: ActionResult[];
  notes: string[];
}
