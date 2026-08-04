import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createClient,
  getStatus,
  isApiError,
  toResult,
  type ExecuteResult,
  type Permission,
  type PlanResponse,
  type PortfolioSummary,
  type ProblemDetails,
  type StatusResponse,
  type TransportFetch,
  type TransportFetchResponse,
} from '../src/index.js';

// ── Fixtures (wire-exact; money stays a decimal string) ──────────────────────
const PLAN: PlanResponse = {
  intentKind: 'transfer',
  outcome: {
    kind: 'plan',
    plan: {
      planId: 'plan-1',
      intentKind: 'transfer',
      assets: ['ETH'],
      steps: [{ seq: 0, kind: 'transfer', chainId: 'eip155:1', description: 'send' }],
      quote: {
        youSend: { symbol: 'ETH', base: '100000000000000000', decimals: 18, valueMicros: '200000000' },
        youReceiveMin: null,
        totalFeeMicros: '500000',
        feePct: 0.25,
        slippageBps: 0,
        etaSeconds: 60,
      },
      risk: { level: 'low', reasons: [] },
      requiresStepUp: false,
      confirmation: 'Send 0.1 ETH',
      fallback: 'nothing moves',
      rollback: null,
    },
  },
};
const PERMISSION: Permission = {
  gate: 'allow',
  mayProceedToSign: true,
  drivenBy: ['risk', 'policy'],
  reasons: ['authorized'],
  requirements: [],
  riskLevel: 'low',
  planId: 'plan-1',
  intentId: 'intent-1',
};
const EXEC_OK: ExecuteResult = {
  executed: true,
  permission: PERMISSION,
  execution: {
    id: 'exec-1',
    planId: 'plan-1',
    status: 'completed',
    steps: [{ seq: 0, kind: 'transfer', chainId: 'eip155:1', status: 'confirmed', txid: '0xtx0' }],
    fundsLocation: { chainId: 'eip155:1', note: 'Funds are on eip155:1.' },
  },
};
const STATUS: StatusResponse = { service: 'intent-wallet-api', apiVersion: 'v1', status: 'operational' };
const PORTFOLIO: PortfolioSummary = {
  totalValueMicros: '4000000000',
  holdings: [{ symbol: 'ETH', amount: '2', priceUsd: '2000', valueMicros: '4000000000' }],
};

// ── Fake transport helpers (no network) ──────────────────────────────────────
const ok = (body: unknown): TransportFetchResponse => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  text: () => Promise.resolve(JSON.stringify(body)),
  json: () => Promise.resolve(body),
});
const problem = (status: number, code: string, detail: string): TransportFetchResponse => {
  const body: ProblemDetails = { type: `x/${code}`, title: code, status, code, detail };
  return {
    ok: false,
    status,
    headers: { get: () => 'application/problem+json' },
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  };
};
const stripOrigin = (url: string): string => url.replace(/^https?:\/\/[^/]+/u, '');

interface Call {
  path: string;
  method: string;
  body: unknown;
}
function routed(table: Record<string, TransportFetchResponse>): { transport: TransportFetch; calls: Call[] } {
  const calls: Call[] = [];
  const transport: TransportFetch = (url, init) => {
    const path = stripOrigin(url);
    calls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined });
    const res = table[`${init?.method ?? 'GET'} ${path}`];
    return res ? Promise.resolve(res) : Promise.reject(new Error(`no fake route for ${init?.method} ${path}`));
  };
  return { transport, calls };
}

