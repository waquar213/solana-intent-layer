[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Chapter 5 of the enterprise specification

# Chapter 5 — Universal Identity & Account System

> **Version 3.0** · **Mission:** make blockchain identities invisible. Users should think in terms of *people and accounts* — not chains and addresses.

**Chapter objective.** This is the charter for identity — who the user *is* across Bitcoin, the EVM world,
and Solana, under one mental model. It describes the **target experience**; the buildable detail (exact
derivation paths, the recovery threat model, the sync cryptography) and the honest **shipped-vs-roadmap**
split live in the **[Universal Identity Reference](../blockchain/universal-identity-reference.md)** (Volume
V). Two lines never move: **keys live on-device and never touch a server**, and any recovery or sync design
that would need a server to hold a secret is redesigned, not shipped.

---

## 1. Philosophy

Today's wallets expose blockchain complexity — an Ethereum address, a Solana address, a Bitcoin address, a
Base address, an Arbitrum address. This creates confusion. Intent Wallet should expose **one digital
identity** while managing multiple networks underneath.

---

## 2. Universal Identity

Every user owns **one identity**.

> `waquar.intent`  or  `@waquar`

Everything else is abstracted away.

---

## 3. Three-Address Architecture

This remains the core model:

| Ecosystem | Addresses |
|---|---|
| **Bitcoin** | 1 Bitcoin address |
| **Solana** | 1 Solana address |
| **EVM** | 1 **Universal EVM address** |

Every EVM chain uses the **same** address — Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain,
Avalanche C-Chain. The wallet automatically detects the destination network and handles routing internally.

---

## 4. Identity Graph

Internally, the wallet maintains an **identity graph** — never exposed directly to normal users:

```
User Identity
  ├─ BTC Account
  ├─ SOL Account
  ├─ EVM Account
  ├─ Aliases
  ├─ Devices
  ├─ Permissions
  ├─ Sessions
  └─ Automation Rules
```

---

## 5. Account Types

Support multiple account profiles, each with independent permissions and settings:

**Personal · Business · Family · Shared Treasury · Developer · Test · Watch-only.**

---

## 6. Human-Readable Identity

Users should never need to remember addresses. Preferred forms — resolved automatically:

**@username · ENS (where supported) · domain-based aliases · QR code · contacts.**

---

## 7. Address Resolution

When a user types *"Send 0.2 ETH to Rahul,"* the wallet performs:

1. Contact lookup
2. Alias resolution
3. Chain-compatibility check
4. Safety verification
5. Destination confirmation *(only if ambiguous)*

---

## 8. Device Trust Model

Every device has a trust level:

**Trusted · Verified · New · Suspicious · Revoked.**

High-risk actions from **new** devices require additional verification.

---

## 9. Session Model

Each session stores: **device ID · authentication method · last activity · permissions · expiry · risk
score.** Users can revoke any session **instantly.**

---

## 10. Multi-Device Sync

Support **iPhone · Android · macOS · Windows · Linux · Web.** Sync **only encrypted data** — private keys
must **never** be exposed in plaintext.

---

## 11. Account Switching

Switching accounts should take **one tap** — no logout/login cycle.

> Personal → Business → Family → Developer

---

## 12. Receive Experience

The user taps **Receive**; the wallet asks *"Which asset are you expecting?"*

| Receive | Shows |
|---|---|
| BTC | Bitcoin QR |
| SOL | Solana QR |
| ETH | Universal EVM QR |

No unnecessary technical details.

---

## 13. Send Experience

The user types *"Send $500 USDC to Ahmed."* The wallet automatically:

- resolves Ahmed
- selects the compatible network
- chooses the best route
- checks recipient compatibility
- simulates the transfer
- explains the plan
- requests approval if needed

---

## 14. Identity Recovery

Recovery must prioritize **user control and security**, supporting:

- recovery phrase (where applicable)
- hardware-wallet recovery
- passkeys (future-ready)
- secure cloud-**encrypted** backup (optional, user-controlled)
- trusted-device recovery
- emergency contacts (optional)

---

## 15. Identity Security Score

Show a simple, **actionable** score:

> **92 / 100**
> ✓ Backup enabled · ✓ Trusted devices · ✓ Passcode enabled
> ⚠ One unknown session · ⚠ Review recommended

---

## 16. Contact Intelligence

Contacts store: **name · nickname · preferred assets · supported networks · risk notes (if applicable) ·
verification status.** The wallet remembers previous successful interactions.

---

## 17. Enterprise Identity

Business users need: **teams · roles · approval policies · audit logs · shared treasuries · department-level
permissions.**

---

## 18. Privacy Principles

The wallet should: minimize unnecessary data collection; encrypt sensitive user data; clearly explain what
is stored **locally** vs **synced**; and give users control over synchronization and backups.

---

## 19. Identity Lifecycle

**Create Identity → Verify Device → Create Accounts → Enable Security → Use Wallet → Manage Devices →
Recovery → Retirement.**

---

## 20. Success Criteria

A first-time user should be able to:

- **Receive BTC** without understanding Bitcoin addresses.
- **Receive ETH** on any supported EVM network using the same EVM address.
- **Send** assets using a contact name instead of a hexadecimal address.
- **Recover** access using the recovery methods they previously configured.

> If users still feel they must learn blockchain internals to use the wallet, the identity system needs
> improvement.

---

## What Chapter 5 commits us to

- **One identity, not five addresses** — people and accounts, never chains and hex.
- **One universal EVM address** across every EVM network, with routing handled internally.
- **The identity graph stays internal** — devices, sessions, permissions, and aliases are managed for the
  user, not exposed to them.
- **Keys never leave the device; only encrypted data ever syncs** — recovery and multi-device are designed
  around that line, not against it.
- **The test is invisibility:** if a first-timer must learn blockchain internals, the system has failed.

The buildable detail and the shipped-vs-roadmap split are in the
[Universal Identity Reference](../blockchain/universal-identity-reference.md) (Volume V) — where, for
example, the 3-address derivation and ENS forward resolution are shipped, while usernames, account
abstraction, multi-device sync, and enterprise identity are the roadmap.

---

### 🔜 Chapter 6 Preview — Wallet Core Architecture

The production wallet engine itself — the technical foundation every other feature is built on: the
**wallet lifecycle**, **key-management architecture**, **signing engine**, **transaction builder**,
**balance engine**, **multi-chain synchronization**, **background indexing**, **session management**,
**performance targets**, **offline behavior**, **error recovery**, and **production engineering standards**.
