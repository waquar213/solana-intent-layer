/**
 * ProviderPool — multi-endpoint RPC access with health tracking and failover.
 *
 * Selection policy (deliberately deterministic — D9 in memory.md):
 * endpoints are tried in CONFIGURED PRIORITY ORDER (put keyed providers first,
 * public fallbacks last), skipping endpoints that are in failure cooldown.
 * If every endpoint is cooling down, all are tried anyway — a pool must
 * degrade to "best effort", never to "bricked". Latency EWMA is tracked for
 * observability, not for selection, to avoid routing flap.
 *
 * Error contract:
 * - JsonRpcError (a valid error RESPONSE, e.g. revert) → propagated
 *   immediately, no failover: it is deterministic chain state.
 * - ChainError TRANSPORT_FAILED / TIMEOUT / RATE_LIMITED / INVALID_RESPONSE
 *   → endpoint marked unhealthy, next endpoint tried.
 * - ChainError ALL_PROVIDERS_FAILED → every candidate failed this call.
 */
import { ChainError, JsonRpcError } from './errors.js';

export interface JsonRpcTransport {
  /** Redacted display URL (never contains API keys). */
  readonly url: string;
  request(method: string, params: unknown, signal: AbortSignal): Promise<unknown>;
}

export interface ProviderPoolOptions {
  /** Per-attempt timeout. Default 10s. */
  timeoutMs?: number;
  /** How long a failed endpoint is skipped. Default 30s. */
  cooldownMs?: number;
  /** Injectable clock (tests). Default Date.now. */
  now?: () => number;
}

export interface EndpointStats {
  url: string;
  healthy: boolean;
  consecutiveFailures: number;
  /** EWMA of request latency in ms (observability only). */
  ewmaLatencyMs: number | null;
  cooldownUntil: number;
}

interface EndpointState {
  transport: JsonRpcTransport;
  consecutiveFailures: number;
  ewmaLatencyMs: number | null;
  cooldownUntil: number;
}

const EWMA_ALPHA = 0.3;

/**
 * Broadcast methods must NOT be auto-failed-over. A transport failure on a send is ambiguous: the
 * request may have reached the node and entered the mempool before the RESPONSE timed out. Retrying
 * the SAME signed tx on another endpoint is on-chain-idempotent (same nonce/signature → one tx), but
 * it routinely turns a landed broadcast into a confusing "nonce too low / already known" JsonRpcError
 * from the second endpoint — surfacing a FALSE failure for a tx that actually succeeded. So on a
 * transport failure for these, stop and report; the caller can safely retry (re-signing reuses the nonce).
 */
const NON_FAILOVER_METHODS = new Set(['eth_sendRawTransaction', 'eth_sendTransaction', 'sendTransaction']);

export class ProviderPool {
  readonly #endpoints: EndpointState[];
  readonly #timeoutMs: number;
  readonly #cooldownMs: number;
  readonly #now: () => number;

