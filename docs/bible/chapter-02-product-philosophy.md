[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Chapter 2 of the enterprise specification

# Chapter 2 — Product Philosophy & First Principles

*One philosophy, so every future decision — design, engineering, AI, security, product — follows the same law.*

**Chapter objective.** This chapter exists so that a designer, an engineer, an AI researcher, a security
reviewer, and a product manager, working on entirely different parts of Intent Wallet, all reach for the
*same* philosophy when they decide. It is the charter — short enough to hold in your head and cite from
memory. Its full, numbered expansion (the 50 Product Principles, 100 UX Rules, 30 Design Laws, 30 AI Rules,
the Decision Framework, the 28 Anti-patterns, and the flagship UX Blueprint) lives in the
**[Product Operating Manual](../product/product-operating-manual.md)** — the depth this charter governs.

---

## Section 1 — First Principles

### Rule 1 — Intent Before Interface
The user interface must never be a blockchain interface. The user does not want to *operate* a blockchain;
the user wants a *result*.

> ❌ **Wrong** — Select Network → Select Bridge → Select Token
> ✅ **Right** — *"Move my USDC to Solana."*

### Rule 2 — AI Is The Primary Interface
The AI is the front door, not a feature buried in a tab.

- **Home Screen = AI.**
- **Portfolio** second.
- **Settings** last.

### Rule 3 — Complexity Must Be Earned
Advanced options do not appear by default. They are for power users who ask for them. The default shows the
outcome; the mechanics are one tap away, never in the user's face.

| | Shown |
|---|---|
| **Default** | Network Fee · **$0.42** |
| **Advanced** (on request) | Route · Ethereum → Across → Base → Aerodrome → USDC |

### Rule 4 — Explain Every Decision
The AI never says *"Best route selected."* It shows its work.

> *"I compared 18 liquidity sources. This route saves approximately $3.10 in fees and reduces estimated
> execution time by 14 seconds."*

### Rule 5 — Never Surprise The User
No hidden action. No silent transfer. No hidden approval. Ever. If money moves or permission is granted,
the user saw it coming and it was theirs to allow.

---

## Section 2 — UX Laws

| # | Law |
|---|---|
| **Law 1** | One screen → **one purpose**. |
| **Law 2** | One screen → **one primary CTA**. |
| **Law 3** | No screen should exceed **five primary actions**. |
| **Law 4** | Everything secondary belongs inside a **Bottom Sheet or Details**. |
| **Law 5** | Every screen should be understandable **within 5 seconds**. |

---

## Section 3 — Product Rules

Every feature must answer, before it is built:

1. **Why does this exist?**
2. **Which user problem does it solve?**
3. **Why can't the AI solve it automatically?**
4. **Can it be removed?**

If the answer to #4 is *yes* → **delete it.**

---

## Section 4 — AI Personality

The AI should sound: **Professional · Calm · Clear · Confident.**

It must **never**:

- create hype,
- manufacture FOMO,
- promise profits,
- or give financial guarantees.

---

## Section 5 — Wallet Personality

The wallet should feel, in order:

**Apple → Minimal → Fast → Trustworthy → Invisible → Helpful.**

Not flashy. Not overloaded.

---

## Section 6 — Navigation Rules

Maximum **five tabs**. Nothing else.

**Home · Portfolio · AI · Activity · Settings**

---

## Section 7 — Animation Rules

Animations exist **only** to: **Explain · Guide · Confirm · Reduce anxiety.**

They never merely **decorate.**

---

## Section 8 — AI Planning Experience

Every intent follows the **same lifecycle**, and the sequence never changes:

**Understand → Research → Build Plan → Risk Analysis → Simulation → Explanation → Review →
Approval *(when required)* → Execution → Confirmation.**

A user who learns this rhythm once can trust it everywhere. The order is a contract: the plan is always
explained and simulated *before* review, and nothing executes before the user's approval where approval is
required by their automation policy.

---

## Section 9 — Trust Rules

The product never asks the user to trust blindly. Before any action, it always shows:

- **What** will happen
- **Why** it will happen
- **Estimated cost**
- **Estimated time**
- **Risk level**
- **Expected result**

---

## Section 10 — Design Principles

Every screen must satisfy, all at once:

- **3-second clarity**
- **One dominant action**
- **Consistent spacing**
- **Accessible typography**
- **Minimal cognitive load**
- **Excellent one-handed usability**
- **Dark mode support**
- **Smooth performance**

---

## Assignment for Claude Code

Before implementing **any** feature, complete this checklist — it is the operating form of the Build Loop
in [`CLAUDE.md`](../../CLAUDE.md) §4 and the [Design Review Gate](../../FOUNDER_BIBLE.md):

1. **Restate the user problem.**
2. **Explain why the feature exists.**
3. **Compare it with existing solutions.**
4. **Identify edge cases.**
5. **Identify security risks.**
6. **Propose the simplest UX.**
7. **Validate consistency with the Design System.**
8. **Implement.**
9. **Write tests.**
10. **Generate documentation.**
11. **Perform a self-review.**

A feature that skips a step is not done — it is unreviewed.

---

## What Chapter 2 commits us to

- **One philosophy across every discipline.** Design, engineering, AI, security, and product all decide
  from this charter — so the product stays coherent as the team grows.
- **Intent before interface; AI as the front door.** The product is a sentence resolved into a proven
  outcome, not a set of blockchain controls.
- **No surprises, ever.** Money moves and permissions are granted only when the user saw it coming.
- **A fixed planning lifecycle** the user can learn once and trust everywhere.
- **Trust by disclosure, not by faith** — what, why, cost, time, risk, result, every time.

The full, citable expansion of every rule above — and the flows that implement them — is the
[Product Operating Manual](../product/product-operating-manual.md).

---

### → Next: Chapter 3 — The Design System (Apple Design Bible)

The most important chapter for visual identity. It defines the Apple-level spacing system, the typography
scale, the color system, icons, components, cards, buttons, input fields, the AI chat UI, motion &
animations, haptic feedback, bottom sheets, charts, empty states, loading states, skeleton screens, and the
design tokens — ensuring every screen speaks one premium design language.
