/** Typed errors for the chain access layer. Messages never contain secrets. */
export type ChainErrorCode =
  | 'UNKNOWN_CHAIN'
  | 'TRANSPORT_FAILED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'ALL_PROVIDERS_FAILED'
  | 'INVALID_RESPONSE'
  | 'INSUFFICIENT_FUNDS'
  | 'GUARD_BLOCKED';

export class ChainError extends Error {
  readonly code: ChainErrorCode;

  constructor(code: ChainErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ChainError';
    this.code = code;
  }
}

/**
 * A well-formed JSON-RPC error RESPONSE (e.g. execution revert, invalid params).
 * Deliberately distinct from ChainError: these are deterministic answers from
 * the chain, so the provider pool must PROPAGATE them, never fail over —
 * retrying a revert on another endpoint just burns rate budget.
 */
export class JsonRpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
    this.data = data;
  }
}
