# Intent Wallet V3 — The Founder Bible

> **The company's Constitution.** Not a prompt, not notes — the single, governing specification for
> building Intent Wallet V3 to an Apple / Stripe / OpenAI standard. It is a **Living Specification of 30
> chapters** (organized into eight thematic Volumes), built **chapter by chapter**, each production-quality
> and refined by the chapters after it until the whole coheres. Implementation begins only when it is complete.
>
> **The one instruction that governs all development:** *"Follow the Founder Bible. Never violate it."*
>
> This file is the **spine** — the table of contents, the governance, and the status tracker. The
> always-loaded rules live in [`CLAUDE.md`](CLAUDE.md); the full detail lives in the Volumes below and
> under [`/docs`](docs). When code and the Bible disagree, that is a defect in one of them — reconcile it
> deliberately. Never drift.

**Edition:** V3.0 · **Codename:** Project Aether · **Tagline:** *The AI Operating System for Digital Assets*
· **Target:** ~800–1200 pages · **Method:** chapter-by-chapter, each production-grade. *(Page counts are a
proxy for depth, never a target to pad. Every chapter earns its length or is cut.)*

The Bible has **two coordinated views** of the same body of work:
- **The numbered enterprise-spec chapters** — the founder's chapter sequence, canonical, in
  [`docs/bible/`](docs/bible) (Chapter 1 → N). This is the read-front-to-back spine.
- **The eight thematic Volumes** — the reference organization the chapters roll up into (below), with
  deep material under [`/docs`](docs).

### This is a Living Specification

The Bible is written **in a loop, not a line.** Each chapter refines the ones before it: if a better idea
surfaces in Chapter 12, Chapters 3 and 5 are updated so the whole stays **internally consistent.** No
chapter is frozen until all 30 cohere. **Implementation begins only after the Bible is complete** — the
same discipline Apple, Stripe, and Linear use: specify first, build once, build right.

**Plan:** 30 chapters, each a 40–80-page-equivalent specification, built roughly one per day, then merged
into the single Intent Wallet V3 Founder Bible. Each chapter has a **canonical charter** (`docs/bible/`)
and, where built, a **deep reference** in its Volume folder.

### The 30-Chapter Roadmap (docs/bible/)

**Foundation**

| Ch | Title | Deep reference | Status |
|---|---|---|---|
| 1 | Founder Vision | Vol I — [`docs/vision/`](docs/vision) (~27.8k) | ✅ |
| 2 | Product Philosophy & First Principles | Vol II — [Operating Manual](docs/product/product-operating-manual.md) (~30k) | ✅ |
| 3 | Design System Bible | Vol III — [Design System Reference](docs/design/design-system-reference.md) (~34.9k) | ✅ |
| 4 | Conversation-First UX | Vol IV — [Conversation-First UX Reference](docs/ai/conversation-ux-reference.md) (~33k) | ✅ |

**Core Product**

| Ch | Title | Rolls up to | Status |
|---|---|---|---|
| 5 | Universal Identity & Account System (3-address · usernames · aliases · account abstraction · device trust · recovery · multi-device · enterprise · identity graph) | Vol V | ✅ canonical |
| 6 | Wallet Core Architecture (the production engine OS: 13 modules · lifecycle · signing pipeline · tx state machine · balance engine · cache/sync · offline & error recovery · perf) — [reference](docs/blockchain/wallet-core-reference.md) ✅ | Vol V/VI | ✅ canonical |
| 7 | Universal Intent Engine (the pipeline: detection · context · classification · constraints · planning · risk · simulation · explanation · approval · execution · learning; goal engine · intent memory · provider abstraction) | Vol IV/V | ✅ canonical |
| 8 | Universal Execution Engine (provider registry · health engine · route optimizer · execution graph · queue · signature coordinator · broadcast/confirmation/monitoring · retry/partial/rollback · settlement · analytics) | Vol V | ✅ canonical |
| 9 | AI Financial Brain (memory layers · financial profile · knowledge graph · daily/weekly/monthly reviews · recommendation/goal/automation/risk/spending intelligence · portfolio coach · learning · privacy · explainability) | Vol IV | ✅ canonical |
| 10 | Security & Trust Engine (zero-trust · 8 layers · simulation · approval/contract/token/NFT/website intelligence · wallet reputation · behavior engine · emergency mode · risk score · security dashboard/assistant/notifications) — **Security veto** | Vol VII | ✅ canonical |
| 11 | Universal Asset Intelligence Engine (asset discovery · token classification · real-time valuation · NFT intelligence · yield/DeFi tracking · cross-chain aggregation · analytics · snapshots · AI insights · tax categorization) — [reference](docs/blockchain/asset-intelligence-reference.md) ✅, charter pending | Vol IV/V | 🟡 |
| — | *Living Spec — the founder re-sequences live; Design Language 2.0 + AI OS re-slot later in the run.* | | |
| 12 | Portfolio Intelligence Engine (net worth · performance · allocation · diversification · health score · P&L · cash flow · fees · yield · goals · coach · benchmark · risk · timeline · monthly report · alerts · simulator) | Vol IV | ✅ canonical |
| 13 | Universal Liquidity Engine (liquidity graph · provider registry/health · smart route discovery · order splitting · cross-chain · RFQ · MEV-aware routing · slippage · gas · forecasting · best-execution · fallback · monitoring) | Vol V | ✅ canonical |
| — | *Re-sequenced live: AI OS + Design Language 2.0 re-slot later in the run.* | | |

