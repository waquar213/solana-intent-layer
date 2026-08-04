# ADR-0040 — Automation & Workflow Engine: autonomous, but gated by Policy + Risk

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Workflow Architect, Principal Distributed Systems Engineer, Principal Blockchain Architect, Principal Security Engineer

## Context

Users want the wallet to act for them — recurring buys, stop-losses, rebalances, exploit-triggered exits. But an automation layer that can move funds on its own authority is a catastrophic risk surface. It must be autonomous AND provably no more capable than a manual action: non-custodial, gated, deterministic, and recoverable at scale.

## Decision

A **standalone `packages/automation`** that is a pure, deterministic orchestrator over injected sources (clock, feeds, the Policy `authorize` capability, an `Executor`, a notifier, stores). A `Workflow` is a typed model (Trigger union · Condition AST · Action union), not a string DSL. Every firing runs `Trigger → Conditions → Safety → per-action authorize via PolicyEngine.evaluate (which composes Risk) → mayProceedToSign ? execute via a pre-authorized session key : PARK for approval → notify`. The engine authorizes nothing itself and holds no keys; a `block` is terminal; time is injected (time-travel testable); each firing claims an idempotency key so it executes at most once. Scheduling-level safety (cooldown, daily cap, timeout, kill switch, pause/resume) lives here; authorization safety is delegated to Policy.

## Alternatives considered

| Option                                                        | Pros                                                                     | Cons                                                                                 | Verdict                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **Pure orchestrator that delegates to Policy + session keys** | autonomous yet provably gated; non-custodial; deterministic; recoverable | requires the Policy/Execution seams (already built)                                  | **chosen**                                                     |
| Automation with its own execution authority / hot key         | simplest to ship                                                         | a bug or breach moves funds unchecked; custodial; unauditable                        | rejected (no key, no authority — delegate to Policy)           |
| Re-implement limits/authorization inside automation           | one place to look                                                        | drifts from the user's policy; two gates to keep in sync; a bypass if they disagree  | rejected (authorization is Policy's job; automation delegates) |
| A string workflow DSL                                         | expressive                                                               | a parser to secure; hard to typecheck/diff/version; injection surface                | rejected (typed union model — data that typechecks)            |
| Non-deterministic scheduler (reads the clock inline)          | fewer moving parts                                                       | irreproducible firings; can't time-travel test; missed-execution behavior untestable | rejected (injected clock; deterministic)                       |
| Fire-and-forget (no idempotency)                              | trivial                                                                  | retries / concurrent ticks double-execute — real money lost                          | rejected (idempotency key; execute at most once)               |

## Consequences

- **Maintenance:** a new trigger/condition/action is a union variant + a pure case; a new automation type is often just a compiler template; the gate and executor are injected, so the engine tests offline with fakes (kill-switch, park, block, idempotency, time-travel all covered).
- **Scaling:** pure per-tick evaluation, stateless; a durable leader-elected scheduler + a unique idempotency key in the run table carry it to millions of workflows; missed windows fire once, not N times.
- **Security:** automation holds no keys and authorizes nothing itself; every financial action passes Policy (which composes Risk) and executes only via a scoped, pre-authorized session key; a `block` is terminal; an idempotency claim prevents double-execution; a kill switch and pause/resume stop everything. Full design: [architecture 21](../architecture/21-automation-engine.md).
