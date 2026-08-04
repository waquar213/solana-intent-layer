/**
 * SIWE auth — unit (recover/nonce/JWT) + a full HTTP round-trip proving the
 * protected route is genuinely gated (no longer a reject-all stub).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '@intent-wallet/config';
import { nullLogger } from '@intent-wallet/observability';
import { HDKeyring, bytesToHex, hashPersonalMessage } from '@intent-wallet/core';
import { buildApp } from '../src/app.js';
import RedisMock from 'ioredis-mock';
import { InMemoryNonceStore, buildSiweMessage, parseSiwe, recoverSiweSigner } from '../src/auth/siwe.js';
import { RedisNonceStore, type RedisClient } from '../src/auth/redis.js';
import { InMemorySessionRevoker, RedisSessionRevoker, type RevokerRedis } from '../src/auth/revoker.js';
import { signJwt, verifyJwt } from '../src/auth/jwt.js';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const keyring = HDKeyring.fromMnemonic(MNEMONIC);
const ADDRESS = keyring.getAccount(0).evm.address;

/** personal_sign the message the way the browser wallet does (v in {27,28}). */
function personalSign(message: string): string {
  const digest = hashPersonalMessage(new TextEncoder().encode(message));
  const sig = keyring.signEvmDigest(digest); // 65 bytes, recovery in {0,1}
  const withV = sig.slice();
  withV[64] = (withV[64] as number) + 27;
  return `0x${bytesToHex(withV)}`;
}

describe('SIWE signature recovery', () => {
  it('recovers the exact signer address from a personal_sign signature', () => {
    const msg = buildSiweMessage({
      domain: 'localhost',
      address: ADDRESS,
      uri: 'https://localhost',
      nonce: 'abc123',
      issuedAt: '2026-07-06T00:00:00.000Z',
      expirationTime: '2099-01-01T00:00:00.000Z',
    });
    expect(recoverSiweSigner(msg, personalSign(msg)).toLowerCase()).toBe(ADDRESS.toLowerCase());
    expect(parseSiwe(msg)).toEqual({ domain: 'localhost', address: ADDRESS, nonce: 'abc123', expirationTime: '2099-01-01T00:00:00.000Z' });
  });
});

describe('InMemoryNonceStore', () => {
  it('is one-time-use, address-bound, and expiring', async () => {
    const store = new InMemoryNonceStore();
    const good = await store.issue(ADDRESS, 60_000);
    expect(await store.consume(good.nonce, ADDRESS)).toBe(true); // good
    expect(await store.consume(good.nonce, ADDRESS)).toBe(false); // already consumed (one-time)
    const other = await store.issue(ADDRESS, 60_000);
    expect(await store.consume(other.nonce, `0x${'1'.repeat(40)}`)).toBe(false); // wrong address
    const expired = await store.issue(ADDRESS, -1);
    expect(await store.consume(expired.nonce, ADDRESS)).toBe(false); // expired
    expect(await store.consume('never-issued', ADDRESS)).toBe(false); // unknown
  });
});

describe('RedisNonceStore (against an in-memory Redis via ioredis-mock)', () => {
  it('is one-time-use + address-bound on a shared store (atomic getdel)', async () => {
    const redis = new RedisMock();
    const store = new RedisNonceStore(redis as unknown as RedisClient);
    const { nonce } = await store.issue(ADDRESS, 60_000);
    expect(await store.consume(nonce, ADDRESS)).toBe(true); // good
    expect(await store.consume(nonce, ADDRESS)).toBe(false); // getdel already removed it (one-time)
    const other = await store.issue(ADDRESS, 60_000);
    expect(await store.consume(other.nonce, `0x${'1'.repeat(40)}`)).toBe(false); // wrong address
    expect(await store.consume('never-issued', ADDRESS)).toBe(false); // unknown
    await redis.quit();
  });
});

describe('SessionRevoker', () => {
  it('in-memory: revokes a single jti and signs out everywhere by cutoff', async () => {
    const r = new InMemorySessionRevoker();
    expect(await r.isRevoked({ sub: ADDRESS, iat: 1000, jti: 'j1' })).toBe(false);
    await r.revoke('j1', 3600);
    expect(await r.isRevoked({ sub: ADDRESS, iat: 1000, jti: 'j1' })).toBe(true); // this session dead
    expect(await r.isRevoked({ sub: ADDRESS, iat: 1000, jti: 'j2' })).toBe(false); // other session fine
    await r.revokeAllFor(ADDRESS, 1001); // sign out everywhere as of iat<1001
    expect(await r.isRevoked({ sub: ADDRESS, iat: 1000, jti: 'j2' })).toBe(true); // predates cutoff
    expect(await r.isRevoked({ sub: ADDRESS, iat: 2000, jti: 'j3' })).toBe(false); // a newer login is fine
  });

  it('redis: same semantics via ioredis-mock', async () => {
    const redis = new RedisMock();
    const r = new RedisSessionRevoker(redis as unknown as RevokerRedis);
    await r.revoke('jx', 3600);
    expect(await r.isRevoked({ sub: ADDRESS, iat: 1, jti: 'jx' })).toBe(true);
    await r.revokeAllFor(ADDRESS, 100);
    expect(await r.isRevoked({ sub: ADDRESS, iat: 50, jti: 'z' })).toBe(true); // predates cutoff
    expect(await r.isRevoked({ sub: ADDRESS, iat: 200, jti: 'z' })).toBe(false);
    await redis.quit();
  });
});

