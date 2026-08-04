/**
 * Chain registry — the single source of truth for every network the wallet
 * touches. Everything downstream (balances, fees, execution, UI) keys off
 * ChainId; nothing else is allowed to hardcode chain facts.
 *
 * The `defaultRpcUrls` are public, keyless endpoints good enough for
 * development and as last-resort fallbacks. Production deployments inject
 * keyed endpoints (Alchemy/QuickNode/etc.) ahead of these via configuration —
 * defaults stay LAST in the pool.
 */
import { ChainError } from './errors.js';

export type Ecosystem = 'evm' | 'btc' | 'sol';

export type ChainId =
  | 'ethereum'
  | 'arbitrum'
  | 'base'
  | 'optimism'
  | 'polygon'
  | 'bnb'
  | 'bitcoin'
  | 'solana'
  | 'sepolia'
  | 'base-sepolia'
  | 'giwa-sepolia'
  | 'bitcoin-testnet'
  | 'solana-devnet';

export interface NativeAsset {
  symbol: string;
  name: string;
  decimals: number;
}

/** How many confirmations (or which tag/commitment) we treat as settled. */
export type FinalityRule =
  | { kind: 'confirmations'; count: number }
  | { kind: 'evm-finalized-tag' }
  | { kind: 'solana-commitment'; level: 'confirmed' | 'finalized' };

export interface ChainInfo {
  readonly id: ChainId;
  readonly ecosystem: Ecosystem;
  readonly name: string;
  readonly testnet: boolean;
  /** EIP-155 chain id — present iff ecosystem === 'evm'. */
  readonly evmChainId?: number;
  readonly native: NativeAsset;
  readonly explorerUrl: string;
  readonly finality: FinalityRule;
  readonly defaultRpcUrls: readonly string[];
}

const ETH: NativeAsset = { symbol: 'ETH', name: 'Ether', decimals: 18 };

