import { describe, expect, it } from 'vitest';
import { BitcoinAdapter } from '../src/bitcoin/adapter.js';
import type { RestTransport } from '../src/bitcoin/rest.js';

const ADDR = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

/** Fake esplora REST transport driven by a route→response map. */
function fakeRest(routes: Record<string, unknown>, post?: (path: string, body: string) => string): RestTransport {
  return {
    baseUrl: 'https://esplora',
    async getJson<T>(path: string): Promise<T> {
      if (!(path in routes)) throw new Error(`unexpected GET ${path}`);
      return routes[path] as T;
    },
    async getText(path: string): Promise<string> {
      if (!(path in routes)) throw new Error(`unexpected GET ${path}`);
      return String(routes[path]);
    },
    async postText(path: string, body: string): Promise<string> {
      if (!post) throw new Error('no POST handler');
      return post(path, body);
    },
  };
}

describe('BitcoinAdapter', () => {
  it('computes balance from funded minus spent (UTXO model)', async () => {
    const adapter = new BitcoinAdapter(
      'bitcoin',
      fakeRest({
        [`/address/${ADDR}`]: { chain_stats: { funded_txo_sum: 150_000, spent_txo_sum: 50_000 } },
      }),
    );
    expect(await adapter.getNativeBalance(ADDR)).toBe(100_000n);
    expect(adapter.ecosystem).toBe('btc');
  });

  it('lists UTXOs with satoshi values as bigint', async () => {
    const adapter = new BitcoinAdapter(
      'bitcoin',
      fakeRest({
        [`/address/${ADDR}/utxo`]: [
          { txid: 'a'.repeat(64), vout: 0, value: 90_000, status: { confirmed: true } },
          { txid: 'b'.repeat(64), vout: 1, value: 10_000, status: { confirmed: false } },
        ],
      }),
    );
    const utxos = await adapter.getUtxos(ADDR);
    expect(utxos).toHaveLength(2);
    expect(utxos[0]).toMatchObject({ value: 90_000n, confirmed: true });
    expect(utxos[1]).toMatchObject({ value: 10_000n, confirmed: false });
  });

  it('reads tip height and returns no tokens', async () => {
    const adapter = new BitcoinAdapter('bitcoin', fakeRest({ '/blocks/tip/height': 870_000 }));
    expect(await adapter.getBlockHeight()).toBe(870_000n);
    expect(await adapter.getTokenBalances(ADDR, [{ address: 'x' }])).toEqual([]);
  });

  it('estimates sat/vByte per speed from the fee estimator', async () => {
    const adapter = new BitcoinAdapter(
      'bitcoin',
      fakeRest({
        '/fee-estimates': { '1': 42.3, '3': 18.0, '6': 9.5 },
      }),
    );
    expect(await adapter.estimateFees('fast')).toEqual({ kind: 'btc', satPerVByte: 43 });
    expect(await adapter.estimateFees('normal')).toEqual({ kind: 'btc', satPerVByte: 18 });
    expect(await adapter.estimateFees('slow')).toEqual({ kind: 'btc', satPerVByte: 10 });
  });

  it('broadcasts a raw tx and returns the txid', async () => {
    const txid = 'c'.repeat(64);
    const adapter = new BitcoinAdapter(
      'bitcoin',
      fakeRest({}, (path, body) => {
        expect(path).toBe('/tx');
        expect(body).toBe('deadbeef');
        return txid;
      }),
    );
    expect(await adapter.broadcastRawTransaction('deadbeef')).toEqual({ txid });
  });

  it('rejects a broadcast that does not return a txid', async () => {
    const adapter = new BitcoinAdapter(
      'bitcoin',
      fakeRest({}, () => 'error: bad tx'),
    );
    await expect(adapter.broadcastRawTransaction('deadbeef')).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_RESPONSE' }),
    );
  });

  it('tracks confirmations from tip minus inclusion height', async () => {
    const txid = 'd'.repeat(64);
    const confirmed = new BitcoinAdapter(
      'bitcoin',
      fakeRest({
        [`/tx/${txid}/status`]: { confirmed: true, block_height: 869_990 },
        '/blocks/tip/height': 870_000,
      }),
    );
    expect(await confirmed.getTransactionStatus(txid)).toMatchObject({ state: 'confirmed', confirmations: 11 });

    const pending = new BitcoinAdapter('bitcoin', fakeRest({ [`/tx/${txid}/status`]: { confirmed: false } }));
    expect(await pending.getTransactionStatus(txid)).toMatchObject({ state: 'pending', confirmations: 0 });
  });

  it('validates bech32 and legacy addresses per network', () => {
    const mainnet = new BitcoinAdapter('bitcoin', fakeRest({}));
    expect(mainnet.validateAddress(ADDR)).toBe(true); // bech32
    expect(mainnet.validateAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true); // legacy P2PKH
    expect(mainnet.validateAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(false);

    const testnet = new BitcoinAdapter('bitcoin-testnet', fakeRest({}));
    expect(testnet.validateAddress(ADDR)).toBe(false); // mainnet bech32 on testnet adapter
  });

  it('rejects construction on a non-Bitcoin chain', () => {
    expect(() => new BitcoinAdapter('ethereum', fakeRest({}))).toThrow();
  });
});
