# Chapter 6 — Competitive Analysis

*A clear-eyed map of the field — what the best wallets do brilliantly, where they leave the user doing the work, and what we deliberately learn versus deliberately refuse.*

**Chapter abstract.** A company that cannot describe its competitors' strengths without flinching does not understand its own. This chapter refuses the founder's favourite lie — the strawman — and studies the field the way we would study a rival we respect: MetaMask, the incumbent default of the EVM world; Phantom, the craft leader that made a wallet feel like an Apple product; Rabby, the safety-forward power tool that taught the market that *safety is marketable*; Coinbase Wallet, the on-ramp with a brand the mainstream already trusts; and the emerging class of AI-native entrants who share our thesis but too often break our Doctrine to ship it. For each, we name what we steal without shame, and what we will not copy even under pressure. Then we place ourselves on the map honestly: where we win by construction (one identity across Bitcoin *and* EVM *and* Solana, an AI that can only ever propose, honesty made into a brand), and — with equal candour — where we lose today (maturity, integrations, an audit we have not yet had). The chapter ends with the durable decisions this analysis locks in.

---

## 6.1 · How to read a competitor without lying about them

The first rule of this chapter is the hardest one to keep: **no strawmen.** It is tempting, when you are pre-launch and outnumbered, to caricature the incumbents — to describe MetaMask as a relic, Phantom as a pretty toy, Rabby as a nerd's terminal — and then declare victory over the caricature. That is a form of the exact sin our Doctrine forbids elsewhere: fabricating a reality that flatters us. A competitor you have misdescribed cannot teach you anything, and the market will not be fooled by a comparison the user knows is dishonest. So we hold competitive analysis to the same bar as a balance screen: *say what is true, including the parts that are inconvenient.*

The second rule is that we judge every wallet on the axes **we** claim matter, and we state those axes up front so the comparison is falsifiable rather than rhetorical:

1. **Reach** — how many ecosystems does one identity actually span, first-class (native balances, fees, simulation, risk), not via a third-party bolt-on?
2. **Interface** — is the primary surface an *instrument panel* (chains, gas, bridges, nonces, slippage exposed) or a *sentence* (intent in, verified plan out)?
3. **Honesty** — does the product ever show the user something that did not happen: a network failure as `$0`, a testnet transaction dressed as mainnet, UI for a capability that is not wired?
4. **Trust architecture** — where do the keys live, and can any non-device actor — a server, an AI, a plugin — move funds?
5. **Craft** — is it Apple-grade in feel, accessible to WCAG AA, calm under failure?
6. **Platform** — can a developer build on it as rails, the way they build on Stripe?

No wallet on the market today is best on all six, including us. The honest exercise is to see who is best on which, and to be specific about the trade each of them made to get there. What follows is that exercise.

---

## 6.2 · The incumbents, up close

### MetaMask — the default that owns distribution

It is impossible to overstate what MetaMask got right, and the first thing a serious analysis does is admit it. MetaMask made self-custody *ordinary.* It shipped the browser-extension + seed-phrase model that an entire generation of dApps assumed into existence; the "Connect Wallet" button on nearly every EVM application is, in practice, a MetaMask-shaped button. Its distribution is a moat that no amount of superior design erases quickly. Its ecosystem gravity — the sheer number of applications, tutorials, and integrations that assume its presence — is the single hardest thing on this page for us to compete with, and pretending otherwise would be exactly the dishonesty this chapter exists to avoid. MetaMask Snaps is a genuine act of foresight: an extension model that *can* reach beyond EVM, including community Snaps for Bitcoin and Solana, which means the "EVM-only" critique must be stated carefully rather than lazily.

Where it leaves the user doing the work is precisely the space we exist to occupy. MetaMask is the archetypal **instrument panel.** It asks the human to be the router: pick the chain, hold the gas token for that chain, find and trust a bridge, approve a spend, watch a multi-step flow you were never taught to read, and recover by yourself if a step strands your funds. Bitcoin-native and Solana are not first-class citizens of that identity — they arrive, when they arrive, as third-party Snaps rather than as one seed that natively speaks `bc1q…`, `0x…`, and base58 under a single portfolio. And there is no natural-language layer: the mental model is transactions, not intents.

