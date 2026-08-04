# Universal Intent Wallet — Complete Requirements & Build Plan

> **Codename:** INTENT LAYER
> **Document status:** Living document — source of truth for WHAT we build.
> **Progress tracking:** see [memory.md](memory.md) — source of truth for what is DONE.
> **Last updated:** 2026-07-05

---

## 0. Charter (The Master Prompt — Operating Rules)

Claude operates as the **founding CTO** of this startup: Principal Web3 Architect, Blockchain Protocol Engineer, Security Engineer, Backend Architect, Mobile Architect, DevOps Engineer, Product Designer, and AI Systems Architect.

**Non-negotiable rules for all future work:**

1. **Never generate demo code. Never generate toy examples.** Every artifact is production grade.
2. When multiple solutions exist, **explain tradeoffs and choose the best one** (decision recorded in memory.md → Decisions Log).
3. Priority order: **Security → Scalability → Performance → Clean Architecture → Maintainability → Low latency → Cost optimization → User Experience.**
4. All code ships with **tests, documentation, security considerations, and clear implementation steps**.
5. Consistency is maintained across sessions via `memory.md` (state) and this file (requirements).
6. Target competitors: MetaMask, Phantom, Rabby, Coinbase Wallet, and future AI-native wallets.

---

## 1. Product Vision

**The world's first AI-Native Universal Intent Wallet.**

Users never manually perform: Swap · Bridge · Chain switching · Gas management.
Users simply describe what they want:

- "Convert my BTC to ETH."
- "Send $100 USDT to Rahul."
- "Stake my idle assets safely."
- "Move everything to the lowest-risk portfolio."

The wallet plans and executes the complete workflow autonomously (with user confirmation at the trust boundary).

### 1.1 Core Philosophy

- Users should never think about **blockchains**. Users think about **assets**.
- Chains become invisible. The wallet becomes an **AI operating system for money**.
- Self-custody by default: keys never leave the user's device unencrypted.
- The AI proposes; **the user's signature disposes**. Every state-changing action passes an explicit, human-readable confirmation gate.

### 1.2 Universal Identity

The wallet exposes exactly **three receive addresses** initially:

| Identity      | Curve     | Derivation                   | Address format                                                 |
| ------------- | --------- | ---------------------------- | -------------------------------------------------------------- |
| Bitcoin       | secp256k1 | BIP-84 `m/84'/0'/0'/0/i`     | Native SegWit bech32 (`bc1q…`)                                 |
| Universal EVM | secp256k1 | BIP-44 `m/44'/60'/0'/0/i`    | EIP-55 checksummed `0x…` — **one address for every EVM chain** |
| Solana        | ed25519   | SLIP-0010 `m/44'/501'/i'/0'` | base58 pubkey                                                  |

The portfolio merges assets from every supported chain into one unified interface.

### 1.3 Intent Layer (canonical pipeline)

```
Natural language ("Convert BTC to ETH")
  → Parse      : NL → structured Intent (typed schema, never free-form execution)
  → Resolve    : detect asset locations, balances, recipient identities
  → Plan       : find execution paths (bridge/swap graph search)
  → Optimize   : choose best route (cost, speed, risk, slippage)
  → Quote      : estimate fees end-to-end, present human-readable plan
  → Confirm    : explicit user approval (trust boundary — signature)
  → Execute    : step machine with retries, monitoring, recovery
  → Verify     : confirm on-chain finality of every step
  → Update     : portfolio refresh + notification + activity record
```

---

## 2. Users & Market

### 2.1 User Personas

| Persona                       | Profile                                         | Primary jobs-to-be-done                                   |
| ----------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| **Naya (Newcomer)**           | First crypto wallet, mobile-only, non-technical | Buy/hold/send without learning chains, not get scammed    |
| **Riya (Retail power user)**  | Uses MetaMask + 3 chains, DeFi dabbler          | Stop juggling bridges/gas tokens; one-line swaps          |
| **Dev (Builder)**             | dApp developer                                  | Reliable wallet SDK, intent APIs, testnets                |
| **Priya (Portfolio manager)** | High net worth, risk-conscious                  | Policy-based automation ("keep 60% stables"), audit trail |
| **Enterprise (Fintech)**      | Neobank embedding crypto                        | White-label intent APIs, compliance hooks                 |

### 2.2 Competitive Analysis (summary)

