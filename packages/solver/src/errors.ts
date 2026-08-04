export type SolverErrorCode = 'INVALID_REQUEST' | 'SOLVER_NOT_REGISTERED';

export class SolverError extends Error {
  readonly code: SolverErrorCode;
  constructor(code: SolverErrorCode, message: string) {
    super(message);
    this.name = 'SolverError';
    this.code = code;
  }
}
