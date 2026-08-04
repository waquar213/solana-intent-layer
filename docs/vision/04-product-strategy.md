# Chapter 4 — Product Strategy

*How a wallet that cannot out-feature MetaMask on day one wins anyway: pick the one sentence only we can say, earn trust with it, and expand along a sequence that never asks the user to trust us before we've proven we're trustworthy.*

**Chapter abstract.** Vision tells you where you're going; strategy tells you the order in which you're allowed to get there. This chapter fixes the order. It names the **wedge** — the cross-ecosystem one-liner ("convert my BTC to ETH") that no single-ecosystem wallet can say gracefully, and that is ours to own because we hold Bitcoin *and* Ethereum + L2s *and* Solana under one universal identity. It traces the **expansion path** from that wedge to a daily driver to an intent platform others build on, insisting each step is *earned*, not *scheduled*. It argues that our **anti-feature list is strategy, not caution** — the things we refuse (custody, AI signing, fake data, a token, dark patterns) are precisely what let a stranger trust us with real money. It explains the **platform play** — the Intent SDK that turns the wallet into rails, the Stripe move. And it grounds all of it in the one ordering rule that governs a wallet and nothing else quite like it: **you build trust from the bottom up, because for a wallet the first drained user is an extinction event.** Where a capability is real today, this chapter says so; where it is roadmap, it says that too, in the same breath.

---

## 4.1 · Strategy is a sequence, not a feature list

Every wallet team eventually writes the same document: a grid of features, each with a checkbox, sorted by a vague sense of importance. That document is worse than useless, because it encodes the belief that a wallet wins by accumulating capabilities. It does not. MetaMask has more features than we will have at launch, and more than we will have a year after launch, and we are still going to take its users. The reason has nothing to do with the count of features and everything to do with the *order* in which capability, trust, and reach get built — and with the discipline to refuse most of the grid.

Product strategy, for us, is the answer to four ordered questions — and the order is the strategy:

1. **What is the one job we do better than anyone on earth on day one?** (The wedge.)
2. **What does that earn us the right to build next, and in what order?** (The expansion path.)
3. **What must we refuse to build so that the wedge stays sharp and trust stays intact?** (The anti-scope.)
4. **What is the load-bearing sequence beneath all of it, such that we never ship a feature that leans on an unbuilt or unaudited layer?** (Bottom-up for trust.)

The rest of this chapter answers those four in that order. None of them is "add more." Three of the four are decisions about what *not* to do and *when not* to do it. That is not timidity: in a category where a single drained user is an extinction event (`ROADMAP.md` §1.7), restraint *is* the aggressive move.

---

## 4.2 · The wedge — the one sentence only we can say

A wedge is not a feature; it is a **specific, painful, frequent job** that an incumbent does badly and that opens a door the incumbent cannot close. Ours is stated in `PRODUCT.md` §3 as a job-to-be-done, and it is worth restating here as the load-bearing claim of the entire company:

> **Move value across ecosystems in one sentence, honestly, without becoming a router.**

The archetype utterance — the one we will put on the landing page, the one every part of the product must serve first — is: **"Convert my BTC to ETH."** Say it out loud and notice how ordinary it sounds. Then notice that no wallet on the market can honor it as one sentence.

### 4.2.1 Why this sentence, and why it's ours

Consider what "convert my BTC to ETH" actually demands of a user today, in MetaMask or Phantom or Rabby. You do not have Bitcoin in an EVM wallet, so first you must *know* that. You choose a bridge — and now you are trusting a bridge, a category that has lost users billions. You acquire a gas token on the source chain and a different gas token on the destination chain. You wrap, you approve, you swap, you watch a multi-step flow you don't understand, and if a step fails midway you are alone with a half-finished transaction and no idea where your money is. **That entire ceremony is the pain.** The user did not want to learn bridges and gas tokens and wrapping. The user wanted BTC to become ETH.

