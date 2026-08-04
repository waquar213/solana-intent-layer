/**
 * Real Solana DEX routing via Jupiter — a live `RouteProvider` for the intent planner.
 *
 * Where `StubRouteProvider` prices a swap off an injected feed, this asks Jupiter's public
 * aggregator (`lite-api.jup.ag`, no key) for a REAL quote across Solana's AMMs and returns
 * the actual minimum-out (`otherAmountThreshold`, already slippage-adjusted) + the venues
 * used. It only answers pairs it has mints for (Solana-native tokens); anything else returns
 * `null` so a composite falls through to the next provider (e.g. the EVM stub / 0x).
 *
 * No-fake-data: every number is Jupiter's real quote; a failed/absent quote returns null,
 * never a fabricated route.
 */
import type { Route, RouteProvider } from '@intent-wallet/intents';

/** Known Solana SPL mints (symbol → mint + decimals) Jupiter can route between. */
const MINTS: Record<string, { mint: string; decimals: number }> = {
  SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  WSOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  USDT: { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
  JUP: { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 },
  BONK: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
  JITOSOL: { mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', decimals: 9 },
};

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface JupiterQuote {
  outAmount?: string;
  otherAmountThreshold?: string;
  slippageBps?: number;
  routePlan?: { swapInfo?: { label?: string } }[];
}

/** ~Solana base transaction fee, in micro-USD, for the plan's network-fee estimate. */
const SOLANA_FEE_MICROS = 5_000n; // ~$0.005

/**
 * A `RouteProvider` that quotes Solana swaps live via Jupiter. Returns `null` for pairs it
 * has no mint for (EVM tokens etc.), so it composes cleanly ahead of a fallback provider.
 */
export function makeJupiterRouteProvider(fetchFn?: FetchLike, baseUrl = 'https://lite-api.jup.ag/swap/v1'): RouteProvider {
  const doFetch: FetchLike = fetchFn ?? ((u) => fetch(u, { signal: AbortSignal.timeout(8000) }));
  return {
    async findRoute(input: { fromSymbol: string; toSymbol: string; amountBase: bigint; fromDecimals: number }): Promise<Route | null> {
      const from = MINTS[input.fromSymbol.toUpperCase()];
      const to = MINTS[input.toSymbol.toUpperCase()];
      if (!from || !to || from.mint === to.mint || input.amountBase <= 0n) return null;

      const url = `${baseUrl}/quote?inputMint=${from.mint}&outputMint=${to.mint}&amount=${input.amountBase}&slippageBps=50&restrictIntermediateTokens=true`;
      let quote: JupiterQuote;
      try {
        const res = await doFetch(url);
        if (!res.ok) return null; // rate-limited / no route → let the fallback handle it
        quote = (await res.json()) as JupiterQuote;
      } catch {
        return null;
      }
      if (!quote.outAmount || !quote.otherAmountThreshold) return null;
      // Validate the numeric SHAPE before BigInt(). Jupiter is an external aggregator and the response
      // is an unchecked `as` cast, so a truthy-but-non-integer field ("1.5" / "abc" / a JSON float)
      // would throw OUTSIDE the try/catch above and 500 the entire plan — instead of returning null so
      // the composite falls through to the next provider (the module's whole design). Siblings
      // (btc.ts/solana.ts) type-check before BigInt; do the same here.
      if (!/^\d+$/u.test(String(quote.otherAmountThreshold)) || !/^\d+$/u.test(String(quote.outAmount))) return null;
      // A slippage-adjusted minimum of 0 (illiquid / very-high-impact pair) is not a usable
      // guarantee — never promise "receive at least 0"; let a fallback provider answer.
      const outMinBase = BigInt(quote.otherAmountThreshold);
      if (outMinBase <= 0n) return null;

      const venues = (quote.routePlan ?? [])
        .map((r) => r.swapInfo?.label)
        .filter((l): l is string => typeof l === 'string' && l.length > 0);
      const venue = venues.length > 0 ? venues.join(' + ') : 'Jupiter';

      return {
        legs: [
          { kind: 'swap', chainId: 'solana:mainnet', venue: 'jupiter', description: `Swap ${input.fromSymbol} → ${input.toSymbol} via ${venue}` },
        ],
        outMinBase,
        outDecimals: to.decimals,
        feeMicros: SOLANA_FEE_MICROS,
        slippageBps: quote.slippageBps ?? 50,
        etaSeconds: 30,
      };
    },
  };
}

/** Try each provider in order; the first non-null route wins (real vendors first, stub last). */
export function makeCompositeRoutes(providers: readonly RouteProvider[]): RouteProvider {
  return {
    async findRoute(input: { fromSymbol: string; toSymbol: string; amountBase: bigint; fromDecimals: number }): Promise<Route | null> {
      for (const provider of providers) {
        const route = await provider.findRoute(input);
        if (route) return route;
      }
      return null;
    },
  };
}
