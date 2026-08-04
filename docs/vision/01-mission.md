# Chapter 1 — The Mission

*Why a company should exist to let a stranger move real money by saying what they want — and never be lied to, never lose funds.*

**Chapter abstract.** This chapter states the reason Intent Wallet exists before it states anything about how it is built. The reason is a contradiction the industry has learned to live with: crypto now clears into the trillions of dollars, and it remains, for almost everyone who is not an engineer, unusable and quietly hostile. The wallets that guard this value are *instrument panels* — they expose chains, bridges, gas tokens, nonces, and slippage, and then ask a human being to operate the machine. That design produced a large amount of self-custodied value and a small, anxious, technical user base. It cannot produce the next hundred million people. This chapter names the specific cruelties of the status quo, defines precisely who we serve (the competent non-expert with money to move — not the degen), states the mission in one sentence and the stakes that make it worth a company, argues *why now* (large language models make natural-language intent tractable for the first time; multi-chain fragmentation makes a universal layer necessary for the first time), and stakes out the moral position that governs every later chapter: **self-custody, without cruelty.** It closes with the durable commitments this mission locks in.

---

## 1 · The trillion-dollar machine nobody can drive

Start with the uncomfortable fact. The asset class is enormous — self-custodied crypto clears into the trillions of dollars across Bitcoin, Ethereum and its layer-2s, and Solana — and yet the act of *using* it remains reserved for a technical priesthood. This is not a maturity problem that time will fix on its own. It is a design decision, repeated by every dominant wallet, that has calcified into an assumption nobody questions anymore: that to hold your own money on-chain, you must first become a systems operator.

Look honestly at what the incumbent wallet *is*. MetaMask, the category's center of gravity, is a superb piece of engineering and an instrument panel to its core: it surfaces chains, gas tokens, approvals, and nonces, and leaves the routing of value to the person. Phantom is the best-crafted wallet in the space and still fundamentally asks the user to understand the mechanics of a swap before performing one. Rabby did something genuinely important — it made *pre-transaction simulation* a feature the market could see and want — but it did it for EVM power users and framed the whole product around them. Coinbase Wallet carries brand trust and fiat ramps into a conventional send/swap model. Each of these is excellent at what it is. None of them is a wallet a non-technical person can *drive*, because none of them was designed to be. They were designed to *expose the machine*, faithfully and completely, to someone assumed to already understand it.

The result is a market that mistakes its own ceiling for the edge of the world. The user base is overwhelmingly technical because the product self-selects for technical users; the technical users report that "it works fine" because they have paid the tuition to make it work fine; and the industry concludes that the remaining billions simply "aren't ready for crypto." That conclusion is exactly backwards. The billions are not failing the product. The product is failing them — by insisting they do a machine's job before it will move their money.

We exist to reject that conclusion and the design that produced it. Not to build a *better* instrument panel — a cleaner set of dials for the same cockpit — but to remove the cockpit. The user should say what they want. The machine should do the machine's job.

## 2 · Five cruelties (what the status quo actually does to people)

"Hostile" is a strong word for a piece of software, and it is the correct one. Hostility here is not malice; it is a set of specific, repeatable ways the current design punishes a normal person for not being an engineer. Naming them precisely matters, because each one is a design target — a thing we are on the hook to *remove*, not merely to skin more nicely.

| The cruelty | What it feels like to a normal person | Who it excludes |
| --- | --- | --- |
| **Seed-phrase terror** | Twelve words on a napkin. Lose them and your money is gone forever; photograph them and you may have already lost it. No undo, no support line, no second chance — and you learn all of this on day one. | Everyone who has ever lost a password and survived because "reset" existed. |
| **Chain / bridge / gas complexity** | To move value you must know which chain your asset is "on," find a bridge, trust it, acquire a *different* token just to pay for the move, and watch a multi-step process you don't understand. | Everyone who thinks in *money*, not in infrastructure. |
| **Address roulette** | A 42-character string with no meaning and no error-correction. Paste the wrong one, or the right one for the wrong chain, and the funds are simply gone. | Everyone who has ever fat-fingered anything. |
| **Scam exposure** | A hostile dApp asks for a signature that drains a wallet; a look-alike token, a poisoned address in your history, a "support" DM. The tools assume you can spot the trap. | Everyone who is trusting, tired, or new. |
| **"You be the router"** | The wallet knows your balances, the chains, the routes, and the fees — and still makes *you* assemble the transaction. The machine has the information; the human does the labor. | Everyone who expected the computer to do the computing. |

