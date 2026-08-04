/** Typed errors for the provider framework. Messages are safe to surface/log. */
export type ProviderErrorCode =
  | 'NO_PROVIDERS'
  | 'ALL_PROVIDERS_FAILED'
  | 'INVALID_QUOTE'
  | 'NO_ROUTE'
  | 'PROVIDER_UNAVAILABLE'
  | 'HTTP_ERROR';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  constructor(code: ProviderErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderError';
    this.code = code;
  }
}
