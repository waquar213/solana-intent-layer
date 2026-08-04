# UX_GUIDELINES.md — The UX Constitution of Intent Wallet V3

> **Purpose.** This is the canonical, authoritative UX law for Intent Wallet V3 — the AI-native,
> non-custodial wallet whose promise is *"talk to your money."* It defines how the product thinks, speaks,
> confirms, fails, and feels, so that a non-technical stranger can move real money across chains by typing
> one sentence — *never be lied to, never lose funds, and enjoy it.* Every principle here is downstream of
> [`CLAUDE.md`](CLAUDE.md) (the constitution) and its 8-law Doctrine; where a design choice and the Doctrine
> disagree, the Doctrine wins and the design is wrong.
>
> **Read this before you** design a screen, add a state, write a button label, wire a confirmation, touch the
> intent chat, or ship any change a user can see. Pair it with [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) (tokens &
> components) and the deep specs in [`docs/design/`](docs/design/README.md). It is an engineering-bible
> section, not a blog post: dense, skimmable, opinionated, and **true to what V2 actually ships** — no
> fabricated features, no borrowed metrics.

---

## 0 · The bar and the benchmarks

We are not building a better MetaMask. We are building **Crypto's ChatGPT × Apple Wallet × Stripe**:
conversational intent (ChatGPT), Apple-grade product craft (Apple Wallet), Stripe-grade honesty about money
and errors. Every surface is judged against the best in the world, and we name who we are stealing from:

| Steal this | From | Because |
|---|---|---|
| Conversational, single-input entry to everything | **ChatGPT** | one box, plain words, no menu archaeology |
| Reverence around money, calm defaults, no dark patterns | **Apple Wallet** | moving money should feel inevitable, not anxious |
| Merciless honesty in amounts, fees, and error copy | **Stripe** | never surprise a user about money |
| Keyboard-first speed, taut motion, zero chrome | **Linear** | power without clutter |
| Legible transaction previews, "what will actually happen" | **Rabby / Phantom** | the confirm is the product's trust boundary |
| Empty/loading/error states designed as first-class screens | **Vercel** | the unhappy path is 40% of the product |

**The one test we hold every screen to:** *would a first-time, non-technical user understand exactly what is
about to happen to their money, trust that it's true, and feel calm doing it?* If no, it doesn't ship.

---

## 1 · The four UX laws (everything else is derived)

1. **The intent is the interface.** The user says what they *want* in their own words; chains, gas, routes,
   and bridges are our problem, not theirs. We think in *assets and outcomes*, never in *chains and mechanics*.