Read the last column down the page. It is the same population every time: not the incompetent, but the *non-specialist* — the person who is entirely capable of managing money, and entirely uninterested in becoming a blockchain operator to do it. That population is not a niche. It is essentially everyone.

Two of these deserve emphasis because they define our moral and technical stance for the rest of the Bible. The first is **seed-phrase terror**, which is really the terror of *irreversibility without dignity*. Irreversibility is not a bug to be removed — it is the entire point of self-custody, the property that means no one, including us, can move your money but you. The failure is not that crypto is irreversible; it is that the incumbent design makes irreversibility *feel like a trap laid for the user* instead of a right exercised by them. The second is **"you be the router,"** which is the deepest cruelty because it is the most gratuitous. The information needed to plan a cross-chain move — balances, asset locations, routes, fees, risks — is fully available to the software. Handing that labor back to the human is not a limitation of the technology. It is a failure of ambition.

## 3 · Who we serve — the competent non-expert, not the degen

A mission is only as sharp as the person it refuses to serve. Ours is aimed with deliberate precision at the **competent non-expert who has real money to move** — and, just as deliberately, *not* at the power-trader who wants raw control of the machine.

Three people stand in for the whole. They recur through every volume of this Bible, and they are worth meeting here, at the start.

**Riya — the multi-chain retail user.** Riya already holds assets on two to four chains. She uses MetaMask and a bridge, and she has quietly come to hate the ceremony: the gas-token juggling, the chain-switching, the low-grade dread every time she bridges that a step will fail and strand her funds somewhere she can't see. She is not a beginner. She is a *competent person the incumbent design has worn down.* She switches to us the moment we remove the ceremony she already hates — on the chains she already uses. Riya is the wedge.

**Naya — the capable newcomer.** Naya is opening her first self-custody wallet. She is mobile-first, non-technical, and — crucially — *not naïve*. She has heard the horror stories. She wants to hold, send, and move value without learning what a chain is, and above all she wants to *not get scammed.* She does not switch to us for features. She switches for a product that visibly refuses to lie to her, that makes the safe path the easy path, and that explains itself in words she already owns.

**Dev — the builder.** Dev is a dApp or fintech engineer who wants intent as an API: natural language in, a verified plan out, execution that keeps signing on the client where it belongs. Dev is not an end-user at all; Dev is the reason the wedge becomes a platform. Dev wants Stripe-grade rails, not another RPC wrapper.

Now the refusal, stated as plainly as the target, because saying no is how a mission keeps its shape. We are **not** for the MEV / DeFi power-trader who wants raw mempool control, custom nonces, arbitrary calldata, and a dozen chains added by RPC URL — Rabby and a Safe serve that person better, and chasing them would force us to re-expose the exact instrument-panel complexity we exist to hide. We are not for the chain maximalist who wants every governance and staking knob of a single ecosystem; Phantom or an L2-native wallet fits better. We are not for the "let the bot trade for me" user expecting an autonomous agent with signing authority — our AI *cannot* dispose of funds, by construction, and that is a feature, not a gap. And we are not for the airdrop farmer optimizing for token incentives; we ship no token and will not contort the product into a farm.

This is not snobbery about our users; it is honesty about our design. Every one of those refused personas wants us to expose *more* of the machine. Our entire thesis is to expose *less* of it. You cannot serve both. Choosing the competent non-expert is choosing which product to build.

## 4 · The mission, in one sentence — and the stakes

Here is the whole company compressed to a single line, the way it must survive being repeated by a tired engineer at 2 a.m. and a skeptical investor at 2 p.m.:

> **Intent Wallet exists to let anyone move their own money across every major chain by saying what they want — planned and proven safe by deterministic code, signed only on their own device, and never once lied to.**

