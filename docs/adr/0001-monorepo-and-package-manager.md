# ADR-0001 — Monorepo with pnpm (+ Turborepo later)

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Lead Architect

## Context

We ship device-side code, backend services, and shared domain logic that must share types (a Zod intent schema used by client, SDK, and server). We need atomic cross-cutting changes and one toolchain for ~100 engineers.

## Decision

Single monorepo, **pnpm workspaces** as the package manager, **Turborepo** added for task caching when build times warrant. `packages/*` (libraries), `services/*` and `apps/*` (deployables).

## Alternatives considered

| Option                | Pros                                                                                                 | Cons                                                        | Verdict                           |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------- |
| **pnpm workspaces**   | strict, content-addressed store, fast, no phantom deps, no postinstall by default (supply-chain win) | less turnkey than Nx                                        | **chosen**                        |
| Nx                    | powerful generators, graph tooling                                                                   | heavier, opinionated, more to learn                         | rejected (complexity now)         |
| Polyrepo (many repos) | independent release cadence                                                                          | cross-repo type sync hell, no atomic changes, version drift | rejected (kills shared contracts) |
| Yarn/npm workspaces   | familiar                                                                                             | slower, looser dep isolation                                | rejected                          |

## Consequences

- **Maintenance:** one lockfile, one CI, atomic refactors across packages; strict resolution catches missing deps early. Turborepo deferred until build time is a real cost (avoid premature tooling).
- **Scaling:** scales to hundreds of packages; remote caching (Turbo) when needed. CODEOWNERS gives per-package ownership at team scale.
- **Security:** pnpm's strictness + disabled postinstall scripts shrink the supply-chain surface (handbook [04 §3](../handbook/04-quality.md)); one place to pin/audit deps.