**What we learn:** distribution and developer gravity are won by being the thing others build *on*, not merely the thing users install — which is why our Intent SDK and `/v1` API are a first-class product, not an afterthought (see the platform ICP, *Dev the builder*, in `PRODUCT.md` §4). **What we refuse:** the instrument panel as the required path, and "add a chain by pasting an RPC URL" as a growth tactic — chain sprawl without honest support (balances, fees, simulation, risk) is a checkbox that ships an un-vetted surface, and our Doctrine forbids it.

### Phantom — the craft leader

Phantom is the wallet that proved product craft is a competitive weapon in crypto, not a cosmetic afterthought. It made self-custody on Solana feel *calm* — fast, legible, tastefully animated, pleasant to hold — and in doing so it won a user who had been told that crypto UX was supposed to hurt. It has since expanded beyond Solana to Ethereum and Bitcoin, so the lazy "Solana-only" line is out of date and we will not use it. Phantom is, on the axis of **craft**, the bar we measure ourselves against; when we say "Apple Wallet" in our north-star framing, the living proof that a crypto wallet can approach that standard is Phantom.

Its limits are limits of *thesis*, not of quality. Phantom remains Solana-centric in its gravity and its identity, and — most importantly for us — it is still an instrument panel, however beautiful. The user chooses the mechanics; there is no natural-language planner that turns *"convert my BTC to ETH"* into a proven, priced, risk-checked route the user simply approves. A prettier panel is still a panel. Phantom optimised the *surface* of the existing model to a world-class finish; our bet is on changing the *model* — intent as the interface — and then holding it to Phantom's craft standard so we are not merely different but also delightful.

**What we learn:** craft is table stakes, not polish; calm-under-failure and taste are acceptance criteria, and "ugly but works" does not ship. **What we refuse:** letting craft become the whole product. Beauty layered over the router-you're-forced-to-be is a nicer cage. We hold both — the new model *and* the finish.

### Rabby — the safety-forward power tool

Rabby (from the DeBank team) is the competitor we respect most on the axis we care about most after honesty: **it made safety legible.** Its pre-transaction simulation — showing the user the expected balance changes *before* they sign, flagging risky approvals, catching the transaction that would drain rather than transfer — taught the whole market a lesson we have taken to heart: *safety is a feature you can market, and users will switch for it.* Rabby also handles EVM multi-chain switching more gracefully than the incumbent, quietly removing friction the power user feels every day.

Its constraints are deliberate and honest: Rabby is EVM-only, and it is framed for the power user — the person who *wants* to see the mechanics, who is comfortable with the instrument panel and simply wants it safer and less tedious. There is no Bitcoin-native or Solana identity, and no natural-language intent layer; the unit of interaction is still the transaction. That framing serves the MEV-adjacent, DeFi-native user we explicitly do *not* target (`PRODUCT.md` §4.2) extremely well — and would pull us toward exposing exactly the complexity we exist to hide if we chased it.

**What we learn:** simulate-before-sign and *loud, legible risk* are not optional. Our deterministic safety rails — pre-execution risk verdicts, settlement-safe sequencing, fail-closed refusal — are the philosophical descendants of Rabby's insight, elevated from "a safer panel" to "a verifier the user talks to." Rabby proved safety sells; we extend it to *honesty is a brand.* **What we refuse:** the power-user framing as our centre of gravity. We build the safety of a power tool with the calm of a consumer product, for Riya and Naya, not only for the DeFi native.

### Coinbase Wallet — the on-ramp with a trusted brand

