# 01 — Development Standards

## 1. Naming conventions

| Kind                           | Convention                                             | Example                                    |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------ |
| Package (npm)                  | `@intent-wallet/<kebab>`                               | `@intent-wallet/chains`                    |
| Directory                      | kebab-case                                             | `packages/api-contracts`                   |
| TS file                        | kebab-case; one primary export per file where sensible | `provider-pool.ts`                         |
| Type / interface / class       | PascalCase; **no `I` prefix**                          | `ProviderPool`, `UniversalAccount`         |
| Function / variable            | camelCase                                              | `evmAddressFromPublicKey`                  |
| Constant (module-level, fixed) | UPPER_SNAKE                                            | `HARDENED_OFFSET`, `DEFAULT_SCRYPT_PARAMS` |
| Zod schema                     | `PascalCaseSchema` + inferred `PascalCase` type        | `IntentSchema` → `type Intent`             |
| Event type                     | `domain.thing.verb.vN`                                 | `execution.step.confirmed.v1`              |
| Kafka topic                    | `domain.subject.vN`                                    | `chain.events.v1`                          |
| Redis key                      | `ns:{scope}:{id}` (documented in `packages/events`)    | `pf:{identityId}`                          |
| Env var                        | `IW_<AREA>_<NAME>`                                     | `IW_DB_URL`, `IW_LLM_API_KEY`              |
| Feature flag                   | `flag.<area>.<name>`                                   | `flag.intents.llm_path`                    |
| DB table / column              | snake_case, plural tables                              | `execution_steps`, `tx_hash`               |
| React component                | PascalCase file + export                               | `PlanCard.tsx`                             |
| Test file                      | `<subject>.test.ts` colocated in `test/`               | `vault.test.ts`                            |

Domain vocabulary is fixed by [requirements.md §15](../../requirements.md): Intent, Plan, Leg/Step, Identity, Vault, Adapter, Solver. Do not invent synonyms in code (no `Transaction` where we mean `Step`, no `Wallet` where we mean `Identity`).

## 2. Folder conventions

- **Packages** are hexagonal-lite: pure domain logic in the package root/`domain/`, side-effecting adapters (network, storage) isolated so the domain stays testable without mocks.
- **Services** follow the template in [architecture 08 §2](../architecture/08-repo-structure.md): `src/{main,routes,consumers,domain,infra}`.
- One package = one bounded context = one `package.json` = one owner (CODEOWNERS).
- Cross-package imports go through the package's public `index.ts` only — never deep-import another package's internals (`@intent-wallet/core/src/vault` is forbidden; `@intent-wallet/core` is the contract).
- Tests live in `test/` mirroring `src/`. Fixtures/vectors in `test/fixtures/`.

## 3. Code style

- **TypeScript strict, maxed** (`tsconfig.base.json`): `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules` all on. `any` is banned (lint error); use `unknown` + narrowing.
- **Money is `bigint`** in base units, everywhere. Floats in money paths are a CI-grep failure ([04](04-quality.md) §security-gates). Display conversion happens only at the UI edge.
- **Errors are typed** ([02](02-shared-libraries.md) §observability): throw `WalletError`/`ChainError`/domain errors with stable `code`s, never bare `Error` with a string the caller must regex.
- **No secrets in logs, errors, or analytics** — enforced by review + the "no secret in message" rule in each error class.
- **Pure functions by default**; side effects named and isolated. **Immutability**: prefer `readonly`, don't mutate inputs (the SLIP-10 derivation not mutating its node is the reference example).
- **Comments** explain constraints the code can't (why low-s normalization, why 30 s quote expiry) — never restate the code. Match surrounding density.
- **Formatting** is not a debate: Prettier (`.prettierrc.json`) + `.editorconfig`. CI checks; don't hand-format.
- **Async**: no floating promises (must `await` or explicitly `void`); every external call has a timeout and an error path.

## 4. Commit message standard (Conventional Commits)

```
<type>(<scope>): <subject>

<body — the WHY, wrapped at 100>

<footer — BREAKING CHANGE:, Refs:, Co-Authored-By:>
```

- **Types:** `feat` `fix` `perf` `refactor` `test` `docs` `build` `ci` `chore` `revert`.
- **Scope:** a package/service/app name (`core`, `chains`, `api`, `mobile`) or `repo`.
- **Subject:** imperative, ≤ 72 chars, no trailing period.
- **Security-relevant** commits (touching `core`/`execution`/`risk`/auth/crypto) add a `Security:` footer line summarizing the review.
- Enforced by `scripts/validate-commit-msg.mjs` (CI + optional local `commit-msg` hook — install command in [03](03-environments-cicd.md)).

## 5. Branching strategy — trunk-based

- **`main` is always green and always deployable.** Protected: no direct pushes, linear history (squash-merge), required checks + reviews.
- Work on short-lived branches: `<type>/<scope>-<short-desc>` (`feat/chains-balance-readers`). Aim to merge within days, not weeks — long branches rot against a fast trunk.
- **Feature flags, not feature branches**, decouple merge from launch. Incomplete work merges dark behind a flag ([03](03-environments-cicd.md) §flags).
- No `develop` branch. Releases are tags on `main`, not branches (hotfix exception below).

## 6. Pull request rules

- **Small and single-purpose.** A PR does one thing; mixed refactor+feature PRs get split. Target < ~400 lines of substantive diff; larger needs a note explaining why.
- **Required to merge:** green CI (typecheck, tests, lint, security scans), ≥ 1 approval (≥ 2 incl. a security owner for `core`/`execution`/`risk`/auth), the PR template checklist satisfied, no unresolved threads.
- **Author provides** the "why" in the description, test evidence, and screenshots for UI. Reviewers check correctness, security, and adherence to this handbook — not style (the formatter owns style).
- **No self-merge** on protected paths. **No force-push** to shared branches.
- Draft PRs early for direction checks are encouraged; mark ready only when CI-green.

## 7. Versioning strategy

- **Public artifacts** (`packages/sdk`, `packages/api-contracts`, the HTTP API) follow **SemVer** strictly. API is URL-major-versioned (`/v1`); breaking changes = new major + ≥ 90-day deprecation with `Sunset` headers ([architecture 07](../architecture/07-api.md)).
- **Internal packages** are unpublished (`private: true`), versioned together with the repo; internal breaking changes are just PRs (the monorepo means atomic cross-package changes — a caller and its dependency change in one commit).
- **Changesets** (adopted at first external consumer) generate SDK/contract changelogs and version bumps.
- **Event/topic schemas** are versioned in their name (`.v1`); within a major you may only ADD optional fields ([architecture 01 §4](../architecture/01-system-overview.md)).

## 8. Release process

- **Continuous delivery to staging:** every merge to `main` deploys to staging (testnets) and runs the full e2e + golden-intent suites.
- **Promotion to prod** is a deliberate act by the week's **release captain** (rotating role): pick a green staging build, run the release checklist, trigger the canary rollout (5% → 50% → 100%, SLO-gated, auto-rollback — [03](03-environments-cicd.md) §cicd).
- **Client releases** (mobile/extension) are phased store rollouts gated on crash-free-rate; a kill-switch flag can neutralize a bad feature without an app-store round-trip.
- **Hotfix:** branch from the release tag, minimal fix, fast-track review (still 2 eyes on money paths), cherry-picked back to `main`.
- **Every release** produces signed artifacts + SBOM ([04](04-quality.md)) and an auto-generated changelog; money-path incidents get a public post-mortem ([architecture 06](../architecture/06-security.md)).
