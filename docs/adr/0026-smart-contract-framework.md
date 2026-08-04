# ADR-0026 — Smart contracts: Foundry + ERC-4337 account abstraction

- Status: Accepted
- Date: 2026-07-05
- Deciders: Smart-Contract Lead, Security Lead

## Context

Phase 9 introduces gas abstraction and bounded automation via ERC-4337 smart accounts, paymasters, and session keys. Contract tooling must have first-class fuzzing/invariant testing because these contracts guard user funds.

## Decision

**Foundry** (forge/cast/anvil) as the contract toolchain. Standard: **ERC-4337** smart accounts; the account module (Safe vs Kernel vs Biconomy) is a **Phase-9 sub-ADR gated on a security audit** — not pre-committed here. Anvil already backs our execution fork tests ([ADR-0025](0025-testing-frameworks.md)).

## Alternatives considered

| Option             | Pros                                                                     | Cons                                                               | Verdict                                  |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------- |
| **Foundry**        | fast, Solidity-native tests, built-in fuzzing + invariant testing, anvil | Solidity-only (fine)                                               | **chosen**                               |
| Hardhat            | JS ecosystem, plugins                                                    | slower, JS test harness for money contracts, weaker fuzzing        | rejected (Foundry's fuzzing is decisive) |
| Truffle            | historical                                                               | effectively deprecated                                             | rejected                                 |
| Non-4337 custom AA | bespoke control                                                          | reinvents a heavily-audited standard; wallet-support fragmentation | rejected                                 |

## Consequences

- **Maintenance:** contracts live in their own package with Foundry tests; the account-module choice is deferred to when we build it, with an audit as a prerequisite.
- **Scaling:** 4337 is the ecosystem-standard AA path (bundler/paymaster infra exists); session keys enable automation without custodial delegation.
- **Security:** fuzzing + invariant tests are mandatory for fund-guarding contracts; external audit before GA of the smart-account path; session keys are cryptographically bounded (amount/venue/expiry) — see [ADR-0028](0028-automation-session-keys.md).
