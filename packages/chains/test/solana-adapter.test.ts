import { describe, expect, it } from 'vitest';
import { ProviderPool, type JsonRpcTransport } from '../src/provider.js';
import { SolanaAdapter } from '../src/solana/adapter.js';

const OWNER = 'GsbwXfJraMomNxBcpR3DBNxnKwuUcLD9Y47j2tJ6dxCg'; // valid 32-byte base58

function pool(handler: (method: string, params: unknown) => unknown) {
  const t: JsonRpcTransport = {
    url: 'https://sol',
    async request(m, p) {
      return handler(m, p);
    },
  };
  return new ProviderPool([t]);
}

describe('SolanaAdapter', () => {
  it('reads native lamport balance as bigint', async () => {
    const adapter = new SolanaAdapter(
      'solana',
      pool((method) => {
        expect(method).toBe('getBalance');
        return { value: 2_500_000_000 };
      }),
    );
    expect(await adapter.getNativeBalance(OWNER)).toBe(2_500_000_000n);
    expect(adapter.ecosystem).toBe('sol');
  });

  it('reads slot as block height', async () => {
    const adapter = new SolanaAdapter(
      'solana',
      pool(() => 250_000_000),
    );
    expect(await adapter.getBlockHeight()).toBe(250_000_000n);
  });

  it('returns requested SPL balances from getTokenAccountsByOwner', async () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mint
    const adapter = new SolanaAdapter(
      'solana',
      pool((method) => {
        expect(method).toBe('getTokenAccountsByOwner');
        return {
          value: [
            { account: { data: { parsed: { info: { mint, tokenAmount: { amount: '761230000', decimals: 6 } } } } } },
          ],
        };
      }),
    );
    const balances = await adapter.getTokenBalances(OWNER, [{ address: mint, symbol: 'USDC' }]);
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({ symbol: 'USDC', decimals: 6, amount: 761_230_000n });
    expect(balances[0]?.assetId).toBe(`solana:${mint}`);
  });

  it('skips mints the owner does not hold', async () => {
    const adapter = new SolanaAdapter(
      'solana',
      pool(() => ({ value: [] })),
    );
    expect(await adapter.getTokenBalances(OWNER, [{ address: 'someMint' }])).toEqual([]);
  });

  it('estimates fees: base per-signature + median priority', async () => {
    const adapter = new SolanaAdapter(
      'solana',
      pool((method) => {
        expect(method).toBe('getRecentPrioritizationFees');
        return [{ prioritizationFee: 100 }, { prioritizationFee: 500 }, { prioritizationFee: 300 }];
      }),
    );
    const fee = await adapter.estimateFees();
    expect(fee.kind).toBe('sol');
    if (fee.kind === 'sol') {
      expect(fee.baseLamports).toBe(5000n);
      expect(fee.priorityMicroLamportsPerCu).toBe(300n); // median of [100,300,500]
    }
  });

  it('broadcasts a base64 tx and returns the signature', async () => {
    const adapter = new SolanaAdapter(
      'solana',
      pool((method, params) => {
        expect(method).toBe('sendTransaction');
        expect((params as unknown[])[1]).toEqual({ encoding: 'base64' });
        return 'sig123';
      }),
    );
    expect(await adapter.broadcastRawTransaction('AAAA')).toEqual({ txid: 'sig123' });
  });

  it('maps signature status to confirmed/failed/pending', async () => {
    const confirmed = new SolanaAdapter(
      'solana',
      pool(() => ({ value: [{ confirmationStatus: 'finalized', confirmations: 32, err: null, slot: 100 }] })),
    );
    expect(await confirmed.getTransactionStatus('sig')).toMatchObject({ state: 'confirmed', confirmations: 32 });

    const failed = new SolanaAdapter(
      'solana',
      pool(() => ({
        value: [{ confirmationStatus: 'confirmed', confirmations: 1, err: { InstructionError: [] }, slot: 100 }],
      })),
    );
    expect((await failed.getTransactionStatus('sig')).state).toBe('failed');

    const unknown = new SolanaAdapter(
      'solana',
      pool(() => ({ value: [null] })),
    );
    expect((await unknown.getTransactionStatus('sig')).state).toBe('unknown');
  });

  it('validates 32-byte base58 addresses', () => {
    const adapter = new SolanaAdapter(
      'solana',
      pool(() => 0),
    );
    expect(adapter.validateAddress(OWNER)).toBe(true);
    expect(adapter.validateAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(false);
    expect(adapter.validateAddress('short')).toBe(false);
  });

  it('rejects construction on a non-Solana chain', () => {
    expect(
      () =>
        new SolanaAdapter(
          'ethereum',
          pool(() => 0),
        ),
    ).toThrow();
  });
});
