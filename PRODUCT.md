# PRODUCT.md — The Product Constitution of Intent Wallet V3

> **Purpose.** This is the canonical, authoritative statement of *what Intent Wallet is, who it is for,
> what it will and will not become, and how we know it is winning.* Where [`CLAUDE.md`](CLAUDE.md) is the
> engineering constitution and the Doctrine, this file is the **product constitution**: it owns vision,
> philosophy, the wedge, the ICP, scope boundaries, positioning, the definition of a great *intent*, and
> the success metrics that route back to the north star. It is opinionated on purpose. When product
> reality and this document disagree, that is a defect in one of them — reconcile it deliberately, never
> drift.
>
> **Read this before you** add a feature, kill a feature, argue a persona, write a positioning line, pick
> a metric, size a roadmap item, or say the word "intent" in a spec. Product scope is decided here first,
> then the module card in the Master Spec §6, then [`ROADMAP.md`](ROADMAP.md).

---

## 0 · TL;DR — the whole product on one screen

- **What:** an AI-native, **non-custodial** multi-chain wallet. You say what you want in plain English; it
  plans the route, proves it safe with deterministic code, and **your device signs.**
- **Promise:** *"Talk to your money."* — Bitcoin, Ethereum + L2s, and Solana under **one universal
  identity**, chains made invisible.
- **North star (the only number that matters):** **Real Intents Executed** — natural-language requests that
  end in an on-chain-confirmed state change signed by the user's own keys. Everything else is a leading
  indicator of this.
- **Wedge:** the **cross-ecosystem one-liner** — *"convert my BTC to ETH,"* *"send $100 USDC to Rahul"* —
  done in one sentence, with an honest plan, no manual bridging, chain-switching, or gas-token juggling.
- **We win on:** trust you can *see* (honest states, sacred confirm sheet, risk-loud UI) + reach no single
  competitor has (BTC **and** EVM **and** SOL, one identity) + an AI layer that can only ever **propose.**
- **We are not:** a DeFi power-terminal, a trading desk, a custodian, a chain-maximalist wallet, an
  airdrop/points farm, or a chatbot that touches keys.

---

## 1 · Vision

**Intent Wallet is the operating system for money that anyone can talk to.**

The dominant crypto wallets are *instrument panels*: they expose chains, gas tokens, bridges, slippage,
approvals, nonces — and ask a human to be the router. That model produced hundreds of billions in
self-custodied value and a user base that is overwhelmingly technical, anxious, and small. The next
hundred million people will not learn a chain. They will **say what they want.**

Our bet: the winning wallet is not a better instrument panel — it is a **conversation with a verifier.**
The user expresses an *intent* in their own words; a deterministic engine turns that intent into a proven,
priced, risk-checked plan; and the user's on-device signature — never the AI, never a server — disposes of
the funds. The AI is the world's best translator and explainer. It is never the hand on the money.

Our north-star framing is deliberately three products fused:

| We borrow… | From | For |
| --- | --- | --- |
| Conversational intent as the primary surface | **ChatGPT** | zero-learning-curve interaction |
| Product craft, calm, trust, "it just works" | **Apple Wallet** | a wallet a non-technical person *enjoys* |
| Rails, transparency, a real developer platform | **Stripe** | intents-as-an-API, embeddable everywhere |

**The test we hold every release to:** *can a non-technical stranger move real money across chains by
typing one sentence — never be lied to, never lose funds, and enjoy it?* If the answer is no, the release
is not done, no matter how green the type-check.

---

## 2 · Philosophy — the immutable product principles

These are **product laws.** They sit above features and above this quarter's roadmap; a change that breaks
one is wrong even if it ships and demos well. They are the product-side complement to the engineering
**Doctrine** in [`CLAUDE.md`](CLAUDE.md) §3 — where the Doctrine says *how the system must behave*, these
say *what the product must be.* Reviews cite them by number.

1. **Intent is the interface.** The primary surface is a sentence, not a form. Every core journey must be
   completable by typing/saying what you want. Forms exist only as an honest fallback and for precision —
   never as the required path.

