# GASOK Application — Intent Wallet (MVP Build Phase)

> Form: https://ds.fdback.me/r/bLHPv694o6Au3 · Deadline: 31 July 2026 · Track: **AI/Web3** (also submit under **Mass Adoption** — multiple ideas allowed). Written in English; GASOK is region-agnostic. Copy each answer into the matching form field.

---

**Applicant / Founder**
Waquar Moazzam — solo founder, Web3 Tech Lead. Building end-to-end (contracts, wallet core, backend, frontend) solo.

**Project name**
Intent Wallet — the GIWA Intent Layer.

**Track**
AI/Web3 (primary). Also relevant: Mass Adoption, GIWA-Native, DeFi/RWA.

**One-line pitch**
An AI-native, non-custodial wallet on GIWA where you say what you want in plain English — and a security layer refuses to sign anything it can't safely deliver.

**The problem**
Wallets do exactly what you say — even when it costs you everything. Address-poisoning alone: **270M attempts, 17M victims, $83.8M stolen** (Tsuchiya et al., USENIX Security '25). A lookalike address, one mistyped hex character, a route that strands funds — wallets confirm instead of refusing. The failure mode is silent and irreversible.

**The solution (what it does)**
Plain English → a **typed intent** via a deterministic parser (free, instant, no model round-trip for common asks — the LLM is only a fallback) → the planner **verifies it against the real world** → **Sentinel** applies five pre-signature guards → it signs **on your device**, or refuses and tells you why. One idea: *AI proposes, deterministic code verifies, the device signature disposes.*

**Why GIWA (chain alignment + reasoning)**
GIWA is the home chain, and it's already **deployed and verified on GIWA Sepolia** — not a plan:
- **IntentExecutor** `0x4b69e04441809e41313665cCfe99F4154d40B1b8` — atomic, all-or-nothing intent execution binding the plan hash to the on-chain result.
- **SimpleAMM** `0x213ca9C221612011Ad2bb545A6736DA300aFbF83` + **gUSDC** `0x3a82A52C1C4e9E3d12DA71BF7f8E6B421Fb73277` — a native constant-product DEX.
- **SimpleStaking** `0x52fe375267253fDaE08F46162545F3708d25eE5C`.
- **Canonical OP-Stack bridge**, non-custodial, ~60s — proven on-chain (L1 `0xb1c8d047…` → L2 `0x9565a720…`, 62s).
GIWA (Upbit/Dunamu L2) + a plain-English, safety-first wallet is the natural on-ramp for Upbit's mainstream users.

**Current status / traction — LIVE, not a concept**
- **Live demo:** https://giwa-intent-wallet-web.vercel.app (frontend on Vercel, backend on Railway — judges can try it now)
- **4 source-verified contracts** on GIWA Blockscout (sepolia-explorer.giwa.io, chainId 91342)
- **Real on-chain execution**: intent execution, AMM swaps, canonical bridge deposit + arrival — all with public tx hashes
- **600+ tests**, **non-custodial** (keys generated + sealed on-device, never touch a server), float-free integer money paths
- Multilingual intents (English / Hinglish / Korean → the same typed intent)

**Originality**
The security layer *is* the product — **"refuse, don't guess."** Five guards, one idea: (1) address-poisoning on a first-ever send, (2) EIP-55 checksum typo, (3) cumulative-drain across multiple small sends, (4) recipient never silently dropped, (5) undeliverable-route refusal. No mainstream wallet refuses *before signature* like this. Deterministic-first parsing means common actions are free, instant, and private (no LLM call).

**Technical feasibility + capability**
Solo — but already shipped end-to-end: verified contracts live on GIWA, a deployed working app, 600+ tests, a 6-layer strict-DAG monorepo, and a pluggable route seam (mainnet aggregators drop in **without changing the safety layer**). Capability is demonstrated by working, verifiable code — not promises.

**Market demand + growth + KPIs**
Address poisoning is a proven **$83.8M+** pain; plain-English intents unlock users who aren't crypto-native (mass adoption). MVP-Build KPIs: **100+ real testnet users**, intents executed on GIWA, swap/stake volume through the on-chain AMM, then audited-aggregator integration for real cross-chain and a security audit toward mainnet.

**Wallet integration potential**
It *is* a GIWA-native wallet — the deepest possible integration — and a natural onboarding surface for the Upbit/GIWA ecosystem.

**Links**
- Live demo: https://giwa-intent-wallet-web.vercel.app
- On-chain proof: https://sepolia-explorer.giwa.io (contracts above)
- Pitch deck: (share on request)
- Code: private repo — access on request.

**How the grant is used (MVP Build → Growth)**
Mainnet readiness: audited cross-chain aggregator integration (Solana↔EVM), Redis-backed persistent Sentinel guards, a relayer daemon for fast withdrawals, a security audit, and real-user growth toward the KPI milestones.
