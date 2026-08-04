/**
 * Live on-chain balances for the wallet's own addresses — the REAL portfolio,
 * read straight from public/keyed RPCs in the browser (no server, no demo data).
 * For each asset it reads the native balance on BOTH mainnet and its testnet, and
 * fetches live USD prices so the dashboard can show a real net worth. Every call
 * is fail-soft: a chain that errors becomes `null` ("—") rather than breaking the
 * whole view.
 */
import {
  BitcoinAdapter,
  EvmAdapter,
  HttpJsonRpcTransport,
  HttpRestTransport,
  ProviderPool,
  SolanaAdapter,
  type ChainId,
} from '@intent-wallet/chains';
import { btcTestnetAddress, DEFAULT_GIWA_RPC, GIWA_GUSDC } from './broadcast';
import { currentIdentity } from './wallet';

// Endpoints — each overridable via a VITE_* env var (gitignored .env.local),
// falling back to a public keyless node.
const ETH_MAINNET_RPC = import.meta.env.VITE_ETH_MAINNET_RPC || 'https://ethereum-rpc.publicnode.com';
const SEPOLIA_RPC = import.meta.env.VITE_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const SOL_MAINNET_RPC = import.meta.env.VITE_SOLANA_MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
const SOL_DEVNET_RPC = import.meta.env.VITE_SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';
const BTC_MAINNET_REST = import.meta.env.VITE_BTC_MAINNET_REST || 'https://blockstream.info/api';
const BTC_TESTNET_REST = import.meta.env.VITE_BTC_TESTNET_REST || 'https://blockstream.info/testnet/api';

export type AssetSymbol = 'ETH' | 'SOL' | 'BTC' | 'gUSDC';

export interface NetBalance {
  /** Decimal native amount, or null if the read failed. */
  amount: number | null;
  address: string;
}

export interface AssetLive {
  symbol: AssetSymbol;
  name: string;
  mainnet: NetBalance;
  testnet: NetBalance & { network: string };
  priceUsd: number | null;
}

export interface LiveBalances {
  assets: AssetLive[];
  /** Real mainnet USD net worth, or null if prices are unavailable. */
  totalUsd: number | null;
}

async function evmBalance(chain: ChainId, rpc: string, address: string): Promise<number> {
  const adapter = new EvmAdapter(chain, new ProviderPool([new HttpJsonRpcTransport(rpc)]));
  return Number(await adapter.getNativeBalance(address)) / 1e18;
}
async function solBalance(chain: ChainId, rpc: string, address: string): Promise<number> {
  const adapter = new SolanaAdapter(chain, new ProviderPool([new HttpJsonRpcTransport(rpc)]));
  return Number(await adapter.getNativeBalance(address)) / 1e9;
}
async function btcBalance(chain: ChainId, rest: string, address: string): Promise<number> {
  const adapter = new BitcoinAdapter(chain, new HttpRestTransport(rest));
  return Number(await adapter.getNativeBalance(address)) / 1e8;
}
/** The wallet's gUSDC (our GIWA test USDC) balance, read from the AMM's token on GIWA. */
async function gusdcBalance(address: string): Promise<number> {
  if (!GIWA_GUSDC) return 0;
  const adapter = new EvmAdapter('giwa-sepolia', new ProviderPool([new HttpJsonRpcTransport(DEFAULT_GIWA_RPC)]));
  const bals = await adapter.getTokenBalances(address, [{ address: GIWA_GUSDC, symbol: 'gUSDC', decimals: 6 }]);
  return bals[0] ? Number(bals[0].amount) / 1e6 : 0;
}

/** Live USD spot prices from CoinGecko (free, CORS-enabled). Null per-asset on failure. */
async function fetchPrices(): Promise<Record<AssetSymbol, number | null>> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana,bitcoin&vs_currencies=usd', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`price feed ${res.status}`);
    const j = (await res.json()) as Record<string, { usd?: number }>;
    return { ETH: j.ethereum?.usd ?? null, SOL: j.solana?.usd ?? null, BTC: j.bitcoin?.usd ?? null, gUSDC: 1 };
  } catch {
    return { ETH: null, SOL: null, BTC: null, gUSDC: 1 };
  }
}

/**
 * Live USD spot for one asset, cached for a minute. Null when the feed is unavailable — a caller
 * that gates a SPEND CAP on this MUST treat null as "unknown" (stay manual), never as "free".
 *
 * Per-asset, not ETH-only: the bridge moves ETH, SOL or BTC depending on the route, and valuing a
 * SOL bridge at the ETH price would bind the user's caps against the wrong number entirely.
 */
let spotCache: { at: number; px: Record<string, number | null> } | null = null;
export async function spotUsd(symbol: string): Promise<number | null> {
  const up = symbol.toUpperCase();
  const sym = up === 'GUSDC' ? 'gUSDC' : up; // fetchPrices keys the gUSDC constant in MIXED case, so an
  // uppercased 'GUSDC' lookup would miss it and wrongly return null (unpriced) for a $1 constant.
  if (spotCache && Date.now() - spotCache.at < 60_000) return spotCache.px[sym] ?? null;
  const px = await fetchPrices();
  if (px.ETH == null && px.SOL == null && px.BTC == null) return null; // total failure — don't cache it
  spotCache = { at: Date.now(), px };
  return px[sym as AssetSymbol] ?? null;
}

const nullable = (p: Promise<number>): Promise<number | null> => p.then((n) => n, () => null);

let liveCache: { at: number; key: string; value: LiveBalances } | null = null;
let liveInflight: { key: string; promise: Promise<LiveBalances | null> } | null = null;