**Platform**

| Ch | Title | Rolls up to | Status |
|---|---|---|---|
| 14 | Automation Engine (DCA · auto invest/swap/bridge/stake/unstake · rebalancing · scheduled/bill/salary · yield · conditional intents · triggers · policies · approval levels · dashboard · history · failure handling · emergency controls) | Vol V | ✅ canonical |
| 15 | AI Operating System (Multi-Agent: Orchestrator + Planner/Security/Portfolio/Market/Execution/Memory/Tax/Notification/Voice/Research agents · tool engine · model router · explainability · safety rules · offline AI · enterprise) | Vol IV | ✅ canonical |
| 16 | Universal Payment Network (P2P/business/merchant/salary/subscription/invoice · universal identity/QR/links · smart routing · POS · recurring · status/receipts · cross-border · AI assistant · refunds · compliance · analytics) | Vol II/V | ✅ canonical |
| 17 | DeFi Operating System (universal DeFi dashboard · lending/borrowing · staking · yield optimization · LP management · perps/derivatives · AI DeFi advisor · position health · liquidation alerts · one-click strategies · unified analytics) — [reference](docs/blockchain/defi-operating-system-reference.md) ✅ built, charter pending | Vol V | 🟡 |
| 17+ | *Backlog (founder-sequenced, living): Plugin Marketplace · SDK & API Platform · Enterprise Platform · White-label · Analytics & Observability · Scalability & Infrastructure* | Vol V/VI/VIII | ⬜ |

**Business**

| Ch | Title | Rolls up to | Status |
|---|---|---|---|
| 21 | Marketplace Economy | Vol VIII | ⬜ |
| 22 | Pricing Strategy | Vol VIII | ⬜ |
| 23 | Growth Engine | Vol VIII | ⬜ |
| 24 | Referral & Community | Vol VIII | ⬜ |
| 25 | Brand System | Vol VIII | ⬜ |

**Company**

| Ch | Title | Rolls up to | Status |
|---|---|---|---|
| 26 | Engineering Standards | Vol VI | ⬜ |
| 27 | Security Standards | Vol VII | ⬜ |
| 28 | QA & Testing | Vol VI | ⬜ |
| 29 | Launch Readiness | Vol VIII | ⬜ |
| 30 | Vision 2035 | Vol I | ⬜ |

*The eight thematic **Volumes** (below) are the deep-reference organization these 30 chapters roll up into.*

---

## How this Bible is built (and why chapter-by-chapter)

A specification this deep cannot — and should not — be written in one pass. It is built like a real
technical book:

1. **Spine first** (this file + [`CLAUDE.md`](CLAUDE.md)) — the architecture of the whole, so every
   chapter knows its place before it is written.
2. **Volume by volume, chapter by chapter** — each chapter is researched, drafted, critiqued, and
   finalised to production quality, then committed. It becomes load-bearing for the chapters after it.
3. **Grounded, never fabricated** — every chapter is true to the real V2 codebase and the Doctrine.
   Nothing describes a feature that doesn't exist as if it does. Roadmap is labelled roadmap.
4. **Living** — chapters are versioned; material changes are ADRs. The Bible is the contract, not decoration.

Each chapter passes the **Design Review Gate** (below) before it is considered done — the same bar the
code must clear.

---

## The eight Volumes

