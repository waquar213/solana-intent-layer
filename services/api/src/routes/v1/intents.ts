/**
 * The intents route — the HTTP surface of the wallet's brain, exposing the full
 * doctrine loop over the composition root (`@intent-wallet/runtime`):
 *
 *   POST /v1/intents/plan      — natural language → a verified ExecutionPlan (PROPOSE)
 *   POST /v1/intents/authorize — run a plan through Risk + Policy → a permission (AUTHORIZE)
 *   POST /v1/intents/execute   — drive an authorized plan to a terminal execution (DISPOSE)
 *   GET  /v1/portfolio         — holdings folded into USD values (the read side)
 *
 * Doctrine, enforced here:
 *  • authorize/execute act on a plan the SERVER produced, looked up by planId from a
 *    bounded in-memory cache — a client can never hand us a forged plan.
 *  • /execute RE-authorizes server-side and refuses unless `mayProceedToSign`; the
 *    client's opinion of the permission is never trusted.
 *  • /execute exists only when an executor seam is wired (dev demo uses fakes). With
 *    no executor the route is absent — the surface stays honest about what runs.
 * Money is serialized as decimal strings; permissions/executions are JSON-safe.
 */
import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { badRequest, notFound } from '@intent-wallet/observability';
import { InMemoryPlanStore, type PlanStore } from '../../persistence/plan-store.js';
import type { RuntimeProvider } from '../../runtime-provider.js';
import { analyzeSnapshot, snapshotFromHoldings, toJsonSafe, type InsightsSource } from '../../insights.js';
import type {
  ChainGateway,
  Execution,
  ExecutionPermission,
  ExecutionPlan,
  PlanOutcome,
  RuntimeGasPlanner,
  StepSigner,
  StepSimulator,
  WalletRuntime,
} from '@intent-wallet/runtime';

const PlanRequestSchema = z.object({
  utterance: z.string().trim().min(1, 'utterance is required').max(500),
});
// planId is a server-issued randomUUID (36 chars); cap it so a giant string can't be sent to
// the store lookup. Bounded anyway by the 1 MiB body limit, but an explicit cap fails fast.
const AuthorizeRequestSchema = z.object({
  // NOTE: the principal is ALWAYS the authenticated subject (never a client claim), so no
  // `principalId` field is accepted here — it would be dead/misleading input.
  planId: z.string().trim().min(1, 'planId is required').max(100),
});
const ExecuteRequestSchema = z.object({
  planId: z.string().trim().min(1, 'planId is required').max(100),
});

/** The device-signing + broadcast + gas seam that powers /execute (dev: fakes + real gas). */
export interface ExecutorSeam {
  signer: StepSigner;
  gateway: ChainGateway;
  gasPlanner?: RuntimeGasPlanner;
  /** Pre-broadcast simulation (the execution sandbox). */
  simulator?: StepSimulator;
}

/** A serialized Universal Identity — the account's BTC/EVM/SOL receive addresses. */
export interface IdentityDto {
  index: number;
  evm: { address: string; path: string };
  btc: { address: string; path: string };
  sol: { address: string; path: string };
}

export interface IntentRouteOptions {
  /** When present, POST /v1/intents/execute is exposed over this executor. */
  executor?: ExecutorSeam;
  /** When present, GET /v1/identity returns this Universal Identity. */
  identity?: IdentityDto;
  /** Principal used when a request omits one (dev demo). */
  defaultPrincipalId?: string;
  /** Max plans kept in the server-side cache (oldest evicted). */
  planCacheSize?: number;
  /** Where authorize/execute look up the plan the server issued (default: in-memory). */
  planStore?: PlanStore;
  /**
   * When present, this preHandler gates plan/authorize/execute — the server-side
   * enforcement of "the app's real requests require a valid session". Absent →
   * the routes are open (localhost default). Wired from IW_REQUIRE_AUTH.
   */
  authGuard?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  /** When present, GET /v1/portfolio/insights runs the intelligence engine over
   *  the principal's holdings (same seams as the runtime — no second data copy). */
  insights?: InsightsSource;
}

