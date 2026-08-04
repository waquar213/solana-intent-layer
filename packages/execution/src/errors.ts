/** Typed errors for the execution engine. Messages are safe to surface/log. */
export type ExecutionErrorCode = 'INVALID_PLAN' | 'NOT_FOUND' | 'ALREADY_TERMINAL' | 'INVALID_INPUT';

export class ExecutionError extends Error {
  readonly code: ExecutionErrorCode;
  constructor(code: ExecutionErrorCode, message: string) {
    super(message);
    this.name = 'ExecutionError';
    this.code = code;
  }
}
