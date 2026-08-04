/**
 * Deterministic confidence scoring. Confidence starts at 1.0 and is multiplied
 * down by every source of doubt — stale data, missing data, a low route
 * confidence, a gate that needs confirmation or blocks, LLM retries. Below the
 * floor (0.55) a response MUST carry an `uncertaintyNote`. This is the "never
 * hide uncertainty" guardrail as code.
 */
import type { CombinedGate } from '@intent-wallet/policy';

export interface ConfidenceInput {
  stale?: boolean;
  missingData?: boolean;
  routeConfidence?: number;
  gate?: CombinedGate;
  llmRetries?: number;
}

export interface ConfidenceResult {
  confidence: number;
  uncertainties: string[];
  uncertaintyNote?: string;
}

const CONFIDENCE_FLOOR = 0.55;

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  let c = 1;
  const uncertainties: string[] = [];

  if (input.stale) {
    c *= 0.7;
    uncertainties.push('portfolio data is stale');
  }
  if (input.missingData) {
    c *= 0.8;
    uncertainties.push('some data was unavailable');
  }
  if (input.routeConfidence !== undefined) c *= input.routeConfidence;
  if (input.gate === 'require_confirmation' || input.gate === 'defer' || input.gate === 'escalate') {
    c *= 0.85;
    uncertainties.push('this action needs your confirmation');
  }
  if (input.gate === 'block') {
    c *= 0.5;
    uncertainties.push('this action is blocked by risk or policy');
  }
  if (input.llmRetries && input.llmRetries > 0) c *= Math.max(0.5, 1 - 0.15 * input.llmRetries);

  // Math.max/min do NOT clamp NaN — a non-finite intermediate would surface as a NaN confidence,
  // which compares false against the floor and would slip past the low-confidence gate.
  const rounded = Math.round(c * 100) / 100;
  const confidence = Number.isFinite(rounded) ? Math.max(0, Math.min(1, rounded)) : 0;
  const result: ConfidenceResult = { confidence, uncertainties };
  if (confidence < CONFIDENCE_FLOOR) {
    result.uncertaintyNote = 'Confidence is low — treat this as directional, not definitive.';
  }
  return result;
}
