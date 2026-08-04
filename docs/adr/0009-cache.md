# ADR-0009 — Cache: Redis (role-separated instances)

- Status: Accepted
- Date: 2026-07-05
- Deciders: Backend Lead, SRE Lead

## Context

The read path (portfolio, prices) outnumbers writes ~100:1. We also need rate-limit counters, session revocation, consumer-dedup sets, and (Stage A) the event bus.

## Decision

**Redis** (ElastiCache), **separated by role** into distinct instance groups: `cache`, `rt` (rate-limit/sessions), `prices`, `dedupe`, and `streams` (Stage A bus). Never one shared Redis. Key namespaces documented in `packages/events`.

## Alternatives considered

| Option                        | Pros                                                               | Cons                                      | Verdict               |
| ----------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | --------------------- |
| **Redis (role-separated)**    | ubiquitous, versatile (cache/counters/streams/pubsub), low latency | in-memory cost; must design TTLs/eviction | **chosen**            |
| Memcached                     | simple, fast cache                                                 | cache-only; no streams/pubsub/counters    | rejected (too narrow) |
| Valkey                        | Redis-compatible OSS fork                                          | fine; adopt if licensing/cost shifts      | recorded alternative  |
| DynamoDB DAX / app-tier cache | managed                                                            | couples to Dynamo; less flexible          | rejected              |

## Consequences

- **Maintenance:** clear per-role TTL/eviction policies ([architecture 03 §2](../architecture/03-data.md)); one technology covering several needs early.
- **Scaling:** cluster mode + replicas per role; role separation means a hot cache workload can't evict rate-limit counters (correctness) or price fan-out.
- **Security:** `rt` and `dedupe` use `noeviction` so security-relevant state (revocations, idempotency) is never silently dropped; in-transit + at-rest encryption; no secrets cached.
