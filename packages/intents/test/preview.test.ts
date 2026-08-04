import { describe, expect, it } from 'vitest';
import { previewBalanceChanges, type AssetMovement } from '../src/preview.js';

const me = '0xME';
const pool = '0xPOOL';
const alice = '0xALICE';

describe('pre-sign balance preview', () => {
  it('nets a swap into one outflow + one inflow, outflow first', () => {
    const moves: AssetMovement[] = [
      { asset: 'USDC', from: me, to: pool, amountBase: 100_000000n }, // -100 USDC
      { asset: 'ETH', from: pool, to: me, amountBase: 6_900_000_000_000_000n }, // +0.0069 ETH
    ];
    expect(previewBalanceChanges(me, moves)).toEqual([
      { asset: 'USDC', deltaBase: -100_000000n },
      { asset: 'ETH', deltaBase: 6_900_000_000_000_000n },
    ]);
  });

  it('shows only the assets that actually affect the owner', () => {
    const moves: AssetMovement[] = [
      { asset: 'USDC', from: me, to: alice, amountBase: 5_000000n }, // -5 USDC (me)
      { asset: 'DAI', from: pool, to: alice, amountBase: 9n }, // never touches me → not shown
    ];
    expect(previewBalanceChanges(me, moves)).toEqual([{ asset: 'USDC', deltaBase: -5_000000n }]);
  });

  it('nets multi-hop movements of one asset and drops a zero self-transfer', () => {
    const moves: AssetMovement[] = [
      { asset: 'ETH', from: me, to: pool, amountBase: 10n },
      { asset: 'ETH', from: pool, to: me, amountBase: 4n }, // net -6 ETH
      { asset: 'USDC', from: me, to: me, amountBase: 100n }, // self-transfer → 0, dropped
    ];
    expect(previewBalanceChanges(me, moves)).toEqual([{ asset: 'ETH', deltaBase: -6n }]);
  });

  it('matches owner and addresses case-insensitively', () => {
    const moves: AssetMovement[] = [{ asset: 'USDC', from: '0xAbC', to: '0xdef', amountBase: 7n }];
    expect(previewBalanceChanges('0xABC', moves)).toEqual([{ asset: 'USDC', deltaBase: -7n }]);
  });
});
