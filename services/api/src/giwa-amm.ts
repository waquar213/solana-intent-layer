/**
 * Real GIWA routing via our own on-chain SimpleAMM — the RouteProvider that makes ETH<->gUSDC
 * swaps PLAN on GIWA Sepolia (so the intent flow is genuinely GIWA-first at plan time, not just
 * corrected at execution). It quotes the deployed SimpleAMM with a keyless `eth_call` over the
 * GIWA RPC — the same contract + selectors the browser signs the real swap with. Answers only
 * ETH<->gUSDC (USDC is accepted as an alias for gUSDC); anything else returns null so the
 * composite falls through to Jupiter / Uniswap / the deterministic stub.
 *
 * No-fake-data: every number is the live on-chain reserve / quote; a failed call returns null.
 */
import { decodeUint, encodeUint256 } from '@intent-wallet/chains';
import type { Route, RouteProvider } from '@intent-wallet/intents';

/** GIWA Sepolia (chain id 91342) in CAIP-2 form. */
const GIWA_CHAIN = 'eip155:91342';
/** The deployed SimpleAMM (overridable for a redeploy). */
const AMM = (process.env.IW_GIWA_AMM || '0x213ca9c221612011ad2bb545a6736da300afbf83').trim();
const GUSDC_DECIMALS = 6;
const ETH_DECIMALS = 18;
const SLIPPAGE_BPS = 50; // 0.5% guaranteed floor
const GIWA_GAS_MICROS = 20_000n; // ~$0.02 of GIWA gas

// SimpleAMM function selectors — identical to apps/web/src/broadcast.ts.
const QUOTE_ETH_FOR_TOKEN = '0x8ca667be'; // quoteEthForToken(uint256 ethIn) -> gUSDC out
const RESERVE_ETH = '0x899b1528'; // reserveEth()
const RESERVE_TOKEN = '0xf4325d67'; // reserveToken()

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** USDC is accepted as the human alias for the GIWA-native gUSDC (they're the same venue here). */
const isStable = (s: string): boolean => {
  const u = s.toUpperCase();
  return u === 'GUSDC' || u === 'USDC';
};

/** A `RouteProvider` that quotes ETH<->gUSDC live on the GIWA SimpleAMM over `rpcUrl`. */
export function makeGiwaAmmRouteProvider(rpcUrl: string, fetchFn?: FetchLike): RouteProvider {
  const doFetch: FetchLike = fetchFn ?? ((u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(8000) }));

  const ethCall = async (data: string): Promise<bigint> => {
    const res = await doFetch(rpcUrl, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_call', params: [{ to: AMM, data }, 'latest'] }),
    });
    if (!res.ok) throw new Error(`giwa amm eth_call failed (HTTP ${res.status})`);
    const body = (await res.json()) as { result?: string; error?: unknown };
    if (body.error || !body.result || body.result === '0x') throw new Error('giwa amm quote unavailable');
    return decodeUint(body.result);
  };

  return {
    async findRoute(input: {
      fromSymbol: string;
      toSymbol: string;
      amountBase: bigint;
      fromDecimals: number;
    }): Promise<Route | null> {
      if (!AMM || input.amountBase <= 0n) return null;
      const from = input.fromSymbol.toUpperCase();
      const to = input.toSymbol.toUpperCase();
      const ethToStable = from === 'ETH' && isStable(to);
      const stableToEth = isStable(from) && to === 'ETH';
      if (!ethToStable && !stableToEth) return null;

      try {
        let outBase: bigint;
        let outDecimals: number;
        if (ethToStable) {
          outBase = await ethCall(`${QUOTE_ETH_FOR_TOKEN}${encodeUint256(input.amountBase)}`);
          outDecimals = GUSDC_DECIMALS;
        } else {
          const [reserveEth, reserveToken] = await Promise.all([ethCall(RESERVE_ETH), ethCall(RESERVE_TOKEN)]);
          if (reserveEth === 0n || reserveToken === 0n) return null;
          // gUSDC in -> ETH out: constant-product with the 0.3% fee (x*997 form).
          const withFee = input.amountBase * 997n;
          outBase = (withFee * reserveEth) / (reserveToken * 1000n + withFee);
          outDecimals = ETH_DECIMALS;
        }
        if (outBase <= 0n) return null;
        const outMinBase = (outBase * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n;
        if (outMinBase <= 0n) return null;

        return {
          legs: [
            {
              kind: 'swap',
              chainId: GIWA_CHAIN,
              venue: 'giwa-simpleamm',
              description: `Swap ${from} → ${to === 'USDC' ? 'gUSDC' : to} via GIWA SimpleAMM`,
            },
          ],
          outMinBase,
          outDecimals,
          feeMicros: GIWA_GAS_MICROS,
          slippageBps: SLIPPAGE_BPS,
          etaSeconds: 5,
        };
      } catch {
        return null;
      }
    },
  };
}
