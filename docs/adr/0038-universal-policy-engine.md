# ADR-0038 — Universal Policy Engine: deterministic authorization composed with Risk

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Security Architect, Principal Identity Architect, Principal Distributed Systems Engineer

## Context

Before automation and AI-proposed actions can be safe, there must be a mandatory authorization layer that decides — deterministically and auditably — whether an action is _allowed_ and whether it needs extra verification, independent of whether it is _dangerous_ (which the Risk engine already judges). It must never touch keys or sign, must be configurable per user and per enterprise, must be tamper-evident, and nothing may reach execution without passing it.

## Decision

A **standalone `packages/policy`** that is a pure, deterministic core over an injected `PolicyEnv` (clock/ids/hash). Rules are a **typed data model** (`PolicyRule` + a `ConditionExpr` AST), evaluated by a Rule Engine, resolved by a total shuffle-invariant conflict order, decided into one of **six outcomes**, then **composed with the Risk engine taking the most-restrictive of the two** into a single `ExecutionPermission`. A `block` on either side is a terminal floor; Policy can only tighten Risk, never loosen it. The transaction amount is **re-derived from the plan quote** (anti-spoofing). Decisions are recorded in an **append-only hash-chained audit log**. Presets (strict/balanced/permissive) + inheritance with a non-overridable floor; simulation, versioning, and rollback for administration. It is the mandatory gate the Copilot and Execution layers call; it holds no keys and never signs.

## Alternatives considered

| Option                                                  | Pros                                                                                           | Cons                                                                                           | Verdict                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Deterministic typed-rule engine, composed with Risk** | auditable; configurable; testable; tamper-evident; standalone; Risk and Policy stay orthogonal | two engines to compose carefully                                                               | **chosen**                                                       |
| Fold authorization into the Risk engine                 | one gate                                                                                       | conflates "dangerous" with "authorized"; can't configure posture without touching threat logic | rejected (orthogonal concerns, both must pass)                   |
| A parsed string policy DSL                              | expressive, human-authored                                                                     | a parser + grammar to secure; hard to diff/hash/typecheck; injection surface                   | rejected (typed AST: data that typechecks, diffs, hashes)        |
| Let the AI/Copilot decide authorization                 | flexible                                                                                       | non-deterministic, unauditable, defeats the whole point (AI must be constrained BY policy)     | rejected (policy is deterministic and never AI-overridable)      |
| Non-deterministic engine (reads clock/DB inline)        | simpler wiring                                                                                 | irreproducible decisions; untestable determinism; audit hashes drift                           | rejected (PolicyEnv injection; determinism is a tested property) |
| Mutable/updatable audit log                             | simpler storage                                                                                | no tamper-evidence; a compromised writer can rewrite history                                   | rejected (append-only hash chain; DB revokes UPDATE/DELETE)      |

## Consequences

- **Maintenance:** a new rule type is a `ConditionExpr` variant + a case in the pure evaluator; a new policy is data; conflict resolution and composition are separately, exhaustively tested (including 100-permutation shuffle-invariance and the full Risk×Policy matrix).
- **Scaling:** pure CPU over an in-memory context → fast, stateless, horizontal; the registry/audit are the only stateful pieces and are simple stores; a signed/active policy set applies platform-wide instantly; metrics derive from the audit log with no extra state.
- **Security:** `blocked` is terminal and non-overridable; Policy can only tighten Risk; amounts are re-derived from the plan quote (no spoofing); inheritance cannot loosen a non-overridable parent; the permission binds to one plan (no replay); the engine has zero dependency on `core`/`execution`, holds no keys, and never signs. Full design: [architecture 19](../architecture/19-policy-engine.md).
