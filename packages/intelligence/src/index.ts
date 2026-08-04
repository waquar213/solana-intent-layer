/**
 * @intent-wallet/intelligence — the Portfolio Intelligence Engine (the financial
 * brain). Deterministic analytics (allocation, concentration, PnL, performance,
 * risk, health) + insight / alert / scenario / tax engines + an AI narration
 * boundary that can only explain verified numbers. It ANALYZES and RECOMMENDS —
 * it never signs and never executes. Standalone enough to also be a
 * Portfolio-Intelligence-as-a-service product; the base money math is reused
 * from @intent-wallet/portfolio.
 */

// Types — the shared vocabulary.
export type {
  AssetClass,
  PositionKind,
  Liquidity,
  PositionLeg,
  Position,
  NormalizedPosition,
  NetWorthPoint,
  CashFlow,
  AssetReturnSeries,
  PortfolioSnapshot,
  AllocationSlice,
  Allocation,
  Concentration,
  GrowthPoint,
  Performance,
  HealthFactor,
  RiskProfile,
  InsightSeverity,
  MetricRef,
  Insight,
  AlertSeverity,
  Alert,
  AlertState,
  PriceTarget,
  MarketEventKind,
  MarketEvent,
  Scenario,
  GasProfile,
  PositionDelta,
  ScenarioResult,
  TaxMethod,
  TaxTerm,
  TaxAcquisition,
  TaxDisposal,
  TaxEvent,
  TaxConfig,
  RealizedGain,
  TaxReport,
  NarrativeKind,
  NarrativeReport,
  PortfolioIntelligence,
} from './types.js';

// Money + ratio helpers.
export {
  usdToMicros,
  assetValueMicros,
  formatUsd,
  scaleAmount,
  MICRO,
  MoneyError,
  microsToUsd,
  ratio,
  round,
  clamp,
  daysBetween,
} from './money.js';

// Quant primitives.
export {
  mean,
  variance,
  stdev,
  simpleReturns,
  annualizeVol,
  annualizeReturn,
  drawdown,
  covariance,
  pearson,
  beta,
  hhi,
  type DrawdownResult,
} from './stats.js';

// Analytics.
export { normalize, defaultClassifier, type Classifier, type NormalizedPortfolio } from './positions.js';
export { computeAllocation, computeConcentration } from './allocation.js';
export { computePerformance } from './performance.js';
export { computeRisk, DEFAULT_RISK_PARAMS, type RiskParams, type HealthWeights } from './risk.js';

// Insight / alert / scenario / tax engines.
export {
  generateInsights,
  INSIGHT_PRESETS,
  type InsightPolicy,
  type InsightPreset,
  type InsightContext,
  type YieldOpportunity,
} from './insights.js';
export {
  evaluateAlerts,
  emptyAlertState,
  DEFAULT_ALERT_CONFIG,
  type AlertConfig,
  type AlertContext,
} from './alerts.js';
export { applyScenario, type ScenarioOptions } from './scenario.js';
export { computeTaxReport, TAX_PRESETS } from './tax.js';

// AI narration boundary.
export { TemplateNarrator, verifyNarrative, resolveMetric, type Narrator } from './narrator.js';

// Injected sources.
export type { PositionSource, PriceHistorySource, SnapshotStore, MarketEventFeed, AssetCatalog } from './sources.js';

// Engine facade.
export { PortfolioIntelligenceEngine, type EngineDeps, type AnalyzeExtras } from './engine.js';

// Errors.
export { IntelligenceError, type IntelligenceErrorCode } from './errors.js';
