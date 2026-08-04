/**
 * Policy simulation — dry-run a candidate policy set against a battery of
 * requests and diff it against the live set, WITHOUT writing anything (no store
 * save, no audit append). This is how an admin sees "what would change" before
 * shipping a policy edit. It holds only the read-side collaborators, so it is
 * structurally incapable of persisting.
 */
import type { ContextEngine } from './context.js';
import type { DecisionEngine } from './decision.js';
import type { RuleEngine } from './rules.js';
import type { PolicyDecision, PolicyRequest, PolicySet } from './types.js';

export interface SimulationRequest {
  candidateSet: PolicySet;
  requests: PolicyRequest[];
  liveSet?: PolicySet;
}

export interface SimulationRow {
  requestId: string;
  candidate: PolicyDecision;
  live?: PolicyDecision;
  changed: boolean;
}

export interface SimulationResult {
  perRequest: SimulationRow[];
  summary: { total: number; changedOutcomes: number; newlyBlocked: number; newlyApproved: number };
}

export interface SimulatorDeps {
  context: ContextEngine;
  rules: RuleEngine;
  decision: DecisionEngine;
}

export class PolicySimulator {
  constructor(private readonly deps: SimulatorDeps) {}

  async simulate(req: SimulationRequest): Promise<SimulationResult> {
    const perRequest: SimulationRow[] = [];
    let changedOutcomes = 0;
    let newlyBlocked = 0;
    let newlyApproved = 0;

    for (const request of req.requests) {
      const ctx = await this.deps.context.assemble(request);
      const candidate = this.deps.decision.decide(
        this.deps.rules.run(req.candidateSet.rules, ctx),
        ctx,
        req.candidateSet.contentHash,
      );
      const live = req.liveSet
        ? this.deps.decision.decide(this.deps.rules.run(req.liveSet.rules, ctx), ctx, req.liveSet.contentHash)
        : undefined;

      const changed = live !== undefined && live.outcome !== candidate.outcome;
      if (changed) {
        changedOutcomes++;
        if (candidate.outcome === 'blocked') newlyBlocked++;
        if (candidate.outcome === 'approved') newlyApproved++;
      }
      perRequest.push({ requestId: request.requestId, candidate, changed, ...(live ? { live } : {}) });
    }

    return { perRequest, summary: { total: req.requests.length, changedOutcomes, newlyBlocked, newlyApproved } };
  }
}
