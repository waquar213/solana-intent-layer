/**
 * Real EVM DEX routing via Uniswap v3 (Ethereum mainnet) — a live `RouteProvider` for the
 * intent planner, the EVM counterpart to the Jupiter (Solana) provider.
 *
 * It asks Uniswap's QuoterV2 for a REAL price with a keyless `eth_call` (a view-style call,
 * no signature) over the configured mainnet RPC, trying each fee tier and keeping the best
 * out. The ABI encoding is reused from `@intent-wallet/chains` (the same code the browser
 * signs real Sepolia swaps with). Answers only the mainnet tokens it knows; returns null
 * otherwise so a composite falls through. No-fake-data: the amount is Uniswap's real quote.
 */
import { decodeQuotedAmountOut, encodeQuoteExactInputSingle } from '@intent-wallet/chains';
import type { Route, RouteProvider } from '@intent-wallet/intents';

/** Uniswap v3 QuoterV2, Ethereum mainnet. */
const QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const FEE_TIERS = [500, 3000, 10000] as const;
const SLIPPAGE_BPS = 50;
/** ~$0.50 mainnet swap gas, for the plan's network-fee estimate. */
const EVM_GAS_MICROS = 500_000n;

/** Mainnet token addresses (symbol → ERC-20 + decimals). ETH routes as WETH. */
const TOKENS: Record<string, { address: string; decimals: number }> = {
  ETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
  USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  DAI: { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
  WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
};

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** A `RouteProvider` that quotes EVM swaps live via Uniswap v3 QuoterV2 over `rpcUrl`. */
export function makeUniswapRouteProvider(rpcUrl: string, fetchFn?: FetchLike): RouteProvider {
  const doFetch: FetchLike = fetchFn ?? ((u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(8000) }));

  const ethCall = async (to: string, data: string): Promise<string> => {
    const res = await doFetch(rpcUrl, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'] }),
    });
    if (!res.ok) throw new Error(`uniswap eth_call failed (HTTP ${res.status})`);
    const body = (await res.json()) as { result?: string; error?: unknown };
    if (body.error || !body.result) throw new Error('uniswap quote unavailable');
    return body.result;
  };

  return {
    async findRoute(input: { fromSymbol: string; toSymbol: string; amountBase: bigint; fromDecimals: number }): Promise<Route | null> {
      const from = TOKENS[input.fromSymbol.toUpperCase()];
      const to = TOKENS[input.toSymbol.toUpperCase()];
      if (!from || !to || from.address.toLowerCase() === to.address.toLowerCase() || input.amountBase <= 0n) return null;

      let bestOut = 0n;
      let bestFee = 3000;
      for (const fee of FEE_TIERS) {
        try {
          const data = encodeQuoteExactInputSingle({ tokenIn: from.address, tokenOut: to.address, amountIn: input.amountBase, fee });
          const out = decodeQuotedAmountOut(await ethCall(QUOTER_V2, data));
          if (out > bestOut) {
            bestOut = out;
            bestFee = fee;
          }
        } catch {
          // no pool at this tier / transient RPC error — try the next tier.
        }
      }
      if (bestOut <= 0n) return null; // no liquid pool → let the fallback provider answer

      const outMinBase = (bestOut * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n;
      return {
        legs: [
          {
            kind: 'swap',
            chainId: 'eip155:1',
            venue: 'uniswap-v3',
            description: `Swap ${input.fromSymbol} → ${input.toSymbol} via Uniswap v3 (${bestFee / 10_000}% pool)`,
          },
        ],
        outMinBase,
        outDecimals: to.decimals,
        feeMicros: EVM_GAS_MICROS,
        slippageBps: SLIPPAGE_BPS,
        etaSeconds: 30,
      };
    },
  };
}
