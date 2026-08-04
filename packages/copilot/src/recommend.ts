/**
 * Recommendations + automation suggestions — deterministic, from verified data.
 * A recommendation is a projection of an Intelligence `Insight`: it reuses the
 * insight's own `evidence` metrics as its `dataUsed`, so it never authors a new
 * number. Automation suggestions are UNSIGNED intent proposals; they are never
 * installed here — the user (and the Policy Engine) decide.
 */
import type { Insight, PortfolioIntelligence } from '@intent-wallet/intelligence';
import type { AutomationSuggestion, CitedFact, Recommendation, RiskDisclosure } from './types.js';

const LOW_RISK: RiskDisclosure = { level: 'low', reasons: [], blocking: false };

function evidenceToFacts(insight: Insight): CitedFact[] {
  return insight.evidence.map((e) => ({
    id: `insight.${insight.code}.${e.metric}`,
    label: e.metric,
    value: e.value,
    source: { engine: 'intelligence' as const, call: 'analyze' },
  }));
}

export class RecommendationBuilder {
  build(intel: PortfolioIntelligence): Recommendation[] {
    return intel.insights.map((insight) => ({
      code: `REC_${insight.code}`,
      title: insight.title,
      detail: insight.detail,
      why: insight.detail,
      dataUsed: evidenceToFacts(insight),
      risks: LOW_RISK,
      alternatives: [],
      confidence: insight.severity === 'critical' ? 0.9 : 0.75,
    }));
  }
}

const DCA_RE = /\b(dca|dollar[- ]cost|every (week|month|monday|day)|recurring|monthly|weekly)\b/i;
const STOP_LOSS_RE = /\b(stop[- ]loss|if .* (drops?|falls?)|protect|hedge)\b/i;

export class AutomationSuggester {
  suggest(utterance: string): AutomationSuggestion[] {
    const out: AutomationSuggestion[] = [];
    if (DCA_RE.test(utterance)) {
      out.push({
        code: 'AUTO_DCA',
        title: 'Set up recurring investment (DCA)',
        detail: 'You described a recurring purchase. I can propose a DCA automation rule for your approval.',
        intent: {
          kind: 'recurring_buy',
          description: 'Recurring dollar-cost-averaging purchase',
          params: { cadence: 'monthly' },
        },
        dataUsed: [],
        confidence: 0.8,
      });
    }
    if (STOP_LOSS_RE.test(utterance)) {
      out.push({
        code: 'AUTO_STOP_LOSS',
        title: 'Set up a protective rule',
        detail: 'You described a downside trigger. I can propose a stop-loss automation rule for your approval.',
        intent: {
          kind: 'conditional_action',
          description: 'Act when a price threshold is crossed',
          params: { trigger: 'price_drop' },
        },
        dataUsed: [],
        confidence: 0.75,
      });
    }
    return out;
  }
}
