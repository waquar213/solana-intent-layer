/**
 * Self-healing decision — the recovery brain, and the place all the safety lives.
 * It maps a failure to an action, but ONLY within bounds that stop it from doing
 * more harm than the failure:
 *  - a change FREEZE disables all automatic recovery;
 *  - a SECURITY incident is contained (circuit break) AND escalated — never
 *    silently auto-remediated;
 *  - after too many failed auto-recoveries it ESCALATES instead of trying again
 *    (no restart loops / flapping);
 *  - a per-service rate limit + cooldown throttle actions.
 * It DECIDES; the injected actuator ACTS. The engine has no power to restart,
 * scale, or drain anything itself.
 */
import type { FailureKind, FailureSignal, HealingState, RecoveryAction, RecoveryDecision } from './types.js';

export interface HealingConfig {
  /** Max recovery actions per service PER WINDOW before escalating instead of looping. */
  maxActionsPerWindow: number;
  /** Length of that rolling window in seconds — the counter resets after it elapses (else it's a
   *  monotonic LIFETIME counter that permanently disables auto-recovery once the limit is hit). */
  windowSeconds: number;
  /** Minimum seconds between two actions on a service. */
  cooldownSeconds: number;
  /** Consecutive failed auto-recoveries before escalating to a human. */
  maxAutoRecoveries: number;
  /** A change freeze / maintenance window — no automatic recovery. */
  frozen: boolean;
}

export const DEFAULT_HEALING_CONFIG: HealingConfig = {
  maxActionsPerWindow: 5,
  windowSeconds: 300,
  cooldownSeconds: 60,
  maxAutoRecoveries: 3,
  frozen: false,
};

/** The default automatic remediation per failure kind. */
const ACTION_BY_KIND: Record<FailureKind, RecoveryAction> = {
  high_latency: 'scale_out',
  execution_failure: 'retry',
  settlement_failure: 'retry',
  rpc_outage: 'failover_provider',
  bridge_degradation: 'reroute_traffic',
  provider_failure: 'failover_provider',
  queue_congestion: 'scale_out',
  db_overload: 'circuit_break',
  memory_leak: 'restart_worker',
  cpu_spike: 'scale_out',
  node_failure: 'drain_node',
  security_incident: 'circuit_break',
};

export function emptyHealingState(): HealingState {
  return { actionsInWindow: {}, windowStartIso: {}, lastActionIso: {}, consecutiveFailures: {} };
}

export function decideRecovery(
  signal: FailureSignal,
  state: HealingState,
  nowIso: string,
  config: HealingConfig = DEFAULT_HEALING_CONFIG,
): RecoveryDecision {
  const svc = signal.service;
  const decision = (action: RecoveryAction, reason: string, bounded = false, escalate = false): RecoveryDecision => ({
    service: svc,
    kind: signal.kind,
    action,
    reason,
    bounded,
    escalate,
  });

  // 1. Security incidents ALWAYS contain (circuit break) AND escalate — a change freeze suppresses
  // ROUTINE remediation, NEVER security containment/paging (N2: this branch was below the freeze, so a
  // security incident arriving during a maintenance window was silently dropped — no circuit break, no
  // page — directly violating this module's own "contained AND escalated, never auto-healed" invariant).
  if (signal.kind === 'security_incident') {
    return decision('circuit_break', 'security incident: contained and escalated to on-call', false, true);
  }

  // 2. Change freeze — do nothing automatically (for NON-security signals; security is handled above).
  if (config.frozen) return decision('none', 'change freeze active — automatic recovery disabled', true, false);

  // 3. Repeated auto-recovery failures → escalate (stop trying, get a human).
  if ((state.consecutiveFailures[svc] ?? 0) >= config.maxAutoRecoveries) {
    return decision('escalate', `auto-recovery failed ${config.maxAutoRecoveries}× — escalating`, true, true);
  }

  // 4. Rate limit → escalate instead of looping.
  if ((state.actionsInWindow[svc] ?? 0) >= config.maxActionsPerWindow) {
    return decision('escalate', 'recovery rate limit reached — escalating instead of looping', true, true);
  }

  // 5. Cooldown → wait.
  const last = state.lastActionIso[svc];
  if (last !== undefined && (Date.parse(nowIso) - Date.parse(last)) / 1000 < config.cooldownSeconds) {
    return decision('none', 'cooldown active — waiting before another action', true, false);
  }

  // 6. The mapped automatic remediation.
  const action = ACTION_BY_KIND[signal.kind];
  return decision(action, `auto-recovery: ${signal.kind} → ${action}`);
}
