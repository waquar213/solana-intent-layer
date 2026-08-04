export type PluginErrorCode =
  | 'INVALID_MANIFEST'
  | 'INVALID_SEMVER'
  | 'SIGNATURE_INVALID'
  | 'TRUST_EXCEEDED'
  | 'INCOMPATIBLE'
  | 'REVOKED'
  | 'PERMISSION_DENIED'
  | 'ILLEGAL_TRANSITION'
  | 'DEPENDENCY_UNRESOLVED';

export class PluginError extends Error {
  readonly code: PluginErrorCode;
  constructor(code: PluginErrorCode, message: string) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
  }
}
