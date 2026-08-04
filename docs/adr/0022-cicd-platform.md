# ADR-0022 — CI/CD: GitHub Actions + Argo Rollouts

- Status: Accepted
- Date: 2026-07-05
- Deciders: SRE Lead, Lead Architect

## Context

We need PR-gated CI (typecheck, tests, security scans, signed images), continuous delivery to staging, and SLO-gated progressive prod rollouts with auto-rollback — with no long-lived cloud creds in CI.

## Decision

**GitHub Actions** for CI and build (OIDC → short-lived AWS roles, no static creds); **ArgoCD** for GitOps delivery; **Argo Rollouts** for canary (5%→50%→100%) with automated SLO-based rollback. Commit-message, typecheck, test, and secret-scan gates are live today ([.github/workflows/ci.yml](../../.github/workflows/ci.yml)).

## Alternatives considered

| Option                    | Pros                                                           | Cons                                          | Verdict    |
| ------------------------- | -------------------------------------------------------------- | --------------------------------------------- | ---------- |
| **GitHub Actions + Argo** | native to our SCM, huge action ecosystem, OIDC, GitOps synergy | Actions runners need cost management at scale | **chosen** |
| GitLab CI                 | strong integrated CI/CD                                        | we're on GitHub; migration cost               | rejected   |
| Jenkins                   | infinitely flexible                                            | heavy ops, plugin sprawl, security burden     | rejected   |
| CircleCI/Buildkite        | good runners                                                   | another vendor; less GitOps synergy than Argo | rejected   |

## Consequences

- **Maintenance:** pipeline-as-code next to the repo; Argo makes deploys declarative and auditable; rollback is re-pointing to a previous signed image.
- **Scaling:** self-hosted runners for heavy jobs when Actions minutes get costly; canary limits blast radius per release.
- **Security:** OIDC eliminates long-lived cloud creds in CI; every image is SBOM'd, scanned, and cosign-signed before it can be admitted ([ADR-0021](0021-kubernetes-strategy.md)); gitleaks gate on every PR.
