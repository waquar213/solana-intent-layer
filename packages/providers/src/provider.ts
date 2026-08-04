/**
 * Provider plugin interfaces — the integration boundary between the platform
 * and every third-party service (swap/bridge aggregators, price feeds, gas
 * oracles, simulators). NOTHING is hardcoded: adding or replacing a provider is
 * writing a new plugin that implements one of these interfaces and registering
 * it (ADR-0034). The Execution Engine and Route Optimizer select providers
 * through the registry's health scoring — never by name.
 */
export type ProviderKind = 'swap' | 'bridge' | 'crosschain-swap' | 'price' | 'gas' | 'simulation';

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

// --- cross-chain swap (aggregator meta-quote) ---
// Richer than BridgeProvider: any token on chain A -> ANY token on chain B (a swap, not a same-asset
// bridge), and it carries the executable transaction so the wallet can sign it ON-DEVICE (non-custodial).
// Plugins (LI.FI, deBridge, …) each speak their own API; the registry aggregates their quotes and the
// optimizer picks the best. Fail closed: a provider that cannot serve a route returns no quote.
export interface CrossChainSwapRequest {
  /** Canonical source chain id (e.g. 'eip155:42161', 'solana:mainnet'). Each plugin maps it internally. */
  fromChainId: string;
  toChainId: string;
  /** Token symbol or on-chain address on the respective chain. */
  fromToken: string;
  toToken: string;
  amountInBase: bigint;
  fromDecimals: number;
  /** The signer/sender address ON THE SOURCE chain — quotes are per-address (route + gas). */
  fromAddress: string;
  /** Recipient ON THE DESTINATION chain; defaults to the same identity's destination address. */
  toAddress?: string;
  slippageBps: number;
}
/** The provider-native UNSIGNED transaction for the winning route. Signed on-device by the matching key. */
export interface CrossChainSwapExecution {
  ecosystem: 'evm' | 'solana';
  /** Opaque provider payload (EVM TransactionRequest / Solana serialized tx). NEVER a key; NEVER auto-run. */
  readonly raw: unknown;
  /** For an ERC-20 source, the router that fromToken must be approved to before the swap (absent for native). */
  readonly approvalSpender?: string;
  /** The ERC-20 source token's on-chain address (needed to build the approval); absent for a native source. */
  readonly fromTokenAddress?: string;
}
export interface CrossChainSwapQuote {
  providerId: string;
  /** Destination amount received, in base units of `toToken`. */
  toAmountBase: bigint;
  toDecimals: number;
  toTokenSymbol: string;
  /** Provider-reported USD value of the output, micro-USD; null if unpriced (treated as worst, fail-closed). */
  toValueMicros: bigint | null;
  feeMicros: bigint;
  gasMicros: bigint;
  etaSeconds: number;
  /** The underlying bridge/DEX the aggregator selected (e.g. 'across', 'stargate') — surfaced for trust. */
  tool: string;
  /** Human-readable underlying legs (swap/bridge) for the UI. */
  steps: readonly string[];
  /** Unsigned tx to execute this route, signed ON-DEVICE. Absent = quote-only (no execution wired). */
  execution?: CrossChainSwapExecution;
  /** Milliseconds since epoch when the quote was produced (caller-stamped); used for staleness. */
  quotedAt: number;
}
export interface CrossChainSwapProvider extends Provider {
  readonly kind: 'crosschain-swap';
  /** Return a quote, or throw if the route is unsupported/unavailable (registry treats a throw as no-quote). */
  quote(request: CrossChainSwapRequest): Promise<CrossChainSwapQuote>;
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
