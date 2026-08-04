/**
 * Uniswap v3 calldata — real on-chain quotes and swaps (Sepolia). QuoterV2 gives
 * a REAL price via eth_call (no signature); SwapRouter02.exactInputSingle does the
 * swap the device signs. Pure ABI encoding over the well-known selectors — the
 * struct params are static tuples, so each field is one inline 32-byte word.
 */
import { encodeAddressParam, encodeUint256 } from './abi.js';

/** Uniswap v3 deployment on Sepolia (chainId 11155111). */
export const SEPOLIA_UNISWAP = {
  quoterV2: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
  swapRouter02: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
} as const;

/** The v3 fee tiers, in the order we try them for the best quote. */
export const V3_FEE_TIERS = [500, 3000, 10000] as const;

// keccak256(sig)[:4] — precomputed (see the selector derivation in the DEX commit).
const SEL = {
  quoteExactInputSingle: 'c6a5026a', // quoteExactInputSingle((address,address,uint256,uint24,uint160))
  exactInputSingle: '04e45aaf', // exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))
  approve: '095ea7b3', // approve(address,uint256)
} as const;

/** QuoterV2.quoteExactInputSingle calldata — call via eth_call; first return word is amountOut. */
export function encodeQuoteExactInputSingle(args: {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  fee: number;
}): string {
  return (
    `0x${SEL.quoteExactInputSingle}` +
    encodeAddressParam(args.tokenIn) +
    encodeAddressParam(args.tokenOut) +
    encodeUint256(args.amountIn) +
    encodeUint256(BigInt(args.fee)) +
    encodeUint256(0n) // sqrtPriceLimitX96 = 0 (no limit)
  );
}

/** The amountOut from a QuoterV2 return (first 32-byte word). */
export function decodeQuotedAmountOut(returnData: string): bigint {
  const bare = returnData.startsWith('0x') ? returnData.slice(2) : returnData;
  if (bare.length < 64) return 0n;
  return BigInt(`0x${bare.slice(0, 64)}`);
}

/** SwapRouter02.exactInputSingle calldata (recipient receives tokenOut). */
export function encodeExactInputSingle(args: {
  tokenIn: string;
  tokenOut: string;
  fee: number;
  recipient: string;
  amountIn: bigint;
  amountOutMinimum: bigint;
}): string {
  return (
    `0x${SEL.exactInputSingle}` +
    encodeAddressParam(args.tokenIn) +
    encodeAddressParam(args.tokenOut) +
    encodeUint256(BigInt(args.fee)) +
    encodeAddressParam(args.recipient) +
    encodeUint256(args.amountIn) +
    encodeUint256(args.amountOutMinimum) +
    encodeUint256(0n) // sqrtPriceLimitX96 = 0
  );
}

/** ERC-20 approve(spender, amount) calldata — needed before an ERC-20 → * swap. */
export function encodeErc20Approve(spender: string, amount: bigint): string {
  return `0x${SEL.approve}${encodeAddressParam(spender)}${encodeUint256(amount)}`;
}
