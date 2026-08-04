import { describe, expect, it } from 'vitest';
import { HDKeyring } from '@intent-wallet/core';
import { addressesEqual, classifyAddress, isValidAddress, requireAddress } from '../src/address.js';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('classifyAddress', () => {
  it('classifies real derived addresses from the wallet core', () => {
    const account = HDKeyring.fromMnemonic(ABANDON).getAccount(0);
    expect(classifyAddress(account.btc.address)?.ecosystem).toBe('btc');
    expect(classifyAddress(account.evm.address)?.ecosystem).toBe('evm');
    expect(classifyAddress(account.sol.address)?.ecosystem).toBe('sol');
  });

  it('validates and normalizes EVM addresses via EIP-55', () => {
    const lower = '0x9858effd232b4033e47d90003d41ec34ecaeda94';
    const info = classifyAddress(lower);
    expect(info?.ecosystem).toBe('evm');
    expect(info?.normalized).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });

  it('rejects an EVM address with a broken mixed-case checksum', () => {
    // Correct EIP-55 form is 0x9858EfFD232B4033E47d90003D41EC34EcaEda94; this mixes
    // case differently, so the checksum is wrong and it must be rejected.
    const broken = '0x9858effd232B4033E47d90003D41EC34EcaEda94';
    expect(classifyAddress(broken)).toBeNull();
    // All-lowercase and all-uppercase (no case signal) remain acceptable.
    expect(classifyAddress('0x9858effd232b4033e47d90003d41ec34ecaeda94')?.ecosystem).toBe('evm');
  });

  it('classifies mainnet and testnet bech32 Bitcoin addresses', () => {
    expect(classifyAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).toMatchObject({
      ecosystem: 'btc',
      network: 'mainnet',
    });
    const tb = HDKeyring.fromMnemonic(ABANDON, { network: 'testnet' }).getAccount(0).btc.address;
    expect(classifyAddress(tb)).toMatchObject({ ecosystem: 'btc', network: 'testnet' });
  });

  it('accepts legacy base58 Bitcoin addresses (valid send targets)', () => {
    expect(classifyAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')?.ecosystem).toBe('btc'); // P2PKH
    expect(classifyAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')?.ecosystem).toBe('btc'); // P2SH
  });

  it('classifies base58 Solana public keys as 32-byte addresses', () => {
    const sol = HDKeyring.fromMnemonic(ABANDON).getAccount(0).sol.address;
    expect(classifyAddress(sol)).toMatchObject({ ecosystem: 'sol', network: 'mainnet' });
  });

  it('returns null for garbage', () => {
    for (const bad of ['', 'hello', '0x123', 'not-an-address', '0xZZ58effd232b4033e47d90003d41ec34ecaeda94']) {
      expect(classifyAddress(bad), bad).toBeNull();
    }
  });
});

describe('isValidAddress / requireAddress', () => {
  it('honors an expected-ecosystem filter', () => {
    const evm = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
    expect(isValidAddress(evm, 'evm')).toBe(true);
    expect(isValidAddress(evm, 'btc')).toBe(false);
    expect(() => requireAddress(evm, 'sol')).toThrowError(expect.objectContaining({ code: 'INVALID_ADDRESS' }));
    expect(requireAddress(evm).ecosystem).toBe('evm');
  });
});

describe('addressesEqual', () => {
  it('is checksum-insensitive for EVM and exact for others', () => {
    expect(
      addressesEqual('0x9858effd232b4033e47d90003d41ec34ecaeda94', '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'),
    ).toBe(true);
    expect(
      addressesEqual('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g'),
    ).toBe(false);
  });
});
