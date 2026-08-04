import { describe, expect, it } from 'vitest';
import { makeBtcHoldings } from '../src/btc.js';

function fakeEsplora(
  body: unknown,
  ok = true,
  status = 200,
): { fetchFn: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>; calls: string[] } {
  const calls: string[] = [];
  const fetchFn = (url: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
    calls.push(url);
    return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
  };
  return { fetchFn, calls };
}

const ADDR = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

describe('makeBtcHoldings', () => {
  it('maps a real Esplora response to a native BTC holding (funded − spent)', async () => {
    const { fetchFn, calls } = fakeEsplora({ chain_stats: { funded_txo_sum: 5_722_272_377, spent_txo_sum: 22_272_377 } });
    const holdings = await makeBtcHoldings('https://esplora.test/api', fetchFn)(ADDR);

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toEqual({
      symbol: 'BTC',
      decimals: 8,
      totalBase: 5_700_000_000n, // 57.0 BTC
      chains: [{ chainId: 'bip122:bitcoin', base: 5_700_000_000n }],
    });
    expect(calls[0]).toBe(`https://esplora.test/api/address/${ADDR}`);
  });

  it('returns [] for a zero-balance address (no fabricated holding)', async () => {
    const { fetchFn } = fakeEsplora({ chain_stats: { funded_txo_sum: 100, spent_txo_sum: 100 } });
    expect(await makeBtcHoldings('https://esplora.test/api', fetchFn)(ADDR)).toEqual([]);
  });

  it('rejects a malformed address without hitting the network', async () => {
    const { fetchFn, calls } = fakeEsplora({});
    await expect(makeBtcHoldings('https://esplora.test/api', fetchFn)('not-a-btc-address')).rejects.toThrow(/valid Bitcoin/u);
    expect(calls).toHaveLength(0);
  });

  it('throws on a non-ok response (never invents a balance)', async () => {
    const { fetchFn } = fakeEsplora({}, false, 502);
    await expect(makeBtcHoldings('https://esplora.test/api', fetchFn)(ADDR)).rejects.toThrow(/HTTP 502/u);
  });
});
