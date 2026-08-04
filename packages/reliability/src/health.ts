/**
 * Service health from RED metrics + saturation + error budget. Health only ever
 * WORSENS across the signals (a critical burn plus healthy latency is still
 * critical); no traffic → `unknown` (we don't claim healthy on no data). This is
 * the state alerting and self-healing read.
 */
import { computeErrorBudget } from './slo.js';
import type { HealthState, ServiceHealth, Sli, Slo } from './types.js';

export interface HealthThresholds {
  degradedBurnRate: number;
  criticalBurnRate: number;
  saturationDegraded: number;
  saturationCritical: number;
  /** p99 over (multiple × budget) is critical, over budget is degraded. */
  latencyCriticalMultiple: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  degradedBurnRate: 2,
  criticalBurnRate: 10,
  saturationDegraded: 0.75,
  saturationCritical: 0.9,
  latencyCriticalMultiple: 2,
};

const RANK: Record<HealthState, number> = { healthy: 0, unknown: 1, degraded: 2, critical: 3 };
const worse = (a: HealthState, b: HealthState): HealthState => (RANK[b] > RANK[a] ? b : a);

export function computeHealth(
  sli: Sli,
  slo: Slo,
  thresholds: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS,
): ServiceHealth {
  const budget = computeErrorBudget(sli, slo);
  const reasons: string[] = [];

  if (sli.total === 0) {
    return { service: sli.service, state: 'unknown', reasons: ['no traffic sampled'], sli, budget };
  }

  let state: HealthState = 'healthy';

  if (budget.burnRate >= thresholds.criticalBurnRate) {
    state = worse(state, 'critical');
    reasons.push(`error budget burning ${budget.burnRate}× the allowance`);
  } else if (budget.burnRate >= thresholds.degradedBurnRate) {
    state = worse(state, 'degraded');
    reasons.push(`error budget burning ${budget.burnRate}× the allowance`);
  }

  if (sli.p99Ms >= slo.p99BudgetMs * thresholds.latencyCriticalMultiple) {
    state = worse(state, 'critical');
    reasons.push(`p99 ${sli.p99Ms}ms ≫ budget ${slo.p99BudgetMs}ms`);
  } else if (sli.p99Ms > slo.p99BudgetMs) {
    state = worse(state, 'degraded');
    reasons.push(`p99 ${sli.p99Ms}ms > budget ${slo.p99BudgetMs}ms`);
  }

  if (sli.saturation >= thresholds.saturationCritical) {
    state = worse(state, 'critical');
    reasons.push(`saturation ${sli.saturation}`);
  } else if (sli.saturation >= thresholds.saturationDegraded) {
    state = worse(state, 'degraded');
    reasons.push(`saturation ${sli.saturation}`);
  }

  if (reasons.length === 0) reasons.push('within SLO');
  return { service: sli.service, state, reasons, sli, budget };
}