describe('JWT (HS256)', () => {
  const secret = 'test-secret-0123456789abcdef';
  it('round-trips and rejects tamper / wrong secret / expiry', () => {
    const now = 1_000_000;
    const token = signJwt({ sub: ADDRESS, iat: now, exp: now + 3600 }, secret);
    expect(verifyJwt(token, secret, now + 10)?.sub).toBe(ADDRESS);
    expect(verifyJwt(token, secret, now + 4000)).toBeNull(); // expired
    expect(verifyJwt(token, 'wrong-secret-0123456789', now)).toBeNull();
    expect(verifyJwt(`${token}x`, secret, now)).toBeNull(); // tampered signature
    expect(verifyJwt('not.a.jwt', secret, now)).toBeNull();
  });
});

describe('auth over HTTP', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ config: loadConfig({}), logger: nullLogger, authSecret: 'test-secret-0123456789abcdef' });
  });
  afterAll(async () => {
    await app.close();
  });

  it('rejects the protected route without a session', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/me' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: 'Bearer garbage' } })).statusCode,
    ).toBe(401);
  });

  it('completes nonce → sign → verify → protected access', async () => {
    const nonceRes = await app.inject({ method: 'POST', url: '/v1/auth/nonce', payload: { address: ADDRESS } });
    expect(nonceRes.statusCode).toBe(200);
    const { message } = nonceRes.json() as { message: string };

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { message, signature: personalSign(message) },
    });
    expect(verifyRes.statusCode).toBe(200);
    const { token, address } = verifyRes.json() as { token: string; address: string };
    expect(address.toLowerCase()).toBe(ADDRESS.toLowerCase());

    const meRes = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${token}` } });
    expect(meRes.statusCode).toBe(200);
    expect((meRes.json() as { address: string }).address.toLowerCase()).toBe(ADDRESS.toLowerCase());
  });

  it('rejects a replayed nonce', async () => {
    const { message } = (
      await app.inject({ method: 'POST', url: '/v1/auth/nonce', payload: { address: ADDRESS } })
    ).json() as { message: string };
    const sig = personalSign(message);
    expect((await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: { message, signature: sig } })).statusCode).toBe(200);
    // Same nonce again → rejected.
    expect((await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: { message, signature: sig } })).statusCode).toBe(401);
  });

  it('rejects a message re-scoped to a different domain, even with a valid server nonce (anti-phishing)', async () => {
    const { message } = (
      await app.inject({ method: 'POST', url: '/v1/auth/nonce', payload: { address: ADDRESS } })
    ).json() as { message: string };
    const fields = parseSiwe(message);
    expect(fields).not.toBeNull();
    // A phishing page could smuggle OUR nonce into a message showing ITS OWN domain and get
    // the victim to sign it. Re-scope the same valid nonce to 'evil.example' and sign that —
    // the domain-binding check must reject it before the nonce is ever consumed.
    const evil = buildSiweMessage({
      domain: 'evil.example',
      address: ADDRESS,
      uri: 'https://evil.example',
      nonce: fields!.nonce,
      issuedAt: new Date().toISOString(),
      expirationTime: fields!.expirationTime,
    });
    const res = await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: { message: evil, signature: personalSign(evil) } });
    expect(res.statusCode).toBe(401);
  });

  /** Run the full sign-in and return a fresh session token. */
  const signIn = async (): Promise<string> => {
    const { message } = (
      await app.inject({ method: 'POST', url: '/v1/auth/nonce', payload: { address: ADDRESS } })
    ).json() as { message: string };
    const res = await app.inject({ method: 'POST', url: '/v1/auth/verify', payload: { message, signature: personalSign(message) } });
    return (res.json() as { token: string }).token;
  };

  it('logout revokes THIS session — the token stops working immediately', async () => {
    const token = await signIn();
    const auth = { authorization: `Bearer ${token}` };
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: auth })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/v1/me/logout', headers: auth })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: auth })).statusCode).toBe(401); // revoked
  });

  it('logout-all revokes every session for the subject', async () => {
    // Two independent sessions issued 10s ago (older than the sign-out cutoff, which
    // is `now`), so the test doesn't race the 1-second iat granularity.
    const secret = 'test-secret-0123456789abcdef';
    const past = Math.floor(Date.now() / 1000) - 10;
    const a = signJwt({ sub: ADDRESS, iat: past, exp: past + 3600, jti: 'sess-a' }, secret);
    const b = signJwt({ sub: ADDRESS, iat: past, exp: past + 3600, jti: 'sess-b' }, secret);
    expect((await app.inject({ method: 'POST', url: '/v1/me/logout-all', headers: { authorization: `Bearer ${a}` } })).statusCode).toBe(204);
    // BOTH tokens (issued before the sign-out) are now dead.
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${a}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${b}` } })).statusCode).toBe(401);
  });
});
