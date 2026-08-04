# System Architecture — Universal Intent Wallet

> **Status:** v1.0 (2026-07-05) · Owner: CTO · Complements [requirements.md](../../requirements.md) (WHAT) — this doc set is the HOW.
> **Design target:** 100M registered users, fully non-custodial, AI-native, multi-ecosystem (BTC + EVM + SOL).
> **Audience:** every engineer. Detailed enough to start implementation; terse enough to stay maintained.

## Document map

| Doc                                                          | Contents                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [01-system-overview.md](01-system-overview.md)               | Context & container diagrams, service communication, event flow, evolution stages                                                                |
| [02-services.md](02-services.md)                             | Service catalog: mission, owned data, APIs, events, scaling, failure modes, SLOs                                                                 |
| [03-data.md](03-data.md)                                     | ER diagram, partitioning, Redis strategy, Kafka topics, object storage, retention/PII                                                            |
| [04-flows.md](04-flows.md)                                   | Sequence diagrams: auth, portfolio, intent execution, recurring intents, failure recovery                                                        |
| [05-infrastructure.md](05-infrastructure.md)                 | Multi-region deployment, Kubernetes, Docker, CDN, autoscaling, DR, secrets                                                                       |
| [06-security.md](06-security.md)                             | Security model, trust boundaries, STRIDE threat model, AI security, audit system                                                                 |
| [07-api.md](07-api.md)                                       | Complete v1 API specification (REST + WebSocket + webhooks)                                                                                      |
| [08-repo-structure.md](08-repo-structure.md)                 | Monorepo layout, service template, CI/CD pipeline                                                                                                |
| [09-decisions.md](09-decisions.md)                           | Technology decisions with alternatives compared and scored                                                                                       |
| [10-cost-and-scale.md](10-cost-and-scale.md)                 | Capacity math, cost estimation per growth stage, scaling roadmap                                                                                 |
| [11-universal-identity.md](11-universal-identity.md)         | Universal Identity Engine: identity↔account mapping, address mgmt, portfolio aggregation, security                                               |
| [12-blockchain-adapters.md](12-blockchain-adapters.md)       | Blockchain Adapter Layer: BlockchainAdapter interface, EVM/SOL/BTC adapters, AdapterRegistry, error taxonomy                                     |
| [13-intent-engine.md](13-intent-engine.md)                   | Universal Intent Engine: pipeline, AI-vs-deterministic boundary, ExecutionPlan schema, safety, threat model                                      |
| [14-execution-engine.md](14-execution-engine.md)             | Execution Engine: state machine, simulate sandbox, recovery/park, resumability, threat model                                                     |
| [15-provider-framework.md](15-provider-framework.md)         | Provider/Aggregator framework: plugin interfaces, health scoring, circuit breaker, failover, quote aggregation                                   |
| [16-route-optimizer.md](16-route-optimizer.md)               | Global Route Optimizer: pipeline, weighted scoring formula, simulation gate, bounded ML, confidence, standalone API                              |
| [17-security-risk-engine.md](17-security-risk-engine.md)     | Security & Risk Engine: risk pipeline, composite scoring, policy engine, threat-intel distribution, incident response                            |
| [18-portfolio-intelligence.md](18-portfolio-intelligence.md) | Portfolio Intelligence Engine: analytics pipeline, health score, insight/alert/scenario/tax engines, verified AI narration                       |
| [19-policy-engine.md](19-policy-engine.md)                   | Universal Policy Engine: zero-trust authorization, typed rules, conflict resolution, Risk composition, tamper-evident audit                      |
| [20-ai-copilot.md](20-ai-copilot.md)                         | AI Financial Copilot: constrained decision layer, tool registry, fact-grounding, policy gate, confidence, privacy memory                         |
| [21-automation-engine.md](21-automation-engine.md)           | Automation & Workflow Engine: typed workflows, NL compiler, deterministic scheduler, gated runs, non-custodial session keys                      |
| [22-settlement-engine.md](22-settlement-engine.md)           | Universal Settlement Engine: settlement pipeline, mandatory pre-flight, idempotency, recovery, replayable ledger                                 |
| [23-solver-network.md](23-solver-network.md)                 | Decentralized Solver Network: competitive proposals, verified-not-trusted (simulation), reputation, staking/slashing                             |
| [24-observability-sre.md](24-observability-sre.md)           | Observability, SRE & Self-Healing: error budgets, burn-rate alerts, bounded decide-not-act recovery, runbooks                                    |
| [25-global-scalability.md](25-global-scalability.md)         | Global Scalability: bounded autoscaler, resilience toolkit, multi-region routing, cache cascade, consistency, DR, cost                           |
| [26-compliance-governance.md](26-compliance-governance.md)   | Compliance & Governance: versioned jurisdiction profiles, fail-closed gateway, consent, retention/DSAR, RBAC, hash-chain audit                   |
| [27-plugin-marketplace.md](27-plugin-marketplace.md)         | Plugin Marketplace & SDK: capability permissions (forbidden keys/signing), trust levels, signing gauntlet, sandbox, lifecycle                    |
| [28-white-label.md](28-white-label.md)                       | White-label Wallet Platform: versioned tenant profiles, host→tenant resolution, theme tokens, feature gating (composes w/ compliance), isolation |
| [29-ai-agent-framework.md](29-ai-agent-framework.md)         | AI Agent Framework: bounded propose-only specialist agents, deterministic orchestrator, capability tool-routing, planning-vs-execution split     |
| [30-security-audit.md](30-security-audit.md)                 | Production Security Audit & Hardening: consolidated STRIDE threat model, adversarial-review program, pentest scope, hardening checklist          |
| [31-launch-readiness.md](31-launch-readiness.md)             | Launch Readiness & Day-2 Ops: staged rollout, error-budget-gated canary, blue/green, incident response, rollback playbooks                       |
| [32-v1-master-blueprint.md](32-v1-master-blueprint.md)       | Version 1.0 Master Blueprint: final architecture review, API freeze, performance certification, honest launch checklist, V2/V3 vision            |
| [33-gas-abstraction.md](33-gas-abstraction.md)               | Gas Abstraction & Smart Accounts: bounded sponsorship budget, fee-token selection, capped EIP-1559 params, UserOperation batching                |
| [34-capability-registry.md](34-capability-registry.md)       | Capability Registry: versioned per-chain capability profiles (CAIP-2), static route classes, fail-closed feasibility gate consulted by the planner |
| [35-typescript-sdk.md](35-typescript-sdk.md)                 | TypeScript SDK: zero-dep typed `/v1` client, injectable transport, typed ApiError, retry-GET-only, fluent-over-functional; dogfooded by the web app |
| [36-production-execution-seams.md](36-production-execution-seams.md) | Production execution seams: real EVM EIP-1559 step signer + injected EvmDevice (WalletConnect/hardware) + RPC adapter + nonce; non-custodial; balance discovery |

