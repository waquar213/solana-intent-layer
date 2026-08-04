export type PolicyErrorCode =
  | 'INVALID_RULE'
  | 'INVALID_POLICY_SET'
  | 'SET_NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'LOOSENS_NONOVERRIDABLE'
  | 'CONTEXT_ASSEMBLY_FAILED';

/** Errors raised by the Universal Policy Engine. */
export class PolicyError extends Error {
  readonly code: PolicyErrorCode;
  constructor(code: PolicyErrorCode, message: string) {
    super(message);
    this.name = 'PolicyError';
    this.code = code;
  }
}
