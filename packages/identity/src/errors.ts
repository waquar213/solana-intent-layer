/** Typed errors for the identity engine. Messages are safe to surface/log. */
export type IdentityErrorCode =
  | 'INVALID_ADDRESS'
  | 'AMBIGUOUS_RECIPIENT'
  | 'RECIPIENT_NOT_FOUND'
  | 'DUPLICATE_CONTACT'
  | 'INVALID_CONTACT'
  | 'INVALID_INPUT';

export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  constructor(code: IdentityErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IdentityError';
    this.code = code;
  }
}

export function isIdentityError(err: unknown, code?: IdentityErrorCode): err is IdentityError {
  return err instanceof IdentityError && (code === undefined || err.code === code);
}
