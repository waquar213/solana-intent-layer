/**
 * Composite risk scoring. Signals are treated as INDEPENDENT probabilities of
 * harm and combined with the probabilistic-OR:  score = 1 − Π(1 − sᵢ).
 * This makes many small risks compound (a fresh token AND low liquidity AND an
 * admin key is riskier than any one alone) while staying bounded in [0,1] — a
 * property a naive weighted sum lacks. Any single hard signal (severity ≥ 0.99,
 * e.g. sanctioned/blacklisted/honeypot) forces `block` regardless of the score.
 */
import type { RiskLevel, RiskReport, RiskSignal } from './types.js';

export const HARD_BLOCK_SEVERITY = 0.99;

/** Score → level thresholds (when no hard-block signal is present). */
const LEVEL_THRESHOLDS = { medium: 0.3, high: 0.6 } as const;

export function combineSignals(signals: RiskSignal[]): RiskReport {
  const clamped = signals.map((s) => ({ ...s, severity: clamp01(s.severity) }));
  const hasHardBlock = clamped.some((s) => s.severity >= HARD_BLOCK_SEVERITY);

  // Probabilistic OR of independent risks.
  const survival = clamped.reduce((acc, s) => acc * (1 - s.severity), 1);
  const score = round2(1 - survival);

  const level: RiskLevel = hasHardBlock
    ? 'block'
    : score < LEVEL_THRESHOLDS.medium
      ? 'low'
      : score < LEVEL_THRESHOLDS.high
        ? 'medium'
        : 'high';

  // Surface the most severe signals first.
  const sorted = [...clamped].sort((a, b) => b.severity - a.severity);
  return { level, score, signals: sorted };
}

/**
 * Clamp a severity into [0,1] — FAIL CLOSED on anything non-finite.
 *
 * The old form (`x < 0 ? 0 : x > 1 ? 1 : x`) mishandled both ends of "unreadable":
 *   · NaN escaped entirely (both comparisons are false), poisoning the composite score and
 *     landing the report on 'high' — which PROCEEDS with confirmation;
 *   · -Infinity clamped to 0, i.e. "no risk at all" → 'low', fully allowed.
 * Either way a sanctions/blacklist hit whose severity arrived corrupt was silently downgraded out
 * of 'block'. A signal we cannot read is the WORST case, not the best: clamp it to 1 so the hard
 * block fires. This layer's only power is to refuse; it must never soften on bad data.
 */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 1; // unreadable severity ⇒ treat as a hard block
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
