/**
 * Private-key export — the wallet's most dangerous read.
 *
 * The correctness bar is round-trip: the exported key, re-imported (or used directly), must control
 * the SAME address. A key that exports something signing for a different address is worse than no
 * export at all — the user backs up the wrong thing and loses funds believing they are safe.
 */
import { describe, expect, it } from 'vitest';
import { WalletManager } from '../src/wallet/wallet-manager.js';
import { InMemorySecureStore } from '../src/wallet/secure-store.js';
import { evmAddressFromPrivateKey } from '../src/accounts/evm.js';
import { solanaPublicKey, solanaAddressFromPublicKey } from '../src/accounts/solana.js';
import { base58 } from '@scure/base';

const PW = 'correct horse battery staple';
const FAST = { scrypt: { n: 2 ** 15 } };
const hexToBytes = (h: string): Uint8Array => Uint8Array.from((h.replace(/^0x/u, '').match(/../gu) ?? []).map((b) => parseInt(b, 16)));

async function wallet(): Promise<WalletManager> {
  const m = new WalletManager({ store: new InMemorySecureStore(), vault: FAST });
  await m.createWallet(PW);
  return m;
}

describe('exported key controls the same account', () => {
  it('HD account 0 → the key derives account 0’s EVM address', async () => {
    const m = await wallet();
    const expected = m.getAccount(0).evm.address;
    const key = await m.exportPrivateKey(0, PW);
    expect(key).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(evmAddressFromPrivateKey(hexToBytes(key))).toBe(expected);
  });

  it('HD account 1 differs from account 0', async () => {
    const m = await wallet();
    const k0 = await m.exportPrivateKey(0, PW);
    const k1 = await m.exportPrivateKey(1, PW);
    expect(k1).not.toBe(k0);
    expect(evmAddressFromPrivateKey(hexToBytes(k1))).toBe(m.getAccount(1).evm.address);
  });

  it('an imported EVM key exports to exactly what was imported', async () => {
    const m = await wallet();
    const raw = `0x${'44'.repeat(32)}`;
    const { index } = await m.importEvmPrivateKey(raw, 'op', PW);
    expect(await m.exportPrivateKey(index, PW)).toBe(raw);
  });

  it('an imported Solana key exports the seed that derives its address', async () => {
    const m = await wallet();
    const seed = Uint8Array.from({ length: 32 }, (_, i) => i + 7);
    const { index, address } = await m.importSolanaPrivateKey(base58.encode(seed), 'sol op', PW);
    const key = await m.exportPrivateKey(index, PW);
    expect(solanaAddressFromPublicKey(solanaPublicKey(hexToBytes(key)))).toBe(address);
  });
});

describe('export is gated', () => {
  it('rejects a wrong password', async () => {
    const m = await wallet();
    await expect(m.exportPrivateKey(0, 'nope')).rejects.toThrow(/password/iu);
  });

  it('rejects a missing imported index', async () => {
    const m = await wallet();
    await expect(m.exportPrivateKey(-99, PW)).rejects.toThrow(/no imported account/iu);
  });

  it('throws when locked', async () => {
    const m = await wallet();
    m.lock();
    await expect(m.exportPrivateKey(0, PW)).rejects.toThrow();
  });
});
