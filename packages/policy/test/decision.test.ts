import { describe, expect, it } from 'vitest';
import { composeWithRisk, createTestEnv, DecisionEngine } from '../src/index.js';
import type { CombinedGate, PolicyDecision, PolicyOutcome, SecurityDecision, SecurityVerdict } from '../src/index.js';
import { ctx, F } from './helpers.js';

const policyDecision = (outcome: PolicyOutcome): PolicyDecision => ({
  requestId: 'r',
  outcome,
  firedRules: [],
  decidedBy: [],
  conflicts: [],
  requirements: outcome === 'approved_with_confirmation' ? [{ kind: 'biometric' }] : [],
  summary: `policy ${outcome}`,
  decisionHash: 'h',
  evaluatedAtIso: '2026-01-01T00:00:00.000Z',
});

const riskDecision = (verdict: SecurityVerdict): SecurityDecision => ({
  verdict,
  report: { level: verdict === 'block' ? 'block' : 'low', score: verdict === 'block' ? 0.99 : 0, signals: [] },
  policyViolations: [],
});

describe('composeWithRisk — most-restrictive-wins', () => {
  const cases: Array<[SecurityVerdict, PolicyOutcome, CombinedGate]> = [
    ['allow', 'approved', 'allow'],
    ['allow', 'approved_with_confirmation', 'require_confirmation'],
    ['allow', 'deferred', 'defer'],
    ['allow', 'escalated', 'escalate'],
    ['allow', 'blocked', 'block'],
    ['require_confirmation', 'approved', 'require_confirmation'], // policy cannot loosen risk
    ['block', 'approved', 'block'], // risk block terminal regardless of policy
    ['block', 'blocked', 'block'],
    ['require_confirmation', 'escalated', 'escalate'], // more restrictive of the two
  ];
  it.each(cases)('risk=%s + policy=%s → gate=%s', (verdict, outcome, gate) => {
    const p = composeWithRisk(policyDecision(outcome), riskDecision(verdict));
    expect(p.gate).toBe(gate);
  });

  it('mayProceedToSign only on a clean allow with no requirements', () => {
    expect(composeWithRisk(policyDecision('approved'), riskDecision('allow')).mayProceedToSign).toBe(true);
    expect(composeWithRisk(policyDecision('approved_with_confirmation'), riskDecision('allow')).mayProceedToSign).toBe(
      false,
    );
    expect(composeWithRisk(policyDecision('approved'), riskDecision('block')).mayProceedToSign).toBe(false);
  });

  it('attributes drivenBy to the side that forced the gate and binds the plan', () => {
    const riskDriven = composeWithRisk(policyDecision('approved'), riskDecision('block'), { planId: 'plan-9' });
    expect(riskDriven.drivenBy).toEqual(['risk']);
    expect(riskDriven.planId).toBe('plan-9');
    const policyDriven = composeWithRisk(policyDecision('blocked'), riskDecision('allow'));
    expect(policyDriven.drivenBy).toEqual(['policy']);
  });
});

describe('DecisionEngine.decide', () => {
  const env = createTestEnv();
  const engine = new DecisionEngine(env);

  it('resolves fired rules and unions confirmation requirements', () => {
    const fired = [F('big', 300, 'approved_with_confirmation'), F('new', 250, 'approved_with_confirmation')];
    fired[0]!.requirement = { kind: 'biometric' };
    const d = engine.decide(fired, ctx(), 'set-hash-1');
    expect(d.outcome).toBe('approved_with_confirmation');
    expect(d.requirements).toContainEqual({ kind: 'biometric' });
    expect(d.summary).toContain('approved_with_confirmation');
  });

  it('the decision hash is stable for identical inputs and changes with the active set', () => {
    const fired = [F('r', 100, 'deferred')];
    const h1 = engine.decide(fired, ctx(), 'set-A').decisionHash;
    const h2 = engine.decide(fired, ctx(), 'set-A').decisionHash;
    const h3 = engine.decide(fired, ctx(), 'set-B').decisionHash;
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });
});
