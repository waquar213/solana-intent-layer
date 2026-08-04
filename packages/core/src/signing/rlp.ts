/**
 * Minimal RLP (Recursive Length Prefix) encoding — the serialization Ethereum
 * uses for transactions. Implemented in-repo (not pulled from ethers/viem) to
 * keep the crown-jewel package on its minimal, audited dependency set
 * (ADR-0003). Correctness is pinned by cross-checking signed transactions
 * against viem in the test suite.
 *
 * Spec: https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/
 */
import { concatBytes } from '@noble/hashes/utils';
import { WalletError } from '../errors.js';

export type RlpInput = Uint8Array | RlpInput[];

/** Encodes a byte string or (nested) list per RLP. */
export function rlpEncode(input: RlpInput): Uint8Array {
  if (input instanceof Uint8Array) {
    // Single byte < 0x80 encodes as itself; otherwise length-prefixed string.
    if (input.length === 1 && (input[0] as number) < 0x80) return input;
    return concatBytes(encodeLength(input.length, 0x80), input);
  }
  const items = input.map(rlpEncode);
  const body = items.length === 0 ? new Uint8Array(0) : concatBytes(...items);
  return concatBytes(encodeLength(body.length, 0xc0), body);
}

function encodeLength(length: number, offset: number): Uint8Array {
  if (length < 56) return Uint8Array.of(offset + length);
  const lengthBytes = toMinimalBytes(length);
  return concatBytes(Uint8Array.of(offset + 55 + lengthBytes.length), lengthBytes);
}

/** Big-endian minimal-length encoding of a non-negative integer. */
function toMinimalBytes(value: number): Uint8Array {
  if (value < 0 || !Number.isSafeInteger(value)) {
    throw new WalletError('INVALID_INPUT', 'RLP length must be a safe non-negative integer');
  }
  const out: number[] = [];
  let n = value;
  while (n > 0) {
    out.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return Uint8Array.from(out);
}

/**
 * Encodes a bigint as a minimal big-endian byte string, per Ethereum's
 * quantity encoding: zero is the EMPTY string (not a zero byte), and there are
 * never leading zero bytes. Used for tx numeric fields (nonce, value, gas…).
 */
export function bigintToMinimalBytes(value: bigint): Uint8Array {
  if (value < 0n) throw new WalletError('INVALID_INPUT', 'cannot RLP-encode a negative quantity');
  if (value === 0n) return new Uint8Array(0);
  let hex = value.toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