| Competitor         | Strength                        | Our wedge                                                         |
| ------------------ | ------------------------------- | ----------------------------------------------------------------- |
| MetaMask           | Distribution, dApp ecosystem    | Chain-invisible UX; no manual bridging/gas                        |
| Phantom            | Best-in-class UX (Solana-first) | True multi-ecosystem (BTC+EVM+SOL) with intents                   |
| Rabby              | Pre-tx simulation, multi-chain  | AI planning layer on top of simulation                            |
| Coinbase Wallet    | Fiat ramps, brand trust         | Self-custody + AI automation, open SDK                            |
| AI-native entrants | Novel UX                        | Security-first architecture, production rigor, universal identity |

### 2.3 Business Model & Revenue Streams

1. **Execution spread**: 0.25–0.85% convenience fee on intent-routed swaps/bridges (transparent, shown in quote).
2. **Gas abstraction margin**: small markup on sponsored gas (paymaster).
3. **Premium tier**: advanced automations (recurring intents, policies, alerts), portfolio analytics.
4. **Enterprise/SDK**: usage-priced Intent API + white-label wallet infrastructure.
5. **Marketplace** (later): third-party intent "skills" (staking providers, yield strategies) with revenue share.
6. **Token** (deferred): only if/when decentralizing the solver network — see §12. No token at launch.

---

## 3. Product Requirements

### 3.1 Feature Matrix (MoSCoW)

| Feature                                                  | MVP (v1)        | v2      | Later |
| -------------------------------------------------------- | --------------- | ------- | ----- |
| HD wallet create/import (BIP-39)                         | ✅ Must         |         |       |
| Universal identity (BTC/EVM/SOL addresses)               | ✅ Must         |         |       |
| Encrypted vault (device-side)                            | ✅ Must         |         |       |
| Unified portfolio (balances + prices)                    | ✅ Must         |         |       |
| Send / receive (all 3 ecosystems)                        | ✅ Must         |         |       |
| NL intents: send, swap, bridge                           | ✅ Must         |         |       |
| Route optimizer (swap+bridge aggregation)                | ✅ Must         |         |       |
| Transaction simulation + human-readable preview          | ✅ Must         |         |       |
| Risk engine (scam/token verification, address screening) | ✅ Must         |         |       |
| Activity history + notifications                         | ✅ Must         |         |       |
| Gas abstraction (ERC-4337 smart accounts, paymaster)     | ⭕ Should       | ✅      |       |
| Staking intents                                          | ⭕ Should       | ✅      |       |
| NFT portfolio + transfers                                |                 | ✅      |       |
| Contacts / named recipients ("Rahul")                    | ✅ Must (local) | ENS/SNS |       |
| Recurring intents & policies ("keep 60% stables")        |                 | ✅      |       |
| MPC / social recovery                                    |                 | ✅      |       |
| Hardware wallet support                                  |                 | ✅      |       |
| Fiat on/off ramps                                        |                 | ✅      |       |
| Enterprise Intent API + SDK                              |                 | ⭕      | ✅    |
| Intent skill marketplace                                 |                 |         | ✅    |
| Decentralized solver network                             |                 |         | ✅    |

### 3.2 User Stories (core set)

1. As a new user, I can create a wallet in <60s and see 3 receive addresses, with a forced-but-friendly recovery-phrase backup flow.
2. As a user, I can type/say "send $100 USDT to Rahul" and get a plan showing exact amounts, fees, ETA, and risks before I approve.
3. As a user, I see one portfolio number and one asset list; expanding an asset shows per-chain detail only on demand.
4. As a user, if a multi-step intent fails midway, the wallet automatically recovers or parks funds safely and tells me exactly where my money is.
5. As a user, I am warned (or blocked) before interacting with a known scam token/address/contract.
6. As a user, I can export my seed phrase and leave at any time (no lock-in).
7. As a developer, I can call `POST /v1/intents` with a natural-language string and receive a structured, executable plan.

### 3.3 UX Flows (text wireframes)

**Onboarding:** Splash → Create/Import → (Create: generate → biometric/passcode → backup phrase quiz) → Universal addresses reveal → Portfolio (empty state with "Receive" CTA).

**Intent flow (primary surface = chat/command bar):**

```
┌────────────────────────────────────────────┐
│ Portfolio: $4,281.44            🔔  ⚙️      │
│ [BTC $2,100] [ETH $1,420] [USDT $761]      │
│────────────────────────────────────────────│
│ 💬 "Convert my BTC to ETH"                 │
│                                            │
│ PLAN (Best route via Bridge X + Swap Y)    │
│  1. BTC → wBTC   (Bridge X)   ~12 min      │
│  2. wBTC → ETH   (Swap Y)     ~15 sec      │
│  You send: 0.021 BTC ($2,100)              │
│  You get : ~0.612 ETH ($2,079)             │
│  Total cost: $21.30 (1.01%)  Risk: LOW ✅  │
│  [ Approve & Execute ]   [ Edit ]  [ ✕ ]   │
│────────────────────────────────────────────│
│ ⏳ Executing 1/2… (live step tracker)       │
└────────────────────────────────────────────┘
```

