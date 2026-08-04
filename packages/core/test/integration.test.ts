/**
 * Phase 1 exit-criterion test — the full Universal Identity lifecycle exactly
 * as the product will use it:
 *
 *   create wallet → show 3 receive addresses → seal mnemonic into the vault
 *   → lock (destroy keyring) → unlock (open vault) → identical identity
 *   → sign on two ecosystems.
 */
import { describe, expect, it } from 'vitest';
import { keccak_256 } from '@noble/hashes/sha3';
import { utf8ToBytes } from '@noble/hashes/utils';
import { base58 } from '@scure/base';
import { HDKeyring, openVault, recoverEvmAddress, sealVault, verifySolanaSignature, zeroize } from '../src/index.js';

const FAST = { scrypt: { n: 2 ** 15 } }; // 2^15 == the vault's MIN_SCRYPT_N (its cheapest ACCEPTED cost)

describe('Universal Identity lifecycle (Phase 1 acceptance)', () => {
  it('create → backup → lock → unlock → same identity → sign', () => {
    // 1. Create a new wallet.
    const keyring = HDKeyring.generate({ strength: 128 });
    const identity = keyring.getAccount(0);

    // The product's three receive addresses:
    expect(identity.btc.address).toMatch(/^bc1q/u);
    expect(identity.evm.address).toMatch(/^0x[0-9a-fA-F]{40}$/u);
    expect(() => base58.decode(identity.sol.address)).not.toThrow();

    // 2. Seal the mnemonic into the password-encrypted vault (what we persist).
    const mnemonicBytes = utf8ToBytes(keyring.mnemonic);
    const envelope = sealVault(mnemonicBytes, 'user-chosen-password-9', FAST);
    zeroize(mnemonicBytes);

    // 3. Lock the wallet.
    keyring.destroy();
    expect(() => keyring.getAccount(0)).toThrowError(expect.objectContaining({ code: 'KEYRING_DESTROYED' }));

    // 4. Unlock: open vault → restore keyring → identity must be identical.
    const recovered = openVault(envelope, 'user-chosen-password-9');
    const restored = HDKeyring.fromMnemonic(new TextDecoder().decode(recovered));
    zeroize(recovered);
    expect(restored.getAccount(0)).toEqual(identity);

    // 5. Sign on two ecosystems with the restored keyring.
    const digest = keccak_256(utf8ToBytes('unlock-and-sign check'));
    expect(recoverEvmAddress(digest, restored.signEvmDigest(digest))).toBe(identity.evm.address);

    const message = utf8ToBytes('solana unlock-and-sign check');
    const signature = restored.signSolanaMessage(message);
    expect(verifySolanaSignature(signature, message, base58.decode(identity.sol.address))).toBe(true);

    restored.destroy();
  });

  it('wrong unlock password never yields a wallet', () => {
    const keyring = HDKeyring.generate();
    const envelope = sealVault(utf8ToBytes(keyring.mnemonic), 'right-password-1', FAST);
    keyring.destroy();
    expect(() => openVault(envelope, 'wrong-password-1')).toThrowError(
      expect.objectContaining({ code: 'VAULT_DECRYPT_FAILED' }),
    );
  });
});
