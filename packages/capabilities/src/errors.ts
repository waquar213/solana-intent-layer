export type CapabilityErrorCode = 'INVALID_PROFILE' | 'VERSION_CONFLICT' | 'UNKNOWN_CHAIN' | 'INVALID_REQUEST';

/** A precise, typed error so a config pipeline can surface exactly what's wrong. */
export class CapabilityError extends Error {
  readonly code: CapabilityErrorCode;

  constructor(code: CapabilityErrorCode, message: string) {
    super(message);
    this.name = 'CapabilityError';
    this.code = code;
  }
}
