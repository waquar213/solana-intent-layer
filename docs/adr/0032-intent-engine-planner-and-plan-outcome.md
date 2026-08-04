# ADR-0032 — Intent Engine: pure planner over injected sources + PlanOutcome contract

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal AI Architect, Principal Blockchain Architect, Staff Engineer

## Context

The Intent Engine is the company's moat and the orchestration layer for every capability. It must (a) keep the AI strictly proposing while deterministic code decides, (b) make every safety decision testable without a live LLM, chain, or router, and (c) return a single, exhaustive result the UI can act on. [ADR-0013](0013-ai-orchestration.md) (AI Gateway) and [ADR-0014](0014-intent-parser-architecture.md) (deterministic-first parser) set the parse strategy; this ADR locks the ENGINE's structure.

## Decision

- **A pure planner over injected sources.** `planIntent(intent, ctx)` depends only on interfaces (`HoldingsProvider`, `PriceProvider`, `RouteProvider`, `RiskProvider`, `resolveRecipient`, `estimateFeeMicros`, `ids`). Real implementations (Portfolio, Price, Route Optimizer, Risk, Identity) plug in without touching the engine — same pattern as [ADR-0030](0030-universal-identity-and-portfolio-layering.md).
- **One exhaustive result type — `PlanOutcome`:** `plan | clarify | automation | answer | rejected`. Every input maps to exactly one; the UI never has to guess.
- **Safety at plan time, in deterministic code:** balance, recipient network-match, route existence, and risk are checked in the planner (not the parser, not the LLM). BLOCK is not overridable; ambiguity/missing info → clarify; non-USD fiat → clarify (no guessed FX).
- **The engine cannot execute.** Its output is a proposal; execution requires the Execution Engine consuming an approved plan + a device signature.

## Alternatives considered

| Option                                            | Pros                                                                                  | Cons                                                                                   | Verdict                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| **Pure planner + injected sources + PlanOutcome** | fully testable (40 fixture tests, no network); sources swappable; one result contract | a bit of interface plumbing                                                            | **chosen**                          |
| Planner calls chains/router/risk directly         | less indirection                                                                      | untestable offline; couples the moat to concrete services; hard to evolve              | rejected                            |
| Let the LLM produce the plan (steps + fees)       | fewer components                                                                      | catastrophic — model near money, unverifiable, injectable                              | rejected (violates ADR-0014)        |
| Throw exceptions for every non-plan case          | familiar                                                                              | callers must catch-and-classify; clarify/reject/answer are normal outcomes, not errors | rejected (outcome union is clearer) |

## Consequences

- **Maintenance:** a new capability = a new intent type (additive to the Zod union) + a planner branch; the parse→plan→confirm→execute contract is stable. Golden-set + injection evals gate parser changes ([ADR-0014](0014-intent-parser-architecture.md)).
- **Scaling:** the engine is stateless and CPU-cheap → horizontal scale; latency/cost live in the injected LLM/route calls, which are cached/budgeted at their own layers.
- **Security:** the AI only ever emits a schema-validated proposal (no tools, text-as-data); every safety decision is deterministic and testable; the engine is structurally incapable of moving funds — a signature downstream is mandatory. Full analysis: [architecture 13](../architecture/13-intent-engine.md).
