# ROADMAP.md — The Delivery Roadmap of Intent Wallet V3

> **Purpose.** This is the canonical, authoritative sequence of *what ships, in what order, and behind
> which gate.* Where [`CLAUDE.md`](CLAUDE.md) is the engineering constitution, [`PRODUCT.md`](PRODUCT.md)
> the product constitution, and [`SECURITY.md`](SECURITY.md) the trust boundary, this file is the
> **delivery constitution**: the 90-day arc to an audited, honest, capped launch (aligned to the pre-seed
> plan), the V3.0 → V3.x release train, the bottom-up 10-phase / 100-module sequencing, the north-star
> milestones, and what is deliberately deferred. It is opinionated on purpose. When the roadmap and
> reality disagree, that is a defect in one of them — reconcile it deliberately, with an ADR, never drift.
>
> **Read this before you** promise a date, start a module out of dependency order, market a capability,
> pull work forward across a gate, size a sprint, or say "we'll ship X by Y." Roadmap priority is decided
> here, then the module card in the Master Spec §6, then the squad milestones in
> [`docs/handbook/05-roadmap-and-team.md`](docs/handbook/05-roadmap-and-team.md).

---

## 0 · TL;DR — the roadmap on one screen

- **The shape:** a **90-day arc** (Harden → **third-party security AUDIT** → private capped beta → honest
  public beta) lands **V3.0**, the first launch generation. Then a gate-driven **V3.x release train**
  widens caps and chains *on evidence*. The **Future / Horizon** (super-app, payments, RWA, intent
  network) sits behind measurable GA gates.
- **The pacing item is the audit.** No real-fund public launch happens until an independent firm audits
  key-management, signing, and encrypted backup and **every high/critical finding is fixed and re-tested.**
  Everything else schedules around it.
- **We sequence bottom-up for trust.** Wallet Foundation (P2) + Infrastructure (P7) + Security (P4) must
  be *real* before anything above real funds is allowed near them. Meaning flows top-down (Product sets
  the *why*); trust is built ground-up.
- **The finish line is falsifiable.** The north star is **Real Intents Executed (RIE)** — an intent that a
  real person signed on-device and confirmed on-chain. A demo, a plan never signed, a testnet tx
  mislabelled mainnet — **none count.**
- **Gates, not dates.** Every stage has a hard exit gate. "In progress" is honest; "done" is earned and
  verified by driving the real thing. We launch **narrow, audited, and honest — then widen on evidence.**

```
 TODAY (V2 base) ──▶ 90-DAY ARC ──▶ V3.0 "Honest Launch" ──▶ V3.x release train ──▶ Future / Horizon
  built + demo-able     S1 harden      audited · capped        widen caps + chains     super-app · payments
  real testnet + guarded S2 beta       mainnet · prod backend   on evidence, gated      RWA · intent network
  mainnet ETH            S3 launch      compliance live         (V3.1 → V3.x)           (Master Spec Phase 10)
```

---

## 1 · How to read this roadmap — the sequencing laws

These govern *order*, the way the Doctrine governs *behavior*. A plan that breaks one is wrong even if it
looks faster.

1. **Bottom-up for trust; top-down for meaning.** Build the load-bearing layer before the layer that
   leans on it (Master Spec §5). A feature above real funds may not ship on an unaudited layer beneath it.
2. **The audit is the pacing item.** It is booked in Sprint 1, executes in Sprint 2, and clears in Sprint
   3. Public GA is *defined by* a clean report, not by a calendar (see §3 and [`SECURITY.md`](SECURITY.md) §10).
3. **Gates, not dates.** Each stage lists an **exit gate**. You may not enter the next stage until the gate
   is green. Dates are forecasts; gates are contracts.
4. **Honesty is a release gate.** Nothing is marketed that isn't shipped. Testnet is labelled testnet;
   capped mainnet is labelled capped; an "engine exists" is *not* "the product ships it" (Doctrine 3,
   [`PRODUCT.md`](PRODUCT.md) §8). Every capability on the site and in the deck must be demonstrable.
5. **Versioned, never vaporware.** Public contracts evolve by SemVer with deprecation windows ≥ 90 days
   (Stripe discipline). No breaking change without a version bump and a migration path. Every roadmap item
   carries a measurable GA gate *and a written kill criterion* (Master Spec P10.09) — no zombie projects.
6. **The guardrails have veto over the schedule.** A milestone that grows RIE but regresses a guardrail
   (loss-of-funds, honesty defects, key exposure, mislabelling, AI-disposed funds) **does not ship** — the
   date moves, the guardrail does not (`PRODUCT.md` §9.3).
