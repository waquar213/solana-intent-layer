/**
 * End-to-end over the PRODUCTION-wired request path — the seams that only run in a
 * deployed env and that unit tests exercise in isolation, here exercised TOGETHER:
 * auth-required intent routes, a per-user runtime resolved from the SIWE subject, a
 * Postgres plan store (pg-mem), a Redis nonce store + session revoker (ioredis-mock),
 * and the SDK's wire contract. Nothing here touches a real network.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newDb } from 'pg-mem';
import RedisMock from 'ioredis-mock';
import { loadConfig } from '@intent-wallet/config';
import { nullLogger } from '@intent-wallet/observability';
import { HDKeyring, bytesToHex, hashPersonalMessage } from '@intent-wallet/core';
import type { Holding } from '@intent-wallet/runtime';
import { createClient, type TransportFetch, type TransportFetchResponse } from '@intent-wallet/sdk';
import { buildApp } from '../src/app.js';
import { PostgresPlanStore, type PgQueryable } from '../src/persistence/plan-store.js';
import { RedisNonceStore, type RedisClient } from '../src/auth/redis.js';
import { RedisSessionRevoker, type RevokerRedis } from '../src/auth/revoker.js';
import { makeUserRuntimeProvider } from '../src/runtime-provider.js';

const SECRET = 'test-secret-0123456789abcdef';
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const keyring = HDKeyring.fromMnemonic(MNEMONIC);
const ADDRESS = keyring.getAccount(0).evm.address;
const UTTERANCE = 'send 0.1 ETH to 0x1111111111111111111111111111111111111111';

/** personal_sign the SIWE message exactly as the browser wallet does (v in {27,28}). */
function personalSign(message: string): string {
  const digest = hashPersonalMessage(new TextEncoder().encode(message));
  const sig = keyring.signEvmDigest(digest);
  const withV = sig.slice();
  withV[64] = (withV[64] as number) + 27;
  return `0x${bytesToHex(withV)}`;
}

// The authenticated user holds 5 ETH; anyone else holds nothing.
const HOLDINGS: Holding[] = [{ symbol: 'ETH', decimals: 18, totalBase: 5n * 10n ** 18n, chains: [{ chainId: 'eip155:1', base: 5n * 10n ** 18n }] }];

