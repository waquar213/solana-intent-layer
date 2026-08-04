import { describe, expect, it } from 'vitest';
import { createTestEnv, DecisionEngine, OUTCOME_RANK, POLICY_PRESETS, RuleEngine } from '../src/index.js';
import type { PolicyContext, PolicyOutcome } from '../src/index.js';
import { ctx } from './helpers.js';

const engine = new RuleEngine();
const decision = new DecisionEngine(createTestEnv());

function outcomeUnder(preset: keyof typeof POLICY_PRESETS, context: PolicyContext): PolicyOutcome {
  const set = POLICY_PRESETS[preset];
  return decision.decide(engine.run(set.rules, context), context, set.contentHash).outcome;
}

describe('presets — strict ⊇ balanced ⊇ permissive', () => {
  const riskConfirm = {
    verdict: 'require_confirmation' as const,
    report: { level: 'high' as const, score: 0.7, signals: [] },
    policyViolations: [],
  };

  const battery: PolicyContext[] = [
    ctx({ request: { amountMicros: 100_000_000n } }), // $100
    ctx({ request: { amountMicros: 1_000_000_000n } }), // $1000
    ctx({ request: { amountMicros: 5_000_000_000n } }), // $5000
    ctx({ request: { amountMicros: 50_000_000_000n } }), // $50000
    ctx({ recipient: { trust: 'unknown', isNew: true } }), // new recipient
    ctx({ risk: riskConfirm }), // elevated risk
  ];

  it('is monotonic in restrictiveness across the request battery', () => {
    for (const context of battery) {
      const s = OUTCOME_RANK[outcomeUnder('strict', context)];
      const b = OUTCOME_RANK[outcomeUnder('balanced', context)];
      const p = OUTCOME_RANK[outcomeUnder('permissive', context)];
      expect(s, 'strict ≥ balanced').toBeGreaterThanOrEqual(b);
      expect(b, 'balanced ≥ permissive').toBeGreaterThanOrEqual(p);
    }
  });

  it('every preset is a content-hashed set with the shared hard-security floor', () => {
    for (const key of ['strict', 'balanced', 'permissive'] as const) {
      const set = POLICY_PRESETS[key];
      expect(set.contentHash).toBeTruthy();
      expect(set.rules.some((r) => r.id === 'unlimited-approval-block' && !r.overridable)).toBe(true);
      expect(set.rules.some((r) => r.id === 'risk-verdict-block' && !r.overridable)).toBe(true);
    }
  });
});
