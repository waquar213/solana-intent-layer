/**
 * Portfolio Intelligence — the shared vocabulary of the financial brain.
 *
 * MONEY vs RATIO discipline (the one rule that keeps this engine correct):
 *  - Any amount of MONEY is an integer `bigint` in micro-USD (µUSD, 1 USD =
 *    1_000_000 µUSD). Never a float. See `money.ts` (re-exported from
 *    @intent-wallet/portfolio).
 *  - Any quantity DERIVED from money that is dimensionless — a return, a
 *    weight, a volatility, a correlation, a score — is a `number`. That is
 *    correct: a ratio is not money, and float rounding on a ratio is a
 *    presentation concern, not a value-integrity one.
 *
 * The engine ANALYZES and RECOMMENDS. It never signs and never executes — every
 * output is data (facts + suggestions), consumed by the user or the Intent
 * layer, which alone can act.
 */

// --- Positions: the atomic unit of a portfolio ---

export type AssetClass =
  | 'native' // L1/L2 gas asset (ETH, SOL, BTC, MATIC…)
  | 'stablecoin'
  | 'bluechip' // large-cap non-stable (wBTC, staked ETH…)
  | 'defi' // protocol / governance tokens
  | 'meme'
  | 'nft'
  | 'rwa' // tokenized real-world asset
  | 'lp' // liquidity-pool share
  | 'unknown';

export type PositionKind =
  | 'token' // wallet-held spot
  | 'nft'
  | 'lp' // liquidity pool
  | 'staking'
  | 'lending' // supplied to a money market (an asset)
  | 'borrowing' // debt drawn from a money market (a liability)
  | 'yield' // vault / farm
  | 'reward'; // pending, claimable

export type Liquidity = 'liquid' | 'locked' | 'illiquid';

/** One underlying leg of a composite position (LP / vault), for scenario re-pricing. */
export interface PositionLeg {
  symbol: string;
  valueMicros: bigint;
}

export interface Position {
  id: string;
  kind: PositionKind;
  chainId: string;
  symbol: string;
  /** Base units of the primary asset (bigint). */
  amount: bigint;
  decimals: number;
  /**
   * µUSD value of this position as a positive magnitude. For `borrowing`, this
   * is the debt magnitude — it is SUBTRACTED from net worth, never added.
   */
  valueMicros: bigint;
  /** Protocol id (e.g. 'aave-v3', 'uniswap-v3'); absent for a plain wallet holding. */
  protocol?: string;
  assetClass?: AssetClass;
  /** Acquisition cost in µUSD, if known — enables unrealized PnL. */
  costBasisMicros?: bigint;
  liquidity?: Liquidity;
  /** Underlying legs for LP/vault positions (used by the scenario engine's IL model). */
  legs?: PositionLeg[];
  /** The bridge this value is reachable through / trapped behind (bridge-outage scenario). */
  bridge?: string;
  /** ISO-8601 timestamp of this position's last on-chain activity (inactivity alerts). */
  lastActivityAt?: string;
  stale?: boolean;
}

/** A position after normalization: class + liquidity resolved, signed value + weight attached. */
export interface NormalizedPosition extends Position {
  assetClass: AssetClass;
  liquidity: Liquidity;
  /** Signed µUSD contribution to net worth: borrowing is negative, everything else positive. */
  signedValueMicros: bigint;
  /** Share of GROSS ASSETS in [0,1] (0 for debt positions — debt is scored via leverage). */
  weight: number;
}

// --- Snapshot: everything the engine needs to analyze one portfolio ---

export interface NetWorthPoint {
  asOf: string;
  netWorthMicros: bigint;
}

export interface CashFlow {
  asOf: string;
  /** + deposit into the portfolio, − withdrawal (µUSD). Removes deposit timing from performance. */
  amountMicros: bigint;
}

/** Aligned periodic return series for one asset (ratios), enabling correlation + beta. */
export interface AssetReturnSeries {
  symbol: string;
  returns: number[];
}

