import { describe, expect, it } from 'vitest';
import { makeSolHoldings } from '../src/solana.js';

function fakeRpc(
  body: unknown,
  ok = true,
  status = 200,
): { fetchFn: (url: string, init: { body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>; calls: string[] } {
  const calls: string[] = [];
  const fetchFn = (
    _url: string,
    init: { body: string },
  ): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
    calls.push(init.body);
    return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
  };
  return { fetchFn, calls };
}

const ADDR = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9';

describe('makeSolHoldings', () => {
  it('maps getBalance to a native SOL holding', async () => {
    const { fetchFn, calls } = fakeRpc({ result: { value: 2_500_000_000 } }); // 2.5 SOL
    const holdings = await makeSolHoldings('https://rpc.test', fetchFn)(ADDR);

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toEqual({
      symbol: 'SOL',
      decimals: 9,
      totalBase: 2_500_000_000n,
      chains: [{ chainId: 'solana:mainnet', base: 2_500_000_000n }],
    });
    expect(calls[0]).toContain('getBalance');
  });

  it('returns [] for a zero-balance account', async () => {
    const { fetchFn } = fakeRpc({ result: { value: 0 } });
    expect(await makeSolHoldings('https://rpc.test', fetchFn)(ADDR)).toEqual([]);
  });

  it('rejects a malformed address without hitting the network', async () => {
    const { fetchFn, calls } = fakeRpc({});
    await expect(makeSolHoldings('https://rpc.test', fetchFn)('0xnot-solana')).rejects.toThrow(/valid Solana/u);
    expect(calls).toHaveLength(0);
  });

  it('throws on an RPC error (never invents a balance)', async () => {
    const { fetchFn } = fakeRpc({ error: { message: 'Invalid param' } });
    await expect(makeSolHoldings('https://rpc.test', fetchFn)(ADDR)).rejects.toThrow(/Invalid param/u);
  });
});
