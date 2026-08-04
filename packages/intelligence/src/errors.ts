export type IntelligenceErrorCode = 'INVALID_SNAPSHOT' | 'NARRATION_UNVERIFIED';

/** Errors raised by the Portfolio Intelligence Engine. */
export class IntelligenceError extends Error {
  readonly code: IntelligenceErrorCode;
  constructor(code: IntelligenceErrorCode, message: string) {
    super(message);
    this.name = 'IntelligenceError';
    this.code = code;
  }
}
