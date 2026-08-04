/**
 * @intent-wallet/solver — the Decentralized Solver Network (the internet of
 * execution). Independent, staked solvers compete to satisfy an execution
 * request; the platform coordinates, INDEPENDENTLY VERIFIES every proposal
 * (structurally + by simulation — it never trusts a solver's claims),
 * reputation-weights, and selects the best valid one for settlement. Standalone
 * (no internal deps) — a solver-network-as-a-service. Solvers propose; they
 * never hold keys, never sign, and never bypass Policy or Security.
 */
export type {
  SolveRequest,
  ProposalLeg,
  SolverProposal,
  Solver,
  SolverInfo,
  ReputationRecord,
  ValidationCheck,
  ValidationResult,
  ProposalEvaluation,
  SolveOutcome,
  SlashReason,
  Reward,
  Slash,
} from './types.js';

export { stableHash, createTestEnv, type SolverEnv, type TestEnvOptions } from './env.js';
export { signProposal, validateProposal, type ValidationOptions } from './proposal.js';
export { scoreProposals, selectWinner, SOLVER_WEIGHTS } from './scoring.js';
export { ReputationEngine, type OutcomeUpdate } from './reputation.js';
export { computeReward, computeSlash } from './incentives.js';
export { InMemorySolverRegistry, type SolverRegistry } from './registry.js';
export { ScriptedSolver, type Simulator } from './sources.js';
export { SolverMarketplace, type MarketplaceDeps, type MarketplaceOptions } from './marketplace.js';
export { SolverNetwork, createSolverNetwork, type SolverNetworkDeps } from './engine.js';
export { SolverError, type SolverErrorCode } from './errors.js';
