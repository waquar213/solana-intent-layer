/**
 * The wire types of the Intent Wallet `/v1` API — the single source of truth for
 * every request and response shape. Money is ALWAYS a decimal string (never a number
 * or bigint): the server serializes µUSD as strings and the SDK must not coerce them,
 * so exactness is preserved end to end. These are pure types — no runtime.
 */

// ── Plan (POST /v1/intents/plan) ─────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'block';

export interface PlanAmount {
  symbol: string;
  base: string;
  decimals: number;
  valueMicros?: string;
}

export interface PlanStep {
  seq: number;
  kind: string;
  chainId: string;
  description: string;
  /** seq numbers this step depends on (empty = can start immediately). Always sent by the server. */
  dependsOn: number[];
  /**
   * Concrete execution params the device acts on — e.g. a transfer carries
   * `{ asset, amountBase, to }`. The server contract permits ANY JSON value per key
   * (Record<string, unknown>), so it must not be narrowed to string; the on-device
   * signer consumes them (the runtime never signs).
   */
  params: Record<string, unknown>;
}

export interface ExecutionPlan {
  planId: string;
  /** The originating intent id (the plan is one realization of it). Always sent by the server. */
  intentId: string;
  intentKind: string;
  assets: string[];
  /** Chains funds move FROM / TO — a cross-chain plan lists both. Always sent by the server. */
  sourceChains: string[];
  destChains: string[];
  steps: PlanStep[];
  quote: {
    youSend: PlanAmount;
    youReceiveMin: PlanAmount | null;
    totalFeeMicros: string;
    feePct: number;
    slippageBps: number;
    etaSeconds: number;
  };
  risk: { level: RiskLevel; reasons: string[] };
  requiresStepUp: boolean;
  confirmation: string;
  fallback: string;
  rollback: string | null;
}

export type Outcome =
  | { kind: 'plan'; plan: ExecutionPlan }
  | { kind: 'clarify'; question: string; options?: string[] }
  | { kind: 'answer'; question: string }
  | { kind: 'automation'; intentKind: string }
  | { kind: 'rejected'; reason: string; risk: { level: RiskLevel; reasons: string[] } };

export interface PlanResponse {
  intentKind: string;
  outcome: Outcome;
}

// ── Portfolio (GET /v1/portfolio) ────────────────────────────────────────────

export interface PortfolioHolding {
  symbol: string;
  amount: string;
  priceUsd: string | null;
  valueMicros: string | null;
}

export interface PortfolioSummary {
  totalValueMicros: string;
  holdings: PortfolioHolding[];
}

// ── Insights (GET /v1/portfolio/insights) ────────────────────────────────────
// Mirrors @intent-wallet/intelligence's PortfolioIntelligence with every bigint
// µUSD serialized as a decimal string (the route's toJsonSafe projection).

/** One slice of an allocation breakdown (weight is 0..1 of gross assets). */
export interface AllocationSlice {
  key: string;
  valueMicros: string;
  weight: number;
}

export interface InsightsAllocation {
  byAsset: AllocationSlice[];
  bySector: AllocationSlice[];
  byChain: AllocationSlice[];
  byProtocol: AllocationSlice[];
  byLiquidity: AllocationSlice[];
  /** Stablecoin share of gross assets, [0,1]. */
  stablecoinWeight: number;
}

export interface InsightsConcentration {
  hhi: number;
  effectivePositions: number;
  topAssetWeight: number;
  top3Weight: number;
}

export interface InsightsRisk {
  diversificationScore: number;
  liquidWeight: number;
  lockedWeight: number;
  illiquidWeight: number;
  leverage: number;
  bridgeExposure: number;
  /** Composite portfolio health, [0,100]. */
  healthScore: number;
}

/** An observation from the intelligence engine — it analyzes, never signs/executes. */
export interface InsightItem {
  code: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  detail: string;
  suggestedAction?: string;
}

/**
 * Portfolio intelligence — allocation / concentration / risk / health / insights.
 * `stale: true` means some position or price feeding the analysis was unknown or
 * stale — surface it, never hide it.
 */
export interface PortfolioInsights {
  identityId: string;
  asOf: string;
  netWorthMicros: string;
  grossAssetsMicros: string;
  debtMicros: string;
  positionCount: number;
  allocation: InsightsAllocation;
  concentration: InsightsConcentration;
  risk: InsightsRisk;
  insights: InsightItem[];
  stale: boolean;
}

// ── Authorize (POST /v1/intents/authorize) ───────────────────────────────────

export type Gate = 'allow' | 'require_confirmation' | 'defer' | 'escalate' | 'block';

export interface ConfirmationRequirement {
  kind: 'biometric' | 'device_pin' | 'passkey' | 'second_approver' | 'waiting_period' | 'guardian_quorum';
  role?: string;
  seconds?: number;
  m?: number;
  n?: number;
}

export interface Permission {
  gate: Gate;
  mayProceedToSign: boolean;
  drivenBy: ('risk' | 'policy')[];
  reasons: string[];
  requirements: ConfirmationRequirement[];
  riskLevel: RiskLevel;
  planId?: string;
  intentId?: string;
}

// ── Execute (POST /v1/intents/execute) ───────────────────────────────────────

export type ExecutionStatus = 'running' | 'completed' | 'parked' | 'failed';

export interface StepState {
  seq: number;
  kind: string;
  chainId: string;
  status: string;
  txid?: string;
}

export interface Execution {
  id: string;
  planId: string;
  status: ExecutionStatus;
  steps: StepState[];
  fundsLocation: { chainId: string; note: string };
}

/** The /execute response: it ran, or the server-side re-authorization refused it. */
export interface ExecuteResult {
  executed: boolean;
  permission: Permission;
  execution?: Execution;
}

// ── Status (GET /v1/status) ──────────────────────────────────────────────────

export interface StatusResponse {
  service: 'intent-wallet-api';
  apiVersion: 'v1';
  status: 'operational';
}

// ── Universal Identity (GET /v1/identity) ────────────────────────────────────

export interface IdentityAddress {
  /** Receive address in the chain's canonical format. */
  address: string;
  /** The exact BIP-32 derivation path (proves it's really derived, not invented). */
  path: string;
}

/** One identity, three chains — the same account index across BTC, EVM, and Solana. */
export interface Identity {
  index: number;
  evm: IdentityAddress;
  btc: IdentityAddress;
  sol: IdentityAddress;
}

// ── Request bodies ───────────────────────────────────────────────────────────

export interface PlanRequest {
  utterance: string;
}
export interface AuthorizeRequest {
  planId: string;
  principalId?: string;
}
export interface ExecuteRequest {
  planId: string;
}

/** RFC 9457 problem+json — the shape every API error is returned in. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance?: string;
  details?: Record<string, unknown>;
}
