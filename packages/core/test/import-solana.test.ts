/**
 * Importing a raw Solana key.
 *
 * The wallet could already import a raw EVM key but not a Solana one, so an operator/relayer key —
 * the exact thing the bridge needs — had nowhere to live. An imported key sits on ONE curve, and the
 * failure that matters is signing with the wrong one: it produces a valid-looking signature for an
 * address nobody controls. These pin the format handling, the curve isolation, and the fact that
 * vaults written before Solana import existed still open as EVM keys.
 */
import { describe, expect, it } from 'vitest';
import { base58 } from '@scure/base';
import { WalletManager } from '../src/wallet/wallet-manager.js';
import { InMemorySecureStore } from '../src/wallet/secure-store.js';
import { solanaPublicKey, solanaAddressFromPublicKey, verifySolanaSignature } from '../src/accounts/solana.js';

const PW = 'correct horse battery staple';
/** 2^15 == the vault's MIN_SCRYPT_N — its cheapest ACCEPTED cost, matching the other suites. */
const FAST = { scrypt: { n: 2 ** 15 } };
/** A fixed 32-byte seed — deterministic so the expected address is stable. */
const SEED = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const ADDRESS = solanaAddressFromPublicKey(solanaPublicKey(SEED));

async function wallet(): Promise<WalletManager> {
  const m = new WalletManager({ store: new InMemorySecureStore(), vault: FAST });
  await m.createWallet(PW);
  return m;
}

describe('every shape a Solana key is exported in maps to the same account', () => {
  const forms: [string, string][] = [
    ['base58 32-byte seed', base58.encode(SEED)],
    ['base58 64-byte keypair (Phantom / solana-keygen)', base58.encode(new Uint8Array([...SEED, ...solanaPublicKey(SEED)]))],
    ['id.json 64-number array', JSON.stringify([...SEED, ...solanaPublicKey(SEED)])],
    ['id.json 32-number array', JSON.stringify([...SEED])],
    ['0x-hex seed', `0x${Buffer.from(SEED).toString('hex')}`],
  ];
  for (const [name, secret] of forms) {
    it(name, async () => {
      const m = await wallet();
      const { index, address } = await m.importSolanaPrivateKey(secret, name, PW);
      expect(address).toBe(ADDRESS);
      expect(index).toBeLessThan(0);
    });
  }

  it('re-derives the public key rather than trusting the 64-byte tail', async () => {
    // A doctored tail must NOT be able to bind the account to an address the seed cannot sign for.
    const doctored = new Uint8Array([...SEED, ...new Uint8Array(32).fill(9)]);
    const m = await wallet();
    const { address } = await m.importSolanaPrivateKey(base58.encode(doctored), 'doctored', PW);
    expect(address).toBe(ADDRESS);
  });
});

describe('rejects what it cannot safely interpret', () => {
  const bad: [string, string][] = [
    ['empty', ''],
    ['wrong length base58', base58.encode(new Uint8Array(31))],
    ['not base58 at all', 'definitely not a key!!'],
    ['array of the wrong length', JSON.stringify(Array(48).fill(1))],
    ['array with a non-byte', JSON.stringify([...Array(63).fill(1), 999])],
    ['malformed json', '[1,2,3'],
  ];
  for (const [name, secret] of bad) {
    it(name, async () => {
      const m = await wallet();
      await expect(m.importSolanaPrivateKey(secret, 'x', PW)).rejects.toThrow();
    });
  }

  it('needs the right password', async () => {
    const m = await wallet();
    await expect(m.importSolanaPrivateKey(base58.encode(SEED), 'x', 'wrong')).rejects.toThrow(/password/iu);
  });

  it('refuses the same key twice', async () => {
    const m = await wallet();
    await m.importSolanaPrivateKey(base58.encode(SEED), 'a', PW);
    await expect(m.importSolanaPrivateKey(base58.encode(SEED), 'b', PW)).rejects.toThrow(/already/iu);
  });
});

describe('an imported key signs for its OWN curve and no other', () => {
  it('signs a Solana message that verifies against its public key', async () => {
    const m = await wallet();
    const { index } = await m.importSolanaPrivateKey(base58.encode(SEED), 'op', PW);
    const msg = new TextEncoder().encode('hello solana');
    const sig = m.signImportedSolanaMessage(msg, index);
    expect(verifySolanaSignature(sig, msg, solanaPublicKey(SEED))).toBe(true);
  });

  it('refuses to sign an EVM transaction — the wrong-curve failure that loses funds', async () => {
    const m = await wallet();
    const { index } = await m.importSolanaPrivateKey(base58.encode(SEED), 'op', PW);
    expect(() =>
      m.signImportedEvmTransaction(
        { chainId: 1, nonce: 0n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, gasLimit: 21_000n, to: `0x${'11'.repeat(20)}`, value: 0n, data: '0x' },
        index,
      ),
    ).toThrow(/Solana key/iu);
  });

  it('an imported EVM key refuses to sign for Solana', async () => {
    const m = await wallet();
    const { index } = await m.importEvmPrivateKey(`0x${'22'.repeat(32)}`, 'evm', PW);
    expect(() => m.signImportedSolanaMessage(new Uint8Array(8), index)).toThrow(/EVM key/iu);
  });

  it('exposes only the chain it can actually sign for', async () => {
    const m = await wallet();
    const { index } = await m.importSolanaPrivateKey(base58.encode(SEED), 'op', PW);
    const acct = m.getImportedAccount(index);
    expect(acct.sol.address).toBe(ADDRESS);
    expect(acct.sol.publicKey).not.toBe(''); // needed to compile a transfer message
    expect(acct.evm.address).toBe(''); // never show an address this key cannot sign for
    expect(acct.btc.address).toBe('');
  });
});

describe('vault compatibility', () => {
  it('survives a lock/unlock round trip alongside an EVM import', async () => {
    const store = new InMemorySecureStore();
    const m = new WalletManager({ store, vault: FAST });
    await m.createWallet(PW);
    await m.importEvmPrivateKey(`0x${'33'.repeat(32)}`, 'my evm', PW);
    await m.importSolanaPrivateKey(base58.encode(SEED), 'my sol', PW);
    m.lock();
    await m.unlock(PW);

    const list = m.listImported();
    expect(list.map((a) => a.kind)).toEqual(['evm', 'sol']);
    expect(list[1]?.address).toBe(ADDRESS);
    // The EVM-only view still answers with just the EVM ones, so existing callers are unaffected.
    expect(m.listImportedEvm().map((a) => a.label)).toEqual(['my evm']);
    // And the restored Solana key still signs.
    const msg = new TextEncoder().encode('after unlock');
    expect(verifySolanaSignature(m.signImportedSolanaMessage(msg, list[1]!.index), msg, solanaPublicKey(SEED))).toBe(true);
  });
});
