# ADR-0003 — Wallet cryptography libraries: @noble / @scure

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Security Lead

## Context

Key generation, HD derivation, and signing across secp256k1 (BTC/EVM) and ed25519 (SOL) are the highest-consequence code we write. Library choice IS a security decision.

## Decision

The _*@noble/* (curves, hashes, ciphers) and @scure/_ (bip32, bip39, base, btc-signer)** suite as the sole crypto foundation. New crypto deps outside this family require a security-team exception.

## Alternatives considered

| Option                     | Pros                                                                                                  | Cons                                                          | Verdict    |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
| **@noble/@scure**          | audited, zero-dependency, pure-JS (RN-friendly), one maintainer lineage, minimal supply-chain surface | must assemble higher-level flows ourselves                    | **chosen** |
| ethers/bitcoinjs internals | batteries-included                                                                                    | heavier deps, native-module pain in RN, larger attack surface | rejected   |
| WebCrypto + hand-rolled EC | platform-native                                                                                       | no secp256k1, easy to get subtly wrong, no BIP tooling        | rejected   |
| libsodium (wasm)           | fast, respected                                                                                       | wasm loading in RN, no BIP32/secp256k1 story                  | rejected   |

## Consequences

- **Maintenance:** tiny, auditable dependency tree; pinned + reviewed on every bump (3-day cooldown). We own the higher-level composition, which is exactly what we test with official vectors.
- **Scaling:** pure-JS runs identically on device and server; no native build matrix.
- **Security:** minimal supply-chain surface; already validated in `packages/core` against BIP-39/84, EIP-55, and SLIP-0010 official vectors + cross-checks. External audit target before beta ([architecture 06 §5](../architecture/06-security.md)).
