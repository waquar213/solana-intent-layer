/**
 * Injected sources. The `Simulator` is the platform's independent verification
 * of a proposal's claimed OUTPUT — it re-computes what the proposed route would
 * actually deliver, so a solver that over-claims (promises more than reality
 * gives) is caught and slashed rather than selected. `ScriptedSolver` is a
 * deterministic solver for tests; the platform's own Route Optimizer is wired in
 * as the "house solver" (a baseline that always competes) at the wiring layer.
 */
import type { SolveRequest, Solver, SolverProposal } from './types.js';

export interface Simulator {
  /** Independently compute the output the proposed route would actually deliver, or null if unsimulatable. */
  simulate(proposal: SolverProposal): Promise<{ outBase: string } | null>;
}

export class ScriptedSolver implements Solver {
  constructor(
    readonly id: string,
    private readonly fn: (request: SolveRequest) => SolverProposal | null,
  ) {}
  solve(request: SolveRequest): Promise<SolverProposal | null> {
    return Promise.resolve(this.fn(request));
  }
}
