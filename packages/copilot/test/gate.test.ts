import { describe, expect, it } from 'vitest';
import { createInMemorySources, createPolicyEngine } from '@intent-wallet/policy';
import { RiskEngine } from '@intent-wallet/risk';
import { PolicyGate } from '../src/index.js';
import type { PlanProposal } from '../src/index.js';
import { sanctionedRisk } from './fakes.js';

let seq = 0;
const idFor = () => `id-${++seq}`;

const candidate = (over: Partial<PlanProposal> = {}): PlanProposal => ({
  policyType: 'transaction',
  intentKind: 'transfer',
  amountMicros: 100_000_000n, // $100
  summary: 'Send $100',
  planId: 'plan-1',
  ...over,
});

describe('PolicyGate — the single path to a ready plan', () => {
  it('marks a clean small plan ready', async () => {
    const policy = createPolicyEngine({ sources: createInMemorySources(new RiskEngine()) });
    const gate = new PolicyGate((r) => policy.evaluate(r), idFor);
    const p = await gate.evaluate(candidate(), 'user-1');
    expect(p.status).toBe('ready');
    expect(p.plan).not.toBeNull();
    expect(p.signed).toBe(false);
  });

  it('marks a plan over the threshold needs_confirmation', async () => {
    const policy = createPolicyEngine({ sources: createInMemorySources(new RiskEngine()) });
    const gate = new PolicyGate((r) => policy.evaluate(r), idFor);
    const p = await gate.evaluate(candidate({ amountMicros: 5_000_000_000n, summary: 'Send $5,000' }), 'user-1');
    expect(p.status).toBe('needs_confirmation');
    expect(p.plan).not.toBeNull();
  });

  it('blocks a sanctioned recipient — explained_gate, plan nulled', async () => {
    const SANCT = '0x1111111111111111111111111111111111111111';
    const policy = createPolicyEngine({ sources: createInMemorySources(sanctionedRisk(SANCT)) });
    const gate = new PolicyGate((r) => policy.evaluate(r), idFor);
    const p = await gate.evaluate(candidate({ recipient: { address: SANCT, chainId: 'ethereum' } }), 'user-1');
    expect(p.status).toBe('explained_gate');
    expect(p.plan).toBeNull();
    expect(p.policy.blocking).toBe(true);
  });

  it('fails closed when no policy engine is wired', async () => {
    const gate = new PolicyGate(undefined, idFor);
    const p = await gate.evaluate(candidate(), 'user-1');
    expect(p.status).toBe('explained_gate');
    expect(p.plan).toBeNull();
  });

  it('fails closed when policy evaluation throws (e.g. an unresolvable plan quote)', async () => {
    const gate = new PolicyGate(() => Promise.reject(new Error('quote unresolvable')), idFor);
    const p = await gate.evaluate(candidate(), 'user-1');
    expect(p.status).toBe('explained_gate');
    expect(p.plan).toBeNull();
    expect(p.signed).toBe(false);
  });
});
