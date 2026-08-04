# ADR-0049 — Security Audit & Hardening: an adversarial-review program + external-audit readiness

- Status: Accepted
- Date: 2026-07-06
- Deciders: CTO, Principal Security Engineer, Principal Privacy Engineer

## Context

Before a production launch a non-custodial wallet must be audit-ready: a consolidated threat model, an internal adversarial-review program, a pentest scope, dependency/supply-chain scanning, and a hardening checklist — so an external auditor finds a defensible, already-hardened system rather than raw code.

## Decision

Treat security as a **program**, not a package. Consolidate the platform's invariants (keys never leave the device; AI/plugins/agents never sign; fail-closed everywhere; capability + trust bounds; tamper-evident audit) into a STRIDE-style threat model across the trust boundaries (device · API · engines · plugins · chain). Run an **internal adversarial-review program** (multi-lens attack → independent verify) on the security-critical engines — already done on risk, policy, compliance, and scale (13/19/… real defects found and fixed); the **plugins review still needs a re-run** (it hit an API session limit). Define the pentest scope, external-audit readiness checklist, dependency/supply-chain scanning, secrets management, and a per-package hardening checklist. See [architecture 30](../architecture/30-security-audit.md).

## Alternatives considered

| Option                                                                     | Verdict                                                    |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Internal adversarial program + threat model + external-audit readiness** | **chosen**                                                 |
| Skip internal review, rely on the external auditor                         | rejected (find defects before the auditor; cheaper, safer) |
| One-time audit, no ongoing program                                         | rejected (reviews re-run per security-critical change)     |

## Consequences

- **Readiness:** an external auditor receives a documented threat model, a fixed defect log, and a hardening checklist — a defensible starting point.
- **Honest gap:** the plugins adversarial review must be re-run, and real device-signing + real vendor integration must be in place before a production security sign-off. Full program: [architecture 30](../architecture/30-security-audit.md).
