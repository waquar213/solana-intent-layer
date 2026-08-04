/**
 * Cross-ecosystem portfolio balances — the read that finally makes the wallet UNIVERSAL.
 * Given the client's OWN public addresses (EVM + BTC + SOL, derived on-device from the same
 * seed — the API can't derive them non-custodially), discover REAL holdings across all three
 * ecosystems (EVM multi-chain via the merged source, native BTC via Esplora, native SOL via a
 * public RPC), value them with LIVE prices, and return a portfolio summary.
 *
 * Read-only public chain data. Each ecosystem source validates its own address (fail-loud on
 * a malformed one); a source whose network is down is dropped (best-effort), but if EVERY
 * provided source fails the error is surfaced — an empty portfolio is never presented as real.
 * No price is invented: an unpriced asset carries a null value and is excluded from the total.
 */
import { baseToDecimal } from '@intent-wallet/intents';
import { usdToMicros } from '@intent-wallet/portfolio';
import type { Holding } from '@intent-wallet/runtime';
import type { PriceFetch } from './runtime-provider.js';

/** The three ecosystem holdings readers (each takes that ecosystem's address). */
export interface EcosystemSources {
  evm: (evmAddress: string) => Promise<Holding[]>;
  btc: (btcAddress: string) => Promise<Holding[]>;
  sol: (solAddress: string) => Promise<Holding[]>;
}

/** The client's public addresses to discover (any subset). */
export interface EcosystemAddresses {
  evm?: string;
  btc?: string;
  sol?: string;
}

export interface BalanceHolding {
  symbol: string;
  /** Decimal-string amount held (across chains). */
  amount: string;
  decimals: number;
  chains: { chainId: string; base: string }[];
  /** USD price per whole token, or null if unknown. */
  priceUsd: string | null;
  /** Position value in micro-USD (string), or null when the price is unknown. */
  valueMicros: string | null;
}

export interface BalancesResult {
  holdings: BalanceHolding[];
  totalValueMicros: string;
  /** Value split by ecosystem (micro-USD strings) — the "universal" total, broken down. */
  byEcosystem: { evm: string; bitcoin: string; solana: string };
  /** Requested ecosystems whose data could not be fetched (network down) — their holdings
   *  and value are EXCLUDED from the total, so the caller can say so instead of implying it
   *  is the full picture. Empty when everything requested came back. */
  unavailable: string[];
  /** Symbols the user HOLDS (base > 0) that the price feed could not value — EXCLUDED from the total.
   *  A non-empty list means totalValueMicros is a PARTIAL sum; if it covers EVERY held symbol (e.g. a
   *  price-feed outage) the total is 0 despite real holdings, so the caller must not present it as a
   *  complete "$0.00". Mirrors the client's own anyPrice/heldUnpriced guard. */
  unpricedSymbols: string[];
}

/** Which ecosystem a chain id belongs to (BTC / SOL / everything-else-is-EVM). */
function ecosystemOf(chainId: string): 'bitcoin' | 'solana' | 'evm' {
  if (chainId.startsWith('bip122:')) return 'bitcoin';
  if (chainId.startsWith('solana:')) return 'solana';
  return 'evm';
}

/** Discovers a cross-ecosystem portfolio for the client's public addresses. */
export type BalancesReader = (addrs: EcosystemAddresses) => Promise<BalancesResult>;

/**
 * Build the reader. `sources` are the per-ecosystem holdings functions; `pricesFor` is a LIVE
 * price fetch (real cross-ecosystem values, even in local dev where the planner uses a fixture).
 */
export function makeBalancesReader(
  sources: EcosystemSources,
  pricesFor: PriceFetch,
): (addrs: EcosystemAddresses) => Promise<BalancesResult> {
  return async (addrs: EcosystemAddresses): Promise<BalancesResult> => {
    const requested: { label: string; run: Promise<Holding[]> }[] = [];
    if (addrs.evm) requested.push({ label: 'Ethereum & L2s', run: sources.evm(addrs.evm) });
    if (addrs.btc) requested.push({ label: 'Bitcoin', run: sources.btc(addrs.btc) });
    if (addrs.sol) requested.push({ label: 'Solana', run: sources.sol(addrs.sol) });

    const settled = await Promise.allSettled(requested.map((r) => r.run));
    // If addresses were provided but EVERY source failed, surface the real error rather than
    // returning an empty portfolio that looks real.
    if (requested.length > 0 && settled.every((r) => r.status === 'rejected')) {
      throw (settled[0] as PromiseRejectedResult).reason;
    }

    // Collect what succeeded; name what didn't, so the total is HONEST about its coverage.
    const holdings: Holding[] = [];
    const unavailable: string[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') holdings.push(...r.value);
      else unavailable.push(requested[i]!.label);
    });

    // Distinct symbols across ecosystems (BTC/SOL/ETH…) — no cross-ecosystem merge needed;
    // the EVM source already merged its own chains. If the price feed is down (rate-limited),
    // still return the real holdings — just unpriced (null USD) — instead of failing the request.
    const prices = await pricesFor().catch(() => ({}) as Record<string, string>);
    let total = 0n;
    const byEco = { evm: 0n, bitcoin: 0n, solana: 0n };
    const unpricedSymbols: string[] = [];
    const out: BalanceHolding[] = holdings.map((h) => {
      const price = prices[h.symbol.toUpperCase()];
      let valueMicros: string | null = null;
      if (price !== undefined) {
        const v = (h.totalBase * usdToMicros(price)) / 10n ** BigInt(h.decimals);
        total += v;
        // A symbol lives in ONE ecosystem (ETH/USDC = EVM, BTC = bitcoin, SOL = solana), so
        // the whole position's value goes to that ecosystem's subtotal.
        byEco[ecosystemOf(h.chains[0]?.chainId ?? 'evm')] += v;
        valueMicros = v.toString();
      } else if (h.totalBase > 0n) {
        // Held but unpriced — its value is NOT in `total`; record it so the client can say the total is partial.
        unpricedSymbols.push(h.symbol);
      }
      return {
        symbol: h.symbol,
        amount: baseToDecimal(h.totalBase, h.decimals),
        decimals: h.decimals,
        chains: h.chains.map((c) => ({ chainId: c.chainId, base: c.base.toString() })),
        priceUsd: price ?? null,
        valueMicros,
      };
    });
    // Highest value first (unpriced sink to the bottom).
    out.sort((a, b) => {
      const av = BigInt(a.valueMicros ?? '0');
      const bv = BigInt(b.valueMicros ?? '0');
      return av < bv ? 1 : av > bv ? -1 : 0;
    });
    return {
      holdings: out,
      totalValueMicros: total.toString(),
      byEcosystem: { evm: byEco.evm.toString(), bitcoin: byEco.bitcoin.toString(), solana: byEco.solana.toString() },
      unavailable,
      unpricedSymbols,
    };
  };
}
