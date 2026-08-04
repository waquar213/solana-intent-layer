# 05 — Implementation Roadmap & Team

## 1. Milestones

These milestones map 1:1 to the Build-Track phases in [requirements.md §14](../../requirements.md); this view adds engineering-management detail (dependencies, complexity, DoD). Complexity is T-shirt sized (S/M/L/XL) for planning, not estimates in days.

| M   | Milestone                                | Depends on        | Complexity | Status |
| --- | ---------------------------------------- | ----------------- | ---------- | ------ |
| M0  | Foundation (monorepo, tooling, handbook) | —                 | M          | ✅     |
| M1  | Wallet Core + Universal Identity         | M0                | L          | ✅     |
| M2  | Chain Abstraction Layer                  | M1                | L          | 🔄     |
| M3  | Portfolio Engine                         | M2                | M          | ⬜     |
| M4  | Intent Engine v1 (+ AI Gateway)          | M1, M3            | XL         | ⬜     |
| M5  | Execution Engine (+ provider framework)  | M2, M4            | XL         | ⬜     |
| M6  | Risk & Security Engine                   | M2, M5            | L          | ⬜     |
| M7  | Backend Platform (services, auth, data)  | M2–M6             | XL         | ⬜     |
| M8  | Client Apps (web + mobile)               | M7, design system | XL         | ⬜     |
| M9  | Gas Abstraction & Smart Accounts         | M5, M8            | L          | ⬜     |
| M10 | Production Hardening (infra, DR, audits) | M7–M9             | L          | ⬜     |
| M11 | Launch & Developer Platform (SDK, beta)  | M10               | M          | ⬜     |

### Milestone detail template (each milestone's page — M2 shown as the live example)

**M2 — Chain Abstraction Layer**

- **Objectives:** one `BlockchainAdapter` interface; balance readers (EVM native+ERC-20, SOL native+SPL, BTC UTXO); fee estimation per ecosystem; provider pooling with failover (done); nonce/UTXO management skeletons.
- **Dependencies:** M1 (`core` types for identities/signing). Blocks M3 (Portfolio) and M5 (Execution).
- **Complexity:** L — three ecosystems, real RPC quirks, reorg/staleness handling.
- **Testing requirements:** unit per adapter; integration vs anvil/regtest/test-validator forks; provider-failover fault-injection (done); mock-HTTP fixture tests for CI-safety.
- **Definition of Done:** `getBalances(identity)` returns correct merged results on forks; failover proven; coverage ≥ 85%; package README; [memory.md](../../memory.md) updated. (Full exit criteria: [requirements.md §14](../../requirements.md).)

Every milestone gets its own page in the same shape when it starts. No milestone is "done" with failing tests or missing DoD items ([04 §6](04-quality.md)).

## 2. Team structure (target org for the Stage-C build)

| Role                         | Count (scale target) | Owns                                                                   | Reviews / gates                                          |
| ---------------------------- | -------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| **Mobile Engineers**         | 6–10                 | `apps/mobile`, `packages/ui` (RN side), device keystore integration    | design fidelity, a11y, perf budgets                      |
| **Backend Engineers**        | 8–12                 | `services/*`, `packages/{auth,api-contracts,config,events}`            | API contracts, data ownership, idempotency               |
| **Blockchain Engineers**     | 6–8                  | `packages/chains`, `packages/adapters`, indexers, `packages/execution` | chain correctness, provider health, reorg handling       |
| **Smart-Contract Engineers** | 2–4                  | 4337 smart-account modules, session keys, paymaster (Phase 9)          | on-chain security; audit liaison                         |
| **AI Engineers**             | 3–5                  | AI Gateway, prompt templates, `packages/intents` parser, eval sets     | parse accuracy, injection defense, cost                  |
| **Security Engineers**       | 3–5                  | threat model, `core`/`execution`/`risk` review, audits, bounty         | **required reviewer on money paths**; kill-switch drills |
| **DevOps / SRE**             | 4–6                  | `infra/*`, CI/CD, observability, on-call, DR drills                    | SLOs, cost/FinOps, incident command                      |
| **QA / Test Engineers**      | 3–5                  | e2e suites, chaos harness, golden-intent set, device farm              | release gates, regression                                |
| **Product**                  | 3–4                  | requirements, roadmap priority, metrics                                | scope, DoD acceptance                                    |
| **Design**                   | 3–4                  | `docs/design`, `packages/ui` specs, research                           | design-system adherence                                  |

## 3. Collaboration model

- **Squads own bounded contexts,** not layers. A "Wallet Core" squad owns `packages/core` end-to-end (crypto + tests + docs); an "Intent" squad owns `intents` + AI Gateway. CODEOWNERS reflects squad ownership; cross-context changes need both owners.
- **Security is embedded, not a gate at the end.** Security engineers pair on money-path design and are required reviewers — they see changes early, not as a merge-blocker surprise.
- **Contracts before code across squads:** when squad A needs squad B's data, they agree the event/API schema in `packages/events`/`api-contracts` first (a small PR), then build in parallel against it. This is how 100 engineers avoid serializing on each other.
- **Docs are the async memory:** architecture/design/handbook + ADRs + [memory.md](../../memory.md) mean a contributor (or a future session) can get context without interrupting anyone.

## 4. RFC & ADR process (decisions survive the team that made them)

- **RFC** (`docs/rfc/NNNN-title.md`) — for a change that affects more than one squad or the public contract _before_ building: problem, options, tradeoffs, recommendation, review window. Lightweight; a paragraph is fine if the change is small.
- **ADR** (`docs/adr/NNNN-title.md`) — records a decision _after_ it's made: context, decision, alternatives considered, consequences. Every new package, vendor choice, security-model or schema change gets one. ADRs are append-only; a reversal is a NEW ADR that supersedes (links back), never an edit.
- The `memory.md` Decisions Log (D1–D20 and counting) is the fast index into these — a one-line pointer per decision. Architecture doc [09-decisions.md](../architecture/09-decisions.md) holds the scored comparisons.
- **Golden rule:** no future implementation deviates from a locked decision without a superseding ADR that justifies it. That is what keeps the codebase coherent as it — and the team — grows.
