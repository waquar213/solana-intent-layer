/**
 * Chain wiring — the seam between the chain-access layer and the runtime. Two real
 * connections to `@intent-wallet/chains`:
 *
 *  - `readChainHoldings` / `mergeHoldings`: turn live on-chain balances (native +
 *    tokens) into the `Holding[]` the planner reads, so the wallet plans against
 *    real balances instead of a static map.
 *  - `AdapterChainGateway`: a REAL `ChainGateway` for the execution seam, backed by
 *    the adapters' broadcast + status — so `execute()` broadcasts through the same
 *    chain layer everything else uses.
 *
 * Both depend only on the `BlockchainAdapter` interface, so they run against a fake
 * adapter in tests and a live RPC-backed adapter in production, unchanged.
 */
import type { BlockchainAdapter, TokenRef } from '@intent-wallet/chains';
import { getChain } from '@intent-wallet/chains';
import type { ExecutionPlan, Holding, PlanStep } from '@intent-wallet/intents';
import type { ChainGateway } from './execution.js';

/** Read one chain's native + token balances for an address into planner `Holding`s. */
export async function readChainHoldings(
  adapter: BlockchainAdapter,
  address: string,
  tokens: readonly TokenRef[] = [],
): Promise<Holding[]> {
  const chainId = adapter.chainId;
  const native = getChain(chainId).native;
  const holdings: Holding[] = [];

  const nativeBase = await adapter.getNativeBalance(address);
  if (nativeBase > 0n) {
    holdings.push({
      symbol: native.symbol,
      decimals: native.decimals,
      totalBase: nativeBase,
      chains: [{ chainId, base: nativeBase }],
    });
  }

  if (tokens.length > 0) {
    for (const b of await adapter.getTokenBalances(address, [...tokens])) {
      if (b.amount > 0n) {
        holdings.push({
          symbol: b.symbol,
          decimals: b.decimals,
          totalBase: b.amount,
          chains: [{ chainId, base: b.amount }],
        });
      }
    }
  }
  return holdings;
}

/** Merge holdings across chains/reads by symbol — sum totals, concatenate provenance. */
export function mergeHoldings(...lists: Holding[][]): Holding[] {
  const map = new Map<string, Holding>();
  for (const list of lists) {
    for (const h of list) {
      const key = h.symbol.toUpperCase();
      const existing = map.get(key);
      if (existing) {
        existing.totalBase += h.totalBase;
        existing.chains = [...existing.chains, ...h.chains];
      } else {
        map.set(key, { ...h, chains: [...h.chains] });
      }
    }
  }
  return [...map.values()];
}

/**
 * A `ChainGateway` (execution seam) backed by the real chain adapters. `adapterFor`
 * maps a plan step's chain id to the adapter. NOTE: `status` reads a single snapshot;
 * a production gateway polls to a terminal state before returning (the engine's
 * `confirm` expects terminal). A non-terminal read maps to neither confirmed nor
 * reverted, which the engine treats conservatively.
 */
export class AdapterChainGateway implements ChainGateway {
  constructor(private readonly adapterFor: (chainId: string) => BlockchainAdapter) {}

  async broadcast(step: PlanStep, _plan: ExecutionPlan, rawTx: string): Promise<{ txid: string }> {
    const r = await this.adapterFor(step.chainId).broadcastRawTransaction(rawTx);
    return { txid: r.txid };
  }

  async status(chainId: string, txid: string): Promise<{ confirmed: boolean; reverted: boolean }> {
    const s = await this.adapterFor(chainId).getTransactionStatus(txid);
    return { confirmed: s.state === 'confirmed', reverted: s.state === 'failed' };
  }
}
