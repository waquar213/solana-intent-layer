[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Chapter 7 of the enterprise specification

# Chapter 7 — Universal Intent Engine

> **Version 3.0** · **Mission:** transform natural-language user goals into secure, explainable, optimized blockchain execution plans.

**Chapter objective.** This is the charter for the heart of the product — how a sentence becomes a safe,
executable plan while blockchain complexity stays hidden. It states the pipeline and the guarantees; the
buildable engineering detail (with each stage tagged **shipped** vs **roadmap**) is the
**[Universal Intent Engine Reference](../ai/intent-engine-reference.md)** (Volume IV/V). The invariant never
moves: **AI proposes behind a schema-forced boundary, deterministic code verifies, the device signature
disposes.** A guess about someone's money is the worst output — the engine **clarifies, it never guesses.**

---

## 1. Philosophy

Users should never think in transactions — they think in **outcomes**:

> *"Send ₹20,000 to Ahmed." · "Convert my BTC into ETH." · "Move everything to Solana." · "Stake my SOL." ·
> "Reduce my portfolio risk."*

The Intent Engine translates goals into executable workflows.

---

## 2. Intent Pipeline

Every request follows the same lifecycle — **no shortcuts:**

**User Intent → Intent Detection → Context Collection → Intent Classification → Constraint Analysis →
Execution Planning → Risk Analysis → Simulation → Explanation → Approval *(if required)* → Execution →
Learning.**

---

## 3. Intent Categories

Every request belongs to one or more categories:

| Category | Examples |
|---|---|
| **Financial** | Buy · Sell · Swap · Send · Receive · Stake |
| **Portfolio** | Rebalance · Diversify · Reduce risk · View allocation |
| **Research** | Explain token · Market analysis · Compare assets |
| **Automation** | DCA · Auto-bridge · Auto-stake · Auto-invest |
| **Security** | Check approvals · Revoke permissions · Audit wallet · Scan contracts |
| **Identity** | Manage contacts · Add wallets · Recovery · Devices |

---

## 4. Intent Detection

> **User:** "Move my ETH to Solana."

The AI extracts a structured intent:

| Field | Value |
|---|---|
| Action | Move |
| Asset | ETH |
| Source | Current Wallet |
| Destination | Solana |
| Amount | All |
| Priority | Not specified |

---

## 5. Context Engine

Before planning, collect: **Portfolio · Connected wallets · Gas prices · Liquidity · Market volatility ·
User preferences · Security policies · Automation rules · Network health.**

**No execution starts without context.**

---

## 6. Constraint Engine

Every plan must satisfy constraints: **Lowest fees · Maximum slippage · Tax preference · Trusted protocols
only · Time limit · Risk limit · Preferred assets · Preferred bridges · Preferred DEX.**

If constraints conflict, **explain the trade-off instead of guessing.**

---

## 7. Personal Preference Engine

Remember user choices — **execution speed · fee sensitivity · risk tolerance · favorite networks · preferred
stablecoin · language · notification style** — and adapt over time.

---

## 8. Clarification Engine

Ask **only** when necessary.

> ❌ *"Which bridge?"*
> ✅ *"I found two safe execution plans — **cheaper** or **faster**. Which do you prefer?"*

---

## 9. Intent Planning

One intent may become many operations — the user sees **one goal, not five technical steps:**

> **User:** Convert BTC into ETH on Base.
> **Plan:** Receive BTC → Sell BTC → Acquire USDC → Bridge → Swap → Deliver ETH → Verify Balance

---

## 10. Confidence Engine

Every interpretation receives a confidence score — **never assume when confidence is low:**

| Confidence | Action |
|---|---|
| 99% | Execute |
| 72% | Need clarification |

---

## 11. Explainability Engine

Every plan answers: **why this route · why this protocol · why this chain · why this bridge · why this fee ·
why this timing.** Trust grows through explanation.

---

## 12. Simulation Layer

Before execution, simulate and present clearly: **expected output · gas cost · bridge fee · DEX fee · price
impact · slippage · estimated completion time.**

---

## 13. Multi-Step Intents

Support complex goals:

> *"Move 20% of my portfolio into BTC and stake my remaining SOL."*

The AI creates an execution plan, explains it, and presents it for review.

---

## 14. Goal Engine

The wallet should understand **long-term objectives** — *Save ₹1 crore · Generate passive income · Preserve
capital · Reduce volatility · Prepare for taxes* — as **ongoing strategies**, not one-time transactions.

---

## 15. Intent Memory

Remember **completed · failed · cancelled** intents and preferred execution styles, and use this history to
improve future planning.

---

## 16. Safety Layer

The Intent Engine **never**: bypasses security checks · ignores policy rules · hides costs · executes beyond
granted permissions · recommends unsupported protocols without explanation.

---

## 17. Provider Abstraction

The Intent Engine does **not** hard-code bridges or DEXs. It creates an **abstract execution request**; the
Execution Engine (Chapter 8) later chooses the best provider according to the user's preferences and current
conditions. This keeps the system modular.

---

## 18. Intent Timeline

Every request creates an inspectable timeline:

**Intent Received → Planning → Security Review → Simulation → Waiting Approval → Executing → Completed →
Learned.**

---

## 19. Failure Recovery

If execution cannot proceed, the engine should **explain the reason · preserve the plan · suggest
alternatives · avoid forcing the user to rebuild the request.**

---

## 20. Definition of Success

The Intent Engine succeeds when:

- users express goals in natural language;
- the wallet consistently interprets them correctly;
- plans are explainable;
- risks are transparent;
- execution remains under the user's control;
- the experience feels **conversational rather than technical.**

---

## What Chapter 7 commits us to

- **Outcomes, not transactions** — the atomic unit is a sentence resolved into a proven plan.
- **The pipeline is fixed and gated** — detection → context → classification → constraints → planning →
  risk → simulation → explanation → approval → execution → learning, with a guard that can only refuse.
- **Clarify, never guess; explain, never assert** — low confidence asks a question; every plan shows its work.
- **The engine proposes an abstract request; it never signs** — provider choice and signing live downstream;
  the AI has zero signing authority.
- **Safety is non-negotiable** — no bypass of security, policy, cost disclosure, or granted permissions.

The buildable detail — and the honest shipped-vs-roadmap split (the two-path parser, planner, capability +
risk + policy gates, router, and confidence model are shipped; the Goal Engine, learning-from-actions,
automation, and bridge/stake execution are roadmap) — is the
[Universal Intent Engine Reference](../ai/intent-engine-reference.md) (Volume IV/V).

---

### 📖 Chapter 8 Preview — Universal Execution Engine

How an approved plan becomes a real blockchain operation — turning AI-generated plans into reliable actions
while keeping execution modular, observable, and secure. It will define the **execution graph**, **DEX
aggregation**, **bridge aggregation**, **provider selection**, the **retry strategy**, **partial
completion**, **rollback where possible**, **monitoring**, **settlement confirmation**, **multi-chain
orchestration**, **provider health scoring**, and **execution analytics**.
