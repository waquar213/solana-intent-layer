import { describe, expect, it } from 'vitest';
import { createInMemorySources, createPolicyEngine } from '../src/index.js';
import type { PolicySet } from '../src/index.js';
import { cleanRisk, req, sanctioningRisk } from './helpers.js';

const SANCT = '0x1111111111111111111111111111111111111111';

const EMPTY_SET: PolicySet = {
  id: 'empty',
  name: 'empty',
  version: 1,
  rules: [],
  basis: 'custom',
  createdAtIso: '2026-01-01T00:00:00.000Z',
  createdBy: 'test',
  contentHash: 'empty',
};

describe('guardrail bypass attempts', () => {
  it('cannot spoof a low amount past a threshold — the plan quote is authoritative', async () => {
    const sources = createInMemorySources(cleanRisk(), { planQuote: async () => ({ youSendMicros: 10_000_000_000n }) });
    const engine = createPolicyEngine({ sources });
    const p = await engine.evaluate(req({ amountMicros: 100_000_000n, planId: 'plan-1' })); // claims $100, really $10k
    expect(p.gate).toBe('require_confirmation'); // biometric threshold caught it
  });

  it('an empty / permissive policy still cannot allow what Risk blocks', async () => {
    const engine = createPolicyEngine({
      sources: createInMemorySources(sanctioningRisk(SANCT)),
      defaultSet: EMPTY_SET,
    });
    const p = await engine.evaluate(req({ recipient: { address: SANCT, chainId: 'ethereum' } }));
    expect(p.gate).toBe('block'); // Risk floor holds even with zero policy rules
    expect(p.mayProceedToSign).toBe(false);
  });

  it('a permission binds to exactly one plan (replay defense)', async () => {
    const engine = createPolicyEngine({ sources: createInMemorySources(cleanRisk()) });
    const p = await engine.evaluate(req({ amountMicros: 1n, planId: 'plan-A', intentId: 'intent-A' }));
    expect(p.planId).toBe('plan-A');
    expect(p.intentId).toBe('intent-A');
  });
});
