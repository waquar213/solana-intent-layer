/**
 * AI Financial Copilot — the response contract and shared vocabulary.
 *
 * The Copilot is an orchestration shell above every engine, CONSTRAINED BY them.
 * The LLM's only jobs are to pick tools and draft prose; everything that decides
 * anything — recommendations, plan gating, risk/policy surfacing, confidence,
 * fact-verification — is deterministic code. Four structural invariants live in
 * these types + the code around them, NOT in prompts:
 *   1. No-execute-by-construction — no tool moves funds; `ProposedPlan.signed`
 *      is the literal `false`, so a signed/executed plan is not representable.
 *   2. Fact-grounding — every figure is a `CitedFact` resolved against the turn's
 *      FactLedger; unverifiable numbers are stripped or the response is rejected.
 *   3. Security + policy non-bypass — a proposed action clears Risk AND Policy
 *      before it can be `ready`; a block is terminal.
 *   4. Uncertainty disclosed — `confidence` is required and floored; low
 *      confidence forces an `uncertaintyNote`.
 */
import type { ExecutionPermission } from '@intent-wallet/policy';

export type Confidence = number; // [0,1]

export interface FactSource {
  engine: 'intelligence' | 'risk' | 'router' | 'intents' | 'portfolio' | 'policy';
  call: string;
}

/** A single figure the response cites — always resolvable against the FactLedger. */
export interface CitedFact {
  id: string;
  label: string;
  value: number | string;
  unit?: 'usd' | 'pct' | 'count' | 'score' | 'ratio';
  source: FactSource;
}

export interface RiskDisclosure {
  level: 'low' | 'medium' | 'high' | 'block';
  reasons: string[];
  blocking: boolean;
}

export interface PolicyDisclosure {
  gate: 'allow' | 'require_confirmation' | 'defer' | 'escalate' | 'block';
  reasons: string[];
  requirements: string[];
  blocking: boolean;
}

export interface Alternative {
  title: string;
  rationale: string;
  facts: CitedFact[];
}

/**
 * The minimal, engine-agnostic view of a plan the Copilot proposes. The concrete
 * `ExecutionPlan` is carried opaquely in `raw`; the Copilot never depends on its
 * shape and never executes it.
 */
export interface PlanProposal {
  planId?: string;
  intentId?: string;
  /** Maps to a policy `PolicyType`. */
  policyType: string;
  intentKind: string;
  amountMicros?: bigint;
  recipient?: { address: string; chainId: string };
  approval?: { token: string; spender: string; amountBase: bigint; decimals: number };
  summary: string;
  raw?: unknown;
}

export type PlanStatus = 'ready' | 'needs_confirmation' | 'explained_gate';

export interface ProposedPlan {
  /** Set ONLY by the PolicyGate, never by the LLM. */
  status: PlanStatus;
  /** Unsigned; null when the gate blocked it. */
  plan: PlanProposal | null;
  security: RiskDisclosure;
  policy: PolicyDisclosure;
  permission?: ExecutionPermission;
  approvalPrompt: string;
  /** Literal `false` — a signed plan is structurally not representable here. */
  signed: false;
}

export interface Recommendation {
  code: string;
  title: string;
  detail: string;
  why: string;
  dataUsed: CitedFact[];
  risks: RiskDisclosure;
  alternatives: Alternative[];
  confidence: Confidence;
  proposedPlan?: ProposedPlan;
}

export interface AutomationIntent {
  kind: string;
  description: string;
  params: Record<string, string | number | boolean>;
}

export interface AutomationSuggestion {
  code: string;
  title: string;
  detail: string;
  /** An UNSIGNED, un-installed automation proposal. */
  intent: AutomationIntent;
  dataUsed: CitedFact[];
  confidence: Confidence;
}

export interface FollowUp {
  label: string;
  prompt: string;
}

export type CopilotResponseKind = 'answer' | 'recommendation' | 'proposed_plan' | 'clarification' | 'refusal';

export interface CopilotResponse {
  kind: CopilotResponseKind;
  answer: string;
  facts: CitedFact[];
  recommendations: Recommendation[];
  proposedPlan?: ProposedPlan;
  automationSuggestions: AutomationSuggestion[];
  risk: RiskDisclosure;
  alternatives: Alternative[];
  confidence: Confidence;
  followUps: FollowUp[];
  provenance: FactSource[];
  /** True iff every cited fact reconciled and no proposed plan was left in an explained-gate state. */
  verified: boolean;
  uncertainties: string[];
  uncertaintyNote?: string;
  usedTools: string[];
}

export interface CopilotRequest {
  identityId: string;
  utterance: string;
  conversationId: string;
  history?: Array<{ role: 'user' | 'copilot'; text: string }>;
  /** ISO timestamp; the Copilot never reads the clock. */
  now: string;
  preferencesId?: string;
  locale?: string;
}