2. **Assets, not chains.** A user thinks in *money and assets* ("my BTC," "$100"), never in
   infrastructure. Chain names never appear at the top level; they live one tap deep and inside technical
   receipts. Bridging, chain-switching, gas-token selection, wrapping, and approvals are our job, not the
   user's vocabulary.

3. **The AI proposes; the signature disposes.** The model has **no signing authority, ever.** It drafts
   intents and prose; deterministic code verifies; the user's on-device signature is the sole mover of
   funds. A product surface that lets the AI *act* rather than *propose* is a bug of the highest severity.

4. **Never lie to the user — not even by omission.** Honest empty/loading/error/partial states. A network
   failure is **not "$0."** Testnet is labelled testnet; capped mainnet is labelled capped. Fees are shown
   as fiat-first totals before the user commits. We never round in the user's disfavor on a confirm
   screen, and we never render UI for a capability that does not exist. Trust is the product; a single
   lie forfeits it.

5. **The confirm sheet is sacred, and it is the anti-phishing defense.** One anatomy for every
   value-moving confirmation, everywhere. Users must recognize it with their eyes half-closed — *that
   recognition is a security feature.* We never re-skin OS security surfaces (biometrics, share sheets).

6. **Risk is loud; everything else is quiet.** The interface is near-monochrome so that semantic color —
   risk, success, danger — carries unmissable meaning. Risk is **always** icon + label + color, never
   color alone (WCAG AA is a product requirement, not an accessibility nicety).

7. **Custody is the user's, always, with a door that's always unlocked.** Keys and seed are generated and
   used on-device, encrypted at rest, and **never** leave it. The user can export their seed and walk away
   at any moment, with zero lock-in. No feature may require the server to know a secret.

8. **Automation depth equals authorization depth.** The UI never implies the wallet can act beyond what
   the user cryptographically granted. "Auto" mode is bounded by explicit, user-set caps that fail safe.
   We never suggest autonomy we cannot honor.

9. **Fail closed, in product terms.** When we cannot *positively* verify something — an unknown token, an
   unpriced asset, a malformed address, a route we can't simulate — the product's answer is *refuse and
   explain*, not *guess and proceed.* A confident wrong answer about money is the worst outcome we can
   produce.

10. **Great craft is table stakes, not polish.** Apple-grade design, sub-100ms interaction, reduced-motion
    respect, and light + dark designed with equal care are acceptance criteria. "Ugly but works" does not
    ship.

---

## 3 · The wedge — where we win first

A wallet cannot out-feature MetaMask on day one, and shouldn't try. We win a **specific, painful,
frequent job that no incumbent does well**, earn trust there, and expand.

### 3.1 The wedge job-to-be-done

> **"Move value across ecosystems in one sentence, honestly, without becoming a router."**

The archetype utterances:

- *"Convert my BTC to ETH."*
- *"Send $100 USDC to Rahul."*
- *"Swap 500 USDT for ETH and tell me what it costs first."*

Today, doing the first of these means: pick a bridge, trust it, acquire gas on two chains, wrap, swap,
watch a multi-step flow you don't understand, and pray if a step fails. **That is the pain.** Our wedge is
to collapse the entire ceremony into a sentence → an honest, priced, risk-checked plan → one signature →
a step machine that never strands funds and tells you exactly where your money is if anything goes wrong.

### 3.2 Why this wedge, specifically

- **It's cross-ecosystem — our structural moat.** We are one of very few wallets that hold **Bitcoin *and*
  EVM *and* Solana under one identity.** MetaMask can't touch BTC-native or Solana as first-class; Phantom
  is Solana-first; Rabby is EVM-only. The one-liner that spans ecosystems is a sentence *only we can
  truthfully offer.*
- **It's high-pain and high-frequency enough to form a habit** without requiring the user to be a DeFi
  native.
- **It's the purest expression of the whole thesis:** intent in, verified plan out, device signs. If we
  are the best in the world at the cross-ecosystem one-liner, the rest of the wallet (portfolio, send,
  receive, activity) comes along as the honest supporting cast.