**Screens (mobile IA):** Home/Portfolio · Intent chat · Asset detail · Send/Receive · Activity · Explore (curated, later) · Settings (security, networks, contacts, advanced).

### 3.4 Information Architecture

```
App
├── Onboarding (create / import / restore)
├── Home ── Portfolio (unified) ── Asset detail (per-chain breakdown)
├── Intent surface (chat + suggestions + plan preview + execution tracker)
├── Activity (unified timeline, per-intent grouping, receipts)
├── Contacts (local names → addresses; ENS/SNS resolution later)
└── Settings
    ├── Security (backup, biometrics, auto-lock, approvals manager)
    ├── Networks (advanced users only — hidden by default)
    ├── Notifications, Currency, Language
    └── Legal / versions / diagnostics
```

### 3.5 Design System (foundations)

- **Tokens:** 8-pt spacing grid; type scale 12/14/16/20/24/32; radius 8/12/16; semantic colors (surface, primary, success, warning, danger, risk-low/med/high); light+dark.
- **Components:** Button, Input, CommandBar, AssetRow, PlanCard, StepTracker, RiskBadge, FeeBreakdown, AddressChip (with identicon + checksum highlight), ConfirmSheet, Toast, EmptyState, Skeleton.
- **Principles:** One primary action per screen; irreversible actions always behind a distinct confirm sheet; risk is always color+icon+text (never color alone — accessibility).

---

## 4. System Architecture

### 4.1 Top-level diagram

```
┌─────────────────────────── CLIENTS ───────────────────────────┐
│  Mobile app (React Native)   Web app / Extension (React)      │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  @intent-wallet/core  (keys, vault, signing — DEVICE ONLY)│ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬──────────────────────────────┘
                 HTTPS/WSS (signed requests, no keys ever)
┌────────────────────────────────┴──────────────────────────────┐
│                     API GATEWAY (authn, rate limit, WAF)      │
├───────────────┬───────────────┬───────────────┬───────────────┤
│ Intent Service│ Portfolio Svc │ Execution Svc │ Risk Service  │
│ (NL→plan, LLM)│ (balances,    │ (route exec,  │ (scam/token   │
│               │  prices, idx) │  step machine)│  verification)│
├───────────────┴───────┬───────┴───────┬───────┴───────────────┤
│   Message bus (NATS/Redis Streams)    │  Notification Service │
├───────────────────────┼───────────────┴───────────────────────┤
│ Postgres (system of record)  Redis (cache)  ClickHouse (analytics)
├───────────────────────────────────────────────────────────────┤
│ CHAIN ACCESS LAYER: RPC pools w/ failover (BTC, EVM×N, SOL),  │
│ indexers, mempool watchers, price feeds, simulation nodes     │
└───────────────────────────────────────────────────────────────┘
```

**Cardinal security rule:** private keys and seed phrases exist **only inside `@intent-wallet/core` on the user's device**, encrypted at rest. The backend plans and observes; it can never move funds.

### 4.2 Tech Stack (chosen; tradeoffs in Decisions Log)

