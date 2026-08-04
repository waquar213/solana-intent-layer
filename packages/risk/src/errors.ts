/** Typed errors for the risk engine. Messages are safe to surface/log. */
export type RiskErrorCode = 'INVALID_SUBJECT';

export class RiskError extends Error {
  readonly code: RiskErrorCode;
  constructor(code: RiskErrorCode, message: string) {
    super(message);
    this.name = 'RiskError';
    this.code = code;
  }
}
