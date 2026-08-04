/**
 * The one error the SDK throws. `ApiError` mirrors the server's RFC 9457 problem+json
 * wire exactly (packages/observability), so a caller branches on a typed `code` —
 * `NOT_FOUND` for an expired plan, `BAD_REQUEST` for a bad utterance, and so on. The
 * SDK never invents fields: it surfaces what the wire said. Transport failures that
 * never reached the server get synthetic codes outside the wire union
 * (`NETWORK_ERROR`, `TIMEOUT`) with status 0.
 */
import type { ProblemDetails } from './types.js';

/** The server's error codes (packages/observability AppErrorCode), verbatim. */
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

/** Codes for failures that never reached the server (no HTTP status). */
export type TransportErrorCode = 'NETWORK_ERROR' | 'TIMEOUT';

export interface ApiErrorInit {
  code: AppErrorCode | TransportErrorCode;
  status: number;
  type: string;
  title: string;
  detail: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly code: AppErrorCode | TransportErrorCode;
  /** HTTP status, or 0 for a transport failure that never reached the server. */
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(init: ApiErrorInit) {
    super(init.detail);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.type = init.type;
    this.title = init.title;
    this.detail = init.detail;
    this.details = init.details;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** True when a parsed body looks like an RFC 9457 problem document (has a string `code`). */
function looksLikeProblem(body: unknown): body is ProblemDetails {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string' &&
    typeof (body as { detail?: unknown }).detail === 'string'
  );
}

/**
 * Build an `ApiError` from a non-2xx response body. Trusts a problem+json body when it
 * structurally looks like one; otherwise falls back to a generic error carrying the
 * HTTP status so a proxy-mangled or non-JSON body never crashes the parser.
 */
export function apiErrorFromResponse(status: number, body: unknown): ApiError {
  if (looksLikeProblem(body)) {
    return new ApiError({
      code: body.code as AppErrorCode,
      status: typeof body.status === 'number' ? body.status : status,
      type: typeof body.type === 'string' ? body.type : `https://errors.intentwallet.xyz/${body.code}`,
      title: typeof body.title === 'string' ? body.title : body.code,
      detail: body.detail,
      ...(body.details ? { details: body.details } : {}),
    });
  }
  const code: AppErrorCode = status < 500 ? 'BAD_REQUEST' : 'INTERNAL';
  return new ApiError({
    code,
    status,
    type: `https://errors.intentwallet.xyz/${code}`,
    title: code,
    detail: status >= 500 ? 'An unexpected error occurred.' : `Request failed (${status}).`,
  });
}

export function networkError(detail: string): ApiError {
  return new ApiError({
    code: 'NETWORK_ERROR',
    status: 0,
    type: 'https://errors.intentwallet.xyz/NETWORK_ERROR',
    title: 'NETWORK_ERROR',
    detail,
  });
}

export function timeoutError(timeoutMs: number): ApiError {
  return new ApiError({
    code: 'TIMEOUT',
    status: 0,
    type: 'https://errors.intentwallet.xyz/TIMEOUT',
    title: 'TIMEOUT',
    detail: `Request timed out after ${timeoutMs}ms.`,
  });
}
