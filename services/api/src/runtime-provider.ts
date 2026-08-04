/**
 * Per-user runtime resolution — the seam that turns the API from "one boot-time dev
 * runtime over a hardcoded seed" into "a runtime scoped to the AUTHENTICATED user,
 * built from their REAL on-chain holdings + live prices, per request".
 *
 * The intent routes resolve a `WalletRuntime` for `request.auth.subject` (the SIWE
 * wallet address) via a `RuntimeProvider`. Everything here is injected so it is
 * testable without a live chain: a `HoldingsSource` and a price fetch are the two
 * seams; production supplies RPC-backed implementations (below), tests supply stubs.
 * No hardcoded balances or prices ever reach the planner — the no-fake-data line.
 */
import { randomUUID } from 'node:crypto';
import {
  EvmAdapter,
  HttpJsonRpcTransport,
  ProviderPool,
  getChain,
  type BlockchainAdapter,
  type ChainId,
  type TokenRef,
} from '@intent-wallet/chains';
import { createWalletRuntime, discoverHoldings, mergeHoldings, type Holding, type WalletRuntime } from '@intent-wallet/runtime';
import type { LlmClient, RouteProvider } from '@intent-wallet/intents';
import type { RiskEngine } from '@intent-wallet/risk';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;

/** Sources a principal's holdings (live multi-chain discovery in prod). */
export type HoldingsSource = (principal: string) => Promise<Holding[]>;
/** Fetches current USD prices by symbol (decimal strings). */
export type PriceFetch = () => Promise<Record<string, string>>;
/** Resolves a per-principal WalletRuntime for a request. */
export type RuntimeProvider = (principal: string) => Promise<WalletRuntime>;

/**
 * Build a RuntimeProvider that, per request, discovers the principal's holdings and
 * current prices FRESH (no caching — a cached balance is a stale/fake balance) and
 * composes a WalletRuntime over them. This is what mounts the intent loop in a real
 * deployment in place of the dev seed.
 */
export function makeUserRuntimeProvider(deps: {
  holdingsFor: HoldingsSource;
  pricesFor: PriceFetch;
  /** The AI Gateway for the parser's LLM fallback (schema-validated downstream). */
  llm?: LlmClient;
  /** A pre-seeded Risk Engine (e.g. with the OFAC sanctions list) shared across requests. */
  riskEngine?: RiskEngine;
  /** Resolve an ENS name to an EVM address (shared across requests). */
  resolveEns?: (name: string) => Promise<string | null>;
  /** A real DEX aggregator (e.g. Jupiter) tried before the default route provider. */
  extraRoutes?: RouteProvider;
  /** A live per-chain fee estimator (EVM gas price × ETH price); static baseline on null. */
  liveFeeMicros?: (chainId: string) => Promise<bigint | null>;
}): RuntimeProvider {
  // Runtimes are rebuilt per request so balances/prices are never stale — but the cumulative
  // drain ledger MUST survive across requests, otherwise the guard sees an empty history every
  // time and a drain split across several sends is never caught. Keep the ledger here, keyed by
  // principal, and hand the same one to each freshly-built runtime.
  const outflowByPrincipal = new Map<string, Map<string, bigint>>();
  // The per-plan idempotency set must be shared per-principal EXACTLY like the ledger above — a fresh
  // per-request set would never dedup (one authorize per request), so re-authorizing a plan (a preview /
  // retry / re-validate-before-sign) would double-count the outflow and self-DoS later sends. Kept
  // alongside the ledger so the two can never desync.
  const countedByPrincipal = new Map<string, Set<string>>();
  // Roll the ledger on the UTC day. Without a boundary it accumulated for the whole PROCESS lifetime,
  // which caused two problems: (1) unbounded memory — one countedPlans entry per plan EVER authorized,
  // growing forever even after the plan store evicted those plans; and (2) a long-active principal's
  // cumulative outflow eventually crossed the 99%-of-balance drain line and then BLOCKED every typed
  // transfer of that asset until the pod restarted (a self-inflicted DoS). A UTC day is the effective
  // "session" window for the cumulative-drain guard; clearing on the roll also caps memory. (Mirrors the
  // gas sponsorship per-UTC-day reset.)
  const utcDay = (): string => new Date().toISOString().slice(0, 10);
  let ledgerDay = utcDay();
  return async (principal: string): Promise<WalletRuntime> => {
    const today = utcDay();
    if (today !== ledgerDay) {
      ledgerDay = today;
      outflowByPrincipal.clear();
      countedByPrincipal.clear();
    }
    let sessionOutflow = outflowByPrincipal.get(principal);
    if (!sessionOutflow) {
      sessionOutflow = new Map<string, bigint>();
      outflowByPrincipal.set(principal, sessionOutflow);
    }
    let countedPlans = countedByPrincipal.get(principal);
    if (!countedPlans) {
      countedPlans = new Set<string>();
      countedByPrincipal.set(principal, countedPlans);
    }
    const [holdings, prices] = await Promise.all([deps.holdingsFor(principal), deps.pricesFor()]);
    // A fresh runtime is built PER REQUEST, so the default per-instance ordinal id
    // generator (plan-1, plan-2, …) would hand every user's first plan the SAME id —
    // and the shared plan store's PK-upsert would then let one tenant overwrite
    // another's plan. Globally-unique UUID ids make a cross-tenant collision impossible.
    return createWalletRuntime({
      sessionOutflow,
      countedPlans,
      holdings,
      prices,
      ids: { plan: () => `plan-${randomUUID()}`, intent: () => `intent-${randomUUID()}` },
      ...(deps.llm ? { llm: deps.llm } : {}),
      ...(deps.riskEngine ? { riskEngine: deps.riskEngine } : {}),
      ...(deps.resolveEns ? { resolveEns: deps.resolveEns } : {}),
      ...(deps.extraRoutes ? { extraRoutes: deps.extraRoutes } : {}),
      ...(deps.liveFeeMicros ? { liveFeeMicros: deps.liveFeeMicros } : {}),
    });
  };
}