### 3.3 The wedge is *not* the whole product — it's the beachhead

Send/receive, unified portfolio, and activity are **must-haves that make us a real wallet.** The *intent
one-liner* is what makes us **worth switching to.** We build the table stakes to a high bar and pour the
disproportionate craft into the wedge.

---

## 4 · Who it's for (ICP) — and who it is NOT for

### 4.1 Ideal customer profiles (in priority order)

| # | Persona | Profile | The job we win | Why they switch |
| --- | --- | --- | --- | --- |
| 1 | **Riya — the multi-chain retail user** | Already holds assets on 2–4 chains; uses MetaMask + a bridge; hates gas-token juggling | Stop being the router: one-line swaps/bridges, honest fees, no stranded funds | We remove the ceremony she already hates, on chains she already uses |
| 2 | **Naya — the capable newcomer** | First self-custody wallet; mobile-first; non-technical but not naive | Buy/hold/send and move value without learning chains, and *not get scammed* | Calm, honest, risk-loud UX; a wallet that explains itself and refuses to lie |
| 3 | **Dev — the builder** | dApp / fintech engineer | A typed **Intent API + SDK**: natural language → verified plan → execute, with signing kept on the client | Rails and transparency (Stripe-grade), not another RPC wrapper |

Secondary, later-phase ICPs (roadmap, **not** launch): the **policy-driven portfolio holder** ("keep 60%
in stables," audit trail) and the **embedding fintech** (white-label intent infrastructure). We design so
these are reachable *without a rewrite*, but we do not let them distort the wedge.

### 4.2 Who it is explicitly NOT for

Saying no is a product feature. We will disappoint these users on purpose:

- **The MEV/DeFi power-trader** who wants raw mempool control, custom nonces, arbitrary contract calldata,
  and a dozen chains added by RPC URL. Rabby and a Safe serve them better; chasing them would force us to
  expose exactly the instrument-panel complexity we exist to hide.
- **The chain maximalist** who wants a single-ecosystem, protocol-native experience with every governance
  and staking knob. Phantom (Solana) or an L2-native wallet fits better.
- **The custodial/CeFi user** who wants "not my keys, but easy recovery and a support line to reverse
  mistakes." We are non-custodial, absolutely; irreversibility is a property we make *safe and legible*,
  not one we remove.
- **The airdrop/points farmer** optimizing for token incentives. We ship no token at launch and will not
  contort the product into a farm.
- **The "let the bot trade for me" user** expecting an autonomous agent with signing authority. Our AI
  *cannot* dispose of funds by design. Automation is bounded, authorized, and always refusable.

> If a proposed feature primarily serves someone in §4.2, it is out of scope by default. Overriding that
> requires a written decision (an ADR), not a hallway "why not."

---

## 5 · What we build — and what we refuse to build

### 5.1 What we build (the product surface)

- **One universal identity, three receive addresses** — Bitcoin (BIP-84 `bc1q…`), Universal EVM (BIP-44,
  one `0x…` for every EVM chain), Solana (SLIP-0010 base58). Chains merge into one portfolio.
- **The intent surface** — a conversational command bar that turns plain language into a typed, validated
  `Intent`, a proven `ExecutionPlan`, and an execution timeline. This is the flagship.
- **A unified portfolio** — one net-worth number, one asset list, per-chain detail one tap deep,
  integer-math fiat totals, honest staleness and partial-read states.
- **Honest send / receive** across all three ecosystems, with QR, contacts (local names → addresses), and
  a sacred confirm sheet.
- **Deterministic safety rails as user-facing product** — pre-execution risk verdicts (scam/token/address
  screening), human-readable plans, fiat-first fee breakdowns, and slippage/min-received the user
  controls.
- **Activity** — a unified, per-intent timeline with receipts, explorer links, and honest failure states
  (including *where your money is* after a partial failure).
- **A developer platform** — a typed **Intent SDK** and a `/v1` API (`plan → authorize → execute` +
  portfolio + status), with **signing kept client-side.** Intents-as-an-API is a first-class product, not
  an afterthought.
- **Bounded automation** — Manual (default, confirm every tx) and Auto (act within explicit, user-set caps
  that fail safe). Recurring and conditional intents exist as *typed* intent kinds, gated exactly like a
  manual action.

### 5.2 What we refuse to build (anti-features)

These are **not "later" — they are "no,"** unless a written ADR reverses the specific line:

- **Any custody of keys or funds, ever.** No server-side key storage, no "recover my funds" that implies
  we hold them, no MPC scheme where a server share can move money unilaterally.
- **Any path where the AI can sign or execute.** No "just do it for me" that bypasses the deterministic
  gate and the device signature. No prompt, tool, or plugin may request signing capability.
- **Fake data or borrowed demo numbers.** No placeholder balances, no simulated "success," no UI for
  features that don't exist, no network-failure rendered as `$0`.
- **Raw, un-simulated, arbitrary contract execution as a headline feature.** We are not a
  blind-transaction-signer. If we can't simulate and explain it, we refuse it (fail closed).
- **An in-app token, points program, or yield-farm mechanics** at launch. Deferred hard; only ever
  revisited if/when a decentralized solver network genuinely requires it (see Master Spec Phase notes).
- **Dark patterns around money** — hidden fees, defaults that favor us, urgency nags, "are you sure you
  want to stay safe?" confirm-shaming. Fees are transparent; the safe path is the easy path.
- **Chain sprawl as a growth hack.** New chains are added when we can support them *honestly* (balances,
  fees, simulation, risk) — never as a checkbox that ships an un-vetted surface.
- **Re-skinning OS security surfaces.** Biometric prompts, share sheets, and permission dialogs are the
  platform's; we never fake them.

---

## 6 · Positioning — vs MetaMask, Phantom, Rabby, Coinbase Wallet

### 6.1 The one-line positioning

> **For the multi-chain crypto user who is tired of being the router, Intent Wallet is the non-custodial
> wallet you *talk to* — it plans and proves cross-ecosystem moves so a sentence replaces the ceremony,
> and your device always signs. Unlike MetaMask, Phantom, or Rabby, it is AI-native and spans Bitcoin,
> Ethereum, and Solana under one identity — and it can only ever propose, never touch your keys.**

### 6.2 The competitive map

| Wallet | Their strength (real) | Where they leave the user doing the work | Our differentiated wedge |
| --- | --- | --- | --- |
| **MetaMask** | Distribution, dApp ecosystem, EVM ubiquity | Manual bridging/gas/chain-switching; no BTC-native or Solana as first-class; instrument-panel UX | Chain-invisible intent UX; one identity across **BTC + EVM + SOL**; no manual routing |
| **Phantom** | Best-in-class UX, Solana-first, growing multi-chain | Solana-centric; no natural-language intent layer; user still picks the mechanics | True cross-ecosystem **with an AI planner**, not a prettier instrument panel |
| **Rabby** | Pre-transaction simulation, EVM multi-chain, safety-forward | EVM-only; power-user framing; no BTC/SOL; no intent/NL layer | An **AI planning layer on top of** simulation-grade safety, across ecosystems |
| **Coinbase Wallet** | Fiat ramps, brand trust, mainstream reach | Less programmable; no intent SDK; conventional send/swap model | **Self-custody + AI automation + open Intent SDK**; honesty as the brand |
| **AI-native entrants** | Novel conversational UX | Often thin on security rigor; sometimes let the agent act | **Security-first**: deterministic gate, device-only keys, "propose-not-dispose," production rigor |

### 6.3 What we will *not* claim

We will not out-claim reality. We do not say "supports every chain," "fully autonomous," "instant," or
"guaranteed best price." We say what is true and demonstrable, and we let honesty be the differentiator.
Rabby taught the market that *safety is a feature you can market*; we extend that to *honesty is a brand.*

---

## 7 · The definition of a great intent

An **intent** is the atomic unit of this product. Getting its definition right is more important than any
single screen. This section is canonical: when someone asks "is this a good intent?", answer with the
tests below.

### 7.1 What an intent *is*

An intent is **a user's goal, expressed in their own words, parsed into a typed schema, resolved against
real balances and recipients, planned into a proven route, and disposed of only by the user's signature.**
It is not a command we blindly obey; it is a *proposal we verify.*

The typed contract (from `@intent-wallet/intents`) — the model can only ever emit one of these shapes,
because its output is schema-forced:

```ts
// Actionable (fund-moving) — the planner produces an ExecutionPlan:
transfer  | swap | buy | stake | rebalance
// Deferred/automated — same gate, scheduled or conditional:
recurring | emergency_exit
// Non-moving — answered or clarified, never executed:
query | clarify | unsupported
```

Amounts are expressed the way humans speak and resolved deterministically to base units:

```ts
Amount = fiat("$100")        // { kind:'fiat',    currency, value }
       | asset("0.5 ETH")    // { kind:'asset',   symbol, value }
       | all                 // { kind:'all' }
       | fraction(1/2)       // { kind:'fraction', numerator, denominator }
       | percent(2500 bps)   // { kind:'percent',  bps }
```

### 7.2 The anatomy of a *great* intent (the eight tests)

A great intent passes **every** one of these. Reviews check them by number.

1. **Expressible in one honest sentence.** "Send $100 USDC to Rahul" works; the user never learns a chain,
   a bridge name, or a gas token to say it. If the wedge journey needs jargon, the intent design failed.
2. **Parsed to a typed schema, never free-form execution.** The deterministic fast-path handles the common
   shapes in sub-millisecond with exact, testable extraction; the LLM handles the tail behind a
   **schema-forced** boundary. The model cannot produce a shape we don't understand.
3. **Resolved against reality.** Balances, asset locations, and recipient identity are resolved before a
   plan exists. Ambiguity produces a `clarify` — a plain question — not a guess.
4. **Planned into a proven, simulated route.** Every actionable intent becomes an `ExecutionPlan` of typed
   steps (`transfer/swap/bridge/approve/stake`) with dependencies, base-unit integer amounts, and — where
   priced — a fiat value. Un-simulatable ⇒ refused.
5. **Priced honestly, fiat-first.** Total cost shown as a fiat total *and* a percentage before commit
   ("Total cost: $21.30 (1.01%)"), decomposable on tap. Slippage and min-received are the user's to set
   and see. We never round in the user's disfavor.
6. **Risk-verdicted, loud, and fail-closed.** Every plan carries a risk report (`low/medium/high/block`)
   with human reasons. `block` refuses. Risk is icon + label + color, never color alone.
7. **Disposed of only by the device signature, at a sacred confirm sheet.** The plan is presented in the
   one confirm anatomy; the user's on-device signature — not the AI, not the server — is what moves funds.
8. **Executed as a recoverable, auditable state machine.** A multi-step intent that fails midway recovers
   or parks funds safely and tells the user *exactly where their money is.* Every risky decision is logged
   with inputs and reason.

### 7.3 Intent smells (what a *bad* intent looks like)

- It only works if the user already knows which chain their asset is on. *(Violates §7.2.1 — leaks
  infrastructure.)*
- It proceeds on a guess when the asset, amount, or recipient is ambiguous. *(Should be `clarify`.)*
- It shows a plan we could not simulate or price, or hides a fee until after commit. *(Violates §7.2.4–5.)*
- It lets the AI "just execute" without the confirm sheet and signature. *(Fatal — violates §7.2.7 and
  Philosophy §2.3.)*
- It renders a capability that isn't wired (e.g., a "Stake" plan that can't actually broadcast today). See
  §8 for the honest status of each kind.

