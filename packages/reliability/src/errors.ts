export type ReliabilityErrorCode = 'INVALID_SLO';

export class ReliabilityError extends Error {
  readonly code: ReliabilityErrorCode;
  constructor(code: ReliabilityErrorCode, message: string) {
    super(message);
    this.name = 'ReliabilityError';
    this.code = code;
  }
}