Status legend: ✅ done · 🟡 in progress · ⬜ planned · 📄 seed drafted (a root doc exists; expand to full volume).

### 📖 Volume I — Founder Vision  ·  ~70 pp  ·  ✅ written
*Why this company exists, and the arc it is on.*
Mission · Vision · Philosophy · First Principles · Product Strategy · The Moat ·
Competitive Analysis (Phantom / Rabby / MetaMask / Coinbase Wallet) · Success Metrics & the North Star.
→ [Chapter 1 charter](docs/bible/chapter-01-founder-vision.md) · 7 deep chapters in [`docs/vision/`](docs/vision) (~27,800 words) · seed: [`PRODUCT.md`](PRODUCT.md)

### 📖 Volume II — Product Bible  ·  ~150 pp  ·  🟡 in progress
*Every feature, screen, flow, UX decision, and edge case.*
The intent model · every screen + state (empty/loading/error/partial/success) · every user flow ·
every UX decision with its rationale · the full edge-case catalog · microcopy & voice.
→ [Product Operating Manual](docs/product/product-operating-manual.md) ✅ (~30k words: 50 P · 100 U · 30 D · 30 AI · framework · 28 X · UX blueprint) + [Universal Payment Network](docs/product/payment-network-reference.md) ✅ (~21.7k words: username payments · QR/links · merchant/POS · salary/subscriptions · invoices · cross-border · offline · analytics · the safety boundary) · seeds: [`PRODUCT.md`](PRODUCT.md), [`UX_GUIDELINES.md`](UX_GUIDELINES.md) · `docs/product/`, `docs/ux/`

### 📖 Volume III — Apple Design Bible  ·  ~250 pp  ·  🟡 in progress
*Apple-level craft, made into a system.*
Design tokens (light + dark) · spacing (8px) · typography · motion & animation · icons · accessibility ·
dark mode · the component library with every state · haptics · the house style & DO/DON'T law.
→ [Design System Reference](docs/design/design-system-reference.md) ✅ (~34.9k words: 9 sections, real tokens + component state matrices + AI chat UI) · seed: [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) · `docs/design/`

### 📖 Volume IV — AI Bible  ·  ~200 pp  ·  🟡 in progress
*The Financial Brain — and its cage.*
Financial Brain · Memory · Planning · Reasoning · Agents · Knowledge · Context · Voice · Automation ·
Learning — every one bounded by "AI proposes, deterministic code verifies, the device signature disposes."
→ [Conversation-First UX](docs/ai/conversation-ux-reference.md) ✅ + [Intent Engine](docs/ai/intent-engine-reference.md) ✅ + [Financial Brain](docs/ai/financial-brain-reference.md) ✅ + [Portfolio Intelligence](docs/ai/portfolio-intelligence-reference.md) ✅ + [AI Operating System](docs/ai/ai-operating-system-reference.md) ✅ (~131k words across 5 references) · seed: [`AI.md`](AI.md) · `docs/ai/`

### 📖 Volume V — Blockchain Bible  ·  ~300 pp  ·  🟡 in progress
*The on-chain machine, correct to the last base unit.*
Wallet · Identity · Intent · Execution · Settlement · Security · Providers · Plugins · SDK · Enterprise —
keys on-device, money as integer bigint, guards fail closed, settlement-safe by construction.
→ [Universal Identity](docs/blockchain/universal-identity-reference.md) ✅ + [Wallet Core](docs/blockchain/wallet-core-reference.md) ✅ + [Execution Engine](docs/blockchain/execution-engine-reference.md) ✅ + [Asset Intelligence](docs/blockchain/asset-intelligence-reference.md) ✅ + [Liquidity Engine](docs/blockchain/liquidity-engine-reference.md) ✅ + [Automation Engine](docs/blockchain/automation-engine-reference.md) ✅ + [DeFi Operating System](docs/blockchain/defi-operating-system-reference.md) ✅ (~180k words across 7 references) · seeds: [`ARCHITECTURE.md`](ARCHITECTURE.md), [`API.md`](API.md) · `docs/blockchain/`, `docs/sdk/`

### 📖 Volume VI — Engineering Bible  ·  target ~250 pp  ·  ⬜
*How the code is built so it stays trustworthy at scale.*
Architecture · DDD · Hexagonal · CQRS · Saga · Testing · CI/CD · Infrastructure · Observability · Performance.
→ files: [`ARCHITECTURE.md`](ARCHITECTURE.md), [`TESTING.md`](TESTING.md), [`DATABASE.md`](DATABASE.md) (seeds), `docs/architecture/`, `docs/backend/`, `docs/frontend/`, `docs/mobile/`, `docs/testing/`, `docs/deployment/`

