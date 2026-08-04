# ADR-0012 — Indexing: per-chain checkpointed indexers, reorg-aware

- Status: Accepted
- Date: 2026-07-05
- Deciders: Blockchain Lead, Backend Lead

## Context

We must turn chains into normalized `chain.events.v1` for registered addresses: transfers (native/ERC-20/SPL), confirmations, and reorgs — across BTC, 6 EVM chains, and Solana (the throughput driver, ~50k events/s target).

## Decision

**Self-operated, per-ecosystem indexers** with a checkpointed cursor in PG and at-least-once emission (consumers dedupe). EVM: `eth_getLogs` windows + `finalized`-tag head tracking. BTC: block scan + mempool watch. SOL: account websocket subscriptions + slot polling. Reorgs emit compensating `chain.event.reverted`. Solana indexer carries a **Rust rewrite budget** ([ADR-0002](0002-primary-language-typescript.md)).

## Alternatives considered

| Option                      | Pros                                                                | Cons                                                                      | Verdict                               |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| **Self-operated indexers**  | full control, no per-query vendor cost at scale, custom reorg logic | we operate them                                                           | **chosen**                            |
| The Graph / hosted indexers | fast start                                                          | cost + coverage gaps (esp. BTC/SOL), less control over finality semantics | rejected for core money data          |
| Alchemy/QuickNode webhooks  | managed                                                             | vendor lock, cost at scale, uneven multi-chain support                    | rejected (usable as a bootstrap only) |
| Poll balances on demand     | trivial                                                             | can't detect incoming funds proactively; hammers RPC                      | rejected                              |

## Consequences

- **Maintenance:** one indexer pattern per ecosystem; cursor-resume makes crashes a non-event; raw event archive in S3 enables rebuild-by-replay.
- **Scaling:** watch-lists partitioned across pods by address hash; Solana gets Rust when the TS pipeline can't hold throughput (profiling-triggered, not speculative).
- **Security:** `provisional` flag until finality; reorg compensation so projections never show reverted money as final; rebuildable from archive (disaster = replay, not restore).
