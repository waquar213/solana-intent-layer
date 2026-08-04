import { describe, expect, it } from 'vitest';
import { makeEvmGasEstimator } from '../src/gas.js';

/** A fake RPC that returns a fixed `eth_gasPrice` (or an error/!ok) for every call. */
function fakeRpc(
  gasPriceWei: bigint | null,
  ok = true,
): { fetchFn: (url: string, init: { body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>; calls: number } {
  const state = { calls: 0 };
  const fetchFn = (
    _url: string,
    _init: { body: string },
  ): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
    state.calls += 1;
    const result = gasPriceWei === null ? {} : { result: '0x' + gasPriceWei.toString(16) };
    return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(result) });
  };
  return { fetchFn, get calls() { return state.calls; } };
}

describe('makeEvmGasEstimator', () => {
  it('computes live micro-USD from gas price × representative gas × ETH price', async () => {
    const { fetchFn } = fakeRpc(20_000_000_000n); // 20 gwei
    const estimate = makeEvmGasEstimator({ rpcUrl: 'https://rpc.test', fetchFn, getEthPriceUsd: () => Promise.resolve('1807.34') });

    // (20e9 wei · 120_000 gas · 1_807_340_000 µUSD/ETH) / 1e18 = 4_337_616 µUSD = $4.337616
    expect(await estimate('eip155:1')).toBe(4_337_616n);
  });

  it('scales with a custom gas budget', async () => {
    const { fetchFn } = fakeRpc(10_000_000_000n); // 10 gwei
    const estimate = makeEvmGasEstimator({
      rpcUrl: 'https://rpc.test',
      fetchFn,
      getEthPriceUsd: () => Promise.resolve('2000'),
      gasUnits: 21_000n, // a plain native transfer
    });
    // (10e9 · 21_000 · 2_000_000_000) / 1e18 = 420_000 µUSD = $0.42
    expect(await estimate('eip155:1')).toBe(420_000n);
  });

  it('returns null (→ static baseline) for any chain but eip155:1, without hitting the RPC', async () => {
    const rpc = fakeRpc(20_000_000_000n);
    const estimate = makeEvmGasEstimator({ rpcUrl: 'https://rpc.test', fetchFn: rpc.fetchFn, getEthPriceUsd: () => Promise.resolve('1807') });

    // non-EVM
    expect(await estimate('solana:mainnet')).toBeNull();
    expect(await estimate('bip122:bitcoin')).toBeNull();
    // OTHER EVM chains: this estimator only prices mainnet (single mainnet RPC + ETH
    // denominator), so an L2 / Polygon must fall back rather than get mainnet gas mispriced.
    expect(await estimate('eip155:42161')).toBeNull(); // Arbitrum
    expect(await estimate('eip155:137')).toBeNull(); // Polygon (gas is POL, not ETH)
    expect(rpc.calls).toBe(0);
  });

  it('returns null when the gas price is unavailable (RPC error) so the static baseline is used', async () => {
    const { fetchFn } = fakeRpc(null, false);
    const estimate = makeEvmGasEstimator({ rpcUrl: 'https://rpc.test', fetchFn, getEthPriceUsd: () => Promise.resolve('1807') });
    expect(await estimate('eip155:1')).toBeNull();
  });

  it('returns null when the ETH price is unknown (never invents a fee)', async () => {
    const { fetchFn } = fakeRpc(20_000_000_000n);
    const estimate = makeEvmGasEstimator({ rpcUrl: 'https://rpc.test', fetchFn, getEthPriceUsd: () => Promise.resolve(undefined) });
    expect(await estimate('eip155:1')).toBeNull();
  });
});
