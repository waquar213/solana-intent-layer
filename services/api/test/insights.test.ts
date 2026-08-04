/**
 * Portfolio intelligence over HTTP — the bridge (Holding[] + prices → snapshot)
 * and the guarded /v1/portfolio/insights route running the REAL intelligence
 * engine end-to-end (no mocked analytics: allocation/risk/insights are computed).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '@intent-wallet/config';
import { nullLogger } from '@intent-wallet/observability';
import type { Holding } from '@intent-wallet/runtime';
import { buildApp } from '../src/app.js';
import { signJwt } from '../src/auth/jwt.js';
import { snapshotFromHoldings } from '../src/insights.js';
import { makeUserRuntimeProvider } from '../src/runtime-provider.js';

const SECRET = 'test-secret-0123456789abcdef';
const ALICE = `0x${'a'.repeat(40)}`;
// 2 ETH on mainnet + 1 ETH on an L2, and 5000 USDC — plus an unpriced token.
const HOLDINGS: Holding[] = [
  {
    symbol: 'ETH',
    decimals: 18,
    totalBase: 3n * 10n ** 18n,
    chains: [
      { chainId: 'eip155:1', base: 2n * 10n ** 18n },
      { chainId: 'eip155:42161', base: 1n * 10n ** 18n },
    ],
  },
  { symbol: 'USDC', decimals: 6, totalBase: 5_000_000_000n, chains: [{ chainId: 'eip155:1', base: 5_000_000_000n }] },
  { symbol: 'MYSTERY', decimals: 18, totalBase: 7n * 10n ** 18n, chains: [{ chainId: 'eip155:1', base: 7n * 10n ** 18n }] },
];
const PRICES: Record<string, string> = { ETH: '2000', USDC: '1' }; // MYSTERY has no price

describe('snapshotFromHoldings', () => {
  it('maps holdings to per-chain µUSD positions; an unpriced asset is stale, never invented', () => {
    const snap = snapshotFromHoldings(ALICE, HOLDINGS, PRICES, '2026-07-06T00:00:00.000Z');
    expect(snap.identityId).toBe(ALICE);
    expect(snap.positions).toHaveLength(4); // ETH×2 chains + USDC + MYSTERY

    const mainnetEth = snap.positions.find((p) => p.id === 'ETH:eip155:1');
    expect(mainnetEth?.valueMicros).toBe(4_000_000_000n); // 2 ETH × $2000 = $4000 = 4e9 µUSD
    expect(mainnetEth?.stale).toBeUndefined();

    const usdc = snap.positions.find((p) => p.symbol === 'USDC');
    expect(usdc?.valueMicros).toBe(5_000_000_000n); // $5000

    const mystery = snap.positions.find((p) => p.symbol === 'MYSTERY');
    expect(mystery?.valueMicros).toBe(0n); // no price → 0, flagged, NOT invented
    expect(mystery?.stale).toBe(true);
  });

  it('skips zero-balance chain rows', () => {
    const snap = snapshotFromHoldings(
      ALICE,
      [{ symbol: 'ETH', decimals: 18, totalBase: 1n, chains: [{ chainId: 'eip155:1', base: 1n }, { chainId: 'eip155:10', base: 0n }] }],
      PRICES,
      '2026-07-06T00:00:00.000Z',
    );
    expect(snap.positions).toHaveLength(1);
  });
});

describe('GET /v1/portfolio/insights (HTTP, real engine)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      config: loadConfig({}),
      logger: nullLogger,
      authSecret: SECRET,
      requireAuth: true,
      runtimeProvider: makeUserRuntimeProvider({
        holdingsFor: () => Promise.resolve(HOLDINGS),
        pricesFor: () => Promise.resolve(PRICES),
      }),
      insights: { holdingsFor: () => Promise.resolve(HOLDINGS), pricesFor: () => Promise.resolve(PRICES) },
    });
  });
  afterAll(async () => {
    await app.close();
  });

  it('requires a session', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/portfolio/insights' })).statusCode).toBe(401);
  });

  it('returns real computed intelligence for the authenticated principal', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: ALICE, iat: now, exp: now + 3600 }, SECRET);
    const res = await app.inject({ method: 'GET', url: '/v1/portfolio/insights', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const intel = res.json() as {
      identityId: string;
      netWorthMicros: string;
      positionCount: number;
      allocation: { byAssetClass: unknown };
      risk: { healthScore: number };
      insights: unknown[];
      stale: boolean;
    };
    expect(intel.identityId).toBe(ALICE);
    // 3 ETH × $2000 + $5000 USDC = $11,000 = 11e9 µUSD (bigints as decimal strings).
    expect(intel.netWorthMicros).toBe('11000000000');
    expect(intel.positionCount).toBe(4);
    expect(intel.allocation).toBeDefined();
    expect(typeof intel.risk.healthScore).toBe('number');
    expect(Array.isArray(intel.insights)).toBe(true);
    expect(intel.stale).toBe(true); // MYSTERY had no price → honest stale bit
  });
});
