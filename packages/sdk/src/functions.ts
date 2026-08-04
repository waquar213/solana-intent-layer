/**
 * The boring functional core — one thin function per endpoint over the shared
 * `request` engine. Framework-agnostic and tree-shakeable: import just what you use.
 * plan/authorize/execute are POST (never auto-retried); getPortfolio/getStatus are
 * idempotent GETs (bounded retry).
 */
import { request, type ClientOpts } from './request.js';
import type {
  AuthorizeRequest,
  ExecuteRequest,
  ExecuteResult,
  Identity,
  Permission,
  PlanRequest,
  PlanResponse,
  PortfolioInsights,
  PortfolioSummary,
  StatusResponse,
} from './types.js';

/** Natural language → a verified plan (or clarify / rejected). */
export function plan(utterance: string, opts: ClientOpts = {}): Promise<PlanResponse> {
  const body: PlanRequest = { utterance };
  return request<PlanResponse>('POST', '/v1/intents/plan', opts, body);
}

/** Run a server-issued plan through Risk + Policy → a permission. */
export function authorize(planId: string, opts: ClientOpts & { principalId?: string } = {}): Promise<Permission> {
  const { principalId, ...transport } = opts;
  const body: AuthorizeRequest = principalId !== undefined ? { planId, principalId } : { planId };
  return request<Permission>('POST', '/v1/intents/authorize', transport, body);
}

/** Drive an authorized plan to a terminal execution (the server re-authorizes first). */
export function execute(planId: string, opts: ClientOpts = {}): Promise<ExecuteResult> {
  const body: ExecuteRequest = { planId };
  return request<ExecuteResult>('POST', '/v1/intents/execute', opts, body);
}

/** The wallet's holdings folded into USD values. */
export function getPortfolio(opts: ClientOpts = {}): Promise<PortfolioSummary> {
  return request<PortfolioSummary>('GET', '/v1/portfolio', opts);
}

/** Portfolio intelligence — allocation, concentration, risk/health, insights. */
export function getInsights(opts: ClientOpts = {}): Promise<PortfolioInsights> {
  return request<PortfolioInsights>('GET', '/v1/portfolio/insights', opts);
}

/** The Universal Identity — one account's BTC / EVM / Solana receive addresses. */
export function getIdentity(opts: ClientOpts = {}): Promise<Identity> {
  return request<Identity>('GET', '/v1/identity', opts);
}

/** API liveness / version. */
export function getStatus(opts: ClientOpts = {}): Promise<StatusResponse> {
  return request<StatusResponse>('GET', '/v1/status', opts);
}
