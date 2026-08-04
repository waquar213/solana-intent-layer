# ADR-0029 — Wallet Core: manager facade + unified WalletSigner

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Wallet Engineer, Security Lead

## Context

The cryptographic primitives (mnemonic, HD derivation, vault, per-chain signing) exist and are vector-tested. Consumers (execution engine, dApp bridge, UI) need a small, safe, stable surface to create/unlock/lock/sign — without wiring keyring + vault + store + session themselves, and without ever seeing key material. Transaction signing spans three ecosystems with very different shapes (EVM RLP tx / EIP-712, Bitcoin PSBT, Solana message) that must present as ONE interface.

## Decision

- A **`WalletManager` facade** is the single public entry point (create/import/unlock/lock/changePassword/wipe/getAccount/getSigner). It owns the lifecycle and composes the keyring, vault, `SecureStore`, and `SessionManager`.
- A **`WalletSigner` interface** with a **`SigningManager`** implementation unifies signing across chains; each op derives the key on demand and zeroizes it immediately.
- **`SecureStore`** is an interface (in-memory impl in core; native Keychain/Keystore impls in apps) — core owns the logic, the platform owns the persistence.
- **`SessionManager`** handles auto-lock with an injectable scheduler.

## Alternatives considered

| Option                                               | Pros                                                                             | Cons                                                                                     | Verdict                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Facade + unified signer interface**                | one safe surface, key lifetime minimized, extensible (HW/MPC = new signer impls) | a thin orchestration layer to maintain                                                   | **chosen**                                 |
| Expose keyring/vault directly to consumers           | less code                                                                        | every consumer re-implements lifecycle + risks mishandling keys; no single audit surface | rejected                                   |
| Per-chain signer objects, no common interface        | matches chain differences                                                        | consumers branch on chain everywhere; execution engine couples to chain specifics        | rejected (interface hides the differences) |
| Store the seed decrypted in the store while unlocked | simpler unlock                                                                   | defeats the vault; a store compromise leaks the seed                                     | rejected (non-custodial violation)         |

## Consequences

- **Maintenance:** consumers depend on `WalletManager` + `WalletSigner` only; primitives can be refactored freely behind them. Adding a chain's signing = one method + one test, behind the existing interface.
- **Scaling:** device-only; no backend impact. The interface is the seam for hardware wallets and MPC/social recovery (v2) — added as new `WalletSigner` implementations without touching callers.
- **Security:** keys have the shortest possible lifetime (derive → sign → zeroize in `finally`); lock destroys the keyring; the only persisted state is opaque vault ciphertext; no API returns key material except the explicit SENSITIVE backup export. Full analysis: [wallet-core threat model](../security/wallet-core-threat-model.md).