export interface PortfolioSnapshot {
  identityId: string;
  /** ISO-8601 timestamp this snapshot represents (passed in; the engine never reads the clock). */
  asOf: string;
  positions: Position[];
  /** Net-worth time series for performance/volatility/drawdown. Optional. */
  history?: NetWorthPoint[];
  /** Deposits/withdrawals for time-weighted return. Optional. */
  flows?: CashFlow[];
  /** Per-asset aligned return series for correlation-based diversification + scenario beta. */
  assetReturns?: AssetReturnSeries[];
  /** Periods per year for `history`'s cadence (365 daily, 52 weekly, 12 monthly). Default 365. */
  periodsPerYear?: number;
}

// --- Analytics outputs ---

export interface AllocationSlice {
  key: string;
  valueMicros: bigint;
  /** Share of gross assets, [0,1]. */
  weight: number;
}

export interface Allocation {
  byAsset: AllocationSlice[];
  /** By `AssetClass` — the "sector" view. */
  bySector: AllocationSlice[];
  byChain: AllocationSlice[];
  byProtocol: AllocationSlice[];
  byLiquidity: AllocationSlice[];
  /** Stablecoin share of gross assets, [0,1] — the "dry powder" buffer. */
  stablecoinWeight: number;
}

export interface Concentration {
  /** Herfindahl-Hirschman Index of asset weights, Σwᵢ², in [0,1]. Lower = more spread. */
  hhi: number;
  /** Effective number of independent positions, 1/HHI. */
  effectivePositions: number;
  topAssetWeight: number;
  top3Weight: number;
}

export interface GrowthPoint {
  asOf: string;
  netWorthMicros: bigint;
}

export interface Performance {
  unrealizedPnlMicros: bigint;
  /** Unrealized PnL ÷ cost basis (ratio); null when no cost basis is known. */
  unrealizedPnlPct: number | null;
  costBasisMicros: bigint;
  hasHistory: boolean;
  /** Time-weighted return over the window (flow-adjusted, ratio); null without history. */
  twr: number | null;
  growthMicros: bigint | null;
  growthPct: number | null;
  /** Annualized volatility (period-return stdev × √ppy, ratio); null with < 2 points. */
  volatilityAnnual: number | null;
  /** Max drawdown over the window, [0,1]; null without history. */
  maxDrawdown: number | null;
  /** Drawdown from the running peak right now, [0,1]; null without history. */
  currentDrawdown: number | null;
  series: GrowthPoint[];
}

export interface HealthFactor {
  key: string;
  /** Sub-score in [0,100]; higher = healthier. */
  score: number;
  /** Weight of this factor in the composite, [0,1]. */
  weight: number;
  detail: string;
}

export interface RiskProfile {
  /** [0,100]; higher = better diversified. */
  diversificationScore: number;
  /** 'weights' = HHI-only; 'correlation' = correlation-adjusted (needs per-asset returns). */
  diversificationBasis: 'weights' | 'correlation';
  liquidWeight: number;
  lockedWeight: number;
  illiquidWeight: number;
  /** Debt ÷ gross assets, [0,∞). */
  leverage: number;
  /** Share of value trapped behind bridges / non-settlement chains, [0,1]. */
  bridgeExposure: number;
  /** Composite portfolio health, [0,100]. */
  healthScore: number;
  healthFactors: HealthFactor[];
}

// --- Insight engine ---

export type InsightSeverity = 'info' | 'warn' | 'critical';

/** A single figure an insight/alert/narrative cites — always resolved from verified analytics. */
export interface MetricRef {
  /** Dotted metric id, e.g. 'concentration.topAssetWeight'. */
  metric: string;
  value: number | string;
}

export interface Insight {
  code: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** The exact metrics that triggered this insight — verifiable, never invented. */
  evidence: MetricRef[];
  /** A non-executable suggestion. The engine never executes; the user/Intent layer decides. */
  suggestedAction?: string;
}

// --- Alert engine ---

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  /** Dedup key — one logical alert fires once per cooldown window. */
  key: string;
  code: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  evidence: MetricRef[];
  firedAt: string;
}

export interface AlertState {
  /** Last-fired ISO timestamp by alert key (cooldown/dedup). */
  lastFired: Record<string, string>;
}

