# ADR-0034 — Provider / Aggregator framework: plugins over health-scored registries

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Distributed Systems Engineer, Principal API Architect

## Context

Execution needs swaps, bridges, prices, gas estimates, and simulations — each available from several third-party vendors with different reliability, latency, and cost. If the Execution Engine or Route Optimizer depended on a specific vendor, swapping or adding one would mean touching core money code, and a single vendor outage would break the wallet. We need vendor independence, automatic failover, and best-of-N quote selection.

## Decision

A **provider plugin framework**: five interfaces (`SwapProvider`, `BridgeProvider`, `PriceProvider`, `GasProvider`, `SimulationProvider`), each a thin adapter over a vendor. Providers live in a **`ProviderRegistry`** that selects by a **`HealthTracker`** composite score (success rate + latency) with a **circuit breaker** (closed → open → half-open → closed). `run` uses the best available provider with failover; `collect` fans out for **quote aggregation**; responses are validated (positive output, sane slippage, not stale) before any quote can win. Nothing downstream ever names a vendor.

## Alternatives considered

| Option                                             | Pros                                                                                     | Cons                                                                                       | Verdict                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| **Plugins + health-scored registry**               | vendor-independent; add/replace = one plugin; auto failover; best-of-N; testable offline | a registry + scoring to maintain                                                           | **chosen**                                        |
| Hardcode one aggregator (e.g. only 0x / only LiFi) | simplest                                                                                 | single point of failure; vendor lock; no best-of-N; core changes to switch                 | rejected (the anti-pattern this ADR forbids)      |
| A single meta-aggregator SDK                       | less code                                                                                | opaque; no control of failover/validation/health; a big dep on the money path              | rejected                                          |
| Static config picks the provider per chain         | predictable                                                                              | no automatic failover; a degrading vendor keeps getting traffic until someone edits config | rejected (health scoring does this automatically) |

## Consequences

- **Maintenance:** a new vendor is a new file implementing one interface + a `register()` call; the Execution Engine and Route Optimizer never change. Health/failover/aggregation are written once.
- **Scaling:** the registry drains traffic from degrading providers automatically (circuit breaker + score); `collect` parallelizes quote gathering; the framework is stateless per call and scales with the workers.
- **Security:** provider responses are validated, never trusted blindly (stale/invalid quotes are dropped before execution); a compromised or lying provider is filtered or shed by the breaker rather than executed against; no vendor sees keys — the framework only quotes/simulates, the wallet core signs. Full design: [architecture 15](../architecture/15-provider-framework.md).
