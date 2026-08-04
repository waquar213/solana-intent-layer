/**
 * Alert engine — event-and-threshold driven, and STATEFUL. Insights describe a
 * standing shape; alerts fire on a change and must not spam, so every candidate
 * carries a dedup `key` and the engine suppresses re-fires inside a cooldown
 * window. It is a pure function of (previous state, context, now) → (alerts,
 * next state): `now` is passed in, never read from the clock, so the whole thing
 * is deterministic and testable.
 *
 * Alert sources: analytics (large move, extreme vol, health breach, gas spike,
 * price targets, inactivity) and an injected `MarketEvent` feed (bridge exploit,
 * protocol hack, token delisting, yield) filtered to what the user actually owns.
 */
import { daysBetween, round } from './money.js';
import type { Alert, AlertSeverity, AlertState, MarketEvent, MetricRef, PriceTarget } from './types.js';

export interface AlertConfig {
  /** |Δ net worth| over the reading interval that fires a movement alert (ratio). */
  largeMovePct: number;
  extremeVolAnnual: number;
  minHealthScore: number;
  gasSpikeGwei: number;
  inactivityDays: number;
  minYieldApr: number;
  /** Hours a fired alert stays silent before it can re-fire. */
  cooldownHours: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  largeMovePct: 0.15,
  extremeVolAnnual: 1.0,
  minHealthScore: 40,
  gasSpikeGwei: 200,
  inactivityDays: 90,
  minYieldApr: 0.05,
  cooldownHours: 24,
};

export interface AlertContext {
  netWorthMicros: bigint;
  /** Previous reading, to detect a large movement. */
  previousNetWorthMicros?: bigint;
  volatilityAnnual?: number | null;
  healthScore?: number;
  gasGwei?: number;
  priceTargets?: PriceTarget[];
  events?: MarketEvent[];
  /** Owned entities used to filter the event feed to what actually affects the user. */
  ownedBridges?: string[];
  ownedProtocols?: string[];
  ownedSymbols?: string[];
  /** ISO timestamp of the wallet's last activity, for inactivity alerts. */
  lastActivityAt?: string;
}

const m = (metric: string, value: number | string): MetricRef => ({ metric, value });
const has = (list: string[] | undefined, v: string): boolean =>
  (list ?? []).some((x) => x.toUpperCase() === v.toUpperCase());

interface Candidate {
  key: string;
  code: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  evidence: MetricRef[];
}