### 📖 Volume VII — Security Bible  ·  ~200 pp  ·  🟡 in progress
*Assume real funds and a real adversary.*
Threat Modeling · OWASP · MPC · Passkeys · Simulation · Fraud · Behaviour AI · Risk Engine · Recovery · Audits.
This volume carries the **Principal Security Engineer's veto**.
→ [Security & Trust Engine Reference](docs/security/security-trust-reference.md) ✅ (~24k words: every control tagged shipped/partial/roadmap) · seed: [`SECURITY.md`](SECURITY.md) · `docs/security/`

### 📖 Volume VIII — Company Bible  ·  target ~150 pp  ·  ⬜
*Turning a product into a company.*
Hiring · Brand · Marketing · Pricing · Growth · Fundraising · Launch · Documentation · Community.
→ files: [`ROADMAP.md`](ROADMAP.md) (seed), the [90-Day Plan](Intent-Wallet-90-Day-Plan.pdf), `docs/launch/`

**Companion:** the [Living Master Specification](INTENT_WALLET_V3_MASTER_SPEC.md) — the Council, the
Doctrine, the Loop, and the **100 module cards** (10 phases × 10) — is the operational index every
volume's chapters build against.

---

## The Development Workflow (every feature, every chapter)

Understand → Research → Challenge → **Product Review** → **UX Review** → **Architecture Review** →
**Security Review** → **Performance Review** → Implementation → Tests → Documentation → Refactor →
**Self-Audit**.

Each arrow is a gate; you may not cross it until it is green. The four Reviews before implementation are
where the Council earns its keep — design the *feeling* and the threat model **before** the code, not after.

---

## ⭐ The Design Review Gate — five checks before anything merges

No code (and no chapter) is "done" until **all five** pass. This is what turns a functional wallet into an
industry-grade one.

| ✅ | Review | Passes when… |
|---|---|---|
| 1 | **Product Review** | it serves a real user outcome traceable to Volume I; nothing is built that the anti-scope list forbids. |
| 2 | **UX Review** | every state is designed + honest; the flow is drivable by a first-timer; microcopy is on-voice; comprehension precedes any signature. |
| 3 | **Security Review** | threat-modelled; keys never leave device; guards fail closed; secrets never logged/committed; **Principal Security Engineer signs**. |
| 4 | **Performance Review** | meets its budget (interaction < 100ms; cold paths measured); no unbounded work; no main-thread jank; bundle cost accounted for. |
| 5 | **Accessibility Review** | WCAG **AA**: contrast, keyboard reach + visible focus, correct roles/labels, live regions, reduced-motion-safe. |

A red check is a blocker, not a "later." The gate is enforced in review and, where automatable, in CI.

---

## Build cadence & status

**Cadence:** ~one chapter per day, each a 40–80-page-equivalent spec, committed at every checkpoint. Because
this is a **Living Specification**, later chapters refine earlier ones until all 30 cohere. After they merge
into the single Founder Bible — **and only then** — implementation begins.

Current state:

- ✅ **Spine** — this file + [`CLAUDE.md`](CLAUDE.md) constitution + the 30-chapter roadmap above.
- ✅ **Chapters 1–4** — canonical charters + deep references (Volumes I–IV, ~126k words of reference).
- 🟡 **Chapter 5** — Universal Identity & Account System, building now.
- ✅ **Master Spec** — [100 module cards + Council + Doctrine + Loop](INTENT_WALLET_V3_MASTER_SPEC.md).
- 📄 **Root seed docs** — `PRODUCT · ARCHITECTURE · DESIGN_SYSTEM · UX_GUIDELINES · SECURITY · AI · API · DATABASE · TESTING · ROADMAP`.
- ⬜ **Chapters 6–30** — sequenced through Core Product → Platform → Business → Company.

### V4 ideas (future — evaluate only if they genuinely improve the product)

Deferred past V3, revisited only if they add real value without adding complexity: a **Universal Intent
Network** (intents beyond the wallet) · **cross-wallet AI memory** (with user consent) · a **Personal
Finance Digital Twin** (long-term goal simulations) · a **Unified Settlement Layer** abstracting multiple
execution providers · an **Intent SDK** letting third-party apps execute natural-language intents.
