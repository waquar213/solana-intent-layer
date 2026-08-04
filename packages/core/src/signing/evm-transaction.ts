/**
 * EIP-1559 (type-0x02) EVM transaction signing.
 *
 * Produces the exact bytes a node accepts via `eth_sendRawTransaction`. The
 * unsigned payload is `0x02 || rlp([chainId, nonce, maxPriorityFeePerGas,
 * maxFeePerGas, gasLimit, to, value, data, accessList])`; we keccak256 it, sign
 * with secp256k1 (low-s, RFC 6979), then append `[yParity, r, s]` and re-RLP.
 *
 * All numeric fields are `bigint` base units — there are no floats anywhere in
 * the money path (handbook 01 §3). Correctness is cross-checked against viem's
 * `serializeTransaction` in the tests.
 */
import { keccak_256 } from '@noble/hashes/sha3';
import { concatBytes } from '@noble/hashes/utils';
import { WalletError } from '../errors.js';
import { hexToBytes } from '../bytes.js';
import { isChecksumAddress, signEvmDigest } from '../accounts/evm.js';
import { bigintToMinimalBytes, rlpEncode, type RlpInput } from './rlp.js';

/** An EIP-2930 access-list entry. */
export interface AccessListEntry {
  address: string;
  storageKeys: string[];
}

export interface Eip1559Transaction {
  chainId: number;
  nonce: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit: bigint;
  /** Recipient (0x…20 bytes) or null for contract creation. */
  to: string | null;
  value: bigint;
  /** Calldata as 0x-hex (default 0x). */
  data?: string;
  accessList?: AccessListEntry[];
}

const EIP1559_TYPE = 0x02;

function addressBytes(address: string): Uint8Array {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(address)) {
    throw new WalletError('INVALID_INPUT', 'transaction address must be 20-byte 0x-hex');
  }
  // Accept lowercase or valid EIP-55; reject a wrong checksum (silent-corruption guard).
  if (/[A-F]/u.test(address.slice(2)) && !isChecksumAddress(address)) {
    throw new WalletError('INVALID_INPUT', 'transaction address has an invalid EIP-55 checksum');
  }
  return hexToBytes(address.slice(2));
}

function dataBytes(data: string | undefined): Uint8Array {
  if (data === undefined || data === '0x' || data === '') return new Uint8Array(0);
  if (!/^0x([0-9a-fA-F]{2})*$/u.test(data)) {
    throw new WalletError('INVALID_INPUT', 'transaction data must be 0x-prefixed even-length hex');
  }
  return hexToBytes(data.slice(2));
}

function encodeAccessList(accessList: AccessListEntry[] | undefined): RlpInput {
  if (!accessList || accessList.length === 0) return [];
  return accessList.map((entry) => [
    addressBytes(entry.address),
    entry.storageKeys.map((key) => {
      if (!/^0x[0-9a-fA-F]{64}$/u.test(key)) {
        throw new WalletError('INVALID_INPUT', 'access-list storage key must be a 32-byte 0x-hex slot');
      }
      return hexToBytes(key.slice(2));
    }),
  ]);
}

function assertField(name: string, value: bigint): void {
  if (value < 0n) throw new WalletError('INVALID_INPUT', `${name} must be non-negative`);
}

/** RLP-encodes the nine EIP-1559 fields (the shared prefix of signed/unsigned). */
function encodeFields(tx: Eip1559Transaction): RlpInput {
  if (!Number.isInteger(tx.chainId) || tx.chainId <= 0) {
    throw new WalletError('INVALID_INPUT', 'chainId must be a positive integer');
  }
  for (const [name, v] of [
    ['nonce', tx.nonce],
    ['maxPriorityFeePerGas', tx.maxPriorityFeePerGas],
    ['maxFeePerGas', tx.maxFeePerGas],
    ['gasLimit', tx.gasLimit],
    ['value', tx.value],
  ] as const) {
    assertField(name, v);
  }
  if (tx.maxPriorityFeePerGas > tx.maxFeePerGas) {
    throw new WalletError('INVALID_INPUT', 'maxPriorityFeePerGas cannot exceed maxFeePerGas');
  }
  return [
    bigintToMinimalBytes(BigInt(tx.chainId)),
    bigintToMinimalBytes(tx.nonce),
    bigintToMinimalBytes(tx.maxPriorityFeePerGas),
    bigintToMinimalBytes(tx.maxFeePerGas),
    bigintToMinimalBytes(tx.gasLimit),
    tx.to === null ? new Uint8Array(0) : addressBytes(tx.to),
    bigintToMinimalBytes(tx.value),
    dataBytes(tx.data),
    encodeAccessList(tx.accessList),
  ];
}

/** The unsigned signing payload (`0x02 || rlp(fields)`) and its keccak256 digest. */
export function eip1559UnsignedPayload(tx: Eip1559Transaction): { payload: Uint8Array; digest: Uint8Array } {
  const payload = concatBytes(Uint8Array.of(EIP1559_TYPE), rlpEncode(encodeFields(tx)));
  return { payload, digest: keccak_256(payload) };
}

export interface SignedEvmTransaction {
  /** `0x`-prefixed raw transaction ready for eth_sendRawTransaction. */
  raw: string;
  /** keccak256 of the raw signed tx — the transaction hash. */
  hash: string;
}

/**
 * Signs an EIP-1559 transaction with a 32-byte private key. Returns the raw
 * broadcastable tx and its hash. The caller must zeroize `privateKey`.
 */
export function signEip1559Transaction(tx: Eip1559Transaction, privateKey: Uint8Array): SignedEvmTransaction {
  const { digest } = eip1559UnsignedPayload(tx);
  const signature = signEvmDigest(digest, privateKey); // r(32)||s(32)||recovery(1), low-s
  const r = signature.subarray(0, 32);
  const s = signature.subarray(32, 64);
  const yParity = signature[64] as number; // 0 or 1

  const signedFields: RlpInput = [
    ...(encodeFields(tx) as RlpInput[]),
    bigintToMinimalBytes(BigInt(yParity)),
    stripLeadingZeros(r),
    stripLeadingZeros(s),
  ];
  const raw = concatBytes(Uint8Array.of(EIP1559_TYPE), rlpEncode(signedFields));
  return { raw: toHex(raw), hash: toHex(keccak_256(raw)) };
}

/** r and s are quantities in RLP — leading zero bytes must be stripped. */
function stripLeadingZeros(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.subarray(i);
}

function toHex(bytes: Uint8Array): string {
  let hex = '0x';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
