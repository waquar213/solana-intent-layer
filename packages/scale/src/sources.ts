/**
 * Injected effectors. The scale engine DECIDES; these ACT. `ScaleActuator` is the
 * only thing that can change a replica count (it wraps the Kubernetes HPA / cluster
 * API / a cloud autoscaler); the engine never touches infrastructure directly, so a
 * wrong decision is a wrong *number handed to the actuator*, bounded by min/max
 * before it ever arrives. This is the same decide-not-act split the reliability and
 * settlement engines use.
 */
import type { ScalingDecision } from './types.js';

export interface ScaleActuator {
  /** Apply a desired replica count for a service. Returns whether it took effect. */
  apply(decision: ScalingDecision): Promise<{ ok: boolean; detail: string }>;
}

/** A no-op actuator (accepts every decision, changes nothing) — safe default / test double. */
export const noopScaleActuator: ScaleActuator = {
  apply: () => Promise.resolve({ ok: true, detail: 'noop' }),
};
