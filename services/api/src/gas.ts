/**
 * Real EVM network-fee estimation — turns the planner's flat "$0.50" placeholder for
 * `estimateFeeMicros('eip155:*')` into a LIVE estimate: current gas price × a
 * representative gas budget × the live ETH/USD price, all in integer micro-USD.
 *
 * `eth_gasPrice` is a core JSON-RPC method (not a throttled enhanced API), so this works
 * over the free Alchemy Node API. It answers only EVM chains and returns null otherwise
 * (and on any RPC/price gap) so the runtime falls back to its documented static baseline —
 * a real number when we can get one, an honest labelled estimate when we can't, never an
 * invented figure. Exact gas is computed by the device at signing time; this is the
 * pre-sign preview the user sees in the plan.
 */
import { usdToMicros } from '@intent-wallet/portfolio';

/**
 * A representative gas budget for a wallet operation on an EVM chain — an ERC-20
 * transfer / swap / approve blended (native sends are cheaper, complex swaps dearer).
 * The estimate scales with live gas price and ETH price; only the units are assumed.
 */
const REPRESENTATIVE_GAS_UNITS = 120_000n;
const WEI_PER_ETH = 10n ** 18n;

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Build a live fee estimator for the runtime's `liveFeeMicros` seam. Returns micro-USD
 * for EVM chains (`eip155:*`) from `eth_gasPrice` × gas units × ETH price; returns null
 * for non-EVM chains or when the gas price / ETH price is unavailable, so the caller
 * falls back to its static per-chain baseline.
 */
export function makeEvmGasEstimator(deps: {
  rpcUrl: string;
  /** The live ETH/USD price as a decimal string (e.g. from the shared CoinGecko cache). */
  getEthPriceUsd: () => Promise<string | undefined>;
  fetchFn?: FetchLike;
  /** Override the representative gas budget (defaults to a blended wallet operation). */
  gasUnits?: bigint;
}): (chainId: string) => Promise<bigint | null> {
  const doFetch: FetchLike = deps.fetchFn ?? ((u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(8000) }));
  const gasUnits = deps.gasUnits ?? REPRESENTATIVE_GAS_UNITS;

  const gasPriceWei = async (): Promise<bigint | null> => {
    try {
      const res = await doFetch(deps.rpcUrl, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_gasPrice', params: [] }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { result?: string };
      if (typeof body.result !== 'string' || !body.result.startsWith('0x')) return null;
      const wei = BigInt(body.result);
      return wei > 0n ? wei : null;
    } catch {
      return null; // transient RPC error → fall back to the static baseline
    }
  };

  return async (chainId: string): Promise<bigint | null> => {
    // ONLY Ethereum mainnet: this estimator queries a single mainnet RPC and denominates in
    // ETH, so it can correctly price only eip155:1. Any other chain (an L2, or Polygon whose
    // gas is POL not ETH) would get mainnet gas mispriced in the wrong token — return null so
    // the caller uses that chain's static baseline instead of a wrong live number.
    if (chainId !== 'eip155:1') return null;
    const [wei, ethPrice] = await Promise.all([gasPriceWei(), deps.getEthPriceUsd()]);
    if (wei === null || !ethPrice) return null;
    const microsPerEth = usdToMicros(ethPrice); // micro-USD per 1 ETH
    // feeMicros = (gasPriceWei · gasUnits · micro-USD/ETH) / wei-per-ETH — pure integer math.
    const feeMicros = (wei * gasUnits * microsPerEth) / WEI_PER_ETH;
    return feeMicros > 0n ? feeMicros : null;
  };
}
