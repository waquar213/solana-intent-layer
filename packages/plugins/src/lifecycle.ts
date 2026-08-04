/**
 * The plugin lifecycle state machine + health-driven auto-suspend. Transitions are
 * explicit and total: an illegal transition throws rather than silently landing in a
 * bad state (you can't `enable` a `removed` plugin, or `resume` one that isn't
 * `suspended`). Health monitoring follows the platform's decide-not-act doctrine —
 * `decideHealthAction` DECIDES to suspend a misbehaving plugin (too many crashes,
 * security violations, or sustained over-limit memory); the registry/host ACTS. The
 * engine never auto-RESUMES, so a crash-looping plugin converges on suspended, not a
 * restart storm.
 */
import { PluginError } from './errors.js';
import type { LifecycleAction, LifecycleState, PluginHealth } from './types.js';

const TRANSITIONS: Record<LifecycleState, Partial<Record<LifecycleAction, LifecycleState>>> = {
  registered: { install: 'installed', remove: 'removed' },
  installed: { enable: 'enabled', remove: 'removed' },
  enabled: { disable: 'disabled', suspend: 'suspended', update: 'enabled', rollback: 'enabled', remove: 'removed' },
  disabled: { enable: 'enabled', suspend: 'suspended', update: 'disabled', rollback: 'disabled', remove: 'removed' },
  suspended: { resume: 'enabled', disable: 'disabled', remove: 'removed' },
  removed: {},
};

export function canTransition(state: LifecycleState, action: LifecycleAction): boolean {
  return TRANSITIONS[state][action] !== undefined;
}

export function transition(state: LifecycleState, action: LifecycleAction): LifecycleState {
  const next = TRANSITIONS[state][action];
  if (next === undefined) {
    throw new PluginError('ILLEGAL_TRANSITION', `cannot '${action}' a plugin in state '${state}'`);
  }
  return next;
}

export interface HealthThresholds {
  maxCrashes: number;
  maxPermissionViolations: number;
  maxMemoryOverLimitSamples: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  maxCrashes: 3,
  maxPermissionViolations: 1, // a single attempt to exceed permissions is a security event
  maxMemoryOverLimitSamples: 3,
};

export interface HealthDecision {
  action: 'suspend' | 'none';
  reason: string;
}

/** Decide whether a plugin's health warrants suspension. Decide-not-act; never auto-resumes. */
export function decideHealthAction(
  health: PluginHealth,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): HealthDecision {
  // A permission violation is a security signal — the tightest bound.
  if (health.permissionViolations >= thresholds.maxPermissionViolations) {
    return {
      action: 'suspend',
      reason: `permission violations (${health.permissionViolations}) — suspending for review`,
    };
  }
  if (health.crashes >= thresholds.maxCrashes) {
    return { action: 'suspend', reason: `crash loop (${health.crashes} crashes) — suspending` };
  }
  if (health.memoryOverLimitSamples >= thresholds.maxMemoryOverLimitSamples) {
    return { action: 'suspend', reason: `sustained memory over limit — suspending` };
  }
  return { action: 'none', reason: 'healthy' };
}

export function emptyHealth(): PluginHealth {
  return { crashes: 0, permissionViolations: 0, memoryOverLimitSamples: 0, p95LatencyMs: 0 };
}
