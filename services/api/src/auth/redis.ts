/**
 * Redis-backed SIWE nonce store — the MULTI-REPLICA production implementation.
 * Sign-in issues a challenge on one pod and verifies it on (possibly) another, so
 * the nonce must live in a store all pods share. Redis also gives us free TTL
 * expiry and an ATOMIC get-and-delete (GETDEL), which is what makes the nonce truly
 * one-time-use under concurrency — two simultaneous verifies of the same nonce can
 * never both succeed.
 */
import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import type { NonceStore } from './siwe.js';

/** The minimal Redis surface the nonce store needs — lets ioredis (or a test mock) satisfy it. */
export interface RedisClient {
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  /** Atomic get-and-delete (Redis 6.2+). Returns the value or null if absent. */
  getdel(key: string): Promise<string | null>;
  quit(): Promise<unknown>;
}

const keyFor = (nonce: string): string => `siwe:nonce:${nonce}`;

export class RedisNonceStore implements NonceStore {
  constructor(private readonly redis: RedisClient) {}

  async issue(address: string, ttlMs: number): Promise<{ nonce: string; expiresAt: number }> {
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + ttlMs;
    // Redis owns expiry via PX — no manual clock check needed on consume.
    await this.redis.set(keyFor(nonce), address.toLowerCase(), 'PX', ttlMs);
    return { nonce, expiresAt };
  }

  async consume(nonce: string, address: string): Promise<boolean> {
    // Atomic: even if the key existed it is now gone, so a replay finds nothing.
    const stored = await this.redis.getdel(keyFor(nonce));
    if (!stored) return false; // missing, already-consumed, or TTL-expired
    return stored === address.toLowerCase();
  }
}

/**
 * Build a real ioredis client from a connection URL (production). An `error`
 * listener is MANDATORY: without one, ioredis re-emits connection errors as an
 * unhandled 'error' event and Node crashes the process on a transient Redis blip.
 * With it, the client reconnects in the background and the /readyz probe pulls the
 * pod from rotation until Redis is back — degraded, not crash-looping.
 */
export function createRedis(url: string, onError?: (err: unknown) => void): Redis {
  const client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
  client.on('error', (err) => onError?.(err));
  return client;
}
