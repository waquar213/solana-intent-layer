/**
 * @intent-wallet/reliability — the Reliability & Self-Healing engine (the SRE
 * brain). SLIs → error-budget burn → multi-severity alerts → BOUNDED recovery
 * decisions. The engine DECIDES; an injected actuator ACTS — it can propose a
 * restart/failover/scale but cannot perform one, cannot loop (rate limit +
 * cooldown + escalate-after-N), never auto-heals a security incident silently,
 * and does nothing during a change freeze. Deterministic and offline-testable.
 * Standalone (no internal deps).
 */
export type {
  HealthState,
  Sli,
  Slo,
  ErrorBudget,
  ServiceHealth,
  AlertSeverity,
  Alert,
  AlertState,
  FailureKind,
  FailureSignal,
  RecoveryAction,
  RecoveryDecision,
  HealingState,
  Incident,
  Runbook,
} from './types.js';

export { createTestEnv, type ReliabilityEnv, type TestEnvOptions } from './env.js';
export { computeErrorBudget, round } from './slo.js';
export { computeHealth, DEFAULT_HEALTH_THRESHOLDS, type HealthThresholds } from './health.js';
export { evaluateAlerts, emptyAlertState, DEFAULT_ALERT_CONFIG, type AlertConfig } from './alerts.js';
export { decideRecovery, emptyHealingState, DEFAULT_HEALING_CONFIG, type HealingConfig } from './healing.js';
export { RUNBOOKS, runbookFor } from './runbooks.js';
export { noopActuator, type Actuator, type Pager, type IncidentSink } from './sources.js';
export {
  SelfHealingController,
  createController,
  type ControllerDeps,
  type ControllerOptions,
  type TickInput,
  type TickResult,
} from './engine.js';
export { ReliabilityError, type ReliabilityErrorCode } from './errors.js';
