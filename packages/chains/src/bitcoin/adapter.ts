/**
 * BitcoinAdapter — the BlockchainAdapter for Bitcoin, over an esplora REST API.
 * UTXO model: balance = confirmed funded − spent; fees are sat/vByte tiers from
 * the mempool estimator. It also exposes UTXOs and change/fee inputs the
 * execution engine needs to BUILD a PSBT (the wallet core signs it, this adapter
 * broadcasts + tracks). Bitcoin has no tokens, so token methods return empty.
 */
import { bech32, bech32m, base58check as base58checkFactory } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
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
import { ChainError } from '../errors.js';
import type { RestTransport } from './rest.js';

const base58check = base58checkFactory(sha256);

export interface Utxo {
  txid: string;
  vout: number;
  value: bigint; // satoshis
  confirmed: boolean;
}

/** esplora response shapes (subset we use). */
interface AddressStats {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
}
interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}
interface EsploraTxStatus {
  confirmed: boolean;
  block_height?: number;
}

/** Target confirmation blocks per fee speed for the esplora fee estimator. */
const FEE_TARGET: Record<FeeSpeed, string> = { slow: '6', normal: '3', fast: '1' };
const TIMEOUT_MS = 10_000;

export class BitcoinAdapter implements BlockchainAdapter {
  readonly chainId: ChainId;
  readonly ecosystem = 'btc' as const;
  readonly #rest: RestTransport;
  readonly #network: 'mainnet' | 'testnet';
  readonly #symbol: string;
  readonly #decimals: number;

  constructor(chainId: ChainId, rest: RestTransport) {
    const chain = getChain(chainId);
    if (chain.ecosystem !== 'btc') {
      throw new Error(`BitcoinAdapter requires a Bitcoin chain, got ${chainId} (${chain.ecosystem})`);
    }
    this.chainId = chainId;
    this.#rest = rest;
    this.#network = chain.testnet ? 'testnet' : 'mainnet';
    this.#symbol = chain.native.symbol;
    this.#decimals = chain.native.decimals;
  }

  async getNativeBalance(address: string): Promise<bigint> {
    const stats = await this.#rest.getJson<AddressStats>(`/address/${address}`, this.#signal());
    // Convert each field to bigint BEFORE subtracting: a Number subtraction would lose
    // precision once the lifetime funded/spent sums pass 2^53 sats. (The JSON transport
    // still parses each field as a Number, so the residual limit is per-field, not on the
    // difference — good enough here, and strictly better than subtracting in Number space.)
    return BigInt(stats.chain_stats.funded_txo_sum) - BigInt(stats.chain_stats.spent_txo_sum);
  }

  /** Bitcoin has no tokens. Returns empty; kept for interface uniformity. */
  async getTokenBalances(_address: string, _tokens: TokenRef[]): Promise<AssetBalance[]> {
    return [];
  }

  async getBlockHeight(): Promise<bigint> {
    return BigInt(await this.#rest.getText('/blocks/tip/height', this.#signal()));
  }

  async getAssetMetadata(_tokenAddress: string): Promise<AssetMetadata> {
    throw new ChainError('INVALID_RESPONSE', 'Bitcoin has no token metadata');
  }

  /** UTXOs for an address — the execution engine's inputs for building a PSBT. */
  async getUtxos(address: string): Promise<Utxo[]> {
    const utxos = await this.#rest.getJson<EsploraUtxo[]>(`/address/${address}/utxo`, this.#signal());
    return utxos.map((u) => ({ txid: u.txid, vout: u.vout, value: BigInt(u.value), confirmed: u.status.confirmed }));
  }

  validateAddress(address: string): boolean {
    const hrp = this.#network === 'mainnet' ? 'bc' : 'tb';
    const lower = address.toLowerCase();
    if (lower.startsWith(`${hrp}1`)) {
      for (const codec of [bech32, bech32m]) {
        try {
          if (codec.decode(lower as `${string}1${string}`).prefix === hrp) return true;
        } catch {
          /* try next */
        }
      }
      return false;
    }
    try {
      const payload = base58check.decode(address);
      if (payload.length !== 21) return false;
      const v = payload[0] as number;
      return this.#network === 'mainnet' ? v === 0x00 || v === 0x05 : v === 0x6f || v === 0xc4;
    } catch {
      return false;
    }
  }

  async estimateFees(speed: FeeSpeed = 'normal'): Promise<FeeEstimate> {
    const estimates = await this.#rest.getJson<Record<string, number>>('/fee-estimates', this.#signal());
    const satPerVByte = estimates[FEE_TARGET[speed]] ?? estimates['3'] ?? 1;
    return { kind: 'btc', satPerVByte: Math.max(1, Math.ceil(satPerVByte)) };
  }

  async broadcastRawTransaction(rawTxHex: string): Promise<BroadcastResult> {
    const txid = (await this.#rest.postText('/tx', rawTxHex, this.#signal())).trim();
    if (!/^[0-9a-f]{64}$/u.test(txid)) {
      throw new ChainError('INVALID_RESPONSE', 'broadcast did not return a txid');
    }
    return { txid };
  }

  async getTransactionStatus(txid: string): Promise<TxStatus> {
    const status = await this.#rest.getJson<EsploraTxStatus>(`/tx/${txid}/status`, this.#signal());
    if (!status.confirmed) return { state: 'pending', confirmations: 0 };
    const tip = await this.getBlockHeight();
    const height = BigInt(status.block_height ?? 0);
    const confirmations = tip >= height ? Number(tip - height) + 1 : 1;
    return { state: 'confirmed', confirmations, blockHeight: height };
  }

  async getNativeAssetBalance(address: string): Promise<AssetBalance> {
    return {
      assetId: this.#symbol,
      amount: await this.getNativeBalance(address),
      decimals: this.#decimals,
      symbol: this.#symbol,
      tokenAddress: null,
    };
  }

  #signal(): AbortSignal {
    return AbortSignal.timeout(TIMEOUT_MS);
  }
}
