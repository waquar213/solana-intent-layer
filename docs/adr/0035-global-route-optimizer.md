# ADR-0035 — Global Route Optimizer: standalone, deterministic scoring, bounded ML

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Routing Systems Architect, Principal Quant Engineer, Principal AI Systems Engineer

## Context

Deciding HOW money moves — which aggregator, which bridge, which order — is the platform's most valuable IP and potentially a standalone infrastructure business (routing-as-a-service for other wallets). It must rank routes on many competing objectives (cost, slippage, output, time, reliability, risk, freshness), adapt to user preference, gate on simulation, and be able to use ML without ever letting ML compromise safety. It must also be fast (< 300 ms) and independent of the wallet.

## Decision

A **standalone `packages/router`** depending only on the provider framework. Pipeline: discover candidates (all providers) → **simulation gate** (reject failures) → **deterministic weighted scoring** (seven min-max-normalized factors, weights tunable by preset) → **bounded ML re-rank** (optional) → best + alternatives + confidence. The scorer is a pure function; ML enters only through a `RoutePredictor` clamped to a ±band so it can break ties but never crown a clearly-worse route. The optimizer PROPOSES; the Execution Engine executes.

## Alternatives considered

| Option                                              | Pros                                                                    | Cons                                                                                | Verdict                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Standalone + deterministic scoring + bounded ML** | testable IP; user-tunable; ML augments safely; reusable as a public API | a scoring model to design and maintain                                              | **chosen**                                     |
| Just pick the best single quote (no scoring)        | trivial                                                                 | ignores time/risk/reliability/health; no user preference; no alternatives/fallbacks | rejected (that's a quote picker, not a router) |
| Let an ML model choose the route end-to-end         | "smart"                                                                 | unverifiable, unsafe near money, no determinism, hard to debug                      | rejected (ML is a bounded re-ranker only)      |
| Build routing inside the wallet/execution engine    | fewer packages                                                          | not reusable as infra; couples the IP to the wallet; harder to expose as an API     | rejected (standalone is the whole point)       |
| Hardcode weights                                    | simple                                                                  | no per-user optimization (cheapest vs fastest vs safest)                            | rejected (presets + custom weights)            |

## Consequences

- **Maintenance:** scoring is pure and unit-tested; adding a factor is one field + one weight; adding a provider is a plugin ([ADR-0034](0034-provider-aggregator-framework.md)) — the optimizer doesn't change. ML predictors are swappable and bounded.
- **Scaling:** stateless per request; provider quotes fetched in parallel; scoring is linear; 30 s route cache. Targets < 300 ms and millions of requests/day, horizontally scaled.
- **Security:** simulation gate rejects unexecutable routes before ranking; ML is clamped and cannot override the deterministic model or bypass simulation/execution; the optimizer holds no keys and moves no funds — it only proposes. As a public API it exposes routing intelligence without exposing the wallet. Full design: [architecture 16](../architecture/16-route-optimizer.md).
