/**
 * Trigger evaluation. Time (`schedule`) triggers fire by the injected clock —
 * `nextFireTime` powers the scheduler and `isScheduleDue` decides whether a
 * scheduled instant has passed since the last run (fires ONCE for the most
 * recent, so a burst of missed windows doesn't replay). Event triggers (price,
 * portfolio, risk, gas…) are matched against the injected `EvalContext`. All
 * time math is UTC over given timestamps — no clock is read here.
 */
import type { EvalContext, Trigger } from './types.js';

const HOUR_DEFAULT = 0;
const SEVERITY_RANK: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 1, high: 2 };

const dayInstant = (ref: Date, hour: number, dayOffset: number): number =>
  Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + dayOffset, hour, 0, 0, 0);

const monthInstant = (year: number, month: number, dom: number, hour: number): number =>
  Date.UTC(year, month, dom, hour, 0, 0, 0);

type Schedule = Extract<Trigger, { kind: 'schedule' }>;

/** The latest scheduled instant ≤ atMs. */
function lastDueBefore(s: Schedule, atMs: number): number {
  const d = new Date(atMs);
  const h = s.atHourUtc ?? HOUR_DEFAULT;
  if (s.every === 'day') {
    const c = dayInstant(d, h, 0);
    return c <= atMs ? c : dayInstant(d, h, -1);
  }
  if (s.every === 'week') {
    const delta = (s.dayOfWeek ?? 1) - d.getUTCDay();
    const c = dayInstant(d, h, delta);
    return c <= atMs ? c : dayInstant(d, h, delta - 7);
  }
  const dom = s.dayOfMonth ?? 1;
  const c = monthInstant(d.getUTCFullYear(), d.getUTCMonth(), dom, h);
  return c <= atMs ? c : monthInstant(d.getUTCFullYear(), d.getUTCMonth() - 1, dom, h);
}

/** The earliest scheduled instant strictly after atMs. */
export function nextFireTime(s: Schedule, fromIso: string): string {
  const atMs = Date.parse(fromIso);
  const d = new Date(atMs);
  const h = s.atHourUtc ?? HOUR_DEFAULT;
  let next: number;
  if (s.every === 'day') {
    const c = dayInstant(d, h, 0);
    next = c > atMs ? c : dayInstant(d, h, 1);
  } else if (s.every === 'week') {
    const delta = (s.dayOfWeek ?? 1) - d.getUTCDay();
    const c = dayInstant(d, h, delta);
    next = c > atMs ? c : dayInstant(d, h, delta + 7);
  } else {
    const dom = s.dayOfMonth ?? 1;
    const c = monthInstant(d.getUTCFullYear(), d.getUTCMonth(), dom, h);
    next = c > atMs ? c : monthInstant(d.getUTCFullYear(), d.getUTCMonth() + 1, dom, h);
  }
  return new Date(next).toISOString();
}

/** ISO of the most recent scheduled instant ≤ now — the dedup key for a scheduled firing. */
export function lastScheduledInstant(s: Schedule, nowIso: string): string {
  return new Date(lastDueBefore(s, Date.parse(nowIso))).toISOString();
}

/** True if a scheduled instant has passed since the last run. */
export function isScheduleDue(s: Schedule, lastRunIso: string | undefined, nowIso: string): boolean {
  const lastDue = lastDueBefore(s, Date.parse(nowIso));
  const lastRun = lastRunIso !== undefined ? Date.parse(lastRunIso) : Number.NEGATIVE_INFINITY;
  return lastRun < lastDue;
}

/** Match a non-schedule (event/state) trigger against the evaluation context. */
export function isEventTriggerMet(trigger: Trigger, ctx: EvalContext): boolean {
  switch (trigger.kind) {
    case 'schedule':
      return false; // handled by isScheduleDue
    case 'price': {
      const p = ctx.prices[trigger.symbol];
      if (p === undefined) return false;
      return trigger.direction === 'above' ? p >= trigger.thresholdMicros : p <= trigger.thresholdMicros;
    }
    case 'price_move': {
      const m = ctx.priceMoves[trigger.symbol];
      if (m === undefined) return false;
      return trigger.direction === 'drops' ? m <= -(trigger.pct / 100) : m >= trigger.pct / 100;
    }
    case 'portfolio': {
      const v = ctx.portfolio[trigger.metric];
      return trigger.direction === 'above' ? v >= trigger.value : v <= trigger.value;
    }
    case 'risk_event':
      return ctx.events.some(
        (e) => e.kind === 'risk' && SEVERITY_RANK[e.severity] >= SEVERITY_RANK[trigger.minSeverity],
      );
    case 'volatility':
      return (ctx.variables['volatility_annual'] ?? 0) >= trigger.annualAbove;
    case 'chain_event':
      return ctx.events.some((e) => e.kind === trigger.eventType);
    case 'bridge_incident':
      return ctx.events.some((e) => e.kind === 'bridge_incident' && e.subject === trigger.bridge);
    case 'gas':
      return trigger.direction === 'above' ? ctx.gasGwei >= trigger.gwei : ctx.gasGwei <= trigger.gwei;
    case 'ai_recommendation':
      return ctx.events.some((e) => e.kind === 'ai_recommendation' && e.subject === trigger.code);
    case 'webhook':
      return false; // external — future seam
  }
}

/** Unified: is this trigger firing right now, given the last run + context? */
export function triggerMet(trigger: Trigger, lastRunIso: string | undefined, ctx: EvalContext): boolean {
  return trigger.kind === 'schedule' ? isScheduleDue(trigger, lastRunIso, ctx.nowIso) : isEventTriggerMet(trigger, ctx);
}
