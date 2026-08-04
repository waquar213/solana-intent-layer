# GASOK Application — Intent Wallet (GIWA Intent Layer)

> **Form:** https://ds.fdback.me/r/bLHPv694o6Au3 · **Deadline:** 31 July 2026 · **Primary track:** AI/Web3 (also submit under Mass Adoption — multiple ideas allowed).
> **How to use this doc:** each numbered section maps to one form field — copy the answer straight into the matching field. Written in English (GASOK is region-agnostic).

---

## 1. Applicant / Founder
**Waquar Moazzam** — solo founder, Web3 Tech Lead ([WAQUAR.XYZ](https://waquar.xyz)). I built the entire stack myself end-to-end: the Solidity contracts (Foundry), the on-device wallet crypto core (BIP-39/32/84, secp256k1/ed25519), the Anchor Solana program, the Fastify backend, and the React frontend. One builder, full stack, shipping working code — not a slide deck.

## 2. Project name
**Intent Wallet — the GIWA Intent Layer.**

## 3. Track
**AI/Web3** (primary). Also directly relevant: **Mass Adoption**, **GIWA-Native**, **DeFi/RWA**.

## 4. One-line pitch
An AI-native, non-custodial wallet on GIWA where you say what you want in plain English — and a security layer **refuses to sign anything it can't safely deliver**.

## 5. The problem
Wallets do exactly what you tell them — even when it costs you everything. Address-poisoning alone: **270M attempts, 17M victims, $83.8M stolen** (Tsuchiya et al., USENIX Security '25). A lookalike address, one mistyped hex character, a route that strands your funds — today's wallets *confirm* instead of *refusing*. The failure mode is silent, one-click, and irreversible. Crypto asks ordinary people to be their own flawless security reviewer, and then punishes the smallest mistake permanently.

## 6. The solution (what it does)
Plain English → a **typed intent** via a deterministic parser (free, instant, private — no model round-trip for common asks; the LLM is only a fallback) → the planner **verifies the intent against the real world** (balances, routes, chain, decimals) → **Sentinel** applies five hard pre-signature guards → it signs **on your device**, or it **refuses and tells you exactly why**.
One idea, made literal: **AI proposes, deterministic code verifies, the device signature disposes.** The AI never holds a key and never decides safety — deterministic code does.

## 7. Why GIWA (chain alignment + reasoning)
GIWA is the **home chain**, and it is already **deployed and source-verified on GIWA Sepolia** (chainId 91342) — not a roadmap:
- **IntentExecutor** `0x4b69e04441809e41313665cCfe99F4154d40B1b8` — atomic, all-or-nothing intent execution that binds the plan hash to the on-chain result.
- **SimpleAMM** `0x213ca9C221612011Ad2bb545A6736DA300aFbF83` + **gUSDC** `0x3a82A52C1C4e9E3d12DA71BF7f8E6B421Fb73277` — a native constant-product DEX (x·y=k, 0.3% fee), real seeded liquidity.
- **SimpleStaking** `0x52fe375267253fDaE08F46162545F3708d25eE5C`.
- **Canonical OP-Stack bridge** — non-custodial, ~60s, proven on-chain (L1 deposit → L2 arrival in 62s).

GIWA is an Upbit/Dunamu OP-Stack L2 aimed at mainstream users. Pairing that distribution with a **plain-English, safety-first** wallet is the natural on-ramp: the people Upbit brings on-chain are exactly the people a "refuse, don't guess" wallet protects.

## 8. Current status / traction — LIVE, not a concept
- **Live demo (judges can try it now):** https://giwa-intent-wallet-web.vercel.app — frontend on Vercel, backend on Railway.
- **4 source-verified contracts** on GIWA Blockscout (`sepolia-explorer.giwa.io`, chainId 91342).
- **Real on-chain execution with public tx hashes:** intent execution via the contract, AMM swaps on our own GIWA DEX, a canonical bridge deposit + arrival, and even a second in-house AMM (**solAMM**) with a live swap on Solana devnet.
- **Non-custodial by construction:** keys are generated and sealed (scrypt + AES-256-GCM) **on-device** and never touch a server — the backend only ever sees public addresses or a rawTx the user chose to broadcast.
- **600+ automated tests**, float-free integer money paths, a 6-layer strict-DAG monorepo.
- **Multilingual intents:** English / Hinglish / Korean all resolve to the *same* typed intent.
- **Continuously hardened:** the codebase is under ongoing adversarial security review (multi-agent bug-hunting), with 150+ defects found-and-fixed and deployed — the safety claims are tested, not asserted.

## 9. Originality
The **security layer *is* the product** — the doctrine is **"refuse, don't guess."** Five guards, one idea, all *before* signature: (1) address-poisoning detection on a first-ever send, (2) EIP-55 checksum-typo block, (3) cumulative-drain protection across many small sends, (4) a recipient that can never be silently dropped, (5) undeliverable-route refusal. No mainstream wallet refuses *before signing* like this — they confirm and let you lose the funds. And because parsing is **deterministic-first**, the common actions are free, instant, and private (no LLM call, no data leaving the device for a routine send).

## 10. Technical feasibility + capability
Solo — but **already shipped end-to-end**: source-verified contracts live on GIWA, a deployed working app anyone can use, 600+ tests, a 6-layer strict-DAG monorepo, and a **pluggable route seam** so production mainnet aggregators drop in **without touching the safety layer**. The hard parts (on-device HD crypto across BTC/EVM/SOL, atomic on-chain intent execution, a real AMM, a non-custodial OP-Stack bridge) are done and demonstrable. Capability is proven by **working, verifiable code and on-chain transactions** — not promises.

## 11. Market demand + growth + KPIs
Address poisoning is a proven **$83.8M+** pain, and plain-English intents unlock the users who aren't crypto-native — the core of **mass adoption** and exactly Upbit/GIWA's audience. **MVP-Build KPIs:** 100+ real testnet users; intents executed on GIWA; swap/stake volume through the on-chain AMM; then audited third-party aggregator integration for real cross-chain, and a security audit on the path to mainnet.

## 12. Wallet integration potential
It **is** a GIWA-native wallet — the deepest possible integration — and a natural onboarding surface for the Upbit/GIWA ecosystem. Every guard, route, and contract call already speaks GIWA first; adding GIWA-native assets, dApps, and Upbit-driven users is incremental, not architectural.

---

## Links
- **Live demo:** https://giwa-intent-wallet-web.vercel.app
- **On-chain proof:** https://sepolia-explorer.giwa.io (the 4 contracts above)
- **Pitch deck:** shareable on request
- **Code:** private repo — access granted on request

## How the grant is used (MVP Build → Growth)
Mainnet readiness: audited cross-chain aggregator integration (Solana ↔ EVM), Redis-backed persistent Sentinel guards, a relayer daemon for fast non-custodial withdrawals, a third-party **security audit**, and real-user growth toward the KPI milestones above.