2. **AI proposes, code verifies, the device signs.** The assistant may *suggest and explain*; it has **zero
   signing authority**. A deterministic gate stands between plan and wire and can only ever **refuse**. The
   user's on-device signature is the sole disposer of funds. The UX must make this hierarchy *visible*, not
   hide it. (Doctrine #2.)
3. **Never lie, never fake, fail closed.** A network failure is not "$0." A testnet is labelled testnet. A
   capped mainnet is labelled capped. Nothing is shown "confirmed" that didn't happen on-chain. Anything a
   guard cannot positively verify is blocked. (Doctrine #3, #5.)
4. **Craft is a requirement, not polish.** World-class visual design, **WCAG 2.2 AA**, and tasteful,
   `prefers-reduced-motion`-aware motion are acceptance criteria. Ugly, inaccessible, or janky is *not done*.
   (Doctrine #6.)

---

## 2 · Voice & microcopy

**Voice:** calm, plain, honest, second-person. We sound like a competent private banker who respects you —
never a hype-machine, never a scold, never a chatbot performing personality. Numbers are never dramatized.
Errors apologize without groveling and always hand you the next step.

### 2.1 The lexicon (say the human word, keep the jargon internal)

| Say to the user | Never say | Note |
|---|---|---|
| recovery phrase | seed / mnemonic | "seed" stays an internal/code term |
| network fee | gas | fees are always shown, never hidden |
| convert | swap | "swap" is an internal term; user copy says "convert" |
| move / send | transfer (as a verb to the user) | |
| your wallet, your keys | non-custodial (unglossed) | explain the property, don't name-drop it |
| Testnet · uses free test coins | "sandbox" without a fee note | honesty about play-money |
| 🔴 Mainnet — moves REAL funds | "live mode" | real-money mode is unmistakable |

### 2.2 Rules

- **Restate the money, verbatim, always.** Any confirmation echoes the exact amount and destination the user
  is committing to. When parse confidence is below high, mirror the intent in one line first
  (*"Converting **all your BTC (~$2,100)** to **ETH** — correct?"*).
- **State irreversibility once, clearly, before it happens** — never after, never twice, never in fine print.
- **No codes in the user's face.** Error surfaces name the problem in plain language; raw codes, hashes,
  stack traces, and provider names live under a "Details" affordance for support only (see §5.4).
- **Never hype in system surfaces.** Banners are system-truth (*"Balances as of 2:41 PM — reconnecting…"*),
  not marketing.
- **Numbers appear atomically.** Money figures must never typewriter-animate — they render whole, instantly.
  Trust is the feature; a number that types itself in looks like it's being invented.

---

## 3 · The intent-first conversation model

The intent chat (the **Ask / AI** surface) is the product. It feels like messaging a competent banker, not
talking to a bot.

### 3.1 The command bar (the signature control)

A pill input — sparkle glyph, rotating placeholder of *real, executable* examples, mic affordance, send arrow
that springs in only when there is text. In web V2 the seeded examples are the ones the wallet actually
handles (`Swap 100 USDC for ETH`, `Send 0.1 ETH to 0x…`, `Move everything to stablecoins`, `Stake 1 ETH`) —
**we never advertise a prompt we can't honor.**

| State | Behavior |
|---|---|
| idle | rotating localized examples; send arrow hidden |
| focused | accent border, suggestion chips rise |
| thinking | shimmer, `role="status"` `aria-live="polite"` announces work; ≤ ~2.5 s budget, cancellable |
| degraded (LLM down) | banner + the command bar's fallbacks become **form launchers** — the degraded path is *designed*, not an accident (Send / Convert / Receive still work) |

### 3.2 Cards, not prose — for anything that touches money

The assistant **never** replies with a wall of prose for a money action. Plans render as **PlanCards**
(fixed anatomy — recognition is safety); read-only questions ("what's my biggest holding?") answer inline
with a mini portfolio card. Prose is for explanation and refusal only.

### 3.3 Conversation rules

- **One clarification at a time**, as chips, never a paragraph of questions:
  `Which Rahul? [Rahul K ·da94] [Rahul S ·9f2c] [Someone new]`.
- **Confidence mirroring:** below high confidence, restate before acting; verbatim amounts always restated.
- **Reads get no confirmation theater.** Answering "what's my balance" must never look like it's about to
  move money.
- **Honest scoped refusals.** Unsupported asks get a truthful boundary + what we *can* do:
  *"I can't do leverage yet. I can convert, send, and receive."* Never a silent failure, never a fake success.
- **Never a third silent retry.** Parse fails twice → *"I didn't get that — try one of these:"* + template chips.

### 3.4 A11y for the conversation

Assistant replies land in a polite live region; PlanCards are announced as one summary before their CTA is
reachable; voice input has **full typed parity** (nothing is voice-only). See §8.

---

## 4 · The core money flow: **Plan → Authorize → Sign → Confirm**

This four-phase machine is the spine of the product and the literal shape of Doctrine #2. In web V2 it is
implemented as the `PlanFlow` component driving `FlowPhase = 'planned' → 'authorizing' → 'authorized' →
'executing' → 'done'`. Every money action, from every entry point, flows through it.

```
 PLAN            AUTHORIZE              SIGN                 CONFIRM
 (AI proposes)   (code verifies)       (device disposes)    (on-chain truth)
────────────    ──────────────────    ─────────────────    ──────────────────
 parse → route   Risk + Policy gate     in-browser /         broadcast → poll
 → quote →       returns a Permission   on-device signature   → receipt (real)
 PlanCard        (can only REFUSE)      of the exact tx       or honest failure
```

### 4.1 What each phase owes the user

| Phase | The user sees | The rule |
|---|---|---|
| **Plan** | A PlanCard: what you send, what you receive (min), route, total cost, risk, ETA. | The plan is a *proposal*. Nothing has happened. Abandoning is free and asks nothing. |
| **Authorize** | "Security checked" + the Risk/Policy verdict (a `Permission` with `mayProceedToSign`). | The gate is deterministic and can only refuse. If it refuses, there is **no sign CTA** — the UI physically cannot proceed. |
| **Sign** | "Sign on device & execute" → *"Signing in your browser & broadcasting…"* | The signature is the point of no return. Everything before it is reversible; this is where irreversibility is stated. |
| **Confirm** | Real tx result with an explorer link, actual amounts, actual fees. | Only on-chain truth is labelled "done." If we can't really broadcast it, we say so — nothing is simulated as success. |

### 4.2 The PlanCard anatomy (fixed order — never reordered)

Recognition is a safety property; the same rows in the same order every time is how a user learns to trust at
a glance.

1. **Route summary** — `2 steps · ~12 min · via 2 partners`
2. **You send** — asset, amount, fiat
3. **You receive (min)** — amount with an explicit *"at least"* floor, fiat
4. **Total cost** — `$21.30 (1.01%)`, tap to itemize network / partner / our fee
5. **RiskBadge** — icon **+ label + color** (never color alone; §8)
6. **Expiry** — a live countdown; on expiry the CTA morphs to **Get new quote** (re-quote in place, diff highlighted)

### 4.3 The honesty seams inside the flow (V2, real)

- **Live quote is the signed quote.** For a real swap, the minimum-received shown in the header, the cost
  table, and the execute button are all the *same* live on-chain `amountOutMinimum` — never a plan-time
  estimate that could drift from a thin pool.
- **User-owned slippage.** The user picks max slippage (e.g. 0.1% / 0.5% / 1%); we display the guaranteed
  floor (*"You receive at least 0.612 ETH"*). The swap reverts on-chain rather than deliver less — slippage
  and MEV can never *silently* cost the user.
- **No fake fallback.** If the on-device wallet cannot really sign and broadcast a plan, the UI says exactly
  that (*"This swap can't be executed in-browser yet — nothing was broadcast."*) and signs nothing. A green
  checkmark is *earned on-chain* or not shown.

---

## 5 · State design — the honesty doctrine

Every data surface designs **all** of these. Empty is not error; a failed read is not zero. This is Doctrine
#3 rendered as pixels, and it is the single most-tested UX property in the codebase.

### 5.1 The state matrix (every screen implements it)

| State | Rule |
|---|---|
| **Loading** | Skeleton matching the *final* layout within ~100 ms. On refresh, keep last-known data visible with a shimmer — never blank-then-pop. Spinners only inside buttons. |
| **Empty** | One glyph, one inviting sentence of what goes here, exactly **one** primary CTA that creates the first item. Tone is inviting, never a dead end. |
| **Partial** | Some reads succeeded, some didn't. Show what you have; name what's missing and *exclude it from totals with a notice* (see §5.2). Never average a hole to zero. |
| **Stale** | Show the data, dim to ~70%, add a clock + *"as of 2:41 PM"*, quietly reconnect. Wallets must never silently show wrong or zero numbers. |
| **Error** | Name the problem plainly, state the cause if known, offer the next action. Distinguish **retryable** (offer Retry) from **terminal** (offer an alternative / support). Never a raw code in the face. |
| **Offline** | Global banner; cached reads work; any money action needing the network is **disabled up front** with *"You're offline"* — never a failure discovered after the tap. |
| **Success** | Real, on-chain, with a receipt. Better-than-quoted gets subtle honest delight; worse-than-quoted (within slippage) is stated plainly, never hidden. |

### 5.2 Network-fail ≠ $0 (the cornerstone)

The balance layer is **fail-soft and truthful**: a chain that errors reads `null` ("—"), *not* `0`. A genuine
zero balance and an unreachable chain are **different states with different UI**. The net-worth total is only
computed from assets that both priced and read successfully; when a chain can't be reached, the total says so
(*"Bitcoin couldn't be reached — the total excludes it."*) rather than quietly shrinking. Any new balance,
portfolio, or asset screen **must** mirror this four-way distinction:

| Read | Price | Show |
|---|---|---|
| ok | ok | the value |
| ok | fail | the amount, fiat as "—" (unpriced, not $0) |
| fail | — | "—" + a "couldn't reach" notice; **excluded from total** |
| genuine 0 | ok | `$0.00` (a real, honest zero) |

### 5.3 Error → UI mapping (from the API `code` strings)

The user **never** sees a raw code, stack, hash, or provider name in a primary error surface. That detail
lives under "Details" for support.

| `code` | User-facing copy | Treatment | Action |
|---|---|---|---|
| `INTENT_AMBIGUOUS` | "Which one did you mean?" | clarification chips | pick |
| `INTENT_UNSUPPORTED` | "I can't do that yet — here's what I can" | message + capability chips | — |
| `PLAN_EXPIRED` | "This quote expired" | PlanCard dims | Get new quote |
| `NO_ROUTE` | "No good route right now" | inline notice | Try again later |
| `RISK_BLOCKED` | "Blocked for your safety" + reasons | block banner, **no CTA** | Why / Report |
| `SIMULATION_MISMATCH` | "This would do something unexpected" | danger panel | Cancel only |
| `INSUFFICIENT_FUNDS` | "Not enough — Max is $X" | inline on amount | Use Max |
| `RATE_LIMITED` (429) | "Give it a moment" | toast + auto-retry w/ backoff | auto |
| network / 5xx | "Something went wrong on our side" | error state | Retry + Contact support |

### 5.4 Progressive disclosure of the scary stuff

Hashes, addresses, raw fees, provider names, and error codes are *available* but not *foregrounded*. They sit
behind "Details" — present for the user who wants them and for support, absent from the calm primary path.

---

## 6 · Safety & confirmation UX (irreversible + mainnet)

Fail closed. The confirmation is the trust boundary, and its whole job is to make the truth of what's about to
happen unmissable. This is where we out-Rabby Rabby: decode client-side, show effects, never trust server text
for what leaves the wallet.

### 6.1 Risk-gated confirmation (the ConfirmSheet CTA scales with danger)

| Risk | CTA |
|---|---|
| **LOW** | primary button (may collapse the risk row) |
| **MEDIUM** | button labeled *"I understand, continue"*; risk row always expanded |
| **HIGH** | hold-to-confirm (~800 ms, progress ring + escalating haptic); typed amount for values above the user's threshold |
| **BLOCK** | **no CTA at all** — *"Why blocked"* + *"Report mistake"* only |

A BLOCK is a full-width banner, not a badge. The user *cannot* click past a block; the gate refuses and the UI
has nothing to press. (This is Doctrine #2 made physical: a pure gate can only refuse.)

### 6.2 The mainnet real-funds guard (V2, real)

Testnet and devnet run straight through (free coins, labelled testnet). A **real mainnet broadcast never fires
without an explicit confirm** — that deliberate click *is* the `GuardAck` the deterministic guard demands. In
web V2 this is an `alertdialog` that:

- Names it unmistakably: **"⚠️ Real mainnet transaction — this moves REAL funds."**
- Restates the exact amount, asset, chain, and full destination address, and states *"signed on your device
  and cannot be undone."*
- Passes `acknowledgeMainnet: true` to the guard on confirm.
- **Caps and escalates:** above the **$1,000** cap, an extra *"I understand this exceeds the $1,000 limit"*
  checkbox appears and the confirm button stays **disabled until it's checked** (`acknowledgeHighValue`).
- Accrues a real-USD daily ledger so Auto-mode caps actually bind on the *next* mainnet tx.

> Web V2 wires **ETH sends for mainnet**; tokens and swaps stay on Sepolia for now. We label this honestly and
> never imply broader mainnet coverage than exists.

### 6.3 Auto vs Manual mode (bounded autonomy that fails safe)

- **Manual** (default): every tx is a deliberate authorize → sign click.
- **Auto**: within user-set per-tx and daily USD caps, the flow drives authorize → execute with no per-tx
  click — but it **still** signs in-browser and **still** passes the Risk/Policy gate. `autoDecision()` fails
  safe: a risk-block, an unpriced/over-cap amount, or a mainnet plan drops back to manual with a visible
  reason (*"⚡ Auto paused — exceeds daily cap. Confirm manually below."*). **A mainnet plan can never
  auto-fire** — `execute()` opens the real-funds confirm instead. Auto never retries a failed tx (that would
  loop an RPC forever); the manual button reappears for a deliberate retry.

### 6.4 Universal irreversibility rules

- Pre-signature, **everything is free to abandon** — dismissing a plan or confirm asks nothing, because
  nothing has happened. Leaving *mid-signature* warns once.
- Destructive local actions (wipe wallet, reveal recovery phrase) **re-authenticate** at the moment of the
  action and state their consequence once, plainly.
- The recovery-phrase reveal is solemn: re-auth, no clipboard copy offered, blur on background, a fast fade
  (never a playful flip).

---

## 7 · Navigation model

### 7.1 What web V2 actually is

`apps/web` is a **state-based section shell** — Vite + React + one `styles.css`, **no router library**. An
`AuthGate` (pre-login) hands off to a `WalletShell` that renders exactly one `Section` at a time:

```ts
type Section = 'home' | 'ai' | 'portfolio' | 'activity' | 'settings';
```

- **Sidebar / bottom-nav** with `aria-current="page"` on the active item; one section visible at a time.
- The intent surface (**AI / Ask**) is both a nav section *and* reachable from the Home command bar — both
  entries converge on the same conversation.
- **`entered` (the AuthGate pass) is not `isUnlocked()`.** Section content that touches keys must check the
  real lock state, not merely that the shell mounted. Leaving Settings re-locks sensitive reveals.
- Features live **in their section** — never bolt a feature onto the wrong surface.

> The mobile design spec ([`docs/design/03-navigation.md`](docs/design/03-navigation.md)) describes a 4-tab IA
> (Home · Ask · Activity · Settings) with Portfolio nested under Home. Web V2 promotes Portfolio to a
> top-level section. Both are canonical for their platform; when they diverge, reconcile on purpose — don't
> silently drift one toward the other.

### 7.2 Sheets vs pushes (the mobile grammar)

- **Sheets** = value-moving confirmations and quick tasks (confirm, receive QR, "why?" risk detail). A sheet
  never pushes a full screen; at most one sheet stacks over another.
- **Pushes** = browsing (asset detail, settings).
- **Scrim tap dismisses a sheet only when no money action is pending.**

### 7.3 Money state is never lost to navigation

- Back / dismiss **before signature** costs nothing.
- **Execution is interruptible and server-truth**: the user may leave mid-execution; a persistent
  *"1 in progress ▸"* pill docks until a terminal state; reopening restores the exact state.
- **Locked state** replaces the whole tree with Unlock; deep links queue and resolve *after* unlock.

---

## 8 · Accessibility patterns (WCAG 2.2 AA — non-negotiable, gated in CI)

Accessibility is a correctness property here, not a nicety. Money you can't perceive or operate is money you
can lose.

### 8.1 Focus

- **Focus trap in every modal/sheet** (`role="dialog"`/`"alertdialog"` + `aria-modal="true"`): focus moves in
  on open, `Tab` cycles inside, `Esc` closes (when no money action is pending), focus returns to the invoking
  control on close. (V2 ships this as a shared `useDialog` hook — reuse it; never hand-roll a trap.)
- On navigation, focus moves to the *meaningful* element, not the top of the DOM.
- Focus order matches visual order, always.

### 8.2 Live regions (announce change without stealing focus)

| What changes | Region |
|---|---|
| assistant is thinking | `role="status"` `aria-live="polite"` |
| assistant reply / PlanCard summary | polite live region, announced as one sentence |
| errors | `role="alert"` (assertive) |
| balances stale / reconnecting | polite |
| countdown / quote expiry | polite; announced at the 10 s mark, not every tick |

### 8.3 Keyboard & targets

- **Everything operable by keyboard.** Every interactive element is a real, labelled control.
- Touch/click targets ≥ **44×44**; primary actions sit in the thumb-reachable zone on mobile.
- Icon-only controls carry an `aria-label` (`View transaction on block explorer (opens in new tab)`);
  decorative glyphs are `aria-hidden`.

### 8.4 Perception

- **Contrast:** ≥ 4.5:1 body text, ≥ 3:1 large text / icons / focus rings — from pre-verified token pairs.
- **Color is never the sole channel.** Risk and status are **icon + label + color** together, verified
  colorblind-safe. A red thing must also *say* it's dangerous.
- **Dynamic Type to XXL:** amounts wrap, never truncate; layouts reflow with no clipped buttons; tested at the
  largest size and at +40% string length (localization expansion).
- **Motion:** `prefers-reduced-motion` swaps springs/slides for ~150 ms cross-fades and disables celebrate;
  nothing is conveyed by motion alone.
- **Alternatives:** hold-to-confirm has a switch-control alternative; voice intent has full typed parity;
  QR/scan flows have manual entry; charts have a data-table read-out.

---

## 9 · Motion & feedback

Motion is timing and restraint, not decoration. Nothing blocks input longer than ~300 ms.

| Token | Value | Use |
|---|---|---|
| `motion.instant` | 80 ms linear | pressed states, toggles |
| `motion.quick` | 200 ms ease-out | fades, chips, row expand |
| `motion.standard` | 300 ms (0.2,0,0,1) | section/screen transitions |
| `motion.sheet` | spring (m1 d26 s300) | sheet present/dismiss |
| `motion.celebrate` | 600 ms ease-in-out | success checkmark — **once**, never looping |

- Loading buttons keep their **label** and stay loading a minimum ~400 ms (no flicker) — *"Approving…"*, never
  a bare spinner. Double-tap is guarded by disable-on-first-tap.
- **Success celebrates once.** A completed execution gets a single check-bloom, not a party loop.
- Haptics map to meaning (success / warning / error / selection); reduced-motion disables celebrate but not
  the informational haptics.

---

## 10 · Numbers & formatting (money is sacred)

Money is **integer `bigint`** base units end-to-end; format for humans only at the very edge (Doctrine #4).

- **Fiat:** locale currency, 2 decimals ≥ $1; `< $0.01` shows as *"<$0.01"*; large values grouped
  (Indian grouping `1,00,000` supported).
- **Crypto:** up to 6 significant figures, trailing zeros trimmed; full precision on tap. Never render 18 raw
  decimals.
- **Tabular numerals everywhere** (`font-variant-numeric: tabular-nums`) so amounts don't jitter as they update.
- **Rounding direction on confirms is conservative and never flattering:** *"you receive"* rounds **down**,
  *"you send / pay"* rounds **up**. We never make a number look better than the commitment behind it.
- **Deltas** carry an explicit sign; losses are red only in *risk* contexts, never in a balance (a portfolio
  that's down is not an error).

---

## 11 · Onboarding & first-value

Goal: from cold launch to *"I understand this and I'm in control"* as fast as honesty allows.

### 11.1 The arc

`Welcome (one promise) → Create on-device → Secure (backup) → Verify → Local unlock → Home`, or
`Welcome → Import phrase → Local unlock → Home`.

- **Create is visibly on-device.** "Keys generated on this phone ✓ · Never sent anywhere ✓" — we *show* the
  non-custodial promise landing (with a deliberate floor so it registers), never claim it in fine print.
- **Backup with honest deferral.** *"A recovery phrase is the ONLY way back in… we can't recover it for you"*
  → **Back up now** or an honest **Do it later** (no shame-trick), which sets a capped, respectful nudge and a
  persistent banner. The "only way back" sentence is a heading a screen reader must not skip.
- **Verify the backup actually happened** — a short quiz on random positions; a wrong pick never reveals the
  right answer.
- **Reveal is maximally private** — hold-to-reveal, capture-blocked, blur on app-switch, no clipboard copy,
  re-auth to view.
- **Import is forgiving** — auto lowercase/trim/collapse; per-word BIP-39 validation with suggestions; paste
  the whole phrase then **clear the clipboard and toast it**; specific errors (which word, bad checksum, wrong
  length); an empty imported wallet still succeeds with an honest *"was that the right phrase?"* prompt.
- **Recovery is reassurance-first:** *"Your money is already safe. Let's set your phone back up."*

### 11.2 First-value

The first thing a new user *sees* is their universal identity (one seed → BTC + SOL + EVM addresses) and their
real holdings — honest empty states included. The first thing they can *do* is type an intent. We don't gate
first value behind a tour.

---

## 12 · The web-vs-mobile reality line (so we never fake)

Doctrine #3 forbids implying features we don't ship. This section keeps the guidelines honest about *today*:

| Pattern in this doc | Web V2 reality | Notes |
|---|---|---|
| Plan → Authorize → Sign → Confirm | **Real** (`PlanFlow`) | testnet real broadcast; guarded mainnet ETH |
| Real swaps | **Sepolia Uniswap v3 pairs only** | other pairs: honest "can't broadcast yet" |
| Mainnet | **ETH sends only**, guarded + capped | tokens/swaps stay testnet; labelled as such |
| Local unlock | **PIN/password** (scrypt + AES-GCM) | biometric / Face ID is the mobile pattern & roadmap |
| Hold-to-confirm / haptics / Live Activity | **mobile design spec** | web mainnet guard is an explicit `alertdialog` ack |
| ConfirmSheet as a bottom sheet | web renders the **same anatomy inline** in `PlanFlow` | sheet presentation is the mobile form |

When a pattern here is aspirational for a platform, we ship the *honest subset* and label it — never a
convincing shell around a feature that isn't wired.

---

## 13 · Definition of Done — the UX acceptance checklist

A user-facing change is **not done** until every box is true. This is the UX exit gate of the Build Loop.

- [ ] **All five+ states designed and built:** loading, empty, partial, stale, error, offline, success.
- [ ] **Network-fail ≠ $0** honored on every balance/portfolio surface (null vs genuine zero distinguished).
- [ ] **The money is restated verbatim** before any irreversible action; irreversibility stated once.
- [ ] **Fail-closed:** anything unverifiable is blocked; a BLOCK offers no CTA.
- [ ] **Mainnet/real-funds actions** carry the explicit guard ack (+ high-value ack over cap).
- [ ] **Keyboard-complete:** every control reachable and operable; focus trapped in modals; focus returns on close.
- [ ] **Live regions** announce thinking / stale / error / countdown without stealing focus.
- [ ] **Color is never the only channel;** contrast AA; targets ≥ 44px; icon-only controls labelled.
- [ ] **Dynamic Type / +40% strings** reflow without truncation or clipped buttons.
- [ ] **`prefers-reduced-motion`** path verified; no motion-only meaning; celebrate fires once.
- [ ] **Amounts are `bigint` to the edge;** tabular nums; conservative rounding on confirms.
- [ ] **No fabricated data, no fake success, no advertised-but-unwired feature.**
- [ ] **Proven by driving the real flow** in **light and dark**, with a screenshot/recording — not a green typecheck.

---

## 14 · Anti-patterns (things we never do)

- Show `$0` (or a shrunken total) for a failed network read.
- Report a tx "confirmed" / "done" without on-chain truth, or simulate a success.
- Let the assistant's text move money, or imply it can.
- Offer a CTA past a risk BLOCK, or auto-fire a mainnet transaction.
- Bury or animate-in the amount the user is committing to.
- Put a raw error code, hash, or provider name in the user's face.
- Advertise a prompt, chain, or feature the wallet can't actually honor.
- Ship a screen that's keyboard-dead, color-only, un-announced, or motion-required.
- Use a router library or a component kit in `apps/web` (one `styles.css`, state-based nav — by constitution).

---

### Where to go deeper

| For… | Read |
|---|---|
| The Doctrine, Council, Build Loop, routing | [`CLAUDE.md`](CLAUDE.md) |
| Tokens & components (the atoms of this doc) | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), [`docs/design/01-tokens.md`](docs/design/01-tokens.md), [`docs/design/02-components.md`](docs/design/02-components.md) |
| Every screen, spec'd | [`docs/design/`](docs/design/README.md) (03 nav · 04 onboarding · 05 home · 06 intent · 07 settings · 08 standards · 09 journeys) |
| The intent pipeline & agent boundary | [`docs/architecture/13-intent-engine.md`](docs/architecture/13-intent-engine.md), [`docs/architecture/20-ai-copilot.md`](docs/architecture/20-ai-copilot.md) |
| Keys, signing, the confirmation as a security boundary | [`docs/security/wallet-core-threat-model.md`](docs/security/wallet-core-threat-model.md) |

> **The final word.** If a screen is beautiful but lies, it fails. If it's honest but unusable, it fails. If
> it moves money the user didn't clearly authorize, it fails and is reverted. Ship world-class *and* true — or
> don't ship.
