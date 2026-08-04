# ADR-0011 — Blockchain RPC: multi-provider ProviderPool

- Status: Accepted
- Date: 2026-07-05
- Deciders: Blockchain Lead, SRE Lead

## Context

RPC vendors fail, rate-limit, and lie. A wallet cannot brick when one vendor degrades, must not fail over on deterministic chain answers (reverts), and must never leak API keys in logs.

## Decision

A **ProviderPool** (`packages/chains`, shipped) per chain: endpoints tried in **configured priority order** (keyed providers first, public fallbacks last), failed endpoints put in cooldown with linear backoff, per-attempt timeouts, and API-key redaction. JSON-RPC error responses propagate WITHOUT failover. Self-host nodes for top chains behind the same pool as volume grows.

## Alternatives considered

| Option                                 | Pros                                                | Cons                                                | Verdict                                     |
| -------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| **Priority pool + cooldown**           | deterministic, no routing flap, degrades not bricks | not "smart" latency routing (by choice)             | **chosen**                                  |
| Latency-weighted routing               | theoretically optimal                               | routing flap, hard to reason about, thundering herd | rejected (EWMA kept for observability only) |
| Single managed vendor (Alchemy/Infura) | simplest                                            | single point of failure + vendor lock + cost        | rejected                                    |
| Client-direct RPC                      | no backend hop                                      | leaks keys, no failover, no quorum                  | rejected                                    |

## Consequences

- **Maintenance:** one abstraction ([packages/chains/src/provider.ts](../../packages/chains/src/provider.ts)) with 24 tests; adding an endpoint is config.
- **Scaling:** self-hosted nodes for top-4 EVM + Solana slot in as priority endpoints as the vendor bill crosses the self-host line (~1–5M users, [architecture 10 §2](../architecture/10-cost-and-scale.md)); pool handles overflow to vendors.
- **Security:** keys redacted from logs (origin only); money-path reads use quorum (2-of-3 on confirmations) so a single lying endpoint can't fake a balance ([architecture 06 T5](../architecture/06-security.md)); reverts never trigger wasteful/obscuring failover.
