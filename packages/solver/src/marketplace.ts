/**
 * SolverMarketplace — the coordinator. It broadcasts a request, collects every
 * proposal (SEALED: no solver sees another's before evaluation, so there is
 * nothing to front-run), then for each proposal:
 *   1. validates it structurally (eligibility, integrity, deadline, delivers-min,
 *      slippage, providers);
 *   2. INDEPENDENTLY SIMULATES it — if the solver over-claimed the output
 *      (promised more than reality delivers), the proposal is rejected AND the
 *      solver is slashed for a malicious over-claim (its claims are checked, not
 *      trusted);
 *   3. scores the survivors on a reputation-weighted blend and selects the best.
 * The winner still clears Risk + Policy + a device signature downstream — the
 * marketplace only chooses WHICH valid proposal to settle.
 */
import type { SolverEnv } from './env.js';
import { computeSlash } from './incentives.js';
import { validateProposal } from './proposal.js';
import type { ReputationEngine } from './reputation.js';
import type { SolverRegistry } from './registry.js';
import { scoreProposals, selectWinner } from './scoring.js';
import type { Simulator } from './sources.js';
import type { ProposalEvaluation, SolveOutcome, SolveRequest, Solver, SolverProposal } from './types.js';

export interface MarketplaceDeps {
  registry: SolverRegistry;
  reputation: ReputationEngine;
  env: SolverEnv;
  simulator?: Simulator;
}

export interface MarketplaceOptions {
  /** Minimum stake a solver needs to be eligible (anti-Sybil/spam). */
  minStakeMicros?: bigint;
  /** How much a claimed output may exceed the simulated output before it's an over-claim. Default 0. */
  simulationToleranceBps?: number;
}

export class SolverMarketplace {
  private readonly minStake: bigint;
  private readonly tolBps: number;

  constructor(
    private readonly deps: MarketplaceDeps,
    options: MarketplaceOptions = {},
  ) {
    this.minStake = options.minStakeMicros ?? 0n;
    this.tolBps = options.simulationToleranceBps ?? 0;
  }

  async solve(request: SolveRequest, solvers: Solver[]): Promise<SolveOutcome> {
    // 1. Sealed collection — gather all proposals before anyone is evaluated.
    const proposals: SolverProposal[] = [];
    for (const solver of solvers) {
      try {
        const p = await solver.solve(request);
        if (p) proposals.push(p);
      } catch {
        // a solver that errors/times out simply doesn't compete this round
      }
    }

    // 2. Validate + independently verify each proposal.
    const evaluations: ProposalEvaluation[] = [];
    for (const proposal of proposals) {
      const info = this.deps.registry.info(proposal.solverId);
      const validation = validateProposal(request, proposal, info, this.deps.env, { minStakeMicros: this.minStake });

      if (validation.valid && this.deps.simulator) {
        const sim = await this.deps.simulator.simulate(proposal);
        const claimed = BigInt(proposal.outMinBase);
        if (!sim) {
          validation.checks.push({ name: 'simulation_match', ok: false, detail: 'proposal could not be simulated' });
          validation.valid = false;
        } else {
          const actual = BigInt(sim.outBase);
          const allowance = (actual * BigInt(this.tolBps)) / 10_000n;
          const overClaim = claimed > actual + allowance;
          validation.checks.push({
            name: 'simulation_match',
            ok: !overClaim,
            detail: overClaim ? `over-claim: promised ${claimed}, simulated ${actual}` : 'claimed output verified',
          });
          if (overClaim) {
            validation.valid = false;
            // Caught lying → slash for a malicious over-claim + record a security incident.
            if (info) {
              const slash = computeSlash(proposal.solverId, info.stakeMicros, 'malicious');
              this.deps.registry.slash(proposal.solverId, slash.amountMicros);
            }
            this.deps.reputation.onOutcome(proposal.solverId, { securityIncident: true });
          }
        }
      }

      evaluations.push({
        proposal,
        validation,
        score: 0,
        reputationWeight: this.deps.reputation.score(proposal.solverId),
      });
    }

    // 3. Score the valid survivors and select the winner.
    const valid = evaluations.filter((e) => e.validation.valid).map((e) => e.proposal);
    const scored = scoreProposals(valid, (id) => this.deps.reputation.score(id));
    const scoreById = new Map(scored.map((s) => [s.proposal.solverId, s.score]));
    for (const e of evaluations) e.score = scoreById.get(e.proposal.solverId) ?? 0;

    const winner = selectWinner(evaluations);
    return { requestId: request.id, winner, evaluations, ...(winner ? {} : { reason: 'no valid proposal' }) };
  }
}
