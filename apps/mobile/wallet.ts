/**
 * The REAL, non-custodial wallet on the phone — the same audited @intent-wallet/core the
 * web + SDK use, running on-device. A fresh BIP-39 mnemonic is generated here, sealed into
 * an encrypted vault (scrypt + AES-256-GCM) with the user's password, and stored in the OS
 * keystore (iOS Keychain / Android Keystore via expo-secure-store). The seed and private
 * keys NEVER leave the device — the network only ever sees public addresses or a signed
 * rawTx the user chose to broadcast.
 *
 * This mirrors apps/web/src/wallet.ts (multi-account HD, EVM/SOL/BTC signing) so the ported
 * broadcast + balances modules work unchanged; the ONLY platform difference is the store
 * (Keychain here vs localStorage on web) and the accounts index (AsyncStorage here).
 */
import {
  WalletManager,
  bytesToHex,
  hexToBytes,
  utf8ToBytes,
  type Eip1559Transaction,
  type SecureStore,
  type SignedEvmTransaction,
  type SignPsbtResult,
  type UniversalAccount,
} from '@intent-wallet/core';
import * as ExpoSecureStore from 'expo-secure-store';
import { autoLockMs } from './settings';
import { storage } from './storage';

// SecureStore keys must be alphanumeric . - _ — sanitise for any future key.
const keySafe = (k: string): string => k.replace(/[^A-Za-z0-9._-]/gu, '_');

/** The sealed (already-encrypted) vault lives in the OS keystore — defence in depth on top
 *  of the scrypt+AES-GCM envelope, which is useless without the password. */
