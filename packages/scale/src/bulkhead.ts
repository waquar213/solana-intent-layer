/**
 * Bulkhead — concurrency isolation + bounded queue. It caps how many calls run at
 * once against a dependency and how many may wait, so one slow dependency can't
 * consume every worker thread and sink unrelated traffic with it (the ship's-hull
 * metaphor: a flooded compartment doesn't drown the vessel). A full bulkhead
 * REJECTS immediately — that rejection is the backpressure signal upstream needs;
 * an unbounded wait queue would just move the outage, not contain it.
 *
 * Pure counters, no timers: `acquire()` reserves a slot or a queue place or is
 * rejected; `release()` frees a slot and promotes one waiter. Deterministic.
 */
export interface BulkheadOptions {
  /** Max concurrent executions. */
  maxConcurrent: number;
  /** Max callers allowed to wait for a slot (0 = fail fast, never queue). */
  maxQueue: number;
}

export type AcquireOutcome = 'run' | 'queued' | 'rejected';

export interface BulkheadStats {
  inUse: number;
  queued: number;
  maxConcurrent: number;
  maxQueue: number;
}

export class Bulkhead {
  #inUse = 0;
  #queued = 0;
  readonly #maxConcurrent: number;
  readonly #maxQueue: number;

  constructor(options: BulkheadOptions) {
    if (!(options.maxConcurrent > 0)) throw new RangeError('maxConcurrent must be > 0');
    if (options.maxQueue < 0) throw new RangeError('maxQueue must be >= 0');
    this.#maxConcurrent = Math.floor(options.maxConcurrent);
    this.#maxQueue = Math.floor(options.maxQueue);
  }

  /**
   * Try to take a slot. `run` = execute now; `queued` = wait (a later `release`
   * promotes you); `rejected` = shed load (both slots and the queue are full).
   */
  acquire(): AcquireOutcome {
    if (this.#inUse < this.#maxConcurrent) {
      this.#inUse += 1;
      return 'run';
    }
    if (this.#queued < this.#maxQueue) {
      this.#queued += 1;
      return 'queued';
    }
    return 'rejected';
  }

  /** Release a running slot. If callers are queued, one is promoted to running. */
  release(): void {
    if (this.#inUse === 0) return; // never go negative on an over-release
    this.#inUse -= 1;
    if (this.#queued > 0) {
      this.#queued -= 1;
      this.#inUse += 1; // promote a waiter straight into the freed slot
    }
  }

  /** Drop a queued caller that gave up before being promoted (e.g. client timeout). */
  abandonQueued(): void {
    if (this.#queued > 0) this.#queued -= 1;
  }

  stats(): BulkheadStats {
    return { inUse: this.#inUse, queued: this.#queued, maxConcurrent: this.#maxConcurrent, maxQueue: this.#maxQueue };
  }
}

export function createBulkhead(options: BulkheadOptions): Bulkhead {
  return new Bulkhead(options);
}
