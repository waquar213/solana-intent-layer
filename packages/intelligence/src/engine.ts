/**
 * PortfolioIntelligenceEngine — the facade that runs the pipeline the product
 * promises:
 *
 *   Discovery → Normalization → Classification → Valuation
 *     → Allocation → Concentration → Performance → Risk/Health
 *     → Insights                              (analyze)
 *
 * plus the on-demand engines: scenario(), evaluateAlerts(), tax(), narrate().
 *
 * `analyze` is a pure function of the snapshot (+ injected classifier/policy) —
 * no clock, no network — so the whole brain is deterministic and testable. The
 * engine ANALYZES and RECOMMENDS; it never signs and never executes.
 */
import { computeAllocation, computeConcentration } from './allocation.js';
import { evaluateAlerts as evaluateAlertsImpl } from './alerts.js';
import { generateInsights, INSIGHT_PRESETS } from './insights.js';
import { normalize } from './positions.js';
import { computePerformance } from './performance.js';
import { computeRisk, DEFAULT_RISK_PARAMS } from './risk.js';
import { applyScenario } from './scenario.js';
import { computeTaxReport } from './tax.js';
import { TemplateNarrator, verifyNarrative } from './narrator.js';
import { IntelligenceError } from './errors.js';
import type { AlertConfig, AlertContext } from './alerts.js';
import type { InsightPolicy, YieldOpportunity } from './insights.js';
import type { Classifier } from './positions.js';
import type { RiskParams } from './risk.js';
import type { AlertState } from './types.js';
import type { Narrator } from './narrator.js';
import type { ScenarioOptions } from './scenario.js';
import type {
  Alert,
  NarrativeKind,
  NarrativeReport,
  PortfolioIntelligence,
  PortfolioSnapshot,
  Position,
  Scenario,
  ScenarioResult,
  TaxConfig,
  TaxEvent,
  TaxReport,
} from './types.js';

export interface EngineDeps {
  /** Asset classifier (from an AssetCatalog); falls back to the built-in classifier. */
  classifier?: Classifier;
  insightPolicy?: InsightPolicy;
  riskParams?: RiskParams;
  narrator?: Narrator;
  /** Reject a narrative whose citations don't reconcile with verified data. Default true. */
  verifyNarration?: boolean;
}

/** Optional live context that enriches the insight pass but isn't part of the core snapshot. */
export interface AnalyzeExtras {
  gasSpendMicros?: bigint;
  yieldOpportunities?: YieldOpportunity[];
  previousHealthScore?: number;
}

export class PortfolioIntelligenceEngine {
  private readonly classifier: Classifier;
  private readonly insightPolicy: InsightPolicy;
  private readonly riskParams: RiskParams;
  private readonly narrator: Narrator;
  private readonly verifyNarration: boolean;

  constructor(deps: EngineDeps = {}) {
    this.classifier = deps.classifier ?? (() => undefined);
    this.insightPolicy = deps.insightPolicy ?? INSIGHT_PRESETS.balanced;
    this.riskParams = deps.riskParams ?? DEFAULT_RISK_PARAMS;
    this.narrator = deps.narrator ?? new TemplateNarrator();
    this.verifyNarration = deps.verifyNarration ?? true;
  }

  /** Run the full analytics pipeline over one snapshot. Pure. */
  analyze(snapshot: PortfolioSnapshot, extras: AnalyzeExtras = {}): PortfolioIntelligence {
    const np = normalize(snapshot.positions, this.classifier);
    const allocation = computeAllocation(np);
    const concentration = computeConcentration(allocation.byAsset);
    const performance = computePerformance(
      np,
      snapshot.history ?? [],
      snapshot.flows ?? [],
      snapshot.periodsPerYear ?? 365,
    );
    const risk = computeRisk(np, allocation, concentration, performance, snapshot.assetReturns ?? [], this.riskParams);

    const insights = generateInsights(
      {
        allocation,
        concentration,
        risk,
        performance,
        netWorthMicros: np.netWorthMicros,
        ...(extras.gasSpendMicros !== undefined ? { gasSpendMicros: extras.gasSpendMicros } : {}),
        ...(extras.yieldOpportunities !== undefined ? { yieldOpportunities: extras.yieldOpportunities } : {}),
        ...(extras.previousHealthScore !== undefined ? { previousHealthScore: extras.previousHealthScore } : {}),
      },
      this.insightPolicy,
    );

    return {
      identityId: snapshot.identityId,
      asOf: snapshot.asOf,
      netWorthMicros: np.netWorthMicros,
      grossAssetsMicros: np.grossAssetsMicros,
      debtMicros: np.debtMicros,
      positionCount: snapshot.positions.length,
      allocation,
      concentration,
      performance,
      risk,
      insights,
      stale: np.stale,
    };
  }

  /** What-if analysis over a set of positions. */
  scenario(positions: Position[], scenario: Scenario, options?: ScenarioOptions): ScenarioResult {
    return applyScenario(positions, scenario, options);
  }

  /** Stateful alert evaluation. `now` is supplied by the caller (deterministic). */
  evaluateAlerts(
    prevState: AlertState,
    ctx: AlertContext,
    now: string,
    config?: AlertConfig,
  ): { alerts: Alert[]; state: AlertState } {
    return evaluateAlertsImpl(prevState, ctx, now, config);
  }

  /** Realized-gain / cost-basis report from a stream of tax events. */
  tax(events: TaxEvent[], config: TaxConfig): TaxReport {
    return computeTaxReport(events, config);
  }

  /** Narrate verified intelligence. Rejects a narrative whose citations don't reconcile (anti-fabrication). */
  async narrate(intel: PortfolioIntelligence, kind: NarrativeKind): Promise<NarrativeReport> {
    const report = await this.narrator.summarize(intel, kind);
    if (this.verifyNarration && !verifyNarrative(report, intel)) {
      throw new IntelligenceError('NARRATION_UNVERIFIED', `narrative for "${kind}" cited unverifiable figures`);
    }
    return report;
  }
}
