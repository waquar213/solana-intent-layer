/**
 * Real EVM holdings via Alchemy's enhanced Token API — a production `HoldingsSource`.
 *
 * Where `makeLiveHoldingsSource` reads only the native balance, Alchemy's
 * `alchemy_getTokenBalances` AUTO-DISCOVERS the address+balance of every ERC-20 an address
 * holds (no pre-supplied token list). We keep native ETH + those balances, but we do NOT
 * trust the on-chain token METADATA: a token's `symbol`/`decimals` are attacker-controllable
 * (a spam airdrop can name itself "USDC" with 18 decimals), and because holdings are later
 * merged BY SYMBOL and priced BY SYMBOL, a spoofed symbol would inflate — or mis-scale — a
 * real holding of the same name. So a discovered token is surfaced ONLY if it sits at a
 * VETTED canonical mainnet address, and it is stamped with that entry's trusted
 * symbol/decimals; anything else is OMITTED. Omitting an unverifiable token is the
 * no-fake-data choice — better than presenting it under a symbol we can't vouch for.
 *
 * Rate-limit aware, because a real RPC client must be: requests are retried on `429`/`5xx`
 * with exponential backoff (a free-tier key's compute-units-per-second is easily tripped).
 *
 * The principal (the SIWE subject) MUST be a real EVM address — we reject anything else
 * rather than query a bogus address and present the empty result as a portfolio. Every
 * balance is read live from mainnet. The Alchemy key is a READ/rate-limited data key (never
 * a signing key) and lives only in the backend env, never in a client build.
 */
import type { Holding } from '@intent-wallet/runtime';
import type { HoldingsSource } from './runtime-provider.js';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
/** CAIP-2 id for Ethereum mainnet — matches the ETH provenance used elsewhere. */
const ETH_MAINNET = 'eip155:1';

/**
 * Canonical Ethereum-mainnet ERC-20s we trust from auto-discovery (lowercased address →
 * trusted symbol + decimals). Every address was VERIFIED on-chain (symbol()/decimals()
 * match) before being listed — the auto-discovered on-chain metadata is NOT trusted. These
 * are the high-signal majors (stablecoins, wrapped/staked ETH, wrapped BTC, DeFi bluechips)
 * that hold real portfolio value and are priced by the CoinGecko map; a long-tail token
 * needs a vetted token list / paid indexer (a documented follow-up), not blind trust.
 */
const MAINNET_TOKEN_ALLOWLIST: Record<string, { symbol: string; decimals: number }> = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8 },
  '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', decimals: 18 },
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', decimals: 18 },
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { symbol: 'AAVE', decimals: 18 },
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { symbol: 'STETH', decimals: 18 },
};

