/**
 * The /v1 router — the mount point every future v1 feature route attaches to
 * (intents, portfolio, risk, …). URL-major versioning (ADR / architecture 07):
 * a breaking change ships as /v2, never a silent change here.
 *
 * Today it exposes only meta/introspection routes; business routes arrive with
 * their milestones (M4 intents, M3 portfolio, …). No placeholder business
 * endpoints are registered — the surface is honest about what exists.
 */
import type { FastifyInstance } from 'fastify';
import { badRequest } from '@intent-wallet/observability';
import type { WalletRuntime } from '@intent-wallet/runtime';
import type { RuntimeProvider } from '../../runtime-provider.js';
import { registerIntentRoutes, type ExecutorSeam, type IdentityDto } from './intents.js';
import { registerAuthRoutes, makeJwtVerifier } from './auth.js';
import { makeAuthGuard } from '../../plugins/auth-guard.js';
import type { PlanStore } from '../../persistence/plan-store.js';
import type { NonceStore } from '../../auth/siwe.js';
import { InMemorySessionRevoker, type SessionRevoker } from '../../auth/revoker.js';
import type { InsightsSource } from '../../insights.js';
import type { EvmTxItem } from '../../history.js';
import type { BalancesReader } from '../../balances.js';

export interface V1RouteOptions {
  /** The composition root (dev seed). When present, the intent endpoints are exposed. */
  runtime?: WalletRuntime;
  /** Per-principal runtime resolver (prod: real per-user holdings). Mounts the intent
   *  endpoints just like `runtime`, but resolves a fresh runtime per authenticated user. */
  runtimeProvider?: RuntimeProvider;
  /** The execution seam. When present (with a runtime), POST /v1/intents/execute is exposed. */
  executor?: ExecutorSeam;
  /** The Universal Identity. When present (with a runtime), GET /v1/identity is exposed. */
  identity?: IdentityDto;
  /** Persisted plan store; forwarded to the intent routes (default in-memory). */
  planStore?: PlanStore;
  /** HS256 secret for SIWE sessions. When present, the /v1/auth/* + /v1/me routes are exposed. */
  authSecret?: string;
  /** SIWE domain (the app origin). */
  authDomain?: string;
  /** When true (and a secret is wired), the intent routes require a valid session. */
  requireAuth?: boolean;
  /** Shared nonce store (Redis in prod); defaults to in-memory inside the auth routes. */
  nonceStore?: NonceStore;
  /** Shared session revoker (Redis in prod) — one instance backs BOTH the auth routes and the intent guard. */
  revoker?: SessionRevoker;
  /** Holdings+price seams for GET /v1/portfolio/insights (the intelligence engine). */
  insights?: InsightsSource;
  /** ENS resolver — when present, exposes GET /v1/resolve/ens?name= (public, read-only). */
  resolveEns?: (name: string) => Promise<string | null>;
  /** EVM history reader — when present, exposes GET /v1/history/evm?address= (public). */
  evmHistory?: (address: string, limit?: number) => Promise<EvmTxItem[]>;
  /** Cross-ecosystem balances reader — when present, exposes POST /v1/portfolio/balances (public). */
  balances?: BalancesReader;
}

