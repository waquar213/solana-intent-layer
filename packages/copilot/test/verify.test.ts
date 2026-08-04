import { describe, expect, it } from 'vitest';
import { FactLedger, hasUncitedNumerics, verifyResponse } from '../src/index.js';
import type { CitedFact, CopilotResponse } from '../src/index.js';

const fact = (id: string, value: number | string, unit?: CitedFact['unit']): CitedFact => ({
  id,
  label: id,
  value,
  ...(unit ? { unit } : {}),
  source: { engine: 'intelligence', call: 'analyze' },
});

const emptyResponse = (facts: CitedFact[]): CopilotResponse => ({
  kind: 'answer',
  answer: '',
  facts,
  recommendations: [],
  automationSuggestions: [],
  risk: { level: 'low', reasons: [], blocking: false },
  alternatives: [],
  confidence: 1,
  followUps: [],
  provenance: [],
  verified: false,
  uncertainties: [],
  usedTools: [],
});

describe('verifyResponse — fact grounding', () => {
  it('passes when every cited fact reconciles', () => {
    const ledger = new FactLedger([fact('a', 8000), fact('b', 'ETH')]);
    expect(verifyResponse(emptyResponse([fact('a', 8000), fact('b', 'ETH')]), ledger)).toBe(true);
  });

  it('fails on a hallucinated fact (absent from the ledger)', () => {
    const ledger = new FactLedger([fact('a', 8000)]);
    expect(verifyResponse(emptyResponse([fact('ghost', 9999)]), ledger)).toBe(false);
  });

  it('fails on a wrong value beyond tolerance', () => {
    const ledger = new FactLedger([fact('a', 8000)]);
    expect(verifyResponse(emptyResponse([fact('a', 9999)]), ledger)).toBe(false);
  });
});

describe('hasUncitedNumerics — prose backstop', () => {
  const facts = [fact('nw', 8000, 'usd'), fact('twr', 0.05, 'ratio')];
  it('accepts numbers that match a fact (raw, or ×100 only for a ratio fact written as %)', () => {
    expect(hasUncitedNumerics('Your net worth is $8,000 and you are up 5%.', facts)).toBe(false);
  });
  it('flags a number that matches no fact', () => {
    expect(hasUncitedNumerics('You have $12,345 in gains.', facts)).toBe(true);
  });
  it('accepts numeric-free prose', () => {
    expect(hasUncitedNumerics('Here is a summary of your portfolio.', facts)).toBe(false);
  });

  it('flags a large fabricated dollar figure (fixed tolerance, not proportional to size)', () => {
    // Regression: a proportional window let a whale-sized fabrication slip through.
    const whale = [fact('nw', 8_000_000, 'usd')];
    expect(hasUncitedNumerics('You can safely withdraw $8,007,000 today.', whale)).toBe(true);
  });

  it('does not let a non-ratio numeric fact launder an arbitrary percentage via the ×100 form', () => {
    // Value 0.6 but unit 'score' (not 'ratio') → "60%" must NOT reconcile against it.
    const scoreOnly = [fact('div', 0.6, 'score')];
    expect(hasUncitedNumerics('Your staking yield is 60%.', scoreOnly)).toBe(true);
  });
});
