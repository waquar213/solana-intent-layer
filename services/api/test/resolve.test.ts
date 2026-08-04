import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '@intent-wallet/config';
import { nullLogger } from '@intent-wallet/observability';
import { buildApp } from '../src/app.js';

const VITALIK = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({
    config: loadConfig({}),
    logger: nullLogger,
    // Stub resolver: only vitalik.eth resolves; everything else is null (unresolvable).
    resolveEns: (name) => Promise.resolve(name.trim().toLowerCase() === 'vitalik.eth' ? VITALIK : null),
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /v1/resolve/ens', () => {
  it('returns the resolved address for a known name', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/resolve/ens?name=vitalik.eth' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'vitalik.eth', address: VITALIK });
  });

  it('returns address:null for an unresolvable name (never guesses)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/resolve/ens?name=nope.eth' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'nope.eth', address: null });
  });

  it('handles a missing name param', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/resolve/ens' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: '', address: null });
  });
});
