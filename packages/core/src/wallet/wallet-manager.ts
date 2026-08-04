/**
 * WalletManager — the wallet core's public facade. It is the ONE object the
 * rest of the app (and future modules) talks to; it hides the keyring, vault,
 * secure store, session timer, and signer behind a small, safe API.
 *
 * Lifecycle:  create/import → (sealed vault persisted) → lock ⇄ unlock → sign.
 * While unlocked it holds the HD keyring in memory; on lock (manual or
 * auto-lock) it destroys the keyring, wiping the seed. Persisted state is only
 * the password-encrypted vault (opaque ciphertext) — nothing that can move
 * funds is ever stored or sent anywhere.
 */
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { base58 } from '@scure/base';
import { WalletError } from '../errors.js';
import { utf8ToBytes, zeroize } from '../bytes.js';
import { HDKeyring, type UniversalAccount } from '../keyring.js';
import { generateMnemonic, validateMnemonic, type MnemonicStrength } from '../mnemonic.js';
import { openVault, sealVault, type SealVaultOptions } from '../vault.js';
import { evmAddressFromPrivateKey } from '../accounts/evm.js';
import { solanaPublicKey, solanaAddressFromPublicKey, signSolanaMessage } from '../accounts/solana.js';
import type { BtcNetwork } from '../accounts/bitcoin.js';
import { SigningManager } from '../signing/signer.js';
import { signEip1559Transaction, type Eip1559Transaction, type SignedEvmTransaction } from '../signing/evm-transaction.js';
import { InMemorySecureStore, STORE_KEYS, type SecureStore } from './secure-store.js';
import { SessionManager, type SessionOptions } from './session.js';

/** Imported accounts get negative indices, disjoint from HD indices (0…2³¹−1). */
export const IMPORTED_INDEX_BASE = -1;
export function isImportedIndex(index: number): boolean {
  return index < 0;
}
/**
 * A raw key imported beside the HD seed. `kind` decides which curve the key is on and therefore
 * what it can sign — secp256k1 for EVM, ed25519 for Solana. Vault entries written before Solana
 * import existed carry no `kind`; they restore as 'evm', which is exactly what they were.
 */
interface ImportedKey {
  kind: 'evm' | 'sol';
  label: string;
  address: string;
  priv: Uint8Array;
}

/**
 * Decode the 32-byte ed25519 secret out of any shape a Solana wallet exports it in.
 *
 * Deliberately strict about LENGTH and lenient about FORMAT: someone pasting a key has no idea
 * which encoding their wallet chose, but a wrong length silently yields a DIFFERENT keypair — funds
 * at an address nobody can sign for. A 64-byte form is `seed || pubkey`; the tail is discarded and
 * the public key re-derived, so a tampered tail cannot point the account at the wrong address.
 */
function parseSolanaSecret(raw: string): Uint8Array {
  const s = raw.trim();
  if (s === '') throw new WalletError('INVALID_INPUT', 'paste a Solana private key');
  // id.json / solana-keygen: a JSON array of 64 (or 32) byte values.
  if (s.startsWith('[')) {
    let arr: unknown;
    try {
      arr = JSON.parse(s);
    } catch {
      throw new WalletError('INVALID_INPUT', 'that looks like a JSON key file but it is not valid JSON');
    }
    if (!Array.isArray(arr) || !arr.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255)) {
      throw new WalletError('INVALID_INPUT', 'a Solana key file must be an array of byte values');
    }
    if (arr.length !== 64 && arr.length !== 32) {
      throw new WalletError('INVALID_INPUT', `a Solana key file must hold 64 or 32 bytes, not ${arr.length}`);
    }
    return Uint8Array.from((arr as number[]).slice(0, 32));
  }
  if (/^0x[0-9a-fA-F]{64}$/u.test(s)) return hexToBytes(s.slice(2)); // 0x-hex 32-byte seed
  let bytes: Uint8Array;
  try {
    bytes = base58.decode(s); // Phantom exports 64 bytes; some tools 32
  } catch {
    throw new WalletError('INVALID_INPUT', 'not a recognised Solana key (expected base58, a JSON byte array, or 0x-hex)');
  }
  if (bytes.length !== 64 && bytes.length !== 32) {
    throw new WalletError('INVALID_INPUT', `a Solana key must decode to 64 or 32 bytes, not ${bytes.length}`);
  }
  return bytes.slice(0, 32);
}

