import { describe, expect, it } from 'vitest';
import type { RouteProvider } from '@intent-wallet/intents';
import { makeCompositeRoutes, makeJupiterRouteProvider } from '../src/jupiter.js';

function fakeJup(
  quote: unknown,
  ok = true,
  status = 200,
): { fetchFn: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>; calls: string[] } {
  const calls: string[] = [];
  const fetchFn = (url: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
    calls.push(url);
    return Promise.resolve({ ok, status, json: () => Promise.resolve(quote) });
  };
  return { fetchFn, calls };
}

describe('makeJupiterRouteProvider', () => {
  it('maps a real Jupiter quote to a Route for a Solana pair', async () => {
    const { fetchFn, calls } = fakeJup({
      outAmount: '82698067',
      otherAmountThreshold: '82284577',
      slippageBps: 50,
      routePlan: [{ swapInfo: { label: 'Quantum' } }],
    });

    const route = await makeJupiterRouteProvider(fetchFn).findRoute({
      fromSymbol: 'SOL',
      toSymbol: 'USDC',
      amountBase: 1_000_000_000n,
      fromDecimals: 9,
    });

    expect(route?.outMinBase).toBe(82_284_577n); // otherAmountThreshold (slippage-adjusted)
    expect(route?.outDecimals).toBe(6);
    expect(route?.legs[0]?.chainId).toBe('solana:mainnet');
    expect(route?.legs[0]?.description).toContain('Quantum');
    expect(calls[0]).toContain('inputMint=So11111111111111111111111111111111111111112');
  });

  it('returns null for a non-Solana pair without hitting the network', async () => {
    const { fetchFn, calls } = fakeJup({});

    expect(await makeJupiterRouteProvider(fetchFn).findRoute({ fromSymbol: 'ETH', toSymbol: 'USDC', amountBase: 1n, fromDecimals: 18 })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('returns null when Jupiter has no route (429/no quote) so a fallback can answer', async () => {
    const { fetchFn } = fakeJup({}, false, 429);
    expect(
      await makeJupiterRouteProvider(fetchFn).findRoute({ fromSymbol: 'SOL', toSymbol: 'USDC', amountBase: 1_000_000_000n, fromDecimals: 9 }),
    ).toBeNull();
  });
});

describe('makeCompositeRoutes', () => {
  it('uses the first provider that returns a route, else falls through', async () => {
    const { fetchFn } = fakeJup({ outAmount: '5', otherAmountThreshold: '5', slippageBps: 50, routePlan: [] });
    const jup = makeJupiterRouteProvider(fetchFn);
    const stub: RouteProvider = {
      findRoute: () => Promise.resolve({ legs: [], outMinBase: 99n, outDecimals: 6, feeMicros: 0n, slippageBps: 50, etaSeconds: 30 }),
    };
    const composite = makeCompositeRoutes([jup, stub]);

    // SOL→USDC: Jupiter answers; ETH→USDC: Jupiter returns null → the stub answers.
    expect((await composite.findRoute({ fromSymbol: 'SOL', toSymbol: 'USDC', amountBase: 1n, fromDecimals: 9 }))?.outMinBase).toBe(5n);
    expect((await composite.findRoute({ fromSymbol: 'ETH', toSymbol: 'USDC', amountBase: 1n, fromDecimals: 18 }))?.outMinBase).toBe(99n);
  });
});
