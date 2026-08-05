/**
 * LI.FI quote PROXY — forwards the client's `/quote` request to li.quest with the API key held
 * SERVER-SIDE. LI.FI's docs warn never to expose the key in client code (a browser bundle leaks it to
 * anyone's dev-tools); keeping it here raises the unauthenticated free tier (75 quotes / 2h) to the keyed
 * limit (100 req/min) without ever shipping the secret to the wallet. Read-only + non-custodial: it relays
 * a metered third-party QUOTE only — no wallet key, no funds, nothing signed. The unsigned route tx LI.FI
 * returns is still signed ON-DEVICE downstream (executeCrossChainSwap*), unchanged.
 */

/** Minimal fetch shape so the module needs no DOM lib and tests can inject a fake. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface LifiProxy {
  /** Forward a LI.FI /quote query, returning the upstream status + JSON body verbatim (errors included,
   *  so a 429 rate-limit or a 400 surfaces to the client transparently). */
  quote(query: URLSearchParams): Promise<{ status: number; body: unknown }>;
  /** Whether a server-side key is configured (for /status/introspection; never returns the key itself). */
  readonly keyed: boolean;
}

export interface LifiProxyOptions {
  /** The LI.FI API key (defaults to IW_LIFI_API_KEY). Empty ⇒ unauthenticated free tier. */
  apiKey?: string;
  /** Injected fetch (defaults to global). */
  fetchFn?: FetchLike;
  /** Base URL override (tests). */
  baseUrl?: string;
  /** Per-request timeout ms. */
  timeoutMs?: number;
}

export function makeLifiProxy(options: LifiProxyOptions = {}): LifiProxy {
  const apiKey = (options.apiKey ?? process.env.IW_LIFI_API_KEY ?? '').trim();
  const baseUrl = options.baseUrl ?? 'https://li.quest/v1';
  const timeoutMs = options.timeoutMs ?? 15_000;
  const doFetch: FetchLike =
    options.fetchFn ?? ((u, init) => fetch(u, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) }) as unknown as ReturnType<FetchLike>);

  return {
    keyed: apiKey.length > 0,
    async quote(query: URLSearchParams): Promise<{ status: number; body: unknown }> {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (apiKey) headers['x-lifi-api-key'] = apiKey; // the secret stays here, never on the wire to the browser
      const res = await doFetch(`${baseUrl}/quote?${query.toString()}`, { headers });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    },
  };
}