| Layer         | Choice                                                                                                       | Why (vs alternatives)                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Language      | **TypeScript end-to-end**                                                                                    | One language across core/client/server; hiring; shared types. (Rust considered for solver later.) |
| Monorepo      | **pnpm workspaces + Turborepo(later)**                                                                       | Strict, fast, content-addressed; simpler than Nx.                                                 |
| Wallet crypto | **@noble/@scure suite** (audited, zero-dep)                                                                  | Industry standard (used by MetaMask/Rabby ecosystem); auditable; no native-module pain in RN.     |
| EVM           | **viem**                                                                                                     | Typed, modern, tree-shakeable; better than ethers v6 for our use.                                 |
| Solana        | **@solana/kit** (web3.js v2)                                                                                 | Modern, modular.                                                                                  |
| Bitcoin       | **@scure/btc-signer**                                                                                        | Same audited family; PSBT support.                                                                |
| Backend       | **Node.js (NestJS-style modular Fastify)**                                                                   | Perf + structure; team velocity.                                                                  |
| AI            | **Claude API (claude-sonnet-5 default, claude-haiku-4-5 for cheap paths)** with strict tool-use JSON schemas | Best instruction-following for structured intents; enforced output schema.                        |
| DB            | **PostgreSQL 16** (+ Drizzle ORM)                                                                            | ACID system of record; migrations as code.                                                        |
| Cache         | **Redis** (cache + rate limits + queues via Streams initially)                                               | One infra piece early; NATS when scale demands.                                                   |
| Analytics     | **ClickHouse** (later phase)                                                                                 | Cheap event analytics at scale.                                                                   |
| Mobile        | **React Native + Expo (dev-client)**                                                                         | Shared TS core; native modules for keystore/biometrics.                                           |
| Web           | **React + Vite**                                                                                             | Extension + PWA share components.                                                                 |
| Infra         | **Docker → Kubernetes (EKS), Terraform**                                                                     | Standard, portable, multi-region-capable.                                                         |
| Observability | **OpenTelemetry + Prometheus + Grafana + Loki + Sentry**                                                     | Vendor-neutral.                                                                                   |

### 4.3 Repository / Folder Structure

```
INTENT LAYER/
├── requirements.md            ← this file (WHAT)
├── memory.md                  ← progress + decisions (STATE)
├── package.json / pnpm-workspace.yaml / tsconfig.base.json
├── packages/
│   ├── core/                  ← keys, vault, signing, universal identity (device-only)
│   ├── chains/                ← chain registry, RPC abstraction, balance/fee adapters
│   ├── intents/               ← intent schema, parser (LLM), planner, step machine
│   ├── portfolio/             ← aggregation, price engine, unified portfolio
│   ├── execution/             ← swap/bridge adapters, route optimizer, simulation
│   ├── risk/                  ← token verification, scam/fraud heuristics, policies
│   ├── ui/                    ← design system components (React/RN shared)
│   └── sdk/                   ← public developer SDK (wraps intents+execution)
├── apps/
│   ├── api/                   ← backend services (gateway, intent, portfolio, risk)
│   ├── mobile/                ← React Native app
│   └── web/                   ← web app / extension
├── infra/                     ← Terraform, k8s manifests, Dockerfiles, CI/CD
└── docs/                      ← ADRs, threat model, runbooks, API specs, whitepaper
```

### 4.4 API Specification (v1 surface — detail in docs/api/ when built)

```
POST /v1/intents/parse        {text, context}      → Intent (typed) | clarification
POST /v1/intents/plan         {intent, portfolio}  → Plan {steps[], quote, risks, expiry}
POST /v1/intents/execute      {planId, signatures} → ExecutionId       (client signs; server relays/monitors)
GET  /v1/executions/:id                            → status + step states + receipts
GET  /v1/portfolio/:identity                       → unified balances (cached, per-chain detail)
GET  /v1/prices?assets=…                           → prices w/ staleness metadata
POST /v1/risk/scan            {address|token|tx}   → RiskReport {level, reasons[]}
WS   /v1/stream                                    → execution updates, price ticks, alerts
```

Conventions: cursor pagination; idempotency keys on all POSTs; problem+json errors; versioned via URL; OpenAPI generated from Zod schemas (single source of truth).

### 4.5 Event-Driven Architecture & Queues

- **Bus:** Redis Streams (Phase 7) → NATS JetStream when >10k msg/s.
- **Core events:** `intent.parsed`, `plan.created`, `execution.step.{started,confirmed,failed}`, `portfolio.changed`, `risk.flagged`, `price.moved`.
- **Rules:** every consumer idempotent (dedupe on event id); outbox pattern from Postgres for exactly-once publication; DLQ + replay tooling; schema-versioned payloads (Zod).

### 4.6 Caching Strategy

| Data           | TTL                     | Layer                 | Invalidation                           |
| -------------- | ----------------------- | --------------------- | -------------------------------------- |
| Prices         | 5–15s                   | Redis + client memory | pub/sub tick                           |
| Balances       | 15–60s                  | Redis                 | on tx confirm event (push)             |
| Token metadata | 24h                     | Redis + CDN           | manual/registry diff                   |
| Routes/quotes  | 30s (hard expiry)       | Redis                 | expiry only — never reuse stale quotes |
| Risk verdicts  | 1h (allow) / 10m (deny) | Redis                 | registry updates                       |

### 4.7 Database Design (system of record — no keys, no PII beyond minimum)