Everything true about the company is a consequence of that sentence. *"Their own money"* is non-custody: the keys are generated and used on-device, encrypted at rest, and never leave — if a feature would require a server to know a secret, we redesign the feature, not the doctrine. *"By saying what they want"* is the intent surface: the primary interface is a sentence, not a form. *"Planned and proven safe by deterministic code"* is the gate: the AI proposes, exhaustively-tested pure code verifies, and the code can only ever *refuse.* *"Signed only on their own device"* is the disposition of funds: the user's signature — never the AI, never a server — is the sole mover of money. *"Never once lied to"* is the honesty doctrine: a network failure is not "$0," testnet is labelled testnet, capped mainnet is labelled capped, and we never render UI for a capability that does not exist.

The stakes are what make this worth a company rather than a feature. In consumer software the cost of a bad product is a churned user. In a non-custodial wallet the cost of a bad product is *someone's money, irreversibly, with no recourse.* The first drained user is not a support ticket; for a wallet, it is an extinction event. That asymmetry is the reason our north-star metric is deliberately un-fakeable — **Real Intents Executed**, a natural-language request that ended in an on-chain-confirmed state change signed by the user's own keys — and the reason it sits beside hard guardrails (funds stranded, honesty defects, key exposure, mislabelling, AI-disposed funds) that all trend to zero and can veto any amount of growth. You cannot fake your way to trust with real money. You can only earn it, one honestly-executed sentence at a time, and lose all of it in a single lie.

That is the bet: that in a category defined by *not lying to people about their money*, honesty is not a compliance burden. It is the entire brand.

## 5 · Why now — two things that were not true before

Ambition without timing is a manifesto. This is a company, so the timing has to be real. Two independent shifts — one in AI, one in the chain landscape — have only just made this specific product tractable, and neither was true even a few years ago.

### 5.1 Natural language finally survives contact with money

For a decade, "just tell your wallet what to do" was a demo, not a product, because the translation from a human sentence to a safe, precise financial action was not reliable enough to trust with funds. Large language models changed the tractable surface of that problem. A model can now take *"convert my BTC to ETH"* or *"send $100 USDC to Rahul"* and turn ambiguous human phrasing into a structured proposal — and, critically, it can do so **behind a schema.** In our system the model does not emit free-form actions; its output is validated against a typed `Intent` contract, so it can only ever produce one of a small set of shapes we already understand (`transfer`, `swap`, `buy`, `stake`, `rebalance`, the deferred/automated kinds, or the non-moving `query` / `clarify` / `unsupported`). The moment the request is fund-moving, it leaves the model entirely: deterministic code resolves it against real balances, plans a route, prices it in fiat, runs a risk verdict, and presents it at a confirm sheet the user's device must sign. The AI is the world's best translator and explainer. It is *never* the hand on the money.

This is the ordering that makes "talk to your money" safe rather than reckless, and it is only newly possible: the language model is good enough to understand the sentence, and the deterministic gate is strict enough that the model's fallibility can never spend a cent. Put crudely — the LLM makes the *front door* finally work, and the doctrine ensures the LLM never gets near the *vault.*

### 5.2 Fragmentation made a universal layer necessary, not merely nice

The second shift is structural. Value did not consolidate onto one chain; it *fragmented* across three broad ecosystems — Bitcoin, the Ethereum/EVM world and its proliferating layer-2s, and Solana — each with its own address format, its own gas token, its own mental model. Every new chain and rollup that shipped made the incumbent design a little more hostile, because every one added another dial to the cockpit and another way for a normal person to send funds to the wrong place. Fragmentation turned "which chain is my money on?" from a curiosity into a daily tax.

A universal layer that spans all three ecosystems under **one identity** — one seed deriving a Bitcoin address, a universal EVM address, and a Solana address, merged into a single portfolio — is therefore not a luxury feature. It is the only humane response to a world that fragmented. And it is a layer almost no one else can honestly offer: MetaMask cannot treat Bitcoin or Solana as first-class; Phantom is Solana-first; Rabby is EVM-only. The cross-ecosystem one-liner — *"convert my BTC to ETH,"* said once, with no manual bridging — is a sentence that is *structurally* ours to own, because holding BTC **and** EVM **and** SOL under one roof is a precondition for even saying it.

