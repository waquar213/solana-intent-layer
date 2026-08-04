/**
 * The Copilot orchestrator + facade. `ask` runs the deterministic loop:
 *   assemble context (analyze once) → seed ledger → LLM tool loop → synthesize
 *   → FORCE Risk+Policy on any plan candidate (via the PolicyGate, not the LLM)
 *   → deterministic recommendations/automations → confidence → verify → return.
 *
 * The LLM only picks tools and drafts prose. Every decision — which plan is
 * ready, what risk/policy to surface, the confidence, whether a figure is
 * allowed to appear — is code. There is no execution capability anywhere in this
 * class, so no path can move funds.
 */
import type { CopilotCapabilities } from './capabilities.js';
import type { CopilotLlmClient, LlmMessage, ToolResultMsg } from './boundary.js';
import { computeConfidence } from './confidence.js';
import { ContextAssembler, redact } from './context.js';
import { CopilotError } from './errors.js';
import { PolicyGate } from './gate.js';
import { FactLedger } from './ledger.js';
import type { PreferenceStore } from './memory.js';
import { AutomationSuggester, RecommendationBuilder } from './recommend.js';
import { DEFAULT_TOOLS, ToolDispatcher } from './tools.js';
import type { ToolDeps, ToolSpec } from './tools.js';
import { hasUncitedNumerics, verifyResponse } from './verify.js';
import type {
  CopilotRequest,
  CopilotResponse,
  CopilotResponseKind,
  FactSource,
  PlanProposal,
  ProposedPlan,
  RiskDisclosure,
} from './types.js';

const SYSTEM_PROMPT = [
  'You are the Universal Intent Wallet Financial Copilot: a decision-support assistant, not a chatbot.',
  'You help the user understand, plan, and safely act on their crypto portfolio.',
  'You may call read/analyze/propose tools and draft prose. You cannot and must not execute or sign anything.',
  'Only state figures returned by tools. Never invent balances, prices, or transactions.',
  'Any action you propose is unsigned and must pass the risk and policy gates before the user can approve it.',
  'If you are unsure, say so.',
].join(' ');

const LOW_RISK: RiskDisclosure = { level: 'low', reasons: [], blocking: false };

export interface CopilotDeps {
  llm: CopilotLlmClient;
  capabilities: CopilotCapabilities;
  tools?: readonly ToolSpec[];
  preferences?: PreferenceStore;
  /** Id generator for policy requests (deterministic in tests). */
  idFor?: () => string;
  maxSteps?: number;
}

export class Copilot {
  private readonly llm: CopilotLlmClient;
  private readonly capabilities: CopilotCapabilities;
  private readonly assembler: ContextAssembler;
  private readonly dispatcher: ToolDispatcher;
  private readonly gate: PolicyGate;
  private readonly recommend = new RecommendationBuilder();
  private readonly automations = new AutomationSuggester();
  private readonly maxSteps: number;

  constructor(deps: CopilotDeps) {
    this.llm = deps.llm;
    this.capabilities = deps.capabilities;
    this.assembler = new ContextAssembler(deps.capabilities);
    this.dispatcher = new ToolDispatcher(deps.tools ?? DEFAULT_TOOLS);
    let n = 0;
    this.gate = new PolicyGate(deps.capabilities.evaluatePolicy, deps.idFor ?? (() => `pgreq-${(++n).toString(36)}`));
    this.maxSteps = deps.maxSteps ?? 4;
  }