Coinbase Wallet's strengths are the ones a startup underrates at its peril: **brand trust and the fiat on-ramp.** For the mainstream user who has heard of exactly one crypto company, Coinbase is that company, and a self-custody wallet that inherits even a fraction of that trust starts a conversation most wallets never get to have. It smooths the single hardest moment in a newcomer's journey — turning dollars into on-chain assets — better than almost anyone, and its move toward passkey-based smart-account models points at a genuinely better recovery future than raw seed phrases.

Its limits are the price of that mainstream posture. Coinbase Wallet is comparatively less programmable — there is no intent SDK, no natural-language planner; the model is conventional send/swap. And the brand's proximity to a large custodial exchange means the *feeling*, for many users, is CeFi-adjacent even when the wallet itself is self-custody — a blurring we consider a liability precisely because our entire promise is that custody is unambiguously the user's, always, with a door that is always unlocked.

**What we learn:** the fiat on-ramp and trustworthy recovery are real jobs, not luxuries — which is why ramps are on the honest roadmap (V3.x) and Passkey + MPC recovery is a deliberately-sequenced V3.2 item, *gated on an audit that no server share can move funds unilaterally.* **What we refuse:** any drift toward custody, and any recovery scheme that quietly makes a server able to move money. Non-custodial, absolutely, is not a feature we trade for convenience.

---

## 6.3 · The AI-native entrants — our nearest neighbours, our sharpest warning

The most important competitors are not the four above; they are the wallets being born right now around the same sentence we built the company on — *talk to your money.* This is the class we watch most closely, because they share our thesis, and because the way most of them execute it is precisely the thing our Doctrine was written to forbid.

What they get right is real and we will not sneer at it: they have seen that the command bar, not the form, is the future of the interface; that a non-technical person will say what they want long before they will learn a chain; and that conversational UX is a genuine unlock, not a gimmick. On the axis of **ambition**, they are our true peers.

Where they are weak — and where the category as a whole has not yet earned trust — is trust architecture. In the rush to make the agent feel powerful, a recurring pattern appears: the AI is given a hand on the money. Sometimes that means server-side signing (the keys, or a decisive key share, live where the model runs). Sometimes it means an "autonomous agent" that executes trades within a mandate but without a per-action, on-device human signature. Sometimes it is simply thin security rigor — a chat wrapper over an existing wallet with no deterministic gate between what the model *said* and what got *signed.* Each of these buys a flashier demo at the cost of the one property that makes a wallet fundable: the user, and only the user, disposes of the funds.

This is exactly the line our architecture draws in code, not in marketing copy. The AI in Intent Wallet has **zero signing authority** by construction. Its output is *schema-forced* — the model can only ever emit one of a fixed set of typed `Intent` shapes (`transfer | swap | buy | stake | rebalance | recurring | emergency_exit | query | clarify | unsupported`), never free-form execution, and the deterministic fast-path handles the common cases before the model is ever consulted. Between any plan and the wire sits a pure, exhaustively-tested gate — `assertBroadcastAllowed` in `apps/web/src/broadcast.ts` is a literal, readable instance of it — that can only *refuse.* And the actual mover of funds is the user's key, signing in the browser or on the device: `signEvmTransaction`, `signSolanaMessage`, `signBitcoinPsbt`. The model proposes; deterministic code verifies; the device signature disposes. An AI-native entrant that cannot say the same sentence about its own code is not a lighter version of us — it is a different, more dangerous product wearing similar words.

**What we learn:** the conversational surface is the right bet, and we must be *better* at it than the entrants who are unburdened by our safety discipline — the intent one-liner has to feel effortless despite everything happening behind the gate. **What we refuse, permanently:** any path where the AI, a server, or a plugin can sign or execute. No prompt, tool, or plugin may even *request* signing capability. This is anti-scope, reversible only by a written ADR that names the specific line — and it will not be reversed.

---

## 6.4 · The positioning map — where we sit, stated plainly

The competitive map from the product constitution (`PRODUCT.md` §6.2) is the canonical summary; this chapter deepens it rather than restates it. Read across the axes we declared in §6.1:

