# ADR-0041 — Universal Settlement Engine: the mandatory, idempotent front door to execution

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Payments Architect, Principal Distributed Systems Engineer, Principal Blockchain Architect, Principal Settlement Systems Engineer

## Context

A wallet that only "sends transactions" pushes chains, bridges, swaps, gas and confirmations onto the user. The differentiator is a settlement layer that hides all of it and guarantees an approved plan reaches its financial outcome — or safely reports why not — while never owning funds or keys. The 2026-07 architecture review also found a CRITICAL gap: plan-time checks were never re-verified at broadcast (stale-plan authorization). The settlement layer is the natural home to close it.

## Decision

A **standalone `packages/settlement`** that drives an approved `ExecutionPlan` through a fixed, ordered pipeline (pre-flight → liquidity → quote-lock → gas → prepare → execute → cross-chain → reconcile → portfolio → notify) via a deterministic coordinator over injected capabilities. It is the **mandatory front door to execution**: pre-flight re-validation, quote-lock and gas validation are non-skippable STAGES, so an approved-but-stale plan cannot reach broadcast (closing the review's CRITICAL stale-plan gap at the orchestration level). The settlement id is derived from the plan id, giving **idempotency** (a claimed id never re-executes — no double-send). State is saved after every stage (**resumable**); failures are classified and handled (**recovery**: retry/requote/wait/compensate/ignore/park); every transition is appended to a replayable **ledger**. Signing/broadcast happen inside the injected executor (the Execution engine), on device — settlement holds no keys and owns no funds.

## Alternatives considered

| Option                                                          | Pros                                                                     | Cons                                                                                         | Verdict                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Settlement layer over execution, mandatory pre-flight**       | hides chain complexity; closes the stale-plan gap; idempotent; resumable | one more orchestration layer                                                                 | **chosen**                                                          |
| Let callers invoke the Execution engine directly                | fewer layers                                                             | no mandatory pre-flight → stale plans reach broadcast; no cross-chain/recovery orchestration | rejected (settlement is the mandatory front door)                   |
| Put pre-flight inside the low-level execution step machine only | co-located with broadcast                                                | execution can't re-scan risk/quote/policy (no deps); misses liquidity/quote-lock             | rejected (pre-flight is a settlement stage over injected re-checks) |
| Fire-and-forget settlement (no idempotency key)                 | trivial                                                                  | retries / concurrent settles double-execute — real money lost                                | rejected (settlement id derived from plan id; execute once)         |
| Non-deterministic coordinator (reads the clock inline)          | simpler                                                                  | irreproducible; can't replay; timeout untestable                                             | rejected (injected env; deterministic + replayable ledger)          |

## Consequences

- **Maintenance:** a new pipeline stage is one ordered entry + an injected capability; a new failure class is one map entry; the coordinator tests offline with fakes (pre-flight park, idempotency, retry/requote/compensate, resume, ledger replay all covered).
- **Scaling:** stateless per-tick coordination; a durable store with a unique settlement id + append-only ledger carries it to millions of settlements; cross-chain waits park and resume rather than hold threads.
- **Security:** an approved-but-stale plan cannot reach broadcast (mandatory pre-flight); the same plan settles at most once (idempotency); failures never strand funds (compensate/park); settlement owns no funds and holds no keys — signing is device-side inside the injected executor. Full design: [architecture 22](../architecture/22-settlement-engine.md).