### 7.4 The intent pipeline (canonical)

```
Natural language ─▶ Parse (deterministic fast-path → schema-forced LLM)
                 ─▶ Resolve (balances · asset locations · recipient identity)
                 ─▶ Plan (route/graph search across swap+bridge)
                 ─▶ Optimize (cost · speed · risk · slippage)
                 ─▶ Quote (end-to-end fiat-first, human-readable)
                 ─▶ Confirm (sacred sheet — the trust boundary)
                 ─▶ [DEVICE SIGNS]
                 ─▶ Execute (resumable step machine, never strands funds)
                 ─▶ Verify (on-chain finality of every step)
                 ─▶ Update (portfolio refresh · activity receipt · notify)
```

---

## 8 · Product reality today (V2) — the honest status

We do not fabricate features or metrics. This is what is *actually true* in the repo today; the roadmap
lives in [`ROADMAP.md`](ROADMAP.md) and the Master Spec. Treat anything not listed here as **not shipped.**

### 8.1 Shipped and real

| Capability | Status | Notes |
| --- | --- | --- |
| Non-custodial device wallet (create / import / unlock) | ✅ Real | scrypt + AES-256-GCM at rest; multi-account HD switching |
| Universal identity (BTC / EVM / SOL) | ✅ Real | BIP-32/44/84 + SLIP-0010, known-answer conformance tested |
| Unified portfolio + live balances | ✅ Real | Integer-math totals; honest partial-read / staleness states |
| Send / receive (all three ecosystems) | ✅ Real | QR per chain; local contacts; sacred confirm sheet |
| Intent parse → plan → authorize → execute | ✅ Real | Deterministic fast-path + real Anthropic schema-forced LLM tail |
| **Real broadcast: transfer & swap** | ✅ Real on **testnets** (Sepolia, Solana devnet, BTC testnet) + **guarded mainnet ETH** | Mainnet is opt-in, explicitly labelled, and spend-capped |
| Risk / policy gate on every action | ✅ Real | Deterministic verdicts; fail-closed |
| Portfolio insights (Intelligence engine) | ✅ Real | Explains verified data only; never invents numbers |
| Intent SDK + `/v1` API (plan/authorize/execute/portfolio/status) | ✅ Real | SIWE auth; signing stays client-side |
| Web (Vite + React + one `styles.css`) & Mobile (Expo) | ✅ Real | Mobile has Simple/Pro/Dev modes + 5-tab shell |
| Bounded automation (Manual default / Auto with caps) | ✅ Real | `autoDecision` fails safe; caps clamp |

