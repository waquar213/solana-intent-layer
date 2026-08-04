[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Chapter 6 of the enterprise specification

# Chapter 6 — Wallet Core Architecture

> **Version 3.0** · **Mission:** build a wallet engine that can reliably serve millions of users while remaining secure, fast, explainable, and extensible.

**Chapter objective.** This is the charter for the production wallet engine — the operating system every
other feature is built on. It states the architecture and the contracts; the buildable engineering detail
(with each part tagged **shipped** vs **roadmap**) is the **[Wallet Core Reference](../blockchain/wallet-core-reference.md)**
(Volume V). Two lines never move: **keys live on-device and never touch a server**, and **every signature is
on-device** — the AI has zero signing authority.

---

## 1. Core Philosophy

The Wallet Core is **not a UI feature.** It is the operating system that coordinates:

**Identity · Keys · Accounts · Assets · Transactions · AI · Security · Synchronization.**

Everything flows through the Wallet Core.

---

## 2. High-Level Architecture

```
User → AI Interface → Intent Engine → Wallet Core → Execution Engine → Settlement Layer → Blockchain
```

The Wallet Core **never directly talks to the UI.** The UI communicates through **APIs only.**

---

## 3. Wallet Core Modules

The Wallet Core contains these modules — each with **one** responsibility:

**Wallet Manager · Identity Manager · Account Manager · Key Manager · Asset Manager · Balance Manager ·
Transaction Manager · Signing Engine · Sync Engine · Session Manager · Notification Engine · Cache Manager ·
Settings Manager.**

---

## 4. Wallet Lifecycle

Every stage must be **recoverable**:

**Install → Create Identity → Create Wallet → Enable Security → Sync Assets → Ready → Active Usage → Backup
→ Recovery → Archive.**

---

## 5. Key Management

The wallet **never exposes private keys to application code.** Keys stay inside secure storage; signing
requests are **isolated.**

*Future roadmap:* Secure Enclave · Hardware Wallet · MPC · Passkeys.

---

## 6. Account Engine

Accounts are **independent.** Each account stores:

**Account ID · Identity ID · Type · Status · Networks · Assets · Permissions · Automation Rules · Security
Policy.**

---

## 7. Asset Engine

Responsible for: discovering assets · tracking balances · metadata · token logos · spam filtering · hidden
assets · favorites · price feeds.

**The UI never calculates balances.**

---

## 8. Balance Engine

Maintains: native balances · token balances · NFT balances · total portfolio value · historical snapshots.
Updates happen **automatically.**

---

## 9. Transaction Engine

Handles **Send · Receive · Swap · Bridge · Stake · Unstake · Approvals · Contract interactions** — all
operations become **one common transaction model.**

---

## 10. Signing Engine

Every signing request follows the same pipeline — **no module bypasses it:**

**Request → Security Validation → Policy Check → Simulation → User Approval *(when required)* → Sign →
Broadcast → Monitor → Complete.**

---

## 11. Transaction State Machine

Every transaction moves through:

**Draft → Planning → Simulation → Waiting Approval → Signing → Broadcasting → Pending → Confirmed →
Completed → Archived.**

Failure states: **Cancelled · Expired · Failed · Reverted.**

---

## 12. Background Sync

Continuously updates — without blocking the UI: **balances · prices · portfolio · NFTs · approvals ·
pending transactions · notifications.**

---

## 13. Cache Strategy

Three cache layers:

1. **Memory Cache** — instant UI
2. **Local Database** — offline
3. **Network Sync** — fresh data

The wallet opens **instantly** using cached data, then refreshes in the background.

---

## 14. Offline Mode

Users can view portfolio · history · addresses, and **prepare transactions (draft).** Operations requiring
blockchain connectivity are **clearly marked unavailable** until online.

---

## 15. Performance Targets

- App launch: **under 2 seconds**
- Home screen interactive: **under 1 second** after cached load
- Transaction plan generation: **under 2 seconds** (excluding network delays)
- Smooth **60 FPS** scrolling and animations

---

## 16. Error Recovery

If a transaction fails, the wallet should: **explain why · preserve the draft · offer safe alternatives when
possible · avoid making the user start over.**

---

## 17. Session Manager

Tracks: active device · authentication state · timeout · biometric status · trusted session · risk level.
Supports **quick lock** and **re-authentication.**

---

## 18. Notification Engine

Only **useful** notifications — no spam: transaction confirmed · action required · security alert ·
automation completed · important portfolio event.

---

## 19. Logging & Diagnostics

Keep **separate**: user-facing activity history vs internal diagnostic logs. **Sensitive information must
never appear in user-visible logs.**

---

## 20. Core Principles

The Wallet Core must be: **Modular · Testable · Observable · Secure · Extensible · Chain-agnostic ·
AI-ready.** No feature should require rewriting the Wallet Core.

---

## 21. Definition of Done

The Wallet Core is complete when it can:

- manage multiple accounts under one identity;
- support BTC, Solana, and EVM accounts seamlessly;
- synchronize balances efficiently;
- handle the transaction lifecycle consistently;
- recover safely from failures;
- provide a stable foundation for the Intent Engine and AI layer.

---

## What Chapter 6 commits us to

- **The Wallet Core is the OS** — every feature flows through it, and none may bypass its signing pipeline
  or talk to the UI except through APIs.
- **One responsibility per module**, so no feature requires rewriting the core.
- **The signing pipeline and the transaction state machine are universal** — every value-moving operation,
  on every chain, takes the same audited path.
- **Instant via cache, honest via refresh** — cached data opens the app; a network failure is never shown
  as truth, and offline-only limits are marked, not hidden.
- **Recoverable at every stage** — failures explain themselves, preserve the draft, and never force a restart.

The buildable engineering detail — and the honest shipped-vs-roadmap split (the lifecycle, keystore,
signing engine, transaction builder, and four-state balance engine are shipped; MPC/passkeys/hardware
wallets, NFT balances, background-sync depth, and a push indexer are roadmap) — is the
[Wallet Core Reference](../blockchain/wallet-core-reference.md) (Volume V).

---

### 🔜 Chapter 7 Preview — Universal Intent Engine

The heart of the product and its biggest differentiator: how a simple sentence becomes a secure, executable
blockchain workflow while blockchain complexity stays hidden. It will design **natural-language
understanding**, the **intent parser**, the **AI planner**, the **constraint engine**, the **clarification
engine**, **route-request generation**, **multi-step intent execution**, **confidence scoring**, **personal
preference integration**, **learning from previous actions**, and **explainable execution plans**.
