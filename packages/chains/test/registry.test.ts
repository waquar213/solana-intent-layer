import { describe, expect, it } from 'vitest';
import { CHAINS, chainByEvmChainId, getChain, listChains } from '../src/registry.js';

describe('chain registry', () => {
  it('contains the 8 launch mainnets and 5 testnets', () => {
    expect(listChains({ testnet: false })).toHaveLength(8);
    expect(listChains({ testnet: true })).toHaveLength(5);
  });

  it('every EVM chain has an EIP-155 id; non-EVM chains have none', () => {
    for (const chain of Object.values(CHAINS)) {
      if (chain.ecosystem === 'evm') {
        expect(chain.evmChainId, chain.id).toBeGreaterThan(0);
      } else {
        expect(chain.evmChainId, chain.id).toBeUndefined();
      }
    }
  });

  it('pins the canonical EIP-155 ids (a wrong id = signing for the wrong chain)', () => {
    expect(CHAINS.ethereum.evmChainId).toBe(1);
    expect(CHAINS.optimism.evmChainId).toBe(10);
    expect(CHAINS.bnb.evmChainId).toBe(56);
    expect(CHAINS.polygon.evmChainId).toBe(137);
    expect(CHAINS.base.evmChainId).toBe(8453);
    expect(CHAINS.arbitrum.evmChainId).toBe(42161);
    expect(CHAINS.sepolia.evmChainId).toBe(11155111);
    expect(CHAINS['base-sepolia'].evmChainId).toBe(84532);
    expect(CHAINS['giwa-sepolia'].evmChainId).toBe(91342);
  });

  it('pins native-asset decimals (a wrong decimal = 10^n fund-loss bug)', () => {
    expect(CHAINS.bitcoin.native.decimals).toBe(8);
    expect(CHAINS.solana.native.decimals).toBe(9);
    expect(CHAINS.ethereum.native.decimals).toBe(18);
  });

  it('every chain has at least one default RPC and an https explorer', () => {
    for (const chain of Object.values(CHAINS)) {
      expect(chain.defaultRpcUrls.length, chain.id).toBeGreaterThan(0);
      for (const url of chain.defaultRpcUrls) expect(url, chain.id).toMatch(/^https:\/\//u);
      expect(chain.explorerUrl, chain.id).toMatch(/^https:\/\//u);
    }
  });

  it('getChain throws UNKNOWN_CHAIN for unregistered ids', () => {
    expect(getChain('ethereum').name).toBe('Ethereum');
    expect(() => getChain('dogecoin')).toThrowError(expect.objectContaining({ code: 'UNKNOWN_CHAIN' }));
  });

  it('resolves chains by EVM chain id', () => {
    expect(chainByEvmChainId(8453)?.id).toBe('base');
    expect(chainByEvmChainId(999999)).toBeUndefined();
  });

  it('filters by ecosystem', () => {
    expect(listChains({ ecosystem: 'evm', testnet: false })).toHaveLength(6);
    expect(listChains({ ecosystem: 'btc', testnet: false })).toHaveLength(1);
    expect(listChains({ ecosystem: 'sol', testnet: false })).toHaveLength(1);
  });
});
