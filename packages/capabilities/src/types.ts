/**
 * The capability vocabulary — string-literal unions + `as const` value tuples (no
 * `enum`: the repo is enum-free and `verbatimModuleSyntax`/`isolatedModules` make
 * const-enums a footgun). Everything here is pure data description; nothing imports
 * another package. Money/amounts don't appear — this layer only answers "CAN it?",
 * never "how much".
 *
 * Chains are keyed on CAIP-2 ids (`eip155:1`, `bip122:bitcoin`, `solana:mainnet`) —
 * the id space the Intent Engine + runtime speak — NOT the `@intent-wallet/chains`
 * ChainId union. Mapping between the two is the caller's job, never duplicated here.
 */

/** The controlled vocabulary of features a chain may support. Absent ⇒ NOT supported. */
export const CAPABILITIES = [
  'transfer',
  'swap',
  'bridge',
  'approve',
  'stake',
  'smart_account',
  'gas_sponsorship',
  'fee_token',
  'atomic_swap_htlc',
  'arbitrary_call',
  'nft',
  'memo',
  'dest_tag',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** How a chain prices gas. Drives fee-market strategy (replaces an `eip155:` prefix test). */
export const FEE_MODELS = ['eip1559', 'legacy', 'utxo', 'spl'] as const;
export type FeeModel = (typeof FEE_MODELS)[number];

export const TOKEN_STANDARDS = ['erc20', 'spl', 'none'] as const;
export type TokenStandard = (typeof TOKEN_STANDARDS)[number];

export const ECOSYSTEMS = ['evm', 'btc', 'sol'] as const;
export type Ecosystem = (typeof ECOSYSTEMS)[number];

/** Registry lifecycle of a profile version (mirrors compliance JurisdictionProfile). */
export const PROFILE_STATUSES = ['draft', 'active', 'retired'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

/** Operational stance of a chain — only `supported` is usable; the rest fail closed. */
export const CHAIN_AVAILABILITIES = ['supported', 'testnet_only', 'deprecated', 'maintenance'] as const;
export type ChainAvailability = (typeof CHAIN_AVAILABILITIES)[number];

/** Plan step kinds — mirrors `@intent-wallet/intents` schema.ts (kept in sync by test). */
export const PLAN_STEP_KINDS = ['transfer', 'swap', 'bridge', 'approve', 'stake'] as const;
export type PlanStepKind = (typeof PLAN_STEP_KINDS)[number];

/** Provider route classes a declaration can describe. */
export const ROUTE_ACTIONS = ['swap_same_chain', 'bridge_cross_chain'] as const;
export type RouteAction = (typeof ROUTE_ACTIONS)[number];

export interface FinalitySpec {
  kind: 'confirmations' | 'evm_finalized_tag' | 'solana_commitment';
  /** For `confirmations`: how many blocks. */
  confirmations?: number;
  /** For `solana_commitment`: which commitment level. */
  commitment?: 'confirmed' | 'finalized';
}

export interface NativeAsset {
  symbol: string;
  name: string;
  decimals: number;
}

/**
 * A chain's capability posture as VERSIONED DATA. Every security/behaviour-relevant
 * feature fact lives here; the planner/router read it, never assume it. Optional
 * fields are OMITTED when absent (exactOptionalPropertyTypes), never set undefined.
 */
export interface ChainCapabilityProfile {
  /** CAIP-2 id — the key consumers speak. */
  id: string;
  /** Monotonic per id; a new posture is published, never mutated in place. */
  version: number;
  status: ProfileStatus;
  availability: ChainAvailability;
  label: string;
  ecosystem: Ecosystem;
  effectiveFromIso: string;
  nativeAsset: NativeAsset;
  feeModel: FeeModel;
  finality: FinalitySpec;
  tokenStandard: TokenStandard;
  /** The vocabulary this chain supports. Fail-closed: a capability absent here is unsupported. */
  capabilities: readonly Capability[];
  smartAccount: { supported: boolean; standard?: 'erc4337' };
  staking: { supported: boolean; consensus?: 'pos' | 'pow' };
  addressing: { memoRequired: boolean; destTagRequired: boolean };
  notes?: string;
}

/**
 * A STATIC provider/bridge route-class fact — deliberately health-free. It says a
 * route class EXISTS ("Stargate CAN bridge eip155:1 → eip155:137 for USDC"), never
 * whether that provider is healthy right now (that lives in @intent-wallet/providers).
 */
export interface ProviderRouteDeclaration {
  providerId: string;
  kind: 'swap' | 'bridge';
  action: RouteAction;
  fromChainId: string;
  /** Same as `fromChainId` for a same-chain swap. */
  toChainId: string;
  /** The asset symbol the route class handles. */
  symbol: string;
  /** Integration-time toggle ("we are configured to offer this class"), NOT liveness. */
  enabled: boolean;
}

export interface StepFeasibility {
  supported: boolean;
  reason?: string;
}

/** One step's capability query input, decoupled from the intents ExecutionPlan type. */
export interface StepCapabilityInput {
  seq?: number;
  kind: PlanStepKind;
  chainId: string;
  /** Destination chain for a bridge step. */
  toChainId?: string;
  /** Asset symbol, where the check needs it (swap/bridge route existence). */
  symbol?: string;
}

export interface PlanFeasibility {
  feasible: boolean;
  unsupported: readonly { seq: number; kind: PlanStepKind; chainId: string; reason: string }[];
}
