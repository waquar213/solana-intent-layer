/**
 * Error-budget math (Google-SRE style). The budget is what's left of the
 * allowed failures for an SLO objective; the BURN RATE is how fast you're
 * spending it relative to that allowance (burnRate 14.4 ≈ burning a 30-day
 * budget in ~2 days). Burn rate is the signal alerting and self-healing key off.
 *
 * Pass CUMULATIVE counts over the budget window for `budgetConsumed`/`remaining`
 * to be exact; for a short sample, `burnRate` is the instantaneous burn multiple
 * (which is exactly what multi-window burn-rate alerting wants).
 */
import type { ErrorBudget, Sli, Slo } from './types.js';

export const round = (x: number, dp = 3): number => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};

export function computeErrorBudget(sli: Sli, slo: Slo): ErrorBudget {
  const failureRate = sli.total > 0 ? sli.failures / sli.total : 0;
  const allowedRate = Math.max(1e-9, 1 - slo.objective);
  const burnRate = failureRate / allowedRate;
  const budgetConsumed = burnRate;
  return {
    service: sli.service,
    objective: slo.objective,
    failureRate: round(failureRate, 6),
    burnRate: round(burnRate, 3),
    budgetConsumed: round(budgetConsumed, 3),
    budgetRemaining: round(Math.max(0, 1 - budgetConsumed), 3),
  };
}
