/**
 * SolverNetwork — the public facade. Register staked solvers, run a competitive
 * `solve` (collect → verify → reputation-weighted select), and feed post-
 * settlement outcomes back into reputation. The winner it returns is a PROPOSAL;
 * settlement + Risk + Policy + a device signature still stand between it and any
 * movement of funds.
 */
import { createTestEnv, type SolverEnv } from './env.js';
import { SolverMarketplace, type MarketplaceOptions } from './marketplace.js';
import { InMemorySolverRegistry, type SolverRegistry } from './registry.js';
import { ReputationEngine, type OutcomeUpdate } from './reputation.js';
import type { Simulator } from './sources.js';
import type { SolveOutcome, SolveRequest, Solver, SolverInfo } from './types.js';

export interface SolverNetworkDeps {
  env?: SolverEnv;
  registry?: SolverRegistry;
  reputation?: ReputationEngine;
  simulator?: Simulator;
  options?: MarketplaceOptions;
}

export class SolverNetwork {
  readonly registry: SolverRegistry;
  readonly reputation: ReputationEngine;
  private readonly marketplace: SolverMarketplace;

  constructor(deps: SolverNetworkDeps = {}) {
    this.registry = deps.registry ?? new InMemorySolverRegistry();
    this.reputation = deps.reputation ?? new ReputationEngine();
    const env = deps.env ?? createTestEnv();
    this.marketplace = new SolverMarketplace(
      {
        registry: this.registry,
        reputation: this.reputation,
        env,
        ...(deps.simulator ? { simulator: deps.simulator } : {}),
      },
      deps.options ?? {},
    );
  }

  register(info: SolverInfo): void {
    this.registry.register(info);
  }

  /** Run a competitive solve for a request across the given solvers. */
  solve(request: SolveRequest, solvers: Solver[]): Promise<SolveOutcome> {
    return this.marketplace.solve(request, solvers);
  }

  /** Feed a post-settlement outcome back into the winner's reputation. */
  reportSettlement(solverId: string, update: OutcomeUpdate): void {
    this.reputation.onOutcome(solverId, update);
  }

  reputationScore(solverId: string): number {
    return this.reputation.score(solverId);
  }
}

export function createSolverNetwork(deps: SolverNetworkDeps = {}): SolverNetwork {
  return new SolverNetwork(deps);
}
