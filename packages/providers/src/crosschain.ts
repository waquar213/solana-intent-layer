/**
 * Cross-chain best-quote selection — the deterministic "which provider wins" core. Given quotes from N
 * top-level aggregators (LI.FI, deBridge, …) for the SAME route, it ranks them by NET output value
 * (destination USD value − gas − fees) and returns the winner plus the full ranked list for the UI.
 *
 * FAIL-CLOSED for real money: a stale quote or one with no USD valuation can never be chosen as `best`
 * (it cannot be verified as the best deal), though it is kept in `ranked` so the UI stays honest about
 * what came back. Pure + total: no I/O, no clock of its own — `now` is injected — so it is exhaustively
 * testable and can't itself be an attack surface.
 */
import { ProviderError } from './errors.js';
import type { CrossChainSwapQuote } from './provider.js';

export interface BestCrossChainOptions {
  /** Reject quotes older than this many ms (default 60s). */
  maxAgeMs?: number;
  /** Current time (ms since epoch), injected for determinism/testability. Defaults to Date.now(). */
  now?: number;
}

export interface RankedCrossChainQuote {
  quote: CrossChainSwapQuote;
  /** Net USD value after gas+fees, micro-USD; null when the quote is unpriced (ranked last, never `best`). */
  netMicros: bigint | null;
  /** Set when the quote was dropped from contention, with the reason (stale / unpriced). */
  rejected?: string;
}

/** Net USD value of a quote's output after gas and fees, in micro-USD. null (unpriced) => cannot rank. */
export function netValueMicros(q: CrossChainSwapQuote): bigint | null {
  if (q.toValueMicros === null) return null;
  return q.toValueMicros - q.gasMicros - q.feeMicros;
}

/**
 * Choose the best cross-chain quote by net output value. Throws `ProviderError('NO_ROUTE')` if no quote
 * survives (none supplied, all stale, or all unpriced) — never returns an unverifiable "best" for real
 * funds. `ranked` is the full list, best-first among the eligible, with rejected ones (net = null) after.
 */
export function bestCrossChainQuote(
  quotes: readonly CrossChainSwapQuote[],
  options: BestCrossChainOptions = {},
): { best: CrossChainSwapQuote; netMicros: bigint; ranked: readonly RankedCrossChainQuote[] } {
  const maxAgeMs = options.maxAgeMs ?? 60_000;
  const now = options.now ?? Date.now();

  const scored: RankedCrossChainQuote[] = quotes.map((quote) => {
    if (now - quote.quotedAt > maxAgeMs) return { quote, netMicros: null, rejected: 'stale' };
    const net = netValueMicros(quote);
    if (net === null) return { quote, netMicros: null, rejected: 'unpriced' };
    return { quote, netMicros: net };
  });

  const eligible = scored.filter((r): r is RankedCrossChainQuote & { netMicros: bigint } => r.netMicros !== null);
  // Higher net value first; deterministic tiebreak by providerId so the same inputs always pick the same winner.
  eligible.sort((a, b) => (a.netMicros === b.netMicros ? a.quote.providerId.localeCompare(b.quote.providerId) : a.netMicros > b.netMicros ? -1 : 1));
  const rejected = scored.filter((r) => r.netMicros === null);

  const winner = eligible[0];
  if (!winner) {
    throw new ProviderError('NO_ROUTE', `no usable cross-chain quote (${quotes.length} received, all stale or unpriced)`);
  }
  return { best: winner.quote, netMicros: winner.netMicros, ranked: [...eligible, ...rejected] };
}
