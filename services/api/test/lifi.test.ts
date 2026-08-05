import { describe, expect, it } from 'vitest';
import { makeLifiProxy, type FetchLike } from '../src/lifi.js';

/** A fetch that records the URL + headers it was called with, and returns a fixed status + body. */
function capturingFetch(status: number, body: unknown): { fetchFn: FetchLike; calls: { url: string; headers?: Record<string, string> }[] } {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const fetchFn: FetchLike = (url, init) => {
    calls.push({ url, ...(init?.headers ? { headers: init.headers } : {}) });
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  };
  return { fetchFn, calls };
}

const Q = new URLSearchParams({
  fromChain: 'SOL',
  toChain: 'SOL',
  fromToken: 'SOL',
  toToken: 'USDC',
  fromAmount: '2000000000',
  fromAddress: 'Abc',
  toAddress: 'Abc',
  slippage: '0.005',
});

describe('makeLifiProxy', () => {
  it('forwards the /quote query to li.quest and returns the upstream status + body verbatim', async () => {
    const { fetchFn, calls } = capturingFetch(200, { tool: 'jupiter', estimate: { toAmount: '147000000' } });
    const r = await makeLifiProxy({ fetchFn }).quote(Q);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ tool: 'jupiter' });
    expect(calls[0]?.url).toBe(`https://li.quest/v1/quote?${Q.toString()}`);
  });

  it('adds the x-lifi-api-key header ONLY when a key is configured (never leaks it otherwise)', async () => {
    const keyed = capturingFetch(200, {});
    await makeLifiProxy({ fetchFn: keyed.fetchFn, apiKey: 'SECRET-KEY' }).quote(Q);
    expect(keyed.calls[0]?.headers?.['x-lifi-api-key']).toBe('SECRET-KEY');

    const free = capturingFetch(200, {});
    await makeLifiProxy({ fetchFn: free.fetchFn, apiKey: '' }).quote(Q);
    expect(free.calls[0]?.headers?.['x-lifi-api-key']).toBeUndefined();
  });

  it('passes an upstream rate-limit (429) THROUGH verbatim — status + body, so the client sees the truth', async () => {
    const { fetchFn } = capturingFetch(429, { message: 'Rate limit exceeded, retry in 35 minutes', code: 1005 });
    const r = await makeLifiProxy({ fetchFn }).quote(Q);
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: 1005 });
  });

  it('reports keyed vs free without exposing the key value', () => {
    expect(makeLifiProxy({ apiKey: 'x', fetchFn: capturingFetch(200, {}).fetchFn }).keyed).toBe(true);
    expect(makeLifiProxy({ apiKey: '', fetchFn: capturingFetch(200, {}).fetchFn }).keyed).toBe(false);
  });
});
