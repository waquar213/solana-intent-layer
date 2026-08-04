/**
 * Execution lifecycle events. Emitted on every meaningful transition so the
 * Portfolio, Notification, and Audit consumers (and the live UI tracker) stay
 * in sync. Decoupled: the engine takes an `onEvent` callback; the backend maps
 * these to the `execution.steps.v1` Kafka topic (packages/events).
 */
export type ExecutionEvent =
  | { type: 'execution.started'; executionId: string; planId: string }
  | { type: 'step.simulating'; executionId: string; seq: number }
  | { type: 'step.broadcast'; executionId: string; seq: number; txid: string }
  | { type: 'step.confirmed'; executionId: string; seq: number; txid: string }
  | { type: 'step.failed'; executionId: string; seq: number; reason: string; retryable: boolean }
  | { type: 'execution.completed'; executionId: string }
  | { type: 'execution.parked'; executionId: string; reason: string; fundsChainId: string }
  | { type: 'execution.failed'; executionId: string; reason: string };

export type EventSink = (event: ExecutionEvent) => void;
