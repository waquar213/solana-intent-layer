import { describe, expect, it } from 'vitest';
import {
  encodeErc20Approve,
  encodeExactInputSingle,
  encodeQuoteExactInputSingle,
  decodeQuotedAmountOut,
  SEPOLIA_UNISWAP,
} from '../src/index.js';

const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const w = (hex: string): string => hex.toLowerCase().replace(/^0x/, '').padStart(64, '0');

describe('uniswap v3 calldata', () => {
  it('encodes quoteExactInputSingle byte-exactly (the on-chain-proven quote)', () => {
    // This exact calldata returned a real amountOut from Sepolia QuoterV2.
    const data = encodeQuoteExactInputSingle({ tokenIn: WETH, tokenOut: USDC, amountIn: 10n ** 18n, fee: 3000 });
    expect(data).toBe(`0xc6a5026a${w(WETH)}${w(USDC)}${w('de0b6b3a7640000')}${w('bb8')}${'0'.repeat(64)}`);
  });

  it('decodes the amountOut from a quoter return', () => {
    const v = 14_192_414_623n; // the real WETH→USDC quote observed on Sepolia
    expect(decodeQuotedAmountOut(`0x${v.toString(16).padStart(64, '0')}`)).toBe(v);
    expect(decodeQuotedAmountOut('0x')).toBe(0n);
  });

  it('encodes exactInputSingle with 7 inline words + selector', () => {
    const data = encodeExactInputSingle({
      tokenIn: USDC,
      tokenOut: WETH,
      fee: 500,
      recipient: WETH,
      amountIn: 100_000_000n,
      amountOutMinimum: 1n,
    });
    expect(data.startsWith('0x04e45aaf')).toBe(true);
    expect(data.length).toBe(2 + 8 + 64 * 7);
  });

  it('encodes approve(spender, amount)', () => {
    const data = encodeErc20Approve(SEPOLIA_UNISWAP.swapRouter02, 100_000_000n);
    expect(data).toBe(`0x095ea7b3${w(SEPOLIA_UNISWAP.swapRouter02)}${w('5f5e100')}`);
  });
});
