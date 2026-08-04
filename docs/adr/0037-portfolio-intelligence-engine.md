# ADR-0037 — Portfolio Intelligence Engine: deterministic analytics with an AI narration boundary

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Quant Engineer, Principal Portfolio Management Engineer, Principal AI Architect, Principal Data Engineer

## Context

The wallet's biggest differentiator is not "AI" — it is turning raw positions into a _decision_: allocation, performance, risk, health, recommendations, alerts, what-if scenarios and tax, continuously and correctly, for hundreds of millions of users. Three hard constraints shape the design: (1) financial numbers must be exact and auditable (this is people's money); (2) AI is desirable for explanation but must never invent a figure; (3) the module must be reusable as a standalone service, and it must never be able to move funds.

## Decision

A **standalone `packages/intelligence`** built as a **deterministic analytics core over injected sources**, with a thin **AI narration boundary** on top. Money is integer µUSD (reused from `portfolio`); ratios/scores are floats. The pipeline (Discovery→Normalization→Classification→Valuation→Allocation→Performance→Risk/Health→Insights) is one pure function of a snapshot; alerts, scenarios, tax and narration are on-demand engines over the verified result. Diversification uses a correlation-adjusted diversification ratio (HHI fallback); the health score is a transparent, re-normalizing weighted blend with per-factor explanations; scenarios model impermanent loss and β-propagation; tax is jurisdiction-abstracted lot matching. **AI narration may cite only figures that reconcile against the computed intelligence** — `verifyNarrative` rejects any fabrication. The engine analyzes and recommends; it never signs and never executes.

## Alternatives considered

| Option                                                  | Pros                                                                                        | Cons                                                                                  | Verdict                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Deterministic core + verified AI narration boundary** | exact/auditable money; AI can't fabricate; explainable scores; standalone; offline-testable | more engineering than a black box                                                     | **chosen**                                                     |
| LLM computes the analytics end-to-end                   | fast to prototype; "smart"                                                                  | hallucinated figures on money; non-reproducible; unauditable; unregulatable           | rejected (AI narrates, never computes)                         |
| Float money math throughout                             | simplest                                                                                    | rounding drift; totals don't reconcile; violates the platform money rule              | rejected (bigint µUSD; ratios stay float)                      |
| HHI-only diversification                                | trivial                                                                                     | treats correlated assets as diversified; misleads on real risk                        | rejected (correlation ratio when data allows, HHI as fallback) |
| Build intelligence inside the portfolio/aggregation pkg | fewer packages                                                                              | couples a service-grade product to aggregation; harder to sell/scale/audit separately | rejected (standalone is a revenue stream)                      |
| Opaque single health score                              | one clean number                                                                            | users/regulators can't see _why_; no path to act on it                                | rejected (per-factor, re-normalizing, explainable)             |

## Consequences

- **Maintenance:** a new metric is a pure function + a known-answer test; a new insight is a rule with evidence; a new jurisdiction is three tax parameters; a new alert is a keyed candidate. Each concern (allocation, performance, risk, insight, alert, scenario, tax, narration) is independently testable.
- **Scaling:** analytics are pure CPU over an in-memory snapshot → the < 2 s refresh target is upstream-bound (discovery/pricing), stateless and horizontal; the alert engine is state-diffable for cheap mobile polling; the same package serves the in-wallet brain and a Portfolio-Intelligence-as-a-service API.
- **Security:** the engine holds no keys and has no signing scope — it cannot move funds. AI output is verified against computed facts before display, so a compromised or hallucinating model cannot surface a fabricated number. Full design: [architecture 18](../architecture/18-portfolio-intelligence.md).
