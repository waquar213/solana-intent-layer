/**
 * Edge hardening — helmet security headers, a CORS allowlist, and a global rate
 * limit. These wrap every route (registered before the routers), so a small app
 * with no runtime is enough to prove them.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '@intent-wallet/config';
import { nullLogger } from '@intent-wallet/observability';
import { buildApp } from '../src/app.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('security headers (helmet)', () => {
  it('sets nosniff + frameguard on responses', async () => {
    app = await buildApp({ config: loadConfig({}), logger: nullLogger });
    const res = await app.inject({ method: 'GET', url: '/v1/status' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

describe('CORS allowlist', () => {
  it('reflects an allowed origin and refuses an unlisted one', async () => {
    app = await buildApp({ config: loadConfig({ IW_CORS_ORIGINS: 'https://app.example.com' }), logger: nullLogger });

    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/v1/status',
      headers: { origin: 'https://app.example.com', 'access-control-request-method': 'GET' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');

    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/v1/status',
      headers: { origin: 'https://evil.example.com', 'access-control-request-method': 'GET' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sends no CORS headers when the allowlist is empty (same-origin only)', async () => {
    app = await buildApp({ config: loadConfig({}), logger: nullLogger });
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/status',
      headers: { origin: 'https://anything.example.com', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('readiness probes', () => {
  it('is ready when a dependency probe passes, 503 when it throws', async () => {
    const cfg = loadConfig({});
    const ready = await buildApp({
      config: cfg,
      logger: nullLogger,
      readinessProbes: [{ name: 'plan-store', check: () => Promise.resolve(true) }],
    });
    expect((await ready.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);
    await ready.close();

    const down = await buildApp({
      config: cfg,
      logger: nullLogger,
      readinessProbes: [{ name: 'plan-store', check: () => Promise.reject(new Error('db down')) }],
    });
    const res = await down.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { status: string }).status).toBe('not_ready');
    await down.close();
  });
});

describe('metrics + tracing', () => {
  it('exposes Prometheus metrics that count requests by route pattern', async () => {
    app = await buildApp({ config: loadConfig({}), logger: nullLogger });
    await app.inject({ method: 'GET', url: '/v1/status' }); // generate one request to count
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('http_requests_total');
    expect(res.body).toContain('http_request_duration_seconds');
    expect(res.body).toContain('nodejs_'); // default process metrics
    expect(res.body).toMatch(/http_requests_total\{[^}]*route="\/v1\/status"/u);
  });

  it('propagates a W3C traceparent (keeps an upstream trace id, echoes one otherwise)', async () => {
    app = await buildApp({ config: loadConfig({}), logger: nullLogger });
    const upstream = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const kept = await app.inject({ method: 'GET', url: '/v1/status', headers: { traceparent: upstream } });
    expect(kept.headers['traceparent']).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/u);

    const minted = await app.inject({ method: 'GET', url: '/v1/status' });
    expect(minted.headers['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/u);
  });
});

describe('rate limiting', () => {
  it('returns 429 problem+json past the configured max', async () => {
    app = await buildApp({ config: loadConfig({ IW_RATE_LIMIT_MAX: '2' }), logger: nullLogger });
    expect((await app.inject({ method: 'GET', url: '/v1/status' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/status' })).statusCode).toBe(200);
    const limited = await app.inject({ method: 'GET', url: '/v1/status' });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['content-type']).toContain('json');
    expect((limited.json() as { code: string }).code).toBe('RATE_LIMITED');
  });
});
