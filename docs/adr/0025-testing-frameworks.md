# ADR-0025 — Testing: Vitest + fast-check + Testcontainers + Detox/Playwright + k6

- Status: Accepted
- Date: 2026-07-05
- Deciders: QA Lead, CTO

## Context

The test strategy ([requirements.md §9](../../requirements.md)) spans unit, property, integration (against chain forks), E2E, security, load, and chaos — with crypto/money paths demanding known-vector and property testing.

## Decision

**Vitest** (unit/integration, already shipping — 95 tests) · **fast-check** (property tests: derivation determinism, vault roundtrip, EIP-55) · **Testcontainers** (integration with real PG/Redis/Kafka) · **anvil / solana-test-validator / bitcoin regtest** (chain forks) · **Detox** (mobile E2E) + **Playwright** (web/extension E2E) · **k6** (load) · homegrown fault-injection harness (chaos).

## Alternatives considered

| Option                      | Pros                                                       | Cons                                        | Verdict                      |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------- | ---------------------------- |
| **Vitest + fast-check + …** | fast, ESM-native, one runner core↔server, property support | assemble the E2E/load pieces                | **chosen**                   |
| Jest                        | ubiquitous                                                 | slower, ESM friction, heavier               | rejected                     |
| Mocha/Chai                  | flexible                                                   | more wiring, no built-in speed edge         | rejected                     |
| Cypress (E2E)               | nice DX                                                    | weaker mobile story; Playwright covers more | rejected (Playwright chosen) |

## Consequences

- **Maintenance:** one primary runner (Vitest) across packages and services; property + official-vector tests are the standard for crypto/money code, catching whole bug classes.
- **Scaling:** Testcontainers gives realistic integration without shared test infra; fork-based execution tests run in CI; k6/chaos gate pre-GA.
- **Security:** known-vector tests pin crypto correctness; fuzz targets (parsers, decoders, vault envelope) run nightly; contract tests check authz/IDOR on every endpoint ([handbook 04](../handbook/04-quality.md)).
