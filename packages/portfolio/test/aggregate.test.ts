import { describe, expect, it } from 'vitest';
import { aggregatePortfolio } from '../src/aggregate.js';
import { formatUsd } from '../src/money.js';
import type { PortfolioBalance, PriceInfo } from '../src/types.js';

const prices: Record<string, PriceInfo> = {
  ETH: { usd: '2100.55' },
  BTC: { usd: '98000' },
  USDC: { usd: '1' },
};

describe('aggregatePortfolio', () => {
  it('merges the same asset across chains into one line with per-chain provenance', () => {
    const balances: PortfolioBalance[] = [
      { chainId: 'ethereum', symbol: 'ETH', amount: 400_000_000_000_000_000n, decimals: 18, tokenAddress: null },
      { chainId: 'base', symbol: 'ETH', amount: 212_000_000_000_000_000n, decimals: 18, tokenAddress: null },
    ];
    const pf = aggregatePortfolio(balances, { prices });
    expect(pf.assets).toHaveLength(1);
    const eth = pf.assets[0]!;
    expect(eth.symbol).toBe('ETH');
    expect(eth.amount).toBe(612_000_000_000_000_000n); // summed
    expect(eth.chains).toHaveLength(2);
    expect(eth.chains.map((c) => c.chainId).sort()).toEqual(['base', 'ethereum']);
  });

  it('computes a correct total value and sorts assets by value desc', () => {
    const balances: PortfolioBalance[] = [
      { chainId: 'ethereum', symbol: 'ETH', amount: 1_000_000_000_000_000_000n, decimals: 18, tokenAddress: null }, // $2100.55
      { chainId: 'bitcoin', symbol: 'BTC', amount: 5_000_000n, decimals: 8, tokenAddress: null }, // 0.05 BTC = $4900
      {
        chainId: 'ethereum',
        symbol: 'USDC',
        amount: 761_230_000n,
        decimals: 6,
        tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      }, // $761.23
    ];
    const pf = aggregatePortfolio(balances, { prices });
    expect(pf.assets.map((a) => a.symbol)).toEqual(['BTC', 'ETH', 'USDC']); // 4900 > 2100 > 761
    expect(formatUsd(pf.totalValueMicros)).toBe('$7,761.78');
  });

  it('separates dust (value < $1) from the headline list', () => {
    const balances: PortfolioBalance[] = [
      { chainId: 'ethereum', symbol: 'ETH', amount: 1_000_000_000_000_000_000n, decimals: 18, tokenAddress: null },
      { chainId: 'ethereum', symbol: 'USDC', amount: 500_000n, decimals: 6, tokenAddress: '0xusdc' }, // $0.50 = dust
    ];
    const pf = aggregatePortfolio(balances, { prices });
    expect(pf.assets.map((a) => a.symbol)).toEqual(['ETH']);
    expect(pf.dust.map((a) => a.symbol)).toEqual(['USDC']);
    expect(pf.dust[0]?.isDust).toBe(true);
  });

  it('handles unpriced assets (value 0, still listed as dust)', () => {
    const balances: PortfolioBalance[] = [
      { chainId: 'ethereum', symbol: 'MYSTERY', amount: 10n ** 18n, decimals: 18, tokenAddress: '0xabc' },
    ];
    const pf = aggregatePortfolio(balances, { prices });
    expect(pf.assets).toHaveLength(0);
    expect(pf.dust[0]).toMatchObject({ symbol: 'MYSTERY', valueMicros: 0n, priceUsd: null });
  });

  it('propagates staleness from prices', () => {
    const balances: PortfolioBalance[] = [
      { chainId: 'ethereum', symbol: 'ETH', amount: 10n ** 18n, decimals: 18, tokenAddress: null },
    ];
    const pf = aggregatePortfolio(balances, { prices: { ETH: { usd: '2100.55', stale: true } } });
    expect(pf.stale).toBe(true);
    expect(pf.assets[0]?.stale).toBe(true);
  });

  it('merges assets with differing decimals by normalizing up (no float error)', () => {
    // Same symbol reported with 6 and 8 decimals — normalized to 8.
    const balances: PortfolioBalance[] = [
      { chainId: 'a', symbol: 'X', amount: 1_000_000n, decimals: 6, tokenAddress: '0x1' }, // 1.0
      { chainId: 'b', symbol: 'X', amount: 50_000_000n, decimals: 8, tokenAddress: '0x2' }, // 0.5
    ];
    const pf = aggregatePortfolio(balances, { prices: { X: { usd: '10' } } });
    const x = pf.assets[0] ?? pf.dust[0]!;
    expect(x.decimals).toBe(8);
    expect(x.amount).toBe(150_000_000n); // 1.0 + 0.5 at 8 decimals
  });

  it('drops negative and zero positions defensively', () => {
    const balances: PortfolioBalance[] = [
      { chainId: 'a', symbol: 'ETH', amount: -5n, decimals: 18, tokenAddress: null },
      { chainId: 'b', symbol: 'BTC', amount: 0n, decimals: 8, tokenAddress: null },
    ];
    const pf = aggregatePortfolio(balances, { prices });
    expect(pf.assets).toHaveLength(0);
    expect(pf.dust).toHaveLength(0);
  });

  it('empty input yields an empty portfolio', () => {
    const pf = aggregatePortfolio([]);
    expect(pf).toMatchObject({ totalValueMicros: 0n, assets: [], dust: [], stale: false });
  });
});
