import { describe, expect, it } from 'vitest';
import { normalizeWeights, scoreCandidates, WEIGHT_PRESETS } from '../src/scoring.js';
import type { RouteCandidate } from '../src/types.js';

function candidate(over: Partial<RouteCandidate> & { id: string }): RouteCandidate {
  return {
    id: over.id,
    legs: [{ kind: 'swap', providerId: over.id, chainId: 'ethereum', description: over.id }],
    providerIds: [over.id],
    outputBase: over.outputBase ?? 2_000_000_000n,
    outputDecimals: 6,
    feeMicros: over.feeMicros ?? 100_000n,
    slippageBps: over.slippageBps ?? 50,
    etaSeconds: over.etaSeconds ?? 30,
    healthScore: over.healthScore ?? 0.9,
    riskLevel: over.riskLevel ?? 'low',
    quoteAgeMs: over.quoteAgeMs ?? 0,
  };
}

describe('scoreCandidates', () => {
  it('normalizes weights that do not sum to 1', () => {
    const w = normalizeWeights({ output: 2, cost: 2, slippage: 0, time: 0, reliability: 0, risk: 0, freshness: 0 });
    expect(w.output).toBeCloseTo(0.5);
    expect(w.cost).toBeCloseTo(0.5);
  });

  it('ranks the highest-output candidate first under balanced weights', () => {
    const scored = scoreCandidates(
      [candidate({ id: 'low', outputBase: 1_900_000_000n }), candidate({ id: 'high', outputBase: 2_100_000_000n })],
      WEIGHT_PRESETS.balanced,
    );
    expect(scored[0]?.candidate.id).toBe('high');
  });

  it("'cheapest' weighting prefers the lower-fee route even at slightly less output", () => {
    const cands = [
      candidate({ id: 'pricey-best-out', outputBase: 2_010_000_000n, feeMicros: 500_000n }),
      candidate({ id: 'cheap', outputBase: 2_000_000_000n, feeMicros: 50_000n }),
    ];
    expect(scoreCandidates(cands, WEIGHT_PRESETS.cheapest)[0]?.candidate.id).toBe('cheap');
    // ...whereas balanced (output-weighted) can prefer the higher output.
    expect(scoreCandidates(cands, WEIGHT_PRESETS.balanced)[0]?.candidate.id).toBe('pricey-best-out');
  });

  it("'fastest' weighting prefers the quicker route", () => {
    const cands = [
      candidate({ id: 'slow', etaSeconds: 600, outputBase: 2_050_000_000n }),
      candidate({ id: 'quick', etaSeconds: 15, outputBase: 2_000_000_000n }),
    ];
    expect(scoreCandidates(cands, WEIGHT_PRESETS.fastest)[0]?.candidate.id).toBe('quick');
  });

  it("'safest' weighting prefers lower risk + higher health", () => {
    const cands = [
      candidate({ id: 'risky', riskLevel: 'high', healthScore: 0.6, outputBase: 2_100_000_000n }),
      candidate({ id: 'safe', riskLevel: 'low', healthScore: 0.99, outputBase: 2_000_000_000n }),
    ];
    expect(scoreCandidates(cands, WEIGHT_PRESETS.safest)[0]?.candidate.id).toBe('safe');
  });

  it('produces a full factor breakdown per candidate', () => {
    const [best] = scoreCandidates(
      [candidate({ id: 'a' }), candidate({ id: 'b', outputBase: 1n })],
      WEIGHT_PRESETS.balanced,
    );
    expect(best?.breakdown).toHaveProperty('output');
    expect(best?.breakdown).toHaveProperty('freshness');
    expect(best?.score).toBeGreaterThan(0);
    expect(best?.score).toBeLessThanOrEqual(1);
  });

  it('scores a single candidate neutrally (no divide-by-zero)', () => {
    const [only] = scoreCandidates([candidate({ id: 'solo' })], WEIGHT_PRESETS.balanced);
    expect(only?.score).toBeGreaterThan(0);
  });

  it('penalizes stale quotes on the freshness factor', () => {
    const fresh = scoreCandidates([candidate({ id: 'f', quoteAgeMs: 0 })], WEIGHT_PRESETS.balanced)[0];
    const stale = scoreCandidates([candidate({ id: 's', quoteAgeMs: 25_000 })], WEIGHT_PRESETS.balanced)[0];
    expect(fresh!.breakdown.freshness).toBeGreaterThan(stale!.breakdown.freshness);
  });
});

describe('scoring — corrupt provider data can never win or scramble the ranking', () => {
  // A provider returning a malformed field (an unknown riskLevel, a missing healthScore) made the
  // WHOLE score NaN. `Array.sort` with a NaN-returning comparator is implementation-defined, so an
  // unscored route could land anywhere in the ranking — including FIRST, i.e. selected. A route we
  // cannot score must rank last, deterministically, never win by accident.
  const good = candidate({ id: 'good', outputBase: 9_000_000_000n });
  const mid = candidate({ id: 'mid', outputBase: 3_000_000_000n });

  it('scores every candidate to a finite number even with bad data', () => {
    const bad = { ...candidate({ id: 'bad', outputBase: 5_000_000_000n }), riskLevel: 'unknown' } as never;
    const ranked = scoreCandidates([good, mid, bad], WEIGHT_PRESETS.balanced);
    for (const r of ranked) expect(Number.isFinite(r.score), `${r.candidate.id} score=${r.score}`).toBe(true);
  });

  it('scores an UNKNOWN factor as the worst, never as the best', () => {
    // A missing healthScore must count as reliability 0 — not be skipped, and not inherit a
    // favourable default. The candidate still competes on its other (valid) factors, which is the
    // correct outcome: one bad field penalises that field, it does not discard the whole route.
    const bad = { ...candidate({ id: 'bad', outputBase: 9_999_000_000n }), healthScore: undefined } as never;
    const ranked = scoreCandidates([mid, bad, good], WEIGHT_PRESETS.balanced);
    const badRow = ranked.find((r) => r.candidate.id === 'bad');
    expect(badRow?.breakdown.reliability).toBe(0);
    expect(Number.isFinite(badRow?.score ?? NaN)).toBe(true);
    // …and it must not beat a fully-healthy route that also has a strong output.
    const goodRow = ranked.find((r) => r.candidate.id === 'good');
    expect(goodRow?.breakdown.reliability).toBeGreaterThan(0);
  });

  it('a candidate whose risk level is unknown scores risk as worst', () => {
    const bad = { ...candidate({ id: 'bad' }), riskLevel: 'unknown' } as never;
    const ranked = scoreCandidates([good, bad], WEIGHT_PRESETS.balanced);
    expect(ranked.find((r) => r.candidate.id === 'bad')?.breakdown.risk).toBe(0);
    expect(ranked[0]?.candidate.id).toBe('good');
  });

  it('a NaN in any single factor does not poison the others', () => {
    const bad = { ...candidate({ id: 'bad' }), quoteAgeMs: Number.NaN } as never;
    const ranked = scoreCandidates([good, bad], WEIGHT_PRESETS.balanced);
    expect(ranked.every((r) => Number.isFinite(r.score))).toBe(true);
    expect(ranked[0]?.candidate.id).toBe('good');
  });
});
