/**
 * The tool registry + dispatcher — the LLM's only bridge to the engines. Every
 * tool is `read`, `analyze`, or `propose`. There is NO `execute` scope and no
 * fund-moving tool; `assertNoExecuteTools` fails the build if any tool name
 * looks like one. `plan_intent` returns at most an UNSIGNED proposal. The
 * dispatcher validates args, calls the bound capability, and records every
 * figure it produces into the FactLedger, so the model's later prose can be
 * checked against real data.
 */
import { round } from '@intent-wallet/intelligence';
import type { SecuritySubject } from '@intent-wallet/risk';
import type { CopilotCapabilities } from './capabilities.js';
import { CopilotError } from './errors.js';
import type { ToolCall } from './boundary.js';
import type { FactLedger } from './ledger.js';
import type { CitedFact, PlanProposal } from './types.js';

export type ToolScope = 'read' | 'analyze' | 'propose';

export interface ToolDeps {
  capabilities: CopilotCapabilities;
  identityId: string;
}

export interface ToolOutput {
  output: unknown;
  facts: CitedFact[];
  planCandidate?: PlanProposal;
}

export interface ToolSpec {
  name: string;
  scope: ToolScope;
  description: string;
  validate(args: unknown): Record<string, unknown>;
  handler(args: Record<string, unknown>, deps: ToolDeps): Promise<ToolOutput>;
}

const BANNED_TOOL_NAME = /execute|sign|broadcast|approve|send|transfer|withdraw|write/i;

/** Fail loudly if any tool could move funds. Called when the registry is built. */
export function assertNoExecuteTools(tools: readonly ToolSpec[]): void {
  for (const t of tools) {
    if (BANNED_TOOL_NAME.test(t.name)) {
      throw new CopilotError('TOOL_SCOPE_VIOLATION', `tool "${t.name}" has a fund-moving name`);
    }
  }
}

const usd = (micros: bigint): number => Number(micros) / 1_000_000;
const str = (args: Record<string, unknown>, key: string): string => {
  const v = args[key];
  if (typeof v !== 'string' || v.length === 0)
    throw new CopilotError('LLM_MALFORMED', `tool arg "${key}" must be a non-empty string`);
  return v;
};

const ANALYZE_TOOL: ToolSpec = {
  name: 'analyze_portfolio',
  scope: 'analyze',
  description: 'Analyze the portfolio: net worth, allocation, concentration, risk and health.',
  validate: () => ({}),
  async handler(_args, deps) {
    const intel = await deps.capabilities.analyze(deps.identityId);
    const src = { engine: 'intelligence', call: 'analyze' } as const;
    const facts: CitedFact[] = [
      { id: 'portfolio.netWorth', label: 'Net worth', value: usd(intel.netWorthMicros), unit: 'usd', source: src },
      {
        id: 'portfolio.healthScore',
        label: 'Health score',
        value: round(intel.risk.healthScore, 2),
        unit: 'score',
        source: src,
      },
      { id: 'portfolio.topAsset', label: 'Top asset', value: intel.allocation.byAsset[0]?.key ?? 'none', source: src },
      {
        id: 'portfolio.topAssetWeight',
        label: 'Top asset weight',
        value: round(intel.concentration.topAssetWeight, 4),
        unit: 'ratio',
        source: src,
      },
      {
        id: 'portfolio.diversificationScore',
        label: 'Diversification',
        value: round(intel.risk.diversificationScore, 2),
        unit: 'score',
        source: src,
      },
    ];
    return { output: intel, facts };
  },
};

const PERFORMANCE_TOOL: ToolSpec = {
  name: 'explain_performance',
  scope: 'analyze',
  description: 'Explain portfolio performance: time-weighted return and growth.',
  validate: () => ({}),
  async handler(_args, deps) {
    const intel = await deps.capabilities.analyze(deps.identityId);
    const src = { engine: 'intelligence', call: 'analyze' } as const;
    const facts: CitedFact[] = [];
    if (intel.performance.twr !== null)
      facts.push({
        id: 'performance.twr',
        label: 'Time-weighted return',
        value: round(intel.performance.twr, 4),
        unit: 'ratio',
        source: src,
      });
    if (intel.performance.growthPct !== null)
      facts.push({
        id: 'performance.growthPct',
        label: 'Growth',
        value: round(intel.performance.growthPct, 4),
        unit: 'ratio',
        source: src,
      });
    return { output: intel.performance, facts };
  },
};

/** A stable, UNIQUE reference for a risk subject, so two assessments of DIFFERENT subjects in one turn
 *  don't collide on the same fact id (last-writer-wins would report subject B's risk under subject A). */
function riskSubjectRef(s: SecuritySubject): string {
  switch (s.kind) {
    case 'token':
      return s.address;
    case 'address':
      return s.address;
    case 'approval':
      return `${s.token}:${s.spender}`;
    case 'provider':
      return s.providerId;
  }
}

