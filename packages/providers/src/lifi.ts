/**
 * LI.FI cross-chain-swap provider — one plugin implementing `CrossChainSwapProvider` over the LI.FI
 * aggregation API (li.quest). LI.FI is itself a meta-aggregator (it already routes through Across,
 * Stargate, Hop, deBridge, DEXs …), so this single plugin surfaces the best of many underlying venues;
 * the platform then compares it against OTHER top-level plugins (deBridge, …) in the registry.
 *
 * NON-CUSTODIAL: this only READS a quote and carries back LI.FI's unsigned `transactionRequest`. The
 * wallet signs it ON-DEVICE — no key is ever here, nothing is broadcast here, no funds move here.
 * FAIL-CLOSED: an unknown chain, an error response, or a malformed quote throws (the registry treats a
 * throw as "no quote", so a broken provider can never win the best-quote selection).
 */
import { ProviderError } from './errors.js';
import type { CrossChainSwapProvider, CrossChainSwapQuote, CrossChainSwapRequest } from './provider.js';

/** Minimal fetch shape so the package needs no DOM lib and tests can inject a fake. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface LifiProviderOptions {
  /** Canonical chain id -> LI.FI chain key (numeric EVM id as string, or 'SOL'). Unknown -> undefined (fail closed). */
  resolveChain?: (canonicalChainId: string) => string | undefined;
  /** Injected fetch (defaults to global). */
  fetchImpl?: FetchLike;
  /** Optional LI.FI API key (higher rate limits); quotes work without it. */
  apiKey?: string;
  /** Base URL override (tests). */
  baseUrl?: string;
  /** Clock for `quotedAt` (I/O edge, injectable for tests). */
  now?: () => number;
  /** Per-request timeout ms. */
  timeoutMs?: number;
}

/** Default canonical -> LI.FI chain-key map for the chains this wallet can sign for. Extend as needed. */
const DEFAULT_CHAIN_KEYS: Record<string, string> = {
  'eip155:1': '1', // Ethereum
  'eip155:10': '10', // Optimism
  'eip155:56': '56', // BNB
  'eip155:137': '137', // Polygon
  'eip155:8453': '8453', // Base
  'eip155:42161': '42161', // Arbitrum
  'eip155:43114': '43114', // Avalanche
  'solana:mainnet': 'SOL',
  'solana:101': 'SOL',
};

/** Parse a provider USD decimal string ("99.9035") to integer micro-USD, no float drift. Bad input -> null. */
export function usdStringToMicros(s: string | number | null | undefined): bigint | null {
  if (s === null || s === undefined) return null;
  const str = String(s).trim();
  if (!/^\d+(\.\d+)?$/u.test(str)) return null;
  const [whole = '0', frac = ''] = str.split('.');
  const micros = `${frac}000000`.slice(0, 6);
  try {
    return BigInt(whole) * 1_000_000n + BigInt(micros);
  } catch {
    return null;
  }
}

// --- narrow, defensive readers over the untrusted JSON response ---
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function sumUsdMicros(costs: unknown): bigint {
  let total = 0n;
  for (const c of arr(costs)) {
    const m = usdStringToMicros(str(obj(c).amountUSD));
    if (m !== null) total += m;
  }
  return total;
}

/**
 * Build a LI.FI cross-chain-swap provider. `quote()` returns the best route LI.FI finds for the request,
 * normalized, with the unsigned tx attached for on-device signing.
 */
export function makeLifiProvider(options: LifiProviderOptions = {}): CrossChainSwapProvider {
  const resolveChain = options.resolveChain ?? ((id: string): string | undefined => DEFAULT_CHAIN_KEYS[id]);
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  const baseUrl = options.baseUrl ?? 'https://li.quest/v1';
  const now = options.now ?? ((): number => Date.now());
  const timeoutMs = options.timeoutMs ?? 15_000;

  return {
    id: 'lifi',
    kind: 'crosschain-swap',
    async quote(request: CrossChainSwapRequest): Promise<CrossChainSwapQuote> {
      if (!fetchImpl) throw new ProviderError('PROVIDER_UNAVAILABLE', 'no fetch implementation available');
      const fromChain = resolveChain(request.fromChainId);
      const toChain = resolveChain(request.toChainId);
      if (!fromChain || !toChain) {
        // Fail closed: never quote a chain we can't map (and therefore can't sign for).
        throw new ProviderError('NO_ROUTE', `LI.FI: unsupported route ${request.fromChainId} -> ${request.toChainId}`);
      }
      const params = new URLSearchParams({
        fromChain,
        toChain,
        fromToken: request.fromToken,
        toToken: request.toToken,
        fromAmount: request.amountInBase.toString(),
        fromAddress: request.fromAddress,
        slippage: (request.slippageBps / 10_000).toString(),
      });
      if (request.toAddress) params.set('toAddress', request.toAddress);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let body: unknown;
      try {
        const headers: Record<string, string> = { accept: 'application/json' };
        if (options.apiKey) headers['x-lifi-api-key'] = options.apiKey;
        const res = await fetchImpl(`${baseUrl}/quote?${params.toString()}`, { headers, signal: controller.signal });
        body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = str(obj(body).message) ?? `HTTP ${res.status}`;
          throw new ProviderError('HTTP_ERROR', `LI.FI quote failed: ${msg}`);
        }
      } finally {
        clearTimeout(timer);
      }

      const q = obj(body);
      const estimate = obj(q.estimate);
      const action = obj(q.action);
      const toToken = obj(action.toToken);
      const toAmountRaw = str(estimate.toAmount);
      const decimals = typeof toToken.decimals === 'number' ? toToken.decimals : undefined;
      if (!toAmountRaw || decimals === undefined) {
        // A well-formed quote MUST carry an output amount + decimals. Anything else is refused.
        const msg = str(q.message) ?? 'malformed quote (no toAmount/decimals)';
        throw new ProviderError('INVALID_QUOTE', `LI.FI: ${msg}`);
      }
      let toAmountBase: bigint;
      try {
        toAmountBase = BigInt(toAmountRaw);
      } catch {
        throw new ProviderError('INVALID_QUOTE', 'LI.FI: non-integer toAmount');
      }

      const txReq = q.transactionRequest;
      const ecosystem = fromChain === 'SOL' ? 'solana' : 'evm';
      const approvalSpender = str(estimate.approvalAddress);
      const fromTokenAddr = str(obj(action.fromToken).address);

      return {
        providerId: 'lifi',
        toAmountBase,
        toDecimals: decimals,
        toTokenSymbol: str(toToken.symbol) ?? request.toToken,
        toValueMicros: usdStringToMicros(str(estimate.toAmountUSD)),
        feeMicros: sumUsdMicros(estimate.feeCosts),
        gasMicros: sumUsdMicros(estimate.gasCosts),
        etaSeconds: typeof estimate.executionDuration === 'number' ? estimate.executionDuration : 0,
        tool: str(q.tool) ?? 'lifi',
        steps: arr(q.includedSteps)
          .map((s) => str(obj(s).tool))
          .filter((t): t is string => Boolean(t)),
        quotedAt: now(),
        ...(txReq === undefined
          ? {}
          : {
              execution: {
                ecosystem,
                raw: txReq,
                ...(approvalSpender ? { approvalSpender } : {}),
                ...(fromTokenAddr ? { fromTokenAddress: fromTokenAddr } : {}),
              },
            }),
      };
    },
  };
}
