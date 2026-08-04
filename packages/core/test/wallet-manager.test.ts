/**
 * WalletManager lifecycle — the public facade the whole app depends on.
 * Uses fast scrypt params and a controllable scheduler for deterministic,
 * quick tests.
 */
import { describe, expect, it } from 'vitest';
import { keccak_256 } from '@noble/hashes/sha3';
import { utf8ToBytes } from '@noble/hashes/utils';
import { base58 } from '@scure/base';
import { InMemorySecureStore, STORE_KEYS } from '../src/wallet/secure-store.js';
import { WalletManager } from '../src/wallet/wallet-manager.js';
import type { Scheduler } from '../src/wallet/session.js';
import { recoverEvmAddress } from '../src/accounts/evm.js';
import { verifySolanaSignature } from '../src/accounts/solana.js';

const FAST = { scrypt: { n: 2 ** 15 } }; // 2^15 == the vault's MIN_SCRYPT_N (its cheapest ACCEPTED cost)

function manager(store = new InMemorySecureStore()) {
  const timers: Array<() => void> = [];
  const scheduler: Scheduler = {
    setTimer: (cb) => {
      timers.push(cb);
      return timers.length;
    },
    clearTimer: () => {},
  };
  const wm = new WalletManager({ store, vault: FAST, autoLockMs: 1000, session: { scheduler } });
  return { wm, store, fireAutoLock: () => timers.at(-1)?.() };
}

describe('WalletManager lifecycle', () => {
  it('creates a wallet, persists a sealed vault, and unlocks it', async () => {
    const { wm, store } = manager();
    expect(await wm.hasWallet()).toBe(false);

    const { mnemonic, account } = await wm.createWallet('password-123');
    expect(mnemonic.split(' ')).toHaveLength(12);
    expect(account.btc.address).toMatch(/^bc1q/u);
    expect(wm.isUnlocked()).toBe(true);
    expect(await wm.hasWallet()).toBe(true);

    // What is persisted is opaque vault ciphertext, never the mnemonic in clear.
    const stored = await store.get(STORE_KEYS.vault);
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(mnemonic.split(' ')[0]);
  });

  it('lock → unlock reproduces the exact same identity', async () => {
    const { wm } = manager();
    const { account } = await wm.createWallet('pw-abcdef');
    wm.lock();
    expect(wm.isUnlocked()).toBe(false);
    expect(() => wm.getAccount()).toThrowError(expect.objectContaining({ code: 'KEYRING_DESTROYED' }));

    await wm.unlock('pw-abcdef');
    expect(wm.isUnlocked()).toBe(true);
    expect(wm.getAccount()).toEqual(account);
  });

  it('rejects a wrong unlock password', async () => {
    const { wm } = manager();
    await wm.createWallet('right-password');
    wm.lock();
    await expect(wm.unlock('wrong-password')).rejects.toThrowError(
      expect.objectContaining({ code: 'VAULT_DECRYPT_FAILED' }),
    );
    expect(wm.isUnlocked()).toBe(false);
  });

  it('imports an existing mnemonic and derives the known identity', async () => {
    const { wm } = manager();
    const account = await wm.importWallet(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      'pw-import',
    );
    expect(account.evm.address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });

  it('refuses to create/import over an existing wallet', async () => {
    const { wm } = manager();
    await wm.createWallet('pw-1-test');
    await expect(wm.createWallet('pw-2-test')).rejects.toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  it('rejects an invalid mnemonic on import', async () => {
    const { wm } = manager();
    await expect(wm.importWallet('not a valid mnemonic at all', 'pw')).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_MNEMONIC' }),
    );
  });

  it('changePassword re-encrypts so only the new password unlocks', async () => {
    const { wm } = manager();
    await wm.createWallet('old-password');
    await wm.changePassword('old-password', 'new-password');
    wm.lock();
    await expect(wm.unlock('old-password')).rejects.toThrowError(
      expect.objectContaining({ code: 'VAULT_DECRYPT_FAILED' }),
    );
    await wm.unlock('new-password');
    expect(wm.isUnlocked()).toBe(true);
  });

  it('wipe removes the wallet from the device', async () => {
    const { wm } = manager();
    await wm.createWallet('pw-wipe-01');
    await wm.wipe();
    expect(wm.isUnlocked()).toBe(false);
    expect(await wm.hasWallet()).toBe(false);
  });

  it('auto-lock fires through the session and locks the wallet', async () => {
    const { wm, fireAutoLock } = manager();
    await wm.createWallet('pw-idle-01');
    expect(wm.isUnlocked()).toBe(true);
    fireAutoLock();
    expect(wm.isUnlocked()).toBe(false);
  });
});

describe('WalletManager signing (unified signer through the facade)', () => {
  it('signs an EVM transaction recoverable to the account', async () => {
    const { wm } = manager();
    const { account } = await wm.createWallet('pw-sign-01');
    const signed = wm.getSigner().signEvmTransaction({
      chainId: 8453,
      nonce: 0n,
      maxPriorityFeePerGas: 1_000_000_000n,
      maxFeePerGas: 20_000_000_000n,
      gasLimit: 21_000n,
      to: account.evm.address,
      value: 1n,
    });
    expect(signed.raw).toMatch(/^0x02/u);
    expect(signed.hash).toMatch(/^0x[0-9a-f]{64}$/u);
  });

  it('signs a Solana message verifiable against the account key', async () => {
    const { wm } = manager();
    const { account } = await wm.createWallet('pw-sol-01');
    const message = utf8ToBytes('intent: send 5 SOL');
    const sig = wm.getSigner().signSolanaTransactionMessage(message);
    expect(verifySolanaSignature(sig, message, base58.decode(account.sol.address))).toBe(true);
  });

  it('signs an EIP-191 personal message recoverable to the account', async () => {
    const { wm } = manager();
    const { account } = await wm.createWallet('pw-191-01');
    const message = utf8ToBytes('log me in');
    const sig = wm.getSigner().signEvmPersonalMessage(message);
    expect([27, 28]).toContain(sig[64]);
    const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${message.length}`);
    const digest = keccak_256(new Uint8Array([...prefix, ...message]));
    const forRecover = sig.slice();
    forRecover[64] = (sig[64] as number) - 27;
    expect(recoverEvmAddress(digest, forRecover)).toBe(account.evm.address);
  });

  it('the signer is unavailable while locked', async () => {
    const { wm } = manager();
    await wm.createWallet('pw-lock2');
    wm.lock();
    expect(() => wm.getSigner()).toThrowError(expect.objectContaining({ code: 'KEYRING_DESTROYED' }));
  });
});
