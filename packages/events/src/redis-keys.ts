/**
 * Redis key registry (architecture 03 §2). Every key is namespaced and built
 * through a function here — no ad-hoc string concatenation at call sites, so
 * key shapes, TTLs, and the owning instance group stay documented in one place.
 */

/** Which Redis instance group a key family lives in (handbook / architecture 03 §2). */
export type RedisGroup = 'cache' | 'rt' | 'prices' | 'dedupe';

export interface RedisKeySpec {
  group: RedisGroup;
  /** TTL in seconds, or null for keys bounded by design (counters, dedupe sets). */
  ttlSeconds: number | null;
}

export const redisKeys = {
  portfolio: (identityId: string) => `pf:${identityId}`,
  tokenMeta: (chainId: string, address: string) => `tok:${chainId}:${address.toLowerCase()}`,
  routeQuote: (hash: string) => `rt:${hash}`,
  price: (assetId: string) => `px:${assetId}`,
  rateLimit: (scope: string, key: string) => `rl:${scope}:${key}`,
  sessionRevoked: (jti: string) => `rev:${jti}`,
  seen: (group: string, eventId: string) => `seen:${group}:${eventId}`,
  singleflightLock: (key: string) => `lock:${key}`,
} as const;

/** TTL/group policy per key family. Keeps the caching contract (architecture 03 §2) in code. */
export const REDIS_KEY_SPEC = {
  portfolio: { group: 'cache', ttlSeconds: 60 },
  tokenMeta: { group: 'cache', ttlSeconds: 86_400 },
  routeQuote: { group: 'cache', ttlSeconds: 30 },
  price: { group: 'prices', ttlSeconds: 60 },
  rateLimit: { group: 'rt', ttlSeconds: null },
  sessionRevoked: { group: 'rt', ttlSeconds: null },
  seen: { group: 'dedupe', ttlSeconds: 604_800 },
  singleflightLock: { group: 'cache', ttlSeconds: 2 },
} as const satisfies Record<keyof typeof redisKeys, RedisKeySpec>;
