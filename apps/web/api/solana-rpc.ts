/**
 * Solana RPC proxy — keeps a KEYED RPC URL (Helius/Alchemy/QuickNode) SERVER-SIDE
 * so it never ships in the browser bundle. The client points VITE_SOLANA_*_RPC at
 * this path (e.g. `/api/solana-rpc?net=devnet`); the function forwards the JSON-RPC
 * body to the real upstream, read from a NON-`VITE_` (server-only) env var.
 *
 * Why this is safe for a public, 100-user demo:
 *   • The upstream URL is FIXED by env — the client cannot choose it (no SSRF).
 *   • Only POST is accepted, and only a JSON-RPC body is forwarded on.
 *   • The API key lives in the host's server env, never in `import.meta.env` /
 *     the shipped bundle. `HttpJsonRpcTransport` already POSTs JSON-RPC via fetch,
 *     so a relative proxy path works with zero client-code changes.
 *
 * Configure on the host (e.g. Vercel → Settings → Environment Variables):
 *   server-side (NOT prefixed VITE_, so it stays off the client):
 *     SOLANA_DEVNET_RPC_URL   = https://devnet.helius-rpc.com/?api-key=YOUR_KEY
 *     SOLANA_MAINNET_RPC_URL  = https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
 *   client (safe to expose — it is only a path):
 *     VITE_SOLANA_DEVNET_RPC  = /api/solana-rpc?net=devnet
 *     VITE_SOLANA_MAINNET_RPC = /api/solana-rpc?net=mainnet
 */

type Req = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
};
type Res = {
  status: (code: number) => Res;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
  json: (body: unknown) => void;
};

// Read the keyed upstream PER REQUEST (not at module load): a cold-started module
// must not cache an env value that wasn't ready yet, and it keeps the function
// trivially testable. Nothing here is ever sent to the client.
function upstreamFor(net: 'devnet' | 'mainnet'): string | undefined {
  return net === 'mainnet' ? process.env.SOLANA_MAINNET_RPC_URL : process.env.SOLANA_DEVNET_RPC_URL;
}

// Best-effort per-IP speed-bump. Serverless instances are ephemeral and many run
// in parallel, so this is NOT a hard guarantee — for real limits put a WAF or an
// Upstash/Vercel-KV rate limiter in front. It still blunts one client hammering a
// single warm instance, which is what a small public demo actually faces.
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 100;
const MAX_BATCH = 20; // most JSON-RPC sub-calls allowed in ONE request (amplification bound)
const hits = new Map<string, number[]>();
// `cost` = number of JSON-RPC sub-calls in the request (a batch of N counts as N), so a single batched
// POST can't smuggle hundreds of upstream calls past a per-REQUEST limit — that amplification would
// otherwise drain the owner's paid mainnet key while ticking the window by only 1.
function throttled(ip: string, cost: number): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  for (let i = 0; i < cost; i++) recent.push(now);
  hits.set(ip, recent);
  // Bound the map so a flood of distinct (spoofable) IPs can't grow it unbounded on a warm instance:
  // once it's large, drop every key whose window has fully expired.
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_PER_WINDOW;
}

// Only the JSON-RPC methods the wallet ACTUALLY uses may reach the keyed upstream. Without this the
// mainnet proxy is an OPEN RPC to the owner's paid key: any visitor could drive arbitrary, expensive
// calls (getProgramAccounts, huge getSignaturesForAddress …) and drain the quota.
const ALLOWED_METHODS = new Set([
  'getBalance',
  'getAccountInfo',
  'getLatestBlockhash',
  'getSignaturesForAddress',
  'getSignatureStatuses',
  'getTokenAccountsByOwner',
  'getTokenSupply',
  'getRecentPrioritizationFees',
  'getSlot',
  'sendTransaction',
  'simulateTransaction',
  'getVersion',
  'getHealth',
]);

/** The JSON-RPC method name(s) in a single request or a batch array; [] if the body is malformed. */
function methodsOf(body: unknown): string[] {
  const one = (b: unknown): string | null =>
    b !== null && typeof b === 'object' && typeof (b as { method?: unknown }).method === 'string' ? (b as { method: string }).method : null;
  if (Array.isArray(body)) {
    const ms = body.map(one);
    return ms.every((m): m is string => m !== null) ? ms : [];
  }
  const m = one(body);
  return m ? [m] : [];
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed — POST JSON-RPC only' });
    return;
  }

  const net: 'devnet' | 'mainnet' = req.query.net === 'mainnet' ? 'mainnet' : 'devnet';
  const upstream = upstreamFor(net);
  if (!upstream || !/^https:\/\//i.test(upstream)) {
    res.status(500).json({ error: `RPC upstream for ${net} is not configured` });
    return;
  }

  // Validate the JSON-RPC method(s) and BOUND a batch's size BEFORE metering — an unbounded batch array
  // (every method allowlisted, but hundreds of sub-calls in one request) is the amplification vector.
  const methods = methodsOf(req.body);
  if (Array.isArray(req.body) && req.body.length > MAX_BATCH) {
    res.status(400).json({ error: `batch too large — at most ${MAX_BATCH} calls per request` });
    return;
  }
  if (methods.length === 0 || methods.some((m) => !ALLOWED_METHODS.has(m))) {
    res.status(400).json({ error: 'jsonrpc method not allowed' });
    return;
  }

  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd ?? '').split(',')[0].trim() || 'unknown';
  // Charge the window by the number of sub-calls, not 1 per request (batch amplification guard).
  if (throttled(ip, methods.length)) {
    res.status(429).json({ error: 'rate limit — slow down' });
    return;
  }

  const payload = JSON.stringify(req.body ?? {});
  if (payload.length > 100_000) {
    res.status(413).json({ error: 'payload too large' });
    return;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const upstreamRes = await fetch(upstream, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      signal: ctrl.signal,
    });
    const text = await upstreamRes.text();
    res.status(upstreamRes.status);
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.send(text);
  } catch {
    res.status(502).json({ error: 'upstream RPC unreachable' });
  } finally {
    clearTimeout(timer);
  }
}
