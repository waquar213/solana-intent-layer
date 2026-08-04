# ADR-0013 — AI orchestration: Claude via in-house AI Gateway (no heavy framework)

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, AI Lead, Security Lead

## Context

Intent parsing needs guaranteed structured output, strict prompt-injection defenses, model routing, cost control, and graceful degradation. This is a security boundary, not a chatbot.

## Decision

An **in-house AI Gateway** service ([architecture 02 §2.5](../architecture/02-services.md)) is the ONLY caller of LLM vendors. It uses the **Claude API** (sonnet-class for parse/explain, haiku-class for classification) with **forced tool-use against a Zod schema**. No heavyweight agent framework. Vendor-abstracted; the availability story is a **forms fallback**, not a second LLM.

## Alternatives considered

| Option                                 | Pros                                                                          | Cons                                                                  | Verdict                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **In-house gateway + Claude tool-use** | full control of prompts/validation/injection defenses, model routing, budgets | we build the gateway                                                  | **chosen**                                                                                   |
| LangChain / LlamaIndex                 | quick prototyping                                                             | abstraction sprawl, hidden prompts, weak for a hard security boundary | rejected                                                                                     |
| Direct vendor SDK in each service      | simple                                                                        | scatters the LLM trust boundary, no central budget/injection control  | rejected                                                                                     |
| Self-hosted OSS model first            | no vendor cost                                                                | weaker instruction-following for structured intents at launch         | deferred (distillation at scale, [architecture 10 §3](../architecture/10-cost-and-scale.md)) |

## Consequences

- **Maintenance:** prompt templates are versioned and reviewed like code; one place to swap models or add a provider; eval telemetry centralized.
- **Scaling:** deterministic fast-path + prompt caching + haiku routing keep cost sublinear; per-user budgets cap abuse; distillation path recorded for ≥100k parses/day.
- **Security:** user text is data, never instructions; NO fund-moving tool is exposed to the model; output must validate against the schema or it retries once then asks the user; token metadata sanitized before prompts ([ADR-0014](0014-intent-parser-architecture.md), [architecture 06 §2.3](../architecture/06-security.md)).
