# Architecture Review — 2026-07-05 (19 packages + services/api)

> A holistic review run at the #20 checkpoint, before further implementation. Method: a multi-agent pass (4 dimensions — dependency graph, duplicate responsibilities, contract validation, missing edge cases — each reading the real source and citing file:line, then a synthesis judge). Every claim below was verified against source.

## Verdict

**The architecture is fundamentally sound.** The 19-package dependency graph is **acyclic and cleanly layered** (foundation → mid → orchestrators) with zero inversions and zero undeclared edges; peer dependencies are compile-time `import type` only. The "pure core over injected interfaces" doctrine is applied consistently, and the safety-critical math (bigint money path, EIP-55 guards, probabilistic risk compounding) is careful. **This is a healthy set of libraries — but not yet a system:** there is no composition root anywhere, `services/api` imports zero domain engines, and the adapter tier that bridges one engine's output to another's injected interface is unbuilt. That is a deliberately-deferred build gap, not a design defect — **except** that two safety-critical gaps hiding at those seams will move real money incorrectly if wiring proceeds before they are closed. Keep the structure; build the adapter tier next; treat the two CRITICAL gaps as blockers, not backlog.

## 1. Dependency graph & layering — SOUND, no action

Acyclic, cleanly layered, no inversions, no phantom edges. The decomposition is the strongest part of the codebase. Do not touch it.

## 2. The real gap: the adapter + composition tier is entirely UNBUILT

- **No composition root.** `services/api` references no domain engine; only a `/v1/status` meta endpoint.
- **No engine-to-engine adapter.** Consumers correctly define their injected ports (`intents.EngineContext`, `copilot.CopilotCapabilities`, `automation.PolicyAuthorizer`), but the only `implements` in the repo is a test fixture. The `copilot`/`automation`/`execution` seams (consumer imports producer's types) need only thin glue; the `intents` seams (local re-declared shapes) need real translating adapters.

This should be **the entire next milestone**: a thin composition root in `services/api` where every cross-engine shape mismatch surfaces and is resolved once, each adapter a pure tested mapper.

## 3. Duplicate responsibilities — mostly warranted

- **Consolidate — fact-grounding verifier:** `copilot.verifyResponse` and `intelligence.verifyNarrative` are the same algorithm with an identical `0.01` tolerance — the "AI never fabricates a number" invariant duplicated in two driftable places. Extract `reconcileCitations(cited, resolve, tol)` into `core`; both call it.
- **Consolidate — `POLICY_PRESETS` name collision:** `risk` and `policy` both export `POLICY_PRESETS` with identical `{strict,balanced,permissive}` keys but unrelated meaning. Rename risk's → `RISK_POLICY_PRESETS`.
- **Leave as-is (warranted):** the three condition/rule ASTs (policy/automation/intelligence) share only combinators; leaves are domain-disjoint — a shared AST would be false coupling. The `PolicyEnv`/`AutomationEnv` factories differ legitimately; the hash primitive is already shared.
- **Decide — `events` is defined-but-unused:** full topic/schema registry, but no engine emits through it and `execution` emits its own local shape that doesn't match `ExecutionStepEventSchema`. Either wire producers through the schemas (delete the ad-hoc shapes) or mark `events` "reserved, not yet emitted".

## 4. Contract mismatches that block wiring (each needs an adapter)

1. **`intents.RiskProvider` ↔ `risk.RiskEngine`** — mismatched on both ends: intents wants `scan({type,value}): Promise<{level, reasons[]}>`; risk exposes sync `scan(SecuritySubject): {level, score, signals[]}`. Needs a subject-builder + report down-projection adapter. (intents does not import `@intent-wallet/risk` at all.)
2. **`portfolio.UnifiedAsset` ↔ `intents.Holding`** — field renames (`amount→totalBase`, `chains[].amount→base`).
3. **`portfolio.PriceSource` ↔ `intents.PriceProvider`** — `getPrices(keys)→Record` vs `getUsd(symbol)→string|undefined`; needs a wrapper.
4. **Three `Route` shapes (intents / providers / router)** — `amountOutBase→outMinBase`, `providerId→venue`, and `RouteResult.best`→flat `Route`; needs one normalizer.
5. **`RiskReport` name collision** — rename intents' local wire type → `PlanRiskSummary`.

## 5. Missing edge cases / safety gaps (prioritized)

- **[CRITICAL] Stale-plan authorization.** Balance, recipient-network, route liveness, risk and slippage are computed once at plan time and never re-verified at sign/broadcast. Needs a **mandatory pre-broadcast re-validation gate inside the execution engine** (re-scan risk, re-check balance/allowance, assert quote age < TTL, re-run policy on the current amount).
- **[CRITICAL] Planner drops every risk verdict below `block`.** The planner branches only on `level === 'block'`; medium/high/`require_confirmation` force no confirmation — the graduated-risk design is inert in the primary flow. Planner must call the verdict-bearing `evaluate()` and map high/`require_confirmation` → mandatory confirmation.
- **[HIGH] No broadcast idempotency/replay guard.** A crash between a successful broadcast and the save re-broadcasts on `resume()` → double-send. Persist an intent-to-broadcast record with a deterministic idempotency key + nonce reservation before the network call (automation already does this — mirror it).
- **[HIGH] Recovery hints are dead API.** `RecoveryHint 'requote'` is never inspected; stale multi-leg routes get retried with stale calldata or parked.
- **[HIGH] `all`/percent native sends ignore the gas reserve.** A native max-send returns the full balance and can't pay its own gas. Compute `amount = balance − estimatedFee`.
- **[HIGH] Automation handoff is the least-checked yet only autonomous path.** `recurring`/`emergency_exit` intents hand off with no plan-time safety on the inner action; the intents→automation compile handoff is unbuilt; `emergency_exit` percent is unbounded.
- **[MEDIUM] Unlimited-approval + provider-health detectors are unreachable from the swap flow** — the planner scans only `{token}` and `{recipient}`, so the top drain vector (`UNLIMITED_APPROVAL`) is bypassed on approve legs.
- **[MEDIUM] Router float coercion of bigint** — `Number(outputBase)/Number(feeMicros)` overflows 2^53 for large-notional/high-decimal tokens, mis-ranking routes. Normalize in bigint/scaled-ratio space.
- **[MEDIUM] Quote freshness dropped into the plan** — `Route` carries no `quotedAt/validUntil`; execution can't tell a stale quote from a fresh one. Propagate and assert at the pre-broadcast gate.
- **[MEDIUM] Scheduler no catch-up** — a week of downtime collapses 7 DCA buys into 1 with no backfill; make catch-up an explicit policy.
- **[MEDIUM] Tax over-disposal understates gain** — leftover disposal is excluded from `netGainMicros`; real rules treat unmatched as zero-basis fully-taxable (compliance risk).
- **[LOW] EVM nonce collisions** (no reservation across concurrent executions; no RBF), **BTC confirmed/unconfirmed mismatch**, **deterministic parser over-matches tickers**.

## Recommended sequencing (before more feature prompts)

1. **Hardening milestone (blockers):** the two CRITICAL gaps + the HIGH idempotency/gas-reserve/recovery gaps — all in already-shipped engines (`intents` planner, `execution` engine).
2. **Hygiene:** the two renames (`RISK_POLICY_PRESETS`, `PlanRiskSummary`) + extract `reconcileCitations` — cheap now, painful after wiring.
3. **Composition root + 5 adapters** in `services/api` — the integration milestone; makes the system runnable end-to-end.
4. **Then** resume the feature roadmap (#19 Developer Platform, #20 Enterprise) on a wired, hardened base.
