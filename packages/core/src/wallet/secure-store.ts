/**
 * SecureStore — the persistence boundary for the encrypted vault and wallet
 * metadata. Core defines the INTERFACE and the logic; the platform provides the
 * implementation: iOS Keychain / Android Keystore on mobile (Phase 8), OS
 * credential stores or IndexedDB+WebCrypto on the extension. What is stored is
 * already client-encrypted opaque ciphertext (the vault envelope) — the store
 * adds a second layer of OS-level protection, it is not the only line of
 * defense.
 *
 * The interface is async because native secure stores are async. Values are
 * strings (the vault envelope JSON and small metadata blobs).
 */
export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * In-memory implementation for tests and ephemeral contexts. NOT for production
 * persistence — it holds ciphertext in process memory only and is lost on exit.
 */
export class InMemorySecureStore implements SecureStore {
  readonly #map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.#map.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.#map.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.#map.delete(key);
  }
  async has(key: string): Promise<boolean> {
    return this.#map.has(key);
  }
}

/** Canonical storage keys owned by the wallet core. */
export const STORE_KEYS = {
  vault: 'iw.vault.v1',
  meta: 'iw.wallet.meta.v1',
} as const;
