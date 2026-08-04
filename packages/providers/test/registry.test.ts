import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from '../src/registry.js';
import { HealthTracker } from '../src/health.js';
import { bestSwapQuote, isValidSwapQuote } from '../src/aggregate.js';
import { RouteOptimizer } from '../src/route.js';
import type { SwapProvider, SwapQuote, SwapRequest } from '../src/provider.js';

const REQ: SwapRequest = {
  fromSymbol: 'ETH',
  toSymbol: 'USDC',
  amountInBase: 10n ** 18n,
  fromDecimals: 18,
  chainId: 'ethereum',
};

/** A swap provider that returns a fixed quote or throws. */
function swap(id: string, behavior: { out?: bigint; fee?: bigint; throws?: boolean; quotedAt?: number }): SwapProvider {
  return {
    id,
    kind: 'swap',
    async quote(): Promise<SwapQuote> {
      if (behavior.throws) throw new Error(`${id} down`);
      return {
        providerId: id,
        amountOutBase: behavior.out ?? 2_000_000_000n,
        outDecimals: 6,
        feeMicros: behavior.fee ?? 100_000n,
        slippageBps: 50,
        etaSeconds: 20,
        quotedAt: behavior.quotedAt ?? 1_000,
      };
    },
  };
}

describe('ProviderRegistry.run (failover)', () => {
  it('runs on the healthiest provider and returns its result', async () => {
    const reg = new ProviderRegistry<SwapProvider>();
    reg.register(swap('a', { out: 100n }));
    reg.register(swap('b', { out: 200n }));
    const { providerId, result } = await reg.run((p) => p.quote(REQ));
    expect(['a', 'b']).toContain(providerId);
    expect(result.amountOutBase).toBeGreaterThan(0n);
  });

  it('fails over past a throwing provider to a healthy one', async () => {
    const clock = 0;
    const health = new HealthTracker({ now: () => clock });
    const reg = new ProviderRegistry<SwapProvider>({ health, now: () => clock });
    reg.register(swap('bad', { throws: true }));
    reg.register(swap('good', { out: 500n }));
    // Prime scores so 'bad' is tried first, then fails over.
    const { providerId } = await reg.run((p) => p.quote(REQ));
    expect(providerId).toBe('good');
    // 'bad' recorded a failure.
    expect(health.snapshot('bad').consecutiveFailures).toBe(1);
  });

  it('throws NO_PROVIDERS when the registry is empty', async () => {
    const reg = new ProviderRegistry<SwapProvider>();
    await expect(reg.run((p) => p.quote(REQ))).rejects.toThrowError(expect.objectContaining({ code: 'NO_PROVIDERS' }));
  });

  it('throws ALL_PROVIDERS_FAILED when every provider fails', async () => {
    const reg = new ProviderRegistry<SwapProvider>();
    reg.register(swap('x', { throws: true }));
    reg.register(swap('y', { throws: true }));
    await expect(reg.run((p) => p.quote(REQ))).rejects.toThrowError(
      expect.objectContaining({ code: 'ALL_PROVIDERS_FAILED' }),
    );
  });

  it('sheds a provider whose circuit has opened', async () => {
    const clock = 0;
    const health = new HealthTracker({ failureThreshold: 1, cooldownMs: 10_000, now: () => clock });
    const reg = new ProviderRegistry<SwapProvider>({ health, now: () => clock });
    reg.register(swap('flaky', { throws: true }));
    reg.register(swap('solid', { out: 1n }));
    await reg.run((p) => p.quote(REQ)); // flaky fails → circuit opens (threshold 1)
    expect(health.available('flaky')).toBe(false);
    // Next run must skip flaky entirely and use solid.
    const { providerId } = await reg.run((p) => p.quote(REQ));
    expect(providerId).toBe('solid');
  });
});

describe('quote aggregation', () => {
  it('picks the provider with the best output, tie-breaking on fee', async () => {
    const reg = new ProviderRegistry<SwapProvider>();
    reg.register(swap('cheap-low-out', { out: 1_900_000_000n, fee: 50_000n }));
    reg.register(swap('best-out', { out: 2_050_000_000n, fee: 120_000n }));
    reg.register(swap('same-out-cheaper', { out: 2_050_000_000n, fee: 90_000n }));
    const best = await bestSwapQuote(reg, REQ, { now: () => 1_000 });
    expect(best?.amountOutBase).toBe(2_050_000_000n);
    expect(best?.providerId).toBe('same-out-cheaper'); // tie on output → lower fee wins
  });

  it('rejects stale and invalid quotes', () => {
    const base: SwapQuote = {
      providerId: 'p',
      amountOutBase: 100n,
      outDecimals: 6,
      feeMicros: 10n,
      slippageBps: 50,
      etaSeconds: 10,
      quotedAt: 0,
    };
    expect(isValidSwapQuote(base, { now: () => 1_000 })).toBe(true);
    expect(isValidSwapQuote(base, { now: () => 100_000 })).toBe(false); // stale (>30s)
    expect(isValidSwapQuote({ ...base, amountOutBase: 0n }, { now: () => 1_000 })).toBe(false);
    expect(isValidSwapQuote({ ...base, slippageBps: 5000 }, { now: () => 1_000 })).toBe(false); // > max
  });

  it('returns null when no provider gives a valid quote', async () => {
    const reg = new ProviderRegistry<SwapProvider>();
    reg.register(swap('stale', { quotedAt: 0 }));
    const best = await bestSwapQuote(reg, REQ, { now: () => 1_000_000 }); // everything stale
    expect(best).toBeNull();
  });
});

describe('RouteOptimizer', () => {
  it('builds a same-chain swap route from the best aggregated quote', async () => {
    const swaps = new ProviderRegistry<SwapProvider>();
    swaps.register(swap('dexA', { out: 2_000_000_000n }));
    swaps.register(swap('dexB', { out: 2_100_000_000n }));
    const optimizer = new RouteOptimizer({ swaps, validation: { now: () => 1_000 } });
    const route = await optimizer.findSwapRoute(REQ);
    expect(route?.legs).toHaveLength(1);
    expect(route?.legs[0]).toMatchObject({ kind: 'swap', providerId: 'dexB' });
    expect(route?.amountOutBase).toBe(2_100_000_000n);
  });

  it('returns null when no route is available', async () => {
    const swaps = new ProviderRegistry<SwapProvider>();
    const optimizer = new RouteOptimizer({ swaps });
    expect(await optimizer.findSwapRoute(REQ)).toBeNull();
  });
});
