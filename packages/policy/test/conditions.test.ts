import { describe, expect, it } from 'vitest';
import { evaluateCondition, UNLIMITED_APPROVAL_THRESHOLD } from '../src/index.js';
import { ctx } from './helpers.js';

describe('evaluateCondition — leaves', () => {
  it('always is satisfied; not inverts', () => {
    const c = ctx();
    expect(evaluateCondition(c, { op: 'always' }).satisfied).toBe(true);
    expect(evaluateCondition(c, { op: 'not', expr: { op: 'always' } }).satisfied).toBe(false);
  });

  it('amount_gte on the re-derived bigint amount', () => {
    const c = ctx({ request: { amountMicros: 2_000_000_000n } }); // $2000
    expect(evaluateCondition(c, { op: 'amount_gte', microsUsd: 1_000_000_000n }).satisfied).toBe(true);
    expect(evaluateCondition(c, { op: 'amount_gte', microsUsd: 5_000_000_000n }).satisfied).toBe(false);
    // no amount present → never fires
    expect(evaluateCondition(ctx(), { op: 'amount_gte', microsUsd: 1n }).satisfied).toBe(false);
  });

  it('amount_exceeds_daily_remaining', () => {
    const c = ctx({ request: { amountMicros: 200n }, limits: { dailyRemainingMicros: 100n } });
    expect(evaluateCondition(c, { op: 'amount_exceeds_daily_remaining' }).satisfied).toBe(true);
  });

  it('recipient + risk + device conditions', () => {
    expect(
      evaluateCondition(ctx({ recipient: { trust: 'unknown', isNew: true } }), { op: 'recipient_is_new' }).satisfied,
    ).toBe(true);
    expect(
      evaluateCondition(ctx({ recipient: { trust: 'unknown', isNew: false } }), {
        op: 'recipient_trust_below',
        level: 'known',
      }).satisfied,
    ).toBe(true);
    expect(
      evaluateCondition(ctx({ device: { trusted: false, biometricAvailable: true } }), { op: 'device_untrusted' })
        .satisfied,
    ).toBe(true);
    expect(
      evaluateCondition(ctx({ device: { trusted: true, biometricAvailable: false } }), { op: 'biometric_unavailable' })
        .satisfied,
    ).toBe(true);
  });

  it('approval_is_unlimited uses the max-uint sentinel', () => {
    const unlimited = ctx({
      request: {
        approval: { token: 'USDC', spender: '0xdead', amountBase: UNLIMITED_APPROVAL_THRESHOLD, decimals: 6 },
      },
    });
    const bounded = ctx({
      request: { approval: { token: 'USDC', spender: '0xdead', amountBase: 1000n, decimals: 6 } },
    });
    expect(evaluateCondition(unlimited, { op: 'approval_is_unlimited' }).satisfied).toBe(true);
    expect(evaluateCondition(bounded, { op: 'approval_is_unlimited' }).satisfied).toBe(false);
  });

  it('automation_not_preapproved only for automation without a rule id', () => {
    expect(
      evaluateCondition(ctx({ request: { policyType: 'automation' } }), { op: 'automation_not_preapproved' }).satisfied,
    ).toBe(true);
    expect(
      evaluateCondition(ctx({ request: { policyType: 'automation', automationRuleId: 'rule-9' } }), {
        op: 'automation_not_preapproved',
      }).satisfied,
    ).toBe(false);
    expect(
      evaluateCondition(ctx({ request: { policyType: 'transaction' } }), { op: 'automation_not_preapproved' })
        .satisfied,
    ).toBe(false);
  });

  it('time_within_window reads the injected clock, not a real one', () => {
    const noon = ctx({ nowIso: '2026-01-01T12:00:00.000Z' });
    expect(evaluateCondition(noon, { op: 'time_within_window', window: { startHour: 9, endHour: 17 } }).satisfied).toBe(
      true,
    );
    expect(evaluateCondition(noon, { op: 'time_within_window', window: { startHour: 22, endHour: 6 } }).satisfied).toBe(
      false,
    ); // overnight window
  });

  it('and/or combine and collect matched op-codes', () => {
    const c = ctx({ request: { amountMicros: 5_000_000_000n }, recipient: { trust: 'unknown', isNew: true } });
    const r = evaluateCondition(c, {
      op: 'and',
      all: [{ op: 'amount_gte', microsUsd: 1_000_000_000n }, { op: 'recipient_is_new' }],
    });
    expect(r.satisfied).toBe(true);
    expect(r.matched).toEqual(['amount_gte', 'recipient_is_new']);
    expect(
      evaluateCondition(c, { op: 'and', all: [{ op: 'amount_gte', microsUsd: 1n }, { op: 'device_untrusted' }] })
        .satisfied,
    ).toBe(false);
    expect(
      evaluateCondition(c, { op: 'or', any: [{ op: 'device_untrusted' }, { op: 'recipient_is_new' }] }).satisfied,
    ).toBe(true);
  });
});