### 8.2 Modeled but not fully executable (plan-only or roadmap)

- **`stake` / `rebalance` / `recurring` / `emergency_exit`** exist as **typed, planned** intent kinds and
  pass the gate, but do **not** all have real broadcast paths today. **Do not ship UI that implies a
  finished execution for these** — that violates Philosophy §2.4.
- **Full mainnet across all chains, fiat on/off-ramps, NFT portfolio, MPC/social recovery, hardware
  wallet, ENS/SNS beyond current resolution, a live decentralized solver network, an intent marketplace** —
  roadmap, not shipped. Positioning and copy must not claim them.

> The engines behind many roadmap items (settlement, solver, compliance, plugins, gas abstraction,
> capabilities, reliability, scale) **exist as pure, tested packages.** "The engine exists" is not "the
> product ships it end-to-end." Only §8.1 may be marketed.

---

## 9 · Success metrics & the north star

### 9.1 The north star

> **Real Intents Executed (RIE)** — the count of natural-language intents that resulted in an
> **on-chain-confirmed** state change **signed by the user's own keys.**

RIE is the one number that is impossible to fake without doing the actual thing. A simulated success, a
plan that was never signed, a testnet demo mislabelled as mainnet — none of these count. RIE forces every
team toward the same truth: *did a real person move real value by talking to their money?*

