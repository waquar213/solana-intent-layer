/**
 * Intent-route session enforcement (IW_REQUIRE_AUTH) — the server-side half of
 * "gate the app's real requests behind a session". With enforcement ON, plan /
 * authorize / execute require a valid SIWE JWT; with it OFF (localhost default)
 * the routes stay open so the demo is frictionless.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { loadConfig } from '@intent-wallet/config';
import { nullLogger } from '@intent-wallet/observability';
import { createWalletRuntime, type Holding } from '@intent-wallet/runtime';
import { buildApp } from '../src/app.js';
import { signJwt } from '../src/auth/jwt.js';

const SECRET = 'test-secret-0123456789abcdef';
const UTTERANCE = 'send 0.1 ETH to 0x1111111111111111111111111111111111111111';
const holdings: Holding[] = [
  { symbol: 'ETH', decimals: 18, totalBase: 2n * 10n ** 18n, chains: [{ chainId: 'eip155:1', base: 2n * 10n ** 18n }] },
];

const runtime = (): ReturnType<typeof createWalletRuntime> => createWalletRuntime({ holdings, prices: { ETH: '2000' } });
const plan = (app: FastifyInstance, headers: InjectOptions['headers'] = {}) =>
  app.inject({ method: 'POST', url: '/v1/intents/plan', payload: { utterance: UTTERANCE }, headers });

describe('intent routes — session enforcement', () => {
  let guarded: FastifyInstance;
  let open: FastifyInstance;

  beforeAll(async () => {
    guarded = await buildApp({ config: loadConfig({}), logger: nullLogger, authSecret: SECRET, requireAuth: true, runtime: runtime() });
    open = await buildApp({ config: loadConfig({}), logger: nullLogger, authSecret: SECRET, runtime: runtime() });
  });
  afterAll(async () => {
    await guarded.close();
    await open.close();
  });

  it('rejects plan without a valid session when enforcement is ON', async () => {
    expect((await plan(guarded)).statusCode).toBe(401); // no header
    expect((await plan(guarded, { authorization: 'Bearer garbage' })).statusCode).toBe(401); // bad token
  });

  it('allows plan with a valid session token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: `0x${'1'.repeat(40)}`, iat: now, exp: now + 3600 }, SECRET);
    const res = await plan(guarded, { authorization: `Bearer ${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ intentKind: 'transfer', outcome: { kind: 'plan' } });
  });

  it('leaves the intent routes OPEN when enforcement is OFF (localhost default)', async () => {
    expect((await plan(open)).statusCode).toBe(200);
  });

  it('binds plan ownership to the session — user B cannot authorize user A’s plan', async () => {
    const now = Math.floor(Date.now() / 1000);
    const tokenFor = (sub: string): string => signJwt({ sub, iat: now, exp: now + 3600 }, SECRET);
    const alice = { authorization: `Bearer ${tokenFor(`0x${'a'.repeat(40)}`)}` };
    const bob = { authorization: `Bearer ${tokenFor(`0x${'b'.repeat(40)}`)}` };

    // Alice plans → the server issues a plan owned by Alice.
    const planned = await plan(guarded, alice);
    expect(planned.statusCode).toBe(200);
    const planId = (planned.json() as { outcome: { plan: { planId: string } } }).outcome.plan.planId;

    const authorize = (headers: Record<string, string>) =>
      guarded.inject({ method: 'POST', url: '/v1/intents/authorize', payload: { planId }, headers });

    // Bob cannot authorize it — same response as "never existed" (no ownership probe).
    expect((await authorize(bob)).statusCode).toBe(404);
    // Alice can.
    expect((await authorize(alice)).statusCode).toBe(200);
  });
});
