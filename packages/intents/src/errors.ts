/** Typed errors for the intent engine. Messages are safe to surface/log. */
export type IntentErrorCode =
  | 'UNPARSEABLE'
  | 'AMBIGUOUS'
  | 'UNSUPPORTED_INTENT'
  | 'RESOLUTION_FAILED'
  | 'INSUFFICIENT_BALANCE'
  | 'NO_ROUTE'
  | 'RISK_BLOCKED'
  | 'INVALID_INPUT';

export class IntentError extends Error {
  readonly code: IntentErrorCode;
  /** Machine-readable extra context safe to expose (never secrets). */
  readonly details: Record<string, unknown> | undefined;
  constructor(code: IntentErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'IntentError';
    this.code = code;
    this.details = details;
  }
}

export function isIntentError(err: unknown, code?: IntentErrorCode): err is IntentError {
  return err instanceof IntentError && (code === undefined || err.code === code);
}
