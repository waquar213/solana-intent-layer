import { describe, expect, it } from 'vitest';
import {
  createInMemorySources,
  createPolicyEngine,
  InMemoryAuditSink,
  UNLIMITED_APPROVAL_THRESHOLD,
} from '../src/index.js';
import { cleanRisk, req, sanctioningRisk } from './helpers.js';

const SANCT = '0x1111111111111111111111111111111111111111';

describe('PolicyEngine.evaluate — end to end (balanced default)', () => {
  it('allows a small clean transfer and lets it proceed to signing', async () => {
    const engine = createPolicyEngine({ sources: createInMemorySources(cleanRisk()) });
    const p = await engine.evaluate(req({ amountMicros: 100_000_000n }));
    expect(p.gate).toBe('allow');
    expect(p.mayProceedToSign).toBe(true);
  });

  it('requires confirmation above the biometric threshold', async () => {
    const engine = createPolicyEngine({ sources: createInMemorySources(cleanRisk()) });
    const p = await engine.evaluate(req({ amountMicros: 5_000_000_000n })); // $5000 > $2000
    expect(p.gate).toBe('require_confirmation');
    expect(p.mayProceedToSign).toBe(false);
    expect(p.requirements).toContainEqual({ kind: 'biometric' });
  });

  it('blocks a sanctioned recipient (Risk drives the gate)', async () => {
    const engine = createPolicyEngine({ sources: createInMemorySources(sanctioningRisk(SANCT)) });
    const p = await engine.evaluate(req({ recipient: { address: SANCT, chainId: 'ethereum' } }));
    expect(p.gate).toBe('block');
    expect(p.drivenBy).toContain('risk');
  });

  it('blocks an unlimited approval (Policy drives the gate, non-overridable)', async () => {
    const engine = createPolicyEngine({ sources: createInMemorySources(cleanRisk()) });
    const p = await engine.evaluate(
      req({
        policyType: 'approval',
        intentKind: 'approve',
        approval: { token: 'USDC', spender: '0xdead', amountBase: UNLIMITED_APPROVAL_THRESHOLD, decimals: 6 },
      }),
    );
    expect(p.gate).toBe('block');
    expect(p.drivenBy).toContain('policy');
  });

  it('records every decision in the audit log', async () => {
    const auditSink = new InMemoryAuditSink();
    const engine = createPolicyEngine({ sources: createInMemorySources(cleanRisk()), auditSink });
    await engine.evaluate(req({ amountMicros: 1n }));
    await engine.evaluate(req({ amountMicros: 5_000_000_000n }));
    expect(auditSink.all()).toHaveLength(2);
  });
});
