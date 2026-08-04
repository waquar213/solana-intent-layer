/**
 * The fluent convenience layer over the functional core — bind the config once and
 * walk the loop: `const h = await client.plan(utterance); if (h.planId) { await
 * h.authorize(); await h.execute(); }`. A `PlanHandle` carries the discriminated
 * outcome plus, when it IS a plan, its `planId` and chained `.authorize()` / `.execute()`.
 * Calling those on a non-plan outcome rejects with a typed ApiError rather than
 * silently guessing. `.safe.*` mirrors every method as a non-throwing `Result`.
 */
import { ApiError } from './errors.js';
import {
  authorize as fnAuthorize,
  execute as fnExecute,
  getIdentity,
  getInsights,
  getPortfolio,
  getStatus,
  plan as fnPlan,
} from './functions.js';
import { toResult, type Result } from './result.js';
import type { ClientOpts } from './request.js';
import type {
  ExecuteResult,
  Identity,
  Outcome,
  Permission,
  PlanResponse,
  PortfolioInsights,
  PortfolioSummary,
  StatusResponse,
} from './types.js';

export type ClientConfig = ClientOpts;

export interface PlanHandle {
  /** The raw plan response. */
  response: PlanResponse;
  /** The discriminated outcome — branch on `.kind`. */
  outcome: Outcome;
  /** Present only when `outcome.kind === 'plan'`. */
  planId?: string;
  /** Authorize this plan. Rejects (BAD_REQUEST) if the outcome is not a plan. */
  authorize(principalId?: string): Promise<Permission>;
  /** Execute this plan. Rejects (BAD_REQUEST) if the outcome is not a plan. */
  execute(): Promise<ExecuteResult>;
}

export interface IntentClient {
  plan(utterance: string): Promise<PlanHandle>;
  authorize(planId: string, principalId?: string): Promise<Permission>;
  execute(planId: string): Promise<ExecuteResult>;
  portfolio(): Promise<PortfolioSummary>;
  insights(): Promise<PortfolioInsights>;
  identity(): Promise<Identity>;
  status(): Promise<StatusResponse>;
  /** Non-throwing mirror: each call resolves to a `Result<T>` instead of throwing. */
  safe: {
    plan(utterance: string): Promise<Result<PlanHandle>>;
    authorize(planId: string, principalId?: string): Promise<Result<Permission>>;
    execute(planId: string): Promise<Result<ExecuteResult>>;
    portfolio(): Promise<Result<PortfolioSummary>>;
    insights(): Promise<Result<PortfolioInsights>>;
    identity(): Promise<Result<Identity>>;
    status(): Promise<Result<StatusResponse>>;
  };
}

function notAPlan(kind: string, verb: string): ApiError {
  return new ApiError({
    code: 'BAD_REQUEST',
    status: 0,
    type: 'https://errors.intentwallet.xyz/BAD_REQUEST',
    title: 'BAD_REQUEST',
    detail: `cannot ${verb} a '${kind}' outcome — only a 'plan' can be authorized or executed`,
  });
}

export function createClient(config: ClientConfig = {}): IntentClient {
  const opts: ClientOpts = config;

  const authorizeById = (planId: string, principalId?: string): Promise<Permission> =>
    fnAuthorize(planId, principalId !== undefined ? { ...opts, principalId } : opts);

  const toHandle = (response: PlanResponse): PlanHandle => {
    const planId = response.outcome.kind === 'plan' ? response.outcome.plan.planId : undefined;
    return {
      response,
      outcome: response.outcome,
      ...(planId !== undefined ? { planId } : {}),
      authorize: (principalId) =>
        planId !== undefined
          ? authorizeById(planId, principalId)
          : Promise.reject(notAPlan(response.outcome.kind, 'authorize')),
      execute: () =>
        planId !== undefined ? fnExecute(planId, opts) : Promise.reject(notAPlan(response.outcome.kind, 'execute')),
    };
  };

  const client: IntentClient = {
    plan: (utterance) => fnPlan(utterance, opts).then(toHandle),
    authorize: (planId, principalId) => authorizeById(planId, principalId),
    execute: (planId) => fnExecute(planId, opts),
    portfolio: () => getPortfolio(opts),
    insights: () => getInsights(opts),
    identity: () => getIdentity(opts),
    status: () => getStatus(opts),
    safe: {
      plan: (utterance) => toResult(client.plan(utterance)),
      authorize: (planId, principalId) => toResult(client.authorize(planId, principalId)),
      execute: (planId) => toResult(client.execute(planId)),
      portfolio: () => toResult(client.portfolio()),
      insights: () => toResult(client.insights()),
      identity: () => toResult(client.identity()),
      status: () => toResult(client.status()),
    },
  };
  return client;
}
