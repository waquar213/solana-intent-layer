/**
 * ProviderRegistry — holds the plugins of one kind and runs operations against
 * them by HEALTH SCORE, with automatic failover. `run` picks the healthiest
 * available provider and falls over to the next on failure; `collect` fans out
 * to all healthy providers (for quote aggregation). Outcomes feed the
 * HealthTracker so selection self-corrects — a flaky provider is shed and
 * probed later without any manual intervention (ADR-0034).
 */
import type { Provider } from './provider.js';
import { HealthTracker, type HealthSnapshot } from './health.js';
import { ProviderError } from './errors.js';

export interface ProviderRegistryOptions {
  health?: HealthTracker;
  now?: () => number;
}

export class ProviderRegistry<T extends Provider> {
  readonly #providers = new Map<string, T>();
  readonly #health: HealthTracker;
  readonly #now: () => number;

  constructor(options: ProviderRegistryOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#health = options.health ?? new HealthTracker({ now: this.#now });
  }

  register(provider: T): void {
    this.#providers.set(provider.id, provider);
  }

  list(): T[] {
    return [...this.#providers.values()];
  }

  snapshots(): HealthSnapshot[] {
    return this.list().map((p) => this.#health.snapshot(p.id));
  }

  /** Providers that may be called now, best score first. */
  #candidates(): T[] {
    return this.list()
      .filter((p) => this.#health.available(p.id))
      .sort((a, b) => this.#health.score(b.id) - this.#health.score(a.id));
  }

  /** Runs `op` on the healthiest available provider, failing over on error. */
  async run<R>(op: (provider: T) => Promise<R>): Promise<{ providerId: string; result: R }> {
    const candidates = this.#candidates();
    if (candidates.length === 0) {
      throw new ProviderError('NO_PROVIDERS', 'no healthy providers available');
    }
    let lastError: unknown;
    for (const provider of candidates) {
      const started = this.#now();
      try {
        const result = await op(provider);
        this.#health.recordSuccess(provider.id, this.#now() - started);
        return { providerId: provider.id, result };
      } catch (err) {
        this.#health.recordFailure(provider.id);
        lastError = err;
      }
    }
    throw new ProviderError('ALL_PROVIDERS_FAILED', 'every provider failed', { cause: lastError });
  }

  /** Runs `op` on ALL available providers concurrently; returns only the successes. */
  async collect<R>(op: (provider: T) => Promise<R>): Promise<Array<{ providerId: string; result: R }>> {
    type Outcome = { providerId: string; result: R } | null;
    const candidates = this.#candidates();
    const settled = await Promise.all(
      candidates.map(async (provider): Promise<Outcome> => {
        const started = this.#now();
        try {
          const result = await op(provider);
          this.#health.recordSuccess(provider.id, this.#now() - started);
          return { providerId: provider.id, result };
        } catch {
          this.#health.recordFailure(provider.id);
          return null;
        }
      }),
    );
    return settled.filter((s): s is { providerId: string; result: R } => s !== null);
  }
}
