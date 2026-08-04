import { describe, expect, it } from 'vitest';
import { makeUniswapRouteProvider } from '../src/uniswap.js';

/** A fake RPC that returns a fixed QuoterV2 `amountOut` (32-byte word) for every eth_call. */
function fakeRpc(
  amountOut: bigint | null,
  ok = true,
  status = 200,
): { fetchFn: (url: string, init: { body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>; calls: string[] } {
  const calls: string[] = [];
  const word = amountOut === null ? undefined : '0x' + amountOut.toString(16).padStart(64, '0');
  const fetchFn = (
    _url: string,
    init: { body: string },
  ): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> => {
    calls.push(init.body);
    return Promise.resolve({ ok, status, json: () => Promise.resolve(word ? { result: word } : { error: { message: 'no pool' } }) });
  };
  return { fetchFn, calls };
}

describe('makeUniswapRouteProvider', () => {
  it('maps a real QuoterV2 amountOut to a slippage-adjusted Route for a mainnet pair', async () => {
    const { fetchFn, calls } = fakeRpc(1_807_340_000n); // 1807.34 USDC (6dp) per WETH
    const route = await makeUniswapRouteProvider('https://rpc.test', fetchFn).findRoute({
      fromSymbol: 'ETH',
      toSymbol: 'USDC',
      amountBase: 1_000_000_000_000_000_000n, // 1 WETH
      fromDecimals: 18,
    });

    expect(route?.outMinBase).toBe((1_807_340_000n * 9_950n) / 10_000n); // −50 bps
    expect(route?.outDecimals).toBe(6);
    expect(route?.legs[0]?.chainId).toBe('eip155:1');
    expect(route?.legs[0]?.venue).toBe('uniswap-v3');
    expect(calls.length).toBe(3); // one eth_call per fee tier (500/3000/10000)
  });

  it('returns null for an unknown token without hitting the network', async () => {
    const { fetchFn, calls } = fakeRpc(1n);
    expect(
      await makeUniswapRouteProvider('https://rpc.test', fetchFn).findRoute({ fromSymbol: 'DOGE', toSymbol: 'USDC', amountBase: 1n, fromDecimals: 18 }),
    ).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('returns null when no pool has liquidity (all tiers error) so a fallback can answer', async () => {
    const { fetchFn } = fakeRpc(null); // every eth_call errors
    expect(
      await makeUniswapRouteProvider('https://rpc.test', fetchFn).findRoute({ fromSymbol: 'ETH', toSymbol: 'USDC', amountBase: 1n, fromDecimals: 18 }),
    ).toBeNull();
  });

  it('returns null for a same-token no-op without hitting the network', async () => {
    const { fetchFn, calls } = fakeRpc(1n);
    expect(
      await makeUniswapRouteProvider('https://rpc.test', fetchFn).findRoute({ fromSymbol: 'WETH', toSymbol: 'ETH', amountBase: 1n, fromDecimals: 18 }),
    ).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
