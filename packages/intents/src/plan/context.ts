/**
 * The injected context the planner needs — holdings, prices, recipient
 * resolution, routing, and risk. Every one is an interface so the planner is a
 * PURE function of its inputs (testable with fixtures) and the real
 * implementations (chain adapters, price service, identity, route optimizer,
 * risk engine) plug in without changing the engine (ADR-0030/0032).
 */
import type { RecipientResolution } from '@intent-wallet/identity';
import type { RiskReport } from '../schema.js';

/** One asset the user holds, merged across chains (from the Portfolio engine). */
export interface Holding {
  symbol: string;
  decimals: number;
  /** Total base units across chains. */
  totalBase: bigint;
  /** Per-chain provenance (which chain the asset lives on). */
  chains: Array<{ chainId: string; base: bigint }>;
}

export interface HoldingsProvider {
  get(symbol: string): Holding | undefined;
  list(): Holding[];
}

export interface PriceProvider {
  /** USD price per whole token as a decimal string, or undefined if unknown. */
  getUsd(symbol: string): string | undefined;
}

/** One leg of a route the optimizer returns. */
export interface RouteLeg {
  kind: 'swap' | 'bridge' | 'approve';
  chainId: string;
  venue: string;
  description: string;
}

export interface Route {
  legs: RouteLeg[];
  /** Guaranteed minimum output in base units of the destination asset. */
  outMinBase: bigint;
  outDecimals: number;
  /** Total fees across the route, in micro-USD. */
  feeMicros: bigint;
  slippageBps: number;
  etaSeconds: number;
}

export interface RouteProvider {
  findRoute(input: {
    fromSymbol: string;
    toSymbol: string;
    amountBase: bigint;
    fromDecimals: number;
  }): Promise<Route | null>;
}

export interface RiskProvider {
  scan(subject: { type: 'address' | 'token' | 'recipient'; value: string }): Promise<RiskReport>;
}

/** Everything the planner depends on. */
export interface EngineContext {
  holdings: HoldingsProvider;
  prices: PriceProvider;
  routes: RouteProvider;
  risk: RiskProvider;
  resolveRecipient(query: string): Promise<RecipientResolution>;
  /** Which chain a transfer of `symbol` should default to (usually where it's held / cheapest). */
  defaultChainFor(symbol: string): string;
  /** Network fee estimate for one operation on a chain, in micro-USD. */
  estimateFeeMicros(chainId: string): Promise<bigint>;
  /**
   * Base units of `symbol` already sent OUT earlier in this session — the caller's honest ledger
   * of the user's own executed transfers. Lets the planner refuse a transfer that COMPLETES a
   * whole-wallet drain across several individually-under-threshold sends (a per-transaction check
   * can't see cumulative depletion). Optional; absent → 0, i.e. single-transaction behavior.
   */
  sessionOutflowBase?(symbol: string): bigint;
  /** Stable id generator for plans/intents (injected — the package does no clock/RNG). */
  ids: { plan(): string; intent(): string };
}

/** A convenient in-memory holdings provider for tests and simple callers. */
export class MapHoldings implements HoldingsProvider {
  readonly #map: Map<string, Holding>;
  constructor(holdings: Holding[]) {
    this.#map = new Map(holdings.map((h) => [h.symbol.toUpperCase(), h]));
  }
  get(symbol: string): Holding | undefined {
    return this.#map.get(symbol.toUpperCase());
  }
  list(): Holding[] {
    return [...this.#map.values()];
  }
}
