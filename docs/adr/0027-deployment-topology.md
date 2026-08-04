# ADR-0027 — Deployment topology: modular monolith → services

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Lead Architect

## Context

The logical architecture defines ~17 services ([architecture 02](../architecture/02-services.md)), but deploying 17 microservices for the first 10k users is résumé-driven engineering that would sink a small team.

## Decision

Deploy a **modular monolith** (one `api` + one `worker` + indexer pods) at Stage A, with module boundaries **identical** to the eventual service boundaries. Extract services (Stage B/C) when load signals demand it (queue lag, p95 breaches, DB CPU > 60% sustained) — never on a calendar.

## Alternatives considered

| Option                   | Pros                                                                 | Cons                                                                          | Verdict    |
| ------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| **Monolith → services**  | ship fast, low ops, boundaries pre-drawn so extraction is mechanical | discipline required to not cross module lines                                 | **chosen** |
| Microservices from day 1 | "scalable"                                                           | crushing ops/latency for a tiny user base; distributed debugging tax          | rejected   |
| Permanent monolith       | simplest                                                             | caps at the hot paths (indexer, execution, LLM) that genuinely need isolation | rejected   |

## Consequences

- **Maintenance:** boundaries enforced in-repo (import-lint, separate DB roles per module, events-only cross-module facts) so a module is a service-in-waiting; splitting is a deploy change + bus migration, not a rewrite.
- **Scaling:** hot paths extract first (Indexer, Price, Portfolio, Execution) exactly along the drawn seams; the rest can stay merged as long as it performs.
- **Security:** single-writer-region execution preserved across stages; data ownership per module means no service reads another's tables even inside the monolith.
