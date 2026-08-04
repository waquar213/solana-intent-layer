/**
 * Calldata for the IntentExecutor contract on GIWA — the on-chain settlement target
 * for AI-planned intents. Encodes `execute(bytes32,(address,uint256)[])` and derives
 * the intentHash commitment. keccak lives here (not in the deliberately dependency-free
 * abi.ts): a real function selector and the intent commitment both require it.
 */
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { ChainError } from '../errors.js';
import { encodeAddressParam, encodeUint256 } from './abi.js';

/** execute(bytes32,(address,uint256)[]) — cross-checked against the deployed dispatcher. */
const SELECTOR_EXECUTE = '68cd9bdd';

const strip0x = (hex: string): string => (hex.startsWith('0x') ? hex.slice(2) : hex);

/** keccak256 of raw bytes, as a 0x-prefixed 32-byte hex string. */
export function keccak256Hex(data: Uint8Array): string {
  return `0x${bytesToHex(keccak_256(data))}`;
}

/** A bytes32 commitment to a canonical intent string — the on-chain audit anchor. */
export function intentHashOf(canonical: string): string {
  return keccak256Hex(utf8ToBytes(canonical));
}

export interface IntentStep {
  to: string;
  amount: bigint;
}

/**
 * ABI-encode `IntentExecutor.execute(intentHash, steps)`. Layout:
 *   selector ‖ intentHash(32) ‖ offset=0x40(32) ‖ length(32) ‖ [to(32) ‖ amount(32)]…
 * (Step is a static tuple, so the array elements are inlined after the length word.)
 */
export function encodeIntentExecute(intentHash: string, steps: readonly IntentStep[]): string {
  const hash = strip0x(intentHash).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(hash)) throw new ChainError('INVALID_RESPONSE', 'intentHash must be 32 bytes');
  if (steps.length === 0) throw new ChainError('INVALID_RESPONSE', 'intent has no steps');
  const head = hash + encodeUint256(64n); // args = [intentHash, offset→array]; offset = 2 words = 64 bytes
  let body = encodeUint256(BigInt(steps.length));
  for (const s of steps) body += encodeAddressParam(s.to) + encodeUint256(s.amount);
  return `0x${SELECTOR_EXECUTE}${head}${body}`;
}
