/**
 * Runbooks as DATA — an alert code maps to ordered diagnostics + remediation +
 * the action the self-healing engine attempts first. Keeping them as data (not
 * prose in a wiki) means they are queryable, testable, and renderable next to
 * the alert that fired.
 */
import type { Runbook } from './types.js';

export const RUNBOOKS: Record<string, Runbook> = {
  FAST_BUDGET_BURN: {
    code: 'FAST_BUDGET_BURN',
    title: 'Fast error-budget burn',
    diagnostics: [
      'Check for a recent deploy',
      'Group errors by endpoint + dependency',
      'Check downstream provider/RPC health',
    ],
    remediation: [
      'Roll back the last deploy',
      'Fail over unhealthy providers/RPC',
      'Shed load / open the circuit breaker',
    ],
    autoAction: 'reroute_traffic',
  },
  SERVICE_CRITICAL: {
    code: 'SERVICE_CRITICAL',
    title: 'Service critical',
    diagnostics: [
      'Read the health reasons',
      'Check saturation + latency percentiles',
      'Check queue depth + worker health',
    ],
    remediation: ['Scale out', 'Restart unhealthy workers', 'Drain a failing node'],
    autoAction: 'scale_out',
  },
  HIGH_SATURATION: {
    code: 'HIGH_SATURATION',
    title: 'High saturation',
    diagnostics: ['Identify the saturated resource (CPU/mem/queue)', 'Check autoscaler status'],
    remediation: ['Scale out', 'Rebuild the congested queue'],
    autoAction: 'scale_out',
  },
};

export function runbookFor(code: string): Runbook | undefined {
  return RUNBOOKS[code];
}
