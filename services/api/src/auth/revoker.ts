/**
 * Session revocation — the missing "kill a token" control for stateless JWTs.
 *
 * A JWT is valid until it expires; without a revocation list a stolen or leaked
 * token is usable for its full lifetime. This adds two kill switches:
 *   • revoke(jti)         — invalidate ONE session (a normal sign-out / lost device),
 *   • revokeAllFor(sub)   — "sign out everywhere": invalidate every token issued
 *                           at/before now for a subject (password change, theft).
 *
 * Async so the store can be shared Redis (multi-replica — a token revoked on pod A
 * must be dead on pod B) or in-memory (local). Nothing is stored longer than a
 * token could live, so the lists stay bounded.
 */
import type { Redis } from 'ioredis';

export interface RevocationCheck {
  sub: string;
  iat: number;
  jti?: string;
}

export interface SessionRevoker {
  /** True if this token is individually revoked OR predates a sign-out-everywhere for its subject. */
  isRevoked(token: RevocationCheck): Promise<boolean>;
  /** Revoke a single token by its jti; kept only until `ttlSec` (its remaining life). */
  revoke(jti: string, ttlSec: number): Promise<void>;
  /** Sign out everywhere: invalidate every token for `sub` issued at/before `beforeSec`. */
  revokeAllFor(sub: string, beforeSec: number): Promise<void>;
}

/** In-memory revoker — local dev + tests (single process). */
export class InMemorySessionRevoker implements SessionRevoker {
  readonly #jti = new Map<string, number>(); // jti → expiry (unix sec)
  readonly #notBefore = new Map<string, number>(); // sub → tokens iat < this are dead

  isRevoked(token: RevocationCheck): Promise<boolean> {
    if (token.jti !== undefined) {
      const exp = this.#jti.get(token.jti);
      if (exp !== undefined && exp >= Math.floor(Date.now() / 1000)) return Promise.resolve(true);
    }
    const cutoff = this.#notBefore.get(token.sub.toLowerCase());
    // `<=`, not `<`: iat and the revoke cutoff are 1-second-granular, so a token minted in the SAME second
    // as "sign out everywhere" would survive strict `<`. Revoke it too (a re-sign-in in that same second is
    // negligible collateral and errs safe).
    return Promise.resolve(cutoff !== undefined && token.iat <= cutoff);
  }

  revoke(jti: string, ttlSec: number): Promise<void> {
    this.#jti.set(jti, Math.floor(Date.now() / 1000) + Math.max(0, ttlSec));
    return Promise.resolve();
  }

  revokeAllFor(sub: string, beforeSec: number): Promise<void> {
    const key = sub.toLowerCase();
    // Never move the cutoff backwards (monotonic) so an older call can't un-revoke.
    this.#notBefore.set(key, Math.max(this.#notBefore.get(key) ?? 0, beforeSec));
    return Promise.resolve();
  }
}

/** The minimal Redis surface the revoker needs (ioredis or a test mock satisfies it). */
export interface RevokerRedis {
  set(key: string, value: string, mode: 'EX', ttlSec: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

const jtiKey = (jti: string): string => `siwe:revoked:jti:${jti}`;
const subKey = (sub: string): string => `siwe:signedout:${sub.toLowerCase()}`;

/** Redis-backed revoker — shared across replicas; TTLs let Redis expire dead entries. */
export class RedisSessionRevoker implements SessionRevoker {
  // A generous horizon for the sign-out-everywhere marker (>= max token life).
  constructor(
    private readonly redis: RevokerRedis,
    private readonly notBeforeTtlSec = 7 * 24 * 3600,
  ) {}

  async isRevoked(token: RevocationCheck): Promise<boolean> {
    if (token.jti !== undefined && (await this.redis.get(jtiKey(token.jti)))) return true;
    const cutoff = await this.redis.get(subKey(token.sub));
    return cutoff !== null && token.iat <= Number(cutoff); // `<=`: also kill a token minted in the same second as revoke-all
  }

  async revoke(jti: string, ttlSec: number): Promise<void> {
    await this.redis.set(jtiKey(jti), '1', 'EX', Math.max(1, ttlSec));
  }

  async revokeAllFor(sub: string, beforeSec: number): Promise<void> {
    const existing = await this.redis.get(subKey(sub));
    const next = Math.max(existing !== null ? Number(existing) : 0, beforeSec);
    await this.redis.set(subKey(sub), String(next), 'EX', this.notBeforeTtlSec);
  }
}

/** Adapt an ioredis client to the RevokerRedis surface (the method set overlaps exactly). */
export function redisRevoker(redis: Redis): SessionRevoker {
  return new RedisSessionRevoker(redis as unknown as RevokerRedis);
}
