# docs/ai — Volume IV — AI Bible

> The Financial Brain — and its cage.
>
> Part of the **[Founder Bible](../../FOUNDER_BIBLE.md)**. Canonical root doc: [`AI.md`](../../AI.md).
> This volume holds the long-form depth behind the AI chapters — [Ch4 Conversation-First UX](../bible/chapter-04-conversation-first-ux.md)
> and [Ch7 Universal Intent Engine](../bible/chapter-07-universal-intent-engine.md).

## Written

- ✅ [`conversation-ux-reference.md`](conversation-ux-reference.md) — **The Conversation-First UX Reference**
  (~33k words): the buildable expansion of Chapter 4 — conversation architecture · intent understanding ·
  multi-turn & context · AI memory · planning screens · explainable execution · human approval flows ·
  voice-first · personalization & trust patterns. Grounded in the real intent pipeline; shipped-vs-roadmap
  tagged throughout (voice, long-term goals, rich memory = roadmap). AI has zero signing authority.
- ✅ [`intent-engine-reference.md`](intent-engine-reference.md) — **The Universal Intent Engine Reference**
  (~27k words): the buildable expansion of Chapter 7 — NLU & the two-path parser · intent classification ·
  context engine · the AI planner · the pure constraint gates (capability/risk/policy) · clarification ·
  route-request generation & multi-step · confidence scoring · preferences/learning/explainability. Grounded
  in `packages/intents`+`capabilities`+`router`+`copilot`; the invariant: AI proposes, code verifies, the
  device signs; clarify, never guess.
- ✅ [`financial-brain-reference.md`](financial-brain-reference.md) — **The AI Financial Brain Reference**
  (~23k words): the buildable expansion of Chapter 9 — persistent memory · preference learning · goals ·
  recommendations · **portfolio intelligence (shipped)** · spending/investment insights · risk-profile
  adaptation · automation suggestions · daily briefings & long-term planning. Grounded in
  `packages/intelligence` (incl. the shipped **AI-narrator boundary** — code computes, the LLM narrates) +
  `packages/automation`; the Brain proposes, never signs, never fabricates a number.
- ✅ [`portfolio-intelligence-reference.md`](portfolio-intelligence-reference.md) — **The Portfolio
  Intelligence Reference** (~24k words): the buildable expansion of Chapter 12 — net worth · performance/P&L ·
  allocation & diversification · the health score · cash flow/fees/yield · goals/benchmarks/coach · risk &
  timeline · reports/alerts/simulator · the narrator boundary. Grounded in `packages/intelligence` +
  `packages/portfolio`; every number computed by code, estimates labelled, network-fail ≠ $0.
- ✅ [`ai-operating-system-reference.md`](ai-operating-system-reference.md) — **The AI Operating System
  Reference** (~24.5k words): the buildable expansion of Chapter 15 — the multi-agent architecture · Planner /
  Security / Portfolio-Tax / Research / Automation-Memory / Voice agents · tool orchestration & model routing ·
  explainable reasoning + the boundary. Grounded in `packages/copilot` (orchestrator + tools + gate + verify +
  memory, with the real `assertNoExecuteTools` guard); every agent proposes, code verifies, the device signs.

## Planned chapters

- **01.** Where LLMs are allowed vs forbidden — ⬜
- **02.** Schema-forced I/O boundary — ⬜
- **03.** Intent pipeline contract — ⬜
- **04.** Prompt-injection defense — ⬜
- **05.** Evaluation & guardrails — ⬜
- **06.** Zero signing authority — ⬜

_Nothing here yet describes a feature that does not exist. Roadmap is labelled roadmap (Doctrine §3)._
