export type GasErrorCode = 'INVALID_POLICY' | 'NO_FEE_TOKEN';

export class GasError extends Error {
  readonly code: GasErrorCode;
  constructor(code: GasErrorCode, message: string) {
    super(message);
    this.name = 'GasError';
    this.code = code;
  }
}