export async function registerV1Routes(app: FastifyInstance, opts: V1RouteOptions = {}): Promise<void> {
  // Public meta endpoint: confirms the API is reachable and reports version.
  app.get('/v1/status', async () => ({
    service: 'intent-wallet-api',
    apiVersion: 'v1',
    status: 'operational',
  }));

  // Unauthenticated fan-out reads each amplify to several upstream calls (incl. a metered
  // Alchemy key), so put a tight per-route limit on top of the global one (M8) and validate
  // the address shape up front so a malformed input is a clean 400, not a 500 (L13).
  const publicFanout = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
  const EVM_RE = /^0x[0-9a-fA-F]{40}$/u;
  const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
  const BTC_RE = /^(bc1[a-z0-9]{25,87}|tb1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|[mn2][a-km-zA-HJ-NP-Z1-9]{25,39})$/u;

  // Public ENS resolution — GET /v1/resolve/ens?name=vitalik.eth → { name, address|null }.
  if (opts.resolveEns) {
    const resolveEns = opts.resolveEns;
    app.get('/v1/resolve/ens', publicFanout, async (request) => {
      const q = request.query as { name?: unknown };
      const name = typeof q.name === 'string' ? q.name.slice(0, 255) : '';
      // ENS resolution is best-effort — the client treats a null address as "unresolved". An upstream
      // RPC outage rejects here; degrade to null rather than 500 on the shared error budget for a blip.
      try {
        return { name, address: await resolveEns(name) };
      } catch (err) {
        // Soft-empty to the client, but DON'T swallow silently — an upstream outage (or an expired
        // keyed RPC returning 401) must be visible to metrics/alerts, else a broken feature looks
        // identical to "no data".
        request.log2?.warn('ens resolve upstream degraded', { err });
        return { name, address: null };
      }
    });
  }

  // Public EVM transaction history (activity feed) — GET /v1/history/evm?address=&limit=.
  if (opts.evmHistory) {
    const evmHistory = opts.evmHistory;
    app.get('/v1/history/evm', publicFanout, async (request) => {
      const q = request.query as { address?: unknown; limit?: unknown };
      const address = typeof q.address === 'string' ? q.address.trim() : '';
      if (address && !EVM_RE.test(address)) throw badRequest('address must be a 0x-prefixed EVM address');
      const limit = typeof q.limit === 'string' ? Math.min(Math.max(1, Number(q.limit) || 15), 50) : 15;
      // History is best-effort — the client shows an empty feed on failure. An explorer outage degrades
      // to [] rather than 500 on the shared error budget. (The malformed-address 400 above still fires.)
      try {
        return { address, items: address ? await evmHistory(address, limit) : [] };
      } catch (err) {
        request.log2?.warn('evm history upstream degraded', { err }); // visible to metrics; still soft-empty to client
        return { address, items: [] };
      }
    });
  }

  // Public cross-ecosystem balances — POST /v1/portfolio/balances { evm?, btc?, sol? }.
  if (opts.balances) {
    const balances = opts.balances;
    app.post('/v1/portfolio/balances', publicFanout, async (request) => {
      const b = (request.body ?? {}) as { evm?: unknown; btc?: unknown; sol?: unknown };
      const addrs: { evm?: string; btc?: string; sol?: string } = {};
      if (typeof b.evm === 'string' && b.evm.trim()) {
        if (!EVM_RE.test(b.evm.trim())) throw badRequest('evm must be a 0x-prefixed EVM address');
        addrs.evm = b.evm.trim();
      }
      if (typeof b.btc === 'string' && b.btc.trim()) {
        if (!BTC_RE.test(b.btc.trim())) throw badRequest('btc must be a valid Bitcoin address');
        addrs.btc = b.btc.trim();
      }
      if (typeof b.sol === 'string' && b.sol.trim()) {
        if (!SOL_RE.test(b.sol.trim())) throw badRequest('sol must be a valid Solana address');
        addrs.sol = b.sol.trim();
      }
      return balances(addrs);
    });
  }

  // ONE revoker instance backs both the auth routes and the intent guard, so a token
  // revoked via /v1/me/logout is dead on the intent routes too.
  const revoker = opts.revoker ?? new InMemorySessionRevoker();

  // SIWE auth — real, non-custodial sign-in. Registered when a signing secret is
  // wired (the deployment always provides one; dev supplies a default).
  if (opts.authSecret) {
    registerAuthRoutes(app, {
      secret: opts.authSecret,
      revoker,
      ...(opts.authDomain ? { domain: opts.authDomain } : {}),
      ...(opts.nonceStore ? { nonces: opts.nonceStore } : {}),
    });
  }

  // The session guard for the intent routes — built only when enforcement is on AND
  // a secret is wired (enforcement without a verifier would be a footgun). When
  // absent, the intent routes stay open (localhost default). Shares the revoker.
  const intentGuard = opts.requireAuth && opts.authSecret ? makeAuthGuard(makeJwtVerifier(opts.authSecret, revoker)) : undefined;

  // Business routes are registered only when their dependency is wired — the
  // surface stays honest about what actually works (no placeholder endpoints). A
  // per-user resolver (prod) takes precedence over the fixed dev runtime.
  const runtimeOrProvider = opts.runtimeProvider ?? opts.runtime;
  if (runtimeOrProvider) {
    registerIntentRoutes(app, runtimeOrProvider, {
      ...(opts.executor ? { executor: opts.executor } : {}),
      ...(opts.identity ? { identity: opts.identity } : {}),
      ...(opts.planStore ? { planStore: opts.planStore } : {}),
      ...(intentGuard ? { authGuard: intentGuard } : {}),
      ...(opts.insights ? { insights: opts.insights } : {}),
    });
  }
}
