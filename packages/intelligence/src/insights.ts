/**
 * Insight engine — turns analytics into recommendations. Every rule is pure and
 * deterministic and attaches EVIDENCE: the exact metric ids and values that
 * triggered it. Nothing here is invented — an insight is a threshold crossing on
 * a verified number, and `suggestedAction` is advice, never an executable step
 * (the engine cannot act; the user or the Intent layer decides).
 *
 * Thresholds live in a configurable `InsightPolicy` with presets, mirroring the
 * risk engine's policy model so a user/enterprise can set their own posture.
 */
import { round } from './money.js';
import type {
  Allocation,
  Concentration,
  Insight,
  InsightSeverity,
  MetricRef,
  Performance,
  RiskProfile,
} from './types.js';

export interface InsightPolicy {
  maxAssetWeight: number;
  maxChainWeight: number;
  maxProtocolWeight: number;
  maxBridgeExposure: number;
  maxLeverage: number;
  minStableBuffer: number;
  maxStableBuffer: number;
  minDiversification: number; // [0,100]
  maxDrawdown: number;
  /** Minimum APR (ratio) for a yield opportunity to be surfaced. */
  minYieldApr: number;
  /** Health-score drop vs the previous reading that flags rising risk. */
  healthDropDelta: number;
  /** Gas spend as a share of net worth above which gas is "unusually high". */
  maxGasSpendWeight: number;
}

export type InsightPreset = 'conservative' | 'balanced' | 'aggressive';

export const INSIGHT_PRESETS: Record<InsightPreset, InsightPolicy> = {
  conservative: {
    maxAssetWeight: 0.3,
    maxChainWeight: 0.5,
    maxProtocolWeight: 0.4,
    maxBridgeExposure: 0.15,
    maxLeverage: 0.25,
    minStableBuffer: 0.1,
    maxStableBuffer: 0.6,
    minDiversification: 45,
    maxDrawdown: 0.2,
    minYieldApr: 0.03,
    healthDropDelta: 8,
    maxGasSpendWeight: 0.01,
  },
  balanced: {
    maxAssetWeight: 0.4,
    maxChainWeight: 0.6,
    maxProtocolWeight: 0.5,
    maxBridgeExposure: 0.25,
    maxLeverage: 0.5,
    minStableBuffer: 0.05,
    maxStableBuffer: 0.7,
    minDiversification: 30,
    maxDrawdown: 0.3,
    minYieldApr: 0.04,
    healthDropDelta: 10,
    maxGasSpendWeight: 0.02,
  },
  aggressive: {
    maxAssetWeight: 0.6,
    maxChainWeight: 0.8,
    maxProtocolWeight: 0.7,
    maxBridgeExposure: 0.4,
    maxLeverage: 1.0,
    minStableBuffer: 0.0,
    maxStableBuffer: 0.85,
    minDiversification: 15,
    maxDrawdown: 0.5,
    minYieldApr: 0.06,
    healthDropDelta: 15,
    maxGasSpendWeight: 0.04,
  },
};

export interface YieldOpportunity {
  asset: string;
  apr: number;
  protocol: string;
}

export interface InsightContext {
  allocation: Allocation;
  concentration: Concentration;
  risk: RiskProfile;
  performance: Performance;
  netWorthMicros: bigint;
  /** Optional: gas spent over a recent window (µUSD) — enables the gas-cost insight. */
  gasSpendMicros?: bigint;
  /** Optional: available yield opportunities — matched against idle holdings. */
  yieldOpportunities?: YieldOpportunity[];
  /** Optional: the previous health score — enables the rising-risk insight. */
  previousHealthScore?: number;
}

const m = (metric: string, value: number | string): MetricRef => ({ metric, value });
const pctVal = (r: number): number => round(r * 100, 1);

