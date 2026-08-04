/**
 * Injected data sources — the seams between the pure intelligence core and the
 * outside world. The engine's analytics are pure functions over a
 * `PortfolioSnapshot`; these interfaces are how a snapshot gets built and how
 * live context (returns, history, market events, classification) arrives. Every
 * one is an interface so the engine stays offline-testable with fixtures and the
 * real implementations (chain adapters, price service, catalog) plug in later.
 */
import type { AssetClass, AssetReturnSeries, MarketEvent, NetWorthPoint, Position } from './types.js';

export interface PositionSource {
  /** Every position for an identity across chains/protocols (wallet, LP, staking, lending, …). */
  getPositions(identityId: string): Promise<Position[]>;
}

export interface PriceHistorySource {
  /** Aligned periodic return series for the given symbols (for correlation + beta). */
  getReturnSeries(symbols: string[]): Promise<AssetReturnSeries[]>;
}

export interface SnapshotStore {
  /** Historical net-worth series for performance/volatility/drawdown. */
  loadHistory(identityId: string): Promise<NetWorthPoint[]>;
  /** Append the latest net-worth point (called after an analysis). */
  appendPoint(identityId: string, point: NetWorthPoint): Promise<void>;
}

export interface MarketEventFeed {
  /** Market/security events since a cursor (bridge exploits, hacks, delistings, yield). */
  getEvents(sinceIso?: string): Promise<MarketEvent[]>;
}

export interface AssetCatalog {
  /** Canonical class for an asset; `undefined` lets the engine fall back to its built-in classifier. */
  classify(position: Position): AssetClass | undefined;
}
