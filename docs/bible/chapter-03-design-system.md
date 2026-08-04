[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Chapter 3 of the enterprise specification

# Chapter 3 — Apple-Level Design System Bible

*Design a timeless interface that still feels modern 10 years from now. Every pixel, animation, interaction, and layout should reinforce trust, clarity, and intelligence.*

**Chapter objective.** This is the charter for the product's visual identity — short enough to hold in your
head, strict enough that every screen speaks one premium design language. Its full, buildable expansion
(the real token tables, component state matrices, and the AI chat UI spec, grounded in the live codebase)
lives in the **[Design System Reference](../design/)** (Volume III). When the charter and the reference
disagree on a value, that is a reconciliation item to resolve on purpose — never a drift to ignore.

---

## 1. Design Philosophy

**The interface should disappear.** Users should feel like they are talking to an intelligent financial
assistant — not operating blockchain software.

Every design decision must optimize for: **Clarity · Trust · Calmness · Speed · Confidence.**

Never optimize for visual complexity.

---

## 2. Visual Identity

The product should feel like:

- **Apple Wallet** — simplicity
- **Linear** — precision
- **ChatGPT** — conversation
- **Stripe** — professionalism
- **Notion** — clarity

Never imitate MetaMask or Trust Wallet.

---

## 3. Information Hierarchy

Every screen follows the same priority, top to bottom:

**Primary Focus → Primary Action → Supporting Information → Advanced Details.**

Never show everything at once.

---

## 4. Spacing System

Only **one** spacing scale. Every screen uses it; no random spacing.

`4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64 · 80 · 96`

| Step | Typical use |
|---|---|
| 4 / 8 | icon gaps, tight inline spacing |
| 12 / 16 | control padding, list-row rhythm |
| 24 / 32 | card padding, section gaps |
| 40 / 48 | screen padding, major sections |
| 64 / 80 / 96 | hero spacing, empty-state breathing room |

---

## 5. Border Radius

Only **four** radius values. Consistency is mandatory.

| Token | Radius | Use |
|---|---|---|
| **Small** | 12 | inputs, chips, small controls |
| **Medium** | 16 | buttons, list rows |
| **Large** | 24 | cards, sheets |
| **Hero** | 32 | hero surfaces, primary cards |

---

## 6. Typography

Only **one** font family: **SF Pro** (Apple platforms) · **Inter** (cross-platform). Never mix random sizes.

| Role | Size |
|---|---|
| **Hero** | 48 |
| **Heading** | 32 |
| **Title** | 24 |
| **Subtitle** | 20 |
| **Body** | 16 |
| **Caption** | 14 |
| **Small** | 12 |

---

## 7. Color Philosophy

**95% neutral. 5% accent.** The accent color communicates **action — not decoration.** Avoid rainbow
dashboards.

---

## 8. Components

Every component exists in **one** central design system — no duplicates:

**Button · Card · Input · Search · AI Prompt · Bottom Sheet · Dialog · Toast · Timeline · Portfolio Card ·
Asset Row · Skeleton Loader.**

---

## 9. Cards

Cards represent **information, not decoration.** Every card answers **one** question. Nothing unnecessary.

> **Portfolio Card**
> Net Worth
> **$124,521**  ·  +2.4%
> View Portfolio →

---

## 10. Buttons

One hierarchy — never invent new button styles:

**Primary · Secondary · Ghost · Danger.**

---

## 11. Input Fields

The **AI prompt is the most important input** — the heart of the application.

> **What would you like to do today?**
> `__________________________________`
> *Move 2 ETH to Solana*   **[ Send ]**

---

## 12. AI Planning UI

Never instantly execute. Show progress — this builds trust.

```
Understanding          ✓
Finding Liquidity      ✓
Checking Security      ✓
Simulation             ✓
Preparing Transaction  …
Ready
```

---

## 13. Portfolio Screen

Never overwhelm. Fixed order:

**Portfolio Value → Performance Chart → Assets → Allocation → Recent Activity.**

---

## 14. Activity Screen

Transactions should read like **stories**, not hashes.

> Instead of `0x123… → Swap → Hash`, show:
> **Yesterday** — Swapped **1000 USDC → 0.56 ETH** · Completed

---

## 15. Receive Screen

Only, in order:

**QR → Address → Copy → Share → Advanced Details.**

---

## 16. Send Flow

A wizard:

**Recipient → Asset → Amount → AI Plan → Simulation → Approval → Complete.**

---

## 17. Animation Principles

Animations **explain state** — never decorate.

Allowed: **Fade · Scale · Slide · Progress · Number Count · Card Expansion.** Avoid flashy effects.

---

## 18. Haptics

Every important action should feel **physical**:

**Transaction Approved · Error · Success · Authentication · AI Plan Ready.**

---

## 19. Empty States

Every empty screen **teaches**.

> "No assets yet." → "Buy your first asset." → **[ Primary Button ]**

---

## 20. Loading

Never use spinners for long tasks. Prefer, in order of preference:

**Skeletons → AI Thinking Timeline → Progress Indicators.**

---

## 21. Error Design

Never display raw errors. Always: reason + suggestion.

> **Transaction couldn't be completed.**
> **Reason:** Insufficient liquidity.
> **Suggestion:** Try reducing the amount.

---

## 22. Accessibility

Not optional. Minimum touch target **44×44**. Support **VoiceOver · Dynamic Text · High Contrast ·
Reduced Motion.**

---

## 23. Dark Mode

**Dark mode is the default experience.** Every component must support **Light · Dark · High Contrast.**

---

## 24. Performance Budget

The UI should feel instant:

- Screen transition: **under 250 ms**
- AI response starts: **under 1 second** (streaming if longer)
- **60 FPS** animations
- **No** visible layout shifts

---

## 25. Design Review Checklist

Before any screen ships, ask:

1. Is the primary action obvious?
2. Can a first-time user understand it in under 5 seconds?
3. Is blockchain jargon hidden unless requested?
4. Does the AI explain important decisions?
5. Are animations purposeful?
6. Is the screen accessible?
7. Does it follow the design system?
8. Can anything be removed without hurting the experience? *If yes, remove it.*

---

## What Chapter 3 commits us to

- **One system, no exceptions** — one spacing scale, four radii, one type family, 95/5 color. Consistency
  is the craft.
- **The interface disappears** so the assistant is what the user feels.
- **The AI prompt is the heart**; the planning UI never executes without showing its work.
- **Dark mode and accessibility are defaults, not settings.**
- **Every screen earns its pixels** — if it can be removed without hurting the experience, it is removed.

The buildable expansion — real token values, full component state matrices, and the signature AI chat UI —
is the [Design System Reference](../design/) (Volume III).

---

### 📖 Chapter 4 Preview — Conversation-First UX

The chapter that makes Intent Wallet different from every existing crypto wallet — where a "wallet" begins
to transform into an AI-native operating system. It will define: the **AI conversation architecture**,
**voice-first interactions**, **intent understanding**, **AI memory**, **AI planning screens**,
**explainable execution**, **human approval flows**, **multi-turn conversations**, **personalized financial
assistant behavior**, and **trust-building UI patterns** — the product's biggest competitive advantage.
