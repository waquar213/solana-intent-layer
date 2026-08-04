[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Volume II — Product · the reference behind [Chapter 16](../bible/chapter-16-universal-payment-network.md)

# The Universal Payment Network Reference

> **The buildable expansion of [Chapter 16 — Universal Payment Network](../bible/chapter-16-universal-payment-network.md).**
> The charter states the intent — *"Who do you want to pay?"* as the only question the sender answers. This
> reference is the engineering behind it: how a username resolves to an address without ever guessing, how one
> QR speaks BTC/SOL/EVM, how a merchant, a payroll run, an invoice, and a cross-border remittance all reduce to
> the *same* gated, device-signed intent — and exactly which of those ship today versus sit on the roadmap.

**Two invariants never move.** A payment is an **intent** — it walks the same `parse → resolve → plan → gate →
device-sign → broadcast → settle` path as a manual send (Chapter 7), so a scanned QR, a tapped link, a
subscription mandate, or a remittance is always a *proposal the user approves on-device*; no server and no
platform account ever holds funds. And **"received" means settled on-chain**, never merely broadcast — a queued
or pending payment is never rendered as delivered (Doctrine §3). A fiat on/off-ramp, where present, is a
**third-party** that does the KYC; the core wallet stays non-custodial and KYC-free.

**Honesty tags.** Each section is labelled **shipped** (exists in the monorepo today), **partial** (a real
seam exists, product surface incomplete), or **roadmap** (specified, not yet built). Send · receive · per-chain
QR · ENS resolution are **shipped**; merchant/POS, salary, subscriptions, invoices, the cross-border product
surface, offline preparation, refunds, the business dashboard, compliance integrations, and analytics are
**roadmap** built on shipped primitives (the intent pipeline, the identity engine, the liquidity engine).

---

## Sections

1. [Username Payments & Identity](#1--username-payments--identity) — resolve a person to an address, anti-spoof, never guess
2. [Universal QR & Payment Links](#2--universal-qr--payment-links) — one code for BTC/SOL/EVM, honest link semantics
3. [Merchant Mode & POS](#3--merchant-mode--pos) — the storefront that needs no blockchain expertise
4. [Salary, Subscriptions & Recurring Payments](#4--salary-subscriptions--recurring-payments) — bounded, revocable mandates
5. [Invoices & Payment Requests](#5--invoices--payment-requests) — a request is not a charge
6. [Cross-Border Remittances & Multi-Currency Settlement](#6--cross-border-remittances--multi-currency-settlement)
7. [Offline Payment Preparation](#7--offline-payment-preparation) — prepare offline, settle when connected
8. [Payment Analytics & History](#8--payment-analytics--history) — honest numbers, computed by code
9. [The Safety Boundary & Definition of Done](#9--the-safety-boundary--definition-of-done)

---
## §1 · Username Payments & Identity

> **Pay a person, not a hex string.** The single most user-hostile artifact in all of crypto is the
> 42-character address. It is unreadable, unmemorable, and — because one transposed nibble sends real money
> to a void — actively dangerous. The Universal Payment Network begins here, by making the recipient of a
> payment a *human being* the payer already knows, while keeping the guarantee that money only ever leaves
> for the address the user actually confirmed. This is the section that frames the rest of Chapter 16: every
> QR (§2), storefront (§3), payroll run (§4), and invoice (§5) ultimately resolves *someone* to *somewhere*,
> and does it under the anti-spoof discipline defined here.

### 1. A payment is an intent, and resolution is its first honest step

Chapter 7 established that everything the wallet does is an **intent** that walks one path:
`parse → resolve → plan → gate → device-sign → broadcast → settle`. A payment is not a special case of that
pipeline; it *is* that pipeline, pointed at a person. The only stage that username payments add weight to is
**resolve** — the deterministic step that turns *"pay Rahul $20"* into a concrete `{chain, address, amount}`
the planner can build a transaction from.

Resolution is where honesty is won or lost. A resolver that guesses, caches stale data, or silently falls
back to a plausible-but-wrong address is a fund-loss bug wearing a convenience costume. So the doctrine
(Rule #5, *fail closed*; Rule #3, *never fake data*) binds this stage hardest of all: **a name that cannot be
positively resolved to an address returns nothing — never a placeholder, never a best guess.** The user is
told the name is unresolved and the flow stops. Money is `bigint` base units from the moment the amount is
parsed (Rule #4); the recipient is a verified string; nothing downstream ever sees a float or a maybe.

```
"pay rahul $20"
   │  parse (Ch7)         → intent { action: transfer, amount: 20_000000n (USDC 6dp), recipient: "rahul" }
   │  resolve (§1)        → contact "rahul" → 0x8ba1…f21e   (or null → STOP, honestly)
   │  plan (Ch7/13)       → route + fee, convert if payer asset ≠ payee asset (Ch13)
   │  gate (Ch8/10)       → assertBroadcastAllowed(): unknown chain / bad address ⇒ refuse
   │  device-sign (Ch8)   → the key signs in-browser; the AI never signs
   │  broadcast → settle  → real tx hash, honest confirm/fail
```

### 2. The resolution ladder — what ships today

The wallet resolves a recipient through an ordered ladder, cheapest and most trusted first. Two of its three
rungs are **shipped and real**; the third is the roadmap this chapter commits to.

| Rung | Source | Status | Where it lives |
|---|---|---|---|
| 1 | **Saved contact** (name → address, this device) | **Shipped** | `apps/web/src/contacts.ts` |
| 2 | **ENS forward resolution** (`name.eth` → EVM address, live) | **Shipped** | `services/api/src/ens.ts` |
| 3 | **Universal payment handle** (`@rahul` / `rahul.intent`, cross-chain) | **Roadmap** | Ch5 §2, §6 |

**Contacts (shipped).** The address book is deliberately humble: it stores only *public* data — a display
name and an address — in `localStorage`, and it never touches keys (`contacts.ts`). Adding a contact runs the
address through `classify()`, which validates it as EVM (`0x`+40 hex), Bitcoin (`bc1`/`tb1`…), or Solana
(base58) before it can be saved, so a typo can't be persisted as a "contact" in the first place. Sending then
uses `resolveContact(name)` — an *exact, case-insensitive* name match to its address. There is no fuzzy
matching, because "did you mean…?" on a money recipient is a spoofing surface, not a feature.

Contacts also power the **chat** path. Before an utterance reaches the planner, `substituteContacts(text)`
rewrites saved names to their addresses using whole-word, case-insensitive, **longest-name-first** matching
(so "alice smith" wins over "alice"). The planner therefore never has to interpret a nickname — it receives a
concrete address, and the ambiguity is resolved *before* the LLM boundary, on deterministic ground. This is
Doctrine #7 in miniature: the AI operates on already-resolved facts, not on trust.

**ENS forward resolution (shipped).** When the recipient looks like `name.eth`, the wallet resolves it live
over Ethereum mainnet. `services/api/src/ens.ts` implements ENSIP-1 `namehash` (recursive keccak-256 over the
reversed labels) and performs the two canonical `eth_call`s: `registry.resolver(node)` to find the resolver,
then `resolver.addr(node)` to read the address record. The important lines are the *negative* ones:
`wordToAddress` returns `null` for a zero or malformed word, a name with no resolver returns `null`, and a
name that fails the `^[a-z0-9-]+…\.eth$` shape check never even hits the network. **A name with no address
record resolves to `null` — never a guessed or placeholder address.** In the web send flow
(`App.tsx`), resolution is debounced (350 ms) and its state is shown honestly the whole time:
`⏳ Resolving ENS…` while in flight, `✓ 0x8ba1…` on success, `✕ No ENS address record` on a null — the last of
which *disables* the Review button, so an unresolved name can never be signed.

Together these are the shipped answer to Chapter 5's success criterion: *"Send assets using a contact name
instead of a hexadecimal address."* They ride the same real broadcast path as any other transfer — the
resolved address flows into `sendEvmTransfer` / `sendErc20Transfer` / `sendSol…` / `sendBtc…`
(`broadcast.ts`), each of which calls `assertBroadcastAllowed` and signs in-browser. Send-by-name is not a
mock; it is the production send flow with a friendlier recipient field.

### 3. The anti-spoof confirm — a name is never a spoofing vector

Here is the load-bearing rule of the entire chapter, and the reason username payments can be safe at all:

> **The name is a label; the address is the truth; and the address is *always* shown before the signature.**

Human-readable identity is a convenience layer, and every convenience layer that decides where money goes is
a phishing target. An attacker will register `raḥul.eth` with a Unicode look-alike, or seed your contacts
with a "Rahul" pointing at their own address, or spin up a handle whose *display name* reads "Coinbase". The
defense is not to detect every trick — it is to make the trick irrelevant at the moment of consent. The
wallet's confirm sheet (`App.tsx`, the `tx-review` block) does exactly that:

- It is headed **"Review before signing — this is irreversible."**
- It shows **Amount**, **Network**, and a **To** row that renders **`name → 0xresolved…`** for an ENS send —
  the human name *and* the exact address it resolved to, side by side, in monospace.
- For a contact it shows **`✓ 0x8ba1…f21e · saved contact`** — the resolved address, tagged with the reason
  it's trusted.
- Only after the user reads that address and taps **Confirm & sign** does the device sign.

Comprehension precedes the signature (the UX gate of the Design Review). The user is never asked to trust the
*name*; they are asked to approve the *address*, with the name shown only as the reason they recognize it.
Because resolution is live at send-time, a re-pointed ENS record shows its *current* target — you approve
where the money is going today, not where the name pointed last week.

Benchmarked against the best consumer rails, this is the deliberate difference:

| System | What the payer confirms | Spoofing exposure |
|---|---|---|
| Venmo / Cash App | A **display name + avatar** ("the wrong John") | High — self-asserted identity |
| UPI | A bank-returned **beneficiary name** | Medium — name only, no ground truth shown |
| Lightning / BOLT-11 | An **opaque invoice string** | Low, but unreadable — nothing human to verify |
| **Intent Wallet** | **The resolved on-chain address**, with the name as context | Low — you approve *where funds go*, verifiably |

Venmo optimizes for "looks like my friend"; we optimize for "goes where I confirmed." A verified marker
(`✓`) is only ever shown next to an address the deterministic resolver actually produced — never next to a
raw, unverified name — so the checkmark means *"this resolved,"* not *"this is safe to ignore."*

### 4. The universal payment handle — the roadmap, drawn honestly

Chapter 5 (§2, §6) commits to one identity — `@waquar` or `waquar.intent` — as the *target* mental model.
Today that is **aspirational**: ENS resolves a `.eth` name to a **single EVM address** (our resolver reads the
default `addr(bytes32)` record — coinType 60), and contacts are a per-device list, not a network. A true
universal handle is a distinct, unbuilt product surface, and this chapter must not pretend otherwise. What it
*is* is buildable, and §1 specifies its shape so §2–§5 can lean on it:

- **One handle, resolved per chain.** `@rahul` maps to a *set* of addresses — BTC, SOL, and the universal EVM
  address (Ch5 §3) — and the resolver returns the one the payment's chosen asset needs. The standard already
  exists to model this (ENSIP-9 multi-coin `addr(node, coinType)` via SLIP-44); adopting it extends the
  existing `ens.ts` resolver rather than replacing it.
- **A resolution registry, not a custodian.** A handle registry maps names to *public* address sets and
  signed ownership proofs. It holds **no keys and no funds** — resolving `@rahul` is a public read, exactly
  like an ENS lookup, and the non-custodial guarantee is untouched (Doctrine #1). If any handle design ever
  required the server to hold a secret, it is redesigned, not shipped.
- **Verification status, surfaced.** Ch5 §16 already models a contact's `verification status`; the handle
  layer promotes it to a first-class, *shown* signal — a handle backed by an on-chain proof reads differently
  from an unverified nickname. The marker is descriptive, never a license to skip the address.

Crucially, **none of this changes the anti-spoof confirm.** A universal handle is one more rung on the
resolution ladder; the address it produces is still rendered in full on the review sheet, still gated, still
device-signed. The handle makes recipients friendlier; it never makes the confirm shorter.

### 5. Where the gate and the signature are

Two invariants make username payments safe regardless of how the recipient was named:

1. **The deterministic gate can only refuse.** Every broadcast in `broadcast.ts` calls
   `assertBroadcastAllowed(guardInput(chain, to, ack))` *after* resolution and *before* signing. An unknown
   chain, a malformed resolved address, or an unacknowledged mainnet/high-value send is blocked — fail closed
   (Doctrine #5). Resolution feeds the gate; it can never bypass it.
2. **The device signs; the AI does not.** `signEvmTransaction` / `signBitcoinPsbt` / `signSolanaMessage` run
   in-browser with the user's key (Doctrine #2). The planner and the LLM *propose* a recipient; only the
   on-device signature *disposes* of funds, and only after the address has been shown and confirmed. This
   whole decision — resolved recipient, verdict, and outcome — is auditable (Doctrine #8).

### 6. The honest split, and the hand-off

| Capability | Status |
|---|---|
| Send by **saved contact** name (send flow + chat substitution) | **Shipped** — `contacts.ts` |
| Send by **ENS** name (`name.eth`, live mainnet forward resolution) | **Shipped** — `ens.ts`, `App.tsx` |
| Resolved-address **anti-spoof confirm** (name → 0x…, verified marker, irreversible warning) | **Shipped** — `App.tsx` `tx-review` |
| **Universal handle** `@rahul` resolving per-chain (BTC/SOL/EVM) | **Roadmap** — Ch5 §2/§6 |
| Multi-coin name records (ENSIP-9 / SLIP-44) | **Roadmap** |
| Handle **registry** with signed ownership + surfaced verification | **Roadmap** |

The line to hold: **the rails to pay a person exist and are real** — a first-time user can already type
`rahul.eth` or a saved name and have the device sign a genuine transfer — **but the universal, cross-chain
payment handle is a product we have specified, not shipped.** Naming a recipient never weakens the gate, and
convenience never precedes the confirmed address.

From this foundation, §2 turns the *recipient* into a shareable **payment request** — a universal QR and
payment link that carries the resolved identity, an optional amount, and a memo; §5 formalizes the
**invoice**; and §9's Definition of Done holds all of them to the same non-custodial, device-signs, honest-
confirm standard proven here. Whoever you are paying, and however you named them, the money still leaves only
for the address you read and approved.
## §2 · Universal QR & Payment Links

A transfer and a request are not the same act. In §1 the *payer* starts — they know the recipient
and say "send." Here the *recipient* starts: they publish an invitation to be paid, and the payer
merely accepts it. That inversion is the whole point of a payment network. UPI's collect request,
a Venmo/Cash App "request," a Stripe payment link, a Lightning BOLT‑11 invoice, an EIP‑681
`ethereum:` URI, a Solana Pay `solana:` link — all of them encode *recipient + asset + amount +
reference* so the payer can scan or tap and simply confirm. Intent Wallet must speak this language
too. But it must speak it under our doctrine: **a scanned or linked request is a proposal, never a
command.** It takes the same road every payment takes — parse → plan → gate → device‑sign →
broadcast → settle — and the deterministic gate can still only refuse. A malicious QR cannot move a
satoshi on its own.

This section covers three things at three different maturities: the **receive QR** that ships today
(real code, in `apps/web`), the **universal payment‑request format** that encodes an *ask* into a QR
or deep link (roadmap), and **payment links** — a URL that opens the wallet to a pre‑filled,
still‑user‑approved payment (roadmap). Recurring/subscription requests belong to §4, invoices to §5;
the full adversarial boundary is §9. We stay in our lane.

### What ships today — the receive QR (real)

Tap **Receive** and the wallet shows a per‑chain address with a scannable code. This is real, and it
is honest. `ReceiveModal` (`apps/web/src/App.tsx`) presents three tabs — `evm` / `sol` / `btc` —
each rendering the wallet's own public address for that ecosystem: the universal EVM address on
Sepolia, the Solana address on devnet, the P2WPKH testnet address (`btcTestnetAddress()`). The `QR`
component (same file) generates the code **entirely in‑browser** with the `qrcode` library
(`QRCode.toDataURL`, error‑correction level `M`, 176 px) — no external service is contacted, so an
address is never leaked to a QR‑as‑a‑service endpoint. The address is copyable, the network is
labelled with its icon, and the modal states the one truth that matters: *"Only send Sepolia testnet
assets to this address."* That line is doctrine #3 in miniature — testnet is labelled testnet, and
we never imply mainnet where there is none.

Notice precisely what that QR encodes: **a bare address string and nothing else** — `QR value={address}`.
It is the BIP‑21 base case (`bitcoin:<addr>`) without even the URI scheme. The payer must already
know *which* asset to send and *how much*, and must type the amount themselves. That is fine for
"fund my wallet," which is what Receive is for. It is not yet a payment *request*. The wallet cannot
say "pay me exactly 25 USDC for invoice #814," because the code carries no asset, no amount, and no
memo. Closing that gap — without ever weakening the guarantee that the payer's device disposes — is
the roadmap below.

### The gap — an address is not an ask

Benchmark the field and the shape of what's missing becomes obvious:

| System | Carrier | Encodes | Payer experience |
|---|---|---|---|
| **UPI** (India) | QR / handle | payee VPA + (optional) amount + note | Scan → PIN → done |
| **Venmo / Cash App** | in‑app request / $cashtag link | payee + amount + note | Tap request → confirm |
| **Stripe** | payment link (URL) | merchant + line items + amount | Open URL → pay |
| **Lightning BOLT‑11** | QR / `lnbc…` invoice | node + amount + payment hash + expiry | Scan → confirm |
| **EIP‑681** | `ethereum:` URI | chain + recipient + value / token + calldata | Scan → confirm in wallet |
| **Solana Pay** | `solana:` URI / tx request | recipient + amount + SPL mint + reference + memo | Scan → approve |
| **Intent Wallet today** | QR | **address only** | Scan → *type amount yourself* |

Every mature network encodes the *ask*. Ours encodes the *destination*. The universal
payment‑request format fills the difference — and, because we already resolve usernames and ENS (§1;
`services/api/src/ens.ts`), we can make the recipient a *name* rather than a hex string in the common
case, which none of the address‑URI standards do cleanly.

### The universal payment‑request format (roadmap)

**A payment request is an intent, serialized.** We define one canonical object — the Payment Request
— and two carriers for it: a **QR** (in‑person, offline‑friendly) and a **payment link** (a URL,
shareable over any channel). Both decode to the same object, which is fed into the same intent
pipeline (Ch7) as if the user had typed the sentence themselves.

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | username \| ENS \| address | ✓ | Resolved via §1 / `ens.ts`; the human‑readable form is preferred and shown verbatim on the confirm sheet. |
| `asset` | symbol + chain | ✓ | e.g. `USDC@base`. Unknown/unpriced asset → **fail closed** (doctrine #5), request rejected before any sheet. |
| `amount` | integer **bigint**, base units | optional | Omitted ⇒ payer‑chooses (a "tip jar"). Never a float (doctrine #4). |
| `memo` | short UTF‑8 string | optional | Human note; shown, never executed. |
| `reference` | opaque id | optional | Merchant/invoice correlation id (used by §3/§5 to match a settlement to an order). |
| `expiry` | unix seconds | optional | Past‑expiry request is refused, not silently paid. |
| `network_hint` | chain id | optional | A *hint*; the router (Ch13) may convert/route. Cross‑chain conversion is a plan step, gated like any other. |

**Encoding.** We do not invent an incompatible dialect where a standard already exists — we *emit
the native standard per chain* and wrap them under one scheme for the cross‑chain/username case:

- **EVM** → emit an **EIP‑681** URI: `ethereum:0x…@8453/transfer?address=0x…&uint256=25000000` for a
  USDC ask on Base. Any EIP‑681‑aware wallet can also read it; ours reads it *and* applies our gate.
- **Solana** → emit a **Solana Pay** URI: `solana:<recipient>?amount=25&spl-token=<mint>&reference=<pubkey>&memo=…`.
- **Bitcoin** → emit a **BIP‑21** URI: `bitcoin:tb1q…?amount=0.0004&label=…`.
- **Universal / by‑name** → our own `intent://pay?to=@merchant&asset=USDC&amount=25&ref=814` deep
  link, which resolves the username (§1), picks the ecosystem, and *degrades* to the appropriate
  native URI above once the concrete recipient address is known.

A QR simply carries whichever of these strings applies, generated in‑browser exactly as the receive
QR is today — the same `qrcode` path, no server round‑trip, extended from "encode an address" to
"encode a request."

> **Honesty tag.** None of the request‑format machinery ships today. What ships is the address‑only
> receive QR above and the send/gate/sign path below. "The rails exist" — real broadcast, real ENS
> resolution, a real gate — is *not* the same as "the payment‑request product ships." This subsection
> is roadmap and is labelled as such wherever it is surfaced.

### From scan to signature — the request is a proposal

Here is the load‑bearing rule, and where the doctrine lives. When the wallet scans a QR or opens a
payment link, it holds **untrusted input**. It does exactly what it would do with a sentence the user
typed — no more authority, no shortcut:

1. **Parse (untrusted).** Decode the URI into a candidate Payment Request. Reject malformed input,
   unknown schemes, unknown chains, and unpriced assets *before anything is shown* — fail closed.
2. **Resolve.** Turn `to` into a concrete address via the same resolver used for typed sends
   (`makeEnsResolver` in `ens.ts` returns `null` for a name with no record — never a guessed
   address, so a request to a non‑existent name fails honestly rather than sending into the void).
3. **Plan.** Hand the intent to the planner (Ch7 → Ch8). If the payer holds a different asset than
   asked, the liquidity engine (Ch13) proposes a conversion *as an explicit plan step*, priced with a
   real quote — never a borrowed number.
4. **Gate.** The plan passes through the same deterministic broadcast gate every transfer uses today
   — `assertBroadcastAllowed` (`broadcast.ts`). The gate validates the recipient, enforces the
   testnet/mainnet boundary, and applies the mainnet spend cap. **It can only refuse.** A QR cannot
   grant itself an exception.
5. **Confirm — honestly.** The confirm sheet (the transaction preview shipped for typed sends) shows
   **recipient + amount + fee**, in the request's own human terms, with the amount held as a bigint
   and formatted only at the edge. The payer can **edit the amount** (the request's figure is a
   suggestion, not a lock) and must read the recipient. Comprehension precedes signature (doctrine
   #6, Design Review Gate check #2).
6. **Device signs → broadcast → settle.** Only the on‑device signature disposes of funds
   (`signEvmTransaction` / `signSolanaMessage` / `signBitcoinPsbt`, all in‑browser and non‑custodial).
   The request never signs anything; it only ever *fills a form the user still approves.*

The single most important sentence in this section: **a scanned or linked request can never
auto‑send.** There is no code path from "QR decoded" to "transaction broadcast" that does not pass
through the gate and a human signature. This is the same guarantee as a typed send — we are adding a
faster way to *populate* an intent, not a new way to *authorize* one.

### Payment links (roadmap)

A payment link is the same Payment Request carried by a **URL** instead of a camera. Someone pastes
`https://intentwallet.app/pay/814` (or the `intent://pay?…` deep link) into a chat, an email, or an
SMS; opening it launches the wallet to a **pre‑filled confirm sheet** for the encoded ask. Two
platform carriers, one behavior:

- **Deep link** (`intent://pay?…`) — opens the installed app directly.
- **Universal / App Link** (`https://…/pay/…`) — opens the app if installed, else a web fallback page
  that explains the request and offers to open/install; it **never** collects funds itself and never
  asks for a key.

The link is subject to every step above — parse, resolve, plan, gate, confirm, sign. A link that
arrives from an untrusted channel is treated as exactly that: untrusted. Per the privacy rules, the
wallet **never auto‑submits** a payment reached via a link, and never routes funds to a recipient the
link *added* beyond what the user reads and approves on the sheet. Standing/recurring links
(subscriptions) are §4; per‑item invoice links are §5; merchant‑generated point‑of‑sale codes are
§3. Here we define only the primitive they all reuse.

### The safety boundary (summary; full DoD in §9)

A payment request widens the attack surface precisely because it lets a *stranger* pre‑fill a
payer's intent. The threat model, and the defense each threat meets:

| Threat | Defense |
|---|---|
| **Swapped‑address QR** (attacker pastes their address over a merchant's) | Recipient shown verbatim on the confirm sheet; where `to` is a username/ENS, the *name* is shown and resolved live — a swapped hex address reads as a stranger, not the expected merchant. |
| **Amount inflation** (link says $25, encodes $2,500) | Amount is a suggestion, editable, shown as an exact bigint; the fee and total are recomputed and displayed honestly before signing. |
| **Homograph / look‑alike name** | §1's identity rules (confusable‑name checks) apply to the resolved recipient before the sheet renders. |
| **Expired / replayed request** | `expiry` enforced at parse; a stale request is refused, not paid. |
| **Auto‑execute attempt** (URI with extra calldata / a "just sign" flag) | Ignored — there is no auto‑sign path; arbitrary EVM `calldata` in an EIP‑681 request is surfaced as a contract interaction and risk‑scored (Ch10), not silently signed. |
| **Off‑domain link exfiltration** | The wallet never posts user data to endpoints named by the link; resolution and broadcast use the wallet's own configured nodes. |
| **Unknown chain / unpriced asset** | Fail closed at parse — no sheet is shown for something the wallet cannot price or verify. |

Every one of these decisions — refusal, conversion, high‑value confirmation — is logged with its
inputs and reason (doctrine #8), so a disputed payment can be reconstructed exactly.

### Definition of done (this slice)

- The **receive QR** stays honest: per‑chain, in‑browser‑generated, network‑labelled, address‑only
  until the request format ships — no faked "amount requested" that the code doesn't encode.
- The **Payment Request** object is one canonical schema with amounts as **bigint base units**,
  emitting native EIP‑681 / Solana Pay / BIP‑21 per chain and `intent://pay` for the by‑name and
  cross‑chain case.
- A scanned/linked request **always** flows parse → resolve → plan → **gate** → confirm → **device
  sign**; there is **no** path that broadcasts without the on‑device signature.
- The confirm sheet shows **recipient + amount + fee** truthfully; the amount is **editable**; a
  network failure during resolution or quoting is shown as a failure, never as a $0 or a fake success.
- Unknown chain, unpriced asset, unresolvable name, and expired request all **fail closed** and are
  audited.

The receive QR is real today; the request format and payment links are the roadmap that turns "here's
my address" into "pay me exactly this" — without ever letting a code, a link, or a stranger sign for
the user. Merchant POS (§3), recurring (§4), and invoices (§5) are all built on this one primitive.
## §3 · Merchant Mode & POS

> *"A merchant does not want a payment processor. A merchant wants the money — in
> their account, in seconds, with no one standing between the cash register and the
> till. The radical thing crypto can offer the corner shop is not lower fees. It is
> that there is no middle. We must never become the middle."*
> — the Chief Product Officer

Every section in this chapter turns one shipped primitive — *send* and *receive* on real
rails — into a product. §1 turned it into human names. §2 turned it into a universal QR and
a payment link. This section turns it around: instead of *you* paying *someone*, it lets
*someone* pay *you* — in a shop, at a market stall, across a café counter. That is merchant
mode, and its entire promise rests on a single sentence we will repeat until it is boring:
**the money lands in the merchant's own wallet, signed by the customer's own device, and no
platform account — least of all ours — ever holds it in between.** Stripe, Square, and every
card network are custodial by construction: funds transit their ledger, they take a cut, and
settlement to the merchant is a T+2 promise. A merchant-mode payment is instead an **intent
in reverse** — it walks the same `parse → plan → gate → device-sign → broadcast → settle`
path as any send ([Ch7](../bible/chapter-07-universal-intent-engine.md),
[Ch8](../bible/chapter-08-universal-execution-engine.md)), except the amount and destination are
fixed by the merchant up front and the *customer* is the one whose device disposes of funds.

Be scrupulous about status, because this is where a demo is easiest to fake. The **receive
rails are shipped**. Merchant mode and point-of-sale as *products* are **roadmap**. "The rails
exist" is not "the payment product ships," and we will keep that line bright throughout.

---

### §3.1 · What is shipped: the receive rails

A merchant flow is a receive flow with an amount attached and a settlement watcher bolted on.
The receive flow itself is real today. In [`apps/web`](../../apps/web/src/App.tsx), the
`ReceiveModal` renders the wallet's *own* per-chain address — the Universal EVM address, the
Solana address, the Bitcoin P2WPKH address — each with a QR generated **entirely in-browser**
(`QRCode.toDataURL`, no external service, so no address ever leaks to a third party to draw a
picture of it). The addresses are the wallet's public receiving keys, derived on-device
([Ch5 §3](../bible/chapter-05-universal-identity.md)); the BTC address comes from
`btcTestnetAddress()` in [`broadcast.ts`](../../apps/web/src/broadcast.ts). Each tab is
honestly labelled with its network — *"Only send Sepolia testnet assets to this address"* —
because a payment into the wrong network is a lost payment, and honesty about which chain you
are on is a doctrine, not a nicety (#3).

What is *not* yet in that modal is the thing that makes it a merchant tool: **an amount**. The
shipped QR encodes a bare address. It answers *"where do I pay?"* but not *"how much?"*, and it
has no way to tell the merchant that a specific payment for a specific sale has arrived. Closing
those two gaps — amount and settlement detection — is the whole of merchant mode, and both build
directly on primitives we already have.

---

### §3.2 · The merchant intent: receive-with-amount `[ROADMAP]`

Merchant mode is a small, sharp addition to the receive sheet: the merchant types a **price**,
the wallet renders a **payment request** (a QR and a link, in the universal format defined in
§2), the customer scans it, and their device signs. The flow, end to end:

```
MERCHANT                                   CUSTOMER
  enter price  ────────────────►  (request: amount + address + reference)
  show QR / link                            scan
                                            parse   → the same intent parser (Ch7)
                                            plan    → asset, base-unit amount, destination
                                            GATE    → assertBroadcastAllowed(): refuse-only
                                            SIGN    → customer's DEVICE, non-custodial
                                            broadcast
  watch chain for `reference` ◄──────────  on-chain settlement
  "Paid ✓  0.42 USDC"                       (funds now in the MERCHANT's wallet)
```

Two properties of that diagram are load-bearing. First, **the gate sits on the customer's
side**, exactly where it sits for every other send. When the customer's wallet builds the
transaction it calls `assertBroadcastAllowed` — the same deterministic guard used by
`sendEvmTransfer`, `sendSolTransfer`, and `sendBtcTransfer` in
[`broadcast.ts`](../../apps/web/src/broadcast.ts) — which can only **refuse**: a malformed
merchant address, an unknown chain, or a mainnet transfer over the spend cap without an
explicit acknowledgement is blocked before a byte is signed. A merchant cannot craft a payment
request that talks a customer's wallet into skipping its own guard, because the request is
inert data; the customer's gate runs regardless of what the QR claims. Second, **the amount the
customer signs is an integer bigint in base units**, carried through unchanged from the request
to the wire (`decimalToBase` / `parseSats` / `parseLamports`). The merchant may *think* in
"$4.20"; the signed transaction is `4_200_000` base units of a 6-decimal USDC. No float touches
the money path.

The customer's confirm sheet is the honesty checkpoint. Before signing it must show, truthfully:
**who** (the merchant's name from §1 username resolution, or their raw address, never a guessed
label), **how much** (the exact amount, formatted for humans only at the edge), **the network
fee**, and **the network**. A merchant-supplied "memo" or line-item label is displayed as
untrusted, clearly-attributed text — it can inform the customer but can never alter the
recipient or amount the gate verifies. This is the same discipline the confirm sheet already
enforces for a manual send; merchant mode adds no new signing authority, it only pre-fills the
*to* and *amount* fields from a scanned request.

**The payment-request format** is owned by §2 (Universal QR & Payment Links); merchant mode
consumes it and requires three fields §2 leaves optional for a bare address:

| Field | Merchant-mode requirement | Purpose |
|---|---|---|
| `amount` | **required** (base units, bigint) | the price; the gate verifies it, the sheet shows it |
| `recipient` | **required** (merchant's own address / `@username`) | where funds settle — the merchant's wallet, never ours |
| `reference` | **required** (fresh unique id per sale) | lets the merchant detect *this* payment on-chain, custody-free |
| `label` / `memo` | optional, untrusted | shop name, order number — display only |
| `expiry` | optional | reject stale requests; a price quote does not live forever |

The `reference` field is the quiet hero and deserves a benchmark. **Solana Pay** solved
non-custodial settlement detection with exactly this idea: include a unique reference public key
as a read-only account in the transfer, and the merchant can later query the chain for the one
signature that carries it — proving *this* sale was paid without any intermediary ledger. We
adopt that pattern per chain: a reference account on Solana, and on EVM/Bitcoin a per-sale fresh
HD-derived receiving address (so the arriving amount at a never-before-used address is itself the
match). Both mean settlement is *read off the chain*, never off a platform's books. This is how a
merchant can be paid with no processor — the analogue of a **UPI collect request** or a
**Lightning BOLT-11 invoice**, but where the value moves directly wallet-to-wallet and the
"invoice paid" event is a chain query, not a bank webhook.

---

### §3.3 · Point-of-sale integration `[ROADMAP]`

Merchant mode above is for a human holding a phone. Point-of-sale is for a business with a
counter, a catalogue, and a till — and it is a genuinely larger surface, all of it roadmap.
The shape we are aiming at is a **checkout SDK**, the crypto-native sibling of Stripe Terminal
and Square, with one inversion at its heart: the terminal never touches keys or funds. It only
*renders a request and watches the chain*.

A POS terminal (a tablet app, a dedicated device, or a `<button>` on a web checkout) would:

1. Ask the merchant's backend to mint a payment request for the cart total, against a
   **fresh receiving address the merchant controls** (HD-derived from the merchant's own seed,
   [Ch5](../bible/chapter-05-universal-identity.md)) — so each sale is isolated and self-matching.
2. Display the request as a QR the customer scans with any conforming wallet (ours, or any
   wallet that speaks the §2 format — this must be an open format, not a walled garden).
3. Subscribe to the chain for that address/reference and flip to **"Paid ✓"** the moment a
   confirming transaction for the exact amount lands — driven by the same balance and
   receipt-watching machinery already in [`broadcast.ts`](../../apps/web/src/broadcast.ts)
   (`getEvmTestnetBalance`, the `waitForReceipt` poll loop), generalised into a settlement
   watcher.

The SDK's contract is deliberately thin, and its thinness *is* the security property:

| The checkout SDK holds… | The checkout SDK never holds… |
|---|---|
| The merchant's **public** receiving addresses | The merchant's seed or any private key |
| Payment-request builders (§2 format) | Any authority to move the merchant's funds |
| A chain settlement watcher (read-only) | Custody of a customer's funds mid-payment |
| Webhooks that fire on a confirmed on-chain event | A pooled "platform balance" |

Because the terminal is read-and-render only, a compromised terminal cannot steal a day's
takings — the worst it can do is show a wrong QR, which the customer's own confirm sheet and
gate would surface (unknown recipient) before signing. Contrast the card world, where a tampered
terminal harvests card numbers. Here there is nothing at the terminal worth stealing.

Genuinely hard problems live here and we will not hand-wave them: **offline capture** (a stall
with no signal — deferred to §7, Offline Payment Preparation), **partial/over-payment**
reconciliation, **refunds** (which are simply a merchant-initiated send back — a normal intent),
**tips**, **multi-item receipts**, and **confirmation latency** (a shopper will not wait for
Bitcoin finality — this is why stablecoins on fast chains, or payment-channel rails, matter for
retail, and why the terminal must show an *honest* "confirming…" state, never a premature "Paid").
A network failure while watching for settlement is shown as *"couldn't confirm — check the
explorer,"* never as a fake success (#3). These are product problems, sequenced on the roadmap;
none of them require the wallet to become custodial, and if any proposed solution did, it would
be redesigned rather than shipped.

---

### §3.4 · Fiat pricing display `[ROADMAP]`

A merchant prices in dollars, rupees, or naira — not in lamports. So merchant mode must let a
merchant **price in local fiat and settle in crypto**. This is a display-and-quote problem, and
it decomposes into two pieces with very different trust profiles.

The first piece is **pricing**, and it is honest and non-custodial. At request-creation time the
wallet converts "$4.20" into an exact base-unit crypto amount using the price oracle described in
[Ch13](../bible/chapter-13-universal-liquidity-engine.md) — real quotes, never a fabricated rate — and
**freezes that amount into the request** along with the rate and its timestamp. The customer
signs the frozen bigint, not a moving target; the sheet shows both the fiat the merchant asked
for and the crypto being sent, so nobody is surprised. A volatile asset gets a short `expiry` so
a stale quote cannot be paid at yesterday's price. This piece ships when the request format (§2)
and the oracle (Ch13) are wired together — no third party required.

The second piece is **fiat *settlement*** — the merchant wanting actual dollars in a bank
account, not crypto — and here we state the boundary plainly: **a fiat on/off-ramp is a
third-party service (Ramp, MoonPay, Stripe, a licensed exchange) that performs KYC. It is not the
wallet.** When a merchant chooses to auto-convert crypto takings to fiat, they are opting into a
regulated counterparty who will verify their identity and hold fiat on their behalf. The wallet's
core stays **non-custodial and KYC-free**: it receives crypto to the merchant's own address, and
*then*, only if the merchant asks, hands that crypto to a ramp the merchant has separately
onboarded with. We integrate ramps as clearly-labelled, opt-in exits, never as a silent custodial
layer the merchant didn't know they were standing on. The customer paying at the counter is never
touched by any of this — they sent crypto to a wallet, full stop.

---

### §3.5 · The non-custodial invariant, restated for money coming *in*

Everywhere else in the product the doctrine protects money going *out*. Merchant mode is the one
surface about money coming *in*, and the invariant flips to match without weakening:

- **Funds settle to the merchant's own wallet address**, derived from the merchant's own
  on-device seed. There is no platform account, no pooled balance, no "Intent Wallet holds your
  takings until payout." A payout is instantaneous because there is nothing to pay out from — the
  money was never anywhere but the merchant's wallet.
- **The customer's device signs.** The gate on the customer's side can only refuse. A payment
  request is inert data that pre-fills a confirm sheet; it grants no authority.
- **Settlement is a chain fact, not a ledger entry.** "Paid ✓" is earned by a confirmed
  transaction carrying the sale's `reference`, read off the chain. A watcher that cannot reach the
  chain says so; it never invents a settlement (#3). Every settlement event is auditable back to
  its txid (#8).
- **Money is bigint** from the merchant's typed price, through the frozen request amount, to the
  signed wire value. Fiat is a display and a quote; the settled thing is always integer base units.

### Definition of done — status ledger

| Capability | Status | Anchor |
|---|---|---|
| Receive with per-chain QR (bare address) | **Shipped** | `ReceiveModal`, `QR` in [`App.tsx`](../../apps/web/src/App.tsx) |
| Real on-chain settlement to the wallet's own address | **Shipped** (testnet + guarded mainnet ETH) | [`broadcast.ts`](../../apps/web/src/broadcast.ts) |
| Merchant "enter a price → payment request" | **Roadmap** | consumes §2 format |
| On-chain settlement detection via `reference` | **Roadmap** | Solana Pay pattern; generalises `waitForReceipt` |
| Checkout SDK / POS terminal (read-and-render) | **Roadmap** | §3.3 |
| Fiat pricing display (price in fiat, settle in crypto) | **Roadmap** | oracle from [Ch13](../bible/chapter-13-universal-liquidity-engine.md) |
| Fiat settlement to a bank | **Roadmap — third-party KYC ramp**, opt-in | not the wallet's core |

Merchant mode leans on its neighbours and should be read with them: **§1** gives the merchant a
human `@name` to be paid at instead of a hex string; **§2** owns the QR and payment-link format
this section consumes; recurring merchant billing (a gym membership, a SaaS seat) belongs to
**§4** and per-sale invoices to **§5**; a customer paying in a currency the merchant doesn't hold
is the multi-currency settlement problem of **§6**; the offline stall is **§7**; the merchant's
"what did I take today" dashboard is **§8**; and the boundary that binds all of it — that none of
these products may ever quietly make us custodial — is restated as the chapter's law in **§9**.
## §4 · Salary, Subscriptions & Recurring Payments

A repeating payment is the surface where a wallet is most tempted to betray its own doctrine. To pay rent
"automatically," to run payroll on the first of the month, to let a service charge you every 30 days — the
lazy engineering answer is to hand something a standing mandate: an open-ended pull, an unlimited token
approval, a server that holds the float and moves it on a timer. That is how the rest of the industry does
it, and it is exactly what we refuse. **A recurring payment is not a new primitive. It is a standing
*authorization* over a stream of ordinary intents** — and every one of those intents still takes the same
path as a single send (parse → plan → gate → device-sign → broadcast → settle, per Ch7/Ch8) under the same
non-custodial guarantee: no server ever holds the user's funds or keys.

Recurring payments are built on the **Automation Engine (Ch14)**, whose one law is absolute and governs this
entire section: **automation depth = authorization depth.** Nothing ever runs beyond a permission the user
cryptographically granted — bounded, capped, expiring, revocable — and the AI never signs. This section
specifies how that law becomes recurring transfers, one-to-many salary distribution, and
subscription-style pull-with-consent, and it is scrupulously honest about the line between what ships today
and what is roadmap.

### The grant: a bounded standing permission, never a mandate

The authorization primitive already exists in the codebase as a pure, fail-closed core:
[`packages/policy/src/grants.ts`](../../packages/policy/src/grants.ts) — `evaluateSpendGrant`, over the
`SpendGrant` type. **This is shipped.** A grant is a permission a human approves once — *"this may spend up
to N of asset X, only to these recipients, until time T"* — and it is deliberately not a wallet: it holds no
key and can only *authorize a spend that already fits inside it,* never move funds on its own.

The envelope is small on purpose. Every field is a fence:

| Field | Meaning | Why it bounds abuse |
|---|---|---|
| `asset` | the **single** asset authorized (matched case-insensitively) | a rent grant can never buy BTC — `WRONG_ASSET` |
| `maxTotalBase` | cumulative ceiling across the whole grant, **base units (bigint)** | the lifetime cap — the running total can never cross it |
| `maxPerTxBase?` | optional per-transaction ceiling, base units | bounds any single run — one debit can't drain the envelope |
| `allowlist` | recipients the grant may pay; **empty ⇒ nobody** | payment is address-scoped, not open — `RECIPIENT_NOT_ALLOWLISTED` |
| `notAfterMs` | expiry (unix ms) | a grant is dead at its horizon — `EXPIRED`, no silent renewal |
| `revoked?` | hard kill-switch | a revoked grant authorizes nothing, whatever else is true |

`evaluateSpendGrant(grant, spentBase, req)` is the gate: it takes the grant, *how much has already been spent
under it*, and one proposed spend, and returns `{ ok: true, remainingBase }` or `{ ok: false, code, reason }`.
It is deterministic over an injected `nowMs`, never reads a clock, never throws, and every path returns a
verdict. Its denial codes are the vocabulary of refusal — `MALFORMED · REVOKED · EXPIRED · WRONG_ASSET ·
RECIPIENT_NOT_ALLOWLISTED · OVER_PER_TX_CAP · OVER_TOTAL_CAP`. Money is integer bigint end-to-end; the cap
check is literally `spentBase + req.amountBase > grant.maxTotalBase`, in base units, with no float anywhere.

Benchmark this against how recurring authorization is done elsewhere, because the contrast *is* the product:

- **Card-on-file / standing instruction** and **ACH direct debit** hand the merchant an open-ended pull with
  weak per-debit bounds and clumsy, bank-mediated revocation. Our grant caps every debit *and* the lifetime
  total, scopes it to one address, expires on its own, and revokes instantly and unilaterally on-device.
- **UPI AutoPay / e-mandates** are genuinely good — merchant-initiated, capped, revocable — but the *bank*
  holds the mandate. Here the user holds the capability and the wallet enforces it; there is no custodial
  intermediary to compromise or to lie about a charge.
- **An unlimited ERC-20 approval** (`approve(spender, 2^256−1)`) is the crypto-native open mandate, and its
  most dangerous foot-gun. We already treat any allowance `≥ 2^255` as effectively infinite and ship a
  one-click revoke to `approve(spender, 0)` — see `UNLIMITED_ALLOWANCE`, `readErc20Allowance`, and
  `sendRevokeApproval` in [`apps/web/src/broadcast.ts`](../../apps/web/src/broadcast.ts). **A grant is the
  disciplined inverse of that approval:** the *wallet*, not the token contract, enforces the ceiling; it is
  per-recipient, per-period, and expiring; and it never delegates spending authority it can't take back.

### A recurring run *is* an intent — where the gate and the signature are

Nothing about repetition bypasses the intent or security engines. When a schedule fires, the engine does not
"execute a payment"; it *proposes an intent* and lets the same deterministic machinery dispose of it:

```
schedule fires (time / balance trigger, Ch14)
  → build the run intent  { asset, amountBase, to, nowMs }        ← money is bigint
  → evaluateSpendGrant(grant, spentBase, req)                      ← is it INSIDE the envelope? (fail-closed)
        ok:false → refuse + log the denial code, do NOT retry blindly
  → Risk + Policy gate (Ch10) on the concrete run                 ← the same gate a manual send passes
  → DISPOSE:  device signature  (today)   OR   bounded session key within caps  (roadmap)
  → broadcast + settle  (executeTransferStep, broadcast.ts)       ← real, non-custodial, honest fee
  → spentBase += amountBase; append to the audit ledger (Ch14 §15)
```

Two things about that flow are non-negotiable. First, the grant gate is *in addition to* the normal gate, not
a replacement for it: `evaluateSpendGrant` answers "is this inside what the user authorized?" and the Risk +
Policy engines still answer "is this individual transfer safe?" — a recipient the user allowlisted can still
be flagged, and a fine-print run can still be blocked. Second, **the disposer is always a signature the user
controls, never the AI.** Today that is a **device signature per run** — Ch14's Approval Level 2, the
*"Execute today's transfer?"* quick-confirm — which is fully honest and needs nothing new: the recurring
intent is already typed (below), and the confirm sheet shows recipient + amount + fee exactly as a single
send does. The **roadmap** upgrade is a **bounded session key**: a key derived on-device whose authority is
scoped *to the grant itself* (its asset, caps, allowlist, and expiry), so runs that fall inside the envelope
need no per-tap confirmation (Approval Level 1, "fully automatic within caps"). The session key never touches
a server and, crucially, *cannot sign outside the grant* — it is the cap made cryptographic. Session keys are
explicitly roadmap per Ch14's Definition of Done; until they ship, "recurring" means "quick-confirm each run,"
and we say so.

### The three products

**1 · Recurring transfers (one-to-one)** — *"pay rent every month," "send $50 of ETH to savings every
Monday."* The intent layer already models this. `parseRecurring` in
[`packages/intents/src/parse/deterministic.ts`](../../packages/intents/src/parse/deterministic.ts) turns
*"buy $50 of ETH every Monday"* into a typed `recurring` intent — `{ kind: 'recurring', schedule, inner }`,
where `schedule` is `{ every: 'day' | 'week' | 'month', on? }` (`ScheduleSchema`) and `inner` is a `Buy`,
`Swap`, or `Transfer` (`packages/intents/src/schema.ts`). The planner maps it to an `automation` outcome
([`plan/planner.ts`](../../packages/intents/src/plan/planner.ts)), and the web app surfaces it honestly:
*"This becomes a recurring rule"* ([`apps/web/src/App.tsx`](../../apps/web/src/App.tsx), the `automation`
case). A recurring transfer is then a grant whose `allowlist` is the single recipient (resolved once, by
username/ENS/contact — §1, and `services/api/src/ens.ts`), `maxPerTxBase` is the payment amount, and
`maxTotalBase` bounds the committed runway (e.g. twelve months of rent, or a user-set ceiling), with
`notAfterMs` the horizon. **Shipped:** the parse, the typed intent, the automation outcome, the grant gate,
and the real single-run broadcast path. **Roadmap:** the live scheduler that fires the run on time and the
grant-issuance ceremony — today the recurring intent is *typed but not broadcast on a timer* (see honest
status).

**2 · Salary distribution (one-to-many)** — *"pay the team on the 1st." — Roadmap.* Payroll is a fan-out: one
trigger expands to *N* transfer intents, one per employee, and each leg passes the grant gate and the security
gate independently. The grant models it directly — the `allowlist` holds the whole payroll roster,
`maxPerTxBase` bounds any single salary (so a typo can't 10× someone), and `maxTotalBase` bounds the entire
run (so the payroll can never exceed the funded, authorized envelope even if the roster is tampered with). The
benchmark is Stripe Connect payouts and ACH batch credit — but non-custodially: **no server ever holds the
payroll float**, because there is no server that holds funds; the device (or, on the roadmap, the bounded
session key) signs each leg, and settlement is real on-chain, not an internal ledger move. Failure handling
follows Ch14 §16 exactly: a failed leg is preserved and explained, never retried into a **duplicate
irreversible transfer**, and — per Doctrine #3 — a network failure on leg 7 is reported as a failure, never
papered over as success. Employees are paid to a username/ENS, not a hex string (§1), so the roster is
human-readable and re-verifiable. What's real underneath is the per-leg transfer (`executeTransferStep`); the
one-to-many orchestration, the roster/allowlist management, and the run UI are the roadmap product surface.

**3 · Subscription management (recurring pull-with-consent)** — *"let this service charge me monthly." —
Roadmap.* This is where our model most sharply inverts the incumbent one. In the card, ACH, and UPI-AutoPay
worlds, "subscription" means the *merchant* holds a mandate and *pulls*; the user's protection is a promise
and a support ticket. Here **there is no merchant-held mandate at all.** The "pull" is a **scoped grant the
user holds and the wallet enforces**: the merchant may *request* a charge (via the payment-request / invoice
rails of §5 and the merchant surface of §3), but the wallet only pays a request that falls inside the
grant — the merchant's own address on the `allowlist`, the amount within `maxPerTxBase`, the cumulative draw
within `maxTotalBase`, before `notAfterMs`, and not `revoked`. A merchant that tries to charge twice, or more,
or a different asset, or after cancellation, is refused by `evaluateSpendGrant` with a precise denial code —
deterministically, on the user's device, with no appeal to a bank. **Cancellation is unilateral and instant:**
setting `revoked` (or letting the grant expire) kills all future pulls, the on-chain analogue of the
`sendRevokeApproval` we already ship. A subscription grant is naturally period-shaped — a per-period cap plus
a total cap plus an expiry — which is what makes *"$9.99/mo, capped, ends in a year, cancel anytime for real"*
an enforceable guarantee rather than a marketing line.

### The hard rule, and the honest status

The line that governs all three products is one sentence: **a subscription can never debit beyond the granted
cap, and neither can a salary run or a recurring transfer — because automation depth equals authorization
depth.** The cap is not a UI hint; it is `spentBase + amountBase > maxTotalBase` in a pure, total,
fail-closed function that the AI cannot talk its way past and a merchant cannot pull past. Comprehension
precedes the signature that *creates* the grant: the issuance confirm sheet shows the full envelope — asset,
per-transaction cap, cumulative cap, the allowlist, and the expiry — in the same honest register as a send's
recipient/amount/fee, so the user is signing a *bounded* authorization they can read, not a blank cheque. And
everything is auditable (Doctrine #8): every run is logged with its trigger, result, fee, and route (Ch14
§15), and the running `spentBase` *is* the audit ledger against the cap — you can always see how much of the
grant has been consumed and how much remains (`remainingBase`).

| Capability | Status |
|---|---|
| `recurring` intent — parse, `ScheduleSchema`, typed `{ schedule, inner }` | **Shipped** (`intents/schema.ts`, `parse/deterministic.ts`) |
| Planner → `automation` outcome; web surfaces *"becomes a recurring rule"* | **Shipped** (`intents/plan/planner.ts`, `App.tsx`) |
| Spend-grant gate — cap / per-tx / allowlist / expiry / revoke, bigint, fail-closed | **Shipped** (`policy/src/grants.ts`, `evaluateSpendGrant`) |
| Automation engine — scheduler, safety, gate, simulate primitives | **Shipped** (`packages/automation`) |
| Real single-run broadcast (native + token, non-custodial) | **Shipped** (`apps/web/src/broadcast.ts`, `executeTransferStep`) |
| Send-by-name for recipients/roster (ENS + contacts) | **Shipped** (`services/api/src/ens.ts`, §1) |
| Unlimited-allowance detection + one-click revoke | **Shipped** (`broadcast.ts`, `sendRevokeApproval`) |
| Live scheduler that *fires* a recurring intent on time and broadcasts it | **Roadmap** — today the recurring intent is typed but not timer-broadcast |
| Grant-issuance ceremony (sign the envelope) + session keys (auto-run within caps) | **Roadmap** (Ch14 DoD) |
| Salary one-to-many product (roster, fan-out, run UI) | **Roadmap** |
| Subscription pull-with-consent product (merchant request → capped grant) | **Roadmap** |

The honest one-liner we owe the reader: **the rails are real, the grant gate is real, the single payment is
real — the *recurring product* is not shipped yet.** A recurring intent today is a typed, planned, gate-ready
object with an honest "this becomes a recurring rule" status, not a payment a background timer broadcasts on
its own. We build the scheduler, the issuance ceremony, and the session key onto a gate that is already pure,
already capped, and already fail-closed — never the reverse.

The payment *requests* that a subscription or salary run answers are specified in **§5 (Invoices & Payment
Requests)**; the merchant surface that issues them in **§3 (Merchant Mode & POS)**; and the cross-cutting
safety envelope and Definition of Done that every recurring flow must satisfy in **§9 (Safety Boundary &
Definition of Done)**. The invariant they all inherit is this section's: a payment that repeats is still a
chain of intents, each one gated, each one signed by a key the user controls, none of them able to spend a
base unit beyond what the user, once, cryptographically allowed.
## §5 · Invoices & Payment Requests

**Asking to be paid, formally.** §1 gave a person a name and §2 gave a payment a shareable shape — a
universal QR and a payment link. An **invoice** is the next honest step: a *structured, itemized request to
be paid* — payee, line items, amount, currency, due date, memo — that a freelancer sends a client, a landlord
sends a tenant, a business sends a business. This entire section is **🔮 ROADMAP.** It is built directly on
the payment-request format of §2 and settles through the execution engine's settlement verification (Ch8
§17). Nothing here ships today except the primitives it stands on, which are real and cited below.

The doctrinal twist that makes crypto invoicing *safer* than the incumbents is worth stating first, because
it governs the whole design. **An invoice is a request, never a pull.** Stripe can charge a card it has on
file; a direct-debit mandate can drain an account on a schedule. Our invoice can do neither — it carries **no
authority to move the payer's funds.** It is an inert document that *describes* a payment; the payer's own
device is the only thing that can sign one into existence. The payee's wallet never holds the payer's keys,
never holds the payer's funds, and cannot initiate a debit. This is the non-custodial invariant (Doctrine #1,
#2) applied to being-paid: **the issuer proposes an amount; the deterministic gate can only refuse; the
payer's device disposes.** An invoice is thus the *inverse* of a normal send — same rails, same gate, same
signature, but the initiator and the signer are two different people.

---

### What is real vs. what this section adds

The payment *leg* of an invoice — the part where money actually moves — is **shipped and non-custodial
today.** When an invoice is eventually paid, it is paid by exactly the code that already broadcasts a real
transfer: `sendEvmTransfer`, `sendErc20Transfer`, `sendSolTransfer`, `sendSplTransfer`, `sendBtcTransfer` in
`apps/web/src/broadcast.ts`, each signing in-browser and pushing raw bytes to a live node, each fronted by
`assertBroadcastAllowed` (the fail-closed gate). Resolving the payee `@name` or `alice.eth` to an address is
shipped ENS forward resolution (`services/api/src/ens.ts`, Ch5 §3). Rendering an address as a scannable QR
is shipped (`QR()` in `apps/web/src/App.tsx`, generated entirely in-browser via `qrcode`, no external
service). What §5 **adds** on top of those primitives is the *request document* and its *lifecycle* — invoice
generation, the issued→settled state machine, and honest reconciliation. Everything in that list is roadmap.
We tag it plainly and never render an invoice UI for a capability that does not yet settle real money.

---

### The invoice as a structured object

An invoice is a superset of the §2 payment-request: a §2 request says *"pay this address this amount"*; an
invoice wraps that with the commercial context a human and an accountant both need — who is billing, for
what, by when. Money lives as **integer base units (bigint)** end-to-end (Doctrine #4); the decimal `"250.00"`
exists only at the rendering edge, exactly as `decimalToBase`/`baseToDecimal` in `broadcast.ts` already
enforce for sends.

```
Invoice (roadmap — extends the §2 PaymentRequest)
  id             : string        // unique, unguessable — the reconciliation key
  payee          : { name: "@waquar" | "acme.eth", resolvedAddress, chain, asset }
  lineItems      : [{ description, quantity, unitAmount: bigint, amount: bigint }, …]
  amount         : bigint        // Σ line items, in base units — the single source of truth
  asset          : "USDC" | "ETH" | "SOL" | "BTC" | …
  chain          : ChainId       // where settlement is expected
  reference      : bytes32/pubkey// the on-chain tag that lets us match a settlement to THIS invoice
  dueDate        : ISO date | null
  memo           : string        // "Design work, June" — human, never load-bearing for money
  status         : issued | viewed | paid | settled | expired | void
  issuedAt, paidAt, settledAt
```

Two fields carry the doctrine. `amount` is **derived from the line items and stored as bigint** — the UI must
show that the total equals the sum, never a separately-typed figure that could silently disagree. `reference`
is the reconciliation hook, and it is the single hardest engineering problem in the section (below). The
`payee.resolvedAddress` is captured *at issue time* and pinned into the document, so the payer sees — and the
gate checks — the exact address, not a name that could re-resolve to somewhere else between issuing and
paying (the §1 / Ch5 §7 resolution-safety rule).

---

### The shareable surface — link + QR, from §2

An invoice is delivered as a **payment link and a QR**, both produced by §2's universal format. The QR is not
a new mechanism — it is `QR(value)` in `App.tsx` rendering the invoice's canonical URI instead of a bare
address. We benchmark the URI shape against the ecosystem's real standards rather than inventing one:

| Rail | Encodes | We reuse |
|---|---|---|
| **EIP-681** `ethereum:<addr>?value=…` | recipient + amount + chain | the URI grammar for EVM legs |
| **Solana Pay** `solana:<addr>?amount=…&reference=…&label=…` | amount, **reference pubkey**, label, message | the `reference` key — the cleanest match primitive on any chain |
| **BOLT-11** (Lightning) | the *entire* invoice inside a signed payment request | the model of "the invoice is the request," not just an address |
| **UPI** collect-request | payee VPA + amount, pushed to the payer | the *collect* UX — a request that arrives at the payer |
| **Stripe Invoicing** | hosted itemized page, due date, receipt | the itemized document + receipt lifecycle |

The link opens in the payer's wallet and pre-fills the confirm sheet; scanning the QR does the same on mobile.
Crucially, opening a link **prepares** an intent — it never auto-pays. It lands the payer on the honest
confirm sheet (recipient, amount, fee, network) and waits for a signature, exactly as a manually-typed send
does today. A link from an untrusted source is data, not a command: it can propose, and the gate still judges.

---

### The request → pay lifecycle

The lifecycle is a small, honest state machine. Every transition is observable and auditable (Doctrine #8);
no state is ever asserted ahead of the chain.

```
  issued ──(payer opens link/QR)──▶ viewed ──(payer signs)──▶ paid* ──(Ch8 §17 settlement)──▶ settled ──▶ receipt
     │                                                                                            
     ├──(dueDate passes, unpaid)──▶ expired                                                       
     └──(issuer cancels, unpaid)──▶ void                                                          
```

The asterisk on **paid** is the most important honesty rule in the section, so we make it explicit as a
sub-state, not a claim: `paid` means *"a transaction that appears to satisfy this invoice has been broadcast
and seen in the mempool."* It is **pending**, styled as pending, and it is **not** "paid" in the sense a payee
can ship goods against. **`settled` is the only status that means money arrived** — assets received, balances
updated, the outcome achieved, per Ch8 §17: *"Success means the intended outcome was achieved — not just that
a transaction was broadcast."* A network failure between broadcast and settlement is never rendered as a green
"paid"; it is honest pending, or an honest error. This is the invoice-shaped restatement of Doctrine #3.

---

### The payment is an intent — where the gate and the signature live

When the payer taps **Pay**, nothing about the pipeline changes from a normal send. The invoice is *parsed*
into an intent (payee address, asset, `amount` bigint, chain, `reference`), *planned* by the router, *gated*,
*device-signed*, *broadcast*, and *settled* — the universal path this chapter opens with, and Ch7/Ch8 define.
The invoice is merely a pre-filled source of the intent's fields; it grants no privileges.

- **The gate** is `assertBroadcastAllowed(guardInput(chain, payee.resolvedAddress, ack))` — the same
  fail-closed check in `broadcast.ts` that already refuses an unknown chain, a malformed address, or an
  un-acknowledged mainnet spend above the cap. An invoice cannot smuggle a payment past it; a malformed
  `payee.resolvedAddress` in the document is *refused*, not guessed.
- **The signature** is `signEvmTransaction` / `signSolanaMessage` / `signBitcoinPsbt` in the payer's browser,
  with the payer's key, which never leaves the device. The issuer's wallet is not in this call path at all.
- **The confirm sheet** shows the payer the honest three: *recipient* (the pinned address, plus the `@name`
  it resolved to), *amount* (formatted from the bigint), and *network fee* — the same sheet Ch16 §1/§2 and the
  shipped Send flow use. Line items and memo are shown for context; the money is what the gate and the
  signature are computed over.

A payer with an insufficient balance gets the node's real error ("insufficient funds"), never a faked
success — the same property that proves the shipped send path reaches a real chain.

---

### Reconciliation — matching a settlement to an invoice, honestly

Issuing is easy; **knowing an invoice was paid is the hard part**, and doing it honestly is the section's
spine. A blockchain does not know about "invoice #4172." When a transfer lands at the payee's address, the
wallet must decide: *does this settlement satisfy that request?* Getting this wrong in either direction is a
doctrine violation — a false "paid" lies to a payee (Doctrine #3); a missed match strands a real payment.

The match key is `reference`, and the mechanism is chain-specific because the chains genuinely differ:

- **Solana** — the cleanest. Solana Pay's `reference` is a unique public key added as a **read-only,
  non-signer account** to the transfer. It moves no funds and needs no balance, but it makes the transaction
  *findable*: the wallet watches for a confirmed transaction referencing that key, then verifies recipient,
  asset (mint), and `amount` match the invoice. We adopt this directly on top of the shipped `sendSolTransfer`
  / `sendSplTransfer` path.
- **EVM** — a native transfer has no memo field, so the reference cannot ride inside a plain send. The honest
  options, in order of preference: **(a) a unique receiving sub-address per invoice** — deterministically
  derived (an HD index or a counterfactual account) so *which address received* identifies the invoice with
  no ambiguity; **(b)** an ERC-681/contract-call invoice that logs an indexed `reference` event; **(c)** as a
  last resort, a **heuristic** match on `(recipient, asset, amount, time-window)` — which we treat as
  *suggested, requires human confirmation*, never an automatic "settled," because two clients could owe the
  same round number in the same window.
- **Bitcoin** — like EVM's native case: prefer a **unique address per invoice** (a fresh derivation index),
  since attaching arbitrary reference data (OP_RETURN) is coarse and privacy-leaking.
- **Lightning (future)** — the reference *is* the payment hash; BOLT-11 makes the invoice and its proof one
  object. A natural fit if a Lightning leg is ever added.

Whatever the mechanism, reconciliation only ever flips the invoice to **`settled`** after **Ch8 §17
settlement verification** confirms the outcome — sufficient confirmations for the network, balance updated,
activity recorded. Until then the invoice is `paid`-pending. And the amount check is exact and adversarial:

- **Underpayment** → stays *partially paid / unpaid*, shows the shortfall in base units; never "settled."
- **Overpayment** → *settled*, with the surplus surfaced honestly (and, on roadmap, a refund intent offered).
- **Wrong asset / wrong chain** → *not a match*; the funds arrived but this invoice is not satisfied. We say
  so plainly rather than papering a USDC invoice as "paid" by an ETH transfer of coincidentally-similar value.

Every reconciliation decision — matched, partial, mismatched, timed-out — is written to the audit log with
its inputs (the txid, the observed amount, the `reference`, the confirmation count) and its reason, so a
disputed "was this paid?" is answerable from the record, not from a screenshot (Doctrine #8; Ch8 §17).

---

### The receipt

On `settled`, the wallet issues a **receipt**: the invoice, the settling txid, its explorer link (the same
`explorerUrl` the shipped broadcast functions already return), the confirmed amount, and the timestamp. The
receipt is a *proof of a real on-chain event*, not a promise — it exists only because settlement was verified.
Both parties can hold it; neither needed a custodian to vouch for it.

---

### Honest status & definition of done

**Status: 🔮 ROADMAP**, resting on shipped rails. The payment leg (broadcast + gate + device signature),
name→address resolution (ENS), and QR rendering are real today; the invoice document, its lifecycle, and
reconciliation are not built. When invoicing does ship, it is **done** only when:

- an invoice is a **structured, itemized bigint document** rendered as a §2 link + QR, with the payee address
  pinned at issue time;
- paying one is **the universal intent path** — parse → plan → **gate** (`assertBroadcastAllowed`) → **device
  sign** → broadcast → settle — with **no pull authority** anywhere and the issuer never in the signing path;
- an invoice reads **`settled` only after Ch8 §17 settlement**, `paid` is honestly shown as pending, and
  under/over/wrong-asset payments are never disguised as clean matches;
- reconciliation uses a real **`reference`** primitive per chain (Solana reference key, EVM per-invoice
  address / event, BTC per-invoice address), with heuristic matches flagged *needs confirmation*, never
  auto-settled;
- every issue, view, pay, settle, and reconciliation decision is **auditable** with inputs and reason.

**Anti-scope (the founder's no):** no auto-charge and no stored mandate — an invoice can only ever *ask*; no
custodial escrow holding a payer's funds "until release"; no fabricated "paid" badge ahead of settlement; no
fiat figure on an invoice without a labelled, honest conversion (Ch13) and never a fiat *balance* the wallet
does not hold. A fiat-denominated invoice settled to a bank is a **third-party ramp doing KYC** (§6) bolted to
the edge — the wallet's core stays non-custodial and KYC-free. Invoicing makes the wallet a tool for
*getting paid*; it must never become a tool that can *take*.

*Siblings: the link/QR format is §2; recurring invoices (subscriptions, salary) are §4; merchant-scale
issuance and POS are §3; multi-currency and cross-border settlement are §6; the payment analytics that roll
up paid/outstanding/overdue are §8; the safety boundary that binds all nine sections is §9.*
## §6 · Cross-Border Remittances & Multi-Currency Settlement

A migrant worker in Dubai wants to send $500 home to her mother in Manila. Today she walks to a
Western Union counter, pays a fee she cannot see decomposed, accepts an exchange rate marked several
percent off the mid-market, and her mother collects the cash two days later — if the corridor is
open. The World Bank's global average cost of sending $200 across a border sits near **6.3%**, and the
UN's SDG target of 3% has been missed for a decade. This is the single largest, most regressive tax on
the world's poorest people, and it is the clearest place where the doctrine we already built pays a
dividend it was designed for.

Our claim is not "crypto is cheaper" — that is a slogan, and slogans lie. Our claim is narrower and
provable: **a remittance is an intent**, and an intent that converts and moves value already runs on
rails we ship. "Send $500 to my mother" is the same pipeline as every other payment in this chapter —
`parse → plan → gate → device-sign → broadcast → settle` — with two extra planning steps borrowed
wholesale from the **Universal Liquidity Engine (Ch13)**: a possible *conversion* (the sender's asset
→ a stable settlement asset) and a possible *bridge* (chain A → chain B, or corridor A → corridor B).
The engine finds the route; the deterministic gate can only refuse; the device signs. No server ever
holds her funds or her keys. That last sentence is what separates us from every remittance product
that has ever existed, and it is non-negotiable.

### What is real today, and what this section commits to building

Scrupulous honesty first, because a remittance product that overclaims is a fraud on the poorest user
we have. Almost everything in this section is **roadmap**. What is *shipped* is the substrate.

| Capability | Status | Where it lives |
|---|---|---|
| Native + token send with real on-chain broadcast | **Shipped** (testnets; guarded mainnet ETH) | `apps/web/src/broadcast.ts` — `sendEvmTransfer`, `sendSolTransfer`, `sendBtcTransfer`, `sendErc20Transfer` |
| Send-by-name (ENS forward resolution, local contacts) | **Shipped** | `services/api/src/ens.ts`; `apps/web/src/contacts.ts` (Ch5 §3) |
| Real conversion quote + settlement-safe swap | **Shipped** (Sepolia Uniswap v3) | `broadcast.ts` — `quoteSwap`, `sendSwap` |
| Liquidity route discovery (convert / bridge path) | **Shipped scoring; bridge execution roadmap** | Ch13, Volume V |
| Remittance **as a product** (corridor UX, quote card) | **Roadmap** | this section |
| Multi-currency display + settlement (fiat ↔ stablecoin) | **Roadmap** | this section |
| Fiat on/off-ramp (cash in / cash out) | **Roadmap — third-party, not us** | this section, §6.4 |

Read the table honestly: **the rails exist; the product does not.** We can already sign and broadcast a
real USDC transfer on a testnet, resolve `mother.eth` to an address, and quote a real ETH→USDC swap
with a bounded `minReceived`. We cannot today take pesos out of a wall in Manila — and we never will
directly, because the moment we touch fiat we would stop being non-custodial and KYC-free. The
cash-out is a **third party's** job. The rest of this section specifies the product we build on top of
the substrate, and draws the boundary in permanent ink.

### §6.1 · The remittance intent

The user says it the way she thinks it:

> "Send $500 to my mom" · "Send ₹40,000 to Ahmed in Karachi" · "Pay 200 dollars to @rosa every month"

The intent parser (Ch7) extracts `{ verb: send, amount: 500, unit: USD, recipient: "mom" }`. The
recipient resolves through the same identity ladder as every other send — contact → `@username`
(roadmap, Ch5) → ENS → raw address — so the sender never types a 42-character hex string. The
*amount* is where remittance diverges: `500 USD` is a **display currency**, not a settlement asset. The
planner's job is to turn a display currency the sender understands into an on-chain settlement the
recipient can actually receive, and to tell the truth about what that costs.

The plan the Liquidity Engine returns is a route, not a promise:

```
Intent:   send 500 USD  →  mom (resolves to  0x…recipient on Base)
Plan:
  1. price   500 USD           = 500.00 USDC        (oracle, mid-market, timestamped)
  2. source  sender holds ETH  → convert 0.1732 ETH → 501.20 USDC   (Ch13 route, real quote)
  3. bridge  USDC (Arbitrum)   → USDC (Base)         (Ch13 bridge, roadmap)
  4. deliver transfer 500.00 USDC → recipient        (real ERC-20 transfer)
Cost:     network fees 0.31 USDC + route fee 0.90 USDC  =  1.21 USDC  (0.24%)
Receives: 500.00 USDC   ·   ETA ~40s   ·   quote valid 45s
```

Every number in that block is **bigint base units** internally (USDC is 6 decimals; the code path is the
same `decimalToBase` / `baseToDecimal` in `broadcast.ts`), formatted for humans only on the confirm
sheet. The `501.20 USDC` in step 2 is a real `quoteSwap`-style output with a bounded slippage floor —
the honest `minReceived` doctrine from Ch13, never a fabricated estimate. If the corridor cannot be
priced, or the bridge has no route, the plan **fails closed** and says so — exactly as
`executeTransferStep` already refuses an un-wired mainnet ERC-20 rather than guessing an address.

**The gate and the signature sit exactly where they always do.** The route is a proposal; the
deterministic gate (`assertBroadcastAllowed`, plus the risk/policy engines) validates recipient,
chain, caps, and mainnet acknowledgement, and can only *refuse*. The sender then reviews a confirm
sheet and **her device signs each leg** — the conversion swap, the bridge, and the delivery transfer
are separate signed transactions, and the settlement-safe sequencing from `sendSwap` (approve → wait
for receipt → preflight → broadcast) means a leg that would revert fails *cheaply and honestly*
before the next leg fires. There is no "trust us, it'll arrive." There is a chain of signatures the
sender authored and an explorer link for each.

**Benchmark, kept fair.** Against legacy rails this is a different category: Wise made its name by
showing the mid-market rate and a decomposed fee, and we hold ourselves to *that* transparency bar,
not Western Union's opacity. But we do not claim Wise's fiat-out reach — Wise pays into a bank
account; we deliver a stablecoin the recipient must still spend or cash out. Against on-chain peers,
the discipline is the same as UPI's design lesson: the corridor must feel like *one action* even when
three transactions happen underneath, and the fee must be a real number, not "free." Where a
stablecoin corridor genuinely beats 6.3% — many do, at fractions of a percent in network fees — we
show the real comparison with the real fee. Where it does not (a congested L1, a thin bridge), we show
*that* honestly too. **We never print "instant" or "free."** Settlement time is a real estimate with a
range; fees are itemized; the quote has an expiry.

### §6.2 · Multi-currency settlement — display local, settle in stablecoin

The second half of the problem is that the sender thinks in dirhams, the recipient thinks in pesos,
and the chain speaks only USDC. **Multi-currency settlement (roadmap)** is the layer that lets both
humans read the transaction in their own money while the wire carries a single stable asset.

This needs one new deterministic dependency the wallet does not treat casually: a **price oracle**. The
confirm sheet must show two numbers — the *display* amount in the sender's chosen currency and the
*settlement* amount in the asset that actually moves — and the exchange between them must be honest,
sourced, and timestamped. The oracle rules inherit directly from the doctrine (#3, never fake data):

- A rate is shown **with its source and its age.** A stale rate is labelled stale, not silently used.
- If the oracle cannot be reached, the sheet shows the settlement asset amount (which is real and
  on-chain) and marks the fiat display **unavailable** — a network failure is never a fabricated
  peso figure. This is the same fail-soft honesty the balance screens already enforce.
- The number that the gate authorizes and the device signs is always the **settlement asset in bigint
  base units.** Fiat is a *lens*, never the thing signed. The sender approves `500.00 USDC`; the
  `≈ AED 1,836` beside it is a labelled convenience, and the sheet says so.

```
┌─ Confirm remittance ───────────────────────────┐
│  To     mom · 0x9a…c410 (Base)                  │
│  Send   500.00 USDC        ← signed amount      │
│         ≈ AED 1,836  · rate 3.673, 12s ago      │  ← display lens (oracle)
│  She gets 500.00 USDC      ≈ ₱28,140            │  ← recipient-currency lens
│  Fee    1.21 USDC (0.24%)  · network + route    │
│  ETA    ~40 seconds        · quote expires 39s  │
│                     [ Hold to sign · Face ID ]  │
└─────────────────────────────────────────────────┘
```

Settlement asset choice is a policy, not a default we hide: stablecoins (USDC/USDT where genuinely
liquid on the corridor) are the sensible settlement rail because they hold the display value between
sign and settle; a volatile asset as the settlement leg would mean the `₱28,140` the recipient reads
could be `₱26,900` by the time it lands, and the sheet would have to say so. The engine prefers a
stable settlement asset precisely so the two lenses stay honest.

### §6.3 · Where the liquidity engine does the heavy lifting

Nothing in §6.1 or §6.2 reinvents routing — that would violate the build rule against duplicate
engines. Cross-border remittance is **a naming of an existing Ch13 capability**: it is the
`convert + bridge` route with a human-currency skin and a delivery transfer on the end. Everything
Ch13 commits to applies unchanged:

- **Route discovery, best-execution scoring, health-weighted providers** choose the cheapest honest
  path (single-hop, multi-hop, or cross-chain) — shipped as scoring; bridge *execution* is roadmap.
- **Bounded slippage and real `minReceived`** on the conversion leg — shipped (`quoteSwap`/`sendSwap`).
- **Security re-checked before any fallback** switch — if the primary corridor dies mid-plan, the
  engine re-runs the gate on Route B; it does not silently reroute a signed transfer.
- **AI explanation** — the sender is told *why* this corridor ("USDC on Base is the lowest total cost
  for this pair right now and both providers are healthy"), never a bare "Route Selected."

The remittance product's own additions are thin and honest: the currency lens (§6.2), the corridor UX
(a country/recipient picker instead of a chain picker), and the fee-and-time card. The dangerous part —
moving value across chains and assets — is already gated, already device-signed, already Ch13.

### §6.4 · The fiat boundary — the ramp is a third party, and that is the point

Here is the line we will not cross, stated once and permanently. **The wallet is non-custodial and
KYC-free at its core.** It never holds fiat, never holds the user's funds, never learns a secret, and
never performs identity verification. The instant a product needs a bank account debited, a card
charged, or cash handed across a counter, that is **regulated money transmission**, it requires KYC/AML,
and it is *not us.*

So the on-ramp (cash → crypto, to fund a remittance) and the off-ramp (crypto → cash, for the
recipient to collect) are **third-party integrations** — Ramp, MoonPay, Transak, or a Stripe crypto
on-ramp — each a licensed entity that does its own KYC and touches the fiat. The wallet's role is a
clean, honest **handoff**, not a wrapper that pretends the third party is us:

```
Fund the send (on-ramp):
  user → [MoonPay/Ramp/Stripe]  ── KYC + card/bank + fiat custody happens HERE (third party)
       ← crypto delivered to the user's OWN on-device address
  user → Intent Wallet: now a normal, non-custodial remittance intent (§6.1)

Cash out (off-ramp):
  recipient receives stablecoin non-custodially (we did this leg)
  recipient → [Ramp/MoonPay/local partner] ── KYC + fiat payout happens HERE (third party)
```

The rules for the boundary are strict and auditable (#8):

1. **The user is told, in plain words, when they are leaving the wallet.** "The next step is handled by
   MoonPay, who will verify your identity and process your card. Intent Wallet never sees your card or
   your ID." No dark pattern that blurs who is doing what.
2. **The ramp delivers to the user's own address** — the one derived on-device. Crypto never routes
   through a wallet-controlled custodial account, because we have none. Non-custodial survives the
   ramp because the ramp hands funds *to the user*, then the user's device signs the send.
3. **The provider is a versioned entry in a registry**, chosen by health/coverage/fee for the
   corridor, exactly like a liquidity provider (Ch13 §4–5) — never hard-coded, always replaceable, and
   the user sees which one and why.
4. **We display the ramp's real quote, unmarked-up and un-fabricated.** MoonPay's fee and rate are
   MoonPay's; we render them honestly and never present a third-party estimate as a wallet guarantee.

This is the same architecture that keeps the whole product honest: the wallet is the deterministic,
non-custodial core; regulated fiat is pushed to a party licensed to hold it. A KYC-free wallet with a
KYC'd ramp beside it is not a loophole — it is the correct decomposition, and it is why we can serve a
migrant worker without ever becoming her bank.

### §6.5 · Honesty on cost and time — the promise we refuse to break

Because this section touches the poorest user we have, the honesty bar is the highest in the chapter.
Three commitments, each testable:

- **No "instant."** Settlement time is a real estimate with a range and a confidence, derived from
  live congestion and provider latency (Ch13 §12–13, labelled probabilistic). A bridge that averages
  40 seconds is shown as "~40s," not "instant," and if it's slow today the sheet says so *before* she
  signs.
- **No "free."** Every fee — network gas on each leg, the conversion spread, the bridge fee, the ramp
  fee — is itemized in the settlement asset and summed as a percentage of the send. A 0.24% corridor is
  a *win we can prove*; we do not need to lie by rounding it to zero.
- **No fabricated success.** A leg that fails on-chain is reported as failed with the node's real
  error and the real explorer link — the `broadcast.ts` discipline where an unfunded address returns
  the node's honest "insufficient funds" rather than a fake receipt. A network failure mid-remittance
  is a *pending/failed* state the sender can act on, never a green checkmark that did not happen.

### §6.6 · How this section relates to its siblings

Remittance is one intent surface among nine, and it reuses the others rather than duplicating them:

- The recipient resolves through **§1 (Username Payments & Identity)** and the QR/payment-request
  format from **§2 (Universal QR & Payment Links)** — a remittance link is a payment request that
  encodes a display currency and a recipient.
- "Send $200 to @rosa every month" is a **recurring remittance**, owned by **§4 (Salary /
  Subscriptions / Recurring)** and bounded by Ch14's law: automation depth = authorization depth. The
  cross-border route here is the same; the *scheduling and caps* are §4's.
- Every corridor execution feeds **§8 (Payment Analytics & History)** with its real fees, route, and
  timing.
- The non-custodial + KYC-free + third-party-ramp boundary is ratified in **§9 (Safety Boundary &
  Definition of Done)**; this section states it, §9 enforces it as an acceptance gate.

### Definition of done for §6

Cross-border remittance and multi-currency settlement are *done* when a sender can say **"send $500 to
my mom,"** and the wallet: resolves the recipient by name; plans a real convert-and-bridge route via
the Liquidity Engine with a bounded `minReceived`; shows a confirm sheet with the **signed settlement
amount in bigint** plus honest, sourced, timestamped fiat lenses for both parties; itemizes every fee
and gives a real ETA with no "instant/free"; runs the same deterministic gate and takes a **per-leg
device signature**; hands any fiat on/off-ramp to a **licensed third party** that does the KYC while
the wallet stays non-custodial and never sees a card or an ID; and records every leg auditably with a
real explorer link — or fails closed and says exactly why. Until the bridge-execution and fiat-ramp
integrations ship, this surface is labelled **roadmap** in the UI, and the substrate it stands on —
send, receive, QR, ENS, and the real conversion swap — is what the user can touch today.
## §7 · Offline Payment Preparation

Every payment in this network is an intent, and an intent travels one road: parse → plan → gate →
device‑sign → broadcast → settle (§1–§6; Ch7/Ch8). §7 asks a narrow, honest question about that road:
**how far can a payment get with no connection?** The tempting answer — "the phone can just sign, so
it can pay offline" — is half true and half dangerous, and the whole value of this section is telling
those halves apart. Signing genuinely is a local act: the encrypted key is decrypted in memory on the
device and the transaction is signed in‑browser, on‑device, with **zero** server involvement
(`signEvmTransaction` / `signSolanaMessage` / `signBitcoinPsbt`, Ch6; used throughout
`apps/web/src/broadcast.ts`). But a *valid* signature is over network‑derived inputs — a nonce, a
recent blockhash, a fee rate, a UTXO set — and *broadcasting* it, reading a balance, and fetching a
quote all need a node. So "offline payment" is not one capability; it is a **compose‑and‑review‑and‑
maybe‑sign‑now, broadcast‑later** workflow with a re‑validation gate in the middle that can only
refuse. This whole section is **roadmap** — local signing is real today, an offline *queue* is the new
part — and it never, under any circumstance, shows a queued payment as sent.

### The clean split — what a disconnected device can and cannot do

The shell already tells the truth about connectivity: the header status pill in `App.tsx` renders
`connecting… / connected / offline` from a live `online` signal. §7 builds on that honesty rather than
papering over it. Here is the exact split, step by step:

| Step | Offline? | Why |
|---|---|---|
| **Compose** (recipient, asset, amount) | ✅ local | Pure UI + the deterministic parser (Ch7); a username/ENS `to` needs the resolver, so it must have been resolved **while online** or entered as a raw address. |
| **Review** (recipient + amount + fee sheet) | ⚠️ local, but stale | Amount is exact **bigint** and shown honestly; the fee and any conversion price come from a **cached snapshot**, explicitly labelled "as of HH:MM", never as a live quote. |
| **Gate** (`assertBroadcastAllowed`) | ⚠️ partial | The deterministic checks that need no network — recipient well‑formedness, the testnet/mainnet boundary, the mainnet spend cap (`broadcast.ts`) — run offline and can refuse. Checks that need live data (risk feeds, Ch10) are deferred to reconnect and **fail closed** until they run. |
| **Sign** | ✅ local | Ch6 signing is pure and on‑device — the one step that genuinely needs no server. |
| **Plan with a real quote** (Ch13 conversion) | ❌ network | A quote is a live `eth_call` to the QuoterV2 (`quoteSwap`, `broadcast.ts`); there is no honest offline price. |
| **Read balance / nonce / blockhash / fees / UTXOs** | ❌ network | All are RPC reads (`getNonce`, `getLatestBlockhash`, `estimateFees`, `getUtxos` in `broadcast.ts`). |
| **Broadcast** | ❌ network | `broadcastRawTransaction` pushes raw bytes to a node — the definition of online. |
| **Settle / confirm** | ❌ network | Confirmation is an on‑chain fact read back from the chain; a network failure is never a fake "confirmed" (doctrine #3). |

The one‑line summary: **you can build, read (from a snapshot), gate, and sign offline; you cannot
price, verify balance, or broadcast offline.** Everything §7 does lives inside that constraint.

### Why "just sign offline" is harder than it looks — the snapshot problem

Read the real send paths and the difficulty is concrete. To sign an EVM transfer, `sendEvmTransfer`
first fetches `[nonce, fees]` from the RPC and puts them *into the bytes that get signed*. To sign a
native SOL transfer, `sendSolTransfer` fetches `getLatestBlockhash` and signs a message that embeds
that blockhash. To sign a BTC transfer, `sendBtcTransfer` fetches the address's `utxos` and the live
fee rate and builds the PSBT around them. **The signature commits to network‑derived values.** A
device that has been offline since yesterday does not know today's nonce, today's blockhash, or which
of its UTXOs are still unspent — so it cannot manufacture a fresh, broadcastable signature out of thin
air without lying about those inputs.

So offline‑prepare is only possible against a **snapshot** captured while last online: the wallet
stores `{ nonce, fees, blockhash, utxos, quote }` with a timestamp, and offline signing is signing
*against that snapshot*. That immediately raises the real risk — snapshots go stale, and each chain
goes stale differently:

| Chain | Snapshot input | Staleness window | Failure if stale |
|---|---|---|---|
| **Solana** | recent blockhash | **~150 slots ≈ 60–90 s** | The tx is simply rejected by the cluster (`BlockhashNotFound`) — brutal but safe: it cannot land late. |
| **EVM** | nonce + fee caps | Until you send *any* other tx / fees spike | A reused nonce → the tx is dropped or replaces another; a too‑low `maxFeePerGas` → it sits unmineable (see `checkStuckTx`). |
| **Bitcoin** | UTXO set + fee rate | Until a chosen UTXO is spent elsewhere | Spent input → the tx is invalid; low fee rate → it languishes in the mempool. |

Solana's ~90‑second window means offline‑signed SOL payments are essentially a "sign in the elevator,
broadcast when you reach the lobby" affair, not a "sign today, send tomorrow" one — and we say so.
This is the honest reason offline payment is *preparation*, not *teleportation*. It is closer to EMV
card **offline authorization** (which only works under a bank‑set floor limit precisely because the
issuer accepts staleness risk on small amounts) than to anything that can move arbitrary value while
disconnected.

### The offline‑prepare → online‑broadcast flow (roadmap)

The flow has three phases, and the middle one is where a device may spend hours or days:

1. **Arm (while online).** The user is about to lose signal (boarding a flight, entering a dead zone).
   They compose the payment, the wallet resolves the name (§1), fetches a fresh snapshot of the exact
   network inputs above, runs the offline‑safe portion of the gate, shows the honest confirm sheet
   (recipient + amount + fee, from the snapshot, timestamped), and — on explicit approval — signs
   in‑browser (Ch6). The result is a **`QueuedPayment`**: signed bytes plus the snapshot they commit
   to. It is written to the local encrypted store and shown with one unambiguous state:
   **`Queued — will send when online`.**

2. **Wait (offline).** The queued item is visible, cancellable, and never counted as spent. Balances
   do not decrement — the funds have not moved. There is no "pending on‑chain" claim, because nothing
   is on any chain. A queued payment is a *promise the user made to their future‑online self*, not a
   transaction.

3. **Broadcast (on reconnect).** When the `online` signal flips to connected, the wallet does **not**
   fire the stored bytes blindly. It runs the re‑validation gate (next subsection). Only if the
   snapshot is still valid does it call `broadcastRawTransaction`; only then does the state advance to
   `Broadcast → Pending`, and only an on‑chain receipt advances it to `Confirmed`.

The `QueuedPayment` record — a concrete, buildable shape, amounts as **bigint base units**:

```
QueuedPayment {
  id:          string
  chain:       ChainId              // 'sepolia' | 'solana-devnet' | 'bitcoin-testnet' | …
  to:          string               // resolved concrete address (name resolution happened online)
  toDisplay:   string               // the human form shown verbatim on the sheet (e.g. "@merchant" / "vitalik.eth")
  asset:       string               // symbol
  amountBase:  bigint               // exact base units — never a float (doctrine #4)
  snapshot: {
    capturedAt:  number             // unix ms — drives the "as of HH:MM" label
    nonce?:      bigint             // EVM
    blockhash?:  string             // Solana
    feeInputs:   FeeSnapshot        // maxFeePerGas / satPerVByte / …
    utxos?:      BtcSpendUtxo[]      // Bitcoin
    quote?:      SwapQuote          // if a conversion was part of the plan
  }
  signedRaw:   string | null        // signed offline against `snapshot`; null ⇒ "sign on reconnect"
  status:      'queued' | 'revalidating' | 'broadcast' | 'pending' | 'confirmed' | 'stale-rejected' | 'failed'
  createdAt:   number
}
```

Note `signedRaw` may be **null**: for chains with a punishing staleness window (Solana), the safer
default is to queue the *reviewed intent* and **defer signing to reconnect** — the user pre‑approved,
but the actual signature is produced against a fresh blockhash the instant signal returns. That is a
policy toggle, not a loophole: either way, nothing broadcasts without passing the gate on live data.

### Re‑validation on reconnect — fail closed (the load‑bearing rule)

This is the single most important paragraph in §7. **A signed blob is not a licence to broadcast.**
The stored signature commits to a snapshot that may now be a lie, so on reconnect the wallet
re‑derives every network input and compares:

- **EVM** — re‑fetch `getNonce`; if the live nonce ≠ the snapshot nonce, the queued tx is stale
  (funds already moved on that account) → **discard the signature, re‑build and re‑sign** against the
  current nonce and current fees, re‑showing the sheet if the fee moved materially. Never broadcast the
  old bytes.
- **Solana** — re‑fetch `getLatestBlockhash`; a snapshot blockhash older than the validity window is
  dead → **re‑sign** against a fresh blockhash (which is why deferred signing is the Solana default).
- **Bitcoin** — re‑fetch `getUtxos`; if any input the PSBT spends is gone, the tx is invalid →
  **re‑select coins and re‑sign** at the current fee rate.

And then — always — the payment passes back through the *same* deterministic gate every live send
uses today: `assertBroadcastAllowed` validates the recipient, re‑checks the testnet/mainnet boundary,
and re‑applies the mainnet spend cap (`broadcast.ts`). The offline detour earns **no** exception. If
anything cannot be positively re‑verified — the node is unreachable, the price for a conversion step
has moved beyond the user's slippage tolerance (Ch13), the recipient no longer passes a risk check
(Ch10) — the payment **fails closed**: it stays queued or moves to `stale-rejected`, and the user is
told exactly why, in plain language. It is never broadcast on faith. This is the same instinct the
swap path already encodes when it *waits for the approval receipt before broadcasting the swap* and
*preflights with `eth_call` so a guaranteed revert fails cheaply* (`sendSwap`, `broadcast.ts`): the
system would rather refuse than send something it cannot stand behind.

### Honest status — a queued payment is never "Sent"

The status vocabulary is deliberate and the mapping to reality is exact:

| State | What the user sees | On‑chain reality |
|---|---|---|
| `queued` | **Queued — will send when online** | Nothing exists on any chain. Funds not moved. |
| `revalidating` | Re‑checking before sending… | Re‑deriving nonce/blockhash/UTXOs on reconnect. |
| `broadcast` → `pending` | Sent — waiting to confirm | Raw bytes accepted by a node; not yet mined. |
| `confirmed` | Confirmed | An on‑chain receipt (status `0x1` / finalized) was read back. |
| `stale-rejected` | Couldn't send — details changed, review again | Snapshot went stale; nothing was broadcast. |
| `failed` | Failed — <node's real error> | The node rejected it (e.g. insufficient funds — the same honest error the live paths surface). |

There is exactly one transition into `pending`, and it is a **successful `broadcastRawTransaction`
after a passing re‑validation and gate** — never the act of queueing, never the act of signing. A
signed‑but‑unbroadcast payment is a draft with a signature on it, and the UI says so. This is the
offline analogue of the network‑failure rule everywhere else in the wallet: a lost connection is not a
`$0` balance and not a completed payment (doctrine #3; the balances fail‑soft rule). Every queue
decision — armed, deferred, re‑validated, broadcast, or refused — is logged with its inputs and reason
(doctrine #8), so a "did my payment go through?" dispute is reconstructable to the second.

### Benchmark — and what we refuse to copy

Offline value transfer is a solved problem *only when someone accepts custody risk*. EMV cards
authorize offline under issuer floor limits because the **bank** eats the settlement risk. UPI Lite
and the RBI's offline‑payment schemes work by pre‑loading a small **on‑device balance** — a custodial
float the user tops up. Tap‑to‑pay wallets pre‑provision issuer tokens. All of them move the trust to
a custodian who reconciles later. We cannot and will not take that shortcut: there is no server holding
the user's funds to reconcile against, and the device never surrenders its keys. What we *can* borrow
is the honest framing — a **bounded, clearly‑labelled** offline capability with hard re‑validation on
reconnect — without the custody. Lightning's asynchronous receive and hold‑invoices are the closer
philosophical cousin: value is committed but not final until the network confirms, and the UI never
pretends otherwise.

### Definition of done (this slice)

- Offline **compose + review + sign** reuse the exact Ch6 signing and the exact `broadcast.ts` build
  logic — no parallel "offline signer," no weakened gate.
- Every queued payment carries a **timestamped snapshot** of the network inputs it commits to;
  amounts are **bigint** base units and the fee/price is labelled "as of HH:MM," never as live.
- On reconnect the wallet **re‑derives** nonce / blockhash / UTXOs, **re‑runs** `assertBroadcastAllowed`,
  and **fails closed** on any staleness, price drift beyond tolerance, or unverifiable check —
  discarding and re‑signing rather than broadcasting stale bytes.
- A queued payment is **never** rendered as sent, confirmed, or spent; balances do not decrement until
  a real broadcast returns a txid, and only an on‑chain receipt yields `confirmed`.
- Solana's ~90‑second blockhash window is respected by defaulting to **deferred signing**; the UI is
  honest that far‑future SOL offline‑sends are not possible.
- The whole feature is surfaced as **roadmap**; the only shipped primitives it stands on — on‑device
  signing (Ch6), the deterministic gate, and the `online` status pill — are real today.

Offline preparation is not a way to move money without a network; it is a way to have your intent
*ready and pre‑approved* so that the instant the network returns, one re‑validated gate and one real
broadcast turn it into a payment — with the same non‑custodial, device‑signs, fail‑closed guarantee
that governs every other section of this chapter. The full adversarial boundary and the chapter‑wide
Definition of Done are §9.
## §8 · Payment Analytics & History

> **As the Principal AI Engineer.** A payment the user cannot *see afterward* is a payment they cannot
> trust. Sending money is only half the loop; the other half is understanding where it went, what it cost,
> and what it means. This section is the wallet's memory of money moved — part **shipped** (the activity and
> settlement records the wallet already keeps), part **roadmap** (the categorization, analytics, and
> reporting products built on top). The discipline that governs all of it is Doctrine #3 and #8: **every
> number is computed by deterministic code from records the chain actually produced; the AI narrates, it
> never invents; every estimate is labelled an estimate.** UPI shows you a passbook; Venmo shows you a
> feed; Stripe shows you a dashboard. We owe the user all three — and, unlike any of them, we owe it
> **honestly and non-custodially**, because the records are theirs and the ledger is the public chain, not
> our server.

---

### 8.1 · Why history is a first-class surface, not a log

A payment in this wallet is an intent (Ch7), executed through the gate and the device signature (Ch8), and
broadcast to a real chain (`apps/web/src/broadcast.ts`). That means **the source of truth for payment
history is the blockchain**, not an internal database we could quietly edit. This is a gift and a
constraint. The gift: history is verifiable — every entry links to an explorer, and anyone can check it.
The constraint: we may only *show* what the chain confirms, in the state the chain reports it. A pending
tx is pending; a reverted tx is failed; a network read that fails is a read that failed — never a
fabricated "$0" or a fake "confirmed."

Two record layers already exist and are the foundation everything here builds on:

- **The session activity record** — every real broadcast produces an `ActivityItem`
  (`{ id, kind, status, chainId, txid }`, `apps/web/src/App.tsx`), appended the moment the device signs and
  the node accepts the raw transaction, and rendered by `ActivityPanel`. This is the wallet's own memory of
  *"what I did,"* keyed to the returned `txid` and its explorer link (`EvmSendResult.explorerUrl`).
- **The on-chain history read** — `fetchEvmHistory(address)` returns `HistoryItem[]`
  (`{ hash, from, to, valueWei, timeStamp, failed }`, `apps/web/src/api.ts`), the address's recent Sepolia
  transactions read back from a public explorer and shown by `ActivityModal`. Note the honesty already
  baked in: `failed` is a real field, `valueWei` is an exact bigint string (never a float), and a read
  error returns `[]` — an honest empty, not a lie.

Everything in §8.2–§8.5 is the intelligence layer over these two records. It **reads**; it never becomes a
second source of truth that could disagree with the chain.

---

### 8.2 · Payment history — the universal passbook *(shipped core, roadmap surface)*

**What ships today.** A user who sends ETH/SOL/BTC/USDC on the wired testnets (and guarded mainnet ETH)
gets, for each transfer: **recipient, amount (exact base units), status, and an explorer link.** The status
is real (`ExecutionStatus` / the chain's `failed` flag), the amount is bigint, and the explorer link is the
proof-of-existence that distinguishes us from a demo. Receive is symmetric — the per-chain QR
(`ReceiveModal`, §2) funds an address whose inbound transactions show up in the same history read.

**What the payment product adds (roadmap).** A passbook is more than a transaction dump. The roadmap merges
the two record layers into one **unified payment timeline** — reconciling the optimistic session
`ActivityItem` (written at broadcast) against the confirmed `HistoryItem` (read back from the chain) so a
payment appears once, with its status advancing pending → confirmed → failed as the chain reports. Around
each entry the payment surface adds the human context the chain doesn't carry:

| Field | Source | Honesty rule |
|---|---|---|
| Counterparty name | Ch5 identity: `@username`, ENS reverse, or a saved contact (`ens.ts` resolves the address) | Show the name **and** the resolved address; a name is a label, the address is the fact |
| Amount (base units) | The signed tx / `valueWei` | bigint end-to-end; formatted for humans only at the edge |
| Fee paid | The tx receipt (gas × price for EVM; vbytes × rate for BTC; lamports for SOL) | The *actual* fee from the receipt, not the *estimated* fee from the confirm sheet |
| Fiat value | Price at tx timestamp × amount, via the pricing source | Labelled "≈" and pinned to the tx time — never re-priced to now and shown as if historical |
| Memo / reference | User-entered note, or a payment-request id (§5) | Local metadata; never on-chain unless the user opts into a memo field |
| Status | Chain receipt | pending / confirmed / **failed** — a revert is shown as failed, never hidden |

The design benchmark is UPI's reference-numbered passbook and Stripe's payment detail page: every entry is
individually addressable, filterable (by counterparty, asset, chain, direction, date), and exportable. The
non-negotiable difference from all of them: **we hold no custody and keep no private ledger** — the export
is a view over public chain data plus the user's own local labels.

---

### 8.3 · Categorization — payments vs swaps vs income vs fees *(roadmap; ties to Ch12 §9 + tax engine)*

Raw transactions are not yet *meaning*. A user asking *"how much did I spend last month?"* needs the wallet
to distinguish a **payment** (money out to a counterparty) from a **swap** (Ch13 conversion, no net money
left the wallet), from **income** (money in), from **fees** (cost of moving money at all). The wallet
already tags intent kind at the source — `plan.intentKind` is `'transfer'` vs `'swap'`, and the
`ActivityItem.kind` carries it forward — so categorization starts from a *known* type, not a guessed one.

The category taxonomy, and the rule that assigns each:

| Category | Definition | Deterministic signal |
|---|---|---|
| **Payment (out)** | Value transfer to another party | `intentKind==='transfer'`, `to` ≠ any of the user's own addresses |
| **Transfer (self)** | Move between the user's own accounts/chains | `to` ∈ the user's identity graph (Ch5) |
| **Swap / conversion** | Asset A → asset B, same owner | `intentKind==='swap'` (the Ch13 route); a payment's *funding* swap is grouped under the payment, not double-counted |
| **Income (in)** | Inbound value from another party | Inbound `HistoryItem`, `from` ≠ the user; salary/subscription inflows (§4) carry an explicit tag |
| **Fee** | Network cost of any of the above | The receipt's gas/vbyte/lamport cost, split out from principal |

Two correctness rules make this trustworthy rather than merely plausible. First, **self-transfers and
swap legs are never counted as spend** — the classifier resolves `to`/`from` against the Ch5 identity graph
before it calls anything a payment, so moving ETH between your own EVM and a bridge does not inflate your
"spending." Second, **categorization feeds the same records the tax engine consumes**: `packages/intelligence`
already models money movement as `TaxEvent`s and computes realized gains by exact bigint lot-matching
(`intelligence/src/tax.ts`, `TAX_PRESETS` for US-FIFO/HIFO/UK-pool). A "payment" of a non-stable asset is
also a *disposal* for tax purposes; categorization and the tax lot-matcher must agree, because they read the
same activity log. This directly extends **Ch12 §9 (Cash Flow: money in · money out · fees · transfers)** —
categorization is what makes the cash-flow buckets real instead of cosmetic.

Where a category cannot be *positively* determined — an inbound transfer from an unknown contract, a token
the pricing source can't value — the wallet **marks it uncategorized and surfaces it**, exactly as
`intelligence/src/tax.ts` surfaces unmatched disposals rather than guessing. Fail closed, then ask.

---

### 8.4 · Analytics — computed by code, narrated by the AI *(roadmap; the boundary is shipped)*

This is where a wallet becomes a financial instrument, and where the temptation to fabricate is highest — so
this is where the architecture is strictest. The rule, already enforced in code: **the deterministic engine
computes every figure; the AI may only turn verified figures into sentences.** `packages/intelligence`
implements exactly this contract in `narrator.ts`: a `Narrator` produces a `NarrativeReport` whose every
citation must resolve against the verified `PortfolioIntelligence` via `resolveMetric`, and `verifyNarrative`
*rejects the narrative* if any cited number doesn't reconcile. **An LLM plugged in behind that boundary
cannot invent a total** — a hallucinated "$4,200 spent" fails the guard and never reaches the user. That
boundary is shipped; the payment metrics that flow through it are the roadmap.

The payment analytics the engine computes (pure functions over the activity/history records, using the
`stats.ts` primitives — `mean`, `variance`, `simpleReturns`, all total over thin history):

- **Spend over time** — money-out per period, bigint-summed by base unit and converted to fiat *at each
  tx's own timestamp*, so a chart of "spending" is not silently distorted by today's price. Sparklines and
  period buckets mirror Ch12's timeline engine.
- **Top recipients** — counterparties ranked by total sent, resolved to `@username`/ENS/contact names via
  Ch5 (address is always shown alongside — the name is a convenience, the address is the truth).
- **Fee totals** — the sum of *actual* receipt fees, bucketed **gas · bridge · swap · protocol**, exactly
  the shape of **Ch12 §10 Fee Analytics** (*"Last month — Gas $42 · Bridge $18 · Swap $9"*). Fees are the
  one number a payment app can state with near-certainty because the receipt is exact; we state it exactly.
- **Recurring detection** — surfacing "you pay this recipient every month" from the timeline, feeding the
  Ch14 automation suggestions (Ch14 §13) and the subscriptions surface (§4).

Every one of these is a *fact* or an *estimate*, and the wallet says which. A fee already paid is a fact (it
has a receipt). A *projected* monthly spend, or a fiat value derived from a price feed, is an **estimate,
labelled "≈" or "projected"** — the same discipline Ch12 §11 applies to yield projections. The narrator's
job is to make *"You sent $312 to 4 people this month; your fees were $9, mostly gas on Ethereum"* readable —
never to produce the $312. If the price source is down, the fiat estimate is shown as unavailable, not as
zero (the Ch3 / balances fail-soft rule applies to analytics as much as balances).

**A worked honesty boundary.** *"Roughly how much do I spend on gas?"* → the engine sums confirmed-receipt
gas fees (fact) and, if asked to project, extrapolates from the trailing window (estimate, labelled) → the
narrator renders it → `verifyNarrative` confirms every figure resolves → only then does the sentence ship.
No receipts in the window? The honest answer is *"not enough history to say,"* which `stats.ts` returns
by construction (its functions are total over short arrays) — not a confident fabricated number.

---

### 8.5 · Privacy — the payment record is the user's *(shipped stance, DSAR is roadmap-surfaced)*

Payment data is the most sensitive data a person has — who they pay, how much, how often, is a map of their
life. Our stance is structural, not promissory:

1. **Non-custodial by construction.** The wallet holds no server-side ledger of the user's payments. The
   authoritative record is the public chain; the enriching context (contact names, memos, categories) is the
   user's **local** data on their device. There is no central honeypot of "who paid whom" because the wallet
   was never architected to hold one — the same reason keys never leave the device (Doctrine #1).
2. **On-chain ≠ private, and we say so.** A public-chain payment is pseudonymous but permanent and globally
   readable. The wallet must never imply otherwise. This is an *honesty* obligation: the receive/QR surface
   and the payment-request format (§2, §5) should make address reuse and its linkability legible, and future
   privacy features (fresh receive addresses, shielded rails) are tagged **roadmap** — never claimed before
   they ship.
3. **The user's rights are first-class.** For any data the wallet *does* hold for the user (contacts,
   labels, and — for opted-in businesses under §3 merchant mode — retained records), `packages/compliance`
   already implements the machinery: **DSAR export** (`privacy.ts` `buildExportManifest` — data portability
   as a full inventory) and **erasure reconciled against retention** (`planErasure` erases everything not
   under a lawful retention hold, and surfaces what it must keep and why, rather than silently failing).
   Analytics inherit this: the payment history *view* can be exported by the user and, where the data is
   locally held, erased.
4. **A fiat ramp is a third party, and its KYC is theirs, not ours.** When a user cashes out via a
   ramp (§6), that provider (Ramp/MoonPay/Stripe) performs KYC and holds that data under *its* policy. The
   wallet stays **KYC-free at its core and non-custodial**; it hands off, it does not absorb. Payment
   analytics must never quietly aggregate a user's identity across a ramp's KYC and their on-chain
   history — Doctrine's privacy line and the compliance package's data-minimization both forbid it.

---

### 8.6 · Definition of done for this section

Payment analytics & history is done when: (a) every payment shows recipient, exact bigint amount, actual
fee, real status, and a working explorer link, with pending/confirmed/**failed** never conflated and a
failed read never rendered as "$0"; (b) categorization resolves self-transfers and swap legs against the
Ch5 identity graph so spend is never double-counted, and agrees with the tax engine's disposal log; (c)
**every analytics figure is computed by `packages/intelligence` and passes `verifyNarrative` before the AI
speaks it — no fabricated totals, every estimate labelled**; and (d) the record is treated as the user's —
non-custodial, DSAR-exportable, erasable where locally held, with on-chain permanence stated plainly and any
fiat-ramp KYC kept firmly on the third party. Shipped today: the activity record, the on-chain history read,
per-chain receive, ENS resolution, and the verified-narration boundary. Roadmap and tagged as such: the
unified timeline, categorization, the spend/recipient/fee analytics products, and the exportable payment
report. The full safety envelope and cross-section acceptance criteria are consolidated in **§9**.
## §9 · The Safety Boundary & Definition of Done

> **A payment network that never becomes a custodian.** Sections §1–§8 opened eight new front doors —
> a name, a QR, a link, a storefront, a payroll run, an invoice, a corridor, a schedule. This section is
> the wall behind all of them. It states the one invariant Chapter 16 cannot break no matter how many
> surfaces it grows: *however a payment is started, it is still an **intent**; it still walks
> `parse → resolve → plan → gate → device-sign → broadcast → settle`; the deterministic gate can still
> only **refuse**; the **device** still signs; and no server, platform account, or float ever holds the
> user's funds.* As the Principal Security Engineer I hold the veto on this section (Ch10). Everything
> above is a convenience; this is the guarantee. If a payment product ever needs to break it, the product
> is wrong — not the wall.

---

### 1. One hallway, many doors — every payment is the same intent

The temptation in building a payment network is to let each surface grow its own execution path — a "fast
lane" for QR scans, a "merchant SDK" that submits on the seller's behalf, a "subscription runner" that
charges on a timer. Every one of those is a place a custodian is born. Chapter 16 refuses the temptation by
construction: **there is exactly one execution path, and every surface is a way of *filling in an intent*,
not a way of *bypassing* one.** A scanned Solana Pay code, a tapped payment link, a due invoice, a monthly
salary run, a $500 remittance — each is a *proposal* that produces the same `{chain, address, amount}` the
manual Send panel produces, and then joins the identical pipeline Ch7 defined and Ch8 executes.

The proof is already in the code. Every real broadcast the wallet performs today — native ETH/SOL/BTC
transfers, ERC-20 and SPL token transfers, approval revokes, swaps, and the AI-planned `executeTransferStep`
that turns a parsed intent into a transaction — routes through a **single choke point** before a key is ever
touched:

```
assertBroadcastAllowed(guardInput(chain, toAddress, ack))   // broadcast.ts, called by EVERY send path
```

`sendEvmTransfer`, `sendSolTransfer`, `sendSplTransfer`, `sendBtcTransfer`, `sendErc20Transfer`,
`sendRevokeApproval`, `cancelStuckTx`, `sendSwap` — all of them call it first. This is not decoration; it is
the architectural fact that a new payment surface *cannot* reach the signer without passing the gate,
because there is no other door to the signer. When §3's merchant mode or §4's subscription runner ships,
they build the same `{asset, amountBase, to}` step and hand it to the same `executeTransferStep` — inheriting
the gate for free, because they are physically incapable of routing around it. **A malicious QR, a forged
invoice, or a compromised merchant page can propose anything; it cannot dispose of a satoshi.**

### 2. The gate can only refuse (Ch10)

The gate is the deterministic core that stands between plan and wire. It has no authority to *move* money —
only to *stop* it. That asymmetry is the whole safety model: the LLM proposes, the planner assembles, the
QR suggests, but the gate's only verbs are *allow* and *refuse*, and the disposition of funds belongs to the
device alone. The Security & Trust Engine (Ch10) specifies its full battery; a payment presents nothing new
to it, because a payment is just an intent with a person on the far end.

| Gate check (Ch10) | What it refuses on, for any payment surface |
|---|---|
| **Address verification** | malformed/unchecksummed recipient; unknown-chain address; a resolved name whose address record is empty (§1 returns `null`, never a guess) |
| **Risk analysis** | flagged recipient, poisoned/look-alike address, drainer contract, suspicious approval |
| **Policy** | over-cap amount, disallowed asset/chain, velocity/rate limits, mainnet real-funds without acknowledgement |
| **Capability** | the wallet cannot *positively* build/sign this asset on this chain (fail closed — refuse, don't fake) |
| **Simulation / settlement pre-flight** | the transaction would revert (the swap path `eth_call`-preflights and **waits for the approval receipt** before broadcasting) |

Two properties make this trustworthy under the doctrine. First, **it fails closed** (Doctrine #5): the
`isExecutableAsset`/`balanceForAsset` seam and the per-chain guards refuse anything the wallet cannot
verifiably construct — an unmapped mainnet ERC-20 is *rejected with an honest message*, never sent to a
guessed contract that would burn funds. Second, **it is deterministic** (Doctrine #7): the same inputs
always yield the same verdict, so the safety of a payment does not depend on a model's mood. The gate that
today enforces `assertBroadcastAllowed`'s recipient + mainnet-acknowledgement + spend-cap checks is the same
seam the full Ch10 risk/policy/capability battery mounts into as it ships. Every surface in §2–§8 is a
**roadmap product on a real gate** — the front door is new; the lock is not.

### 3. The device signs — always (Doctrine #2)

No payment surface is ever granted signing authority. The merchant SDK does not sign. The subscription
runner does not sign. The invoice does not sign. The remittance route does not sign. In today's code the
signature happens exactly where it must — in the browser, with the user's key, on lines that all carry the
same comment:

```
signEvmTransaction(tx)     // in-browser, with the user's key
signSolanaMessage(message) // in-browser, with the user's key
signBitcoinPsbt(built.psbt)// in-browser, with the user's key
```

This is the hard line between us and every payment app that "charges" you. A card-on-file, a direct-debit
mandate, a Stripe subscription, a UPI auto-mandate — each is a standing **authority to pull** the payer's
money. Our recurring payments (§4) and Auto mode carry **no such authority**. Auto mode does not mean "the
server may debit you"; it means the *device* signs within caps the user set, with the key that never leaves
that device. A subscription is a schedule of *proposals* the device must sign, not a lien on a balance a
platform holds. The initiator and the signer can be two different people (an invoice, §5), but **the signer
is always the payer's own device, and never a service acting for it.** Remove that and you have not built a
better payment app; you have built a bank.

### 4. The honest confirm — recipient + amount + fee, in bigint

Whatever the entry format, comprehension precedes signature, and the confirmation sheet is the same honest
artifact the manual send already renders (`tx-review` in `App.tsx`): the **resolved recipient** (with the
name-to-address anti-spoof marker of §1), the **exact amount**, and the **network fee** — nothing hidden,
nothing rounded away. A scanned QR does not get to conceal where the money goes; a payment link does not get
to pre-approve itself; a merchant page does not get to inflate the amount past what the sheet shows. The
number the user signs is the number on the wire.

Three honesty rules bind every surface:

- **Money is integer bigint end-to-end** (Doctrine #4). The signed amount is base units — wei, lamports,
  sats, token base units — parsed exactly (`parseEther`, `parseLamports`, `parseSats`, `decimalToBase`)
  with no float rounding. A fiat figure (§6's multi-currency lens) is a **labelled, sourced, timestamped
  lens** over that bigint, never the thing being signed.
- **Never fabricate success** (Doctrine #3). A network failure is an error state, not "$0" and not "paid."
  "Instant" and "free" are never shown for a payment that is neither. Testnet is labelled testnet; capped
  mainnet is labelled capped.
- **The recipient is confirmed, not assumed.** Resolution (§1) returns a concrete address or `null`; a name
  that resolves to nothing is refused, never sent to a plausible default.

### 5. Non-custodial — wallet-to-wallet, no float, no platform account

This is the invariant that most sharply separates the Universal Payment Network from every incumbent it is
benchmarked against. Venmo, Cash App, PayPal, and the UPI PSP layer all work the same way underneath: your
money sits in a **platform-controlled balance** — a float, a pooled account, a ledger the company owns and
can freeze, reverse, lend against, or lose. "Sending money" there is an entry moving inside their book; the
funds never leave their custody until you cash out. That float is the business, and it is also the risk: it
can be frozen by the platform, seized by a creditor, or evaporated by the platform's insolvency.

Intent Wallet holds **none of it.** Funds move **address-to-address on-chain**, from the payer's keys to the
payee's keys, and the platform sits nowhere in the value path. A merchant's takings (§3) land in the
merchant's own wallet, controlled by the merchant's own device. A payroll run (§4) moves salary from the
employer's keys to each employee's keys. There is no Intent Wallet account holding a balance, because there
is no Intent Wallet account — the wallet is a non-custodial tool, and the network it forms is a directory and
a set of rails, not a bank.

| | Custodial payment apps | Intent Wallet payments |
|---|---|---|
| Where funds rest | platform float / pooled account | the user's own address, on-chain |
| Who can freeze/reverse | the platform | no one (on-chain finality; §6 owns the "no reversal" honesty) |
| Who holds keys | the platform | the user's device only |
| "Send" is… | a ledger entry in their book | a signed, broadcast, settled on-chain transfer |
| Platform insolvency risk | your balance is exposed | none — the platform holds nothing |

**The one boundary, stated precisely: a fiat on/off-ramp is a *third party*, not the wallet.** When a user
buys crypto with a card or cashes out to a bank (§6), that leg is performed by a **licensed provider** (Ramp,
MoonPay, Stripe) that does the KYC and touches the fiat rails. The wallet hands off to it and stays
non-custodial and KYC-free at its core: it never sees a card number, never sees a government ID, never holds
the fiat, and never holds the seed. The ramp's custody of *fiat, briefly, under its own license* does not
make the wallet a custodian of *crypto* — the two are cleanly separated, and the hand-off is labelled
honestly. That is the only place a regulated intermediary appears, and it appears *beside* the wallet, never
*inside* it.

### 6. "Received" means settled on-chain — never merely broadcast (Ch8 §17)

For a merchant, the most dangerous lie a payment system can tell is "paid" before the money has actually
arrived. Chapter 8 §17 is categorical: **"Confirmed" means settled — the intended outcome achieved (assets
received, balances updated) — never merely that a transaction was broadcast.** The Universal Payment Network
inherits this as a hard rule for every receiving surface. A merchant's POS (§3) must not mark an order paid,
an invoice (§5) must not mark itself settled, and a remittance (§6) must not tell the recipient's family the
money landed, on the strength of a broadcast alone.

The discipline already exists in code. The swap path's `waitForReceipt` polls
`eth_getTransactionReceipt` and **throws on a reverted receipt (`status === '0x0'`)** and on timeout — a
failed transaction is never mistaken for a successful one, and the dependent step never fires. The same
settlement-verification seam is what a merchant integration subscribes to: *broadcast* is "submitted,"
*sufficient confirmations for the network* is "settled," and only settled turns a storefront green. Reorg
awareness, per-network confirmation thresholds, and the explorer link that lets anyone verify — all of it
belongs to settlement, not to the hopeful moment the bytes left the device.

### 7. Everything auditable (Doctrine #8)

Every payment, on every surface, leaves an honest trail: the resolved recipient, the gate's verdict and its
reason, the signed amount in bigint, the fee, the broadcast txid, and the settlement outcome with a real
explorer URL (`explorerUrl` is returned by every send path today). §8 (Payment Analytics & History) reads
this trail; it does not invent it. A denied payment records *why* it was refused; a settled one records
*that it settled*, verifiably. Correctness and safety are demonstrated, not asserted.

---

### The Definition of Done

The Universal Payment Network is **done** when individuals, merchants, and businesses can **pay and receive
across the ecosystem — by name (§1), QR or link (§2), storefront (§3), schedule (§4), invoice (§5), or
corridor (§6)** — and every one of those paths carries the **same guarantees as a manual send**:

| Acceptance gate | The bar it must clear |
|---|---|
| **Same intent** | the payment walks `parse → resolve → plan → gate → device-sign → broadcast → settle`; there is no bypass path to the signer |
| **Gate can only refuse** | risk + policy + capability + address verification run (Ch10); unverifiable → **fail closed** |
| **Device signs** | the key never leaves the device; no surface, SDK, or service ever signs for the user (Doctrine #1/#2) |
| **Honest confirm** | resolved recipient + exact amount + fee shown before signing; money is bigint; no fake "instant/free," no fabricated success (Doctrine #3/#4) |
| **Non-custodial** | funds move wallet-to-wallet; no platform account, float, or balance ever holds them; a fiat ramp is a third party beside the wallet, not inside it |
| **"Received" = settled** | receipt is confirmed on-chain (Ch8 §17), never merely broadcast; reorg/confirmation-aware |
| **Auditable** | recipient, verdict, amount, fee, txid, and settlement outcome logged with a real explorer link (Doctrine #8) |

**The honest split, one last time.** What is *shipped* is the substrate every surface stands on: real
send/broadcast on testnets and guarded mainnet ETH, receive with a per-chain in-browser QR (`App.tsx`,
generated locally with no external service), ENS forward resolution and contacts (§1), the intent→plan→gate→
sign→settle flow (Ch7/Ch8), the single-choke-point gate (`assertBroadcastAllowed`), and settlement-safe
sequencing (`waitForReceipt`). What is *roadmap* — and labelled roadmap in the UI until it ships — is the
payment **products**: the universal payment-request format and links (§2), merchant mode and POS (§3),
salary/subscriptions/recurring (§4), invoices (§5), cross-border remittances and multi-currency settlement
(§6), offline preparation (§7), and analytics (§8). *The rails exist; the products are being built on them.*
That distinction is itself part of the doctrine: we do not fabricate a UI for a feature that does not exist.

**The closing invariant.** A payment is an intent, and an intent never gets to be a custodian. We can add
every surface UPI, Venmo, Cash App, Stripe, Lightning, and Solana Pay ever shipped — and we intend to — but
each arrives as a new door into the *same* hallway: the same gate that can only refuse, the same device that
alone can sign, the same honest sheet that shows recipient, amount, and fee, and the same on-chain settlement
that alone means "received." The user is never lied to, never has their funds held by a server, and never
signs a number they did not read. That is how the wallet becomes a global payment system for individuals,
merchants, and businesses — **a universal payment network that, by construction, can never become a
custodian.**

---

## Where this sits

This is the reference behind [Chapter 16 — the Universal Payment Network charter](../bible/chapter-16-universal-payment-network.md),
and the material Volume II is built from. **Shipped:** the intent pipeline every payment rides
(`packages/intents` → gate → device signature → broadcast), per-chain address/QR receive, ENS resolution, and
the liquidity engine (Chapter 13) that lets *"pay in BTC, receive USDC"* route automatically. **Roadmap:**
merchant/POS surfaces, the salary and subscription mandate product, invoices and payment requests, the
cross-border remittance experience, offline preparation, refunds, the business dashboard, per-jurisdiction
compliance integrations, and payment analytics — each built on those shipped primitives, none of them changing
the non-custodial core.

The line that governs all nine sections: **a payment is a person-shaped intent** — the sender answers *"who?"*,
deterministic code answers *chain/token/gas/route*, the device answers *"yes"*, and the chain answers
*"settled."* No agent, no server, and no merchant tool can move a fund, fake a receipt, or mark a pending
payment delivered.