// ── The full loop over a fake transport ──────────────────────────────────────
describe('IntentClient — the full loop, no network', () => {
  it('walks plan → authorize → execute with wire-exact paths and bodies', async () => {
    const { transport, calls } = routed({
      'POST /v1/intents/plan': ok(PLAN),
      'POST /v1/intents/authorize': ok(PERMISSION),
      'POST /v1/intents/execute': ok(EXEC_OK),
    });
    const client = createClient({ fetch: transport });

    const handle = await client.plan('send 0.1 ETH to 0x1111');
    expect(handle.outcome.kind).toBe('plan');
    expect(handle.planId).toBe('plan-1');
    if (handle.outcome.kind === 'plan') {
      expect(handle.outcome.plan.quote.youSend.valueMicros).toBe('200000000'); // money stays a string
    }

    const perm = await handle.authorize();
    expect(perm.mayProceedToSign).toBe(true);
    const exec = await handle.execute();
    expect(exec.executed).toBe(true);
    expect(exec.execution?.status).toBe('completed');

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /v1/intents/plan',
      'POST /v1/intents/authorize',
      'POST /v1/intents/execute',
    ]);
    expect(calls[0]?.body).toEqual({ utterance: 'send 0.1 ETH to 0x1111' });
    expect(calls[1]?.body).toEqual({ planId: 'plan-1' });
    expect(calls[2]?.body).toEqual({ planId: 'plan-1' });
  });

  it('preserves decimal-string money end to end (no numeric coercion)', async () => {
    const { transport } = routed({ 'GET /v1/portfolio': ok(PORTFOLIO) });
    const p = await createClient({ fetch: transport }).portfolio();
    expect(p.totalValueMicros).toBe('4000000000');
    expect(typeof p.totalValueMicros).toBe('string');
    expect(p.holdings[0]?.priceUsd).toBe('2000');
  });

  it('an empty baseUrl produces same-origin relative paths (browser + proxy)', async () => {
    const { transport, calls } = routed({ 'GET /v1/status': ok(STATUS) });
    await createClient({ baseUrl: '', fetch: transport }).status();
    expect(calls[0]?.path).toBe('/v1/status'); // not "undefined/v1/status"
  });

  it('fetches the Universal Identity (BTC / EVM / Solana addresses)', async () => {
    const identity = {
      index: 0,
      evm: { address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94', path: "m/44'/60'/0'/0/0" },
      btc: { address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', path: "m/84'/0'/0'/0/0" },
      sol: { address: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk', path: "m/44'/501'/0'/0'" },
    };
    const { transport } = routed({ 'GET /v1/identity': ok(identity) });
    const id = await createClient({ fetch: transport }).identity();
    expect(id.evm.address).toMatch(/^0x/u);
    expect(id.btc.path).toContain("84'");
    expect(id.sol.path).toContain("501'");
  });

  it('a non-plan outcome exposes the discriminant and refuses authorize/execute', async () => {
    const clarify: PlanResponse = { intentKind: 'transfer', outcome: { kind: 'clarify', question: 'Who?' } };
    const { transport } = routed({ 'POST /v1/intents/plan': ok(clarify) });
    const handle = await createClient({ fetch: transport }).plan('send to nobody');
    expect(handle.outcome.kind).toBe('clarify');
    expect(handle.planId).toBeUndefined();
    await expect(handle.authorize()).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(handle.execute()).rejects.toBeInstanceOf(ApiError);
  });

  it('surfaces a refused execution (server re-authorization said no)', async () => {
    const refused: ExecuteResult = { executed: false, permission: { ...PERMISSION, gate: 'block', mayProceedToSign: false } };
    const { transport } = routed({ 'POST /v1/intents/execute': ok(refused) });
    const r = await createClient({ fetch: transport }).execute('plan-9');
    expect(r.executed).toBe(false);
    expect(r.execution).toBeUndefined();
    expect(r.permission.mayProceedToSign).toBe(false);
  });
});

// ── Typed errors ─────────────────────────────────────────────────────────────
describe('errors — problem+json → typed ApiError', () => {
  it('maps an expired planId (404) to ApiError code NOT_FOUND', async () => {
    const { transport } = routed({ 'POST /v1/intents/authorize': problem(404, 'NOT_FOUND', "no such plan 'plan-x'") });
    const client = createClient({ fetch: transport });
    await expect(client.authorize('plan-x')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    const res = await client.safe.authorize('plan-x');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(isApiError(res.error)).toBe(true);
      expect(res.error.code).toBe('NOT_FOUND');
      expect(res.error.detail).toMatch(/no such plan/i);
    }
  });

  it('a transport rejection becomes ApiError NETWORK_ERROR (status 0)', async () => {
    const transport: TransportFetch = () => Promise.reject(new Error('connection refused'));
    await expect(getStatus({ fetch: transport })).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('a hung transport times out with ApiError TIMEOUT', async () => {
    const transport: TransportFetch = () => new Promise<TransportFetchResponse>(() => {}); // never resolves
    const r = await toResult(getStatus({ fetch: transport, timeoutMs: 20 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('TIMEOUT');
  });

  it('tolerates a non-JSON error body (generic ApiError, no crash)', async () => {
    const html: TransportFetchResponse = {
      ok: false,
      status: 502,
      headers: { get: () => 'text/html' },
      text: () => Promise.resolve('<html>bad gateway</html>'),
      json: () => Promise.reject(new Error('not json')),
    };
    const transport: TransportFetch = () => Promise.resolve(html);
    await expect(createClient({ fetch: transport }).portfolio()).rejects.toMatchObject({ code: 'INTERNAL', status: 502 });
  });
});

// ── Retry semantics (idempotent GET only) ────────────────────────────────────
describe('retry — bounded, idempotent GETs only', () => {
  it('retries a flaky GET then succeeds', async () => {
    let n = 0;
    const transport: TransportFetch = () => {
      n += 1;
      return n < 3 ? Promise.reject(new Error('flaky')) : Promise.resolve(ok(STATUS));
    };
    const s = await getStatus({ fetch: transport, retryCount: 3 });
    expect(s.status).toBe('operational');
    expect(n).toBe(3); // two failures + one success
  });

  it('NEVER retries a POST (plan/execute are non-idempotent)', async () => {
    const transport = vi.fn<TransportFetch>(() => Promise.resolve(problem(503, 'UPSTREAM_FAILED', 'busy')));
    await expect(createClient({ fetch: transport }).execute('plan-1')).rejects.toMatchObject({ status: 503 });
    expect(transport).toHaveBeenCalledTimes(1); // no retry despite a retryable 503
  });
});

// ── Auth token — attached as Bearer, resolved fresh per request ───────────────
describe('authToken', () => {
  /** A transport that records the Authorization header of each call. */
  function authCapturing(): { transport: TransportFetch; auth: (string | undefined)[] } {
    const auth: (string | undefined)[] = [];
    const transport: TransportFetch = (_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      auth.push(headers['authorization']);
      return Promise.resolve(ok(STATUS));
    };
    return { transport, auth };
  }

  it('attaches a static token as `Authorization: Bearer <token>`', async () => {
    const { transport, auth } = authCapturing();
    await createClient({ fetch: transport, authToken: 'tok-abc' }).status();
    expect(auth).toEqual(['Bearer tok-abc']);
  });

  it('sends no Authorization header when no token is configured', async () => {
    const { transport, auth } = authCapturing();
    await createClient({ fetch: transport }).status();
    expect(auth).toEqual([undefined]);
  });

  it('reads a resolver FRESH each request (sign-in then sign-out)', async () => {
    const { transport, auth } = authCapturing();
    let token: string | null = null;
    const client = createClient({ fetch: transport, authToken: () => token });
    await client.status(); // signed out
    token = 'tok-live';
    await client.status(); // signed in
    token = null;
    await client.status(); // signed out again
    expect(auth).toEqual([undefined, 'Bearer tok-live', undefined]);
  });
});
