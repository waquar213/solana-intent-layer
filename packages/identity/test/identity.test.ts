import { describe, expect, it } from 'vitest';
import { HDKeyring } from '@intent-wallet/core';
import { computeIdentityId, deriveUniversalIdentity, getReceiveAddresses } from '../src/identity.js';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('Universal Identity', () => {
  const account0 = HDKeyring.fromMnemonic(ABANDON).getAccount(0);

  it('derives an identity exposing exactly three receive addresses', () => {
    const identity = deriveUniversalIdentity(account0, { label: 'Main' });
    expect(getReceiveAddresses(identity)).toHaveLength(3);
    expect(identity.addresses.btc.address).toBe(account0.btc.address);
    expect(identity.addresses.evm.address).toBe(account0.evm.address);
    expect(identity.addresses.sol.address).toBe(account0.sol.address);
    expect(identity.metadata.label).toBe('Main');
  });

  it('labels the EVM address as universal across EVM networks', () => {
    const identity = deriveUniversalIdentity(account0);
    expect(identity.addresses.evm.worksOn).toMatch(/Ethereum.*Base/u);
    expect(identity.addresses.btc.worksOn).toBe('Bitcoin');
  });

  it('id is deterministic and device-independent (same mnemonic → same id)', () => {
    const a = deriveUniversalIdentity(HDKeyring.fromMnemonic(ABANDON).getAccount(0));
    const b = deriveUniversalIdentity(HDKeyring.fromMnemonic(ABANDON).getAccount(0));
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f]{32}$/u);
  });

  it('different account indexes are different identities', () => {
    const keyring = HDKeyring.fromMnemonic(ABANDON);
    expect(computeIdentityId(keyring.getAccount(0))).not.toBe(computeIdentityId(keyring.getAccount(1)));
  });

  it('defaults the label per account index and reflects testnet', () => {
    const account1 = HDKeyring.fromMnemonic(ABANDON).getAccount(1);
    expect(deriveUniversalIdentity(account1).metadata.label).toBe('Account 2');

    const tnet = HDKeyring.fromMnemonic(ABANDON, { network: 'testnet' }).getAccount(0);
    const identity = deriveUniversalIdentity(tnet);
    expect(identity.addresses.btc.network).toBe('testnet');
    expect(identity.addresses.evm.network).toBe('testnet');
  });
});
