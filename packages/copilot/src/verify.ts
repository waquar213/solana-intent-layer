/**
 * Fact-grounding — the generalization of Intelligence's `verifyNarrative`. Every
 * figure a response cites must resolve against the turn's FactLedger within a
 * tolerance; `hasUncitedNumerics` additionally scans the free prose for numbers
 * that don't correspond to any recorded fact. Together they make "the AI never
 * fabricates a number" a checked property, not a hope.
 */
import type { FactLedger } from './ledger.js';
import type { CitedFact, CopilotResponse } from './types.js';

function collectCited(res: CopilotResponse): CitedFact[] {
  return [
    ...res.facts,
    ...res.alternatives.flatMap((a) => a.facts),
    ...res.recommendations.flatMap((r) => [...r.dataUsed, ...r.alternatives.flatMap((a) => a.facts)]),
    ...res.automationSuggestions.flatMap((s) => s.dataUsed),
  ];
}

/** True iff every cited fact reconciles with the ledger. */
export function verifyResponse(res: CopilotResponse, ledger: FactLedger): boolean {
  for (const f of collectCited(res)) {
    const actual = ledger.resolve(f.id);
    if (!actual) return false;
    if (typeof actual.value === 'number' && typeof f.value === 'number') {
      if (Math.abs(actual.value - f.value) > 0.01) return false;
    } else if (String(actual.value) !== String(f.value)) {
      return false;
    }
  }
  return true;
}

/**
 * Heuristic backstop: flag a number in prose that matches no known fact. This is
 * a SECONDARY defense — the primary grounding is `verifyResponse` over explicit
 * citations. Two hardenings over the naive version (both from adversarial review):
 *  - a FIXED absolute tolerance (not proportional), so a fabricated figure on a
 *    large portfolio can't slip through a magnitude-scaled window;
 *  - the ×100 percentage form is applied ONLY to a fact that is itself a ratio in
 *    [0,1] and only when the prose token is written as a percent — so an unrelated
 *    numeric fact can't launder an arbitrary percentage.
 * A residual limit remains (a fabricated percent numerically equal to a real
 * ratio×100, or a spelled-out/abbreviated figure): the durable fix is to emit
 * every figure through a cited slot, which the production synthesizer does.
 */
const NUMERIC_TOLERANCE = 0.5;

export function hasUncitedNumerics(text: string, facts: CitedFact[]): boolean {
  const tokens = text.match(/-?\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  const numeric = facts.filter((f): f is CitedFact & { value: number } => typeof f.value === 'number');
  for (const tok of tokens) {
    const isPct = tok.includes('%');
    const n = Number.parseFloat(tok.replace(/[$,%]/g, ''));
    if (!Number.isFinite(n)) continue;
    const matches = numeric.some((f) => {
      const raw = Math.abs(f.value - n) <= NUMERIC_TOLERANCE;
      const pct =
        isPct && f.unit === 'ratio' && f.value >= 0 && f.value <= 1 && Math.abs(f.value * 100 - n) <= NUMERIC_TOLERANCE;
      return raw || pct;
    });
    if (!matches) return true;
  }
  return false;
}
