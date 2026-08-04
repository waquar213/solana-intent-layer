# Chapter 3 — Philosophy & First Principles

*The founding beliefs of Intent Wallet, reasoned upward from two facts — that a person has a goal, and that money is irreversible — never downward from a wallet that came before.*

**Chapter abstract.** Chapters 1 and 2 said *why* the company exists and *what* it is. This chapter says *what we believe* — the axioms every later volume must cohere with. We refuse to derive our philosophy the way most products do, by studying the incumbents and copying their consensus; consensus is how the whole category ended up as an instrument panel. Instead we reason from first principles, from two ground truths that predate any blockchain: **a human being holds a goal, not a transaction**, and **money, once moved, does not come back**. From those two facts, seven axioms follow with something close to necessity — intent is the interface; assets, not chains; custody is the user's, always; the AI proposes, deterministic code verifies, and the device signature disposes; never lie, not even by omission; the confirmation sheet is sacred; and craft is table stakes, not polish. Each is stated below with its user truth, its derivation, and — because a principle you cannot break is decoration — the exact thing it forbids us from ever building.

---

## 1 · The method: derive, don't copy

Most wallets were designed by looking at other wallets. That is how an entire industry converged on the same screen: a network dropdown, a gas-token balance, a list of hex addresses, a "sign" button that shows bytes a human cannot read. Copied enough times, those choices stopped looking like decisions at all; they became "how wallets work." They are not how wallets work. They are how the first wallets, built by and for the people who built the chains, happened to work — and the next hundred million people are not those people. So we throw the reference class away and start from the two facts that no product decision can repeal.

**The first fact is about the user.** A person never wakes up wanting *to bridge*. They want their Bitcoin to become Ethereum. They never want *to select a gas token on the destination chain*; they want to send Rahul a hundred dollars. The goal is primary and durable; the transaction is a derived, disposable artifact — the exhaust of the goal, not the goal itself. Any interface that asks the human to compile their goal down into transactions by hand has offloaded the machine's job onto the person. That is the original sin of the category, and we treat it as a sin, not a feature.

**The second fact is about money.** On-chain value is *bearer* value and *irreversible* value. There is no chargeback, no support line that reverses a mistake, no bank that eats the fraud. A transfer to a wrong address is gone; a signature over a malicious payload is honored, not appealed. This is the property that makes self-custody worth anything — but it means the cost of a single confident wrong answer about money is unbounded. A product that is right 99% of the time about *funds* is not "pretty good"; it is a slow-motion disaster with a good demo.

Hold those two facts together and the design space collapses. Because the user thinks in goals, the interface must accept goals. Because money is irreversible and adversarial, the machinery under that interface must be verifiable, honest, and biased toward refusal. The rest of this chapter is what falls out when you take both seriously at once — which, we will argue, no incumbent does. MetaMask takes neither. Rabby takes the second (simulation, safety-as-a-feature) but not the first — it is still an EVM instrument panel. ChatGPT took the first for language but has no notion of the second, because it never touched irreversible money. Our whole thesis is the intersection: **the conversational surface of ChatGPT over machinery as unforgiving as a Rabby simulation, wrapped in the craft of Apple Wallet.** The axioms below are that intersection, made into law.

---

## 2 · The surface belongs to the user: intent, and assets not chains

The first two axioms are both consequences of the first fact — that the user holds a goal — and they concern the surface: what the user says, and what vocabulary the product is allowed to make them learn.

### 2.1 Intent is the interface

**The user truth.** Riya, our multi-chain retail user, already holds assets on three or four chains and already uses a bridge she doesn't trust. She does not lack the ability to operate an instrument panel; she is *tired* of being the instrument. Her goal arrives fully formed in a sentence — "convert my BTC to ETH" — and everything after that sentence is ceremony she resents. Naya, the capable newcomer, cannot even *state* her goal in the panel's vocabulary; she has a hundred dollars and an intention, and the panel demands she first become a router.

