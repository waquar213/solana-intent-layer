import { describe, expect, it } from 'vitest';
import { makeEvmHistory } from '../src/history.js';

function fakeExplorer(
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

const ME = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const OTHER = '0x2ca8329fc5903014260088088cf5313563fc67e5';

describe('makeEvmHistory', () => {
  it('normalizes explorer txlist rows into EvmTxItem[]', async () => {
    const { fetchFn, calls } = fakeExplorer({
      message: 'OK',
      result: [
        { hash: '0xaaa', from: OTHER, to: ME, value: '177121205210335', timeStamp: '1783308888', isError: '0' },
        { hash: '0xbbb', from: ME, to: '0x1111111111111111111111111111111111111111', value: '0', timeStamp: '1783300000', isError: '1' },
      ],
    });

    const items = await makeEvmHistory('https://explorer/api', fetchFn)(ME);

    expect(calls[0]).toContain(`address=${ME}`);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ hash: '0xaaa', from: OTHER, to: ME.toLowerCase(), valueWei: '177121205210335', timeStamp: 1783308888, failed: false });
    expect(items[1]?.failed).toBe(true); // isError:'1' → reverted
  });

  it('returns [] when the explorer reports no transactions', async () => {
    const { fetchFn } = fakeExplorer({ message: 'No transactions found', result: [] });
    expect(await makeEvmHistory('https://explorer/api', fetchFn)(ME)).toEqual([]);
  });

  it('returns [] for a non-address without hitting the network', async () => {
    const { fetchFn, calls } = fakeExplorer({ result: [] });
    expect(await makeEvmHistory('https://explorer/api', fetchFn)('not-an-address')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('throws when the explorer responds non-OK', async () => {
    const { fetchFn } = fakeExplorer({}, false, 502);
    await expect(makeEvmHistory('https://explorer/api', fetchFn)(ME)).rejects.toThrow(/HTTP 502/u);
  });
});
