/**
 * EVM adapter write/fee/tracking methods, driven by scripted fake transports.
 */
import { describe, expect, it } from 'vitest';
import { ProviderPool, type JsonRpcTransport } from '../src/provider.js';
import { EvmAdapter } from '../src/evm/adapter.js';

function word(v: bigint): string {
  return `0x${v.toString(16)}`;
}
function transport(handler: (method: string, params: unknown) => unknown) {
  const t: JsonRpcTransport = {
    url: 'https://fake',
    async request(m, p) {
      return handler(m, p);
    },
  };
  return new ProviderPool([t]);
}
const ADDR = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

describe('EvmAdapter.estimateFees (EIP-1559)', () => {
  it('derives maxFee/priority/base from eth_feeHistory', async () => {
    const pool = transport((method) => {
      expect(method).toBe('eth_feeHistory');
      return { baseFeePerGas: [word(10_000_000_000n), word(12_000_000_000n)], reward: [[word(1_500_000_000n)]] };
    });
    const fee = await new EvmAdapter('base', pool).estimateFees('normal');
    expect(fee.kind).toBe('evm');
    if (fee.kind === 'evm') {
      expect(fee.baseFeePerGas).toBe(12_000_000_000n); // last base fee
      expect(fee.maxPriorityFeePerGas).toBe(1_500_000_000n);
      expect(fee.maxFeePerGas).toBe(12_000_000_000n * 2n + 1_500_000_000n);
    }
  });

  it('floors the tip at 1 gwei when history reports zero', async () => {
    const pool = transport(() => ({ baseFeePerGas: [word(5_000_000_000n)], reward: [[word(0n)]] }));
    const fee = await new EvmAdapter('ethereum', pool).estimateFees();
    if (fee.kind === 'evm') expect(fee.maxPriorityFeePerGas).toBe(1_000_000_000n);
  });
});

describe('EvmAdapter tx-building helpers', () => {
  it('reads the pending nonce', async () => {
    const pool = transport((method, params) => {
      expect(method).toBe('eth_getTransactionCount');
      expect((params as unknown[])[1]).toBe('pending');
      return word(7n);
    });
    expect(await new EvmAdapter('ethereum', pool).getNonce(ADDR)).toBe(7n);
  });

  it('estimates gas, encoding value as hex', async () => {
    const pool = transport((method, params) => {
      expect(method).toBe('eth_estimateGas');
      const call = (params as [{ to: string; value?: string }])[0];
      expect(call.to).toBe(ADDR);
      expect(call.value).toBe('0xde0b6b3a7640000'); // 1e18
      return word(21_000n);
    });
    expect(await new EvmAdapter('ethereum', pool).estimateGas({ to: ADDR, value: 10n ** 18n })).toBe(21_000n);
  });

  it('simulateCall returns raw return data', async () => {
    const pool = transport((method) => {
      expect(method).toBe('eth_call');
      return '0x0000000000000000000000000000000000000000000000000000000000000001';
    });
    expect(await new EvmAdapter('ethereum', pool).simulateCall({ to: ADDR, data: '0xabcd' })).toMatch(/0*1$/u);
  });
});

describe('EvmAdapter broadcast + status', () => {
  it('broadcasts a raw tx and returns the txid', async () => {
    const pool = transport((method, params) => {
      expect(method).toBe('eth_sendRawTransaction');
      expect((params as unknown[])[0]).toBe('0x02abcdef');
      return '0xhash123';
    });
    expect(await new EvmAdapter('ethereum', pool).broadcastRawTransaction('0x02abcdef')).toEqual({ txid: '0xhash123' });
  });

  it('reports pending when there is no receipt yet', async () => {
    const pool = transport((method) => (method === 'eth_getTransactionReceipt' ? null : word(100n)));
    expect(await new EvmAdapter('ethereum', pool).getTransactionStatus('0xabc')).toMatchObject({
      state: 'pending',
      confirmations: 0,
    });
  });

  it('computes confirmations from head minus inclusion block', async () => {
    const pool = transport((method) => {
      if (method === 'eth_getTransactionReceipt') return { blockNumber: word(100n), status: '0x1' };
      return word(105n); // eth_blockNumber
    });
    const status = await new EvmAdapter('ethereum', pool).getTransactionStatus('0xabc');
    expect(status).toMatchObject({ state: 'confirmed', confirmations: 6, blockHeight: 100n });
  });

  it('marks a reverted receipt (status 0x0) as failed', async () => {
    const pool = transport((method) =>
      method === 'eth_getTransactionReceipt' ? { blockNumber: word(100n), status: '0x0' } : word(101n),
    );
    expect((await new EvmAdapter('ethereum', pool).getTransactionStatus('0xabc')).state).toBe('failed');
  });
});

describe('EvmAdapter.validateAddress + metadata', () => {
  it('accepts well-formed EVM addresses and rejects others', () => {
    const adapter = new EvmAdapter(
      'ethereum',
      transport(() => '0x0'),
    );
    expect(adapter.validateAddress(ADDR)).toBe(true);
    expect(adapter.validateAddress('0x123')).toBe(false);
    expect(adapter.validateAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).toBe(false);
  });

  it('fetches asset metadata (decimals + symbol)', async () => {
    const pool = transport((_m, params) => {
      const data = (params as [{ data: string }])[0].data;
      if (data === '0x313ce567') return word(6n);
      return `0x${32n.toString(16).padStart(64, '0')}${4n.toString(16).padStart(64, '0')}${Buffer.from('USDC').toString('hex').padEnd(64, '0')}`;
    });
    expect(await new EvmAdapter('ethereum', pool).getAssetMetadata('0xtoken')).toMatchObject({
      symbol: 'USDC',
      decimals: 6,
    });
  });

  it('exposes its ecosystem', () => {
    expect(
      new EvmAdapter(
        'base',
        transport(() => '0x0'),
      ).ecosystem,
    ).toBe('evm');
  });
});
