/**
 * The dev Universal Identity — one account's BTC + EVM + Solana receive addresses,
 * REALLY derived (BIP-39 → BIP-32/44/84 → secp256k1/ed25519 → canonical address
 * encoding) from a single seed. This proves the "one identity, three chains" model
 * with real cryptography, not invented strings.
 *
 * The seed here is the CANONICAL, well-known BIP-39 test vector — a public demo
 * mnemonic, never a real user key. In production the identity is derived on the
 * user's DEVICE and only the public receive addresses reach the server; no seed
 * ever lives in this process. So this file is dev-only, gated exactly like the
 * dev-seed runtime.
 */
import { HDKeyring } from '@intent-wallet/core';

export interface IdentityDto {
  index: number;
  evm: { address: string; path: string };
  btc: { address: string; path: string };
  sol: { address: string; path: string };
}

const DEMO_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

export function deriveDemoIdentity(): IdentityDto {
  const keyring = HDKeyring.fromMnemonic(DEMO_MNEMONIC);
  try {
    const a = keyring.getAccount(0);
    return {
      index: a.index,
      evm: { address: a.evm.address, path: a.evm.path },
      btc: { address: a.btc.address, path: a.btc.path },
      sol: { address: a.sol.address, path: a.sol.path },
    };
  } finally {
    keyring.destroy(); // zeroize the seed — we only keep the public addresses
  }
}
