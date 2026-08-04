/**
 * Reliability & Self-Healing — the shared vocabulary of the SRE brain.
 *
 * SLIs (rate/errors/duration + saturation) become an error BUDGET and a burn
 * rate; burn drives ALERTS; alerts + failure signals drive bounded RECOVERY
 * DECISIONS. The engine DECIDES; an injected actuator ACTS — the engine never
 * restarts, reroutes, or scales anything itself, and safety bounds stop it from
 * looping or acting blind (it escalates to a human instead). Everything is
 * deterministic (time injected) and testable offline.
 */
export type HealthState = 'healthy' | 'degraded' | 'critical' | 'unknown';

/** A service-level indicator sample over a window. */
export interface Sli {
  service: string;
  windowSeconds: number;
  total: number;
  failures: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  /** Resource saturation normalized to [0,1] (CPU / memory / queue depth). */
  saturation: number;
}

export interface Slo {
  service: string;
  /** Availability objective, e.g. 0.9999 for 99.99%. */
  objective: number;
  /** Latency objective — p99 must stay under this. */
  p99BudgetMs: number;
  /** The window the error budget is measured over (e.g. 30 days). */
  budgetWindowSeconds: number;
}

export interface ErrorBudget {
  service: string;
  objective: number;
  failureRate: number;
  /** failureRate / (1 − objective). > 1 means burning faster than the budget allows. */
  burnRate: number;
  /** Cumulative fraction of the budget consumed, [0,∞). */
  budgetConsumed: number;
  /** max(0, 1 − consumed). */
  budgetRemaining: number;
}

export interface ServiceHealth {
  service: string;
  state: HealthState;
  reasons: string[];
  sli: Sli;
  budget: ErrorBudget;
}

// --- Alerting ---

export type AlertSeverity = 'page' | 'ticket' | 'info';

export interface Alert {
  key: string;
  code: string;
  severity: AlertSeverity;
  service: string;
  detail: string;
  firedAtIso: string;
}

export interface AlertState {
  lastFired: Record<string, string>;
}

// --- Self-healing ---

export type FailureKind =
  | 'high_latency'
  | 'execution_failure'
  | 'settlement_failure'
  | 'rpc_outage'
  | 'bridge_degradation'
  | 'provider_failure'
  | 'queue_congestion'
  | 'db_overload'
  | 'memory_leak'
  | 'cpu_spike'
  | 'node_failure'
  | 'security_incident';

export interface FailureSignal {
  service: string;
  kind: FailureKind;
  detail: string;
}

export type RecoveryAction =
  | 'none'
  | 'retry'
  | 'failover_provider'
  | 'reroute_traffic'
  | 'restart_worker'
  | 'rebuild_queue'
  | 'scale_out'
  | 'scale_in'
  | 'drain_node'
  | 'circuit_break'
  | 'escalate';

export interface RecoveryDecision {
  service: string;
  kind: FailureKind;
  action: RecoveryAction;
  reason: string;
  /** A safety bound (cooldown / max-actions / freeze) shaped this decision. */
  bounded: boolean;
  /** This needs a human. */
  escalate: boolean;
}

export interface HealingState {
  /** Recovery actions taken per service in the current window (rate limiting). */
  actionsInWindow: Record<string, number>;
  /** When the current rate-limit window opened, per service — used to reset actionsInWindow (N1). */
  windowStartIso: Record<string, string>;
  lastActionIso: Record<string, string>;
  /** Consecutive failed auto-recoveries per service (escalation trigger). */
  consecutiveFailures: Record<string, number>;
}

export interface Incident {
  id: string;
  service: string;
  severity: AlertSeverity;
  state: 'open' | 'auto_resolved' | 'escalated';
  alerts: Alert[];
  actions: RecoveryDecision[];
  openedAtIso: string;
}

export interface Runbook {
  /** The alert code this runbook responds to. */
  code: string;
  title: string;
  diagnostics: string[];
  remediation: string[];
  /** The action the self-healing engine will attempt automatically first. */
  autoAction: RecoveryAction;
}
