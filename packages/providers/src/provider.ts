/**
 * Provider plugin interfaces — the integration boundary between the platform
 * and every third-party service (swap/bridge aggregators, price feeds, gas
 * oracles, simulators). NOTHING is hardcoded: adding or replacing a provider is
 * writing a new plugin that implements one of these interfaces and registering
 * it (ADR-0034). The Execution Engine and Route Optimizer select providers
 * through the registry's health scoring — never by name.
 */
export type ProviderKind = 'swap' | 'bridge' | 'price' | 'gas' | 'simulation';

export interface Provider {
  readonly id: string;
  readonly kind: ProviderKind;
}

// --- swap ---
export interface SwapRequest {
  fromSymbol: string;
  toSymbol: string;
  amountInBase: bigint;
  fromDecimals: number;
  chainId: string;
}
export interface SwapQuote {
  providerId: string;
  amountOutBase: bigint;
  outDecimals: number;
  feeMicros: bigint;
  slippageBps: number;
  etaSeconds: number;
  /** Milliseconds since epoch when the quote was produced (caller-stamped); used for staleness. */
  quotedAt: number;
}
export interface SwapProvider extends Provider {
  readonly kind: 'swap';
  quote(request: SwapRequest): Promise<SwapQuote>;
}

// --- bridge ---
export interface BridgeRequest {
  symbol: string;
  amountInBase: bigint;
  decimals: number;
  fromChainId: string;
  toChainId: string;
}
export interface BridgeQuote {
  providerId: string;
  amountOutBase: bigint;
  feeMicros: bigint;
  etaSeconds: number;
  quotedAt: number;
}
export interface BridgeProvider extends Provider {
  readonly kind: 'bridge';
  quote(request: BridgeRequest): Promise<BridgeQuote>;
}

// --- price ---
export interface PriceProvider extends Provider {
  readonly kind: 'price';
  /** USD decimal strings keyed by symbol. */
  getPrices(symbols: string[]): Promise<Record<string, string>>;
}

// --- gas ---
export interface GasProvider extends Provider {
  readonly kind: 'gas';
  /** Network fee estimate for one operation, in micro-USD. */
  estimateFeeMicros(chainId: string): Promise<bigint>;
}

// --- simulation ---
export interface SimulationRequest {
  chainId: string;
  /** Opaque payload the simulator understands (built tx, call, etc.). */
  payload: unknown;
}
export interface SimulationProvider extends Provider {
  readonly kind: 'simulation';
  simulate(request: SimulationRequest): Promise<{ ok: boolean; reason?: string }>;
}
