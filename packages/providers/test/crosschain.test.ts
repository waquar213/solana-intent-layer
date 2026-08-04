/**
 * Best cross-chain quote selection — the deterministic "which provider wins" core. Real money rides on
 * this pick, so it's tested to exhaustion: highest net value wins, stale/unpriced quotes can NEVER win
 * (fail-closed), ties break deterministically, and "nothing usable" throws rather than guessing.
 */
import { describe, expect, it } from 'vitest';
import { bestCrossChainQuote, netValueMicros, ProviderError } from '../src/index.js';
import type { CrossChainSwapQuote } from '../src/index.js';

const NOW = 1_000_000;
function q(partial: Partial<CrossChainSwapQuote> & { providerId: string }): CrossChainSwapQuote {
  return {
    toAmountBase: 1n,
    toDecimals: 18,
    toTokenSymbol: 'ETH',
    toValueMicros: 100_000_000n, // $100
    feeMicros: 0n,
    gasMicros: 0n,
    etaSeconds: 30,
    tool: 'across',
    steps: [],
    quotedAt: NOW,
    ...partial,
  };
}

describe('netValueMicros', () => {
  it('is destination value minus gas and fees', () => {
    expect(netValueMicros(q({ providerId: 'a', toValueMicros: 100_000_000n, gasMicros: 1_000_000n, feeMicros: 500_000n }))).toBe(98_500_000n);
  });
  it('is null when the quote is unpriced', () => {
    expect(netValueMicros(q({ providerId: 'a', toValueMicros: null }))).toBeNull();
  });
});

describe('bestCrossChainQuote', () => {
  it('picks the highest NET value (not just the biggest output)', () => {
    // b outputs a hair more USD but pays way more gas → a wins on net.
    const a = q({ providerId: 'lifi', toValueMicros: 100_000_000n, gasMicros: 200_000n });
    const b = q({ providerId: 'debridge', toValueMicros: 100_100_000n, gasMicros: 5_000_000n });
    const r = bestCrossChainQuote([a, b], { now: NOW });
    expect(r.best.providerId).toBe('lifi');
    expect(r.netMicros).toBe(99_800_000n);
    expect(r.ranked.map((x) => x.quote.providerId)).toEqual(['lifi', 'debridge']);
  });

  it('NEVER chooses an unpriced quote, even if its output looks bigger (fail-closed)', () => {
    const priced = q({ providerId: 'lifi', toValueMicros: 90_000_000n });
    const unpriced = q({ providerId: 'debridge', toValueMicros: null, toAmountBase: 999n });
    const r = bestCrossChainQuote([unpriced, priced], { now: NOW });
    expect(r.best.providerId).toBe('lifi');
    // the unpriced one is still surfaced (honest), but rejected + ranked last
    const last = r.ranked[r.ranked.length - 1];
    expect(last?.quote.providerId).toBe('debridge');
    expect(last?.rejected).toBe('unpriced');
  });

  it('rejects stale quotes and never picks them', () => {
    const fresh = q({ providerId: 'lifi', quotedAt: NOW });
    const stale = q({ providerId: 'debridge', quotedAt: NOW - 120_000, toValueMicros: 200_000_000n });
    const r = bestCrossChainQuote([stale, fresh], { now: NOW, maxAgeMs: 60_000 });
    expect(r.best.providerId).toBe('lifi');
    expect(r.ranked.find((x) => x.quote.providerId === 'debridge')?.rejected).toBe('stale');
  });

  it('throws NO_ROUTE when nothing is usable (empty / all stale / all unpriced)', () => {
    expect(() => bestCrossChainQuote([], { now: NOW })).toThrow(ProviderError);
    expect(() => bestCrossChainQuote([q({ providerId: 'a', toValueMicros: null })], { now: NOW })).toThrow(/no usable/i);
    expect(() => bestCrossChainQuote([q({ providerId: 'a', quotedAt: NOW - 999_999 })], { now: NOW })).toThrow(ProviderError);
  });

  it('breaks exact ties deterministically by providerId', () => {
    const a = q({ providerId: 'zeta', toValueMicros: 100_000_000n });
    const b = q({ providerId: 'alpha', toValueMicros: 100_000_000n });
    expect(bestCrossChainQuote([a, b], { now: NOW }).best.providerId).toBe('alpha');
    expect(bestCrossChainQuote([b, a], { now: NOW }).best.providerId).toBe('alpha'); // order-independent
  });
});