| Wallet | Reach (first-class) | Interface | Trust architecture | Their real strength | What they leave to the user |
|---|---|---|---|---|---|
| **MetaMask** | EVM; BTC/SOL only via third-party Snaps | Instrument panel | Non-custodial, device keys | Distribution + dApp gravity | Being the router: chains, gas, bridges, recovery |
| **Phantom** | Solana-first, expanding to EVM + BTC | Instrument panel (world-class craft) | Non-custodial, device keys | Best-in-class UX / craft | Picking the mechanics; no intent planner |
| **Rabby** | EVM multi-chain | Instrument panel + pre-sign simulation | Non-custodial, device keys | Legible safety, simulate-before-sign | EVM-only; power-user framing; no NL layer |
| **Coinbase Wallet** | EVM + a few chains | Conventional send/swap | Self-custody (CeFi-adjacent feel) | Brand trust + fiat on-ramp | Less programmable; no intent SDK |
| **AI-native entrants** | Varies, often single-ecosystem | Conversational (our shared bet) | *Often* server/agent signing — the flaw | Ambition, chat UX | Frequently: the safety and the non-custody |
| **Intent Wallet V3** | **BTC + EVM + SOL, one identity, first-class** | **Intent (sentence in, verified plan out)** | **Non-custodial; AI can only propose** | **Cross-ecosystem intent + honesty + craft** | *Our job, not the user's:* routing, gas, bridging |

Three of these rows describe our structural edge, and they are worth naming as the durable *why-we-win*, not as slogans:

**Reach no single competitor has.** We are one of very few wallets that hold Bitcoin *and* EVM *and* Solana under a single universal identity — one seed deriving `bc1q…` (BIP-84), one `0x…` for every EVM chain (BIP-44), and a base58 Solana address (SLIP-0010), merged into one portfolio with integer-`bigint` totals. The cross-ecosystem one-liner — *"convert my BTC to ETH"* — is a sentence only we can truthfully offer, because MetaMask cannot make BTC-native or Solana first-class, Phantom is Solana-gravity, and Rabby is EVM-only. This is not a feature race we might lose next quarter; it is an architectural stance taken at the seed-derivation layer.

**An interface no incumbent has committed to.** Every wallet above, at its core, hands the user an instrument panel. We are the only one whose primary surface is a sentence resolved into a proven plan. The entrants who share this bet mostly break the trust architecture to ship it. We hold both.

**Honesty as the brand.** Rabby taught the market that safety is marketable; we take the next step and make *honesty* the differentiator — network-fail is never `$0`, testnet is labelled testnet, capped mainnet is labelled capped, and we never render UI for a capability that is not wired. In a category whose reputation is scars and rug-pulls, the wallet that visibly refuses to lie is making the most durable brand bet available.

---

## 6.5 · Where we lose today — the honest ledger and the plan to close it

An analysis that only found reasons we win would be marketing, not strategy — and it would violate the very Doctrine we just claimed as our edge. So here is the other side of the ledger, stated as plainly as the wins.

**Maturity.** We are pre-launch, by design and by fact. Today, `transfer` and `swap` are the genuinely real-broadcast intents — on testnets (Sepolia, Solana devnet, Bitcoin testnet) and a guarded, opt-in, spend-capped mainnet ETH path. `stake`, `rebalance`, `recurring`, and `emergency_exit` exist as *typed, planned* intent kinds that pass the gate but do not all have real broadcast paths — the engine exists, which is emphatically *not* the same as the product shipping it end-to-end. MetaMask, Phantom, Rabby, and Coinbase Wallet all execute real mainnet transactions across their supported surfaces today, at scale, with years of production hardening we do not yet have. We do not get to wave this away; we get to be honest about it and close it in order.

**Integrations.** MetaMask's dApp ecosystem, Coinbase's fiat ramps, and the live DEX-aggregator routing the incumbents lean on are real gaps. Our route-optimizer and provider frameworks exist as pure, tested packages, but live vendor routes are not wired; today our real swap path is a settlement-safe Uniswap v3 route on Sepolia, not a production aggregator across mainnet liquidity. There are no fiat on/off-ramps, no NFT portfolio, no hardware-wallet support yet. These are honest absences, not hidden ones — and none of them are rendered as if they exist.