export interface WalletManagerOptions {
  store?: SecureStore;
  /** Bitcoin network for address encoding. Default 'mainnet'. */
  network?: BtcNetwork;
  /** Auto-lock idle timeout (ms); 0 disables. Default 5 min. */
  autoLockMs?: number;
  /** scrypt tuning passed through to the vault. */
  vault?: SealVaultOptions;
  /** Injectable scheduler for the session timer (tests). */
  session?: Pick<SessionOptions, 'scheduler'>;
}

export interface CreateWalletResult {
  /** SENSITIVE — show once for the backup flow, then never persist outside the vault. */
  mnemonic: string;
  account: UniversalAccount;
}

export class WalletManager {
  readonly #store: SecureStore;
  readonly #network: BtcNetwork;
  readonly #vaultOptions: SealVaultOptions;
  readonly #session: SessionManager;
  #keyring: HDKeyring | null = null;
  #signer: SigningManager | null = null;
  #imported: ImportedKey[] = [];

  constructor(options: WalletManagerOptions = {}) {
    this.#store = options.store ?? new InMemorySecureStore();
    this.#network = options.network ?? 'mainnet';
    this.#vaultOptions = options.vault ?? {};
    this.#session = new SessionManager(() => this.lock(), {
      autoLockMs: options.autoLockMs ?? 5 * 60_000,
      ...(options.session?.scheduler ? { scheduler: options.session.scheduler } : {}),
    });
  }

  /** True once a wallet has been created/imported and its vault persisted. */
  async hasWallet(): Promise<boolean> {
    return this.#store.has(STORE_KEYS.vault);
  }

  isUnlocked(): boolean {
    return this.#keyring !== null && !this.#keyring.destroyed;
  }

  /** Creates a NEW wallet, persists its sealed vault, and leaves it unlocked. */
  async createWallet(password: string, options: { strength?: MnemonicStrength } = {}): Promise<CreateWalletResult> {
    if (await this.hasWallet()) {
      throw new WalletError('INVALID_INPUT', 'a wallet already exists in this store; import/unlock instead');
    }
    const mnemonic = generateMnemonic(options.strength ?? 128);
    await this.#seal(mnemonic, [], password);
    this.#unlockWith(mnemonic);
    return { mnemonic, account: this.getAccount(0) };
  }

  /** Imports an existing mnemonic, persists its sealed vault, and unlocks. */
  async importWallet(mnemonic: string, password: string): Promise<UniversalAccount> {
    if (!validateMnemonic(mnemonic)) {
      throw new WalletError('INVALID_MNEMONIC', 'mnemonic failed BIP-39 validation');
    }
    if (await this.hasWallet()) {
      throw new WalletError('INVALID_INPUT', 'a wallet already exists in this store');
    }
    const normalized = mnemonic.trim().toLowerCase().split(/\s+/u).join(' ');
    await this.#seal(normalized, [], password);
    this.#unlockWith(normalized);
    return this.getAccount(0);
  }

  /** Unlocks the persisted wallet with `password`. Throws VAULT_DECRYPT_FAILED on a wrong password. */
  async unlock(password: string): Promise<void> {
    if (this.isUnlocked()) return;
    const envelope = await this.#store.get(STORE_KEYS.vault);
    if (!envelope) throw new WalletError('INVALID_INPUT', 'no wallet to unlock');
    const secret = openVault(envelope, password); // throws on wrong password / tamper
    try {
      this.#unlockWith(new TextDecoder().decode(secret));
    } finally {
      zeroize(secret);
    }
  }

  /** Locks the wallet: destroys the keyring (wipes the seed) and stops the session. */
  lock(): void {
    this.#session.stop();
    this.#keyring?.destroy();
    this.#keyring = null;
    this.#signer = null;
    for (const a of this.#imported) zeroize(a.priv);
    this.#imported = [];
  }

  /** Resets the auto-lock idle timer. Call on meaningful user activity. */
  touch(): void {
    this.#session.touch();
  }

  /** Update the auto-lock idle timeout (the app re-reads its setting here on unlock), re-arming an
   *  active session with the new value. */
  setAutoLockMs(ms: number): void {
    this.#session.setAutoLockMs(ms);
  }

  getAccount(index = 0): UniversalAccount {
    return this.#requireKeyring().getAccount(index);
  }

  /** The unified signer. Requires an unlocked wallet. */
  getSigner(): SigningManager {
    this.#requireKeyring();
    return (this.#signer ??= new SigningManager(this.#keyring as HDKeyring));
  }

  /**
   * Import a raw secp256k1 private key as an EVM-only account, persisted in the vault
   * beside the HD seed. Requires the current password (to re-seal). Returns the new
   * account's negative index + its Universal EVM address.
   */
  async importEvmPrivateKey(privateKeyHex: string, label: string, password: string): Promise<{ index: number; address: string }> {
    this.#requireKeyring();
    if (!(await this.verifyPassword(password))) {
      throw new WalletError('INVALID_INPUT', 'wrong password');
    }
    const clean = privateKeyHex.trim().replace(/^0x/iu, '');
    if (!/^[0-9a-fA-F]{64}$/u.test(clean)) {
      throw new WalletError('INVALID_INPUT', 'private key must be 32 bytes (64 hex characters)');
    }
    const priv = hexToBytes(clean);
    let address: string;
    try {
      address = evmAddressFromPrivateKey(priv); // also validates the key (0 / ≥n rejected)
    } catch (cause) {
      zeroize(priv); // never leave the raw key on the heap on a validation failure
      throw cause;
    }
    // Reject a key already in the wallet — either an existing import, or ANY HD account
    // within a gap-limit window (not just index 0), to avoid one address in two entries.
    const lower = address.toLowerCase();
    const hdMatch = Array.from({ length: 20 }, (_, i) => this.getAccount(i).evm.address.toLowerCase()).includes(lower);
    const already = this.#imported.some((a) => a.address.toLowerCase() === lower) || hdMatch;
    if (already) {
      zeroize(priv);
      throw new WalletError('INVALID_INPUT', 'this account is already in the wallet');
    }
    this.#imported.push({ kind: 'evm', label: label.trim() || `Imported ${this.#imported.length + 1}`, address, priv });
    await this.#seal(this.#requireKeyring().mnemonic, this.#imported, password);
    return { index: -this.#imported.length, address };
  }


  /**
   * Import a raw ed25519 key as a SOLANA-only account, persisted in the vault beside the HD seed.
   *
   * Accepts every shape a user can realistically hold a Solana key in, because the wallets that
   * export them disagree: a base58 64-byte keypair (Phantom / `solana-keygen`, seed || pubkey), a
   * base58 32-byte seed, a JSON array of 64 or 32 numbers (`id.json`), or 0x-hex 32 bytes. Only the
   * first 32 bytes are secret material — a 64-byte form carries the public key in its tail, and we
   * re-derive rather than trust it, so a doctored tail cannot bind funds to the wrong address.
   */
  async importSolanaPrivateKey(secret: string, label: string, password: string): Promise<{ index: number; address: string }> {
    this.#requireKeyring();
    if (!(await this.verifyPassword(password))) {
      throw new WalletError('INVALID_INPUT', 'wrong password');
    }
    const priv = parseSolanaSecret(secret);
    let address: string;
    try {
      address = solanaAddressFromPublicKey(solanaPublicKey(priv));
    } catch (cause) {
      zeroize(priv);
      throw cause;
    }
    // Same duplicate rule as EVM: reject a key already present as an import or within the HD gap.
    const hdMatch = Array.from({ length: 20 }, (_, i) => this.getAccount(i).sol.address).includes(address);
    if (this.#imported.some((a) => a.kind === 'sol' && a.address === address) || hdMatch) {
      zeroize(priv);
      throw new WalletError('INVALID_INPUT', 'this account is already in the wallet');
    }
    this.#imported.push({ kind: 'sol', label: label.trim() || `Imported ${this.#imported.length + 1}`, address, priv });
    await this.#seal(this.#requireKeyring().mnemonic, this.#imported, password);
    return { index: -this.#imported.length, address };
  }

  /** Every imported account with the curve it is on. Requires unlock. */
  listImported(): Array<{ index: number; kind: 'evm' | 'sol'; label: string; address: string }> {
    this.#requireKeyring();
    return this.#imported.map((a, i) => ({ index: -(i + 1), kind: a.kind, label: a.label, address: a.address }));
  }

  /** Sign a serialized Solana message with an imported ed25519 key. Requires unlock. */
  signImportedSolanaMessage(message: Uint8Array, index: number): Uint8Array {
    this.#requireKeyring();
    const a = this.#imported[-index - 1];
    if (!a) throw new WalletError('INVALID_INPUT', 'no imported account at this index');
    if (a.kind !== 'sol') throw new WalletError('INVALID_INPUT', 'this imported account is an EVM key and cannot sign for Solana');
    return signSolanaMessage(message, a.priv);
  }

  /** The imported EVM accounts only — kept for callers that specifically want the EVM list. */
  listImportedEvm(): Array<{ index: number; label: string; address: string }> {
    return this.listImported()
      .filter((a) => a.kind === 'evm')
      .map(({ index, label, address }) => ({ index, label, address }));
  }

  /** A UniversalAccount view of an imported EVM key — EVM real, BTC/SOL absent. */
  getImportedAccount(index: number): UniversalAccount {
    const a = this.#imported[-index - 1];
    if (!a) throw new WalletError('INVALID_INPUT', 'no imported account at this index');
    const none = { address: '', path: 'imported', publicKey: '' };
    // The public key is carried too: compiling a Solana transfer message needs it, and an empty
    // string there would surface as a broken message rather than a clear "unsupported" error.
    const real = { address: a.address, path: 'imported', publicKey: a.kind === 'sol' ? bytesToHex(solanaPublicKey(a.priv)) : '' };
    // An imported key sits on ONE curve, so exactly one chain is real and the others are absent —
    // showing an EVM address for an ed25519 key would invite a send to an address nothing can sign.
    return a.kind === 'sol'
      ? { index, evm: none, btc: none, sol: real }
      : { index, evm: real, btc: none, sol: none };
  }

  /** Sign an EIP-1559 transaction with an imported key. Requires unlock. */
  signImportedEvmTransaction(tx: Eip1559Transaction, index: number): SignedEvmTransaction {
    this.#requireKeyring();
    const a = this.#imported[-index - 1];
    if (!a) throw new WalletError('INVALID_INPUT', 'no imported account at this index');
    if (a.kind !== 'evm') throw new WalletError('INVALID_INPUT', 'this imported account is a Solana key and cannot sign for EVM');
    return signEip1559Transaction(tx, a.priv);
  }

  /** SENSITIVE — for the user-initiated backup/export flow only. Requires unlock. */
  exportMnemonic(): string {
    return this.#requireKeyring().mnemonic;
  }

  /**
   * SENSITIVE — export the raw private key for one account as a 0x-hex string.
   *
   * Re-verifies the password every call. This is the single most dangerous read the wallet exposes,
   * so it is NOT gated only by the unlock state (which may be minutes old): a fresh password check
   * is the deliberate friction. Works for BOTH an HD account (index ≥ 0, derived from the seed) and
   * an imported key (index < 0), returning the key on the account's own curve — an EVM import gives
   * a secp256k1 key, a Solana import its ed25519 seed. The raw bytes are zeroized before returning;
   * the hex string is the caller's to handle and forget.
   */
  async exportPrivateKey(index: number, password: string): Promise<string> {
    this.#requireKeyring();
    if (!(await this.verifyPassword(password))) {
      throw new WalletError('INVALID_INPUT', 'wrong password');
    }
    if (index < 0) {
      const a = this.#imported[-index - 1];
      if (!a) throw new WalletError('INVALID_INPUT', 'no imported account at this index');
      return `0x${bytesToHex(a.priv)}`; // imported priv lives in the vault; no separate buffer to wipe
    }
    // HD: derive, copy to hex, wipe the derived buffer. EVM and Solana share the m/44' tree but sit
    // on different curves, so a caller must know which key it is asking for — default to EVM, the
    // common case, and let a Solana export be requested explicitly.
    const priv = this.#requireKeyring().exportPrivateKey('evm', index);
    try {
      return `0x${bytesToHex(priv)}`;
    } finally {
      zeroize(priv);
    }
  }

  /** Re-encrypts the vault under a new password. Requires the current password. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const envelope = await this.#store.get(STORE_KEYS.vault);
    if (!envelope) throw new WalletError('INVALID_INPUT', 'no wallet to re-encrypt');
    const secret = openVault(envelope, currentPassword); // verifies current password
    try {
      const resealed = sealVault(secret, newPassword, this.#vaultOptions);
      await this.#store.set(STORE_KEYS.vault, resealed);
    } finally {
      zeroize(secret);
    }
  }

  /**
   * Verify a password against the sealed vault WITHOUT unlocking or changing lock state. Decrypts
   * the envelope directly — it never short-circuits on the in-memory unlock flag, so it
   * re-authenticates correctly even while the wallet is already unlocked (e.g. the reveal-seed
   * gate in Settings). Returns true iff the password decrypts the vault. NEVER use unlock() for
   * re-auth: unlock() is a no-op when already unlocked and would accept any password.
   */
  async verifyPassword(password: string): Promise<boolean> {
    const envelope = await this.#store.get(STORE_KEYS.vault);
    if (!envelope) return false;
    try {
      const secret = openVault(envelope, password); // throws on wrong password / tamper
      zeroize(secret);
      return true;
    } catch {
      return false;
    }
  }

  /** Permanently removes the wallet from this device (the vault ciphertext). Locks first. */
  async wipe(): Promise<void> {
    this.lock();
    await this.#store.delete(STORE_KEYS.vault);
    await this.#store.delete(STORE_KEYS.meta);
  }

  /** Plaintext-payload schema version, inside the (separately-versioned) vault envelope. */
  static readonly PAYLOAD_SCHEMA = 2;

  // The vault seals a JSON payload { schema, mnemonic, importedEvm } so imported keys
  // persist beside the HD seed. `schema` lets future builds detect the format cleanly.
  // Legacy vaults sealed a bare mnemonic string; those still open (JSON.parse fails →
  // the whole secret is treated as the mnemonic).
  async #seal(mnemonic: string, imported: ImportedKey[], password: string): Promise<void> {
    const content = JSON.stringify({
      schema: WalletManager.PAYLOAD_SCHEMA,
      mnemonic,
      importedEvm: imported.map((a) => ({ kind: a.kind, label: a.label, priv: bytesToHex(a.priv) })),
    });
    const bytes = utf8ToBytes(content);
    try {
      const envelope = sealVault(bytes, password, this.#vaultOptions);
      await this.#store.set(STORE_KEYS.vault, envelope);
    } finally {
      zeroize(bytes);
    }
  }

  #unlockWith(secret: string): void {
    // Step 1: detect format. ONLY a JSON.parse failure means "legacy bare mnemonic" —
    // a valid JSON payload with a bad imported key must NOT be mistaken for a mnemonic.
    let mnemonic: string | undefined;
    let importedRaw: unknown[] | null = null;
    try {
      const parsed = JSON.parse(secret) as { mnemonic?: unknown; importedEvm?: unknown };
      if (parsed && typeof parsed === 'object' && typeof parsed.mnemonic === 'string') {
        mnemonic = parsed.mnemonic;
        importedRaw = Array.isArray(parsed.importedEvm) ? parsed.importedEvm : [];
      }
    } catch {
      /* not JSON → legacy bare-mnemonic vault */
    }
    if (mnemonic === undefined) mnemonic = secret;

    // Step 2: parse imported keys independently — a single malformed entry is SKIPPED
    // (and its partial key zeroized), never allowed to brick unlock for the HD wallet.
    const imported: ImportedKey[] = [];
    for (const a of importedRaw ?? []) {
      const entry = a as { kind?: unknown; label?: unknown; priv?: unknown };
      const kind = entry.kind === 'sol' ? 'sol' : 'evm'; // absent ⇒ 'evm': old vaults are unchanged
      let priv: Uint8Array | undefined;
      try {
        priv = hexToBytes(String(entry.priv));
        const address = kind === 'sol' ? solanaAddressFromPublicKey(solanaPublicKey(priv)) : evmAddressFromPrivateKey(priv);
        imported.push({ kind, label: String(entry.label ?? ''), address, priv });
      } catch {
        if (priv) zeroize(priv);
      }
    }

    this.#imported = imported;
    this.#keyring = HDKeyring.fromMnemonic(mnemonic, { network: this.#network });
    this.#signer = null;
    this.#session.start();
  }

  #requireKeyring(): HDKeyring {
    if (!this.isUnlocked()) {
      throw new WalletError('KEYRING_DESTROYED', 'wallet is locked; unlock before use');
    }
    return this.#keyring as HDKeyring;
  }
}
