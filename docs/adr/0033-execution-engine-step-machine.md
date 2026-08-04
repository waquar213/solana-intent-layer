# ADR-0033 — Execution Engine: persisted step machine over an injected StepDriver

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Distributed Systems Engineer, Principal Wallet Architect, Security Lead

## Context

The Intent Engine produces an approved `ExecutionPlan`; something must run it — in order, safely, resumably — across chains, without holding keys and without ever stranding funds. Execution touches money, so it needs the strongest guarantees in the system: simulate-before-broadcast, idempotent retries, crash-resume, and a park-not-strand failure mode. It must also be testable without a live chain.

## Decision

A **persisted step machine** (`ExecutionEngine.execute/resume`) that drives each step through `simulate → broadcast → confirm → verify` in dependency order, over an **injected `StepDriver`** (the chain-facing boundary that device-signs, broadcasts via the AdapterRegistry, and polls confirmation) and an **injected `ExecutionStore`** (saved after every transition). Failures are classified (`retry | requote | park`); the terminal states are `completed | parked | failed`. Every transition emits an `ExecutionEvent`.

## Alternatives considered

| Option                                             | Pros                                                                                                              | Cons                                                                                                                                  | Verdict                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Persisted step machine + injected driver/store** | simulate-gate, idempotent retries, crash-resume, park-not-strand; fully testable offline; non-custodial preserved | a state machine to maintain                                                                                                           | **chosen**                               |
| Fire-and-forget broadcast loop                     | simple                                                                                                            | no resume, no invariant checks, funds can strand; unsafe                                                                              | rejected                                 |
| A workflow engine (Temporal/Cadence)               | durable execution out of the box                                                                                  | heavy dependency + operational surface; our sagas are small and money-specific; we want the exact simulate/park semantics in our code | rejected (revisit only at extreme scale) |
| Engine signs/broadcasts directly (holds a key)     | fewer moving parts                                                                                                | violates the non-custodial invariant — a total non-starter                                                                            | rejected                                 |
| Execute inside the Intent Engine                   | one component                                                                                                     | conflates "what" with "how"; untestable; couples planning to chain I/O                                                                | rejected (the layering is the point)     |

## Consequences

- **Maintenance:** the engine owns ordering/retry/recovery/persistence; the `StepDriver` owns single-step chain interaction. Adding a step kind or a chain is driver work, not engine work. 12 fixture tests cover every branch with no network.
- **Scaling:** executions are independent sagas keyed by id → horizontal scale (KEDA on queue depth); single-writer execution region per identity avoids saga split-brain ([ADR-0027](0027-deployment-topology.md)).
- **Security:** keys never enter the engine (driver signs on-device); simulate-gate prevents blind/malicious broadcasts; post-confirmation invariants stop worse-than-promised fills; unrecoverable failures PARK with a known, user-visible funds location and a resume path — funds are never left in limbo. Full design: [architecture 14](../architecture/14-execution-engine.md).