**Audit and trust proof.** This is the decisive one. We have not yet had an independent, third-party security audit of key-management, signing, and encrypted backup — and until we do, no real-fund public launch happens. Our competitors carry years of adversarial exposure and, in several cases, published audits. A sound architecture is a claim; an audit is evidence, and we do not yet have the evidence. The audit is the single blocking gate for real-fund GA (`ROADMAP.md` §3, `SECURITY.md`).

**Distribution.** Zero users, zero store gravity, no token — by design. Distribution is the incumbent's deepest moat and our emptiest column.

The gap-closing plan is not aspiration; it is the sequenced, gate-driven arc already committed in `ROADMAP.md`, and it is honest about *order*:

| The gap | How it closes | The gate that proves it |
|---|---|---|
| Audit / trust proof | Independent wallet-grade audit engaged S1, executes S2, clears S3 | 100% of high/critical findings fixed and re-tested; report published |
| Mainnet maturity | Frozen narrow launch chain-set moves to real, capped mainnet behind explicit confirm + spend cap + kill-switch | *N* real-fund mainnet RIE with **zero loss-of-funds** |
| Integrations (ramps, aggregator routes, ERC-20/SOL/BTC mainnet) | Widened on evidence, tier by tier | V3.1: clean capped-mainnet RIE at the prior tier + re-audit of the swap-settlement path |
| Recovery parity (vs Coinbase passkeys) | Passkey + MPC, Recovery Center | V3.2 audit: **no server share can move funds unilaterally** |
| Distribution | The wedge + the Intent SDK as rails; honest launch narrative | Weekly Real Intents Executed, growing on real usage |

Notice what the plan does *not* do: it does not race the incumbents on breadth before we have earned trust on depth. **Narrow, audited, and honest — then widen caps and chains on evidence.** For a wallet, the first drained user is an extinction event; the competitor who launches wide and unaudited to close the maturity gap faster is making a bet we will not make. Our answer to "you're behind on maturity" is not to fake maturity — it is to be the one wallet whose every claim is demonstrable, and to let that compound.

---

## 6.6 · What this chapter commits us to

- **No strawmen, ever — internally or in market.** We describe every competitor's real strengths accurately; a comparison the user knows is dishonest forfeits the trust that is our whole brand. Competitive claims are held to the same honesty bar as a balance screen.
- **Cross-ecosystem, first-class, is the structural moat.** One identity across Bitcoin *and* EVM *and* Solana — native, not bolted on — is defended at the seed-derivation layer and never diluted into "many chains, none honest."
- **Intent is the interface; craft is the finish.** We change the model (sentence in, verified plan out) *and* hold it to Phantom's craft bar. A prettier instrument panel is not our product; a beautiful cage is still a cage.
- **Simulate-before-sign and loud risk are non-negotiable.** We inherit Rabby's lesson and elevate it: honesty, not merely safety, is the differentiator.
- **The AI never signs — permanently.** Against the AI-native entrants, our line is architectural and absolute: schema-forced proposals, a deterministic gate that can only refuse, the device signature as the sole disposer. Anti-scope, reversible only by a named ADR that we will not write.
- **We close the gap in order, and we never fake the parts we haven't closed.** Audit before real-fund GA; capped and labelled mainnet before wide mainnet; ramps, aggregator routes, and recovery on gated, evidence-driven roadmap tiers. Maturity is earned in public, never claimed.

The map is drawn and our place on it is honest: outmatched today on maturity and distribution, and uniquely positioned on reach, interface, and honesty. Strategy is now a question of what we optimise toward — which brings us to the next chapter, **Success Metrics & the North Star**, and the single un-fakeable number that tells us whether any of this is working: a real person, moving real value, by talking to their money.