Our wedge is to collapse that ceremony into: one sentence in → an honest, priced, risk-checked **ExecutionPlan** out → one on-device signature → a resumable step machine that never strands funds and can tell you exactly where your money is if any step fails. The plan is a real, typed artifact in the codebase — `ExecutionPlanSchema` in `@intent-wallet/intents` carries typed steps (`transfer / swap / bridge / approve / stake`) with dependencies, base-unit integer amounts, a fiat-first quote, and a risk verdict — not a marketing mock.

This sentence is ours specifically, and structurally, for one reason: **we are one of very few wallets that hold Bitcoin *and* EVM *and* Solana under a single universal identity.** That is not a slogan; it is three derivation paths off one seed, conformance-tested against the official vectors (BIP-84 `m/84'/{0,1}'/0'/0/i` for Bitcoin, BIP-44 `m/44'/60'/0'/0/i` for the universal EVM address, SLIP-0010 `m/44'/501'/i'/0'` for Solana; see `SECURITY.md` §3.1). The structural reach is the moat. MetaMask cannot treat BTC-native or Solana as first-class. Phantom is Solana-first. Rabby is EVM-only. The cross-ecosystem one-liner is a sentence **only we can truthfully offer** — and "truthfully" is doing real work in that sentence, because our third competitor here is not a wallet at all but the temptation to fake the demo.

### 4.2.2 The wedge is a beachhead, not the whole product

A wedge that is also the whole product is a toy. Send, receive, a unified portfolio, and an activity feed are **table stakes that make us a real wallet** (`PRODUCT.md` §3.3) — they are shipped and real today across all three ecosystems. But table stakes do not make anyone switch; every wallet has them. The *intent one-liner* is what makes us **worth switching to.** So the strategy is asymmetric on purpose: build the table stakes to a high, honest bar, and pour the disproportionate craft — the sub-100ms feel, the sacred confirm sheet, the recoverable step machine — into the wedge. We are not trying to be a slightly better instrument panel. We are trying to be the only wallet where a specific, common, terrifying task becomes a sentence.

### 4.2.3 An honest boundary on the wedge, today

Doctrine law #3 forbids us from letting this section drift into fiction, so: **the full "convert my BTC to ETH" cross-chain path is not a finished, uncapped mainnet product today.** What is genuinely real, right now — device-signed and broadcast — is `transfer` and `swap` on **testnets** (Sepolia, Solana devnet, Bitcoin testnet) and a **guarded, capped, explicitly-labelled mainnet ETH** path (`PRODUCT.md` §8.1, `ROADMAP.md` §2). Full mainnet across chains, and BTC↔ETH as a signed real-funds route, land in **V3.1** behind a graduated-cap policy and a re-audit of the swap-settlement surface. The wedge, in other words, is *architecturally* proven and *narratively* honest: the pipeline exists end-to-end, the sentence parses to a typed plan, and the gate is real — but "the engine exists" is not "the product ships it uncapped," and we will say which is which every single time.

---

## 4.3 · The expansion path — wedge → daily driver → platform

A wedge earns you a *right to expand*, and the shape of the expansion is itself a strategic choice. Ours moves through three stages, and the sequence is deliberate: each stage is only permitted once the one beneath it has earned trust.

| Stage | What we are to the user | What unlocks it | Status today |
|---|---|---|---|
| **1 · The wedge** | "The wallet that can do the cross-ecosystem move I dread, in one sentence." | Structural BTC+EVM+SOL reach + the intent pipeline + the sacred confirm sheet. | Architecture real; testnet + guarded-mainnet-ETH real; full cross-chain mainnet → V3.1 |
| **2 · The daily driver** | "The wallet I keep everything in and open every day." | Honest unified portfolio, send/receive, activity, insights that never invent a number, bounded automation. | Substantially real today (portfolio, send/receive, activity, insights, Manual/Auto) |
| **3 · The intent platform** | "The rails other apps build their money-movement on." | A typed Intent SDK + `/v1` API where planning is a service and **signing stays on the client.** | SDK + `/v1` real; marketplace/webhooks/white-label → V3.4 |

### 4.3.1 From wedge to daily driver

