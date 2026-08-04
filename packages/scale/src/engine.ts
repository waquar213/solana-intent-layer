/**
 * ScalingController — the reconcile loop that ties the autoscaler to reality:
 *   metrics per service → bounded decision → (if not a hold) dispatch to actuator →
 *   record the action in per-service state (for cooldown + anti-flap next tick).
 *
 * It decides and dispatches; the injected `ScaleActuator` performs. It threads
 * `ScalingState` across ticks so cooldown and the down-after-up stabilization window
 * actually work, and it only records an action as taken when the actuator confirms —
 * a failed apply doesn't start the cooldown, so a stuck actuator can be retried next
 * tick rather than silently locking scaling out. Each service's dispatch is isolated
 * (try/catch), so a rejected apply for one service never aborts scaling for the rest
 * of the batch (no head-of-line blocking). Deterministic: `now` is injected.
 */
import {
  decideScale,
  DEFAULT_SCALING_POLICY,
  emptyScalingState,
  recordScaleAction,
  type ScaleInput,
} from './autoscaler.js';
import type { ScaleEnv } from './env.js';
import type { ScaleActuator } from './sources.js';
import type { ScalingDecision, ScalingPolicy, ScalingState } from './types.js';

export interface ScalingControllerDeps {
  actuator: ScaleActuator;
  env: ScaleEnv;
}

export interface ScalingControllerOptions {
  /** Per-service policy override; falls back to `defaultPolicy` then `DEFAULT_SCALING_POLICY`. */
  policies?: Record<string, ScalingPolicy>;
  defaultPolicy?: ScalingPolicy;
}

export interface ReconcileResult {
  decisions: ScalingDecision[];
  /** Decisions actually dispatched to the actuator (direction !== 'hold' and it accepted). */
  applied: ScalingDecision[];
}

export class ScalingController {
  private readonly state: ScalingState = emptyScalingState();

  constructor(
    private readonly deps: ScalingControllerDeps,
    private readonly options: ScalingControllerOptions = {},
  ) {}

  private policyFor(service: string): ScalingPolicy {
    return this.options.policies?.[service] ?? this.options.defaultPolicy ?? DEFAULT_SCALING_POLICY;
  }

  async reconcile(inputs: ScaleInput[], nowMs?: number): Promise<ReconcileResult> {
    const now = nowMs ?? this.deps.env.now();
    const decisions: ScalingDecision[] = [];
    const applied: ScalingDecision[] = [];

    for (const input of inputs) {
      const decision = decideScale(input, this.policyFor(input.service), this.state, now);
      decisions.push(decision);
      if (decision.direction === 'hold') continue;

      try {
        const res = await this.deps.actuator.apply(decision);
        // Only a confirmed apply starts the cooldown / stabilization window.
        if (res.ok) {
          recordScaleAction(this.state, decision, now);
          applied.push(decision);
        }
      } catch {
        // A thrown / rejected apply (a transient cluster-API 5xx) is treated exactly
        // like a failed apply: no cooldown recorded, retried next tick — and, crucially,
        // it does NOT abort scaling for the other services in this same batch.
      }
    }

    return { decisions, applied };
  }

  /** Read-only view of the scaling memory (for observability / tests). */
  snapshotState(): ScalingState {
    return { lastActionMs: { ...this.state.lastActionMs }, lastScaleUpMs: { ...this.state.lastScaleUpMs } };
  }
}

export function createScalingController(
  deps: ScalingControllerDeps,
  options?: ScalingControllerOptions,
): ScalingController {
  return new ScalingController(deps, options);
}
