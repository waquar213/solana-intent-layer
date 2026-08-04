# ADR-0039 — AI Financial Copilot: a constrained decision layer, not an LLM wrapper

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal AI Architect, Principal Product Architect, Principal Security Engineer

## Context

Users want to talk to their wallet — "how am I doing?", "cheapest way to buy 5 ETH?", "is this safe?" — but a chatbot that can fabricate figures or trigger transactions is a liability, not a feature. The Copilot must help users understand and plan and safely act, while being structurally incapable of executing, fabricating, ignoring the Security Engine, or overriding user policy.

## Decision

A **standalone `packages/copilot`** that is an orchestration shell where the LLM only picks tools and drafts prose; all decisions are deterministic code. Four guardrails are enforced by construction: (1) the tool registry has scope `read|analyze|propose` with **no execute tool** and zero dependency on Execution, and `ProposedPlan.signed` is the literal `false`; (2) every figure is a `CitedFact` verified against a per-turn `FactLedger` (`verifyResponse` generalizes Intelligence's `verifyNarrative`) plus a prose numeric-scan; (3) any plan candidate is forced through the `PolicyGate` (which composes Risk **and** Policy) — a block is terminal, and the gate is the single path to a `ready` plan and fails closed; (4) `confidence` is required and floored, forcing an uncertainty note when low. The Copilot depends on the engines as **injected capabilities**, so it is a pure orchestrator testable with a deterministic `ScriptedLlmClient`. It proposes; it never signs and never executes.

## Alternatives considered

| Option                                                    | Pros                                                                                     | Cons                                                                   | Verdict                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| **Constrained decision layer (LLM picks tools + prose)**  | can't execute/fabricate/override by construction; testable; explainable; engine-agnostic | more scaffolding than a raw wrapper                                    | **chosen**                                               |
| Thin LLM wrapper that can call an execute tool            | fastest to build; "agentic"                                                              | one jailbreak moves funds; unverifiable outputs; unauditable           | rejected (no execute capability exists in the Copilot)   |
| Let the LLM combine Risk + Policy itself                  | flexible                                                                                 | prompt-injectable authority; composition drift; non-deterministic gate | rejected (deterministic PolicyGate reads one permission) |
| Trust the model to not fabricate (prompt-only guardrails) | simple                                                                                   | hallucinated money figures; no enforcement                             | rejected (FactLedger + verify are code, not prompts)     |
| Store preferences as a free-form profile                  | expressive                                                                               | can accidentally persist a key/secret                                  | rejected (closed enumerated UserPreferences, sanitized)  |

## Consequences

- **Maintenance:** a new capability is a tool + a fact extractor; a new guardrail is a deterministic check; the LLM is swappable behind one interface; every guardrail has a test (no-execute allowlist, hallucination, gate terminal states, confidence floor, prompt-injection).
- **Scaling:** the seed-from-`analyze` zero-round-trip path keeps simple questions under the 2s target; bounded tool steps cap latency; the orchestrator is stateless per turn.
- **Security:** no execute/sign capability is reachable; fabricated numbers are rejected before display; Risk and Policy are non-bypassable and fail closed; preferences cannot hold a secret; the utterance never enters the system prompt. Full design: [architecture 20](../architecture/20-ai-copilot.md).
