/**
 * App factory. Builds a fully-wired Fastify instance from injected dependencies
 * — no globals, no side effects at import — so it is trivially testable via
 * `app.inject()` without opening a socket. This is the composition root every
 * future feature module plugs into (config → logger → context → errors →
 * routes → openapi).
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Config } from '@intent-wallet/config';
import type { Redis } from 'ioredis';
import type { Logger } from '@intent-wallet/observability';
import { tooManyRequests } from '@intent-wallet/observability';
import type { WalletRuntime } from '@intent-wallet/runtime';
import type { NonceStore } from './auth/siwe.js';
import type { SessionRevoker } from './auth/revoker.js';
import type { RuntimeProvider } from './runtime-provider.js';
import type { InsightsSource } from './insights.js';
import type { EvmTxItem } from './history.js';
import type { BalancesReader } from './balances.js';
import { registerRequestContext } from './plugins/request-context.js';
import { registerMetrics } from './plugins/metrics.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerHealthRoutes, type ReadinessProbe } from './routes/health.js';
import { registerV1Routes } from './routes/v1/index.js';
import type { ExecutorSeam, IdentityDto } from './routes/v1/intents.js';
import type { PlanStore } from './persistence/plan-store.js';
import { registerOpenApiRoute } from './openapi.js';

export interface BuildAppDeps {
  config: Config;
  logger: Logger;
  /** Readiness probes (DB, Redis, …). Empty in the foundation; wired per milestone. */
  readinessProbes?: ReadinessProbe[];
  /** The composition root (dev seed); when present, the intent endpoints are exposed. */
  runtime?: WalletRuntime;
  /** Per-principal runtime resolver (prod: real per-user holdings) — mounts the same endpoints. */
  runtimeProvider?: RuntimeProvider;
  /** The execution seam; when present (with a runtime), `POST /v1/intents/execute` is exposed. */
  executor?: ExecutorSeam;
  /** The Universal Identity; when present (with a runtime), `GET /v1/identity` is exposed. */
  identity?: IdentityDto;
  /** Persisted plan store for authorize/execute lookups; defaults to in-memory. */
  planStore?: PlanStore;
  /** HS256 secret for SIWE sessions; when present, /v1/auth/* + /v1/me are exposed. */
  authSecret?: string;
  /** SIWE domain (the app origin). */
  authDomain?: string;
  /** When true (and a secret is wired), the intent routes require a valid session. */
  requireAuth?: boolean;
  /** Shared Redis (deployed). Backs the rate limiter across replicas. */
  redis?: Redis;
  /** Shared nonce store (deployed: Redis-backed) so SIWE sign-in works across replicas. */
  nonceStore?: NonceStore;
  /** Shared session revoker (deployed: Redis-backed) for logout / sign-out-everywhere. */
  revoker?: SessionRevoker;
  /** Holdings+price seams for GET /v1/portfolio/insights (the intelligence engine). */
  insights?: InsightsSource;
  /** ENS resolver; when present, exposes public GET /v1/resolve/ens?name=. */
  resolveEns?: (name: string) => Promise<string | null>;
  /** EVM history reader; when present, exposes public GET /v1/history/evm?address=. */
  evmHistory?: (address: string, limit?: number) => Promise<EvmTxItem[]>;
  /** Cross-ecosystem balances reader; when present, exposes public POST /v1/portfolio/balances. */
  balances?: BalancesReader;
}

/** Parse the comma-separated CORS allowlist into trimmed, non-empty exact origins. */
function parseCorsOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // We drive logging through our own logger (redaction, correlation ids);
    // disable Fastify's built-in pino to keep one logging path.
    logger: false,
    // Reject oversized bodies early (DoS guard); tune per-route later.
    bodyLimit: 1_048_576, // 1 MiB
    // We set x-request-id ourselves; don't let Fastify generate a second id.
    genReqId: () => '',
  });

  // ── Edge hardening — registered FIRST so it wraps every route ──────────────
  // Security headers. This is a JSON API (no HTML rendering), so CSP is irrelevant
  // and left off; the remaining headers (nosniff, frameguard, HSTS, etc.) apply.
  await app.register(helmet, { contentSecurityPolicy: false });
  // CORS: allow ONLY the configured browser origins. Empty allowlist → no
  // cross-origin access (same-origin only — how local dev works via the Vite proxy).
  const corsOrigins = parseCorsOrigins(deps.config.IW_CORS_ORIGINS);
  await app.register(cors, { origin: corsOrigins.length > 0 ? corsOrigins : false, credentials: true });
  // Global rate limit per IP (DoS/abuse floor). Sensitive routes (/v1/auth/*) add a
  // tighter per-route limit on top. 429s are shaped as problem+json for consistency.
  await app.register(rateLimit, {
    max: deps.config.IW_RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    // Bucket per REAL client, not per proxy. This backend sits behind Vercel's /v1 rewrite → Railway,
    // so req.ip is the shared upstream proxy IP and the default keyGenerator (req.ip) would collapse
    // ALL users into ONE bucket — one caller exhausts the floor and everyone else gets spurious 429s.
    // Prefer the client IP from X-Forwarded-For (set by the proxy), falling back to req.ip. NOTE: XFF
    // is client-settable, so a determined abuser could rotate it to evade limits — acceptable for a
    // testnet demo; a prod deployment should scope trust to the known proxy (bounded trustProxy).
    keyGenerator: (req) => {
      const xff = req.headers['x-forwarded-for'];
      const first = (Array.isArray(xff) ? (xff[0] ?? '') : (xff ?? '')).split(',')[0]?.trim() ?? '';
      return first || req.ip;
    },
    // Shared across replicas when Redis is wired; per-process in-memory otherwise.
    ...(deps.redis ? { redis: deps.redis } : {}),
    // The plugin THROWS this builder's return value; returning our AppError routes
    // it through the app's error handler → a consistent 429 problem+json body.
    errorResponseBuilder: (_req, context) =>
      tooManyRequests(`rate limit exceeded — max ${context.max} per ${context.after}`) as unknown as Error,
  });

  registerRequestContext(app, deps.logger);
  registerMetrics(app);
  registerErrorHandler(app);
  registerOpenApiRoute(app);
  registerHealthRoutes(app, deps.readinessProbes ?? []);
  await registerV1Routes(app, {
    ...(deps.runtime ? { runtime: deps.runtime } : {}),
    ...(deps.runtimeProvider ? { runtimeProvider: deps.runtimeProvider } : {}),
    ...(deps.executor ? { executor: deps.executor } : {}),
    ...(deps.identity ? { identity: deps.identity } : {}),
    ...(deps.planStore ? { planStore: deps.planStore } : {}),
    ...(deps.authSecret ? { authSecret: deps.authSecret } : {}),
    ...(deps.authDomain ? { authDomain: deps.authDomain } : {}),
    ...(deps.requireAuth ? { requireAuth: deps.requireAuth } : {}),
    ...(deps.nonceStore ? { nonceStore: deps.nonceStore } : {}),
    ...(deps.revoker ? { revoker: deps.revoker } : {}),
    ...(deps.insights ? { insights: deps.insights } : {}),
    ...(deps.resolveEns ? { resolveEns: deps.resolveEns } : {}),
    ...(deps.evmHistory ? { evmHistory: deps.evmHistory } : {}),
    ...(deps.balances ? { balances: deps.balances } : {}),
  });

  return app;
}
