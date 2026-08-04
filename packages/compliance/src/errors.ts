export type ComplianceErrorCode =
  'INVALID_PROFILE' | 'VERSION_CONFLICT' | 'UNKNOWN_JURISDICTION' | 'PERMISSION_DENIED' | 'INVALID_REQUEST';

export class ComplianceError extends Error {
  readonly code: ComplianceErrorCode;
  constructor(code: ComplianceErrorCode, message: string) {
    super(message);
    this.name = 'ComplianceError';
    this.code = code;
  }
}