### 9.2 The metric tree (leading indicators feed the north star)

```
                         ★ Real Intents Executed (RIE)
                                     ▲
        ┌───────────────────────────┼───────────────────────────┐
   Intent Success Rate      Plan→Sign Conversion         Retained Intenders
   (executed / attempted)   (signed / plans shown)       (users w/ ≥1 RIE, wk-over-wk)
        ▲                          ▲                             ▲
  Parse Accuracy         Plan Honesty & Clarity          Time-to-First-Intent
  Clarify-not-Guess      Fee/Risk transparency           (onboarding → first RIE)
```

### 9.3 The guardrail metrics (a rise in RIE never justifies these getting worse)

Guardrails have **veto power** over growth. If a change grows RIE but worsens a guardrail, it does not
ship.

| Guardrail | Definition | Direction |
| --- | --- | --- |
| **Funds-stranded rate** | Multi-step intents where funds were left un-recovered and unlocated | → **0** (hard) |
| **Honesty defects** | Any instance of fake/borrowed data, network-fail-as-$0, or UI for a non-existent feature | → **0** (hard) |
| **Key-exposure incidents** | Any path where key/seed material could leave the device | → **0** (absolute) |
| **Mislabel incidents** | Testnet shown as mainnet, capped shown as uncapped, or vice-versa | → **0** (hard) |
| **AI-disposed-funds incidents** | Any execution not gated by device signature | → **0** (absolute) |
| **p95 interaction latency** | Time to first meaningful response on the intent surface | ↓ (< 100 ms for UI feedback) |
| **Accessibility conformance** | WCAG AA across the core journeys, light + dark | ✅ maintained |

