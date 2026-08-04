/**
 * Observability — a pure reducer over audit records. Everything the ops/admin
 * dashboards need (latency percentiles, approval/confirmation rates, blocked /
 * escalated counts, automation overrides, violations by code) is derivable from
 * the append-only decision log, so metrics never need their own writable state.
 */
import type { DecisionRecord, PolicyMetrics } from './types.js';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

export function computeMetrics(records: DecisionRecord[]): PolicyMetrics {
  const total = records.length;
  const latencies = records
    .map((r) => r.decision.latencyMs)
    .filter((x): x is number => x !== undefined)
    .sort((a, b) => a - b);

  let approved = 0;
  let confirmation = 0;
  let blocked = 0;
  let escalated = 0;
  let deferred = 0;
  let expired = 0;
  let automationOverrides = 0;
  const violationsByCode: Record<string, number> = {};

  for (const r of records) {
    const o = r.decision.outcome;
    if (o === 'approved') approved++;
    else if (o === 'approved_with_confirmation') confirmation++;
    else if (o === 'blocked') blocked++;
    else if (o === 'escalated') escalated++;
    else if (o === 'deferred') deferred++;
    else if (o === 'expired') expired++;

    // An automation rule that fired without blocking is an "override" of the default deny-automation posture.
    if (r.decision.firedRules.some((f) => f.type === 'automation' && f.outcome !== 'blocked')) automationOverrides++;

    for (const f of r.decision.firedRules) {
      if (f.outcome === 'blocked' || f.outcome === 'escalated') {
        violationsByCode[f.code] = (violationsByCode[f.code] ?? 0) + 1;
      }
    }
  }

  const rate = (n: number): number => (total === 0 ? 0 : n / total);
  return {
    total,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    approvalRate: rate(approved),
    confirmationRate: rate(confirmation),
    blocked,
    escalated,
    deferred,
    expired,
    automationOverrides,
    violationsByCode,
  };
}
