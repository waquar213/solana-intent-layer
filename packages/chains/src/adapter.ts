/**
 * BlockchainAdapter — the common interface every ecosystem implements so the
 * rest of the platform reads balances/fees, broadcasts, and tracks transactions
 * without knowing chain quirks (ADR-0011/0012, ADR-0031: the "OS ↔ printer
 * driver" abstraction). Business logic references chains by `ChainId` and
 * depends ONLY on this interface; adding a chain means implementing it, not
 * touching callers. Building + SIGNING live elsewhere (execution engine builds,
 * wallet core signs) — the adapter's write role is broadcast + track.
 */
import type { ChainId, Ecosystem } from './registry.js';

/** A token to query. `decimals` is used to interpret the returned base-unit amount. */
export interface TokenRef {
  /** Contract address (EVM/SPL mint); omitted/`native` for the chain's native asset. */
  address: string;
  symbol?: string;
  decimals?: number;
}

export interface AssetBalance {
  /** Stable asset id: symbol for native, `chain:address` for tokens. */
  assetId: string;
  /** Balance in base units. Always bigint — never a float. */
  amount: bigint;
  decimals: number;
  symbol: string;
  /** null for the native asset; the contract/mint address for tokens. */
  tokenAddress: string | null;
}

export interface AssetMetadata {
  symbol: string;
  decimals: number;
  name?: string;
}

/** Fee estimate, discriminated by ecosystem — each chain prices very differently. */
export type FeeEstimate =
  | { kind: 'evm'; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; baseFeePerGas: bigint }
  | { kind: 'btc'; satPerVByte: number }
  | { kind: 'sol'; baseLamports: bigint; priorityMicroLamportsPerCu: bigint };

export type FeeSpeed = 'slow' | 'normal' | 'fast';

export interface BroadcastResult {
  /** Transaction id / hash as the chain reports it. */
  txid: string;
}

export type TxState = 'pending' | 'confirmed' | 'failed' | 'unknown';

export interface TxStatus {
  state: TxState;
  confirmations: number;
  /** Block height/slot of inclusion, when known. */
  blockHeight?: bigint;
}

/**
 * The gateway interface. Every method a wallet needs from a chain, in one
 * place, per ecosystem. Read + fee + broadcast + track + validate. EVM adds a
 * few EVM-only methods (gas/nonce/simulate) on its concrete class.
 */
export interface BlockchainAdapter {
  readonly chainId: ChainId;
  readonly ecosystem: Ecosystem;

  // --- reads ---
  getNativeBalance(address: string): Promise<bigint>;
  getTokenBalances(address: string, tokens: TokenRef[]): Promise<AssetBalance[]>;
  getBlockHeight(): Promise<bigint>;
  getAssetMetadata(tokenAddress: string): Promise<AssetMetadata>;

  // --- validation ---
  /** Structural validity of an address on THIS chain (strict cross-ecosystem detection lives in @intent-wallet/identity). */
  validateAddress(address: string): boolean;

  // --- fees ---
  estimateFees(speed?: FeeSpeed): Promise<FeeEstimate>;

  // --- write lifecycle (adapter broadcasts + tracks; it never signs) ---
  broadcastRawTransaction(rawTx: string): Promise<BroadcastResult>;
  getTransactionStatus(txid: string): Promise<TxStatus>;
}
