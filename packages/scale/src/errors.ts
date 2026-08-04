export type ScaleErrorCode = 'INVALID_POLICY' | 'INVALID_SIGNAL';

export class ScaleError extends Error {
  readonly code: ScaleErrorCode;
  constructor(code: ScaleErrorCode, message: string) {
    super(message);
    this.name = 'ScaleError';
    this.code = code;
  }
}
