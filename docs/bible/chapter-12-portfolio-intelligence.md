[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Chapter 12 of the enterprise specification

# Chapter 12 — Portfolio Intelligence Engine

> **Version 3.0** · **Mission:** transform raw blockchain balances into meaningful financial intelligence — answering not only *"What do I own?"* but *"How healthy is my financial position?"* and *"What should I review next?"*

**Chapter objective.** This is the charter for turning holdings into understanding — a personal financial
command center, not a token list. It states the intent; the buildable detail (with each engine tagged
**shipped** vs **roadmap**) is the **[Portfolio Intelligence Reference](../ai/portfolio-intelligence-reference.md)**
(Volume IV). Two lines never move: **every number is computed by deterministic code and narrated by the AI —
never fabricated** (the AI-narrator boundary), and **an estimate is always labelled an estimate; a network
failure is never rendered as $0** (Doctrine §3).

---

## 1. Philosophy

Traditional wallets show **balances.** Intent Wallet shows **wealth intelligence.**

> Instead of `BTC 1.42 · ETH 18.5`, show:
> **Your portfolio is worth $248,540.**
> Risk: Moderate · Monthly growth: +8.2% · Diversification: Good · Security: Excellent

---

## 2. Portfolio Architecture

```
Wallet Core → Asset Intelligence → Portfolio Intelligence → AI Financial Brain → Dashboard
```

The Portfolio Engine **consumes data from the Asset Engine (Chapter 11)** — it does **not** fetch blockchain
data directly.

---

## 3. Net Worth Engine

Calculate: **total assets · total liabilities (if supported) · estimated net worth · historical net worth ·
daily / weekly / monthly / yearly change.** Always **distinguish estimates from exact on-chain balances**
where applicable.

---

## 4. Real-Time Performance Engine

Continuously monitor — refreshing efficiently, without unnecessary requests: **portfolio value · daily P&L ·
weekly P&L · monthly P&L · yearly P&L · all-time performance.**

---

## 5. Asset Allocation Engine

Automatically categorize holdings; users can drill down into any category.

| Category | Share |
|---|---|
| Bitcoin | 34% |
| Ethereum | 27% |
| Stablecoins | 21% |
| Solana | 10% |
| Others | 8% |

---

## 6. Diversification Engine

The AI evaluates concentration — and **explains, it does not instruct:**

> *"82% of your portfolio is concentrated in one asset. Potential benefits of diversification may be worth
> reviewing if that aligns with your goals."*

---

## 7. Portfolio Health Score

Every score must carry an explanation.

> **Portfolio Health — 91 / 100**
> Diversification ✓ · Liquidity ✓ · Security ✓ · Risk: Medium · Idle Assets: Low · Backup: Complete

---

## 8. Profit & Loss Engine

Display **realized · unrealized · daily · weekly · monthly · yearly** — and **include the methodology** so
users understand how values are estimated.

---

## 9. Cash Flow Engine

Track and visualize trends over time: **money in · money out · fees paid · rewards · yield · transfers.**

---

## 10. Fee Analytics

Track **gas · bridge · swap · protocol** fees; the AI can highlight opportunities to reduce costs.

> **Last month** — Gas $42 · Bridge $18 · Swap $9 · **Total $69**

---

## 11. Yield Dashboard

Track **staking rewards · lending interest · LP fees · farming rewards.** Display **current · historical ·
projected** — with projections **clearly labelled as estimates.**

---

## 12. Goal Tracker

The AI tracks progress toward user goals automatically:

> Emergency Fund **70%** · BTC Target **42%** · Passive Income Goal **18%**

---

## 13. AI Portfolio Coach

Users can ask — and the AI explains **using the user's own portfolio data:** *Why did my portfolio drop? ·
Which asset grew the most? · Which position generated the highest fees? · How has my allocation changed?*

---

## 14. Benchmark Engine

Compare performance against user-selected benchmarks — **for context, not competition:** BTC · ETH · a
diversified crypto index (if supported) · stablecoin holdings.

---

## 15. Risk Dashboard

Monitor, and highlight **trends, not just snapshots:** asset concentration · stablecoin allocation · DeFi
exposure · cross-chain exposure · active approvals · illiquid positions.

---

## 16. Timeline Engine

Generate a financial timeline that helps users understand how their wealth evolved:

**Bought BTC → Received Salary → Staked SOL → Yield Earned → Portfolio ATH → Large Transfer.**

---

## 17. AI Monthly Report *(optional)*

Automatically generate — exportable or archivable: performance summary · major changes · biggest winners ·
biggest losers · total fees · rewards earned · goal progress · security review.

---

## 18. Smart Alerts

Configurable and **not excessive:** portfolio reached a new high · goal milestone achieved · concentration
exceeded a user-defined threshold · significant fee increase · security posture changed.

---

## 19. Portfolio Simulator

Let users model hypothetical scenarios — **clearly labelled as hypothetical:** *"What if I increase BTC
allocation to 40%?" · "How would my allocation change if I sell 20% of my ETH?"*

---

## 20. Definition of Done

The Portfolio Intelligence Engine is complete when a user can answer these in seconds:

- What is my net worth?
- How is my portfolio performing?
- Where is my money allocated?
- What is generating yield?
- What risks deserve attention?
- How close am I to my goals?
- What changed since yesterday?

> The portfolio should feel like a **personal financial command center**, not just a list of token balances.

---

## What Chapter 12 commits us to

- **Wealth intelligence, not balances** — the product answers "how healthy?" and "what next?", not only
  "what do I own?".
- **Every number computed, never invented; every estimate labelled** — the AI narrates figures that
  deterministic code produced, and a network failure is never a false $0.
- **The AI explains, it does not instruct** — health scores, concentration, and coaching come with reasons,
  never commands or profit promises.
- **It reads from the Asset Engine, never the chain** — clean layering keeps the numbers consistent and the
  honesty enforceable in one place.
- **A command center a user can read in seconds** — the seven Definition-of-Done questions are the bar.

The buildable detail — and the honest shipped-vs-roadmap split (allocation, performance, and health
analytics exist; P&L, cash flow, yield, goals, benchmarks, timeline, monthly report, and the simulator are
roadmap) — is the [Portfolio Intelligence Reference](../ai/portfolio-intelligence-reference.md) (Volume IV).

---

### 📖 Chapter 13 Preview — Universal Liquidity Engine

The infrastructure that powers the Intent Layer by intelligently sourcing liquidity — what lets a user say
*"I want ETH"* while the wallet discovers the best available path across the supported ecosystem. It will
define the **universal liquidity graph**, **DEX aggregation**, **bridge aggregation**, **RFQ integration**,
**solver architecture**, **provider health scoring**, **smart order splitting**, **MEV-aware routing**,
**cross-chain execution planning**, a **best-execution policy**, **liquidity forecasting**, and **failover
strategies.**
