import { describe, expect, it } from 'vitest';
import { computeConfidence } from '../src/index.js';

describe('computeConfidence', () => {
  it('is high with clean, full data and carries no uncertainty note', () => {
    const r = computeConfidence({});
    expect(r.confidence).toBe(1);
    expect(r.uncertaintyNote).toBeUndefined();
  });

  it('drops on stale data and records the reason', () => {
    const r = computeConfidence({ stale: true });
    expect(r.confidence).toBeCloseTo(0.7, 5);
    expect(r.uncertainties).toContain('portfolio data is stale');
  });

  it('a needs-confirmation gate lowers confidence', () => {
    expect(computeConfidence({ gate: 'require_confirmation' }).confidence).toBeCloseTo(0.85, 5);
  });

  it('a block forces a low confidence and an uncertainty note', () => {
    const r = computeConfidence({ gate: 'block' });
    expect(r.confidence).toBeLessThan(0.55);
    expect(r.uncertaintyNote).toBeDefined();
  });
});
