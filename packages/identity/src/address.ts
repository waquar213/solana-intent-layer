/**
 * Cross-ecosystem address management. One place validates, detects, and
 * normalizes addresses across Bitcoin, EVM, and Solana — so every other module
 * (send, contacts, intents) asks THIS, never re-implements chain-specific
 * checks. Getting an address wrong is a fund-loss bug, so validation is strict:
 * a mixed-case EVM address must pass its EIP-55 checksum (silent-corruption
 * guard), bech32/base58check checksums must verify, Solana must be 32 bytes.
 */
import { sha256 } from '@noble/hashes/sha256';
import { base58, base58check as base58checkFactory, bech32, bech32m } from '@scure/base';
import { isChecksumAddress, toChecksumAddress } from '@intent-wallet/core';
import { IdentityError } from './errors.js';

export type Ecosystem = 'evm' | 'btc' | 'sol';
export type Network = 'mainnet' | 'testnet';

export interface AddressInfo {
  ecosystem: Ecosystem;
  /** Canonical form (EIP-55 for EVM; lowercase bech32; unchanged base58). */
  normalized: string;
  network: Network;
}

const base58check = base58checkFactory(sha256);
const EVM_RE = /^0x[0-9a-fA-F]{40}$/u;

/** Attempts to fully classify + validate an address, returning null if it is not valid on any ecosystem. */
export function classifyAddress(address: string): AddressInfo | null {
  const trimmed = address.trim();

  if (EVM_RE.test(trimmed)) {
    // Lowercase/uppercase-only are accepted; any mixed case must be valid EIP-55.
    const hasMixedCase = /[a-f]/u.test(trimmed.slice(2)) && /[A-F]/u.test(trimmed.slice(2));
    if (hasMixedCase && !isChecksumAddress(trimmed)) return null;
    return { ecosystem: 'evm', normalized: toChecksumAddress(trimmed), network: 'mainnet' };
  }

  const btc = classifyBitcoin(trimmed);
  if (btc) return btc;

  const sol = classifySolana(trimmed);
  if (sol) return sol;

  return null;
}

function classifyBitcoin(address: string): AddressInfo | null {
  // Native SegWit / Taproot (bech32 / bech32m).
  const lower = address.toLowerCase();
  const hrp = lower.startsWith('bc1') ? 'bc' : lower.startsWith('tb1') ? 'tb' : null;
  if (hrp) {
    const network: Network = hrp === 'bc' ? 'mainnet' : 'testnet';
    // v0 (P2WPKH/P2WSH) uses bech32; v1+ (Taproot) uses bech32m.
    for (const codec of [bech32, bech32m]) {
      try {
        const decoded = codec.decode(lower as `${string}1${string}`);
        if (decoded.prefix === hrp && decoded.words.length > 0) {
          return { ecosystem: 'btc', normalized: lower, network };
        }
      } catch {
        /* try the other codec */
      }
    }
    return null;
  }
  // Legacy base58check (P2PKH/P2SH) — valid send targets even though we receive on bech32.
  try {
    const payload = base58check.decode(address);
    if (payload.length === 21) {
      const version = payload[0] as number;
      // mainnet: 0x00 (P2PKH) / 0x05 (P2SH); testnet: 0x6f / 0xc4
      if (version === 0x00 || version === 0x05) return { ecosystem: 'btc', normalized: address, network: 'mainnet' };
      if (version === 0x6f || version === 0xc4) return { ecosystem: 'btc', normalized: address, network: 'testnet' };
    }
  } catch {
    /* not base58check */
  }
  return null;
}

function classifySolana(address: string): AddressInfo | null {
  try {
    const decoded = base58.decode(address);
    // A Solana address is a 32-byte ed25519 public key (or program-derived key).
    if (decoded.length === 32) return { ecosystem: 'sol', normalized: address, network: 'mainnet' };
  } catch {
    /* not base58 */
  }
  return null;
}

/** True iff `address` is valid on `ecosystem` (or on any ecosystem when unspecified). */
export function isValidAddress(address: string, ecosystem?: Ecosystem): boolean {
  const info = classifyAddress(address);
  return info !== null && (ecosystem === undefined || info.ecosystem === ecosystem);
}

/** Validates and returns canonical info, or throws INVALID_ADDRESS. */
export function requireAddress(address: string, ecosystem?: Ecosystem): AddressInfo {
  const info = classifyAddress(address);
  if (!info) throw new IdentityError('INVALID_ADDRESS', 'not a recognizable blockchain address');
  if (ecosystem && info.ecosystem !== ecosystem) {
    throw new IdentityError('INVALID_ADDRESS', `expected a ${ecosystem} address but got a ${info.ecosystem} one`);
  }
  return info;
}

/** Case-insensitive equality on the canonical forms (EVM checksum-insensitive). */
export function addressesEqual(a: string, b: string): boolean {
  const ia = classifyAddress(a);
  const ib = classifyAddress(b);
  if (!ia || !ib || ia.ecosystem !== ib.ecosystem) return false;
  if (ia.ecosystem === 'evm') return ia.normalized.toLowerCase() === ib.normalized.toLowerCase();
  return ia.normalized === ib.normalized;
}
