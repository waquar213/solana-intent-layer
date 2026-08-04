/**
 * AdapterRegistry — THE gateway. Given a ChainId, it returns the right
 * BlockchainAdapter, wired with a ProviderPool (EVM/Solana JSON-RPC) or a REST
 * transport (Bitcoin esplora) built from the chain registry's endpoints. This is
 * the single place the rest of the platform obtains chain access; business logic
 * asks the registry for an adapter and never constructs transports itself
 * (dependency injection, ADR-0031).
 *
 * Endpoints resolve as: injected `rpcUrls[chainId]` first (keyed providers),
 * then the registry's public `defaultRpcUrls` as fallbacks — matching the
 * ProviderPool's priority-order failover.
 */
import type { BlockchainAdapter } from './adapter.js';
import { getChain, type ChainId } from './registry.js';
import { HttpJsonRpcTransport, ProviderPool, type ProviderPoolOptions } from './provider.js';
import { EvmAdapter } from './evm/adapter.js';
import { SolanaAdapter } from './solana/adapter.js';
import { BitcoinAdapter } from './bitcoin/adapter.js';
import { HttpRestTransport } from './bitcoin/rest.js';

export interface AdapterRegistryOptions {
  /** Keyed/private RPC URLs per chain, tried before the public defaults. */
  rpcUrls?: Partial<Record<ChainId, string[]>>;
  /** Injectable fetch (tests). */
  fetchFn?: typeof fetch;
  poolOptions?: ProviderPoolOptions;
}

export class AdapterRegistry {
  readonly #options: AdapterRegistryOptions;
  readonly #cache = new Map<ChainId, BlockchainAdapter>();

  constructor(options: AdapterRegistryOptions = {}) {
    this.#options = options;
  }

  /** Returns a (memoized) adapter for `chainId`. Throws UNKNOWN_CHAIN for unregistered ids. */
  get(chainId: ChainId): BlockchainAdapter {
    const cached = this.#cache.get(chainId);
    if (cached) return cached;
    const adapter = this.#build(chainId);
    this.#cache.set(chainId, adapter);
    return adapter;
  }

  #endpoints(chainId: ChainId): string[] {
    const chain = getChain(chainId);
    return [...(this.#options.rpcUrls?.[chainId] ?? []), ...chain.defaultRpcUrls];
  }

  #build(chainId: ChainId): BlockchainAdapter {
    const chain = getChain(chainId);
    const fetchFn = this.#options.fetchFn ?? fetch;
    switch (chain.ecosystem) {
      case 'evm': {
        const pool = this.#pool(chainId, fetchFn);
        return new EvmAdapter(chainId, pool);
      }
      case 'sol': {
        const pool = this.#pool(chainId, fetchFn);
        return new SolanaAdapter(chainId, pool);
      }
      case 'btc': {
        const url = this.#endpoints(chainId)[0] as string; // registry guarantees ≥1
        return new BitcoinAdapter(chainId, new HttpRestTransport(url, fetchFn));
      }
    }
  }

  #pool(chainId: ChainId, fetchFn: typeof fetch): ProviderPool {
    const transports = this.#endpoints(chainId).map((url) => new HttpJsonRpcTransport(url, fetchFn));
    return new ProviderPool(transports, this.#options.poolOptions ?? {});
  }
}
