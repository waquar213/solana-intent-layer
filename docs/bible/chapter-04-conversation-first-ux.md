[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Chapter 4 of the enterprise specification

# Chapter 4 — Conversation-First UX & AI Interaction Model

> **Version 3.0** · *The chapter that separates Intent Wallet from MetaMask — where a "wallet" becomes an AI-native operating system.*

**Chapter objective.** This is the charter for how the user and the AI talk, and how that conversation
becomes safe, executed action. It is the product's biggest competitive advantage. This chapter describes the
**target experience**; the shipped-vs-roadmap split and the buildable flows (grounded in the real intent
pipeline) live in the **[Conversation-First UX Reference](../ai/)** (Volume IV). The hard boundary never
moves: **AI proposes, deterministic code verifies, the device signature disposes.**

---

## Philosophy

The wallet is **NOT an application. The wallet is a financial assistant.**

Users should never think *"How do I swap?"* — they think *"I want ETH."* The wallet figures out everything
else.

---

## Principle 1 — AI is the Operating System

| Traditional Wallet | Intent Wallet |
|---|---|
| Wallet → User → Blockchain | User → **AI** → Intent Engine → Execution Engine → Blockchain |

The AI becomes the operating system between the person and the chain.

---

## Principle 2 — Every interaction starts with conversation

Never force forms. Ask naturally.

> Instead of `Token · Amount · Chain · DEX · Bridge`, ask:
> **"What would you like to do today?"**

---

## Conversation Types

| # | Type | Example |
|---|---|---|
| 1 | **Simple** | *Buy BTC* |
| 2 | **Multi-step** | *Move everything from Ethereum to Solana* |
| 3 | **Financial Advice** | *How risky is my portfolio?* |
| 4 | **Research** | *Why is ETH falling today?* |
| 5 | **Automation** | *Every Monday buy ₹5000 BTC* |

---

## AI Conversation Rules

The AI must, in order:

**Understand → Clarify *(only if necessary)* → Think → Research → Build Plan → Explain → Wait for approval
*(if required)* → Execute → Summarize.**

---

## AI Memory

The wallet remembers — and never asks twice:

- Preferred currency
- Preferred language
- Favorite assets
- Trusted contacts
- Risk tolerance
- Gas preference
- Bridge preference
- Trading style
- Notification preference
- Automation rules

*(Memory never holds a secret, seed, or key — that is the non-custodial line, per the Doctrine.)*

---

## AI Personality

Should feel like a **Senior Financial Advisor** — never a **Salesman.**

Never: hype · create FOMO · promise profits · use emojis excessively · give guarantees.

---

## Intent Classification

Every message belongs to exactly one class; the AI classifies automatically:

**Transaction · Research · Question · Portfolio · Automation · Security · Settings · Support · Developer ·
Enterprise.**

---

## Clarification Engine

Only ask when ambiguity genuinely exists.

> **User:** Send Rahul money.
> **AI:** Which Rahul? — *Rahul Sharma · Rahul Gupta · Rahul (ENS)*

---

## AI Planning Screen

Never jump directly to execution. Show the build:

```
Understanding request       ✓
Finding liquidity           ✓
Security analysis           ✓
Simulation                  ✓
Building execution plan      …
Ready
```

---

## Explainability

Every execution includes: **Why → How → Cost → Risk → Time → Expected result.**

> *I selected Across + Uniswap because:*
> • lowest fee  • lowest slippage  • fastest execution

---

## Human Approval Model

Three approval levels, matched to risk:

| Level | Behavior |
|---|---|
| **Low Risk** | Automatic *(only if the user enabled automation, within their caps)* |
| **Medium Risk** | Quick confirmation |
| **High Risk** | Detailed review — simulation · risk explanation · final approval |

The device signature always disposes; the AI never signs.

---

## AI Learning

After execution, the AI learns to improve future suggestions:

- Did the user cancel?
- Did the user change the route?
- Did the user reject the fees?
- Did the user ignore the recommendation?

---

## AI Context Window

The assistant always knows — without asking again:

**Portfolio · Open transactions · Recent activity · Automation rules · Connected wallets · Preferences ·
Market conditions.**

---

## Voice Interaction

Users can speak an intent:

> *"Send ₹10,000 worth of ETH to Ahmed. Keep gas low."*

The AI converts speech into a structured intent. *(Voice never signs — the confirmation stays explicit.)*

---

## AI Confidence Score

Every answer carries a confidence. **99% → high confidence.** If confidence is low, the AI **asks
questions — it never guesses.**

---

## Error Recovery

Never a dead end.

> Instead of *"Transaction failed,"* the AI says:
> *"The bridge has low liquidity right now. I found two alternatives —*
> **Option A** (cheaper) · **Option B** (faster).*"*

---

## Multi-turn Conversations

The conversation continues naturally:

> **User:** Buy BTC.
> **AI:** How much?
> **User:** ₹25,000
> **AI:** From which account?
> **User:** Main wallet.
> **AI:** Done.

---

## AI Notifications

Human, with the value made visible:

> Instead of *"Swap completed,"* the AI says:
> *"Your swap completed successfully. You saved approximately $2.18 compared with the average route."*

---

## AI Dashboard — the Daily Briefing

> **Good morning.**
> Portfolio **+3.1%** · Gas **Low** · ETH **bullish momentum**
> **One approval needs review.**

---

## AI Goals

Users can state a goal; the AI converts it into a long-term plan:

*"Help me save ₹1 crore" · "Generate passive income" · "Reduce portfolio risk" · "Prepare for taxes" ·
"Optimize yield."*

---

## Anti-Patterns

Never:

- ask unnecessary questions
- expose blockchain jargon
- recommend hype
- recommend unknown protocols without explanation
- hide fees
- hide risks
- **auto-execute beyond the user's granted permissions**

---

## Claude Rule

Every AI feature must answer:

1. What is the user's real intent?
2. Can AI simplify this?
3. Does this increase trust?
4. Can one question be removed?
5. Can one click be removed?
6. Can one screen be removed?

*If yes → remove it.*

---

## What Chapter 4 commits us to

- **The AI is the operating system** between the person and the chain — conversation is the interface, not
  forms.
- **Understand → clarify → plan → explain → approve → execute → summarize** is the fixed rhythm; the AI
  never jumps to execution and never guesses when unsure.
- **Explain everything; remember everything permitted; sign nothing.** The AI proposes and explains; the
  device disposes; memory never holds a secret.
- **Approval scales with risk**, and nothing auto-executes beyond the user's granted permissions.
- **The assistant is a senior advisor, never a salesman** — no hype, FOMO, guarantees, or hidden fees/risks.

The buildable flows, and the honest shipped-vs-roadmap split (voice, long-term goals, research, and rich
memory are largely roadmap today), are in the [Conversation-First UX Reference](../ai/) (Volume IV).

---

### 📖 Chapter 5 Preview — Universal Identity & Account System

The core innovation: the user manages only a few addresses while the wallet intelligently handles many
chains and protocols behind the scenes. It will define: the **3-address architecture** (BTC + Solana +
Universal EVM), **smart account abstraction**, **human-readable identity**, a **universal username**,
**address virtualization**, **cross-chain account mapping**, **recovery architecture**, the **device trust
model**, **multi-device sync**, and **enterprise identity**.
