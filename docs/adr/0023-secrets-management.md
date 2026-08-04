# ADR-0023 — Secrets: AWS KMS + Secrets Manager + External Secrets Operator

- Status: Accepted
- Date: 2026-07-05
- Deciders: Security Lead, SRE Lead

## Context

No secret may live in the repo, env files, or images. Secrets must rotate; the only "hot" platform keys (relayer/paymaster gas wallets, Phase 9) need HSM-grade protection. CI must have no standing cloud creds.

## Decision

**AWS KMS** (region-scoped CMKs) as the root of trust; **Secrets Manager** for secret storage with rotation; **External Secrets Operator** syncs into Kubernetes. CI uses **GitHub OIDC** for short-lived roles. `gitleaks` in CI + pre-commit. Hot gas wallets are KMS-asymmetric/HSM-backed with capped float + 4-eyes refills.

## Alternatives considered

| Option                          | Pros                                        | Cons                                                      | Verdict                           |
| ------------------------------- | ------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| **KMS + Secrets Manager + ESO** | native to AWS, rotation, KMS root, K8s sync | AWS-coupled (by design)                                   | **chosen**                        |
| HashiCorp Vault                 | powerful, cloud-agnostic                    | another system to run + harden HA                         | rejected (revisit if multi-cloud) |
| Sealed Secrets (git-stored)     | GitOps-native                               | encrypted secrets still in git history; rotation friction | rejected                          |
| Doppler/1Password Connect       | nice DX                                     | third-party in the secret path                            | rejected for core                 |

## Consequences

- **Maintenance:** rotation schedules (DB 30d auto, vendor keys 90d); one KMS trust root; ESO keeps clusters in sync automatically.
- **Scaling:** per-region CMKs; multi-region secret replication for DR.
- **Security:** secrets never in repo/images (a leak triggers a <1-hour rotation drill); OIDC removes CI standing creds; hot keys isolated and bounded so a compromise is a capped-float incident, not a treasury drain ([architecture 05 §5](../architecture/05-infrastructure.md)).
