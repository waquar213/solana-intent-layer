import { createInMemorySources, createPolicyEngine } from '@intent-wallet/policy';
import { InMemoryThreatIntel, RiskEngine } from '@intent-wallet/risk';
import { AutomationEngine, createTestEnv, InMemoryRunStore, InMemoryWorkflowStore } from '../src/index.js';
import type {
  Action,
  ContextProvider,
  EvalContext,
  Executor,
  ExecutorContext,
  Notifier,
  PolicyAuthorizer,
  Workflow,
} from '../src/index.js';

export const NOW_MONDAY = '2026-01-05T10:00:00.000Z'; // a Monday, after 09:00 UTC
export const SANCT = '0x1111111111111111111111111111111111111111';

export function makeContext(over: Partial<EvalContext> = {}): ContextProvider {
  return {
    evalContext: (_ownerId, nowIso) =>
      Promise.resolve({
        nowIso,
        prices: {},
        priceMoves: {},
        portfolio: { health: 70, drawdown: 0.05, risk_score: 20, net_worth: 10000 },
        gasGwei: 20,
        variables: {},
        events: [],
        ...over,
      }),
  };
}

export class RecordingExecutor implements Executor {
  readonly calls: Array<{ action: Action; ctx: ExecutorContext }> = [];
  execute(action: Action, ctx: ExecutorContext): Promise<{ ok: boolean; ref?: string; detail: string }> {
    this.calls.push({ action, ctx });
    return Promise.resolve({ ok: true, ref: '0xtx', detail: 'executed via session key' });
  }
}

export class RecordingNotifier implements Notifier {
  readonly messages: Array<{ ownerId: string; message: string }> = [];
  notify(ownerId: string, message: string): Promise<void> {
    this.messages.push({ ownerId, message });
    return Promise.resolve();
  }
}

export const sanctioningRisk = (): RiskEngine =>
  new RiskEngine({ intel: new InMemoryThreatIntel({ sanctioned: [SANCT] }) });

export function makeAuthorizer(risk: RiskEngine = new RiskEngine()): PolicyAuthorizer {
  const policy = createPolicyEngine({ sources: createInMemorySources(risk) });
  return { authorize: (req) => policy.evaluate(req) };
}

export function makeEngine(over: { risk?: RiskEngine; context?: ContextProvider } = {}) {
  const executor = new RecordingExecutor();
  const notifier = new RecordingNotifier();
  const workflows = new InMemoryWorkflowStore();
  const runs = new InMemoryRunStore();
  const engine = new AutomationEngine({
    env: createTestEnv({ nowIso: NOW_MONDAY }),
    authorizer: makeAuthorizer(over.risk),
    executor,
    notifier,
    context: over.context ?? makeContext(),
    workflows,
    runs,
  });
  return { engine, executor, notifier, workflows, runs };
}

export function dcaWorkflow(over: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-1',
    ownerId: 'user-1',
    title: 'DCA into BTC',
    description: 'Buy BTC weekly',
    trigger: { kind: 'schedule', every: 'week', atHourUtc: 9, dayOfWeek: 1 },
    condition: { op: 'always' },
    actions: [{ kind: 'swap', fromAsset: 'USDC', toAsset: 'BTC', amountMicros: 100_000_000n, chainId: 'ethereum' }],
    safety: {},
    status: 'active',
    version: 1,
    createdAtIso: '2026-01-01T00:00:00.000Z',
    catchUp: 'once',
    sessionKeyId: 'sk-1',
    ...over,
  };
}