**The derivation.** If the goal is primary and expressible in a sentence, then the primary surface must *be* a sentence. Not a form that a sentence gets translated into by the user's own labor — a command bar that accepts the sentence directly, parses it into a typed, validated `Intent`, and does the compiling itself. This is why the intent, not the screen, is the atomic unit of the product. In the real engine (`@intent-wallet/intents`) that unit is a discriminated union: `transfer`, `swap`, `buy`, `stake`, `rebalance`, the automated `recurring` and `emergency_exit`, and the non-moving `query`, `clarify`, `unsupported`. A human amount — "$100", "half", "everything", "50%" — is captured as a typed `Amount` (`fiat`, `asset`, `all`, `fraction`, `percent`) and resolved deterministically to base units. The sentence is not decoration over a form; the sentence is the source of truth, and the form is what we fall back to.

Forms still exist — for precision, for editing, for the moment a user wants to nudge slippage by a basis point — but they are the *fallback*, never the required path. That ordering is the whole difference between "a wallet with a chatbot bolted on" and a wallet whose native language is intent. ChatGPT proved a general audience will state goals in prose to a machine and prefer it. We take that as settled and build the money version.

**The prohibition.** No core journey may *require* a form, a chain name, a bridge, or a gas token to complete. If the wedge flow cannot be driven by typing a plain sentence, the intent design has failed — and a "conversational" veneer painted over a mandatory instrument panel is a failure dressed as a success, which is worse.

### 2.2 Assets, not chains

**The user truth.** Naya has "my bitcoin" and "a hundred dollars." She does not have "an EOA on Sepolia" or "a balance net of L2 gas." The chain is, to her and to Riya alike, *plumbing* — the pipes behind the wall. You do not ask a person to name the municipal water main before they can fill a glass.

**The derivation.** If assets are what the user thinks in, then assets are what the top level shows: one universal identity, one unified portfolio, one net-worth number. Chains do not disappear — they are real, and a technical user may want to see them — but they live *one tap deep*, in per-asset detail and technical receipts, never in the headline vocabulary. Everything the incumbents make the user do to cross a chain boundary — bridging, chain-switching, gas-token acquisition, wrapping, approvals — becomes *our* job, executed inside a proven `ExecutionPlan` whose steps (`transfer`, `swap`, `bridge`, `approve`, `stake`) carry base-unit integer amounts and dependency ordering the user never has to think about. This is the structural reason our identity spans **Bitcoin, Ethereum and its L2s, and Solana** under one seed: the cross-ecosystem one-liner is a sentence only a wallet that hides all three plumbing systems can honestly offer. MetaMask cannot say it (no first-class BTC or Solana); Phantom is Solana-first; Rabby is EVM-only. The sentence is our moat precisely because the abstraction is.

**The prohibition.** A chain name may never be a required top-level concept, and gas-token juggling, manual bridge selection, or wrap/approve ceremony may never be part of the user's vocabulary. We do not add a chain as a checkbox; we add it only when we can hide it *honestly* — real balances, real fees, real simulation, real risk — because a chain we expose but cannot make invisible is just more instrument panel.

---

## 3 · Custody is the user's, always — with a door that's always unlocked

**The user truth.** "Not your keys, not your coins" is not a slogan for us; it is the physics of the second fact. If a server can move your money, then your money is the server's to lose, freeze, subpoena, or misplace — and the entire premise of self-custody, the one thing that makes irreversibility a feature rather than a trap, is gone. Every custodial exchange failure of the last decade is the same story told again: the user thought they held value; they held an IOU.

