# Engineering Handbook

> **Status:** v1.0 (2026-07-05) · Owner: CTO · The rules of how we build. Binding for all contributors.
> Pairs with [requirements.md](../../requirements.md) (what), [docs/architecture/](../architecture/README.md) (how it's designed), [docs/design/](../design/README.md) (how it looks). This handbook is **how we work**.

Written so a team of ~100 engineers can contribute to one codebase without stepping on each other. If a rule here slows you down and you don't understand why, ask before working around it — most exist because of a specific failure mode in a wallet that holds people's money.

## Document map

| Doc                                                | Contents                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [01-standards.md](01-standards.md)                 | Naming, folders, code style, commits, branching, PR rules, versioning, releases            |
| [02-shared-libraries.md](02-shared-libraries.md)   | The shared `packages/*` — contracts, dependency direction, the non-custodial firewall      |
| [03-environments-cicd.md](03-environments-cicd.md) | Local/staging/prod, secrets, env vars, feature flags, CI/CD pipeline, rollback             |
| [04-quality.md](04-quality.md)                     | Coverage targets, performance budgets, security gates, docs & API-doc standards            |
| [05-roadmap-and-team.md](05-roadmap-and-team.md)   | Milestones (objectives/deps/complexity/testing/DoD) + team structure & collaboration model |

## Engineering principles (the "why" behind every rule)

1. **Production only.** No demo code, no placeholders, no TODO-shaped holes on main. If it's not done, it's behind a flag ([03](03-environments-cicd.md) §flags).
2. **Security first.** The non-custodial invariant ([02](02-shared-libraries.md) §firewall) overrides every other concern. When security and any other goal conflict, security wins and the tradeoff is recorded in an ADR.
3. **Modular + Clean Architecture.** Dependencies point inward: domain logic depends on nothing; adapters depend on domain; nothing depends on a framework at its core. Frameworks are details at the edges.
4. **Domain-Driven Design.** Package boundaries = domain boundaries (wallet, chains, intents, portfolio, execution, risk). The ubiquitous language in [requirements.md §15 glossary](../../requirements.md) is the only vocabulary in code.
5. **Event-driven.** Facts are events ([architecture 03](../architecture/03-data.md)); services own their data and never reach into another's store.
6. **TDD where it counts.** Crypto, money math, parsers, and state machines are test-first with known vectors. UI and glue are test-after but still gated by coverage.
7. **SOLID, pragmatically.** Interfaces at integration seams (chains, providers, LLM) so vendors are swappable; no premature abstraction elsewhere.
8. **Performance & horizontal scale** are budgets ([04](04-quality.md) §perf), not afterthoughts — but correctness precedes speed on the money path.

## Monorepo directory purposes (the tree lives in [architecture 08](../architecture/08-repo-structure.md); this is what each dir is FOR)

| Directory                | Purpose                                                                        | Prompt-roadmap name                      |
| ------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------- |
| `packages/core`          | Device-only keys, vault, signing, universal identity. The crown jewels.        | cryptography, wallet                     |
| `packages/chains`        | Blockchain adapter layer — the ONLY code that talks to chains.                 | blockchain-adapters, blockchain-services |
| `packages/intents`       | Intent schema, deterministic pre-parser, resolver, planner glue.               | intent parsing                           |
| `packages/portfolio`     | Balance aggregation + pricing domain logic.                                    | —                                        |
| `packages/execution`     | Step machine, route scoring, adapter interfaces.                               | —                                        |
| `packages/adapters`      | Swap/bridge/price vendor plugins (one dir each) behind provider interfaces.    | —                                        |
| `packages/risk`          | Token verification, scam heuristics, policies.                                 | —                                        |
| `packages/events`        | Zod event + topic schemas, redis key registry — the contract between services. | —                                        |
| `packages/api-contracts` | Zod request/response schemas → OpenAPI + typed clients.                        | api client                               |
| `packages/config`        | Typed, validated env/flag loading.                                             | configuration                            |
| `packages/observability` | Logger, error types, tracing setup — imported by every service.                | logging, error handling                  |
| `packages/analytics`     | Event taxonomy + client for product/business telemetry.                        | analytics                                |
| `packages/notifications` | Notification templates + delivery client.                                      | notifications                            |
| `packages/auth`          | SIWE challenge/verify + session helpers (shared by api + sdk).                 | authentication                           |
| `packages/ui`            | Cross-platform design-system components + tokens.                              | —                                        |
| `packages/sdk`           | Public developer SDK.                                                          | sdk                                      |
| `services/*`             | Deployables (Stage A: `api`, `worker`, indexers, `ws-gateway`).                | backend-api, ai-services                 |
| `apps/*`                 | `mobile` (React Native), `web`, `extension`.                                   | mobile-app                               |
| `infra/*`                | Terraform, k8s manifests, Dockerfiles.                                         | infrastructure, deployment               |
| `e2e/*`                  | Cross-service + testnet/fork end-to-end tests.                                 | testing                                  |
| `scripts/*`              | Repo tooling (commit validation, codegen, release).                            | scripts                                  |
| `docs/*`                 | This handbook, architecture, design, ADRs, runbooks, API.                      | documentation                            |

## How this handbook is enforced (not just prose)

| Rule                             | Enforced by                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Commit format                    | `scripts/validate-commit-msg.mjs` (zero-dep, runs in CI + local hook)        |
| Code ownership / review          | `.github/CODEOWNERS` — security team required on `core`, `execution`, `risk` |
| PR checklist                     | `.github/pull_request_template.md`                                           |
| Formatting                       | `.prettierrc.json` + `.editorconfig`                                         |
| Type safety                      | `tsconfig.base.json` strict flags (already max-strict)                       |
| Test + typecheck gates           | `.github/workflows/ci.yml`                                                   |
| Coverage / perf / security gates | [04-quality.md](04-quality.md) (thresholds wired as they come online)        |

A rule that isn't enforced by a machine is a suggestion. We convert suggestions to gates as the team grows.
