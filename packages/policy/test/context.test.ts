import { describe, expect, it } from 'vitest';
import { ContextEngine, createInMemorySources, createTestEnv } from '../src/index.js';
import { cleanRisk, req } from './helpers.js';

describe('ContextEngine.assemble', () => {
  it('re-derives the authoritative amount from the plan quote, not the request (anti-spoofing)', async () => {
    const sources = createInMemorySources(cleanRisk(), {
      planQuote: async () => ({ youSendMicros: 10_000_000_000n }), // $10k on-chain
    });
    const engine = new ContextEngine(sources, createTestEnv());
    // Request LIES that it is only $100:
    const ctx = await engine.assemble(req({ amountMicros: 100_000_000n, planId: 'plan-1' }));
    expect(ctx.request.amountMicros).toBe(10_000_000_000n);
  });

  it('FAILS CLOSED when a plan-backed request has an unresolvable quote (no fallback to the request amount)', async () => {
    const sources = createInMemorySources(cleanRisk(), { planQuote: async () => null });
    const engine = new ContextEngine(sources, createTestEnv());
    await expect(engine.assemble(req({ amountMicros: 100_000_000n, planId: 'ghost-plan' }))).rejects.toThrow(
      /unresolvable|CONTEXT_ASSEMBLY_FAILED/,
    );
  });

  it('takes recipient trust from the source and deep-freezes the context', async () => {
    const sources = createInMemorySources(cleanRisk(), {
      trust: async () => ({ level: 'unknown', isNew: true }),
    });
    const engine = new ContextEngine(sources, createTestEnv());
    const ctx = await engine.assemble(req({ recipient: { address: '0xabc', chainId: 'ethereum' } }));
    expect(ctx.recipient).toEqual({ trust: 'unknown', isNew: true });
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.recipient)).toBe(true);
  });

  it('two assembles of the same request over the same sources are identical', async () => {
    const sources = createInMemorySources(cleanRisk());
    const engine = new ContextEngine(sources, createTestEnv({ nowIso: '2026-05-01T00:00:00.000Z' }));
    const a = await engine.assemble(req({ amountMicros: 5n }));
    const b = await engine.assemble(req({ amountMicros: 5n }));
    expect(a).toEqual(b);
  });
});