**The derivation.** If custody must be the user's, then keys and seed are generated and used **on the device**, encrypted at rest, and they *never* leave it. This is not a configuration we chose; it is a boundary we engineered so that violating it is not merely against policy but against the shape of the code. The device engine (`packages/core`) has **no network I/O at all** — it is lint- and review-enforced, so there is no code path by which a key could be transmitted, not even a wrong one. The mnemonic is sealed the instant it exists: `AES-256-GCM` under a key derived by `scrypt` (N=2¹⁵, r=8, p=1 — roughly 32 MiB of work, about 100 ms on a phone), with every envelope field bound as authenticated data so tampering with any of it fails the open. That derivation is conformance-tested against the official BIP-32/44/84 and SLIP-0010 vectors and cross-checked against independent implementations — 115 tests standing guard on the one asset whose compromise is catastrophic and irreversible.

And the door is always unlocked *outward*. The user can reveal their recovery phrase and walk away to any other wallet, at any moment, with zero lock-in — because the identity is derived from a standard seed, not from us. Self-custody that you cannot leave is just custody with extra steps; the exit is part of the promise, not a leak in it.

We are also honest about the one thing on-device custody cannot buy. While the wallet is unlocked, keys live in the process's memory, and malware that already owns an unlocked device can read them. This is true of *every* hot wallet, and we say so plainly rather than implying a magic no one has. We shrink the window — per-operation key derivation with zeroization in a `finally` block, keyring destroyed on lock, an auto-lock idle timer — and moving signing behind native secure hardware is on the roadmap, labelled roadmap. What we will not do is pretend the residual is zero.

**The prohibition.** No feature may require a server to know a secret, hold a key, or be able to move funds unilaterally — and that includes any future recovery or MPC scheme: if a design needs the server to know something secret, we redesign the feature, not the doctrine. There is no "recover my funds" that implies we hold them, because we do not, by construction.

---

## 4 · The separation of powers: AI proposes, deterministic code verifies, the device signature disposes

This is the axiom the whole company turns on, and it is the one the AI-native newcomers most often get wrong. It deserves the most care.

**The user truth.** For an AI-native wallet to be usable, the user must be able to trust the *wallet* more than they trust the *AI* — and they are right not to fully trust the AI. Large language models are, by their nature, occasionally, confidently wrong, and provably susceptible to manipulation through the very text they read. A user who has to bet their savings on the model never hallucinating, and never being hijacked by a malicious token name or a poisoned intent string, is a user who should not use the product. So the product's job is to make the model *safe to be wrong*.

**The derivation.** We solve this the way constitutions solve the problem of a powerful but fallible officer: separation of powers. Three faculties, and no one of them can move money alone.

| Faculty | Who holds it | What it can do | What it cannot do |
|---|---|---|---|
| **Propose** | The AI | Draft a typed intent from a sentence; explain a plan in prose | Sign, execute, change settings, read another user's data, or emit any shape we don't understand |
| **Verify** | Deterministic code | Parse, resolve against real balances, plan, price, risk-verdict, and **refuse** | Move funds; it is pure and total — no network, no clock, no keys |
| **Dispose** | The device signature | Turn an approved plan into signed bytes and broadcast | Act on anything the user did not see and approve on the confirm sheet |

The AI's output is *schema-forced*: the model can only ever emit `Intent`-shaped JSON, validated against the Zod schema before it is trusted, and invalid or injected output degrades to a `clarify` — a plain question back to the user — **never a guess**. Between that proposal and the wire stands a pure, exhaustively-tested gate whose only power is to say no: unknown chain, blocked; malformed or mixed-case-but-checksum-failing recipient, blocked; mainnet without explicit acknowledgment, blocked; a single mainnet transfer over the **$1,000** spend cap without high-value confirmation, blocked. The gate holds no keys and moves no funds. It cannot itself become an attack surface, because it can only ever refuse. And the sole disposer of funds is the signature produced on the device, over the exact bytes the user approved.

The litmus test we apply to every AI feature, forever, is one sentence: *if the model were fully controlled by an attacker, what is the worst it could do?* If the answer is anything worse than "produce a proposal the user can reject," the design is wrong. This is what separates us from the "let the bot trade for me" entrants: their agent can act, so their worst case is *loss of funds*; our agent can only speak, so our worst case is *a rejected suggestion*. That is not a smaller version of the same risk; it is a different category of system.

