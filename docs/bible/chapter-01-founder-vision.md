# Intent Wallet V3 — Founder Bible

> **Version:** 3.0 · **Codename:** Project Aether · **Tagline:** *The AI Operating System for Digital Assets*
>
> This is the canonical enterprise specification, written chapter by chapter. Chapter 1 is the founder's
> charter — the *why*, in the founder's own words. Everything the company builds is traceable back to a
> line in this chapter. The long-form treatment (mission, moat, competitive analysis, metrics) expands in
> [`docs/vision/`](../vision/); this chapter is the crisp constitution those chapters serve.

---

# Chapter 1 — Founder Vision

*The problem, the promise, and the non-negotiables — the foundation the entire project stands on.*

**Chapter abstract.** Intent Wallet V3 is not another wallet, DEX, or bridge. It is a new interaction
model for money: the user expresses an **outcome**, and the platform plans, simulates, explains, secures,
and executes it. This chapter defines the mission, the vision, the product philosophy, the pillars, the
personas we serve, the interaction model that makes us different, and the non-negotiable rules that no
future decision may break.

---

## Mission

Build the world's first **AI-native digital asset operating system** where users express **intent**, not
blockchain operations.

Users should never have to think about:

- Chains
- Bridges
- RPCs
- Gas optimization
- DEX selection
- Liquidity routing
- Token approvals

They simply describe the outcome they want.

> **Example intent**
> *"Convert ₹10 lakh worth of BTC into ETH with the lowest total cost and minimal market impact."*

The platform **plans, simulates, explains, secures, and executes** the intent — and the user's device
signs. The machine does the machine's job; the human states the goal.

---

## Vision

Create the **Apple Wallet + ChatGPT + Stripe + Bloomberg Terminal** for crypto.

- **Not** another wallet.
- **Not** another DEX.
- **Not** another bridge.
- A completely **new interaction model**.

Apple Wallet's calm and trust · ChatGPT's conversational intelligence · Stripe's rails and developer
platform · Bloomberg's depth for those who want it — fused into one product where a first-day user and a
five-year veteran both succeed.

---

## Product Philosophy

### Principle 1 — Intent over Transactions
Never ask: *Which chain? Which bridge? Which DEX?*
Ask: **"What do you want to achieve?"**

### Principle 2 — Hide Complexity
Everything technical remains **invisible** until explicitly requested. Depth is available on demand, never
imposed by default.

### Principle 3 — Explain Every Decision
The AI must explain: **why this route, why this protocol, why this fee, why this execution plan.** An
unexplained recommendation is a defect.

### Principle 4 — Trust Before Speed
Never optimize for speed if it reduces user trust. A slower, understood, verifiable path beats a faster
opaque one.

### Principle 5 — AI Assists
AI **never silently performs irreversible actions outside the permissions the user has granted.** Users
should always have a clear way to review or authorize important actions **according to their chosen
automation policy.**

---

## Product Pillars

| Pillar | The bar |
|---|---|
| **1. Simplicity** | Five-year crypto users **and** first-day users should both succeed. |
| **2. Intelligence** | Every action is planned. Nothing is random. |
| **3. Security** | Security **is the product** — not a feature. |
| **4. Transparency** | Every transaction must be explainable. |
| **5. Performance** | Every interaction should feel instant. |

---

## User Personas

| Persona | In their words | Goal |
|---|---|---|
| **Beginner** | "I don't know what a blockchain is." | Buy crypto. |
| **Investor** | "I manage a portfolio." | Performance. |
| **Trader** | — | Execution quality. |
| **Business** | — | Treasury. |
| **Developer** | — | SDKs and APIs. |

One product, five jobs. The Beginner must never be intimidated; the Developer must never be constrained.

---

## The Home Screen Philosophy

The Home Screen should answer only **three questions**:

1. **What do I own?**
2. **What can I do?**
3. **What is AI recommending?**

Nothing else. Everything that does not serve one of these three questions does not belong on Home.

---

## AI Interaction Model

The difference between a wallet and an operating system for money is where the work happens.

| Traditional Wallet | Intent Wallet |
|---|---|
| Open Wallet | Open Wallet |
| ↓ Choose Token | ↓ Type |
| ↓ Choose Chain | ↓ AI Understands |
| ↓ Choose Network | ↓ AI Plans |
| ↓ Gas | ↓ AI Explains |
| ↓ Approve | ↓ Review |
| ↓ Execute | ↓ Approve *(if required)* |
| | ↓ Done |

The traditional wallet makes the human do seven machine steps. The Intent Wallet asks the human for one
thing — the goal — and does the rest, transparently, with the user's authorization as the disposer.

---

## Navigation Philosophy

Maximum **five tabs**. Nothing more.

**Home · Portfolio · AI · Activity · Settings**

Five destinations a person can hold in their head. Every feature earns its place inside one of them or it
does not ship.

---

## Design Philosophy

Build as if:

- **Apple** designed crypto.
- **OpenAI** designed interaction.
- **Stripe** engineered infrastructure.
- **Linear** designed the interface.
- **Coinbase** reviewed security.

This is the bar, in five names. When a design decision is in doubt, ask which of these five it would fail.

---

## Non-Negotiable Rules

1. **No blockchain jargon on the home screen.**
2. **No unnecessary confirmations.**
3. **Every screen has one primary action.**
4. **Every AI recommendation is explainable.**
5. **Every important transaction is simulated before execution.**
6. **Performance first.**
7. **Accessibility is mandatory.**
8. **Every animation has a purpose.**
9. **Every component belongs to the design system.**
10. **Never sacrifice security for convenience.**

---

## Success Metrics

The product succeeds when users say:

- *"I don't need to know which chain I'm using."*
- *"I trust the AI because it explains its decisions."*
- *"I can do complex DeFi operations in one sentence."*
- *"This feels simpler than online banking."*

These are qualitative north stars. The quantitative north star — **Real Intents Executed** — and its
metric tree are specified in [`docs/vision/07-success-metrics-north-star.md`](../vision/07-success-metrics-north-star.md).
We assert **no traction number we have not earned**: publishing an unearned metric would itself break the
"never fake data" law.

---

## What Chapter 1 commits us to

- **Intent is the interface.** The product's job is to turn a sentence into a safe, executed outcome — not
  to expose chains, bridges, or gas to the user.
- **The five-tab ceiling** and the **three-question Home** are structural, not stylistic.
- **Explainability and simulation-before-execution** are requirements, not features.
- **AI assists within an explicit automation policy** and never disposes of funds silently.
- **Security is the product**, and none of the ten Non-Negotiable Rules may be traded for convenience.

---

### → Next: Chapter 2 — Product Philosophy & First Principles

Chapter 2 turns this charter into an operating manual: **50 Product Principles**, **100 UX Rules**,
**Apple-level Design Laws**, **AI Behavior Rules**, a **Product Decision Framework**, the **Anti-patterns**
(what we never build), and a **world-class wallet UX blueprint**. It is the foundation every screen,
component, and model in the project is measured against.
