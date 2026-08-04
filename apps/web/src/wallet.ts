/**
 * The REAL, non-custodial wallet — entirely client-side. It runs @intent-wallet/core
 * in the browser: a fresh BIP-39 mnemonic is generated here, sealed into an encrypted
 * vault (scrypt + AES-256-GCM) with the user's password, and persisted to
 * localStorage. The seed and private keys NEVER leave the browser — the server sees
 * only public addresses (or a signed rawTx the user chooses to broadcast). This is the
 * doctrine made literal: the device holds the key.
 *
 * `@intent-wallet/core` is pure @noble/@scure crypto (no Node APIs), so all of this —
 * generation, the encrypted vault, HD derivation, and EIP-1559 signing — happens on
 * the user's machine.
 */
import {
  WalletManager,
  bytesToHex,
  hexToBytes,
  type Eip1559Transaction,
  type SecureStore,
  type SignedEvmTransaction,
  type SignPsbtResult,
  type UniversalAccount,
} from '@intent-wallet/core';
import { autoLockMs } from './settings';

/** A SecureStore backed by the browser's localStorage — the sealed (encrypted) vault
 *  lives here; it is useless without the password, so it is safe at rest. */
class LocalStorageSecureStore implements SecureStore {
  get(key: string): Promise<string | null> {
    return Promise.resolve(localStorage.getItem(key));
  }
  set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    localStorage.removeItem(key);
    return Promise.resolve();
  }
  has(key: string): Promise<boolean> {
    return Promise.resolve(localStorage.getItem(key) !== null);
  }
}

// One wallet manager for the app. Auto-locks after the configured IDLE timeout (default
// 15 min; destroys the in-memory keyring, the sealed vault stays persisted). The initial
// timeout is read here at load; unlock() re-reads it so a Settings change applies on the
// next unlock (not only a full reload).
const manager = new WalletManager({ store: new LocalStorageSecureStore(), autoLockMs: autoLockMs() });

/** Reset the idle auto-lock timer on user activity (App wires a throttled global listener while
 *  unlocked). Without this the "idle" timeout was really an ABSOLUTE one — a user actively
 *  transacting was still hard-locked exactly autoLockMinutes after unlock, mid-flow. */
export function touch(): void {
  manager.touch();
}

// ── Multi-account (HD) ────────────────────────────────────────────────────────
// The keyring can derive 2^31 accounts from the one seed; we track how many the
// user has ADDED and which is ACTIVE. Only public metadata (two integers) is
// persisted — the seed never leaves the sealed vault. Every read + sign below uses
// the ACTIVE index, so switching accounts switches addresses AND the signing key.
const ACCOUNTS_KEY = 'iw.accounts.v1';
const NEEDS_BACKUP_KEY = 'iw.needsBackup.v1';

// A freshly CREATED wallet seals + persists + unlocks its vault BEFORE the recovery phrase is backed
// up and quiz-verified. If the page reloads (or auto-locks) mid-backup, the keyring is lost and the
// user would unlock straight into the app having never seen the phrase — the enforced backup silently
// skipped. This flag persists that "still needs backup" state so the unlock path RESUMES the backup.
export function needsBackup(): boolean {
  try {
    return localStorage.getItem(NEEDS_BACKUP_KEY) === '1';
  } catch {
    return false;
  }
}
export function setNeedsBackup(v: boolean): void {
  if (v) localStorage.setItem(NEEDS_BACKUP_KEY, '1');
  else localStorage.removeItem(NEEDS_BACKUP_KEY);
}

interface AccountState {
  index: number;
  count: number;
}

function readAccounts(): AccountState {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<AccountState>;
      // index ≥ 0 is an HD account; index < 0 is an imported EVM-only account. Require INTEGERS and a
      // bounded count — a corrupt/tampered `{count: 1e9}` would otherwise pass and make the accounts
      // panel's `Array.from({length: accountCount()})` allocate a billion entries → tab OOM/hang.
      if (
        typeof s.index === 'number' && typeof s.count === 'number' &&
        Number.isInteger(s.index) && Number.isInteger(s.count) &&
        s.count >= 1 && s.count <= 256 && s.index < s.count
      ) {
        return { index: s.index, count: s.count };
      }
    }
  } catch {
    /* fall through to default */
  }
  return { index: 0, count: 1 };
}

function writeAccounts(state: AccountState): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(state));
}

/** The active HD account index (every read + sign uses this). */
export function activeAccountIndex(): number {
  return readAccounts().index;
}

/** How many accounts the user has added (≥ 1). */
export function accountCount(): number {
  return readAccounts().count;
}

/** Switch the active account (HD index ≥ 0, or an imported index < 0). */
export function setActiveAccount(index: number): WalletIdentity | null {
  const state = readAccounts();
  if (index >= state.count) return currentIdentity();
  // Imported accounts live at index < 0 on EITHER curve — validate against ALL imports, not just EVM,
  // or re-selecting an imported Solana account from the list silently no-ops (its index isn't in the
  // EVM-only view). listImported() covers evm + sol.
  if (index < 0 && !manager.listImported().some((a) => a.index === index)) return currentIdentity();
  writeAccounts({ ...state, index });
  return currentIdentity();
}

