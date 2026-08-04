# 34 — Capability Registry

## Why this exists

For most of the build, "which chain can do what" was assumed in code. The planner mapped an asset to a chain with a hardcoded `chainForSymbol` (`BTC → bip122:bitcoin`, else `eip155:1`), the gas layer decided fee strategy with an `eip155:` string-prefix test, and nothing asked "can this chain actually _stake_?" or "is there even a bridge from A to B?" before proposing a plan. That produces plans that pass every check and then fail at execution — the worst place to discover an assumption is wrong.

The **Capability Registry** (`packages/capabilities`) is the single, deterministic source of truth for those questions. The Intent Engine and Route Optimizer **consult** it instead of assuming, so the wallet decides on _dynamic capabilities_ — and a chain we haven't taught it about is treated as unsupported, not silently defaulted.

## What it owns (and what it deliberately doesn't)

It owns exactly one thing: the **static, versioned answer** to _"does this chain / provider-route class support action X, and under what mechanics (fee model, finality, token standard, addressing)?"_ It is pure data plus deterministic queries — it never quotes, never scores, never executes, never touches the network.

It complements its three neighbours without overlap:

| Package | Owns | The Capability Registry instead… |
| --- | --- | --- |
| `@intent-wallet/chains` | Adapter I/O + network identity (RPC, balances, broadcast), keyed on its own `ChainId` union | keys on **CAIP-2** ids (`eip155:1`) and adds the FEATURE facts `ChainInfo` deliberately omits |
| `@intent-wallet/providers` | **Live** health — `successRate`, latency, circuit state — changing every request | declares only that a route class **exists** ("Stargate CAN bridge eip155:1↔137 for USDC"), never whether it's healthy _now_ |
| `@intent-wallet/router` | Per-request candidate generation, scoring, ranking | is consulted **before** the router, to fail-closed on provably-impossible plans so the router never wastes a quote on an impossible route |

**Doctrine:** a new chain or provider is a new versioned **profile** (data), not new code; an unknown chain or capability is **NOT supported** (fail-closed).

## The pieces

- **`ChainCapabilityProfile`** — a chain's posture as versioned data: CAIP-2 `id`, `version`, `status` (draft/active/retired), `availability` (supported/testnet_only/deprecated/maintenance), `ecosystem`, `nativeAsset`, `feeModel` (eip1559/legacy/utxo/spl), `finality`, `tokenStandard`, the `capabilities` vocabulary it supports, and `smartAccount`/`staking`/`addressing` sub-facts. Ships with four built-ins: Ethereum, Polygon, Bitcoin, Solana.
- **`ChainCapabilityRegistry`** — the versioned store (a near-exact port of the compliance `ProfileRegistry`): monotonic versions per id, at most one `active` version, deep-cloned in and out so a published version can never be aliased and rewritten. `validateChainProfile` rejects a malformed profile on register — including cross-checks (a profile can't claim `stake` in its vocabulary while `staking.supported` is false).
- **`ProviderRouteRegistry`** — static, health-free route-class declarations (`providerId`, `action`, `from`/`to`/`symbol`, `enabled`). `enabled` is an integration toggle, never liveness. Exposes `routesFor(...)` and a `bridgeConnectivity()` adjacency graph (direct edges only — no multi-hop inference in v1).
- **`CapabilityService`** — the one facade the runtime consults: `supportsChain`, `supportsCapability`, `feeModelFor`, `canTransfer`, `canSwap`, `canBridge`, `checkStep`, `checkPlan`. **Every query fails closed**: an unknown chain, a chain whose active profile isn't `availability: 'supported'`, or a capability absent from the profile all return false / infeasible.

## The consultation seam

The registry is wired at the composition root (`packages/runtime`). `createWalletRuntime` builds a `CapabilityService` (the built-in profiles by default; overridable via config). After the planner proposes a plan, `WalletRuntime.plan()` maps each `ExecutionPlan` step to a capability query and calls `checkPlan`:

```
NL → parse → plan  →  capabilities.checkPlan(plan)  →  feasible?  → plan
                                     │                    └ no → rejected (before authorize/sign)
                                     └ each step: kind → required capability;
                                       a bridge also needs both chains supported + a declared route
```

A stake on a non-staking chain, or a bridge to a chain with no declared route, becomes a **rejection before the plan can be authorized or signed** — the same fail-closed posture the Risk and Policy gates take, one step earlier. Feasible plans on supported chains are unchanged.

`checkStep` maps each `PlanStepKind` (`transfer`/`swap`/`bridge`/`approve`/`stake`) to the one capability its chain must have; the map is exhaustive over the step-kind union (enforced at compile time and asserted by test). Bridges additionally require both endpoints supported and a declared bridge route.

## Determinism & boundaries

Capability facts are static, so v1 queries read no clock; the `CapabilityEnv` exists only for convention parity and future effective-dated selection. The package has **zero internal dependencies** — it never imports provider health types, so the static-fact / live-health boundary can't erode. Money never appears here: this layer answers "CAN it?", never "how much".

See [ADR-0051](../adr/0051-capability-registry.md) for the decision record.