**The prohibition.** No prompt, tool, plugin, or agent may ever be granted signing capability or a path to execute that bypasses the deterministic gate and the device signature. "Just do it for me" is a bug of the highest severity, not a convenience feature — and no roadmap item, however clever, reverses it.

---

## 5 · Never lie — not even by omission

**The user truth.** Trust is not *a* feature of a wallet; it *is* the wallet. A user hands over the thing they would most hate to lose, on the strength of believing what the screen tells them. The instant a screen tells them one thing that is not true — a balance that is really a network timeout, a "success" that was really a simulation, a testnet transaction wearing a mainnet label — the entire edifice is gone, and no amount of later honesty rebuilds it. Trust is spent, not accrued; you can only lose it, and you lose all of it at once.

**The derivation.** So we hold ourselves to a standard stricter than "don't display false things": we do not mislead even by *silence*. Every state is designed and honest — empty, loading, error, partial, success — because an undesigned error state is where lies hide. A network failure is **not "$0"**; it is a read we could not complete, and it says so, because "$0" is a specific, terrifying, and in this case false claim about someone's money. Fees are shown fiat-first as a total and a percentage *before* the user commits ("Total cost: $21.30 (1.01%)"), decomposable on tap, and we never round in the user's disfavor on a confirm screen. Testnet is labelled testnet; capped mainnet is labelled capped. We render no UI for a capability that does not exist.

The hardest and most honest expression of this axiom is how we talk about our *own* progress — including in this very book. Several intent kinds — `stake`, `rebalance`, `recurring`, `emergency_exit` — exist today as typed, planned shapes that pass the gate, but do **not** all have real broadcast paths. The genuinely real, device-broadcast intents today are **transfer and swap**, on testnets and on guarded, capped mainnet ETH; everything else is labelled for what it is. Many roadmap engines exist as pure, tested packages — and "the engine exists" is *not* "the product ships it end to end." We write that sentence into the constitution so that no future deck, screen, or chapter can quietly forget it. Rabby taught the market that *safety is a feature you can market*. We extend the lesson one turn further: **honesty is a brand**, and it is the one competitors staffed by growth teams find hardest to copy.

**The prohibition.** No fake or borrowed data, ever — no placeholder balances, no simulated "success," no demo numbers presented as real, no network failure rendered as `$0`, no UI for a feature that isn't wired, and no metric asserted as achieved that a real person did not actually produce.

---

## 6 · The confirmation sheet is sacred (and the wallet fails closed)

**The user truth.** Somewhere in every flow there is exactly one instant that actually moves irreversible money: the signature. Because that instant is irreversible and because attackers know exactly where it is, it is the single most valuable and most contested pixel in the product. It cannot be *a* screen among many. It has to be *the* screen — the one the user recognizes with their eyes half-closed.

**The derivation.** So we give every value-moving confirmation, everywhere in the product, **one anatomy**. Same shape, same order, same place for what-you-send, what-you-receive-at-minimum, the fiat-first total, and the risk verdict. That sameness is not a style choice; it is an anti-phishing mechanism. A user who has internalized what our confirm sheet looks like has a free, built-in detector for the fake one an attacker will eventually build — *recognition is a security feature*. Comprehension must precede the signature: the plan is presented in language before it is presented as bytes, and risk is always **icon plus label plus color, never color alone**, so the warning survives a colorblind user and a bad screen both.

And when the machinery cannot *positively* verify something, the answer is refuse-and-explain, not guess-and-proceed. This is the same fail-closed instinct as the AI gate, now made into a product feeling: an unknown token, an unpriced asset, a route we could not simulate, an amount with an ambiguous comma ("1,23" — European decimal or malformed thousands?) all resolve to a `clarify` or a block, never a silent best-guess over someone's savings. Automation inherits the same bias: it is off by default, and when a user turns it on it is bounded by explicit caps ($25 per transaction, $100 per day) that *fail safe* — when a real USD value is unknown or a cap would be exceeded, Auto falls back to a manual confirm rather than proceeding. The depth of what the wallet may do without asking never exceeds the depth the user cryptographically granted.