/** Derive + activate the next HD account. Returns its identity (or null if locked). */
export function addAccount(): WalletIdentity | null {
  if (!manager.isUnlocked()) return null; // don't bump the persisted account count while locked (no derivation happens)
  const state = readAccounts();
  const count = state.count + 1;
  writeAccounts({ index: count - 1, count });
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

/** Has the user already created/imported a wallet on this device? */
export function hasWallet(): Promise<boolean> {
  return manager.hasWallet();
}

export function isUnlocked(): boolean {
  return manager.isUnlocked();
}

/** Create a NEW wallet: generate a real mnemonic, seal it, persist, and unlock.
 *  Returns the mnemonic ONCE for the backup step — never persisted in the clear. */
export async function createWallet(password: string): Promise<{ mnemonic: string; identity: WalletIdentity }> {
  const { mnemonic, account } = await manager.createWallet(password);
  writeAccounts({ index: 0, count: 1 }); // a fresh wallet starts at account 0
  setNeedsBackup(true); // the phrase hasn't been backed up + verified yet — enforce it, survive a reload
  return { mnemonic, identity: toIdentity(account) };
}

/** Restore a wallet from an existing 12/24-word recovery phrase. */
export async function importWallet(mnemonic: string, password: string): Promise<WalletIdentity> {
  writeAccounts({ index: 0, count: 1 });
  const identity = toIdentity(await manager.importWallet(mnemonic.trim(), password));
  setNeedsBackup(false); // a RESTORED wallet already has its phrase in hand — no backup step needed
  return identity;
}

/** Unlock the persisted wallet. Throws on a wrong password. */
export async function unlock(password: string): Promise<WalletIdentity> {
  manager.setAutoLockMs(autoLockMs()); // honor a Settings change made since page load (was reload-only)
  await manager.unlock(password);
  return toIdentity(activeAccountSafe());
}

export function lock(): void {
  manager.lock();
}

/** True if the ACTIVE account is an imported single-curve key (not the HD account). */
export function isActiveImported(): boolean {
  return activeAccountIndex() < 0;
}

/** Which curve the ACTIVE imported key is on, or null when the active account is HD. */
export function activeImportedKind(): 'evm' | 'sol' | null {
  if (!manager.isUnlocked() || !isActiveImported()) return null;
  const i = activeAccountIndex();
  return manager.listImported().find((a) => a.index === i)?.kind ?? null;
}

/** The ACTIVE UniversalAccount — HD (index ≥ 0) or imported (index < 0). Falls back to
 *  HD account 0 if the stored active index no longer resolves (e.g. a stale import). */
function activeAccountSafe(): UniversalAccount {
  const i = activeAccountIndex();
  try {
    return i < 0 ? manager.getImportedAccount(i) : manager.getAccount(i);
  } catch {
    writeAccounts({ index: 0, count: readAccounts().count });
    return manager.getAccount(0);
  }
}

/** The unlocked wallet's real identity (the ACTIVE account), or null if locked. */
export function currentIdentity(): WalletIdentity | null {
  return manager.isUnlocked() ? toIdentity(activeAccountSafe()) : null;
}

/** Import a raw Solana key (base58 / JSON array / 0x-hex) as a Solana-only account and activate it. */
export async function importSolanaKey(secret: string, label: string, password: string): Promise<WalletIdentity> {
  const { index } = await manager.importSolanaPrivateKey(secret, label, password);
  writeAccounts({ ...readAccounts(), index });
  return toIdentity(manager.getImportedAccount(index));
}

/** Import a raw EVM private key as an EVM-only account, activate it, and return its identity. */
export async function importPrivateKey(privateKeyHex: string, label: string, password: string): Promise<WalletIdentity> {
  const { index } = await manager.importEvmPrivateKey(privateKeyHex, label, password);
  writeAccounts({ ...readAccounts(), index });
  return toIdentity(manager.getImportedAccount(index));
}

/** Every imported account (index < 0) with the curve it is on. Empty if locked. */
export function listImportedAccounts(): Array<{ index: number; kind: 'evm' | 'sol'; label: string; address: string }> {
  return manager.isUnlocked() ? manager.listImported() : [];
}

/** Verify the password WITHOUT changing lock state — a fresh check that gates sensitive
 *  reveals. (unlock() no-ops when the wallet is already unlocked, so it can't guard an
 *  already-open wallet; this re-derives the key and checks it against the sealed vault.) */
export async function verifyPassword(password: string): Promise<boolean> {
  return manager.verifyPassword(password);
}

/** Reveal the recovery phrase for the backup flow (requires an unlocked wallet). */
export function revealMnemonic(): string {
  return manager.exportMnemonic();
}

/**
 * SENSITIVE — export one account's raw private key as 0x-hex, re-verifying the password.
 * `index` is HD (≥ 0) or imported (< 0). The caller must clear the returned string from state.
 */
export async function exportPrivateKey(index: number, password: string): Promise<string> {
  return manager.exportPrivateKey(index, password);
}

/** Permanently remove this device's wallet (the sealed vault is deleted). */
export async function wipeWallet(): Promise<void> {
  await manager.wipe(); // core deletes the sealed vault + destroys the in-memory keyring
  // A wipe is a FULL device reset for this wallet: clear every app-namespaced key, not just the
  // vault + account index. Otherwise the NEXT wallet created on this device silently inherits the
  // prior owner's Transaction mode (Auto → auto-execute with NO per-tx confirm), spend caps, daily
  // auto-spend ledger, address book, cached balances, and the poison-detector's "known-good"
  // recipient set — each a consent or privacy leak. The `iw.`/`iw_` sweep also stays correct if a
  // future per-wallet key is added.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('iw.') || k.startsWith('iw_'))) localStorage.removeItem(k);
    }
  } catch {
    /* private-mode / quota — best effort */
  }
}

