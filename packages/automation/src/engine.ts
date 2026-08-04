/**
 * AutomationEngine — the autonomous run pipeline:
 *   trigger fires → conditions → SAFETY → idempotency claim → for each action
 *   build a PolicyRequest → AUTHORIZE via the injected Policy gate (which
 *   composes Risk) → mayProceedToSign ? execute via session key : PARK for
 *   approval → record run → notify.
 *
 * The engine never authorizes anything itself and never holds a key. A `block`
 * from the gate is terminal; anything short of a clean `mayProceedToSign` parks
 * the action as `awaiting_approval`. This is what makes an automated action
 * provably no more capable than a manual one.
 */
import type { PolicyRequest } from '@intent-wallet/policy';
import { evaluateCondition } from './conditions.js';
import type { AutomationEnv } from './env.js';
import { checkSafety, runsTodayCount } from './safety.js';
import type { ContextProvider, Executor, Notifier, PolicyAuthorizer, RunStore, WorkflowStore } from './sources.js';
import { lastScheduledInstant, triggerMet } from './triggers.js';
import type { Action, ActionResult, RunStatus, Workflow, WorkflowRun } from './types.js';

export interface AutomationEngineDeps {
  env: AutomationEnv;
  authorizer: PolicyAuthorizer;
  executor: Executor;
  notifier: Notifier;
  context: ContextProvider;
  workflows: WorkflowStore;
  runs: RunStore;
}

const CONTROL_ACTIONS = new Set(['notify', 'report', 'pause_workflow', 'disable_workflow']);

function mapActionToPolicyRequest(action: Action, wf: Workflow, index: number): PolicyRequest {
  const base = {
    requestId: `${wf.id}-${index}`,
    policyType: 'automation' as const,
    intentKind: action.kind,
    automationRuleId: wf.id,
    principalId: wf.ownerId,
  };
  switch (action.kind) {
    case 'transfer':
      return {
        ...base,
        amountMicros: action.amountMicros,
        recipient: { address: action.toAddress, chainId: action.chainId },
      };
    case 'swap':
    case 'bridge':
    case 'stake':
    case 'unstake':
      return { ...base, amountMicros: action.amountMicros };
    case 'approve':
      return {
        ...base,
        approval: {
          token: action.token,
          spender: action.spender,
          amountBase: action.amountBase,
          decimals: action.decimals,
        },
      };
    default:
      return base;
  }
}

function aggregate(results: ActionResult[]): RunStatus {
  if (results.some((r) => r.status === 'blocked')) return 'blocked';
  if (results.some((r) => r.status === 'failed')) return 'failed';
  if (results.some((r) => r.status === 'awaiting_approval')) return 'awaiting_approval';
  return 'executed';
}

export interface RunOptions {
  nowIso?: string;
  /** Dry run: authorize but never execute, never persist a run or claim/idempotency. */
  dryRun?: boolean;
}

export class AutomationEngine {
  private killSwitch = false;

  constructor(private readonly deps: AutomationEngineDeps) {}

  setKillSwitch(on: boolean): void {
    this.killSwitch = on;
  }

  /** Run every active workflow whose trigger is firing. */
  async tick(workflows: Workflow[], nowIso?: string): Promise<WorkflowRun[]> {
    const opts: RunOptions = nowIso !== undefined ? { nowIso } : {};
    const runs: WorkflowRun[] = [];
    for (const wf of workflows) runs.push(await this.runWorkflow(wf, opts));
    return runs;
  }

  /** Simulate a workflow: same gate evaluation, but never executes or persists. */
  simulate(wf: Workflow, nowIso?: string): Promise<WorkflowRun> {
    return this.runWorkflow(wf, { dryRun: true, ...(nowIso !== undefined ? { nowIso } : {}) });
  }

