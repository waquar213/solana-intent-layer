/**
 * Horizontal autoscaler — the decision core of "grow without a redesign". It turns
 * a window of demand signals into a DESIRED replica count and nothing more: it does
 * not talk to Kubernetes, it does not scale anything. An injected actuator does that
 * (see engine.ts). That separation is the safety property — a bug here can propose a
 * wrong number, but three bounds make a scale-storm or a brown-out impossible:
 *
 *   1. clamp to [minReplicas, maxReplicas]  — hard floor (stay up) and ceiling (cap cost).
 *   2. rate-limited step                    — up fast, down slow; never 2→200 in one tick.
 *   3. stabilization + cooldown             — never scale DOWN right after scaling UP,
 *                                             and never act twice inside the cooldown.
 *
 * Multi-signal rule: compute a desired count per signal (Kubernetes-HPA style,
 * desired = ceil(current × value/target)) and take the MAX — scale to the
 * most-stressed dimension, because relieving CPU doesn't help a starving queue.
 */
import type { ScaleSignal, ScalingDecision, ScalingPolicy, ScalingState } from './types.js';

export const DEFAULT_SCALING_POLICY: ScalingPolicy = {
  minReplicas: 2, // never a single point of failure
  maxReplicas: 100,
  maxScaleUpRatio: 1.0, // may double per tick when demand spikes
  maxScaleDownRatio: 0.25, // shed at most 25% per tick — conservative on the way down
  scaleDownStabilizationMs: 300_000, // 5 min: don't scale down within 5 min of scaling up
  cooldownMs: 30_000,
  tolerance: 0.1,
};

/** Clamp to [lo,hi]; a non-finite input folds to `lo` rather than escaping as NaN and
 *  propagating into a scaling decision. */
const clamp = (n: number, lo: number, hi: number): number => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

/** Upper bound on a signal's weight, so one signal can't amplify demand without limit. */
export const MAX_SIGNAL_WEIGHT = 10;

/**
 * Does this signal carry a usable opinion? A signal with a non-positive target, a
 * non-finite/negative value (a missing or corrupt scraped metric), or a non-positive
 * weight is DROPPED entirely — it must neither drive a scale-up nor, via the
 * down-desire fallback, pin the count and block a legitimate scale-down. (A healthy
 * signal that is merely near its set point is NOT malformed — it legitimately opposes
 * shrinking, by design.)
 */
export function signalHasOpinion(signal: ScaleSignal): boolean {
  return (
    signal.target > 0 &&
    Number.isFinite(signal.value) &&
    signal.value >= 0 &&
    Number.isFinite(signal.weight ?? 1) &&
    (signal.weight ?? 1) > 0
  );
}

/** The desired replicas a single signal asks for, given the current count. */
export function desiredForSignal(signal: ScaleSignal, current: number): number {
  if (!(signal.target > 0) || !Number.isFinite(signal.value) || signal.value < 0) {
    // A malformed signal must not drive scaling — treat it as "no opinion" (hold at current).
    return current;
  }
  // Weight is clamped to [0, MAX] so a negative weight can't invert demand (idle → up)
  // and a huge weight can't amplify one signal without bound.
  const weight = Math.min(MAX_SIGNAL_WEIGHT, Math.max(0, signal.weight ?? 1));
  const ratio = signal.value / signal.target;
  // Weight dampens only the EXCESS over the set point, so a low-weight signal can
  // still ask for some scaling but not dominate. weight 1 → plain HPA ratio.
  const effective = 1 + (ratio - 1) * weight;
  return Math.max(0, Math.ceil(current * effective));
}

export function emptyScalingState(): ScalingState {
  return { lastActionMs: {}, lastScaleUpMs: {} };
}

export interface ScaleInput {
  service: string;
  currentReplicas: number;
  signals: ScaleSignal[];
}

/**
 * Pure scaling decision. Reads `state` (per-service history) but does not mutate it;
 * the controller applies the returned decision to the state. Deterministic given `now`.
 */