### 9.4 Anti-metrics — numbers we deliberately do NOT optimize

We refuse to chase these even though they'd be easy to inflate, because they corrupt the product:

- **Raw DAU / session length** — engagement-for-its-own-sake invites dark patterns; a wallet the user
  trusts and leaves is a success.
- **Transaction volume divorced from user benefit** — churning value to book fees is a fireable strategy.
- **Chains supported / features shipped** as vanity counts — honest depth beats dishonest breadth.
- **AI autonomy rate** ("% of actions taken without confirmation") — this is an anti-goal; authorization
  depth is the user's to grant, never a KPI to grow.

### 9.5 How we set targets (and how we don't)

Targets are set as **written goals with a date**, never asserted as achieved numbers. This document states
no current KPI values, because stating an unearned metric would itself violate Philosophy §2.4. Live values
live in the analytics surface and in [`ROADMAP.md`](ROADMAP.md); this file owns their **definitions and
priority**, so that no team quietly redefines success.

---

## 10 · Decision rules — how product calls get made

When a product decision is contested, resolve it in this order (mirrors the Council in `CLAUDE.md` §2):

1. **The Doctrine + these Philosophy principles.** A proposal that breaks a law loses, full stop.
2. **The wedge and the ICP.** Does it make the cross-ecosystem one-liner better for Riya/Naya/Dev? If it
   primarily serves a §4.2 non-user, it's out by default.
3. **The north star and guardrails.** Does it grow *Real Intents Executed* without harming a guardrail?
4. **The simpler thing.** Between two options that pass the above, ship the one a stranger understands with
   their eyes half-closed.

The **Principal Security Engineer holds a hard veto** on anything touching keys, funds, or user data; only
the CEO overrules, and only in writing (an ADR). Product scope changes that contradict this file are
resolved by *changing this file on purpose*, with the change recorded — never by drift.

---

## 11 · Related canon (route here before you build)

| If your work touches… | Read |
| --- | --- |
| The Doctrine, Council, Build Loop | [`CLAUDE.md`](CLAUDE.md) |
| Roadmap, phases, what's next | [`ROADMAP.md`](ROADMAP.md), Master Spec §6 module cards |
| Architecture, packages, ADRs | [`ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/architecture/`](docs/architecture/), [`docs/adr/`](docs/adr/) |
| Design, screens, components | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), [`UX_GUIDELINES.md`](UX_GUIDELINES.md), [`docs/design/`](docs/design/) |
| Keys, signing, funds, auth | [`SECURITY.md`](SECURITY.md), [`docs/security/`](docs/security/) — **pull in the Security Engineer** |
| The intent pipeline / AI | [`AI.md`](AI.md), `@intent-wallet/intents`, Master Spec Phase 3 & 5 |
| The API / SDK | [`API.md`](API.md), `@intent-wallet/sdk` |
| Original PRD detail | [`requirements.md`](requirements.md) |

---

*This is the product constitution. Ship world-class or don't ship. Refuse to fake, refuse to leak a key,
refuse to let the AI touch the money, refuse to ship a lie.*
