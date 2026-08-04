# ADR-0031 — Blockchain Adapter Layer as the only chain gateway

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Blockchain Infrastructure Architect

## Context

The platform must talk to Bitcoin (UTXO/REST), Solana (accounts/JSON-RPC), and six EVM chains (JSON-RPC) — each with different balance models, fee models, tx shapes, and RPC dialects. If the Intent/Execution engines learn these differences, business logic couples to chains and adding a chain touches everything. We need one abstraction, and the rest of the platform must never bypass it.

## Decision

A **`BlockchainAdapter`** interface (read balances/metadata, validate, estimate fees, broadcast, track status) with one implementation per ecosystem: **`EvmAdapter`**, **`SolanaAdapter`**, **`BitcoinAdapter`**. An **`AdapterRegistry`** is THE gateway (dependency injection): given a `ChainId` it returns the wired adapter (ProviderPool for JSON-RPC chains, `HttpRestTransport` for Bitcoin esplora), memoized. Business logic depends only on the interface + registry. Adapters broadcast + track but never build or sign (execution builds, wallet core signs).

## Alternatives considered

| Option                                                            | Pros                                                                     | Cons                                                                                   | Verdict                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Per-ecosystem adapters behind one interface + registry**        | one mental model; new chain = new adapter; testable with fake transports | small amount of interface design                                                       | **chosen**                                   |
| A heavy multi-chain SDK (e.g. one library abstracting all chains) | less code to write                                                       | opaque, hard to control failover/redaction/fees; big dep in a hot path                 | rejected                                     |
| Let each service call chains directly                             | "simple"                                                                 | chain quirks leak everywhere; no single failover/rate-limit/redaction seam; untestable | rejected (the anti-pattern this ADR forbids) |
| One giant adapter with switch-by-chain internally                 | one class                                                                | violates open/closed; UTXO and account logic tangled                                   | rejected                                     |

## Consequences

- **Maintenance:** adding a chain = implement `BlockchainAdapter` + register it; zero business-logic changes. EVM-only needs (gas/nonce/simulate) live on `EvmAdapter` without polluting the shared interface.
- **Scaling:** JSON-RPC adapters get the ProviderPool's failover/cooldown/redaction for free ([ADR-0011](0011-blockchain-rpc-strategy.md)); self-hosted nodes slot in as priority endpoints via the registry's URL config. REST (Bitcoin) shares the same error taxonomy; multi-provider REST failover is a recorded follow-up.
- **Security:** adapters NEVER sign and never hold keys; they take a raw signed tx and broadcast it. Address validation is structural per chain; strict cross-ecosystem checks live in `@intent-wallet/identity`. Reverts (JsonRpcError) propagate deterministically rather than failing over and masking errors. Full design: [architecture 12](../architecture/12-blockchain-adapters.md).
