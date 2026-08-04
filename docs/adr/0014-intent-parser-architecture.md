# ADR-0014 — Intent parser: deterministic-first, schema-forced, AI proposes only

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, AI Lead, Security Lead

## Context

Natural language must become a validated, executable intent — safely. The AI must never be the thing that moves money; it can only propose a structured object that deterministic code verifies.

## Decision

A layered parser in `packages/intents`: (1) **deterministic pre-parser** (rules/regex for the top ~40 utterance shapes — free, instant, ~40–60% hit rate), (2) **AI Gateway** ([ADR-0013](0013-ai-orchestration.md)) for the rest via schema-forced tool-use, (3) **resolver** (contacts, assets, amounts) validating against real balances, (4) **clarification** on ambiguity — never a guess. Parser output is a **proposal**; the planner + risk engine + device signature are what authorize execution.

## Alternatives considered

| Option                                     | Pros                                          | Cons                                                 | Verdict                                |
| ------------------------------------------ | --------------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| **Deterministic-first + schema-forced AI** | cheap, fast, safe, testable with a golden set | more moving parts than "just call the LLM"           | **chosen**                             |
| Pure-LLM parse-and-act                     | simple                                        | unsafe (LLM near money), costly, non-deterministic   | rejected                               |
| Pure grammar/rules (no LLM)                | deterministic                                 | brittle on real language, poor multilingual/Hinglish | rejected (used as the fast-path layer) |
| Fine-tuned model first                     | tailored                                      | premature; prompt+schema+evals first                 | deferred                               |

## Consequences

- **Maintenance:** a golden intent set (≥200 utterances incl. Hinglish) gates parse-accuracy regressions per release; fast-path rules are ordinary tested code.
- **Scaling:** the deterministic layer absorbs the highest-frequency requests without an LLM call; each fast-path point is ~1% off the LLM bill.
- **Security:** the AI cannot execute — it emits schema-validated JSON that deterministic systems verify; extracted amounts/recipients must round-trip verbatim into the confirm sheet; injection corpus in CI ([architecture 06 §2.3](../architecture/06-security.md)).
