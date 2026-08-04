[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Chapter 13 of the enterprise specification

# Chapter 13 — Universal Liquidity Engine

> **Version 3.0** · **Mission:** give every user access to the world's liquidity through one intelligent layer — the wallet discovers, compares, and executes the best available route without requiring the user to understand DEXs, bridges, or chains.

**Chapter objective.** This is the charter for how *"I want ETH"* becomes the best available path across the
ecosystem. It states the intent; the buildable detail (with each part tagged **shipped** vs **roadmap**) is
the **[Universal Liquidity Engine Reference](../blockchain/liquidity-engine-reference.md)** (Volume V). The
invariant never moves: the Liquidity Engine **finds** routes; the deterministic gate can only **refuse**; the
device **signs**. Every quote is honest (real minReceived, bounded slippage), never a fabricated estimate.

---

## 1. Philosophy

Today users ask *"Which DEX? Which bridge? Which chain? Which aggregator?"* Intent Wallet should ask only
**"What do you want to achieve?"** — everything else is handled by the Liquidity Engine.

---

## 2. Universal Liquidity Architecture

```
User Intent → Intent Engine → Liquidity Engine → DEX Graph → Bridge Graph → RFQ Engine → Execution Engine
```

**Liquidity becomes a service, not a user decision.**

---

## 3. Global Liquidity Graph

The engine continuously maps liquidity across **Ethereum · Solana · Bitcoin (where supported) · Base ·
Arbitrum · Optimism · Polygon · Avalanche · BNB Chain · future supported chains** — and internally treats all
liquidity as **one virtual network.**

---

## 4. Provider Registry

Modular and versioned — categorized providers:

| Category | Providers |
|---|---|
| **DEX** | Uniswap · Jupiter · Orca · Aerodrome · PancakeSwap · Curve · Balancer |
| **Bridge** | Across · deBridge · Stargate · Relay · Hyperlane (when supported) |
| **Aggregators** | 1inch · 0x · LI.FI · Socket |

---

## 5. Provider Health Score

Each provider is continuously evaluated — poor performers are automatically **deprioritized:** success rate ·
average latency · liquidity depth · slippage · fees · downtime · recent incidents.

---

## 6. Smart Route Discovery

For every request, compare — and choose the best per the user's preferences: **single-hop · multi-hop ·
cross-chain · RFQ · aggregated** routes.

---

## 7. Smart Order Splitting

Large orders may be divided to reduce slippage and improve execution quality:

> 40% → Uniswap · 30% → Curve · 30% → Balancer

---

## 8. Cross-Chain Liquidity

The user sees *"Swap BTC → ETH."* The engine handles the path — and hides intermediate complexity unless the
user requests details:

> BTC → Bridge → Stable Asset → DEX → ETH

---

## 9. RFQ Engine

For larger trades, request competitive quotes from supported liquidity providers; compare **expected output ·
estimated fees · execution time**, and present the selected route **with an explanation.**

---

## 10. MEV-Aware Routing

Where supported, evaluate routing strategies that reduce the likelihood of adverse execution due to MEV, and
**explain when a protected route is selected and any trade-offs involved.**

---

## 11. Slippage Engine

Automatically recommend or apply appropriate slippage based on **asset liquidity · market volatility · user
preference** — and **never hide the chosen value.**

---

## 12. Gas Optimization

Continuously estimate **current gas · predicted gas · alternative execution windows (if timing is flexible)**,
and let users prioritize **lowest cost · fastest completion · a balanced approach.**

---

## 13. Liquidity Forecasting

Estimate **liquidity availability · price impact · congestion · expected execution quality.** Forecasts are
**probabilistic and should be labelled accordingly.**

---

## 14. Best Execution Policy

Before execution, compare candidate routes by **total estimated cost · expected output · time · provider
reliability · user preferences** — and present a **concise explanation of why a route was selected.**

---

## 15. Liquidity Fallback

If the preferred route becomes unavailable, switch — but **re-run security checks before switching:**

> Route A → unavailable → Route B → execute

---

## 16. AI Explanation

Instead of a bare *"Route Selected,"* explain:

> *"I selected this route because it is expected to provide the highest output with lower fees and uses
> providers that currently have strong reliability."*

---

## 17. Real-Time Monitoring

During execution, monitor **liquidity changes · slippage · provider health · bridge progress · network
congestion.** If conditions change materially before execution, **update the plan or request user
confirmation** as appropriate.

---

## 18. Future Liquidity Layer

The architecture must support future innovations — **without redesigning the core engine:** intent solvers ·
solver marketplaces · cross-chain liquidity networks · unified settlement protocols · tokenized real-world-
asset liquidity · institutional liquidity providers.

---

## 19. Definition of Done

The Universal Liquidity Engine is complete when a user can simply say:

> *"Convert my BTC to ETH with the lowest total cost."*

…and the wallet **finds liquidity automatically · selects appropriate providers · explains its reasoning ·
executes reliably · adapts to changing market conditions · hides blockchain complexity while keeping the user
informed.**

---

## What Chapter 13 commits us to

- **Liquidity is a service, not a user decision** — the user states an outcome; the engine discovers,
  compares, and executes the best path across one virtual liquidity network.
- **Providers are a versioned registry chosen by health** — never hard-coded, always replaceable, degraded
  ones deprioritized.
- **Best execution is defined deterministically and explained** — cost, output, time, reliability, and
  preferences produce the choice, and the user is told why.
- **Honesty on price and risk** — real minReceived and bounded slippage (never hidden), probabilistic
  forecasts labelled as such, and security re-checked before any fallback switch.
- **The engine finds; the gate refuses; the device signs** — sourcing never moves funds on its own, and the
  AI has no signing authority.

The buildable detail — and the honest shipped-vs-roadmap split (DEX routing/scoring, provider health &
failover, best-execution scoring, and the slippage/minReceived guard are shipped; bridge execution, RFQ,
MEV-aware routing, order-splitting, and forecasting are roadmap) — is the
[Universal Liquidity Engine Reference](../blockchain/liquidity-engine-reference.md) (Volume V).

---

### 📖 Chapter 14 Preview — Automation Engine

A powerful automation system that lets users automate routine financial workflows while keeping transparency,
control, and appropriate approval safeguards. It will define **DCA · Auto Invest · Auto Bridge · Auto Stake ·
Auto Rebalancing · smart yield optimization · conditional intents ("if BTC falls 10%, buy ₹50,000") ·
scheduled payments · recurring transfers · AI-driven automation suggestions ·** and the **safety policies &
approval rules** that keep automation within a user's cryptographically-granted permissions.
