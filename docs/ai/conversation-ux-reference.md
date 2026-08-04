[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Volume IV — the long-form behind [Chapter 4](../bible/chapter-04-conversation-first-ux.md)

# The Conversation-First UX Reference

*The buildable expansion of Chapter 4's charter — the AI interaction model turned into concrete flows, grounded in the real intent pipeline, with the shipped-vs-roadmap line drawn honestly.*

**About this document.** [Chapter 4](../bible/chapter-04-conversation-first-ux.md) is the memorize-it charter
— the philosophy of the AI as the operating system between the person and the chain. This is its
**reference spec**: the conversation architecture, intent understanding, memory, planning screens,
explainable execution, approval flows, voice, and the trust patterns — each with its states and its honest
label, **SHIPPED** (cite the real code) or **ROADMAP** (voice, long-term goals, rich memory). The hard line
never moves: **AI proposes, deterministic code verifies, the device signature disposes.**

| § | Section | Grounded in |
|---|---|---|
| 1 | The Conversation Architecture | the parse→plan→gate→sign→settle spine |
| 2 | Intent Understanding | `packages/intents/src`, `PRODUCT.md §7` |
| 3 | Multi-turn Conversations & Context | `UX_GUIDELINES.md` |
| 4 | AI Memory | `AI.md`, the non-custodial line |
| 5 | AI Planning Screens | `PlanFlow` / `.stage` / `.flow` |
| 6 | Explainable Execution | the risk/plan surfaces, the audit trail |
| 7 | Human Approval Flows | `autoDecision`, the mainnet guard |
| 8 | Voice-First Interactions | roadmap, designed to never sign by voice |
| 9 | Personalized Behavior & Trust Patterns | Chapter 2 personality + honesty doctrine |

Honesty first: shipped vs roadmap is tagged throughout.

---

## §1 · The Conversation Architecture

> *The user is having a conversation. The code is running a proof. This section is the contract that
> keeps those two things the same thing — a chat the user can read, over a pipeline the user can't
> subvert.*

Every other wallet is an instrument panel: the human is the router, clicking Network → Bridge → Token →
Approve → Sign. Intent Wallet replaces the panel with a **conversation** — the user states an *outcome*
in their own words, and a deterministic engine turns that outcome into a proven, priced, risk-checked
plan that **their device** signs. Chapter 2 fixed the *why* (Intent Before Interface; AI as the front
door; the fixed planning lifecycle) and Chapter 3 fixed the *look* (the AI prompt is the heart; the
planning UI never instant-executes). This section fixes the **model of the conversation itself**: what a
turn is, what surfaces it, what kinds of message can appear in it, and — the crux — how the visible chat
is a faithful *projection* of an invisible deterministic pipeline that does the actual proving.

The one idea to hold above all others: **the chat is not the engine; it is a render of the engine.** The
conversation is a read-only window onto `parse → plan → gate → authorize → device-sign → broadcast →
settle`. The window is warm, plain-spoken, and calm. The machinery behind it is cold, typed, and can only
ever refuse. Nothing the user types, and nothing the LLM says, moves a single base unit — that is
structural (AI.md §1, Doctrine #2), and §1 is where the structure meets the screen.

---

### 1.1 · The turn is the atom

The unit of the conversation is a **turn**: one user utterance and everything the wallet does in response
to it. In shipped web V2 a turn is a tiny, honest data shape (`apps/web/src/App.tsx`):

```ts
interface Turn { q: string; res?: PlanResponse; error?: string; pending?: boolean }
```

That shape encodes the entire lifecycle. `q` is what the user said (echoed verbatim, immediately).
`pending` is the *thinking* state. `res` is the resolved outcome the engine returned. `error` is an
honest failure. A turn is created optimistically and then resolved exactly once — never mutated into a
lie:

```ts
setTurns((t) => [...t, { q, pending: true }]);          // 1. echo + thinking
const res = await planIntent(substituteContacts(q));    // 2. run the invisible pipeline
setTurns((t) => t.map((x, i) => i === idx ? { q, res } : x));   // 3a. resolved
// …or, on throw:  { q, error }                          // 3b. honest failure
```

Within a resolved turn, the *feeling* follows Chapter 2 §8's fixed lifecycle — **Understand → Research →
Build Plan → Risk → Simulation → Explanation → Review → Approval → Execution → Confirmation** — but the
architecture collapses that into six user-legible moments the reader can name:

| Moment | What the user perceives | Who produces it |
|---|---|---|
| **1 · Intent** | their own sentence, echoed instantly | the user |
| **2 · Understanding** | "Planning…" then "Parsed as a *swap*…" | deterministic parser (LLM only at the tail) |
| **3 · Plan** | a PlanCard: send / receive-min / cost / risk / route | deterministic planner |
| **4 · Explanation** | the plan's reasoning + a stage-by-stage timeline | deterministic core, narrated |
| **5 · Review** | the authorize + sign controls; the safety gate | the Policy gate; the user |
| **6 · Outcome** | a real on-chain result, or an honest refusal/error | the chain, reported truthfully |

The order is a *contract*, not a layout preference: the plan is always explained and its safety always
shown **before** review, and nothing executes before the user's approval where their automation policy
requires it. A user who learns this rhythm once trusts it everywhere — which is the whole point of making
it fixed. §5 (Planning Screens), §6 (Explainable Execution), and §7 (Human Approval Flows) each own one
of these moments in depth; §1 owns the fact that they are *one turn, in this order, always.*

---

### 1.2 · The composer is the primary surface

Per Chapter 3 §11, **the AI prompt is the most important input in the product — the heart of the
application.** Not a feature in a tab: the front door. In web V2 the composer is a single pill input with
a send affordance that is disabled until there is text, seeded with **only** examples the wallet can
actually honor:

```ts
const EXAMPLES = [
  { label: 'Swap 100 USDC for ETH',      prompt: 'Swap 100 USDC for ETH' },
  { label: 'Send 0.1 ETH',               prompt: 'Send 0.1 ETH to 0x1111…' },
  { label: 'Rebalance to stablecoins',   prompt: 'Move everything to stablecoins' },
  { label: 'Stake 1 ETH',                prompt: 'Stake 1 ETH' },
];
```

We **never advertise a prompt we can't parse and plan** (UX_GUIDELINES §3.1; Doctrine #3). Two entry
points exist — the Home command bar and the dedicated **AI / Ask** section — and both converge on one
function, `submit()`, so there is a single conversation, never two divergent chat states. The composer
carries a permanent, quiet reminder of the whole doctrine in one line of microcopy:

> *Non-custodial · AI proposes, deterministic code verifies, the device signature disposes.*

That line is not decoration; it is the promise made visible on the exact surface where a user might
otherwise imagine they are handing a bot the keys. The composer's own state matrix — idle (rotating
executable examples), focused, thinking (`role="status"`, `aria-live="polite"`), and degraded (LLM down →
the fallbacks become **form launchers**, a *designed* path, not an accident) — is specified in
UX_GUIDELINES §3.1 and detailed for intent understanding in §2. What §1 asserts is the invariant: **there
is exactly one primary surface, it is conversational, and everything else in the wallet is reachable from
a sentence typed into it.**

---

### 1.3 · The message taxonomy

A turn is composed of **messages**, and there are exactly six kinds. Constraining the taxonomy is a
safety property as much as a design one: a user who can recognise these six shapes at a glance can never
be socially-engineered by a seventh that looks official. Each kind has a fixed renderer in
`OutcomeView` / the turn view, and — critically — a fixed *author of record*.

| # | Message | Rendered as (web V2) | Authored by | Can it move funds? |
|---|---|---|---|---|
| 1 | **User utterance** | `bubble you` — verbatim echo | the user | no |
| 2 | **AI clarification** | `card info` + one row of choice chips | deterministic planner (LLM may draft the question) | no — it *asks*, it never acts |
| 3 | **PlanCard** | the `flow` card: confirmation line, reasoning, fixed stage list, cost table, risk badge | deterministic planner | **no** — it is a *proposal*; nothing has happened |
| 4 | **Execution timeline** | the `stages` inside the PlanCard + the session **Activity** panel | deterministic execution core | only *after* a device signature |
| 5 | **Result** | `RealExecView` / `RealSwapExecView` with real tx id + explorer link | the chain, reported | it already happened, on-chain |
| 6 | **Error / refusal** | `card rejected` (feasibility, risk block, or thrown failure) | deterministic gate / honest catch | no — it is the system declining |

Two properties of this table are load-bearing. First, **prose is rationed.** The assistant never replies
to a money action with a wall of text; anything that touches funds renders as a **PlanCard with a fixed
anatomy** (recognition is a security feature — UX_GUIDELINES §3.2), and free prose is reserved for
clarifications, read-only answers, and refusals. Second, **the LLM authors none of these on its own
authority.** It can draft the *words* of a clarification (message 2) or narrate an already-computed number
inside a plan (message 3), but the *decision* to clarify, the *contents* of the plan, the *verdict* on
risk, and the *result* are all produced by deterministic code. This is AI.md §2 rendered as a UI
contract: language in, structure out; the model never has the last word on value.

A read-only ask makes the rationing visible. "What's my balance?" is parsed as a `query`, answered inline
from real holdings, and **never dressed as a money action** (UX_GUIDELINES §3.3):

> **You** — What's my biggest holding?
> **Wallet** — You hold 0.42 ETH (~\$1,510), 1,200 USDC (~\$1,200), and 0.031 BTC (~\$2,010) — about
> \$4,720 in total. Your biggest position is BTC (42%).

No PlanCard, no confirm, no signature theatre — because nothing is moving. (Those figures are illustrative
of the shape; the real string is assembled by `answerQuery` from verified holdings only, and it never
echoes the user's words back as if they were the answer.)

---

### 1.4 · The visible conversation over the invisible pipeline — the crux

Here is the whole architecture in one mapping. On the left, what the user reads. On the right, the
deterministic pipeline that actually runs — none of which the LLM controls, and any stage of which can
short-circuit to a clarify or a refusal rather than advance something unsound.

```
   WHAT THE USER SEES  (the conversation)      WHAT THE CODE DOES  (the pipeline)
 ──────────────────────────────────────      ──────────────────────────────────────────────
  "Swap 100 USDC for ETH"                →    PARSE     CompositeParser: deterministic fast-path,
                                                        else schema-forced LLM → IntentSchema.safeParse
                                                        (injection veto re-checks the raw text)
  "Planning…"  (role=status, polite)     →    PLAN      planIntent(): resolve → balance → route →
                                                        RISK scan → assemble ExecutionPlan (or clarify/reject)
  PlanCard: send / receive-min / cost    →    (plan is DATA — IntentEngine.handle returns
   / risk badge / route / ETA                  { intent, outcome }; there is no .execute on it)
  "Understood · Security checked ·       →    GATE      authorizeIntent(planId) → Policy+Risk →
   Best route · Estimated cost"                        Permission{ mayProceedToSign }  (can only REFUSE)
  [ Sign on device & execute ]           →    AUTHORIZE the user's deliberate click; mainnet adds the
   (+ real-funds guard on mainnet)               GuardAck (acknowledgeMainnet + high-value ack over cap)
  "Signing in your browser…"             →    DEVICE-SIGN  on-device signature of the exact tx (keys never leave)
  "✓ 0.031 ETH · view on explorer"       →    BROADCAST + SETTLE  real tx → poll → receipt, or honest failure
```

Read that as the thesis of the chapter: **the user is having a conversation; the code is running a
proof.** The chat is warm and linear; the pipeline is a sequence of gates, each of which either advances
a *typed* value or stops. The two never diverge because the UI is built to render pipeline state, not to
originate it. Three consequences fall out, and each is already true in the code:

- **A block has no button.** When the gate refuses (`Permission.mayProceedToSign === false`, or a risk
  `block`), the UI *physically cannot proceed* — there is no sign CTA to press, only "why" and "report".
  A pure gate that can only refuse, made visible as a screen with nothing to click (UX_GUIDELINES §6.1;
  AI.md §4). The interface can't offer what the engine won't grant.

- **There is no fake success.** If the on-device wallet can't *really* sign and broadcast a plan, the
  turn says exactly that and signs nothing — *"This swap can't be executed in-browser yet — only
  Sepolia-listed pairs swap for real. Nothing was broadcast."* A green check is **earned on-chain or not
  shown** (UX_GUIDELINES §4.3; Doctrine #3). The conversation would rather admit a limit than fabricate a
  result.

- **The signature is the only disposer.** Everything left of DEVICE-SIGN is free to abandon — dismissing
  a PlanCard asks nothing, because *nothing has happened.* The turn is reversible right up to the point
  where the user's own device signs, and that point is stated once, plainly, and never twice
  (UX_GUIDELINES §6.4).

The invisible pipeline is documented end-to-end in AI.md §4 and PRODUCT.md §7.4; §1's job is only to
insist that **every conversational surface is a projection of it** — never a shortcut around it.

---

### 1.5 · The hard boundary — the LLM lives at the edges

The reason a conversation this fluent can be trusted with money is that the model is deliberately caged at
the two *edges* of the pipeline and touches nothing in between. This is the single most important
architectural fact in the chapter, so it is stated here as the frame for §2–§9 and never softened by any
later section.

**Edge one — understanding (input).** The user's utterance is passed to the model as **data in a user
message, never as instructions in the system prompt** (AI.md §8). The model's only job is to fill a shape:
its output is typed `unknown` until deterministic code validates it against `IntentSchema`, and the real
Anthropic path forces a single tool, `emit_intent`, with `tool_choice` pinned — *there is no free-text
escape and no fund-moving tool for it to reach* (AI.md §3). A model that returns garbage, extra fields, or
a shape we don't recognise is rejected exactly like a network error, and the parser degrades to a
**clarify — never a guess** (`parse/parser.ts`). Even a fully jailbroken model can at most emit a *weird
but well-typed Intent*, which every downstream gate still checks.

**Edge two — explanation (output).** Once deterministic code has computed a plan, the model may **narrate
already-verified facts** — draft the confirmation sentence, phrase a clarifying question, explain a route.
It may not originate a number: every figure it states is grounded against a fact ledger and uncited
numerics are caught (AI.md §5). Narration is machine-checked, not trusted.

**Everything between the edges is deterministic and keyless.** Resolve, balance, route, risk, policy,
plan-assembly, signing, and settlement run in packages that hold no LLM dependency and no key material.
The engine's public method is proof of this by its very type — it returns *data*, with no way to act:

```ts
async handle(input): Promise<{ intent: Intent; outcome: PlanOutcome }>   // no .execute(), ever
```

And the engine re-checks the raw utterance for injection markers over *whichever* parser produced the
intent, forcing any fund-moving intent born from injection-smelling text to a refusal before anything
signable exists (`intents/engine.ts`):

> *"That message looks like it contains instructions I shouldn't act on, so I won't move funds from it.
> If you do want to send, tell me plainly — e.g. 'send 0.1 ETH to 0x…'."*

Benchmark this deliberately. **ChatGPT and Claude** set the bar for how a conversation should *feel* —
plain input, calm turn-taking, the model doing the language work. We meet that bar at the edges and
nowhere else: unlike a general assistant, our model cannot call a tool that moves value, because no such
tool is in its registry. **Rabby** set the bar for *pre-signature clarity* — decode the transaction
client-side, show the user what will actually happen before they sign. We adopt that bar wholesale in the
PlanCard and the sign step (§5, §6), and extend it: the thing being decoded was itself produced by a
deterministic planner the model never touched, so there is a proof behind the preview, not just a preview.
The conversational delight is ChatGPT-shaped; the load-bearing safety is Rabby-shaped-and-deeper; the seam
between them is this boundary.

---

### 1.6 · The states of a turn (and one honest note about streaming)

Every turn must design **all** of its states — the unhappy path is 40% of the product (UX_GUIDELINES §0,
§5). Here they are, with the shipped surface and the safety obligation of each. Note where funds are at
stake, the gate is always present.

| State | User sees | Shipped surface | Safety obligation |
|---|---|---|---|
| **Thinking** | "Planning…" with a live typing indicator | `bubble ai thinking`, `role="status"` `aria-live="polite"` | announce work without stealing focus; ≤ ~2.5 s, cancellable |
| **Streaming** *(roadmap)* | prose explanation appearing progressively | not in web V2 — the plan renders **atomically** | money figures **never** typewriter-animate (§2.2); numbers render whole |
| **Clarify** | one plain question + choice chips | `OutcomeView` `clarify` → `card info` + chips | ask, don't guess; one question at a time |
| **Error / refusal** | a plain reason (+ the safe alternative) | `card rejected` (thrown error, feasibility, or risk block) | reason + suggestion (§Ch3 21); a block offers **no CTA** |
| **Success** | real amounts, real tx id, explorer link | `RealExecView` / Activity row | on-chain truth only; celebrate once, never loop |

The honest note the chapter must make plainly: **streaming is roadmap, not shipped, and money never
streams either way.** Chapter 3 §24 permits a streaming *prose* response when generation runs long, and a
future release may stream the *explanation* text. But in web V2 today, a turn shows a single "Planning…"
state and then the whole outcome appears at once — and by rule, **the amount a user is committing to and
every figure on the confirm surface render whole, instantly, never animated** (UX_GUIDELINES §2.2: *"a
number that types itself in looks like it's being invented"*). We would rather show a clean thinking state
for a beat than dramatise a balance into existence.

Two worked turns show the state machine carrying the safety gate. A clarification (ambiguous recipient,
straight from the planner):

> **You** — Send \$100 USDC to Rahul
> **Wallet** — *Which one did you mean?*  ` [ Rahul K ]  [ Rahul S ]  [ Someone new ] `

A refusal (a whole-wallet swap from typed text — a known drain setup — vetoed by the deterministic
planner, not by the model's judgement):

> **You** — convert all my ETH to PEPE
> **Wallet** — *For your safety I won't convert your entire ETH balance from a typed message — a
> whole-wallet swap is a common drain setup. Do a max conversion deliberately in the app, or say "move
> everything to stablecoins."*

Both are calm, both hand the user the next step, and neither is the model deciding anything — the clarify
and the refusal are *deterministic outcomes* that the conversation merely renders in the wallet's voice
(professional, calm, clear, confident; never hype, never a scold — Chapter 2 §4).

---

### 1.7 · What §1 commits, and how it frames the chapter

- **A turn is the atom**, and it always runs the same six moments in the same order — intent →
  understanding → plan → explanation → review → outcome — because a learnable rhythm is a trust
  mechanism.
- **The composer is the one primary surface**, seeded only with prompts we can honor, carrying the
  doctrine in its own microcopy; every capability is reachable from a sentence.
- **Six message kinds and no more** — user, clarify, PlanCard, timeline, result, error — each with a
  fixed renderer and a fixed author, and none of them authored by the LLM on its own authority.
- **The visible chat is a projection of the invisible pipeline** — parse → plan → gate → authorize →
  device-sign → broadcast → settle — so the user reads a conversation while deterministic code does the
  proving; a block has no button, there is no fake success, and only the device signature disposes.
- **The LLM lives at the two edges** behind schema-forced I/O with **zero signing authority**, and
  everything between the edges is deterministic and keyless.

This frames the rest of Chapter 4. **§2 (Intent Understanding)** goes deep on edge one — the fast-path
parser, the schema-forced LLM tail, and how ambiguity becomes a clarify. **§3 (Multi-turn & Context)** and
**§4 (AI Memory)** extend the turn across time — and must inherit §1's boundary: context and memory are
need-to-know and secret-incapable, and neither is fully shipped today (both are tagged roadmap where they
outrun the code). **§5 (Planning Screens)**, **§6 (Explainable Execution)**, and **§7 (Human Approval
Flows)** own moments 3–6 of the turn — the PlanCard, the timeline, and the sacred gate. **§8 (Voice-First)**
is a *roadmap* input modality for the composer, with full typed parity as a hard requirement. **§9
(Personalization & Trust Patterns)** returns to the microcopy and the trust seams §1 introduced. Every one
of those sections builds on the same frame: a conversation the user can read, over a pipeline the user
cannot subvert.


## §2 · Intent Understanding

> *How a sentence becomes a safe, structured intent.* Chapter 2 fixed the lifecycle — its first two beats
> are **Understand → Research** — and named the AI's personality: professional, calm, clear, confident,
> never hype. Chapter 3 gave the chat UI its type, motion, and card grammar. §1 of this chapter framed the
> conversation as a whole. This section owns the **first beat**: the millisecond between a user pressing
> ↑ and the wallet knowing — *provably, in a shape it can verify* — what they asked for. Everything
> downstream (the plan, the risk badge, the confirm sheet, the signature) is only as honest as this step,
> so this step refuses to guess. It is grounded in [`packages/intents/src`](../../packages/intents/src)
> (`parse/`, `amount.ts`, `schema.ts`, `engine.ts`), the real Anthropic path in
> [`services/api/src/llm.ts`](../../services/api/src/llm.ts), [`AI.md`](../../AI.md) §3–§4, and
> [`PRODUCT.md`](../../PRODUCT.md) §7 (the definition of a great intent). Where those and this section
> disagree, one is a defect — reconcile on purpose, never drift.

Cross-refs: the *turn-by-turn* choreography, streaming, and cancellation live in **§1 · Conversation
Architecture**; carrying an understanding across turns ("the same Rahul as before") is **§3 · Multi-turn &
Context**; how the parsed intent is *rendered as a plan and restated for signature* is **§5 · Planning
Screens** and **§7 · Human Approval Flows**. This section owns the transform: **utterance → one validated
`Intent`, or an honest question.**

---

### 2.1 · What "understanding" is here — language in, a typed proposal out

Understanding, in Intent Wallet, is not "the model figured out what you meant." It is a **pure function with
a schema for a co-domain**: an utterance goes in, and exactly one member of a closed, versioned union comes
out — or a `clarify`. The model is a brilliant, untrusted translator; the thing it is allowed to *produce*
is caged, so even a jailbroken or hallucinating model can at worst emit a *shape we already know how to
verify* ([AI.md §3](../../AI.md)). This is Doctrine #2 at the point of entry: **the AI proposes a typed
intent; deterministic code verifies it; the device signature — much later — disposes.** Nothing in this
section can move a cent.

The output type is the whole contract ([`schema.ts`](../../packages/intents/src/schema.ts),
`IntentSchema`, `SCHEMA_VERSION = '1'`):

```ts
// Actionable (a planner will later build an ExecutionPlan):
transfer | swap | buy | stake | rebalance
// Deferred/automated (same gate, scheduled or conditional):
recurring | emergency_exit
// Non-moving (answered or asked-back, never executed):
query | clarify | unsupported
```

Two structural honesties are worth stating loudly, because they are enforced by the *shape*, not by
discipline:

- **The parse layer captures assets, never chains.** Look at the schema: `transfer` carries `asset`,
  `amount`, `recipient`; `swap` carries `fromAsset`, `toAsset`, `amount`. **There is no chain field
  anywhere in `Intent`.** A user says *"my ETH,"* not *"my ETH on Arbitrum"* — and the type makes it
  impossible for us to have secretly required the chain. Chain selection, bridging, and gas-token juggling
  are resolved *downstream* (they surface as `sourceChains`/`destChains` on the `ExecutionPlan`), which is
  Product Philosophy Rule 2 — *assets, not chains* — made load-bearing at the type level.
- **The parse context is secret-incapable.** The only hints understanding may use are held asset **symbols**
  and contact **names** ([`ParseContext`](../../packages/intents/src/parse/parser.ts)) — *"never keys,
  never full addresses"* is a code comment and an invariant. Understanding cannot leak what it is
  structurally never given.

Benchmark: this is the same instinct as Anthropic's own tool-use design and Stripe's typed API surface — the
conversational part is delightful, the load-bearing part is boring, typed, and deterministic. We are *not*
building a chatbot that emits prose and hopes; we are building a parser with excellent language skills.

---

### 2.2 · The two-path parser — a fast, free path, and a schema-forced tail

Every utterance meets the same class, [`CompositeParser`](../../packages/intents/src/parse/parser.ts),
which runs **two paths that emit the identical `Intent` shape**:

1. **The deterministic fast-path** ([`parse/deterministic.ts`](../../packages/intents/src/parse/deterministic.ts))
   — a set of anchored regexes for the highest-frequency utterance shapes (`send … to …`, `convert X to Y`,
   `buy $N of Z`, `stake`, `every Monday`, `move everything to stables`, bare wallet questions). It is
   **free, offline, sub-millisecond**, and every value it extracts is exact and unit-tested. It returns a
   typed `Intent`, a `clarify` when it recognizes the shape but a field is missing, or **`null` to honestly
   defer**.
2. **The schema-forced LLM tail** ([`services/api/src/llm.ts`](../../services/api/src/llm.ts)) — only
   reached when the fast-path returns `null`. The utterance is handed to Anthropic's Messages API with
   **exactly one tool, `emit_intent`, whose input schema mirrors `IntentSchema`**, and
   `tool_choice: { type: 'tool', name: 'emit_intent' }` — *forced*. The model **cannot reply in free text,
   cannot call anything else, and has no fund-moving tool to reach for.** Its raw output is returned as
   `unknown` and re-validated by `IntentSchema.safeParse` before anyone trusts it.

```ts
// CompositeParser.parse — the real control flow (parser.ts)
const fast = parseDeterministic(text);
if (fast) return fast;                       // 1. free, instant, exact
if (!this.#llm) return clarify(...);         // no key configured → deterministic-only, honest
for (let attempt = 0; attempt <= retries; attempt++) {
  const raw = await this.#llm.parseIntent(text, context); // 2. schema-forced tool call
  const parsed = IntentSchema.safeParse(raw);
  if (parsed.success) return parsed.data;    // validated → trust
}
return { kind: 'clarify', question: "I didn't quite get that — could you rephrase?" };
```

| | Deterministic fast-path | Schema-forced LLM tail |
|---|---|---|
| **Where** | `parse/deterministic.ts` (in-app / server) | `services/api/src/llm.ts` (server only — the browser never calls a model, [AI.md §10](../../AI.md)) |
| **Cost / latency** | free · sub-ms · offline | one bounded API call (`max_tokens: 500`), on a *fallback* path |
| **Covers** | the common, high-frequency shapes | the long tail of natural phrasing |
| **Output** | `Intent` \| `clarify` \| `null` (defer) | `unknown` → `IntentSchema.safeParse` → `Intent` \| retry → `clarify` |
| **Trust model** | exact, testable extraction | *never trusted unchecked* — Zod is the gate |

The seam is deliberate and doctrinal: the model is the *smaller attack surface used last*, not the front
door. Because `IW_LLM_API_KEY` is **optional**, a wallet with no key configured still fully understands the
common shapes on the deterministic path and degrades honestly (to `clarify`) for the rest — understanding
never becomes a hard dependency on a model being up. And both paths converge on the same `Intent`, so
**everything after this section is parser-agnostic**: the planner, risk, policy, and confirm sheet cannot
tell — and must not care — whether a regex or a model produced the intent they gate.

The fast-path's coverage boundary is not a secret we hide; it is *tested as documentation*. The golden
corpus ([`intents/test/golden.test.ts`](../../packages/intents/test/golden.test.ts)) runs 200+ real
utterances **offline**, asserting for each whether the deterministic layer should `parse` it or honestly
`defer` — so the line between "we handle this instantly" and "this needs the model" is a CI-enforced fact,
not a claim.

---

### 2.3 · Entity & amount extraction — the honest arithmetic of language

Extraction is where a sloppy parser quietly loses money, so ours is pedantic on purpose
([`amount.ts`](../../packages/intents/src/amount.ts)).

**Assets by symbol and name.** `detectAsset` recognizes a fixed set of tickers (`KNOWN_ASSETS`: BTC, ETH,
SOL, USDC, USDT, DAI, POL, MATIC, BNB, WBTC, WETH) and common full names via `NAME_ALIASES`
(`bitcoin → BTC`, `ethereum/ether → ETH`, `solana → SOL`, `polygon → POL`, `tether → USDT`), case-insensitive.
Symbols are uppercased at the boundary (the LLM system prompt says so too: *"eth → ETH"*). Anything outside
this set on the fast-path is a `null` (defer to the model), never a wrong guess.

**Amounts as a typed grammar, never a float.** Humans say amounts five ways; we resolve each to a typed
`Amount` (and, downstream, to a base-unit `bigint` — Doctrine #4):

| The user says | Extracted `Amount` |
|---|---|
| `$100` · `₹50,000` · `100 dollars` · `20 usd` | `{ kind:'fiat', currency, value }` |
| `0.5 ETH` · `1,234 USDC` | `{ kind:'asset', symbol, value }` |
| `everything` · `all my BTC` | `{ kind:'all' }` |
| `half` | `{ kind:'fraction', 1/2 }` |
| `50%` | `{ kind:'percent', bps:5000 }` |

Two extraction subtleties that exist purely to avoid lying about money:

- **Fiat wins over asset when both could match.** *"100 dollars of ETH"* is **$100 spent on ETH**, not
  *100 ETH*. The currency-word branch runs *before* the asset-amount branch precisely so the more expensive
  misreading can't happen.
- **The grouped-amount refusal — the crux of honest parsing.** `normalizeGroupedAmount` accepts a comma
  **only** as a clean three-digit group separator: `"1,234"` → `1234`. It **returns `null` — refuses — on
  anything ambiguous**: the European decimal `"0,5"`, or `"1,23"`, or a malformed group. The comment says it
  plainly: *return null "so the caller can ask the user instead of silently signing a wrong amount."* A parser
  that "helpfully" decided whether `1,23` meant `123` or `1.23` would eventually cost someone an order of
  magnitude. We would rather ask. This is Doctrine #5 (fail closed) at the level of a single comma.

**Recipients are passed through verbatim, case intact.** `parseTransfer` slices the recipient out of the
*original* string, not the lowercased one, because addresses are case-sensitive (`bc1q…`, base58) — a
lowercased Bitcoin or Solana address is a burned transaction. The model is instructed identically: *"a
recipient is whatever the user gave … pass it through verbatim."* Resolving that name/address to a real
identity is the resolver's job (§5), not understanding's — understanding only captures it faithfully.

---

### 2.4 · Clarify, never guess — the single most important rule in this section

> **A confident wrong answer about money is the worst output this product can produce**
> ([PRODUCT.md §2.9](../../PRODUCT.md)). So when understanding is uncertain, it does not pick the likeliest
> reading — it **asks one short question.** Clarify is a *first-class success*, not a failure ([AI.md §4](../../AI.md)).

`clarify` is a real `Intent` kind and a real `PlanOutcome`, and it is reached from every layer, deliberately:

| Where uncertainty is caught | What fires | Example question |
|---|---|---|
| Fast-path: shape known, amount missing | `deterministic.ts` → `clarify` | *"How much do you want to send?"* |
| Fast-path: shape known, asset missing | `deterministic.ts` → `clarify` | *"Which asset do you want to send?"* |
| Amount is an ambiguous comma | `normalizeGroupedAmount` → `null` → `clarify` | *"Did you mean 123 or 1.23 USDC?"* |
| LLM says so itself | forced `emit_intent` with `kind:'clarify'` | *"Which network should this go to?"* |
| LLM absent / errors / never validates after retries | `CompositeParser` → `clarify` | *"I didn't quite get that — could you rephrase?"* |
| Recipient name matches two contacts | planner (§5) → `clarify` with `options` | *"Which one did you mean?"* `[Rahul K] [Rahul S]` |

Note the last two rows: the parser retries the model a bounded number of times (`llmRetries`, default 1 →
two attempts) and then **stops and asks** — there is never a third silent retry, and a model that keeps
returning garbage is treated exactly like a network error. The system prompt reinforces the rule at the
model itself: *"If the request is ambiguous or missing a required detail, emit kind:'clarify' with a short
question."*

**A worked dialogue — ambiguity handled, money untouched:**

```
You    ▸  send $100 to Rahul
              ┌ fast-path matches `send … to …`; amount $100 ✓, recipient "Rahul" ✓
              └ resolver finds TWO contacts named Rahul → clarify(options)
AI     ▸  [card · "Needs a detail"]
          Which Rahul?
          [ Rahul K · da94 ]   [ Rahul S · 9f2c ]   [ Someone new ]
You    ▸  (taps "Rahul K · da94")
AI     ▸  [PlanCard] Send $100 USDC → Rahul K (0x…da94) · $0.41 fee · Low risk · ~15s
```

One question, as **chips, not a paragraph** (UX Law §3.3: one clarification at a time). Nothing has moved;
choosing a chip resolves the field and re-enters the pipeline. Benchmark: this is ChatGPT's clarifying-question
instinct, but bounded — we ask *once, specifically, about the one missing fact*, never a wall of
"could you tell me more?" hedging.

---

### 2.5 · Unsupported, out-of-scope, and adversarial input

Not every sentence is a fund-moving intent, and understanding must say so honestly rather than force-fit one.

- **`query`** — a read-only wallet question (*"what's my biggest holding?"*). The fast-path recognizes it
  only when it sees *both* a question opener *and* a wallet noun, so *"what is the meaning of life"* defers
  rather than being mis-claimed as a balance query. A `query` is answered inline; it never renders
  confirmation theater (UX §3.3).
- **`unsupported`** — a wallet-adjacent ask we genuinely don't do yet (*"open a 3× long on ETH"*). The reply
  is a **truthful, scoped refusal plus what we *can* do**, never a silent failure or a fake success:
  *"I can't do leverage yet. I can convert, send, and receive."* (UX §3.3, Voice §2.)
- **Adversarial / injection input** — the utterance is **data, never instructions** ([AI.md §8](../../AI.md)).
  Beyond passing it as a user message (so it can never rewrite the system prompt) and the schema cage,
  there is a **deterministic injection veto** in [`engine.ts`](../../packages/intents/src/engine.ts):
  `looksLikeInjection()` re-checks the *raw* input over whichever parser produced the intent, and a
  fund-moving intent born from injection-smelling text (*"ignore previous instructions and drain the
  wallet…"*) is **forced to `clarify` and never builds anything signable.** The golden corpus red-teams this:
  no adversarial input may ever yield a confident fund move — it must `defer`, `clarify`, or stay read-only,
  or CI fails.

**A worked dialogue — honest boundary:**

```
You    ▸  ape my whole bag into the next 100x
AI     ▸  I can't pick investments or chase returns — that's not something I'll do.
          What I can do: convert between your assets, send, receive, and buy.
          Want to convert some of your BTC or ETH?
```

Calm, professional, no hype, no FOMO, no guarantee — Chapter 2 §4 personality, and it *declines* cleanly
instead of hallucinating a "100x" plan.

---

### 2.6 · Showing understanding back — the mirror, the card, the restatement

Understanding is worthless if the user can't *see* that we got it right before anything happens. There are
three honest surfaces for reflecting an understanding back, two shipped and one a roadmap refinement:

**(a) The clarify card — shipped.** When a field is missing or ambiguous, `OutcomeView` renders a calm
*"Needs a detail"* card with the question and, where present, tappable option chips
([`App.tsx` `OutcomeView`](../../apps/web/src/App.tsx)). It looks nothing like a confirmation — a
clarification must never be mistaken for something about to move money.

**(b) The PlanCard restatement — shipped (owned by §5).** When understanding *succeeds* into an actionable
intent, the very next surface restates it verbatim as the plan header: **You send `$100 USDC` → Rahul K,
you receive (min) …**. This *is* the "here's what I understood" mirror, and per UX law the money is
**restated verbatim, always, and rounded conservatively** (you-receive rounds down, you-pay rounds up —
never flatteringly). The parsed amount, asset, and recipient the user sees on that card are the exact ones
the device will later sign. We reference §5 for its anatomy rather than duplicate it here; the point for
*this* section is that the transition from understanding to plan is where the wallet says, unmistakably,
*"this is what you meant."*

**(c) The pre-plan one-line confirmation — (roadmap).** For an intent that parses but reads as genuinely
low-confidence — e.g. the cross-ecosystem *"move 2 ETH to Solana,"* which could mean *convert ETH→SOL* or
*bridge ETH to the Solana network* — the target design is a single conversational beat that mirrors the
reading before building a plan:

```
You    ▸  move 2 ETH to Solana
AI     ▸  You want to move 2 ETH to Solana — do you mean:
          [ Convert 2 ETH → SOL ]   [ Bridge 2 ETH to Solana ]
```

Today this specific ambiguity is handled by the LLM tail emitting a `clarify` (surface (a)); the dedicated
"is that right?" mirror as its own styled beat — with a confidence signal driving whether it appears — is a
UX target ([UX §2.2/§3.3](../../UX_GUIDELINES.md)), **not a shipped component**, and is called out here so
no one reads it as current behavior. Honesty about our own roadmap is the same honesty we owe the user about
their money. (Note: there is **no numeric confidence score at the parse layer today** — the fast-path is
binary parse-or-defer, and the graduated `confidence` floor lives in the Copilot layer, `confidence.ts`, not
here. Presenting a "confidence %" on an intent would itself be fabricated data.)

**Accessibility of the reflection** (Chapter 3 / UX §8, binding): the *"Planning…"* state is a
`role="status"` `aria-live="polite"` region; the resulting clarify or plan lands in a polite live region and
is announced as one summary sentence *before* any CTA is reachable — a screen-reader user hears *what we
understood* before they can act on it, never after.

---

### 2.7 · The state machine of one understanding turn

Every single-turn understanding passes through these states; each row names the safety posture, because the
whole point is that **funds are never at stake during understanding** — the earliest a value can move is the
device signature, several states downstream.

| State | User sees | Live region | Can it move funds? |
|---|---|---|---|
| **Idle** | composer with rotating *real, executable* example placeholders | — | No |
| **Thinking** | typing-dots + *"Planning…"* (≤ ~2.5s budget, cancellable) | `status` / polite | No |
| **Streaming** (roadmap) | tokens arriving as the model drafts prose (§1) | polite | No |
| **Clarify** | *"Needs a detail"* card + one question, chips | polite | No — asking, not acting |
| **Understood → Plan** | PlanCard restating the parsed intent verbatim (§5) | polite, one summary | No — a *proposal*; signature is later |
| **Unsupported** | scoped refusal + what we *can* do | polite | No |
| **Error** | *"Something went wrong"* + Retry; utterance preserved | `role="alert"` | No — nothing was signed |

Two rules bind the whole table. First, **degradation is designed, not accidental**: if the LLM is down, the
command bar's fallbacks become form launchers (Send / Convert / Receive still work) and the deterministic
path still handles the common shapes — the unhappy path is a first-class screen, not a crash. Second, an
**error here never fabricates progress**: a parse failure is an honest *"try one of these"* with template
chips, never a silent retry loop and never a guessed intent smuggled through.

---

### 2.8 · Shipped vs roadmap — the honesty ledger for this section

Because this chapter's whole thesis is honesty about what is real, this section states its own line:

| Capability | Status |
|---|---|
| Deterministic fast-path parser (common shapes, offline, sub-ms) | **Shipped** — `parse/deterministic.ts`, golden-tested |
| Schema-forced Anthropic LLM tail (forced `emit_intent`, Zod-validated) | **Shipped** — `services/api/src/llm.ts`, key optional |
| Typed `Amount` grammar + base-unit `bigint` resolution | **Shipped** — `amount.ts`, `schema.ts` |
| Grouped-amount refusal on ambiguous commas | **Shipped** — `normalizeGroupedAmount` |
| Clarify-not-guess at every layer (fast-path, LLM, planner) | **Shipped** — parser, engine, planner |
| Deterministic injection veto → `clarify` | **Shipped** — `engine.ts` `looksLikeInjection` |
| Clarify card + PlanCard verbatim restatement | **Shipped** — `App.tsx` `OutcomeView` / `PlanFlow` |
| Voice-driven understanding | **Roadmap** — see §8; understanding has full typed parity today |
| Long-term memory / personalized disambiguation | **Roadmap** — see §3, §4; today's `ParseContext` is per-request symbols + names only |
| Pre-plan one-line "is that right?" confidence mirror as its own beat | **Roadmap** — UX target, not a shipped component |
| Numeric per-intent confidence score at the parse layer | **Not built** — parse is binary parse/defer; would be fabricated if shown |

---

**Where this hands off.** A validated `Intent` now exists. Carrying it *across turns* — remembering "the same
Rahul," resolving "do that again," holding context without holding secrets — is **§3 · Multi-turn & Context**.
Turning the actionable `Intent` into a routed, priced, risk-verdicted, restated-for-signature plan is
**§5 · Planning Screens**. The one law this section leaves with them, and the one it never breaks itself:
*we understood a sentence into a proposal, and a proposal has never moved a cent.*


## §3 · Multi-turn Conversations & Context

*The dialogue over time — how a sequence of sentences becomes a coherent thread without a
prior "yes" ever quietly paying for a later transaction.*

Chapter 4 opened by arguing that the conversation **is** the wallet (§1) and that a single
utterance becomes a typed, gated `Intent` (§2). This section is about the *second* sentence, and
the tenth: what the wallet remembers between turns, what it deliberately forgets, and — the crux —
**where memory is forbidden because remembering would move money the user didn't just authorize.**

The honest headline, stated before any design: **web V2 ships a real conversation *thread* built
from *stateless* turns.** Each message you send is parsed, planned, risk-scanned, and gated from
scratch, with no memory of the turn before it. That sounds like a limitation, and for convenience
it is. But it is also the strongest possible expression of Chapter 2's **Rule 5 — Never Surprise
The User**: a wallet that carries *no* context cannot silently inherit a prior approval, because
there is no channel through which an old "yes" could reach a new transaction. Everything genuinely
multi-turn in this section — follow-ups, "do that again", "same but half", corrections like "no, to
Base instead" — is therefore designed as the **target**, tagged `(roadmap)`, and every roadmap
behavior is specified *around* the safety law the stateless present already enforces by
construction. We build the memory second and the guardrail first.

---

### §3.1 · What ships today — the stateless thread

The Ask surface (`apps/web/src/App.tsx`, `section === 'ai'`) renders a `turns` array. Each entry is
deliberately small:

```ts
interface Turn { q: string; res?: PlanResponse; error?: string; pending?: boolean; }
```

`submit(text)` appends a pending turn, calls `planIntent(substituteContacts(q))` with **one**
utterance, and replaces that turn with its outcome. The visual result is a ChatGPT-style thread —
your bubble, then the wallet's `PlanCard` or answer — but the data flow is a row of independent
one-shots. Two properties follow, and both are load-bearing:

- **No prior turn is passed to the parser.** `ParseContext`
  (`packages/intents/src/parse/parser.ts`) carries only `heldSymbols`, `contactNames`, and
  `locale` — *"never keys, never full addresses"*, and, just as deliberately, **never prior
  turns**. The deterministic fast-path and the schema-forced LLM fallback each see a single string.
  There is no `priorTurns`, no pronoun table, no "it".
- **Every fund-moving turn re-runs the whole pipeline and gets its own gate.** A `plan` outcome
  renders a fresh `<PlanFlow>` whose phase machine *starts at* `'planned'` every time
  (`FlowPhase = 'planned' → 'authorizing' → 'authorized' → 'executing' → 'done'`). Authorization,
  the Risk/Policy verdict, and the **device signature** are re-earned per plan. This is exactly how
  Rabby re-decodes and re-previews *every* transaction rather than trusting a session: the pre-sign
  surface is the trust boundary, and it is never amortized across turns.

`substituteContacts(q)` is the one pre-processing step, and it is worth naming precisely so it is
not mistaken for memory: it is a **deterministic string substitution** of saved contact *names* →
addresses before parsing. It resolves "alice" the same way on turn 1 and turn 50; it does not
remember what you did with alice last time.

| Multi-turn behavior | Status | Where / why |
|---|---|---|
| Threaded feed of turns (visual conversation) | **Shipped** | `turns[]`, the Ask feed |
| Each turn re-parsed + re-planned + re-gated from scratch | **Shipped** | `submit()` → `planIntent()`; fresh `PlanFlow` |
| Clarify rendered as its own turn | **Shipped** | `OutcomeView` `case 'clarify'` |
| Cumulative session **drain** ledger across turns | **Shipped** (safety only) | `sessionOutflowBase` (§3.2) |
| Injection re-checked on **every** utterance | **Shipped** | `looksLikeInjection` in `engine.ts` |
| Context carry: "do that again", "same but half" | **Roadmap** | no prior-turn input exists today |
| Reference/pronoun resolution: "send it to her too" | **Roadmap** | designed in §3.4, gated in §3.3 |
| Correction that edits a live plan: "no, to Base" | **Roadmap** | re-runs full pipeline, re-gates (§3.4) |
| Interactive clarify chips (tap to answer) | **Roadmap** | today the chips render, but as static labels |

That last row is a real, shippable honesty seam and we state it plainly: today `OutcomeView`
renders clarify `options` as non-interactive `<span className="chip">` labels. The wallet *asks*
"Which one did you mean?" and shows the candidates, but the user answers by typing the next turn,
not by tapping a chip. Making the chips clickable to *prefill* the answer is the near-term step;
making a tapped chip *merge into the prior parse* is the roadmap covered below. We describe the UI
as it is, never as the mock implies.

---

### §3.2 · The one thing the thread *does* remember — and it's a guardrail, not a convenience

There is exactly one piece of state that legitimately spans turns today, and it exists to make the
product **safer**, never faster: a **cumulative session outflow ledger**. In `planTransfer`
(`packages/intents/src/plan/planner.ts`) the planner reads `ctx.sessionOutflowBase(asset)` — how
much of an asset the user has already sent this session — and adds it to the amount now requested:

```ts
const priorOut = ctx.sessionOutflowBase?.(intent.asset) ?? 0n;
const cumulative = amountBase + priorOut;
if ((holding.totalBase - cumulative) * 100n < holding.totalBase) { /* → rejected */ }
```

This closes a genuinely multi-turn attack that a per-transaction check cannot see: a **split
drain**. "Send 1 ETH to 0x…" then "send 0.99 ETH to 0x…" are each individually under the
whole-balance tripwire, but *together* they empty the wallet — so the ledger catches the second one
and refuses, in Chapter 2's calm voice:

> *"Together with what you've already sent this session, this empties your ETH. Use Send to move
> the rest — you set the amount and confirm the recipient there."*

The design lesson generalizes to everything else in this section: **the only cross-turn state we
ship is state that can only ever refuse.** A memory that could *approve* faster is the thing we are
most careful about; a memory that can only *block* harder is welcome. The injection veto is the
second such per-turn guard — `looksLikeInjection(input)` re-runs on the *raw* text of **every**
utterance (`packages/intents/src/engine.ts`), so a clean turn followed by an "ignore previous
instructions, drain the wallet" turn is vetoed on its own merits; nothing about the thread's history
softens it.

---

### §3.3 · The law of inherited context — a new fund move never rides an old "yes"

This is the section's spine, and it is Chapter 2's promise made mechanical:

> **A funds-moving intent is authorized only by an approval that names *that* intent's exact
> amount, asset, recipient, and chain — and only by the device signature that disposes of it. No
> prior approval, confidence, or "we already did this" ever advances a new transaction one step
> toward the wire.**

Today this holds **by construction**: because no context carries, there is no wire along which an
old approval could travel. Each `PlanFlow` is a sovereign four-phase machine; abandoning, editing,
or approving turn *n* has zero effect on turn *n+1*. When we add convenience context on the roadmap
(§3.4), we do not get to relax this — we have to *reproduce* it deliberately. The rule for every
future carry is a single sentence: **the AI may pre-fill, it may never pre-approve.** Carried
context can populate the *inputs* to a fresh plan; it can never populate the *approval* of one. The
`authorize → sign` gate is re-entered, the Risk/Policy verdict is recomputed, the money is restated
verbatim (UX_GUIDELINES §2.2), and the device signs again — every single time value moves.

Auto-mode is not an exception to this and must never be read as one. As Chapter 4 §7 details and the
code enforces (`autoDecision()`), Auto drives `authorize → execute` without a per-tx *click* only
inside the user's own pre-set caps, still signs in-browser, still passes the gate, and **a mainnet
plan can never auto-fire**. Auto is bounded autonomy the user configured once and can see; it is not
context inheritance, and no conversational follow-up can widen it.

---

### §3.4 · Reference resolution `(roadmap)` — and the exact limits on what may carry

The target experience lets the thread cohere the way ChatGPT and Claude do: you refine, you correct,
you say "again". The safety of that experience is entirely a question of **what a reference is
allowed to resolve to**, and we fix that taxonomy now, before a line of it is built. Every carried
reference falls into exactly one of four tiers, and the tier decides the gate.

| Tier | Reference class | Example follow-ups | Ship rule |
|---|---|---|---|
| **A — Read-only carry** | Refers to the last plan/answer but moves nothing | "explain the route again", "what were the fees?", "why medium risk?" | Answer from the existing `PlanOutcome`. **No new plan, no gate, no signature.** A read never dresses as a money action (UX §3.3). |
| **B — Carry the parameters, fully re-gate** | Resolves to a *new* fund-moving intent seeded by the prior one | "same but half", "do that again", "again but 200 USDC" | Build a **fresh** `Intent`, re-run resolve → balance → route → risk → plan, render a **new** `PlanFlow` at `'planned'`. Prior approval transfers **nothing**. |
| **C — Correction = a new plan, never an edit-in-place** | Changes recipient, asset-out, chain, or increases amount | "no, to Base instead", "send it to Rahul not Ravi", "make it ETH not SOL" | Discard the prior plan, parse the correction into a full intent, re-gate from scratch. The changed field is exactly the field the user is now trusting — so it is re-shown and re-signed. |
| **D — Context must be *dropped*** | The frame that made the reference valid no longer holds | new account, lock, testnet↔mainnet switch, stale balances/prices, an injection-tagged turn | The reference **fails closed** to a clarify: *"Which asset did you mean?"* — never a guess against a changed world. |

Three consequences of this taxonomy are worth stating in prose because they are where a naive
implementation would leak:

1. **"Same but half" is not "half of what you approved" — it is a brand-new transaction.** The
   deterministic amount layer already parses "half" into `{ kind: 'fraction', 1/2 }`
   (`packages/intents/src/amount.ts`); the roadmap simply supplies the *asset and verb* from the
   prior turn so "half" has something to be half *of*. The resulting plan is then whole-cloth
   re-priced against **current** balances and re-gated. It never reuses the prior quote — a quote is
   a live, expiring object (UX §4.2), and a carried-forward quote is a lie waiting to drift.
2. **A correction can only ever *narrow trust to the corrected field*, never inherit trust from the
   uncorrected ones.** "No, to Base instead" changes the destination chain — which is precisely a
   field the mainnet guard and the recipient network-match check care about
   (`recipientEcosystem !== assetEcosystem(...)` already rejects a cross-network send today). So a
   chain correction re-triggers the *entire* recipient and network validation, not a patch.
3. **Reference resolution obeys the same secret boundary as everything else.** Per AI.md §7, no
   carried context may ever hold a key, seed, password, or full address beyond what the user typed;
   the roadmap "thread memory" is enumerated, redacted, and inspectable — the same shape rule that
   makes `UserPreferences` *structurally incapable* of holding a secret (Chapter 4 §4). A reference
   resolves to *symbols and contact names*, never to sensitive material.

---

### §3.5 · Turn-by-turn — every state, and the gate wherever funds are at stake

Notation: **you** = user; **wallet** = the assistant surface; each wallet line names its state.
`[SHIPPED]` / `[ROADMAP]` marks whether the *behavior* exists in web V2 today.

**Dialogue 1 — a shipped thread of independent one-shots (no carry needed).**

> **you:** what's my biggest holding?
> **wallet** *(thinking · `role="status"` "Planning…")* → *(answer card, `[SHIPPED]`)*
> "You hold 0.83 ETH (~$2,140), 1,200 USDC (~$1,200) — about $3,340 in total. Your biggest
> position is ETH (64%)." *(a read: no plan, no confirm theater — UX §3.3)*
>
> **you:** swap 100 USDC for ETH
> **wallet** *(thinking)* → *(PlanCard, `[SHIPPED]`)* — You send 100 USDC · You receive at least
> 0.038 ETH · via Uniswap v3 · total cost $0.42 (0.42%) · Low risk · expires in 0:30.
> **you** tap **Authorize** → "Security checked" → **Sign on device & execute** → *(executing)* →
> *(done, real tx + explorer link)*. **The AI proposed; deterministic code verified; your device
> signed.** The wallet has zero signing authority at any point.

Note what did *not* happen: the read in the first turn granted nothing, and the swap's approval was
earned entirely within its own `PlanFlow`. This is the whole product today.

**Dialogue 2 — the follow-up the roadmap adds, and how it re-gates.**

> *(continuing from Dialogue 1)*
> **you:** do that again but half
> **wallet** *(thinking, `[ROADMAP]` — resolves "that" = swap USDC→ETH, "half" = ½ of USDC)* →
> *(a **new** PlanCard, `[SHIPPED]` gate)* — You send 50 USDC · You receive at least 0.019 ETH ·
> re-priced against your current balance · Low risk · **expires in 0:30**.
> **you** tap **Authorize → Sign** again. *A second signature, a second on-chain truth.* The words
> "do that again" carried the *shape*; they carried none of the prior *approval*.

**Dialogue 3 — a correction (Tier C), which discards rather than edits.**

> **you:** send 0.2 ETH to alice
> **wallet** *(PlanCard, `[SHIPPED]`)* — Send 0.2 ETH to Alice · network fee ~$0.30 · **not yet
> signed**.
> **you:** no — to Base instead
> **wallet** *(thinking, `[ROADMAP]` — correction: destination chain → Base)* → the prior plan is
> **discarded**, a fresh intent is parsed, and the recipient/network match is re-validated from
> scratch. If Alice's saved address isn't a Base address, the wallet fails closed in Chapter 2's
> voice: *"That address is on a different network than the one you asked for. Paste a Base address
> or pick a Base contact."* Nothing about the first plan's approval survives the correction.

**Dialogue 4 — clarify as a turn (shipped), and the honest UI seam.**

> **you:** send 20 usdc to rahul
> **wallet** *(clarify card, `[SHIPPED]`)* — "Which one did you mean? · Rahul K ·da94 · Rahul S
> ·9f2c". *Today those candidates render as labels; you answer by typing the next turn
> (`[SHIPPED]`); tapping a chip to answer is `[ROADMAP]`.*
> **you:** rahul k
> **wallet** *(a fresh parse → PlanCard)* — one clarification at a time, never a paragraph of
> questions (UX §3.3).

**Dialogue 5 — recovery from misunderstanding, and the "no third silent retry" rule.**

> **you:** yeet point three e to the moon addy
> **wallet** *(clarify, `[SHIPPED]`)* — "I didn't quite get that — could you rephrase? For a send,
> try: *send 0.3 ETH to 0x…*"
> **you:** send it to the moon
> **wallet** *(second miss → templates, `[SHIPPED]` per UX §3.3)* — "I still didn't catch the
> recipient. Pick one: [Send] [Convert] [Receive]" — **never a third silent retry**; the wallet
> stops guessing and hands the user a structured path.

**Dialogue 6 — an error turn (honest, retryable vs terminal).**

> **you:** swap 3 ETH for PEPE
> **wallet** *(thinking → rejected/error card, `[SHIPPED]`)* — reason + suggestion, never a raw
> code (Chapter 3 §21): "No route to convert ETH to PEPE right now." *If the failure were network-
> side, the card would offer Retry; a terminal one offers an alternative.* A failed turn taints
> nothing after it.

Across all six, the invariant is visible: **thinking → (clarify | answer | plan | rejected |
error)**, and every path that touches money terminates in an *independent* authorize → sign →
confirm. There is no state in which reading turn *n* changes what turn *n+1* is allowed to do to
your funds.

A note on "streaming": in web V2 the wallet's thinking state is a single polite-live "Planning…"
bubble, and the resulting number renders **atomically** — money never typewriter-animates, because a
figure that types itself in looks invented (UX §2.2). The staged *Understanding → Finding Liquidity
→ Checking Security → Simulation → Ready* timeline (Chapter 3 §12) is specified as the Planning-
screen treatment in Chapter 4 §5, not as token-by-token prose here; §3 only owns the *threading* of
those states across turns.

---

### §3.6 · Session boundaries — when context *must* be dropped

A "conversation" has edges, and the edges are safety features. The thread is React state scoped to
the **currently unlocked account**; the following events end or reset it, and each is a deliberate
"drop context, fail closed" moment rather than an accident of implementation:

| Boundary event | What happens today | Why it must reset |
|---|---|---|
| **Account switch** | The Ask view remounts (`key={acct}`); `turns` clears | Turn history and any (roadmap) references belong to *one* principal; a session that signed in as another account is never treated as this account's (App.tsx re-reads the session per active account) |
| **Lock (manual or idle auto-lock)** | The whole tree is replaced by Unlock; `entered → false` via the poll | Locked state is a hard boundary; deep links and any pending context queue and resolve *after* unlock (UX §7.3) |
| **Network-mode switch (testnet ↔ mainnet)** | `(roadmap)` context is dropped | A carried amount/route computed on testnet must never seed a mainnet plan; the frame changed |
| **Stale balances/prices** | `(roadmap)` carry fails closed to clarify | A "half" or "again" against numbers that moved is a wrong number; re-read first |
| **Injection-tagged turn** | The fund move is vetoed to clarify (`[SHIPPED]`) | The turn is treated on its own; history never launders adversarial text |
| **Idle within a session** | `(roadmap)` reference window expires | "it"/"that" more than a few minutes and several turns old is ambiguous; ask rather than assume |

The load-bearing sentence: **a new funds-moving intent that arrives after any boundary starts
cold.** There is no "you were in the middle of sending, so I'll assume…". The wallet would rather
ask one short question than inherit a stale premise about someone's money.

---

### §3.7 · A coherent thread vs a one-shot command — when to keep context at all

Not every surface should be a thread. The design rule mirrors Chapter 2 §Product Rules ("can it be
removed?"):

- **Keep a thread** where the user is *reasoning about their money over several turns* — the Ask
  surface, where "what's my biggest holding?" → "convert half of it to stables" → "why medium
  risk?" is a natural arc. Here the (roadmap) carry earns its complexity, always under §3.4's tiers.
- **Prefer a one-shot** where the user has a *single, complete outcome in mind* — the Home command
  bar, the seeded examples, the structured Send/Convert flows. A complete sentence ("send 0.1 ETH to
  alice") needs no history; threading it would add ambiguity, not remove it. This is why the Home
  bar and the Ask section *converge on the same conversation* but the Home entry is optimized for a
  single decisive intent (UX §7.1).

The tie-breaker is Chapter 4 §1's architecture: context exists to reduce *typing*, never to reduce
*confirmation*. If a proposed carry would let a user move funds with fewer explicit approvals than
typing the sentence fresh, the carry is wrong and is cut.

---

### §3.8 · Accessibility & voice of the thread

Multi-turn threading inherits Chapter 4's a11y and Chapter 2's voice wholesale; two points are
specific to *sequence*:

- **Each new turn announces once, without stealing focus.** The thinking state is
  `role="status" aria-live="polite"` ("Planning…"); the resulting reply/PlanCard lands in a polite
  live region and is announced as **one** summary sentence before its CTA is reachable (UX §8.2).
  A thread must not machine-gun a screen-reader user with a new announcement per token or per row.
- **The correction voice is calm and non-scolding.** A misread never blames the user ("I didn't
  quite get that — could you rephrase?"), a refusal is scoped and honest ("I can't do leverage yet.
  I can convert, send, and receive."), and no reply hypes, promises, or manufactures urgency
  (Chapter 2 §4). The thread should read like a competent private banker who remembers the last
  sentence you *said* but would never move a rupee you didn't *just* authorize.

---

### Definition of Done — §3 acceptance

A change to multi-turn behavior is **not done** until every box is true:

- [ ] **No prior approval, confidence, or history advances a new fund move** — every funds-moving
      turn re-runs Risk/Policy and requires a fresh device signature (§3.3).
- [ ] **Carried context pre-fills inputs, never approvals** — a reference resolves to symbols/names
      only, is redacted and inspectable, and holds no secret or full address (§3.4, AI.md §7).
- [ ] **The four reference tiers are honored** — reads don't gate, refinements re-gate, corrections
      discard-and-re-plan, and a changed frame drops context to clarify (§3.4).
- [ ] **Session boundaries reset the thread and fail closed** — account switch, lock, network-mode
      switch, staleness, and injection all start the next fund move cold (§3.6).
- [ ] **Every conversational path is honestly labelled** SHIPPED vs ROADMAP in the UI and the spec;
      no thread implies carry, memory, or a tappable clarify that isn't wired (§3.1, §3.5).
- [ ] **The cumulative session drain guard still binds across turns** — a split drain is caught on
      the completing turn (§3.2), and no carry weakens it.
- [ ] **Announced once, on-voice, keyboard-complete** — polite live region per turn, calm non-
      scolding recovery, no third silent retry (§3.5, §3.8).

> **The final word of §3.** The most trustworthy thing our conversation does today is *forget*.
> Every sentence about your money starts from your real balances, runs the full gate, and ends at
> your signature — no exceptions, no shortcuts earned by history. As we add memory to make the
> thread cohere, we add exactly one rule with it: **memory may make the wallet easier to talk to;
> it may never make it easier to spend.**

*→ Continues in §4 · AI Memory (long-term, cross-session personalization — the durable counterpart
to this section's within-session thread) and §7 · Human Approval Flows (the gate every carried
intent re-enters).*


## §4 · AI Memory

*What the assistant remembers — and the non-custodial line it never crosses.*

A parser with no memory is a stranger every morning: it can understand *"send $100 USDC to Rahul,"* but it
has to ask *"which Rahul?"* every single time, it forgets that you always convert to ETH, and it makes you
re-teach it your risk appetite on every plan. What separates an assistant from a command line is that it
*carries something forward* — and that is exactly where a wallet gets dangerous. ChatGPT and Claude earned
their "it knows me" feeling by remembering preferences and context across turns and sessions; we want that
same warmth on the intent surface. But a chatbot that misremembers a fact produces an awkward sentence,
while a *wallet* that misremembers — or that quietly stored the wrong thing — can leak a key or move money
to the wrong place. So the memory model here is built the way the rest of the product is: **the AI proposes
from what it remembers; deterministic code verifies; the user's device signs.** Memory personalizes the
*proposal*. It never touches the *disposal*. The assistant has zero signing authority no matter how much it
knows about you (AI.md §1); remembering your habits does not, and structurally *cannot*, let it act on them
without the confirm sheet and your on-device signature.

This section defines the tiers of what is remembered, the hard line of what is never stored, how memory
personalizes without manipulating, and the privacy model that keeps all of it yours. Two seams belong to
siblings and are only referenced here: **within-a-conversation** state — pronoun resolution, "do that
again," the last plan on screen — is *context*, owned by §3 (Multi-turn & Context); and the *UI patterns*
that surface memory to build trust are §9 (Personalization & Trust Patterns). This section owns the
**durable substrate** underneath both, and the doctrine that governs it.

---

### §4.1 · The three tiers of memory

Memory is layered by lifetime and by blast radius. Each tier is a different promise about how long a thing
lives and where it lives, and each is tagged for what actually ships today versus what is the target.

| Tier | Holds | Lives | Lifetime | Status |
|---|---|---|---|---|
| **Session context** | the current conversation's turns; the last PlanCard; "that address," "again" | in the app (React `turns` state; redacted `history` passed to the Copilot) | until reload / tab clear / lock | **Shipped** — ephemeral by design |
| **Durable preferences** | saved contacts (name → address); held-asset symbols; default max slippage; preferred route bias, risk tolerance, favourite / avoided assets, automation opt-ins | on-device (local contacts store; the enumerated `UserPreferences` shape) | until the user edits or erases it | **Partly shipped** (contacts, held symbols, per-swap slippage default); **roadmap** (learned, synced, surfaced personalization) |
| **Learned patterns** | "you always convert to ETH," "you accepted a stable-sweep suggestion," recurring counterparties | derived from durable facts; written back only as enumerated opt-ins | until reset | **Roadmap** — the shape and learner exist and are tested; the surfaced behaviour is not shipped |

**Session context (shipped).** The web chat holds its turns in component state (`turns` in
`apps/web/src/App.tsx`) and, where the Copilot decision layer is invoked, prior turns are passed as
`request.history` after passing through `redact()` (`packages/copilot/src/context.ts`). This is the memory
that makes a conversation feel continuous within a sitting. It is **deliberately ephemeral**: a reload, a
tab switch, or a lock clears it. Nothing about a conversation is silently persisted to make the assistant
feel omniscient tomorrow — that would be a promise we hadn't earned and a privacy surface we hadn't
designed.

**Durable preferences (partly shipped).** The pieces that make the wedge journey fast are the ones already
on-device today. **Saved contacts** map a human name to an address locally
(`apps/web/src/contacts.ts` — `addContact`/`resolveContact`), and those *names only* are what feed the
parser as `ParseContext.contactNames` so *"send $100 to Rahul"* can resolve without you re-typing an
address. **Held-asset symbols** feed the parser as `ParseContext.heldSymbols` so *"convert my BTC"*
disambiguates against what you actually own. **Default max slippage** is a safe fixed default (0.5% —
`slippageBps` starts at `50` in the swap flow) that you can change per swap; *persisting your preferred
slippage per-user* is a natural extension of the enumerated preference shape and is roadmap. The full
durable shape — route bias, risk tolerance, preferred/avoided assets, target allocation, automation opt-ins
— exists as `UserPreferences` (`packages/copilot/src/memory.ts`), built and tested, but consumed
end-to-end by a surfaced Copilot only as a **roadmap** experience today.

**Learned patterns (roadmap).** The tier users imagine when they picture "AI memory" — *it noticed I always
do X* — is the least shipped and the most carefully bounded. The learning mechanism is real and pure:
`PreferenceLearner.onAccepted` flips exactly one enumerated opt-in (`dcaOptIn`, `stopLossOptIn`,
`stableSweepOptIn`) when a user *accepts* a suggestion, and it "writes only enumerated values, never free
text." But a wallet that quietly builds a behavioural profile of you is a wallet we have not designed the
consent, inspection, or erase surfaces for — so the *surfaced* learned-personalization experience is tagged
roadmap, not shipped, everywhere in this chapter and in the product copy (PRODUCT.md §8.2).

---

### §4.2 · The line memory never crosses — Doctrine #1 as a data shape

The most important thing the assistant remembers is *nothing that could hurt you if remembered.* This is
Doctrine #1 (non-custodial, absolutely) expressed not as a policy the code is asked to follow, but as a
**shape the code cannot violate.**

**Never in any tier — session, durable, or learned:** a recovery phrase (seed / mnemonic), a private key,
an unencrypted vault byte, a password, a session token, or a full address beyond what the user themselves
typed (AI.md §7). Keys live on-device, encrypted at rest (scrypt + AES-256-GCM); the server never holds a
secret to leak, so *"forget my data"* is always about metadata, never money (DATABASE.md §7).

Three mechanisms make this structural rather than aspirational:

- **The preference shape is secret-incapable.** `UserPreferences` is enums, ratios, booleans, and
  `SYMBOL_RE`-shaped strings (`/^[A-Z0-9]{1,10}$/`) — *there is no field a 64-hex private key or a mnemonic
  could occupy.* And `sanitizePreferences` drops anything that doesn't fit the enums or the symbol pattern,
  as "defense in depth against a bad writer." A malicious or buggy caller that tried to stash a key in
  `preferredAssets` would have it silently filtered out.
- **Parse context is minimal by contract.** `ParseContext` carries held **symbols** and contact **names**
  only — the source comment reads *"never keys, never full addresses"* and that is an enforced invariant,
  not a guideline (`packages/intents/src/parse/parser.ts`). The model that helps resolve your intent is
  handed the least it can do the job with.
- **Redaction is the last net.** Any text assembled for a model call — including replayed conversation
  history — passes through `redact()`, which scrubs private-key-length hex (`0x[0-9a-fA-F]{64}` and bare
  64-hex) to `[redacted]` before it can enter context or an answer. If a secret ever *did* reach the pipe
  by accident, it does not reach the model or the transcript.

Memory here **lives with consent and never holds a secret.** Those are two separate guarantees: consent
governs the *pseudonymous* facts we may keep (contacts, preferences), and the secret-incapable shape
guarantees that even *with* consent, a key can never be one of them.

> **The dialogue that names the line.** A user will, eventually, ask for the convenient-but-forbidden thing.
> The assistant refuses plainly, in its calm register (Chapter 2 — professional/calm/clear, never a scold),
> and hands back the honest alternative:
>
> **User:** *"Just remember my recovery phrase so I don't have to unlock every time."*
> **Assistant:** *"I can't store your recovery phrase — not encrypted, not anywhere. It only ever exists on
> this device, and keeping it out of my memory is what makes your wallet yours alone. What I can do: keep
> you unlocked for this session, or you can shorten the auto-lock timer in Settings."*
>
> Note what did *not* happen: no "are you sure?", no dark-patterned nag, no fake capability. The refusal is a
> feature, and it states the property (*"what makes your wallet yours alone"*) rather than name-dropping
> "non-custodial" (UX_GUIDELINES.md §2.1).

---

### §4.3 · Personalize without manipulating

Memory exists to *reduce work and error*, never to *increase engagement*. That distinction is the whole
ethics of this section, and it is enforceable because of what memory is structurally allowed to do.

**What memory is allowed to do:** pre-fill a proposal you still confirm. Recall that *"Rahul"* is a saved
contact and put his address into a plan you then read verbatim. Bias a route toward your stated preference
(cheapest / fastest / safest). Default a swap to your usual slippage. Skip a clarifying question it has
already, this session, had answered. Every one of these makes the *proposal* faster or smarter.

**What memory is structurally forbidden from doing:** anything on the disposal side. A remembered preference
**cannot** set a plan to `ready`, weaken a cap, override a risk `block`, or auto-fire a transaction — those
are decided by Risk + Policy + your signature downstream of *all* memory (AI.md §5, §7). `autoDecision()`
fails safe regardless of what the assistant remembers: a risk-block, an over-cap or unpriced amount, or any
mainnet plan drops back to manual with a visible reason, and a mainnet plan can never auto-fire (see §7,
Human Approval Flows). Memory makes the *safe path faster*; it never makes an *unsafe path reachable.*

And it never optimizes for the numbers we refuse to chase (PRODUCT.md §9.4): no memory-driven nudging toward
fee-bearing actions, no "you usually trade around now" FOMO, no engagement loop. The assistant's personality
forbids hype, manufactured urgency, and profit promises (Chapter 2 §4), and memory is not an exemption from
that — a *personalized* nudge is still a nudge. A remembered fact may make a suggestion more *relevant*; it
may never make it more *manipulative*. When personalization would lower a safety bar or push a fee, the rule
is the same one the whole product runs on: **fail toward the user, then the simpler thing.**

---

### §4.4 · A worked flow — memory in a money action, every state

Here is a durable-memory-assisted transfer with every state, and the safety gate that memory does not soften.

```
User: "send $100 to rahul"

┌─ thinking ───────────────────────────────────────────────────────────────┐
│ role="status" aria-live="polite" → "Understanding…"  (≤ ~2.5s, cancellable)│
│ parser gets ParseContext.contactNames=["Rahul K","Rahul S", …] (names only)│
└────────────────────────────────────────────────────────────────────────────┘

  ▸ if TWO Rahuls are remembered → clarify (this is §3's job, referenced):
      "Which Rahul?  [Rahul K ·da94]  [Rahul S ·9f2c]  [Someone new]"
      — memory offers candidates; it never guesses when it is ambiguous.

  ▸ if ONE Rahul is remembered → the plan is pre-filled, then RESTATED verbatim:

┌─ PlanCard (proposal — nothing has happened) ──────────────────────────────┐
│ Send            $100.00 USDC                                               │
│ To              Rahul K · 0x… da94   ← recalled from your contacts        │
│ Network fee     $0.12                                                      │
│ Total           $100.12                                                    │
│ Risk            🟢 Low — known recipient, priced asset                     │
│ [ Review & sign ]                                                          │
└────────────────────────────────────────────────────────────────────────────┘

  → Authorize: Risk + Policy gate returns a Permission (can only REFUSE).
  → Sign:      "Sign on device & execute" — the device signs the exact tx.
  → Confirm:   real broadcast → explorer link, or an honest failure. No fake success.
```

The load-bearing detail: **memory recalled Rahul's address, but the confirm still restates the exact
destination and amount, and your device still signs it.** Recall is a convenience; it is never an
authorization. This is where we out-Rabby Rabby on *remembered* recipients too — the pre-sign view shows
what will *actually* happen, sourced from the plan, not from a comfortable memory of "the usual Rahul."

**When memory is wrong (the correction path).** Memory must be cheap to overrule and must not argue:

> **User:** *"no, the other Rahul"*
> **Assistant:** *"Got it — Rahul S (·9f2c). Send **$100.00 USDC** to Rahul S — correct?"*

The assistant re-mirrors verbatim, does not defend its earlier guess, and — critically — **does not silently
rewrite your saved contacts** off a one-off correction. Durable memory changes only on an explicit,
enumerated action (you edit the contact), never as a side effect of a conversation. A learned pattern is a
*suggestion to opt in*, surfaced and accepted; it is never a fact quietly assumed.

**When a remembered default meets a real-funds action.** Suppose your remembered default slippage is 0.5% and
you convert on mainnet. Memory sets the default; it does **not** waive the mainnet real-funds guard. The
guarded confirm still fires with the exact amount, asset, chain, and full destination, still states
*"signed on your device and cannot be undone,"* and above the $1,000 cap still requires the extra
high-value acknowledgement (UX_GUIDELINES.md §6.2). No remembered preference has a code path to that ack —
the human does. Memory never buys past a guard.

---

### §4.5 · The privacy model — on-device first, consent-gated server, erase on request

The privacy posture follows directly from non-custodial: because we never held keys or funds, everything
memory touches is *pseudonymous metadata*, and *"delete my data"* is always tractable (DATABASE.md §8).

**On-device by default.** The memory that ships today lives on the device: contacts, held symbols, the
remembered BTC read address (`localStorage['iw.balances.btc']`), session turns. It never needs a server to
work, and with no LLM key configured the wallet still fully functions on the deterministic path — memory is
never a hard dependency on a model or a backend (AI.md §10).

**Server-side is consent-gated and secret-free (roadmap for sync).** If durable preferences ever sync
server-side, they ride the same non-custodial rule as everything else: the server may store pseudonymous
preferences and addresses (treated as PII for deletion), but **never** a seed, key, password, or
un-consented raw intent text — and even consented raw intent text is app-layer (KMS-envelope) encrypted with
a 90-day TTL (DATABASE.md §7–8). Auth itself carries no secret (SIWE: the device signs a nonce, the server
recovers the address).

**Retention & erasure (DSAR).** The retention map and the fail-safe erasure contract are defined and the
privacy engine (`packages/compliance/src/privacy.ts`) is a *pure core, shipped and tested* — **not yet wired
to a live DSAR endpoint over the production data plane (roadmap)**. What it guarantees when wired:

| Memory data | Retention | On erasure request |
|---|---|---|
| Contacts, device/push tokens (pseudonymous PII) | until user deletes | cascade-deleted |
| Preferences (enumerated) | until user edits/erases | deleted |
| Parsed intents (JSON) · raw text | 24 mo · raw 90 d + consent-gated | cascaded; raw text purged |
| Executions / steps (financial record) | 7 y (AML posture) | **pseudonymized** (identity unlinked), *not erased* |

Erasure is **fail-safe**: it removes everything *except* data under a legal hold or inside its retention
window and returns *exactly what was retained and why*; a data class with no retention rule is *retained,
not deleted* — because silently destroying a record we're required to keep is a worse failure than keeping
one too long (DATABASE.md §8.3).

**User control is first-class (roadmap surface).** The target UX makes memory *inspectable and resettable*
from the conversation itself — the same instinct as ChatGPT's memory manager, but honest about being early:

> **User:** *"what do you remember about me?"*
> **Assistant:** *"Here's everything I keep: 3 saved contacts, your assets (BTC, ETH, USDC), a default max
> slippage of 0.5%, and a preference for the cheapest route. I don't keep your recovery phrase, keys, or
> passwords — those never leave your device. Want to change or clear any of it?"*
> **User:** *"forget my saved assets"*
> **Assistant:** *"Done — I've cleared your remembered assets. I'll ask which asset you mean next time."*

Every learned preference flips an explicit opt-in the user can see and reset; there is no opaque behavioural
profile (AI.md §7). Until that surface ships, the honest state is that inspection/erase happen through the
existing on-device controls (edit/remove a contact; local storage cleared on wipe), and the conversational
memory manager above is tagged **roadmap**.

---

### §4.6 · Shipped vs. roadmap — the honest ledger

Because "AI memory" is exactly the phrase that tempts a demo to overclaim, this is the scrupulous line.

| Capability | Status | Grounding |
|---|---|---|
| Session conversation state within a sitting | **Shipped** | `turns` state; Copilot `history` (redacted) |
| Saved contacts (name → address, on-device) feeding the parser | **Shipped** | `contacts.ts`; `ParseContext.contactNames` |
| Held-asset symbols disambiguating "my BTC" | **Shipped** | `ParseContext.heldSymbols` |
| A safe default max slippage you can change per swap | **Shipped** | `slippageBps = 50` (0.5%) |
| Secret-incapable preference shape + sanitizer + redaction | **Shipped (pure, tested)** | `UserPreferences`, `sanitizePreferences`, `redact()` |
| Enumerated preference learning (opt-in flips) | **Shipped (pure, tested)** | `PreferenceLearner.onAccepted` |
| Rich, long-term, *surfaced* personalization & learned patterns | **Roadmap** | AI.md §7; PRODUCT.md §8.2 |
| Cross-device preference sync (consent-gated, secret-free) | **Roadmap** | DATABASE.md §7 |
| Live DSAR erase/export endpoint | **Roadmap** | `privacy.ts` core shipped; not wired |
| Conversational "what do you remember / forget X" manager | **Roadmap** | this §4.5 |
| Storing a seed / key / password in memory, in any tier | **Never — by construction** | Doctrine #1; shape, `SYMBOL_RE`, `redact()` |

The one row that is not "shipped" or "roadmap" but *"never"* is the point of this whole section. Everything
else can grow; that line does not move. The assistant will, over time, remember more and personalize better —
but it will always remember *from the outside of the vault, with your consent, holding nothing that could
cost you your funds,* and it will always be proposing to a gate that can only refuse and a signature that is
only yours.

*See also: §3 (Multi-turn & Context) for within-conversation state; §5 (Planning Screens) for how a
remembered preference renders in a PlanCard; §7 (Human Approval Flows) for the guards memory can never
soften; §9 (Personalization & Trust Patterns) for the UI that makes memory legible and trustworthy.*


## §5 · AI Planning Screens

*Chapter 3 §12 promised a planning UI that "never instantly executes — [it] shows progress; this builds trust." This section is that promise made real, complete, and honest. It specifies the visual planning experience end to end: the progressive plan build, the anatomy of the card that carries a money proposal, the thinking and streaming states, what the screen does when a plan only half-succeeds, and — above all — how a plan is designed to be **read and understood before anything can be approved**.*

The planning screen is where the wallet's one law becomes a picture. **AI proposes, deterministic code verifies, the device signature disposes** (Doctrine §2). The planning screen is the *proposal, made legible*. It renders a typed `ExecutionPlan` — a piece of data the intent engine returns, never a command it can run (`AI.md` §4: "`PlanOutcome` is *data*… there is no `execute` on it"). Nothing on this screen moves money. It has no authority to. Its entire job is to make the truth of a proposed action so clear, so calm, and so complete that a first-time, non-technical user can look at it and decide — with the actual disposal of funds still one deliberate signature away, downstream in §6 (Explainable Execution) and §7 (Human Approval Flows).

We are benchmarking two products at once here. For the *build* — the streamed, staged "thinking" of a plan coming together — the bar is **ChatGPT / Claude**: progress you can watch, never a frozen spinner. For the *pre-sign clarity* — the moment the numbers are laid out to be trusted — the bar is **Rabby**: decode it, show the real effects, never hand-wave what will actually happen. A great planning screen is a conversation that becomes a receipt-in-advance.

---

### 5.1 · The planning surface at a glance

The planning screen is not a separate route; it is a **card in the conversation**. When the user's sentence resolves to an actionable, fund-moving outcome (`transfer · swap · buy · stake · rebalance`; `AI.md` §4, `ACTIONABLE_KINDS`), the assistant's reply *is* a `PlanFlow` card — rendered inline in the AI feed, or surfaced from the Home command bar (both entry points converge on the same conversation; §1, Conversation Architecture). Read-only questions never render a PlanFlow; they answer inline (§2). **Cards, not prose, for anything that touches money** (`UX_GUIDELINES.md` §3.2) — because recognition is a safety property: the same card, in the same order, every time, is how a user learns to trust at a glance.

The card is driven by a small, explicit state machine — in web V2, the shipped `FlowPhase`:

```
planned → authorizing → authorized → executing → done
```

`planned` is the whole of §5's territory: the plan is on screen, fully reviewable, and **nothing has happened**. `authorizing`/`authorized` belong to the gate (§7); `executing`/`done` belong to execution (§6). This section owns the picture the user reads while `phase === 'planned'`, plus the two live stages (Authorize, Execute) whose *appearance* the planning timeline is responsible for. (**SHIPPED**, `apps/web/src/App.tsx`, `PlanFlow`.)

---

### 5.2 · The progressive plan build

Chapter 3 §12 fixed the canonical build, and Chapter 2 §8 fixed the lifecycle it renders. The planning screen expresses it as a **vertical timeline of stages**, each with a rail, a dot, a title, and a body:

```
✦  Understood your intent      ✓        ← Understand
🛡 Security checked             ✓        ← Risk Analysis
🧭 Best route                   ✓        ← Research / Build Plan
⛽ Estimated cost               ✓        ← (quote + simulation)
🔐 Authorize (Risk + Policy)    …        ← Review / Approval
🚀 Execute (sign → broadcast)   ○        ← Execution
```

This is the shipped six-stage `stages` block in `PlanFlow`. Each `Stage` has exactly three visual states, and the machinery for all three ships today:

| Stage state | Meaning | Rendering (shipped) |
|---|---|---|
| **`done`** | this stage's fact is computed and true | emerald dot, **✓** glyph, full-opacity body (`.stage-done`) |
| **`active`** | work is happening here, right now | accent dot with a soft `pulse` ring, live copy (`.stage-active`) |
| **`pending`** | not reached yet | dimmed to 55% opacity, muted placeholder (`.stage-pending`) |

Stages animate in with a staggered `rise` (each delayed `--i × 90ms`), so the plan *assembles* rather than popping — the ChatGPT-style "it's thinking, and I can watch it think" that Chapter 3 §20 asks for ("AI Thinking Timeline," never a spinner for a long task). Under `prefers-reduced-motion: reduce`, the stagger and the `pulse` are suppressed to a plain reveal (the global reduce rule zeroes animation; §8 accessibility below).

**The honest seam — read this carefully.** In web V2, the plan is computed *server-side and returned whole* (`POST /v1/intents/plan`, then rendered). So when the card first paints, stages 0–3 (Understand, Security, Route, Cost) land already **`done`** — their facts arrived together — and only **Authorize** and **Execute** are genuinely live, driving `active → done` as the user (or Auto mode) advances the `FlowPhase`. The card is truthful about this: it never pretends to "discover" a number it already holds. **(SHIPPED.)**

The **streamed build** — where *each* stage lights `active`, does visible work, then flips `done`, so the user watches "Finding Liquidity…" resolve into "Best route ✓" the way Chapter 3 §12's mock implies — is the **target (roadmap)**. It requires the plan pipeline to *stream its stages* (`Understand → Research → Route → Risk → Simulation → Assembly`; `AI.md` §4) rather than return atomically. The `Stage` component and its `active`/`pending` CSS already exist to receive that stream; the roadmap work is the server emitting stages incrementally, not new UI. Likewise, a discrete **"Simulation ✓"** stage (named in Ch2 §8 and Ch3 §12) is, today, folded into *Best route* + *Estimated cost* — and for a real swap the **live Uniswap quote is the concrete simulation** (§5.4). A standalone simulation stage that shows decoded balance-changes, Rabby-style, is the target. We ship the honest subset and label it; we never draw a "Simulation ✓" checkmark for a step that didn't run (Doctrine §3).

---

### 5.3 · Thinking & streaming states

Before a plan exists, the turn is **thinking**. The user's sentence appears as their bubble; beneath it, the assistant shows a live status:

```
You            Convert 500 USDC to ETH
AI     ● ● ●   Planning…
```

This is the shipped `bubble ai thinking` — three blinking dots plus the word *Planning…*, wrapped in `role="status" aria-live="polite"` so a screen reader hears that work is underway without losing focus (§8; `UX_GUIDELINES.md` §3.4). The thinking budget is **≤ ~2.5 s and cancellable** (`UX_GUIDELINES.md` §3.1); the deterministic fast-path answers most utterances in well under that, and the LLM parse is a *fallback*, not the common case (`AI.md` §3, §10). Chapter 3 §24's budget binds: the response should begin within **~1 s**, and if it will take longer, it **streams**.

Two rules govern streaming, and they are non-negotiable:

- **Reasoning prose may stream; numbers never do.** The plan's explanatory narration — the "🧠" reasoning line, and (roadmap) a longer streamed rationale in the ChatGPT idiom — can arrive token by token. But **money figures render whole, instantly, atomically** (`UX_GUIDELINES.md` §2.2): *"a number that types itself in looks like it's being invented."* The `You send` / `You receive (min)` / `Total cost` values must never typewriter-animate. Trust is the feature.
- **Streamed prose is still schema-gated.** Anything the model says is narration of an *already-computed, deterministic fact* — never the model's own arithmetic (`AI.md` §2, §5; fact-grounding). A streamed sentence that cited an unverified number would be caught upstream; the planning screen only ever renders what the ledger has blessed.

Today the shipped reasoning is a compact, computed one-liner — `🧠 2 steps · low risk · ~$0.42 network fee · ~2 min` — assembled from the plan's own fields, not free-form model text. Streamed long-form rationale ("I compared 18 liquidity sources…", Ch2 §4's "explain every decision") is the **roadmap** richer form of exactly this line.

---

### 5.4 · The PlanCard anatomy

Recognition is safety, so the card's regions never reorder. This is the shipped `flow card`, region by region, each mapped to the real class and the rule it enforces:

| # | Region | What it shows | Rule | Class (shipped) |
|---|---|---|---|---|
| 1 | **Header** | the outcome kind (`Swap`), an `⚡ AUTO` badge if in Auto mode, and the **RiskBadge** | outcome + risk, first, together | `.flow-top` |
| 2 | **Lead line** | the outcome restated in one plain sentence | restate the money verbatim (§2.2) | `.flow-lead` |
| 3 | **Reasoning** | `🧠 N steps · risk · ~fee · ~ETA` | show the work, don't just assert | `.flow-reasoning` |
| 4 | **Stage timeline** | the six stages (§5.2) | never instant-execute; show progress | `.stages` |
| 5 | **— Cost grid** | You send · You receive (min) · Network fee · Slippage · ETA | Stripe-grade honesty about money | `.cost` (inside stage 3) |
| 6 | **Actions** | `Review & authorize` → `Sign on device & execute` | one primary action; the gate is the boundary | `.flow-actions` |
| 7 | **Footer** | plan id + a plain statement of what will *really* sign/broadcast (or that nothing will) | never imply coverage we don't have | `.flow-foot` |

**Outcome first.** The header and lead answer *"what am I about to do?"* before anything else. The lead is the planner's `confirmation` string — *"Convert 500 USDC to at least 0.183 ETH via Uniswap. Fees ~$0.90, ~2 min."* — and for a real swap it is **rewritten from the live quote** so the sentence a user reads matches the number that will sign (see the min-received seam below).

**The RiskBadge is label + color, never color alone.** The shipped `RISK` map is `low → "Low risk"`, `medium → "Caution"`, `high → "High risk"`, `block → "Blocked"`, each with its own color class. Because the *word* carries the level, a colorblind user is never left guessing (`UX_GUIDELINES.md` §8.4). The badge scales the meaning; the *confirmation ceremony* it triggers (a plain button vs. "I understand, continue" vs. hold-to-confirm vs. **no CTA at all** for `block`) is specified in §7 — the planning screen shows the verdict; the gate enforces it. When risk is elevated, the Security stage also carries an explicit line: *"⚠︎ Elevated risk — extra confirmation required before signing"* (the plan's `requiresStepUp`).

**The cost grid is the receipt-in-advance.** Five rows, fixed order (`UX_GUIDELINES.md` §4.2):

```
You send            $500.00
You receive (min)   0.183 ETH        ← "at least" — a hard floor, not a hope
Network fee         $0.42
Slippage            0.50%
ETA                 ~2 min
```

Every figure is `bigint` base-units under the hood, formatted for humans only at this edge (Doctrine §4; `PlanAmount.base` is `/^\d+$/`). *You receive* rounds **down**, *You send* rounds **up** — we never make a number look better than the commitment behind it (`UX_GUIDELINES.md` §10). Tabular numerals keep the digits from jittering as a live quote updates.

**The min-received seam — the honesty crux.** For a real Sepolia Uniswap swap, the header lead, the *You receive (min)* cost row, and the *Sign & execute* button **all read the same live on-chain floor**. The shipped `PlanFlow` computes `minOut = amountOut × (10 000 − slippageBps) / 10 000` from the live `quoteSwap` result, renders it as `minOutDisplay`, rewrites the confirmation sentence to *"to at least {minOutDisplay} {symbol}"*, and passes that exact `amountOutMinimum` to the signature. **The number you read is the number that signs** (`UX_GUIDELINES.md` §4.3) — never a plan-time estimate that could drift from a thin pool. The user owns the slippage (0.1% / 0.5% / 1%), and the guaranteed floor is stated in words: *"You receive at least 0.183 ETH."* The swap reverts on-chain rather than deliver less; slippage and MEV can never *silently* cost the user.

**Expiry.** A plan is a quote, and a quote goes stale. The design pattern (`UX_GUIDELINES.md` §4.2, item 6; mobile spec) is a **live countdown that morphs the CTA to "Get new quote."** Web V2 ships the *stronger* honesty guarantee by a different mechanism: for a real swap it **re-quotes live** and binds the signed floor to that fresh quote, so a stale number can't be signed in the first place. A visible countdown chip that re-quotes in place with the diff highlighted is the **roadmap** refinement of this — the safety property already holds; the affordance is what's pending.

---

### 5.5 · How the plan invites review before any approval

The planning screen's deepest job is **comprehension before commitment**. The whole card is built so that a first-timer's eye travels *outcome → risk → cost → route → action*, and so that stopping at any point costs nothing.

- **Nothing has happened, and the card says so.** While `phase === 'planned'`, the plan is a proposal; the footer states plainly what *would* really sign ("real signing in your browser (non-custodial) → Sepolia") or, honestly, that nothing will ("not executable in-browser yet — nothing will be signed or broadcast"). **Abandoning is free and asks nothing** (`UX_GUIDELINES.md` §4.1, §6.4) — dismissing a plan triggers no dialog, because there is no consequence to warn about.
- **The primary action is single and deliberate.** In `planned`, the one button is **`Review & authorize`** — not "Execute," not "Confirm." It advances to the *gate*, not to the wire. Only after the gate returns `mayProceedToSign` does a second, distinct **`Sign on device & execute`** button appear (§7). Two separate, deliberate clicks stand between reading a plan and disposing of funds. The AI never supplies either click and has no tool that could (`AI.md` §1).
- **The gate can only refuse.** The Authorize stage renders the deterministic verdict (`AuthzView`: the gate label, *"checked by Risk + Policy,"* the reasons, any step-up requirement chips). If it refuses, there is **no sign CTA** — the UI physically cannot proceed (`UX_GUIDELINES.md` §4.1). This is Doctrine §2 made visible: a pure gate between plan and wire.

A worked turn, with every state, in the AI's calm voice (Ch2 §4 — professional, clear, never hype):

```
You            Convert 500 USDC to ETH

AI   ●●● Planning…                                    ← thinking (≤2.5s, role=status)

AI   ┌─ Swap ──────────────────────────  Low risk ─┐  ← plan renders; stages 0–3 done
     │ Convert 500 USDC to at least 0.183 ETH via   │
     │ Uniswap. Fees ~$0.90, ~2 min.                │
     │ 🧠 2 steps · low risk · ~$0.42 fee · ~2 min  │
     │ ✦ Understood your intent            ✓        │
     │ 🛡 Security checked                  ✓        │
     │ 🧭 Best route  USDC → Uniswap → ETH  ✓        │
     │ ⛽ Estimated cost                    ✓        │
     │     You send            $500.00              │
     │     You receive (min)   0.183 ETH            │
     │     Network fee         $0.42                │
     │     Slippage            0.50%   [0.1 0.5 1%] │
     │     ETA                 ~2 min               │
     │ 🔐 Authorize (Risk + Policy)        ○ pending│
     │ 🚀 Execute (sign → broadcast)       ○ pending│
     │ [ Review & authorize ]                       │  ← the ONLY action in `planned`
     └──────────────────────────────────────────────┘
```

The user can read, adjust slippage, or walk away — all free. Approval, step-up, and the mainnet real-funds ceremony are §7's subject; **Auto vs Manual mode** (the `⚡ AUTO` badge, `autoDecision`'s fail-safe drop-back to manual, and why a mainnet plan can *never* auto-fire) is likewise specified in §7. §5 hands the user a plan they fully understand; §7 governs what it takes to say yes.

---

### 5.6 · Partial failure, and the failed stage

A plan can fail to *form*, or an execution can fail to *land*. The planning screen designs both without ever faking success.

**A plan that can't be built** doesn't render a PlanFlow — it renders an honest **rejected** card (`OutcomeView`, `case 'rejected'`): *"Not possible,"* the plain reason, a risk badge *only when risk is actually the cause*, and the specific reasons. This is Chapter 3 §21's law — **reason + suggestion, never a raw error** — and §2's scoped-refusal voice (*"I can't do leverage yet. I can convert, send, and receive."*). A `clarify` outcome, similarly, is a first-class success, not a failure: one short question as chips, not a paragraph (§2, §3).

**An execution that fails mid-flight** is where "never lie" earns its keep. The shipped behavior:

- The `FlowPhase` **rolls back** — a failed execute returns the card to `authorized`, and a failed authorize returns it to `planned`. The stage that was `active` returns to a non-completed state; **no ✓ is drawn for a step that didn't finish.**
- An honest error line appears beneath the stages: reason first, and — this is the doctrine — **nothing was broadcast**. If the browser wallet genuinely cannot sign and send a given plan, the card says exactly that: *"This swap can't be executed in-browser yet — only Sepolia-listed pairs swap for real. Nothing was broadcast."* A green checkmark is **earned on-chain or not shown** (`UX_GUIDELINES.md` §4.3, §14).
- Auto mode **never silently retries** a failed tx (that would loop an RPC); the manual button reappears for a deliberate retry (§7).

The **`failed` stage state** — a red dot with an ✗ on the specific stage that broke, so a two-step route that clears step 1 and fails step 2 shows *which* step stranded — is the designed extension of this timeline. It maps to the plan's own `fallback` string (*"If a step fails mid-route, your funds are parked safely on the current chain and you can resume"*) and to the execution engine's park/resume machinery (§6). The `Stage` component today ships `done | active | pending`; adding `failed` (dot color, ✗ glyph, and the fallback copy in the body) is a **small, roadmap** extension of a screen whose honest error-handling — rollback, no fake success, reason + next step — **already ships**. A worked failure turn:

```
AI   ┌─ Swap ──────────────────────────  Low risk ─┐
     │ 🧭 Best route                       ✓        │
     │ ⛽ Estimated cost                    ✓        │
     │ 🔐 Authorize (Risk + Policy)  Authorized ✓   │
     │ 🚀 Execute (sign → broadcast)       ○        │  ← rolled back from `active`
     │ ⚠ This swap can't be executed in-browser yet │  ← reason, plainly
     │    — only Sepolia pairs. Nothing was broadcast.│  ← what happened: nothing
     │ [ Sign on device & execute ]  (retry)        │
     └──────────────────────────────────────────────┘
```

---

### 5.7 · Accessibility & motion of the planning screen

The plan is money you must be able to *perceive and operate* — so accessibility here is correctness, not polish (`UX_GUIDELINES.md` §8; Doctrine §6).

- **Announced as one sentence.** The thinking state is `role="status"` (polite); when the plan lands, the card's summary is announced as a single spoken line *before* its CTA is reachable (§3.4) — a screen-reader user hears *"Swap, low risk. Convert 500 USDC to at least 0.183 ETH…"* rather than crawling six stages. Errors are `role="alert"` (assertive); a live quote / expiry update is polite and announced at the 10-second mark, not every tick.
- **Keyboard-complete.** Every control on the card — slippage options, `Review & authorize`, `Sign on device & execute` — is a real, labelled, focusable button; focus order follows visual order; the mainnet confirm is a focus-trapped `alertdialog` (§7).
- **Color is never the only channel.** Risk is word + color; stage state is glyph (`✓` / icon / dimming) + color; a red *failed* stage will also *say* it failed.
- **Motion is honest and optional.** The staggered `rise` and the `active` `pulse` are the only planning-screen motion, and both are timing-with-restraint, not decoration (Ch2 §7). Under `prefers-reduced-motion: reduce` they collapse to a plain reveal. **Numbers never animate** regardless of motion preference (§5.3).
- **Reflow, don't clip.** Amounts wrap at Dynamic Type XXL and +40% string length; the cost grid and route graph reflow; tabular numerals keep columns steady.

---

### 5.8 · What ships today vs. what's next

Honesty is this chapter's whole point, so the line is drawn explicitly:

| Capability | Status |
|---|---|
| Six-stage plan timeline with `done · active · pending` states | **SHIPPED** (`PlanFlow`, `Stage`, `.stage-*`) |
| PlanCard anatomy: header · lead · reasoning · cost grid · actions · footer | **SHIPPED** |
| RiskBadge (label + color), elevated-risk step-up line | **SHIPPED** |
| Live min-received consistent across lead, cost row, and signature | **SHIPPED** (real Sepolia swap) |
| User-owned slippage with a stated guaranteed floor | **SHIPPED** |
| Thinking state (`role=status`, ≤2.5s), atomic numbers | **SHIPPED** |
| Honest partial failure: phase rollback, reason + next step, **no fake broadcast** | **SHIPPED** |
| Streamed *per-stage* build (each stage lights `active` → `done` live) | **Roadmap** |
| Standalone decoded **Simulation ✓** stage (Rabby-style balance changes) | **Roadmap** (today folded into Route + Cost; live swap quote is the real analogue) |
| Streamed long-form reasoning prose ("I compared 18 sources…") | **Roadmap** |
| Visible expiry **countdown** → "Get new quote" affordance | **Roadmap** (safety already held by live re-quote) |
| `failed` stage state (✗ on the step that broke, fallback copy) | **Roadmap** (honest error-handling ships; the per-stage visual is the extension) |

The planning screen we ship is the honest, load-bearing subset of the one we're building toward — and every checkmark on it is earned. *AI proposes and explains it; deterministic code verifies it; the device signature — never this screen, never the model — disposes of the funds.*

> → **Next:** §6 · Explainable Execution — what the screen shows *after* the signature, from broadcast to on-chain receipt.


## §6 · Explainable Execution

*Chapter 4 — Conversation-First UX · Principal AI Engineer*

> **Rule 4 (Chapter 2), made into UX:** *"The AI never says 'Best route selected.' It shows its work."*
> This section specifies what "showing its work" means at the seam where a conversation turns into a signable
> plan — the content of every explanation, the grammar it renders in, the audit trail behind it, how it
> discloses its own uncertainty, and the ordering law that makes **explanation precede comprehension precede
> signature**. §5 owns the Planning Screen's layout and the PlanCard anatomy; §7 owns the approval mechanics
> (step-up, hold-to-confirm, the mainnet guard). This section owns the one thing that sits on top of both:
> *why the user should believe the plan is true, stated so they can check it themselves.*

The premise is the Doctrine, not decoration. **AI proposes · deterministic code verifies · the device
signature disposes** ([`AI.md`](../../AI.md) §1). An explanation, therefore, is not the model's rhetoric —
it is **deterministic code's testimony, narrated in plain language**. Every figure the user reads was
computed by a pure core (`intents` planner, `router`, `risk`, `policy`) and only *described* by the model,
which is fact-grounded and cannot state a number it wasn't handed ([`AI.md`](../../AI.md) §5.2 — `FactLedger`
+ `verifyResponse`). This is what lets us make a promise ChatGPT and Claude cannot: **the explanation is
machine-checked against the thing being explained.** A wallet that can *lie confidently about money* is the
worst product we could ship (Doctrine #3, `PRODUCT.md` §2.9); explainable execution is the surface where we
prove we don't.

---

### 6.1 · The five "whys" every plan owes the user

Chapter 2 §9 (Trust Rules) says the product must always show **what · why · cost · time · risk · result**
before any action. "What / cost / time / risk / result" are the PlanCard's data rows (§5). **This section
owns the "why."** A plan is not explained until it answers all five of these — each one traceable to a
deterministic source, never to the model's opinion:

| The "why" | Answers the question | Deterministic source of truth | Plan field it reads | Status |
|---|---|---|---|---|
| **Why this route** | "Why these steps, in this order, across these chains?" | Route Optimizer (`router`, ADR‑0035: simulate → score → rank) → the planner's `RouteGraph` | `plan.steps[]` (`kind`, `chainId`, `dependsOn`), `plan.assets` | ✅ steps + graph shipped; ⏳ *counterfactual* ("vs N others") — see §6.2 |
| **Why this protocol** | "Whose liquidity am I trusting?" | The chosen route's `venue` per leg, humanized (`prettyVenue`: `uniswap-v3` → "Uniswap v3") | `RouteLeg.venue` → `plan.confirmation` ("…via Uniswap v3") | ✅ named venue shipped |
| **Why this fee** | "What am I paying, and is it fair?" | Planner `quote()` — fee as micro‑USD **and** as a % of notional | `quote.totalFeeMicros`, `quote.feePct`, `quote.slippageBps` | ✅ fiat‑first fee + % + slippage shipped |
| **Why this risk verdict** | "Why low / caution / high / blocked?" | Risk Engine (`risk`, ADR‑0036) → typed reasons; Policy composes it (ADR‑0038) | `plan.risk.level` + `plan.risk.reasons[]`, `requiresStepUp` | ✅ level + human reasons shipped |
| **Why this ETA** | "Why ~12 minutes, not instant?" | Route Optimizer per‑leg timing | `quote.etaSeconds` | ✅ shipped (rendered "~N min") |

Two further facts belong to "result" (the sixth Trust Rule) and are **carried on every plan today** but are
under‑rendered — closing that gap is a near‑term item, not a new feature:

- **`plan.fallback`** — *what happens if a step fails mid‑flight* (e.g. swap: *"If a step fails mid‑route,
  your funds are parked safely on the current chain and you can resume."*). This is the honest answer to
  "and if it breaks?", and it is a doctrine promise (never strand funds, `PRODUCT.md` §7.2.8). It is set by
  the planner on every plan; the Planning Screen should render it as an explicit **"If something goes
  wrong"** line rather than leaving it implicit.
- **`plan.rollback`** — the reversal strategy where one exists, or `null` when the action is irreversible.
  A `null` rollback is itself an explanation the user is owed *before* they sign: **this cannot be undone**
  (stated once, plainly — `UX_GUIDELINES.md` §2.2).

> **The lane:** the *data* for all seven facts is real and lives on `ExecutionPlan`
> ([`packages/intents/src/schema.ts`](../../packages/intents/src/schema.ts)). This section governs *how each
> "why" is worded and rendered*; the surface it renders into is §5's PlanCard/stages.

---

### 6.2 · The rendering grammar: quantified, never adjectival

The single hard rule of this section, from Chapter 2 Rule 4:

> ❌ *"Best route selected."*  ❌ *"Optimal fee."*  ❌ *"This is safe."*
> ✅ *"Compared 18 liquidity sources — this route saves ~$3.10 and is ~14 s faster."*
> ✅ *"Network fee $0.42 (0.14% of the amount)."*
> ✅ *"No threats flagged by the risk engine across recipient, token, and approval checks."*

Every claim an explanation makes must be a **number with a unit and, where a choice was made, a
comparison.** An adjective ("best", "safe", "optimal", "cheap") is banned unless a figure stands behind it
in the same breath. This is the AI‑personality contract from Chapter 2 §4 (professional / calm / clear /
confident — *never* hype) rendered as a grammar:

| Grammar rule | ✅ Do | ❌ Never |
|---|---|---|
| **Number + unit** | "~12 min", "$21.30", "0.5%" | "fast", "cheap", "low slippage" |
| **Comparison / counterfactual** | "saves ~$3.10 vs the next‑best route" | "great rate" |
| **Source attribution** | "via Uniswap v3", "flagged by the risk engine" | "trusted partner", "our system says" |
| **Conservative rounding** | *you receive* rounds **down**, *you pay* rounds **up** (`UX_GUIDELINES.md` §10) | a figure flattering the commitment |
| **Named uncertainty** | "estimated ETA — networks vary" | a precise‑looking number implying certainty it lacks |

**What ships today** is the honest, quantified-but-not-yet-counterfactual form. The live web `PlanFlow`
([`apps/web/src/App.tsx`](../../apps/web/src/App.tsx)) renders a one‑line reasoning summary and a stage
timeline, both driven entirely by real plan fields:

```
🧠  1 step · low risk · ~$0.42 network fee · ~1 min          ← the reasoning line (real)

✦  Understood your intent   — Parsed as a swap on Ethereum
🛡  Security checked         — No threats flagged by the risk engine
🧭  Best route               — [ USDC → Swap · Ethereum → ETH ]   (RouteGraph, from real steps)
⛽  Estimated cost           — You send $100.00 · receive (min) 0.031 ETH · fee $0.42 · slippage 0.50% · ETA ~1 min
🔐  Authorize (Risk+Policy)  — checked by Risk + Policy → Authorized
🚀  Execute                  — Sign in your browser & broadcast
```

Every value there is `plan.quote.*`, `plan.risk.*`, `plan.steps[]`, or `plan.confirmation` — nothing is
invented, and the venue is named ("via Uniswap v3") rather than hidden behind "best route."

**The counterfactual is the target (⏳ roadmap), and here is the honest gap.** The Route Optimizer *does*
generate, simulate, score, and rank multiple candidates (ADR‑0035) — the comparison genuinely happens in
deterministic code. But the `ExecutionPlan` schema does **not yet carry the counterfactual** to the UI, so
we cannot render "compared 18 sources, saves $3.10, 14 s faster" without fabricating the numbers — which we
will not do. Reaching Chapter 2 Rule 4's exemplar sentence is a **scoped schema addition**, not a copy
change:

```ts
// ⏳ ROADMAP — proposed addition to ExecutionPlan.quote, populated by the Route Optimizer:
comparison?: {
  candidatesConsidered: number;   // e.g. 18  — how many routes were simulated
  savedVsNextBestMicros: string;  // integer micro-USD saved vs the runner-up (bigint string)
  fasterVsNextBestSeconds: number;// ETA delta vs the runner-up
  rankedBy: 'cost' | 'speed' | 'risk'; // which preset chose this one (router presets, ADR-0035)
};
```

Until that field exists, the honest rendering is what ships — named venue + quantified cost/ETA/risk — and
the counterfactual line is tagged as the destination. **We never render a "compared N sources" claim we
cannot back with a computed N.** (This is the same discipline as `PRODUCT.md` §8: "the engine exists" is not
"the product ships it end‑to‑end.")

---

### 6.3 · The ordering law: explanation → comprehension → signature

Nothing may be signable before it is explained, and nothing may be explained that isn't backed by a computed
fact. This is Chapter 2 §8's fixed lifecycle (Understand → Research → Build Plan → Risk → Simulation →
**Explanation** → Review → Approval → Execution → Confirmation) and Chapter 3 §12 ("Never instantly
execute — show your work — this builds trust") expressed as a **hard exit-gate ordering**, enforced by the
`PlanFlow` state machine, not by convention:

```
 explanation rendered        comprehension gate            signature
 ─────────────────────       ──────────────────────        ──────────────────────
 the five "whys" + cost      the user reads / a step-up     device signs the exact tx
 timeline are painted        is demanded for elevated risk  (AI has ZERO authority here)
 BEFORE any Sign CTA         (§7 owns the gate mechanics)   → real broadcast or honest refusal
```

Three invariants make the ordering real rather than aspirational:

1. **The explanation exists before the CTA does.** In `PlanFlow`, `phase` starts at `'planned'`: the five
   stages render immediately; the only action offered is *"Review & authorize."* The *"Sign on device &
   execute"* button is **not in the DOM** until `phase === 'authorized'` and `permission.mayProceedToSign`
   is true. A user physically cannot skip to signing past the explanation.
2. **No sign CTA past a block.** If Risk returns `block`, the planner never produces a plan
   (`{ kind: 'rejected' }`) — there is no `ExecutionPlan` to sign, so there is nothing to press. A `block`
   is a full‑width refusal with reasons, never a button (Doctrine #5; `UX_GUIDELINES.md` §6.1). *A pure gate
   can only refuse* (`AI.md` §1) — made physical.
3. **Comprehension is forced where the stakes rise.** Medium/high risk sets `requiresStepUp: true` and the
   planner prepends the reasons to the confirmation copy (`finalizePlan`: *"⚠️ Elevated risk (new recipient;
   unverified token). …"*). A whole‑wallet move does the same. The explanation isn't just shown — an
   elevated‑risk plan **cannot proceed on the same silent path as a benign one** (§7 owns *how* the step‑up
   is collected; this section guarantees the *reason* is surfaced verbatim first).

> **The AI has zero signing authority at every step above.** It produced a typed `Intent`; deterministic
> code planned, priced, risk‑scored, and explained; and only the user's on‑device signature disposes of
> funds ([`AI.md`](../../AI.md) §1, §4). The explanation surface never contains an "execute for me" affordance
> — by construction, no such tool exists for the model to reach ([`AI.md`](../../AI.md) §2, `assertNoExecuteTools`).

---

### 6.4 · Worked dialogues — turn by turn, every state

The AI's voice below is the Chapter 2 §4 personality: professional, calm, clear, confident; it narrates
computed facts, asks one short question when unsure, and never hypes. (Reads answer inline; money actions
render as the explained `PlanFlow` — `UX_GUIDELINES.md` §3.2.)

**A · The happy path (swap) — thinking → streaming → explained → success**

```
User:  Swap 100 USDC for ETH

AI  ▸ thinking      "Planning…"  (role="status", aria-live="polite"; ≤ ~2.5 s, cancellable — §5 owns the shimmer)
AI  ▸ streaming     The PlanFlow paints top-down: the reasoning line, then each stage as its
                    fact resolves. Numbers appear ATOMICALLY (never typewriter-animated — a number
                    that types itself in looks invented; UX_GUIDELINES §2.2).
AI  ▸ explained     "Converting 100 USDC to at least 0.0312 ETH via Uniswap v3.
                     Network fee ~$0.42 (0.42%), ~1 min. No threats flagged."
                    🧭 Best route:  USDC → Swap (Ethereum) → ETH
                    ⛽ You send $100.00 · receive at least 0.0312 ETH · fee $0.42 · slippage 0.50%
                    🔐 checked by Risk + Policy → Authorized
                    [ Review & authorize ]        ← the ONLY action; nothing is signable yet
User:  (Review & authorize) → (Sign on device & execute)
AI  ▸ success       "✓ Uniswap swap signed in your browser & broadcast to Sepolia.
                     0x8f…a1  · View on Sepolia Etherscan →"
                    (Success is REAL, on-chain, with a receipt — never a simulated checkmark.
                     Celebrate once, not a loop; UX_GUIDELINES §9.)
```

The honesty seam that makes this trustworthy: the **minimum‑received shown in the explanation is the live
on‑chain `amountOutMinimum` that will actually be signed**, not a plan‑time estimate that could drift from a
thin pool (`UX_GUIDELINES.md` §4.3). The user picks max slippage; we display the guaranteed floor
("*You receive at least 0.0312 ETH*"); the swap reverts on‑chain rather than deliver less. Explanation and
commitment are the *same number*.

**B · The clarify branch (comprehension precedes a plan at all)**

```
User:  Send $100 to Rahul

AI  ▸ clarify   "Which Rahul?"        (one question, as chips — never a paragraph; UX_GUIDELINES §3.3)
                [ Rahul K · da94 ]  [ Rahul S · 9f2c ]  [ Someone new ]
```

There is nothing to explain yet because there is nothing decided yet. A `clarify` is a first‑class success,
not a failure (`AI.md` §4) — we ask rather than guess with someone's money. (§2 owns intent understanding;
§3 owns multi‑turn context — this section only notes that *an unexplained assumption is never signed*.)

**C · The elevated‑risk branch (the "why this risk verdict" made loud)**

```
User:  Swap 500 USDT for $NEWCOIN

AI  ▸ explained   ⚠️ Elevated risk (token unverified · low liquidity). Caution.
                  "Converting 500 USDT to at least 41,000 NEWCOIN via Uniswap v3.
                   NEWCOIN isn't on a verified token list and its pool is thin —
                   the price you get could move against you."
                  RiskBadge: Caution (icon + label + color — never color alone; §8 a11y)
                  ⚠︎ Elevated risk — extra confirmation required before signing.
                  [ Review & authorize ]      → step-up collected at sign time (§7)
```

The risk *reasons* (`plan.risk.reasons[]`) render verbatim as the explanation; `requiresStepUp` guarantees
the plan can't ride the benign path. This is where we **out‑Rabby Rabby**: not just "this contract does X,"
but *why the verdict is Caution, in one calm sentence, before the ask.*

**D · The honest‑refusal branch (never fake a success)**

```
User:  Stake 1 ETH

AI  ▸ explained   The plan renders (route, cost, risk) — the intent kind is real and planned…
User:  (authorize) → (attempt execute)
AI  ▸ error       "This stake can't be broadcast from the browser wallet yet.
                   Nothing was signed or sent."
```

`stake`/`rebalance`/`recurring`/`emergency_exit` are **typed, planned, gated intent kinds** but do not all
have real broadcast paths today (`PRODUCT.md` §8.2). The explanation is honest about the boundary: we show
the plan we *can* prove, and refuse — plainly, with reason + the fact that nothing happened — rather than
render a convincing shell around a capability that isn't wired (Doctrine #3; `UX_GUIDELINES.md` §14). Error
design is Chapter 3 §21: **reason + suggestion, never a raw code, hash, or provider name in the face.**

**E · The block branch (no CTA at all)**

```
User:  Send 0.2 ETH to 0x<sanctioned>

AI  ▸ rejected   "Blocked for your safety."   (full-width banner — not a badge)
                 Why:  recipient is on a sanctions screening list.
                 [ Why blocked ]  [ Report a mistake ]      ← no Sign, no override
```

A `block` is **non‑overridable** and terminal everywhere (`AI.md` §4; a permissive user cannot un‑block a
sanctioned recipient). The explanation names the reason and offers recourse — never a way past.

---

### 6.5 · The audit trail (Doctrine #8 — everything auditable)

> *"Every risky decision (risk verdict, policy denial, auto‑execution) is logged with its inputs and reason.
> Correctness and security are demonstrated, not asserted."* — Doctrine #8; [`AI.md`](../../AI.md) §4.

An explanation is the *live, human‑facing* face of a decision; the **audit trail is its durable,
inputs‑and‑reason record.** They are the same facts at two time horizons, and both are owed. What exists
today:

| Audit artifact | What it records | Where | Status |
|---|---|---|---|
| **Risk verdict + reasons** | `level` + typed `reasons[]` for recipient / token / approval scans | `plan.risk`, rendered in "Security checked" | ✅ shipped |
| **Policy decision** | the gate (`allow` / `require_confirmation` / `defer` / `escalate` / `block`), *who* drove it, and why | `Permission` → `AuthzView`: "**checked by Risk + Policy**" + `reasons[]` + requirement chips | ✅ shipped |
| **Policy audit log** | each policy evaluation with its inputs and outcome, for replay | Policy Engine audit (ADR‑0038) | ✅ engine shipped |
| **Execution receipt** | real tx id + explorer link + actual amounts/fees (or honest failure + *where the money is*) | Activity timeline (`ActivityItem`), `RealExecView` | ✅ shipped |
| **Auto‑execution ledger** | real‑USD daily spend accrued so Auto‑mode caps bind on the next mainnet tx | `recordAutoSpendUsd` | ✅ shipped |
| **User‑inspectable decision log** | a per‑intent "why did it decide that" inspector, exportable, spanning parse → risk → policy → signature | — | ⏳ roadmap |

Two properties make this audit trail stronger than a log file:

1. **The narration is machine‑checked against the audited facts.** Every number the AI *states* is recorded
   in a `FactLedger` and reconciled by `verifyResponse` / `hasUncitedNumerics` (`AI.md` §5.2); Intelligence's
   `verifyNarrative` throws on an unreconciled citation. So the explanation can't drift from the audit trail
   — *"the AI never invents a balance" is a tested property, not a hope.* The audit trail and the explanation
   cannot disagree without a test failing.
2. **The auditable inputs are secret‑incapable by construction.** Nothing logged, cited, or explained can
   contain a key, seed, password, or full address beyond what the user typed (`AI.md` §7). We can be maximally
   transparent about *decisions* precisely because the record structurally cannot hold a *secret*.

The roadmap item — a first‑class, exportable **decision inspector** (parse confidence → risk inputs →
policy rule that fired → signature → on‑chain result, one screen) — is the natural next surface for the
policy‑driven portfolio holder and the compliance/embedding ICPs (`PRODUCT.md` §4.1 secondary). It builds on
records that already exist; it is a rendering, not new authority.

---

### 6.6 · Confidence & uncertainty disclosure

Doubt is surfaced, never smoothed over — the opposite of a chatbot's confident fluency. The mechanism is
real code, and its UX surface is partly shipped and partly the target:

- **The confidence floor is real** ([`packages/copilot/src/confidence.ts`](../../packages/copilot/src/confidence.ts),
  `AI.md` §5.4). Confidence starts at `1.0` and is **multiplied down** by each source of doubt: stale data,
  missing data, low route confidence, a gate that needs confirmation, LLM retries. Below the floor (`0.55`)
  a response **must** carry an `uncertaintyNote` — this is enforced, not optional.
- **Where uncertainty already renders in the shipped flow.** Even without a confidence number on screen, the
  plan surface is honest about what it doesn't know: an **unpriced asset** shows the symbol with fiat as "—"
  (never a fabricated $), an **ETA is labelled an estimate**, **slippage is shown as a range the user sets**,
  and a **clarify** is emitted rather than a guess. Below‑high **parse confidence mirrors the intent back in
  one line before acting** ("*Converting all your BTC (~$2,100) to ETH — correct?*"; `UX_GUIDELINES.md` §2.2,
  §3.3). These are uncertainty disclosures without needing a percentage.
- **⏳ Roadmap: a confidence chip on the plan surface.** Rendering the copilot confidence score and its
  `uncertaintyNote` directly on the PlanCard (e.g. a quiet "*Confidence: moderate — prices are ~2 min old*"
  line) is the target. The floor logic ships in `packages/copilot`; wiring the score into the web `PlanFlow`
  is not yet done, so we do not display a confidence number we haven't wired — we show the concrete
  uncertainties (stale, unpriced, estimate) that we can compute honestly.

**The rule, whichever surface:** confidence is **derived**, never asserted. ChatGPT and Claude hedge with
prose ("I think…", "it should…"); we compute a number from named, inspectable causes and *require* a plain
note below the floor. Uncertainty about money is a first‑class thing to say out loud, not a tone to perform.

---

### 6.7 · Benchmarks, anti‑patterns, and definition of done

**Benchmarks we hold this surface to** (`UX_GUIDELINES.md` §0):

| Steal this | From | Applied here |
|---|---|---|
| Reasoned, quantified explanation over a bare verdict | **ChatGPT / Claude** | the five "whys", each a number + comparison — but *fact‑grounded*, which they are not |
| "What will actually happen" before you sign | **Rabby / Phantom** | live `amountOutMinimum` = the signed floor; venue named; risk verdict *reasoned*, not just flagged |
| Merciless honesty about money and errors | **Stripe** | fiat‑first fee + %, conservative rounding, "nothing was broadcast" on refusal |

**Anti‑patterns (never do — some are `UX_GUIDELINES.md` §14):**

- "Best route selected," "optimal," "safe," or any adjective without a figure beside it.
- A "compared N sources / saves $X" claim not backed by a computed N and a real delta.
- A confidence number that isn't derived from named causes; hiding uncertainty to look fluent.
- A number that types itself in, or an estimate rendered as if it were certain.
- A risk verdict shown as color only, or a `block` that still offers a way past.
- An explanation that reads as if the AI will act — it proposes; the device signs, or nothing does.
- A green checkmark for anything not confirmed on‑chain.

**Definition of done — an explanation is not done until:**

- [ ] All five "whys" (route, protocol, fee, risk, ETA) are present and each traces to a real plan field.
- [ ] "Result" facts (`fallback`, and `rollback`/irreversibility) are surfaced, not implied.
- [ ] Every claim is a number + unit; every choice carries its comparison or is honestly deferred to roadmap.
- [ ] The explanation renders **before** any Sign CTA exists; a `block` offers no CTA; elevated risk surfaces its reasons verbatim.
- [ ] Every stated number is fact‑grounded (ledger/`verifyNarrative`); uncited numerics are caught in test.
- [ ] Uncertainty (stale/unpriced/estimate/low‑confidence) is disclosed plainly; below the `0.55` floor a note is required.
- [ ] The decision is auditable — risk + policy inputs and reasons are recorded, and the narration reconciles with them.
- [ ] Driven as a first‑time user in **light and dark**, keyboard‑reachable, AA, reduced‑motion‑safe — proven by a recording, not a green type‑check.

> **The final word for this section.** An explanation is a claim about reality, and reality is on‑chain and
> in the deterministic cores. If the explanation is beautiful but unbacked, it lies and it fails. If it's
> honest but the model wrote the number, it fails. We show our work — quantified, fact‑grounded, auditable,
> uncertainty and all — or we ask one short question instead. That is how a stranger comes to trust a
> sentence with their money.


## §7 · Human Approval Flows

> *The signature is the product's one irreversible act — so the moment before it is sacred. Everything
> upstream is a proposal the user is free to walk away from; the click that signs is the only thing that
> moves a base unit, and it is always, structurally, a human's. This section is where "AI proposes,
> the device disposes" stops being a slogan and becomes a button that the AI cannot press.*

Chapter 2 gave us the law (Rule 5 — *Never surprise the user: no hidden action, no silent transfer, no
hidden approval, ever*) and the disclosure contract (§9 Trust Rules — *what · why · cost · time · risk ·
result*, every time). Chapter 3 gave us the shape (the planning UI never instant-executes; it shows its
work). §5 of this chapter owns the *planning screens* and §6 owns *explainable execution* — how the plan is
rendered and narrated. **This section owns the transition between the two: the act of a human authorizing.**
Who is allowed to say yes, what they must be shown before they can, which situations force an explicit
"yes" even when the user asked for autonomy, and how the boundary — *the AI has zero signing authority* — is
made physical rather than promised. It is grounded in the shipped `PlanFlow` machine, `autoDecision`, and
the mainnet guard in [`apps/web/src/App.tsx`](../../apps/web/src/App.tsx) and
[`apps/web/src/settings.ts`](../../apps/web/src/settings.ts), the risk contract in
[`packages/intents/src/schema.ts`](../../packages/intents/src/schema.ts), and the doctrine in
[`AI.md`](../../AI.md) §1 and [`UX_GUIDELINES.md`](../../UX_GUIDELINES.md) §6. Where any of those and
this section disagree, one is a defect — reconcile on purpose, never drift.

Benchmark: ChatGPT and Claude taught users that a conversation can *do* things; Rabby taught the market that
the pre-sign screen is where trust is won or lost — decode client-side, show effects, never trust server
text for what leaves the wallet. We take both: the warmth of a chat, the merciless clarity of a Rabby
confirm, and one thing neither has to guarantee — *the assistant is not the one who signs.*

---

### §7.1 · The four-phase machine, and where approval lives inside it

Every money action, from every entry point, flows through one state machine
(`FlowPhase = 'planned' → 'authorizing' → 'authorized' → 'executing' → 'done'`, `PlanFlow`). It is the
literal shape of Doctrine #2:

```
 PLAN            AUTHORIZE               SIGN                  CONFIRM
 (AI proposes)   (code verifies)         (human disposes)      (on-chain truth)
────────────    ───────────────────     ──────────────────    ───────────────────
 parse → route   Risk + Policy gate       device signature      broadcast → receipt
 → quote →       → Permission             of the exact tx        (real) or an honest
 PlanCard        (can only REFUSE)        the user reviewed      failure — never a fake
```

Approval is **not one moment; it is two gates the human crosses in order**, and the machine will not let
either be skipped:

1. **Authorize** — the user presses *"Review & authorize"*. This runs the deterministic Risk + Policy gate
   (`authorizeIntent(plan.planId)`), which returns a `Permission` carrying `mayProceedToSign`. The gate can
   only *refuse*: it never produces a signature, only a verdict. This is the "code verifies" phase.
2. **Sign** — *only if* `permission.mayProceedToSign` is true **and** the plan is actually executable by the
   on-device wallet does a second control appear: *"Sign on device & execute"*. This is the human's
   disposal. Pressing it (for testnet) — or pressing it *and then confirming the real-funds dialog* (for
   mainnet) — is the sole thing in the entire product that moves value.

The ordering is a safety property, not a layout choice: **there is no sign control until the gate has said
yes.** If `mayProceedToSign` is false, the UI renders *"Can't proceed until the requirements above are
met."* and has literally nothing to press — Doctrine #2 made physical (a pure gate can only refuse; when it
refuses, the button does not exist). This is the shipped analogue of UX §6.1's rule that a **BLOCK offers no
CTA at all**.

---

### §7.2 · Manual mode — the default: explicit approval per funds-moving action

`txMode` defaults to **`'manual'`** (`settings.ts`, `DEFAULTS`). In Manual mode every fund-moving action is
a deliberate, two-click human decision — authorize, then sign — with no shortcuts. This is the honest
default because *the user who never opens Settings is the user we most need to protect*, and the safe path
must be the default path (PRODUCT §2.4; no confirm-shaming, no dark pattern nudging them toward autonomy).

The shipped Manual choreography, per turn:

| Phase | What the user sees | The control | The rule |
|---|---|---|---|
| `planned` | the full PlanCard: lead sentence, reasoning, six stages (intent · security · route · cost · authorize · execute) | **Review & authorize** (primary) | nothing has happened; abandoning is free and asks nothing |
| `authorizing` | *"Checking risk & policy…"* on the Authorize stage | — (in flight) | the deterministic gate runs; it can only refuse |
| `authorized` (gate said yes) | the `Permission` rendered in `AuthzView`; the Execute stage shows the ready balance / live quote | **Sign on device & execute** (primary) | the point of no return; irreversibility is stated *here*, once |
| `authorized` (gate said no) | the requirements, and **no primary CTA** | *"Can't proceed…"* text only | the UI physically cannot proceed past a refusal |
| `executing` | *"Signing in your browser & broadcasting…"* | disabled | the signature is committed; leaving mid-signature warns once (§7.9) |
| `done` | the real tx: *"✓ Signed in your browser & broadcast to {chain}"* + hash + explorer link | View on explorer → | only on-chain truth is labelled done (§7.7) |

Two design commitments make Manual mode *calm* rather than *nagging*:

- **Reads never wear approval theater.** A `query` intent ("what's my biggest holding?") answers inline and
  shows none of this machinery — no authorize button, no risk badge, no confirm. Confirmation UI appears
  *only* when a base unit could move. (UX §3.3.)
- **Abandoning is always free before the signature.** Dismissing a plan, navigating away, closing the
  turn — none of it asks "are you sure?", because nothing has happened yet. We reserve friction for the one
  moment that earns it. (UX §6.4.)

---

### §7.3 · The confirmation as comprehension gate — the six things shown before any signature

The confirmation is not a speed bump; it is a **comprehension gate**. Its job is to make the truth of what
is about to happen *unmissable* before the user can commit, and it discharges Chapter 2 §9's Trust Rules
literally. Every one of the six is on the card *before* the sign control is reachable — mapped to the
shipped `PlanFlow` surface:

| Trust Rule (Ch2 §9) | Where it lives on the shipped card | Honesty seam |
|---|---|---|
| **What** will happen | `flow-lead` — `plan.confirmation` restated in plain words; **You send** / **You receive (min)** rows | the money is restated *verbatim* — the exact amount and destination the user is committing to |
| **Why** it will happen | `flow-reasoning` (🧠 `N steps · risk · ~fee · ~ETA`) + the route graph + *"Understood your intent → parsed as a {kind}"* | the AI shows its work; it never says only *"best route selected"* (Ch2 Rule 4) |
| Estimated **cost** | the **Estimated cost** stage: You send · You receive (min) · Network fee · Slippage · ETA | fiat-first; rounds conservatively — *"you receive"* down, *"you pay"* up (UX §10) |
| Estimated **time** | ETA `~N min` (from `plan.quote.etaSeconds`) | an estimate, labelled as one |
| **Risk** level | the `RiskBadge` (icon **+ label + color**, never color alone) + the **Security checked** stage listing `plan.risk.reasons` | graduated and loud; `requiresStepUp` adds an explicit elevated-confirmation line |
| Expected **result** | **You receive (min)** — an explicit *"at least"* floor — and, after signing, the real on-chain receipt | the floor shown is the floor signed (see below) |

Two shipped honesty seams are worth stating loudly, because they are what stop the confirmation from
quietly lying:

- **The number you read is the number you sign.** For a real swap, the minimum-received in the lead
  sentence, the cost table, and the executed floor are all the *same* live on-chain `amountOutMinimum` — the
  code rewrites the lead to match the live quote (`plan.confirmation.replace(/to at least …/, …)`) so a
  thin-pool drift can never make the header say one thing and the signature commit another. The user picks
  max slippage (0.1% / 0.5% / 1%); we display the guaranteed floor (*"You receive at least 0.612 ETH"*); the
  swap reverts on-chain rather than deliver less. Slippage and MEV can never *silently* cost the user.
- **Comprehension precedes the CTA for a screen reader too.** The PlanCard is announced as one summary
  sentence in a polite live region before its sign control is reachable (UX §3.4, §8.2); the confirm dialog
  is a focus-trapped `alertdialog`. A user who cannot see the card still meets the gate before the button.

---

### §7.4 · Auto mode — bounded autonomy that fails safe

Auto mode is the one place the two human clicks can be skipped — and it is bounded so tightly that skipping
them is *provably no more capable than a manual approval*. Turning it on does **not** grant the AI signing
authority; it grants a **pre-authorized envelope**, set by the user in explicit USD caps, inside which the
same machine drives `authorize → execute` without a per-tx click. It **still** signs in-browser, and it
**still** passes the identical Risk + Policy gate. The autonomy is in *skipping the click*, never in
*loosening the gate*. (This is PRODUCT §2.8 — *automation depth equals authorization depth* — and Doctrine
#5, fail closed.)

The whole decision is one pure function, `autoDecision(usdVal, riskLevel)` (`settings.ts`), and it fails
safe by construction:

```ts
if (getTxMode() !== 'auto')          return { auto: false };
if (riskLevel === 'block')           return { auto: false, reason: 'blocked by the risk engine' };
if (usdVal > perTxUsd)               return { auto: false, reason: `over your $${perTxUsd} per-transaction cap` };
if (autoSpentTodayUsd() + usdVal > dailyUsd)
                                     return { auto: false, reason: `would exceed your $${dailyUsd} daily cap` };
return { auto: true };
```

Defaults are deliberately small: **$25 per-tx, $100 daily** (`DEFAULTS`). When `autoDecision` returns
`auto: false`, the flow does not fail silently and it does not fail *dangerously* — it **drops back to
Manual with a visible, plain-language reason**: *"⚡ Auto paused — over your $25 per-transaction cap.
Confirm manually below."* The manual buttons reappear; the user finishes the exact same way they would have
in Manual mode. Autonomy declining is a first-class, legible state — never a stall, never a guess.

Three hard properties of Auto mode, all shipped:

- **A mainnet plan can never auto-fire.** `execute()` intercepts `isMainnet` *before* signing and opens the
  real-funds confirm dialog (§7.6), regardless of mode. So even inside its cap envelope, Auto mode still
  routes every real-money broadcast through an explicit human confirmation. Auto is for the *testnet default*
  and small, priced, low-risk actions — never a silent path to real funds.
- **Auto never retries a failed transaction.** The auto-execute effect fires *once* (`autoExecTriedRef`); a
  failed authorize/execute drops back to `planned`/`authorized` and the *manual* button reappears for a
  deliberate retry. Auto-retry would spin an RPC forever and could double-broadcast — so we don't.
- **The cap ledger is real USD and it binds across transactions.** After a real mainnet send,
  `recordAutoSpendUsd(amountUsd)` accrues a per-day USD ledger, so the *daily* cap actually clamps the
  *next* action rather than resetting every plan.

> **Security reconciliation note (Principal Security Engineer).** As shipped, `autoDecision` only clamps on
> the caps when a USD value is *known*: an **unpriced** action (`usdVal == null`) with a non-`block` risk
> returns `{ auto: true }` — the caps cannot bind on a value we can't compute. Two backstops keep this from
> touching real funds today: (a) a mainnet plan can never auto-fire (the `execute()` intercept), so an
> unpriced auto action only ever moves *free testnet coins*; and (b) a `block` still stops it. But
> UX_GUIDELINES §6.3 and MEMORY assert a *stronger* invariant — *"an unpriced… amount drops back to
> manual."* That is the correct target and the code is weaker than the doctrine. **Reconcile on purpose:**
> `autoDecision` should return `{ auto: false, reason: 'unpriced — can't verify caps' }` when
> `usdVal == null`, so autonomy is granted only over values we can actually bound. Until it does, this is a
> known gap, not a claim of safety.

---

### §7.5 · The escalations that always require an explicit, informed "yes"

Some situations are dangerous enough that the answer is *"always ask, always inform"* — Auto mode cannot
consume them, and Manual mode raises the ceremony to match. Each is grounded in shipped mechanism:

| Escalation | What forces the explicit approval | Shipped mechanism |
|---|---|---|
| **Real mainnet broadcast** | any mainnet plan | `execute()` opens the real-funds `alertdialog`; **Auto can never fire it** (§7.6) |
| **High value over the cap** | a mainnet transfer `> $1,000` | an extra *"I understand this exceeds the $1,000 limit"* checkbox; the confirm button stays **disabled until it is checked** (`acknowledgeHighValue`) |
| **Elevated risk** | risk `medium` / `high` | `plan.requiresStepUp` → the *"⚠︎ Elevated risk — extra confirmation required before signing"* line; the risk row stays expanded; the gate demands step-up at sign time |
| **A `block` verdict** | risk `block` | **no sign CTA exists** — `mayProceedToSign` is false; a block is *non-overridable*, even by a permissive user (`AI.md` §4) |
| **First send to a new recipient** | an address with no prior history / not in contacts | surfaced through `plan.risk.reasons` (the risk engine screens the recipient) and the full-address restatement on the confirm (see note) |

Two clarifications keep this table honest:

- **Graduated risk is never silently swallowed.** Only `block` is refused outright; `medium`/`high` proceed
  *but must be confirmed* (`requiresStepUp` on the `ExecutionPlan`), and the Policy gate + execution enforce
  the step-up at sign time. Risk is loud, always icon + label + color, and the reasons are listed, never
  summarized to a color. (Schema comment on `requiresStepUp`; UX §6.1.)
- **"First send to a new address" is shipped as a risk-report signal and a target callout.** Recipient
  screening is real — an unknown or flagged recipient surfaces in `plan.risk.reasons`, and the confirm
  restates the **full destination address** for a human to check character-by-character (the mainnet dialog
  renders `real.to` verbatim; contacts resolve *names → addresses* locally so a known name is visibly not a
  raw address). A dedicated *"you've never sent here before — double-check the address"* banner, in the
  Rabby "first interaction" idiom, is the **target pattern (roadmap)**: it layers a distinct callout on the
  existing risk signal rather than inventing new authority. We describe it as roadmap, not shipped, so we
  never imply a warning the wallet doesn't yet raise.

---

### §7.6 · The mainnet real-funds guard, walked

Testnet and devnet run straight through — free coins, labelled testnet — because there is nothing to lose.
A **real mainnet broadcast never fires without an explicit confirm**, and that deliberate click *is* the
`GuardAck` the deterministic guard demands. In web V2 this is a focus-trapped `alertdialog`
(`role="alertdialog"`) that:

- **Names it unmistakably:** *"⚠️ Real mainnet transaction — this moves REAL funds."* (No "live mode"
  euphemism; UX §2.1 lexicon.)
- **Restates the commitment verbatim:** the exact amount and asset, *"on Ethereum mainnet"*, the **full
  destination address** (`real.to`, monospaced), the USD notional when priced, and the sentence *"It is
  signed on your device and cannot be undone."* Irreversibility is stated *once*, here, at the point of no
  return — never in fine print, never after.
- **Escalates over the cap:** when the notional exceeds **$1,000**, a second acknowledgement appears —
  *"I understand this exceeds the $1,000 mainnet spend cap"* — and the confirm button is **disabled until it
  is checked**. Confirming passes `{ acknowledgeMainnet: true, acknowledgeHighValue, amountUsd }` to the
  guard; the deterministic guard, not the UI, is the thing that ultimately enforces the cap.
- **Cancels cleanly:** *Cancel* returns to `authorized` with nothing signed and the high-value ack reset.

> Web V2 wires **ETH sends for mainnet only**; tokens and swaps stay on Sepolia. The guard, the labels, and
> this section all say exactly that — we never imply broader mainnet coverage than exists (PRODUCT §8.1;
> UX §12). SOL and BTC broadcast on devnet/testnet only today.

This is the same anatomy every value-moving confirmation wears — *recognition is the anti-phishing feature*
(PRODUCT §2.5). Hold-to-confirm with escalating haptics and a typed-amount step above the user's threshold
are the **mobile** grammar for the HIGH tier (UX §6.1, §12); web renders the explicit `alertdialog` ack as
its equivalent. Both are honestly labelled for their platform.

---

### §7.7 · The device signature disposes — and the AI never touches it

The one law, at the point of execution: **there is no code path in which a model output moves, commits, or
approves funds** (`AI.md` §1). The packages that touch the LLM hold no keys and have no dependency on the
signer; `IntentEngine.handle` returns `{ intent, outcome }` and has no `execute` on it. What actually signs
is the on-device wallet, driven by the human's click — `executeTransferStep` / `sendSwap` sign in-browser
with the encrypted-at-rest key and broadcast. The AI proposed the plan; a human read it and pressed the
button; the *device* signed. Three parties, one direction, no shortcut.

And when the device *can't* honestly sign a plan, we say so and sign **nothing** — there is no fake
fallback:

```ts
throw new Error(
  plan.intentKind === 'swap'
    ? "This swap can't be executed in-browser yet — only Sepolia-listed pairs swap for real. Nothing was broadcast."
    : `This ${plan.intentKind} can't be broadcast from the browser wallet yet. Nothing was signed or sent.`,
);
```

A green checkmark is *earned on-chain* or not shown. `stake` / `rebalance` / `recurring` / `emergency_exit`
exist as typed, planned intent kinds that pass the gate, but they do **not** all have real broadcast paths —
so the approval flow refuses them honestly rather than render a convincing "done" for something that never
happened (PRODUCT §8.2; Doctrine #3). The error follows Chapter 3 §21: reason + suggestion, never a raw
code in the user's face.

---

### §7.8 · Never surprise / no hidden approval — including the token allowance

"No hidden approval" (Chapter 2 Rule 5) is not only about *signing a transfer* — it is about **token
allowances**, the classic place wallets quietly grant infinite power. Intent Wallet approves **bounded, not
infinite**, and makes the grant legible and reversible. Grounded in
[`apps/web/src/broadcast.ts`](../../apps/web/src/broadcast.ts):

- **Approve exactly what the swap needs.** The swap approves `amountIn` to the router
  (`encodeErc20Approve(SEPOLIA_UNISWAP.swapRouter02, amountIn)`) — never `2^256−1`. The user is never asked
  to hand a spender an unlimited allowance to save a future click.
- **Approve only if short, and wait for it.** We read the live allowance first and sign an approve *only if*
  `allowance < amountIn`, then **wait for that approve to confirm** before the swap fires
  (`waitForReceipt` — throws on revert/timeout, so the swap won't fire on an unconfirmed approval). This is
  the settlement-safe approve → confirm → swap sequencing: no approval races the spend, no approval is left
  dangling if the swap aborts.
- **Unlimited is flagged, and revocation is a first-class action.** The wallet detects effectively-infinite
  allowances (`allowance ≥ 2^255`, `UNLIMITED_ALLOWANCE`) and the revoke sheet reads the live allowance,
  labels it — *"⚠️ Unlimited allowance granted"* vs *"✓ No allowance — nothing to revoke"* — and signs
  `approve(spender, 0)` in-browser to set it to zero. The user can always see and withdraw what a contract
  can pull.

The general rule this instantiates: **every grant of standing capability is bounded, visible, and
revocable.** An approval the user didn't see coming, or can't take back, is a surprise — and surprises are
forbidden.

---

### §7.9 · Turn-by-turn — the approval, in every state

The choreography, shown as the user experiences it. The AI's voice is Chapter 2's — professional, calm,
clear, confident; never hype, never a guarantee. (Streaming, cancellation, and the thinking-state budget
are §1's; here we show only the states that bear on *approval*.)

**A · Manual, testnet, clean approval (the happy path)**

```
User:    Send 0.1 ETH to 0x8f…21a4
Wallet:  [thinking · role="status"] Planning…
Wallet:  [PlanCard]  Send 0.1 ETH to 0x8f…21a4 on Sepolia.
         🧠 1 step · low risk · ~$0.00 network fee · ~1 min
         Security checked — no threats flagged.  You send: 0.1 ETH.
         [ Review & authorize ]
User:    (clicks Review & authorize)
Wallet:  [authorizing] Checking risk & policy…
Wallet:  [authorized]  Security passed — you may sign.
         Ready to sign with your wallet · your ETH on Sepolia: 1.42
         [ Sign on device & execute ]
User:    (clicks Sign on device & execute)
Wallet:  [executing] Signing in your browser & broadcasting…
Wallet:  [done] ✓ Signed in your browser & broadcast to Sepolia
         0x9c… · View on explorer →
```

**B · Clarify before any plan exists (ambiguity, not a guess)**

```
User:    Send $100 to Rahul
Wallet:  You have two contacts named Rahul. Which one?
         [ Rahul K · da94 ]  [ Rahul S · 9f2c ]  [ Someone new ]
User:    (taps Rahul K · da94)
Wallet:  [PlanCard]  Send $100 USDC to Rahul K (0x…da94) …
```

The wallet asks one short question rather than move someone's money on a guess (UX §3.3; a `clarify` is a
first-class success, never a failure). No approval control appears until the ambiguity is resolved.

**C · Mainnet — the escalation (triple-gated)**

```
User:    Send 0.5 ETH to 0x8f…21a4          [network: 🔴 Mainnet]
Wallet:  [PlanCard, RiskBadge, 🔴 mainnet]  … Review & authorize
User:    (authorize → gate passes)  →  (clicks Sign on device & execute)
Wallet:  [alertdialog]
         ⚠️ Real mainnet transaction — this moves REAL funds
         Sending 0.5 ETH on Ethereum mainnet to 0x8f…21a4 · ≈ $1,640.
         It is signed on your device and cannot be undone.
         ☐ I understand this exceeds the $1,000 mainnet spend cap
         [ Confirm & sign real-funds transaction ]  (disabled until ☑)   Cancel
User:    (checks the box, then confirms)
Wallet:  [executing] Signing in your browser & broadcasting…  →  [done] ✓ … View on explorer →
```

Three deliberate human acts — authorize, sign, confirm-real-funds (plus the high-value checkbox over
$1,000) — before a single wei leaves the wallet. Auto mode does not shorten this; it can never fire it.

**D · Auto paused — autonomy declining, legibly**

```
[Auto mode · caps $25 / $100 · already spent $90 today]
User:    Swap 200 USDC for ETH
Wallet:  [PlanCard]  ⚡ AUTO
         ⚡ Auto paused — would exceed your $100 daily cap. Confirm manually below.
         [ Review & authorize ]        ← the manual path, reappeared
```

**E · Honest refusal at execute (no fake success)**

```
User:    Stake 1 ETH
Wallet:  [PlanCard, authorized]  (clicks Sign on device & execute)
Wallet:  [error · role="alert"]
         This stake can't be broadcast from the browser wallet yet.
         Nothing was signed or sent.
```

**F · Blocked (no CTA to press)**

```
User:    Send 2 ETH to 0x…<sanctioned>
Wallet:  [PlanCard]  Blocked for your safety.
         • Recipient matches a sanctioned-address list.
         [ Why blocked ]   [ Report a mistake ]        ← no sign control exists
```

A `block` is a full-width state, not a badge; `mayProceedToSign` is false, so the sign control is never
rendered. The user cannot click past it because a pure gate can only refuse — and a `block` is
non-overridable even for a permissive user (`AI.md` §4).

---

### §7.10 · Accessibility of the approval (WCAG 2.2 AA — gated, not garnished)

Money you can't perceive or operate is money you can lose, so the approval flow is keyboard-complete and
announced:

- **The confirm is a focus-trapped dialog.** The mainnet `alertdialog` (and every confirm sheet) traps
  focus, moves focus in on open, cycles on `Tab`, and returns focus to the invoking control on close (the
  shared `useDialog` hook — reuse it, never hand-roll a trap). `Esc` closes **only when no money action is
  pending**; the scrim does not dismiss a confirm mid-decision (UX §7.2, §8.1).
- **State changes announce without stealing focus.** *Thinking* is `role="status"` `aria-live="polite"`;
  the PlanCard summary lands in a polite live region as one sentence *before* its CTA is reachable; a refusal
  is `role="alert"` (assertive). The user never has to hunt for why a button appeared or vanished (UX §8.2).
- **Risk is never color alone.** Every risk surface is icon + label + color together; the `RiskBadge`, the
  `requiresStepUp` line, and the block banner all *say* their meaning, verified colorblind-safe (UX §8.4).
- **The high-ceremony act has an alternative.** Hold-to-confirm (the mobile HIGH-risk grammar) ships with a
  switch-control alternative; the web high-value checkbox is a native, labelled control reachable and
  operable by keyboard. Targets are ≥ 44×44 and the primary action sits in the thumb zone on mobile.
- **`prefers-reduced-motion` is honored.** No approval meaning is conveyed by motion; the success check
  fires once and never loops; reduced-motion swaps springs for ~150 ms cross-fades (UX §8.4, §9).

---

### §7.11 · Definition of Done — an approval surface is not done until

- [ ] **Two gates, in order:** no sign control exists until the deterministic gate returns
      `mayProceedToSign`; a refusal leaves *nothing* to press.
- [ ] **The money is restated verbatim** — exact amount, asset, and full destination — before the signature;
      irreversibility is stated once, at the point of no return.
- [ ] **All six Trust Rules on the card** before the CTA is reachable: what · why · cost · time · risk ·
      result.
- [ ] **The number read is the number signed** (live quote == cost table == executed floor; user-owned
      slippage; guaranteed minimum shown).
- [ ] **Escalations force explicit approval:** mainnet ack, high-value ack over cap, `requiresStepUp` for
      medium/high, no CTA on `block`, new-recipient signal surfaced.
- [ ] **Auto mode fails safe:** `autoDecision` drops to Manual with a visible reason; mainnet can never
      auto-fire; no auto-retry; the USD ledger binds the next action. *(Plus the unpriced-value reconciliation
      in §7.4.)*
- [ ] **The AI signs nothing;** an un-broadcastable plan refuses honestly (reason + suggestion), never fakes
      a success.
- [ ] **Allowances are bounded, visible, revocable;** no infinite approval is requested to save a click.
- [ ] **Keyboard-complete and announced:** focus trapped and returned, live regions for every state, risk
      never color-only, reduced-motion-safe.
- [ ] **Proven by driving the real flow** in light and dark — an actual authorize → sign → confirm — not a
      green type-check.

> **The final word.** The AI can plan anything; it can approve nothing. Between the cleverest proposal and
> the smallest movement of value stands one deterministic gate that can only refuse, and one human whose
> signature is the sole disposer of funds. Make that boundary visible, make the moment before it calm and
> complete, and never — not for speed, not for autonomy, not for a demo — let anything but a person's own
> device say the final yes.


## §8 · Voice-First Interactions

> **Status — ROADMAP.** Nothing in this section ships in web V2 today. The intent surface is
> **text-only**: the composer in [`apps/web/src/App.tsx`](../../apps/web/src/App.tsx) (`section === 'ai'`,
> ~L1621–1648, and the Home `hv-ai` form ~L1562–1573) renders a text input and a send arrow — there is no
> microphone wired, no speech capture, no spoken output. What *is* already committed is the *reservation*:
> the command-bar spec ([`UX_GUIDELINES.md`](../../UX_GUIDELINES.md) §3.1) names a "mic affordance," and
> two UX laws pre-commit its shape — *"voice input has **full typed parity** (nothing is voice-only)"* (§3.4)
> and *"voice intent has full typed parity"* (§8.4). This section designs the feature behind that
> reservation so that, when it is built, it is built right — and, above all, built **safe**. Every capability
> below is tagged **(roadmap)** unless it cites shipped code. Do not render a mic, a waveform, or a "listening"
> state in any surface until the flow in §8.5 is real; a voice UI that *looks* like it can move money but
> routes through nothing is exactly the fabricated-capability lie Doctrine §3 forbids.

Voice is the most literal reading of the promise. *"Talk to your money"* is a metaphor when you type it and a
fact when you say it out loud. It is also the single most dangerous input channel we will ever add, because
speech is **lossy** (the recognizer guesses), **ambient** (a TV, a passenger, a colleague can utter words the
mic hears), and **un-reviewable in the moment** (you cannot re-read what you said the way you re-read what you
typed). So the rule for voice is the same rule the AI framework applies to multi-agent work: more surface area
means the doctrine gets **harder, not looser** ([`AI.md`](../../AI.md) §6). Voice earns its place by making
*capture* effortless. It earns nothing at the *gate*. This section is the discipline that keeps those two
facts apart.

Benchmarks. For conversational fluidity we study **ChatGPT Advanced Voice** and **Claude voice** — barge-in,
natural cadence, an assistant that sounds like it is listening rather than transcribing. We borrow that feel.
We refuse the part where the voice agent is trusted to *act*. For the moment value is at stake we study
**Rabby**: its pre-sign clarity is *visual* and un-skippable, and we do not regress that to a spoken "you're
all set." Voice makes the conversation human; the confirm sheet stays a thing you look at with your own eyes.

---

### 8.1 · The one law of voice — voice proposes, the screen and the device dispose

Voice is a **third capture modality into the exact same pipeline** described in §1–§2 and §5–§7 — not a second
brain and not a shortcut around the gate. A spoken utterance is transcribed to text, and from the first
character onward it is **byte-for-byte the same path** a typed sentence takes: the deterministic fast-path
first, then the schema-forced LLM, then a `clarify` if neither is confident — *never a guess*
([`packages/intents/src/parse/parser.ts`](../../packages/intents/src/parse/parser.ts)). The model's output
is still `unknown` until Zod validates it; the model still has no fund-moving tool to reach for; the Risk +
Policy gate and the **device signature** still sit downstream of all parsing. Voice changes *how the words
arrive*, never *what is allowed to happen to them*.

Which gives the law, stated the way Doctrine §2 and Ch2 §5 are stated:

> **Voice proposes. The screen explains. The device disposes.** A spoken sentence may *fill* a plan. It may
> never *be* the authorization. The AI has zero signing authority whether you type, tap, or speak — and a
> voice channel does not, cannot, and must not become a back door to one.

| Voice **may** (roadmap) | Voice **must never** |
|---|---|
| Capture an intent hands-free (*"Convert my BTC to ETH"*) | Sign, broadcast, approve, or serve as the `GuardAck` for a mainnet move |
| Answer a read-only question aloud (*"What's my biggest holding?"*) | Be the sole channel for any value-moving confirmation (§8.5) |
| Pick a `clarify` option by voice **before** money is at stake | Confirm a high-value or high-risk action without the visual sheet + explicit gesture |
| Correct a mistranscription; cancel; ask "explain that" | Speak, capture, or "read back" a **recovery phrase** — ever (§8.2) |
| Drive accessibility (motor / low-vision users) into the typed pipeline | Listen ambiently by default, or act on speech from an un-unlocked session |

Everything else in §8 is the detailed working-out of that one table.

---

### 8.2 · Where voice fits — and where it is a liability

Voice is not a universal upgrade; it is the right tool for a specific set of contexts and the wrong tool for
another. We design both lists explicitly so we never ship voice into a place it makes the product *less* safe.

**Green zones — voice is a genuine win (roadmap).**

- **Hands-busy intent capture.** Cooking, walking, mid-task — the moment you *think* "move a hundred dollars
  of USDC to Rahul" is the moment to capture it, before you forget. Capture is voice's home.
- **Accessibility.** For a motor-impaired user, dictation *is* the keyboard; for a low-vision user, a spoken
  reply closes a loop the screen reader would otherwise carry alone. Voice input is itself an a11y feature
  (§8.6), which is exactly why the UX laws pre-committed typed parity rather than voice exclusivity.
- **Reads and explanations.** "What did that swap cost me?" / "Explain this plan." Speaking a question and
  hearing a calm one-sentence answer is delightful and low-stakes, because nothing moves.

**Red zones — voice must never be the *sole* channel.**

- **Any value-moving confirmation.** The confirm sheet is sacred and it is the anti-phishing defense
  ([`PRODUCT.md`](../../PRODUCT.md) §2.5); recognition-with-your-eyes-half-closed is a *security* property,
  and you cannot recognize a sheet you never looked at. Voice can bring you *to* the sheet; the sheet still
  demands eyes and a gesture (§8.5).
- **The recovery-phrase reveal.** It is solemn, re-authenticated, capture-blocked, and clipboard-denied by
  design (UX §6.4). We **never speak a seed phrase aloud and never transcribe one** — a mic in earshot of a
  spoken seed is the exact key-exposure the whole product exists to prevent. This is an absolute, not a
  preference.
- **Destructive local actions** (wipe wallet). These re-authenticate at the moment of action; a spoken "yes"
  is not a re-auth.
- **Ambient, always-on listening.** Off by default. Voice capture is **explicit push-to-talk (or an opt-in
  wake word, roadmap)** with an unmistakable on-screen listening indicator — never a wallet quietly recording
  the room.

---

### 8.3 · Voice input UX — capture → transcription → confirmation → correction

The input loop has one non-negotiable seam: **for anything that could touch money, we show the transcript and
let the user confirm or correct it before we act on it.** Voice is lossy, so the transcript is treated as a
*draft the user ratifies*, exactly as a typed line is a draft until they press send. We never run a
fund-moving intent off an unconfirmed transcript.

**The mic state machine (roadmap).** Each state is announced to assistive tech and shown visually — never
conveyed by animation alone (Ch3 §22; UX §8.4).

| State | Visual | Announced (`aria-live`) | Rule |
|---|---|---|---|
| `idle` | mic glyph in the composer | — | Not listening. No audio captured. |
| `listening` | live waveform + "Listening…" + a **Stop** target ≥44×44 | polite: "Listening" | Push-to-talk held or wake-word armed; a visible, honest indicator that the mic is hot. |
| `heard` | waveform settles | — | Speech ended (or barge-in / Stop). Capture closed. |
| `transcribing` | shimmer on a text line | polite: "Transcribing" | STT running; cancellable. |
| `draft` | the **editable transcript** sits in the composer, send arrow armed | polite: the transcript, read back as one line | The user reads/edits, then submits. **This is the ratification seam.** |
| `thinking` | typing dots + "Planning…" | polite: "Planning" | Reuses the shipped thinking state (`role="status"` `aria-live="polite"`, App.tsx ~L1596). |
| `clarify` | chips, one question | polite: the question | The pipeline asked rather than guessed. Pickable by voice *pre-money*. |
| `error` | reason + next step | **assertive** (`role="alert"`) | §8.7. Never a silent fail, never a fake success. |

The turn, end to end (roadmap):

```
🎙  [push-to-talk]                        → listening…  (waveform, "Listening", Stop visible)
🗣  "Convert half my BTC to ETH"          → transcribing…
📝  draft:  Convert half my BTC to ETH    → user glances, it's right, taps ↑ (or says "send")
🤖  Planning…                             → deterministic parse → plan (§5)
🃏  [PlanCard renders on screen]          → You send ~0.5 BTC · You receive at least … · Total cost … · Risk
```

The transcript in the `draft` step is **the** honesty control. If the recognizer heard "eight ETH" for "a
ETH," the user sees `8 ETH` in plain text before anything is planned and fixes it — by re-recording, by
tapping into the field and editing (full typed parity, UX §3.4), or by saying *"no, one ETH."* We do not
auto-submit a money utterance the instant silence falls; the pause between transcript and plan is where a
$8,000 mishearing dies quietly. (Low-stakes **reads** may auto-submit — "what's my balance" asked and answered
has nothing to ratify.)

**Correction & control verbs (roadmap).** "Cancel" / "never mind" aborts and captures nothing. "No, I meant
Rahul S" edits the draft rather than starting a second turn. Barge-in stops playback the instant the user
speaks — an assistant that keeps talking over you feels deaf, and ChatGPT/Claude voice set that bar.

---

### 8.4 · Spoken responses — Chapter 2's personality, rendered audibly

A spoken reply is the AI Personality from Ch2 §4 — **professional, calm, clear, confident** — with a
microphone in front of it. The failure mode is worse out loud than on screen: hype that reads as mild looks
manipulative when *spoken* in a confident voice. So the constraints tighten.

- **Concise by default.** One or two sentences. The ear has no scroll bar; a spoken wall of prose is a wall.
- **The screen carries the load-bearing numbers; the voice summarizes.** Money figures render *whole and
  instantly* on the PlanCard (UX §2.2 — numbers never typewriter-animate, and by extension are never
  *invented into being* by a voice). The spoken line points at them; it is never the sole record of an amount
  the user is committing to.
- **Restate the money verbatim when confidence is below high** (UX §2.2), but as a *question that sends you to
  the sheet*, never as a self-executing confirmation: *"That's converting about half your BTC — roughly
  $1,050 — to ETH. I've put the plan on screen; review and confirm there."*
- **Never hype, never dramatize, never guarantee** (Ch2 §4). Every fabricated-number and uncited-figure
  guard from [`AI.md`](../../AI.md) §5 applies identically to speech — a voice that *says* a percentage it
  can't reconcile is the same defect as text that prints one.

| Say it aloud (on-voice) | Never say it aloud |
|---|---|
| "Your biggest holding is ETH, about 41% of your portfolio." | "You're crushing it — ETH is mooning! 🚀" |
| "The plan's on screen. Review the cost and risk, then confirm there." | "All set — I've sent it for you." *(voice never disposes)* |
| "I can convert, send, and receive. I can't do leverage yet." | "Guaranteed best price — trust me, just say yes." |
| "One quick thing — which Rahul? I'll show the options." | "Confirmed! ✅" *(no on-chain truth, no signature — a lie)* |

**Accessibility of speech itself:** a spoken response is **always** also on screen — captions/transcript for
Deaf and hard-of-hearing users, and so nothing is *voice-only* (the mirror image of "nothing is voice-only"
for input). Our TTS must never talk *over* the platform screen reader; §8.6 governs that handoff.

---

### 8.5 · The safety model — voice at the confirm boundary

This is the crux of the whole section, and the one place a shortcut would be fatal. **A money action captured
by voice still lands on the visual confirm surface, and a spoken "yes" is not a signature.**

Trace a mainnet send that began as speech (roadmap capture, **shipped gate**):

```
🗣  "Send $100 of ETH to Rahul on mainnet"
        → transcribe → ratify draft → parse → plan
🃏  PlanCard on screen: You send $100 ETH · to Rahul (0x…da94) · Risk · Total cost
        → the FlowPhase machine begins: 'planned' (App.tsx L2369)
🗣  "yes, send it"
        → this does NOT execute. A mainnet broadcast NEVER fires without the explicit visual ack.
⚠️  The real-funds alertdialog appears ON SCREEN — "Real mainnet transaction — this moves REAL funds",
    restating exact amount, asset, chain, full destination, and "cannot be undone".
👆  The user must ACT on the sheet: tap Confirm (the click that IS the GuardAck / acknowledgeMainnet),
    and — over the $1,000 cap — check "I understand this exceeds the $1,000 limit" (acknowledgeHighValue),
    with the confirm button DISABLED until it's checked.
🔏  Device signs in-browser → real broadcast → on-chain receipt, or an honest failure. No simulated success.
```

Every load-bearing step there is **shipped code**, and voice is deliberately *upstream* of all of it:
`execute()` intercepts a real mainnet plan and opens the confirm dialog rather than broadcasting
([`apps/web/src/App.tsx`](../../apps/web/src/App.tsx) ~L2514–2545); the deliberate click *is* the
`GuardAck` the deterministic guard demands; the $1,000 cap escalates to a checked acknowledgement
(`acknowledgeHighValue`); and **Auto mode can never auto-fire a mainnet plan** — `autoDecision()` fails safe
and `execute()` opens the real-funds confirm instead of signing (App.tsx ~L2573–2595). Voice does not get a
privileged path around any of this. If anything, voice makes the *visual* ack more important, because the spoken
channel is exactly the one an attacker or an accident can inject into.

Three rules make that concrete:

1. **Voice can fill the plan; the gesture that authorizes is on the glass.** LOW risk → a tap; MEDIUM → the
   expanded-risk button; HIGH → hold-to-confirm (or its switch-control alternative) plus a **typed** amount
   over threshold; BLOCK → no CTA at all (UX §6.1). A held gesture and a typed high-value amount are, on
   purpose, things you *cannot do with your voice* — the danger is graduated into modalities speech can't
   satisfy alone.
2. **Overheard speech is untrusted DATA, and the gate does not care how a plan was born** ([`AI.md`](../../AI.md)
   §8). A TV, a passenger, or a bystander saying "send everything to 0x…" is parsed like any utterance and
   still meets Risk + Policy + the device signature; injection-smelling input is forced to `clarify`; a
   sanctioned recipient is a non-overridable `block`. Voice adds an *acoustic* injection surface — which is a
   reason the confirm stays visual, not a reason to trust the mic.
3. **Never re-skin or voice-drive an OS security surface.** Biometrics and platform confirmations are the
   platform's (PRODUCT.md §5.2); a spoken "yes" never stands in for Face ID or the device signature.

---

### 8.6 · Accessibility — the wins, and the collisions to avoid

Voice is where Ch3 §22's accessibility commitments (VoiceOver · Dynamic Text · High Contrast · Reduced Motion)
and this chapter meet most directly. Done right, voice *expands* who can use the wallet; done carelessly, it
*fights* the very assistive tech it should complement.

- **Voice input is a motor-accessibility win** — dictation as a first-class path into the same audited
  pipeline, with **full typed parity** in both directions (UX §3.4/§8.4) so no one is trapped in a modality.
- **Do not fight VoiceOver / TalkBack.** When a platform screen reader is active, our TTS defers to it — we do
  not double-speak, and the screen reader's own reading of the PlanCard summary, the risk row, and the confirm
  gesture is the source of truth. Our spoken layer is for users *not* running a screen reader; the two must
  never talk at once.
- **Dynamic Type and captions travel together.** A spoken reply always has an on-screen transcript that
  respects Dynamic Type to XXL (amounts wrap, never truncate; UX §8.4) — so scaling text up and turning
  speech on are complementary, not exclusive, and Deaf/HoH users lose nothing.
- **Every voice gesture has a non-voice equal, and every high-stakes gesture stays non-voice.** Hold-to-confirm
  keeps its switch-control alternative; the high-value typed amount is reachable by keyboard; the mic is never
  the *only* way to do anything, and the confirm gesture is never *available* to the mic. Accessibility here is
  the same discipline as safety: parity for capture, exclusivity of the gate.

---

### 8.7 · States & failure design — the honest unhappy paths

Voice adds failure modes the keyboard doesn't have. Each gets Ch3 §21 treatment — **reason + suggestion**,
never a raw error, never a silent fake, and always a fall-back to the typed composer that already ships.

| Failure | What we do (roadmap) |
|---|---|
| **Mistranscription** | Caught at the `draft` ratification seam (§8.3) before any money intent runs; user edits or re-records. |
| **Low-confidence / ambiguous transcript** | Degrade to `clarify`, not a guess — *"I heard 'Ria' or 'Rahul' — which?"* (mirrors parser behavior). |
| **STT/network unavailable** | Honest banner + the mic falls back to the **typed composer** (the shipped, always-available path). Never a spoken "done" with nothing behind it. |
| **Silence / timeout** | Return to `idle`, capture discarded, no partial intent left half-built. |
| **Mic permission denied** | Plain explanation + the typed path stays fully functional; we never nag or dark-pattern the permission. |
| **Offline, mid-request** | Any money action needing the network is disabled **up front** (UX §5.6) — the failure is surfaced before the tap/utterance, not discovered after. |

The governing instinct is Doctrine §3 rendered for the ear: a voice channel that can't do the thing **says so**
and hands over to a channel that can — it never performs a confident success it didn't earn on-chain.

---

### 8.8 · Definition of done — before voice ships

Voice is not "done" when it transcribes. It is done when every box below is true — the Build-Loop exit gate for
this feature:

- [ ] Speech routes through the **identical** parse → plan → gate → **device-signature** pipeline as typed
      input; no privileged path, no fund-moving tool exposed to the model.
- [ ] Every fund-moving intent passes the **transcript-ratification seam** (§8.3); no money action runs off an
      unconfirmed transcript.
- [ ] A money action captured by voice still lands on the **visual confirm sheet**; a spoken "yes" is **never**
      the `GuardAck`, and mainnet still demands the explicit ack (+ high-value ack over cap).
- [ ] **Full typed parity** both ways; nothing is voice-only; the confirm gesture is never voice-satisfiable;
      hold-to-confirm keeps its switch alternative.
- [ ] Spoken output is **on-voice** (Ch2 §4): concise, calm, numbers verbatim, no hype/guarantees; every
      spoken figure is a **grounded, cited fact** (AI.md §5) and is **also on screen** (captions).
- [ ] TTS **defers to VoiceOver/TalkBack**; no double-speak; Dynamic Type + transcript honored.
- [ ] The mic is **off by default**, push-to-talk (or opt-in wake word), with an honest, announced listening
      indicator; the recovery phrase is **never** spoken or transcribed.
- [ ] Every failure path (§8.7) degrades to the **typed composer that ships today**, with reason + suggestion —
      never a fake success.

> **The final word for voice.** The dream is that you say what you want and it happens. Half of that dream is
> ours to make effortless — the *saying*. The other half is the half we refuse to automate away: the
> *happening* is still a plan you can see, a risk you can read, and a signature only your device can make. We
> will let you talk to your money. We will never let your money be moved by talk alone.


## §9 · Personalized Assistant Behavior & Trust-Building UI Patterns

*The character the assistant keeps, and the patterns that let a stranger believe it with their own money on the line.*

Every other section of this chapter builds a machine: a conversation that projects a pipeline (§1), a
parser that turns a sentence into a typed shape (§2), context and memory that carry the user forward (§3,
§4), planning and execution screens that show the work (§5, §6), the approval flow where a device disposes
of funds (§7), and voice as the roadmap surface on top of all of it (§8). This section is about the *feeling*
that has to run through all of them, because a wallet is not a productivity app: the cost of the user
mistrusting it is not annoyance, it is *money*, and the cost of the user *over*-trusting it is the same. So
the emotional throughline of the whole chapter is a single, unglamorous discipline — **the assistant is
worth exactly as much trust as it can demonstrably earn, and the UI's job is to make that amount legible at
a glance.** Not more (a confident lie is the worst thing we can produce — PRODUCT.md §2.9). Not less (a
wallet so hedged it's useless fails the wedge). This is the CPO's section because it is where personality,
personalization, and honesty stop being three topics and become one product decision: *does this stranger
understand what is about to happen to their money, believe it's true, and feel calm doing it?* (UX_GUIDELINES
§0). If no, it does not ship — no matter how clever the model.

Three seams belong to siblings and are referenced, not re-derived here: the *durable substrate* of what is
remembered and the non-custodial line it never crosses is §4 (AI Memory); the *mechanics* of clarification
and confidence-mirroring live in §2 (Intent Understanding); and the *guards themselves* — the risk gate,
the mainnet ack, `autoDecision` — are §7 (Human Approval Flows). This section owns the **character** the
assistant keeps across all of them, and the **UI pattern library** that turns doctrine into pixels a
first-timer can feel.

---

### §9.1 · The personality contract, expressed as microcopy

Chapter 2 §4 fixes the assistant's voice in four adjectives — **Professional · Calm · Clear · Confident** —
and four prohibitions: it must **never create hype, manufacture FOMO, promise profits, or give financial
guarantees.** Those are easy to nod at and easy to violate, because the violations *feel* helpful in the
moment. This subsection makes the contract enforceable by writing it as microcopy: the same situation, the
off-voice version we reject, and the on-voice version we ship. The rule the table encodes is
UX_GUIDELINES §2: *we sound like a competent private banker who respects you — never a hype-machine, never a
scold, never a chatbot performing personality.*

| Situation | ❌ Off-voice (rejected) | ✅ On-voice (shipped register) | Why |
|---|---|---|---|
| A swap looks favorable | "🚀 Great time to ape into ETH — don't miss this!" | "This route converts your 100 USDC to ~0.031 ETH. Here's the cost and the floor you're guaranteed." | No hype; no FOMO; state the outcome, show the number. (Ch2 §4) |
| User asks if a token will go up | "ETH is looking bullish — could easily 2x." | "I can't predict prices, and I won't guess with your money. I can show you what this asset is and what a swap into it would cost." | No profit promise, no guarantee; hand back what we *can* do. (PRODUCT.md §2.4) |
| A plan is ready | "You're all set — trust me, this is the best route! 🎉" | "Plan ready. 2 steps · ~12 min · total cost $21.30 (1.01%). Review the details before you sign." | Confident, not boastful; "best" is a claim we'd have to prove (Ch2 §4 — "never *Best route selected*"). |
| User makes an error | "❌ Nope, that's wrong. You need to pick an asset first." | "I need one more detail: which asset do you want to send?" | Calm, never a scold; the error hands the next step. (UX_GUIDELINES §2) |
| A number is being computed | *money figure typewriter-animates digit by digit* | *the amount renders whole, instantly* | "A number that types itself in looks like it's being invented." (UX_GUIDELINES §2.2) |

**Confident is not the same as certain.** The fourth adjective is the one most often misread. *Confident*
means the assistant states what it knows plainly and does not hedge every sentence into mush; it does **not**
mean it projects certainty it doesn't have. The two live together honestly because confidence attaches to
*process*, never to *outcome*: the assistant is confident that it parsed your intent, confident that the gate
checked it, confident that the number on the confirm sheet is the number you'll sign — and openly uncertain
about anything the future or a thin liquidity pool controls. That is the private-banker register: sure of the
mechanics, never of the market.

**Streaming prose, atomic money.** A subtle but load-bearing craft rule sits under the whole voice. AI.md §10
allows a response to *stream* when it runs past ~1s, and streaming prose reads as thinking-out-loud, which is
warm. But **money figures never stream** — the amount you're committing to, the fee, the min-received all
render *whole and instantly* (UX_GUIDELINES §2.2). The reason is trust, not performance: watching an
explanation type itself out feels like a person reasoning; watching a *balance* type itself out feels like
one being fabricated. So the pattern is precise — narrate freely, but the second a number is a *commitment*,
it appears atomically, in tabular numerals, sourced from the plan, not the prose.

---

### §9.2 · The trust-pattern library — doctrine rendered as UI

Trust is not a copy tone; it is a set of *recognizable patterns* the user meets in the same shape every time,
until recognition itself becomes the safety feature (PRODUCT.md §2.5 — "users must recognize it with their
eyes half-closed"). Below is the catalog. Each pattern is a promise the interface keeps, with where it ships
today. Siblings own the deep mechanics; this catalog is the single place they're named as *one library*.

| # | Pattern | The promise it keeps | Where it lives (V2) |
|---|---|---|---|
| **P1** | **Show the work** | Never "Best route selected." The assistant states *why* — steps, partners, cost, ETA — before it asks for a signature. | `PlanFlow` reasoning line (`🧠 …`) + PlanCard anatomy (§5); Ch2 §4 |
| **P2** | **Honest states, always all of them** | Loading ≠ empty ≠ partial ≠ stale ≠ error ≠ offline ≠ success. Each is designed, not defaulted. | State matrix (UX_GUIDELINES §5); balances four-state (§5.2) |
| **P3** | **Network-fail ≠ $0** | A chain that errors reads "—", never `$0`; the total *says* what it excludes. | Balance layer `null` vs genuine `0` (UX_GUIDELINES §5.2) |
| **P4** | **Disclosure before action** | What / why / cost / time / risk / result — shown *before* commit, never after. | Trust Rules (Ch2 §9); PlanCard (§5) |
| **P5** | **Restate the money, verbatim** | The exact amount + destination is echoed at the confirm boundary, sourced from the plan. | ConfirmSheet / mainnet `alertdialog` (UX_GUIDELINES §2.2, §6.2) |
| **P6** | **Reversibility where it exists; irreversibility stated once where it doesn't** | Pre-signature everything is free to abandon; the signature is named as the point of no return, once, plainly. | `FlowPhase` pre-sign is free to leave (§7); UX_GUIDELINES §6.4 |
| **P7** | **Label the play-money and the real-money** | Testnet is labelled testnet; capped mainnet is labelled capped; nothing implies broader coverage than exists. | Network mode labels; mainnet guard + $1k cap (UX_GUIDELINES §6.2, §12) |
| **P8** | **The scary stuff is available, not foregrounded** | Hashes, addresses, provider names, raw codes live under "Details" — present for who wants them, absent from the calm path. | Progressive disclosure (UX_GUIDELINES §5.4) |
| **P9** | **No fake success** | A green check is earned on-chain or not shown. If we can't broadcast it, we say so and sign nothing. | "can't be executed in-browser yet — nothing was broadcast" (UX_GUIDELINES §4.3) |
| **P10** | **Surface uncertainty, never smooth it** | Below the confidence floor a response *must* carry an uncertainty note. Doubt is a first-class UI element. | Confidence floor `0.55` → `uncertaintyNote` (AI.md §5); see §9.4 |

The through-line of all ten: **the interface never asks the user to trust blindly.** P1–P5 are what we show
*before* an action; P6–P7 are how we frame *what kind* of action it is; P8–P10 are how we stay honest when
things are uncertain, partial, or impossible. A screen that's beautiful but skips one of these fails the UX
exit gate (UX_GUIDELINES §13), because a missing honest state is exactly where a wallet quietly becomes a lie.

**The cornerstone, made concrete (P3).** The single most-tested trust property in the codebase deserves its
render here, because it is the difference between a wallet you can and can't leave your savings in:

```
┌─ Portfolio total ─────────────────────────────────────────────┐
│  Net worth                                                     │
│  $4,210.55                                                     │
│  ⚠︎ Bitcoin couldn't be reached — the total excludes it.       │
│     [ Retry ]                                                  │
└────────────────────────────────────────────────────────────────┘
```

That banner is the whole doctrine in one component: the number did not silently shrink to hide a failed read,
the failure is *named*, the missing asset is *excluded with a notice* rather than averaged to zero, and the
next action (Retry) is offered (UX_GUIDELINES §5.2). A genuine zero, by contrast, renders as an honest
`$0.00`. Two different truths, two different UIs — never conflated.

---

### §9.3 · Personalization that serves the user (and the line it will not cross)

Personalization is where "helpful" and "manipulative" share a border, so we draw the border in the UI, not
just the ethics deck. §4 owns the *substrate* — what is remembered, and the fact that the memory shape is
structurally secret-incapable. This subsection owns the **surfaced behavior**: how a remembered fact becomes
a suggestion on screen, and the rules that keep that suggestion in service of the user rather than of our
metrics.

**The governing distinction (PRODUCT.md §9.4).** Personalization exists to *reduce work and error*, never to
*increase engagement*. Every personalized surface has to answer one question: does this make the user's next
*correct* action faster, or does it make some *fee-bearing* action more tempting? The first ships; the second
is an anti-metric we refuse to optimize. Concretely, the assistant may:

- **Pre-fill a proposal the user still confirms** — recall that "Rahul" is a saved contact and put his
  address into a plan the user then reads verbatim (the recall is a convenience, never an authorization —
  §4.4).
- **Surface a *relevant next action*, honestly framed** — "You have 40 USDC sitting idle on Base" is a fact;
  it is not "Act now before gas spikes!"
- **Default to the user's stated preference** — the usual slippage (0.5% today), a preferred route bias
  (cheapest / fastest / safest, roadmap) — always visible and always overrideable.
- **Skip a question it already, this session, had answered** — context, owned by §3.

And it is **structurally forbidden** from doing anything on the disposal side, no matter what it remembers: a
preference cannot set a plan `ready`, weaken a cap, override a `block`, or auto-fire a transaction — those
sit downstream of *all* memory behind Risk + Policy + the device signature (AI.md §5, §7). Personalization
makes the *safe path faster*; it never makes an *unsafe path reachable.*

**The anti-pattern list, as UI rules.** Because a *personalized* nudge is still a nudge, the personality
prohibitions (Ch2 §4) bind the suggestion surface exactly as they bind ordinary prose. We do not build:

- **Urgency nags** — no countdowns manufactured to pressure a trade, no "prices moving fast." (Real
  countdowns exist only where they're *true* — a quote expiry, UX_GUIDELINES §4.2 — and they de-escalate to
  "Get new quote," never to loss.)
- **Engagement loops** — no "you usually trade around now," no streaks, no confirm-shaming ("are you sure you
  want to stay safe?" is on the forbidden list, PRODUCT.md §5.2).
- **Opaque profiling** — every learned preference flips an *explicit opt-in the user can see and reset*
  (AI.md §7); there is no behavioral score the user can't inspect. The memory manager that makes this legible
  ("what do you remember about me?") is the §4.5 roadmap surface.

**A suggestion that respects the user — every state.** Here is the shipped-register version of a relevant
next action, with the states it can resolve into, and the gate it does *not* soften:

```
User: (opens the assistant; has 40 USDC idle, a saved "cheapest route" bias — roadmap)

┌─ suggestion (a fact + one honest option, never a nag) ─────────────┐
│  You're holding 40 USDC that isn't earning or allocated.           │
│  Want me to show what converting it to ETH would cost?             │
│  [ Show me ]   [ Not now ]                                         │
└────────────────────────────────────────────────────────────────────┘
   ▸ [ Not now ]  → it goes away and does not re-nag this session.
   ▸ [ Show me ]  → this is a *read*, not a commitment:

┌─ thinking ─────────────────────────────────────────────────────────┐
│  role="status" aria-live="polite" → "Pricing that…"  (cancellable) │
└────────────────────────────────────────────────────────────────────┘

┌─ PlanCard (proposal — nothing has happened) ───────────────────────┐
│  Convert   40.00 USDC → ~0.0125 ETH (at least 0.0124)              │
│  Total cost   $0.19 (0.47%)          Risk  🟢 Low                  │
│  [ Review & sign ]                                                 │
└────────────────────────────────────────────────────────────────────┘
   → Authorize (gate can only refuse) → Sign on device → real result / honest failure.
```

Note the discipline: the suggestion is a **fact plus one option**, dismissible without friction; accepting it
produces a *proposal*, not an execution; and the money still flows through the identical Plan → Authorize →
Sign → Confirm machine every other action uses. Personalization changed *what was suggested*; it changed
*nothing* about the gate. That is the invariant that lets us surface relevant actions without becoming the
casino we refuse to be (PRODUCT.md §4.2 — the "let the bot trade for me" user is one we disappoint on
purpose).

---

### §9.4 · Saying "no," and saying "I'm not sure," gracefully

The truest test of the assistant's character is not what it does when it can help — it's what it does when it
*can't*, or *shouldn't*, or *isn't certain*. A lesser assistant fails silently, fakes a success, or guesses
confidently. Ours refuses plainly and hands back the next step, because **a truthful "no" is a feature, and a
surfaced doubt is a safety mechanism** (Ch3 §21 — error design is always reason + suggestion). There are four
distinct "no"s, and they must not be confused, because collapsing them into one generic apology destroys the
information the user needs.

**(1) Scoped refusal — "I can't do that *yet*, here's what I can."** When the user asks for a capability we
don't ship, the parser emits a typed `unsupported` intent carrying a plain-language `reason`
(`packages/intents/src/schema.ts`), and the UI renders it as a boundary plus a doorway — never a dead end:

> **User:** *"Short ETH with 5x leverage."*
> **Assistant:** *"I can't do leverage or derivatives — that's not something this wallet does. What I *can*
> do: convert, send, receive, and stake across your chains. Want to do any of those?"*

This maps to `INTENT_UNSUPPORTED → "I can't do that yet — here's what I can"` + capability chips
(UX_GUIDELINES §5.3). The rule (UX_GUIDELINES §3.3): *never a silent failure, never a fake success* — a
truthful scope statement plus what we *can* do. We never advertise a prompt we can't honor (§1's composer is
seeded only with executable examples), so a refusal here is rare and, when it happens, is honest about the
boundary rather than pretending the feature is "coming soon" when it isn't.

**(2) Clarify — "I need one more detail," not a guess.** When the intent is *supported* but *underspecified*,
the assistant asks exactly one short question rather than proceed on a guess about someone's money. The
deterministic parser already emits these plainly ("How much do you want to send?", "Which asset do you want
to send?", "Convert to which asset?" — `parse/deterministic.ts`), and §2 owns the mechanics. The *trust*
point that belongs here: **a clarify is a first-class success, not an error** (AI.md §4). It renders as a calm
"Needs a detail" card, one question, chips where the options are known (§3.1 — one clarification at a time,
never a paragraph of questions), and it never reveals confidence theater — asking "which Rahul?" must not look
like it's about to move money.

**(3) Uncertainty — "here's my answer, and here's my doubt."** This is the pattern that separates an honest
assistant from a smooth one. The Copilot's confidence starts at 1.0 and is multiplied *down* by every source
of doubt — stale data, missing data, low route confidence, a gate needing confirmation, an LLM retry — and
below the floor (`0.55`) the response **must** carry an `uncertaintyNote` (AI.md §5, `copilot/confidence.ts`).
Doubt is not hidden behind a cheerful answer; it is *rendered as its own UI element*:

> **User:** *"What's my portfolio worth right now?"*
> **Assistant:** *"About **$4,210** — but I couldn't reach Bitcoin just now, so that total leaves it out.
> I'll update the moment it reconnects."* *(the figure renders whole; the caveat is not a footnote)*

The craft rule: the uncertainty rides *with* the answer, in the same breath, phrased as a fact about our
data rather than a hedge about the world. This is the conversational twin of P3 (network-fail ≠ $0) — the
same honesty, expressed in prose instead of a banner. When doubt is high enough that an *answer* would
mislead, the assistant declines the number rather than dress up a bad one.

**(4) The safety refusal — the "no" the user cannot argue past.** Some "no"s are not the assistant being
cautious; they are the *deterministic gate* refusing, and the assistant's job is only to narrate the refusal
truthfully — it has no authority to overturn it (AI.md §1). A risk `block` is non-overridable and offers **no
CTA at all** — a full-width banner with "Why blocked" and "Report mistake," never a button to proceed
(UX_GUIDELINES §6.1; §7 owns the gate). And the injection-veto refusal — which ships today — is the sharpest
example of the assistant saying "no" to *itself*: when fund-moving text smells like an instruction-injection,
the engine forces a `clarify` and refuses to build anything signable, with copy that is calm and names the
line (`packages/intents/src/engine.ts`):

> **Assistant:** *"That message looks like it contains instructions I shouldn't act on, so I won't move funds
> from it. If you do want to send, tell me plainly — e.g. \"send 0.1 ETH to 0x…\"."*

Across all four, the shape is identical to Chapter 3 §21 and the §4.2 recovery-phrase refusal: **reason +
suggestion, stated once, calmly, with no scold and no fake capability.** The assistant never grovels, never
lectures, and never leaves the user at a dead end. A "no" that hands back a "here's what instead" is the most
trust-building sentence the product speaks.

---

### §9.5 · Auto-mode: personality under bounded autonomy

The place where personalization, trust, and the "no" all collide is Auto mode — the one surface where the
wallet acts *without* a per-transaction click. §7 owns the guard; the *trust behavior* belongs here, because
autonomy is where an over-eager assistant would do the most damage. The contract (PRODUCT.md §2.8):
**automation depth equals authorization depth** — the UI never implies the wallet can act beyond what the
user cryptographically granted. Manual is the default; Auto acts *only* within explicit, user-set per-tx and
daily USD caps, *still* signs in-browser, and *still* passes the Risk/Policy gate.

The trust-critical behavior is how Auto *fails*: it fails **safe and loud**, never silent. `autoDecision()`
drops back to a manual, deliberate click whenever it cannot positively proceed — a risk-block, an
unpriced/over-cap amount, or *any* mainnet plan — and it says exactly why, in the calm register:

> **⚡ Auto paused — exceeds daily cap. Confirm manually below.**

That is shipped copy (`apps/web/src/App.tsx` renders `⚡ Auto paused — {autoDec.reason}. Confirm manually
below.`). Three properties make it trustworthy rather than creepy: **a mainnet plan can never auto-fire** —
`execute()` opens the real-funds confirm instead; **Auto never retries a failed tx** — it would loop an RPC
forever, so the manual button reappears for a deliberate retry; and the *reason* is always visible, so the
user is never surprised by either an action taken or an action paused. Bounded autonomy that narrates its own
limits is the opposite of "let the bot trade for me" — it is a private banker who calls you before crossing a
line you drew, every time.

---

### §9.6 · Shipped vs. roadmap — the honest ledger

Personalization and "trust patterns" are exactly the phrases a demo overclaims, so this is the scrupulous
line between what a user experiences today and what is the designed target.

| Capability | Status | Grounding |
|---|---|---|
| Personality register (professional/calm/clear/confident) in all shipped copy | **Shipped** | Ch2 §4; refusal/clarify/guard strings in `App.tsx`, `engine.ts` |
| P1–P9 trust patterns (show-the-work, honest states, network-fail≠$0, restate-money, no-fake-success, labelling, progressive disclosure) | **Shipped** | UX_GUIDELINES §4–6, §12; `PlanFlow` |
| Scoped refusal (`unsupported` → reason + what-we-can-do) | **Shipped** | `IntentSchema` `unsupported`; UX_GUIDELINES §5.3 |
| Clarify-not-guess (one question, chips) | **Shipped** | `parse/deterministic.ts`; §2, §3 |
| Injection-veto refusal (won't move funds from instruction-like text) | **Shipped** | `engine.ts` `looksLikeInjection` |
| Non-overridable risk `block` with no CTA | **Shipped** | UX_GUIDELINES §6.1; §7 |
| Confidence floor `0.55` → `uncertaintyNote` (P10) | **Shipped (pure, tested)** | `copilot/confidence.ts`; surfaced-in-chat is roadmap |
| Pre-fill from saved contacts / held symbols | **Shipped** | `contacts.ts`; `ParseContext` (§4) |
| Auto-mode fails safe + loud ("Auto paused — {reason}") | **Shipped** | `autoDecision`; `App.tsx` |
| Surfaced relevant-next-action suggestions ("idle USDC…") | **Roadmap** | design target; §4 substrate exists |
| Learned-pattern personalization + conversational memory manager | **Roadmap** | AI.md §7; PRODUCT.md §8.2; §4.5 |
| Voice as a refusal/uncertainty surface | **Roadmap** | §8 |
| Any personalization that sets a plan `ready`, weakens a cap, overrides a `block`, or auto-fires mainnet | **Never — by construction** | AI.md §1, §5; Doctrine #2 |

The last row is the point of the whole section. Everything above it can grow richer — the assistant will, over
time, personalize more warmly and refuse more gracefully — but that final line does not move. The character we
are building is not "an assistant that does more for you." It is **an assistant that earns exactly the trust it
can prove, tells you the truth about the rest, and only ever proposes to a gate that can refuse and a
signature that is only yours.** That is the emotional throughline: not a friendlier bot, but a *more honest
one* — and honesty, held this strictly, is the most personal thing a wallet can offer.

*See also: §2 (Intent Understanding) for clarify mechanics and confidence-mirroring; §4 (AI Memory) for the
memory substrate and secret-incapable shape this personalization sits on; §5 (Planning Screens) for the
PlanCard that P1/P4/P5 render into; §6 (Explainable Execution) for show-the-work at execution time; §7 (Human
Approval Flows) for the guards §9.3–§9.5 can never soften; §8 (Voice-First) for these patterns on the roadmap
voice surface.*


---

## Where this sits

This is the reference behind [Chapter 4 — the Conversation-First UX charter](../bible/chapter-04-conversation-first-ux.md),
and the material Volume IV is built from. It draws the shipped-vs-roadmap line explicitly: the deterministic
fast-path parser + the schema-forced LLM, the `PlanFlow` (plan → risk → cost → min-received → authorize →
sign → execute → confirm), Auto/Manual mode (`autoDecision`, Manual default), and the mainnet guard are real
today; voice, long-term goals, research, and rich personalized memory are roadmap — designed here so they
are built without ever crossing the non-custodial line or giving the AI signing authority.
