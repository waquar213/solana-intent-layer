/**
 * OpenAPI 3.1 document generation. Paths are still INTROSPECTED from Fastify's
 * registered routes (via `onRoute`) so the spec can never claim an endpoint that
 * isn't mounted — but each known operation is now enriched with real request/response
 * schemas, the RFC 9457 problem+json error shape, and a Bearer security scheme. That
 * makes the spec usable for typed client generation + contract tests, not just a
 * route listing. Unknown routes still fall back to an honest skeleton.
 */
import type { FastifyInstance } from 'fastify';

const HIDDEN_METHODS = new Set(['HEAD', 'OPTIONS']);

/** A JSON-Schema `$ref` into components.schemas. */
const ref = (name: string): { $ref: string } => ({ $ref: `#/components/schemas/${name}` });
/** A JSON request body of the given component schema. */
const body = (name: string): Record<string, unknown> => ({
  required: true,
  content: { 'application/json': { schema: ref(name) } },
});
/** A 200 JSON response of the given component schema. */
const ok = (name: string): Record<string, unknown> => ({
  description: 'OK',
  content: { 'application/json': { schema: ref(name) } },
});
/** The shared problem+json error response. */
const problem = { description: 'Error', content: { 'application/problem+json': { schema: ref('ProblemDetails') } } };
const BEARER = [{ bearerAuth: [] }];

const COMPONENTS = {
  securitySchemes: {
    bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'SIWE-issued HS256 session token.' },
  },
  schemas: {
    ProblemDetails: {
      type: 'object',
      description: 'RFC 9457 problem+json.',
      properties: {
        type: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'integer' },
        code: { type: 'string' },
        detail: { type: 'string' },
        instance: { type: 'string' },
      },
      required: ['title', 'status', 'code'],
    },
    StatusResponse: {
      type: 'object',
      properties: { service: { type: 'string' }, apiVersion: { type: 'string' }, status: { type: 'string' } },
      required: ['service', 'apiVersion', 'status'],
    },
    NonceRequest: {
      type: 'object',
      properties: { address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' } },
      required: ['address'],
    },
    NonceResponse: {
      type: 'object',
      properties: { message: { type: 'string' }, nonce: { type: 'string' }, expiresAt: { type: 'integer' } },
      required: ['message', 'nonce', 'expiresAt'],
    },
    VerifyRequest: {
      type: 'object',
      properties: { message: { type: 'string' }, signature: { type: 'string' } },
      required: ['message', 'signature'],
    },
    VerifyResponse: {
      type: 'object',
      properties: { token: { type: 'string' }, address: { type: 'string' }, expiresAt: { type: 'integer' } },
      required: ['token', 'address', 'expiresAt'],
    },
    Me: {
      type: 'object',
      properties: { address: { type: 'string' }, scopes: { type: 'array', items: { type: 'string' } } },
      required: ['address', 'scopes'],
    },
    PlanRequest: {
      type: 'object',
      properties: { utterance: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['utterance'],
    },
    PlanResponse: {
      type: 'object',
      description: 'The intent kind plus a discriminated outcome (plan | clarify | answer | automation | rejected).',
      properties: { intentKind: { type: 'string' }, outcome: { type: 'object', properties: { kind: { type: 'string' } }, required: ['kind'] } },
      required: ['intentKind', 'outcome'],
    },
    AuthorizeRequest: {
      // Only planId — the principal is ALWAYS the authenticated subject, never a client claim. The server
      // schema (AuthorizeRequestSchema) accepts no `principalId`, so advertising one here was misleading
      // published-contract drift (a client could think it were honored).
      type: 'object',
      properties: { planId: { type: 'string' } },
      required: ['planId'],
    },
    Permission: {
      type: 'object',
      properties: {
        gate: { type: 'string' },
        mayProceedToSign: { type: 'boolean' },
        drivenBy: { type: 'string' },
        reasons: { type: 'array', items: { type: 'string' } },
        riskLevel: { type: 'string' },
      },
      required: ['gate', 'mayProceedToSign'],
    },
    ExecuteRequest: { type: 'object', properties: { planId: { type: 'string' } }, required: ['planId'] },
    ExecuteResult: {
      type: 'object',
      properties: { executed: { type: 'boolean' }, permission: ref('Permission'), execution: { type: 'object' } },
      required: ['executed'],
    },
    PortfolioSummary: { type: 'object', description: 'Holdings folded into USD values (money as decimal strings).' },
    PortfolioIntelligence: {
      type: 'object',
      description: 'Full analytics: net worth, allocation, concentration, performance, risk/health, insights (µUSD as decimal strings).',
      properties: {
        identityId: { type: 'string' },
        asOf: { type: 'string' },
        netWorthMicros: { type: 'string' },
        positionCount: { type: 'integer' },
        allocation: { type: 'object' },
        concentration: { type: 'object' },
        performance: { type: 'object' },
        risk: { type: 'object' },
        insights: { type: 'array', items: { type: 'object' } },
        stale: { type: 'boolean' },
      },
      required: ['identityId', 'asOf', 'netWorthMicros', 'allocation', 'risk', 'insights', 'stale'],
    },
    Identity: {
      type: 'object',
      properties: {
        index: { type: 'integer' },
        evm: { type: 'object' },
        btc: { type: 'object' },
        sol: { type: 'object' },
      },
      required: ['index', 'evm', 'btc', 'sol'],
    },
  },
} as const;

