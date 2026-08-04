# ADR-0030 — Universal Identity + Portfolio layering (pure engines over injected sources)

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Blockchain Architect, Identity Protocol Designer

## Context

Above the wallet core (keys) we need the layer that makes chains invisible: one identity with three receive addresses, cross-ecosystem address handling, contacts, and a unified portfolio. This layer is the foundation the Intent/AI engines build on, so its boundaries and testability matter as much as its behavior. Portfolio aggregation depends on live balances (chain adapters) and prices (price service) — data that must not be baked into the aggregation logic.

## Decision

- **`packages/identity`** is a PURE domain engine: identity model, address classify/validate/resolve, contacts. Zero network I/O; depends only on the wallet core for derived addresses.
- **`packages/portfolio`** is PURE aggregation (`aggregatePortfolio`) plus **injected** `BalanceSource`/`PriceSource` interfaces — the chain layer and price service implement them. Fiat math is integer-only (micro-USD), no floats.
- **`packages/chains`** gains a `BlockchainAdapter` interface with the first implementation (`EvmAdapter`, native + ERC-20 over the ProviderPool). Business logic references chains only through this interface (ADR-0011/0012).
- Asset grouping is by symbol for the MVP, behind an `assetKey` override so a canonical (chain, address)→asset-id registry drops in later without an API change.

## Alternatives considered

| Option                                     | Pros                                                                              | Cons                                                                                | Verdict                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Pure engines + injected sources**        | fully testable with fixtures; fetch is pluggable/cacheable; chains stay swappable | a little more wiring at the composition root                                        | **chosen**                                           |
| Aggregation fetches balances/prices itself | fewer moving parts                                                                | untestable without network; couples portfolio to specific adapters; no caching seam | rejected                                             |
| Fold identity into the wallet core         | one package                                                                       | mixes key material with chain-data concerns; bloats the audited crown jewel         | rejected (identity has no keys)                      |
| Symbol-only grouping forever               | simple                                                                            | two tokens sharing a symbol collide                                                 | rejected (MVP now, `assetKey` seam for the registry) |

## Consequences

- **Maintenance:** identity and aggregation are pure functions/classes — trivial to test and reason about; adding a chain = a new `BlockchainAdapter`; replacing symbol grouping = an `assetKey` function.
- **Scaling:** aggregation is cheap and stateless; the cost (balance/price fetches) lives behind cacheable source interfaces at the Portfolio Service (Redis, event-driven refresh) — the read path scales via caching, not by touching this logic.
- **Security:** identity holds NO signing authority and no key material; addresses are strictly validated before use (EIP-55/bech32/base58 checksums); identity ids are hashes, not PII; integer-only fiat math avoids rounding drift. Full analysis: [architecture 11 §7](../architecture/11-universal-identity.md).