describe('e2e — the production-wired request path', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { Pool } = newDb().adapters.createPg();
    const redis = new RedisMock();
    app = await buildApp({
      config: loadConfig({}),
      logger: nullLogger,
      authSecret: SECRET,
      requireAuth: true, // deployed posture: every intent request needs a session
      runtimeProvider: makeUserRuntimeProvider({
        holdingsFor: (p) => Promise.resolve(p.toLowerCase() === ADDRESS.toLowerCase() ? HOLDINGS : []),
        pricesFor: () => Promise.resolve({ ETH: '2000' }),
      }),
      planStore: new PostgresPlanStore(new Pool() as unknown as PgQueryable),
      nonceStore: new RedisNonceStore(redis as unknown as RedisClient),
      revoker: new RedisSessionRevoker(redis as unknown as RevokerRedis),
    });
  });
  afterAll(async () => {
    await app.close();
  });

  /** Full SIWE sign-in → a session token. */
  const signIn = async (): Promise<string> => {
    const { message } = (
      await app.inject({ method: 'POST', url: '/v1/auth/nonce', payload: { address: ADDRESS } })
    ).json() as { message: string };
    const res = await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: { message, signature: personalSign(message) } });
    return (res.json() as { token: string }).token;
  };

  it('catches a SPLIT DRAIN across separate requests (the deployed per-request runtime path)', async () => {
    // THE regression this exists for: deployed builds resolve a FRESH WalletRuntime per request
    // (so balances are never stale). The cumulative-outflow ledger used to live inside that
    // runtime, so every request started with an empty history — `sessionOutflowBase` returned 0
    // forever and this attack sailed through in production while passing locally (where one
    // long-lived runtime happens to keep the ledger). Testing it HERE, through the real routes
    // with makeUserRuntimeProvider, is the only way to prove the wiring and not just the mechanism.
    const token = await signIn();
    const auth = { authorization: `Bearer ${token}` };

    // Request 1 — 4 of 5 ETH. On its own this is not a whole-wallet move, so it plans.
    const first = await app.inject({ method: 'POST', url: '/v1/intents/plan', headers: auth, payload: { utterance: `send 4 ETH to ${ADDRESS}` } });
    const firstBody = first.json() as { outcome: { kind: string; plan?: { planId: string } } };
    expect(firstBody.outcome.kind).toBe('plan');
    const planId = firstBody.outcome.plan?.planId as string;

    // Authorizing records the outflow against this principal.
    await app.inject({ method: 'POST', url: '/v1/intents/authorize', headers: auth, payload: { planId } });

    // Request 2 — a BRAND-NEW runtime is built for this request. 1 ETH alone is harmless, but
    // 4 + 1 empties the wallet, so the cumulative guard must refuse it.
    const second = await app.inject({ method: 'POST', url: '/v1/intents/plan', headers: auth, payload: { utterance: `send 1 ETH to ${ADDRESS}` } });
    const secondBody = second.json() as { outcome: { kind: string; reason?: string } };
    expect(secondBody.outcome.kind).toBe('rejected');
    expect(secondBody.outcome.reason).toMatch(/already sent this session/i);
  });

  it('runs SIWE → plan → authorize against the user’s real holdings (Postgres round-trip)', async () => {
    // Unauthenticated is refused.
    expect((await app.inject({ method: 'POST', url: '/v1/intents/plan', payload: { utterance: UTTERANCE } })).statusCode).toBe(401);

    const token = await signIn();
    const auth = { authorization: `Bearer ${token}` };

    const planned = await app.inject({ method: 'POST', url: '/v1/intents/plan', payload: { utterance: UTTERANCE }, headers: auth });
    expect(planned.statusCode).toBe(200);
    const planId = (planned.json() as { outcome: { plan: { planId: string } } }).outcome.plan.planId;
    expect(planId).toMatch(/^plan-[0-9a-f-]{36}$/); // UUID id, per-user

    // authorize looks the plan up FROM the (pg-mem) Postgres store by id + owner.
    const authorized = await app.inject({ method: 'POST', url: '/v1/intents/authorize', payload: { planId }, headers: auth });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json()).toHaveProperty('mayProceedToSign');

    // /execute is absent in the prod posture (no server executor — signing is on-device).
    expect((await app.inject({ method: 'POST', url: '/v1/intents/execute', payload: { planId }, headers: auth })).statusCode).toBe(404);
  });

  it('logout revokes a session across the shared (Redis) revoker without touching other sessions', async () => {
    const keep = await signIn();
    const kill = await signIn();
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${kill}` } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/v1/me/logout', headers: { authorization: `Bearer ${kill}` } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${kill}` } })).statusCode).toBe(401); // revoked
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${keep}` } })).statusCode).toBe(200); // untouched
  });

  it('SDK↔API contract: the typed client drives the real routes over the same wire', async () => {
    const token = await signIn();
    // Adapt the SDK's fetch transport to Fastify's in-process inject.
    const transport: TransportFetch = async (url, init) => {
      const res = await app.inject({
        method: (init?.method ?? 'GET') as 'GET' | 'POST',
        url: url.replace(/^https?:\/\/[^/]+/u, ''),
        headers: (init?.headers ?? {}) as Record<string, string>,
        ...(init?.body ? { payload: init.body } : {}),
      });
      const response: TransportFetchResponse = {
        ok: res.statusCode >= 200 && res.statusCode < 300,
        status: res.statusCode,
        headers: { get: (k: string) => res.headers[k.toLowerCase()]?.toString() ?? null },
        text: () => Promise.resolve(res.body),
        json: () => Promise.resolve(res.json()),
      };
      return response;
    };
    const client = createClient({ baseUrl: '', fetch: transport, authToken: () => token });

    expect((await client.status()).status).toBe('operational');
    const handle = await client.plan(UTTERANCE); // carries the Bearer token via authToken
    expect(handle.outcome.kind).toBe('plan');
    if (handle.planId) {
      const permission = await client.authorize(handle.planId);
      expect(permission).toHaveProperty('mayProceedToSign');
    }
  });
});
