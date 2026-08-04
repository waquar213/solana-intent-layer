/**
 * Alert engine — burn-rate + threshold alerts with dedup/cooldown. Fast budget
 * burn PAGES (something is actively breaking the SLO); slow burn opens a TICKET;
 * latency and saturation get their own thresholds. It is a pure function of
 * (previous state, healths, now) → (alerts, next state), so `now` is injected
 * and a fired alert stays quiet for its cooldown instead of spamming.
 */
import type { Alert, AlertSeverity, AlertState, ServiceHealth } from './types.js';

export interface AlertConfig {
  /** Burn rate that pages (default 14.4 ≈ 2% of a 30-day budget in 1h). */
  pageBurnRate: number;
  /** Burn rate that opens a ticket. */
  ticketBurnRate: number;
  /** Saturation that opens a ticket. */
  saturationTicket: number;
  cooldownHours: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  pageBurnRate: 14.4,
  ticketBurnRate: 3,
  saturationTicket: 0.85,
  cooldownHours: 1,
};

interface Candidate {
  code: string;
  severity: AlertSeverity;
  service: string;
  detail: string;
}

function candidatesFor(h: ServiceHealth, config: AlertConfig): Candidate[] {
  const out: Candidate[] = [];
  if (h.budget.burnRate >= config.pageBurnRate) {
    out.push({
      code: 'FAST_BUDGET_BURN',
      severity: 'page',
      service: h.service,
      detail: `burn rate ${h.budget.burnRate}×`,
    });
  } else if (h.budget.burnRate >= config.ticketBurnRate) {
    out.push({
      code: 'SLOW_BUDGET_BURN',
      severity: 'ticket',
      service: h.service,
      detail: `burn rate ${h.budget.burnRate}×`,
    });
  }
  if (h.state === 'critical') {
    out.push({ code: 'SERVICE_CRITICAL', severity: 'page', service: h.service, detail: h.reasons.join('; ') });
  }
  if (h.sli.saturation >= config.saturationTicket) {
    out.push({
      code: 'HIGH_SATURATION',
      severity: 'ticket',
      service: h.service,
      detail: `saturation ${h.sli.saturation}`,
    });
  }
  return out;
}

export function evaluateAlerts(
  prevState: AlertState,
  healths: ServiceHealth[],
  now: string,
  config: AlertConfig = DEFAULT_ALERT_CONFIG,
): { alerts: Alert[]; state: AlertState } {
  const lastFired: Record<string, string> = { ...prevState.lastFired };
  const nowMs = Date.parse(now);
  const cooldownMs = config.cooldownHours * 3_600_000;
  const alerts: Alert[] = [];

  for (const h of healths) {
    for (const c of candidatesFor(h, config)) {
      const key = `${c.code}:${c.service}`;
      const prev = lastFired[key];
      if (prev !== undefined && nowMs - Date.parse(prev) < cooldownMs) continue;
      lastFired[key] = now;
      alerts.push({ key, code: c.code, severity: c.severity, service: c.service, detail: c.detail, firedAtIso: now });
    }
  }

  const sev: Record<AlertSeverity, number> = { page: 0, ticket: 1, info: 2 };
  alerts.sort((a, b) => sev[a.severity] - sev[b.severity]);
  return { alerts, state: { lastFired } };
}

export const emptyAlertState = (): AlertState => ({ lastFired: {} });
