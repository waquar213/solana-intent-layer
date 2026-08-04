/**
 * Candidate generation — the "route discovery" stage. It asks EVERY healthy
 * provider for a quote (via the registries' `collect`, so all aggregators are
 * consulted in parallel), normalizes each quote into a `RouteCandidate`, and
 * attaches the operational metadata the scorer needs (provider health, risk,
 * quote age). Same-chain requests generate swap candidates; cross-chain
 * requests generate bridge candidates. Multi-hop composition is the extension
 * point — the scorer already ranks whatever candidates it is given.
 */
import type { BridgeProvider, ProviderRegistry, SimulationProvider, SwapProvider } from '@intent-wallet/providers';
import type { RouteRequest } from './request.js';
import type { RiskLevel, RouteCandidate } from './types.js';

export interface CandidateGeneratorOptions {
  swaps: ProviderRegistry<SwapProvider>;
  bridges?: ProviderRegistry<BridgeProvider>;
  /** Risk level for a destination asset (from the Risk Engine). Default 'low'. */
  riskFor?: (symbol: string) => RiskLevel;
  /** Max quote age to accept (ms). Default 30_000. */
  maxQuoteAgeMs?: number;
  now?: () => number;
}

export class CandidateGenerator {
  readonly #opts: CandidateGeneratorOptions;
  readonly #now: () => number;

  constructor(options: CandidateGeneratorOptions) {
    this.#opts = options;
    this.#now = options.now ?? Date.now;
  }

  async generate(request: RouteRequest): Promise<RouteCandidate[]> {
    const crossChain = request.toChainId !== undefined && request.toChainId !== request.chainId;
    return crossChain ? this.#bridgeCandidates(request) : this.#swapCandidates(request);
  }

  async #swapCandidates(request: RouteRequest): Promise<RouteCandidate[]> {
    const scores = this.#healthScores(this.#opts.swaps);
    const risk = this.#opts.riskFor?.(request.toSymbol) ?? 'low';
    const maxAge = this.#opts.maxQuoteAgeMs ?? 30_000;
    const quotes = await this.#opts.swaps.collect((p) =>
      p.quote({
        fromSymbol: request.fromSymbol,
        toSymbol: request.toSymbol,
        amountInBase: request.amountInBase,
        fromDecimals: request.fromDecimals,
        chainId: request.chainId,
      }),
    );
    return quotes
      .map(({ result: q }) => q)
      .filter((q) => q.amountOutBase > 0n && this.#now() - q.quotedAt <= maxAge)
      .map((q) => ({
        id: `swap:${q.providerId}`,
        legs: [
          {
            kind: 'swap' as const,
            providerId: q.providerId,
            chainId: request.chainId,
            description: `Swap ${request.fromSymbol}→${request.toSymbol} via ${q.providerId}`,
          },
        ],
        providerIds: [q.providerId],
        outputBase: q.amountOutBase,
        outputDecimals: q.outDecimals,
        feeMicros: q.feeMicros,
        slippageBps: q.slippageBps,
        etaSeconds: q.etaSeconds,
        healthScore: scores.get(q.providerId) ?? 0.5,
        riskLevel: risk,
        quoteAgeMs: Math.max(0, this.#now() - q.quotedAt),
      }));
  }

  async #bridgeCandidates(request: RouteRequest): Promise<RouteCandidate[]> {
    if (!this.#opts.bridges) return [];
    const scores = this.#healthScores(this.#opts.bridges);
    const risk = this.#opts.riskFor?.(request.toSymbol) ?? 'low';
    const maxAge = this.#opts.maxQuoteAgeMs ?? 30_000;
    const quotes = await this.#opts.bridges.collect((p) =>
      p.quote({
        symbol: request.fromSymbol,
        amountInBase: request.amountInBase,
        decimals: request.fromDecimals,
        fromChainId: request.chainId,
        toChainId: request.toChainId as string,
      }),
    );
    return quotes
      .map(({ result: q }) => q)
      .filter((q) => q.amountOutBase > 0n && this.#now() - q.quotedAt <= maxAge)
      .map((q) => ({
        id: `bridge:${q.providerId}`,
        legs: [
          {
            kind: 'bridge' as const,
            providerId: q.providerId,
            chainId: request.chainId,
            description: `Bridge ${request.fromSymbol} ${request.chainId}→${request.toChainId} via ${q.providerId}`,
          },
        ],
        providerIds: [q.providerId],
        outputBase: q.amountOutBase,
        outputDecimals: request.fromDecimals,
        feeMicros: q.feeMicros,
        slippageBps: 0,
        etaSeconds: q.etaSeconds,
        healthScore: scores.get(q.providerId) ?? 0.5,
        riskLevel: risk,
        quoteAgeMs: Math.max(0, this.#now() - q.quotedAt),
      }));
  }

  #healthScores(registry: { snapshots(): Array<{ id: string; score: number }> }): Map<string, number> {
    return new Map(registry.snapshots().map((s) => [s.id, s.score]));
  }
}

/** A simulator wrapper: returns the subset of candidates whose route simulates OK. */
export async function simulateCandidates(
  candidates: RouteCandidate[],
  simulator: SimulationProvider,
): Promise<RouteCandidate[]> {
  const results = await Promise.all(
    candidates.map(async (c) => {
      try {
        const sim = await simulator.simulate({ chainId: c.legs[0]?.chainId ?? '', payload: c });
        return sim.ok ? c : null;
      } catch {
        return null; // a simulation error rejects the candidate — never execute an unsimulated route
      }
    }),
  );
  return results.filter((c): c is RouteCandidate => c !== null);
}