7. **Narrow, then wide.** For a wallet, the first drained user is an extinction event. We launch the
   smallest honest surface (a frozen launch chain-set, conservative caps) and widen only on stability data.

---

## 2 · Where we are today — the honest V2 baseline

We do not fabricate status. Graded against one bar — *can a stranger self-custody real money with this
today?* — **testnet-proven ≠ done.** This mirrors the MVP-readiness scorecard in the pre-seed memo and the
honest status in [`PRODUCT.md`](PRODUCT.md) §8; treat anything not marked shipped as **not shipped.**

| Capability | Status | The honest note |
|---|---|---|
| Non-custodial device wallet (create / import / unlock / encrypted backup) | ✅ **Real** | Client-side; scrypt + AES-256-GCM on-device, never sent to a server; BIP-32/44/84 + SLIP-0010 conformance-tested; multi-account HD switching |
| Universal identity (BTC `bc1q…` / EVM `0x…` / SOL base58) | ✅ **Real** | One seed, three ecosystems, one portfolio |
| Unified portfolio + live balances | ✅ **Real** | Integer-math totals; honest partial-read / staleness states; network-fail ≠ $0 |
| On-chain execution — **testnet** | ✅ **Real** | Device-signed broadcast: ETH + ERC-20 + a settlement-safe Uniswap-v3 swap on Sepolia; Solana devnet; Bitcoin testnet — web **and** mobile |
| On-chain execution — **mainnet** | ⚠️ **Partial** | Only a **guarded ETH-native opt-in** (explicit real-funds confirm + **$1,000 cap**). Mainnet ERC-20, swaps, Solana, and BTC are **not wired** |
| Intent flow: parse → risk → policy → route → settle | ✅ **Real** | Deterministic fast-path + real Anthropic **schema-forced** LLM tail; risk/policy/router/settlement live; fail-closed |
| Risk / policy gate on every action | ✅ **Real** | Deterministic verdicts, auditable, fail-closed; *AI proposes, code verifies, device disposes* |
| Portfolio intelligence (insights) | ✅ **Real** | Explains verified data only; never invents a number |
| Intent SDK + `/v1` API (plan · authorize · execute · portfolio · status) | ✅ **Real** | SIWE auth; signing stays client-side; server issues plans (client can't forge one); `/execute` re-runs risk+policy server-side |
| Web (Vite + React + one `styles.css`) & Mobile (Expo) | ✅ **Real** | Mobile: Simple/Pro/Dev modes + 5-tab IA; both inherit the same mainnet gap |
| Bounded automation (Manual default / Auto with caps) | ✅ **Real** | `autoDecision` fails safe; caps clamp |
| **Third-party security audit** | ❌ **Missing** | The **single blocking gate.** Sound architecture, but no external audit → no real-fund GA |
| Production backend (deploy · SLOs · on-call) | ⚠️ **Partial** | Fastify + SIWE + rate-limit + metrics + Postgres/Redis seams exist; **dev/staging only**, no prod SLOs |
| Compliance (ToS · disclosures · geofencing · sanctions) | ❌ **Missing** | Non-custodial lowers the bar; it does not remove it — needed before public launch |
| Traction (users · store listings · token) | ❌ **None** | Pre-launch by design. No users, no listings, **no token** |

> **One-line read:** the *hard* part — a non-custodial, multi-chain, AI-intent wallet that really signs and
> broadcasts — is **built and demo-able.** What remains is the unforgiving part: **audit, mainnet
> hardening, and a production backend.** That ordering is the 90-day arc below.

---

## 3 · The immediate 90-day arc — Harden → Audit → Beta → Launch

Aligned 1:1 to the pre-seed plan. **Day 0 = pre-seed kickoff.** Three 30-day sprints; each has a **hard
exit gate.** The audit is engaged in S1, executes in S2, and clears in S3 — it paces the whole arc.

### 3.1 Sprint 1 · Days 1–30 — **Harden + Audit-Prep**

*Goal: make the codebase auditable and lock the audit slot.*

- **Audit engaged** — firm selected, SOW + scope signed, dates booked to start in S2. Reference names for
  *wallet-grade* review (not smart-contract-only): **Trail of Bits, Cure53, Halborn.** Scope that matters:
  seed generation + entropy, BIP/SLIP derivation, scrypt/AES-256-GCM backup, the on-device signing flow,
  spend-cap + Auto-mode enforcement, and the browser/extension attack surface (supply chain, XSS, key
  exfil). Book 6–10 weeks ahead; budget a **fix-and-re-test** round, not a one-shot pass.
- **Threat model + security spec** written *for the auditor*: key lifecycle, backup, signing, spend-cap
  enforcement, trust boundaries (extends [`SECURITY.md`](SECURITY.md) and `docs/security/`).
- **Internal hardening pass** — dependency + supply-chain audit (`npm/pnpm audit`, pinned lockfiles, SRI),
  secrets hygiene, CSP/XSS review, a self-run drain-attack surface test.
- **Backend to staging** — deploy the Fastify API off dev; wire the real dist build path (today the repo
  runs from source via `tsx`; a real production build is Production Hardening work, P7/§Sprint 3).
- **Mainnet plan frozen** — decide and freeze the **narrow launch chain-set**; no scope drift after this.

> **Exit gate S1:** audit SOW signed with dates on the calendar · threat model delivered to the firm ·
> hardening pass complete · staging backend live · launch chain-set frozen.

### 3.2 Sprint 2 · Days 31–60 — **Private beta (real, capped)**

*Goal: prove real users move real funds, safely, while the audit runs.*

- **Audit executing** — triage findings weekly; **remediate immediately, don't wait for the final report.**
- **Narrow mainnet set wired** — the frozen chain-set moves from testnet to real mainnet execution *behind
  the existing guardrails*: explicit real-funds confirm + a conservative spend cap (start at/under the
  current **$1,000**, raise deliberately).
- **Kill-switch + incident runbook** — a tested, remote ability to disable mainnet execution, a venue, a
  chain, the LLM path, and automation independently (fail closed; see `SECURITY.md` §11). Verified in a
  live drill.
- **Private beta cohort (25–75)** who knowingly accept "beta, pre-audit-completion, cap your funds."
  Instrument everything: parse accuracy, tx success/failure, **time-to-first-intent**, every support
  ticket. Burn down the open UX/edge-case debt by what beta users actually hit.

> **Exit gate S2:** final audit report received, **100% of high/critical findings fixed and re-tested**,
> mediums triaged with a plan · **≥ N real-fund mainnet RIE across the cohort with zero loss-of-funds** ·
> kill-switch proven in a drill · top UX blockers closed, crash/error rate under the agreed threshold.

### 3.3 Sprint 3 · Days 61–90 — **Public beta launch (V3.0)**

*Goal: open the doors on a clean audit report.*

- **Published audit report** (or a public summary + remediation attestation) — the trust + diligence anchor.
- **Production backend** — SLOs, rate limits, monitoring/on-call, load-tested for launch-day traffic.
- **Compliance live** — ToS + risk disclosures shipped, geofencing + sanctions (OFAC) screening enforced,
  counsel sign-off on file.
- **Graduated cap policy** — a documented path to raise caps and add chains *after* launch, gated on
  stability data.
- **App-store / web GA** — installable by the public; honest launch narrative (real testnet + capped
  mainnet), audit report front-and-center.

> **Exit gate S3 = the Definition of Ready to Launch (§3.4) is all-green.**

### 3.4 The Definition of Ready to Launch — the V3.0 GA checklist

Public beta is authorized **only when every box is checked.** This is the gate that turns "impressive demo"
into "fundable, launchable wallet."

- [ ] **Audited** — independent firm reviewed key-management + signing + encrypted backup; all
      high/critical findings fixed and re-tested; report published.
- [ ] **Non-custodial verified end-to-end** — keys provably never leave the device; encrypted backup +
      restore tested across web and mobile.
- [ ] **Mainnet, honest and bounded** — the frozen launch chain-set executes real transactions behind
      explicit real-funds confirm + spend caps + a kill-switch; nothing un-wired is shown as wired.
- [ ] **Beta-proven** — real users moved real funds with **zero loss-of-funds incidents**; top UX blockers
      closed; crash/error rate under threshold.
- [ ] **Production backend** — deployed, monitored, on-call, meeting SLOs; load-tested.
- [ ] **Compliant** — ToS, disclosures, geofencing, sanctions screening live with counsel sign-off.
- [ ] **Honest marketing** — every claim demonstrable; testnet labelled testnet, capped mainnet labelled
      capped; no implied audit or token.

### 3.5 The KPI dashboard — targets with a date (never asserted as achieved)

Per `PRODUCT.md` §9.5, these are **written goals**, not claimed numbers. North star operationalized as
**WRIE — Weekly Real Intents Executed** (the weekly cut of RIE): parsed → passed the safety gate →
signed on-device → broadcast.

| Metric | Day 30 | Day 60 | Day 90 |
|---|---|---|---|
| **Audit (the gate)** | SOW signed, dates booked | Executing + remediating weekly | Report published, 100% high/critical fixed |
| **WRIE — north star** (real intents/wk) | 60 | 350 | 1,300 |
| Waitlist (verified email + X handle) | 1,200 | 4,000 | 10,000 |
| Beta invited (cumulative) | 100 | 500 | 1,500 |
| Activated (≥1 real intent executed) | 40 | 250 | 800 |
| Time-to-first-intent (median, first session) | < 10 min | < 6 min | < 4 min |
| Referral k-factor | 0.15 | 0.25 | 0.35 |
| **Loss-of-funds incidents** | **0** | **0** | **0 — non-negotiable** |

### 3.6 Fundraise alignment (the arc *is* the milestone set)

This arc — **audited, mainnet-live, beta-proven** — is precisely the milestone set that clears a crypto
seed round. The roadmap and the raise share one clock.

| The raise | The commitment |
|---|---|
| **Instrument** | Post-money **SAFE**, valuation cap, no discount, MFN (the 2025–26 standard; no priced round at pre-seed) |
| **Target** | **~$1.5M** pre-seed (range $1.25M–$1.75M) on a **$12M cap** (flexible to $15M for a strong lead) |
| **The three checkable milestones the raise buys** | (1) a completed third-party audit · (2) guarded mainnet across ETH + one L2, Solana, and BTC · (3) a waitlist of design-partner users |
| **Milestone gate** | If by **Day 60** there is neither an accelerator yes nor a soft-circled lead → **pause**, sharpen demo + wedge, re-open — don't grind a stale list |

> **Top risk, stated plainly:** the audit slips or finds criticals — *the whole plan paces off it.* Mitigation
> is structural: engage in S1, remediate in parallel, pre-budget the re-test round, and **never let the
> launch narrative assume an optimistic pass date.**

---

## 4 · Versioning — V3.0 → V3.x, and the naming that must not drift

### 4.1 The scheme

- **"V3"** names the **current build generation** of the codebase and the Living Master Spec (which
  supersedes the old V2 27-prompt series). It is the doctrine/spec generation, not a shipped app version.
- **Shipped releases** follow **SemVer** as **V3.0 → V3.1 → V3.x**. **V3.0** is the audited, honest,
  capped **public beta GA** — the finish line of the 90-day arc. Each subsequent minor widens the surface
  behind its own gate.
- **Public contracts** (the `/v1` API, the SDK, plugin and event schemas) evolve under SemVer with
  **deprecation windows ≥ 90 days** and a published migration path. **No silent breaking change** — a break
  is a major bump plus a runbook. This is Stripe-grade versioning discipline, enforced by P10.09.

### 4.2 Reconciling the "V1 / V2" language in the Master Spec

The Master Spec's Phase-10 cards (`P10.09 · V2 Roadmap`, `V1→V2 migration`) use **V1/V2 to mean shipped
*product generations*, not the spec generation.** To remove all ambiguity, this roadmap fixes one mapping:

| Master Spec term | This roadmap's canonical name | What it is |
|---|---|---|
| "V1" (the launched product) | **V3.0 → V3.x** (the release train) | The audited wallet and its evidence-gated expansion |
| "V2 Roadmap" (P10.09) / "the Future" | **The Horizon** (Master Spec **Phase 10**) | Super-app, payments, RWA, DeFi, intent network — post-wallet platform bets |
| "V1→V2 migration" | **release-train migration** | SemVer + doctrine-preserving migrations that never grant AI/agent signing authority |

> If you write "V2" in a spec, you mean **the Horizon (Phase 10)**, not the codebase. Say it that way.

### 4.3 The release train (opinionated sequencing; each minor is gate-driven, not date-driven)

| Version | Theme | What it adds | The GA gate that unlocks it | Written kill criterion |
|---|---|---|---|---|
| **V3.0** | **Honest Launch** | Audited; guarded **capped** mainnet on the frozen launch chain-set; real testnet on all three ecosystems; prod backend + SLOs; compliance; the wedge (plain-English swap + visible safety gate) | The Definition of Ready to Launch (§3.4), all-green | — (this is the launch) |
| **V3.1** | **Widen the rails** | Mainnet ERC-20 + swaps; Solana + BTC mainnet execution; **raise caps on evidence** per the graduated-cap policy | ≥ N clean mainnet RIE at the prior cap tier with **zero loss-of-funds**; re-audit of the swap-settlement path | Sustained loss-of-funds or honesty defect at tier N → freeze caps, roll back |
| **V3.2** | **Recover & protect** | Passkey + MPC (P4.08), Recovery Center (P4.09), Security Dashboard (P4.10), hardware-wallet support | External audit of the recovery/MPC surface; **no server share can move funds unilaterally** (Doctrine 1) | MPC scheme cannot preserve non-custody under adversarial review → ship Passkey-only, defer MPC |
| **V3.3** | **Automation, honestly** | `recurring` / `emergency_exit` with real broadcast; `stake` / `rebalance` execution wired end-to-end; bounded Auto at higher, user-set caps | Automation inner-action safety review; every automated action passes the same gate + cap as a manual one | Any path where automation exceeds granted authorization → disable Auto, keep Manual |
| **V3.4** | **The platform** | `/v1` API GA + versioning freeze; SDK 1.0; webhooks; signed plugin marketplace; developer platform + observability (Vercel-grade DX, Stripe-grade rails) | No plugin can sign or exceed granted scope (test-proven); SemVer + ≥90-day deprecation policy published | A plugin can request signing capability → no marketplace GA |
| **V3.5+** | **Intelligence & business** | P5 AI OS / multi-agent / finance / tax agents (**propose-only**); P8 pricing, growth, referrals, billing; P9 company operations | Each agent verified to hold **no signing authority**; every risky decision auditable | Any agent surface that can dispose of funds → cut it |
| **Horizon** | **The category** | Master Spec **Phase 10** — super-app, universal payments, RWA, DeFi hub, AI economy, intent network, digital-asset OS, global settlement | Per-module measurable GA gate + pre-committed kill criteria + doctrine-preservation checklist (P10.09) | Any bet that weakens a Doctrine law → killed by criteria |

---

## 5 · The 10-phase / 100-module sequencing — bottom-up for trust

The 100 modules (Master Spec §6) form a dependency stack. **Lower layers are load-bearing; higher layers
are only as trustworthy as the layer beneath.** P1 (Product) and P4 (Security) are **cross-cutting** — they
touch every phase, which is why they sit on the edges of the map.

```
 P10  HORIZON / FUTURE   ── super-app, payments, RWA, DeFi, intent network, 2035 vision       🌅 deferred
 P9   COMPANY            ── brand, marketing, docs, community, launch, hiring, ops            🔄 partial (launch = the 90-day arc)
 P8   BUSINESS           ── pricing, growth, referrals, billing, CRM, BI                      ⬜ post-launch
 P6   PLATFORM           ── SDK, API, plugins, white-label, devtools, webhooks, observability 🔄 SDK+API real; rest roadmap
 P5   AI                 ── AI OS, multi-agent, tool-calling, memory, graph, finance AI        🔩 engines exist; agents roadmap
 P3   INTENT PLATFORM    ── intent → plan → execute → settle, router, solvers, automation      ✅ real (testnet + guarded mainnet)
 P4   SECURITY  ◀──────── risk, policy, fraud/scam, simulation, threat-intel, MPC, recovery    ✅ gate real · ❌ AUDIT + MPC/recovery pending
 P2   WALLET FOUNDATION  ── keys, identity, accounts, assets, portfolio, chains, tx, sessions  ✅ the shipped bedrock
 P1   PRODUCT & DESIGN   ◀── the why + the feeling that governs every layer                    ✅ substantially real
 P7   INFRASTRUCTURE     ── scale, k8s, data, events, cache, SRE, DR, performance              🟡 dev/staging baseline · prod = Sprint 3
```

**Status legend:** ✅ real (shipped, driven end-to-end) · 🔩 engine-built (pure, tested package exists but
**not** productized/GA end-to-end — per `PRODUCT.md` §8, "the engine exists" ≠ "the product ships it") ·
🔄 in progress · ⬜ planned · 🌅 Horizon/deferred.

### 5.1 The phase roster (all 100 modules, with honest status)

**Phase 1 · Product & Design** — *the why + the feeling; cross-cutting.*
P1.01 Product Vision ✅ · P1.02 Product Philosophy ✅ · P1.03 UX Psychology ✅ · P1.04 Information
Architecture ✅ · P1.05 Design System ✅ · P1.06 Motion Design System 🔄 · P1.07 AI UX ✅ · P1.08
Navigation System ✅ · P1.09 Interaction Design ✅ · P1.10 Accessibility 🔄

**Phase 2 · Wallet Foundation** — *the bedrock; must be real before anything above real funds.*
P2.01 Wallet Core ✅ · P2.02 Universal Identity ✅ · P2.03 Account System ✅ · P2.04 Asset Engine ✅ ·
P2.05 Portfolio Engine ✅ · P2.06 Blockchain Adapter ✅ · P2.07 Address Intelligence ✅ · P2.08 Universal
Address Book ✅ · P2.09 Transaction Engine ✅ · P2.10 Session Management ✅

**Phase 3 · Intent Platform** — *the beating heart: intent → plan → execute → settle.*
P3.01 Intent Engine ✅ · P3.02 AI Planner ✅ · P3.03 Execution Engine ✅ · P3.04 Settlement Engine ✅ ·
P3.05 Route Optimizer 🔩 *(engine real; live DEX/vendor routes not wired)* · P3.06 Provider Framework 🔩
*(framework real; live vendor providers pending)* · P3.07 Solver Network 🔩 *(package exists; no live
network)* · P3.08 Automation Engine 🔩 *(engine real; recurring/conditional broadcast not GA → V3.3)* ·
P3.09 AI Memory 🔄 · P3.10 Financial Brain ✅

**Phase 4 · Security** — *the immune system; cross-cutting; the AUDIT is the launch gate.*
P4.01 Security Engine 🔩 · P4.02 Risk Engine ✅ · P4.03 Policy Engine ✅ · P4.04 Fraud Detection 🔩 ·
P4.05 Scam Detection 🔩 · P4.06 Simulation Engine ✅ · P4.07 Threat Intelligence 🔩 · P4.08 Passkey + MPC
⬜ *(→ V3.2)* · P4.09 Recovery Center ⬜ *(→ V3.2)* · P4.10 Security Dashboard ⬜ *(→ V3.2)*
— plus the **overarching third-party audit**: ❌ the single blocking gate for real-fund GA.

**Phase 5 · AI** — *AI at the edges, always propose-only.*
P5.01 AI Operating System 🔩 · P5.02 Multi-Agent Framework ⬜ · P5.03 Tool Calling ✅ *(copilot tools)* ·
P5.04 Memory Engine 🔩 · P5.05 Knowledge Graph ⬜ · P5.06 Personal Finance AI ✅ *(intelligence narrator)*
· P5.07 Research Agent ⬜ · P5.08 Market Intelligence 🔩 · P5.09 Tax Agent 🔩 *(tax engine exists)* ·
P5.10 AI Marketplace ⬜

**Phase 6 · Platform** — *intents-as-an-API; signing stays client-side.*
P6.01 SDK ✅ · P6.02 Public API ✅ *(`/v1`)* · P6.03 Enterprise ⬜ · P6.04 White-label 🔩 · P6.05 Plugin
Marketplace 🔩 · P6.06 Developer Platform 🔄 · P6.07 CLI ⬜ · P6.08 Webhooks 🔩 · P6.09 Analytics Platform
⬜ · P6.10 Observability 🔄 *(metrics + trace context baseline)*

**Phase 7 · Infrastructure** — *the ground everything runs on; prod is Sprint 3 / Production Hardening.*
P7.01 Scalability 🔩 · P7.02 Kubernetes ⬜ · P7.03 Database 🔄 *(Postgres plan store)* · P7.04 Event Bus
🔩 *(events package)* · P7.05 Cache 🔩 *(Redis nonce + rate-limit)* · P7.06 Multi-region ⬜ · P7.07 CDN ⬜
· P7.08 SRE ⬜ · P7.09 Disaster Recovery ⬜ · P7.10 Performance 🔄

**Phase 8 · Business** — *post-launch; the 90-day growth plan is the manual first version.*
P8.01 Pricing ⬜ · P8.02 Marketplace Economy ⬜ · P8.03 Growth Engine ⬜ · P8.04 Referral System ⬜ ·
P8.05 Billing ⬜ · P8.06 CRM ⬜ · P8.07 Customer Success ⬜ · P8.08 Partner Platform ⬜ · P8.09 Business
Intelligence ⬜ · P8.10 Finance Dashboard ⬜

**Phase 9 · Company** — *the raise + launch are live now; the rest follows the close.*
P9.01 Brand System 🔄 · P9.02 Marketing 🔄 *(the social-growth plan)* · P9.03 Website ⬜ *(waitlist landing
= Sprint 1)* · P9.04 Documentation ✅ *(the root bible + `docs/`)* · P9.05 Community ⬜ *(Discord/TG =
Sprint 1)* · P9.06 Open Source 🔄 · P9.07 Launch Strategy ✅ *(the 90-day plan)* · P9.08 Investor Deck ✅
*(the pre-seed memo)* · P9.09 Hiring Plan ✅ *(2 hires in use-of-funds)* · P9.10 Company OS 🔄

**Phase 10 · Horizon / Future** — *behind measurable GA gates + kill criteria; doctrine-preserving.*
P10.01 Web3 Super App 🌅 · P10.02 Universal Payments 🌅 · P10.03 RWA 🌅 · P10.04 DeFi Hub 🌅 · P10.05 AI
Economy 🌅 · P10.06 Intent Network 🌅 · P10.07 Digital Asset OS 🌅 · P10.08 Global Settlement Network 🌅 ·
P10.09 V2 Roadmap (**the governance instrument for all of the above**) 🔄 · P10.10 Vision 2035 🌅

### 5.2 Mapping to the engineering-management milestones

The squad view lives in [`docs/handbook/05-roadmap-and-team.md`](docs/handbook/05-roadmap-and-team.md) as
milestones **M0–M11** (Foundation → Launch & Developer Platform). This ROADMAP.md is the **canonical
product/delivery roadmap**; the handbook holds squad ownership, dependencies, and per-milestone
Definition-of-Done detail. When the two are read together: **M0–M8 are substantially delivered** (the V2
baseline in §2), **M9–M10 (Gas Abstraction, Production Hardening) are the 90-day arc**, and **M11 (Launch &
Developer Platform) spans V3.0 → V3.4.** Keep them consistent — reconcile via ADR, never fork.

---

## 6 · North-star milestones — the falsifiable finish lines

The north star is **Real Intents Executed (RIE)** — an on-chain-confirmed state change signed by the
user's own keys ([`PRODUCT.md`](PRODUCT.md) §9). The launch plan measures it weekly as **WRIE**. Every
milestone below is *un-fakeable*: it requires a funded wallet, a successful parse, a passed policy check,
and a real broadcast.

| Milestone | The falsifiable definition | Guardrail that gates it |
|---|---|---|
| **M-α · First external mainnet RIE** | A beta user (not the team) signs and confirms a real, capped mainnet intent on the frozen launch chain-set | Zero loss-of-funds; capped + labelled capped |
| **M-β · Beta activation** | **800** cumulative users have each executed ≥ 1 real intent (Day-90 target) | Time-to-first-intent trending ↓; honesty defects = 0 |
| **M-γ · WRIE at launch** | **1,300** real intents/week (Day-90 target) | Loss-of-funds = 0; no mislabelling |
| **M-δ · 6-month depth** | Full mainnet coverage across BTC / EVM ERC-20 + swaps / Solana; **first 1,000 self-custody users** | Each cap tier cleared on evidence; re-audit on the swap-settlement surface |
| **M-ε · 12-month seed metrics** | Retained intenders and WRIE growth that clear a seed round at a real step-up | All guardrails green year-round (the invariants scorecard, P10.10) |

> **The guardrails have veto over every milestone.** A rise in RIE never justifies a regression in
> loss-of-funds (→ 0, hard), honesty defects (→ 0, hard), key-exposure (→ 0, absolute), mislabelling (→ 0),
> or AI-disposed-funds (→ 0, absolute). If a milestone grows the north star but worsens a guardrail, it
> does not ship (`PRODUCT.md` §9.3).

**Anti-metrics we refuse to optimize** (`PRODUCT.md` §9.4): raw DAU / session length, volume divorced from
user benefit, chains-supported as a vanity count, and **AI-autonomy rate** (an anti-goal, never a KPI).

---

## 7 · Explicitly deferred — "later" and "never"

Saying no is a roadmap feature. Two lists: **deferred** (real, but gated to a later version) and **anti-scope**
(a written "no," reversible only by ADR — `PRODUCT.md` §5.2).

### 7.1 Deferred to a gated V3.x / the Horizon

| Deferred item | Where it lands | The gate that unlocks it |
|---|---|---|
| Full mainnet across all chains (ERC-20, swaps, SOL, BTC) | **V3.1** | Clean capped-mainnet RIE at the prior tier; graduated-cap policy; re-audit |
| Passkey + MPC, social/recovery, hardware wallet | **V3.2** | Audit of the recovery/MPC surface; non-custody provably preserved |
| Real `stake` / `rebalance` / `recurring` / `emergency_exit` broadcast *(modeled + gated today, not executable)* | **V3.3** | Automation inner-action safety review; same gate + caps as manual |
| Fiat on/off-ramps, NFT portfolio, ENS/SNS beyond current resolution | **V3.x** | Honest end-to-end support (balances, fees, simulation, risk) per chain/asset |
| Public API GA, plugin **marketplace live**, white-label, enterprise, CLI, webhooks | **V3.4** | No plugin can sign/exceed scope (test-proven); SemVer + ≥90-day deprecation |
| Multi-agent framework, knowledge graph, research/market/tax **agents live**, AI marketplace | **V3.5+** | Each agent verified propose-only; every decision auditable |
| Live **decentralized solver network**, intent marketplace, super-app, payments, RWA, DeFi hub, global settlement | **Horizon (P10)** | Per-module GA gate + kill criterion + doctrine checklist (P10.09) |

> **Do not ship UI that implies a finished execution** for a deferred capability (a "Stake" plan that can't
> broadcast, a "mainnet swap" that isn't wired). That violates Doctrine 3 and `PRODUCT.md` §2.4. Design the
> *real* screen premium, or don't render it.

### 7.2 Anti-scope — a "no," not a "later"

Reversible only by a written ADR that names the specific line:

- **Any custody of keys or funds, ever** — no server-side key storage; no MPC scheme where a server share
  can move money unilaterally.
- **Any path where the AI can sign or execute** — no "just do it for me" that bypasses the deterministic
  gate and the device signature. No prompt, tool, or plugin may request signing capability.
- **Fake / borrowed data** — no placeholder balances, no simulated "success," no network-fail-as-$0, no UI
  for a feature that doesn't exist.
- **Blind, un-simulated, arbitrary contract execution as a headline** — if we can't simulate and explain
  it, we refuse it (fail closed).
- **A token, points program, or yield-farm mechanics at launch** — deferred hard; revisited only if a
  decentralized solver network genuinely requires it.
- **Dark patterns around money** — hidden fees, self-favoring defaults, urgency nags, confirm-shaming.
- **Chain sprawl as a growth hack** — new chains only when supported honestly, never as a checkbox.
- **Re-skinning OS security surfaces** — biometrics, share sheets, permission dialogs belong to the platform.

---

## 8 · Governance — how this roadmap stays honest

A roadmap is a **governance instrument, not a wish-list** (P10.09). It beats vaporware crypto roadmaps by
being *falsifiable*, Stripe on versioning, and Linear on cadence.

- **The register.** Every roadmap item lives as `module → stage → GA gate → owner → kill criterion`. No
  item without a measurable gate and a written kill condition. *Prove the discipline is real: kill at least
  one item by its criteria.*
- **Gates, not dates.** Progress is tracked per module against its Definition of Done (Master Spec §6).
  "Done" is earned by driving the real thing in light **and** dark, keyboard-reachable, AA, reduced-motion
  safe — proven with a screenshot/recording (Doctrine 6, Build Loop stage 10).
- **SemVer + migration.** No public-contract break without a major bump and a runbook; deprecation windows
  ≥ 90 days. A V3.x → V3.y migration preserves keys, identity, and history with **zero custody exposure**
  and never quietly grants AI/agent signing authority.
- **The doctrine-preservation checklist** gates every GA: nothing ships that weakens non-custody, the gate,
  honesty, bigint money, accessibility, or the deterministic-core boundary. The checklist **is** the eight
  Doctrine laws (`CLAUDE.md` §3).
- **Decisions survive their authors.** Every real sequencing decision is an ADR (`docs/adr/`); a reversal is
  a *new* ADR that supersedes, never an edit. The non-obvious goes in [`memory.md`](memory.md).
- **The Security Engineer holds a hard veto** on anything touching keys, funds, or user data; only the CEO
  overrules, in writing (`CLAUDE.md` §2). No date pressure overrides the veto.

---

## 9 · Related canon — route here before you plan

| If your work touches… | Read |
|---|---|
| The Doctrine, Council, Build Loop | [`CLAUDE.md`](CLAUDE.md) |
| Vision, wedge, ICP, north-star definitions, honest V2 status | [`PRODUCT.md`](PRODUCT.md) |
| The full 10-phase / 100-module cards + quality bars | [`INTENT_WALLET_V3_MASTER_SPEC.md`](INTENT_WALLET_V3_MASTER_SPEC.md) §6 |
| Audit scope, release gates, kill-switches, disclosure | [`SECURITY.md`](SECURITY.md) §10–13 |
| Architecture, packages, dependency stack, ADRs | [`ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/architecture/`](docs/architecture/), [`docs/adr/`](docs/adr/) |
| Design + interaction acceptance criteria | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), [`UX_GUIDELINES.md`](UX_GUIDELINES.md) |
| The intent pipeline / AI boundary | [`AI.md`](AI.md), `@intent-wallet/intents` |
| Squad milestones (M0–M11), team, RFC/ADR process | [`docs/handbook/05-roadmap-and-team.md`](docs/handbook/05-roadmap-and-team.md) |
| Original PRD detail + build-track phases | [`requirements.md`](requirements.md) |

---

*This is the delivery constitution. Launch narrow, audited, and honest — then widen caps and chains on
evidence. Ship gates, not dates. Refuse to fake, refuse to leak a key, refuse to let the AI touch the
money, refuse to market a capability we have not shipped.*