/** Minimal fetch shape (injectable so the reader is unit-testable offline). */
type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface AlchemyHoldingsOptions {
  /** Injected fetch (tests); defaults to the global `fetch`. */
  fetchFn?: FetchLike;
  /** Base URL / network selector. Default: Ethereum mainnet. */
  baseUrl?: string;
  /** Max retries per request on 429/5xx before giving up. Default 4. */
  maxRetries?: number;
  /** Base backoff (ms); attempt N waits `retryBaseMs * 2^N`. Default 300. */
  retryBaseMs?: number;
  /** Injected sleep (tests); defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { message?: string };
}

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string | null;
}

const HEX_QUANTITY = /^0x[0-9a-fA-F]+$/u;

/**
 * Parse an RPC hex quantity (e.g. `0x1a2b`). Returns `null` for anything that is not a
 * well-formed hex string — a bare `0x`, a non-hex body, or a non-string — so a single
 * malformed value from the upstream can never throw a raw `SyntaxError` and abort a
 * whole balance read. Callers decide whether a malformed value is fatal (native ETH) or
 * skippable (one token in the best-effort discovery loop).
 */
function hexToBigInt(hex: string | null | undefined): bigint | null {
  if (typeof hex !== 'string') return null;
  const s = hex.startsWith('0x') ? hex : `0x${hex}`;
  if (!HEX_QUANTITY.test(s)) return null;
  return BigInt(s);
}

/**
 * Build a `HoldingsSource` that reads a principal's REAL Ethereum-mainnet balances from
 * Alchemy: native ETH (`eth_getBalance`) + every VETTED ERC-20 it holds
 * (`alchemy_getTokenBalances` auto-discovery, filtered to the canonical allowlist), merged
 * into `Holding[]`.
 */
export function makeAlchemyHoldings(apiKey: string, options: AlchemyHoldingsOptions = {}): HoldingsSource {
  const base = options.baseUrl ?? 'https://eth-mainnet.g.alchemy.com/v2/';
  const url = `${base}${apiKey}`;
  const maxRetries = options.maxRetries ?? 4;
  const retryBaseMs = options.retryBaseMs ?? 300;
  const doFetch: FetchLike = options.fetchFn ?? ((u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(8000) }));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let requestId = 0;
  const rpc = async <T>(method: string, params: unknown[], retries = maxRetries): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      requestId += 1;
      const res = await doFetch(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ id: requestId, jsonrpc: '2.0', method, params }),
      });
      if (res.ok) {
        const body = (await res.json()) as JsonRpcResponse<T>;
        if (body.error) throw new Error(`alchemy ${method}: ${body.error.message ?? 'rpc error'}`);
        if (body.result === undefined) throw new Error(`alchemy ${method}: empty result`);
        return body.result;
      }
      // Retry only transient failures (rate limit / server) with exponential backoff;
      // a 4xx like 401/400 is a real error and must fail fast.
      const transient = res.status === 429 || res.status >= 500;
      if (!transient || attempt >= retries) throw new Error(`alchemy ${method} failed (HTTP ${res.status})`);
      await sleep(retryBaseMs * 2 ** attempt);
    }
  };

  return async (principal: string): Promise<Holding[]> => {
    // A non-address principal (e.g. a misconfigured dev fallback) must never be turned
    // into an empty "portfolio" — fail loud instead of fabricating.
    if (!EVM_ADDRESS.test(principal)) {
      return Promise.reject(new Error('holdings discovery requires an authenticated EVM-address principal'));
    }

    // Native ETH is REQUIRED and served by the core Node API (`eth_getBalance`), which
    // every tier supports. Serial (not a burst) to stay under a free key's per-second
    // budget; the retry loop absorbs residual throttling.
    const nativeHex = await rpc<string>('eth_getBalance', [principal, 'latest']);

    const holdings: Holding[] = [];

    const nativeBase = hexToBigInt(nativeHex);
    // Native ETH is the REQUIRED reading; a malformed hex here is a real upstream fault,
    // so fail loud rather than silently presenting a zero/empty portfolio.
    if (nativeBase === null) {
      return Promise.reject(new Error(`alchemy eth_getBalance: malformed hex balance ${JSON.stringify(nativeHex)}`));
    }
    if (nativeBase > 0n) {
      holdings.push({ symbol: 'ETH', decimals: 18, totalBase: nativeBase, chains: [{ chainId: ETH_MAINNET, base: nativeBase }] });
    }

    // ERC-20 auto-discovery is BEST-EFFORT: the enhanced Token API is throttled on free
    // tiers ("429 — upgrade your plan"), so if it is unavailable we degrade to the native
    // balance rather than failing the whole portfolio read. One quick retry then degrade.
    let tokenBalances: AlchemyTokenBalance[] = [];
    try {
      const tokenRes = await rpc<{ tokenBalances?: AlchemyTokenBalance[] }>('alchemy_getTokenBalances', [principal, 'erc20'], 1);
      tokenBalances = tokenRes.tokenBalances ?? [];
    } catch {
      tokenBalances = [];
    }

    // Keep ONLY tokens at a vetted canonical address, stamped with the trusted symbol +
    // decimals (never the auto-discovered, attacker-controllable metadata). An unvetted
    // token is omitted so it can never collide with / inflate a real holding by symbol.
    for (const t of tokenBalances) {
      if (!t.tokenBalance) continue;
      const vetted = MAINNET_TOKEN_ALLOWLIST[t.contractAddress?.toLowerCase() ?? ''];
      if (!vetted) continue;
      // Best-effort discovery: a single malformed token balance is skipped (not fatal),
      // so it can never abort the read and drop the good holdings already collected.
      const tokenBase = hexToBigInt(t.tokenBalance);
      if (tokenBase === null || tokenBase <= 0n) continue;
      holdings.push({
        symbol: vetted.symbol,
        decimals: vetted.decimals,
        totalBase: tokenBase,
        chains: [{ chainId: ETH_MAINNET, base: tokenBase }],
      });
    }

    return holdings;
  };
}
