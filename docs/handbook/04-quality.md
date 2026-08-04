# 04 — Quality Standards

## 1. Code coverage targets (by criticality tier, not one blanket number)

| Tier         | Packages                                                                | Line/branch target                                                                         | Extra requirement                                                               |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Critical** | `core`, `execution`, `risk`, `auth`                                     | **≥ 90%**                                                                                  | official/known test vectors + property tests mandatory; every error path tested |
| **High**     | `chains`, `intents`, `portfolio`, `adapters`, `api-contracts`, `events` | **≥ 85%**                                                                                  | integration tests against forks/mocks                                           |
| **Standard** | `services/*`, `config`, `notifications`, `analytics`, `observability`   | **≥ 80%**                                                                                  | contract tests on every endpoint (incl. authz/IDOR)                             |
| **UI**       | `ui`, `apps/*`                                                          | **≥ 70%** logic; 100% of the 5 states rendered ([design 08 §2](../design/08-standards.md)) | a11y snapshot at largest Dynamic Type                                           |

Coverage is a floor, not a goal — 100% coverage of trivial code proves nothing; we require coverage of **behavior and failure modes**. Targets are wired into each package's vitest config (with `@vitest/coverage-v8`) as it reaches its tier; CI fails a PR that drops coverage below the floor. Current: `core` and `chains` are green on tests; threshold enforcement is enabled per-package as coverage tooling lands (tracked in [05](05-roadmap-and-team.md), not claimed done here).

## 2. Performance budgets (SLOs are gates, [architecture 00/02](../architecture/README.md))

| Path                                   | Budget (p95)                                                                               | Regression policy                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Portfolio read (warm)                  | < 300 ms                                                                                   | load test in CI pre-GA; >10% regression blocks release |
| Intent parse (LLM) / (fast-path)       | < 2.5 s / < 150 ms                                                                         | golden-set timing tracked per release                  |
| Plan quote                             | < 3 s                                                                                      |                                                        |
| Execution step push after confirmation | < 1 s                                                                                      |                                                        |
| Mobile cold start → interactive        | < 2 s mid-tier device                                                                      | perf CI on a device farm pre-release                   |
| App bundle size                        | budgeted per platform; growth needs justification                                          | size check in CI                                       |
| Battery: background sync               | minimized network wakeups ([architecture 02 §2.6](../architecture/02-services.md) caching) | field telemetry                                        |

Money-path rule: **correctness precedes latency**. We never shave a simulation, a risk check, or an invariant verification to hit a speed budget.

## 3. Security gates (block merge / release)

- **Every PR:** Semgrep (SAST), `osv-scanner` (deps), `gitleaks` (secrets), dependency review, and a **float-in-money grep** (numeric literals/`number` in money paths outside the display edge → fail).
- **No new dependency** without: audited/maintained provenance, lockfile pin, no `postinstall` scripts (pnpm-enforced), and a note in the PR. Crypto deps are restricted to the `@noble/@scure` family without a security-team exception.
- **`core`/`execution`/`risk`/auth changes** require a security-owner review (CODEOWNERS) — 2 approvals.
- **Images:** SBOM + vuln scan (fail on critical) + cosign signature verified at admission.
- **Nightly:** fuzz targets (intent parser, tx decoders, vault-envelope parser); dependency drift report.
- **Pre-beta / pre-GA:** external audits (`core` before beta; execution + smart-account modules before GA), bug bounty at GA ([architecture 06 §5](../architecture/06-security.md)).

## 4. Documentation requirements

- **Every package** has a `README.md`: what it is, why it exists, the public API, and a usage snippet.
- **Every service** has a `runbook.md` (alerts → actions) and `slo.yaml` next to the code.
- **Every significant decision** is an ADR ([05](05-roadmap-and-team.md) §RFC/ADR) — new packages, vendor choices, security-model changes, schema changes.
- **Public-facing changes** update `docs/` in the same PR (docs drift = review reject). The architecture/design/handbook docs are living; a PR that violates a doc either fixes the code or updates the doc with rationale.
- Code comments follow [01 §3](01-standards.md): constraints only, never narration.

## 5. API documentation standards

- The HTTP API is **generated from Zod schemas** in `packages/api-contracts` → OpenAPI 3.1; hand-written API prose is forbidden (it drifts). The generated spec is published to `docs/api/` on release.
- Every endpoint documents: purpose, auth scope, idempotency behavior, error `code`s it can return ([design 08 §3](../design/08-standards.md) maps them to UI), and rate-limit class.
- The SDK is documented from its types + tsdoc; examples are compiled in CI (a broken example fails the build — no rotting snippets).
- Webhooks document their signature scheme, retry schedule, and event payload schemas (versioned).

## 6. Definition of Done (applies to every unit of work)

A change is **done** only when: code + tests (meeting the tier bar) are green in CI · typecheck/lint/security gates pass · docs updated (package README / API spec / ADR as applicable) · behind a flag if user-visible and incomplete · observability in place (logs/metrics/traces for new paths) · reviewed and approved per [01 §6](01-standards.md) · [memory.md](../../memory.md) updated if it changes project state. "It works on my machine" is not done; "the gate proves it" is done.
