/**
 * The mobile app's data layer — a thin typed fetch client over the Intent Wallet `/v1` API
 * (the same endpoints the web app + SDK use). The SIWE session token (when signed in) is
 * attached to every request as a Bearer credential, resolved FRESH per call so a sign-in /
 * sign-out / expiry is always reflected. Errors surface the server's problem+json `detail`.
 */
import { API_BASE } from './config';
import { activeSessionToken } from './auth';
import type { ExecuteResult, Identity, Permission, PlanResponse, PortfolioInsights, PortfolioSummary } from './types';

interface ProblemLike {
  detail?: string;
}

/**
 * fetch with a hard timeout — a hung request rejects instead of leaving a spinner spinning forever.
 * Two failure shapes are mapped to friendly, actionable messages (both retryable):
 *  - AbortError: the request took longer than `ms`.
 *  - a raw fetch rejection (RN's "Network request failed" / TypeError): the wallet service is
 *    unreachable — the exact case where the local API isn't running and chat "just doesn't work".
 * Shared by every request in this module.
 */
export async function timedFetch(input: string, init: RequestInit = {}, ms = 20_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Request timed out — check your connection and try again.');
    throw new Error("Can't reach the wallet service. Check your connection and try again.");
  } finally {
    clearTimeout(t);
  }
}

/** One typed request. Attaches the Bearer token, throws Error(detail) on a non-2xx. */
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = activeSessionToken(); // account-bound: never send another/prior account's token (wrong principal)
  const res = await timedFetch(`${API_BASE}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as ProblemLike;
    throw new Error(problem.detail ?? `Request failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

/** Natural language → a plan (or clarify / rejected). */
export function planIntent(utterance: string): Promise<PlanResponse> {
  return req<PlanResponse>('POST', '/v1/intents/plan', { utterance });
}

/** Run a plan through Risk + Policy → a permission. */
export function authorizeIntent(planId: string): Promise<Permission> {
  return req<Permission>('POST', '/v1/intents/authorize', { planId });
}

/** Drive an authorized plan to a terminal execution. */
export function executeIntent(planId: string): Promise<ExecuteResult> {
  return req<ExecuteResult>('POST', '/v1/intents/execute', { planId });
}

/** The wallet's holdings folded into USD values. */
export function getPortfolio(): Promise<PortfolioSummary> {
  return req<PortfolioSummary>('GET', '/v1/portfolio');
}

/** Portfolio intelligence (allocation / risk / health / insights), or null if unavailable. */
export async function getInsights(): Promise<PortfolioInsights | null> {
  try {
    return await req<PortfolioInsights>('GET', '/v1/portfolio/insights');
  } catch {
    return null;
  }
}

/** The Universal Identity — BTC / EVM / Solana receive addresses (server-derived), or null. */
export async function getIdentity(): Promise<Identity | null> {
  try {
    return await req<Identity>('GET', '/v1/identity');
  } catch {
    return null;
  }
}

/** Is the API reachable? Used for the connection indicator. */
export async function apiHealthy(): Promise<boolean> {
  try {
    await req<unknown>('GET', '/v1/status');
    return true;
  } catch {
    return false;
  }
}

export interface HistoryItem {
  hash: string;
  from: string;
  to: string;
  valueWei: string;
  timeStamp: number;
  failed: boolean;
}

/** The connected wallet's recent EVM (Sepolia) transactions, newest first (empty on error). */
export async function fetchEvmHistory(address: string, limit = 15): Promise<HistoryItem[]> {
  try {
    const res = await timedFetch(`${API_BASE}/v1/history/evm?address=${encodeURIComponent(address.trim())}&limit=${limit}`);
    if (!res.ok) return [];
    const body = (await res.json()) as { items?: HistoryItem[] };
    return Array.isArray(body.items) ? body.items : [];
  } catch {
    return [];
  }
}

export interface BalanceHoldingDto {
  symbol: string;
  amount: string;
  decimals: number;
  chains: { chainId: string; base: string }[];
  priceUsd: string | null;
  valueMicros: string | null;
}
export interface BalancesDto {
  holdings: BalanceHoldingDto[];
  totalValueMicros: string;
  /** Value split by ecosystem (micro-USD strings). */
  byEcosystem?: { evm: string; bitcoin: string; solana: string };
  /** Requested ecosystems whose data couldn't be fetched — excluded from the total. */
  unavailable?: string[];
}

/**
 * Real cross-ecosystem holdings (EVM multi-chain + BTC + SOL) for the given PUBLIC addresses,
 * valued live. Read-only; discovers whatever addresses are provided.
 */
export async function fetchBalances(addrs: { evm?: string; btc?: string; sol?: string }): Promise<BalancesDto> {
  const res = await timedFetch(`${API_BASE}/v1/portfolio/balances`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(addrs),
  });
  if (!res.ok) throw new Error(`balances lookup failed (HTTP ${res.status})`);
  return (await res.json()) as BalancesDto;
}

/** Resolve an ENS name (`name.eth`) to an EVM address via the API — null if unresolvable. */
export async function resolveEnsName(name: string): Promise<string | null> {
  try {
    const res = await timedFetch(`${API_BASE}/v1/resolve/ens?name=${encodeURIComponent(name.trim())}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: string | null };
    return body.address ?? null;
  } catch {
    return null;
  }
}
