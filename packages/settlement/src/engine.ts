/**
 * SettlementEngine — the public facade over the coordinator. `settle` is the
 * mandatory front door to execution (nothing else should call the Execution
 * engine directly); `resume` continues a persisted settlement; `history`
 * replays its ledger for observability.
 */
import { SettlementCoordinator, type CoordinatorOptions } from './coordinator.js';
import { createTestEnv, type SettlementEnv } from './env.js';
import { replay } from './ledger.js';
import { createInMemorySources, type SettlementSources, type SourceOverrides } from './sources.js';
import type { ExecutionPlan, Settlement } from './types.js';

export class SettlementEngine {
  private readonly coordinator: SettlementCoordinator;

  constructor(
    private readonly sources: SettlementSources,
    env: SettlementEnv,
    options: CoordinatorOptions = {},
  ) {
    this.coordinator = new SettlementCoordinator(sources, env, options);
  }

  /** Settle an approved plan through the full pipeline. Idempotent on the plan id. */
  settle(plan: ExecutionPlan): Promise<Settlement> {
    return this.coordinator.settle(plan);
  }

  /** Resume a persisted settlement from where it stopped. */
  resume(id: string, plan: ExecutionPlan): Promise<Settlement> {
    return this.coordinator.resume(id, plan);
  }

  /** The replayable, ordered history of a settlement (observability). */
  async history(id: string): Promise<ReturnType<typeof replay>> {
    return replay(await this.sources.store.ledger(id));
  }
}

export interface CreateSettlementEngineOptions {
  sources?: SourceOverrides;
  env?: SettlementEnv;
  options?: CoordinatorOptions;
}

/** Ergonomic wiring: a fully-functional engine over in-memory infra by default. */
export function createSettlementEngine(config: CreateSettlementEngineOptions = {}): SettlementEngine {
  return new SettlementEngine(
    createInMemorySources(config.sources ?? {}),
    config.env ?? createTestEnv(),
    config.options ?? {},
  );
}