/**
 * Sign a real EIP-1559 transaction with the unlocked wallet — the proof it is
 * testnet-ready. The private key stays inside core's signer; this returns a
 * broadcastable `0x02…` raw transaction + its hash. Broadcasting it to a testnet
 * (e.g. Sepolia) is a separate step over an RPC.
 */
export function signEvmTransaction(tx: Eip1559Transaction): SignedEvmTransaction {
  const i = activeAccountIndex();
  if (i >= 0) return manager.getSigner().signEvmTransaction(tx, i);
  if (activeImportedKind() === 'sol') throw new Error(IMPORTED_WRONG_CURVE('Solana', 'EVM'));
  return manager.signImportedEvmTransaction(tx, i);
}

/** An imported key sits on ONE curve; asking it to sign for the other chain is a clear error. */
const IMPORTED_WRONG_CURVE = (has: string, want: string): string =>
  `This is an imported ${has}-only account and cannot sign for ${want} — switch to your main account, or import a ${want} key.`;
const IMPORTED_NO_BTC = 'Imported accounts are single-chain — switch to your main account for Bitcoin.';

/** Sign a serialized Solana message with the ACTIVE account's ed25519 key (in-browser). */
export function signSolanaMessage(message: Uint8Array): Uint8Array {
  const i = activeAccountIndex();
  if (i >= 0) return manager.getSigner().signSolanaTransactionMessage(message, i);
  if (activeImportedKind() !== 'sol') throw new Error(IMPORTED_WRONG_CURVE('EVM', 'Solana'));
  return manager.signImportedSolanaMessage(message, i);
}

/** EIP-191 personal_sign of a UTF-8 message (for SIWE sign-in). Returns 0x-hex (65 bytes). */
export function signPersonalMessage(message: string): string {
  if (isActiveImported()) throw new Error('Sign in with your main (HD) account; imported EVM accounts can transact but not sign in yet.');
  const sig = manager.getSigner().signEvmPersonalMessage(new TextEncoder().encode(message), activeAccountIndex());
  return `0x${bytesToHex(sig)}`;
}

/** The ACTIVE account's EVM address (the SIWE identity). */
export function evmAddress(): string | null {
  return manager.isUnlocked() ? activeAccountSafe().evm.address : null;
}

/** A given account's EVM address WITHOUT switching to it — HD (index ≥ 0) or imported (< 0). */
export function accountEvmAddress(index: number): string | null {
  if (!manager.isUnlocked()) return null;
  try {
    return index < 0 ? manager.getImportedAccount(index).evm.address : manager.getAccount(index).evm.address;
  } catch {
    return null;
  }
}

/** The ACTIVE account's 32-byte Solana public key (needed to compile the transfer message). */
export function solPublicKey(): Uint8Array {
  const i = activeAccountIndex();
  if (i >= 0) return hexToBytes(manager.getAccount(i).sol.publicKey);
  if (activeImportedKind() !== 'sol') throw new Error(IMPORTED_WRONG_CURVE('EVM', 'Solana'));
  return hexToBytes(manager.getImportedAccount(i).sol.publicKey);
}

/** The ACTIVE account's 33-byte compressed Bitcoin public key (needed to build a PSBT). */
export function btcPublicKey(): Uint8Array {
  if (isActiveImported()) throw new Error(IMPORTED_NO_BTC);
  return hexToBytes(manager.getAccount(activeAccountIndex()).btc.publicKey);
}

/** Sign (and finalize) a Bitcoin PSBT with the ACTIVE account's key, in-browser. */
export function signBitcoinPsbt(psbt: Uint8Array): SignPsbtResult {
  if (isActiveImported()) throw new Error(IMPORTED_NO_BTC);
  return manager.getSigner().signBitcoinPsbt(psbt, activeAccountIndex(), { finalize: true });
}

export type { Eip1559Transaction, SignedEvmTransaction };
