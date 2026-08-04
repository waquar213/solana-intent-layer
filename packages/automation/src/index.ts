/**
 * @intent-wallet/automation — the Automation & Workflow Engine. Turns
 * natural-language rules into typed workflows (trigger → conditions → actions)
 * and runs each firing through the SAME Policy (+Risk) gate a manual action
 * uses, executing only via a pre-authorized, policy-bounded session key. It is a
 * pure, deterministic orchestrator: it holds no keys, authorizes nothing itself,
 * and can never make an automated action more capable than a manual one.
 */
export type {
  WorkflowStatus,
  Trigger,
  Condition,
  Action,
  Safety,
  Workflow,
  EvalContext,
  RunStatus,
  ActionResult,
  WorkflowRun,
} from './types.js';

export { stableHash, createTestEnv, type AutomationEnv, type TestEnvOptions } from './env.js';
export { evaluateCondition } from './conditions.js';
export { triggerMet, isScheduleDue, isEventTriggerMet, nextFireTime, lastScheduledInstant } from './triggers.js';
export {
  compileTemplate,
  WorkflowCompiler,
  type CompiledWorkflow,
  type WorkflowLlmClient,
  type CompileOptions,
} from './compiler.js';
export { upcomingRuns, type UpcomingRun } from './scheduler.js';
export { checkSafety, runsTodayCount, type SafetyCheck } from './safety.js';
export {
  InMemoryWorkflowStore,
  InMemoryRunStore,
  type PolicyAuthorizer,
  type Executor,
  type ExecutorContext,
  type Notifier,
  type ContextProvider,
  type WorkflowStore,
  type RunStore,
} from './sources.js';
export { AutomationEngine, type AutomationEngineDeps, type RunOptions } from './engine.js';
export { AutomationError, type AutomationErrorCode } from './errors.js';
