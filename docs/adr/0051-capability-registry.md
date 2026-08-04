# ADR-0051 — Capability Registry: versioned capability data, consulted before execution

- Status: Accepted
- Date: 2026-07-06
- Deciders: CTO, Principal Blockchain Engineer, Principal Product Engineer

## Context

The planner and gas layer assumed "which chain can do what" in code: a hardcoded asset→chain map, an `eip155:` prefix test for fee strategy, and no check that a chain could actually stake or that a bridge route existed. Those assumptions produce plans that pass every gate and then fail at execution — and adding a chain meant editing planner code. We need a single, dynamic source of truth for chain/provider capabilities that the Intent Engine and Route Optimizer consult, so a plan the platform provably can't execute is rejected _before_ authorization and signing.

## Decision

A standalone **`packages/capabilities`** deterministic registry that ANSWERS capability questions from **versioned DATA** and nothing more. Chain postures are `ChainCapabilityProfile`s keyed on **CAIP-2** ids, stored in a versioned registry (monotonic versions, single active per id, deep-cloned for replayability — the same pattern as compliance's `JurisdictionProfile`). Provider/bridge route **classes** are static, health-free declarations. A `CapabilityService` facade exposes fail-closed queries (`supportsChain`, `supportsCapability`, `feeModelFor`, `canTransfer`/`canSwap`/`canBridge`, `checkStep`, `checkPlan`); an unknown chain, a non-`supported` availability, or an absent capability all resolve to **not supported**. The composition root wires it in: `WalletRuntime.plan()` runs `checkPlan` on a proposed plan and turns an infeasible one into a rejection. A new chain or provider is a new profile (data), never new code.

## Alternatives considered

| Option | Verdict |
| --- | --- |
| **Standalone versioned capability registry, consulted before execution** | **chosen** |
| Keep capabilities hardcoded in the planner | rejected (unexecutable plans slip through; a new chain = code change) |
| Fold capability facts into `@intent-wallet/chains` `ChainInfo` | rejected (mixes network I/O with feature policy; chains has no versioning/fail-closed contract) |
| Derive capabilities from live provider health | rejected (conflates "route exists" with "route healthy"; live health stays in `@intent-wallet/providers`) |
| Key on the `chains` `ChainId` union instead of CAIP-2 | rejected (planner/runtime speak CAIP-2; mapping is the caller's job, not a second id space here) |

## Consequences

- **Maintenance:** capabilities are loaded data, not code; onboarding a chain is a new profile + route declarations, validated on register. Each query is a pure function (21 tests: fail-closed paths, versioning/isolation, route matching, checkPlan completeness).
- **Scaling:** static lookups over an in-memory map; no network, no per-request cost. The static-fact / live-health boundary keeps the registry small as chains grow.
- **Security:** fail-closed by construction — an unknown or not-`supported` chain, or an absent capability, is never treated as capable, so an infeasible plan is rejected before it can be authorized or signed. Zero internal deps means the boundary against live provider health can't erode. Full design: [architecture 34](../architecture/34-capability-registry.md).