function collectCandidates(ctx: AlertContext, config: AlertConfig): Candidate[] {
  const out: Candidate[] = [];

  // Large portfolio movement.
  if (ctx.previousNetWorthMicros !== undefined && ctx.previousNetWorthMicros > 0n) {
    const change = Number(ctx.netWorthMicros - ctx.previousNetWorthMicros) / Number(ctx.previousNetWorthMicros);
    if (Math.abs(change) >= config.largeMovePct) {
      const dir = change >= 0 ? 'up' : 'down';
      out.push({
        key: `movement:${dir}`,
        code: 'LARGE_PORTFOLIO_MOVEMENT',
        severity: 'warning',
        title: `Portfolio moved ${dir} ${round(Math.abs(change) * 100, 1)}%`,
        detail: `Net worth changed ${round(change * 100, 1)}% since the last reading.`,
        evidence: [m('netWorthChange', round(change, 4)), m('config.largeMovePct', config.largeMovePct)],
      });
    }
  }

  // Extreme volatility.
  if (ctx.volatilityAnnual != null && ctx.volatilityAnnual >= config.extremeVolAnnual) {
    out.push({
      key: 'volatility',
      code: 'EXTREME_VOLATILITY',
      severity: 'warning',
      title: 'Extreme volatility',
      detail: `Annualized volatility is ${round(ctx.volatilityAnnual, 2)}.`,
      evidence: [
        m('volatilityAnnual', round(ctx.volatilityAnnual, 4)),
        m('config.extremeVolAnnual', config.extremeVolAnnual),
      ],
    });
  }

  // Health threshold breach.
  if (ctx.healthScore !== undefined && ctx.healthScore < config.minHealthScore) {
    out.push({
      key: 'health',
      code: 'RISK_THRESHOLD_EXCEEDED',
      severity: 'critical',
      title: 'Portfolio health below threshold',
      detail: `Health score is ${round(ctx.healthScore, 0)}, below the ${config.minHealthScore} floor.`,
      evidence: [m('healthScore', ctx.healthScore), m('config.minHealthScore', config.minHealthScore)],
    });
  }

  // Gas spike.
  if (ctx.gasGwei !== undefined && ctx.gasGwei >= config.gasSpikeGwei) {
    out.push({
      key: 'gas',
      code: 'GAS_SPIKE',
      severity: 'info',
      title: 'Gas spike',
      detail: `Gas is ${ctx.gasGwei} gwei — consider deferring non-urgent transactions.`,
      evidence: [m('gasGwei', ctx.gasGwei), m('config.gasSpikeGwei', config.gasSpikeGwei)],
    });
  }

  // Price targets.
  for (const t of ctx.priceTargets ?? []) {
    const crossed = t.direction === 'above' ? t.spotMicros >= t.thresholdMicros : t.spotMicros <= t.thresholdMicros;
    if (crossed) {
      out.push({
        key: `price:${t.symbol}:${t.direction}:${t.thresholdMicros.toString()}`,
        code: 'PRICE_ALERT',
        severity: 'info',
        title: `${t.symbol} ${t.direction} target`,
        detail: `${t.symbol} crossed your ${t.direction} target.`,
        evidence: [
          m('symbol', t.symbol),
          m('thresholdMicros', t.thresholdMicros.toString()),
          m('spotMicros', t.spotMicros.toString()),
        ],
      });
    }
  }

  // Wallet inactivity.
  if (ctx.lastActivityAt !== undefined) {
    // Deferred to evaluateAlerts, which knows `now`; placeholder handled there.
  }

  // Injected market/security events, filtered to owned entities.
  for (const e of ctx.events ?? []) {
    if (e.kind === 'bridge_exploit' && has(ctx.ownedBridges, e.subject)) {
      out.push({
        key: `event:bridge_exploit:${e.subject}`,
        code: 'BRIDGE_EXPLOIT',
        severity: e.severity ?? 'critical',
        title: `Bridge exploit: ${e.subject}`,
        detail: e.detail,
        evidence: [m('bridge', e.subject), m('eventAsOf', e.asOf)],
      });
    } else if (e.kind === 'protocol_hack' && has(ctx.ownedProtocols, e.subject)) {
      out.push({
        key: `event:protocol_hack:${e.subject}`,
        code: 'PROTOCOL_HACKED',
        severity: e.severity ?? 'critical',
        title: `Protocol incident: ${e.subject}`,
        detail: e.detail,
        evidence: [m('protocol', e.subject), m('eventAsOf', e.asOf)],
      });
    } else if (e.kind === 'token_delisted' && has(ctx.ownedSymbols, e.subject)) {
      out.push({
        key: `event:token_delisted:${e.subject}`,
        code: 'TOKEN_DELISTED',
        severity: e.severity ?? 'warning',
        title: `${e.subject} delisted`,
        detail: e.detail,
        evidence: [m('symbol', e.subject), m('eventAsOf', e.asOf)],
      });
    } else if (
      e.kind === 'yield_opportunity' &&
      has(ctx.ownedSymbols, e.subject) &&
      (e.apr ?? 0) >= config.minYieldApr
    ) {
      out.push({
        key: `event:yield:${e.subject}`,
        code: 'YIELD_OPPORTUNITY',
        severity: 'info',
        title: `Yield opportunity: ${e.subject}`,
        detail: e.detail,
        evidence: [m('symbol', e.subject), m('apr', round(e.apr ?? 0, 4))],
      });
    }
  }

  return out;
}

/**
 * Evaluate alerts. Returns only alerts that are newly firing (not within their
 * cooldown) plus the next state to persist. Pure: `now` is supplied by the caller.
 */
export function evaluateAlerts(
  prevState: AlertState,
  ctx: AlertContext,
  now: string,
  config: AlertConfig = DEFAULT_ALERT_CONFIG,
): { alerts: Alert[]; state: AlertState } {
  const candidates = collectCandidates(ctx, config);

  // Inactivity needs `now`.
  if (ctx.lastActivityAt !== undefined) {
    const idle = daysBetween(ctx.lastActivityAt, now);
    if (idle >= config.inactivityDays) {
      candidates.push({
        key: 'inactivity',
        code: 'WALLET_INACTIVITY',
        severity: 'info',
        title: 'Wallet inactive',
        detail: `No activity for ${idle} days.`,
        evidence: [m('idleDays', idle), m('config.inactivityDays', config.inactivityDays)],
      });
    }
  }

  const lastFired: Record<string, string> = { ...prevState.lastFired };
  const nowMs = Date.parse(now);
  const cooldownMs = config.cooldownHours * 3_600_000;
  const alerts: Alert[] = [];

  for (const c of candidates) {
    const prev = lastFired[c.key];
    if (prev !== undefined && nowMs - Date.parse(prev) < cooldownMs) continue; // still cooling down
    lastFired[c.key] = now;
    alerts.push({ ...c, firedAt: now });
  }

  const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return { alerts, state: { lastFired } };
}

export const emptyAlertState = (): AlertState => ({ lastFired: {} });
