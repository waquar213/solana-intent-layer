/**
 * Injected sources — the seams between the pure automation core and everything
 * else. The two that matter most for safety:
 *  - `PolicyAuthorizer` is the GATE: the engine delegates every financial action
 *    to `PolicyEngine.evaluate` (which composes Risk). Automation has no
 *    authorization power of its own.
 *  - `Executor` moves funds via a PRE-AUTHORIZED, policy-bounded session key. It
 *    is never given the master key, so automation stays non-custodial.
 * Everything else (context, notifier, stores) is an interface with an in-memory
 * fake, so the engine is fully offline- and time-travel-testable.
 */
import type { ExecutionPermission, PolicyRequest } from '@intent-wallet/policy';
import type { Action, EvalContext, Workflow, WorkflowRun } from './types.js';

export interface PolicyAuthorizer {
  authorize(request: PolicyRequest): Promise<ExecutionPermission>;
}

export interface ExecutorContext {
  ownerId: string;
  sessionKeyId?: string;
  permission: ExecutionPermission;
}

export interface Executor {
  execute(action: Action, ctx: ExecutorContext): Promise<{ ok: boolean; ref?: string; detail: string }>;
}

export interface Notifier {
  notify(ownerId: string, message: string): Promise<void>;
}

export interface ContextProvider {
  /** Build the evaluation context for a principal at `nowIso` (prices, portfolio, gas, events). */
  evalContext(ownerId: string, nowIso: string): Promise<EvalContext>;
}

export interface WorkflowStore {
  list(ownerId: string): Promise<Workflow[]>;
  get(id: string): Promise<Workflow | null>;
  save(workflow: Workflow): Promise<void>;
}

export interface RunStore {
  /** Idempotency gate: returns false if a run with this key already exists. */
  claim(idempotencyKey: string): Promise<boolean>;
  append(run: WorkflowRun): Promise<void>;
  history(workflowId: string): Promise<WorkflowRun[]>;
}

// --- In-memory implementations (structuredClone isolation) ---

export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly byId = new Map<string, Workflow>();
  list(ownerId: string): Promise<Workflow[]> {
    return Promise.resolve([...this.byId.values()].filter((w) => w.ownerId === ownerId).map((w) => structuredClone(w)));
  }
  get(id: string): Promise<Workflow | null> {
    const w = this.byId.get(id);
    return Promise.resolve(w ? structuredClone(w) : null);
  }
  save(workflow: Workflow): Promise<void> {
    this.byId.set(workflow.id, structuredClone(workflow));
    return Promise.resolve();
  }
}

export class InMemoryRunStore implements RunStore {
  private readonly runs: WorkflowRun[] = [];
  private readonly claimed = new Set<string>();
  claim(idempotencyKey: string): Promise<boolean> {
    if (this.claimed.has(idempotencyKey)) return Promise.resolve(false);
    this.claimed.add(idempotencyKey);
    return Promise.resolve(true);
  }
  append(run: WorkflowRun): Promise<void> {
    this.runs.push(structuredClone(run));
    return Promise.resolve();
  }
  history(workflowId: string): Promise<WorkflowRun[]> {
    return Promise.resolve(this.runs.filter((r) => r.workflowId === workflowId).map((r) => structuredClone(r)));
  }
}
