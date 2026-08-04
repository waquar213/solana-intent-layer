/**
 * Edge-path coverage for the signing manager, EIP-712 field encodings, and the
 * wallet-manager error branches — the paths the happy-path tests don't reach.
 */
import { describe, expect, it } from 'vitest';
import * as btc from '@scure/btc-signer';
import { hexToBytes } from '@noble/hashes/utils';
import { hashTypedData as viemHashTypedData } from 'viem';
import { WalletManager } from '../src/wallet/wallet-manager.js';
import { InMemorySecureStore } from '../src/wallet/secure-store.js';
import { hashTypedData, type TypedData } from '../src/signing/evm-typed-data.js';

const FAST = { scrypt: { n: 2 ** 15 } }; // 2^15 == the vault's MIN_SCRYPT_N (its cheapest ACCEPTED cost)
const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function unlockedWallet() {
  const wm = new WalletManager({ vault: FAST, autoLockMs: 0 });
  const account = await wm.importWallet(ABANDON, 'pw-edge-01');
  return { wm, account };
}

describe('SigningManager — remaining signing paths through the facade', () => {
  it('signs EIP-712 typed data (recoverable) via the manager', async () => {
    const { wm } = await unlockedWallet();
    const typed: TypedData = {
      types: { Permit: [{ name: 'value', type: 'uint256' }] },
      primaryType: 'Permit',
      domain: { name: 'P', version: '1', chainId: 1 },
      message: { value: 1000n },
    };
    const sig = wm.getSigner().signEvmTypedData(typed);
    expect(sig).toHaveLength(65);
    expect([27, 28]).toContain(sig[64]);
  });

  it('signs a Bitcoin PSBT via the manager', async () => {
    const { wm, account } = await unlockedWallet();
    const pubkey = hexToBytes(account.btc.publicKey);
    const p2wpkh = btc.p2wpkh(pubkey);
    const tx = new btc.Transaction();
    tx.addInput({
      txid: hexToBytes('b'.repeat(64)),
      index: 0,
      witnessUtxo: { script: p2wpkh.script, amount: 50_000n },
    });
    tx.addOutputAddress(account.btc.address, 45_000n, btc.NETWORK);
    const result = wm.getSigner().signBitcoinPsbt(tx.toPSBT());
    expect(result.signedInputs).toBe(1);
    expect(result.finalized).toBe(true);
    expect(result.txid).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rejects an empty EVM personal message', async () => {
    const { wm } = await unlockedWallet();
    expect(() => wm.getSigner().signEvmPersonalMessage(new Uint8Array(0))).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
});

describe('EIP-712 field encodings (bytesN, dynamic bytes, signed int) match viem', () => {
  it('encodes fixed bytesN, dynamic bytes, and negative int like viem', () => {
    const typed: TypedData = {
      types: {
        Blob: [
          { name: 'id', type: 'bytes32' },
          { name: 'payload', type: 'bytes' },
          { name: 'delta', type: 'int256' },
          { name: 'tag', type: 'bytes4' },
        ],
      },
      primaryType: 'Blob',
      domain: { chainId: 8453 },
      message: {
        id: `0x${'11'.repeat(32)}`,
        payload: '0xdeadbeef',
        delta: -42n,
        tag: '0xcafebabe',
      },
    };
    const ours = `0x${Buffer.from(hashTypedData(typed)).toString('hex')}`;
    const theirs = viemHashTypedData({
      types: typed.types,
      primaryType: 'Blob',
      domain: typed.domain as never,
      message: typed.message as never,
    });
    expect(ours).toBe(theirs);
  });

  it('throws on an unsupported field type', () => {
    const typed: TypedData = {
      types: { X: [{ name: 'f', type: 'decimal' }] },
      primaryType: 'X',
      domain: {},
      message: { f: 1 },
    };
    expect(() => hashTypedData(typed)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
});

describe('WalletManager — error and idempotence branches', () => {
  it('unlock() is a no-op when already unlocked', async () => {
    const { wm } = await unlockedWallet();
    await expect(wm.unlock('anything')).resolves.toBeUndefined();
    expect(wm.isUnlocked()).toBe(true);
  });

  it('unlock() throws when there is no wallet', async () => {
    const wm = new WalletManager({ store: new InMemorySecureStore(), vault: FAST });
    await expect(wm.unlock('pw')).rejects.toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  it('changePassword() throws when there is no wallet', async () => {
    const wm = new WalletManager({ store: new InMemorySecureStore(), vault: FAST });
    await expect(wm.changePassword('a', 'b')).rejects.toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  it('exportMnemonic returns the imported phrase while unlocked', async () => {
    const { wm } = await unlockedWallet();
    expect(wm.exportMnemonic()).toBe(ABANDON);
    wm.lock();
    expect(() => wm.exportMnemonic()).toThrowError(expect.objectContaining({ code: 'KEYRING_DESTROYED' }));
  });

  it('touch() is safe whether locked or unlocked', async () => {
    const { wm } = await unlockedWallet();
    expect(() => wm.touch()).not.toThrow();
    wm.lock();
    expect(() => wm.touch()).not.toThrow();
  });

  it('uses the testnet network when configured', async () => {
    const wm = new WalletManager({ store: new InMemorySecureStore(), vault: FAST, network: 'testnet' });
    const account = await wm.importWallet(ABANDON, 'pw-tn-0001');
    expect(account.btc.address).toMatch(/^tb1q/u);
  });
});

describe('SessionManager — cancel-before-arm branch', () => {
  it('stop() before start() is safe (no armed timer)', async () => {
    const wm = new WalletManager({ store: new InMemorySecureStore(), vault: FAST, autoLockMs: 1000 });
    // lock() calls session.stop() even though no session started.
    expect(() => wm.lock()).not.toThrow();
  });
});
