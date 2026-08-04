# Architecture Decision Records

> **Status:** the permanent, canonical record of every locked technology & architecture decision.
> These supersede the one-line entries in [memory.md](../../memory.md) Decisions Log and formalize the scored comparisons in [architecture/09-decisions.md](../architecture/09-decisions.md). **No implementation deviates from a locked ADR without a new ADR that supersedes it** (handbook [05 §4](../handbook/05-roadmap-and-team.md)).

## How to read this

Each ADR is immutable once **Accepted**. To change a decision, write a NEW ADR with status `Supersedes ADR-XXXX` — never edit the old one. The old ADR's status becomes `Superseded by ADR-YYYY`. This preserves _why we once thought differently_, which is the whole point.

ADR structure: **Context · Decision · Alternatives (≥3, pros/cons) · Consequences (Maintenance / Scaling / Security)**. The three-lens Consequences section is mandatory — a decision that looks good today but rots in maintenance, caps at scale, or widens the attack surface is not a good decision.

## Index

| ADR                                                         | Decision                                                                                                | Status   | Legacy ref |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| [0001](0001-monorepo-and-package-manager.md)                | Monorepo + pnpm (+ Turborepo)                                                                           | Accepted | D1         |
| [0002](0002-primary-language-typescript.md)                 | TypeScript end-to-end (Rust budget)                                                                     | Accepted | D1, D14    |
| [0003](0003-wallet-crypto-libraries.md)                     | Wallet crypto: @noble/@scure                                                                            | Accepted | D2         |
| [0004](0004-slip10-in-repo.md)                              | SLIP-0010 ed25519 in-repo                                                                               | Accepted | D3         |
| [0005](0005-vault-kdf-and-cipher.md)                        | Vault: scrypt + AES-256-GCM                                                                             | Accepted | D4         |
| [0006](0006-mobile-framework.md)                            | Mobile: React Native + Expo                                                                             | Accepted | D13        |
| [0007](0007-backend-runtime-and-api-framework.md)           | Backend: Node.js + Fastify                                                                              | Accepted | D14        |
| [0008](0008-database.md)                                    | Database: PostgreSQL / Aurora                                                                           | Accepted | D12        |
| [0009](0009-cache.md)                                       | Cache: Redis                                                                                            | Accepted | —          |
| [0010](0010-message-broker.md)                              | Broker: Redis Streams → Kafka                                                                           | Accepted | D11        |
| [0011](0011-blockchain-rpc-strategy.md)                     | RPC: multi-provider ProviderPool                                                                        | Accepted | D9, D10    |
| [0012](0012-blockchain-indexing.md)                         | Indexing: per-chain checkpointed indexers                                                               | Accepted | D14        |
| [0013](0013-ai-orchestration.md)                            | AI: Claude via in-house AI Gateway                                                                      | Accepted | D16        |
| [0014](0014-intent-parser-architecture.md)                  | Intent parser: deterministic-first + tool-use                                                           | Accepted | D8         |
| [0015](0015-authentication.md)                              | Auth: SIWE + JWT + rotating refresh                                                                     | Accepted | —          |
| [0016](0016-push-notifications.md)                          | Push: APNs/FCM behind Notification Service                                                              | Accepted | —          |
| [0017](0017-analytics.md)                                   | Analytics: ClickHouse                                                                                   | Accepted | D17        |
| [0018](0018-observability.md)                               | Observability: OTel + Prom/Grafana/Loki/Tempo + Sentry                                                  | Accepted | —          |
| [0019](0019-object-storage.md)                              | Object storage: S3                                                                                      | Accepted | —          |
| [0020](0020-cloud-provider.md)                              | Cloud: AWS                                                                                              | Accepted | D15        |
| [0021](0021-kubernetes-strategy.md)                         | K8s: EKS + Karpenter + KEDA + ArgoCD                                                                    | Accepted | D15        |
| [0022](0022-cicd-platform.md)                               | CI/CD: GitHub Actions + Argo Rollouts                                                                   | Accepted | —          |
| [0023](0023-secrets-management.md)                          | Secrets: KMS + Secrets Manager + ESO                                                                    | Accepted | —          |
| [0024](0024-infrastructure-as-code.md)                      | IaC: Terraform                                                                                          | Accepted | —          |
| [0025](0025-testing-frameworks.md)                          | Testing: Vitest + fast-check + Testcontainers + Detox/Playwright + k6                                   | Accepted | —          |
| [0026](0026-smart-contract-framework.md)                    | Contracts: Foundry + ERC-4337                                                                           | Accepted | —          |
| [0027](0027-deployment-topology.md)                         | Topology: modular monolith → services                                                                   | Accepted | D18        |
| [0028](0028-automation-session-keys.md)                     | Automation: ERC-4337 session keys                                                                       | Accepted | D20        |
| [0029](0029-wallet-core-manager-and-signer-architecture.md) | Wallet Core: manager facade + unified WalletSigner                                                      | Accepted | —          |
| [0030](0030-universal-identity-and-portfolio-layering.md)   | Universal Identity + Portfolio layering (pure engines over injected sources)                            | Accepted | —          |
| [0031](0031-blockchain-adapter-layer.md)                    | Blockchain Adapter Layer as the only chain gateway                                                      | Accepted | —          |
| [0032](0032-intent-engine-planner-and-plan-outcome.md)      | Intent Engine: pure planner over injected sources + PlanOutcome contract                                | Accepted | —          |
| [0033](0033-execution-engine-step-machine.md)               | Execution Engine: persisted step machine over an injected StepDriver                                    | Accepted | —          |
| [0034](0034-provider-aggregator-framework.md)               | Provider/Aggregator framework: plugins over health-scored registries                                    | Accepted | —          |
| [0035](0035-global-route-optimizer.md)                      | Global Route Optimizer: standalone, deterministic scoring, bounded ML                                   | Accepted | —          |
| [0036](0036-security-risk-engine.md)                        | Security & Risk Engine: intel + detectors + probabilistic scoring + configurable policy                 | Accepted | —          |
| [0037](0037-portfolio-intelligence-engine.md)               | Portfolio Intelligence Engine: deterministic analytics + verified AI narration boundary                 | Accepted | —          |
| [0038](0038-universal-policy-engine.md)                     | Universal Policy Engine: deterministic authorization, composed most-restrictive with Risk               | Accepted | —          |
| [0039](0039-ai-financial-copilot.md)                        | AI Financial Copilot: constrained decision layer — LLM picks tools + prose, code decides                | Accepted | —          |
| [0040](0040-automation-workflow-engine.md)                  | Automation & Workflow Engine: autonomous but gated by Policy + Risk, non-custodial                      | Accepted | —          |
| [0041](0041-universal-settlement-engine.md)                 | Universal Settlement Engine: mandatory idempotent front door to execution, recovery + ledger            | Accepted | —          |
| [0042](0042-decentralized-solver-network.md)                | Decentralized Solver Network: competitive execution, verified-not-trusted proposals, staking/slashing   | Accepted | —          |
| [0043](0043-reliability-and-self-healing.md)                | Reliability & Self-Healing: bounded decide-not-act SRE engine + injected actuator                       | Accepted | —          |
| [0044](0044-global-scalability.md)                          | Global Scalability: bounded decide-not-act scale engines + regionally-isolated infra                    | Accepted | —          |
| [0045](0045-compliance-and-governance.md)                   | Compliance & Governance: policy-driven, jurisdiction-configurable layer (rules as versioned data)       | Accepted | —          |
| [0046](0046-plugin-marketplace.md)                          | Plugin Marketplace: capability-sandboxed, trust-tiered extension platform (forbidden-by-construction)   | Accepted | —          |
| [0047](0047-white-label-wallet-platform.md)                 | White-label: tenant config as versioned data, composed on top of compliance; total isolation            | Accepted | —          |
| [0048](0048-ai-agent-framework.md)                          | AI Agent Framework: bounded, propose-only specialist agents + deterministic orchestrator                | Accepted | —          |
| [0049](0049-security-audit-and-hardening.md)                | Security Audit & Hardening: adversarial-review program + STRIDE threat model + external-audit readiness | Accepted | —          |
| [0050](0050-gas-abstraction.md)                             | Gas Abstraction: bounded decide-not-act gas engine (sponsorship budget, fee-token, capped params)       | Accepted | —          |
| [0051](0051-capability-registry.md)                         | Capability Registry: versioned capability data (CAIP-2), fail-closed feasibility gate before execution  | Accepted | —          |
| [0052](0052-typescript-sdk.md)                              | TypeScript SDK: zero-dep transport-injected typed client, typed ApiError, retry idempotent GETs only    | Accepted | —          |
| [0053](0053-production-execution-seams.md)                  | Production execution seams: real EVM signer + injected EvmDevice/RPC/nonce, non-custodial, offline-tested | Accepted | —          |

## Template (copy for a new ADR)

```markdown
# ADR-NNNN — <Title>

- Status: Proposed | Accepted | Superseded by ADR-XXXX
- Date: YYYY-MM-DD
- Deciders: <roles>

## Context

<forces at play, constraints, what must be true at scale>

## Decision

<the choice, stated plainly>

## Alternatives considered

| Option | Pros | Cons | Verdict |

## Consequences

- Maintenance: <long-term upkeep, team, drift risk>
- Scaling: <behavior toward tens of millions of users>
- Security: <attack surface, invariants preserved/added>
```