/** Per-operation detail keyed by `METHOD url`. Routes not listed get a generic skeleton. */
const OPERATIONS: Record<string, Record<string, unknown>> = {
  'GET /v1/status': { tags: ['meta'], summary: 'Liveness/version probe.', responses: { '200': ok('StatusResponse') } },
  'POST /v1/auth/nonce': { tags: ['auth'], summary: 'Issue a one-time SIWE challenge for an address.', requestBody: body('NonceRequest'), responses: { '200': ok('NonceResponse'), '400': problem, '429': problem } },
  'POST /v1/auth/verify': { tags: ['auth'], summary: 'Verify a signed challenge → issue a session token.', requestBody: body('VerifyRequest'), responses: { '200': ok('VerifyResponse'), '400': problem, '401': problem, '429': problem } },
  'GET /v1/me': { tags: ['auth'], summary: 'The authenticated session identity.', security: BEARER, responses: { '200': ok('Me'), '401': problem } },
  'POST /v1/me/logout': { tags: ['auth'], summary: 'Revoke the current session.', security: BEARER, responses: { '204': { description: 'No Content' }, '401': problem } },
  'POST /v1/me/logout-all': { tags: ['auth'], summary: 'Revoke every session for the subject.', security: BEARER, responses: { '204': { description: 'No Content' }, '401': problem } },
  'POST /v1/intents/plan': { tags: ['intents'], summary: 'Natural language → a verified ExecutionPlan (PROPOSE).', security: BEARER, requestBody: body('PlanRequest'), responses: { '200': ok('PlanResponse'), '400': problem, '401': problem } },
  'POST /v1/intents/authorize': { tags: ['intents'], summary: 'Run a plan through Risk + Policy → a permission (AUTHORIZE).', security: BEARER, requestBody: body('AuthorizeRequest'), responses: { '200': ok('Permission'), '401': problem, '404': problem } },
  'POST /v1/intents/execute': { tags: ['intents'], summary: 'Drive an authorized plan to a terminal execution (DISPOSE).', security: BEARER, requestBody: body('ExecuteRequest'), responses: { '200': ok('ExecuteResult'), '401': problem, '404': problem } },
  'GET /v1/portfolio': { tags: ['intents'], summary: 'Holdings folded into USD values.', security: BEARER, responses: { '200': ok('PortfolioSummary'), '401': problem } },
  'GET /v1/portfolio/insights': { tags: ['intents'], summary: 'Portfolio intelligence: allocation, concentration, risk/health, insights.', security: BEARER, responses: { '200': ok('PortfolioIntelligence'), '401': problem } },
  'GET /v1/identity': { tags: ['identity'], summary: 'The Universal Identity (BTC/EVM/SOL receive addresses).', responses: { '200': ok('Identity') } },
};

function operationFor(method: string, url: string): Record<string, unknown> {
  const detail = OPERATIONS[`${method} ${url}`];
  if (detail) return detail;
  // Honest skeleton for anything not curated (health, metrics, openapi, …).
  return { summary: `${method} ${url}`, responses: { '200': { description: 'OK' }, default: problem } };
}

function collectPaths(routes: Array<{ method: string | string[]; url: string }>): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const operations = (paths[route.url] ??= {});
    for (const method of methods) {
      if (HIDDEN_METHODS.has(method)) continue;
      operations[method.toLowerCase()] = operationFor(method, route.url);
    }
  }
  return paths;
}

/** Registers `GET /v1/openapi.json`, served from routes captured via `onRoute`. */
export function registerOpenApiRoute(app: FastifyInstance): void {
  const routes: Array<{ method: string | string[]; url: string }> = [];
  app.addHook('onRoute', (route) => {
    routes.push({ method: route.method, url: route.url });
  });
  app.get('/v1/openapi.json', async () => ({
    openapi: '3.1.0' as const,
    info: { title: 'Intent Wallet API', version: 'v1' },
    components: COMPONENTS,
    paths: collectPaths(routes),
  }));
}