export const CHAINS: Record<ChainId, ChainInfo> = {
  ethereum: {
    id: 'ethereum',
    ecosystem: 'evm',
    name: 'Ethereum',
    testnet: false,
    evmChainId: 1,
    native: ETH,
    explorerUrl: 'https://etherscan.io',
    finality: { kind: 'evm-finalized-tag' },
    defaultRpcUrls: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'],
  },
  arbitrum: {
    id: 'arbitrum',
    ecosystem: 'evm',
    name: 'Arbitrum One',
    testnet: false,
    evmChainId: 42161,
    native: ETH,
    explorerUrl: 'https://arbiscan.io',
    finality: { kind: 'evm-finalized-tag' },
    defaultRpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],
  },
  base: {
    id: 'base',
    ecosystem: 'evm',
    name: 'Base',
    testnet: false,
    evmChainId: 8453,
    native: ETH,
    explorerUrl: 'https://basescan.org',
    finality: { kind: 'evm-finalized-tag' },
    defaultRpcUrls: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
  },
  optimism: {
    id: 'optimism',
    ecosystem: 'evm',
    name: 'OP Mainnet',
    testnet: false,
    evmChainId: 10,
    native: ETH,
    explorerUrl: 'https://optimistic.etherscan.io',
    finality: { kind: 'evm-finalized-tag' },
    defaultRpcUrls: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com'],
  },
  polygon: {
    id: 'polygon',
    ecosystem: 'evm',
    name: 'Polygon PoS',
    testnet: false,
    evmChainId: 137,
    native: { symbol: 'POL', name: 'Polygon Ecosystem Token', decimals: 18 },
    explorerUrl: 'https://polygonscan.com',
    finality: { kind: 'confirmations', count: 128 },
    defaultRpcUrls: ['https://polygon-rpc.com', 'https://polygon-bor-rpc.publicnode.com'],
  },
  bnb: {
    id: 'bnb',
    ecosystem: 'evm',
    name: 'BNB Smart Chain',
    testnet: false,
    evmChainId: 56,
    native: { symbol: 'BNB', name: 'BNB', decimals: 18 },
    explorerUrl: 'https://bscscan.com',
    finality: { kind: 'confirmations', count: 15 },
    defaultRpcUrls: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com'],
  },
  bitcoin: {
    id: 'bitcoin',
    ecosystem: 'btc',
    name: 'Bitcoin',
    testnet: false,
    native: { symbol: 'BTC', name: 'Bitcoin', decimals: 8 },
    explorerUrl: 'https://mempool.space',
    finality: { kind: 'confirmations', count: 2 },
    defaultRpcUrls: ['https://blockstream.info/api', 'https://mempool.space/api'],
  },
  solana: {
    id: 'solana',
    ecosystem: 'sol',
    name: 'Solana',
    testnet: false,
    native: { symbol: 'SOL', name: 'Solana', decimals: 9 },
    explorerUrl: 'https://solscan.io',
    finality: { kind: 'solana-commitment', level: 'finalized' },
    defaultRpcUrls: ['https://api.mainnet-beta.solana.com'],
  },
  sepolia: {
    id: 'sepolia',
    ecosystem: 'evm',
    name: 'Sepolia',
    testnet: true,
    evmChainId: 11155111,
    native: ETH,
    explorerUrl: 'https://sepolia.etherscan.io',
    finality: { kind: 'evm-finalized-tag' },
    defaultRpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
  },
  'base-sepolia': {
    id: 'base-sepolia',
    ecosystem: 'evm',
    name: 'Base Sepolia',
    testnet: true,
    evmChainId: 84532,
    native: ETH,
    explorerUrl: 'https://sepolia.basescan.org',
    finality: { kind: 'evm-finalized-tag' },
    defaultRpcUrls: ['https://sepolia.base.org'],
  },
  'giwa-sepolia': {
    id: 'giwa-sepolia',
    ecosystem: 'evm',
    name: 'GIWA Sepolia',
    testnet: true,
    // GIWA is Dunamu/Upbit's OP Stack L2. GIWA Sepolia is its public testnet.
    evmChainId: 91342,
    native: ETH,
    explorerUrl: 'https://sepolia-explorer.giwa.io',
    // OP Stack rollup — same finalized-tag rule as Base/Optimism.
    finality: { kind: 'evm-finalized-tag' },
    defaultRpcUrls: ['https://sepolia-rpc.giwa.io'],
  },
  'bitcoin-testnet': {
    id: 'bitcoin-testnet',
    ecosystem: 'btc',
    name: 'Bitcoin Testnet',
    testnet: true,
    native: { symbol: 'tBTC', name: 'Testnet Bitcoin', decimals: 8 },
    explorerUrl: 'https://mempool.space/testnet',
    finality: { kind: 'confirmations', count: 2 },
    defaultRpcUrls: ['https://blockstream.info/testnet/api'],
  },
  'solana-devnet': {
    id: 'solana-devnet',
    ecosystem: 'sol',
    name: 'Solana Devnet',
    testnet: true,
    native: { symbol: 'SOL', name: 'Solana', decimals: 9 },
    explorerUrl: 'https://solscan.io?cluster=devnet',
    finality: { kind: 'solana-commitment', level: 'confirmed' },
    defaultRpcUrls: ['https://api.devnet.solana.com'],
  },
};

export function getChain(id: string): ChainInfo {
  const chain = (CHAINS as Record<string, ChainInfo>)[id];
  if (!chain) throw new ChainError('UNKNOWN_CHAIN', `chain "${id}" is not in the registry`);
  return chain;
}

export function listChains(filter?: { ecosystem?: Ecosystem; testnet?: boolean }): ChainInfo[] {
  return Object.values(CHAINS).filter(
    (chain) =>
      (filter?.ecosystem === undefined || chain.ecosystem === filter.ecosystem) &&
      (filter?.testnet === undefined || chain.testnet === filter.testnet),
  );
}

/** Reverse lookup for wallet_switchEthereumChain-style requests. */
export function chainByEvmChainId(evmChainId: number): ChainInfo | undefined {
  return Object.values(CHAINS).find((chain) => chain.evmChainId === evmChainId);
}
