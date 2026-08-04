# ADR-0005 — Vault: scrypt + AES-256-GCM, versioned envelope

- Status: Accepted
- Date: 2026-07-05
- Deciders: Security Lead, Wallet Core Lead

## Context

The mnemonic must be encrypted at rest on-device under a user password/PIN, on mobile runtimes (React Native) where native crypto modules are inconsistent. KDF parameters must be upgradeable without breaking existing vaults.

## Decision

**scrypt** (N=2¹⁵, r=8, p=1 default) for key derivation → **AES-256-GCM** for encryption. Parameters live in a **versioned JSON envelope**, bound to the ciphertext as GCM additional authenticated data (AAD) so tampering with any field fails authentication.

## Alternatives considered

| Option                                 | Pros                                                                      | Cons                                                   | Verdict                                         |
| -------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| **scrypt + AES-256-GCM**               | memory-hard KDF, audited pure-JS impl, AEAD integrity, params upgradeable | scrypt tuning per device                               | **chosen**                                      |
| Argon2id + AES-GCM                     | modern KDF winner                                                         | no solid pure-JS/RN implementation; native-module risk | rejected (revisit if RN story improves)         |
| PBKDF2 + AES-GCM                       | ubiquitous                                                                | not memory-hard, weaker vs GPU/ASIC                    | rejected                                        |
| OS keystore only (no app-layer crypto) | simple                                                                    | inconsistent across devices; no portable backup blob   | rejected (we wrap the keystore, not replace it) |

## Consequences

- **Maintenance:** envelope versioning means we can raise N or migrate to Argon2id later without a flag day — old vaults carry their own params.
- **Scaling:** device-only; no server load.
- **Security:** memory-hard KDF + AEAD; parameter bounds double as DoS protection (a hostile envelope can't demand gigabytes of KDF memory); tamper-evidence proven by tests ([packages/core/test/vault.test.ts](../../packages/core/test/vault.test.ts)). Layered under OS Secure Enclave/StrongBox on device ([architecture 06 §2.1](../architecture/06-security.md)).
