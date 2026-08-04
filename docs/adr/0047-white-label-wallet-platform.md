# ADR-0047 — White-label: tenant config as data, composed on top of compliance

- Status: Accepted
- Date: 2026-07-06
- Deciders: CTO, Principal Platform Architect, Principal Enterprise Systems Engineer

## Context

Partners want to ship their own branded wallet ("AcmePay") over our engines without touching core and without weakening any guarantee. The dangerous ways to do this are a fork per brand (unmaintainable) or letting tenant config re-enable things the platform disabled.

## Decision

A standalone **`packages/tenancy`** deterministic engine where a brand is a **versioned `TenantProfile` (data)**: brand tokens (colors/logo/name), a requested feature subset, a referenced compliance + policy posture, supported chains, limits, a plugin allowlist, and the host→tenant mapping. Deterministic **tenant resolution** (API-key > host > subdomain > `default`, fail-closed), **theme resolution** (whitelisted semantic tokens over the base design system — no arbitrary CSS/script), and **feature gating that COMPOSES with compliance**: a feature is available iff the tenant enables it **AND** the [compliance](../architecture/26-compliance-governance.md) jurisdiction profile + feature flags permit it — a tenant can only _subtract_, never re-enable what compliance killed. Total **isolation**: every row/cache key is tenant-stamped; an unscoped query is rejected. Non-custodial is invariant — a tenant holds no keys and cannot make a server sign.

## Alternatives considered

| Option                                                             | Verdict                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Tenant profiles as data, composed on top of compliance/plugins** | **chosen**                                                  |
| Fork the codebase per brand                                        | rejected (unmaintainable; drift)                            |
| Tenant config can enable features directly                         | rejected (must AND with compliance; tenant subtracts only)  |
| Free-form theming (arbitrary CSS)                                  | rejected (small whitelisted token vocabulary; no injection) |

## Consequences

- **Maintenance:** onboarding a partner is a new profile version (config), not a release; resolution/theme/gating are pure functions, replayable and testable.
- **Security:** isolation is structural (tenant-stamped everywhere); a tenant can't loosen compliance or the emergency freeze; theming can't inject executable content; non-custodial preserved. Full design: [architecture 28](../architecture/28-white-label.md).
