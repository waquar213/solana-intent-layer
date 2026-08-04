/**
 * Decentralized Solver Network — the shared vocabulary of the competitive
 * execution marketplace.
 *
 * Instead of the platform choosing one route internally, independent solvers
 * COMPETE to satisfy a `SolveRequest`. Each returns a `SolverProposal`. The
 * platform is the coordinator: it INDEPENDENTLY VERIFIES every proposal against
 * the request (and, where a simulator is available, against reality — it never
 * trusts a solver's claims), reputation-weights the valid ones, and selects the
 * best. The winner's plan goes to the Settlement Engine.
 *
 * Doctrine: solvers PROPOSE; they never hold keys, never sign, and never bypass
 * policy or security — the winning proposal still clears Risk + Policy and a
 * device signature. A solver cannot lie its way to selection because its claims
 * are checked, not believed.
 *
 * Amounts cross the network as decimal strings (bigint-safe, serializable).
 */
export interface SolveRequest {
  id: string;
  principalId: string;
  fromAsset: string;
  toAsset: string;
  /** Input amount in base units (bigint as a decimal string). */
  amountInBase: string;
  fromDecimals: number;
  toDecimals: number;
  /** The user's minimum acceptable output — a proposal MUST deliver at least this. */
  minOutBase: string;
  maxSlippageBps: number;
  fromChain: string;
  toChain: string;
  /** If set, a proposal may use ONLY these providers. */
  allowedProviders?: string[];
  deniedProviders?: string[];
  /** Proposals submitted after this are rejected (sealed submission window). */
  deadlineIso: string;
}

export interface ProposalLeg {
  kind: string;
  chainId: string;
  venue: string;
  description: string;
}

export interface SolverProposal {
  requestId: string;
  solverId: string;
  /** Guaranteed minimum output in base units (bigint string) — the solver's binding commitment. */
  outMinBase: string;
  /** Total fee in micro-USD (bigint string). */
  feeMicros: string;
  slippageBps: number;
  etaSeconds: number;
  providers: string[];
  /** Solver's self-reported confidence [0,1] — advisory; scoring weights it lightly. */
  confidence: number;
  /** What the solver falls back to if a leg fails. */
  fallback: string;
  legs: ProposalLeg[];
  submittedAtIso: string;
  /** Content hash over the proposal fields — integrity / anti-tampering. Recomputed + checked by the platform. */
  hash: string;
}

// --- Solvers + registry ---

export interface Solver {
  readonly id: string;
  solve(request: SolveRequest): Promise<SolverProposal | null>;
}

export interface SolverInfo {
  id: string;
  /** Staked collateral in micro-USD. Slashable for bad behavior; gates eligibility (anti-Sybil/spam). */
  stakeMicros: bigint;
  banned: boolean;
}

export interface ReputationRecord {
  solverId: string;
  wins: number;
  losses: number;
  timeouts: number;
  invalidProposals: number;
  securityIncidents: number;
  totalLatencyMs: number;
  samples: number;
  /** Cumulative cost savings this solver delivered vs a baseline, µUSD. */
  costSavingsMicros: bigint;
}

// --- Evaluation ---

export interface ValidationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ValidationResult {
  valid: boolean;
  checks: ValidationCheck[];
}

export interface ProposalEvaluation {
  proposal: SolverProposal;
  validation: ValidationResult;
  /** Composite score in [0,1] (higher is better); 0 for invalid proposals. */
  score: number;
  /** Reputation multiplier applied, in [0,1]. */
  reputationWeight: number;
}

export interface SolveOutcome {
  requestId: string;
  winner: SolverProposal | null;
  evaluations: ProposalEvaluation[];
  reason?: string;
}

// --- Incentives ---

export type SlashReason = 'timeout' | 'invalid_proposal' | 'malicious';

export interface Reward {
  solverId: string;
  amountMicros: bigint;
}

export interface Slash {
  solverId: string;
  amountMicros: bigint;
  reason: SlashReason;
}