const RISK_TOOL: ToolSpec = {
  name: 'assess_risk',
  scope: 'analyze',
  description: 'Assess the risk of a token, address, approval or provider.',
  validate: (args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    const subject = a['subject'];
    if (!subject || typeof subject !== 'object' || !('kind' in subject)) {
      throw new CopilotError('LLM_MALFORMED', 'assess_risk requires a { subject } with a kind');
    }
    return { subject: subject as unknown as Record<string, unknown> };
  },
  handler(args, deps) {
    const subject = args['subject'] as unknown as SecuritySubject;
    const decision = deps.capabilities.assessRisk(subject);
    const key = subject.kind;
    const ref = riskSubjectRef(subject); // subject-specific → two subjects of the same kind don't collide
    const src = { engine: 'risk', call: 'evaluate' } as const;
    return Promise.resolve({
      output: decision,
      facts: [
        { id: `risk.${key}.${ref}.level`, label: 'Risk level', value: decision.report.level, source: src },
        {
          id: `risk.${key}.${ref}.score`,
          label: 'Risk score',
          value: round(decision.report.score, 4),
          unit: 'ratio',
          source: src,
        },
      ],
    });
  },
};

const ROUTE_TOOL: ToolSpec = {
  name: 'find_route',
  scope: 'propose',
  description: 'Find the best route to swap/bridge an amount from one asset to another.',
  validate: (args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    return { fromAsset: str(a, 'fromAsset'), toAsset: str(a, 'toAsset'), amount: str(a, 'amount') };
  },
  async handler(args, deps) {
    if (!deps.capabilities.findRoute) throw new CopilotError('UNKNOWN_TOOL', 'routing is not available');
    const route = await deps.capabilities.findRoute({
      fromAsset: args['fromAsset'] as string,
      toAsset: args['toAsset'] as string,
      amount: args['amount'] as string,
    });
    const src = { engine: 'router', call: 'optimize' } as const;
    // Subject-specific (from→to) so two find_route calls in one turn don't collide on a fixed id and report
    // one route's confidence/cost under the other. copilot.ts reads the LATEST route fact (insertion order)
    // for the recommendation, so the "current route" semantic is preserved without a shared fixed key.
    const ref = `${args['fromAsset'] as string}-${args['toAsset'] as string}`;
    const facts: CitedFact[] = [
      {
        id: `route.${ref}.confidence`,
        label: 'Route confidence',
        value: round(route.confidence, 4),
        unit: 'ratio',
        source: src,
      },
    ];
    if (route.costMicros !== undefined)
      facts.push({ id: `route.${ref}.costUsd`, label: 'Route cost', value: usd(route.costMicros), unit: 'usd', source: src });
    return { output: route, facts };
  },
};

const PLAN_TOOL: ToolSpec = {
  name: 'plan_intent',
  scope: 'propose',
  description: 'Turn a natural-language intent into a PROPOSED, unsigned plan (never executed).',
  validate: (args) => ({ utterance: str((args ?? {}) as Record<string, unknown>, 'utterance') }),
  async handler(args, deps) {
    if (!deps.capabilities.planIntent) throw new CopilotError('UNKNOWN_TOOL', 'planning is not available');
    const proposal = await deps.capabilities.planIntent(args['utterance'] as string, deps.identityId);
    const facts: CitedFact[] = [];
    if (proposal?.amountMicros !== undefined) {
      facts.push({
        id: 'plan.amount',
        label: 'Plan amount',
        value: usd(proposal.amountMicros),
        unit: 'usd',
        source: { engine: 'intents', call: 'handle' },
      });
    }
    return { output: proposal, facts, ...(proposal ? { planCandidate: proposal } : {}) };
  },
};

/** The complete, frozen tool registry. No execute/sign/broadcast tool exists here. */
export const DEFAULT_TOOLS: readonly ToolSpec[] = Object.freeze([
  ANALYZE_TOOL,
  PERFORMANCE_TOOL,
  RISK_TOOL,
  ROUTE_TOOL,
  PLAN_TOOL,
]);

export class ToolDispatcher {
  private readonly byName: Map<string, ToolSpec>;
  constructor(private readonly tools: readonly ToolSpec[] = DEFAULT_TOOLS) {
    assertNoExecuteTools(tools);
    this.byName = new Map(tools.map((t) => [t.name, t]));
  }

  schemas(): Array<{ name: string; description: string }> {
    return this.tools.map((t) => ({ name: t.name, description: t.description }));
  }

  names(): string[] {
    return this.tools.map((t) => t.name);
  }

  async dispatch(call: ToolCall, deps: ToolDeps, ledger: FactLedger): Promise<ToolOutput> {
    const tool = this.byName.get(call.name);
    if (!tool) throw new CopilotError('UNKNOWN_TOOL', `no such tool: "${call.name}"`);
    const args = tool.validate(call.args);
    const result = await tool.handler(args, deps);
    ledger.add(result.facts);
    return result;
  }
}
