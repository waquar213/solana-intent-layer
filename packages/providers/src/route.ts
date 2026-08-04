/**
 * RouteOptimizer — composes providers into an executable route. Same-chain
 * conversions aggregate swap providers for the best quote; cross-chain
 * conversions add a bridge leg. It produces a provider-native `Route`; the
 * backend maps that onto the Intent Engine's `RouteProvider` interface (so the
 * planner's injected route source is backed by real aggregated quotes). No
 * bridge or DEX is hardcoded — everything flows through the registries.
 */
import type { BridgeProvider, SwapProvider, SwapRequest } from './provider.js';
import type { ProviderRegistry } from './registry.js';
import { bestSwapQuote, type QuoteValidationOptions } from './aggregate.js';

export interface RouteLeg {
  kind: 'swap' | 'bridge';
  providerId: string;
  chainId: string;
  description: string;
}

export interface Route {
  legs: RouteLeg[];
  amountOutBase: bigint;
  outDecimals: number;
  feeMicros: bigint;
  slippageBps: number;
  etaSeconds: number;
}

export interface RouteOptimizerOptions {
  swaps: ProviderRegistry<SwapProvider>;
  bridges?: ProviderRegistry<BridgeProvider>;
  validation?: QuoteValidationOptions;
}

export class RouteOptimizer {
  readonly #swaps: ProviderRegistry<SwapProvider>;
  readonly #bridges: ProviderRegistry<BridgeProvider> | undefined;
  readonly #validation: QuoteValidationOptions;

  constructor(options: RouteOptimizerOptions) {
    this.#swaps = options.swaps;
    this.#bridges = options.bridges;
    this.#validation = options.validation ?? {};
  }

  /** Finds the best same-chain swap route. Returns null if no valid quote exists. */
  async findSwapRoute(request: SwapRequest): Promise<Route | null> {
    const quote = await bestSwapQuote(this.#swaps, request, this.#validation);
    if (!quote) return null;
    return {
      legs: [
        {
          kind: 'swap',
          providerId: quote.providerId,
          chainId: request.chainId,
          description: `Swap ${request.fromSymbol} → ${request.toSymbol} via ${quote.providerId}`,
        },
      ],
      amountOutBase: quote.amountOutBase,
      outDecimals: quote.outDecimals,
      feeMicros: quote.feeMicros,
      slippageBps: quote.slippageBps,
      etaSeconds: quote.etaSeconds,
    };
  }

  /** Cross-chain: bridge the asset, then (optionally) swap on the destination. Bridge-only for MVP. */
  async findBridgeRoute(request: {
    symbol: string;
    amountInBase: bigint;
    decimals: number;
    fromChainId: string;
    toChainId: string;
  }): Promise<Route | null> {
    if (!this.#bridges) return null;
    const now = this.#validation.now ?? Date.now;
    const maxAgeMs = this.#validation.maxAgeMs ?? 30_000;
    const collected = await this.#bridges.collect((p) => p.quote(request));
    const valid = collected.map((c) => c.result).filter((q) => q.amountOutBase > 0n && now() - q.quotedAt <= maxAgeMs);
    if (valid.length === 0) return null;
    valid.sort((a, b) => (a.amountOutBase > b.amountOutBase ? -1 : a.amountOutBase < b.amountOutBase ? 1 : 0));
    const best = valid[0]!;
    return {
      legs: [
        {
          kind: 'bridge',
          providerId: best.providerId,
          chainId: request.fromChainId,
          description: `Bridge ${request.symbol} ${request.fromChainId} → ${request.toChainId} via ${best.providerId}`,
        },
      ],
      amountOutBase: best.amountOutBase,
      outDecimals: request.decimals,
      feeMicros: best.feeMicros,
      slippageBps: 0,
      etaSeconds: best.etaSeconds,
    };
  }
}
