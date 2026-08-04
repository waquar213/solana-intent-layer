/**
 * Gas-abstraction vocabulary. Money is integer micro-USD (bigint); on-chain gas
 * amounts are base units (wei/lamports, bigint). Nothing here is a float.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Sponsorship (paymaster: the platform pays a user's gas)
// ─────────────────────────────────────────────────────────────────────────────

export interface SponsorshipPolicy {
  enabled: boolean;
  /** Max gas value (µUSD) sponsored for a single transaction. */
  perTxCapMicros: bigint;
  /** Max gas value (µUSD) sponsored per user per UTC day. */
  dailyCapMicros: bigint;
  /** Intent kinds eligible for sponsorship (empty = all eligible). */
  eligibleActions?: readonly string[];
}

export type SponsorshipVerdict = 'sponsor' | 'user_pays' | 'reject';

export interface SponsorshipRequest {
  userId: string;
  action: string;
  /** Estimated gas cost of the transaction, in µUSD. */
  gasCostMicros: bigint;
}

export interface SponsorshipDecision {
  verdict: SponsorshipVerdict;
  /** µUSD the platform would sponsor (0 unless verdict==='sponsor'). */
  sponsoredMicros: bigint;
  reason: string;
}

/** Per-user daily sponsorship spend, keyed by UTC day (reset when the day rolls). */
export interface SponsorshipState {
  day: string;
  spentByUser: Record<string, bigint>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fee-token selection (pay gas in a token other than the native asset)
// ─────────────────────────────────────────────────────────────────────────────

export interface FeeTokenOption {
  symbol: string;
  decimals: number;
  /** Price in µUSD per whole token. */
  priceMicros: bigint;
  /** Available balance in base units. */
  balanceBase: bigint;
  /** Preference rank (lower = preferred, e.g. stablecoins first). Default order = input order. */
  rank?: number;
}

export interface FeeTokenChoice {
  symbol: string;
  /** Base units of the fee token required to cover gas + margin. */
  amountBase: bigint;
  /** The µUSD value of that amount. */
  valueMicros: bigint;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gas parameters (EIP-1559), bounded
// ─────────────────────────────────────────────────────────────────────────────

export interface FeeBasis {
  /** Current base fee per gas (wei). */
  baseFeePerGas: bigint;
  /** Suggested priority fee per gas (wei). */
  priorityFeePerGas: bigint;
}

export type GasSpeed = 'slow' | 'normal' | 'fast';

export interface GasCaps {
  /** Hard ceiling on maxFeePerGas (wei) — never overpay past this during a spike. */
  maxFeePerGasCap: bigint;
  /** Hard ceiling on maxPriorityFeePerGas (wei). */
  maxPriorityFeePerGasCap: bigint;
}

export interface GasParams {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  /** True if a cap constrained the computed value. */
  bounded: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart-account batching (ERC-4337 UserOperation composition)
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchPolicy {
  /** Max operations folded into one UserOperation. */
  maxBatchSize: number;
}
