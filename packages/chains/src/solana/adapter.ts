/**
 * SolanaAdapter — the BlockchainAdapter for Solana, over JSON-RPC through a
 * ProviderPool. Handles the account model (lamports), SPL tokens
 * (getTokenAccountsByOwner), priority fees (compute-unit pricing), broadcast,
 * and confirmation tracking. Never signs — it broadcasts a fully-signed,
 * serialized (base64) transaction produced by the wallet core.
 */
import { base58 } from '@scure/base';
import type {
  AssetBalance,
  AssetMetadata,
  BlockchainAdapter,
  BroadcastResult,
  FeeEstimate,
  TokenRef,
  TxStatus,
} from '../adapter.js';
import type { ChainId } from '../registry.js';
import { getChain } from '../registry.js';
import type { ProviderPool } from '../provider.js';

/** Solana wraps many results as { context, value }. */
interface RpcValue<T> {
  value: T;
}
interface TokenAccount {
  account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } };
}
const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const LAMPORTS_PER_SIGNATURE = 5000n;

export class SolanaAdapter implements BlockchainAdapter {
  readonly chainId: ChainId;
  readonly ecosystem = 'sol' as const;
  readonly #pool: ProviderPool;
  readonly #nativeSymbol: string;
  readonly #nativeDecimals: number;

  constructor(chainId: ChainId, pool: ProviderPool) {
    const chain = getChain(chainId);
    if (chain.ecosystem !== 'sol') {
      throw new Error(`SolanaAdapter requires a Solana chain, got ${chainId} (${chain.ecosystem})`);
    }
    this.chainId = chainId;
    this.#pool = pool;
    this.#nativeSymbol = chain.native.symbol;
    this.#nativeDecimals = chain.native.decimals;
  }

  async getNativeBalance(address: string): Promise<bigint> {
    const res = await this.#pool.request<RpcValue<number>>('getBalance', [address]);
    return BigInt(res.value);
  }

  async getBlockHeight(): Promise<bigint> {
    return BigInt(await this.#pool.request<number>('getSlot', []));
  }

  /** Fetches ALL of the owner's SPL token accounts once, then returns the requested mints. */
  async getTokenBalances(address: string, tokens: TokenRef[]): Promise<AssetBalance[]> {
    const res = await this.#pool.request<RpcValue<TokenAccount[]>>('getTokenAccountsByOwner', [
      address,
      { programId: SPL_TOKEN_PROGRAM },
      { encoding: 'jsonParsed' },
    ]);
    const held = new Map<string, { amount: bigint; decimals: number }>();
    for (const acc of res.value) {
      const info = acc.account.data.parsed.info;
      held.set(info.mint, { amount: BigInt(info.tokenAmount.amount), decimals: info.tokenAmount.decimals });
    }
    const out: AssetBalance[] = [];
    for (const token of tokens) {
      const entry = held.get(token.address);
      if (!entry) continue; // not held → skip (0 balances are omitted)
      out.push({
        assetId: `${this.chainId}:${token.address}`,
        amount: entry.amount,
        decimals: token.decimals ?? entry.decimals,
        symbol: token.symbol ?? '',
        tokenAddress: token.address,
      });
    }
    return out;
  }

  /** Decimals come from the mint's supply; SPL symbols require a token registry (enriched upstream). */
  async getAssetMetadata(mint: string): Promise<AssetMetadata> {
    const res = await this.#pool.request<RpcValue<{ decimals: number }>>('getTokenSupply', [mint]);
    return { symbol: '', decimals: res.value.decimals };
  }

  validateAddress(address: string): boolean {
    try {
      return base58.decode(address).length === 32;
    } catch {
      return false;
    }
  }

  async estimateFees(): Promise<FeeEstimate> {
    // Base fee is per-signature; priority is a compute-unit price (median of recent).
    const recent = await this.#pool
      .request<Array<{ prioritizationFee: number }>>('getRecentPrioritizationFees', [[]])
      .catch(() => [] as Array<{ prioritizationFee: number }>);
    const fees = recent.map((r) => BigInt(r.prioritizationFee)).sort((a, b) => (a < b ? -1 : 1));
    const median = fees.length ? (fees[Math.floor(fees.length / 2)] ?? 0n) : 0n;
    return { kind: 'sol', baseLamports: LAMPORTS_PER_SIGNATURE, priorityMicroLamportsPerCu: median };
  }

  async broadcastRawTransaction(rawTx: string): Promise<BroadcastResult> {
    const signature = await this.#pool.request<string>('sendTransaction', [rawTx, { encoding: 'base64' }]);
    return { txid: signature };
  }

  async getTransactionStatus(txid: string): Promise<TxStatus> {
    const res = await this.#pool.request<
      RpcValue<
        Array<{ confirmationStatus: string | null; confirmations: number | null; err: unknown; slot: number } | null>
      >
    >('getSignatureStatuses', [[txid], { searchTransactionHistory: true }]);
    const status = res.value[0];
    if (!status) return { state: 'unknown', confirmations: 0 };
    if (status.err)
      return { state: 'failed', confirmations: status.confirmations ?? 0, blockHeight: BigInt(status.slot) };
    const confirmed = status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized';
    return {
      state: confirmed ? 'confirmed' : 'pending',
      confirmations: status.confirmations ?? (confirmed ? 1 : 0),
      blockHeight: BigInt(status.slot),
    };
  }

  /** Native balance as an AssetBalance for uniform aggregation. */
  async getNativeAssetBalance(address: string): Promise<AssetBalance> {
    return {
      assetId: this.#nativeSymbol,
      amount: await this.getNativeBalance(address),
      decimals: this.#nativeDecimals,
      symbol: this.#nativeSymbol,
      tokenAddress: null,
    };
  }
}
