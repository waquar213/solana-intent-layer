/**
 * The active NETWORK ENVIRONMENT — Mainnet (real funds, irreversible) or Testnet (Sepolia /
 * Solana devnet / BTC testnet). One switch that balances + broadcast + explorer all follow.
 *
 * Safety by construction:
 *  - Defaults to TESTNET and NEVER auto-selects mainnet (an unknown/absent value → testnet).
 *  - This module only RESOLVES which chain/RPC/explorer to use. It does NOT relax the money
 *    guard: every mainnet broadcast is still gated by the chains-package `assertBroadcastAllowed`
 *    (an explicit `acknowledgeMainnet` + the $1,000 spend cap). Flipping to mainnet changes what
 *    the app READS by default; it can't move funds without the per-send acknowledgement.
 *  - The wallet's addresses are network-agnostic (EVM/SOL) or already the mainnet encoding (BTC
 *    `me.btc.address` is the `bc1…`; the same key re-encodes to `tb1…` for testnet), so switching
 *    never re-derives keys.
 */
import { useEffect, useState } from 'react';
import { getChain, type ChainId } from '@intent-wallet/chains';
import { storage } from './storage';

export type NetworkEnv = 'mainnet' | 'testnet';
const KEY = 'iw.network.v1';
const listeners = new Set<() => void>();

/** The active environment. Anything other than an explicit 'mainnet' resolves to testnet. */
export function getNetwork(): NetworkEnv {
  return storage.getItem(KEY) === 'mainnet' ? 'mainnet' : 'testnet';
}

export function setNetwork(env: NetworkEnv): void {
  storage.setItem(KEY, env);
  listeners.forEach((l) => l());
}

export function isMainnet(): boolean {
  return getNetwork() === 'mainnet';
}

/** Subscribe a component to the active network — re-renders on setNetwork. */
export function useNetwork(): NetworkEnv {
  const [, force] = useState(0);
  useEffect(() => {
    const bump = (): void => force((n) => n + 1);
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);
  return getNetwork();
}

export const NETWORKS: NetworkEnv[] = ['testnet', 'mainnet'];
export const NETWORK_LABEL: Record<NetworkEnv, string> = { testnet: 'Testnet', mainnet: 'Mainnet' };

// Endpoints — each overridable via an EXPO_PUBLIC_* env var, falling back to a public keyless node.
const RPC = {
  ethMainnet: process.env.EXPO_PUBLIC_ETH_MAINNET_RPC ?? 'https://ethereum-rpc.publicnode.com',
  sepolia: process.env.EXPO_PUBLIC_SEPOLIA_RPC ?? 'https://ethereum-sepolia-rpc.publicnode.com',
  solMainnet: process.env.EXPO_PUBLIC_SOLANA_MAINNET_RPC ?? 'https://api.mainnet-beta.solana.com',
  solDevnet: process.env.EXPO_PUBLIC_SOLANA_DEVNET_RPC ?? 'https://api.devnet.solana.com',
  btcMainnet: process.env.EXPO_PUBLIC_BTC_MAINNET_REST ?? 'https://blockstream.info/api',
  btcTestnet: process.env.EXPO_PUBLIC_BTC_TESTNET_REST ?? 'https://blockstream.info/testnet/api',
} as const;

export interface NetConfig {
  env: NetworkEnv;
  label: string;
  isMainnet: boolean;
  evm: { chain: ChainId; rpc: string };
  sol: { chain: ChainId; rpc: string; cluster: 'mainnet' | 'devnet' };
  btc: { chain: ChainId; network: 'mainnet' | 'testnet'; rest: string };
}

/** Resolve an environment (default: the active one) to its concrete per-chain config. */
export function netCfg(env: NetworkEnv = getNetwork()): NetConfig {
  if (env === 'mainnet') {
    return {
      env,
      label: 'Mainnet',
      isMainnet: true,
      evm: { chain: 'ethereum', rpc: RPC.ethMainnet },
      sol: { chain: 'solana', rpc: RPC.solMainnet, cluster: 'mainnet' },
      btc: { chain: 'bitcoin', network: 'mainnet', rest: RPC.btcMainnet },
    };
  }
  return {
    env,
    label: 'Testnet',
    isMainnet: false,
    evm: { chain: 'sepolia', rpc: RPC.sepolia },
    sol: { chain: 'solana-devnet', rpc: RPC.solDevnet, cluster: 'devnet' },
    btc: { chain: 'bitcoin-testnet', network: 'testnet', rest: RPC.btcTestnet },
  };
}

// ── explorer links (per active network) ───────────────────────────────────────
export function evmExplorerTx(txid: string, env: NetworkEnv = getNetwork()): string {
  return `${getChain(netCfg(env).evm.chain).explorerUrl}/tx/${txid}`;
}
export function solExplorerTx(txid: string, env: NetworkEnv = getNetwork()): string {
  const base = `https://explorer.solana.com/tx/${txid}`;
  return netCfg(env).sol.cluster === 'devnet' ? `${base}?cluster=devnet` : base;
}
export function btcExplorerTx(txid: string, env: NetworkEnv = getNetwork()): string {
  return netCfg(env).btc.network === 'testnet'
    ? `https://mempool.space/testnet/tx/${txid}`
    : `https://mempool.space/tx/${txid}`;
}