  async ask(request: CopilotRequest): Promise<CopilotResponse> {
    const bundle = await this.assembler.assemble(request.identityId);
    const ledger = new FactLedger(bundle.seed);
    const toolDeps: ToolDeps = { capabilities: this.capabilities, identityId: request.identityId };

    const messages: LlmMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    for (const h of request.history ?? [])
      messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: redact(h.text) });
    messages.push({ role: 'user', content: request.utterance });

    let planCandidate: PlanProposal | undefined;
    let routeConfidence: number | undefined;
    let finalText = '';
    let retries = 0;
    const usedTools = new Set<string>();

    for (let step = 0; step < this.maxSteps; step++) {
      const turn = await this.llm.next(messages, this.dispatcher.schemas());
      if (turn.toolCalls && turn.toolCalls.length > 0) {
        const results: ToolResultMsg[] = [];
        for (const call of turn.toolCalls) {
          usedTools.add(call.name);
          try {
            const out = await this.dispatcher.dispatch(call, toolDeps, ledger);
            if (out.planCandidate) planCandidate = out.planCandidate;
            const rc = ledger.resolve('route.confidence');
            if (rc && typeof rc.value === 'number') routeConfidence = rc.value;
            const json = JSON.stringify(out.output, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
            results.push({ toolCallId: call.id, result: redact(json) });
          } catch (err) {
            // A bad/unknown/out-of-scope tool call is recovered from, never fatal.
            if (
              err instanceof CopilotError &&
              ['UNKNOWN_TOOL', 'TOOL_SCOPE_VIOLATION', 'LLM_MALFORMED'].includes(err.code)
            ) {
              results.push({ toolCallId: call.id, result: { error: err.code } });
            } else {
              throw err;
            }
          }
        }
        messages.push({ role: 'assistant', content: '', toolCalls: turn.toolCalls });
        messages.push({ role: 'tool', results });
        continue;
      }
      if (turn.finalText !== undefined) {
        finalText = turn.finalText;
        break;
      }
      break;
    }

    if (finalText === '') {
      retries = 1;
      finalText = 'Here is a summary of your portfolio and its current health. The figures are listed below.';
    }

    // Deterministic recommendations + automations from verified data.
    const recommendations = this.recommend.build(bundle.intel);
    for (const r of recommendations) ledger.add(r.dataUsed);
    const automationSuggestions = this.automations.suggest(request.utterance);

    // FORCE the risk+policy gate on any plan candidate — the LLM cannot make a plan "ready".
    let proposedPlan: ProposedPlan | undefined;
    if (planCandidate) proposedPlan = await this.gate.evaluate(planCandidate, request.identityId);

    const conf = computeConfidence({
      stale: bundle.stale,
      ...(routeConfidence !== undefined ? { routeConfidence } : {}),
      ...(proposedPlan?.permission ? { gate: proposedPlan.permission.gate } : {}),
      ...(retries > 0 ? { llmRetries: retries } : {}),
    });

    const facts = bundle.seed;
    const provenance: FactSource[] = [
      ...new Map(facts.map((f) => [`${f.source.engine}:${f.source.call}`, f.source])).values(),
    ];

    const kind: CopilotResponseKind = proposedPlan
      ? proposedPlan.status === 'explained_gate'
        ? 'refusal'
        : 'proposed_plan'
      : recommendations.length > 0
        ? 'recommendation'
        : 'answer';

    const response: CopilotResponse = {
      kind,
      answer: redact(finalText),
      facts,
      recommendations,
      automationSuggestions,
      risk: proposedPlan?.security ?? LOW_RISK,
      alternatives: [],
      confidence: conf.confidence,
      followUps: [],
      provenance,
      verified: false,
      uncertainties: conf.uncertainties,
      usedTools: [...usedTools],
      ...(proposedPlan ? { proposedPlan } : {}),
      ...(conf.uncertaintyNote ? { uncertaintyNote: conf.uncertaintyNote } : {}),
    };

    // Grounding gate: cited facts must reconcile, and no uncited number may appear in prose.
    const grounded = verifyResponse(response, ledger) && !hasUncitedNumerics(response.answer, ledger.all());
    response.verified = grounded && proposedPlan?.status !== 'explained_gate';
    if (!verifyResponse(response, ledger)) {
      throw new CopilotError('RESPONSE_UNVERIFIED', 'response cited a fact that does not reconcile with verified data');
    }
    return response;
  }
}