  constructor(transports: JsonRpcTransport[], options: ProviderPoolOptions = {}) {
    if (transports.length === 0) {
      throw new ChainError('TRANSPORT_FAILED', 'ProviderPool requires at least one transport');
    }
    this.#endpoints = transports.map((transport) => ({
      transport,
      consecutiveFailures: 0,
      ewmaLatencyMs: null,
      cooldownUntil: 0,
    }));
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#cooldownMs = options.cooldownMs ?? 30_000;
    this.#now = options.now ?? Date.now;
  }

  async request<T = unknown>(method: string, params: unknown = []): Promise<T> {
    const now = this.#now();
    const healthy = this.#endpoints.filter((e) => e.cooldownUntil <= now);
    const candidates = healthy.length > 0 ? healthy : this.#endpoints;

    const failures: Array<{ url: string; error: unknown }> = [];
    for (const endpoint of candidates) {
      const started = this.#now();
      try {
        const result = await endpoint.transport.request(method, params, AbortSignal.timeout(this.#timeoutMs));
        this.#recordSuccess(endpoint, this.#now() - started);
        return result as T;
      } catch (error) {
        if (error instanceof JsonRpcError) {
          // Deterministic chain answer (revert, bad params, …): the endpoint
          // is healthy — it answered. Do not fail over.
          this.#recordSuccess(endpoint, this.#now() - started);
          throw error;
        }
        this.#recordFailure(endpoint);
        failures.push({ url: endpoint.transport.url, error });
        // A broadcast that fails at the transport may have already landed — do NOT re-send it to
        // another endpoint (see NON_FAILOVER_METHODS). Report this single attempt; retry is the caller's.
        if (NON_FAILOVER_METHODS.has(method)) {
          throw new ChainError(
            'TRANSPORT_FAILED',
            `"${method}" failed at the transport on ${endpoint.transport.url}; not retrying another endpoint — a broadcast that times out may already be in the mempool, and re-sending would risk a misleading duplicate-submit error`,
            { cause: error },
          );
        }
      }
    }

    throw new ChainError(
      'ALL_PROVIDERS_FAILED',
      `"${method}" failed on all ${failures.length} candidate endpoint(s): ${failures.map((f) => f.url).join(', ')}`,
      { cause: failures[failures.length - 1]?.error },
    );
  }

  stats(): EndpointStats[] {
    const now = this.#now();
    return this.#endpoints.map((e) => ({
      url: e.transport.url,
      healthy: e.cooldownUntil <= now,
      consecutiveFailures: e.consecutiveFailures,
      ewmaLatencyMs: e.ewmaLatencyMs,
      cooldownUntil: e.cooldownUntil,
    }));
  }

  #recordSuccess(endpoint: EndpointState, latencyMs: number): void {
    endpoint.consecutiveFailures = 0;
    endpoint.cooldownUntil = 0;
    endpoint.ewmaLatencyMs =
      endpoint.ewmaLatencyMs === null ? latencyMs : endpoint.ewmaLatencyMs * (1 - EWMA_ALPHA) + latencyMs * EWMA_ALPHA;
  }

  #recordFailure(endpoint: EndpointState): void {
    endpoint.consecutiveFailures += 1;
    // Linear backoff capped at 5× — enough to shed a flapping endpoint
    // without exiling it long enough to matter after recovery.
    const multiplier = Math.min(endpoint.consecutiveFailures, 5);
    endpoint.cooldownUntil = this.#now() + this.#cooldownMs * multiplier;
  }
}

/** Strips path and query — keyed RPC URLs embed API keys there; logs must never see them. */
export function redactRpcUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '<invalid-url>';
  }
}

interface JsonRpcResponseShape {
  jsonrpc?: string;
  id?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

/** Standard HTTP JSON-RPC 2.0 transport (EVM chains, Solana). */
export class HttpJsonRpcTransport implements JsonRpcTransport {
  readonly url: string;
  readonly #fullUrl: string;
  readonly #fetch: typeof fetch;
  #nextId = 1;

  constructor(url: string, fetchFn?: typeof fetch) {
    this.#fullUrl = url;
    this.url = redactRpcUrl(url);
    // Default to the global fetch BOUND to its receiver: a bare `fetch` reference,
    // called detached (`this.#fetch(...)`), throws "Illegal invocation" in browsers
    // because window.fetch must run with `this === window`. Node tolerates it; browsers
    // don't. A caller-supplied fetchFn is used as-is (binding it is their job).
    this.#fetch = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async request(method: string, params: unknown, signal: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(this.#fullUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: this.#nextId++, method, params }),
        signal,
      });
    } catch (cause) {
      if (signal.aborted) {
        throw new ChainError('TIMEOUT', `"${method}" timed out against ${this.url}`, { cause });
      }
      throw new ChainError('TRANSPORT_FAILED', `POST to ${this.url} failed`, { cause });
    }
    if (response.status === 429) {
      throw new ChainError('RATE_LIMITED', `${this.url} rate-limited the request`);
    }
    if (!response.ok) {
      throw new ChainError('TRANSPORT_FAILED', `HTTP ${response.status} from ${this.url}`);
    }
    let body: JsonRpcResponseShape;
    try {
      body = (await response.json()) as JsonRpcResponseShape;
    } catch (cause) {
      throw new ChainError('INVALID_RESPONSE', `non-JSON body from ${this.url}`, { cause });
    }
    if (body.error !== undefined && body.error !== null) {
      throw new JsonRpcError(body.error.code ?? -32000, body.error.message ?? 'unknown RPC error', body.error.data);
    }
    if (!('result' in body)) {
      throw new ChainError('INVALID_RESPONSE', `JSON-RPC response from ${this.url} has neither result nor error`);
    }
    return body.result;
  }
}
