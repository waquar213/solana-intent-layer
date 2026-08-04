export type AutomationErrorCode = 'INVALID_WORKFLOW' | 'COMPILE_FAILED' | 'EXECUTOR_FAILED';

export class AutomationError extends Error {
  readonly code: AutomationErrorCode;
  constructor(code: AutomationErrorCode, message: string) {
    super(message);
    this.name = 'AutomationError';
    this.code = code;
  }
}
