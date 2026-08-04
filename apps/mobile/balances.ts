/**
 * Live on-chain balances for the wallet's own addresses — the REAL portfolio, read straight
 * from public/keyed RPCs on the device (no server, no demo data). For each asset it reads the
 * native balance on BOTH mainnet and its testnet, and fetches live USD prices so the dashboard
 * can show a real net worth. Every call is fail-soft: a chain that errors becomes `null` ("—")
 * rather than breaking the whole view. (Port of apps/web/src/balances.ts — env accessor swapped
 * for Expo.)
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
import { btcTestnetAddress } from './broadcast';
import { currentIdentity } from './wallet';
import { timedFetch } from './api';

// Endpoints — each overridable via an EXPO_PUBLIC_* env var, falling back to a public keyless node.
const ETH_MAINNET_RPC = process.env.EXPO_PUBLIC_ETH_MAINNET_RPC ?? 'https://ethereum-rpc.publicnode.com';
const SEPOLIA_RPC = process.env.EXPO_PUBLIC_SEPOLIA_RPC ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const SOL_MAINNET_RPC = process.env.EXPO_PUBLIC_SOLANA_MAINNET_RPC ?? 'https://api.mainnet-beta.solana.com';
const SOL_DEVNET_RPC = process.env.EXPO_PUBLIC_SOLANA_DEVNET_RPC ?? 'https://api.devnet.solana.com';
const BTC_MAINNET_REST = process.env.EXPO_PUBLIC_BTC_MAINNET_REST ?? 'https://blockstream.info/api';
const BTC_TESTNET_REST = process.env.EXPO_PUBLIC_BTC_TESTNET_REST ?? 'https://blockstream.info/testnet/api';

export type AssetSymbol = 'ETH' | 'SOL' | 'BTC';

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
  /** Real 24h price change (%), from CoinGecko. Null if unavailable. */
  change24hPct: number | null;
}

export interface LiveBalances {
  assets: AssetLive[];
  /** Real mainnet USD net worth, or null if prices are unavailable. */
  totalUsd: number | null;
  /** Real portfolio 24h change in USD (weighted from per-asset 24h %), or null. */
  change24hUsd: number | null;
  /** Real portfolio 24h change (%), or null. */
  change24hPct: number | null;
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

interface Px {
  usd: number | null;
  change: number | null;
}
const NO_PX: Px = { usd: null, change: null };

/** Live USD spot prices + 24h change from CoinGecko (free). Null per-asset on failure. */
async function fetchPrices(): Promise<Record<AssetSymbol, Px>> {
  try {
    const res = await timedFetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana,bitcoin&vs_currencies=usd&include_24hr_change=true',
      {},
      8000,
    );
    if (!res.ok) throw new Error(`price feed ${res.status}`);
    const j = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    const pick = (k: string): Px => ({ usd: j[k]?.usd ?? null, change: j[k]?.usd_24h_change ?? null });
    return { ETH: pick('ethereum'), SOL: pick('solana'), BTC: pick('bitcoin') };
  } catch {
    return { ETH: NO_PX, SOL: NO_PX, BTC: NO_PX };
  }
}

const nullable = (p: Promise<number>): Promise<number | null> => p.then((n) => n, () => null);

let liveCache: { at: number; key: string; value: LiveBalances } | null = null;
let liveInflight: { key: string; promise: Promise<LiveBalances | null> } | null = null;

/**
 * Fetch every native balance (mainnet + testnet) for the unlocked wallet + prices. Cached ~20s +
 * in-flight-deduped, keyed by identity (composite evm|sol|btc — a single-curve import has '' for the
 * others). Home and Portfolio each re-fire the full 7-read + CoinGecko fan-out on every tab visit, so
 * without this a rapid Home<->Portfolio toggle hammers the public RPCs and risks a CoinGecko 429 that
 * collapses net worth to "—". `force` (pull-to-refresh) bypasses. Parity with web balances.ts.
 */
export async function fetchLiveBalances(force = false): Promise<LiveBalances | null> {
  const me = currentIdentity();
  if (!me) return null;
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

  const [ethM, ethT, solM, solT, btcM, btcT, px] = await Promise.all([
    nullable(evmBalance('ethereum', ETH_MAINNET_RPC, me.evm.address)),
    nullable(evmBalance('sepolia', SEPOLIA_RPC, me.evm.address)),
    nullable(solBalance('solana', SOL_MAINNET_RPC, me.sol.address)),
    nullable(solBalance('solana-devnet', SOL_DEVNET_RPC, me.sol.address)),
    nullable(btcBalance('bitcoin', BTC_MAINNET_REST, me.btc.address)),
    tb ? nullable(btcBalance('bitcoin-testnet', BTC_TESTNET_REST, tb)) : Promise.resolve<number | null>(null),
    fetchPrices(),
  ]);

  const assets: AssetLive[] = [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      mainnet: { amount: ethM, address: me.evm.address },
      testnet: { amount: ethT, address: me.evm.address, network: 'Sepolia' },
      priceUsd: px.ETH.usd,
      change24hPct: px.ETH.change,
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      mainnet: { amount: solM, address: me.sol.address },
      testnet: { amount: solT, address: me.sol.address, network: 'devnet' },
      priceUsd: px.SOL.usd,
      change24hPct: px.SOL.change,
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      mainnet: { amount: btcM, address: me.btc.address },
      testnet: { amount: btcT, address: tb, network: 'testnet' },
      priceUsd: px.BTC.usd,
      change24hPct: px.BTC.change,
    },
  ];

  const anyPrice = assets.some((a) => a.priceUsd != null);
  const totalUsd = anyPrice
    ? assets.reduce((sum, a) => sum + (a.priceUsd != null && a.mainnet.amount != null ? a.mainnet.amount * a.priceUsd : 0), 0)
    : null;

  // Real portfolio 24h change: value 24h ago = value / (1 + pct/100), summed by mainnet weight.
  let val = 0;
  let val24 = 0;
  let haveChange = false;
  for (const a of assets) {
    if (a.priceUsd == null || a.mainnet.amount == null) continue;
    const v = a.mainnet.amount * a.priceUsd;
    val += v;
    if (a.change24hPct != null) {
      haveChange = true;
      val24 += v / (1 + a.change24hPct / 100);
    } else {
      val24 += v;
    }
  }
  const change24hUsd = haveChange ? val - val24 : null;
  const change24hPct = haveChange && val24 > 0 ? ((val - val24) / val24) * 100 : null;

  return { assets, totalUsd, change24hUsd, change24hPct };
}
