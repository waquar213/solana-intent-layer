/**
 * EIP-712 typed structured data hashing and signing. Needed for permits,
 * dApp logins, and signed intents. Implemented from the spec (not pulled from a
 * framework) to keep core minimal-dep; the digest is cross-checked against
 * viem's `hashTypedData` on the canonical "Mail" example in the tests.
 *
 * digest = keccak256( 0x19 0x01 ‖ domainSeparator ‖ hashStruct(primaryType, message) )
 * Spec: https://eips.ethereum.org/EIPS/eip-712
 */
import { keccak_256 } from '@noble/hashes/sha3';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import { WalletError } from '../errors.js';
import { hexToBytes } from '../bytes.js';
import { signEvmDigest } from '../accounts/evm.js';

export interface TypedDataField {
  name: string;
  type: string;
}
export type TypedDataTypes = Record<string, TypedDataField[]>;

export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

export interface TypedData {
  types: TypedDataTypes;
  primaryType: string;
  domain: TypedDataDomain;
  message: Record<string, unknown>;
}

/** Recursively collects struct type names referenced by `primaryType`. */
function findDependencies(primaryType: string, types: TypedDataTypes, found = new Set<string>()): Set<string> {
  if (found.has(primaryType) || !types[primaryType]) return found;
  found.add(primaryType);
  for (const field of types[primaryType]) {
    const base = field.type.replace(/\[\d*\]$/u, '');
    if (types[base]) findDependencies(base, types, found);
  }
  return found;
}

export function encodeType(primaryType: string, types: TypedDataTypes): string {
  const deps = [...findDependencies(primaryType, types)].filter((t) => t !== primaryType).sort();
  return [primaryType, ...deps]
    .map((type) => `${type}(${(types[type] ?? []).map((f) => `${f.type} ${f.name}`).join(',')})`)
    .join('');
}

function typeHash(primaryType: string, types: TypedDataTypes): Uint8Array {
  return keccak_256(utf8ToBytes(encodeType(primaryType, types)));
}

/** Encodes a uint/int value to a 32-byte big-endian word (two's complement for negatives). */
function encodeNumber(value: unknown): Uint8Array {
  let n = typeof value === 'bigint' ? value : BigInt(value as string | number);
  if (n < 0n) n = (1n << 256n) + n; // two's complement
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0 && n > 0n; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function leftPad32(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 32) throw new WalletError('INVALID_INPUT', 'value exceeds 32 bytes');
  const out = new Uint8Array(32);
  out.set(bytes, 32 - bytes.length);
  return out;
}
function rightPad32(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 32) throw new WalletError('INVALID_INPUT', 'bytesN exceeds 32 bytes');
  const out = new Uint8Array(32);
  out.set(bytes, 0);
  return out;
}

function encodeField(type: string, value: unknown, types: TypedDataTypes): Uint8Array {
  // Arrays: keccak256 of the concatenated encoded elements.
  const arrayMatch = type.match(/^(.*)\[(\d*)\]$/u);
  if (arrayMatch) {
    const baseType = arrayMatch[1] as string;
    const arr = value as unknown[];
    return keccak_256(concatBytes(...arr.map((el) => encodeField(baseType, el, types))));
  }
  if (types[type]) {
    // Nested struct → hashStruct.
    return hashStruct(type, value as Record<string, unknown>, types);
  }
  if (type === 'string') return keccak_256(utf8ToBytes(String(value)));
  if (type === 'bytes') return keccak_256(hexToBytes(strip0x(String(value))));
  if (type === 'bool') return leftPad32(Uint8Array.of(value ? 1 : 0));
  if (type === 'address') return leftPad32(hexToBytes(strip0x(String(value))));
  if (/^bytes(\d+)$/u.test(type)) return rightPad32(hexToBytes(strip0x(String(value))));
  if (/^u?int(\d*)$/u.test(type)) return encodeNumber(value);
  throw new WalletError('INVALID_INPUT', `unsupported EIP-712 field type: ${type}`);
}

function hashStruct(primaryType: string, data: Record<string, unknown>, types: TypedDataTypes): Uint8Array {
  const fields = types[primaryType];
  if (!fields) throw new WalletError('INVALID_INPUT', `unknown EIP-712 type: ${primaryType}`);
  const encoded = fields.map((f) => encodeField(f.type, data[f.name], types));
  return keccak_256(concatBytes(typeHash(primaryType, types), ...encoded));
}

/** Builds the implicit EIP712Domain type from whichever domain fields are present. */
function domainTypes(domain: TypedDataDomain): TypedDataField[] {
  const fields: TypedDataField[] = [];
  if (domain.name !== undefined) fields.push({ name: 'name', type: 'string' });
  if (domain.version !== undefined) fields.push({ name: 'version', type: 'string' });
  if (domain.chainId !== undefined) fields.push({ name: 'chainId', type: 'uint256' });
  if (domain.verifyingContract !== undefined) fields.push({ name: 'verifyingContract', type: 'address' });
  if (domain.salt !== undefined) fields.push({ name: 'salt', type: 'bytes32' });
  return fields;
}

/** The 32-byte EIP-712 digest that gets signed. */
export function hashTypedData(typed: TypedData): Uint8Array {
  const typesWithDomain: TypedDataTypes = { ...typed.types, EIP712Domain: domainTypes(typed.domain) };
  const domainSeparator = hashStruct('EIP712Domain', typed.domain as Record<string, unknown>, typesWithDomain);
  const messageHash = hashStruct(typed.primaryType, typed.message, typed.types);
  return keccak_256(concatBytes(Uint8Array.of(0x19, 0x01), domainSeparator, messageHash));
}

/** Signs typed data. Returns a 65-byte r‖s‖v signature with v ∈ {27,28} (EIP-712 convention). */
export function signTypedData(typed: TypedData, privateKey: Uint8Array): Uint8Array {
  const sig = signEvmDigest(hashTypedData(typed), privateKey); // r‖s‖recovery(0/1)
  const out = sig.slice();
  out[64] = (out[64] as number) + 27; // typed-data/eth_sign convention uses 27/28
  return out;
}

function strip0x(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}