export function decideScale(
  input: ScaleInput,
  policy: ScalingPolicy,
  state: ScalingState,
  now: number,
): ScalingDecision {
  const { service, currentReplicas: current } = input;
  const max = Math.max(1, Math.floor(policy.maxReplicas));
  // An inverted policy (min > max) must NOT silently bypass the hard cost/blast-radius
  // ceiling: the ceiling wins, so `min` can never exceed `max`.
  const min = Math.min(Math.max(1, Math.floor(policy.minReplicas)), max);

  const base = (over: Partial<ScalingDecision>): ScalingDecision => ({
    service,
    currentReplicas: current,
    desiredReplicas: current,
    direction: 'hold',
    bounded: false,
    reason: 'within tolerance',
    rawDesired: current,
    ...over,
  });

  // Only signals that carry a usable opinion participate — a missing/corrupt metric
  // is dropped, not read as "happy at set point" (which would block scaling).
  const signals = input.signals.filter(signalHasOpinion);

  // No usable signals → hold at the current count clamped into bounds (e.g. min just raised).
  if (signals.length === 0) {
    const held = clamp(current, min, max);
    return base({
      desiredReplicas: held,
      direction: held === current ? 'hold' : held > current ? 'up' : 'down',
      bounded: held !== current,
      reason: input.signals.length === 0 ? 'no signals' : 'no signals with a usable opinion — holding',
      rawDesired: current,
    });
  }

  // 1. The most-stressed signal wins.
  let rawDesired = current;
  for (const s of signals) {
    const d = desiredForSignal(s, current);
    if (d > rawDesired) rawDesired = d;
  }
  // Also honour a signal that wants to scale DOWN when NO signal wants up: take the
  // max of the down-desires (the least aggressive scale-down) so one quiet signal
  // can't shrink us while another is near its set point.
  if (rawDesired === current) {
    let downDesire = 0;
    for (const s of signals) downDesire = Math.max(downDesire, desiredForSignal(s, current));
    rawDesired = downDesire;
  }

  // Tolerance band: ignore tiny deviations to avoid churn.
  const ratio = current > 0 ? rawDesired / current : rawDesired;
  if (Math.abs(ratio - 1) <= policy.tolerance) {
    return base({ desiredReplicas: current, reason: `within ±${policy.tolerance} tolerance`, rawDesired });
  }

  // 2. Clamp to hard bounds.
  const clamped = clamp(rawDesired, min, max);
  const clampBounded = clamped !== rawDesired;

  // 3. Rate-limit the step (up fast, down slow); always allow a ±1 move so a service
  //    can never get stuck one replica away from its target.
  let stepped: number;
  if (clamped > current) {
    const maxUp = Math.max(current + 1, Math.ceil(current * (1 + policy.maxScaleUpRatio)));
    stepped = Math.min(clamped, maxUp);
  } else {
    const maxDown = Math.min(current - 1, Math.floor(current * (1 - policy.maxScaleDownRatio)));
    stepped = Math.max(clamped, maxDown);
  }
  stepped = clamp(stepped, min, max);
  const stepBounded = stepped !== clamped;

  const direction = stepped > current ? 'up' : stepped < current ? 'down' : 'hold';
  if (direction === 'hold') {
    return base({
      desiredReplicas: current,
      bounded: clampBounded || stepBounded,
      reason: 'no change after bounds',
      rawDesired,
    });
  }

  // 4. Stabilization: never scale DOWN inside the window after a scale-UP (anti-flap).
  const lastUp = state.lastScaleUpMs[service];
  if (direction === 'down' && lastUp !== undefined && now - lastUp < policy.scaleDownStabilizationMs) {
    return base({
      desiredReplicas: current,
      direction: 'hold',
      bounded: true,
      reason: 'scale-down suppressed by stabilization window (recently scaled up)',
      rawDesired,
    });
  }

  // 5. Cooldown: never act twice inside the cooldown.
  const lastAction = state.lastActionMs[service];
  if (lastAction !== undefined && now - lastAction < policy.cooldownMs) {
    return base({
      desiredReplicas: current,
      direction: 'hold',
      bounded: true,
      reason: 'cooldown active — holding',
      rawDesired,
    });
  }

  return {
    service,
    currentReplicas: current,
    desiredReplicas: stepped,
    direction,
    bounded: clampBounded || stepBounded,
    reason: `${direction === 'up' ? 'scaling up' : 'scaling down'} ${current}→${stepped} (raw ${rawDesired})`,
    rawDesired,
  };
}

/** Apply an executed decision to the per-service state (called after the actuator succeeds). */
export function recordScaleAction(state: ScalingState, decision: ScalingDecision, now: number): void {
  if (decision.direction === 'hold') return;
  state.lastActionMs[decision.service] = now;
  if (decision.direction === 'up') state.lastScaleUpMs[decision.service] = now;
}
