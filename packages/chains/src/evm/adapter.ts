/**
 * EvmAdapter — the BlockchainAdapter for every EVM chain. Reads, fee estimation
 * (EIP-1559), broadcast, and tracking go through a ProviderPool (failover /
 * cooldown / key-redaction already handled there) using raw JSON-RPC + minimal
 * ABI — no heavy client library in this hot path. One instance per chain.
 *
 * The adapter NEVER signs: building happens in the execution engine, signing in
 * the wallet core; the adapter takes a raw signed tx and broadcasts + tracks it.
 */
import type {
  AssetBalance,
  AssetMetadata,
  BlockchainAdapter,
  BroadcastResult,
  FeeEstimate,
  FeeSpeed,
  TokenRef,
  TxStatus,
} from '../adapter.js';
import type { ChainId } from '../registry.js';
import { getChain } from '../registry.js';
import type { ProviderPool } from '../provider.js';
import { CALL_DECIMALS, CALL_SYMBOL, decodeDecimals, decodeString, decodeUint, encodeBalanceOf } from './abi.js';

/** Reward percentile per fee speed for eth_feeHistory. */
const FEE_PERCENTILE: Record<FeeSpeed, number> = { slow: 20, normal: 50, fast: 80 };
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/u;

export class EvmAdapter implements BlockchainAdapter {
  readonly chainId: ChainId;
  readonly ecosystem = 'evm' as const;
  readonly #pool: ProviderPool;
  readonly #nativeSymbol: string;
  readonly #nativeDecimals: number;

  constructor(chainId: ChainId, pool: ProviderPool) {
    const chain = getChain(chainId);
    if (chain.ecosystem !== 'evm') {
      throw new Error(`EvmAdapter requires an EVM chain, got ${chainId} (${chain.ecosystem})`);
    }
    this.chainId = chainId;
    this.#pool = pool;
    this.#nativeSymbol = chain.native.symbol;
    this.#nativeDecimals = chain.native.decimals;
  }

  // --- reads ---

  async getNativeBalance(address: string): Promise<bigint> {
    return decodeUint(await this.#pool.request<string>('eth_getBalance', [address, 'latest']));
  }

  async getBlockHeight(): Promise<bigint> {
    return decodeUint(await this.#pool.request<string>('eth_blockNumber', []));
  }

  async getTokenBalances(address: string, tokens: TokenRef[]): Promise<AssetBalance[]> {
    const results = await Promise.all(tokens.map((token) => this.#readToken(address, token).catch(() => null)));
    return results.filter((b): b is AssetBalance => b !== null);
  }

  async getNativeAssetBalance(address: string): Promise<AssetBalance> {
    return {
      assetId: this.#nativeSymbol,
      amount: await this.getNativeBalance(address),
      decimals: this.#nativeDecimals,
      symbol: this.#nativeSymbol,
      tokenAddress: null,
    };
  }

  async getAssetMetadata(tokenAddress: string): Promise<AssetMetadata> {
    const [decimals, symbol] = await Promise.all([
      this.#call(tokenAddress, CALL_DECIMALS).then(decodeDecimals),
      this.#call(tokenAddress, CALL_SYMBOL).then(decodeString),
    ]);
    return { symbol, decimals };
  }

  // --- validation ---

  validateAddress(address: string): boolean {
    return EVM_ADDRESS_RE.test(address);
  }

  // --- fees (EIP-1559) ---

  async estimateFees(speed: FeeSpeed = 'normal'): Promise<FeeEstimate> {
    const history = await this.#pool.request<{ baseFeePerGas: string[]; reward?: string[][] }>('eth_feeHistory', [
      '0x5',
      'latest',
      [FEE_PERCENTILE[speed]],
    ]);
    const baseFees = history.baseFeePerGas.map(decodeUint);
    const baseFeePerGas = baseFees[baseFees.length - 1] ?? 0n;
    const rewards = (history.reward ?? []).map((r) => decodeUint(r[0] ?? '0x0'));
    const priorityFromHistory = rewards.length ? rewards.reduce((a, b) => a + b, 0n) / BigInt(rewards.length) : 0n;
    // Never propose a zero tip; floor at 1 gwei so txs actually get mined.
    const maxPriorityFeePerGas = priorityFromHistory > 0n ? priorityFromHistory : 1_000_000_000n;
    // Standard headroom: cover up to ~2 base-fee increases plus the tip.
    const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas;
    return { kind: 'evm', maxFeePerGas, maxPriorityFeePerGas, baseFeePerGas };
  }

  // --- EVM-specific tx-building helpers (used by the execution engine) ---

  /** Nonce (transaction count) for the next transaction. Uses 'pending' to include queued txs. */
  async getNonce(address: string): Promise<bigint> {
    return decodeUint(await this.#pool.request<string>('eth_getTransactionCount', [address, 'pending']));
  }

  /** Gas units a call would consume (eth_estimateGas). */
  async estimateGas(tx: { from?: string; to: string; data?: string; value?: bigint }): Promise<bigint> {
    const call: Record<string, string> = { to: tx.to };
    if (tx.from) call['from'] = tx.from;
    if (tx.data) call['data'] = tx.data;
    if (tx.value !== undefined) call['value'] = `0x${tx.value.toString(16)}`;
    return decodeUint(await this.#pool.request<string>('eth_estimateGas', [call]));
  }

  /** Read-only simulation of a call — returns the raw return data (or throws on revert via JsonRpcError). */
  async simulateCall(tx: { from?: string; to: string; data?: string; value?: bigint }): Promise<string> {
    const call: Record<string, string> = { to: tx.to };
    if (tx.from) call['from'] = tx.from;
    if (tx.data) call['data'] = tx.data;
    if (tx.value !== undefined) call['value'] = `0x${tx.value.toString(16)}`;
    return this.#pool.request<string>('eth_call', [call, 'latest']);
  }

  // --- write lifecycle ---

  async broadcastRawTransaction(rawTx: string): Promise<BroadcastResult> {
    const txid = await this.#pool.request<string>('eth_sendRawTransaction', [rawTx]);
    return { txid };
  }

  async getTransactionStatus(txid: string): Promise<TxStatus> {
    const receipt = await this.#pool.request<{ blockNumber: string; status: string } | null>(
      'eth_getTransactionReceipt',
      [txid],
    );
    if (!receipt) return { state: 'pending', confirmations: 0 };
    const blockHeight = decodeUint(receipt.blockNumber);
    const head = await this.getBlockHeight();
    const confirmations = head >= blockHeight ? Number(head - blockHeight) + 1 : 1;
    return {
      state: receipt.status === '0x1' ? 'confirmed' : 'failed',
      confirmations,
      blockHeight,
    };
  }

  // --- internals ---

  async #readToken(address: string, token: TokenRef): Promise<AssetBalance> {
    const amount = decodeUint(
      await this.#pool.request<string>('eth_call', [{ to: token.address, data: encodeBalanceOf(address) }, 'latest']),
    );
    const decimals = token.decimals ?? decodeDecimals(await this.#call(token.address, CALL_DECIMALS));
    const symbol = token.symbol ?? decodeString(await this.#call(token.address, CALL_SYMBOL));
    return {
      assetId: `${this.chainId}:${token.address.toLowerCase()}`,
      amount,
      decimals,
      symbol,
      tokenAddress: token.address.toLowerCase(),
    };
  }

  #call(to: string, data: string): Promise<string> {
    return this.#pool.request<string>('eth_call', [{ to, data }, 'latest']);
  }
}
