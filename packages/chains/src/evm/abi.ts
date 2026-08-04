/**
 * Minimal ABI encode/decode for the read-only ERC-20 calls we need
 * (balanceOf, decimals, symbol). Selectors are the well-known constants, so we
 * need no keccak here and no dependency. Pure hex-string arithmetic keeps this
 * auditable and dependency-free.
 */
import { ChainError } from '../errors.js';

// keccak256(signature)[:4] — fixed, public ERC-20 selectors.
export const SELECTOR = {
  balanceOf: '70a08231', // balanceOf(address)
  decimals: '313ce567', // decimals()
  symbol: '95d89b41', // symbol()
  transfer: 'a9059cbb', // transfer(address,uint256)
} as const;

function strip0x(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/** Left-pads a 20-byte hex address into a 32-byte ABI word. */
export function encodeAddressParam(address: string): string {
  const bare = strip0x(address).toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(bare)) {
    throw new ChainError('INVALID_RESPONSE', 'cannot ABI-encode a malformed address');
  }
  return bare.padStart(64, '0');
}

export function encodeBalanceOf(address: string): string {
  return `0x${SELECTOR.balanceOf}${encodeAddressParam(address)}`;
}

/** Right-justifies a non-negative bigint into a 32-byte ABI word. */
export function encodeUint256(value: bigint): string {
  if (value < 0n) throw new ChainError('INVALID_RESPONSE', 'cannot ABI-encode a negative uint256');
  const hex = value.toString(16);
  if (hex.length > 64) throw new ChainError('INVALID_RESPONSE', 'uint256 overflow');
  return hex.padStart(64, '0');
}

/** Encodes an ERC-20 `transfer(to, amount)` call as 0x-hex calldata. */
export function encodeErc20Transfer(to: string, amount: bigint): string {
  return `0x${SELECTOR.transfer}${encodeAddressParam(to)}${encodeUint256(amount)}`;
}

export const CALL_DECIMALS = `0x${SELECTOR.decimals}`;
export const CALL_SYMBOL = `0x${SELECTOR.symbol}`;

/** Decodes a 32-byte (or shorter) hex return value as an unsigned integer. */
export function decodeUint(hex: string): bigint {
  const bare = strip0x(hex);
  if (bare.length === 0) return 0n;
  if (!/^[0-9a-f]+$/iu.test(bare)) throw new ChainError('INVALID_RESPONSE', 'non-hex uint result');
  return BigInt(`0x${bare}`);
}

/** decimals() returns a uint8; clamp defensively to a sane range. */
export function decodeDecimals(hex: string): number {
  const value = decodeUint(hex);
  if (value > 36n) throw new ChainError('INVALID_RESPONSE', `implausible token decimals: ${value}`);
  return Number(value);
}

/**
 * Decodes symbol()/name() results, handling BOTH shapes tokens use in the wild:
 * a modern ABI dynamic string (offset‖length‖data) and legacy `bytes32` packed
 * strings (e.g. MKR). Returns a trimmed ASCII/UTF-8 string.
 */
export function decodeString(hex: string): string {
  const bare = strip0x(hex);
  if (bare.length === 0) return '';
  // Dynamic string: first word = offset (usually 0x20), then length, then data.
  if (bare.length >= 128) {
    const offset = Number(decodeUint(bare.slice(0, 64)));
    if (offset * 2 + 64 <= bare.length) {
      const length = Number(decodeUint(bare.slice(offset * 2, offset * 2 + 64)));
      const dataStart = offset * 2 + 64;
      const data = bare.slice(dataStart, dataStart + length * 2);
      if (data.length === length * 2) return hexToUtf8(data);
    }
  }
  // Legacy bytes32: strip trailing zero padding.
  return hexToUtf8(bare.replace(/(00)+$/u, ''));
}

function hexToUtf8(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes).replace(/\0+$/u, '').trim();
}
