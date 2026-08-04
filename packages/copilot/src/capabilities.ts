/**
 * The engines the Copilot orchestrates, as INJECTED capabilities. The Copilot is
 * a pure orchestrator over these — it never constructs the concrete engines, so
 * it stays offline-testable with fakes and cannot reach anything it wasn't
 * handed. Critically, there is NO execute/sign capability here: the strongest
 * guardrail is that the ability to move funds is simply not in the Copilot's
 * hands. The real adapters (built at services/api) wrap the concrete Intelligence
 * / Risk / Router / Intent / Policy engines behind these signatures.
 */
import type { NarrativeKind, NarrativeReport, PortfolioIntelligence } from '@intent-wallet/intelligence';
import type { ExecutionPermission, PolicyRequest } from '@intent-wallet/policy';
import type { SecurityDecision, SecuritySubject } from '@intent-wallet/risk';
import type { PlanProposal } from './types.js';

export interface RouteSummary {
  summary: string;
  /** Route confidence [0,1] from the optimizer. */
  confidence: number;
  costMicros?: bigint;
  alternatives: Array<{ title: string; rationale: string }>;
}

export interface CopilotCapabilities {
  /** Portfolio Intelligence — the source of every portfolio figure. */
  analyze(identityId: string): Promise<PortfolioIntelligence>;
  narrate(intel: PortfolioIntelligence, kind: NarrativeKind): Promise<NarrativeReport>;
  /** Risk assessment for a specific subject (token/address/approval/provider). */
  assessRisk(subject: SecuritySubject): SecurityDecision;
  /** Route optimization (optional — some deployments omit it). */
  findRoute?(request: { fromAsset: string; toAsset: string; amount: string }): Promise<RouteSummary>;
  /** Turn an utterance into a PROPOSED (unsigned) plan, or null. */
  planIntent?(utterance: string, identityId: string): Promise<PlanProposal | null>;
  /** The Policy gate. Absence => the PolicyGate fails closed. */
  evaluatePolicy?(request: PolicyRequest): Promise<ExecutionPermission>;
}
