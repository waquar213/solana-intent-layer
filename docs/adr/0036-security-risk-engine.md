# ADR-0036 — Security & Risk Engine: intel + detectors + probabilistic scoring + configurable policy

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, CISO, Principal Security Engineer, Principal Blockchain Security Architect

## Context

Security is crypto's biggest differentiator. Every action must be evaluated before execution against many independent risks (scam tokens, honeypots, sanctioned/poisoned addresses, unlimited approvals, unhealthy bridges…), the result must be a clear authorize/confirm/block verdict, users and enterprises must be able to configure their posture, and it must be fast (< 250 ms) and testable. The engine must never sign or hold funds — it evaluates and authorizes.

## Decision

A **standalone `packages/risk`** with a four-stage pipeline: injected **threat intelligence** (hard blocks) → pure **heuristic detectors** (honeypot, unlimited approval, fresh/illiquid token, ownership concentration, admin/upgrade, unaudited, address poisoning) → **composite scoring** via probabilistic-OR (`1 − Π(1−sᵢ)`, hard signals force `block`) → a **configurable Policy Engine** (presets + custom; a block is never overridable). Threat-intel feeds are distributed as **signed snapshots**. It is the real `RiskProvider` the Intent/Execution/Route layers depend on.

## Alternatives considered

| Option                                               | Pros                                                                                            | Cons                                                                                                   | Verdict                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **Intel + detectors + probabilistic score + policy** | catches listed AND unlisted threats; compounding score; user-configurable; testable; standalone | a model + detectors to maintain                                                                        | **chosen**                                                 |
| Blocklist only (intel, no heuristics)                | simple                                                                                          | misses every scam not yet listed (the dangerous ones)                                                  | rejected                                                   |
| Weighted-sum score                                   | familiar                                                                                        | doesn't bound or compound correctly; a single 0.9 + many 0.9s can exceed 1 or under-weight compounding | rejected (probabilistic-OR is bounded and compounds)       |
| A single ML risk model end-to-end                    | "smart"                                                                                         | unexplainable verdicts on money; hard to audit/regulate; no deterministic policy control               | rejected (ML is a bounded signal source, not the decision) |
| Build risk into the intent/execution engines         | fewer packages                                                                                  | not reusable as a service; couples security to those layers; harder to evolve/audit                    | rejected (standalone is the point)                         |

## Consequences

- **Maintenance:** adding a threat type is a detector (pure, unit-tested) or an intel feed; adding a policy is a config field. Scoring and policy are separate and independently testable.
- **Scaling:** pure CPU + a cached intel lookup → < 250 ms, stateless, horizontal. A single signed intel snapshot can block an entity platform-wide instantly.
- **Security:** hard intel/honeypot signals are unoverridable by any policy (a permissive user cannot un-block a sanctioned address); signed snapshots prevent feed poisoning; the engine never signs or holds funds — it only authorizes. Full design: [architecture 17](../architecture/17-security-risk-engine.md), platform threat model [architecture 06](../architecture/06-security.md).
