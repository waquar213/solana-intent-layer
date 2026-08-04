/**
 * Per-user runtime resolution — the seam that replaces the boot-time dev seed with a
 * runtime scoped to the AUTHENTICATED principal's real holdings. Proven here with a
 * stub holdings source (no live chain needed): two users plan against their OWN
 * balances, and the CoinGecko price parser is exercised with an injected fetch.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '@intent-wallet/config';
import { nullLogger } from '@intent-wallet/observability';
import type { Holding } from '@intent-wallet/runtime';
import { buildApp } from '../src/app.js';
import { signJwt } from '../src/auth/jwt.js';
import {
  makeCoinGeckoPrices,
  makeLiveHoldingsSource,
  makeMergedHoldings,
  makeUserRuntimeProvider,
  type HoldingsSource,
} from '../src/runtime-provider.js';

const SECRET = 'test-secret-0123456789abcdef';
const ALICE = `0x${'a'.repeat(40)}`;
const BOB = `0x${'b'.repeat(40)}`;
// Alice holds 5 ETH; Bob holds nothing.
const HOLDINGS: Record<string, Holding[]> = {
  [ALICE]: [{ symbol: 'ETH', decimals: 18, totalBase: 5n * 10n ** 18n, chains: [{ chainId: 'eip155:1', base: 5n * 10n ** 18n }] }],
  [BOB]: [],
};
const provider = makeUserRuntimeProvider({
  holdingsFor: (p) => Promise.resolve(HOLDINGS[p] ?? []),
  pricesFor: () => Promise.resolve({ ETH: '2000' }),
});

describe('makeCoinGeckoPrices', () => {
  it('parses the public price feed into symbol → decimal-string', async () => {
    const fetchFn = (): Promise<{ ok: boolean; json(): Promise<unknown> }> =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ ethereum: { usd: 2500 }, bitcoin: { usd: 60000 }, solana: { usd: 150 } }) });
    const prices = await makeCoinGeckoPrices(fetchFn)();
    expect(prices).toEqual({ ETH: '2500', BTC: '60000', SOL: '150' });
  });

  it('prices common ERC-20s (USDC/DAI/WBTC) by their UPPERCASE symbol', async () => {
    const fetchFn = (): Promise<{ ok: boolean; json(): Promise<unknown> }> =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ ethereum: { usd: 2500 }, 'usd-coin': { usd: 1 }, dai: { usd: 1 }, 'wrapped-bitcoin': { usd: 60000 } }),
      });
    const prices = await makeCoinGeckoPrices(fetchFn)();
    // The intelligence engine looks up prices[holding.symbol.toUpperCase()], so these keys match.
    expect(prices.USDC).toBe('1');
    expect(prices.DAI).toBe('1');
    expect(prices.WBTC).toBe('60000');
    expect(prices.ETH).toBe('2500');
    expect(prices.SOL).toBeUndefined(); // absent from the feed → not invented
  });

  it('throws when the feed is unavailable (never invents a price)', async () => {
    const fetchFn = (): Promise<{ ok: boolean; json(): Promise<unknown> }> =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    await expect(makeCoinGeckoPrices(fetchFn)()).rejects.toThrow(/price feed/);
  });

  it('caches within the TTL + dedups concurrent calls to ONE fetch', async () => {
    let calls = 0;
    const fetchFn = (): Promise<{ ok: boolean; json(): Promise<unknown> }> => {
      calls += 1;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ethereum: { usd: 2500 } }) });
    };
    const prices = makeCoinGeckoPrices(fetchFn, 10_000);
    await Promise.all([prices(), prices(), prices()]); // concurrent → one in-flight fetch
    await prices(); // within TTL → cached
    expect(calls).toBe(1);
  });
});

describe('makeLiveHoldingsSource', () => {
  it('refuses a non-EVM-address principal (never queries RPC for a bogus address)', async () => {
    const source = makeLiveHoldingsSource([{ chainId: 'ethereum', rpcUrls: ['http://unused.invalid'] }]);
    await expect(source('demo-user')).rejects.toThrow(/EVM-address principal/);
  });
});

describe('makeMergedHoldings', () => {
  const ADDR = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const src = (holdings: Awaited<ReturnType<HoldingsSource>>): HoldingsSource => () => Promise.resolve(holdings);
  const failing: HoldingsSource = () => Promise.reject(new Error('rpc down'));

  it('merges the same symbol across chains into one holding with summed base + provenance', async () => {
    const merged = makeMergedHoldings([
      src([{ symbol: 'ETH', decimals: 18, totalBase: 2n * 10n ** 18n, chains: [{ chainId: 'eip155:1', base: 2n * 10n ** 18n }] }]),
      src([{ symbol: 'ETH', decimals: 18, totalBase: 5n * 10n ** 17n, chains: [{ chainId: 'base', base: 5n * 10n ** 17n }] }]),
    ]);
    const holdings = await merged(ADDR);
    const eth = holdings.find((h) => h.symbol === 'ETH');
    expect(eth?.totalBase).toBe(25n * 10n ** 17n); // 2.0 + 0.5 ETH
    expect(eth?.chains).toEqual([
      { chainId: 'eip155:1', base: 2n * 10n ** 18n },
      { chainId: 'base', base: 5n * 10n ** 17n },
    ]);
  });

  it('degrades: a single failing source is dropped, the rest still return', async () => {
    const merged = makeMergedHoldings([
      src([{ symbol: 'ETH', decimals: 18, totalBase: 10n ** 18n, chains: [{ chainId: 'eip155:1', base: 10n ** 18n }] }]),
      failing, // e.g. a down L2 RPC
    ]);
    const holdings = await merged(ADDR);
    expect(holdings.map((h) => h.symbol)).toEqual(['ETH']);
  });

  it('fails loud when EVERY source fails (never presents an empty portfolio as real)', async () => {
    await expect(makeMergedHoldings([failing, failing])(ADDR)).rejects.toThrow(/rpc down/);
  });

  it('refuses a non-EVM-address principal before touching any source', async () => {
    let called = false;
    const spy: HoldingsSource = () => {
      called = true;
      return Promise.resolve([]);
    };
    await expect(makeMergedHoldings([spy])('dev-user')).rejects.toThrow(/EVM-address principal/);
    expect(called).toBe(false);
  });
});

describe('makeUserRuntimeProvider', () => {
  it('resolves a runtime scoped to the principal (portfolio reflects their holdings)', async () => {
    const seen: string[] = [];
    const p = makeUserRuntimeProvider({
      holdingsFor: (who) => {
        seen.push(who);
        return Promise.resolve(HOLDINGS[who] ?? []);
      },
      pricesFor: () => Promise.resolve({ ETH: '2000' }),
    });
    const runtime = await p(ALICE);
    expect(seen).toContain(ALICE);
    const summary = await runtime.portfolio();
    expect(JSON.stringify(summary)).toContain('ETH'); // Alice's ETH is present
  });

  it('issues globally-unique plan ids (no cross-tenant collision on the shared store)', async () => {
    const utter = 'send 0.1 ETH to 0x1111111111111111111111111111111111111111';
    const a = await (await provider(ALICE)).plan(utter);
    const b = await (await provider(ALICE)).plan(utter);
    const id1 = a.outcome.kind === 'plan' ? a.outcome.plan.planId : '1';
    const id2 = b.outcome.kind === 'plan' ? b.outcome.plan.planId : '2';
    expect(id1).toMatch(/^plan-[0-9a-f-]{36}$/); // UUID, not the ordinal plan-1
    expect(id1).not.toBe(id2);
  });
});

describe('intent routes over a per-user runtime provider (HTTP)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ config: loadConfig({}), logger: nullLogger, authSecret: SECRET, requireAuth: true, runtimeProvider: provider });
  });
  afterAll(async () => {
    await app.close();
  });

  const planAs = (address: string) => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: address, iat: now, exp: now + 3600 }, SECRET);
    return app.inject({
      method: 'POST',
      url: '/v1/intents/plan',
      payload: { utterance: 'send 0.1 ETH to 0x1111111111111111111111111111111111111111' },
      headers: { authorization: `Bearer ${token}` },
    });
  };

  it('plans against the AUTHENTICATED user’s own holdings', async () => {
    const alice = await planAs(ALICE); // holds 5 ETH → a real plan
    expect(alice.statusCode).toBe(200);
    expect(alice.json()).toMatchObject({ outcome: { kind: 'plan' } });

    const bob = await planAs(BOB); // holds nothing → cannot be a fund-moving plan
    expect(bob.statusCode).toBe(200);
    expect((bob.json() as { outcome: { kind: string } }).outcome.kind).not.toBe('plan');
  });

  it('guards GET /v1/portfolio behind the session (no leaking real holdings)', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/portfolio' })).statusCode).toBe(401);
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: ALICE, iat: now, exp: now + 3600 }, SECRET);
    const ok = await app.inject({ method: 'GET', url: '/v1/portfolio', headers: { authorization: `Bearer ${token}` } });
    expect(ok.statusCode).toBe(200);
  });
});