The move from stage 1 to stage 2 is a trust move, not a feature move. A user who has watched us plan a cross-ecosystem swap honestly — show the fiat-first total *before* commit ("Total cost: $21.30 (1.01%)"), refuse loudly when a route can't be simulated, and never render a network failure as `$0` — has learned something that no send/receive screen could teach them: **that we don't lie.** That earned trust is what promotes us from "the wallet I use for the scary cross-chain thing" to "the wallet I keep everything in." The daily-driver surface is already largely real: a single net-worth number with integer-math fiat totals and honest partial-read and staleness states; a unified activity timeline with per-intent receipts and honest failure states; a portfolio-insights narrator that explains only verified data and invents nothing (`PRODUCT.md` §8.1). We do not win the daily driver by out-featuring Phantom's polish or Coinbase Wallet's ramps. We win it by being the wallet the user has *decided to trust*, and then being worthy of that decision on every ordinary screen.

### 4.3.2 From daily driver to platform

The move from stage 2 to stage 3 is the Stripe move, and it is covered on its own in §4.5. The point for the sequence is that it comes *last*, and cannot come first. A developer platform is a promise that other people can build on your rails without getting hurt — and you have no business making that promise until your own rails have carried real value, under audit, without loss. An intent platform shipped before the wedge is trusted is a liability multiplier: you have handed your unproven safety guarantees to a hundred other apps. So the platform waits behind V3.4, gated on the same evidence the wallet itself had to produce.

**The path is not a roadmap of dates; it is a chain of earned rights.** Each stage is unlocked by the trust the previous stage demonstrably produced, measured by the one number that cannot be faked — Real Intents Executed, an on-chain-confirmed state change signed by the user's own keys (`PRODUCT.md` §9.1). We do not advance because a quarter ended. We advance because the layer beneath is real.

---

## 4.4 · Build-versus-refuse — the anti-feature list *is* the strategy

Most product strategy documents are lists of what to build. Ours devotes as much conviction to what we **refuse** to build, because in this category the refusals are the differentiator. `PRODUCT.md` §5.2 and `ROADMAP.md` §7.2 hold the canonical anti-scope; the strategic argument for treating it as offense rather than defense belongs here.

A wallet's brand is its trust, and trust is destroyed by a single well-chosen feature far faster than it is built by a hundred good ones. So the anti-feature list is not a list of things we haven't gotten to. It is a list of things we have *decided against*, each reversible only by a written ADR that names the specific line — never by a hallway "why not."

| We refuse to build… | Because building it would… | So the strategic gain is… |
|---|---|---|
| **Any custody of keys or funds** | make a server breach a fund-loss event, not a privacy event | the highest-blast-radius asset never leaves the device (`SECURITY.md` §2.3) — a server breach can never drain a user |
| **Any path where the AI can sign or execute** | turn a prompt injection (a *when*, not an *if*) into stolen funds | a fully-hijacked model can, at worst, emit a *rejectable proposal* (`SECURITY.md` §4) |
| **Fake or borrowed data** — placeholder balances, simulated "success," network-fail-as-$0, UI for features that don't exist | forfeit the one thing we're selling in a single lie | honesty becomes the brand a market taught by rug-pulls is starving for |
| **An in-app token / points / yield-farm** | attract mercenary farmers and distort every metric toward extraction | our north star stays *real* intents by real users, not inflated volume |
| **Dark patterns around money** — hidden fees, self-favoring defaults, confirm-shaming | make the safe path the hard path | the safe path is the easy path, which is the whole promise |
| **Blind, un-simulated arbitrary contract execution as a headline** | make us a blind-signer, the exact thing draining users today | fail-closed refusal becomes a visible safety feature (the Rabby lesson, extended) |
| **Chain sprawl as a growth hack** | ship un-vetted surfaces (no honest balances/fees/simulation/risk) as a vanity count | every supported chain is *honestly* supported or absent |

Read that table as a positioning statement, because that is what it is. Rabby taught the market that **safety is a feature you can market**; we extend that lesson to its conclusion — **honesty is a brand.** When the competitive set includes AI-native entrants that will happily let an agent hold signing authority to demo well, our refusal to do so is not a limitation we apologize for. It is the reason a security-conscious user picks us, and it is a refusal encoded in the architecture, not the marketing: the model in `@intent-wallet/intents` can only emit schema-forced `IntentSchema` JSON — there is no tool in its vocabulary that moves funds. The anti-feature list is enforced in code, which is the only place a principle is real.

