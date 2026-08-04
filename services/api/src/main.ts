/**
 * Service entrypoint. Loads + validates config (fail fast), builds the logger
 * and app, and listens. Handles graceful shutdown so in-flight requests drain
 * on SIGTERM (k8s rolling deploys).
 */
import { isLocal, loadConfig } from '@intent-wallet/config';

// Local convenience: honor a gitignored `.env` next to the service (secrets like
// IW_LLM_API_KEY live there, never in git). Absent file → no-op; deployed envs
// inject real env vars (External Secrets), never files.
try {
  process.loadEnvFile();
} catch {
  /* no .env — fine */
}
import { createLogger } from '@intent-wallet/observability';
import { createDemoExecutor, createWalletRuntime, type Holding } from '@intent-wallet/runtime';
import { buildApp } from './app.js';
import type { ReadinessProbe } from './routes/health.js';
import { deriveDemoIdentity } from './dev-identity.js';
import { PostgresPlanStore, SqlitePlanStore } from './persistence/plan-store.js';
import { RedisNonceStore, createRedis } from './auth/redis.js';
import { redisRevoker } from './auth/revoker.js';
import {
  makeCoinGeckoPrices,
  makeL2Sources,
  makeLiveHoldingsSource,
  makeMergedHoldings,
  makeUserRuntimeProvider,
  type HoldingsSource,
  type PriceFetch,
} from './runtime-provider.js';
import { makeAlchemyHoldings } from './alchemy.js';
import { makeAnthropicLlmClient } from './llm.js';
import { loadOfacRiskEngine } from './sanctions.js';
import { makeEnsResolver } from './ens.js';
import { makeEvmHistory } from './history.js';
import { makeCompositeRoutes, makeJupiterRouteProvider } from './jupiter.js';
import { makeUniswapRouteProvider } from './uniswap.js';
import { makeGiwaAmmRouteProvider } from './giwa-amm.js';
import { makeEvmGasEstimator } from './gas.js';
import { makeBtcHoldings } from './btc.js';
import { makeSolHoldings } from './solana.js';
import { makeBalancesReader } from './balances.js';
import type { RouteProvider } from '@intent-wallet/intents';
import type { LlmClient } from '@intent-wallet/intents';
import type { RiskEngine } from '@intent-wallet/risk';

/**
 * DEV SEED — on LOCAL ONLY we mount the composition root over demo holdings +
 * prices so `POST /v1/intents/plan` is usable on localhost. Every DEPLOYED
 * environment (including `preview`) sources holdings from the authenticated user's
 * live portfolio and builds the runtime per-request, NOT from this seed — so a
 * shared URL never ships fake balances or simulated signing (no-fake-data doctrine).
 */
const DEV_HOLDINGS: Holding[] = [
  {
    symbol: 'ETH',
    decimals: 18,
    totalBase: 2n * 10n ** 18n,
    chains: [{ chainId: 'eip155:1', base: 2n * 10n ** 18n }],
  },
  { symbol: 'USDC', decimals: 6, totalBase: 5_000_000_000n, chains: [{ chainId: 'eip155:1', base: 5_000_000_000n }] },
  // SOL + BTC so native-transfer intents can be PLANNED here; the browser wallet
  // enforces the REAL testnet balance and does the actual signing/broadcast.
  { symbol: 'SOL', decimals: 9, totalBase: 10n * 10n ** 9n, chains: [{ chainId: 'solana:mainnet', base: 10n * 10n ** 9n }] },
  { symbol: 'BTC', decimals: 8, totalBase: 10n ** 7n, chains: [{ chainId: 'bip122:bitcoin', base: 10n ** 7n }] },
];
const DEV_PRICES: Record<string, string> = { ETH: '2000', USDC: '1', BTC: '60000', SOL: '150' };

