export type SettlementErrorCode = 'INVALID_PLAN' | 'NOT_FOUND' | 'IN_PROGRESS';

export class SettlementError extends Error {
  readonly code: SettlementErrorCode;
  constructor(code: SettlementErrorCode, message: string) {
    super(message);
    this.name = 'SettlementError';
    this.code = code;
  }
}