```
users(id, auth_provider, created_at, …)                    -- optional cloud profile
identities(id, user_id?, btc_addr, evm_addr, sol_addr)     -- watch/registered identities
contacts(id, identity_id, name, address, ecosystem)
intents(id, identity_id, raw_text_hash, parsed_json, status, created_at)
plans(id, intent_id, route_json, quote_json, risk_json, expires_at)
executions(id, plan_id, status, started_at, finished_at)
execution_steps(id, execution_id, seq, chain, kind, tx_hash, status, error, receipts_json)
risk_flags(id, subject_type, subject, level, reasons_json, source, updated_at)
tokens(chain_id, address, symbol, decimals, verification_level, metadata_json)
notifications(id, identity_id, kind, payload_json, read_at)
audit_log(id, actor, action, subject, meta_json, at)       -- append-only
```

Notes: raw intent text stored hashed+encrypted only with consent (for quality); plaintext keys/seeds **never** exist server-side; row-level security per identity.

---

## 5. Wallet Core & Blockchain Architecture

### 5.1 Key Management (device-only)

- BIP-39 mnemonic (128/256-bit entropy) → single seed → all three identities (§1.2).
- **Vault:** seed encrypted with AES-256-GCM; key derived via scrypt (parameters stored in envelope for upgradeability; default N=2¹⁵, r=8, p=1 mobile-safe). Envelope format versioned.
- OS integration: iOS Keychain/Secure Enclave-wrapped vault key + biometrics; Android Keystore/StrongBox. Auto-lock; wipe-on-N-failed-attempts (opt-in).
- Memory hygiene: secrets zeroized after use where the runtime allows; never logged; never serialized except via vault.
- Recovery: manual phrase backup (MVP) → encrypted iCloud/Drive backup with user passphrase (v1.1) → MPC/social recovery (v2).

### 5.2 Transaction Signing

- All signing on-device inside `core`. Server receives only signed payloads.
- EVM: EIP-1559 txs, EIP-712 typed data, EIP-191 messages; **display-what-you-sign** — UI renders decoded effects from simulation, never blind hex.
- BTC: PSBT-based signing (@scure/btc-signer).
- SOL: versioned transactions; simulation before sign.
- Policy hooks: per-tx risk verdict must be attached before the confirm sheet enables.

### 5.3 Gas Abstraction (Phase 9)

- ERC-4337 smart accounts (Safe or Kernel modules — evaluate at phase start) with our EOA as owner; paymaster sponsors gas, fee collected in the asset being moved.
- Session keys for bounded automation (recurring intents) with spend limits + expiry.
- Non-EVM: fee-in-kind handled by route planner (e.g., swap dust for fees automatically as a plan step).

### 5.4 Chain Access Layer

- Chain registry: id, name, RPC pool, explorer, native asset, finality rules, fee model.
- RPC pooling: multiple providers per chain, health-checked, latency-weighted failover, per-provider rate budgets.
- Launch chains: Ethereum, Arbitrum, Base, Optimism, Polygon, BNB (EVM) + Bitcoin + Solana. Testnets: Sepolia, Base Sepolia, BTC testnet4/signet, SOL devnet.

---

## 6. Intent, Portfolio & Execution Engines

### 6.1 Intent Engine

- **Intent schema (typed, versioned):** `Send`, `Swap`, `Bridge`(internal — users never say it), `Stake`, `Rebalance`, `Query` (read-only), `Unknown` (→ clarification).
- **Parser:** Claude API with forced tool-use against the schema; deterministic pre-parsers for common patterns (amount/asset/recipient regexlets) to cut cost/latency; ambiguity → structured clarification question, never a guess.
- **Safety invariants:** parser output is a _proposal_; planner validates against balances/registry; nothing executes without plan + signature. Amount/asset/recipient extracted values must round-trip verbatim in the confirm sheet.
- **Prompt-injection defense:** intent text is data, never instructions; no tool that moves funds is exposed to the model; server-side allowlist of intent types.

### 6.2 Portfolio Engine

- Aggregates balances across all chains per identity; merges same-asset-different-chain into one line (expandable).
- Price engine: multi-source (Chainlink where available, aggregator APIs), median-of-sources, staleness flags, circuit breaker on >X% single-tick moves.
- Cost basis + PnL (v2). Spam/dust filtering via risk engine verdicts.

### 6.3 Execution Layer

