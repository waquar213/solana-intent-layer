import { describe, expect, it } from 'vitest';
import { HDKeyring, signEip1559Transaction, type Eip1559Transaction } from '@intent-wallet/core';
import type { BlockchainAdapter } from '@intent-wallet/chains';
import {
  createEvmStepSigner,
  createLiveExecutor,
  createLocalEvmDevice,
  createWalletRuntime,
  discoverHoldings,
  type StepGasPlan,
} from '../src/index.js';

const DEMO = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const GOOD = '0x1111111111111111111111111111111111111111';

function keyAndAddress(): { pk: Uint8Array; address: string } {
  const kr = HDKeyring.fromMnemonic(DEMO);
  const address = kr.getAccount(0).evm.address;
  const pk = kr.exportPrivateKey('evm', 0);
  return { pk, address };
}

const gasPlan: StepGasPlan = {
  chainId: 'eip155:1',
  sponsored: false,
  sponsoredMicros: 0n,
  params: { maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: 1_500_000_000n, bounded: false },
  feeToken: null,
  reason: 'user pays',
};

const transferStep = {
  seq: 0,
  kind: 'transfer' as const,
  chainId: 'eip155:1',
  description: 'send',
  dependsOn: [],
  params: { to: GOOD, value: '1000000000000000000' }, // 1 ETH
};

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
    broadcastRawTransaction: (raw) => Promise.resolve({ txid: `0x${raw.slice(2, 10)}` }),
    getTransactionStatus: () => Promise.resolve({ state: 'confirmed', confirmations: 12 }),
    ...over,
  };
}

describe('production EVM step signer — real EIP-1559 signing', () => {
  it('signs a plan step into the exact tx core would sign (real, broadcastable)', async () => {
    const { pk, address } = keyAndAddress();
    const signer = createEvmStepSigner({
      device: createLocalEvmDevice(pk),
      from: address,
      nonceFor: () => Promise.resolve(7n),
    });
    const plan = { steps: [transferStep] } as never; // signer reads only step + gas
    const { rawTx } = await signer.sign(transferStep, plan, gasPlan);

    // The signer must produce EXACTLY the tx a direct core sign would — proving it
    // builds the right EIP-1559 fields and really signs them.
    const expectedTx: Eip1559Transaction = {
      chainId: 1,
      nonce: 7n,
      maxPriorityFeePerGas: 1_500_000_000n,
      maxFeePerGas: 30_000_000_000n,
      gasLimit: 21_000n,
      to: GOOD,
      value: 1_000_000_000_000_000_000n,
    };
    const expected = signEip1559Transaction(expectedTx, pk);
    expect(rawTx).toBe(expected.raw);
    expect(rawTx.startsWith('0x02')).toBe(true); // typed EIP-1559 envelope
  });

  it('uses the gas plan fees + injected nonce (different nonce ⇒ different signature)', async () => {
    const { pk, address } = keyAndAddress();
    const mk = (nonce: bigint) =>
      createEvmStepSigner({ device: createLocalEvmDevice(pk), from: address, nonceFor: () => Promise.resolve(nonce) });
    const plan = { steps: [transferStep] } as never;
    const a = await mk(0n).sign(transferStep, plan, gasPlan);
    const b = await mk(1n).sign(transferStep, plan, gasPlan);
    expect(a.rawTx).not.toBe(b.rawTx);
  });

  it('refuses a non-EVM chain (a multi-ecosystem deployment composes per-chain signers)', async () => {
    const { pk, address } = keyAndAddress();
    const signer = createEvmStepSigner({ device: createLocalEvmDevice(pk), from: address, nonceFor: () => Promise.resolve(0n) });
    const btc = { ...transferStep, chainId: 'bip122:bitcoin' };
    await expect(signer.sign(btc, { steps: [btc] } as never, undefined)).rejects.toThrow(/EVM/i);
  });
});

describe('live executor + balance discovery (over adapters — fake here, real RPC in prod)', () => {
  it('drives a plan to completion with a REAL signer + adapter-backed gateway', async () => {
    const { pk, address } = keyAndAddress();
    const executor = createLiveExecutor({
      device: createLocalEvmDevice(pk),
      from: address,
      nonceFor: () => Promise.resolve(0n),
      adapterFor: () => fakeAdapter(),
    });
    const rt = createWalletRuntime({
      holdings: [{ symbol: 'ETH', decimals: 18, totalBase: 2n * 10n ** 18n, chains: [{ chainId: 'eip155:1', base: 2n * 10n ** 18n }] }],
      prices: { ETH: '2000' },
    });
    const { outcome } = await rt.plan(`send 0.1 ETH to ${GOOD}`);
    if (outcome.kind !== 'plan') throw new Error('expected a plan');
    const exec = await rt.execute(outcome.plan, executor);
    expect(exec.status).toBe('completed'); // real signature broadcast through the gateway
  });

  it('discovers + merges balances across chains', async () => {
    const eth = fakeAdapter({ chainId: 'ethereum', getNativeBalance: () => Promise.resolve(2n * 10n ** 18n) });
    const arb = fakeAdapter({ chainId: 'arbitrum', getNativeBalance: () => Promise.resolve(1n * 10n ** 18n) });
    const holdings = await discoverHoldings([
      { adapter: eth, address: '0xabc' },
      { adapter: arb, address: '0xabc' },
    ]);
    const ethHolding = holdings.find((h) => h.symbol === 'ETH');
    expect(ethHolding?.totalBase).toBe(3n * 10n ** 18n); // 2 + 1 merged
    expect(ethHolding?.chains).toHaveLength(2);
  });
});
