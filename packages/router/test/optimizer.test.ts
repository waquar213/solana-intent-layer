import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from '@intent-wallet/providers';
import type { SimulationProvider, SwapProvider, SwapQuote } from '@intent-wallet/providers';
import { CandidateGenerator } from '../src/candidates.js';
import { GlobalRouteOptimizer } from '../src/optimizer.js';
import { boundedPredictor } from '../src/predictor.js';
import type { RouteRequest } from '../src/request.js';

const REQ: RouteRequest = {
  fromSymbol: 'ETH',
  toSymbol: 'USDC',
  amountInBase: 10n ** 18n,
  fromDecimals: 18,
  chainId: 'ethereum',
};

function swap(id: string, over: Partial<SwapQuote> = {}): SwapProvider {
  return {
    id,
    kind: 'swap',
    async quote(): Promise<SwapQuote> {
      return {
        providerId: id,
        amountOutBase: over.amountOutBase ?? 2_000_000_000n,
        outDecimals: 6,
        feeMicros: over.feeMicros ?? 100_000n,
        slippageBps: over.slippageBps ?? 50,
        etaSeconds: over.etaSeconds ?? 30,
        quotedAt: over.quotedAt ?? 1_000,
      };
    },
  };
}

function swaps(...providers: SwapProvider[]): ProviderRegistry<SwapProvider> {
  const reg = new ProviderRegistry<SwapProvider>({ now: () => 1_000 });
  for (const p of providers) reg.register(p);
  return reg;
}

function generator(reg: ProviderRegistry<SwapProvider>) {
  return new CandidateGenerator({ swaps: reg, now: () => 1_000 });
}

const okSimulator: SimulationProvider = {
  id: 'sim',
  kind: 'simulation',
  async simulate() {
    return { ok: true };
  },
};

describe('GlobalRouteOptimizer', () => {
  it('generates, scores, and returns the best route + alternatives + confidence', async () => {
    const opt = new GlobalRouteOptimizer({
      generator: generator(
        swaps(swap('dexA', { amountOutBase: 2_000_000_000n }), swap('dexB', { amountOutBase: 2_100_000_000n })),
      ),
    });
    const result = await opt.optimize(REQ, { preset: 'balanced' });
    expect(result.best.candidate.providerIds).toEqual(['dexB']); // more output
    expect(result.alternatives).toHaveLength(1);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('throws NO_ROUTE when no provider returns a candidate', async () => {
    const opt = new GlobalRouteOptimizer({ generator: generator(swaps()) });
    await expect(opt.optimize(REQ)).rejects.toThrowError(expect.objectContaining({ code: 'NO_ROUTE' }));
  });

  it('simulates every candidate and rejects failures before ranking', async () => {
    const rejectingSim: SimulationProvider = {
      id: 'sim',
      kind: 'simulation',
      async simulate({ payload }) {
        // Reject dexBad; accept everything else.
        const c = payload as { providerIds: string[] };
        return { ok: !c.providerIds.includes('dexBad') };
      },
    };
    const opt = new GlobalRouteOptimizer({
      generator: generator(
        swaps(swap('dexBad', { amountOutBase: 9_000_000_000n }), swap('dexGood', { amountOutBase: 2_000_000_000n })),
      ),
      simulator: rejectingSim,
    });
    const result = await opt.optimize(REQ);
    // dexBad had the best output but failed simulation → dexGood wins.
    expect(result.best.candidate.providerIds).toEqual(['dexGood']);
  });

  it('throws ALL_ROUTES_FAILED_SIMULATION when no candidate simulates', async () => {
    const failSim: SimulationProvider = {
      id: 'sim',
      kind: 'simulation',
      async simulate() {
        return { ok: false, reason: 'revert' };
      },
    };
    const opt = new GlobalRouteOptimizer({ generator: generator(swaps(swap('a'))), simulator: failSim });
    await expect(opt.optimize(REQ)).rejects.toThrowError(
      expect.objectContaining({ code: 'ALL_ROUTES_FAILED_SIMULATION' }),
    );
  });

  it('gives higher confidence with simulation and a clear winner', async () => {
    const clear = new GlobalRouteOptimizer({
      generator: generator(
        swaps(swap('win', { amountOutBase: 3_000_000_000n }), swap('lose', { amountOutBase: 1_000_000_000n })),
      ),
      simulator: okSimulator,
    });
    const result = await clear.optimize(REQ);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('drops stale-quote candidates during discovery', async () => {
    // now=1000, quote quotedAt=0 is fresh; a very old quote would be dropped.
    const reg = new ProviderRegistry<SwapProvider>({ now: () => 1_000_000 }); // far future → all stale
    reg.register(swap('stale', { quotedAt: 0 }));
    const opt = new GlobalRouteOptimizer({ generator: new CandidateGenerator({ swaps: reg, now: () => 1_000_000 }) });
    await expect(opt.optimize(REQ)).rejects.toThrowError(expect.objectContaining({ code: 'NO_ROUTE' }));
  });
});

describe('ML predictor separation', () => {
  it('a bounded predictor re-ranks a genuine tie', async () => {
    // Two IDENTICAL candidates → equal deterministic scores; the ML nudge decides.
    const gen = generator(
      swaps(swap('dexA', { amountOutBase: 2_000_000_000n }), swap('dexB', { amountOutBase: 2_000_000_000n })),
    );
    const predictor = boundedPredictor((c) => (c.providerIds.includes('dexA') ? 0.05 : 0), 0.1);
    const opt = new GlobalRouteOptimizer({ generator: gen, predictor });
    const result = await opt.optimize(REQ);
    expect(result.best.candidate.providerIds).toEqual(['dexA']); // ML broke the tie
  });

  it('a bounded predictor CANNOT crown a clearly-worse route (the band is clamped)', async () => {
    // dexB has far more output; even a large ML signal for dexA is clamped to the band.
    const gen = generator(
      swaps(swap('dexA', { amountOutBase: 1_000_000_000n }), swap('dexB', { amountOutBase: 3_000_000_000n })),
    );
    const predictor = boundedPredictor(() => 1, 0.1); // tries to boost dexA hugely; clamped to ±0.1
    const opt = new GlobalRouteOptimizer({ generator: gen, predictor });
    const result = await opt.optimize(REQ);
    expect(result.best.candidate.providerIds).toEqual(['dexB']); // deterministic winner stands
  });

  it('the deterministic result stands when there is no predictor', async () => {
    const opt = new GlobalRouteOptimizer({
      generator: generator(
        swaps(swap('a', { amountOutBase: 2_000_000_000n }), swap('b', { amountOutBase: 2_100_000_000n })),
      ),
    });
    const result = await opt.optimize(REQ);
    expect(result.best.candidate.providerIds).toEqual(['b']); // pure deterministic: more output wins
  });
});
