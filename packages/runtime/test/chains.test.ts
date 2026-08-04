import { describe, expect, it } from 'vitest';
import type { BlockchainAdapter } from '@intent-wallet/chains';
import {
  AdapterChainGateway,
  createWalletRuntime,
  fakeStepSigner,
  mergeHoldings,
  readChainHoldings,
  type Holding,
} from '../src/index.js';

function fakeAdapter(over: Partial<BlockchainAdapter> = {}): BlockchainAdapter {
  return {
    chainId: 'ethereum',
    ecosystem: 'evm',
    getNativeBalance: () => Promise.resolve(0n),
    getTokenBalances: () => Promise.resolve([]),
    getBlockHeight: () => Promise.resolve(1n),
    getAssetMetadata: () => Promise.resolve({ symbol: 'X', decimals: 18 }),
    validateAddress: () => true,
    estimateFees: () => Promise.resolve({ kind: 'evm', maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, baseFeePerGas: 1n }),
    broadcastRawTransaction: (raw) => Promise.resolve({ txid: `0x${raw}` }),
    getTransactionStatus: () => Promise.resolve({ state: 'confirmed', confirmations: 12 }),
    ...over,
  };
}

describe('chain wiring — live balances + adapter-backed gateway', () => {
  it('reads live native + token balances into planner Holdings', async () => {
    const adapter = fakeAdapter({
      getNativeBalance: () => Promise.resolve(3n * 10n ** 18n),
      getTokenBalances: () =>
        Promise.resolve([
          { assetId: 'ethereum:usdc', amount: 100_000_000n, decimals: 6, symbol: 'USDC', tokenAddress: '0xusdc' },
        ]),
    });
    const holdings = await readChainHoldings(adapter, '0xabc', [{ address: '0xusdc', symbol: 'USDC', decimals: 6 }]);
    expect(holdings.find((h) => h.symbol === 'ETH')?.totalBase).toBe(3n * 10n ** 18n);
    expect(holdings.find((h) => h.symbol === 'USDC')?.totalBase).toBe(100_000_000n);
  });

  it('merges the same symbol across chains (sum + provenance)', () => {
    const a: Holding[] = [{ symbol: 'ETH', decimals: 18, totalBase: 1n, chains: [{ chainId: 'ethereum', base: 1n }] }];
    const b: Holding[] = [{ symbol: 'ETH', decimals: 18, totalBase: 2n, chains: [{ chainId: 'arbitrum', base: 2n }] }];
    const merged = mergeHoldings(a, b);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.totalBase).toBe(3n);
    expect(merged[0]?.chains).toHaveLength(2);
  });

  it('executes a plan through the real adapter-backed ChainGateway', async () => {
    const gateway = new AdapterChainGateway(() => fakeAdapter());
    const rt = createWalletRuntime({
      holdings: [
        {
          symbol: 'ETH',
          decimals: 18,
          totalBase: 2n * 10n ** 18n,
          chains: [{ chainId: 'eip155:1', base: 2n * 10n ** 18n }],
        },
      ],
      prices: { ETH: '2000' },
    });
    const { outcome } = await rt.plan('send 0.1 ETH to 0x1111111111111111111111111111111111111111');
    if (outcome.kind !== 'plan') throw new Error('expected a plan');
    const exec = await rt.execute(outcome.plan, { signer: fakeStepSigner, gateway });
    expect(exec.status).toBe('completed');
  });
});
