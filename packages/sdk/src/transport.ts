/**
 * The injectable HTTP seam. `TransportFetch` deliberately mirrors the global `fetch`
 * signature so the default is a zero-adapter passthrough, yet any runtime (a test's
 * in-memory table, a proxy, an auth-injecting wrapper) can supply its own. The SDK
 * sets no auth headers itself — a caller adds Authorization/logging by wrapping fetch.
 *
 * Timeouts race the request against a deadline (so even a transport that ignores the
 * AbortSignal still times out). Retries are BOUNDED and gated to idempotent GETs by
 * the request layer — a POST (plan/authorize/execute) is never auto-retried.
 */
import { ApiError, isApiError, timeoutError } from './errors.js';

export interface TransportFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface TransportFetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type TransportFetch = (input: string, init?: TransportFetchInit) => Promise<TransportFetchResponse>;

/** Pick the injected transport, else the global fetch; fail loudly if neither exists. */
export function resolveTransport(fetchImpl?: TransportFetch): TransportFetch {
  if (fetchImpl) return fetchImpl;
  const g = (globalThis as { fetch?: unknown }).fetch;
  if (typeof g === 'function') return g as TransportFetch;
  throw new ApiError({
    code: 'INTERNAL',
    status: 0,
    type: 'https://errors.intentwallet.xyz/INTERNAL',
    title: 'INTERNAL',
    detail: 'no fetch transport available — pass { fetch } to the client',
  });
}

/**
 * Run `work` with a deadline. An AbortController lets a well-behaved transport cancel
 * in flight; the Promise.race guarantees rejection even if the transport ignores the
 * signal. Rejects with a typed TIMEOUT ApiError.
 */
export async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutError(timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(controller.signal), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Retryable = a transport failure or a transient 429/502/503/504. Never a 4xx. */
export function isRetryable(err: unknown): boolean {
  if (!isApiError(err)) return false;
  if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') return true;
  return err.status === 429 || err.status === 502 || err.status === 503 || err.status === 504;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Bounded exponential backoff (50ms·2ⁿ, capped 1s). Only ever called for GETs. */
export async function withRetry<T>(run: () => Promise<T>, retries: number): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isRetryable(err)) throw err;
      await sleep(Math.min(1000, 50 * 2 ** (attempt - 1)));
    }
  }
}