- **Adapters:** Swap = 0x/1inch/Jupiter behind one interface; Bridge = LiFi/Socket-style aggregation behind one interface. Each adapter: quote(), build(), track().
- **Route optimizer:** graph search over (chain, asset) nodes with edges = swap/bridge legs; score = output − fees − gas − risk premium − time penalty; top-3 routes retained, best presented.
- **Step machine:** persisted, resumable execution (each step: build → simulate → sign(device) → broadcast → confirm → verify invariants). Failure mid-route triggers **recovery policy**: retry (idempotent), re-route remaining legs, or park in safest asset on current chain + notify.
- **Slippage protection:** per-leg maxSlippage, end-to-end minReceived enforced at final leg; quotes hard-expire (30s).
- **Simulation:** every leg simulated (tenderly-style/anvil fork for EVM, simulateTransaction for SOL) — decoded balance diffs shown to user pre-sign.

### 6.4 Risk Engine

- Token verification: registry cross-check (multiple lists), contract heuristics (honeypot, fee-on-transfer, mint authority, freeze authority on SOL), age/liquidity thresholds.
- Address screening: known-scam lists, sanctions screening hooks (compliance §13), fresh-address heuristics.
- Transaction risk: simulation-diff anomalies (unexpected approvals, drained balances), approval scanner + revoke suggestions.
- Fraud/abuse (server): velocity rules, device fingerprint anomalies, rate limits.
- Output: `RiskReport {level: LOW|MED|HIGH|BLOCK, reasons[]}` — HIGH requires typed confirmation; BLOCK is not overridable on default policy.

---

## 7. Security Architecture

### 7.1 Threat Model (STRIDE summary — full doc: docs/security/threat-model.md, Phase 6)

| Threat                   | Vector                               | Mitigation                                                                                              |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Seed theft               | Device malware, cloud backup leak    | Vault encryption, OS keystore, no plaintext ever, optional passphrase backup                            |
| Phishing / blind signing | Malicious dApp/token                 | Simulation + decoded confirm, risk engine, display-what-you-sign                                        |
| Prompt injection         | Malicious text in intent/token names | Intents are data; typed schema; no fund-moving tools exposed to LLM; sanitize token metadata in prompts |
| Malicious route          | Compromised aggregator               | Multi-source quotes, output invariant checks post-execution, adapter allowlist                          |
| Server compromise        | Our infra breached                   | Server cannot sign; secrets in KMS/Vault; least privilege; audit log                                    |
| Supply chain             | npm dependency attack                | Minimal audited deps (noble/scure), lockfiles, provenance checks, Socket/audit CI gates                 |
| API abuse                | Credential stuffing, scraping        | Gateway rate limits, WAF, anomaly detection, idempotency keys                                           |

### 7.2 AuthN/AuthZ & Sessions (backend, Phase 7)

- Wallet-native auth: sign-in with signature (SIWE-style) → short-lived JWT (15m) + rotating refresh; device-bound (DPoP-style proof).
- Optional email/passkey for notification-only profiles. RBAC for enterprise API keys (scoped, hashed at rest).
- Session revocation list in Redis; all privileged actions in append-only audit log.

### 7.3 Security Program

- SAST + dependency scanning + secret scanning in CI (every PR).
- Fuzzing on parsers (intent text, tx decoding). Invariant tests on vault + signing.
- External audit plan: core crypto package audit before beta; full audit + bug bounty (Immunefi) before GA.
- Incident response runbook; key-compromise playbook; disclosure policy.

---

## 8. Platform Engineering (DevOps / Infra)

- **CI/CD:** GitHub Actions — lint → typecheck → unit → integration → build → (main) staging deploy → manual gate → prod. Signed containers (cosign), SBOM.
- **Environments:** dev → staging (testnets) → prod. Feature flags (homegrown table + cache first).
- **Kubernetes:** EKS; per-service deployments, HPA on latency+queue depth; PodDisruptionBudgets; network policies default-deny.
- **Secrets:** AWS KMS + External Secrets Operator; no secrets in env files/repo; rotation schedule.
- **Multi-region:** active-passive (us-east-1 primary, eu-west-1 warm standby) → active-active for read paths at scale. RPO ≤ 5 min (WAL streaming), RTO ≤ 30 min.
- **Disaster recovery:** automated Postgres PITR backups, restore drills quarterly; chain-data is re-derivable (indexers rebuild).
- **Monitoring SLOs:** API p95 < 300ms (read) / < 800ms (plan); intent parse p95 < 2.5s; uptime 99.9%; error budget policy documented.
- **Cost (initial estimate, monthly):** dev ≈ $300–600 (small EKS/RDS/Redis + RPC free tiers); beta ≈ $2–4k (managed RPCs dominate); scale: RPC/indexing ≈ 60% of infra cost → mitigations: self-hosted nodes for top chains, aggressive caching.

