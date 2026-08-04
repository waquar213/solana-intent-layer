[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Volume IV — the long-form behind [Chapter 9 — AI Financial Brain](../bible/chapter-09-ai-financial-brain.md)

# The AI Financial Brain Reference

*The buildable expansion of Chapter 9's charter — memory, insights, goals, and coaching, all propose-only — grounded in the real intelligence engine, shipped-vs-roadmap tagged.*

**About this document.** [Chapter 9](../bible/chapter-09-ai-financial-brain.md) is the memorize-it charter.
This is its **reference spec**: persistent memory, preference learning, goals, recommendations, portfolio
intelligence, spending/investment insights, risk-profile adaptation, automation suggestions, and
briefings/long-term planning — each tagged **SHIPPED** or **ROADMAP**. Two lines never move: the Brain
**proposes, explains, and remembers with consent but NEVER signs**; and **numbers are computed by
deterministic code and narrated by the AI — never fabricated** (the shipped AI-narrator boundary).

| § | Section | Grounded in |
|---|---|---|
| 1 | Persistent AI Memory | `AI.md` memory boundaries, settings (roadmap-heavy) |
| 2 | User Preference Learning | Ch7 §9 + settings (roadmap) |
| 3 | Financial Goals & the Goal Engine | Ch7 §14 (roadmap) |
| 4 | Personalized Recommendations | `packages/intelligence` insight/alert engines |
| 5 | Portfolio Intelligence | `packages/intelligence` + `/v1/portfolio/insights` (shipped) |
| 6 | Spending & Investment Insights | `packages/intelligence` insight/scenario/tax |
| 7 | Risk-Profile Adaptation | `packages/risk` + `runtime/policy` (enforcement shipped) |
| 8 | Automation Suggestions | `packages/automation` + the Auto/Manual mode |
| 9 | Daily Briefings & Long-Term Planning | Ch4 §AI Dashboard + Ch2 (roadmap) |

Honesty first: the analytics engine + the AI-narrator boundary are shipped; long-term memory, learning,
goals, coaching, and the review cadence are roadmap.

---

## §1 · Persistent AI Memory

> *A great advisor is worth what they remember. But the moment "what it remembers" becomes "what it can
> do," memory has become a key — and a key that a server holds is a key the user has lost. This section is
> the discipline that lets the Brain remember you deeply while remembering nothing that could ever move
> your money. Memory feeds **context**, never **authority**.*

The promise of Chapter 9 is a wallet that stops being a tool and becomes an assistant — one that learns your
patterns, holds your goals, and never asks the same question twice ([Chapter 4 · AI Memory](chapter-04-conversation-first-ux.md)).
That promise is almost entirely **the target**, and this section says so plainly. What ships today is the
*narrow* memory a single conversation needs; the *long* memory — a durable record of who you are financially,
what you are trying to do, and what you have done before — is designed here as roadmap, and designed from the
first line so it can never break custody.

The governing rule is one sentence: **memory changes what the Brain _says_ and _proposes_, never what it can
_do_.** Every figure is still computed by a deterministic engine and only narrated by the model
([`intelligence/narrator.ts`](../../packages/intelligence/src/narrator.ts) · `verifyNarrative`); every plan
is still made actionable only by the single Policy chokepoint ([`copilot/gate.ts`](../../packages/copilot/src/gate.ts));
every automated action still runs inside a cryptographically-bounded session key (§8, [Ch7](chapter-07-universal-intent-engine.md)).
So even a **fully corrupted memory store** — poisoned, forged, replayed — cannot move a satoshi. The worst a
bad memory can do is make the Brain *say a wrong sentence*, which the fact-grounding layer
([`copilot/verify.ts`](../../packages/copilot/src/verify.ts)) then catches. Memory is powerful and untrusted
at the same time, on purpose.

---

### 1.1 · The three memory tiers

The Brain's memory is stratified by lifetime and by trust. Each tier is a different scope, a different store,
and a different honesty label.

| Tier | Lifetime | Holds | Store | Status |
|---|---|---|---|---|
| **T0 · Session context** | one turn / one conversation | the turn's verified facts, the recent messages, the assembled portfolio snapshot | `FactLedger` + `ContextAssembler` (in-process) | **Shipped** |
| **T1 · Durable preferences** | across sessions, per device | enumerated settings — tx mode, caps, network, auto-lock, contacts; the closed `UserPreferences` shape | `localStorage` / device store; `PreferenceStore` | **Partly shipped** |
| **T2 · Long-term financial memory** | months / years, cross-device | goals, recurring patterns, past intents, milestones, learned cadence | encrypted vault + opt-in E2E sync | **Roadmap** |

**T0 — Session context (shipped).** This is the memory a conversation cannot function without, and it is
real code today. `ContextAssembler.assemble` ([`copilot/context.ts`](../../packages/copilot/src/context.ts))
runs the Intelligence engine **once per turn** and seeds a `FactLedger`
([`copilot/ledger.ts`](../../packages/copilot/src/ledger.ts)) with the headline figures — net worth, health
score, top asset and its weight, diversification, position count — so a question like *"how's my portfolio
doing?"* is answered from verified facts on the sub-2s path with zero LLM round-trips. Recent turns are
carried as `history` on the request ([`CopilotRequest`](../../packages/copilot/src/types.ts)); the utterance
is always a `user` message, never spliced into the system prompt
([`copilot/boundary.ts`](../../packages/copilot/src/boundary.ts)). T0 is deliberately **ephemeral** — it dies
with the turn — because the whole point of the ledger is that *this response* cites *this turn's* ground
truth and nothing stale. Multi-turn continuity (referring back three messages) is shipped; durable
*conversation history* that survives an app restart is a T2 concern below.

**T1 — Durable preferences (partly shipped).** This is the "never ask twice" tier from
[Ch4 · AI Memory](chapter-04-conversation-first-ux.md), and it is *half* real. What ships: per-device,
non-secret settings persisted in `localStorage` — transaction mode (Manual/Auto), the Auto-mode spend caps,
network mode (testnet/mainnet), idle auto-lock ([`apps/web/src/settings.ts`](../../apps/web/src/settings.ts)),
plus contacts and the multi-account identity graph. What exists as *engine but is not yet persisted or
personalized-from*: the closed `UserPreferences` model in [`copilot/memory.ts`](../../packages/copilot/src/memory.ts)
— language, risk tolerance, preferred/avoided assets, target allocation, route preference, automation and
notification opt-ins. That shape is real, `sanitizePreferences` is real, `PreferenceLearner` is real; the
durable **persistence and sync** of it, and the act of *reading it back to shape a recommendation*, are the
roadmap. How T1 *grows* — learning a preference from an accepted suggestion rather than a settings toggle —
is [§2 · Preference Learning](#), and this section defers the mechanism there.

**T2 — Long-term financial memory (roadmap).** This is the tier that turns a tool into an advisor, and none
of it ships today; it is designed here as the target. T2 is a durable, cross-device record of:

- **Goals** — *"save ₹1 crore," "30% stables by December," "never hold more than 2 ETH of gas exposure."*
  The goal object and the engine that tracks progress are [§3 · Financial Goals](#); T2 is where a goal
  *lives* between sessions.
- **Patterns** — *you DCA into BTC on the 1st, you sweep to stables when volatility spikes, you never bridge
  to a chain you haven't used.* Derived, not declared. Feeds [§4 · Recommendations](#) and
  [§8 · Automation Suggestions](#).
- **Past intents** — a durable, user-owned log of what you *asked for* and what *happened* (the plan, the
  gate verdict, the signature, the settlement). This is the raw material of every other tier — and it is also
  the [Doctrine #8](../../CLAUDE.md#3--the-doctrine--laws-no-change-may-break) audit trail, kept for the user,
  not about the user.
- **Milestones** — first cross-chain send, first ₹1L saved — the memory that lets a daily briefing
  ([§9](#)) say something true and human.

Every T2 record is **derived data over facts the engines already computed** — never a new number the model
authored. A pattern like *"you usually keep ~15% in stables"* is a statistic over your own history, computed
by deterministic code and merely *narrated*; it is never the model's guess. That is the T2 design constraint
that keeps [Doctrine #3](../../CLAUDE.md#3--the-doctrine--laws-no-change-may-break) intact as memory deepens.

---

### 1.2 · What is never stored — secret-incapable by construction

Memory is the most tempting place in the whole system to leak a key, so the defense is **structural, not
careful**. It is not that we are diligent about keeping secrets out of memory; it is that the memory shapes
are *incapable of holding a secret* even against a buggy or malicious writer.

**Never — in any tier, store, prompt, tool argument, sync payload, or learned value:**

- private keys, seed phrases, mnemonics, or unencrypted vault bytes
- passwords, PINs, session tokens, or biometric material
- full addresses beyond what the user themselves typed into a message

Keys are generated and used **on-device**, encrypted at rest (scrypt + AES-256-GCM); the server never holds a
secret to leak ([Doctrine #1](../../CLAUDE.md#3--the-doctrine--laws-no-change-may-break),
[Ch5](chapter-05-universal-identity.md)). Memory sits entirely *outside* that boundary.

Three enforced mechanisms make "no secret in memory" a property of the *types*, checked in code
([AI.md §7](../../AI.md)):

1. **A closed, enumerated preference shape.** `UserPreferences` is enums, `SYMBOL_RE`-shaped strings
   (`/^[A-Z0-9]{1,10}$/`), ratios in `[0,1]`, and booleans — *only*. There is no free-text field, no `notes`
   blob, no address slot. A 64-hex private key does not fit any field; it is not that we reject it, it is that
   there is nowhere to put it ([`copilot/memory.ts`](../../packages/copilot/src/memory.ts)).
2. **A sanitizing writer.** `sanitizePreferences` coerces arbitrary input against the enums and drops anything
   off-shape — defense in depth against a bad writer, so even a compromised code path cannot persist a
   secret-shaped value.
3. **Redaction on every model-facing surface.** Any context assembled for a model call passes through
   `redact()` ([`copilot/context.ts`](../../packages/copilot/src/context.ts)), which scrubs private-key- and
   long-hex-shaped tokens — so a key can never reach the model even through an answer or a stray field. T2's
   durable stores inherit the same rule: **redact before you persist, redact before you sync.**

The T2 design extends this discipline rather than relaxing it: goals, patterns, and past-intent logs are
composed of enumerated kinds, symbols, bigint amounts (base units, [Doctrine #4](../../CLAUDE.md#3--the-doctrine--laws-no-change-may-break)),
ISO timestamps, and references to on-chain hashes — never a secret, never a raw key. A long-term memory that
*could* hold a seed would be a redesign, not a feature.

---

### 1.3 · The privacy model — on-device first, E2E-encrypted sync, user-owned

Memory is the user's, held the way the keys are held: **on the device, by default, in the clear only to the
person who owns it.** The privacy model has four commitments, aligned with
[Ch5 §10 · Multi-Device Sync](chapter-05-universal-identity.md) and
[Ch5 §18 · Privacy Principles](chapter-05-universal-identity.md).

**On-device by default (shipped for T1).** T0 lives in process; T1 lives on the device
(`localStorage` / secure device store). Nothing about your preferences leaves the machine unless you turn on
sync. The wallet clearly distinguishes what is stored *locally* from what is *synced* — a Ch5 privacy
principle made concrete per field.

**E2E-encrypted sync of non-secret state only (roadmap).** When T2 syncs across your iPhone, laptop, and the
web, it follows the exact rule keys follow: **sync only encrypted data.** The sync payload is
end-to-end-encrypted with a key derived on-device from the user's own material — the server stores ciphertext
it cannot read and never holds a decryption key. And the payload is *non-secret to begin with*: goals,
patterns, preferences, and intent logs, never a private key (which does not sync — recovery is its own
audited path, [Ch5](chapter-05-universal-identity.md)). This is a strictly weaker capability than key sync,
which does not exist. Two independent guarantees stack: even a total server breach yields ciphertext, and
even decrypted, it is a preference profile, not a wallet.

**Consent is explicit, inspectable, and reversible.** Sync is **opt-in**, off until the user turns it on.
Everything the Brain remembers is **shown, not hidden** — a memory a user cannot see is a memory we do not
keep. Learned preferences flip *visible* opt-in flags a user can read and reset; there is no opaque
behavioral profile accreting in the dark ([AI.md §7](../../AI.md)).

**Erase and export are first-class (DSAR).** A user can **erase** any memory — a single goal, a learned
pattern, a whole tier — or **export** everything the Brain holds about them, satisfying data-subject-access
and right-to-erasure ([Ch5 §18](chapter-05-universal-identity.md)). Erase is real erase: it deletes the local
record and tombstones the synced ciphertext, and because no secret ever entered memory, erasing memory never
touches the user's ability to control their funds. Retention is bounded and stated per tier; the durable
past-intent log doubles as the [Doctrine #8](../../CLAUDE.md#3--the-doctrine--laws-no-change-may-break) audit
trail, so "auditable" and "erasable by its subject" are reconciled rather than in tension.

---

### 1.4 · Personalization without manipulation

Memory exists to make the Brain feel like a **Senior Financial Advisor, never a Salesman**
([Ch4 · AI Personality](chapter-04-conversation-first-ux.md)) — and the difference between the two is entirely
in how memory is *used*. An advisor remembers your goals to serve them; a salesman remembers your weaknesses
to exploit them. The line is drawn in code and in doctrine.

- **Memory personalizes the framing, never the facts.** It can change *which* true thing the Brain surfaces
  first (you care about stables → lead with your stablecoin weight), the *order*, the *language*, the *tone*.
  It can never change a number. Every figure remains a `CitedFact` reconciled against the turn's ledger
  ([`copilot/verify.ts`](../../packages/copilot/src/verify.ts)); a remembered preference cannot make a
  fabricated figure pass, and `hasUncitedNumerics` still scans the prose. Personalization sits *entirely* on
  the narration side of the deterministic boundary.
- **No dark patterns, ever.** Memory is forbidden from manufacturing urgency, FOMO, or hype
  ([Ch4 · AI Personality](chapter-04-conversation-first-ux.md)). It does not learn *"this user panic-sells, so
  push volatility alerts to drive activity."* Recommendations remain propose-only ([§4](#)); nothing memory
  learns can weaken a cap, pre-check a consent, or nudge toward an irreversible action the user did not ask
  for.
- **The user is always in control, and can always see why.** Because every remembered value is inspectable
  and every recommendation cites the memory it used (*"you told me you prefer the cheapest route, so…"*),
  personalization is legible. The user can always ask *"why are you telling me this?"* and get the honest
  answer: the fact, and the remembered preference, that produced it.
- **Memory never sits between the user and comprehension.** A remembered preference for Auto mode still runs
  the full Risk + Policy gate and still binds to the spend caps ([`settings.ts` · `autoDecision`](../../apps/web/src/settings.ts));
  "the Brain knows you" never becomes "the Brain assumes for you" on anything that moves value. Comprehension
  precedes any signature, remembered or not.

The benchmark is a Copilot Money that actually forgets nothing and a private banker who never upsells: the
warmth of being known, inside the cage of a wallet that cannot act on what it knows. Memory makes the
conversation shorter and the advice sharper — and leaves the signature exactly where the Doctrine puts it, on
the user's device.

---

**What §1 commits us to.** Session memory that grounds every answer in this turn's verified facts (shipped);
durable preferences that are enumerated, non-secret, on-device, and inspectable (partly shipped); a long-term
financial memory of goals, patterns, and past intents that is derived-not-invented, E2E-encrypted, opt-in,
and erasable (roadmap) — and, across all three, the one invariant that never moves: **memory feeds context,
never authority.** The Brain remembers everything it is permitted to, proposes from it, explains with it — and
signs nothing. How memory *grows* is [§2](#); what it remembers you are *trying to do* is [§3](#).


## §2 · User Preference Learning

A good financial advisor does not make you re-explain yourself every session. The third time you wave off
the fast-but-expensive route, they stop offering it first. The wallet should earn that same "it knows me"
feeling — **but under a cage that a human advisor never has to prove and an engagement-optimised app
routinely violates.** This section specifies how the Brain gets better from what the user *does*, and,
with equal weight, the hard boundaries that keep learning from ever becoming a lever on the user's funds.

The one-line contract: **learning may only sharpen a suggestion the user still approves.** It computes no
number, moves no money, relaxes no guard, and grants no authority. A preference is a *bias on a proposal*,
never a decision. Everything downstream of the proposal — the deterministic numbers, the Risk and Policy
gates, the on-device signature — is exactly as it would be for a first-time user (Doctrine #2). If learning
disappeared tomorrow, no plan would become less safe; the user would just be offered a worse first guess.

> **Honesty up front.** The *mechanism* is shipped and pure: the enumerated `UserPreferences` shape, its
> sanitiser, its store, and a learner that flips one opt-in on an explicit acceptance
> ([`packages/copilot/src/memory.ts`](../../packages/copilot/src/memory.ts), tested). The **surfaced
> experience** — inferring fee-sensitivity, route bias, and risk tolerance from behaviour and adapting the
> assistant to it — is **ROADMAP**, designed here as the target. "The learner exists" ≠ "the wallet learns
> your style." We tag each claim.

---

### 2.1 · The learning signals — what the wallet may observe

Chapter 4 (§AI Learning) and Chapter 7 (§7 Personal Preference Engine, §15 Intent Memory) name the raw
evidence. After every plan the user reviews, the wallet already holds a small set of *behavioural facts*
about that turn — facts it computed anyway, no surveillance required:

| Signal (Ch4 §AI Learning / Ch7 §15) | What the user did | Candidate inference | Status |
|---|---|---|---|
| **Accepted a suggestion** | Said yes to a DCA / stop-loss / stable-sweep proposal | Flip the matching opt-in on | **SHIPPED** (`PreferenceLearner.onAccepted`) |
| **Cancelled** | Abandoned a plan at review | Weak negative on that route/asset/style | **ROADMAP** |
| **Changed the route** | Overrode the proposed route for a cheaper/faster/safer one | `routePreference` bias toward the chosen axis | **ROADMAP** |
| **Rejected the fees** | Backed out citing cost, or picked the low-fee alternative | Higher fee sensitivity | **ROADMAP** |
| **Ignored the recommendation** | Dismissed an insight repeatedly | Down-rank that recommendation class | **ROADMAP** |
| **Repeated a pattern** | Always converts to the same stablecoin; reuses the same network | `preferredAssets` / preferred network default | **ROADMAP** |

Two disciplines govern which signals count. First, **positive consent is strong; behavioural inference is
weak.** An explicit "yes" is unambiguous — that is why the *only shipped* learner learns from acceptance and
nothing else. A cancel is ambiguous (the user may have simply changed their mind, or been interrupted), so
negative-signal inference is roadmap and, when built, must be *hysteretic*: one cancel never flips a
preference; a consistent pattern across several turns does. Second, **a signal is a behavioural fact, never
content.** The wallet records *that* a cheaper route was chosen (an enumerated axis), never a free-text note
about the user — the shape below makes that structural, not a promise.

---

### 2.2 · From signal to preference — the inference model

Inference is a pure function from a window of recent behavioural facts to a *proposed* change in the
enumerated preference shape. The target shape is real and already the wallet's single source of preference
truth ([`copilot/src/memory.ts`](../../packages/copilot/src/memory.ts)):

```ts
interface UserPreferences {
  version: 1;
  language: Language;                 // en | es | hi | zh | fr
  riskTolerance: RiskTolerance;       // conservative | balanced | aggressive
  preferredAssets: string[];          // SYMBOL_RE only — 'ETH', 'USDC', …
  avoidAssets: string[];
  targetAllocation?: Record<string, number>;  // symbol → weight [0,1]
  automationPrefs:  { dcaOptIn; stopLossOptIn; stableSweepOptIn };  // booleans
  notificationPrefs:{ alertsOptIn; weeklyReportOptIn };            // booleans
  routePreference: RoutePreference;   // cheapest | fastest | safest | balanced
}
```

This maps one-to-one onto Chapter 7 §7's list — *execution speed / fee sensitivity → `routePreference`;
risk tolerance → `riskTolerance`; favourite networks & preferred stablecoin → `preferredAssets`; language;
notification style → `notificationPrefs`.* The learner's job is only ever to nudge fields in this closed set.

**What ships today.** `PreferenceLearner.onAccepted(prefs, kind)` is the whole shipped learner: on an
explicit acceptance it returns a clone with exactly one automation opt-in flipped to `true` — `dcaOptIn`,
`stopLossOptIn`, or `stableSweepOptIn`. It is pure (no clock, no I/O), touches one field, and never writes
free text. That is a deliberately small, honest surface: consent-driven, single-bit, reversible.

**What is roadmap** is the richer inference — turning cancels, reroutes, and fee-rejections into a proposed
`routePreference`, `riskTolerance`, or `preferredAssets` change. Its design rule is **propose, don't
impose**: the inference never silently mutates preferences. It surfaces a plain-English confirmation —
*"You've picked the cheaper route the last three times. Make **cheapest** your default? You can change it
anytime in Settings."* — and only an explicit yes writes the field. This keeps preference-setting a
deliberate act (Ch7 §15's "preferred execution styles" learned *with* the user, not *about* them), and it
means the learned tier never diverges from what the user believes the wallet knows.

---

### 2.3 · Guardrail zero — the shape cannot hold a secret or a lie

The first guardrail is not a rule; it is a type. `UserPreferences` is enums, `SYMBOL_RE`-shaped strings
(`/^[A-Z0-9]{1,10}$/`), ratios in `[0,1]`, and booleans — nothing else. It is **structurally incapable** of
holding a private key, a seed phrase, an address, or an arbitrary free-text profile. `sanitizePreferences`
enforces this on every write: an unknown language, an out-of-range weight, a non-symbol asset string, or any
smuggled field is *dropped*, not stored — defence in depth against a buggy or hostile writer, not just the
learner. `InMemoryPreferenceStore.save` runs the sanitiser unconditionally. So "the AI never learns a
secret" is proven by the *shape*, echoing the intelligence and copilot boundaries — the narrator can cite
only computed metrics ([`intelligence/src/narrator.ts`](../../packages/intelligence/src/narrator.ts)),
the copilot can cite only ledger facts ([`copilot/src/verify.ts`](../../packages/copilot/src/verify.ts)),
and the learner can write only enumerated values (AI.md §7). No profile the model sees can carry a key
because no such field exists to carry it.

---

### 2.4 · Where a learned preference is applied — and where the boundary sits

A preference is consumed at exactly one place: **the front of a proposal**, before any deterministic
computation. It biases *which* option the wallet offers first; it never changes the option's *numbers* or
its *gate*.

- **`routePreference` → router preset.** The Execution Engine already selects a provider "according to the
  user's preferences" (Ch7 §17; Ch8). A learned `cheapest`/`fastest`/`safest` maps to a router scoring
  preset that reorders candidate routes. The route's actual fee, slippage, and output are still computed by
  the deterministic router and simulator — the preference cannot make a route look cheaper than it is.
  *(Route field shipped; behavioural population roadmap.)*
- **`riskTolerance` → framing and thresholds, never a bypass.** A learned tolerance can change how an
  insight is *worded* and which are surfaced first (§7 Risk-Profile Adaptation owns this). It can **never**
  lower a Risk verdict or a Policy gate. An "aggressive" user is offered more, warned the same, and blocked
  identically.
- **`preferredAssets` / networks → smarter defaults.** Learning that the user always converts to USDC on
  Base pre-fills that as the default target — a suggestion, still fully editable, still routed and gated.
- **Per-swap slippage default → a remembered ceiling.** Remembering the user's chosen max slippage as a
  per-user default is a natural extension of the shape. *(Per-swap slippage control is **SHIPPED**; the
  learned per-user default is roadmap.)*

In every case the deterministic boundary is the same and is worth stating flatly: **the LLM (and the
learned preference behind it) chooses what to propose and how to narrate it; deterministic code computes
every figure; the user approves; the device signs.** A recommendation reuses the underlying insight's own
evidence as its cited data and authors no new number
([`copilot/src/recommend.ts`](../../packages/copilot/src/recommend.ts)); the sole path to a `ready` plan
is the `PolicyGate`, which fails closed and stamps `ProposedPlan.signed = false` as a literal
([`copilot/src/gate.ts`](../../packages/copilot/src/gate.ts)). No preference has a code path to any of
those disposals.

---

### 2.5 · The hard guardrails

These are laws (Doctrine #2, #3, #5, #8). A learning change that violates one is wrong even if it "improves
engagement," and is reverted.

| # | Guardrail | Why it holds — the mechanism |
|---|---|---|
| 1 | **Learning never overrides a security guard.** | Risk and Policy evaluate every proposal independently of preferences. `PolicyGate.evaluate` reads the one authoritative `permission.gate`; a `block` is terminal (`gate.ts`). No preference field is an input to the verdict. |
| 2 | **An opt-in is not an authorization.** | Flipping `dcaOptIn` only lets the wallet *suggest* an automation. Installing one needs explicit approval **and** Policy pre-approval; every later firing still clears the Policy Engine, the device signature, and the scheduler's cooldown/daily-run caps ([`automation/src/safety.ts`](../../packages/automation/src/safety.ts)). Learning cannot widen a cap it does not control. |
| 3 | **Learning never auto-executes beyond granted permissions.** | Doctrine #2 / Ch7 §16: the engine never "executes beyond granted permissions." Preferences bias proposals only; the Brain has zero signing authority, and a signed plan is not representable in the copilot types. |
| 4 | **No manipulation — no engagement-maxxing.** | The objective function is the user's *stated* goal and honest cost, never time-in-app, transaction count, or fee revenue. There is no metric in the loop that rewards more activity. Suggestions the user keeps ignoring get *quieter*, not louder. |
| 5 | **Opt-in, inspectable, resettable.** | Every learned value is a visible field a user can read and reset; there is no opaque behavioural score (AI.md §7). Personalization is a setting, not a shadow profile. |
| 6 | **Deterministic and auditable.** | The learner is a pure function; each change is a discrete event tied to one explicit user action, logged with its input signal and resulting field (Doctrine #8). Learning is replayable and explainable, never a black box. |

The through-line: learning lives entirely on the **propose** side of the propose/verify/dispose split. It
can make the first option better; it can never make an unsafe option pass, an un-consented action fire, or a
disclosed cost disappear.

---

### 2.6 · Worked example — a route bias, end to end *(ROADMAP)*

> Over a week, Aisha overrides the wallet's proposed "fastest" route three times, each time picking the
> cheaper option and once backing out at the fee. The inference window now holds a consistent
> fee-sensitivity signal.
>
> The wallet does **not** silently change anything. On her next relevant turn it asks:
> *"You've chosen the cheaper route the last few times — want me to default to **cheapest**? Change it
> anytime in Settings."* Aisha taps yes. `routePreference` is written `cheapest` (a single enumerated
> field, through `sanitizePreferences`).
>
> Her next swap is now *proposed* cheapest-first. But the router still computes the real fee, slippage, and
> minimum-received; Risk still scores it; Policy still gates it; and Aisha still signs on-device. The only
> thing that changed is which honest option she saw first. If cheapest were ever unsafe for a given swap,
> the guards would surface that unchanged — the preference cannot suppress a warning.

Contrast this roadmap path with the **shipped** one: when Aisha *accepts* a stable-sweep suggestion,
`PreferenceLearner.onAccepted(prefs, 'stable_sweep')` flips `stableSweepOptIn` to `true` — one bit, from an
explicit yes, reversible in Settings. Same cage, smaller surface, available today.

---

### What §2 commits us to

- **Learning sharpens the first suggestion and nothing else** — it never computes a number, moves money,
  relaxes a guard, or grants authority.
- **Consent beats inference** — the shipped learner learns only from an explicit "yes" (one opt-in); the
  richer behavioural inference is roadmap and *proposes*, never imposes.
- **The preference shape is secret-incapable** — `UserPreferences` + `sanitizePreferences` make "the AI
  never learns a secret" a property of the type, not a hope.
- **The guards are downstream and untouched** — Risk, Policy, the scheduler caps, and the on-device
  signature see a learned proposal exactly as they see a cold one.
- **No shadow profile, ever** — every learned value is visible, resettable, and auditable; the objective is
  the user's goal, never engagement.

*Siblings:* §1 (Persistent Memory) owns *where* preferences are stored and synced; §3 (Goal Engine) and §7
(Risk-Profile Adaptation) consume `riskTolerance`; §8 (Automation Suggestions) is where a flipped opt-in
becomes a *proposed*, still-gated rule. This section owns only how a preference is *learned* — and the cage
that keeps learning honest.


## §3 · Financial Goals & the Goal Engine

> **Status:** **[ROADMAP]** as a shipped product. The *substrate* a Goal Engine composes — deterministic
> measurement (`@intent-wallet/intelligence`), gap detection (the insight engine), propose-only
> recommendation (`@intent-wallet/copilot`), and a gated, cap-bounded autonomous runner
> (`@intent-wallet/automation`) — is **shipped and tested today**. What is roadmap is the **Goal object**
> that binds these into a *named, long-lived objective the user steers.* This section specifies that target
> honestly, and shows at every step where the deterministic boundary sits: **the Brain proposes and
> explains; the device disposes.** A goal, in this product, **schedules proposals — never disposals.**

Chapter 7 §14 promises that the wallet "should understand long-term objectives … as **ongoing strategies**,
not one-time transactions" — *Save ₹1 crore · Generate passive income · Preserve capital · Reduce volatility ·
Prepare for taxes.* Chapter 4 ("AI Goals") makes the same promise from the conversation surface. This section
is the charter for how that becomes real **without ever handing the AI a fund-manager's discretion.** A goal
is the longest-lived thing a user can express to the wallet, so it is precisely where the temptation to let
the machine "just handle it" is strongest — and precisely where we refuse hardest.

---

### 3.1 What a goal *is* — and what it is emphatically *not*

A **goal** is a named objective, stated in the user's own words, that the wallet (a) makes *measurable* with a
deterministic metric, (b) *monitors* over time against real portfolio data, and (c) advances by **proposing**
gated, one-at-a-time steps the user approves. It is the multi-turn, multi-week generalization of a single
intent (Ch7): one intent is "swap this now"; a goal is "keep me moving toward *that*, and tell me the next
honest step whenever it changes."

A goal is **not** a managed account, a robo-advisor, or a standing authority to trade. The distinction is the
whole section, so we state it as an invariant:

> **A goal schedules *proposals*, not *disposals*.** It may place a proven, priced, risk-checked plan in
> front of you (Ch7 → Ch8), and — only if you have cryptographically granted a bounded automation cap — it
> may let a within-cap step execute through the same gate a manual action uses. It can **never** widen that
> cap, and it holds **no** authority the user did not explicitly grant and cannot instantly revoke.

This inherits Doctrine #2 (AI has zero signing authority), #5 (fail closed), and #8 (everything auditable),
and Product Philosophy §2.8 ("automation depth equals authorization depth"). A goal is a **plan the user
steers**, not an autopilot the user boards.

---

### 3.2 The five goal types (grounding: Ch7 §14)

Each goal type is defined by the **deterministic metric that measures it** — a figure computed by shipped code,
never authored by the LLM. This is what keeps a goal honest: its progress is a real number or it does not
exist. The "proposed strategy" column is **[ROADMAP]**; the metric column is **[SHIPPED]** today.

| Goal type | The user says… | Measured by (deterministic, shipped) | A proposed strategy looks like… | The honesty line |
|---|---|---|---|---|
| **Save a target amount** | "Help me save ₹1 crore" | `netWorthMicros` vs. the user's target — integer µUSD from `@intent-wallet/intelligence` analytics | Recurring contribution / DCA *proposals* (Ch7 `recurring` intent), each gated | Progress is **today's real net worth**, never a promised future number |
| **Generate passive income** | "Generate passive income" | Yield-bearing allocation + realized yield; `YIELD_OPPORTUNITY` insight matched to idle holdings (`insights.ts`) | Propose deploying idle stables into a *vetted* yield source, for approval | APRs are **quotes/estimates, labelled as such** — never a guaranteed return |
| **Preserve capital** | "Don't let me lose more than X" | `performance.currentDrawdown`, `allocation.stablecoinWeight`, health score (`risk.ts`) | On a drawdown/health trigger, propose trimming risk or raising the stable buffer | A trigger *proposes*; it never sells on its own beyond a granted cap |
| **Reduce volatility** | "Reduce my portfolio risk" | Annualized vol (`annualizeVol`), diversification score, `concentration.hhi` / effective positions (`stats.ts`) | Propose diversifying a concentrated book (Ch7 "reduce risk" category) | The number is computed; the *word* "risky" is narrated behind the guard (§3.4) |
| **Prepare for taxes** | "Prepare for taxes" | Realized/unrealized gains, cost basis, holding term via the tax engine (`tax.ts`, `TAX_PRESETS`) | Propose tax-aware timing (e.g. hold a lot past the long-term threshold), for review | Informational, jurisdiction-configured — **not tax advice**; propose-only |

Two things every row shares. First, the measuring engine is **pure and deterministic** — money is bigint
µUSD end-to-end (Doctrine #4), and a network-failed balance read is a *null*, not a zero, so a goal never
reports false progress on a partial read (see §1 Persistent Memory and the balances fail-soft rule). Second,
the *strategy* is always a set of **Ch7 intents**, which means it inherits the entire pipeline — resolve →
plan → simulate → risk-verdict → confirm → device signs — for free. A goal invents no new execution path; it
only decides *when to propose one.*

---

### 3.3 From a goal to a monitored strategy — the loop

A goal, once stated, becomes a small, serializable object — `{ kind, target, horizon, constraints, caps }` —
and enters a **monitoring loop** that reuses shipped engines end to end. The loop is deterministic at every
load-bearing step; the LLM appears only to *phrase* things.

```
   ┌─ MEASURE ──────────────────────────────────────────────────────────────┐
   │  @intent-wallet/intelligence computes the goal's metric from verified    │
   │  positions  (net worth · drawdown · vol · realized gains · allocation)   │   [SHIPPED]
   └───────────────┬──────────────────────────────────────────────────────────┘
                   ▼
   ┌─ DETECT GAP ────────────────────────────────────────────────────────────┐
   │  a goal rule (mirrors insights.ts: a threshold crossing on a REAL number │   engine [SHIPPED]
   │  with attached EVIDENCE) fires when the metric drifts from target        │   goal rule [ROADMAP]
   └───────────────┬──────────────────────────────────────────────────────────┘
                   ▼
   ┌─ PROPOSE ───────────────────────────────────────────────────────────────┐
   │  copilot RecommendationBuilder projects the gap into an UNSIGNED intent   │   [SHIPPED as recommend;
   │  proposal — reusing the evidence metrics as dataUsed, authoring no number │    goal-driven [ROADMAP]]
   └───────────────┬──────────────────────────────────────────────────────────┘
                   ▼
   ┌─ GATE ──────────────────────────────────────────────────────────────────┐
   │  the SAME Policy(+Risk) gate a manual action uses (Ch8). block ⇒ refuse.  │   [SHIPPED]
   │  Anything short of a clean mayProceedToSign PARKS as awaiting_approval.   │
   └───────────────┬──────────────────────────────────────────────────────────┘
                   ▼
   ┌─ DISPOSE ───────────────────────────────────────────────────────────────┐
   │  the user's device signs (default), OR — only within a user-granted,      │   [SHIPPED as automation;
   │  policy-bounded cap — the automation session key executes the gated step  │    goal-linked [ROADMAP]]
   └───────────────┬──────────────────────────────────────────────────────────┘
                   ▼   record the run + the reason (auditable, Doctrine #8) → back to MEASURE
```

The critical property is that **the Goal Engine adds no capability to any of these stages.** The runner that
would carry a within-cap goal step is `@intent-wallet/automation`, whose engine "never authorizes anything
itself and never holds a key" — every action is mapped to a `PolicyRequest` and put through the injected
Policy gate, which composes Risk; a `block` is terminal, and anything short of `mayProceedToSign` becomes
`awaiting_approval` (`engine.ts`). Its `safety.ts` layer bounds only *how often* a step may fire
(`maxDailyRuns`, `cooldownSeconds`), while amount/recipient/biometric limits stay the Policy Engine's job —
so a goal that "runs a strategy" is **provably no more powerful than the user tapping the buttons
themselves.** A goal can turn the loop; it cannot loosen a single bolt in it.

This is where a goal differs from Copilot Money or a Bloomberg terminal *and* from a robo-advisor. It has the
advisor's continuous, data-driven attention and the terminal's real numbers — but zero discretionary reach.
The best human financial advisor still cannot move your money without your say-so; our Goal Engine is held to
exactly that bar, in code.

---

### 3.4 Progress tracking & honest reporting

Progress is the part users will look at daily, so it is the part we are most disciplined about. **Every
progress figure is computed by deterministic code over verified positions and only *narrated* by the LLM.**
The narration boundary is shipped and enforced: `TemplateNarrator` cites only figures that resolve against the
verified `PortfolioIntelligence`, and `verifyNarrative` rejects any citation whose value does not reconcile to
the computed truth (`narrator.ts`). Plug an LLM narrator in behind that interface and it *still* cannot invent
a number — a fabricated figure fails the guard and the sentence is thrown away. A goal's "You're 62% of the
way to ₹1 crore" is therefore a *checked* claim, not a generated one.

Three quantities must never be confused, and the UI must keep them visibly distinct:

- **Actual** — the metric *now*, computed from real balances (e.g. net worth today). Always a real number; on
  a network-failed read it shows honest "unavailable," never a fabricated or zeroed value.
- **Projection** — a *forward estimate* (e.g. "at this contribution rate, you reach target in ~14 months"),
  produced only by the shipped **scenario engine** (`applyScenario`) and rendered as an explicit,
  labelled estimate. A projection is **never** styled as achieved or confirmed (Doctrine #3, Product §2.4).
- **Target** — the user's own set point. It is an input, not a claim, and the wallet never quietly edits it.

Milestones ("you crossed 50%") are **threshold crossings on a real metric**, logged with the inputs and the
reason that fired them (Doctrine #8) — the same evidence-carrying pattern the insight engine already uses.
This makes goal progress fully auditable: any reported step forward can be traced back to the verified numbers
that produced it. And it forbids the salesman voice Ch4 bans — no "you're crushing it 🚀," no hype, no
guarantee. A goal reports like a good advisor's quarterly letter: the real figure, the honest gap, the next
proposed step, and nothing it cannot prove.

---

### 3.5 The steering model — the user drives, always

Because a goal is long-lived, its controls matter as much as its intelligence. A goal is fully **steerable and
disposable at any moment**, with no life of its own:

- **Pause / resume** — freeze all proposals and any within-cap execution instantly. (Mirrors the automation
  engine's kill switch and per-workflow `paused` status.)
- **Edit** — change the target, horizon, constraints, or caps. A goal never resists being narrowed.
- **Revoke** — delete the goal and, with it, any session-key cap it rode on. Custody is the user's, with a
  door that is always unlocked (Product §2.7); revocation is immediate and total.

Contrast the two mental models explicitly, because the product must never blur them:

| | A managed account / robo-advisor | An Intent Wallet **goal** |
|---|---|---|
| Who holds authority to move funds | The manager (discretionary) | **The user's device** — the goal holds none |
| What the "engine" can do unprompted | Trade within a mandate | **Propose** a gated step; act only within a user-granted, revocable cap |
| What a "strategy update" is | A trade the manager executes | A **proposal** you approve, or a within-cap step through the same gate as a manual action |
| Can it widen its own authority | Effectively yes, within mandate | **Never** — caps are user-set and fail safe |
| Custody | The manager / custodian | **Non-custodial** — keys never leave the device |

A goal, in one line, is *"a financial advisor's attention with none of a fund manager's authority."* That is
the entire promise of this section, and the cage the rest of Chapter 9 (Recommendations §4, Portfolio
Intelligence §5, Automation Suggestions §8, Long-Term Planning §9) also lives inside.

---

### 3.6 Shipped vs. roadmap — the honest split

| Capability | Status | Where |
|---|---|---|
| Deterministic metrics behind every goal type (net worth, drawdown, vol, diversification, realized/unrealized gains) | **[SHIPPED]** | `@intent-wallet/intelligence` (`risk.ts`, `performance.ts`, `stats.ts`, `tax.ts`) |
| Gap detection as evidence-carrying threshold rules on real numbers | **[SHIPPED]** (as the insight engine) | `insights.ts`; surfaced via `/v1/portfolio/insights` + the web Insights panel |
| Propose-only recommendations that author no new number | **[SHIPPED]** | `@intent-wallet/copilot` `recommend.ts` (`RecommendationBuilder`) |
| Anti-fabrication narration guard over all reported figures | **[SHIPPED]** | `narrator.ts` (`verifyNarrative`) |
| Forward projections as explicitly-labelled estimates | **[SHIPPED]** (engine) | `scenario.ts` (`applyScenario`) |
| Gated, cap-bounded autonomous runner (parks anything beyond a clean sign) | **[SHIPPED]** (engine) | `@intent-wallet/automation` (`engine.ts`, `safety.ts`) |
| **The Goal object** — a named, long-lived objective binding the above; goal-scoped rules, progress UI, milestones, coaching | **[ROADMAP]** | this section is its charter |
| User-facing goal creation from conversation ("Help me save ₹1 crore") end-to-end | **[ROADMAP]** | ties to Ch4 "AI Goals"; see §9 Long-Term Planning |

"The engine exists" is not "the product ships it." Positioning and copy must not claim a Goal Engine as live
until the roadmap rows above are real and driven by a first-time user (Product §8).

---

### 3.7 Anti-goals — what a goal must never become

- **A promise of a number.** Never "you *will* reach ₹1 crore." A goal reports the real figure and the honest
  gap; the future is a labelled projection, never a guarantee (Ch4 salesman anti-pattern; Doctrine #3).
- **A widening of authority.** A goal must never grant, imply, or quietly expand a spending cap. Authorization
  depth is the user's to set; it is an anti-metric to grow (Product §9.4).
- **A fabricated projection presented as fact.** Any figure a user sees passes `verifyNarrative` or is clearly
  a scenario estimate. There is no third category.
- **A server-side secret.** No goal may require the server to know a key, seed, or private value. If a goal
  design needs that, the design is wrong and is redone (Doctrine #1).
- **An autopilot.** A goal that acts without the device signature (outside an explicit, revocable cap) is the
  highest-severity bug we can ship — an AI-disposed-funds incident, a hard-zero guardrail (Product §9.3).

> **Cross-references.** Goal measurement reuses Persistent Memory (§1) and Preference Learning (§2) for the
> user's target, horizon, and risk posture; goal proposals surface through Personalized Recommendations (§4)
> and Automation Suggestions (§8); goal progress feeds Daily Briefings & Long-Term Planning (§9). The
> execution boundary is Ch7 (Intent Engine) → Ch8 (Execution Engine); the conversational surface is Ch4. The
> line that unifies all of them: **the Brain proposes and explains; the device disposes.**


## §4 · Personalized Recommendations

A recommendation is the Brain's most tempting surface — the moment where a helpful assistant, in every
other product on earth, quietly starts *doing things for you*. This is exactly where Intent Wallet refuses.
Our recommendation layer is built to be the best financial advice a non-custodial wallet can give — the
"you're overexposed to one asset, here's why, here's the trim" of a great human advisor, the tidy insight
cards of Copilot Money — while remaining, structurally, incapable of acting on that advice. The Brain
**proposes and explains; it never disposes.** A recommendation is a sentence with receipts, not a button
that moves money. What acts is the user, through the Intent Engine (Ch7), through a signature on their own
device (Doctrine #2).

This section specifies how a recommendation is *born* (from a deterministically-computed insight, never an
LLM opinion), how it is *explained* (every claim carries the exact numbers behind it), how it is kept
*honest* (never hype, never a guaranteed return, never a fabricated projection — Ch2 §4), and how it is
*shaped to the person* (their risk profile per §7, their preferences per §2). Where a piece is shipped, it
is cited to real code. Where it is target, it is tagged **[roadmap]**.

---

### §4.1 · What a recommendation is — an insight with a "why", never an opinion

A recommendation in Intent Wallet is not a thing the LLM decides. It is a **projection of a deterministic
`Insight`** — and an insight is nothing more than a threshold crossing on a verified number. This is the
whole trick, and it is shipped today.

The engine of record is [`packages/intelligence/src/insights.ts`](../../packages/intelligence/src/insights.ts).
`generateInsights(ctx, policy)` is a pure function over already-computed analytics (allocation,
concentration, risk/health, performance — all bigint-derived) that runs eleven rules and returns a sorted
`Insight[]`. Every insight it emits carries three things that make it trustworthy:

- **`code`** — a stable identifier (`CONCENTRATION_SINGLE_ASSET`, `HIGH_LEVERAGE`, `BRIDGE_EXPOSURE_HIGH`, …)
  so the same condition is always the same recommendation, auditable across time.
- **`evidence: MetricRef[]`** — the *exact* metric ids and values that triggered it (e.g.
  `concentration.topAssetWeight = 0.62` against `policy.maxAssetWeight = 0.40`). Nothing is asserted that
  isn't a named, computed number.
- **`suggestedAction`** — advice in words (*"Consider trimming this position toward a more balanced
  allocation."*). The file's own header states the law: *"`suggestedAction` is advice, never an executable
  step — the engine cannot act; the user or the Intent layer decides."*

The Copilot then turns an insight into a `Recommendation` in
[`packages/copilot/src/recommend.ts`](../../packages/copilot/src/recommend.ts). `RecommendationBuilder.build`
does something deliberately dumb and deliberately safe: it **reuses the insight's own `evidence` as the
recommendation's `dataUsed`**, so a recommendation *cannot author a new number* — it can only re-cite the
figures the analytics engine already proved. The resulting `Recommendation`
([`copilot/src/types.ts`](../../packages/copilot/src/types.ts)) is a closed shape: `title`, `detail`,
**`why`**, `dataUsed: CitedFact[]`, `risks: RiskDisclosure`, `alternatives`, `confidence`, and an optional
`proposedPlan`. There is no free-text number anywhere in it that didn't come from a verified fact.

> **Where the boundary is here:** the number is computed by deterministic analytics; the *phrasing* is the
> only thing language ever touches — and even the phrasing, in the shipped `TemplateNarrator`
> ([`intelligence/src/narrator.ts`](../../packages/intelligence/src/narrator.ts)), cites only what it read.
> An LLM narrator plugged in behind that same interface is held to `verifyNarrative`, which rejects any
> citation that doesn't reconcile. The Brain gets to be articulate; it never gets to be the source of a
> figure.

Alerts are the event-driven sibling ([`intelligence/src/alerts.ts`](../../packages/intelligence/src/alerts.ts)):
where insights describe a *standing* shape ("you are concentrated"), `evaluateAlerts` fires on a *change*
("your portfolio moved down 15%", "a bridge you hold was exploited"), is stateful with a cooldown so it
never spams, and filters the market-event feed to entities the user actually owns. Both feed the same
recommendation surface; both attach evidence; neither can act.

---

### §4.2 · Propose-only — the recommendation never executes itself

This is the non-negotiable of the whole section. **No recommendation is ever auto-executed.** A trim, a
rebalance, a "deploy your idle stablecoins" — none of them happen because the Brain suggested them. The path
from advice to action is always the same, and it always passes through the user:

```
Recommendation (advice + evidence)
  → user accepts  → becomes an Intent (Ch7)
  → Resolve · Balance · Route · Risk · Plan assembly           (deterministic gates)
  → Confirm sheet + DEVICE SIGNATURE                            (the sole disposer)
  → Execution (Ch8)
```

A recommendation's `suggestedAction` is a *string*, not a callable. When a recommendation does carry a
concrete action, it does so as an **unsigned `ProposedPlan`** whose `signed` field is the literal `false` —
a signed plan is *not representable* in the type. The Copilot constructs a `ProposedPlan` only by forcing it
through the `PolicyGate` ([`copilot/src/gate.ts`](../../packages/copilot/src/gate.ts)), which composes Risk +
Policy and **fails closed**; the LLM has no tool that returns a `ready` plan (AI.md §5). The same discipline
governs automation: `AutomationSuggester.suggest`
([`copilot/src/recommend.ts`](../../packages/copilot/src/recommend.ts)) returns
`AutomationSuggestion`s whose `intent` is explicitly *"an UNSIGNED, un-installed automation proposal."* It is
never installed there — the user and the Policy Engine decide (that surface is §8's subject).

So a recommendation is, at most, a pre-filled intent waiting for a human to press go. It inherits every
guarantee of the Intent Engine: clarify-never-guess, a `block` that is non-overridable, and a device
signature as the only thing that moves value. This is what lets us give aggressive, specific, *actionable*
advice — "trim ETH from 62% to 40%" — without ever becoming a robo-advisor with its hand on the wallet. The
advice is bold; the cage is boring; the user is sovereign.

---

### §4.3 · Explainability — every recommendation shows its work

Ch2 Rule 4 is law: *the AI never says "Best route selected" — it shows its work.* A recommendation that a
user can't interrogate is a recommendation a user can't trust, and untrusted advice about money is worse
than no advice. So every recommendation answers **why**, in the user's terms, with the real numbers
underneath.

The `why` is not a generated justification bolted on after the fact — it *is* the insight's `detail`, which
is itself templated directly from the evidence. Consider the shipped concentration insight:

> **High single-asset concentration.** *"ETH is 62.0% of your portfolio — a drop here moves your whole net
> worth."* — evidence: `concentration.topAssetWeight = 0.62`, `policy.maxAssetWeight = 0.40`.

The user sees the claim, the metric, and the threshold that was crossed. Tapping through (the presentation
lives in Ch4's conversation surface and the shipped web Insights panel over `/v1/portfolio/insights`) reveals
`dataUsed` — the `CitedFact`s, each tagged with its `source` engine and call, so the provenance chain runs
all the way back to on-chain reads. Nothing is "because the model felt so." Every risky recommendation is
also auditable end to end (Doctrine #8): the inputs and the reason are logged, so a recommendation can be
replayed and defended, never just asserted.

Honesty about our *own* depth matters here too. The shipped `RecommendationBuilder` is a faithful 1:1
projection: it does not yet synthesize `alternatives` (the array ships empty) and it assigns a coarse
`confidence` (0.9 for a `critical` insight, 0.75 otherwise). Richer explanations — "here are two ways to fix
this, cheaper vs. safer," in the spirit of Ch7 §8's clarification style — are **[roadmap]**. We would rather
ship a thin-but-true explanation than a rich-but-guessed one.

---

### §4.4 · The honesty line — never hype, never "guaranteed", never a fabricated projection

Ch2 §4 draws the personality boundary and it is enforced, not merely aspired to. The Brain must **never**
create hype, manufacture FOMO, promise profits, or give a financial guarantee. In a recommendation surface —
where the temptation to say *"supply this and earn 12% APR, guaranteed"* is strongest — this becomes three
concrete, tested rules:

1. **No fabricated number, ever.** Every figure in a recommendation is a `CitedFact` that must reconcile
   against the turn's `FactLedger`. `verifyResponse`
   ([`copilot/src/verify.ts`](../../packages/copilot/src/verify.ts)) rejects the whole response if any cited
   fact doesn't match within tolerance, and `hasUncitedNumerics` scans the prose for stray numbers that
   correspond to no known fact. "The AI never invents a balance, a yield, or a projection" is a **unit test**
   (AI.md §9), not a hope. A yield opportunity is only ever surfaced from an *observed* APR on an asset the
   user *actually holds* (`YIELD_OPPORTUNITY` in `insights.ts`), never a number the model liked.
2. **APR is a rate, not a promise.** Where a recommendation mentions yield, it states the *observed* rate and
   its source protocol as a fact — it never annualizes it into an implied future return, never says
   "guaranteed," never projects a portfolio value forward as if it were fact. Forward-looking figures belong
   exclusively to the clearly-labelled scenario/what-if surface (the `ScenarioEngine`, §5's subject), where
   they are stamped as *estimates* — never smuggled into advice as certainty.
3. **Uncertainty is surfaced, not smoothed.** Confidence starts at 1.0 and is multiplied down by every source
   of doubt — stale data, a gate needing confirmation, an LLM retry
   ([`copilot/src/confidence.ts`](../../packages/copilot/src/confidence.ts)). Below the floor (0.55) a
   response *must* carry an `uncertaintyNote`. A recommendation built on stale prices says so; it does not
   perform false confidence.

The tone follows from the substance: **Professional · Calm · Clear · Confident** (Ch2 §4). Confident because
the numbers are real, not because the language is loud. We benchmark the *rigor* against Bloomberg and the
*clarity* against a great advisor — but we will never borrow their license to project. An estimate is
labelled an estimate; a real number is proven; and there is no third category.

---

### §4.5 · Respecting the person — risk profile (§7) and preferences (§2)

A recommendation that ignores who you are is just a lecture. The same 62% concentration is a screaming
`critical` for a capital-preservation retiree and a shrug for a degen — so the *thresholds themselves* are
personalized, not just the copy.

**Shipped:** `insights.ts` exposes `INSIGHT_PRESETS` — `conservative`, `balanced`, `aggressive` — a
configurable `InsightPolicy` that mirrors the risk engine's policy model. The presets map cleanly onto the
`RiskTolerance` enum in [`copilot/src/memory.ts`](../../packages/copilot/src/memory.ts)
(`'conservative' | 'balanced' | 'aggressive'`). A conservative posture flags concentration above 30% and
leverage above 0.25×; an aggressive one tolerates 60% and 1.0× before it says a word. This is the seam by
which §7 (Risk-Profile Adaptation) tunes the recommendation engine: choose the preset that matches the
user's stored tolerance, and the same portfolio yields advice pitched to *their* comfort, not a global
default.

Preferences (§2) are the second lever, and they are **secret-incapable by construction**: `UserPreferences`
is a closed, enumerated shape — enums, `SYMBOL_RE`-shaped strings, ratios, booleans — that *cannot* hold a
key or an address, and `sanitizePreferences` drops anything that doesn't fit (AI.md §7). It carries the
fields recommendations should honor: `preferredAssets`, `avoidAssets`, and a `targetAllocation` (symbol →
target weight). The intended behavior: never recommend deploying into an asset on `avoidAssets`; frame
rebalancing toward the user's own `targetAllocation`; weight suggestions toward `preferredAssets`.

**Honest status:** the *plumbing* is shipped (presets exist; preferences are a validated, opt-in,
inspectable store) but the *deep wiring* — `generateInsights` consuming `avoidAssets`/`targetAllocation` to
filter and reframe recommendations, and the API selecting a per-user preset from stored preferences — is
**[roadmap]**. Today the engine takes a policy and a context; threading a specific user's profile and
preference set through it end to end is the target, and it is a clean, buildable seam, not a rewrite.

---

### §4.6 · The personalization horizon — [roadmap]

Everything above is *rule-based* personalization: the right thresholds, the right filters, the same for
everyone with the same profile. The deeper promise of Chapter 9 — a Brain that learns *this* user's taste in
advice — is target, and must be tagged as such so we never demo it as shipped:

- **Learning which recommendations land.** When a user accepts, dismisses, or snoozes a recommendation,
  that signal should shape what surfaces next — the deterministic `PreferenceLearner`
  ([`copilot/src/memory.ts`](../../packages/copilot/src/memory.ts)) already flips *enumerated* opt-ins on an
  accepted suggestion (never free text), which is the honest kernel; a full accept/dismiss-driven ranking is
  **[roadmap]** and interlocks with §2 (Preference Learning).
- **Timing and cadence.** *When* and *how often* to surface a recommendation (not mid-panic, not daily
  nagging) — the daily-briefing framing of §9 — is **[roadmap]**.
- **Coaching depth and alternatives.** Multi-option, trade-off-aware recommendations and longer-horizon
  portfolio coaching tied to the Goal Engine (§3, Ch7 §14) are **[roadmap]**.

Every one of these is designed to arrive *inside the same cage*: learned personalization writes only
enumerated, inspectable preferences the user can see and reset; it never becomes an opaque behavioral
profile, and it never earns the Brain a gram of signing authority.

---

### §4.7 · Shipped vs. roadmap — the honest ledger

| Capability | Status | Where |
|---|---|---|
| Deterministic insight → recommendation (11 rules, evidence-backed) | **Shipped** | `intelligence/insights.ts`, `copilot/recommend.ts` |
| Event/threshold alerts (stateful, deduped, owned-entity filtered) | **Shipped** | `intelligence/alerts.ts` |
| Every recommendation carries `why` + cited numbers; fact-verified | **Shipped** | `copilot/types.ts`, `copilot/verify.ts`, `intelligence/narrator.ts` |
| Propose-only (`signed: false`; gated through Policy; unsigned automation proposals) | **Shipped** | `copilot/gate.ts`, `copilot/recommend.ts` |
| Confidence floor → forced uncertainty note | **Shipped** | `copilot/confidence.ts` |
| Risk-tolerance presets for thresholds | **Shipped (presets)** | `intelligence/insights.ts` `INSIGHT_PRESETS` |
| Surfaced to users (insights API + web panel) | **Shipped** | `/v1/portfolio/insights`, web Insights panel |
| Per-user preset selection + `avoid`/`target` filtering wired end to end | **[roadmap]** | seam via `copilot/memory.ts` → `intelligence` |
| Synthesized `alternatives`, learned ranking, cadence, coaching | **[roadmap]** | §2, §3, §8, §9 |

---

**The boundary in one line.** A recommendation is a *verified number with a reason attached* — computed by
deterministic code, narrated (never authored) by language, filtered by the user's own risk profile and
preferences, and delivered as advice that becomes an action only when the user turns it into an intent and
signs it on their device. The Brain is allowed to be the sharpest advisor in crypto. It is never allowed to
be the one who acts.


## §5 · Portfolio Intelligence

*Understanding what the user holds — and being able to say something true about it.*

Every other section of this chapter reaches toward a Brain that remembers (§1), learns (§2), sets goals
(§3), recommends (§4), adapts to risk (§7), and one day briefs and plans (§9). This section is the one that
has largely **arrived.** Portfolio Intelligence is where the Financial Brain stops being a roadmap and
becomes running, tested, shipped code — the `@intent-wallet/intelligence` package
([`packages/intelligence/src`](../../packages/intelligence/src)), the `/v1/portfolio/insights` endpoint,
and the Insights panel in the web app. It is the strongest-grounded floor the rest of the chapter is built
on, and it is grounded for a reason: understanding a portfolio means *stating numbers about someone's
money*, and the moment the Brain states a number, Doctrine #3 (never fake data) and Doctrine #7
(deterministic cores, AI at the edges) stop being slogans and become an architecture you can point at.

That architecture is the thesis of this whole chapter in miniature. **The Brain proposes and explains; it
never disposes.** In Portfolio Intelligence the boundary is drawn with unusual clarity: *deterministic code
computes every figure, and the language model may only narrate figures the code already computed.* A health
score of 72, a top-asset weight of 41%, a −18% drawdown — none of these is ever a thing a model "said." Each
is a pure function of a snapshot, and the model's entire job is to turn a verified number into a sentence a
non-technical stranger can feel. That is why a number is never fabricated here: not because we asked the
model nicely, but because the code path that produces the number has no model in it, and the code path that
lets the model speak *re-checks every figure it cites against the ledger of computed truth and rejects the
narrative if even one doesn't reconcile.*

---

### 5.1 · The analytics engine — a pure function of a snapshot `(shipped)`

The heart of Portfolio Intelligence is `PortfolioIntelligenceEngine.analyze`
([`engine.ts`](../../packages/intelligence/src/engine.ts)), and its most important property is stated in
its own doc comment: it is a **pure function of the snapshot** — *no clock, no network.* You hand it a
`PortfolioSnapshot` (an identity id, an `asOf` timestamp the caller supplies, and a list of `Position`s) and
it runs a fixed pipeline, deterministically, to a `PortfolioIntelligence` result:

> **Normalize → Allocation → Concentration → Performance → Risk / Health → Insights**

Each stage is its own small, exhaustively-testable module, and each earns the number it emits:

- **Normalize** ([`positions.ts`](../../packages/intelligence/src/positions.ts)) resolves every position's
  asset class and liquidity, then computes the one number the whole engine's trustworthiness rests on:
  **net worth = gross assets − debt.** A `borrowing` position is a *liability* — its value is subtracted, its
  `signedValueMicros` is negative, and its weight is zero (debt is scored as leverage, not as an allocation
  slice). Getting the sign of debt right is *the* reason a "net worth" figure can be trusted at all.
- **Allocation** ([`allocation.ts`](../../packages/intelligence/src/allocation.ts)) answers *"where is my
  money"* along five axes — **by asset, by sector (asset class), by chain, by protocol, by liquidity** — plus
  a `stablecoinWeight` "dry-powder" reading. Debt is excluded, so every weight is a share of *gross* assets
  and the slices sum to 1.
- **Concentration** measures how lopsided the book is with the **Herfindahl-Hirschman Index** over asset
  weights, and reports the intuitive derivations: `effectivePositions` (1 / HHI — "you effectively hold N
  independent bets"), `topAssetWeight`, and `top3Weight`.
- **Performance** ([`performance.ts`](../../packages/intelligence/src/performance.ts)) carries two
  *independent* truths and never conflates them. **Unrealized PnL** is computed from cost basis, over exactly
  the positions whose cost basis is known — so PnL and its denominator always refer to the same set.
  **Time-weighted return, volatility, and drawdown** come from the net-worth history and are *flow-adjusted*:
  deposits and withdrawals are removed so the number measures the *portfolio's* performance, not the timing
  of the user's contributions. And when no history is supplied, it returns `null`s and `hasHistory: false`
  **rather than inventing a series** — the single most important honesty rule in the file.
- **Risk / Health** ([`risk.ts`](../../packages/intelligence/src/risk.ts)) produces the composite
  **Portfolio Health Score** [0–100] and its inputs: leverage (debt ÷ gross), the liquid/locked/illiquid
  split, bridge exposure, and diversification — measured the best available way. When per-asset return series
  cover the book, diversification uses a **correlation basis** (the diversification ratio, which correctly
  says two assets that move together are *not* diversified even at different weights); otherwise it falls
  back to a **weights basis** (effective positions from HHI) and *labels which basis it used*. The health
  score is a **transparent weighted blend** of independent factors, each returned with its own sub-score,
  weight, and a one-line reason — so a health number is always explainable, never a black box. When a
  history-dependent factor is missing, the remaining weights are re-normalized so a gap doesn't *silently
  deflate* the score.

Two disciplines run through every one of these modules and are worth naming because they are what make the
output safe to show a stranger. First, the **money-vs-ratio rule** ([`types.ts`](../../packages/intelligence/src/types.ts)):
any amount of *money* is an integer `bigint` in micro-USD (1 USD = 1,000,000 µUSD) — never a float, ever
(Doctrine #4); any *dimensionless* quantity derived from money — a weight, a return, a volatility, a score —
is a `number`, and that is correct, because a ratio is not money and float rounding on a ratio is a
presentation concern, not a value-integrity one. Second, **purity**: `analyze` reads no clock and touches no
network, so the entire Brain is replayable and testable offline against fixtures. The engine *analyzes and
recommends; it never signs and never executes* — every output is data.

The same package ships three on-demand engines alongside the core pipeline — **alerts**
([`alerts.ts`](../../packages/intelligence/src/alerts.ts)), **scenario / what-if**
([`scenario.ts`](../../packages/intelligence/src/scenario.ts), e.g. price-shock, gas-price, and
bridge-unavailable modelling), and **tax / realized-gain** reporting
([`tax.ts`](../../packages/intelligence/src/tax.ts)). These *engines exist and are tested;* they are
surfaced to the user only as far as their sections say they are (alerts and scenarios feed §6–§7; the
user-facing shipped surface today is insights). "The engine exists" is not "the product ships it," and this
chapter keeps that line honest.

---

### 5.2 · The AI-Narrator Boundary — why a number is never fabricated `(shipped)`

Here is the crux of the section, and the place the chapter's whole argument becomes a *tested property.* An
LLM is extraordinary at turning a fact into a sentence and catastrophic as a source of arithmetic. So
Portfolio Intelligence splits those two jobs down the middle with a boundary drawn in code
([`narrator.ts`](../../packages/intelligence/src/narrator.ts)):

> **The engine computes every financial fact deterministically. A `Narrator` may only turn those facts into
> prose — and it may cite *only* figures that resolve against the verified `PortfolioIntelligence`.**

The mechanism has three parts. A `NarrativeReport` carries not just `text` but a list of **citations**
(`MetricRef`s) — every figure the prose mentions, as a `{ metric, value }` pair. `resolveMetric` maps a
dotted metric id (`netWorth`, `risk.healthScore`, `concentration.topAssetWeight`, `performance.twr`, …) to
the value the *verified intelligence* actually holds. And `verifyNarrative` is the gate: it walks every
citation and returns `false` if any cited metric doesn't exist, or if its cited value diverges from the
computed value beyond a tiny tolerance. The engine's `narrate()` runs this check by default and **throws
`NARRATION_UNVERIFIED`** rather than return a narrative whose numbers don't reconcile. An LLM narrator
plugged in behind the `Narrator` interface is held to *exactly* this contract: it can phrase the story
however it likes, but the instant it invents a balance, inflates a percentage, or cites a metric that
doesn't exist, the guard rejects the whole narrative. Fabrication isn't discouraged — it is *structurally
unrepresentable in a passing output.*

```
LLM (edge)          Deterministic core (truth)
  drafts prose  ──▶  resolveMetric()  ──▶  every citation reconciles?
  + citations                              ├─ yes → narrative returned
                                           └─ no  → NARRATION_UNVERIFIED (rejected)
```

The production default narrator, `TemplateNarrator`, is fully deterministic — no LLM at all — and it does
double duty: it is both the safe default that ships today *and the reference the LLM narrator is measured
against.* This is the AI Constitution's *"verified narration"* guardrail
([`AI.md` §5, §9](../../AI.md)) realized in the intelligence layer, and it is the generalization the
Copilot's `verifyResponse` / `hasUncitedNumerics` fact-grounding later inherits: *the AI never invents a
number* is a unit test with adversarial cases (fabricated percentages, magnitude-scaled fakes, spelled-out
numbers), not a hope. This is where §5 pays the debt every later section owes — memory, coaching, briefings,
and planning will all narrate numbers, and they will all narrate them *through this boundary or not at all.*

---

### 5.3 · The shipped surface — the insights endpoint and the web panel `(shipped)`

Analytics that never leave a package help no one, so Portfolio Intelligence is on the live request path.
**`GET /v1/portfolio/insights`** ([`services/api/src/routes/v1/intents.ts`](../../services/api/src/routes/v1/intents.ts),
[`services/api/src/insights.ts`](../../services/api/src/insights.ts)) runs the *real* engine over the
authenticated principal's holdings and reuses the **same two seams** the per-user runtime plans against — a
`HoldingsSource` and a `PriceFetch` — so the analysis reads the same data the wallet acts on, never a
second, drifting copy. The route is **session-guarded** exactly like `/v1/portfolio` (it derives from the
same per-user data, so leaving it open would serve one user's portfolio shape to any caller) and is
**registered only when the seams are wired**, so the surface stays honest — an endpoint that can't compute
anything real simply doesn't exist.

The bridge from wallet data to analytics is `snapshotFromHoldings`: it folds each `Holding` and the live USD
price map into one `token` position per (asset, chain) pair, valued in integer µUSD with the same math the
portfolio summary uses. `toJsonSafe` then serializes every `bigint` µUSD to a decimal string for the wire,
and the SDK's `PortfolioInsights` type mirrors `PortfolioIntelligence` one-to-one with that string
projection. The read side is thus fully typed end to end, and money stays integer right up to the JSON edge.

The web **Insights panel** ([`apps/web/src/App.tsx`](../../apps/web/src/App.tsx), `InsightsPanel`) renders
it: a Health tile, net worth, diversification, stablecoin buffer, the top allocation slices as labelled bars,
and the top few insights with severity glyphs — closing with the standing disclosure *"computed by the
intelligence engine over the API portfolio · analyzes only, never signs."* But the panel does something
subtler and more important than render, and it is worth dwelling on because it is Doctrine #3 enforced at the
*presentation* layer. This is a **non-custodial** wallet: the user's real holdings live on the device and are
*never* sent to the server, so the server-computed insight figure is a per-principal number that may not be
*this* wallet's reality. So the panel fetches the insights **and** the wallet's real on-chain net worth, and
it only trusts — only renders — the insights if the two **agree** within a small tolerance. If they diverge,
or the real value can't be read, it shows *nothing* rather than present a borrowed figure as the user's.
Signing in is not enough; the numbers must match reality. That is the anti-fabrication instinct pushed all
the way to the last pixel.

---

### 5.4 · The honesty rules — network-fail ≠ $0, unpriced ≠ $0, partial reads labelled `(shipped)`

Portfolio Intelligence inherits the Balance Engine's honesty contract (Ch6 §Balance Engine) and extends it
into analytics. The governing rule is the one from `MEMORY.md`: **a network failure is not "$0."** A
portfolio the engine could not fully read is a *degraded read*, not a poor person, and the difference must
survive every layer:

| Situation | The dishonest shortcut we refuse | What Portfolio Intelligence actually does |
|---|---|---|
| A price feed is missing for an asset | Value it at $0 (or guess) | `snapshotFromHoldings` gives it **0 value *and* flags it `stale`**; the engine propagates `stale: true` to the top-level result, and the panel shows a "some data stale" badge |
| A chain read fails / returns nothing | Treat the balance as zero | Distinguish a *null read* from a *genuine zero*; a failed read never becomes a confident number (Ch6, `balances-fail-soft-honesty`) |
| No performance history yet | Fabricate a return or a flat line | `hasHistory: false` and `null` metrics — *"performance history isn't available yet, so no return is reported"* |
| Dust / empty chain rows | Pad the position list | Empty rows (`base === 0n`) are dropped — an empty chain isn't a position |
| Server insight ≠ device reality | Show the server's number anyway | The web panel renders **only** when server insights agree with real on-chain net worth; otherwise it shows nothing |

The through-line is that **uncertainty is a first-class output, not a swept-under number.** `stale` is a bit
the engine computes, carries, serializes, and displays; a missing metric is a `null` the UI is required to
render honestly (a "—", a skeleton, an "unavailable"), never a fabricated stand-in. This is Doctrine #3 and
#5 (fail closed) in the read path: anything the engine cannot *positively* compute from verified inputs, it
declines to assert.

---

### 5.5 · How Portfolio Intelligence feeds the rest of the Brain

Portfolio Intelligence is the sensory layer of the Financial Brain — the part that *perceives* the
portfolio — and almost everything else in this chapter consumes what it computes. It is deliberately the
input, not the actor:

- **→ §4 · Personalized Recommendations.** Every `Insight` already carries a non-executable `suggestedAction`
  ("consider trimming this position…", "hold a small stablecoin reserve…") plus the exact **evidence** — the
  metric ids and values that triggered it — so a recommendation is always traceable to a verified number and
  is *advice, never an executable step.* §4 turns these grounded observations into personalized guidance; the
  boundary it inherits from here is absolute — a recommendation proposes, it never disposes, and any action a
  user takes on it re-enters the Intent Engine (Ch7) and its Risk + Policy gate + device signature.
- **→ §7 · Risk-Profile Adaptation.** The `RiskProfile` — health score, diversification basis, leverage,
  liquidity split, bridge exposure — and the tunable `InsightPolicy` presets (conservative / balanced /
  aggressive) are exactly the surface §7 adapts to a user's stated risk tolerance. Portfolio Intelligence
  computes *what is*; §7 decides *what "healthy" should mean for this user* and shifts the thresholds — never
  the arithmetic.
- **→ §6 · Spending & Investment Insights.** The alert, scenario, and tax engines shipped in this package are
  the machinery §6 builds its narratives on.
- **→ §1–§3 (roadmap).** Persistent memory, preference learning, and goals will read the same computed
  intelligence. When they narrate a number back to the user, they do it through the §5.2 narrator boundary —
  that is the non-negotiable term of their integration.

The direction of the arrows is the point: intelligence flows *out* of this section as verified facts and
grounded suggestions, and every consumer is downstream of the same deterministic boundary. Nothing that
consumes Portfolio Intelligence gains the authority to act by consuming it.

---

### 5.6 · Shipped vs roadmap — the honesty ledger for this section

| Capability | Status |
|---|---|
| Deterministic analytics pipeline (normalize → allocation → concentration → performance → risk/health → insights) | **Shipped** — `packages/intelligence/src`, pure + unit-tested |
| Portfolio Health Score as a transparent, explainable weighted blend | **Shipped** — `risk.ts` (per-factor score + weight + reason) |
| Correlation-basis diversification with honest fallback to weights basis (labelled) | **Shipped** — `risk.ts` |
| Insight engine: 11 evidence-bearing rules, configurable `InsightPolicy` presets | **Shipped** — `insights.ts` |
| AI-narrator boundary: citations + `resolveMetric` + `verifyNarrative` (throws `NARRATION_UNVERIFIED`) | **Shipped** — `narrator.ts`; `TemplateNarrator` is the deterministic default |
| `GET /v1/portfolio/insights` over real holdings, session-guarded, same seams as the runtime | **Shipped** — `services/api`, SDK-typed |
| Web Insights panel with the *agree-with-real-net-worth* honesty guard | **Shipped** — `App.tsx` `InsightsPanel` |
| Honest degradation: unpriced ≠ $0 (`stale`), network-fail ≠ $0, no-history → `null`, dust dropped | **Shipped** — `insights.ts`, `performance.ts`, Ch6 balance contract |
| Alert / scenario (what-if) / tax engines as engine capabilities | **Shipped (engine)** — surfaced per §6–§7; not a full user-facing product yet |
| LLM narrator (Anthropic) plugged in behind the narrator boundary | **Roadmap** — the *cage* is built and tested; the deterministic `TemplateNarrator` ships today |
| Portfolio *coaching* as a conversational, memory-aware advisor | **Roadmap** — see §4; requires §1 memory + §2 learning |
| Historical net-worth snapshots persisted for every user (rich TWR/vol/drawdown by default) | **Roadmap** — `SnapshotStore` is an interface; history is opportunistic today |

---

**Definition of Done — §5 acceptance.** Portfolio Intelligence is "done" for a release when: `analyze` is a
pure function of its snapshot (no clock, no network) and every money value is integer µUSD; every displayed
figure is computed by the deterministic engine and, if narrated, passes `verifyNarrative`; an unpriced asset,
a failed read, and a no-history portfolio each render an *honest* state (`stale` / `null` / "unavailable"),
never a fabricated number; the insights endpoint is session-guarded and reads the same seams as the runtime;
the web panel refuses to show borrowed figures that don't match the device's real net worth; and the engine
*only ever analyzes* — it holds no key, signs nothing, executes nothing.

**Where this hands off.** Portfolio Intelligence has now told the user, truthfully, *what they hold and how
exposed they are.* Turning those grounded observations into personalized guidance is **§4 · Personalized
Recommendations**; deciding what "healthy" should mean for this particular user is **§7 · Risk-Profile
Adaptation**; narrating the week's story is **§6 · Spending & Investment Insights** and, one day,
**§9 · Daily Briefings**. The law this section leaves with all of them is the one it never breaks itself:
*we computed a number and explained it — and an explanation has never moved a cent.*


## §6 · Spending & Investment Insights

> *"Turn my history into something I understand."* This section is where the Brain stops reporting
> numbers and starts explaining them — where a wall of positions becomes *"you're 62% in one asset;
> a bad week there moves your whole net worth."* The discipline that makes that trustworthy is the
> whole point of the chapter, restated here in miniature: **the Brain computes the fact deterministically,
> narrates it in words, and proposes what you might do — it never decides, and it never disposes.**
> An insight is a *computed fact* or a *clearly-labelled scenario/estimate*. It is never a made-up number
> and never an unearned claim.

Chapter 4 gave us conversation; Chapter 7 gave us intent. Between them sits a quieter capability: reading
what already happened and telling the user something *true and useful* about it. A great financial advisor
does this — "your fees are eating your returns," "you're over-concentrated," "this is what a 20% drawdown
would cost you." Copilot Money does it for spending; Bloomberg does it for risk. Our constraint is stricter
than any of theirs: we do it **non-custodially and propose-only**, and every figure on screen must reconcile
to a number our own code computed. This section specifies the four engines that produce insights today, the
honesty contract they live under, how insights reach the user without becoming spam, and the roadmap that
deepens them into full spending analytics and richer tax.

This section reads *from* §5 (Portfolio Intelligence) — the allocation, concentration, performance and
risk/health analytics are its inputs — and hands *forward* to §8 (Automation Suggestions) when an insight
implies an action, and to §9 (Daily Briefings) when insights roll up into a morning digest. It does not
re-derive analytics; it interprets them.

---

### 6.1 · The four engines — what each computes

**Shipped today** in `packages/intelligence/src`, pure, deterministic, and unit-tested to exhaustion. Every
one is a pure function of its inputs — no clock, no network, no `Math.random()` — so its output is replayable
and its correctness is *demonstrated*, not asserted (Doctrine #7, #8).

| Engine | File | Turns history into… | Boundary posture |
|---|---|---|---|
| **Insight** | `insights.ts` | Standing-shape observations: concentration, chain/protocol exposure, leverage, diversification, stable-buffer, drawdown, gas cost, yield-on-idle | A threshold crossing on a verified number → advice, never an executable step |
| **Alert** | `alerts.ts` | Event/threshold *changes*: large move, extreme volatility, health breach, gas spike, price targets, inactivity, plus a filtered market-event feed | Fires once per cooldown; deduped; propose/notify only |
| **Scenario** | `scenario.ts` | "What if…": price shock (with β-propagation + AMM impermanent-loss), gas-price, bridge-outage | A hypothetical re-price — explicitly *not* a prediction |
| **Tax** | `tax.ts` | Cost-basis lots, realized gains, short/long term, per-disposal reconciliation | A mechanism + estimate — never filing advice |

**The insight engine** (`generateInsights`) is the "standing shape" reader. Each of its eleven rules is a
threshold crossing on an already-verified analytic, and — this is the load-bearing part — it attaches
**`evidence`**: the exact metric ids and values that triggered it (`concentration.topAssetWeight`,
`policy.maxAssetWeight`). Nothing is invented; an insight is literally a comparison between two real numbers,
carrying both. Thresholds live in a configurable `InsightPolicy` with `conservative | balanced | aggressive`
presets — the same posture model §7 (Risk-Profile Adaptation) tunes — so the *same* portfolio produces
different insights for different users by design, and always says which policy line it crossed. Crucially,
`suggestedAction` is a *sentence of advice* ("Consider trimming this position toward a more balanced
allocation."), never a callable step. The engine's own header says it plainly: *the engine cannot act; the
user or the Intent layer decides.*

> **Honesty nuance — what actually fires on the shipped path.** The live endpoint calls `analyze(snapshot)`
> with no `extras`, so the three insights that need injected context — `GAS_COSTS_HIGH` (needs
> `gasSpendMicros`), `YIELD_OPPORTUNITY` (needs a `yieldOpportunities` feed), `RISK_INCREASING` (needs the
> previous health score) — are **latent**: coded and tested, but not yet wired end-to-end. Surfacing them is
> a roadmap wiring task, not a new engine. We say "latent," not "shipped."

**The alert engine** (`evaluateAlerts`) is the stateful counterpart. Insights describe a standing shape;
alerts fire on a *change* — and the design decision that matters is that **it must not spam**. It is a pure
function of `(previous state, context, now) → (alerts, next state)`; `now` is passed in, never read from the
clock. Every candidate carries a dedup **`key`**, and the engine suppresses any re-fire inside a
`cooldownHours` window (24h default). Market/security events — bridge exploit, protocol hack, token delist,
yield — arrive on an injected feed and are **filtered to what the user actually owns** (`ownedBridges`,
`ownedProtocols`, `ownedSymbols`), so a user is never alarmed about a bridge they have no exposure to. That
filtering is honesty as much as relevance: we only claim an event *affects you* when it provably touches your
book.

**The scenario engine** (`applyScenario`) answers "what if…" by re-pricing the portfolio through the *same*
normalizer that computes real net worth, so debt signs stay correct. It is deliberately not naive: a spot
holding moves linearly; an LP/vault position re-prices by the constant-value AMM rule (Πlegs
`multiplier^weight`), which captures *impermanent loss* rather than a flat linear mark; and with `propagate`,
correlated assets move by β·shock from a supplied return series, so "BTC −20%" ripples through the book. Gas
and bridge-outage scenarios don't move holdings at all — they surface the *added cost-to-act* and the *value
newly trapped*, which is the real user impact. A scenario result is always tagged with `notes` explaining the
model used, because a what-if is a **clearly-labelled hypothetical, never a forecast**. Benchmark: this is the
"stress test" a Bloomberg terminal runs — but bounded to the user's own positions and never presented as a
prediction of what *will* happen.

**The tax engine** (`computeTaxReport`) is cost-basis tracking by lot matching. Jurisdiction is abstracted to
three parameters (method, long-term threshold, name), so `us_fifo`, `us_hifo`, and a UK-style pooled average
are the *same* engine with different config. The correctness details are the honesty: events are processed in
chronological order (a disposal can only match lots acquired before it), cost and proceeds are split across
lots with **exact bigint arithmetic** with the rounding remainder assigned to the last line so per-disposal
totals reconcile to the penny (Doctrine #4), and any disposal quantity that can't be matched to a lot is
surfaced in `unmatched` — **never guessed**. A missing acquisition record produces an honest gap, not an
invented cost basis. This is a *mechanism and an estimate*, explicitly not filing advice; the localization of
rates and forms is a layer on top.

---

### 6.2 · The honesty contract — fact, scenario, or estimate; never a fabrication

Every insight the Brain surfaces falls into exactly one of three honesty tiers, and the UI and copy must make
which one clear:

| Tier | What it is | Guarantee | Example |
|---|---|---|---|
| **Computed fact** | A threshold crossing on verified analytics | The number is real and its `evidence` reconciles | "SOL is 62% of your portfolio." |
| **Labelled scenario** | A hypothetical re-price | Marked "what-if," carries model `notes` | "A 20% BTC drop would take you to ~$41,200." |
| **Estimate** | A modelled figure with known gaps | Assumptions stated; gaps surfaced, not filled | "Estimated realized gain: $3,110 (2 disposals unmatched)." |

There is no fourth tier. There is no "the AI thinks." A figure that is not one of these three does not ship.

This is enforced, not hoped for, at the **AI-narrator boundary** (`narrator.ts`, and the copilot's
`verifyResponse`/`hasUncitedNumerics` — AI.md §5, §9, ADR-0037). The division of labour is absolute:
**deterministic code computes every number; the LLM only turns those numbers into prose.** A `NarrativeReport`
must cite its figures, and `verifyNarrative` resolves each citation against the verified
`PortfolioIntelligence` — if any citation fails to reconcile (a number the model invented, or one off by more
than a rounding epsilon), the narrative is **rejected** and the engine throws `NARRATION_UNVERIFIED`. The
production default `TemplateNarrator` cites only what it read; an LLM narrator plugged in behind the same
interface is held to the same guard. *"The AI never invents a balance"* is therefore a **tested property**, not
a marketing line. When an upstream price or position was stale, the `stale` bit propagates to the top of the
intelligence object, and a network failure surfaces as *honest degradation* — an empty/partial state — never
as a fabricated "$0" (Doctrine #3; the balances fail-soft rule).

**Where the deterministic boundary sits in this section — read this table as the section's core claim:**

| Concern | Who owns it | The Brain's role |
|---|---|---|
| The number in an insight | Deterministic engine (`intelligence`) | None — it consumes a verified value |
| The words around the number | LLM narrator, gated by `verifyNarrative` | Narrate only; rejected if it can't cite |
| "You might want to…" | `suggestedAction` (advice string) | Propose only — non-executable |
| Turning advice into a plan | §7 Intent Engine (user-driven) | Hands off; the user confirms |
| Acting within caps | §8 Automation, behind the Policy gate | Only within cryptographically-granted limits |
| Disposing of funds | The user's on-device signature | **Never the Brain** (Doctrine #2) |

Every risky interpretation is auditable: an insight's `evidence`, an alert's `key` + `firedAt`, a scenario's
`notes`, a tax line's `acquiredAt`/`disposedAt`. Correctness is demonstrated with the inputs that produced it
(Doctrine #8).

---

### 6.3 · Surfacing insights — signal, not spam

An insight the user never sees is wasted; an insight that arrives ten times is a reason to mute the app.
Chapter 6 §18 is the standing law — *only useful notifications, no spam* — and this section inherits it.

**Shipped today.** The insight engine runs end-to-end over the authenticated user's real holdings:
`GET /v1/portfolio/insights` (`services/api/src/insights.ts`) folds the user's live `Holding[]` + prices into
a `PortfolioSnapshot` and runs the full pipeline through `analyze`, and the web **Insights panel**
(`apps/web`, via the SDK) renders the result. It reads the *same* holdings/price seams the runtime uses, so
the analysis can never drift from a second copy of the data — and an unpriced asset carries 0 value and is
flagged `stale` rather than invented. Insights arrive **severity-ordered** (`critical → warn → info`) so the
most consequential truth is first.

**The anti-spam mechanics** are structural, not a content filter bolted on afterward:

- **Insights are idempotent by shape.** They describe a standing condition; re-running `analyze` on an
  unchanged portfolio yields the same set. They are a *panel you can open*, not a stream that pushes.
- **Alerts are deduped by `key` and silenced by `cooldownHours`.** The same logical alert fires once per
  window; a portfolio bouncing around a threshold does not machine-gun the user.
- **Events are pre-filtered to owned entities.** No noise about assets the user doesn't hold.
- **Severity gates the channel.** A `critical` (health breach, an owned-protocol hack) may warrant a push;
  an `info` (a yield opportunity, a gas spike) belongs in the panel or the daily roll-up, not a 3am buzz.

In conversation (Ch4), an insight is delivered *human, with the value made visible* — "SOL is now 62% of
your portfolio; a bad week there moves your whole net worth" rather than a bare percentage — and its
`suggestedAction` can seed an intent ("want me to draft a rebalance?"). But the handoff obeys the cage: the
suggestion becomes a *proposed plan* the user reviews and signs (Ch7); the Brain never crosses from proposing
to disposing. Where a repeating insight implies a recurring action, that is §8's territory (Automation
Suggestions) — offered, and executed only within cryptographically-granted caps, never silently.

> **Not yet a shipped surface (roadmap to wire).** The alert, scenario, and tax engines are shipped, tested
> *engines* in `packages/intelligence` — but they are **not yet exposed** on a user-facing endpoint or screen
> the way insights are. "The engine exists" ≠ "the product ships it." Surfacing a what-if simulator, a
> stateful alert feed, and a tax report are near-term wiring tasks, tagged roadmap until the endpoint and the
> panel land.

---

### 6.4 · Roadmap — deeper spending analytics, richer tax

Everything above interprets the *portfolio's shape*. The larger promise — understanding *spending and flows*
— is deliberately staged. **Roadmap, tagged as target:**

- **Transaction-flow analytics.** Today gas cost enters as an injected `gasSpendMicros`; there is no engine
  that categorizes on-chain history into *flows* (fees paid over time, counterparties, recurring transfers,
  net inflow/outflow, cost-of-transacting per chain). This is the Copilot-Money-for-crypto capability — a
  spending-analytics engine over normalized history — and it is the biggest single addition this section
  anticipates. It will obey the same contract: every figure computed, every category derived from evidence,
  nothing inferred that can't be shown.
- **Fee & slippage analytics over time.** Cumulative gas, bridge, and slippage cost as a first-class trend,
  answering "what has moving my money actually cost me?"
- **Richer tax.** More jurisdictions beyond the three presets, wash-sale handling, tax-loss-harvesting
  *suggestions* (propose-only — surfacing a candidate disposal, never executing it), and export to standard
  forms. The mechanism is shipped; the coverage and the product surface are the work.
- **Benchmarking, honestly.** "Your return vs. a hold-BTC baseline" — a comparison, clearly labelled as a
  modelled counterfactual, never a claim about a manager's skill.
- **Scenario library + alert subscriptions** as user-facing products (see §6.3's wiring note).

Each of these is designed *now* so the contract holds when built: a spending insight will be a **computed fact
or a labelled estimate**, narrated by an LLM that can only cite verified figures, proposing at most — never
disposing. That is the invariant this section, and this chapter, will not move.

---

### 6.5 · Definition of done

This section's capabilities are complete when — and only when:

1. Every surfaced figure resolves through `verifyNarrative` (or the copilot's fact-grounding); an
   unreconcilable number is rejected, not shown.
2. Every insight/alert/scenario/tax line carries its evidence/`notes`/lot provenance and is auditable.
3. No insight is presented as a fact when it is a scenario or an estimate; the tier is legible in the UI.
4. Notifications obey Ch6 §18: deduped, cooldown-bounded, owned-entity-filtered, severity-gated — signal,
   not spam.
5. No surfaced action crosses the propose→dispose line without the user's on-device signature (Doctrine #2),
   and automation acts only within cryptographically-granted caps (§8).
6. Stale/partial data degrades honestly; a network failure is never rendered as "$0" (Doctrine #3).


## §7 · Risk-Profile Adaptation

A great advisor does not give the same advice to a 24-year-old with a stable salary and a 62-year-old two
years from retirement. They *match the advice to the person* — how much volatility you can stomach, how much
you can afford to lose, which instruments you'll touch. But a great advisor also has a licence and a
fiduciary duty, and even they cannot spend your money without your signature. The Brain gives itself a
harder cage than that. It may *tailor what it proposes* to a risk profile the user owns; it may **never** let
that profile become a way to weaken a guard, and it can never dispose of a single satoshi. This section
specifies the profile, how it feeds the deterministic gates that already ship, and the one invariant that
makes the whole thing safe: **adaptation moves the confirm-and-block thresholds only in the tightening
direction on its own; loosening is always an explicit, informed act by the user, never inferred.**

The one-line contract: **the risk profile tunes how strict the gate is, never whether there is a gate.** A
conservative user is warned earlier and blocked sooner; an aggressive user is offered more and warned later
— but *both* hit an identical, non-negotiable floor (scam token, sanctioned address, honeypot, unlimited
approval, unapproved automation), and *both* sign on-device. The profile is an input to the gate's
*configuration*, never an input that can turn a `block` into an `allow`.

> **Honesty up front.** Two things are cleanly separable, and only one is roadmap. The **enforcement** is
> **SHIPPED and pure**: the Risk Engine ([`packages/risk`](../../packages/risk/src/engine.ts)), the
> Policy Engine ([`packages/policy`](../../packages/policy/src/decision.ts)), their three monotone
> presets, and the runtime that wires them ([`packages/runtime/src/policy.ts`](../../packages/runtime/src/policy.ts))
> are real, tested code that can only refuse. The **profile field** — `riskTolerance` on
> `UserPreferences` ([`copilot/src/memory.ts`](../../packages/copilot/src/memory.ts)) — is also shipped.
> What is **ROADMAP** is the *binding and the adaptation*: automatically selecting the active policy set
> *from* the user's tolerance, a self-serve limit editor, and evolving the profile over time from behaviour.
> "The gate reads a preset" ≠ "the wallet picks the preset from your profile." We tag each claim.

---

### 7.1 · The risk profile — what the wallet knows about your appetite

The profile is three orthogonal things, deliberately kept small and enumerated so it is inspectable and
secret-incapable (the shape discipline is §2's):

| Facet | Where it lives | Shape | Status |
|---|---|---|---|
| **Tolerance** | `UserPreferences.riskTolerance` | `conservative \| balanced \| aggressive` | field **SHIPPED**; behaviour-driven change **ROADMAP** (§2, §7.4) |
| **Limits** | Policy set (`PolicyBasis`, `PolicyRule`) | daily budget, biometric/value thresholds, new-recipient step-up, max risk score | presets **SHIPPED**; per-user editor **ROADMAP** |
| **Preferred / avoided protocols & assets** | `preferredAssets` / `avoidAssets` / `targetAllocation`; Ch7 §6 "trusted protocols only / preferred bridges / preferred DEX" | `SYMBOL_RE` strings, weights `[0,1]` | preference shape **SHIPPED**; constraint wiring per Ch7 §6 |

Tolerance is the *dial*; limits are the *hard numbers*; preferred/avoided protocols are the *guest list*.
Chapter 7 already names all three as first-class planning inputs — the Constraint Engine (Ch7 §6) enforces
"Risk limit · Preferred assets · Preferred bridges · Preferred DEX," and the Personal Preference Engine
(Ch7 §7) remembers "risk tolerance." §7 is where those inputs meet the immune system.

The tolerance tiers map one-to-one onto the three shipped presets — the intended binding:

> `conservative → strict`  ·  `balanced → balanced`  ·  `aggressive → permissive`

The presets are *real and monotone*. `RISK_POLICY_PRESETS` and `POLICY_PRESETS` are proven `strict ⊇
balanced ⊇ permissive`: on any request, strict's outcome is at least as restrictive as balanced's, which is
at least as restrictive as permissive's (`presets.test`). The *automatic selection* of the active set from
`riskTolerance` is the roadmap seam; today the runtime defaults to `POLICY_PRESETS.balanced` and accepts an
injected set ([`runtime/src/policy.ts`](../../packages/runtime/src/policy.ts)).

---

### 7.2 · How the profile feeds the gate — the shipped enforcement

This is the load-bearing part, and it is not aspirational. Every proposed action — whether the user typed
it, the Brain suggested it, or an automation fired it — is evaluated by two orthogonal engines before any
signature is possible, and the profile is *only* an input to their configuration.

**Risk asks "is this dangerous?"** `RiskEngine.evaluate(subject)` collects signals (fresh token, low
liquidity, admin key, address poisoning, unlimited approval, plus hard intel hits), combines them with a
probabilistic-OR into a composite score, and applies the user's `PolicyConfig`
([`risk/src/engine.ts`](../../packages/risk/src/engine.ts), [`risk/src/policy.ts`](../../packages/risk/src/policy.ts)).
The tolerance dial sets exactly these knobs — nothing more:

| Knob (`RISK_POLICY_PRESETS`) | conservative / strict | balanced | aggressive / permissive |
|---|---|---|---|
| Block above risk score | **0.60** | 0.85 | 0.95 |
| Require confirmation above | **0.30** | 0.50 | 0.75 |
| Block unaudited contracts | **yes** | no | no |
| Block unlimited approvals | **yes** | no | no |
| Min provider health | **0.60** | 0.30 | 0.10 |
| Value → biometric step-up (`POLICY_PRESETS`) | **$500** | $2,000 | $10,000 |
| New-recipient confirm · untrusted-device block | **yes · yes** | yes · confirm | no · — |

Read the columns honestly: moving from conservative to aggressive **raises thresholds** — the same swap that
a conservative profile blocks at score 0.60 an aggressive one merely *confirms*, and the biometric prompt
appears at $10k instead of $500. It never removes a category of protection.

**Policy asks "is the user authorised / has the user approved this?"** — over a limit, new recipient,
automation not pre-approved, biometric required ([`policy/src/types.ts`](../../packages/policy/src/types.ts)).
Risk and Policy compose **most-restrictive-wins**: `composeWithRisk` takes the higher of the two gates, so
Policy can only ever *tighten* Risk and vice-versa; a `block` on either side is terminal; and the single
boolean Execution reads is `mayProceedToSign = gate === 'allow' && no requirements remain`
([`policy/src/decision.ts`](../../packages/policy/src/decision.ts)). The profile is upstream of all of
this — it chose *which* thresholds the engines carry. It has no code path to the verdict itself.

**Where the deterministic boundary sits.** The Brain narrates the profile ("you're set to Conservative, so
I'll flag anything above a 0.30 risk score"); the *numbers* — the composite score, the value comparison, the
verdict — are computed by the Risk and Policy engines, never by the model. This is the same
narrator/computer split as the rest of the chapter: the LLM explains the gate; deterministic code *is* the
gate. The Brain has zero signing authority (Doctrine #2), and the risk profile does not lend it any.

---

### 7.3 · The asymmetry that makes it safe — tightening is free, loosening is guarded

The invariant of this section is an *asymmetry*, and it is enforced structurally, not by good intentions.

**A user may tighten freely.** Because the presets are monotone and `PolicyRule.extends` requires a child
rule to be *equal-or-more-restrictive* than its parent ([`policy/src/types.ts`](../../packages/policy/src/types.ts)),
a user can always author a `custom` set that is stricter than any preset — a lower daily limit, a $100
biometric threshold, "block unaudited everywhere." Tightening needs no ceremony because it can only ever
*reduce* the surface for loss.

**Loosening is guarded three ways.** Raising tolerance never reaches the load-bearing floor:

1. **A hard-block signal is terminal at every tolerance.** A sanctioned or blacklisted address, a known
   scam token, or a honeypot carries `severity ≥ 0.99`, which forces `level: 'block'` in the composite
   score regardless of the number, and `evaluatePolicy` returns `block` for a `block`-level report *before
   it reads any preset threshold* ([`risk/src/scoring.ts`](../../packages/risk/src/scoring.ts),
   [`risk/src/policy.ts`](../../packages/risk/src/policy.ts)). "Permissive" does **not** mean "will send
   to a scammer."
2. **The Policy floor is non-overridable.** Four rules — emergency freeze, unlimited-approval block,
   Security-Engine block, and automation-not-pre-approved — ship in *every* preset with `overridable:
   false`, so no user set, preset, or child rule can loosen them ([`policy/src/presets.ts`](../../packages/policy/src/presets.ts)).
   Aggressive tolerance changes the *thresholds*, never the *floor*.
3. **Raising tolerance is an explicit, informed user action — never inferred.** This is the rule §7.4
   lives under. The wallet may *propose* a looser setting; only an explicit, informed "yes" writes it; and
   even then it only widens a threshold, never touches the floor.

The through-line, stated flatly: **adaptation on its own can only make the gate stricter. The one direction
that increases risk — loosening — is unreachable except by a deliberate user act, and even that act cannot
lower the hard floor.**

---

### 7.4 · How the profile adapts over time *(ROADMAP)*

Everything in this subsection is designed-as-target. The mechanism it builds on — the enumerated preference
shape and the consent-first learner — is shipped (§2); the *adaptation of risk tolerance specifically* is
roadmap, and it is the most safety-sensitive learning in the whole chapter, so it carries the strictest
rules.

**From behaviour — proposing, never imposing, and only toward caution.** Over time the wallet observes
signals that bear on appetite: the user consistently backs out of high-risk-score plans, always picks the
"safest" route, keeps a large stable buffer, or repeatedly declines unaudited protocols. These are evidence
that the user is *more* conservative than their current setting. The wallet may then *propose* tightening —
*"You've declined every elevated-risk swap this month. Want me to move you to Conservative? You can change it
anytime."* Crucially, the auto-tightening direction is the only one behaviour may take on its own, and even
it is surfaced as a confirmation, not applied silently, so the user's mental model never diverges from the
setting. Behavioural inference is **hysteretic** (one cautious moment never moves the dial; a durable
pattern might) and it consumes §2's learning signals rather than re-deriving them.

**Loosening from behaviour is forbidden.** No amount of "the user keeps overriding my warnings" ever
auto-raises tolerance. Repeatedly dismissing risk warnings is *not* consent to be warned less — that is
exactly the engagement-driven anti-pattern the Doctrine exists to forbid. A user who wants a looser profile
must go and set it.

**From explicit settings — the guarded path.** The user can move the dial themselves. Because that widens
thresholds, the flow is deliberately heavier than a toggle: the change is **informed** (the wallet shows,
in plain language, exactly what protection each tier removes — "Aggressive raises your biometric prompt from
$500 to $10,000 and stops blocking unaudited contracts"), **previewable** (per Ch7 §5's simulation
discipline and the Policy Engine's `simulate` diffing, the user can see how their next few actions would be
gated *before* committing), **reversible**, and **logged** as a discrete, audited event (Doctrine #8). And
it still cannot lower the non-overridable floor of §7.3.

---

### 7.5 · The portfolio-risk view feeds the profile — computed, then narrated

The Brain does not only read the profile; it can *see whether the profile matches reality*, and here the
grounding is shipped. The Intelligence engine computes an honest, explainable **RiskProfile** and Portfolio
Health Score — diversification (correlation-basis when the book is covered, weights-basis otherwise),
leverage safety, liquidity, stable buffer, stability, drawdown resilience — each factor returned with its
own score, weight, and one-line reason ([`intelligence/src/risk.ts`](../../packages/intelligence/src/risk.ts)).
Every one of those numbers is deterministic; the narrator may cite *only* metrics that reconcile against the
verified intelligence, and a fabricated figure fails `verifyNarrative`
([`intelligence/src/narrator.ts`](../../packages/intelligence/src/narrator.ts)).

So the Brain can say, truthfully: *"Your top asset is 68% of the book and your health score is 41/100 —
that's more concentrated than a Conservative profile usually holds. Want to rebalance, or adjust your
profile?"* The 68% and the 41 are computed by code; the observation is narrated by the LLM; the suggested
action is **propose-only** — a rebalance still routes, still gates, still signs. The profile informs the
framing and the *ordering* of insights (an aggressive user sees the same warnings, worded for their
appetite, per §2's `riskTolerance → framing, never a bypass`), but it never changes a computed number and
never suppresses a warning.

---

### 7.6 · The hard guardrails

Laws (Doctrine #2, #3, #5, #8). A change that violates one is wrong even if it "feels more personalized," and
is reverted.

| # | Guardrail | Why it holds — the mechanism |
|---|---|---|
| 1 | **Adaptation never weakens a guard on its own.** | Behaviour can only auto-*tighten*; the presets are monotone; the four-rule Policy floor is `overridable: false`; a hard-block risk signal (`≥0.99`) is terminal before any threshold is read. |
| 2 | **Raising tolerance is explicit and informed — never inferred.** | Loosening is unreachable from behaviour. The manual path shows exactly what protection is removed, previews the effect, logs the event, and still cannot touch the floor. |
| 3 | **The profile configures the gate; it is never the gate.** | `riskTolerance`/limits choose *which thresholds* Risk and Policy carry. The verdict is computed by `RiskEngine.evaluate` + `composeWithRisk`; no profile field is an input to it. `mayProceedToSign` reads one authoritative gate. |
| 4 | **Every number is computed, then narrated.** | Health, diversification, leverage, and risk scores come from `intelligence/risk.ts` and `risk/scoring.ts`; the LLM may cite only figures that reconcile (`verifyNarrative`). The profile changes wording and ordering, never a value. |
| 5 | **No engagement-maxxing.** | "You keep dismissing warnings" is never read as consent to be warned less. The objective is the user's stated appetite and honest risk, never activity, fee revenue, or time-in-app. |
| 6 | **Inspectable, resettable, auditable.** | Tolerance and every limit are visible fields the user can read and reset; there is no opaque risk score driving hidden behaviour. Each change is a discrete, logged event with its input and result (Doctrine #8). |

---

### 7.7 · Worked example — an aggressive profile still can't be talked into a scam

> Ravi sets his profile to **Aggressive** (an explicit, informed change: the wallet showed him that his
> biometric prompt moves to $10,000 and unaudited contracts stop being auto-blocked; he confirmed). His next
> swap routes through a brand-new, unaudited pool. Under Aggressive, the Risk Engine *confirms* rather than
> blocks it — the threshold moved, exactly as designed — and Ravi approves and signs on-device. The profile
> did its job: it matched the friction to his stated appetite.
>
> A week later he pastes an address the intel source has **blacklisted** as a known theft address, and asks
> to send. His profile is still Aggressive. It makes **no difference**: the address carries a `severity =
> 1.0` signal, the composite score forces `level: 'block'`, and `evaluatePolicy` returns `block` before it
> ever looks at his 0.95 threshold. The Policy floor's non-overridable `RISK_BLOCK` rule would catch it too.
> Ravi sees an honest refusal with the reason ("recipient is blacklisted"), not a way to override it. No
> tolerance setting exists that unblocks this — because the loosening a scam would require is not
> representable in the presets, the floor, or the score.
>
> Contrast the two moments. Raising his tolerance was a real change he made deliberately, and it moved a
> *threshold*. It could never move the *floor*. That asymmetry — free to tighten, guarded to loosen, and a
> hard floor beneath both — is the entire content of §7.

---

### What §7 commits us to

- **The profile matches advice to the person** — tolerance, limits, and preferred/avoided protocols tailor
  what the Brain proposes and how strict the gate is, the way a good advisor tailors advice.
- **Enforcement is shipped; the number never comes from the model** — Risk + Policy + the monotone presets
  are real, tested code that can only refuse; the profile configures their thresholds and nothing else.
- **Adaptation only tightens on its own** — behaviour may auto-propose *more* caution; it can never loosen a
  guard, and no amount of dismissing warnings is read as consent to fewer of them *(adaptation is roadmap;
  the presets and floor are shipped)*.
- **Loosening is an explicit, informed, logged user act** — and even then it moves a threshold, never the
  non-overridable floor; a hard-block signal is terminal at every tolerance.
- **Propose-only, always** — the Brain observes an honest, computed risk view and *suggests*; the user
  approves; the device signs. The profile lends the Brain no authority it did not already lack.

*Siblings:* §2 (Preference Learning) owns *how* `riskTolerance` is learned and the secret-incapable shape;
§7 owns *what it means for risk and how it feeds the gate*. §3 (Goal Engine) reads tolerance to shape a
plan's aggressiveness; §5 (Portfolio Intelligence) computes the RiskProfile this section narrates; §8
(Automation Suggestions) inherits the same floor for anything the profile would automate. The immune system
itself — Risk composition and the Policy floor — is Chapter 7 §5–6; §7 only decides which dial the user
points it at.


## §8 · Automation Suggestions

This is the section where the Brain gets closest to the one thing it may never do: *act on its own.* An
automation is a standing instruction — "buy ₹5,000 of BTC every Monday," "if a bridge I hold is exploited,
move my funds to USDC" — and a standing instruction is a small piece of the future in which the wallet does
something without a human in the loop at that instant. Every other assistant treats this as the reward for
trust: *let me handle it.* Intent Wallet treats it as the sharpest edge of the whole product, and the place
the Doctrine bites hardest. The rule is one sentence, and the rest of this section is its proof:

> **Automation depth equals authorization depth.** An automation may act only inside a cap the user
> *cryptographically granted* — never a satoshi past it, never a permission the Brain invented. The Brain
> **proposes** the automation and **explains** it; the user **grants** it, bounded; and every firing runs
> through the *same* Risk + Policy gate a manual action uses, disposing of value only via a pre-authorized,
> policy-bounded, non-custodial session key. A `block` is terminal; anything short of a clean go **parks** for
> approval. This is Ch4's anti-pattern — *"auto-execute beyond the user's granted permissions"* — made
> structurally impossible, and Product Philosophy §2.8 ("automation depth equals authorization depth") made
> executable.

What is **shipped** here is a real, pure, exhaustively-testable engine ([`packages/automation`](../../packages/automation),
doc 21, ADR-0040) and a real Auto/Manual transaction mode in the app. What is **[roadmap]** is the polished,
proactive automation *product* — the Brain noticing you DCA by hand and offering to automate it, a live
scheduler broadcasting real recurring transactions, a rebalance-on-drift you manage from a dashboard. As
everywhere in this chapter: *the engine exists* is not *the product ships it*, and we tag the gap honestly.

---

### §8.1 · What an automation suggestion is — a proposal, never an installation

A suggestion is the Brain saying *"I could set this up for you"* — and stopping there. It is born the same
way a recommendation is (§4): from language the user already used, not from an opinion the model formed.
The shipped surface is [`AutomationSuggester`](../../packages/copilot/src/recommend.ts) in the Copilot. Its
whole job is to *notice a shape* in an utterance and offer to structure it:

- A DCA shape (`/dca|dollar[- ]cost|every (week|month|monday|day)|recurring|monthly|weekly/`) → an
  `AUTO_DCA` suggestion: *"You described a recurring purchase. I can propose a DCA automation rule for your
  approval."*
- A protective shape (`/stop[- ]loss|if .* (drops?|falls?)|protect|hedge/`) → an `AUTO_STOP_LOSS`
  suggestion: *"You described a downside trigger. I can propose a stop-loss automation rule for your
  approval."*

The critical property is in the type, not the copy. Each suggestion carries an `intent` field the file's own
header calls *"an UNSIGNED, un-installed automation proposal"* — and it is **never installed there.** The
Copilot has no tool that writes a workflow into a running scheduler; `AutomationSuggester.suggest` returns
data. Nothing has been armed. The user has not granted anything. The Brain has, at most, pre-filled a form
and pushed it across the table.

> **Where the boundary is here.** The suggestion is language-in, structure-out — the model's contribution is
> recognizing *"this sounds like a DCA."* It authors no number (the amount, cadence, and caps are the user's,
> filled on the grant surface), and it cannot arm itself: an `AutomationSuggestion` is inert data, and the
> only path from it to a live rule runs through an explicit human grant (§8.5). The Brain that suggests is the
> same brilliant, keyless intern as everywhere else — it drafts the proposal; it cannot sign the order.

---

### §8.2 · The engine that runs a *granted* automation — shipped and tested

Behind a granted automation is [`packages/automation`](../../packages/automation), a pure discriminated-union
engine built exactly like the rest of the deterministic core: money is integer bigint µUSD (Doctrine #4),
every timestamp is *injected* (never `Date.now()` in the core), and the whole thing is offline- and
time-travel-testable with in-memory fakes. A `Workflow` ([`types.ts`](../../packages/automation/src/types.ts))
is **data**, not a string DSL — `trigger → condition → actions`, so it typechecks at authoring time,
serializes to JSON, versions, and diffs.

The pieces, each shipped:

- **Triggers** — a closed union of *what starts a rule*: `schedule` (day/week/month at a UTC hour),
  `price`/`price_move`, `portfolio` (health, drawdown, risk_score, net_worth), `risk_event`, `volatility`,
  `gas`, `bridge_incident`, `ai_recommendation`, `webhook`. Time triggers fire by the injected clock
  ([`triggers.ts`](../../packages/automation/src/triggers.ts) — `isScheduleDue` fires *once* for the most
  recent missed instant, so a burst of missed windows never replays); event triggers are matched against an
  injected `EvalContext` (prices, portfolio, gas, events) — never a live feed read inside the core.
- **Conditions** — a typed boolean AST (`and`/`or`/`not`, `price_gte`, `metric`, `gas_below`, …) evaluated by
  a *total, pure* `evaluateCondition` ([`conditions.ts`](../../packages/automation/src/conditions.ts)) that
  reads only the injected context. This is what makes a rule's gating logic deterministic and unit-testable.
- **The compiler** ([`compiler.ts`](../../packages/automation/src/compiler.ts)) — natural language → a typed
  `Workflow`, deterministic templates first (DCA, buy-the-dip, scheduled reward-claim, exploit-triggered exit)
  at zero LLM cost, with an injected `WorkflowLlmClient` as the fallback for the long tail. Its header states
  the law it lives under: *"the compiler never grants authority, it only structures intent."* An exploited
  protocol compiles to an `execute_intent` action ("move all at-risk funds to USDC") — which itself re-enters
  the Intent Engine (Ch7) and its full gate. Nothing the compiler produces is a shortcut around a gate.
- **The scheduler** ([`scheduler.ts`](../../packages/automation/src/scheduler.ts)) — read-only projection:
  `upcomingRuns` shows the next fire of each scheduled workflow for a dashboard. It never fires anything;
  firing is the engine's job.

The run pipeline itself ([`engine.ts`](../../packages/automation/src/engine.ts)) is the spine, and it is
worth reading as the enforcement of the whole section:

```
trigger fires → conditions → SAFETY (cooldown/daily cap) → idempotency claim
  → for each action: build a PolicyRequest → AUTHORIZE via the injected Policy gate (which composes Risk)
  → mayProceedToSign ? execute via the pre-authorized SESSION KEY : PARK as awaiting_approval
  → record run → notify
```

`AutomationEngine.runWorkflow` never authorizes anything itself and holds no key. It also ships a
`simulate`/`dryRun` path — same gate evaluation, no execution, no persistence — so a user (or a test) can see
exactly what a rule *would* do before it is ever live. A global `killSwitch` short-circuits every run to
`skipped`. This is the engine; the tests around it are the proof (task #49, ADR-0040).

---

### §8.3 · Two safety layers, one authorization — how "within caps" is enforced

There are two distinct kinds of safety on an automation, and keeping them separate is what makes the system
honest. Confusing them is how other products end up letting a "rate limit" masquerade as a "spend limit."

**Layer 1 — scheduling safety (how *often* a rule fires).** [`safety.ts`](../../packages/automation/src/safety.ts)
bounds cadence: `maxDailyRuns`, `cooldownSeconds`, `timeoutSeconds`, and a `requireApproval` override. Its
header is explicit that this is *only* a scheduler concern — *"Authorization safety (amount limits, trusted
recipients, biometric thresholds, automation pre-approval) is the Policy Engine's job and is NOT duplicated
here."* A daily-run cap stops a runaway loop; it says nothing about how much money may move.

**Layer 2 — authorization (whether a firing may move value *at all*, and how much).** This is not
automation's decision to make. Every financial action is mapped to a `PolicyRequest` and handed to the
injected `PolicyAuthorizer` ([`sources.ts`](../../packages/automation/src/sources.ts)) — i.e.
`PolicyEngine.evaluate`, which composes Risk internally so there is *one* authoritative verdict and no
composition drift. The engine reads that verdict and obeys it ([`engine.ts`](../../packages/automation/src/engine.ts)):

- `permission.gate === 'block'` → the action is `blocked`, terminal. A `block` is non-overridable even for the
  most permissive user (AI.md §4) — a sanctioned recipient is refused whether a human or a schedule proposed it.
- `!permission.mayProceedToSign` **or** `wf.safety.requireApproval` → the action **parks** as
  `awaiting_approval`, carrying the elevated `ConfirmationRequirement`s the Policy Engine demanded. The rule
  does not quietly do a smaller version; it stops and asks.
- clean `mayProceedToSign` → and *only* then → execute via the `Executor`, using the workflow's
  pre-authorized **session key** — never the master key, never a server-held secret (non-custodial, ADR-0028).
  If the authorizer throws, the engine catches and returns `blocked` — *"authorization failed — failing
  closed"* (Doctrine #5).

**The shipped Auto/Manual mode is the same principle at the transaction edge.** In the real app
([`apps/web/src/settings.ts`](../../apps/web/src/settings.ts),
[`apps/mobile/settings.ts`](../../apps/mobile/settings.ts)) the user chooses **Manual (the default)** — every
transaction confirmed — or **Auto** — a low-risk, within-cap action signs without a per-transaction
confirmation. The decision function `autoDecision(usdVal, riskLevel)` **fails safe** by construction:

```ts
if (getTxMode() !== 'auto') return { auto: false };            // Manual is default; opt-in only
if (riskLevel === 'block')  return { auto: false, ... };        // a risk BLOCK is never auto
if (usdVal > perTxUsd)      return { auto: false, ... };        // per-transaction cap binds
if (autoSpentTodayUsd() + usdVal > dailyUsd) return { auto: false, ... }; // daily cap binds
return { auto: true };
```

Auto still signs on-device and still passes the Risk/Policy gate — it removes a *tap*, never a *check*.
Caps are real USD, clamped sane (`daily ≥ per-tx`), tracked in a daily ledger that resets each calendar day.
On testnet, where there is no real value, auto runs freely — the frictionless case — but the moment a real
mainnet USD value is known, both caps bind. **Manual is the floor the user consciously leaves.**

> **Where the boundary is here.** Automation has *zero* authorization power of its own — that word belongs to
> the Policy Engine, and the automation engine only asks it and obeys. "Within your caps" is not a promise in
> a prompt; it is `permission.mayProceedToSign` (or `autoDecision`) evaluated by deterministic code that can
> only ever *refuse*. The Brain never sets a cap, never widens one, and never turns a `park` into a `proceed`.

---

### §8.4 · The hard line — an automated action is provably no more capable than a manual one

Chapter 4's anti-pattern list forbids exactly one thing above all: *"auto-execute beyond the user's granted
permissions."* This section is the machinery that makes that impossible rather than merely disallowed, and it
rests on a single structural fact: **automation reaches funds through the same chokepoint a human tap does.**

- **Same gate.** A manual swap and a scheduled swap both build a `PolicyRequest` and both must earn
  `mayProceedToSign` from `PolicyEngine.evaluate` (which composes Risk). There is no automation-only fast lane,
  no "trusted because it's a rule" bypass. The engine's own header states the invariant: *"This is what makes
  an automated action provably no more capable than a manual one."*
- **Same disposer, bounded.** Value moves only via a session key that was *pre-authorized* and is
  *policy-bounded* — a cryptographic grant with a ceiling, not a standing signature on the master key. The
  Brain never holds it; the server never holds it; it lives within the non-custodial model (Doctrine #1,
  ADR-0028). Automation depth is, literally, the depth of that key's grant.
- **Fail closed, park loudly.** Anything the gate cannot positively clear parks as `awaiting_approval` — the
  automation degrades to a *proposal awaiting a human*, which is the recommendation surface (§4) again.
  Silence is never "proceed." A `block` is the end of the road.
- **Auditable end to end.** Every firing is a `WorkflowRun` with a status, per-action `ActionResult`s, and the
  `permission` verdict that governed each — inputs and reasons logged (Doctrine #8). An automated decision can
  be replayed and defended, never just asserted.

The consequence is the promise we can actually keep: you can hand the wallet a standing instruction *and* know
that the worst a compromised, buggy, or over-eager rule can do is exactly what a manual you could have done
inside the same caps — no more. The automation is bold; the cage is the same boring one; the user's grant is
the only thing that widens it, and they can revoke it instantly.

---

### §8.5 · The lifecycle — suggest → grant → run, and where each boundary sits

Putting it together, the honest path from a spoken wish to a firing automation, with the deterministic
boundary marked at every hop:

```
"Buy ₹5,000 of BTC every Monday"
  → SUGGEST     Brain recognizes the shape → AutomationSuggestion (unsigned, un-installed)   [LLM narrates]
  → COMPILE     deterministic template → a typed Workflow (trigger·condition·actions)         [pure code]
  → GRANT       user sets amount + caps + session-key scope, explicitly arms it               [HUMAN grant]
  → SCHEDULE    upcomingRuns projects the next fire (read-only)                                [pure code]
  → FIRE        trigger + conditions + scheduling safety                                      [pure code]
  → AUTHORIZE   PolicyEngine.evaluate (composes Risk) per action                              [the GATE]
  → DISPOSE     within-cap → session key executes; else PARK as awaiting_approval             [bounded key]
  → RECORD      WorkflowRun logged; user notified                                             [auditable]
```

The user is present at exactly the two moments that matter — the **grant** (where the cap is cryptographically
set) and any **park** (where the gate asked for elevated confirmation) — and absent only where the machine is
provably operating inside a ceiling the user themselves drew. That is the whole deal: not "the AI handles
your money," but "you drew a boundary, and deterministic code holds it."

---

### §8.6 · Honest status — the engine is shipped; the *product* is roadmap

Scrupulous honesty demands the distinction this chapter keeps returning to. The **engine** and the **Auto/Manual
mode** are real, tested code. A **polished, proactive automation product** is not yet shipped, and we never
demo it as if it were.

| Capability | Status | Where |
|---|---|---|
| Typed workflow model (trigger·condition·actions), bigint µUSD, injected clock | **Shipped** | `automation/types.ts` |
| Trigger + condition evaluation (schedule + event), pure & deterministic | **Shipped** | `automation/triggers.ts`, `conditions.ts` |
| NL → workflow compiler (DCA / dip / reward-claim / exploit-exit templates + LLM fallback) | **Shipped** | `automation/compiler.ts` |
| Run pipeline: trigger→conditions→safety→idempotency→**Policy gate**→session key / park | **Shipped** | `automation/engine.ts` |
| Scheduling safety (cooldown, daily-run cap, kill switch); `simulate`/dry-run | **Shipped** | `automation/safety.ts`, `engine.ts` |
| Authorization delegated to Policy(+Risk); `block` terminal; fail-closed park | **Shipped** | `automation/engine.ts`, `sources.ts` |
| Auto/Manual transaction mode, opt-in, per-tx + daily USD caps, fails safe | **Shipped** | `apps/web/settings.ts`, `apps/mobile/settings.ts` |
| Copilot automation *suggestions* (unsigned, un-installed proposals) | **Shipped** | `copilot/recommend.ts` |
| Proactive suggestion ("I noticed you DCA by hand — automate it?"), rebalance-on-drift as a product | **[roadmap]** | §4, §9 |
| Live scheduler broadcasting real recurring txs via a granted session key end to end | **[roadmap]** | seam: `Executor` + ADR-0028 |
| User-facing automation dashboard (grant, edit, pause, audit, upcoming runs) | **[roadmap]** | seam: `scheduler.ts` |

The seams are deliberately clean, not hand-waved: the `Executor` and `ContextProvider` are injected
interfaces with in-memory fakes today, so wiring a real session-key executor and a real market/portfolio
context provider is *composition*, not a rewrite. The Brain proactively recognizing an automation opportunity
from behavior belongs to §2 (Preference Learning) and §9 (Daily Briefings); a rebalance-on-drift or
save-toward-a-goal automation is the Goal Engine's runner (§3). All of it is designed to arrive inside this
same cage — proposals the user grants, bounded by caps, gated per firing, disposed only by a pre-authorized
non-custodial key.

---

**The boundary in one line.** An automation is a standing *proposal* the user cryptographically bounds — the
Brain suggests it and explains it, deterministic code compiles and schedules it, the Policy Engine authorizes
every firing, and a pre-authorized session key disposes only within the grant, parking loudly whenever it
can't. The engine to do this is shipped and tested; the polished product is roadmap; and at no depth does
automation ever exceed the permission the user consciously gave. Automation depth equals authorization depth —
by construction, not by promise.


## §9 · Daily Briefings & Long-Term Financial Planning

> **Status:** **[ROADMAP]** as shipped features. The *substrate* they compose — the deterministic analytics,
> the stateful **alert engine** with its anti-spam cooldown (`alerts.ts`), the **scenario engine** for
> labelled projections (`scenario.ts`), the **AI-narrator boundary** that machine-checks every cited figure
> (`narrator.ts`, whose `NarrativeKind` already includes a `weekly` template), and the gated, cap-bounded
> automation runner (`@intent-wallet/automation`) — is **shipped and tested today**. What is roadmap is the
> **cadence**: assembling those verified facts into a calm morning briefing, a weekly/monthly review, and a
> multi-month plan the user *steers*. This section specifies that target honestly, and holds the whole
> Chapter's line at every step: **the Brain proposes, explains, remembers with consent, and adapts — but it
> never signs, never fabricates a number, and never acts beyond a permission the user cryptographically
> granted.** This is where Chapter 9 closes; the closing invariant in §9.6 is the invariant for the entire
> Brain.

Every prior section of this chapter reads the portfolio at a moment. This one adds the **time dimension** —
the assistant that *checks in*. Chapter 4 promised it twice: the **"AI Dashboard — the Daily Briefing"**
("*Good morning. Portfolio +3.1% · Gas Low · ETH bullish momentum · One approval needs review*") and
**"AI Goals"** ("*Help me save ₹1 crore*" converted into a long-term plan). Chapter 2's personality doctrine
sets the register for both: this must feel like a **senior financial advisor who keeps you informed and in
control** — never a salesman, never a notification-farm optimizing for your attention. A briefing you dread,
or a plan that quietly acquires authority over your money, is a *product failure* under our own doctrine,
even if every number in it is correct.

The temptation here is the most seductive in the chapter. A daily digest and a months-long plan are exactly
where a lesser wallet would start *acting on your behalf* — "we rebalanced for you," "we took profit." We
refuse hardest precisely here. A briefing **reports**; a plan **proposes**; only the device **disposes**.

---

### 9.1 · The daily briefing — anatomy of an honest morning digest

The briefing is a **one-glance, opt-in digest** rolled up once per day from facts the Brain already computes.
Its shape is fixed and deliberately small — Chapter 4's Claude Rule ("can one screen/line be removed? if yes,
remove it") applied to a status report. Three lines, each sourced from a deterministic engine, never from an
LLM's imagination:

| Briefing line | What it says | Computed by (deterministic, **shipped**) | The honesty line |
|---|---|---|---|
| **Portfolio move** | "+3.1% overnight" / "down 4% since yesterday" | `performance.ts` + the large-move rule in `alerts.ts` (Δ net worth over the reading interval) — integer µUSD, bigint end-to-end | A network-failed read is **"unavailable," never "0%."** No borrowed or projected number is styled as an actual move |
| **Conditions** | "Gas Low," "gas spike — defer non-urgent txns" | The `GAS_SPIKE` alert (`alerts.ts`, `gasSpikeGwei`) over a real gas feed | "Low/High" is a **labelled read** from a live source, not a vibe |
| **One thing to review** | "One approval needs review" / the single most important insight | The top-severity `Insight`/`Alert` (`insights.ts`, `alerts.ts`, sorted critical→warn→info) or a parked automation action (`awaiting_approval`) | Exactly **one** call to action, evidence-backed; never manufactured urgency |

Two design properties make this trustworthy rather than noisy.

**It is anti-spam by construction.** A daily briefing that cried wolf would train the user to ignore it — the
worst outcome for a safety surface. The shipped alert engine is already built for this: `evaluateAlerts` is
*stateful*, every candidate carries a dedup `key`, and a fired alert stays silent for a cooldown window
(`cooldownHours`, default 24) before it can re-fire (`alerts.ts`). The briefing inherits that discipline for
free — it surfaces *changes and standing risks*, deduped, not a re-print of yesterday's portfolio. A calm
morning ("nothing needs you today") is a **first-class, honest outcome**, not an empty slot to fill with
filler. Chapter 4's "AI Dashboard" and the main chapter's "Daily Briefing *(optional)*" both insist on
*brief, relevant, optional*; the cooldown state is how we keep that promise mechanically.

**Every figure is machine-checked; no sentiment is invented.** The narration boundary is shipped and
enforced. `TemplateNarrator` cites only figures that resolve against the verified `PortfolioIntelligence`,
and `verifyNarrative` throws out any citation whose value does not reconcile to the computed truth
(`narrator.ts`). Plug an LLM narrator behind that interface to make the briefing read warmly and it *still*
cannot fabricate a number — a bad figure fails the guard and the sentence is discarded. This has a sharp
consequence for Chapter 4's example line, *"ETH bullish momentum"*: a **qualitative market claim is not
exempt from the honesty doctrine.** Either it is a labelled read from a real signal feed (a momentum
indicator computed by code, or an injected `MarketEvent` filtered to what the user actually owns —
`alerts.ts`), rendered as *"ETH: momentum indicator positive (as of 08:00)"*, or it does not appear.
The Brain never narrates a market *opinion* it cannot ground. That is the difference between a senior
advisor's note and a pump.

Delivery is **opt-in and inspectable.** The shipped preference shape already carries the switch —
`notificationPrefs.weeklyReportOptIn` and `alertsOptIn` in the enumerated, secret-incapable `UserPreferences`
(`copilot/src/memory.ts`); the daily cadence extends that pattern. A user can turn the briefing off, and no
briefing ever contains a secret, a full address, or anything the memory boundary (§1) forbids.

> **Good morning.**
> Portfolio **+3.1%** overnight · Gas **Low** · one approval is **waiting for you**.
> *(Every figure here was computed by the wallet's own code and reconciled against your verified positions.
> Tap the approval to review it — nothing has been signed.)*

That parenthetical is not decoration. It is the product saying, in the user's language, exactly where the
deterministic boundary sits: **I told you; I did not act.**

---

### 9.2 · The review cadence — day, week, month, year

A briefing is the shortest rung of a ladder the main chapter already sketches: **Daily Briefing (§6) → Weekly
Review (§7) → Monthly Review (§8) → Long-Term Timeline (§19).** Each rung *summarizes insights, not raw
data*, over a longer window, and each is built from the same verified facts — only the aggregation window and
the narrative template change.

| Rung | Window | Summarizes (all deterministic) | Narrative status |
|---|---|---|---|
| **Daily briefing** | 24h | Overnight move, conditions, one thing to review | **[ROADMAP]** cadence; alert/insight substrate **[SHIPPED]** |
| **Weekly review** | 7d | Time-weighted return, health, major transactions, fees paid, automation results | Narrative template **[SHIPPED]** (`narrator.ts` `weekly` kind); scheduling **[ROADMAP]** |
| **Monthly review** | 30d | Growth, allocation shift, fee & yield summary, tax-relevant activity, goal progress | **[ROADMAP]**; each figure has a shipped engine (`performance.ts`, `allocation.ts`, `tax.ts`) |
| **Long-term timeline** | months–years | Goals → decisions → portfolio changes → automations → achievements → reviews | **[ROADMAP]**; a chronological log of evidence-carrying events |

The **weekly review is the most-shipped rung**: `narrator.ts` already implements a `weekly` `NarrativeKind`
that, when performance history exists, reports the period's *time-weighted* return to a cited net worth and
health score — and, crucially, when history is *not* available says so plainly ("*Performance history isn't
available yet, so no return is reported*") rather than inventing a return. That honest-empty branch is the
whole ethos in one template: **no history, no number.**

The timeline (§19) deserves one honesty note of its own. It is a **chronological ledger of things that
actually happened** — each entry an evidence-carrying event in the same shape the insight and alert engines
already emit (a real metric, its value, the reason it fired; Doctrine #8). An "achievement" is a threshold
crossing on a *real* metric ("net worth first crossed ₹50 L on this date"), logged, auditable, and
replayable — never a generated milestone or a gamified badge. The timeline helps a user understand months of
progress *because* every point on it is a fact they could re-derive, not a story the AI told.

---

### 9.3 · Long-term financial planning — a plan the user steers

Long-term planning is where a stated **goal (§3)** is tracked *over months* and advanced by a *sequence* of
proposed, gated strategies. §3 defines the goal object and its measure-→detect-gap-→propose-→gate-→dispose
loop; this section does not re-specify it — it specifies the **time-extended surface**: how a goal becomes a
*plan* the user watches unfold, and where the boundary sits across a horizon rather than a moment.

A **plan** is a goal plus a horizon plus an ordered, revisable set of *proposed* steps. Concretely: "*Help me
save ₹1 crore over 3 years*" becomes a goal whose metric is today's real net worth (`intelligence`
analytics), a horizon, and a strategy the Brain proposes — e.g. a recurring contribution (a Chapter 7
`recurring` intent), each instance **gated** exactly as a manual action is. The plan is a **schedule of
proposals, never a schedule of disposals** (§3's invariant, extended across time). Three properties hold the
line over the long run, where the temptation to "just handle it" is strongest:

- **Projections are labelled estimates, never promises.** The only forward numbers a plan may show come from
  the shipped **scenario engine** (`applyScenario`) — "*at this contribution rate, ~14 months to target*" —
  rendered as an explicit, styled estimate. It is **never** drawn as achieved, confirmed, or guaranteed
  (Doctrine #3; §3.4). "You *will* reach ₹1 crore" is a banned sentence; "here is the real figure, the honest
  gap, and a labelled projection" is the only allowed one.
- **Every advancing step re-runs the same gate.** A plan invents no execution path. Each proposed step
  resolves → plans → simulates → gets a Risk verdict → confirm → **device signs** (Ch7→Ch8). If, and only if,
  the user granted a bounded, revocable automation cap, a within-cap step may execute through the
  `@intent-wallet/automation` runner — which "never authorizes anything itself and never holds a key," maps
  each action to a `PolicyRequest`, and **parks** anything short of a clean `mayProceedToSign` as
  `awaiting_approval` (`engine.ts`). A plan can turn the loop; it cannot loosen a bolt in it.
- **The plan is steerable and disposable at any instant.** Pause freezes all proposals and any within-cap
  execution; edit narrows target, horizon, or caps; revoke deletes the plan *and* any session-key cap it rode
  on (§3.5). A long-term plan never acquires momentum the user cannot stop in one tap.

This is the exact bar a great human advisor is held to and a robo-advisor is not: the advisor has continuous,
data-driven attention across years — Copilot Money's clarity, a Bloomberg terminal's real numbers — but
**zero discretionary reach.** They cannot move your money without your say-so. Our plan is held to that bar in
*code*, not in a client agreement. That is the whole product claim of long-term planning, and it is why the
feature is safe to build.

---

### 9.4 · The emotional throughline — a senior advisor who keeps you in control

Everything above is engineering; this subsection is the *feeling*, because Chapter 2 makes feeling an
acceptance criterion, not polish. The briefing and the plan are the Brain's most *relational* surfaces — they
speak to the user on an ordinary morning, over months — so the personality doctrine governs them most
strictly.

The register is a **senior financial advisor**, never a salesman (Ch2 personality; Ch4 "AI Personality").
Concretely, that means:

- **Calm over urgent.** No "🚀 you're crushing it," no FOMO, no invented deadline. A quiet morning reads
  "*nothing needs you today*" — and that is a *good* briefing, not a failure to engage. We optimize for the
  user's *informedness and calm*, never for their attention or engagement (an anti-metric; Product §9).
- **Honest over flattering.** A drawdown week says so, plainly and without drama — the way a good advisor's
  quarterly letter states a loss: the real figure, the honest gap, the next proposed step, and nothing it
  cannot prove. `verifyNarrative` guarantees the figures; the personality doctrine guarantees the *tone*.
- **Informative over directive.** The briefing surfaces *one* thing to review and explains *why you're seeing
  it* (Ch9 §18 Explainability: what was considered, what was assumed, what the alternatives are). It never
  pushes. Confidence is surfaced, not smoothed: below the floor, the Brain asks rather than asserts
  (`copilot/src/confidence.ts`; Ch9 §17).
- **In-control over hands-off.** The throughline the user should *feel*, every day and across every month, is:
  *"my assistant watched, understood, told me the truth, and waited for me."* The device signature is the
  user's, always. The plan is theirs to pause, edit, or delete. Nothing happened while they slept that they
  did not authorize.

Benchmarked against the best, honestly: ChatGPT is more fluent, Bloomberg has deeper data, a human advisor
has judgment we do not claim. What none of them offers is a *non-custodial, propose-only* assistant whose
every stated number is machine-verified and whose every action is bounded by a cap the user set and can
revoke in one tap. That is the seam the Brain owns — and the daily briefing is where the user *feels* it.

---

### 9.5 · Shipped vs. roadmap — the honest split

| Capability | Status | Where |
|---|---|---|
| Deterministic move/conditions/insight facts behind every briefing line | **[SHIPPED]** | `@intent-wallet/intelligence` (`performance.ts`, `alerts.ts`, `insights.ts`) |
| Stateful, deduped, cooldown-bounded alerting (the anti-spam substrate) | **[SHIPPED]** | `alerts.ts` (`evaluateAlerts`, `cooldownHours`) |
| Anti-fabrication narration guard over every reported figure | **[SHIPPED]** | `narrator.ts` (`verifyNarrative`) |
| Weekly-review narrative template (with honest "no history" branch) | **[SHIPPED]** | `narrator.ts` (`NarrativeKind` `weekly`) |
| Forward projections as explicitly-labelled estimates | **[SHIPPED]** (engine) | `scenario.ts` (`applyScenario`) |
| Insights already reaching the user (not yet as a scheduled briefing) | **[SHIPPED]** | `/v1/portfolio/insights` + the web Insights panel |
| Gated, cap-bounded autonomous runner that parks anything beyond a clean sign | **[SHIPPED]** (engine) | `@intent-wallet/automation` (`engine.ts`, `safety.ts`) |
| **The daily briefing** as a scheduled, opt-in morning digest | **[ROADMAP]** | this section is its charter; ties to Ch4 "AI Dashboard" |
| **Weekly/monthly review** cadence, delivery, and the long-term **timeline** | **[ROADMAP]** | rolls up shipped engines on a schedule |
| **Long-term planning** — a goal tracked over months as a steered plan of gated proposals | **[ROADMAP]** | ties to §3 (Goal Engine) + Ch4 "AI Goals" |

"The engine exists" is not "the product ships it." Positioning and copy must not claim a daily briefing,
review cadence, or long-term plan as *live* until the roadmap rows are real and driven end-to-end by a
first-time user (Product §8).

---

### 9.6 · The closing invariant — for the daily briefing, and for the whole Brain

Because §9 closes Chapter 9, its invariant is the Chapter's. State the entire AI Financial Brain in one
paragraph and it is this:

> The Brain **proposes** — insights, recommendations, plans, briefings. It **explains** — every figure
> answers "why am I seeing this, what was considered, what was assumed" (§18). It **remembers, with consent**
> — an enumerated, secret-incapable, user-resettable memory that never holds a key (§1, §7; AI.md §7). And it
> **adapts** — learning enumerated preferences the user can inspect and reset (§2). But it **never signs**
> (Doctrine #2 — zero signing authority; the device disposes), it **never fabricates a number** (Doctrine #3 —
> every figure is computed by deterministic code and machine-checked by `verifyNarrative`; a scenario is
> labelled a scenario), and it **never acts beyond a permission the user cryptographically granted** (a
> `block` is terminal; anything short of a clean sign parks; caps are user-set and instantly revocable).

Nothing in a briefing, a review, a timeline, or a multi-year plan may weaken any clause of that sentence. A
morning digest that acted on its own, a projection presented as a fact, a plan that quietly widened its cap,
or a memory that learned a secret is not a feature with a bug — it is a **doctrine violation, reverted on
sight** (CLAUDE.md §3). The Brain's job is to make a non-technical stranger feel like they have a brilliant,
tireless advisor who tells them the truth and waits for their word. It earns that trust the only way trust is
ever earned with someone's money: by proposing everything, explaining everything, remembering only what it is
allowed to — and **disposing of nothing.**

> **Cross-references.** Briefing facts come from Portfolio Intelligence (§5) and Spending & Investment
> Insights (§6); the "one thing to review" is a Personalized Recommendation (§4) or an Automation Suggestion
> (§8); long-term plans are the time-extension of the Goal Engine (§3), remembered via Persistent Memory (§1)
> and tuned by Preference Learning (§2). The conversational surface is Ch4 (esp. "AI Dashboard" + "AI Goals");
> the execution boundary every gated step crosses is Ch7 (Intent Engine) → Ch8 (Execution Engine). The line
> that unifies all nine sections, and closes the chapter: **the Brain proposes and explains; the device
> disposes.**


---

## Where this sits

This is the reference behind [Chapter 9 — the AI Financial Brain charter](../bible/chapter-09-ai-financial-brain.md),
and the material Volume IV is built from. The shipped core — the analytics engine (positions / allocation /
performance / risk-health), the insight / alert / scenario / tax engines, the `/v1/portfolio/insights` path,
and above all the **AI-narrator boundary** (deterministic code computes every figure; the LLM only narrates)
— is real today; persistent long-term memory, learning-from-actions, the goal engine, coaching, and the
review cadence are roadmap, designed so the Brain never signs, never fabricates a number, and never acts
beyond a granted permission.