One corollary: we never re-skin the operating system's own security surfaces. Biometric prompts, share sheets, permission dialogs belong to the platform, and faking them would train users to trust a look we don't control. The confirm sheet is ours and unmistakable; the OS's surfaces are the OS's and untouched.

**The prohibition.** No value-moving action may occur without the one sacred confirm anatomy and an on-device signature over exactly what was shown; no irreversible action may proceed on a guess; and no automation may act beyond its explicit, fail-safe caps. Dark patterns around this moment — hidden fees, self-favoring defaults, urgency nags, confirm-shaming — are forbidden outright.

---

## 7 · Craft is table stakes, not polish

**The user truth.** A person will not hand their money to something that feels cheap, confusing, or careless — and they are right not to, because in a product about irreversible value, sloppiness in the visible layer is a rational proxy for sloppiness in the invisible one. Naya's judgment of whether this wallet is *safe* is formed, in the first ten seconds, by whether it feels *considered*. Craft is not the reward the user gets after trust; craft is how trust is earned in the first place. Apple Wallet and Phantom both understood this; the average wallet, treating design as a coat of paint applied at the end, did not.

**The derivation.** So craft is an acceptance criterion, checked at the same gate as correctness — not a polish pass scheduled for "later" and cut under pressure. Interaction feedback under 100 ms. WCAG AA contrast and keyboard reachability and visible focus. Motion that respects `prefers-reduced-motion`. Light and dark designed with *equal* care, because a dark mode treated as an afterthought is a tell. The near-monochrome interface is itself a safety decision: when everything else is quiet, semantic color — a risk amber, a success emerald, a danger rose — carries unmissable meaning. "Ugly but works" does not ship here, not because we are precious about aesthetics, but because in this category ugly *is* a correctness failure — it is the interface lying, in body language, about how much care went into the money underneath.

**The prohibition.** No feature ships that misses its craft budget — sub-100ms interaction, AA accessibility, reduced-motion safety, and light-and-dark parity are blockers, not backlog. A green type-check is not "done"; "done" is the real flow driven by a first-time user, in both themes, and proven.

---

## What this commits us to

These are the durable decisions this chapter locks in. A change that breaks one is wrong even if it works, and is reverted.

- **The primary surface is a sentence.** Every core journey is completable by typing a goal; forms are a fallback for precision, never the required path.
- **The top level speaks assets, never chains.** Bridging, gas, wrapping, and approvals are the machine's job; a chain name is never a required concept.
- **Keys never leave the device.** No server holds a secret or can move funds; the user can always export and walk away; the residual risk of an unlocked, malware-owned device is named, not hidden.
- **Three faculties, separated.** The AI only proposes, deterministic code only verifies (and can only refuse), and the device signature alone disposes. No tool, plugin, or agent ever gets signing authority.
- **We never lie, not even by omission.** Honest empty/loading/error/partial states; network-fail is not `$0`; testnet and caps are labelled; "the engine exists" is never sold as "the product ships it"; no metric is claimed that wasn't earned.
- **The confirm sheet is one sacred anatomy, and the system fails closed.** Comprehension precedes signature; risk is icon+label+color; the unverifiable is refused, not guessed; automation stays within fail-safe caps; OS security surfaces are never re-skinned.
- **Craft is an acceptance criterion.** Sub-100ms, WCAG AA, reduced-motion, and light/dark parity are gates, and "done" is the real flow driven and proven — not a passing compile.

These axioms are the *why* and the *what-we-believe*. The next chapter turns them into a *strategy* — how these beliefs become a wedge, a sequence, and a defensible position no incumbent can copy without abandoning the very things that made them incumbents.
