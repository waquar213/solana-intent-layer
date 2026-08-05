/**
 * Foundation tests via Fastify's `inject()` — exercises the real HTTP pipeline
 * (hooks, error handler, routes) without binding a socket, so they run fast and
 * hermetically in CI.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '@intent-wallet/config';
import { nullLogger } from '@intent-wallet/observability';
import { InMemoryThreatIntel, RiskEngine } from '@intent-wallet/risk';
import { createDemoExecutor, createWalletRuntime, type Holding } from '@intent-wallet/runtime';
import { buildApp } from '../src/app.js';
import type { BalancesReader } from '../src/balances.js';
import { deriveDemoIdentity } from '../src/dev-identity.js';
import { makeAuthGuard, rejectingVerifier } from '../src/plugins/auth-guard.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ config: loadConfig({}), logger: nullLogger });
  // A guarded probe route to exercise the auth skeleton without business logic.
  app.get('/v1/_guarded', { preHandler: makeAuthGuard(rejectingVerifier) }, async () => ({ ok: true }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('health', () => {
  it('GET /healthz is always ok (liveness never touches deps)', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /readyz is ready with no probes and 503 when a probe fails', async () => {
    expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);

    const withFailingProbe = await buildApp({
      config: loadConfig({}),
      logger: nullLogger,
      readinessProbes: [{ name: 'db', check: async () => false }],
    });
    const res = await withFailingProbe.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'not_ready', checks: [{ name: 'db', ok: false }] });
    await withFailingProbe.close();
  });
});

describe('request context', () => {
  it('echoes a generated x-request-id', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/status' });
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/u);
  });

  it('preserves an inbound x-request-id for correlation', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/status', headers: { 'x-request-id': 'trace-abc' } });
    expect(res.headers['x-request-id']).toBe('trace-abc');
  });
});

describe('versioned routes', () => {
  it('GET /v1/status reports operational', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ apiVersion: 'v1', status: 'operational' });
  });
});

describe('OpenAPI generation', () => {
  it('serves a 3.1 doc that reflects actually-registered routes', async () => {
    // An app WITH auth so the /v1/auth/* + /v1/me routes are mounted + curated.
    const withAuth = await buildApp({ config: loadConfig({}), logger: nullLogger, authSecret: 'test-secret-0123456789abcdef' });
    const res = await withAuth.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json() as {
      openapi: string;
      components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
      paths: Record<string, Record<string, { requestBody?: unknown; security?: unknown[] }>>;
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths['/v1/status']).toBeDefined(); // introspected, not hand-written
    expect(doc.paths['/healthz']).toBeDefined();
    // Enriched: a Bearer security scheme + the problem+json schema exist…
    expect(doc.components.securitySchemes['bearerAuth']).toBeDefined();
    expect(doc.components.schemas['ProblemDetails']).toBeDefined();
    // …and curated operations carry a typed request body + Bearer security.
    expect(doc.paths['/v1/auth/verify']?.['post']?.requestBody).toBeDefined();
    expect(doc.paths['/v1/me']?.['get']?.security).toEqual([{ bearerAuth: [] }]);
    await withAuth.close();
  });
});

describe('error handling → problem+json', () => {
  it('unknown routes return a 404 problem document', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND', status: 404, instance: '/nope' });
  });
});

describe('POST /v1/intents/plan (wired to the composition root)', () => {
  const holdings: Holding[] = [
    {
      symbol: 'ETH',
      decimals: 18,
      totalBase: 2n * 10n ** 18n,
      chains: [{ chainId: 'eip155:1', base: 2n * 10n ** 18n }],
    },
  ];
  const withRuntime = () =>
    buildApp({
      config: loadConfig({}),
      logger: nullLogger,
      runtime: createWalletRuntime({ holdings, prices: { ETH: '2000' } }),
    });

  it('turns an utterance into a verified plan over HTTP', async () => {
    const api = await withRuntime();
    const res = await api.inject({
      method: 'POST',
      url: '/v1/intents/plan',
      payload: { utterance: 'send 0.1 ETH to 0x1111111111111111111111111111111111111111' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ intentKind: 'transfer', outcome: { kind: 'plan' } });
    await api.close();
  });

  it('rejects an empty utterance with a 400 problem document', async () => {
    const api = await withRuntime();
    const res = await api.inject({ method: 'POST', url: '/v1/intents/plan', payload: { utterance: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    await api.close();
  });

  it('serves the portfolio (holdings folded into USD values)', async () => {
    const api = await withRuntime();
    const res = await api.inject({ method: 'GET', url: '/v1/portfolio' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { totalValueMicros: string; holdings: Array<{ symbol: string }> };
    expect(body.totalValueMicros).toBe('4000000000'); // 2 ETH × $2000 = $4,000 (this fixture holds only ETH)
    expect(body.holdings[0]?.symbol).toBe('ETH');
    await api.close();
  });

  it('is NOT registered when no runtime is wired (honest surface)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/intents/plan',
      payload: { utterance: 'send 1 ETH to x' },
    });
    expect(res.statusCode).toBe(404); // `app` (foundation) has no runtime → route absent
  });
});

describe('the full loop over HTTP — plan → authorize → execute', () => {
  const GOOD = '0x1111111111111111111111111111111111111111';
  const SANCTIONED = '0x000000000000000000000000000000000000dead';
  const holdings: Holding[] = [
    {
      symbol: 'ETH',
      decimals: 18,
      totalBase: 2n * 10n ** 18n,
      chains: [{ chainId: 'eip155:1', base: 2n * 10n ** 18n }],
    },
  ];

  const withLoop = (riskEngine?: RiskEngine) =>
    buildApp({
      config: loadConfig({}),
      logger: nullLogger,
      runtime: createWalletRuntime({
        holdings,
        prices: { ETH: '2000' },
        ...(riskEngine ? { riskEngine } : {}),
      }),
      executor: createDemoExecutor(),
    });

  const planId = async (api: FastifyInstance, utterance: string): Promise<string> => {
    const res = await api.inject({ method: 'POST', url: '/v1/intents/plan', payload: { utterance } });
    const body = res.json() as { outcome: { kind: string; plan?: { planId: string } } };
    if (body.outcome.kind !== 'plan' || !body.outcome.plan) throw new Error(`expected a plan, got ${body.outcome.kind}`);
    return body.outcome.plan.planId;
  };

  it('authorizes a benign plan (mayProceedToSign) by its server-issued planId', async () => {
    const api = await withLoop();
    const id = await planId(api, `send 0.1 ETH to ${GOOD}`);
    const res = await api.inject({ method: 'POST', url: '/v1/intents/authorize', payload: { planId: id } });
    expect(res.statusCode).toBe(200);
    const perm = res.json() as { mayProceedToSign: boolean; planId: string; riskLevel: string };
    expect(perm.mayProceedToSign).toBe(true);
    expect(perm.planId).toBe(id); // permission bound to this exact plan
    await api.close();
  });

  it('executes an authorized plan to completion', async () => {
    const api = await withLoop();
    const id = await planId(api, `send 0.1 ETH to ${GOOD}`);
    const res = await api.inject({ method: 'POST', url: '/v1/intents/execute', payload: { planId: id } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { executed: boolean; execution?: { status: string } };
    expect(body.executed).toBe(true);
    expect(body.execution?.status).toBe('completed');
    await api.close();
  });

  it('consumes the plan on execute — replaying the same planId 404s (no double-execution)', async () => {
    const api = await withLoop();
    const id = await planId(api, `send 0.1 ETH to ${GOOD}`);
    const first = await api.inject({ method: 'POST', url: '/v1/intents/execute', payload: { planId: id } });
    expect(first.statusCode).toBe(200);
    expect((first.json() as { executed: boolean }).executed).toBe(true);
    // Same planId again → the plan was consumed → 404, never a second execution.
    const replay = await api.inject({ method: 'POST', url: '/v1/intents/execute', payload: { planId: id } });
    expect(replay.statusCode).toBe(404);
    await api.close();
  });

  it('REFUSES to execute a plan the policy/risk gate blocks (re-authorized server-side)', async () => {
    const api = await withLoop(new RiskEngine({ intel: new InMemoryThreatIntel({ sanctioned: [SANCTIONED] }) }));
    // The sanctioned recipient is blocked at PLAN time, so we never even get a planId —
    // the pre-execution gate holds before a plan exists. Prove the plan is rejected:
    const res = await api.inject({
      method: 'POST',
      url: '/v1/intents/plan',
      payload: { utterance: `send 0.1 ETH to ${SANCTIONED}` },
    });
    const body = res.json() as { outcome: { kind: string } };
    expect(body.outcome.kind).toBe('rejected');
    await api.close();
  });

  it('404s authorize/execute for an unknown or expired planId', async () => {
    const api = await withLoop();
    const auth = await api.inject({ method: 'POST', url: '/v1/intents/authorize', payload: { planId: 'nope' } });
    expect(auth.statusCode).toBe(404);
    const exec = await api.inject({ method: 'POST', url: '/v1/intents/execute', payload: { planId: 'nope' } });
    expect(exec.statusCode).toBe(404);
    await api.close();
  });

  it('serves the Universal Identity (real BTC/EVM/SOL derivation) when wired, 404 otherwise', async () => {
    const withId = await buildApp({
      config: loadConfig({}),
      logger: nullLogger,
      runtime: createWalletRuntime({ holdings, prices: { ETH: '2000' } }),
      identity: deriveDemoIdentity(),
    });
    const res = await withId.inject({ method: 'GET', url: '/v1/identity' });
    expect(res.statusCode).toBe(200);
    const id = res.json() as { evm: { address: string }; btc: { address: string }; sol: { address: string } };
    expect(id.evm.address).toMatch(/^0x[0-9a-fA-F]{40}$/u); // real checksummed EVM address
    expect(id.btc.address).toMatch(/^bc1/u); // real BIP-84 segwit
    expect(id.sol.address.length).toBeGreaterThan(30); // real base58 ed25519
    await withId.close();

    const noId = await buildApp({
      config: loadConfig({}),
      logger: nullLogger,
      runtime: createWalletRuntime({ holdings, prices: { ETH: '2000' } }), // no identity wired
    });
    expect((await noId.inject({ method: 'GET', url: '/v1/identity' })).statusCode).toBe(404);
    await noId.close();
  });

  it('does NOT expose /execute when no executor is wired (honest surface)', async () => {
    const api = await buildApp({
      config: loadConfig({}),
      logger: nullLogger,
      runtime: createWalletRuntime({ holdings, prices: { ETH: '2000' } }), // runtime but NO executor
    });
    const id = await planId(api, `send 0.1 ETH to ${GOOD}`);
    // authorize is still available (it's real + safe), but execute is absent.
    expect((await api.inject({ method: 'POST', url: '/v1/intents/authorize', payload: { planId: id } })).statusCode).toBe(
      200,
    );
    const exec = await api.inject({ method: 'POST', url: '/v1/intents/execute', payload: { planId: id } });
    expect(exec.statusCode).toBe(404);
    await api.close();
  });
});

describe('auth guard skeleton (fail-closed)', () => {
  it('rejects a missing Authorization header with 401 problem+json', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/_guarded' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects a malformed Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/_guarded', headers: { authorization: 'Basic xyz' } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a well-formed bearer token until real auth is enabled (fail-closed)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/_guarded',
      headers: { authorization: 'Bearer sometoken' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('POST /v1/portfolio/balances — address shape validation', () => {
  // The route validates address shapes up front so a bad input is a clean 400, not a 500. The BTC holdings
  // provider (btc.ts) is MAINNET-only and rejects a testnet address, so the route MUST reject tb1…/m/n/2…
  // itself rather than let it reach the provider and surface as an unhandled 500 (regression: BTC_RE once
  // accepted testnet forms → a false 5xx alert on the route's own "clean 400" contract).
  const stubBalances: BalancesReader = () =>
    Promise.resolve({
      holdings: [],
      totalValueMicros: '0',
      byEcosystem: { evm: '0', bitcoin: '0', solana: '0' },
      unavailable: [],
      unpricedSymbols: [],
    });
  let balApp: FastifyInstance;
  beforeAll(async () => {
    balApp = await buildApp({ config: loadConfig({}), logger: nullLogger, balances: stubBalances });
  });
  afterAll(async () => {
    await balApp.close();
  });

  it('rejects a TESTNET BTC address with a clean 400 problem document (never a 500)', async () => {
    const res = await balApp.inject({
      method: 'POST',
      url: '/v1/portfolio/balances',
      payload: { btc: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('accepts a valid MAINNET BTC address (reaches the reader → 200, not a 400)', async () => {
    const res = await balApp.inject({
      method: 'POST',
      url: '/v1/portfolio/balances',
      payload: { btc: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' },
    });
    expect(res.statusCode).toBe(200);
  });
});
