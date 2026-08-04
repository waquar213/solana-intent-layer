import { describe, expect, it } from 'vitest';
import {
  ContextEngine,
  createInMemorySources,
  createTestEnv,
  DecisionEngine,
  POLICY_PRESETS,
  PolicySimulator,
  RuleEngine,
} from '../src/index.js';
import { cleanRisk, req } from './helpers.js';

const buildSimulator = () => {
  const env = createTestEnv();
  return new PolicySimulator({
    context: new ContextEngine(createInMemorySources(cleanRisk()), env),
    rules: new RuleEngine(),
    decision: new DecisionEngine(env),
  });
};

describe('PolicySimulator — read-only dry run', () => {
  it('diffs a candidate set against the live set', async () => {
    const sim = buildSimulator();
    const result = await sim.simulate({
      candidateSet: POLICY_PRESETS.strict,
      liveSet: POLICY_PRESETS.permissive,
      requests: [req({ amountMicros: 1_000_000_000n })], // $1000: strict confirms, permissive approves
    });
    expect(result.perRequest[0]!.candidate.outcome).toBe('approved_with_confirmation');
    expect(result.perRequest[0]!.live?.outcome).toBe('approved');
    expect(result.perRequest[0]!.changed).toBe(true);
    expect(result.summary.changedOutcomes).toBe(1);
  });

  it('reports zero changes when candidate equals live', async () => {
    const sim = buildSimulator();
    const result = await sim.simulate({
      candidateSet: POLICY_PRESETS.balanced,
      liveSet: POLICY_PRESETS.balanced,
      requests: [req({ amountMicros: 100_000_000n }), req({ amountMicros: 5_000_000_000n })],
    });
    expect(result.summary.changedOutcomes).toBe(0);
    expect(result.summary.total).toBe(2);
  });
});