function buildDevRuntime(
  llm?: LlmClient,
  riskEngine?: RiskEngine,
  resolveEns?: (name: string) => Promise<string | null>,
  extraRoutes?: RouteProvider,
  liveFeeMicros?: (chainId: string) => Promise<bigint | null>,
): ReturnType<typeof createWalletRuntime> {
  return createWalletRuntime({
    holdings: DEV_HOLDINGS,
    prices: DEV_PRICES,
    ...(llm ? { llm } : {}),
    ...(riskEngine ? { riskEngine } : {}),
    ...(resolveEns ? { resolveEns } : {}),
    ...(extraRoutes ? { extraRoutes } : {}),
    ...(liveFeeMicros ? { liveFeeMicros } : {}),
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.IW_LOG_LEVEL, service: config.IW_SERVICE_NAME });

  // LOCAL ONLY: wire the DEMO executor (fake signer + fake gateway + real bounded
  // gas planner) + dev holdings seed + test-seed identity so the whole plan →
  // authorize → execute loop runs on localhost. Every DEPLOYED env (incl. preview)
  // ships NONE of this — a real device signer + live gateway + per-user holdings are
  // wired per deployment — so a shared URL never presents fabricated data as real.
  const local = isLocal(config);
  // The REAL LLM parse path — the deterministic parser's fallback for phrasings the
  // regex can't handle. Consumes IW_FLAG_INTENTS_LLM_PATH (kill switch) + requires a
  // key; absent either, the parser degrades to clarify (never guesses). The model is
  // schema-caged: one forced tool, output Zod-validated, no execute capability.
  const llm =
    config.IW_FLAG_INTENTS_LLM_PATH && config.IW_LLM_API_KEY
      ? makeAnthropicLlmClient({ apiKey: config.IW_LLM_API_KEY, model: config.IW_LLM_MODEL_PARSE })
      : undefined;
  // COMPLIANCE: seed the Risk Engine's threat intel with OFAC's sanctioned crypto-address
  // list so any plan to a sanctioned recipient is HARD-BLOCKED (non-overridable) by the risk
  // gate. Best-effort at boot (the list is a live public feed): a fetch failure degrades to
  // no-sanctions-intel with a loud warning rather than blocking startup. A production deploy
  // persists the snapshot + refreshes it periodically. The one engine is shared by the dev
  // runtime, the per-user runtimes, and authorize (same intel at plan- and authorize-time).
  let sanctionsRiskEngine: RiskEngine | undefined;
  if (config.IW_FLAG_SANCTIONS_SCREENING) {
    // Sanctions is a HARD, non-overridable block — a compliance control. A single boot fetch
    // that fails on a transient DNS/network blip would otherwise leave the pod running its
    // ENTIRE lifetime with screening silently OFF. So retry with backoff (self-heals a blip),
    // and if every attempt fails, log at ERROR — not warn — so a deploy can ALERT on running
    // degraded. (Follow-up for a stricter prod: a readiness gate that keeps the pod out of
    // rotation until the list loads, plus a snapshot + periodic refresh.)
    const SANCTIONS_LOAD_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= SANCTIONS_LOAD_ATTEMPTS; attempt++) {
      try {
        const loaded = await loadOfacRiskEngine();
        // A 200-but-empty/garbage feed (an egress captive-portal interstitial, a CDN error page, or a
        // relocated upstream file) yields ZERO address-shaped lines with NO HTTP error — which would
        // silently run screening OFF for the pod's whole life while logging "enabled". The real OFAC ETH
        // list is ~180+ entries, so a count below a sane floor is an unambiguous broken-feed signal:
        // throw it into the SAME retry→ERROR degraded path a network failure takes, never a silent pass.
        const SANCTIONS_MIN_ENTRIES = 50;
        if (loaded.count < SANCTIONS_MIN_ENTRIES) {
          throw new Error(`OFAC feed returned only ${loaded.count} address(es) (< ${SANCTIONS_MIN_ENTRIES}) — treating as a broken/empty feed`);
        }
        sanctionsRiskEngine = loaded.riskEngine;
        logger.info('OFAC sanctions screening enabled', { sanctionedAddresses: loaded.count });
        break;
      } catch (err) {
        const lastTry = attempt === SANCTIONS_LOAD_ATTEMPTS;
        const detail = { attempt, err: err instanceof Error ? err.message : String(err) };
        if (lastTry) logger.error('OFAC sanctions feed unavailable after retries — screening is DISABLED', detail);
        else {
          logger.warn('OFAC sanctions feed load failed — retrying', detail);
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  }
  // ENS resolution over the mainnet RPC (Alchemy when a key is set, else the public
  // default) — lets "send … to vitalik.eth" and the send flow resolve human-readable names.
  const ensRpcUrl = config.IW_ALCHEMY_API_KEY
    ? `https://eth-mainnet.g.alchemy.com/v2/${config.IW_ALCHEMY_API_KEY}`
    : config.IW_RPC_ETHEREUM;
  const resolveEns = makeEnsResolver(ensRpcUrl);
  // The activity feed reads real transactions from a public EVM explorer (no key).
  const evmHistory = makeEvmHistory(config.IW_EVM_EXPLORER_API);
  // Real DEX routing, no key required: Jupiter quotes Solana pairs; Uniswap v3 QuoterV2
  // quotes mainnet EVM pairs over the same mainnet RPC as ENS (a keyless `eth_call`). The
  // composite tries each in turn and falls through to the deterministic stub for anything
  // neither venue prices — so a real swap quote is used wherever one exists.
  // GIWA-FIRST routing: our own on-chain SimpleAMM prices ETH<->gUSDC, tried BEFORE Jupiter /
  // Uniswap so a convertible pair settles on GIWA at PLAN time (not just corrected in the browser).
  const giwaRoutes = makeGiwaAmmRouteProvider(process.env.IW_GIWA_RPC || 'https://sepolia-rpc.giwa.io');
  const jupiterRoutes = makeJupiterRouteProvider();
  const uniswapRoutes = makeUniswapRouteProvider(ensRpcUrl);
  const extraRoutes = makeCompositeRoutes([giwaRoutes, jupiterRoutes, uniswapRoutes]);
  // Real EVM network fee: live mainnet gas price × representative gas × ETH price, over the
  // same mainnet RPC (a keyless eth_gasPrice). The dev runtime prices gas in ETH at the dev
  // fixture; the deployed path uses the live CoinGecko ETH price (wired below).
  const devGasEstimator = makeEvmGasEstimator({ rpcUrl: ensRpcUrl, getEthPriceUsd: () => Promise.resolve(DEV_PRICES.ETH) });
  const runtime = local ? buildDevRuntime(llm, sanctionsRiskEngine, resolveEns, extraRoutes, devGasEstimator) : undefined;
  const executor = runtime ? createDemoExecutor() : undefined;
  // Real BIP-32/44/84 derivation of the demo Universal Identity (public addresses only).
  const identity = runtime ? deriveDemoIdentity() : undefined;
  // DEPLOYED: mount the intent loop over the AUTHENTICATED user's REAL holdings +
  // live prices (no dev seed). Holdings are discovered per-request over the
  // configured EVM RPC; prices from CoinGecko. (Requires IW_REQUIRE_AUTH=true so the
  // principal is the real wallet address, not the dev fallback.) Server /execute is
  // absent in prod — signing is on-device in the browser, never here.
  // ONE pair of holdings+price seams per process: the per-user runtime AND the
  // insights route read the same instances, so the analytics can never drift from
  // what the planner planned against (and the price cache is shared).
  // Real MULTI-CHAIN EVM holdings: the principal is the SAME address on every EVM chain,
  // so we discover Ethereum mainnet (native ETH + AUTO-DISCOVERED ERC-20s via Alchemy's
  // Token API when a key is set, else native-only over the plain RPC) MERGED with native
  // balances on the major L2s (Arbitrum/Optimism/Base/Polygon) over their public RPCs —
  // the "universal" in Universal Wallet. Each chain is best-effort (a down RPC is dropped,
  // never sinking the read) and every source REQUIRES a real EVM-address principal, so a
  // portfolio is never fabricated for a non-address caller.
  const mainnetHoldings: HoldingsSource = config.IW_ALCHEMY_API_KEY
    ? makeAlchemyHoldings(config.IW_ALCHEMY_API_KEY)
    : makeLiveHoldingsSource([{ chainId: 'ethereum', rpcUrls: [config.IW_RPC_ETHEREUM] }]);
  const realHoldings: HoldingsSource = makeMergedHoldings([mainnetHoldings, ...makeL2Sources()]);
  // Cross-ecosystem balances (POST /v1/portfolio/balances): the client's OWN public addresses
  // → real holdings across EVM (multi-chain, the source above) + native BTC (keyless Esplora)
  // + native SOL (keyless public RPC), valued with LIVE prices — even in local dev, where the
  // planner uses a fixture. This is what makes the portfolio view actually UNIVERSAL.
  const balancesReader = makeBalancesReader(
    // Honor the operator's keyed RPC overrides (BACKEND-DEPLOY.md documents IW_RPC_SOLANA/BITCOIN for
    // faster, un-rate-limited reads). These were validated into config but never passed through, so a
    // deploy's override was silently ignored and SOL/BTC balance legs hit the public endpoints, 429'd
    // under load, and dropped every tester's SOL/BTC holdings from the net-worth total.
    { evm: realHoldings, btc: makeBtcHoldings(config.IW_RPC_BITCOIN), sol: makeSolHoldings(config.IW_RPC_SOLANA) },
    makeCoinGeckoPrices(),
  );
  // LOCAL keeps the dev seed for the ANONYMOUS default principal (no SIWE address), but
  // routes a signed-in wallet's real address to live holdings; DEPLOYED always uses live
  // holdings (auth is required, so the principal is always a real address).
  const holdingsFor: HoldingsSource = local
    ? (principal): Promise<Holding[]> =>
        /^0x[0-9a-fA-F]{40}$/u.test(principal) ? realHoldings(principal) : Promise.resolve(DEV_HOLDINGS)
    : realHoldings;
  // LOCAL keeps the self-consistent dev price fixture (matches the anonymous dev seed);
  // a signed-in local address gets real holdings but dev prices — a documented local-only
  // imperfection that never occurs deployed, where BOTH holdings and prices are live.
  const pricesFor: PriceFetch = local
    ? (): Promise<Record<string, string>> => Promise.resolve(DEV_PRICES)
    : makeCoinGeckoPrices();
  // Deployed: the live fee estimator prices gas in ETH at the live CoinGecko price.
  const liveGasEstimator = makeEvmGasEstimator({
    rpcUrl: ensRpcUrl,
    getEthPriceUsd: () => pricesFor().then((p) => p.ETH),
  });
  const runtimeProvider = local
    ? undefined
    : makeUserRuntimeProvider({
        holdingsFor,
        pricesFor,
        resolveEns,
        extraRoutes,
        liveFeeMicros: liveGasEstimator,
        ...(llm ? { llm } : {}),
        ...(sanctionsRiskEngine ? { riskEngine: sanctionsRiskEngine } : {}),
      });
  // Portfolio intelligence (allocation/risk/health/insights) over the same seams.
  const insights = { holdingsFor, pricesFor };
  // Persist issued plans so authorize/execute survive a restart. Local uses an
  // embedded SQLite file; a deployed env uses the shared Postgres (IW_DB_URL) so the
  // loop works across replicas.
  const planStore = local
    ? new SqlitePlanStore(process.env.IW_PLAN_DB_PATH ?? '.plans.db')
    : config.IW_DB_URL
      ? new PostgresPlanStore(config.IW_DB_URL)
      : undefined;
  // SIWE session secret. Config REQUIRES IW_AUTH_SECRET in every non-local env (see
  // superRefine), so the insecure fallback is reachable on LOCAL ONLY — assert that
  // explicitly rather than relying on the fallback silently: a deployed env must
  // never sign sessions with a known secret.
  const authSecret = config.IW_AUTH_SECRET ?? (local ? 'dev-only-insecure-siwe-secret-change-me' : undefined);
  if (!authSecret) throw new Error('IW_AUTH_SECRET is required outside local (no insecure fallback in a deployed env)');
  // A DEPLOYED env MUST require auth: with it off, `principalOf` collapses every caller to the
  // single dev principal and the per-plan ownership check goes vacuous. Fail closed at boot
  // rather than silently serve an auth-open API (the insecure fallback is local-only, above).
  if (!local && !config.IW_REQUIRE_AUTH) {
    throw new Error('IW_REQUIRE_AUTH must be true outside local — refusing to start an auth-open API in a deployed env');
  }
  // Shared Redis (deployed only; config requires IW_REDIS_URL non-local) backs the
  // cross-replica rate limiter AND the SIWE nonce store, so sign-in issued on one
  // pod verifies on another and the rate limit is global — not per-process.
  const redis =
    !local && config.IW_REDIS_URL ? createRedis(config.IW_REDIS_URL, (err) => logger.error('redis client error', { err })) : undefined;
  const nonceStore = redis ? new RedisNonceStore(redis) : undefined;
  // Session revoker: Redis (shared across replicas) in deployed envs; local defaults
  // to in-memory inside registerV1Routes.
  const revoker = redis ? redisRevoker(redis) : undefined;
  // Readiness probes reflect ACTUAL dependency health so k8s pulls a pod with a dead
  // DB/Redis from rotation (instead of /readyz being vacuously 200). A cheap real
  // query proves the connection; a throw → the probe fails → 503.
  const readinessProbes: ReadinessProbe[] = [];
  if (planStore) readinessProbes.push({ name: 'plan-store', check: () => planStore.get('__readyz_probe__').then(() => true) });
  if (redis) readinessProbes.push({ name: 'redis', check: () => redis.ping().then((r) => r === 'PONG') });
  const app = await buildApp({
    config,
    logger,
    authSecret,
    requireAuth: config.IW_REQUIRE_AUTH,
    // SIWE domain the user signs against. Set IW_AUTH_DOMAIN in every deployed env so the
    // challenge reads the real origin, not "localhost" (EIP-4361 anti-phishing binding). (L9)
    ...(process.env.IW_AUTH_DOMAIN ? { authDomain: process.env.IW_AUTH_DOMAIN } : {}),
    readinessProbes,
    ...(runtime ? { runtime } : {}),
    ...(runtimeProvider ? { runtimeProvider } : {}),
    ...(executor ? { executor } : {}),
    ...(identity ? { identity } : {}),
    ...(planStore ? { planStore } : {}),
    ...(redis ? { redis } : {}),
    ...(nonceStore ? { nonceStore } : {}),
    ...(revoker ? { revoker } : {}),
    insights,
    resolveEns,
    evmHistory,
    balances: balancesReader,
  });

  const close = async (signal: string): Promise<void> => {
    logger.info('shutting down', { signal });
    await app.close();
    // Drain the datastore connections too, symmetric with their construction —
    // otherwise the pg Pool + Redis socket leak on every rolling deploy.
    if (planStore) await planStore.close();
    if (redis) await redis.quit();
    process.exit(0);
  };
  process.on('SIGTERM', () => void close('SIGTERM'));
  process.on('SIGINT', () => void close('SIGINT'));

  await app.listen({ host: '0.0.0.0', port: config.IW_HTTP_PORT });
  logger.info('api listening', {
    port: config.IW_HTTP_PORT,
    env: config.IW_ENV,
    intents: runtime
      ? 'POST /v1/intents/{plan,authorize,execute} (dev seed + demo executor)'
      : 'disabled (production sources per-user)',
  });
}

main().catch((err: unknown) => {
  // Config/boot failures must be loud and fatal — never start half-configured.
  createLogger({ service: 'api' }).error('fatal boot error', { err });
  process.exit(1);
});