---

## 9. Testing Strategy

| Level       | Scope                                                                 | Tools                              | Gate                                                 |
| ----------- | --------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| Unit        | pure logic, crypto vectors, schema                                    | Vitest                             | 100% pass, coverage ≥ 90% on `core`, ≥ 80% elsewhere |
| Property    | vault roundtrip, derivation cross-check, parser fuzz                  | fast-check                         | CI                                                   |
| Integration | chain adapters vs local forks (anvil, solana-test-validator, regtest) | Vitest + testcontainers            | CI                                                   |
| E2E         | intent → plan → execute on testnets                                   | Playwright/Detox + testnet runners | pre-release                                          |
| Security    | SAST, deps, secrets, fuzz corpora                                     | Semgrep, osv-scanner, gitleaks     | every PR                                             |
| Load        | plan/execute paths                                                    | k6                                 | pre-GA                                               |
| Chaos       | RPC failures, mid-route failures                                      | fault-injection harness            | pre-GA                                               |

**Known test vectors are mandatory** for all cryptographic code (BIP-39/32/84 official vectors, EIP-55 vectors, SLIP-0010 cross-verification).

---

## 10. AI Architecture

- **Models:** claude-sonnet-5 (parse/plan explanation), claude-haiku-4-5 (cheap classification, suggestion chips). Provider-abstracted client with timeout/retry/fallback-to-forms (the product must degrade gracefully to structured forms if LLM is down).
- **Structured output only:** tool-use with JSON Schema; server-side Zod validation; reject-and-retry once, then clarify with user.
- **Context given to model:** portfolio summary (asset symbols+amounts), contacts (names only + last4 of address), supported actions. **Never** given: keys, full addresses unnecessarily, other users' data.
- **Evaluation:** golden intent test-set (≥200 utterances incl. Hinglish/multilingual), measured on parse accuracy per release; red-team corpus for injection.
- **Cost control:** deterministic fast-path for high-frequency patterns; prompt caching; per-user daily LLM budget with graceful fallback.

---

## 11. Developer Platform (Phase 11)

- **SDK (`@intent-wallet/sdk`):** typed client for parse/plan/execute + embeddable confirm UI; wallet-adapter compatibility.
- **Enterprise API:** scoped API keys, per-key quotas, usage metering & billing export, webhooks (signed), sandbox env.
- **Docs site:** quickstarts, recipes, OpenAPI reference, changelog policy (semver, deprecation windows ≥ 90 days).

---

## 12. Decentralization & 5-Year Roadmap

- **Y1:** Ship custodial-free intent wallet (this plan). Centralized solver (our route optimizer).
- **Y2:** Solver API opens to partners; intents become signed, portable payloads (ERC-7683-style compatibility where sensible); MPC recovery; hardware wallets.
- **Y3:** Permissioned multi-solver network — solvers compete on quotes, bonded for correctness; slashing for bad fills; audit-grade telemetry.
- **Y4:** Open solver network + on-chain settlement/verification of intent fulfillment; optional token for solver bonding/governance **only if it adds real utility** (tokenomics doc gate).
- **Y5:** Wallet as OS: third-party skills marketplace, policy automation, enterprise white-label at scale.
- **Whitepaper structure (docs/whitepaper/):** Abstract → Problem → Intent architecture → Universal identity → Solver network & trust model → Security model → Economics → Governance → Roadmap.

## 13. Compliance Considerations

- Self-custody software posture (not a money transmitter) — maintained by design: we never control funds. Legal review per jurisdiction before GA.
- Sanctions screening on counterparty addresses for our routing services; geofencing framework.
- Privacy: GDPR/DPDP — minimal PII, data map, deletion flows; analytics pseudonymous by default.
- Ramp/KYC handled by licensed partners only. App-store crypto policies (Apple 3.1.5) tracked in launch checklist.

---

# 14. PHASE PLAN (the build loop)

> Each phase = one or more focused build sessions. **Definition of Done (DoD)** for every phase: code + tests passing + docs + memory.md updated. No phase is "done" with failing tests.

### Phase 0 — Foundation ✅ _(bootstrap)_

Monorepo (pnpm), TypeScript strict, Vitest, lint/format, git, base configs, requirements.md, memory.md.
**Exit:** `pnpm test` green on a hello package; docs in place.

### Phase 1 — Core Wallet Engine (Universal Identity)

