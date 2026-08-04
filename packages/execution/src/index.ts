/**
 * @intent-wallet/execution — the Execution Engine. Runs an approved
 * ExecutionPlan (from the Intent Engine) as a persisted, resumable, simulate-
 * gated step machine that never strands funds and never holds keys. It answers
 * "how and in what order" while the chain adapters answer "how to talk to each
 * chain" and the intent engine answered "what to do".
 */
export {
  initExecution,
  isRunnable,
  nextRunnableStep,
  allConfirmed,
  type Execution,
  type ExecutionStatus,
  type StepState,
  type StepStatus,
  type FundsLocation,
} from './state.js';
export {
  DriverError,
  type StepDriver,
  type SimulationResult,
  type ConfirmationResult,
  type VerifyResult,
  type RecoveryHint,
} from './driver.js';
export { InMemoryExecutionStore, type ExecutionStore } from './store.js';
export { type ExecutionEvent, type EventSink } from './events.js';
export { ExecutionEngine, type ExecutionEngineOptions, type ExecutionEngineDeps } from './engine.js';
export { ExecutionError, type ExecutionErrorCode } from './errors.js';
