/**
 * Injected sinks. The `Actuator` is where DECISION becomes ACTION — the engine
 * hands it a `RecoveryDecision` and it carries it out (restart a worker, fail a
 * provider over, scale, …). The engine holds no such power itself, so a bug
 * can propose a bad action but can't execute one the actuator refuses. `Pager`
 * and `IncidentSink` are the human-in-the-loop escalation path.
 */
import type { Alert, Incident, RecoveryDecision } from './types.js';

export interface Actuator {
  execute(decision: RecoveryDecision): Promise<{ ok: boolean; detail: string }>;
}

export interface Pager {
  page(alert: Alert): Promise<void>;
}

export interface IncidentSink {
  open(incident: Incident): Promise<void>;
}

/** A no-op actuator (records nothing, always succeeds) — a safe default / test stand-in. */
export const noopActuator: Actuator = {
  execute: () => Promise.resolve({ ok: true, detail: 'noop' }),
};
