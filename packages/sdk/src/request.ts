/**
 * The single low-level request engine every public call delegates to. It builds the
 * URL, JSON-encodes the body, applies a timeout, reads the response, and on a non-2xx
 * turns the RFC 9457 problem+json body into a typed `ApiError`. Retry is applied ONLY
 * to idempotent GETs — a POST (plan mutates the server-side plan cache; execute is
 * non-idempotent) is never auto-retried, so a flaky network can't double-plan or
 * double-execute.
 */
import { apiErrorFromResponse, isApiError, networkError } from './errors.js';
import { resolveTransport, withRetry, withTimeout, type TransportFetch, type TransportFetchResponse } from './transport.js';

export interface ClientOpts {
  /** API base URL. Default `http://localhost:8080`; pass `''` for same-origin (browser + proxy). */
  baseUrl?: string;
  /** Injected transport; defaults to the global `fetch`. */
  fetch?: TransportFetch;
  /** Per-request timeout in ms (default 30000). */
  timeoutMs?: number;
  /** Max retries for idempotent GETs (default 3). */
  retryCount?: number;
  /**
   * Bearer session token attached as `Authorization: Bearer <token>` on every
   * request. A resolver (`() => …`) is read FRESH per request, so a token that is
   * issued, refreshed, or cleared (sign-out) after the client is created is always
   * current — the client is bound once but the credential is not. Falsy → no header.
   */
  authToken?: string | (() => string | null | undefined);
}

/** Resolve the caller's auth token at request time (static value or per-call resolver). */
function resolveAuthToken(authToken: ClientOpts['authToken']): string | undefined {
  const token = typeof authToken === 'function' ? authToken() : authToken;
  return token ? token : undefined;
}

const DEFAULT_BASE_URL = 'http://localhost:8080';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_COUNT = 3;

/** Join base + path. An empty baseUrl yields a same-origin relative path (`/v1/...`). */
function buildUrl(baseUrl: string | undefined, path: string): string {
  const base = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, '');
  return `${base}${path}`;
}

/** Read a non-2xx response into a typed ApiError, tolerating a non-JSON body. */
async function readError(res: TransportFetchResponse): Promise<never> {
  const raw = await res.text().catch(() => '');
  let body: unknown;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = undefined;
    }
  }
  throw apiErrorFromResponse(res.status, body);
}

export async function request<T>(method: string, path: string, opts: ClientOpts, body?: unknown): Promise<T> {
  const transport = resolveTransport(opts.fetch);
  const url = buildUrl(opts.baseUrl, path);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const attempt = (): Promise<T> =>
    withTimeout(async (signal) => {
      // Resolved per attempt so a token refreshed between retries is picked up.
      const token = resolveAuthToken(opts.authToken);
      let res: TransportFetchResponse;
      try {
        res = await transport(url, {
          method,
          headers: {
            accept: 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal,
        });
      } catch (err) {
        // A timeout ApiError (from withTimeout) propagates as-is; anything else the
        // transport threw is a network failure.
        if (isApiError(err)) throw err;
        throw networkError(err instanceof Error ? err.message : 'network request failed');
      }
      if (!res.ok) await readError(res);
      // Guard the SUCCESS parse too: a 2xx with an empty (204) or non-JSON body (a gateway/proxy 200
      // HTML error page, a truncated response) would otherwise throw a RAW SyntaxError — which sits
      // outside this function's ApiError contract, so `toResult`/`safe.*` would re-throw it instead of
      // returning ok:false. Re-throw a typed ApiError so the non-throwing wrappers stay non-throwing.
      const raw = await res.text().catch(() => '');
      try {
        return (raw ? JSON.parse(raw) : undefined) as T;
      } catch {
        throw apiErrorFromResponse(res.status, undefined);
      }
    }, timeoutMs);

  // POSTs are non-idempotent — never auto-retried. Idempotent GETs get bounded retry.
  if (method !== 'GET') return attempt();
  return withRetry(attempt, opts.retryCount ?? DEFAULT_RETRY_COUNT);
}
