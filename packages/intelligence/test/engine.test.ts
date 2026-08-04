import { describe, expect, it } from 'vitest';
import { PortfolioIntelligenceEngine } from '../src/engine.js';
import { IntelligenceError } from '../src/errors.js';
import type { Narrator } from '../src/narrator.js';
import type { PortfolioSnapshot, Position } from '../src/types.js';

const pos = (over: Partial<Position> & Pick<Position, 'kind' | 'symbol' | 'valueMicros'>): Position => ({
  id: over.id ?? over.symbol,
  chainId: 'ethereum',
  amount: 0n,
  decimals: 18,
  ...over,
});

const snapshot = (positions: Position[]): PortfolioSnapshot => ({
  identityId: 'user-1',
  asOf: '2026-07-05T00:00:00Z',
  positions,
});

describe('PortfolioIntelligenceEngine — analyze', () => {
  const engine = new PortfolioIntelligenceEngine();

  it('produces a coherent net worth (assets − debt) and a full breakdown', () => {
    const intel = engine.analyze(
      snapshot([
        pos({ kind: 'token', symbol: 'ETH', valueMicros: 6_000_000_000n }),
        pos({ kind: 'token', symbol: 'USDC', valueMicros: 3_000_000_000n }),
        pos({ kind: 'borrowing', symbol: 'DAI', valueMicros: 1_000_000_000n }),
      ]),
    );
    expect(intel.netWorthMicros).toBe(8_000_000_000n);
    expect(intel.grossAssetsMicros).toBe(9_000_000_000n);
    expect(intel.debtMicros).toBe(1_000_000_000n);
    expect(intel.positionCount).toBe(3);
    expect(intel.allocation.byAsset.map((s) => s.key)).toContain('ETH');
    // ETH at 66% breaches the balanced single-asset threshold.
    expect(intel.insights.map((i) => i.code)).toContain('CONCENTRATION_SINGLE_ASSET');
  });

  it('escalates a dominant position to a critical insight with evidence', () => {
    const intel = engine.analyze(
      snapshot([
        pos({ kind: 'token', symbol: 'ETH', valueMicros: 9_000_000_000n }),
        pos({ kind: 'token', symbol: 'USDC', valueMicros: 1_000_000_000n }),
      ]),
    );
    const conc = intel.insights.find((i) => i.code === 'CONCENTRATION_SINGLE_ASSET')!;
    expect(conc.severity).toBe('critical');
    expect(conc.evidence.some((e) => e.metric === 'concentration.topAssetWeight')).toBe(true);
  });

  it('surfaces a yield opportunity on an idle held asset', () => {
    const intel = engine.analyze(snapshot([pos({ kind: 'token', symbol: 'USDC', valueMicros: 10_000_000_000n })]), {
      yieldOpportunities: [{ asset: 'USDC', apr: 0.08, protocol: 'aave-v3' }],
    });
    expect(intel.insights.map((i) => i.code)).toContain('YIELD_OPPORTUNITY');
  });
});

describe('PortfolioIntelligenceEngine — narration guard', () => {
  const engine = new PortfolioIntelligenceEngine();
  const intel = () =>
    engine.analyze(
      snapshot([
        pos({ kind: 'token', symbol: 'ETH', valueMicros: 6_000_000_000n }),
        pos({ kind: 'token', symbol: 'USDC', valueMicros: 2_000_000_000n }),
      ]),
    );

  it('narrates verified figures and the numbers reconcile', async () => {
    const report = await engine.narrate(intel(), 'overview');
    expect(report.text).toContain('$8,000.00');
    expect(report.citations.length).toBeGreaterThan(0);
  });

  it('rejects a narrator that fabricates a figure', async () => {
    const liar: Narrator = {
      summarize: (_intel, kind) =>
        Promise.resolve({ kind, text: 'health is amazing', citations: [{ metric: 'risk.healthScore', value: 999 }] }),
    };
    const guarded = new PortfolioIntelligenceEngine({ narrator: liar });
    await expect(guarded.narrate(intel(), 'risk')).rejects.toBeInstanceOf(IntelligenceError);
  });
});
