/**
 * EVM balance reader — driven by a scripted fake JSON-RPC transport (no
 * network), so it validates our ABI encode/decode and the adapter logic
 * hermetically. The transport asserts we send the exact RPC calls a node
 * expects.
 */
import { describe, expect, it } from 'vitest';
import { ProviderPool, type JsonRpcTransport } from '../src/provider.js';
import { EvmAdapter } from '../src/evm/adapter.js';
import { decodeString, decodeUint, encodeBalanceOf, encodeErc20Transfer, encodeUint256 } from '../src/evm/abi.js';

const HOLDER = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

/** Encodes a uint into a 32-byte hex word (for building fake return values). */
function word(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}
/** Encodes an ABI dynamic string return (offset‖length‖data). */
function stringReturn(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let data = '';
  for (const b of bytes) data += b.toString(16).padStart(2, '0');
  return `0x${word(32n)}${word(BigInt(bytes.length))}${data.padEnd(64, '0')}`;
}

/** Fake transport answering EVM read calls from a fixture map. */
function evmTransport(handler: (method: string, params: unknown) => unknown): { pool: ProviderPool; calls: unknown[] } {
  const calls: unknown[] = [];
  const transport: JsonRpcTransport = {
    url: 'https://fake',
    async request(method, params) {
      calls.push({ method, params });
      return handler(method, params);
    },
  };
  return { pool: new ProviderPool([transport]), calls };
}

describe('EvmAdapter native balance', () => {
  it('reads native balance via eth_getBalance and decodes wei', async () => {
    const { pool, calls } = evmTransport((method, params) => {
      expect(method).toBe('eth_getBalance');
      expect((params as unknown[])[0]).toBe(HOLDER);
      return `0x${word(1_500_000_000_000_000_000n)}`; // 1.5 ETH
    });
    const adapter = new EvmAdapter('ethereum', pool);
    expect(await adapter.getNativeBalance(HOLDER)).toBe(1_500_000_000_000_000_000n);
    expect(calls).toHaveLength(1);
  });

  it('wraps the native balance as an AssetBalance with chain metadata', async () => {
    const { pool } = evmTransport(() => `0x${word(2_000_000_000_000_000_000n)}`);
    const asset = await new EvmAdapter('base', pool).getNativeAssetBalance(HOLDER);
    expect(asset).toMatchObject({ assetId: 'ETH', symbol: 'ETH', decimals: 18, tokenAddress: null });
    expect(asset.amount).toBe(2_000_000_000_000_000_000n);
  });
});

describe('EvmAdapter token balances', () => {
  it('reads ERC-20 balance via eth_call balanceOf, using provided metadata', async () => {
    const { pool, calls } = evmTransport((method, params) => {
      expect(method).toBe('eth_call');
      const call = (params as [{ to: string; data: string }])[0];
      expect(call.to).toBe(USDC);
      expect(call.data).toBe(encodeBalanceOf(HOLDER)); // exact ABI encoding
      return `0x${word(761_230_000n)}`; // 761.23 USDC (6 decimals)
    });
    const adapter = new EvmAdapter('ethereum', pool);
    const balances = await adapter.getTokenBalances(HOLDER, [{ address: USDC, symbol: 'USDC', decimals: 6 }]);
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({ symbol: 'USDC', decimals: 6, amount: 761_230_000n });
    expect(balances[0]?.assetId).toBe(`ethereum:${USDC.toLowerCase()}`);
    expect(calls).toHaveLength(1); // metadata provided → no decimals()/symbol() calls
  });

  it('fetches decimals() and symbol() when metadata is not provided', async () => {
    const { pool } = evmTransport((_method, params) => {
      const data = (params as [{ data: string }])[0].data;
      if (data.startsWith('0x70a08231')) return `0x${word(5_000_000n)}`; // balanceOf
      if (data === '0x313ce567') return `0x${word(6n)}`; // decimals
      if (data === '0x95d89b41') return stringReturn('USDC'); // symbol
      throw new Error('unexpected call');
    });
    const [bal] = await new EvmAdapter('ethereum', pool).getTokenBalances(HOLDER, [{ address: USDC }]);
    expect(bal).toMatchObject({ symbol: 'USDC', decimals: 6, amount: 5_000_000n });
  });

  it('skips a token that errors without failing the whole call', async () => {
    const { pool } = evmTransport((_method, params) => {
      const to = (params as [{ to: string }])[0].to;
      if (to === USDC) return `0x${word(100n)}`;
      throw new Error('bad token');
    });
    const adapter = new EvmAdapter('ethereum', pool);
    const balances = await adapter.getTokenBalances(HOLDER, [
      { address: USDC, symbol: 'USDC', decimals: 6 },
      { address: '0x000000000000000000000000000000000000dead', symbol: 'BAD', decimals: 18 },
    ]);
    expect(balances).toHaveLength(1);
    expect(balances[0]?.symbol).toBe('USDC');
  });

  it('reads block height', async () => {
    const { pool } = evmTransport((method) => {
      expect(method).toBe('eth_blockNumber');
      return `0x${21_000_000n.toString(16)}`;
    });
    expect(await new EvmAdapter('ethereum', pool).getBlockHeight()).toBe(21_000_000n);
  });

  it('rejects construction on a non-EVM chain', () => {
    const { pool } = evmTransport(() => '0x0');
    expect(() => new EvmAdapter('bitcoin', pool)).toThrow();
  });
});

describe('ABI helpers', () => {
  it('decodes empty and zero uints', () => {
    expect(decodeUint('0x')).toBe(0n);
    expect(decodeUint(`0x${word(0n)}`)).toBe(0n);
  });

  it('decodes legacy bytes32 packed strings (e.g. MKR-style symbols)', () => {
    // "MKR" packed into bytes32.
    const packed = `0x${Buffer.from('MKR').toString('hex').padEnd(64, '0')}`;
    expect(decodeString(packed)).toBe('MKR');
  });

  it('decodes modern dynamic-string returns', () => {
    expect(decodeString(stringReturn('Wrapped BTC'))).toBe('Wrapped BTC');
  });

  it('encodes an ERC-20 transfer(to, amount) call byte-exactly', () => {
    // transfer(0x00..01, 1_000_000) — selector + 32-byte address word + 32-byte amount word.
    const data = encodeErc20Transfer('0x0000000000000000000000000000000000000001', 1_000_000n);
    expect(data).toBe(`0xa9059cbb${'1'.padStart(64, '0')}${(1_000_000).toString(16).padStart(64, '0')}`);
    expect(data.length).toBe(2 + 8 + 64 + 64); // 0x + selector + 2 words
  });

  it('rejects negative and oversized uint256', () => {
    expect(() => encodeUint256(-1n)).toThrow();
    expect(() => encodeUint256(2n ** 256n)).toThrow();
    expect(encodeUint256(2n ** 256n - 1n)).toBe('f'.repeat(64));
  });
});
