import { describe, expect, it } from 'vitest';
import { derivePath as referenceDerivePath } from 'ed25519-hd-key';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { keccak_256 } from '@noble/hashes/sha3';
import { utf8ToBytes } from '@noble/hashes/utils';
import { HDKeyring, derivationPaths } from '../src/keyring.js';
import { recoverEvmAddress } from '../src/accounts/evm.js';
import { verifySolanaSignature } from '../src/accounts/solana.js';
import { solanaPublicKey } from '../src/accounts/solana.js';
import { mnemonicToSeed } from '../src/mnemonic.js';

const ABANDON_12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('HDKeyring — Universal Identity', () => {
  it('derives the official BIP-84 test-vector addresses (BTC)', () => {
    // https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki
    const keyring = HDKeyring.fromMnemonic(ABANDON_12);
    const account0 = keyring.getAccount(0);
    expect(account0.btc.address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(account0.btc.publicKey).toBe('0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c');
    expect(account0.btc.path).toBe("m/84'/0'/0'/0/0");

    const account1 = keyring.getAccount(1);
    expect(account1.btc.address).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    expect(account1.btc.publicKey).toBe('03e775fd51f0dfb8cd865d9ff1cca2a158cf651fe997fdc9fee9c1d3b5e995ea77');
  });

  it('derives the well-known EVM address for the abandon mnemonic', () => {
    // m/44'/60'/0'/0/0 of the all-zero-entropy mnemonic — canonical across MetaMask/MEW/ethers docs.
    const keyring = HDKeyring.fromMnemonic(ABANDON_12);
    const account = keyring.getAccount(0);
    expect(account.evm.address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
    expect(account.evm.path).toBe("m/44'/60'/0'/0/0");
  });

  it('derives the Solana address matching the reference SLIP-0010 implementation', () => {
    const keyring = HDKeyring.fromMnemonic(ABANDON_12);
    const account = keyring.getAccount(0);
    const seed = mnemonicToSeed(ABANDON_12);
    const reference = referenceDerivePath("m/44'/501'/0'/0'", Buffer.from(seed).toString('hex'));
    const expectedAddress = base58.encode(ed25519.getPublicKey(reference.key));
    expect(account.sol.address).toBe(expectedAddress);
    expect(account.sol.path).toBe("m/44'/501'/0'/0'");
  });

  it('is deterministic: same mnemonic → same universal identity', () => {
    const a = HDKeyring.fromMnemonic(ABANDON_12).getAccount(0);
    const b = HDKeyring.fromMnemonic(ABANDON_12).getAccount(0);
    expect(a).toEqual(b);
  });

  it('a BIP-39 passphrase yields a completely different identity', () => {
    const plain = HDKeyring.fromMnemonic(ABANDON_12).getAccount(0);
    const hidden = HDKeyring.fromMnemonic(ABANDON_12, { passphrase: 'TREZOR' }).getAccount(0);
    expect(hidden.btc.address).not.toBe(plain.btc.address);
    expect(hidden.evm.address).not.toBe(plain.evm.address);
    expect(hidden.sol.address).not.toBe(plain.sol.address);
  });

  it('different account indexes yield different addresses on all three chains', () => {
    const keyring = HDKeyring.fromMnemonic(ABANDON_12);
    const a0 = keyring.getAccount(0);
    const a1 = keyring.getAccount(1);
    expect(a0.btc.address).not.toBe(a1.btc.address);
    expect(a0.evm.address).not.toBe(a1.evm.address);
    expect(a0.sol.address).not.toBe(a1.sol.address);
    expect(a1.sol.path).toBe("m/44'/501'/1'/0'"); // SOL rotates the ACCOUNT level (Phantom convention)
  });

  it('testnet network flag switches BTC encoding only', () => {
    const mainnet = HDKeyring.fromMnemonic(ABANDON_12).getAccount(0);
    const testnet = HDKeyring.fromMnemonic(ABANDON_12, { network: 'testnet' }).getAccount(0);
    expect(testnet.btc.address).toMatch(/^tb1q/u);
    expect(testnet.btc.path).toBe("m/84'/1'/0'/0/0"); // BIP-44 coin type 1 for testnet
    expect(testnet.evm.address).toBe(mainnet.evm.address);
    expect(testnet.sol.address).toBe(mainnet.sol.address);
  });

  it('generate() produces a valid, importable wallet', () => {
    const keyring = HDKeyring.generate();
    const restored = HDKeyring.fromMnemonic(keyring.mnemonic);
    expect(restored.getAccount(0)).toEqual(keyring.getAccount(0));
  });

  it('rejects invalid mnemonics and invalid indexes', () => {
    expect(() => HDKeyring.fromMnemonic('not a real mnemonic')).toThrowError(
      expect.objectContaining({ code: 'INVALID_MNEMONIC' }),
    );
    const keyring = HDKeyring.fromMnemonic(ABANDON_12);
    for (const bad of [-1, 1.5, 2 ** 31]) {
      expect(() => keyring.getAccount(bad)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    }
  });
});

describe('HDKeyring — signing', () => {
  const keyring = HDKeyring.fromMnemonic(ABANDON_12);

  it('EVM signature recovers to the account address', () => {
    const digest = keccak_256(utf8ToBytes('intent: swap 1 ETH to USDC'));
    const signature = keyring.signEvmDigest(digest, 0);
    expect(recoverEvmAddress(digest, signature)).toBe(keyring.getAccount(0).evm.address);
  });

  it('Solana signature verifies against the account public key', () => {
    const message = utf8ToBytes('intent: send 5 SOL to Rahul');
    const signature = keyring.signSolanaMessage(message, 0);
    const publicKey = base58.decode(keyring.getAccount(0).sol.address);
    expect(verifySolanaSignature(signature, message, publicKey)).toBe(true);
  });

  it('exportPrivateKey returns keys that reproduce the public identities', () => {
    const account = keyring.getAccount(0);
    const solKey = keyring.exportPrivateKey('sol', 0);
    expect(base58.encode(solanaPublicKey(solKey))).toBe(account.sol.address);
    const evmKey = keyring.exportPrivateKey('evm', 0);
    expect(evmKey).toHaveLength(32);
    const btcKey = keyring.exportPrivateKey('btc', 0);
    expect(btcKey).toHaveLength(32);
    expect(Buffer.from(evmKey).toString('hex')).not.toBe(Buffer.from(btcKey).toString('hex'));
  });
});

describe('HDKeyring — destroy()', () => {
  it('blocks every operation after destroy', () => {
    const keyring = HDKeyring.fromMnemonic(ABANDON_12);
    keyring.getAccount(0);
    keyring.destroy();
    expect(keyring.destroyed).toBe(true);
    expect(() => keyring.getAccount(0)).toThrowError(expect.objectContaining({ code: 'KEYRING_DESTROYED' }));
    expect(() => keyring.mnemonic).toThrowError(expect.objectContaining({ code: 'KEYRING_DESTROYED' }));
    expect(() => keyring.signEvmDigest(new Uint8Array(32))).toThrowError(
      expect.objectContaining({ code: 'KEYRING_DESTROYED' }),
    );
    expect(() => keyring.exportPrivateKey('evm')).toThrowError(expect.objectContaining({ code: 'KEYRING_DESTROYED' }));
    keyring.destroy(); // idempotent
  });
});

describe('derivation path table', () => {
  it('documents the exact ecosystem-standard paths', () => {
    expect(derivationPaths.btc(3)).toBe("m/84'/0'/0'/0/3");
    expect(derivationPaths.btc(3, 'testnet')).toBe("m/84'/1'/0'/0/3");
    expect(derivationPaths.evm(3)).toBe("m/44'/60'/0'/0/3");
    expect(derivationPaths.sol(3)).toBe("m/44'/501'/3'/0'");
  });
});
