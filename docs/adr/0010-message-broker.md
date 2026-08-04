# ADR-0010 — Message broker: Redis Streams → Kafka

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Backend Lead, SRE Lead

## Context

Event-driven architecture ([architecture 01 §4](../architecture/01-system-overview.md)) needs an ordered, replayable log with long retention and cross-region mirroring at scale — but a 4-person team should not run Kafka on day one.

## Decision

**Redis Streams** as the Stage-A bus (we already run Redis; ops ≈ 0). Migrate to **Kafka (MSK)** at Stage B when volume/retention demand it. The consumer API in `packages/events` abstracts the bus so migration is an adapter swap + topic backfill.

## Alternatives considered

| Option                    | Pros                                                       | Cons                                                   | Verdict                                       |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------- |
| **Redis Streams → Kafka** | start with zero new infra, grow into the industry standard | a migration event later (de-risked by the abstraction) | **chosen**                                    |
| Kafka from day 1          | no migration                                               | heavy ops for a tiny team; innovation budget misspent  | rejected (premature)                          |
| NATS JetStream            | lighter than Kafka, good throughput                        | smaller ecosystem for CH sink / MirrorMaker            | recorded fallback if MSK cost/ops disappoints |
| SQS/SNS                   | fully managed                                              | no ordered replayable log or compaction                | rejected (wrong semantics)                    |

## Consequences

- **Maintenance:** one moving part early; the `packages/events` abstraction is the contract both buses honor, so services don't change when the bus does.
- **Scaling:** Kafka carries 50k+ events/s and multi-region mirroring (MirrorMaker 2) at Stage C; partitions keyed so per-entity order is total.
- **Security:** outbox pattern (event+state in one PG txn) prevents dual-write drift; consumers idempotent on event id; DLQs alert on money-path topics.