// ── Live implementations (production) ────────────────────────────────────────

/**
 * The CoinGecko id ↔ wallet symbol map for the assets we price. Symbols are UPPERCASE
 * (the intelligence engine matches `prices[holding.symbol.toUpperCase()]`), so a token
 * discovered as `usdc`/`Weth`/`stETH` all resolve. Covers the natives + the common
 * stablecoins, wrapped/liquid-staked ETH, DeFi majors, and L2 tokens a real EVM portfolio
 * holds — a long-tail token not on this list stays UNPRICED (flagged stale, never invented;
 * pricing arbitrary tokens by contract address is the deeper follow-up).
 */
const COINGECKO = [
  // Natives
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'bitcoin', symbol: 'BTC' },
  { id: 'solana', symbol: 'SOL' },
  // Stablecoins
  { id: 'usd-coin', symbol: 'USDC' },
  { id: 'tether', symbol: 'USDT' },
  { id: 'dai', symbol: 'DAI' },
  { id: 'frax', symbol: 'FRAX' },
  { id: 'paypal-usd', symbol: 'PYUSD' },
  // Wrapped / liquid-staked
  { id: 'weth', symbol: 'WETH' },
  { id: 'wrapped-bitcoin', symbol: 'WBTC' },
  { id: 'staked-ether', symbol: 'STETH' },
  { id: 'wrapped-steth', symbol: 'WSTETH' },
  { id: 'rocket-pool-eth', symbol: 'RETH' },
  // DeFi majors
  { id: 'chainlink', symbol: 'LINK' },
  { id: 'uniswap', symbol: 'UNI' },
  { id: 'aave', symbol: 'AAVE' },
  { id: 'maker', symbol: 'MKR' },
  { id: 'lido-dao', symbol: 'LDO' },
  { id: 'curve-dao-token', symbol: 'CRV' },
  { id: 'compound-governance-token', symbol: 'COMP' },
  { id: 'the-graph', symbol: 'GRT' },
  { id: 'ethereum-name-service', symbol: 'ENS' },
  // L2 / scaling
  { id: 'arbitrum', symbol: 'ARB' },
  { id: 'optimism', symbol: 'OP' },
  // Polygon's native rebranded MATIC→POL; the old `matic-network` id now returns no price,
  // so both symbols map to the live POL id (POL is discovered as a native on Polygon).
  { id: 'polygon-ecosystem-token', symbol: 'POL' },
  { id: 'polygon-ecosystem-token', symbol: 'MATIC' },
  // Popular
  { id: 'shiba-inu', symbol: 'SHIB' },
  { id: 'pepe', symbol: 'PEPE' },
  { id: 'apecoin', symbol: 'APE' },
] as const;