  async runWorkflow(wf: Workflow, options: RunOptions = {}): Promise<WorkflowRun> {
    const now = options.nowIso ?? this.deps.env.now();
    const dry = options.dryRun === true;
    const run = (
      status: RunStatus,
      actions: ActionResult[] = [],
      notes: string[] = [],
      idempotencyKey = '',
    ): WorkflowRun => ({
      id: this.deps.env.ids.run(),
      workflowId: wf.id,
      ownerId: wf.ownerId,
      firedAtIso: now,
      status,
      idempotencyKey,
      actions,
      notes,
    });
    const finish = async (r: WorkflowRun): Promise<WorkflowRun> => {
      if (!dry) await this.deps.runs.append(r);
      return r;
    };

    if (this.killSwitch) return finish(run('skipped', [], ['global kill switch active']));
    if (wf.status !== 'active') return finish(run('skipped', [], [`workflow is ${wf.status}`]));

    const ctx = await this.deps.context.evalContext(wf.ownerId, now);
    if (!triggerMet(wf.trigger, wf.lastRunAtIso, ctx)) return finish(run('skipped', [], ['trigger not met']));
    if (!evaluateCondition(ctx, wf.condition)) return finish(run('condition_unmet', [], ['conditions not satisfied']));

    const runsToday = runsTodayCount(await this.deps.runs.history(wf.id), now);
    const safety = checkSafety(wf, runsToday, now);
    if (!safety.ok) return finish(run('skipped', [], [safety.reason ?? 'blocked by safety']));

    const instance = wf.trigger.kind === 'schedule' ? lastScheduledInstant(wf.trigger, now) : now;
    const idempotencyKey = this.deps.env.hash(`${wf.id}:${instance}`);
    if (!dry) {
      const claimed = await this.deps.runs.claim(idempotencyKey);
      if (!claimed)
        return finish(run('skipped', [], ['duplicate — already run for this trigger instance'], idempotencyKey));
    }

    const results: ActionResult[] = [];
    for (let i = 0; i < wf.actions.length; i++) {
      results.push(await this.runAction(wf.actions[i]!, wf, i, dry));
    }

    const r = run(aggregate(results), results, [], idempotencyKey);
    if (!dry) {
      await this.deps.runs.append(r);
      await this.deps.workflows.save({ ...wf, lastRunAtIso: now });
      await this.deps.notifier.notify(wf.ownerId, `Workflow "${wf.title}" → ${r.status}`);
    }
    return r;
  }

  private async runAction(action: Action, wf: Workflow, index: number, dry: boolean): Promise<ActionResult> {
    if (CONTROL_ACTIONS.has(action.kind)) {
      if (action.kind === 'notify' && !dry) await this.deps.notifier.notify(wf.ownerId, action.message);
      return { action, status: 'authorized_executed', requirements: [], detail: `control action: ${action.kind}` };
    }

    // Financial action → delegate authorization to the Policy gate (which composes Risk).
    let permission;
    try {
      permission = await this.deps.authorizer.authorize(mapActionToPolicyRequest(action, wf, index));
    } catch {
      return { action, status: 'blocked', requirements: [], detail: 'authorization failed — failing closed' };
    }

    if (permission.gate === 'block') {
      return {
        action,
        status: 'blocked',
        permission,
        requirements: [],
        detail: permission.reasons.join('; ') || 'blocked by policy/risk',
      };
    }
    if (!permission.mayProceedToSign || wf.safety.requireApproval === true) {
      return {
        action,
        status: 'awaiting_approval',
        permission,
        requirements: permission.requirements,
        detail: wf.safety.requireApproval ? 'user approval required by workflow' : `requires ${permission.gate}`,
      };
    }

    // Authorized and clear to sign → execute via the pre-authorized session key.
    if (dry)
      return { action, status: 'authorized_executed', permission, requirements: [], detail: 'simulated (authorized)' };
    try {
      const res = await this.deps.executor.execute(action, {
        ownerId: wf.ownerId,
        permission,
        ...(wf.sessionKeyId !== undefined ? { sessionKeyId: wf.sessionKeyId } : {}),
      });
      return {
        action,
        status: res.ok ? 'authorized_executed' : 'failed',
        permission,
        requirements: [],
        detail: res.detail,
      };
    } catch {
      return { action, status: 'failed', permission, requirements: [], detail: 'executor error' };
    }
  }
}
