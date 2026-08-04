/**
 * Quote aggregation + response validation. Provider responses are NEVER trusted
 * blindly: a quote must pass sanity checks (positive output, sane slippage, not
 * stale) before it can win. We fan out to every healthy provider, drop the
 * invalid/stale ones, and pick the best net outcome. This is where "use the
 * best of N aggregators" actually happens.
 */
import type { SwapProvider, SwapQuote, SwapRequest } from './provider.js';
import type { ProviderRegistry } from './registry.js';

export interface QuoteValidationOptions {
  /** Reject quotes older than this (ms). Default 30_000 (matches the 30s quote expiry). */
  maxAgeMs?: number;
  /** Reject quotes above this slippage. Default 1000 bps (10%). */
  maxSlippageBps?: number;
  now?: () => number;
}

/** Structural + freshness validation of a swap quote. */
export function isValidSwapQuote(quote: SwapQuote, options: QuoteValidationOptions = {}): boolean {
  const now = options.now ?? Date.now;
  const maxAgeMs = options.maxAgeMs ?? 30_000;
  const maxSlippageBps = options.maxSlippageBps ?? 1000;
  if (quote.amountOutBase <= 0n) return false;
  if (quote.feeMicros < 0n) return false;
  if (quote.slippageBps < 0 || quote.slippageBps > maxSlippageBps) return false;
  if (now() - quote.quotedAt > maxAgeMs) return false; // stale
  return true;
}

/**
 * Best swap quote across all healthy providers. Ranks by output (more of the
 * destination asset is better), tie-breaking on lower fee. Returns null if no
 * provider returns a valid, fresh quote.
 */
export async function bestSwapQuote(
  registry: ProviderRegistry<SwapProvider>,
  request: SwapRequest,
  options: QuoteValidationOptions = {},
): Promise<SwapQuote | null> {
  const collected = await registry.collect((p) => p.quote(request));
  const valid = collected.map((c) => c.result).filter((q) => isValidSwapQuote(q, options));
  if (valid.length === 0) return null;
  valid.sort((a, b) => {
    if (a.amountOutBase !== b.amountOutBase) return a.amountOutBase > b.amountOutBase ? -1 : 1;
    return a.feeMicros < b.feeMicros ? -1 : a.feeMicros > b.feeMicros ? 1 : 0;
  });
  return valid[0] as SwapQuote;
}
