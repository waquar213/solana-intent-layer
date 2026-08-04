import { describe, expect, it } from 'vitest';
import type { Holding } from '@intent-wallet/runtime';
import { makeBalancesReader, type EcosystemSources } from '../src/balances.js';

const eth = (n: bigint): Holding => ({ symbol: 'ETH', decimals: 18, totalBase: n, chains: [{ chainId: 'eip155:1', base: n }] });
const btc = (n: bigint): Holding => ({ symbol: 'BTC', decimals: 8, totalBase: n, chains: [{ chainId: 'bip122:bitcoin', base: n }] });
const sol = (n: bigint): Holding => ({ symbol: 'SOL', decimals: 9, totalBase: n, chains: [{ chainId: 'solana:mainnet', base: n }] });

const PRICES = { ETH: '2000', BTC: '60000', SOL: '150' };
const prices = () => Promise.resolve<Record<string, string>>(PRICES);

function sources(over: Partial<EcosystemSources> = {}): EcosystemSources {
  return {
    evm: () => Promise.resolve([eth(10n ** 18n)]), // 1 ETH
    btc: () => Promise.resolve([btc(50_000_000n)]), // 0.5 BTC
    sol: () => Promise.resolve([sol(2n * 10n ** 9n)]), // 2 SOL
    ...over,
  };
}

describe('makeBalancesReader', () => {
  it('discovers across ecosystems, values live, and sorts by value', async () => {
    const read = makeBalancesReader(sources(), prices);
    const res = await read({ evm: '0xabc', btc: 'bc1x', sol: 'SoLx' });

    // 0.5 BTC × $60k = $30,000 ; 1 ETH × $2k = $2,000 ; 2 SOL × $150 = $300
    expect(res.holdings.map((h) => h.symbol)).toEqual(['BTC', 'ETH', 'SOL']);
    expect(res.totalValueMicros).toBe((30_000n * 1_000_000n + 2_000n * 1_000_000n + 300n * 1_000_000n).toString());
    expect(res.holdings[0]).toMatchObject({ symbol: 'BTC', amount: '0.5', priceUsd: '60000', valueMicros: '30000000000' });
    // Split by ecosystem: 0.5 BTC=$30k, 1 ETH=$2k, 2 SOL=$300.
    expect(res.byEcosystem).toEqual({ evm: '2000000000', bitcoin: '30000000000', solana: '300000000' });
  });

  it('only queries the ecosystems whose address is provided', async () => {
    const seen: string[] = [];
    const read = makeBalancesReader(
      {
        evm: () => { seen.push('evm'); return Promise.resolve([eth(10n ** 18n)]); },
        btc: () => { seen.push('btc'); return Promise.resolve([]); },
        sol: () => { seen.push('sol'); return Promise.resolve([]); },
      },
      prices,
    );
    await read({ evm: '0xabc' });
    expect(seen).toEqual(['evm']);
  });

  it('drops a failing ecosystem but returns the rest, and names it as unavailable', async () => {
    const read = makeBalancesReader(sources({ sol: () => Promise.reject(new Error('rpc down')) }), prices);
    const res = await read({ evm: '0xabc', btc: 'bc1x', sol: 'SoLx' });
    expect(res.holdings.map((h) => h.symbol).sort()).toEqual(['BTC', 'ETH']);
    expect(res.unavailable).toEqual(['Solana']); // honest: the total excludes SOL
  });

  it('reports no unavailable ecosystems when everything succeeds', async () => {
    const res = await makeBalancesReader(sources(), prices)({ evm: '0xabc', btc: 'bc1x', sol: 'SoLx' });
    expect(res.unavailable).toEqual([]);
  });

  it('fails loud when every provided source fails (never fake-empty)', async () => {
    const read = makeBalancesReader(
      { evm: () => Promise.reject(new Error('bad evm addr')), btc: () => Promise.reject(new Error('x')), sol: () => Promise.reject(new Error('x')) },
      prices,
    );
    await expect(read({ evm: '0xbad', btc: 'bad', sol: 'bad' })).rejects.toThrow(/bad evm addr/u);
  });

  it('leaves an unpriced asset null-valued and out of the total', async () => {
    const read = makeBalancesReader(
      { evm: () => Promise.resolve([{ symbol: 'FOO', decimals: 18, totalBase: 10n ** 18n, chains: [{ chainId: 'eip155:1', base: 10n ** 18n }] }]), btc: () => Promise.resolve([]), sol: () => Promise.resolve([]) },
      prices,
    );
    const res = await read({ evm: '0xabc' });
    expect(res.holdings[0]).toMatchObject({ symbol: 'FOO', priceUsd: null, valueMicros: null });
    expect(res.totalValueMicros).toBe('0');
  });
});
