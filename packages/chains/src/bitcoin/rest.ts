/**
 * RestTransport — a small HTTP client for esplora-style REST APIs (Blockstream /
 * mempool.space), the sibling of HttpJsonRpcTransport for chains that speak REST
 * rather than JSON-RPC (Bitcoin). It mirrors the transport's error taxonomy
 * (TIMEOUT / RATE_LIMITED / TRANSPORT_FAILED / INVALID_RESPONSE) and redacts the
 * base URL in errors so it composes with the same failover semantics.
 */
import { ChainError } from '../errors.js';
import { redactRpcUrl } from '../provider.js';

export interface RestTransport {
  readonly baseUrl: string;
  getJson<T>(path: string, signal: AbortSignal): Promise<T>;
  getText(path: string, signal: AbortSignal): Promise<string>;
  postText(path: string, body: string, signal: AbortSignal): Promise<string>;
}

export class HttpRestTransport implements RestTransport {
  readonly baseUrl: string;
  readonly #root: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, fetchFn?: typeof fetch) {
    this.#root = baseUrl.replace(/\/+$/u, '');
    this.baseUrl = redactRpcUrl(baseUrl);
    // Bind to globalThis: browsers throw "Illegal invocation" if window.fetch is
    // called detached from window (Node tolerates a bare reference).
    this.#fetch = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async getJson<T>(path: string, signal: AbortSignal): Promise<T> {
    const res = await this.#send('GET', path, undefined, signal);
    try {
      return (await res.json()) as T;
    } catch (cause) {
      throw new ChainError('INVALID_RESPONSE', `non-JSON body from ${this.baseUrl}${path}`, { cause });
    }
  }

  async getText(path: string, signal: AbortSignal): Promise<string> {
    return (await this.#send('GET', path, undefined, signal)).text();
  }

  async postText(path: string, body: string, signal: AbortSignal): Promise<string> {
    return (await this.#send('POST', path, body, signal)).text();
  }

  async #send(method: string, path: string, body: string | undefined, signal: AbortSignal): Promise<Response> {
    let res: Response;
    try {
      res = await this.#fetch(`${this.#root}${path}`, {
        method,
        ...(body !== undefined ? { body, headers: { 'content-type': 'text/plain' } } : {}),
        signal,
      });
    } catch (cause) {
      if (signal.aborted) throw new ChainError('TIMEOUT', `request to ${this.baseUrl}${path} timed out`, { cause });
      throw new ChainError('TRANSPORT_FAILED', `request to ${this.baseUrl}${path} failed`, { cause });
    }
    if (res.status === 429) throw new ChainError('RATE_LIMITED', `${this.baseUrl} rate-limited the request`);
    if (!res.ok) throw new ChainError('TRANSPORT_FAILED', `HTTP ${res.status} from ${this.baseUrl}${path}`);
    return res;
  }
}
