/**
 * The Universal Identity model — the product's core abstraction that makes
 * chains invisible. One master identity (derived from one mnemonic) exposes
 * exactly three RECEIVE identities: Bitcoin, Solana, and a single Universal EVM
 * address that works on every supported EVM network.
 *
 * Identity ↔ account mapping: an identity IS an account index of the HD wallet.
 * Because derivation is deterministic, the SAME identity appears on every
 * device that imports the mnemonic — "multi-device" needs no server sync of the
 * identity itself (only preferences/contacts sync, and those are optional).
 * Internally many blockchain accounts exist (one per chain, all EVM chains
 * sharing the one EVM address); externally the user sees one identity.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes, type UniversalAccount } from '@intent-wallet/core';
import type { Ecosystem, Network } from './address.js';

export interface ReceiveAddress {
  ecosystem: Ecosystem;
  address: string;
  network: Network;
  derivationPath: string;
  /** Networks this receive address covers — one entry for BTC/SOL, all EVM chains for EVM. */
  worksOn: string;
}

export interface IdentityMetadata {
  label: string;
  /** ISO-8601; supplied by the caller (core does no clock access). */
  createdAt?: string;
}

export interface UniversalIdentity {
  /** Stable, opaque id derived from the address triple (same across devices). */
  id: string;
  accountIndex: number;
  addresses: {
    btc: ReceiveAddress;
    evm: ReceiveAddress;
    sol: ReceiveAddress;
  };
  metadata: IdentityMetadata;
}

/** Deterministic identity id: short hash of the three addresses (device-independent). */
export function computeIdentityId(account: UniversalAccount): string {
  const material = `${account.btc.address}|${account.evm.address.toLowerCase()}|${account.sol.address}`;
  return bytesToHex(sha256(utf8ToBytes(material))).slice(0, 32);
}

/** Maps a wallet-core UniversalAccount to a Universal Identity with display metadata. */
export function deriveUniversalIdentity(
  account: UniversalAccount,
  metadata: Partial<IdentityMetadata> = {},
): UniversalIdentity {
  const evmNetwork = account.btc.address.startsWith('tb1') ? 'testnet' : 'mainnet';
  return {
    id: computeIdentityId(account),
    accountIndex: account.index,
    addresses: {
      btc: {
        ecosystem: 'btc',
        address: account.btc.address,
        network: account.btc.address.startsWith('tb1') ? 'testnet' : 'mainnet',
        derivationPath: account.btc.path,
        worksOn: 'Bitcoin',
      },
      evm: {
        ecosystem: 'evm',
        address: account.evm.address,
        network: evmNetwork,
        derivationPath: account.evm.path,
        worksOn: 'Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain',
      },
      sol: {
        ecosystem: 'sol',
        address: account.sol.address,
        network: 'mainnet',
        derivationPath: account.sol.path,
        worksOn: 'Solana',
      },
    },
    metadata: {
      label: metadata.label ?? `Account ${account.index + 1}`,
      ...(metadata.createdAt !== undefined ? { createdAt: metadata.createdAt } : {}),
    },
  };
}

/** The three receive addresses to show in the UI (the product's "only 3 identities" promise). */
export function getReceiveAddresses(identity: UniversalIdentity): ReceiveAddress[] {
  return [identity.addresses.btc, identity.addresses.evm, identity.addresses.sol];
}
