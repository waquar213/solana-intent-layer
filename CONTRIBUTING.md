# Contributing

The full engineering handbook lives in **[docs/handbook/](docs/handbook/README.md)** — this file is the quick pointer contributors look for by convention.

## Start here

1. **Read** [docs/handbook/README.md](docs/handbook/README.md) (principles + how rules are enforced) and [memory.md](memory.md) (current project state + next action).
2. **Set up:** `pnpm install && pnpm test` — should be green in < 10 minutes. If not, that's a tooling bug; file it.
3. **Pick up** the ▶ NEXT ACTION in [memory.md](memory.md), or a milestone from [docs/handbook/05-roadmap-and-team.md](docs/handbook/05-roadmap-and-team.md).

## The rules that will block your PR

- **Commits:** Conventional Commits, validated by `scripts/validate-commit-msg.mjs` — see [handbook 01 §4](docs/handbook/01-standards.md).
- **Branching:** trunk-based; short-lived branches; incomplete work merges behind a feature flag — [handbook 01 §5](docs/handbook/01-standards.md).
- **PRs:** small, single-purpose, green CI, review per [handbook 01 §6](docs/handbook/01-standards.md); the [PR template](.github/pull_request_template.md) checklist is required.
- **Quality:** meet your package's coverage tier + the Definition of Done — [handbook 04](docs/handbook/04-quality.md).
- **The one unbreakable rule:** private keys never leave `packages/core`/`apps/*`. No backend touches key material. If your change could let a server compromise move funds, stop — see the non-custodial firewall in [handbook 02 §2](docs/handbook/02-shared-libraries.md).

## Decisions

Locked technology/architecture decisions are ADRs in **[docs/adr/](docs/adr/README.md)**. Don't deviate from a locked ADR without a new ADR that supersedes it. Propose cross-cutting changes as an RFC first ([handbook 05 §4](docs/handbook/05-roadmap-and-team.md)).

## Canonical documents (the user's requested artifact set, mapped)

| Conventional name | Where it lives here                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------- |
| PRD.md            | [requirements.md](requirements.md)                                                           |
| ARCHITECTURE.md   | [docs/architecture/](docs/architecture/README.md)                                            |
| ADR/              | [docs/adr/](docs/adr/README.md)                                                              |
| API_SPEC.md       | [docs/architecture/07-api.md](docs/architecture/07-api.md)                                   |
| SECURITY.md       | [docs/architecture/06-security.md](docs/architecture/06-security.md)                         |
| ROADMAP.md        | [requirements.md §14](requirements.md) + [handbook 05](docs/handbook/05-roadmap-and-team.md) |
| CONTRIBUTING.md   | this file → [docs/handbook/](docs/handbook/README.md)                                        |
| DECISIONS.md      | [docs/adr/README.md](docs/adr/README.md) index + [memory.md](memory.md) Decisions Log        |
