/** Typed errors for the route optimizer. Messages are safe to surface/log. */
export type RouterErrorCode = 'NO_ROUTE' | 'ALL_ROUTES_FAILED_SIMULATION' | 'INVALID_REQUEST';

export class RouterError extends Error {
  readonly code: RouterErrorCode;
  constructor(code: RouterErrorCode, message: string) {
    super(message);
    this.name = 'RouterError';
    this.code = code;
  }
}
