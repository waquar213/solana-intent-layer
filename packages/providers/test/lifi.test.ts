/**
 * LI.FI provider plugin — normalization of a real-shaped LI.FI response into the framework's
 * CrossChainSwapQuote, and the fail-closed refusals. Uses a FAKE fetch (no network, no funds): the
 * canned body mirrors a real li.quest/v1/quote response (100 USDC Arbitrum -> ETH Optimism via Across).
 */
import { describe, expect, it, vi } from 'vitest';
import { makeLifiProvider, usdStringToMicros, ProviderError } from '../src/index.js';
import type { FetchLike } from '../src/index.js';

// A real-shaped LI.FI quote body (trimmed to the fields the plugin reads).
const OK_BODY = {
  tool: 'across',
  action: { toToken: { symbol: 'ETH', decimals: 18 } },
  estimate: {
    toAmount: '53322235739186480',
    toAmountUSD: '99.9035',
    executionDuration: 120,
    feeCosts: [{ amountUSD: '0.25' }],
    gasCosts: [{ amountUSD: '0.1086' }],
    approvalAddress: '0x1111111111111111111111111111111111119999',
  },
  includedSteps: [{ tool: 'feeCollection' }, { tool: 'bitget' }, { tool: 'across' }],
  transactionRequest: { to: '0xAbc', data: '0xdead', value: '0x0', chainId: 10 },
};

const RESOLVE = (id: string): string | undefined => ({ 'eip155:42161': '42161', 'eip155:10': '10', 'solana:mainnet': 'SOL' })[id];

function fakeFetch(body: unknown, ok = true, status = 200): FetchLike {
  return vi.fn(async () => ({ ok, status, json: async () => body }));
}

const REQ = {
  fromChainId: 'eip155:42161',
  toChainId: 'eip155:10',
  fromToken: 'USDC',
  toToken: 'ETH',
  amountInBase: 100_000_000n,
  fromDecimals: 6,
  fromAddress: '0x1111111111111111111111111111111111111111',
  slippageBps: 50,
} as const;

describe('usdStringToMicros', () => {
  it('parses decimal USD strings to micro-USD without float drift', () => {
    expect(usdStringToMicros('99.9035')).toBe(99_903_500n);
    expect(usdStringToMicros('100')).toBe(100_000_000n);
    expect(usdStringToMicros('0.1086')).toBe(108_600n);
    expect(usdStringToMicros('1.2345678')).toBe(1_234_567n); // truncated to 6 dp
  });
  it('returns null for junk / missing input', () => {
    expect(usdStringToMicros('abc')).toBeNull();
    expect(usdStringToMicros(null)).toBeNull();
    expect(usdStringToMicros(undefined)).toBeNull();
    expect(usdStringToMicros('')).toBeNull();
  });
});

describe('makeLifiProvider.quote', () => {
  it('normalizes a real-shaped LI.FI response', async () => {
    const p = makeLifiProvider({ fetchImpl: fakeFetch(OK_BODY), resolveChain: RESOLVE, now: () => 12_345 });
    const q = await p.quote(REQ);
    expect(q.providerId).toBe('lifi');
    expect(q.toAmountBase).toBe(53_322_235_739_186_480n);
    expect(q.toDecimals).toBe(18);
    expect(q.toTokenSymbol).toBe('ETH');
    expect(q.toValueMicros).toBe(99_903_500n);
    expect(q.feeMicros).toBe(250_000n);
    expect(q.gasMicros).toBe(108_600n);
    expect(q.etaSeconds).toBe(120);
    expect(q.tool).toBe('across');
    expect(q.steps).toEqual(['feeCollection', 'bitget', 'across']);
    expect(q.execution?.ecosystem).toBe('evm');
    expect(q.execution?.raw).toEqual(OK_BODY.transactionRequest);
    expect(q.execution?.approvalSpender).toBe('0x1111111111111111111111111111111111119999');
    expect(q.quotedAt).toBe(12_345);
  });

  it('marks the execution ecosystem as solana when the source is SOL', async () => {
    const p = makeLifiProvider({ fetchImpl: fakeFetch(OK_BODY), resolveChain: RESOLVE, now: () => 1 });
    const q = await p.quote({ ...REQ, fromChainId: 'solana:mainnet' });
    expect(q.execution?.ecosystem).toBe('solana');
  });

  it('sends the right query params (slippage as a fraction, exact fromAmount)', async () => {
    const spy = fakeFetch(OK_BODY);
    const p = makeLifiProvider({ fetchImpl: spy, resolveChain: RESOLVE, now: () => 1 });
    await p.quote(REQ);
    const url = (spy as unknown as { mock: { calls: [string][] } }).mock.calls[0]?.[0] ?? '';
    expect(url).toContain('fromChain=42161');
    expect(url).toContain('toChain=10');
    expect(url).toContain('fromAmount=100000000');
    expect(url).toContain('slippage=0.005'); // 50 bps
  });

  it('FAILS CLOSED on an unmappable chain — and never calls the network', async () => {
    const spy = fakeFetch(OK_BODY);
    const p = makeLifiProvider({ fetchImpl: spy, resolveChain: RESOLVE, now: () => 1 });
    await expect(p.quote({ ...REQ, toChainId: 'aptos:1' })).rejects.toThrow(ProviderError);
    expect((spy as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
  });

  it('throws on an HTTP error response', async () => {
    const p = makeLifiProvider({ fetchImpl: fakeFetch({ message: 'no route found' }, false, 404), resolveChain: RESOLVE, now: () => 1 });
    await expect(p.quote(REQ)).rejects.toThrow(/no route found/i);
  });

  it('refuses a malformed quote (missing toAmount/decimals)', async () => {
    const bad = { ...OK_BODY, estimate: { ...OK_BODY.estimate, toAmount: undefined } };
    const p = makeLifiProvider({ fetchImpl: fakeFetch(bad), resolveChain: RESOLVE, now: () => 1 });
    await expect(p.quote(REQ)).rejects.toThrow(ProviderError);
  });
});