## Architecture principles (binding)

1. **Keys never leave the device.** No service can sign. A total server-side compromise must not be able to move a single satoshi. Every design in these docs is checked against this invariant first.
2. **The AI proposes; the signature disposes.** LLM output is always a _proposal_ validated by deterministic code; execution requires an explicit device signature over the exact effects shown to the user.
3. **Chains are adapters.** Nothing outside the chain-access layer knows chain quirks. Adding chain #9 must touch one layer, not nine services.
4. **Event-sourced truth for money movement.** Every execution step emits immutable events; state is reconstructible from the log. UI state is a projection, never the source.
5. **Idempotency everywhere.** Every mutating API takes an idempotency key; every consumer dedupes on event id. Retries are the normal case, not the exception.
6. **Read path ≫ write path.** Portfolio/price reads outnumber executions ~100:1. Caches and projections serve reads; the write path is small, serialized, and heavily audited.
7. **Degrade, never brick.** LLM down → structured forms. RPC vendor down → next provider. Region down → standby. Every dependency has a stated degradation mode.
8. **Boring technology, exciting product.** Postgres, Redis, Kafka, Kubernetes. Novelty budget is spent on the intent engine, not the plumbing.
9. **Evolution over big-bang.** We deploy a modular monolith first (Stage A) and split services along the boundaries drawn here when load — not fashion — demands it (§ Evolution below).
10. **Everything observable.** Traces across every hop (OpenTelemetry), structured logs with correlation ids, RED metrics per service, SLOs with error budgets.

## Hard constraints

- **Non-custodial:** no key material, mnemonic, or share thereof server-side. Backup blobs are client-encrypted; we store opaque ciphertext.
- **Trust boundary:** the confirm-sheet + device signature. Everything before it is advisory; everything after it is auditable execution.
- **Regulatory posture:** software provider, not money transmitter. Route planning and relaying only; screening hooks at the routing layer (see 06-security §compliance).
- **Latency budgets (p95):** portfolio read < 300 ms · intent parse < 2.5 s · plan quote < 3 s · execution status push < 1 s after chain confirmation.
- **Availability:** 99.9% (Y1) → 99.95% (Y2+) for the read path; execution path favors _correctness over availability_ (fail safe, park funds, never guess).

## Capacity assumptions (basis for all sizing — revisit quarterly)

| Metric               | Value                    | Derivation                 |
| -------------------- | ------------------------ | -------------------------- |
| Registered users     | 100 M                    | design target              |
| MAU                  | 20 M                     | 20% of registered          |
| DAU                  | 5 M                      | 25% of MAU                 |
| Peak concurrent      | 500 k                    | 10% of DAU                 |
| Portfolio opens      | 15 M/day → ~1,800/s peak | 3/DAU/day, 10× peak factor |
| Intent parses        | 2.5 M/day → ~300/s peak  | 0.5/DAU/day                |
| Plans quoted         | 1.5 M/day → ~180/s peak  | 60% of parses proceed      |
| Executions           | 1 M/day → ~120/s peak    | 40% of parses execute      |
| Chain events indexed | ~50 k/s sustained        | 8 chains, Solana dominant  |
| WS connections       | 500 k concurrent         | = peak concurrent users    |

## Evolution stages (how we get there without overbuilding)

- **Stage A — Modular monolith (0 → ~250k users).** One deployable `api` + one `worker` + indexer pods. Module boundaries in code are _exactly_ the service boundaries in [02-services.md](02-services.md); Redis Streams as the bus. One region.
- **Stage B — Split the hot paths (~250k → 5M).** Extract Indexer, Price, Portfolio, Execution into services; migrate bus to Kafka; add read replicas + regional edge caches; warm standby region.
- **Stage C — Full topology (5M → 100M).** Full service catalog, active-active read path across ≥2 regions, single-writer-region execution path, ClickHouse cluster, self-hosted nodes for top chains.

Stage triggers are load signals (queue lag, p95 breaches, DB CPU > 60% sustained), never calendar dates. The service catalog is written for Stage C; each service page notes its Stage A home.
