# ADR-0045 — Compliance & Governance: a policy-driven, jurisdiction-configurable layer outside core wallet logic

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Compliance Architect, Principal Security Engineer, Principal Privacy Engineer, Principal Platform Architect, Principal Enterprise Systems Engineer

## Context

A global, non-custodial wallet is subject to many jurisdictions whose rules differ and change frequently (reporting thresholds, consent, data retention, feature availability, screening, sanctions handling). Baking any of this into the core would make the wallet un-shippable across regions and un-maintainable as rules change, and risks compromising the non-custodial guarantee. We need compliance that is modular, configurable per jurisdiction/customer, and completely separable from the code that moves value.

## Decision

Build a **standalone `packages/compliance`** engine where jurisdiction rules are **versioned DATA** (`JurisdictionProfile`) and the engine is generic over them — a new regulatory environment is a new profile, not a code change. A deterministic **Compliance Gateway** evaluates each action **fail-closed** and **most-restrictive**, returning a verdict (`allow` / `require_disclosure` / `require_consent` / `block`) plus obligations (report / screen / disclose / retain / audit). Around it: versioned profile registry (monotonic versions, one active per id), consent evaluation, a privacy engine that reconciles DSAR **erasure against retention/legal holds**, RBAC + **maker-checker** approval workflows + emergency freeze + feature flags, a **tamper-evident hash-chained** audit log with secure export, and deterministic reporting. Time/ids/hash are injected, so every decision and every audit hash is reproducible.

The platform **gates and records; it never signs or moves funds** — the wallet stays non-custodial. Compliance _provides_ the jurisdictional thresholds that the [Risk (ADR-0036)](0036-security-risk-engine.md) and [Policy (ADR-0038)](0038-policy-engine.md) engines _enforce_; screening is performed by Risk and passed in. No responsibility is duplicated across the three.

## Alternatives considered

| Option                                                            | Pros                                                  | Cons                                                                                | Verdict                                              |
| ----------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Policy-driven engine + versioned jurisdiction profiles (data)** | one codebase serves every region; auditable; testable | up-front modelling of the profile schema                                            | **chosen**                                           |
| Hardcode rules per country in the wallet                          | quick for the first country                           | un-shippable globally; every rule change is a release; couples compliance to core   | rejected (rules as data, engine generic)             |
| Fold compliance into the Policy Engine                            | fewer packages                                        | conflates per-action authorization with jurisdictional posture; duplicated concerns | rejected (distinct engines; compliance feeds policy) |
| Fail OPEN on a missing profile (allow, log)                       | fewer false blocks                                    | lets actions through under an unknown regulatory posture — the core risk            | rejected (fail closed)                               |
| Custodial controls (freeze funds, reverse tx)                     | strongest enforcement                                 | breaks the non-custodial guarantee; makes us a money transmitter                    | rejected (gate before signing; never hold keys)      |
| Mutable profiles (edit in place)                                  | simple                                                | can't replay a past decision against the rules that produced it                     | rejected (versioned, monotonic, one active per id)   |

## Consequences

- **Maintenance:** onboarding a jurisdiction or enterprise customer is a new profile version (config), not a release; each module is a pure function, tested (fail-closed, most-restrictive, sanctions block+report, consent expiry, erasure-vs-hold, maker-checker, tamper-evident chain — 37 tests).
- **Scaling:** the gateway is stateless field comparison over one profile (<200 ms, off the fund-moving path); audit append is O(1); archival/reporting delivery live in infra.
- **Security & privacy:** every governance action is authenticated, authorized (RBAC), auditable (including denials) and versioned; maker-checker stops unilateral posture changes; the audit chain is tamper-evident and PII-free (references by id); erasure never overrides a legal hold; fail-closed on unknown posture; non-custodial preserved. Full design: [architecture 26](../architecture/26-compliance-governance.md).
