/**
 * ExecutionStore — persistence for execution state, so a process crash resumes
 * exactly where it stopped. The real backend uses Postgres (the `executions`
 * table, architecture 03); this in-memory impl serves tests and simple callers.
 * The engine saves after EVERY state transition — durability is the whole point.
 */
import type { Execution } from './state.js';

export interface ExecutionStore {
  save(execution: Execution): Promise<void>;
  load(id: string): Promise<Execution | null>;
}

export class InMemoryExecutionStore implements ExecutionStore {
  readonly #map = new Map<string, Execution>();

  async save(execution: Execution): Promise<void> {
    // Deep-clone so callers can't mutate persisted state by reference.
    this.#map.set(execution.id, structuredClone(execution));
  }

  async load(id: string): Promise<Execution | null> {
    const found = this.#map.get(id);
    return found ? structuredClone(found) : null;
  }
}
