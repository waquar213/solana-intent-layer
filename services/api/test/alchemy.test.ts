import { describe, expect, it } from 'vitest';
import { makeAlchemyHoldings } from '../src/alchemy.js';

/** A scripted Alchemy endpoint — routes by JSON-RPC method in the POST body. */
function fakeAlchemy(handlers: Record<string, (params: unknown[]) => unknown>): {
  fetchFn: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
  calls: { method: string; params: unknown[] }[];
} {
  const calls: { method: string; params: unknown[] }[] = [];
  const fetchFn = (_url: string, init: { body: string }): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
    const req = JSON.parse(init.body) as { id: number; method: string; params: unknown[] };
    calls.push({ method: req.method, params: req.params });
    const handler = handlers[req.method];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: req.id, jsonrpc: '2.0', result: handler ? handler(req.params) : undefined }),
    });
  };
  return { fetchFn, calls };
}

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

describe('makeAlchemyHoldings', () => {
  it('keeps native ETH + vetted ERC-20s, stamping trusted symbol/decimals by canonical address', async () => {
    const usdcBase = 1_234_560000n; // 1234.56 USDC at 6 decimals
    const { fetchFn, calls } = fakeAlchemy({
      eth_getBalance: () => `0x${(2n * 10n ** 18n).toString(16)}`, // 2 ETH
      alchemy_getTokenBalances: () => ({
        tokenBalances: [
          { contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', tokenBalance: `0x${usdcBase.toString(16)}` }, // canonical USDC (checksummed)
          { contractAddress: '0x000000000000000000000000000000000000dEaD', tokenBalance: '0x0' }, // zero → filtered out
        ],
      }),
    });

    const holdings = await makeAlchemyHoldings('key', { fetchFn })(VITALIK);

    expect(holdings).toHaveLength(2);
    const eth = holdings.find((h) => h.symbol === 'ETH');
    expect(eth?.totalBase).toBe(2n * 10n ** 18n);
    expect(eth?.decimals).toBe(18);
    expect(eth?.chains).toEqual([{ chainId: 'eip155:1', base: 2n * 10n ** 18n }]);
    const usdc = holdings.find((h) => h.symbol === 'USDC');
    expect(usdc?.totalBase).toBe(usdcBase);
    expect(usdc?.decimals).toBe(6);
    // The on-chain metadata is attacker-controllable and is NEVER queried/trusted.
    expect(calls.some((c) => c.method === 'alchemy_getTokenMetadata')).toBe(false);
  });

  it('DROPS a spam token that spoofs a real symbol at a non-canonical address (no-fake-data)', async () => {
    const { fetchFn } = fakeAlchemy({
      eth_getBalance: () => '0x0',
      // An airdropped impostor at a bogus address with a huge balance — if its (untrusted)
      // metadata said symbol "USDC" it would have inflated the real USDC holding via merge.
      alchemy_getTokenBalances: () => ({
        tokenBalances: [{ contractAddress: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', tokenBalance: `0x${(10n ** 24n).toString(16)}` }],
      }),
    });

    const holdings = await makeAlchemyHoldings('key', { fetchFn })(VITALIK);

    expect(holdings).toHaveLength(0); // omitted — never surfaced under an unverifiable symbol
  });

  it('rejects a non-EVM-address principal without hitting the network', async () => {
    const { fetchFn, calls } = fakeAlchemy({});

    await expect(makeAlchemyHoldings('key', { fetchFn })('dev-user')).rejects.toThrow(/EVM-address/u);
    expect(calls).toHaveLength(0);
  });

  it('matches the allowlist case-insensitively and stamps its decimals (WBTC = 8)', async () => {
    const { fetchFn } = fakeAlchemy({
      eth_getBalance: () => '0x0',
      alchemy_getTokenBalances: () => ({
        tokenBalances: [
          { contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', tokenBalance: '0x5f5e100' }, // 1 WBTC (1e8), checksummed
          { contractAddress: '0x9999999999999999999999999999999999999999', tokenBalance: '0xde0b6b3a7640000' }, // unvetted → dropped
        ],
      }),
    });

    const holdings = await makeAlchemyHoldings('key', { fetchFn })(VITALIK);

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({ symbol: 'WBTC', decimals: 8, totalBase: 100_000_000n });
  });

  it('fails fast on a non-retryable 4xx (e.g. 401)', async () => {
    let calls = 0;
    const fetchFn = (): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
      calls += 1;
      return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
    };

    await expect(makeAlchemyHoldings('key', { fetchFn })(VITALIK)).rejects.toThrow(/HTTP 401/u);
    expect(calls).toBe(1); // no retries on a hard client error
  });

  it('retries a transient 429 with backoff, then succeeds', async () => {
    let calls = 0;
    const fetchFn = (_url: string, init: { body: string }): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
      calls += 1;
      if (calls === 1) return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
      const req = JSON.parse(init.body) as { id: number; method: string };
      const result = req.method === 'eth_getBalance' ? '0x0' : { tokenBalances: [] };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: req.id, jsonrpc: '2.0', result }) });
    };

    const holdings = await makeAlchemyHoldings('key', { fetchFn, sleep: () => Promise.resolve() })(VITALIK);

    expect(holdings).toEqual([]);
    expect(calls).toBeGreaterThanOrEqual(3); // first 429 + retry + the second method call
  });

  it('gives up after maxRetries on a persistent 429', async () => {
    let calls = 0;
    const fetchFn = (): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
      calls += 1;
      return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
    };

    await expect(
      makeAlchemyHoldings('key', { fetchFn, sleep: () => Promise.resolve(), maxRetries: 2 })(VITALIK),
    ).rejects.toThrow(/HTTP 429/u);
    expect(calls).toBeGreaterThanOrEqual(3); // 1 initial + 2 retries
  });

  it('degrades to native ETH when the Token API is rate-limited (free tier)', async () => {
    const fetchFn = (_url: string, init: { body: string }): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
      const req = JSON.parse(init.body) as { id: number; method: string };
      if (req.method === 'eth_getBalance') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: req.id, jsonrpc: '2.0', result: `0x${(3n * 10n ** 18n).toString(16)}` }),
        });
      }
      // The enhanced Token API always 429s on a throttled free key.
      return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({ error: { code: 429 } }) });
    };

    const holdings = await makeAlchemyHoldings('key', { fetchFn, sleep: () => Promise.resolve() })(VITALIK);

    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.symbol).toBe('ETH');
    expect(holdings[0]?.totalBase).toBe(3n * 10n ** 18n);
  });

  it('SKIPS a token with a malformed hex balance without dropping the good holdings', async () => {
    const usdcBase = 1_000_000000n; // 1000 USDC
    const { fetchFn } = fakeAlchemy({
      eth_getBalance: () => `0x${(1n * 10n ** 18n).toString(16)}`, // 1 ETH
      alchemy_getTokenBalances: () => ({
        tokenBalances: [
          { contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', tokenBalance: `0x${usdcBase.toString(16)}` }, // good USDC
          { contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F', tokenBalance: '0xnonsense' }, // malformed → skipped, not fatal
          { contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', tokenBalance: '0x' }, // bare 0x → skipped, not fatal
        ],
      }),
    });

    // Best-effort discovery: the two malformed balances are skipped, and the native ETH +
    // the well-formed USDC still come through (a raw BigInt() would have thrown and aborted all).
    const holdings = await makeAlchemyHoldings('key', { fetchFn })(VITALIK);

    expect(holdings.map((h) => h.symbol).sort()).toEqual(['ETH', 'USDC']);
    expect(holdings.find((h) => h.symbol === 'USDC')?.totalBase).toBe(usdcBase);
  });

  it('rejects (fails loud) on a malformed native ETH balance rather than fabricating an empty portfolio', async () => {
    const { fetchFn } = fakeAlchemy({
      eth_getBalance: () => '0xZZZ', // upstream fault on the REQUIRED reading
    });

    await expect(makeAlchemyHoldings('key', { fetchFn })(VITALIK)).rejects.toThrow(/malformed hex/u);
  });
});
