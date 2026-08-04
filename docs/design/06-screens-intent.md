# 06 — Screens: Intent Chat, Plan Confirmation, Execution, Activity, Notifications

## S-20 Intent Chat (the product)

- **Purpose:** natural-language money. Feels like messaging a competent private banker, not a chatbot.

```
┌──────────────────────────────┐
│  Ask                    ⓘ    │
│                              │
│  (day 1: 3 starter cards)    │
│  ┌─ Convert between coins ─┐ │
│  ┌─ Send money to someone ─┐ │
│  ┌─ What can you do? ─────┐  │
│                              │
│           You: Convert my    │
│           BTC to ETH     ▷   │
│  ┌──────────────────────────┐│
│  │ PlanCard (see 02-comp.)  ││ ← plans render as cards, not prose
│  │  [Review & approve]      ││
│  └──────────────────────────┘│
│ ┌ ✦ Ask anything…       🎤 ┐ │
└──────────────────────────────┘
```

- **Components:** message list (user bubbles right, system cards left — the assistant NEVER sends walls of prose for money actions: cards only), CommandBar, starter cards, clarification chips.
- **Conversation rules:**
  - Parse result is mirrored first in one line ("Converting **all your BTC (~$2,100)** to **ETH** — correct?") when confidence < high; verbatim amounts always restated.
  - Clarifications are chip questions ("Which Rahul?" [Rahul K ·da94] [Rahul S ·9f2c] [Someone new]) — max one clarification at a time.
  - Unsupported asks get honest scoped answers ("I can't do leverage. I can convert, send, and soon stake.").
  - Read-only questions ("what's my biggest holding?") answered inline with a mini portfolio card — no confirmation theater for reads.
- **States ⭘:** thinking (assistant bubble shimmer ≤ 2.5 s budget) · degraded (LLM down: banner + starter cards become form launchers) · plan-expired-in-chat (card dims + [Get new quote]).
- **Validation:** none client-side on text — the pipeline owns it; but send disabled on empty/whitespace.
- **Errors ⭘:** parse failed twice → "I didn't get that. Try one of these:" + 3 template chips (never a third silent retry).
- **Empty ⭘:** day-1 starter cards (above); after first execution, starters are replaced by contextual suggestions ("Convert again", "Set up weekly buy").
- **A11y:** live region politely announces assistant replies; PlanCards announced as summaries; voice input has full typed parity.
- **Micro:** send arrow springs in when text exists; assistant cards slide-fade up 200 ms; NEVER typewriter-effect money numbers (they must appear atomically — trust).

## S-21 Plan Confirmation (ConfirmSheet instance)

The [ConfirmSheet](02-components.md) anatomy with plan specifics — shown as sheet over chat (or over Send step 3):

```
│  ═══ Convert BTC → ETH ═══   │
│  You send    0.021 BTC $2,100│
│  You get ≥   0.612 ETH $2,079│
│  Route       2 steps · ~12min│
│  Total cost  $21.30 (1.01%) ▸│
│  🛡 Low risk                ▸│
│  ⏱ Quote refreshes in 24s    │
│ [   Approve — Face ID   ]    │
│         Cancel               │
```

- **Behavior:** countdown ring on CTA; expiry → CTA morphs to [Get new quote] (one tap re-quotes in place, diff highlighted per PlanCard states); multi-step plans list each signature the user will make NOW vs LATER ("You'll confirm step 2 when it's ready — we'll notify you"), setting expectations honestly (D20).
- **Simulation gate:** CTA stays disabled until simulation-verified effects render (skeleton rows meanwhile) — the user physically cannot approve an unsimulated plan ([Execution Sandbox](../architecture/02-services.md) rule).
- **Errors ⭘:** simulation mismatch → danger panel + Cancel only; RISK_BLOCKED → block banner + "Why" + no CTA; balance changed since quote → auto-requote with notice.
- **A11y:** full read-through before CTA focusable; countdown announced at 10 s.

## S-22 Execution Progress

- **Purpose:** live, truthful, leave-able progress ([StepTracker](02-components.md)).

```
│  Converting BTC → ETH        │
│  ✓ Moved BTC        2:41 PM  │
│  ◐ Swapping to ETH           │
│     Confirming · ~15 sec     │
│  ○ Done                      │
│  ────────────────────────    │
│  ⓘ Safe to close this screen │
```

- **States ⭘ (all designed):** running · waiting-for-signature (step CTA + push if backgrounded) · recovering ("Route changed — reviewing…" when re-quote needs approval → mini ConfirmSheet inline) · **parked** (calm info card: "Paused safely. Your 0.021 wBTC is on Ethereum. Nothing is lost." + [Resume] [Get help]) · completed (S-23) · failed (reason + [Try again] where valid).
- **Behavior:** state is server-truth (survives app kill); backgrounding hands off to push + iOS Live Activity / Android ongoing notification with per-step progress.
- **A11y:** step changes announced; time estimates are ranges spoken naturally ("about four minutes").
- **Micro:** step completion: glyph ✓ draw-on 300 ms + selection haptic; full completion: single celebrate moment (check bloom) — once, not looping.

## S-23 Completion & Receipt

- **Layout:** big ✓, outcome sentence ("You received **0.6138 ETH** — $2,081.02, $1.88 better than quoted"), receipt card: steps with explorer links (behind "Details" — hashes are progressive disclosure), total fees actual vs quoted, timestamps.
- **Actions:** [Done] · [Do this weekly] (contextual automation seed) · share receipt (image, amounts optionally hidden).
- **Micro:** better-than-quoted delta gets a subtle success highlight — honest delight; worse-than-quoted (within slippage) is stated plainly, not hidden.

## S-24 Activity (unified timeline)

- **Purpose:** every money event, grouped per intent (a 2-step conversion = ONE entry that expands).

```
│  Activity        [filter ⌄]  │
│  Today                       │
│  ⇄ BTC → ETH  ✓   −$21.30 fee│
│  ↓ Received USDT      +$200  │
│  Yesterday                   │
│  ⏸ ETH → SOL  Parked      ▸  │ ← parked items float pinned until resolved
```

- **Components:** grouped rows (kind glyph ⇄↑↓⏸, title, status, fiat delta), date sections, filter sheet (type/asset/status), infinite scroll.
- **Loading:** 8 skeleton rows; pagination shimmer footer.
- **Errors:** feed unavailable → cached timeline + banner.
- **Empty:** "Everything you do shows up here — receipts included."
- **A11y:** rows read as sentences ("Converted BTC to ETH, completed today 2:41 PM, fee $21.30").
- **Micro:** pending rows have the provisional pulse dot; expanding a group springs open per `motion.quick`.

## S-25 Pending Transactions

Not a separate silo: Activity filter chip "In progress" + the global execution pill both land here — pending items always visible within normal Activity (no hidden queues; users fear invisible pending money).

## S-26 Notifications Inbox

- **Sections:** Needs you (signature requests, resumable parks — pinned) · Money (received, completed) · Alerts (price, risk) · System.
- **Row:** kind glyph, one-line sentence, relative time; tap deep-links ([03-navigation.md](03-navigation.md) §3).
- **Behavior:** "Needs you" items can't be swipe-dismissed (resolve or open); others swipe-clear; mark-all-read.
- **Empty:** "You're all caught up."
- **A11y:** badge count announced on tab ("Notifications, 2 need your attention").
