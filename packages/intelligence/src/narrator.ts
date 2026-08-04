/**
 * AI narration boundary. The engine computes every financial fact
 * deterministically; a `Narrator` only turns those facts into prose. The
 * contract — enforced, not hoped for — is that a narrative may cite ONLY figures
 * that resolve against the verified `PortfolioIntelligence`. `verifyNarrative`
 * checks exactly that, so an LLM narrator plugged in behind this interface
 * cannot fabricate a number: any citation that doesn't reconcile fails the guard
 * and the narrative is rejected.
 *
 * `TemplateNarrator` is the production-safe default: fully deterministic, no LLM,
 * cites only what it read. It is also the reference the LLM narrator is held to.
 */
import { formatUsd, round } from './money.js';
import type { MetricRef, NarrativeKind, NarrativeReport, PortfolioIntelligence } from './types.js';

export interface Narrator {
  summarize(intel: PortfolioIntelligence, kind: NarrativeKind): Promise<NarrativeReport>;
}

/** Resolve a citation's metric id against verified intelligence. `undefined` = not a real metric. */
export function resolveMetric(intel: PortfolioIntelligence, metric: string): number | string | undefined {
  switch (metric) {
    case 'netWorth':
      return formatUsd(intel.netWorthMicros);
    case 'grossAssets':
      return formatUsd(intel.grossAssetsMicros);
    case 'debt':
      return formatUsd(intel.debtMicros);
    case 'positionCount':
      return intel.positionCount;
    case 'insightCount':
      return intel.insights.length;
    case 'risk.healthScore':
      return round(intel.risk.healthScore, 2);
    case 'risk.diversificationScore':
      return round(intel.risk.diversificationScore, 2);
    case 'risk.leverage':
      return round(intel.risk.leverage, 4);
    case 'concentration.topAssetWeight':
      return round(intel.concentration.topAssetWeight, 4);
    case 'concentration.hhi':
      return round(intel.concentration.hhi, 4);
    case 'allocation.topAsset':
      return intel.allocation.byAsset[0]?.key ?? 'none';
    case 'allocation.stablecoinWeight':
      return round(intel.allocation.stablecoinWeight, 4);
    case 'performance.twr':
      return intel.performance.twr === null ? undefined : round(intel.performance.twr, 4);
    case 'performance.growthPct':
      return intel.performance.growthPct === null ? undefined : round(intel.performance.growthPct, 4);
    default:
      return undefined;
  }
}

/** True iff every citation resolves to the same value the intelligence holds. The anti-fabrication gate. */
export function verifyNarrative(report: NarrativeReport, intel: PortfolioIntelligence): boolean {
  for (const c of report.citations) {
    const actual = resolveMetric(intel, c.metric);
    if (actual === undefined) return false;
    if (typeof actual === 'number' && typeof c.value === 'number') {
      if (Math.abs(actual - c.value) > 0.01) return false;
    } else if (String(actual) !== String(c.value)) {
      return false;
    }
  }
  return true;
}

const cite = (intel: PortfolioIntelligence, metric: string): MetricRef => ({
  metric,
  value: resolveMetric(intel, metric) ?? '',
});

const pct = (r: number): string => `${round(r * 100, 1)}%`;

export class TemplateNarrator implements Narrator {
  summarize(intel: PortfolioIntelligence, kind: NarrativeKind): Promise<NarrativeReport> {
    const topAsset = intel.allocation.byAsset[0]?.key ?? 'none';
    const citations: MetricRef[] = [];
    let text: string;

    switch (kind) {
      case 'overview': {
        citations.push(
          cite(intel, 'netWorth'),
          cite(intel, 'allocation.topAsset'),
          cite(intel, 'concentration.topAssetWeight'),
          cite(intel, 'risk.healthScore'),
          cite(intel, 'insightCount'),
        );
        text =
          `Your portfolio is worth ${formatUsd(intel.netWorthMicros)} across ${intel.positionCount} positions. ` +
          `Your largest holding is ${topAsset} at ${pct(intel.concentration.topAssetWeight)} of the book. ` +
          `Portfolio health is ${round(intel.risk.healthScore, 0)}/100. ` +
          `There ${intel.insights.length === 1 ? 'is' : 'are'} ${intel.insights.length} active insight${intel.insights.length === 1 ? '' : 's'} to review.`;
        break;
      }
      case 'risk': {
        citations.push(
          cite(intel, 'risk.healthScore'),
          cite(intel, 'risk.diversificationScore'),
          cite(intel, 'risk.leverage'),
          cite(intel, 'concentration.topAssetWeight'),
        );
        const weakest = [...intel.risk.healthFactors].sort((a, b) => a.score - b.score)[0];
        text =
          `Health is ${round(intel.risk.healthScore, 0)}/100 with a diversification score of ${round(intel.risk.diversificationScore, 0)}. ` +
          `Leverage is ${round(intel.risk.leverage, 2)}× and your top asset is ${pct(intel.concentration.topAssetWeight)} of the book. ` +
          (weakest ? `The weakest factor is ${weakest.key} (${round(weakest.score, 0)}/100): ${weakest.detail}.` : '');
        break;
      }
      case 'diversification': {
        citations.push(
          cite(intel, 'risk.diversificationScore'),
          cite(intel, 'concentration.hhi'),
          cite(intel, 'concentration.topAssetWeight'),
          cite(intel, 'allocation.topAsset'),
        );
        text =
          `Diversification score is ${round(intel.risk.diversificationScore, 0)}/100 (${intel.risk.diversificationBasis} basis). ` +
          `Effective positions: ${round(intel.concentration.effectivePositions, 1)} (HHI ${round(intel.concentration.hhi, 3)}). ` +
          `${topAsset} dominates at ${pct(intel.concentration.topAssetWeight)}.`;
        break;
      }
      case 'weekly': {
        citations.push(cite(intel, 'netWorth'), cite(intel, 'risk.healthScore'));
        if (intel.performance.hasHistory && intel.performance.twr !== null) {
          citations.push(cite(intel, 'performance.twr'));
          text =
            `This period your portfolio returned ${pct(intel.performance.twr)} (time-weighted) to ${formatUsd(intel.netWorthMicros)}. ` +
            `Health is ${round(intel.risk.healthScore, 0)}/100.`;
        } else {
          text =
            `Your portfolio is worth ${formatUsd(intel.netWorthMicros)} with a health score of ${round(intel.risk.healthScore, 0)}/100. ` +
            `Performance history isn't available yet, so no return is reported.`;
        }
        break;
      }
    }

    return Promise.resolve({ kind, text, citations });
  }
}
