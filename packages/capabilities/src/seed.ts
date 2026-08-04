/**
 * The built-in capability DATA — starting-point profiles for the chains the wallet
 * ships with, plus the bridge/swap route classes it's configured to offer. These are
 * DATA, not code: a new chain is a new profile appended here (or registered at
 * runtime), never a code change. `createDefaultCapabilityService()` assembles a
 * working service from them so the runtime has a sensible default.
 */
import { createChainCapabilityRegistry } from './profiles.js';
import { createProviderRouteRegistry } from './routes.js';
import { createCapabilityService, type CapabilityService } from './service.js';
import type { ChainCapabilityProfile, ProviderRouteDeclaration } from './types.js';

const ETHEREUM: ChainCapabilityProfile = {
  id: 'eip155:1',
  version: 1,
  status: 'active',
  availability: 'supported',
  label: 'Ethereum',
  ecosystem: 'evm',
  effectiveFromIso: '2026-01-01T00:00:00.000Z',
  nativeAsset: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  feeModel: 'eip1559',
  finality: { kind: 'evm_finalized_tag' },
  tokenStandard: 'erc20',
  capabilities: [
    'transfer',
    'swap',
    'bridge',
    'approve',
    'stake',
    'smart_account',
    'gas_sponsorship',
    'fee_token',
    'atomic_swap_htlc',
    'arbitrary_call',
    'nft',
  ],
  smartAccount: { supported: true, standard: 'erc4337' },
  staking: { supported: true, consensus: 'pos' },
  addressing: { memoRequired: false, destTagRequired: false },
};

const POLYGON: ChainCapabilityProfile = {
  id: 'eip155:137',
  version: 1,
  status: 'active',
  availability: 'supported',
  label: 'Polygon',
  ecosystem: 'evm',
  effectiveFromIso: '2026-01-01T00:00:00.000Z',
  nativeAsset: { symbol: 'POL', name: 'Polygon Ecosystem Token', decimals: 18 },
  feeModel: 'eip1559',
  finality: { kind: 'confirmations', confirmations: 128 },
  tokenStandard: 'erc20',
  capabilities: [
    'transfer',
    'swap',
    'bridge',
    'approve',
    'stake',
    'smart_account',
    'gas_sponsorship',
    'fee_token',
    'atomic_swap_htlc',
    'arbitrary_call',
    'nft',
  ],
  smartAccount: { supported: true, standard: 'erc4337' },
  staking: { supported: true, consensus: 'pos' },
  addressing: { memoRequired: false, destTagRequired: false },
};

const BITCOIN: ChainCapabilityProfile = {
  id: 'bip122:bitcoin',
  version: 1,
  status: 'active',
  availability: 'supported',
  label: 'Bitcoin',
  ecosystem: 'btc',
  effectiveFromIso: '2026-01-01T00:00:00.000Z',
  nativeAsset: { symbol: 'BTC', name: 'Bitcoin', decimals: 8 },
  feeModel: 'utxo',
  finality: { kind: 'confirmations', confirmations: 2 },
  tokenStandard: 'none',
  capabilities: ['transfer', 'atomic_swap_htlc'],
  smartAccount: { supported: false },
  staking: { supported: false, consensus: 'pow' },
  addressing: { memoRequired: false, destTagRequired: false },
};

const SOLANA: ChainCapabilityProfile = {
  id: 'solana:mainnet',
  version: 1,
  status: 'active',
  availability: 'supported',
  label: 'Solana',
  ecosystem: 'sol',
  effectiveFromIso: '2026-01-01T00:00:00.000Z',
  nativeAsset: { symbol: 'SOL', name: 'Solana', decimals: 9 },
  feeModel: 'spl',
  finality: { kind: 'solana_commitment', commitment: 'finalized' },
  tokenStandard: 'spl',
  capabilities: ['transfer', 'swap', 'stake', 'gas_sponsorship', 'arbitrary_call', 'nft', 'memo'],
  smartAccount: { supported: false },
  staking: { supported: true, consensus: 'pos' },
  addressing: { memoRequired: true, destTagRequired: false },
};

/** GIWA Sepolia (chain id 91342) — Upbit's OP-Stack L2, where the wallet settles: native-ETH
 *  transfers via the on-chain IntentExecutor and ETH<->gUSDC swaps via the SimpleAMM. */
const GIWA_SEPOLIA: ChainCapabilityProfile = {
  id: 'eip155:91342',
  version: 1,
  status: 'active',
  availability: 'supported',
  label: 'GIWA Sepolia',
  ecosystem: 'evm',
  effectiveFromIso: '2026-01-01T00:00:00.000Z',
  nativeAsset: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  feeModel: 'eip1559',
  finality: { kind: 'evm_finalized_tag' },
  tokenStandard: 'erc20',
  capabilities: ['transfer', 'swap', 'bridge', 'approve', 'arbitrary_call'],
  smartAccount: { supported: false },
  staking: { supported: false, consensus: 'pos' },
  addressing: { memoRequired: false, destTagRequired: false },
};

/** The chain profiles the wallet ships with. */
export const BUILTIN_CHAIN_PROFILES: readonly ChainCapabilityProfile[] = [ETHEREUM, POLYGON, BITCOIN, SOLANA, GIWA_SEPOLIA];

/** The bridge + swap route classes the wallet is configured to offer (static, health-free). */
export const BUILTIN_ROUTES: readonly ProviderRouteDeclaration[] = [
  // Ethereum ↔ Polygon bridge for the common stable + native-wrapped assets.
  { providerId: 'stargate', kind: 'bridge', action: 'bridge_cross_chain', fromChainId: 'eip155:1', toChainId: 'eip155:137', symbol: 'USDC', enabled: true },
  { providerId: 'stargate', kind: 'bridge', action: 'bridge_cross_chain', fromChainId: 'eip155:137', toChainId: 'eip155:1', symbol: 'USDC', enabled: true },
  { providerId: 'stargate', kind: 'bridge', action: 'bridge_cross_chain', fromChainId: 'eip155:1', toChainId: 'eip155:137', symbol: 'ETH', enabled: true },
  { providerId: 'stargate', kind: 'bridge', action: 'bridge_cross_chain', fromChainId: 'eip155:137', toChainId: 'eip155:1', symbol: 'ETH', enabled: true },
  // Same-chain swaps on the EVM chains + Solana.
  { providerId: 'uniswap', kind: 'swap', action: 'swap_same_chain', fromChainId: 'eip155:1', toChainId: 'eip155:1', symbol: 'USDC', enabled: true },
  { providerId: 'uniswap', kind: 'swap', action: 'swap_same_chain', fromChainId: 'eip155:137', toChainId: 'eip155:137', symbol: 'USDC', enabled: true },
  { providerId: 'jupiter', kind: 'swap', action: 'swap_same_chain', fromChainId: 'solana:mainnet', toChainId: 'solana:mainnet', symbol: 'USDC', enabled: true },
];

/** A ready-to-use CapabilityService over the built-in profiles + routes. */
export function createDefaultCapabilityService(): CapabilityService {
  return createCapabilityService({
    chains: createChainCapabilityRegistry(BUILTIN_CHAIN_PROFILES),
    routes: createProviderRouteRegistry(BUILTIN_ROUTES),
  });
}
