/**
 * Base error hierarchy shared across services. Domain packages (core, chains,
 * …) keep their own specific error types; this provides the HTTP-facing base
 * that maps cleanly to RFC 9457 problem+json, plus the guarantee that error
 * messages are safe to surface and log.
 */

/** Stable, machine-branchable error codes shared at the platform edge. */
export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED'
  | 'UPSTREAM_FAILED'
  | 'INTERNAL';

export interface AppErrorOptions {
  /** HTTP status to surface. Defaults are derived from `code`. */
  statusCode?: number;
  /** Machine-readable, safe-to-expose extra context (never secrets). */
  details?: Record<string, unknown>;
  cause?: unknown;
}

const DEFAULT_STATUS: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM_FAILED: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;
  readonly details: Record<string, unknown> | undefined;
  /** 5xx errors are unexpected; 4xx are client-caused. Controls log level + whether we expose `message`. */
  readonly expected: boolean;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = options.statusCode ?? DEFAULT_STATUS[code];
    this.details = options.details;
    this.expected = this.statusCode < 500;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

// Convenience constructors — keep call sites terse and consistent.
// `details` is only attached when provided (exactOptionalPropertyTypes: an
// explicit `details: undefined` is not the same as an absent property).
const withDetails = (d?: Record<string, unknown>) => (d ? { details: d } : {});
export const badRequest = (m: string, d?: Record<string, unknown>) => new AppError('BAD_REQUEST', m, withDetails(d));
export const unauthorized = (m = 'authentication required') => new AppError('UNAUTHORIZED', m);
export const forbidden = (m = 'not permitted') => new AppError('FORBIDDEN', m);
export const notFound = (m = 'resource not found') => new AppError('NOT_FOUND', m);
export const tooManyRequests = (m = 'rate limit exceeded', d?: Record<string, unknown>) =>
  new AppError('RATE_LIMITED', m, withDetails(d));
export const conflict = (m: string, d?: Record<string, unknown>) => new AppError('CONFLICT', m, withDetails(d));
export const validationFailed = (m: string, d?: Record<string, unknown>) =>
  new AppError('VALIDATION_FAILED', m, withDetails(d));