function serializeOutcome(outcome: PlanOutcome): Record<string, unknown> {
  switch (outcome.kind) {
    case 'plan':
      return { kind: 'plan', plan: outcome.plan };
    case 'clarify':
      return outcome.options
        ? { kind: 'clarify', question: outcome.question, options: outcome.options }
        : { kind: 'clarify', question: outcome.question };
    case 'answer':
      return { kind: 'answer', question: outcome.question };
    case 'automation':
      return { kind: 'automation', intentKind: outcome.intent.kind };
    case 'rejected':
      return { kind: 'rejected', reason: outcome.reason, risk: outcome.risk };
  }
}

/** JSON-safe projection of a permission — only the fields the client needs, no bigint. */
function serializePermission(p: ExecutionPermission): Record<string, unknown> {
  return {
    gate: p.gate,
    mayProceedToSign: p.mayProceedToSign,
    drivenBy: p.drivenBy,
    reasons: p.reasons,
    requirements: p.requirements,
    riskLevel: p.risk.report.level,
    ...(p.planId ? { planId: p.planId } : {}),
    ...(p.intentId ? { intentId: p.intentId } : {}),
  };
}

export function registerIntentRoutes(
  app: FastifyInstance,
  // A FIXED runtime (dev seed) or a per-principal RESOLVER (prod: real per-user
  // holdings). A resolver is a function; a runtime is an object — that's the switch.
  runtimeOrProvider: WalletRuntime | RuntimeProvider,
  opts: IntentRouteOptions = {},
): void {
  const defaultPrincipalId = opts.defaultPrincipalId ?? 'demo-user';
  const cacheSize = opts.planCacheSize ?? 200;
  const resolveRuntime = (principal: string): Promise<WalletRuntime> =>
    typeof runtimeOrProvider === 'function' ? runtimeOrProvider(principal) : Promise.resolve(runtimeOrProvider);
  // When auth is required, every intent route carries the session guard as a
  // preHandler; otherwise the route options are empty and the route stays open.
  const guarded = opts.authGuard ? { preHandler: opts.authGuard } : {};
  // Authenticated FAN-OUT routes each amplify to several metered upstream calls (a fresh multi-chain
  // holdings discovery every request; `plan` adds the LLM + GIWA/Jupiter/Uniswap quote eth_calls). SIWE
  // sign-in is PERMISSIONLESS, so the auth gate is not a throttle — without a per-route cap a self-signed
  // session could loop these under the 300/min global floor into an Alchemy-key cost-amplification DoS
  // that degrades holdings for everyone. Put a TIGHT per-route limit on top (mirrors `publicFanout` on the
  // cheaper public reads); `plan` is the heaviest so it gets the tightest.
  const guardedFanout = { ...guarded, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
  const guardedPlan = { ...guarded, config: { rateLimit: { max: 15, timeWindow: '1 minute' } } };

  // Server-side plan store: authorize/execute only ever act on a plan WE produced,
  // looked up by planId. Persisted (SQLite/Postgres) so it survives restarts and is
  // shared across replicas; falls back to a bounded in-memory store.
  const store: PlanStore = opts.planStore ?? new InMemoryPlanStore(cacheSize);

  // The principal a request acts as. When the session guard is active the subject
  // is the authenticated wallet (never the client's claim); otherwise (localhost,
  // auth off) everyone is the single dev principal.
  const principalOf = (request: FastifyRequest): string => request.auth?.subject ?? defaultPrincipalId;

  // Look up a plan AND enforce ownership: a plan not found or owned by a different
  // principal returns the SAME "no such plan" — so one user can neither act on nor
  // probe the existence of another user's plan on a shared store.
  const requirePlan = async (planId: string, requester: string): Promise<ExecutionPlan> => {
    const stored = await store.get(planId);
    if (!stored || stored.owner !== requester) throw notFound(`no such plan '${planId}' (expired or never issued)`);
    return stored.plan;
  };

  app.post('/v1/intents/plan', guardedPlan, async (request) => {
    const parsed = PlanRequestSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest('invalid plan request', { issues: parsed.error.issues });

    const requester = principalOf(request);
    const runtime = await resolveRuntime(requester);
    const { intent, outcome } = await runtime.plan(parsed.data.utterance);
    // The plan is owned by the requesting principal — only they can authorize/execute it.
    if (outcome.kind === 'plan') await store.remember(outcome.plan, requester);
    return { intentKind: intent.kind, outcome: serializeOutcome(outcome) };
  });

  app.post('/v1/intents/authorize', guardedFanout, async (request) => {
    const parsed = AuthorizeRequestSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest('invalid authorize request', { issues: parsed.error.issues });

    // NEVER trust a client-supplied principal — bind to the authenticated subject.
    const requester = principalOf(request);
    const runtime = await resolveRuntime(requester);
    const plan = await requirePlan(parsed.data.planId, requester);
    const permission = await runtime.authorize(plan, { principalId: requester });
    return serializePermission(permission);
  });

  if (opts.executor) {
    const executor = opts.executor;
    // In-flight execute latch. The post-execute `store.delete` blocks a SEQUENTIAL replay, but two
    // executes of the same planId racing in PARALLEL would both pass requirePlan (the plan is still
    // present) and both run it. Claim the id for the duration of execute so only the first proceeds; a
    // concurrent second is refused. The has-check + add are synchronous (no await between), so the claim
    // is atomic. Mirrors the client's INFLIGHT_PLAN_IDS. (Single-instance demo executor only — prod signs
    // on-device with no server executor; a multi-instance executor would need a store-level atomic claim.)
    const executingPlanIds = new Set<string>();
    app.post('/v1/intents/execute', guardedFanout, async (request) => {
      const parsed = ExecuteRequestSchema.safeParse(request.body);
      if (!parsed.success) throw badRequest('invalid execute request', { issues: parsed.error.issues });

      const requester = principalOf(request);
      const runtime = await resolveRuntime(requester);
      const plan = await requirePlan(parsed.data.planId, requester);
      // NEVER trust the client's authorization — re-run Risk + Policy here (as the
      // authenticated principal) and refuse to touch the executor unless it may sign.
      const permission = await runtime.authorize(plan, { principalId: requester });
      if (!permission.mayProceedToSign) {
        return { executed: false, permission: serializePermission(permission) };
      }
      if (executingPlanIds.has(parsed.data.planId)) {
        throw badRequest(`plan '${parsed.data.planId}' is already being executed`);
      }
      executingPlanIds.add(parsed.data.planId);
      try {
        const execution: Execution = await runtime.execute(plan, {
          signer: executor.signer,
          gateway: executor.gateway,
          // Bind gas sponsorship to the AUTHENTICATED principal (not the planner's construction-time
          // default), so the per-user daily paymaster cap is tracked per user over the shared engine.
          ...(executor.gasPlanner ? { gasPlanner: executor.gasPlanner.forUser(requester) } : {}),
          ...(executor.simulator ? { simulator: executor.simulator } : {}),
        });
        // Consume the plan so a replayed (or double-submitted) execute of the SAME planId can't
        // run it twice — a re-POST now 404s ("no such plan") instead of re-executing.
        await store.delete(parsed.data.planId);
        return { executed: true, permission: serializePermission(permission), execution };
      } finally {
        executingPlanIds.delete(parsed.data.planId);
      }
    });
  }

  // The read side — holdings folded into USD values (JSON-safe: money is decimal
  // strings). Resolved for the authenticated principal (their real holdings in prod),
  // so it MUST carry the same session guard as the write routes — otherwise a
  // deployed env would serve one user's real portfolio to any unauthenticated caller.
  app.get('/v1/portfolio', guardedFanout, async (request) => (await resolveRuntime(principalOf(request))).portfolio());

  // Portfolio intelligence — allocation / concentration / risk / health / insights
  // over the SAME holdings + price seams the runtime plans against. Guarded like
  // /v1/portfolio (it derives from the same per-user data). Registered only when the
  // seams are wired — the surface stays honest.
  if (opts.insights) {
    const source = opts.insights;
    app.get('/v1/portfolio/insights', guardedFanout, async (request) => {
      const principal = principalOf(request);
      const [holdings, prices] = await Promise.all([source.holdingsFor(principal), source.pricesFor()]);
      const snapshot = snapshotFromHoldings(principal, holdings, prices, new Date().toISOString());
      return toJsonSafe(analyzeSnapshot(snapshot));
    });
  }

  // The Universal Identity — one account, three chains. Public receive addresses only
  // (never keys); registered only when an identity is wired (honest surface).
  if (opts.identity) {
    const identity = opts.identity;
    app.get('/v1/identity', async () => identity);
  }
}