Honesty compels the boundary here, and this Bible is built to state it. **Transfer and swap are the genuinely real, broadcastable intents today** — device-signed and pushed to real nodes on Sepolia, Solana devnet, and Bitcoin testnet, plus a guarded, explicitly-labelled, spend-capped mainnet ETH path. The richer automated intents — `stake`, `rebalance`, `recurring`, `emergency_exit` — exist today as *typed, planned* shapes that pass the same safety gate, but they do not all have real broadcast paths yet; the roadmap wires them, honestly, behind the same device signature as any manual action. "The engine exists" is not "the product ships it." We say which is which, always, because the whole company is an argument that you can trust what we tell you.

## 6 · The moral stance — self-custody, without cruelty

Underneath the product there is a moral claim, and it is worth making explicit because it resolves the tension the whole category has ducked.

Two camps have divided the space. The custodial camp — exchanges and CeFi — offers ease, recovery, and a support line, and takes your keys to do it; when it fails, it fails catastrophically and takes customer funds with it. The self-custodial camp keeps you sovereign and, too often, achieves that sovereignty through *cruelty* — the napkin of seed words, the unforgiving address field, the assumption that if you didn't understand the machine you deserved to lose. The industry has quietly taught people that these are the only two options: **safe-but-not-yours**, or **yours-but-brutal.**

We reject the trade. The correct position is that **self-custody is a right, and cruelty is a design failure — not the price of the right.** Keys belong to the user, absolutely and always, with a door that is always unlocked: you can export your seed and walk away at any moment, with zero lock-in. *And* the experience of holding that power should be calm, legible, and forgiving of everything that can be made forgiving without touching the keys. Irreversibility, where it is real, is made *safe and legible* — explained before it happens, confirmed at a sacred sheet the user learns to recognize with their eyes half-closed — rather than removed. When we cannot positively verify something — an unknown token, an unpriced asset, a malformed address, a route we cannot simulate — we *refuse and explain,* because a confident wrong answer about someone's money is the worst thing this product could ever produce.

This is why "Apple-grade craft" and "WCAG AA" sit in our doctrine as *acceptance criteria* rather than polish. Cruelty and carelessness are the same failure wearing different clothes. A wallet that is honest but ugly, or safe but unusable, or sovereign but terrifying, has not met the standard — it has just relocated the cruelty. The measure we hold every release to is a single question that admits no partial credit: *can a non-technical stranger move real money across chains by typing one sentence — never be lied to, never lose funds, and enjoy it?* If the answer is no, the release is not done, however green the type-check.

That question is the mission rendered as a test. The rest of this Bible is the work of earning a yes.

---

## What this commits us to

The mission is not a mood; it is a set of decisions that bind every chapter after this one. Locked here:

1. **Intent over instruments.** The primary surface is a sentence, never a form. We remove the cockpit; we do not polish it. A feature that makes the user operate the machine has failed the mission on arrival.
2. **The competent non-expert is the customer.** Riya, Naya, and Dev define scope. If a proposal primarily serves the power-trader, the chain-maximalist, the farmer, or the "let the bot trade" user, it is out by default — reversible only by a written decision, never by drift.
3. **Non-custody is absolute, and cruelty is a defect.** Keys live and die on the device and never touch a server; *and* the experience of that sovereignty must be calm, honest, forgiving, and accessible. Safe-but-brutal is not an acceptable wallet.
4. **The AI proposes; the device disposes.** Natural language is the translator, bounded by a schema; deterministic code is the verifier that can only refuse; the user's on-device signature is the sole mover of funds. No prompt, tool, or plugin may ever request signing authority.
5. **Honesty is the brand, and it is falsifiable.** We market only what ships, label testnet as testnet and capped mainnet as capped, and measure ourselves by Real Intents Executed — a number impossible to fake without a real person moving real value. A single lie forfeits the product.

---

*Next — **Chapter 2: The Vision.** If this chapter argued why the company must exist, the next describes the world it is trying to build: money you can talk to, the operating system for value that anyone can address in their own words, and the arc from a capped, audited launch to a universal intent layer.*
