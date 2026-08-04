/**
 * Injected sources — the pipeline's capabilities. The settlement coordinator is
 * a pure orchestrator; each stage delegates to one of these. Two are
 * load-bearing for safety:
 *  - `preflight` re-validates the plan against CURRENT state (balance, quote TTL,
 *    risk, gas, policy) and is a MANDATORY stage — a failed pre-flight stops the
 *    settlement before any transaction is prepared or broadcast.
 *  - `executor` wraps the Execution engine (sign on device → broadcast → confirm);
 *    settlement never holds keys and never broadcasts itself.
 * `store.claim` is the idempotency gate: a settlement id derived from the plan id
 * can be claimed once, so re-settling the same plan never double-executes.
 */
import type { ExecutionPlan, LedgerEntry, PreflightResult, Settlement, StageResult } from './types.js';

export interface PreflightValidator {
  validate(plan: ExecutionPlan): Promise<PreflightResult>;
}

/** A pipeline stage capability (liquidity / quote-lock / gas / prepare / execute / cross-chain / reconcile / compensate). */
export interface StageCapability {
  run(plan: ExecutionPlan): Promise<StageResult>;
}

export interface PortfolioUpdater {
  update(plan: ExecutionPlan): Promise<void>;
}

export interface SettlementNotifier {
  notify(settlement: Settlement): Promise<void>;
}

export interface SettlementStore {
  /** Idempotency: returns false if a settlement with this id already exists. */
  claim(id: string): Promise<boolean>;
  save(settlement: Settlement): Promise<void>;
  load(id: string): Promise<Settlement | null>;
  appendLedger(entry: LedgerEntry): Promise<void>;
  ledger(settlementId: string): Promise<LedgerEntry[]>;
}

export interface SettlementSources {
  preflight: PreflightValidator;
  liquidity: StageCapability;
  quoteLock: StageCapability;
  gas: StageCapability;
  prepare: StageCapability;
  executor: StageCapability;
  crossChain: StageCapability;
  reconcile: StageCapability;
  portfolio: PortfolioUpdater;
  notifier: SettlementNotifier;
  store: SettlementStore;
  /** Optional: reverses completed legs when a settlement must be compensated. */
  compensator?: StageCapability;
}

// --- In-memory implementations for tests + defaults ---

const OK: StageCapability = { run: () => Promise.resolve({ ok: true, detail: 'ok' }) };
const OK_PREFLIGHT: PreflightValidator = { validate: () => Promise.resolve({ ok: true, checks: [] }) };

export class InMemorySettlementStore implements SettlementStore {
  private readonly settlements = new Map<string, Settlement>();
  private readonly claimed = new Set<string>();
  private readonly ledgers = new Map<string, LedgerEntry[]>();

  claim(id: string): Promise<boolean> {
    if (this.claimed.has(id)) return Promise.resolve(false);
    this.claimed.add(id);
    return Promise.resolve(true);
  }
  save(settlement: Settlement): Promise<void> {
    this.settlements.set(settlement.id, structuredClone(settlement));
    return Promise.resolve();
  }
  load(id: string): Promise<Settlement | null> {
    const s = this.settlements.get(id);
    return Promise.resolve(s ? structuredClone(s) : null);
  }
  appendLedger(entry: LedgerEntry): Promise<void> {
    const list = this.ledgers.get(entry.settlementId) ?? [];
    list.push(structuredClone(entry));
    this.ledgers.set(entry.settlementId, list);
    return Promise.resolve();
  }
  ledger(settlementId: string): Promise<LedgerEntry[]> {
    return Promise.resolve((this.ledgers.get(settlementId) ?? []).map((e) => structuredClone(e)));
  }
}

export type SourceOverrides = Partial<SettlementSources>;

/** Sources where every stage succeeds by default; override the ones a test wants to fail. */
export function createInMemorySources(overrides: SourceOverrides = {}): SettlementSources {
  return {
    preflight: overrides.preflight ?? OK_PREFLIGHT,
    liquidity: overrides.liquidity ?? OK,
    quoteLock: overrides.quoteLock ?? OK,
    gas: overrides.gas ?? OK,
    prepare: overrides.prepare ?? OK,
    executor: overrides.executor ?? {
      run: () => Promise.resolve({ ok: true, detail: 'executed', ids: { txids: ['0xtx'], executionId: 'exec-1' } }),
    },
    crossChain: overrides.crossChain ?? OK,
    reconcile: overrides.reconcile ?? OK,
    portfolio: overrides.portfolio ?? { update: () => Promise.resolve() },
    notifier: overrides.notifier ?? { notify: () => Promise.resolve() },
    store: overrides.store ?? new InMemorySettlementStore(),
    ...(overrides.compensator ? { compensator: overrides.compensator } : {}),
  };
}