`packages/core`: BIP-39 mnemonic; HD derivation (BIP-32/44/84, SLIP-0010 ed25519); the **three universal addresses** (BTC bech32, EVM EIP-55, SOL base58); encrypted vault (scrypt + AES-256-GCM, versioned envelope); signing primitives (secp256k1 digest sign w/ recovery, ed25519 message sign); zeroization; **official test vectors** + property tests + cross-check of SLIP-0010 against independent implementation.
**Exit:** all vectors pass; vault roundtrip + tamper tests pass; coverage ≥ 90%.

### Phase 2 — Chain Abstraction Layer

`packages/chains`: chain registry (launch chains §5.4); provider abstraction with pooling/failover/health; balance readers (native + ERC-20 + SPL + BTC UTXO); fee estimation per ecosystem; nonce/UTXO management; integration tests against local forks (anvil/regtest/test-validator).
**Exit:** unified `getBalances(identity)` returns correct results on forks; provider failover proven by fault-injection test.

### Phase 3 — Portfolio Engine

`packages/portfolio`: aggregation across chains; price engine (multi-source, median, staleness); unified portfolio model (merge per-asset across chains); token metadata + decimals handling (bigint everywhere, no floats); caching layer.
**Exit:** deterministic portfolio snapshot tests; price circuit-breaker tests.

### Phase 4 — Intent Engine v1

`packages/intents`: versioned Zod intent schema (Send/Swap/Query/Clarify); Claude API client (tool-use, retries, fallback); deterministic pre-parser; resolver (contacts, assets, amounts incl. "$100 of USDT"); clarification loop; golden test-set (≥200 utterances incl. Hinglish) with recorded fixtures (no live API in CI); injection red-team tests.
**Exit:** ≥95% parse accuracy on golden set; all injection tests blocked.

### Phase 5 — Execution Layer

`packages/execution`: EVM tx build/simulate/sign/broadcast/confirm pipeline; swap adapter interface + first two adapters; bridge adapter interface + first adapter; route optimizer (graph search + scoring); persisted resumable step machine; slippage + minReceived enforcement; recovery policies; fork-based E2E: full swap intent executes on anvil fork.
**Exit:** "swap X for Y" runs end-to-end on fork incl. induced mid-route failure recovery.

### Phase 6 — Risk & Security Engine

`packages/risk`: token verification pipeline; address screening; simulation-diff anomaly detection; approval scanner; RiskReport API; threat-model doc; fuzzing harness on parsers/decoders.
**Exit:** known-scam corpus blocked; honeypot heuristics catch test tokens; threat model reviewed.

### Phase 7 — Backend Platform

`apps/api`: Fastify gateway + services (intent, portfolio, risk, execution-monitor); SIWE-style auth + sessions; Postgres schema + migrations (Drizzle); Redis cache/queues; idempotency; rate limiting; OpenAPI from Zod; notifications (push/webhook); OTel + structured logs; docker-compose dev env.
**Exit:** API contract tests green; load smoke (k6) meets SLOs locally.

### Phase 8 — Client Apps

`packages/ui` + `apps/web` (first) + `apps/mobile`: design system; onboarding, portfolio, intent chat, plan confirm, execution tracker, activity, settings; device keystore integration (mobile); E2E happy paths.
**Exit:** create wallet → receive testnet funds → intent swap on testnet, all through UI.

### Phase 9 — Gas Abstraction & Smart Accounts

ERC-4337 integration (bundler + paymaster), smart-account module choice (ADR), session keys with limits, fee-in-asset UX.
**Exit:** gasless testnet swap sponsored by paymaster; session-key bounded automation demo.

### Phase 10 — Production Hardening

Terraform + EKS manifests; CI/CD to staging/prod; secrets mgmt; multi-region standby; backups/DR drill; monitoring dashboards + alerts; load + chaos tests; external audit prep pack; bug bounty draft.
**Exit:** staging environment survives chaos suite within SLOs; audit pack delivered.

### Phase 11 — Launch & Developer Platform

SDK polish + docs site; enterprise API keys/metering; beta program (feature-flagged cohorts); app-store submissions; whitepaper v1; launch checklist; growth loops (referrals, intent-share links).
**Exit:** public beta live with real users on mainnet under conservative limits.

---

## 15. Glossary

**Intent** — typed, validated description of a user goal. **Plan** — concrete executable route satisfying an intent, with quote + risk + expiry. **Leg/Step** — one on-chain action inside a plan. **Identity** — the user's universal address triple. **Solver** — engine that turns intents into optimal plans. **Vault** — encrypted container for the seed. **Adapter** — pluggable integration (swap/bridge/chain).