There is a second, subtler strategic payoff. Every refusal is a **focusing constraint.** By declining the MEV power-trader, the chain maximalist, the custodial-recovery user, and the "let the bot trade for me" user (`PRODUCT.md` §4.2), we free ourselves to make the cross-ecosystem one-liner extraordinary for Riya, Naya, and Dev instead of adequate for everyone. Saying no to the wrong user is how you say a deeper yes to the right one.

---

## 4.5 · The platform play — the SDK turns a wallet into rails

The largest version of this company is not a wallet. It is the **intent layer other applications build on** — the Stripe of on-chain value movement. Stripe did not win by having the best merchant dashboard; it won by turning "accept a payment" into seven lines of code and keeping the terrifying parts (PCI, fraud, settlement) on its side of a clean API. Our equivalent move is to turn "move value across ecosystems, safely" into a typed API call and keep the terrifying part — the deterministic safety gate — on our side, while keeping the one part that must never be ours (the signature) on the client's.

### 4.5.1 What the platform actually is, today

This is not aspiration; the first, real version exists. There is a typed **Intent SDK** (`@intent-wallet/sdk`) and a `/v1` API exposing `plan → authorize → execute`, plus portfolio and status, authenticated with SIWE — the same signature the wallet already produces, so there is no new server-side secret. The web app itself is a dogfood client of that SDK. The load-bearing architectural decision is stated plainly in `PRODUCT.md` §5.1 and `ROADMAP.md` §2: **signing stays client-side.** The server issues plans (a client cannot forge one) and re-runs risk and policy server-side at `/execute`, but the server *cannot sign.* This is what makes the platform play compatible with the Doctrine: we can hand developers the planning and safety rails without ever handing them, or ourselves, the ability to dispose of a user's funds.

### 4.5.2 What is real versus roadmap, said honestly

The SDK and `/v1` API are real; the **platform business around them is not shipped.** A signed plugin marketplace, webhooks, white-label, enterprise keys, and a full developer-platform experience are **V3.4**, gated on a test-proven guarantee that no plugin can request signing capability or exceed its granted scope (`ROADMAP.md` §4.3, §7.1). We state this because a platform is a promise of stability to people who will build livelihoods on it, and one that oversells its maturity betrays exactly the developers it's courting. Stripe-grade rails demand Stripe-grade versioning discipline — SemVer on every public contract, deprecation windows of at least 90 days, no silent breaking changes — and we commit to it *before* the marketplace exists, so that when it exists it is trustworthy.

The strategic shape, then, is: **the wallet proves the rails carry real value safely; the SDK exposes those proven rails; the platform is the compounding business built on top — and it is sequenced last because it inherits, and therefore must wait for, every trust guarantee beneath it.**

---

## 4.6 · Bottom-up for trust — the sequencing law that governs everything

There is one ordering principle above all the others in this chapter, and it is the one that makes a wallet's strategy different from any other software product's: **you build a wallet from the bottom up, because the cost of a single failure is total and irreversible.** A social app that ships a broken feature loses a session. A wallet that ships a broken signing path loses a user's life savings, forever, and with it the trust of every prospective user who reads about it. **The first drained user is an extinction event** (`ROADMAP.md` §1.7). That asymmetry dictates the sequence.

The rule, stated as `ROADMAP.md` §1 states it: **bottom-up for trust; top-down for meaning.** Meaning flows down — Product sets the *why*, and every layer serves the vision above it. But *trust is built ground-up*: the Wallet Foundation (keys, identity, portfolio), the Infrastructure it runs on, and the Security gate that stands between a plan and the wire must be **real** before anything that touches real funds is allowed to lean on them. A feature above real money may not ship on an unaudited layer beneath it. That is not a preference; it is a release gate with veto power.

Three consequences follow, and each is a strategic commitment:

- **The audit is the pacing item.** No uncapped, real-fund public launch happens until an independent firm reviews key management, signing, and the encrypted backup, and **every high and critical finding is fixed and re-tested** (`ROADMAP.md` §3, `SECURITY.md` §10). Everything else — the wedge's mainnet expansion, the daily-driver polish, the platform GA — schedules *around* that gate. We would rather move the date than move the gate. Stating a launch narrative that assumes an optimistic audit-pass date would itself be a form of the dishonesty we've outlawed.

- **Narrow, then wide.** We launch the smallest honest surface — a frozen launch chain-set, conservative caps (the guard's mainnet spend cap sits at **$1,000** today; auto-execution, off by default, binds a **$25** per-transaction and **$100** daily cap and fails safe) — and we widen only on stability evidence, tier by tier (`SECURITY.md` §5, `ROADMAP.md` §4.3). Each cap increase is unlocked by clean Real Intents Executed at the prior tier with zero loss-of-funds, and each carries a written kill criterion: sustained loss or an honesty defect at a tier freezes caps and rolls back. Breadth is a reward for proven safety, never a growth tactic.

- **The guardrails have veto over the schedule.** A milestone that grows the north star but regresses a guardrail — loss-of-funds, honesty defects, key-exposure, mislabelling, AI-disposed funds — **does not ship** (`PRODUCT.md` §9.3, `ROADMAP.md` §1.6). The date moves; the guardrail does not. This is what "bottom-up for trust" means when a deadline is pressing against it: the pressure loses.

This is why the expansion path in §4.3 is a chain of *earned rights* and not a Gantt chart. Stage 2 leans on Stage 1's proven honesty. Stage 3 leans on Stage 2's proven daily-driver safety. And the whole tower leans on a Wallet Foundation and a Security gate that were built, tested, and audited *first*. Sequencing bottom-up is not the boring infrastructure part of the strategy that precedes the exciting product part. **It is the product strategy** — because for a wallet, trust is the product, and trust is the one thing you cannot ship out of order.

---

## What this chapter commits us to

- **The wedge is the cross-ecosystem one-liner.** "Convert my BTC to ETH," said in one honest sentence, is the job we own — structurally, because we hold BTC + EVM + SOL under one universal identity — and it gets the disproportionate craft. We never dilute it to chase a broader but shallower "everything wallet."
- **We expand by earned right, not by schedule.** Wedge → daily driver → intent platform, each stage unlocked only by the trust (measured in Real Intents Executed) that the prior stage demonstrably produced. No stage ships on a layer beneath it that isn't real.
- **The anti-feature list is a strategic asset, reversible only by ADR.** No custody, no AI signing authority, no fake data, no token or points at launch, no dark patterns, no blind arbitrary-contract execution, no chain sprawl for vanity. Each refusal sharpens the wedge and compounds trust, and each is enforced in code, not just copy.
- **The platform keeps signing on the client, forever.** The Intent SDK and `/v1` API expose proven planning-and-safety rails; the server issues and re-checks plans but *cannot sign*. The platform business is sequenced last and gated (V3.4) so it inherits every trust guarantee beneath it — and it commits to Stripe-grade SemVer discipline *before* the marketplace exists.
- **We build bottom-up for trust, top-down for meaning.** The audit is the pacing item; we launch narrow-then-wide behind explicit, capped, labelled guardrails; and the guardrails hold veto over the schedule. For a wallet, the first drained user is an extinction event, so restraint is the aggressive move.
- **We market only what we ship.** Testnet is labelled testnet, capped mainnet is labelled capped, "the engine exists" is never dressed up as "the product ships it." The wedge's full cross-chain mainnet route is honestly roadmap (V3.1) even as its architecture is real today.

**Bridge to Chapter 5.** Strategy fixes the *order* of what we build and refuse; the next chapter, **The Moat**, asks the harder question underneath it — once we've won the wedge and the sequence, what makes the position *defensible*? Why can't a better-capitalized incumbent simply copy the one sentence — and what compounds, structurally, so that our lead widens rather than erodes?
