/**
 * Typed error hierarchy for the wallet core.
 *
 * Security invariant: error messages must NEVER contain key material, seeds,
 * passwords, or any fragment of them. Messages are safe to log and to show
 * to users; codes are stable and safe to branch on programmatically.
 */
export type WalletErrorCode =
  | 'INVALID_MNEMONIC'
  | 'INVALID_PATH'
  | 'INVALID_PASSWORD'
  | 'INVALID_INPUT'
  | 'VAULT_CORRUPTED'
  | 'VAULT_DECRYPT_FAILED'
  | 'VAULT_UNSUPPORTED_VERSION'
  | 'KEYRING_DESTROYED';

export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WalletError';
    this.code = code;
  }
}

export function isWalletError(err: unknown, code?: WalletErrorCode): err is WalletError {
  return err instanceof WalletError && (code === undefined || err.code === code);
}