class ExpoKeystore implements SecureStore {
  async get(key: string): Promise<string | null> {
    return (await ExpoSecureStore.getItemAsync(keySafe(key))) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    // Gate the sealed vault behind device unlock AND keep it out of iCloud/Google backups
    // (THIS_DEVICE_ONLY). The seed phrase is the user's real backup; the vault is device-local. (M7)
    await ExpoSecureStore.setItemAsync(keySafe(key), value, {
      keychainAccessible: ExpoSecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  async delete(key: string): Promise<void> {
    await ExpoSecureStore.deleteItemAsync(keySafe(key));
  }
  async has(key: string): Promise<boolean> {
    return (await ExpoSecureStore.getItemAsync(keySafe(key))) != null;
  }
}

// One wallet manager for the app. Auto-locks after the configured idle timeout (default
// 15 min; destroys the in-memory keyring, the sealed vault stays persisted). The timeout is
// read once here, so a Settings change takes effect on the next unlock/reload.
const manager = new WalletManager({ store: new ExpoKeystore(), autoLockMs: autoLockMs() });

// ── Multi-account (HD) ────────────────────────────────────────────────────────
// The keyring can derive 2^31 accounts from the one seed; we track how many the user has
// ADDED and which is ACTIVE. Only public metadata (two integers) is persisted — the seed
// never leaves the sealed vault. Every read + sign below uses the ACTIVE index.
const ACCOUNTS_KEY = 'iw.accounts.v1';

interface AccountState {
  index: number;
  count: number;
}

function readAccounts(): AccountState {
  try {
    const raw = storage.getItem(ACCOUNTS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<AccountState>;
      if (typeof s.index === 'number' && typeof s.count === 'number' && s.count >= 1 && s.index >= 0 && s.index < s.count) {
        return { index: s.index, count: s.count };
      }
    }
  } catch {
    /* fall through to default */
  }
  return { index: 0, count: 1 };
}

function writeAccounts(state: AccountState): void {
  storage.setItem(ACCOUNTS_KEY, JSON.stringify(state));
}

/** The active HD account index (every read + sign uses this). */
export function activeAccountIndex(): number {
  return readAccounts().index;
}

/** How many accounts the user has added (≥ 1). */
export function accountCount(): number {
  return readAccounts().count;
}

// Account-change subscription — so the app shell (identity, Activity, Console) refreshes when the
// active account changes in Settings, instead of showing the OLD account until a full remount.
type AccountListener = () => void;
const accountListeners = new Set<AccountListener>();
export function onAccountChange(fn: AccountListener): () => void {
  accountListeners.add(fn);
  return () => {
    accountListeners.delete(fn);
  };
}
function emitAccountChange(): void {
  for (const fn of accountListeners) fn();
}

// Broadcasts in flight this session — a module-level counter the send flows raise while a real broadcast
// is pending. setActiveAccount / addAccount refuse while it is non-zero: the signer reads
// activeAccountIndex() LATE (at sign time), while a send captures its sender identity + nonce EARLY and
// then awaits RPC round-trips, so changing the active account in that window would sign the pending tx
// with the NEW account carrying the OLD account's nonce (a wrong-account / wrong-nonce tx). Web guards
// this in switchAccount; mobile had no module-level in-flight marker at all, so this ports it.
let broadcastsInFlight = 0;
export function beginBroadcast(): void {
  broadcastsInFlight += 1;
}
export function endBroadcast(): void {
  broadcastsInFlight = Math.max(0, broadcastsInFlight - 1);
}
export function isBroadcasting(): boolean {
  return broadcastsInFlight > 0;
}

/** Switch the active account. Returns the newly-active identity, or null if locked. Refuses (no-op)
 *  while a broadcast is in flight — switching then would sign the pending tx from the wrong account. */
export function setActiveAccount(index: number): WalletIdentity | null {
  if (isBroadcasting()) return currentIdentity();
  const state = readAccounts();
  if (index < 0 || index >= state.count) return currentIdentity();
  writeAccounts({ ...state, index });
  emitAccountChange();
  return currentIdentity();
}

/** Derive + activate the next HD account. Returns its identity (or null if locked). */
export function addAccount(): WalletIdentity | null {
  if (isBroadcasting()) return currentIdentity(); // don't change the active index mid-broadcast
  const state = readAccounts();
  const count = state.count + 1;
  writeAccounts({ index: count - 1, count });
  emitAccountChange();
  return currentIdentity();
}

export interface WalletIdentity {
  evm: { address: string; path: string };
  btc: { address: string; path: string };
  sol: { address: string; path: string };
}

function toIdentity(a: UniversalAccount): WalletIdentity {
  return {
    evm: { address: a.evm.address, path: a.evm.path },
    btc: { address: a.btc.address, path: a.btc.path },
    sol: { address: a.sol.address, path: a.sol.path },
  };
}

export const hasWallet = (): Promise<boolean> => manager.hasWallet();
export const isUnlocked = (): boolean => manager.isUnlocked();

/** Create a NEW wallet: generate a real mnemonic on-device, seal it, persist, unlock.
 *  Returns the mnemonic ONCE for the backup step — never persisted in the clear. */
export async function createWallet(password: string): Promise<{ mnemonic: string; identity: WalletIdentity }> {
  const { mnemonic, account } = await manager.createWallet(password);
  writeAccounts({ index: 0, count: 1 }); // a fresh wallet starts at account 0
  return { mnemonic, identity: toIdentity(account) };
}

/** Restore a wallet from an existing 12/24-word recovery phrase. */
export async function importWallet(mnemonic: string, password: string): Promise<WalletIdentity> {
  // Reset multi-account state ONLY after a VALID import. A wrong phrase (a forgot-password reset with a
  // typo) makes manager.importWallet throw — if writeAccounts ran first it would silently clobber a
  // multi-account wallet's {count,index} to {1,0}, "forgetting" accounts 2+ (funds safe, but hidden).
  const identity = toIdentity(await manager.importWallet(mnemonic.trim(), password));
  writeAccounts({ index: 0, count: 1 });
  return identity;
}

/**
 * Reset ("forgot password"): restore from the recovery phrase under a NEW password, replacing the
 * existing vault. core.importWallet validates the mnemonic FIRST, then throws "a wallet already
 * exists" — so a first import attempt tells us the phrase is GOOD without destroying anything. Only
 * then do we wipe + re-import. A wrong phrase throws INVALID_MNEMONIC on that first attempt and the
 * old vault is left UNTOUCHED — a typo can never delete the wallet.
 */
export async function resetWallet(mnemonic: string, password: string): Promise<WalletIdentity> {
  try {
    return await importWallet(mnemonic, password); // no vault yet → this just works
  } catch (e) {
    if (e instanceof Error && /already exists/iu.test(e.message)) {
      await manager.wipe(); // phrase validated OK above; safe to replace the vault
      return importWallet(mnemonic, password);
    }
    throw e; // genuine invalid mnemonic — vault untouched
  }
}

/** Unlock the persisted wallet — throws on a wrong password. */
export async function unlock(password: string): Promise<WalletIdentity> {
  // Re-apply the persisted auto-lock timeout. The manager was constructed at MODULE IMPORT (before
  // storage hydration), so it captured the DEFAULT 15 min — a user who chose 5m / Never / 60m would
  // otherwise be silently ignored. Honor it on unlock, exactly as the web app does.
  manager.setAutoLockMs(autoLockMs());
  await manager.unlock(password);
  return toIdentity(manager.getAccount(activeAccountIndex()));
}

export const lock = (): void => manager.lock();

/** The unlocked wallet's real 3-address identity (the ACTIVE account), or null if locked. */
export function currentIdentity(): WalletIdentity | null {
  return manager.isUnlocked() ? toIdentity(manager.getAccount(activeAccountIndex())) : null;
}

/** Reveal the recovery phrase for the backup flow (requires an unlocked wallet). */
export const revealMnemonic = (): string => manager.exportMnemonic();

/**
 * Verify the wallet password before a sensitive action (reveal recovery phrase). Decrypts the
 * sealed vault DIRECTLY via the core primitive — it does NOT use unlock(), which is a no-op when
 * the wallet is already unlocked and would therefore accept ANY password on the (always-unlocked)
 * Settings screen. Returns true iff the password actually decrypts the vault.
 */
export async function verifyPassword(password: string): Promise<boolean> {
  return manager.verifyPassword(password);
}

/** Permanently remove this device's wallet (the sealed vault is deleted). */
export async function wipeWallet(): Promise<void> {
  await manager.wipe();
  storage.removeItem(ACCOUNTS_KEY); // reset multi-account state with the wallet
  // Sweep ALL app prefs (iw./iw_) so the NEXT wallet on this device can't inherit the prior owner's
  // Transaction mode (Auto → auto-execute with NO per-tx confirm), spend caps, address book, or recents —
  // each a consent or privacy leak. Parity with the web wipeWallet's localStorage sweep.
  storage.removeByPrefix('iw.');
  storage.removeByPrefix('iw_');
}

/**
 * Sign a real EIP-1559 transaction with the on-device key → a broadcastable `0x02…` raw
 * transaction + its hash. The private key stays inside core's signer.
 */
export function signEvmTransaction(tx: Eip1559Transaction): SignedEvmTransaction {
  return manager.getSigner().signEvmTransaction(tx, activeAccountIndex());
}

/** Sign a serialized Solana message with the ACTIVE account's ed25519 key (on-device). */
export function signSolanaMessage(message: Uint8Array): Uint8Array {
  return manager.getSigner().signSolanaTransactionMessage(message, activeAccountIndex());
}

/** Sign (and finalize) a Bitcoin PSBT with the ACTIVE account's key, on-device. */
export function signBitcoinPsbt(psbt: Uint8Array): SignPsbtResult {
  return manager.getSigner().signBitcoinPsbt(psbt, activeAccountIndex(), { finalize: true });
}

/**
 * EIP-191 personal_sign of a UTF-8 message with the on-device key — the proof of a true
 * non-custodial signer: the private key stays inside the sealed keyring; only the 65-byte
 * signature comes out. Returns 0x-hex.
 */
export function signMessage(message: string): string {
  const sig = manager.getSigner().signEvmPersonalMessage(utf8ToBytes(message), activeAccountIndex());
  return `0x${bytesToHex(sig)}`;
}

/** The ACTIVE account's EVM address, or null if locked. */
export function evmAddress(): string | null {
  return manager.isUnlocked() ? manager.getAccount(activeAccountIndex()).evm.address : null;
}

/** The ACTIVE account's 32-byte Solana public key (needed to compile the transfer message). */
export function solPublicKey(): Uint8Array {
  if (!manager.isUnlocked()) throw new Error('Unlock your wallet first.');
  return hexToBytes(manager.getAccount(activeAccountIndex()).sol.publicKey);
}

/** The ACTIVE account's 33-byte compressed Bitcoin public key (needed to build a PSBT). */
export function btcPublicKey(): Uint8Array {
  if (!manager.isUnlocked()) throw new Error('Unlock your wallet first.');
  return hexToBytes(manager.getAccount(activeAccountIndex()).btc.publicKey);
}

/** An in-memory SecureStore for the self-test — never touches the OS keystore. */
class MemoryStore implements SecureStore {
  #m = new Map<string, string>();
  get(k: string): Promise<string | null> {
    return Promise.resolve(this.#m.get(k) ?? null);
  }
  set(k: string, v: string): Promise<void> {
    this.#m.set(k, v);
    return Promise.resolve();
  }
  delete(k: string): Promise<void> {
    this.#m.delete(k);
    return Promise.resolve();
  }
  has(k: string): Promise<boolean> {
    return Promise.resolve(this.#m.has(k));
  }
}

/**
 * Runtime proof that the audited core's crypto runs ON THIS DEVICE: generate a THROWAWAY
 * in-memory wallet (BIP-39 entropy → scrypt+AES-GCM vault → HD derivation), then personal_sign
 * a message with its key. Touches no keystore and persists nothing. (The REAL send flow on
 * the dashboard proves the broadcast round-trip against the live chain.)
 */
export async function selfTest(): Promise<{ evm: string; sig: string }> {
  const m = new WalletManager({ store: new MemoryStore() });
  const { account } = await m.createWallet('self-test-throwaway-not-persisted');
  const sig = `0x${bytesToHex(m.getSigner().signEvmPersonalMessage(utf8ToBytes('on-device'), 0))}`;
  return { evm: account.evm.address, sig };
}

export type { Eip1559Transaction, SignedEvmTransaction };