/**
 * Fetch every native balance (mainnet + testnet) for the unlocked wallet + prices.
 *
 * Cached ~20s + in-flight-deduped, keyed by identity. The Portfolio view mounts InsightsPanel and
 * LiveBalancesPanel together and each asks for the SAME net-worth number; without this they'd fire the
 * whole 8-read + CoinGecko fan-out TWICE, and again on every tab toggle / account switch — doubling
 * public-RPC + explorer load and the CoinGecko 429 risk that silently collapses net worth to "—". The
 * "Refresh net worth" button passes `force` to bypass. Keyed by the identity's EVM address so an
 * account switch (or a concurrent read for a different wallet) never serves the wrong balances.
 */
export async function fetchLiveBalances(force = false): Promise<LiveBalances | null> {
  const me = currentIdentity();
  if (!me) return null;
  // Key on ALL THREE curve addresses, not just EVM: a Solana-only (or BTC-only) IMPORTED account has
  // evm.address === '' (wallet-manager returns an empty EVM address for a single-curve import), so
  // keying on evm.address alone would collapse every such wallet to key '' and serve the first one's
  // balances to the next. The composite is unique across HD + every single-curve import kind.
  const key = `${me.evm.address}|${me.sol.address}|${me.btc.address}`;
  if (!force) {
    if (liveCache && liveCache.key === key && Date.now() - liveCache.at < 20_000) return liveCache.value;
    if (liveInflight && liveInflight.key === key) return liveInflight.promise;
  }
  const run = fetchLiveBalancesUncached(me)
    .then((value) => {
      if (value) liveCache = { at: Date.now(), key, value };
      return value;
    })
    .finally(() => {
      if (liveInflight?.key === key) liveInflight = null;
    });
  liveInflight = { key, promise: run };
  return run;
}

async function fetchLiveBalancesUncached(me: NonNullable<ReturnType<typeof currentIdentity>>): Promise<LiveBalances | null> {
  const tb = btcTestnetAddress() ?? '';

  const [ethM, ethGiwa, ethSep, gusdc, solM, solT, btcM, btcT, px] = await Promise.all([
    nullable(evmBalance('ethereum', ETH_MAINNET_RPC, me.evm.address)),
    // The wallet's ETH lives across both L2 GIWA and Ethereum Sepolia — read + sum both,
    // so a deposit on EITHER testnet auto-shows (not just GIWA).
    nullable(evmBalance('giwa-sepolia', DEFAULT_GIWA_RPC, me.evm.address)),
    nullable(evmBalance('sepolia', SEPOLIA_RPC, me.evm.address)),
    nullable(gusdcBalance(me.evm.address)),
    nullable(solBalance('solana', SOL_MAINNET_RPC, me.sol.address)),
    nullable(solBalance('solana-devnet', SOL_DEVNET_RPC, me.sol.address)),
    nullable(btcBalance('bitcoin', BTC_MAINNET_REST, me.btc.address)),
    tb ? nullable(btcBalance('bitcoin-testnet', BTC_TESTNET_REST, tb)) : Promise.resolve<number | null>(null),
    fetchPrices(),
  ]);
  // Combined testnet ETH (GIWA + Ethereum Sepolia); null only if BOTH reads failed.
  const ethT = ethGiwa == null && ethSep == null ? null : (ethGiwa ?? 0) + (ethSep ?? 0);
  // ETH is read from BOTH testnets (summed above), so always name both — otherwise a $0
  // wallet reads "GIWA Sepolia" only and hides that Ethereum Sepolia is covered too.
  const ethTNetwork = 'GIWA + Sepolia';

  const assets: AssetLive[] = [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      mainnet: { amount: ethM, address: me.evm.address },
      testnet: { amount: ethT, address: me.evm.address, network: ethTNetwork },
      priceUsd: px.ETH,
    },
    {
      // gUSDC lives only on GIWA (our AMM's token) — no mainnet counterpart.
      symbol: 'gUSDC',
      name: 'GIWA Test USDC',
      mainnet: { amount: null, address: me.evm.address },
      testnet: { amount: gusdc, address: me.evm.address, network: 'GIWA Sepolia' },
      priceUsd: px.gUSDC,
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      mainnet: { amount: solM, address: me.sol.address },
      testnet: { amount: solT, address: me.sol.address, network: 'devnet' },
      priceUsd: px.SOL,
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      mainnet: { amount: btcM, address: me.btc.address },
      testnet: { amount: btcT, address: tb, network: 'testnet' },
      priceUsd: px.BTC,
    },
  ];

  // Net worth values BOTH mainnet and testnet holdings at the asset's live price
  // (testnet ETH/SOL/BTC at their mainnet price, gUSDC at $1) — so real testnet
  // activity actually shows up in the total, not just $0.
  // gUSDC's price is a hardcoded $1 (a constant, not a fetched quote), so it must NOT
  // count toward "did the price feed work?": if it did, a full CoinGecko outage would
  // leave this true and silently collapse net worth to just the gUSDC balance — valuing
  // ETH/SOL/BTC at $0 — instead of reporting it unavailable (null → the dashboard's "—").
  const anyPrice = assets.some((a) => a.symbol !== 'gUSDC' && a.priceUsd != null);
  // If a HELD asset has no price (its feed row was missing while others answered), the total is
  // PARTIAL — report it as unknown ("—") rather than silently valuing that holding at $0.
  const heldUnpriced = assets.some((a) => (a.mainnet.amount ?? 0) + (a.testnet.amount ?? 0) > 0 && a.priceUsd == null);
  const totalUsd =
    anyPrice && !heldUnpriced
      ? assets.reduce((sum, a) => {
          const amount = (a.mainnet.amount ?? 0) + (a.testnet.amount ?? 0);
          return sum + (a.priceUsd != null ? amount * a.priceUsd : 0);
        }, 0)
      : null;

  return { assets, totalUsd };
}