export function generateInsights(ctx: InsightContext, policy: InsightPolicy = INSIGHT_PRESETS.balanced): Insight[] {
  const insights: Insight[] = [];
  const { allocation, concentration, risk, performance } = ctx;

  // 1. Single-asset concentration.
  if (concentration.topAssetWeight > policy.maxAssetWeight) {
    const top = allocation.byAsset[0];
    const sev: InsightSeverity = concentration.topAssetWeight > policy.maxAssetWeight + 0.2 ? 'critical' : 'warn';
    insights.push({
      code: 'CONCENTRATION_SINGLE_ASSET',
      severity: sev,
      title: 'High single-asset concentration',
      detail: `${top?.key ?? 'Top asset'} is ${pctVal(concentration.topAssetWeight)}% of your portfolio — a drop here moves your whole net worth.`,
      evidence: [
        m('concentration.topAssetWeight', concentration.topAssetWeight),
        m('policy.maxAssetWeight', policy.maxAssetWeight),
      ],
      suggestedAction: 'Consider trimming this position toward a more balanced allocation.',
    });
  }

  // 2. Chain concentration.
  const topChain = allocation.byChain[0];
  if (topChain && topChain.weight > policy.maxChainWeight) {
    insights.push({
      code: 'CHAIN_CONCENTRATION',
      severity: 'warn',
      title: 'Concentrated on one chain',
      detail: `${pctVal(topChain.weight)}% of value sits on ${topChain.key}. A chain-level incident would affect most of your portfolio.`,
      evidence: [
        m('allocation.topChain', topChain.key),
        m('allocation.topChainWeight', topChain.weight),
        m('policy.maxChainWeight', policy.maxChainWeight),
      ],
      suggestedAction: 'Spread holdings across more chains to reduce single-chain risk.',
    });
  }

  // 3. Protocol concentration (excluding plain wallet holdings).
  const topProtocol = allocation.byProtocol.find((s) => s.key !== 'wallet');
  if (topProtocol && topProtocol.weight > policy.maxProtocolWeight) {
    insights.push({
      code: 'PROTOCOL_CONCENTRATION',
      severity: 'warn',
      title: 'High protocol concentration',
      detail: `${pctVal(topProtocol.weight)}% of value is deployed in ${topProtocol.key}. A protocol exploit would be an outsized hit.`,
      evidence: [
        m('allocation.topProtocol', topProtocol.key),
        m('allocation.topProtocolWeight', topProtocol.weight),
        m('policy.maxProtocolWeight', policy.maxProtocolWeight),
      ],
      suggestedAction: 'Diversify across protocols to limit single-protocol exposure.',
    });
  }

  // 4. Bridge exposure.
  if (risk.bridgeExposure > policy.maxBridgeExposure) {
    insights.push({
      code: 'BRIDGE_EXPOSURE_HIGH',
      severity: 'warn',
      title: 'High bridge exposure',
      detail: `${pctVal(risk.bridgeExposure)}% of value depends on bridges. Bridges are the most-exploited layer in crypto.`,
      evidence: [
        m('risk.bridgeExposure', risk.bridgeExposure),
        m('policy.maxBridgeExposure', policy.maxBridgeExposure),
      ],
      suggestedAction: 'Reduce assets held behind bridges, or move them to their native chain.',
    });
  }

  // 5. Leverage.
  if (risk.leverage > policy.maxLeverage) {
    insights.push({
      code: 'HIGH_LEVERAGE',
      severity: risk.leverage > policy.maxLeverage * 1.5 ? 'critical' : 'warn',
      title: 'Elevated leverage',
      detail: `Debt is ${pctVal(risk.leverage)}% of your assets. A market drop could trigger liquidations.`,
      evidence: [m('risk.leverage', risk.leverage), m('policy.maxLeverage', policy.maxLeverage)],
      suggestedAction: 'Repay part of your borrow or add collateral to improve your health factor.',
    });
  }

  // 6. Low diversification.
  if (risk.diversificationScore < policy.minDiversification) {
    insights.push({
      code: 'LOW_DIVERSIFICATION',
      severity: 'info',
      title: 'Low diversification',
      detail: `Diversification score is ${round(risk.diversificationScore, 0)}/100 (${risk.diversificationBasis} basis). Your holdings move together.`,
      evidence: [
        m('risk.diversificationScore', risk.diversificationScore),
        m('policy.minDiversification', policy.minDiversification),
      ],
      suggestedAction: 'Add uncorrelated assets to smooth portfolio volatility.',
    });
  }

  // 7. Stablecoin buffer — too little (no dry powder) or too much (idle).
  if (allocation.stablecoinWeight < policy.minStableBuffer) {
    insights.push({
      code: 'LOW_STABLE_BUFFER',
      severity: 'info',
      title: 'Thin stablecoin buffer',
      detail: `Only ${pctVal(allocation.stablecoinWeight)}% is in stablecoins. Little dry powder to buy dips or cover gas.`,
      evidence: [
        m('allocation.stablecoinWeight', allocation.stablecoinWeight),
        m('policy.minStableBuffer', policy.minStableBuffer),
      ],
      suggestedAction: 'Hold a small stablecoin reserve for flexibility.',
    });
  } else if (allocation.stablecoinWeight > policy.maxStableBuffer) {
    insights.push({
      code: 'STABLE_IMBALANCE_IDLE',
      severity: 'info',
      title: 'Large idle stablecoin balance',
      detail: `${pctVal(allocation.stablecoinWeight)}% sits in stablecoins. That capital could be earning yield.`,
      evidence: [
        m('allocation.stablecoinWeight', allocation.stablecoinWeight),
        m('policy.maxStableBuffer', policy.maxStableBuffer),
      ],
      suggestedAction: 'Consider deploying idle stablecoins into a vetted yield source.',
    });
  }

  // 8. Drawdown.
  if (performance.currentDrawdown !== null && performance.currentDrawdown > policy.maxDrawdown) {
    insights.push({
      code: 'HIGH_DRAWDOWN',
      severity: 'warn',
      title: 'Deep drawdown',
      detail: `You are ${pctVal(performance.currentDrawdown)}% below your portfolio's peak.`,
      evidence: [
        m('performance.currentDrawdown', performance.currentDrawdown),
        m('policy.maxDrawdown', policy.maxDrawdown),
      ],
    });
  }

  // 9. Rising risk vs the previous reading.
  if (ctx.previousHealthScore !== undefined && ctx.previousHealthScore - risk.healthScore >= policy.healthDropDelta) {
    insights.push({
      code: 'RISK_INCREASING',
      severity: 'warn',
      title: 'Portfolio risk is increasing',
      detail: `Health score fell from ${round(ctx.previousHealthScore, 0)} to ${round(risk.healthScore, 0)} since the last check.`,
      evidence: [m('risk.healthScore', risk.healthScore), m('previousHealthScore', ctx.previousHealthScore)],
      suggestedAction: 'Review recent changes — new leverage or concentration may be driving this.',
    });
  }

  // 10. Unusually high gas spend.
  if (ctx.gasSpendMicros !== undefined && ctx.netWorthMicros > 0n) {
    const gasWeight = Number(ctx.gasSpendMicros) / Number(ctx.netWorthMicros);
    if (gasWeight > policy.maxGasSpendWeight) {
      insights.push({
        code: 'GAS_COSTS_HIGH',
        severity: 'info',
        title: 'Unusually high gas costs',
        detail: `Recent gas spend is ${pctVal(gasWeight)}% of net worth — batching or a cheaper chain could cut this.`,
        evidence: [m('gasSpendWeight', round(gasWeight, 4)), m('policy.maxGasSpendWeight', policy.maxGasSpendWeight)],
        suggestedAction: 'Batch transactions or route through a lower-fee chain.',
      });
    }
  }

  // 11. Yield opportunities on idle holdings.
  if (ctx.yieldOpportunities && ctx.yieldOpportunities.length > 0) {
    const held = new Set(allocation.byAsset.map((a) => a.key.toUpperCase()));
    for (const opp of ctx.yieldOpportunities) {
      if (opp.apr >= policy.minYieldApr && held.has(opp.asset.toUpperCase())) {
        insights.push({
          code: 'YIELD_OPPORTUNITY',
          severity: 'info',
          title: `Yield available on ${opp.asset}`,
          detail: `${opp.protocol} offers ${pctVal(opp.apr)}% APR on ${opp.asset}, which you already hold idle.`,
          evidence: [m('yield.asset', opp.asset), m('yield.apr', opp.apr), m('yield.protocol', opp.protocol)],
          suggestedAction: `Consider supplying ${opp.asset} to ${opp.protocol}.`,
        });
      }
    }
  }

  // Most severe first, stable within a severity.
  const order: Record<InsightSeverity, number> = { critical: 0, warn: 1, info: 2 };
  insights.sort((a, b) => order[a.severity] - order[b.severity]);
  return insights;
}
