/**
 * RFC 9457 problem+json mapping. Every HTTP error the platform returns has this
 * shape (architecture 07). The mapper NEVER leaks internals: unexpected (5xx)
 * errors are flattened to a generic message; only `expected` (4xx) AppErrors
 * expose their message and details.
 */
import { AppError, isAppError } from './errors.js';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance?: string;
  [key: string]: unknown;
}

export interface ToProblemOptions {
  /** Request path/id for the `instance` field. */
  instance?: string;
}

export function toProblem(err: unknown, options: ToProblemOptions = {}): ProblemDetails {
  if (isAppError(err) && err.expected) {
    return {
      type: `https://errors.intentwallet.xyz/${err.code}`,
      title: err.code,
      status: err.statusCode,
      code: err.code,
      detail: err.message,
      ...(options.instance !== undefined ? { instance: options.instance } : {}),
      ...(err.details ? { details: err.details } : {}),
    };
  }
  // Unexpected AppError (5xx) or any non-AppError throwable: expose nothing internal.
  const status = isAppError(err) ? err.statusCode : 500;
  const code = isAppError(err) ? err.code : 'INTERNAL';
  return {
    type: `https://errors.intentwallet.xyz/${code}`,
    title: code,
    status,
    code,
    detail: 'An unexpected error occurred.',
    ...(options.instance !== undefined ? { instance: options.instance } : {}),
  };
}

/** Coerces any thrown value into an AppError for uniform handling upstream. */
export function toAppError(err: unknown): AppError {
  if (isAppError(err)) return err;
  return new AppError('INTERNAL', err instanceof Error ? err.message : 'unknown error', { cause: err });
}
