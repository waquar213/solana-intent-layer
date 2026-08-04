# ADR-0002 — TypeScript end-to-end (with a Rust performance budget)

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Lead Architect

## Context

The audited wallet core, the clients that run it, and the backend all benefit from one language and shared types. Two hot paths (Solana indexing, route-scoring inner loop) may eventually outgrow a GC'd runtime.

## Decision

**TypeScript everywhere** (strict, maxed compiler flags). Reserve a **Rust budget** for specific hot paths, triggered by profiling (>60% CPU at target throughput), never by fashion.

## Alternatives considered

| Option                    | Pros                                                                   | Cons                                                                | Verdict                         |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| **TypeScript everywhere** | one language core↔client↔server, shared Zod contracts, one hiring pool | GC pauses, raw throughput below Rust/Go                             | **chosen**                      |
| Go backend                | great concurrency, fast                                                | can't share the audited TS wallet core; two ecosystems              | rejected for product services   |
| Rust everywhere           | best perf & safety                                                     | re-implement + re-audit wallet core in Rust; slow product iteration | rejected (Rust used surgically) |
| Kotlin/JVM                | mature                                                                 | third ecosystem, no code share with device core                     | rejected                        |

## Consequences

- **Maintenance:** one toolchain, lint, and test story; contract types flow end-to-end so a schema change breaks compilation everywhere it matters. Rust modules are isolated behind clean interfaces so they don't infect the mainline.
- **Scaling:** TS handles product services fine; the Rust escape hatch handles the two paths that won't. See [ADR-0012](0012-blockchain-indexing.md).
- **Security:** the wallet core stays as the single audited TS implementation — no parallel re-implementation to keep in sync (a major fund-loss bug class avoided).
