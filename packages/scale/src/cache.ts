/**
 * Cache-invalidation engine. At 100:1 read:write, correctness is a caching problem —
 * and the hard part of caching is invalidation. Namespaces declare what they
 * `dependsOn`; a write to one namespace must cascade an invalidation to every
 * namespace that transitively depends on it (a `balance` write invalidates the
 * `portfolio` view that reads balances, and anything that reads the portfolio).
 *
 * This computes that cascade as a deterministic plan: direct target + transitive
 * dependents, ordered, with cycle protection (a `visited` set — a mis-declared
 * dependency loop yields a finite plan, never an infinite one). The engine returns
 * a PLAN; an injected invalidator applies it (decide-not-act, again), so a bug can
 * over- or under-invalidate but can't wedge the cache tier itself.
 */
import type { CacheNamespace, CacheTier, InvalidationPlan, InvalidationTarget, MutationEvent } from './types.js';

/** Reverse dependency edges: dependents[X] = namespaces to invalidate when X changes. */
export function buildDependents(namespaces: readonly CacheNamespace[]): Map<string, string[]> {
  const dependents = new Map<string, string[]>();
  for (const ns of namespaces) {
    for (const dep of ns.dependsOn) {
      const list = dependents.get(dep) ?? [];
      list.push(ns.name);
      dependents.set(dep, list);
    }
  }
  // Deterministic order for a stable plan.
  for (const [k, v] of dependents) dependents.set(k, [...v].sort());
  return dependents;
}

export function planInvalidation(event: MutationEvent, namespaces: readonly CacheNamespace[]): InvalidationPlan {
  const byName = new Map(namespaces.map((ns) => [ns.name, ns]));
  const dependents = buildDependents(namespaces);
  const scope = event.scope ?? null;

  const tierOf = (name: string): CacheTier => byName.get(name)?.tier ?? 'origin';

  const targets: InvalidationTarget[] = [];
  const visited = new Set<string>();

  // BFS from the directly-written namespace over reverse edges.
  const queue: Array<{ name: string; cause: 'direct' | 'cascade' }> = [{ name: event.namespace, cause: 'direct' }];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;
    if (visited.has(node.name)) continue;
    visited.add(node.name);

    targets.push({ namespace: node.name, tier: tierOf(node.name), scope, cause: node.cause });

    for (const dep of dependents.get(node.name) ?? []) {
      if (!visited.has(dep)) queue.push({ name: dep, cause: 'cascade' });
    }
  }

  return { event, targets };
}

/** Default namespace registry for the wallet's read path — a starting topology, tune per service. */
export const DEFAULT_CACHE_NAMESPACES: readonly CacheNamespace[] = [
  { name: 'price', tier: 'edge', ttlSeconds: 15, staleWhileRevalidate: true, dependsOn: [] },
  { name: 'token_metadata', tier: 'edge', ttlSeconds: 86_400, staleWhileRevalidate: true, dependsOn: [] },
  { name: 'balance', tier: 'service', ttlSeconds: 30, staleWhileRevalidate: true, dependsOn: [] },
  { name: 'route', tier: 'api', ttlSeconds: 10, staleWhileRevalidate: false, dependsOn: ['price'] },
  {
    name: 'portfolio',
    tier: 'api',
    ttlSeconds: 20,
    staleWhileRevalidate: true,
    dependsOn: ['balance', 'price', 'token_metadata'],
  },
];