export interface PriceTarget {
  symbol: string;
  /** µUSD per whole token. */
  thresholdMicros: bigint;
  direction: 'above' | 'below';
  /** Current spot (µUSD per whole token) to compare against. */
  spotMicros: bigint;
}

export type MarketEventKind = 'bridge_exploit' | 'protocol_hack' | 'token_delisted' | 'yield_opportunity';

/** An external market/security event from an injected feed. */
export interface MarketEvent {
  kind: MarketEventKind;
  /** The affected entity: a bridge id, a protocol id, or a token symbol. */
  subject: string;
  detail: string;
  asOf: string;
  severity?: AlertSeverity;
  /** For yield opportunities: the offered APR (ratio). */
  apr?: number;
}

// --- Scenario engine ---

export type Scenario =
  | { kind: 'priceShock'; symbol: string; deltaPct: number; propagate?: boolean }
  | { kind: 'gasPrice'; gwei: number }
  | { kind: 'bridgeUnavailable'; bridge: string };

export interface GasProfile {
  nativeSymbol: string;
  nativePriceMicros: bigint;
  /** Total gas units of the user's typical/pending operations. */
  gasUnits: bigint;
  currentGwei: number;
}

export interface PositionDelta {
  id: string;
  symbol: string;
  beforeMicros: bigint;
  afterMicros: bigint;
  deltaMicros: bigint;
}

export interface ScenarioResult {
  scenario: Scenario;
  netWorthBeforeMicros: bigint;
  netWorthAfterMicros: bigint;
  deltaMicros: bigint;
  deltaPct: number;
  positionDeltas: PositionDelta[];
  /** Gas scenarios: extra USD cost of the reference operations (µUSD). */
  gasCostDeltaMicros?: bigint;
  /** Bridge scenarios: value newly trapped behind the failed bridge (µUSD). */
  trappedValueMicros?: bigint;
  notes: string[];
}

// --- Tax analytics ---

export type TaxMethod = 'FIFO' | 'LIFO' | 'HIFO' | 'AVERAGE';
export type TaxTerm = 'short' | 'long';

export interface TaxAcquisition {
  asset: string;
  amount: bigint;
  costBasisMicros: bigint;
  asOf: string;
}

export interface TaxDisposal {
  asset: string;
  amount: bigint;
  proceedsMicros: bigint;
  asOf: string;
}

export type TaxEvent = ({ type: 'acquire' } & TaxAcquisition) | ({ type: 'dispose' } & TaxDisposal);

export interface TaxConfig {
  method: TaxMethod;
  /** Holding period (days) at/above which a gain is long-term. Jurisdiction parameter. */
  longTermThresholdDays: number;
  jurisdiction: string;
}

export interface RealizedGain {
  asset: string;
  amount: bigint;
  proceedsMicros: bigint;
  costBasisMicros: bigint;
  /** proceeds − cost (µUSD); may be negative (a loss). */
  gainMicros: bigint;
  term: TaxTerm;
  acquiredAt: string;
  disposedAt: string;
}

export interface TaxReport {
  method: TaxMethod;
  jurisdiction: string;
  disposals: RealizedGain[];
  totals: {
    proceedsMicros: bigint;
    costBasisMicros: bigint;
    netGainMicros: bigint;
    shortTermGainMicros: bigint;
    longTermGainMicros: bigint;
  };
  /** Disposal quantity that could not be matched to a lot (missing acquisition history). */
  unmatched: TaxDisposal[];
}

// --- AI narration boundary ---

export type NarrativeKind = 'overview' | 'weekly' | 'risk' | 'diversification';

export interface NarrativeReport {
  kind: NarrativeKind;
  text: string;
  /** Every figure the narrative cites, resolved from verified intelligence — the anti-fabrication guard. */
  citations: MetricRef[];
}

// --- The aggregate intelligence object ---

export interface PortfolioIntelligence {
  identityId: string;
  asOf: string;
  netWorthMicros: bigint;
  grossAssetsMicros: bigint;
  debtMicros: bigint;
  positionCount: number;
  allocation: Allocation;
  concentration: Concentration;
  performance: Performance;
  risk: RiskProfile;
  insights: Insight[];
  /** True if any position or price feeding this analysis was stale. */
  stale: boolean;
}
