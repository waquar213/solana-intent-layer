import { describe, expect, it } from 'vitest';
import { isEventTriggerMet, isScheduleDue, nextFireTime } from '../src/index.js';
import type { EvalContext, Trigger } from '../src/index.js';

const MONDAY_10 = '2026-01-05T10:00:00.000Z';
const weekly: Extract<Trigger, { kind: 'schedule' }> = { kind: 'schedule', every: 'week', atHourUtc: 9, dayOfWeek: 1 };

const ctx = (over: Partial<EvalContext>): EvalContext => ({
  nowIso: MONDAY_10,
  prices: {},
  priceMoves: {},
  portfolio: { health: 70, drawdown: 0, risk_score: 10, net_worth: 1000 },
  gasGwei: 20,
  variables: {},
  events: [],
  ...over,
});

describe('schedule triggers (time-travel via injected clock)', () => {
  it('is due once a scheduled instant has passed since the last run', () => {
    expect(isScheduleDue(weekly, undefined, MONDAY_10)).toBe(true); // fresh, most recent Monday 09:00 passed
    expect(isScheduleDue(weekly, MONDAY_10, MONDAY_10)).toBe(false); // already ran this instance
    expect(isScheduleDue(weekly, '2026-01-05T09:30:00.000Z', MONDAY_10)).toBe(false); // ran after 09:00
  });

  it('computes the next fire strictly after the reference time', () => {
    expect(nextFireTime(weekly, MONDAY_10)).toBe('2026-01-12T09:00:00.000Z'); // next Monday 09:00
    expect(nextFireTime(weekly, '2026-01-05T08:00:00.000Z')).toBe('2026-01-05T09:00:00.000Z'); // today, later
  });
});

describe('event triggers', () => {
  it('price above / below a threshold', () => {
    const t: Trigger = { kind: 'price', symbol: 'BTC', direction: 'above', thresholdMicros: 100_000_000_000n };
    expect(isEventTriggerMet(t, ctx({ prices: { BTC: 120_000_000_000n } }))).toBe(true);
    expect(isEventTriggerMet(t, ctx({ prices: { BTC: 90_000_000_000n } }))).toBe(false);
  });

  it('price drop by percentage', () => {
    const t: Trigger = { kind: 'price_move', symbol: 'BTC', direction: 'drops', pct: 10 };
    expect(isEventTriggerMet(t, ctx({ priceMoves: { BTC: -0.12 } }))).toBe(true); // down 12%
    expect(isEventTriggerMet(t, ctx({ priceMoves: { BTC: -0.05 } }))).toBe(false); // only down 5%
  });

  it('gas below, and a risk event at/above min severity', () => {
    expect(isEventTriggerMet({ kind: 'gas', direction: 'below', gwei: 30 }, ctx({ gasGwei: 20 }))).toBe(true);
    const risk: Trigger = { kind: 'risk_event', minSeverity: 'high' };
    expect(isEventTriggerMet(risk, ctx({ events: [{ kind: 'risk', subject: 'x', severity: 'high' }] }))).toBe(true);
    expect(isEventTriggerMet(risk, ctx({ events: [{ kind: 'risk', subject: 'x', severity: 'low' }] }))).toBe(false);
  });
});