type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Live USD prices from CoinGecko's public API. Returns decimal strings keyed by
 * symbol. Injectable fetch so it is testable offline; falls back to the global fetch.
 */
export function makeCoinGeckoPrices(fetchFn?: FetchLike, ttlMs = 15_000): PriceFetch {
  const doFetch: FetchLike = fetchFn ?? ((url) => fetch(url, { signal: AbortSignal.timeout(8000) }));
  const ids = COINGECKO.map((c) => c.id).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

  const fetchPrices = async (): Promise<Record<string, string>> => {
    const res = await doFetch(url);
    if (!res.ok) throw new Error('price feed unavailable');
    const body = (await res.json()) as Record<string, { usd?: number }>;
    const out: Record<string, string> = {};
    for (const { id, symbol } of COINGECKO) {
      const usd = body[id]?.usd;
      // Require a POSITIVE price. A feed value of 0 is truthy as the string "0", so it would pass every
      // `if (price)` check downstream and either value a holding at exactly $0 (silently skipping the USD
      // spend cap) or divide-by-zero in the swap adapter (usdToMicros("0")=0n → RangeError → 500); a
      // negative throws MoneyError → 500. Drop a non-positive price so the symbol is treated as unpriced
      // (fail-safe), matching the exponent handling below.
      if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) {
        // A sub-$1e-6 price (a micro-cap like PEPE/SHIB) makes String(usd) emit EXPONENT notation
        // ("9e-7"), which usdToMicros' `^\d+(\.\d+)?$` regex rejects → a MoneyError → a 500 on
        // /v1/portfolio/insights. Emit fixed-point for the exponent cases (trimmed), plain String for
        // the rest (avoids float-noise on normal prices).
        const s = String(usd);
        out[symbol] = /e/iu.test(s) ? usd.toFixed(18).replace(/\.?0+$/u, '') : s;
      }
    }
    return out;
  };

  // A per-request fetch would hammer CoinGecko's free tier (every plan/authorize/
  // execute/portfolio call) and rate-limit the whole runtime. Cache for a short TTL and
  // dedup concurrent calls to a single in-flight fetch. On a TRANSIENT failure (rate-limit
  // / offline) serve the last known-good price up to MAX_STALE_MS old rather than failing
  // the whole request — real prices, just slightly stale. A hard staleness bound (and a
  // cold-start throw when nothing has ever been fetched) keeps a wedged feed from serving
  // arbitrarily old data. NOTE: these prices drive DISPLAY + fee preview only; swap min-outs
  // come from live Jupiter/Uniswap quotes, so a bounded-stale display value is acceptable.
  const MAX_STALE_MS = 600_000; // 10 min — beyond this a failing feed is surfaced, not served
  let cache: { at: number; prices: Record<string, string> } | null = null;
  let inflight: Promise<Record<string, string>> | null = null;
  return (): Promise<Record<string, string>> => {
    if (cache && Date.now() - cache.at < ttlMs) return Promise.resolve(cache.prices);
    if (!inflight) {
      inflight = fetchPrices()
        .then((prices) => {
          cache = { at: Date.now(), prices };
          return prices;
        })
        .catch((err: unknown) => {
          if (cache && Date.now() - cache.at < MAX_STALE_MS) return cache.prices; // bounded stale
          throw err; // no cache, or too old to trust → surface the failure
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };
}

/**
 * Live holdings from real RPC: reads the principal's native balance on each wired
 * EVM chain via the same BlockchainAdapter the rest of the platform uses, merged
 * into the planner's Holding[]. The principal (SIWE subject) IS the EVM address.
 * Multiple RPC URLs per chain give transport failover (ProviderPool).
 */
export function makeLiveHoldingsSource(
  chains: { chainId: ChainId; rpcUrls: readonly string[]; tokens?: readonly TokenRef[] }[],
): HoldingsSource {
  const adapters: { adapter: BlockchainAdapter; tokens: readonly TokenRef[] }[] = chains.map(({ chainId, rpcUrls, tokens }) => ({
    adapter: new EvmAdapter(chainId, new ProviderPool(rpcUrls.map((u) => new HttpJsonRpcTransport(u)))),
    tokens: tokens ?? [],
  }));
  return (principal: string): Promise<Holding[]> => {
    // The principal MUST be a real EVM address (the SIWE subject). If a misconfigured
    // deploy ever routed a non-address principal here (e.g. the dev fallback), we
    // would query eth_getBalance for a bogus "address" and present the empty result
    // as the user's real portfolio — fake data. Fail loud instead.
    if (!EVM_ADDRESS.test(principal)) {
      return Promise.reject(new Error('holdings discovery requires an authenticated EVM-address principal'));
    }
    // The EVM principal is the account address on every EVM chain.
    return discoverHoldings(adapters.map((a) => ({ adapter: a.adapter, address: principal, tokens: a.tokens })));
  };
}

/** The major EVM L2s we discover balances on — the principal is the SAME address on each. */
const DEFAULT_L2_CHAINS: readonly ChainId[] = ['arbitrum', 'optimism', 'base', 'polygon'];

/**
 * High-signal ERC-20s to read per L2 (the assets a wallet actually holds there): the
 * canonical native USDC, WETH, and each chain's governance/native token. Every address +
 * symbol + decimals below was VERIFIED live on-chain (symbol()/decimals() match) before
 * being hardcoded — a wrong address would read another contract's balanceOf and present
 * it as the user's token, which the no-fake-data doctrine forbids. Supplying symbol +
 * decimals also saves two eth_calls per token. (Long-tail tokens need a vetted token
 * list / paid indexer — a documented follow-up; these are the majors.)
 */
const L2_TOKENS: Partial<Record<ChainId, readonly TokenRef[]>> = {
  arbitrum: [
    { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6 },
    { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', decimals: 18 },
    { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB', decimals: 18 },
  ],
  optimism: [
    { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
    { address: '0x4200000000000000000000000000000000000042', symbol: 'OP', decimals: 18 },
  ],
  base: [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
  ],
  polygon: [
    { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', decimals: 6 },
    { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH', decimals: 18 },
    { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', symbol: 'WBTC', decimals: 8 },
  ],
};

/**
 * One best-effort HoldingsSource per L2 — native balance + the curated majors above — over
 * that chain's public RPCs (registry defaults, with failover). Each L2 is a SEPARATE source
 * so a single chain whose RPC is down is dropped by the merger, never sinking the others.
 */
export function makeL2Sources(chains: readonly ChainId[] = DEFAULT_L2_CHAINS): HoldingsSource[] {
  return chains.map((chainId) =>
    makeLiveHoldingsSource([{ chainId, rpcUrls: getChain(chainId).defaultRpcUrls, tokens: L2_TOKENS[chainId] ?? [] }]),
  );
}

/**
 * Compose several HoldingsSources (e.g. mainnet-via-Alchemy + each L2-via-public-RPC) into
 * one, merging by symbol so ETH across mainnet + Arbitrum + Optimism + Base collapses to a
 * single holding with per-chain provenance — the "universal" in Universal Wallet. Each
 * source is best-effort: a chain whose RPC is down is dropped, never sinking the read; but
 * a TOTAL failure re-throws the real error rather than presenting an empty portfolio as
 * real. The principal must be a real EVM address (fail loud on anything else).
 */
export function makeMergedHoldings(sources: HoldingsSource[]): HoldingsSource {
  return async (principal: string): Promise<Holding[]> => {
    if (!EVM_ADDRESS.test(principal)) {
      return Promise.reject(new Error('holdings discovery requires an authenticated EVM-address principal'));
    }
    const settled = await Promise.allSettled(sources.map((s) => s(principal)));
    const ok = settled.filter((r): r is PromiseFulfilledResult<Holding[]> => r.status === 'fulfilled');
    if (ok.length === 0) {
      // Every source failed — surface the real error; never fabricate an empty portfolio.
      throw (settled[0] as PromiseRejectedResult | undefined)?.reason ?? new Error('holdings discovery failed');
    }
    return mergeHoldings(...ok.map((r) => r.value));
  };
}
