/**
 * Context assembly. `analyze()` is run ONCE per turn and its figures seed the
 * FactLedger, so simple questions ("how is my portfolio doing?") can be answered
 * with zero LLM tool round-trips — the sub-2s path. `redact` scrubs
 * secret-shaped strings (private-key-length hex) from any text as defense in
 * depth, so a key can never leak through context or an answer.
 */
import { round } from '@intent-wallet/intelligence';
import type { PortfolioIntelligence } from '@intent-wallet/intelligence';
import type { CopilotCapabilities } from './capabilities.js';
import type { CitedFact } from './types.js';

/** Scrub private-key / long-hex shaped tokens. */
export function redact(text: string): string {
  return text.replace(/0x[0-9a-fA-F]{64}/g, '[redacted]').replace(/\b[0-9a-fA-F]{64}\b/g, '[redacted]');
}

const src = { engine: 'intelligence', call: 'analyze' } as const;

/** The seed facts every turn starts with — the headline portfolio figures, verified. */
export function seedFacts(intel: PortfolioIntelligence): CitedFact[] {
  return [
    {
      id: 'portfolio.netWorth',
      label: 'Net worth',
      value: Number(intel.netWorthMicros) / 1_000_000,
      unit: 'usd',
      source: src,
    },
    {
      id: 'portfolio.healthScore',
      label: 'Health score',
      value: round(intel.risk.healthScore, 2),
      unit: 'score',
      source: src,
    },
    { id: 'portfolio.topAsset', label: 'Top asset', value: intel.allocation.byAsset[0]?.key ?? 'none', source: src },
    {
      id: 'portfolio.topAssetWeight',
      label: 'Top asset weight',
      value: round(intel.concentration.topAssetWeight, 4),
      unit: 'ratio',
      source: src,
    },
    {
      id: 'portfolio.diversificationScore',
      label: 'Diversification',
      value: round(intel.risk.diversificationScore, 2),
      unit: 'score',
      source: src,
    },
    { id: 'portfolio.positionCount', label: 'Positions', value: intel.positionCount, unit: 'count', source: src },
  ];
}

export interface ContextBundle {
  intel: PortfolioIntelligence;
  seed: CitedFact[];
  stale: boolean;
}

export class ContextAssembler {
  constructor(private readonly capabilities: CopilotCapabilities) {}

  async assemble(identityId: string): Promise<ContextBundle> {
    const intel = await this.capabilities.analyze(identityId);
    return { intel, seed: seedFacts(intel), stale: intel.stale };
  }
}
