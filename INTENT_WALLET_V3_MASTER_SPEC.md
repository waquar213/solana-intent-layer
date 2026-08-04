# Intent Wallet V3 — The Living Master Specification

> **One document to govern the whole build.** Not 100 prompts — one philosophy, applied 100 times.
> Every module, screen, engine, and line of code descends from what is written here. Read this first,
> every session. When reality and this document disagree, fix one of them on purpose — never drift.

**Version:** 3.0 · **Status:** Living (versioned; evolves via ADRs) · **Supersedes:** the V2 27-prompt series.

---

## 0 · How to use this specification

This is the single source of truth for **Intent Wallet V3**. It has three layers, each with a job:

| Layer | What it is | You use it to… |
|---|---|---|
| **The Master Prompt** (Appendix A) | A self-contained, paste-able activation prompt | Start any build session — it loads the Council, the Doctrine, and the Loop in one shot. |
| **The Framework** (§1–§5, §7–§10) | The operating system: who builds, the laws, the loop, the bars, the standards | Decide *how* anything gets done, and settle any dispute. |
| **The 100 Modules** (§6) | One card per module: mission, owns, interfaces, quality bar, done-definition | Decide *what* a given module must be, and when it is truly finished. |

**The rule of consistency:** a module is never designed in isolation. It inherits the Doctrine (§2),
is built through the Loop (§3), is held to the Bars (§4), and speaks the Standards (§7). That is how
100 modules built across 100 sessions still feel like *one product by one obsessive team*.

---

## 1 · The Council — who Claude becomes

Claude does not act as "a coder." For Intent Wallet V3, Claude convenes a **Council** and wears the
right hat for the moment. The Council has a chair with final say and specialists who must be satisfied
before their concern ships. Switching hats out loud ("as the Principal Security Engineer, I object
because…") is encouraged — it forces the real trade-off into the open.

**The chair**
- **Founder & CEO** — owns the *why* and the *no*. Guards the north star, kills scope that doesn't serve it, and makes the final call when specialists deadlock. Optimises for the product a user loves and an investor believes, not for cleverness.

**The product & design bench**
- **Chief Product Officer** — turns vision into a ruthless, sequenced roadmap; owns what ships and what waits.
- **Staff Product Designer (Apple-level)** — owns the feeling. Pixel, type, motion, and restraint. Would rather ship less, perfectly.
- **Principal UX Researcher** — owns the truth about users; kills assumptions with evidence; defines the funnel and the moment of value.

**The engineering bench**
- **Principal Blockchain Architect** — owns keys, signing, chains, settlement correctness. Money is bigint; guards fail closed.
- **Principal Security Engineer** — owns the threat model and the veto. Assumes the wallet holds real funds and a real adversary is watching.
- **Principal AI Engineer** — owns the intent pipeline and the agents; keeps the LLM at the edges behind schema-forced, verifiable boundaries.
- **Principal Backend Engineer** — owns the API, data, and correctness of the server rails.
- **Principal Frontend / Mobile Engineer** — owns the on-device experience, web + native, and the non-custodial boundary in the client.
- **Principal SRE / Performance Engineer** — owns uptime, latency, and the budget of every millisecond and byte.
- **Principal DevOps Engineer** — owns the pipeline: reproducible builds, safe deploys, rollbacks.

**How the Council decides.** Design and product tension → the Staff Designer and CPO reconcile under
the CEO. Anything touching keys, funds, or user data → the **Principal Security Engineer holds a hard
veto** that only the CEO can overrule, and only in writing (an ADR). Ties break toward the doctrine,
then toward the user, then toward the simpler thing.

---

## 2 · The Doctrine — the laws no module may break

These are not guidelines. A change that violates one is wrong even if it "works," and is reverted.

1. **Non-custodial, absolutely.** Private keys and the seed are generated and used **on the device**, encrypted at rest (scrypt + AES-256-GCM today; Passkey + MPC on the roadmap). They **never** leave the device and are **never** sent to a server. If a feature needs the server to know a secret, the feature is redesigned.
2. **AI proposes, deterministic code verifies, the device signature disposes.** The AI never holds signing authority. Between any plan and the wire sits a **pure, exhaustively-tested safety gate** whose only power is to *refuse*. The user's on-device signature is the sole disposer of funds.
3. **Never fake data.** Honest empty / loading / error states. A network failure is **not** "$0." Nothing is ever presented as "confirmed" or "real" that did not actually happen on-chain. Testnet is labelled testnet; capped mainnet is labelled capped. No borrowed demo numbers, ever.
4. **Money is integer bigint.** Base units end-to-end; never a float. Formatting for humans happens only at the very edge. Rounding that could cost a user is a bug.
5. **Fail closed.** Any guard that cannot *positively* verify something (unknown chain, malformed address, unpriced asset) blocks — never waves through. Irreversible actions demand explicit, informed confirmation.
6. **Apple-grade craft is a requirement.** World-class design, WCAG AA accessibility, and tasteful, reduced-motion-aware animation are acceptance criteria — not polish added later.
7. **Deterministic cores, AI at the edges.** Business logic is pure, typed, and unit-tested to exhaustion. LLMs live behind schema-forced boundaries and are always verified by deterministic code before anything happens.
8. **Everything auditable.** Every risky decision (a risk verdict, a policy denial, an auto-execution) is logged with its inputs and reason. Security and correctness are demonstrable, not asserted.

**The V3 ambition, in one line:** *not a better MetaMask — Crypto's ChatGPT × Apple Wallet × Stripe:*
conversational intent UX with Apple-grade craft on Stripe-grade rails and a developer platform.

---

## 3 · The Build Loop — how every module is made

No module is "just implemented." Each passes through the loop below. Small modules run it fast; a
signing or key path runs it slowly and adversarially. **Each stage has an exit gate; you may not enter
the next stage until the gate is green.**

1. **Think** — restate the goal, the user, the doctrine rules in play, and the definition of done from the module card. *Gate:* the problem is stated more sharply than it was handed to you.
2. **Research** — read the existing code + prior art + the relevant benchmark competitor. Never reinvent what the monorepo already does well. *Gate:* you can name what exists and what the best-in-class does.
3. **Critique** — attack the naive approach. Where does it leak keys, lose precision, lie to the user, or break under failure? *Gate:* the top 3 failure modes are written down.
4. **Design** — choose the architecture, the interfaces, and the states (empty/loading/error/partial/success). Design the *feeling* alongside the data. *Gate:* interfaces + states are specified before code.
5. **Review** — the relevant Council members sign off on the design. Security vetoes anything touching funds/keys/data it isn't satisfied with. *Gate:* no unresolved specialist objection.
6. **Implement** — write code that reads like the surrounding code: same idioms, same naming, same comment density. Small, honest commits. *Gate:* it compiles/type-checks clean.
7. **Test** — unit-test the pure core to exhaustion (including the nasty inputs); integration-test the real path. *Gate:* the failure modes from stage 3 each have a test.
8. **Security Audit** — re-derive the threat model for what changed. Keys, funds, PII, injection, replay, front-running, fail-open. *Gate:* Principal Security Engineer signs; high/critical findings fixed.
9. **Performance Audit** — measure, don't guess. Latency, bundle/byte cost, memory, N+1s, main-thread work. *Gate:* meets the module's perf budget.
10. **UX Audit** — drive the real flow as a first-time user. Every state honest, reachable by keyboard, AA-contrast, reduced-motion-safe, and *delightful*. *Gate:* a screenshot/recording proves it, in light and dark.
11. **Refactor** — remove what the loop revealed as accidental; leave the code better than the surrounding average. *Gate:* no dead code, no TODOs pretending to be done.
12. **Document** — update the module card's status, write the ADR if a real decision was made, and record the non-obvious in memory. *Gate:* the next session can continue without you.

> **The verify-before-claim rule.** "Done" is a claim about reality. It is earned by driving the actual
> thing (stages 7–10), not by a green type-check. If tests fail, say so with the output. If a step was
> skipped, say which. State a thing is done only when it is done and verified.

---

## 4 · Quality Bars — the definition of "world-class" per discipline

A module ships only when **every** applicable bar is met. These are the acceptance criteria the Bench
enforces at stages 8–10.

| Discipline | The bar (must ALL hold) |
|---|---|
| **Design** | Deliberate type scale + palette + spacing; light **and** dark designed with equal care; considered depth, not flat-and-cheap; empty/loading/error states are designed, not afterthoughts; nothing looks AI-generic. |
| **Interaction** | Every control has hover/focus/press/loading/disabled states; motion is 150–250ms, GPU-friendly, and `prefers-reduced-motion` aware; the primary action is obvious. |
| **Accessibility** | WCAG **AA**: contrast ≥ 4.5:1 body, keyboard-reachable with a visible focus ring, correct roles/labels, live regions for async, focus trapped + restored in dialogs. |
| **Correctness** | Pure cores unit-tested incl. adversarial inputs; money is bigint; conformance-tested against a known-answer vector where a standard exists (e.g. BIP-32/44/84, SLIP-0010). |
| **Security** | Threat-modelled; keys never leave device; guards fail closed; destructive/irreversible actions gated by informed confirm; secrets never logged/committed; third-party audit before real-fund GA. |
| **Performance** | Meets its budget (interaction < 100ms, cold path measured + justified); no unbounded work; no main-thread jank; bundle cost accounted for. |
| **Honesty** | Doctrine rule 3 verified: no fake/demo/borrowed data; network-fail ≠ $0; every "confirmed" is real on-chain. |
| **Docs** | Public interfaces documented; an ADR for every real decision; the module card kept current; the non-obvious captured in memory. |

---

## 5 · The Architecture — ten phases, one layered system

The 100 modules form a dependency stack. Lower layers are load-bearing for everything above; the
higher layers are only as trustworthy as the layer beneath them. Build **bottom-up for trust,
top-down for meaning** — the Product & Design phase sets the *why* for everything, but the Wallet
Foundation and Security phases must be real before anything above them is allowed near real funds.

```
 P10  FUTURE            ── super-app, payments, RWA, DeFi, intent network, 2035 vision
 P9   COMPANY           ── brand, marketing, docs, community, launch, hiring, ops
 P8   BUSINESS          ── pricing, growth, referrals, billing, CRM, BI
 P6   PLATFORM          ── SDK, API, plugins, white-label, devtools, webhooks, observability
 P5   AI                ── AI OS, multi-agent, tool-calling, memory, knowledge graph, finance AI
 P3   INTENT PLATFORM   ── intent → plan → execute → settle, router, solvers, automation, brain
 P4   SECURITY  ◀──────── cross-cutting: risk, policy, fraud/scam, simulation, threat-intel, MPC, recovery
 P2   WALLET FOUNDATION ── keys, identity, accounts, assets, portfolio, chains, tx, sessions
 P1   PRODUCT & DESIGN  ◀── the why + the feeling that governs every layer above
 P7   INFRASTRUCTURE    ── the ground everything runs on: scale, k8s, data, events, cache, SRE
```

**Reading the map:** P1 (Product & Design) and P4 (Security) are **cross-cutting** — they touch every
other phase, which is why they are drawn on the edges. P2 (Wallet Foundation) + P7 (Infrastructure)
are the bedrock. P3 (Intent Platform) is the beating heart — the thing that makes this *Intent* Wallet.
P5/P6 turn it into a platform; P8/P9 into a company; P10 into a category.

---

## 6 · The 100 Modules

*Each card is a staff-level mandate. Build it through the Loop (§3), to the Bars (§4), in the house Standards (§7). A module is done only when its done-definition is checked and verified.*


### Phase 1 — Product & Design


#### P1.01 · Product Vision
> 'Crypto's ChatGPT + Apple Wallet + Stripe' — one non-custodial identity you can talk to.

Define the north star, the wedge, and the multi-year arc so every downstream module traces its existence to a concrete user outcome. World-class means a skeptic repeats the one-sentence promise correctly after ten seconds, and a measurable first 'aha' (a real verified on-chain action) lands faster than Phantom's create→first-action. The vision is honest by construction: no growth that fakes data or touches custody.

**Owns**
  - The single-sentence promise and the 'talk to your money' wedge vs MetaMask/Phantom/Rabby
  - North-star metric plus ≥3 guardrail/input metrics that are actually instrumentable in services/api + observability
  - Multi-chain-single-identity positioning (BTC + ETH/L2s + SOL under one on-device identity)
  - The non-custodial + AI-safety moat narrative (keys on-device, AI can only propose)
  - Persona definition mapped to the real Simple/Pro/Dev modes already in the stack
  - The explicit anti-scope list — what we will deliberately NOT build (custody, yield-baiting, blind-sign convenience)

**Depends on:** —

**Interfaces**
  - `Vision one-pager + product-principles seed that every other P1 card cites`
  - `North-star + input-metric tree wired to real telemetry surfaces`
  - `Positioning matrix vs Phantom / Rabby / MetaMask / Coinbase Wallet`
  - `Persona → mode map (Simple/Pro/Dev) consumed by Information Architecture`
  - `Success criteria feeding each P1 card's qualityBar`

**Quality bar:** A cold user reaches their first verified on-chain 'aha' faster than Phantom's create→first-action, and the positioning statement survives the 'skeptic repeats it verbatim' test — beating Phantom on activation and Stripe on clarity-of-promise.

**Definition of done**
  - [ ] One-sentence promise ratified and reused across the org
  - [ ] North-star + ≥3 guardrails defined and instrumentable, not aspirational
  - [ ] Persona↔mode map published and adopted by IA
  - [ ] Anti-scope list written and cited in ≥1 real feature kill
  - [ ] Every other P1 card explicitly references this vision

**Doctrine hooks**
  - Doctrine 1 (non-custodial) is treated as the moat and headline, not a footnote — positioning leads with on-device keys.
  - Doctrine 3 (never fake data) is elevated to brand: the vision forbids any metric or growth tactic that depends on dishonest states.


#### P1.02 · Product Philosophy
> 'AI proposes, deterministic code verifies, the device signature disposes' — turned into enforceable product law.

Translate the six-point doctrine into numbered, quotable product principles and a tradeoff ladder that resolves any design dispute without a meeting. World-class means principles specific enough to kill a tempting feature, the way Stripe's API tenets and Apple's HIG constrain their teams. Taste and honesty become rules, not vibes.

**Owns**
  - The doctrine→principle translation (fail-closed, honest states, integer money, on-device keys as design law)
  - The decision-rights + tradeoff ladder: safety > honesty > clarity > speed > delight
  - The 'no fake data / no dark patterns / no manufactured urgency on money' bar
  - The feature-acceptance rubric and a written 'definition of tasteful'
  - The consent & irreversibility copy law (every irreversible action states it once, clearly, before it happens)
  - The banned-pattern catalog (pre-checked consent, confirm-shaming, hidden fees, motion that fakes confirmation)

**Depends on:** Product Vision

**Interfaces**
  - `Product-principles charter (numbered, quotable, ≥8 principles)`
  - `Tradeoff ladder used to adjudicate conflicts by number, not seniority`
  - `Feature-acceptance rubric applied in design review`
  - `Anti-pattern / dark-pattern ban list`
  - `Consent & irreversibility copy law consumed by Interaction Design and AI UX`

**Quality bar:** Any two designers resolve a conflict by citing a principle number; zero dark patterns survive review — matching Apple HIG and Stripe's design tenets for enforceability rather than inspiration.

**Definition of done**
  - [ ] ≥8 numbered principles ratified and mapped 1:1 to doctrine clauses
  - [ ] Tradeoff ladder published and used in a real decision
  - [ ] Banned-pattern list written and enforced in review
  - [ ] Consent/irreversibility copy law adopted by confirm surfaces
  - [ ] Rubric demonstrably used to reject or reshape ≥1 feature

**Doctrine hooks**
  - All six clauses become product-side law here; especially Doctrine 2 (AI never has signing authority) and Doctrine 4 (money is bigint, guards fail closed) are made visible and non-negotiable at the UX layer.
  - Doctrine 6 (deterministic cores, LLM at the edges) is encoded as the principle that any risky decision must be auditable and reproducible.


#### P1.03 · UX Psychology
> Turn financial fear into calm, calibrated confidence — engineer comprehension before signature.

Own the mental models, trust calibration, and cognitive-load budget so users understand consequence and risk before they sign, and recover gracefully from failure. World-class means users can correctly predict what a transaction will do before confirming — the opposite of MetaMask's blind-signing anxiety — and trust is calibrated, never blind. No screen ever manufactures urgency to move money.

**Owns**
  - The core mental models: custody, keys, irreversibility, testnet vs capped-mainnet labelling
  - The trust-calibration curve — progressive disclosure of risk, calm-by-default not scary-by-default
  - A cognitive-load budget per surface (how many decisions/numbers a screen may ask for)
  - The first-run 'aha' / first-success moment design
  - Loss-aversion and irreversibility framing that informs without dramatizing
  - Emotional recovery from errors and failed transactions (honest, blameless, next-step-always)
  - The anti-manipulation stance: no FOMO, countdown pressure, or urgency nudges on financial actions

**Depends on:** Product Vision, Product Philosophy

**Interfaces**
  - `Mental-model map + associated copy patterns`
  - `Risk-comprehension disclosure ladder tied to Risk Engine levels (feeds AI UX + Interaction Design)`
  - `Per-surface cognitive-load budget`
  - `First-run 'aha' specification`
  - `Comprehension-test protocol: can the user predict the outcome pre-signature?`

**Quality bar:** ≥90% of test users correctly predict a transfer/convert outcome before signing, with zero manufactured-urgency patterns present — beating MetaMask and Rabby on comprehension-before-signing.

**Definition of done**
  - [ ] Mental-model map ratified and reflected in copy
  - [ ] Disclosure ladder mapped to Risk Engine's low/medium/high/block levels
  - [ ] Comprehension test defined with a passing bar and run once
  - [ ] Loss-aversion/irreversibility copy patterns documented
  - [ ] No-FOMO / no-urgency rule enforced across money surfaces

**Doctrine hooks**
  - Doctrine 2 & 3 are the psychological core: comprehension-before-signature and honest loading/empty/error/stale states are what build calibrated trust.
  - Doctrine 5 (calm, reduced-motion-aware, accessible) directly supports low-anxiety states for high-stakes moments.


#### P1.04 · Information Architecture
> One universal identity, three ecosystems, a handful of destinations — a map you never get lost in.

Define the canonical object model and screen graph so multi-chain complexity collapses into an obvious structure identical in spirit on web and mobile. World-class means a first-time user finds any function in ≤2 taps and never asks 'where am I', unifying BTC/ETH/SOL under one identity more cleanly than any wallet shipping today.

**Owns**
  - The reconciled top-level model across surfaces (web 5-section shell ↔ mobile 5-tab IA ↔ Home/Ask/Activity/Settings), resolving the 4-tab-doc vs 5-tab-memory tension explicitly
  - The object taxonomy: identity → accounts → assets → positions → activity
  - The sheets-vs-pushes law (value-moving = sheet, browsing = push, max one stacked sheet)
  - The Ask/intent surface converging from both a tab and the Home command bar onto one screen
  - Onboarding and locked state as separate stacks (no tab bar until a backed-up-or-deferred vault exists)
  - The mode→surface visibility matrix so Pro/Dev surfaces are gated, not clutter for Simple users

**Depends on:** Product Vision, Product Philosophy

**Interfaces**
  - `The canonical screen graph (per docs/design/03) kept in sync across platforms`
  - `Object taxonomy consumed by Design System components and Navigation`
  - `Tab/section contract per platform`
  - `Sheet/push routing rules`
  - `Mode→surface visibility matrix (Simple/Pro/Dev)`

**Quality bar:** Every core task reachable in ≤2 taps and the same mental map holds across web and mobile — beating Phantom and Apple Wallet on findability under real multi-chain load.

**Definition of done**
  - [ ] Canonical tab/section model ratified and consistent across web + mobile
  - [ ] Object taxonomy documented and adopted by components
  - [ ] Sheet-vs-push rules codified and enforced
  - [ ] Mode-gating matrix defined for Simple/Pro/Dev
  - [ ] ≤2-tap findability audit passes for the top 10 tasks

**Doctrine hooks**
  - Doctrine 1: the one on-device universal identity is the organizing spine — the IA is identity-first, never per-chain silos bolted together.
  - Doctrine 3: every data destination in the graph must own all five honest states, so 'where things live' and 'how they degrade' are designed together.


#### P1.05 · Design System
> One token source of truth — 'clean minimal luxe' (Rabby × Linear), platform-agnostic and AA-verified.

Own @intent-wallet/ui as the single platform-agnostic token + component source that web (CSS vars via toCssVars) and React Native (StyleSheet) both derive from, so any token change happens in exactly one place. World-class means zero hardcoded values in components, pre-verified contrast pairs, and a library as coherent as Linear's and as trustworthy as Stripe's — restraint as the aesthetic, no gradients or glass.

**Owns**
  - Semantic color roles as light/dark pairs — components reference roles, never raw hex
  - Type scale, 4-pt spacing, radius, and restrained layered elevation tokens
  - riskPresentation tokens (low/medium/high/block → color + label) that are never color-only
  - The toCssVars web bridge and the RN StyleSheet bridge, both derived from one token object
  - Core components: Button, PlanCard, ConfirmSheet, RiskBadge, AmountText, with a11y baked in
  - The premium material layer (SparkAvatar / HeroWash / elevated Card) applied only where it earns its keep, never as noise

**Depends on:** Product Philosophy, Accessibility

**Interfaces**
  - `packages/ui/src/tokens: colors, space, radius, typography, motion, sizing, riskPresentation`
  - `toCssVars(scheme) web bridge + styles.css --color-* var contract`
  - `Component API set (PlanCard / ConfirmSheet / RiskBadge / AmountText / Button)`
  - `The token→both-platforms derivation guarantee (change once, propagate everywhere)`
  - `tokens.test conformance surface proving no drift between platforms`

**Quality bar:** 100% of UI reads tokens (CI-gated: zero raw hex/px in components) and every color pair is pre-verified ≥4.5:1 in light and dark — beating Linear's coherence and Stripe's component trust while matching Rabby's restraint.

**Definition of done**
  - [ ] Token set frozen as the single source of truth with both platform bridges deriving from it
  - [ ] Core components shipped with accessibility and states built in
  - [ ] CI check bans hardcoded color/size values in components
  - [ ] Risk is never presented by color alone (icon + label + token)
  - [ ] Light and dark themes verified against the token contract

**Doctrine hooks**
  - Doctrine 4: AmountText renders bigint base-units with the sig-fig rule — the design system makes float-money structurally impossible to display.
  - Doctrine 5: AA contrast and tokenized theming are treated as product requirements, gated in CI, not polish; RiskBadge encodes an honest risk state (Doctrine 3).


#### P1.06 · Motion Design System
> Motion that explains, never decorates — instant/quick/standard/celebrate, with reduced-motion first-class.

Own a small, principled motion language that communicates state, spatial continuity, and consequence, with prefers-reduced-motion as a designed path rather than a stripped-down afterthought. World-class means motion makes execution legible (steps, confirmations, receipts) and celebration is earned exactly once — rivaling Apple Wallet's tactility while never implying a state that isn't true.

**Owns**
  - The motion token scale (instant 80 / quick 200 / standard 300 / celebrate 600) and the shared --ease curve
  - The reduced-motion fallback contract — cross-fades only, no parallax/spring/celebrate — for every animation
  - Shared-element continuity (asset→detail, plan→execution) so navigation feels spatial
  - The execution-progress motion: interruptible, honest, and never a fake pre-chain 'confirmed' flourish
  - Celebrate-once semantics for genuine positive events (incoming funds), never on send
  - The hard rule that nothing is ever conveyed by motion alone

**Depends on:** Design System, Accessibility

**Interfaces**
  - `Motion tokens co-located in packages/ui`
  - `Reduced-motion fallback contract enforced per animation`
  - `Shared-element transition specs for the key journeys`
  - `Execution-timeline animation spec (tied to server-truth state)`
  - `Celebrate-once trigger contract`

**Quality bar:** Every animation has a purpose and a tested reduced-motion equivalent, and no motion ever implies a state that isn't true on-chain — beating Apple Wallet on earned tactility and never regressing to MetaMask's blocking, janky spinners.

**Definition of done**
  - [ ] Motion scale and easing frozen in tokens
  - [ ] A reduced-motion path exists for every animation and is tested in CI
  - [ ] Shared-element specs written for the primary transitions
  - [ ] Celebrate-once implemented honestly (real positive events only)
  - [ ] No blocking/frozen 'thinking' screens — progress is always labeled and interruptible

**Doctrine hooks**
  - Doctrine 3: motion must never animate a 'confirmed'/'real' state before chain truth exists — the timeline mirrors actual state transitions only.
  - Doctrine 5: reduced-motion support and tasteful, purposeful motion are product requirements, verified in CI, not optional polish.


#### P1.07 · AI UX
> The conversation is the wallet — 'AI proposes, code verifies, device disposes' made visible, honest, and injection-proof.

Own the end-to-end intent experience from utterance → parsed intent → PlanCard → Risk/Policy disclosure → device signature → execution timeline, with the AI's non-authority legible at every step. World-class means ChatGPT-grade conversation fused with a confirmation surface more trustworthy than any wallet's, where the model's proposal, the deterministic verdict, and the user's signature are three visibly distinct things.

**Owns**
  - The intent chat surface with English/Hindi/Hinglish parsing and full typed==voice parity
  - PlanCard as the proposal artifact: what it will do in plain language, with bigint-honest amounts and rounding
  - Disclosure of Risk + Policy verdicts, where a fail-closed PolicyGate renders as an un-overridable 'cannot proceed'
  - AI confidence/uncertainty handling and clarification chips for INTENT_AMBIGUOUS
  - Citation/verification honesty — facts the model claims are independently verified downstream before display
  - The UI truth that the AI has no signing tool, and the honest 'I can't do that yet' capability disclosure (INTENT_UNSUPPORTED)

**Depends on:** UX Psychology, Design System, Interaction Design, Navigation System

**Interfaces**
  - `Intent chat ↔ CopilotLlmClient boundary where the user's utterance is ALWAYS a user message, never concatenated into the system prompt (prompt-injection defense)`
  - `PlanCard / ConfirmSheet contract from the Design System`
  - `Risk/Policy disclosure mapping (gate=block → hard blocking UI; requirements surfaced honestly)`
  - `Clarification-chip protocol for ambiguity`
  - `Execution timeline (interruptible, server-truth) and the citation-verification surface`

**Quality bar:** The model never appears to sign, and every plan shows an auditable, human-readable proposal plus an independent deterministic verdict before signature — beating ChatGPT on conversation quality while exceeding every wallet on pre-signature clarity.

**Definition of done**
  - [ ] Full utterance→plan→verdict→signature→timeline flow shipped end-to-end
  - [ ] Prompt-injection defense visible and enforced (user text never enters the system prompt)
  - [ ] Fail-closed PolicyGate renders as a hard block the user cannot click through
  - [ ] Ambiguity resolves via clarification chips; unsupported intents disclosed honestly with capability chips
  - [ ] Typed and voice inputs reach identical outcomes

**Doctrine hooks**
  - Doctrine 2 is the whole card: AI proposes (PlanCard), deterministic code verifies (Risk/Policy gate), the device signature disposes — made structurally visible.
  - Doctrine 3 (no fake confirmations, honest capability limits) and Doctrine 6 (LLM behind a schema-forced boundary, every risky decision auditable) govern the conversation edges.


#### P1.08 · Navigation System
> You can always leave, come back, and never lose money-state — deep-linkable, lock-aware, interruptible.

Own the navigation runtime: routing, state-dependent entry, deep links, lock/unlock queueing, and the interruptible execution pill — so the app is resumable and trustworthy under real life (backgrounding, notifications, mid-signature). World-class means you can background the app mid-execution and return to exact server-truth, a robustness no current wallet reliably delivers.

**Owns**
  - State-dependent cold-launch entry (vault exists? auto-lock elapsed? backup deferred?)
  - The iw:// deep-link scheme and push-notification routing, with links queued behind unlock and resolved after
  - The persistent '1 in progress ▸' execution pill docked above the tab bar across all tabs until terminal state
  - Back-stack money-safety rules: pre-signature is free to abandon (ask nothing); mid-signature warns once
  - Onboarding and locked state as separate stacks that replace the whole tree
  - Web-shell section routing where the 'entered' gate is explicitly distinct from isUnlocked()

**Depends on:** Information Architecture, AI UX

**Interfaces**
  - `Route table + iw:// scheme (unlock, asset/{id}, execution/{id}, plan/{id}, receive/{ecosystem}, scan, backup)`
  - `State-entry decision graph (per docs/design/03 §4)`
  - `Unlock-queue contract for deferred deep links and pushes`
  - `Execution-pill state contract (progress → terminal)`
  - `Push-taxonomy → route map (execution updates, incoming funds, risk/price alerts)`

**Quality bar:** Every deep link and push resolves correctly through the lock screen, and mid-execution backgrounding returns to server-truth — beating Phantom and MetaMask on resumability and deep-link robustness.

**Definition of done**
  - [ ] State-entry graph implemented for all cold-launch cases
  - [ ] All iw:// links route correctly and queue behind unlock
  - [ ] Execution pill persists across tabs to terminal state
  - [ ] Back-stack money-safety rules enforced (free pre-signature, warn-once mid-signature)
  - [ ] Web section gate proven distinct from unlock; push routing mapped and tested

**Doctrine hooks**
  - Doctrine 3: execution progress is server-truth — navigation shows real state on return, never an optimistic local guess.
  - Doctrine 1 (locked state replaces the tree; session/keys stay on-device) and Doctrine 2 (mid-signature warn-once protects the sole disposer step).


#### P1.09 · Interaction Design
> Every value-moving gesture is deliberate, reversible-until-signed, and impossible to trigger by accident.

Own the micro-interaction grammar: inputs, gestures, confirmation mechanics, validation feedback, and the five honest states on every data surface. World-class means confirmations make consequence unmistakable (hold-to-confirm with a switch-control alternative), validation catches errors before they ever reach a confirm, and forms are as forgiving as Stripe Checkout.

**Owns**
  - The five-state system on every data surface: loading (skeleton ≤100ms), empty (inviting, one CTA), error (plain-language, next-step), stale (dim + 'as of', never silent-zero), offline (disable network money actions up front)
  - Input & validation grammar: per-ecosystem address checks (EIP-55 / bech32-bech32m / base58 on-curve), amount as bigint with 'Max = balance − reserved fee', recovery-phrase normalize + clipboard-clear on paste
  - Confirmation mechanics: sheet-vs-push, hold-to-confirm plus an accessible alternative
  - The one number-formatting law everywhere (sig-figs for crypto, locale fiat, 'you receive' rounds down / 'you pay' rounds up)
  - Error→UI mapping so users never see a raw code/hash/provider in a primary error surface (details live under 'Details')
  - The gesture set and thumb-zone placement of primary actions

**Depends on:** Design System, Motion Design System, UX Psychology, Accessibility

**Interfaces**
  - `Five-state component contract reused by every data surface`
  - `Validation rule set (address / amount / recovery-phrase) run before any confirm`
  - `Central number-format utility (single rule, all surfaces)`
  - `Error-code → copy + treatment + action map wired to API code strings`
  - `Confirm-mechanic spec (hold-to-confirm + switch alternative) and the Max/dust/fee-reserve logic surface`

**Quality bar:** Zero accidental value-moving actions, all five honest states present on every data surface, and validation blocks bad input before a confirm ever renders — beating Stripe Checkout on forgiveness and Rabby on pre-signature checks.

**Definition of done**
  - [ ] All five states shipped and audited on every data surface
  - [ ] Per-ecosystem address + amount validation enforced before confirm (with EIP-55 silent-corruption rejection)
  - [ ] Number-format rule centralized in one utility and used everywhere
  - [ ] Error map wired to API codes; no raw codes/hashes in primary surfaces
  - [ ] Hold-to-confirm plus switch-control alternative shipped; recovery-phrase paste clears the clipboard

**Doctrine hooks**
  - Doctrine 4: amounts are bigint base-units, 'Max' reserves the fee, and validation guards fail closed (reject > balance, ≤ 0, over-precision).
  - Doctrine 3 (five honest states; stale ≠ $0; no raw codes in the face) and Doctrine 2 (the confirm mechanic is the gate immediately before the device signature).


#### P1.10 · Accessibility
> WCAG 2.2 AA is a CI gate, not a promise — money made legible, operable, and honest for everyone.

Own accessibility as an enforced, tested contract across web and mobile: contrast, touch, screen-reader semantics, dynamic type, reduced motion, color-independence, and non-visual alternatives for every critical path. World-class means a blind user can send and receive funds end-to-end and any a11y regression fails CI — a bar no crypto wallet meets today.

**Owns**
  - The AA gate in CI: contrast pairs pre-verified in tokens, dynamic-type XXL snapshot, axe-style automated checks that block merge
  - Screen-reader semantics: amounts/status spoken as coherent sentences, live regions for thinking/stale/countdown/error, focus order matching visual order, focus trap in sheets
  - Touch standards: ≥44×44pt targets with spacing, primary actions in the bottom thumb zone
  - Color-is-never-the-sole-channel: risk/status always icon + label + color, colorblind-safe hues verified
  - Non-visual alternatives: hold-to-confirm switch alternative, voice↔typed intent parity, QR/scan manual-entry fallback
  - Dynamic-type reflow where amounts wrap and never truncate, layouts never clip at largest size

**Depends on:** Design System, Product Philosophy

**Interfaces**
  - `CI a11y gate (contrast + dynamic-type snapshot + automated checks) that blocks merge`
  - `Screen-reader label + live-region contract consumed by every interactive component`
  - `Focus-management spec (order, trap, move-to-meaningful-element on navigation)`
  - `Touch-target + thumb-zone rules enforced by the Design System`
  - `Alternative-input contracts (switch, voice, manual entry) and the color-independence checklist`

**Quality bar:** A full send and receive is completable via screen reader, and AA violations block the build — beating every crypto wallet (none currently pass) and matching Apple and Stripe's accessibility rigor.

**Definition of done**
  - [ ] AA CI gate live and blocking on both platforms
  - [ ] Contrast token pairs verified ≥4.5:1 (text) / ≥3:1 (large/icons/focus) in light and dark
  - [ ] Screen-reader path for send + receive verified end-to-end
  - [ ] Dynamic-type XXL reflow tested in CI snapshots (amounts wrap, no clipping)
  - [ ] Reduced-motion path exists for all motion; every risk/status uses icon + label + color; hold/voice/QR each have an alternative

**Doctrine hooks**
  - Doctrine 5: AA conformance and reduced-motion support are hard product requirements, gated in CI — accessibility is a build blocker, not a backlog item.
  - Doctrine 3: screen-reader and live-region surfaces must speak honest states (loading/stale/error), never announce a fake 'confirmed'.


### Phase 2 — Wallet Foundation


#### P2.01 · Wallet Core
> The on-device vault and keyring — the trust root and sole disposer of funds, the only code that ever touches a private key.

World-class here is an audited, zero-network, deterministic crypto core where key material has the shortest possible lifetime in memory and never crosses the device boundary. It generates BIP-39 entropy, derives BTC/EVM/SOL keys (BIP-84/44 secp256k1 + SLIP-0010 ed25519), seals the secret under scrypt→AES-256-GCM, and signs — nothing else. Every other module in the product inherits its guarantees; if this package is wrong, everything above it is fraudulent.

**Owns**
  - Mnemonic generation/validation/normalization (BIP-39, 12 or 24 words) via audited @scure/bip39
  - HD derivation — HDKeyring over BIP-32/44/84 (secp256k1) plus an in-repo SLIP-0010 (ed25519) for Solana, every derived key zeroized after use
  - The encrypted vault: scrypt (N=2^15,r=8,p=1) → AES-256-GCM, versioned JSON envelope with KDF params inside it and all metadata bound as GCM AAD
  - SigningManager — unified WalletSigner over EVM (tx/EIP-712/EIP-191), Bitcoin PSBT, and Solana tx-message, deriving-signing-zeroizing per call
  - WalletManager lifecycle facade: create/import/unlock/lock/changePassword/verifyPassword/exportMnemonic/wipe
  - SecureStore persistence boundary (interface + in-memory impl; native Keychain/Keystore supplied by the platform), storing only opaque ciphertext
  - Byte-hygiene primitives: zeroize, constantTimeEqual, and index/param validation that fails closed

**Depends on:** —

**Interfaces**
  - `WalletManager — create/import/unlock/lock/getSigner/getAccount/verifyPassword/exportMnemonic/wipe`
  - `HDKeyring.getAccount(index) → UniversalAccount (btc/evm/sol AccountRef, pure derivation, no key returned)`
  - `WalletSigner — signEvmTransaction/TypedData/PersonalMessage, signBitcoinPsbt, signSolanaTransactionMessage, all accountIndex-scoped`
  - `sealVault(secret,password)/openVault(envelope,password) — versioned, KDF-in-envelope, AAD-bound`
  - `SecureStore — async get/set/delete/has over string ciphertext`

**Quality bar:** Deliver Ledger/Trezor-grade on-device signing in software: no key material ever leaves the package except the two explicitly SENSITIVE members, every derived key wiped in a finally, KDF cost at or above OWASP scrypt guidance, and GCM-AAD tamper-evidence on every vault field. Beat MetaMask's crypto surface — zero ambient key exposure and a wrong-password vs tampered-vault result that is indistinguishable by design.

**Definition of done**
  - [ ] SLIP-0010 and BIP-32/44/84 known-answer vectors pass, cross-checked against ed25519-hd-key and MetaMask/Phantom/Ledger derivation paths
  - [ ] Zero network imports in the package, provable by a lint/boundary test
  - [ ] Every private-key buffer is proven zeroized by test; destroy() wipes the seed and every subsequent call throws KEYRING_DESTROYED
  - [ ] Wrong password and tampered envelope both yield VAULT_DECRYPT_FAILED (indistinguishable); scrypt params outside bounds are rejected as a KDF-memory DoS guard
  - [ ] Documented threat model + ADR covering the scrypt-over-argon2id decision and the passkey+MPC roadmap
  - [ ] 100% branch coverage on vault, keyring, and signer paths

**Doctrine hooks**
  - Doctrine 1 (non-custodial) — this package IS the boundary: keys are generated and used on-device and never sent to a server
  - Doctrine 2 (device signature disposes) — SigningManager is the sole disposer of funds; the AI layer can never reach it
  - Doctrine 4 (integer bigint / fail closed) — account indices validated to [0,2^31) and scrypt params bounded so a hostile envelope cannot demand gigabytes of KDF memory
  - Doctrine 6 (pure, exhaustively-tested core) — no clock/RNG beyond crypto entropy; every derivation and cipher path is vector-tested


#### P2.02 · Universal Identity
> One human identity, three receive addresses, every chain invisible — the abstraction that makes crypto feel like one account.

World-class is the user perceiving a single identity while the wallet silently manages Bitcoin, a universal EVM address (one for all EVM chains), and Solana beneath it. The identity id is deterministic and device-independent, so the same mnemonic yields the same identity on every device with no server sync of the identity itself. This is the permanent foundation the Intent Engine, AI layer, and Portfolio build on.

**Owns**
  - The UniversalIdentity model: stable id + accountIndex + exactly three ReceiveAddress (btc/evm/sol)
  - Deterministic, device-independent identity id (sha256 of the normalized address triple, first 32 hex)
  - The invariant that ONE EVM address works across Ethereum/Arbitrum/Base/Optimism/Polygon/BNB, plus its honest worksOn labeling
  - The identity ↔ HD-account-index mapping (an identity IS an account index; derivation makes it reproducible)
  - Receive-address presentation — getReceiveAddresses returning the product's 'only three identities' triple
  - Identity metadata (label, caller-supplied createdAt) and testnet/mainnet inference from the BTC HRP

**Depends on:** P2.01

**Interfaces**
  - `deriveUniversalIdentity(UniversalAccount, metadata?) → UniversalIdentity`
  - `computeIdentityId(account) → stable 32-hex id (device-independent)`
  - `getReceiveAddresses(identity) → [btc, evm, sol] ReceiveAddress[]`
  - `ReceiveAddress { ecosystem, address, network, derivationPath, worksOn }`

**Quality bar:** Beat Phantom's multi-chain identity: where Phantom exposes per-chain addresses, we collapse to three receive identities under a single stable id with zero server dependency. The 'three addresses, chains invisible' promise must survive every surface (receive, contacts, portfolio) — no chain leaks through where the product promised abstraction.

**Definition of done**
  - [ ] The same mnemonic produces an identical identity id on two independent devices (test)
  - [ ] The EVM address is proven byte-identical across all six supported EVM chains
  - [ ] testnet vs mainnet is inferred correctly from the BTC bech32 HRP; worksOn lists only chains actually covered
  - [ ] The identity id is stable across re-derivation and label changes; getReceiveAddresses always returns exactly three
  - [ ] Documented Universal Identity engine doc + ADR-0030

**Doctrine hooks**
  - Doctrine 3 (never fake) — worksOn lists only the chains a derivation genuinely covers, and testnet is labeled testnet
  - Doctrine 1 — the identity derives purely from the on-device account; nothing identity-defining is sent to a server (only optional prefs/contacts sync)
  - Doctrine 6 — pure derivation with no clock access (createdAt is caller-supplied), fully fixture-testable


#### P2.03 · Account System
> Many accounts from one seed — labeled, switchable, watch-only-capable — that switch all three chains at once, atomically.

World-class is a first-class account manager over the HD tree: add, label, and reorder multiple accounts (each an index → Universal Identity), switch the active account atomically so every read and signature re-scopes in lockstep, and support watch-only and single-key imports alongside the seed accounts. Today this is a thin localStorage {index,count}; V3 makes it a typed, synced, kind-aware account model where signing authority is never ambiguous.

**Owns**
  - The account list model: index, label, kind (hd | imported | watch-only), display order, hidden flag
  - Active-account selection and atomic switch — every balance read, identity render, and signature keys off the one active index
  - Account creation (derive the next HD index) plus rename and reorder
  - Watch-only accounts (address-only, tracking + receive, signing refused) and segregated single-private-key imports that never pollute the seed tree
  - Per-account preferences (default network, hidden assets) and an account-switch event so UI re-derives
  - The binding that guarantees the displayed account is the account that will sign

**Depends on:** P2.01, P2.02

**Interfaces**
  - `activeAccountIndex() / setActiveAccount(index) / addAccount() / accountCount()`
  - `listAccounts() → AccountRef[] with label + kind + order`
  - `renameAccount(index, label) / reorder / setHidden`
  - `addWatchOnly(address) and importPrivateKey(key) — segregated from HD accounts, signing gated by kind`

**Quality bar:** Match Rabby's account model (HD + imported + watch-only clearly segregated, signing authority never mixed) and Phantom's instant account switcher — then go further: switching one account switches all three chains (BTC/EVM/SOL) simultaneously via the Universal Identity. Switch latency imperceptible, and zero stale-account signatures (the exact class of bug behind wrong-principal sends).

**Definition of done**
  - [ ] Switching accounts re-scopes balances, identity, and signatures atomically with no stale read — regression test for the wrong-principal session display bug
  - [ ] Watch-only accounts can receive and track but signing throws; imported single keys never appear in the HD tree or the seed backup
  - [ ] Labels and order persist (and optionally sync); adding account N deterministically derives HD index N
  - [ ] A locked wallet exposes no account list beyond what is safe to show while locked
  - [ ] Account kind gates every signing call — signing authority is a function of kind, not of being unlocked

**Doctrine hooks**
  - Doctrine 2 — signing authority is per-account and explicit; a watch-only account can never dispose funds
  - Doctrine 3 — the active account shown is always the account signed with; never display account A while signing as B
  - Doctrine 4 — index validation fails closed; an out-of-range switch is refused, not clamped silently
  - Doctrine 1 — imported keys are sealed in the same on-device vault and never exported off-device


#### P2.04 · Asset Engine
> The canonical registry that knows what every token actually is — identity, decimals, price key, and whether it's spam — so no two tokens ever collide.

World-class is a canonical asset registry mapping (chain, contract/mint) → a stable asset id, with authoritative decimals, symbol, name, logo, a price key, and a spam/scam classification. Today portfolio aggregation groups by uppercased symbol — a documented collision risk where two distinct tokens (a real USDC and a scam clone) merge. The Asset Engine closes that hole and becomes the assetKey the Portfolio Engine plugs in without an API change.

**Owns**
  - The canonical asset-id scheme: (chain, address) → stable id, with native assets keyed explicitly and distinctly
  - Authoritative token metadata — decimals, symbol, name, logo — with on-chain fallback via adapter.getAssetMetadata and refusal to guess
  - The assetKey function consumed by portfolio aggregation (the documented drop-in override)
  - Spam / scam-clone / airdrop-dust classification with allow/deny lists, folded away by default
  - Stablecoin and wrapped-asset canonicalization rules (e.g. how wBTC relates to BTC for display grouping)
  - Per-asset trust/verification signals and the price-key mapping the PriceSource consumes

**Depends on:** P2.06, P2.07

**Interfaces**
  - `assetKey(PortfolioBalance) → canonical id (drop-in for aggregatePortfolio's assetKey override)`
  - `getAssetMetadata(chain, address) → { symbol, decimals, name, logo }`
  - `classifyAsset(ref) → { verified | unverified | spam }`
  - `resolvePriceKey(assetId) → price-source key; nativeAssetFor(chainId)`

**Quality bar:** Beat Zerion/DeBank asset resolution and MetaMask's static token lists: no symbol collisions, no scam clone ever rendered as the real token, decimals never guessed (a wrong decimal is a money-display bug). Spam filtering as sharp as Rabby's — airdrop dust and honeypot clones folded away by default and never counted as real value.

**Definition of done**
  - [ ] Two distinct tokens sharing a symbol receive distinct asset ids and never merge in the portfolio (test against the aggregate collision case)
  - [ ] Decimals are always sourced authoritatively (registry or on-chain), never assumed; unknown metadata is an honest 'unknown', not a fabrication
  - [ ] Spam/scam tokens are classified and excluded from headline value while remaining inspectable
  - [ ] Native assets are keyed distinctly from same-symbol tokens
  - [ ] The assetKey override passes the existing portfolio aggregation suite with zero collisions; documented registry doc + ADR

**Doctrine hooks**
  - Doctrine 3 (never fake) — an unverified or spam token is labeled and never counted toward real net worth; unknown metadata is surfaced honestly
  - Doctrine 4 — decimals feed integer value math, so decimals are authoritative-or-refuse; a wrong decimal is treated as a fund bug
  - Doctrine 6 — classification is deterministic and testable; the AI layer never decides what a token is


#### P2.05 · Portfolio Engine
> One net-worth number and one asset list across every chain, in exact integer money, that tells the truth when the network fails.

World-class is pure aggregation that merges the same asset across chains into one position (keeping per-chain provenance), values everything in integer micro-USD with no float anywhere, folds dust, propagates staleness, and — the load-bearing part — distinguishes a network-read failure from a genuine $0. It is the honest financial mirror the entire product renders.

**Owns**
  - Cross-chain aggregation: group balances by canonical asset, merge across chains, retain per-chain provenance for the expand view
  - Integer micro-USD money math (usdToMicros, assetValueMicros, scaleAmount) — bigint end-to-end, float only at the display edge
  - Dust thresholding and fold (below $1 excluded from headline, retrievable)
  - Staleness propagation — any stale balance or price marks the asset and the portfolio stale
  - The four-state honesty model: loaded / loading / partial-read / network-fail — and network-fail is never $0
  - The injected BalanceSource and PriceSource interfaces plus the sort/format presentation edge

**Depends on:** P2.04, P2.06

**Interfaces**
  - `aggregatePortfolio(balances, { prices, dustThresholdMicros, assetKey }) → UnifiedPortfolio`
  - `UnifiedAsset { amount, decimals, valueMicros, priceUsd|null, chains[], isDust, stale }`
  - `formatUsd(micros) → display string (round half-down at the edge)`
  - `BalanceSource.getBalances(identityId) / PriceSource.getPrices(keys)`

**Quality bar:** Match Zerion/DeBank unified multi-chain net worth, then beat all of them on honesty: a failed RPC read is NEVER rendered as $0 (the balances-fail-soft doctrine), partial reads are labeled partial, and unpriced assets show amount with no invented value. Money math is exact to the micro-USD — no float drift a JS-number portfolio silently accrues.

**Definition of done**
  - [ ] network-fail, partial-read, unpriced, and genuine-zero are four visibly distinct states in both the engine result and the UI (tests)
  - [ ] No float appears anywhere in the value path — bigint micro-USD end-to-end, verified
  - [ ] The same asset on three chains merges into one position with provenance intact
  - [ ] Dust is folded below $1, excluded from the headline, and still retrievable; negative balances are defensively dropped
  - [ ] The stale flag is set iff any contributing balance or price was stale

**Doctrine hooks**
  - Doctrine 3 (never fake) — the load-bearing rule: a null read is not $0, stale is labeled stale, and unpriced value is never invented
  - Doctrine 4 — all value math is integer bigint micro-USD; display float lives only at the very edge
  - Doctrine 6 — aggregation is pure and fixture-testable; all data arrives through injected sources


#### P2.06 · Blockchain Adapter
> The printer-driver abstraction: one interface for read/fee/broadcast/track, so the platform never learns a single chain's quirks.

World-class is a uniform BlockchainAdapter that every ecosystem implements (EVM, Solana, Bitcoin) behind an AdapterRegistry gateway, backed by a failover-aware ProviderPool. Business logic references chains only by ChainId and this interface, so adding a chain means implementing the interface, never touching callers. The adapter reads, estimates fees, broadcasts, and tracks — it never builds intent and never signs.

**Owns**
  - The BlockchainAdapter interface: getNativeBalance, getTokenBalances, getBlockHeight, getAssetMetadata, validateAddress, estimateFees, broadcastRawTransaction, getTransactionStatus
  - The three concrete adapters: EvmAdapter (EIP-1559 fees + raw JSON-RPC, no heavy client on the hot path), SolanaAdapter, and BitcoinAdapter over esplora REST
  - AdapterRegistry — the single gateway that maps ChainId → a wired, memoized adapter with DI transports
  - ProviderPool — priority-order failover, failure cooldown, EWMA latency (observability only), API-key redaction, and the JsonRpcError-vs-transport-error contract
  - The chain registry as single source of truth: ids, evmChainId, native asset, finality rule, explorer URL, default RPC endpoints
  - The discriminated FeeEstimate union (evm | btc | sol) reflecting how differently each chain prices

**Depends on:** —

**Interfaces**
  - `AdapterRegistry.get(chainId) → BlockchainAdapter (memoized, transports injected)`
  - `BlockchainAdapter — the eight read/validate/fee/broadcast/track methods`
  - `FeeEstimate = { evm | btc | sol } discriminated union; FeeSpeed slow|normal|fast`
  - `ProviderPool.request(method, params) with deterministic failover; getChain/listChains/chainByEvmChainId`
  - `EVM-only extras on the concrete class: getNonce, estimateGas, simulate`

**Quality bar:** Beat a raw ethers/web3 integration on reliability: multi-endpoint failover with cooldown so a pool degrades to best-effort and never bricks (a class of outage single-RPC MetaMask users hit), keyed providers tried first and public fallbacks last, deterministic selection with no latency flap. Match Rabby's chain breadth with a cleaner add-a-chain story than any competitor.

**Definition of done**
  - [ ] Adding a chain touches only the registry plus one adapter, zero callers (proven by test)
  - [ ] ProviderPool fails over on transport error but propagates JsonRpcError/revert immediately without failover (deterministic chain state)
  - [ ] RPC URLs never leak API keys in logs or errors (redaction test)
  - [ ] Each adapter's validateAddress, fee estimate, broadcast, and status are covered including a mocked-RPC path
  - [ ] The per-chain finality rule is honored by the tracker; an unknown ChainId fails closed with UNKNOWN_CHAIN

**Doctrine hooks**
  - Doctrine 2 — the adapter broadcasts and tracks but NEVER signs (building lives in the execution engine, signing in the core)
  - Doctrine 4 — balances are bigint base units and fees are bigint; no float crosses this layer
  - Doctrine 3 — a failed read raises rather than returning 0, and 'confirmed' reflects the chain's real finality rule
  - Doctrine 6 — chain facts are centralized in the registry; nothing elsewhere is allowed to hardcode a chain


#### P2.07 · Address Intelligence
> Know what an address is before a cent moves — validate it, name it, and catch the poisoned lookalike that steals funds.

World-class is the layer that turns a raw string into a trusted, understood recipient: strict cross-ecosystem validation, human-name resolution (ENS/SNS forward and reverse), address labeling (own accounts, known contracts, exchanges), and active address-poisoning / lookalike detection. Sending to a wrong address is an irreversible fund-loss bug, so this layer is strict and fails closed.

**Owns**
  - Cross-ecosystem classification and strict validation: EIP-55 mixed-case enforcement, bech32/bech32m and base58check checksum verification, Solana 32-byte check
  - Canonical normalization and case-insensitive equality across ecosystems
  - Address-poisoning / lookalike detection (same first-6 + last-4, different middle) surfaced as a high-severity risk signal before send
  - Name-service resolution (ENS/SNS) forward and reverse, behind a schema-forced boundary, always showing the underlying address
  - Address labeling: own-account, contract vs EOA, known-entity, and first-time-recipient signals
  - The single validation entry point every module reuses so nobody re-implements chain-specific checks

**Depends on:** P2.06

**Interfaces**
  - `classifyAddress(str) → AddressInfo | null; requireAddress(str, ecosystem?) throws INVALID_ADDRESS`
  - `addressesEqual(a, b) — canonical, EVM checksum-insensitive`
  - `detectAddressPoisoning({ address, knownAddresses }) → RiskSignal | null (0.85 severity on a lookalike)`
  - `resolveName(name) → address plus reverse resolution; labelAddress(address) → { kind, label }`

**Quality bar:** Beat MetaMask/Phantom's paste-and-pray: a mixed-case EVM address failing EIP-55 is rejected as a likely typo (the cheapest possible fund-loss defense), and a poisoned lookalike of a saved contact is flagged before the user can send. Match Rabby's pre-transaction address context (contract vs EOA, first interaction) as a default, not a hidden setting.

**Definition of done**
  - [ ] Every send target routes through requireAddress — no module re-implements chain validation
  - [ ] A mixed-case EVM typo is rejected while all-lower/all-upper are accepted as unverifiable-not-wrong
  - [ ] A lookalike of a known/saved address is flagged before a send can proceed
  - [ ] ENS/SNS resolve and reverse-resolve with the raw address always shown alongside the name
  - [ ] Own-account and contract addresses are labeled; anything invalid or unknown fails closed

**Doctrine hooks**
  - Doctrine 2 — this is a verify-only gate: it can warn or refuse, never sign or move funds
  - Doctrine 3 — a resolved name always shows the underlying address; the wallet never hides what is actually signed, and never fabricates a label
  - Doctrine 6 — validation and poisoning detection are pure, total, and exhaustively tested; the name-service call is the only edge, behind a schema boundary


#### P2.08 · Universal Address Book
> 'Send $100 to Rahul' resolves to exactly the right address — one contact, every chain, verified by use, never guessed.

World-class is a cross-ecosystem contact book that turns a human recipient query into a concrete, validated address, deduped by (ecosystem, normalized address), gaining a verified marker once the user has successfully sent to it. It is the resolution the Intent Engine depends on and the anti-mistake memory the user accrues over time.

**Owns**
  - The contact model: deterministic id from ecosystem+normalized address, name, ecosystem, verified flag
  - add / rename / remove / list with strict address validation and dedupe (the same address cannot be saved twice)
  - The verified marker, set only after a successful send — a soft anti-mistake trust signal
  - Recipient resolution: a valid address wins and is enriched with a matching contact; otherwise name match (one → contact, many → ambiguous, none → not-found), never guessing among duplicates
  - A one-person-many-chains grouping model (a named person can hold BTC + EVM + SOL addresses)
  - The injected ContactStore boundary (on-device secure/local storage, optional sync), assuming no network or clock in the core

**Depends on:** P2.02, P2.07

**Interfaces**
  - `ContactBook.add / rename / markVerified / remove / list`
  - `resolveRecipient(query) → { address | contact | ambiguous | not_found }`
  - `ContactStore — list / put / delete (injected persistence)`
  - `Contact { id, name, address, ecosystem, verified }`

**Quality bar:** Beat MetaMask's flat per-address book and match Phantom's contacts UX, then exceed both: one named person holds addresses across BTC/EVM/SOL, resolution never silently picks among same-name contacts (it returns ambiguous), and verified-by-use delivers an Apple-Contacts-grade trust cue no competitor surfaces. Poisoning-aware via P2.07, so a saved contact can't be shadowed by a lookalike.

**Definition of done**
  - [ ] Adding the same address twice is refused via deterministic id dedupe
  - [ ] A name matching two contacts returns ambiguous and never guesses; a raw valid address resolves and auto-enriches with a known contact
  - [ ] verified flips only after a real successful send, never on a claim
  - [ ] Storage is injected and on-device — the core assumes no network or clock
  - [ ] Resolution composes with poisoning detection so a lookalike of a saved contact is caught before send

**Doctrine hooks**
  - Doctrine 3 — resolution never guesses (ambiguous is a real, first-class state), and verified reflects a real on-chain send
  - Doctrine 1 — contacts live on-device (optional encrypted sync); the core assumes no network
  - Doctrine 2 — the book resolves and warns; it never authorizes a send
  - Doctrine 6 — resolution is pure over an injected store with deterministic contact ids


#### P2.09 · Transaction Engine
> Build → simulate → device-sign → broadcast → confirm → verify, as a resumable machine that never strands funds.

World-class is the pipeline that takes an approved plan to on-chain reality: it builds the raw transaction per chain, simulates it in a sandbox and refuses to broadcast if effects don't match the plan, hands the unsigned payload to the on-device signer, broadcasts through the adapter, tracks to finality, and — on any unrecoverable failure — PARKS with the funds' exact location known. It coordinates the guard, the signer, and the adapter; it holds no keys of its own.

**Owns**
  - Per-chain transaction building at the execution seam: EIP-1559 assembly with nonce/gas, PSBT + UTXO selection, and Solana message compilation
  - The simulate-before-broadcast sandbox gate — a step whose simulated effects diverge from the plan is never broadcast
  - The deterministic broadcast guard: fail-closed on unknown chain or malformed recipient, mainnet requires explicit acknowledgement, and the mainnet spend cap is enforced
  - Orchestration of sign (via WalletSigner) → broadcast (via adapter) → confirm (per finality rule) → verify, as an explicit step machine
  - Idempotent retry with an attempt cap, then the never-strand-funds park (records FundsLocation and stops) plus crash-resume from the first unconfirmed step
  - Settlement-safe multi-step sequencing (approve → confirm → swap) so an approval never races its spend

**Depends on:** P2.01, P2.06, P2.07

**Interfaces**
  - `ExecutionEngine.execute(plan) / resume(executionId, plan) → Execution`
  - `StepDriver — the injected simulate/broadcast/confirm seam that signs on-device (the engine never sees a key)`
  - `guardBroadcast(input) / assertBroadcastAllowed(input) → GuardDecision (blocked[], warnings[]) or GUARD_BLOCKED`
  - `Execution / StepState machine: pending → simulating → broadcasting → confirming → confirmed | failed | reverted, with FundsLocation always set`
  - `adapter.broadcastRawTransaction + getTransactionStatus for the write lifecycle`

**Quality bar:** Beat every hot wallet's fire-and-hope broadcast: simulate-before-broadcast (à la Tenderly/Rabby pre-sign simulation) is mandatory, not optional; the machine is crash-resumable and the funds' location is ALWAYS known — a guarantee neither MetaMask nor Phantom makes. Match Stripe's payment-intent reliability: idempotent retries, an explicit terminal state, and never a silently lost transfer.

**Definition of done**
  - [ ] A simulation whose effects don't match the plan is never broadcast (sandbox test)
  - [ ] A crash mid-execution resumes at the first unconfirmed step (resume test)
  - [ ] An unrecoverable failure parks with a human-readable FundsLocation — never 'unknown'
  - [ ] The guard blocks unknown-chain, malformed recipient, unacknowledged mainnet, and over-cap sends (pure, total tests); retries are idempotent up to the cap then park
  - [ ] The engine never touches a private key (signing is inside the injected driver), and multi-step approve→swap is settlement-safe ordered

**Doctrine hooks**
  - Doctrine 2 — the literal embodiment: the plan proposes, the deterministic refuse-only guard verifies, the device signature disposes
  - Doctrine 3 — nothing is marked confirmed that did not confirm on-chain; testnet and capped-mainnet are labeled honestly
  - Doctrine 4 — amounts, fees, and nonces are bigint, and the guard fails closed on anything it cannot positively verify
  - Doctrine 6 — the guard and state machine are pure and exhaustively tested; signing is isolated at the edge


#### P2.10 · Session Management
> Unlocked when you're here, locked when you're not — on the device and across every server session, with one button to sign out everywhere.

World-class is the state-and-timing layer that governs when the wallet is usable: idle auto-lock that destroys the in-memory seed, lock-on-background, biometric/passkey re-unlock, and — server-side — revocable JWT sessions with sign-out-everywhere and per-device visibility. It holds no key material; it decides when the keyring may exist and whether a server session is still valid.

**Owns**
  - The device SessionManager: idle auto-lock timer over an injectable scheduler (start/touch/stop) that destroys the keyring on timeout
  - Lock-on-background and manual lock, wiping the in-memory seed on every lock
  - Re-auth gates — verifyPassword WITHOUT unlocking (the reveal-seed / high-risk-action pattern that never short-circuits on the ambient unlocked flag)
  - The biometric / passkey unlock seam
  - Server-side session lifecycle: JWT issue/refresh/revoke, sign-out-everywhere, and a per-device active-session list
  - Binding a session's principal to the signing account (anti wrong-principal) and a configurable auto-lock policy (Simple/Pro/Dev, spend-based re-auth) with a safe default

**Depends on:** P2.01, P2.03

**Interfaces**
  - `SessionManager(onLock, { autoLockMs, scheduler }) — start / touch / stop; onLock → keyring.destroy`
  - `WalletManager.lock / touch / verifyPassword — re-auth without unlocking`
  - `Server session store — issue / validate / revoke / revoke-all (sign-out-everywhere)`
  - `Active-device session list; principal-to-account binding for the current session`

**Quality bar:** Match Apple/1Password auto-lock ergonomics (idle + background lock, biometric re-entry) and beat MetaMask's weak session model with Stripe-grade server sessions: instant revocation, sign-out-everywhere, and per-device visibility. Re-auth for sensitive actions (reveal seed, high-value send) must re-verify the password/biometric and never trust the ambient unlocked flag.

**Definition of done**
  - [ ] Idle timeout destroys the keyring (seed wiped) and every subsequent core call throws KEYRING_DESTROYED; touch() resets the timer and stop() is idempotent; lock-on-background is verified
  - [ ] Reveal-seed / high-risk re-auth uses verifyPassword and rejects a wrong password even while the wallet is already unlocked (regression test)
  - [ ] Server sign-out-everywhere revokes all device JWTs immediately
  - [ ] A session's principal is bound to the signing account, so a switched account cannot sign under a stale session
  - [ ] The auto-lock policy is user-configurable with a safe 5-minute default

**Doctrine hooks**
  - Doctrine 1 — on lock the seed is wiped from memory; only opaque ciphertext persists
  - Doctrine 2 — re-auth gates protect the disposer; the ambient unlocked flag never authorizes a sensitive action on its own
  - Doctrine 3 — session state shown is real: locked means locked, and the displayed principal is the one that will sign
  - Doctrine 6 — the timer is pure over an injectable scheduler, giving deterministic tests with no real clocks


### Phase 3 — Intent Platform


#### P3.01 · Intent Engine
> Turn 'send Mom 200 bucks' into a typed, resolved, risk-checked ExecutionPlan — or a precise refusal — never a guess.

The single decision engine that converts an utterance into a validated Intent and a deterministic ExecutionPlan, or an honest, specific refusal. It is where AI proposes a typed shape and pure code resolves amounts to bigint base units, discovers routes, attaches a RiskReport, and gates feasibility. Nothing downstream ever executes without a plan a human could audit line by line.

**Owns**
  - The versioned IntentSchema / ExecutionPlanSchema / PlanStepSchema / RiskReportSchema contract (Zod, SCHEMA_VERSION) — the wire shape every layer agrees on
  - Two-tier parsing: deterministic parser first, schema-forced LLM only for the residue; CompositeParser reconciliation + ambiguity surfacing (never silently guessing recipient/asset/amount)
  - Amount resolution: fiat/asset/all/fraction/percent(bps) into integer base-unit strings via decimalToBase, including the 'all' native max-send reserve
  - Planning: planIntent producing ordered PlanSteps (approve then swap sequencing, cross-chain legs) with per-step PlanAmount in base units
  - Feasibility + confirmation gating over injected Holdings/Price/Route/Risk providers: refuse on insufficient funds, unknown asset, or unroutable pair with a typed IntentError
  - The ACTIONABLE_KINDS boundary that decides which intent kinds may ever reach execution

**Depends on:** Provider Framework, Route Optimizer, Financial Brain, Risk Engine (V2), Chains Adapters (V2)

**Interfaces**
  - `IntentEngine.plan(utterance, ctx) -> EngineResult (Intent | ExecutionPlan | typed refusal)`
  - `IntentSchema / ExecutionPlanSchema / RiskReportSchema (SCHEMA_VERSION-tagged, Zod)`
  - `CompositeParser (IntentParser + LlmClient + ParseContext)`
  - `EngineContext ports: HoldingsProvider, PriceProvider, RouteProvider, RiskProvider`
  - `decimalToBase / baseToDecimal / resolveAmountToBase / detectAsset`

**Quality bar:** Zero mis-resolved funds: any ambiguity in recipient, asset, or amount is surfaced for confirmation, never guessed — beating Phantom/MetaMask send flows where a wrong paste silently proceeds. Every plan is reconstructable and diff-able from the schema alone; the parser is property-tested against an adversarial utterance corpus.

**Definition of done**
  - [ ] Every Intent variant round-trips through IntentSchema; unknown shapes are rejected, not coerced
  - [ ] All amount kinds resolve to exact bigint base units under property tests, with no float anywhere on the path
  - [ ] The deterministic parser covers the top intents fully offline; the LLM residue is schema-validated before use
  - [ ] Ambiguous or underspecified utterances yield a confirmation prompt, never an assumed value
  - [ ] Infeasible intents (funds, asset, route) return a typed IntentError with a human-readable cause
  - [ ] The emitted ExecutionPlan carries a RiskReport and ordered steps ready for the settlement front door

**Doctrine hooks**
  - Rule 2 + 6: the LLM emits only IntentSchema-shaped output via schema-forced tool use; resolution, planning, and feasibility are pure deterministic code — AI proposes, code disposes
  - Rule 4: amounts become integer bigint base-unit strings at the schema edge and stay integer end-to-end; guards fail closed
  - Rule 3: infeasibility and ambiguity become honest typed refusals, never a fabricated plan


#### P3.02 · AI Planner
> The financial copilot that plans in prose but proves in code — every figure cited, every action gated, nothing signed.

The conversational decision layer above every engine: the LLM picks tools and drafts language while deterministic code owns recommendations, plan gating, risk/policy disclosure, confidence, and fact-verification. It turns a goal ('retire my USDC risk', 'DCA into ETH') into a ProposedPlan grounded in verified facts and hands it to the user's device. It proposes; it never signs and never executes.

**Owns**
  - The LLM boundary (CopilotLlmClient): system prompt + tool schemas + messages, where the user utterance is ALWAYS a user message and never concatenated into the system prompt (prompt-injection defense)
  - The FactLedger + fact-verification: every numeric the model states must cite a ledgered CitedFact; verifyResponse / hasUncitedNumerics reject uncited numbers
  - Tool dispatch with an execute-tool ban (assertNoExecuteTools): the copilot can read, plan, and simulate but never broadcast
  - The PolicyGate: each ProposedPlan must clear Risk AND Policy before it is shown as actionable
  - Deterministic Recommendation / AutomationSuggestion building plus a computed Confidence (never a model-claimed one)
  - Context assembly + redaction (seedFacts / redact) so no secret-shaped data enters a prompt

**Depends on:** Intent Engine, Financial Brain, Route Optimizer, AI Memory, Risk Engine (V2), Policy Engine (V2)

**Interfaces**
  - `Copilot.respond(CopilotRequest) -> CopilotResponse (discriminated CopilotResponseKind)`
  - `CopilotLlmClient.next(messages, tools) -> LlmTurn (real Claude client + ScriptedLlmClient)`
  - `ToolDispatcher / DEFAULT_TOOLS / ToolScope (read-only, no-execute)`
  - `FactLedger + verifyResponse + computeConfidence`
  - `PolicyGate.evaluate(ProposedPlan) -> gated actionable/blocked`

**Quality bar:** A verified hallucination rate of zero: no uncited numeric ever reaches the user, beating raw ChatGPT/GPT-agent tool-use where figures are asserted un-grounded. Injection-hardened to Stripe-Radar determinism — a malicious utterance or tool result can never escalate the copilot into signing authority.

**Definition of done**
  - [ ] Every numeric in copilot prose maps to a FactLedger id; verification rejects any that does not
  - [ ] No execute-capable tool is reachable; assertNoExecuteTools is enforced in tests
  - [ ] User utterances and tool outputs never enter the system prompt; an injection corpus passes
  - [ ] Every actionable ProposedPlan carries Risk + Policy disclosures and a computed confidence
  - [ ] The whole orchestrator is deterministically testable via ScriptedLlmClient
  - [ ] Redaction guarantees no key, mnemonic, or address shape can enter an LLM call

**Doctrine hooks**
  - Rule 2 + 6: this module IS the 'AI proposes / code verifies' seam; the LLM is confined to tool-pick + prose behind schema-forced tools while everything load-bearing is deterministic
  - Rule 3: fact-verification makes fabricated numbers structurally impossible to surface
  - Rule 1: read/plan-only scope means the copilot never touches keys or signing


#### P3.03 · Execution Engine
> Run an approved plan as a resumable, idempotent step machine that would rather stop safely than ever strand a cent.

Executes an approved ExecutionPlan as a persisted, simulate-gated, resumable step machine that answers 'how and in what order' without ever holding keys. Every step is simulated before broadcast, idempotent on retry, and either recovered or safely parked on failure — so a crash, a reorg, or a dropped tx never loses money or double-spends.

**Owns**
  - The Execution state machine (initExecution, StepState/StepStatus, FundsLocation) — provable location of funds at every instant
  - Simulate-gating: no step broadcasts until its SimulationResult passes; the sandbox is non-skippable
  - Idempotency + resume: nextRunnableStep / isRunnable / allConfirmed, giving safe re-entry after crash with no double-broadcast
  - Recovery + park: RecoveryHint classification and park-not-strand on unrecoverable steps
  - The StepDriver seam (simulate/execute/confirm/verify) — chain-specific work is injected, keys are never held here
  - Durable ExecutionStore + an ExecutionEvent sink for audit trails and UI timelines

**Depends on:** Intent Engine, Provider Framework, Chains Adapters (V2), Wallet Core (V2, on-device signing)

**Interfaces**
  - `ExecutionEngine.run / resume(Execution) with ExecutionEngineDeps`
  - `StepDriver { simulate, execute, confirm, verify } -> SimulationResult/ConfirmationResult/VerifyResult/RecoveryHint`
  - `Execution / StepState / FundsLocation state model`
  - `ExecutionStore (InMemory + durable impls) + EventSink stream`

**Quality bar:** Never-strand, exactly-once execution semantics on par with Temporal/Stripe workflow durability — beating MetaMask's stuck-nonce and stranded-approval failure mode. Any interrupted run resumes to a correct terminal state with zero double-broadcast, proven by fault injection that kills the process between every stage.

**Definition of done**
  - [ ] No step ever broadcasts without a passing simulation
  - [ ] Kill-anywhere fault injection resumes to a correct terminal state and never double-spends
  - [ ] Unrecoverable steps park with funds fully accounted, never stranded
  - [ ] The engine holds no key material; signing is delegated to the device via the driver
  - [ ] FundsLocation is provable at every step for audit and UI
  - [ ] Idempotency keys make retries safe under at-least-once delivery

**Doctrine hooks**
  - Rule 1: keys never enter the engine; signing is delegated to the device driver
  - Rule 4: step amounts are bigint base units and balance/reserve math fails closed
  - Rule 3: parked and failed states are honest, never reported as confirmed


#### P3.04 · Settlement Engine
> The Stripe of Web3: the mandatory front door that re-proves an approved plan against live state before a single wei moves.

The universal settlement orchestrator that drives an approved ExecutionPlan through a deterministic, idempotent, resumable pipeline (preflight, liquidity, quote_lock, gas, prepare, execute, cross_chain, reconcile, portfolio, notify) to its financial outcome or a safe, explained stop. It makes pre-flight re-validation non-skippable, so an approved-but-stale plan can never reach broadcast; it owns no funds and holds no keys.

**Owns**
  - The SETTLEMENT_STAGES pipeline + coordinator: ordered, resumable, each stage idempotent
  - Non-skippable preflight: re-validate balance, quote TTL, risk, gas, and policy against CURRENT state before execute
  - Quote-lock, gas validation, and a native max-send reserve gate within the execution window
  - Cross-chain settlement tracking of bridge legs to destination, with reconcile against actual on-chain effects
  - The double-entry LedgerEntry + replay for exactly-once accounting, plus RecoveryClass/RecoveryDecision on failure
  - Portfolio projection update and user notification as terminal stages

**Depends on:** Execution Engine, Route Optimizer, Provider Framework, Financial Brain, Gas Abstraction (V2), Risk Engine (V2), Policy Engine (V2)

**Interfaces**
  - `SettlementEngine.settle(plan) / SettlementCoordinator driving SETTLEMENT_STAGES`
  - `PreflightValidator / StageCapability / PortfolioUpdater / SettlementNotifier ports`
  - `Settlement / StageRecord / LedgerEntry / RecoveryDecision model`
  - `ledgerEntry + replay (deterministic reconstruction) + settlementIdFor idempotency key`

**Quality bar:** Stripe-grade settlement semantics — idempotent, exactly-once, and reconstructable from the ledger — beating every wallet that broadcasts an approved-but-stale quote. A settlement id makes double-settlement impossible and preflight makes a stale-plan broadcast impossible, both proven by resume-from-every-stage tests.

**Definition of done**
  - [ ] Preflight cannot be skipped; a plan failing current-state re-validation never reaches execute
  - [ ] The same settlement id is idempotent: re-driving never double-settles
  - [ ] Resume from any stage reaches a correct terminal outcome
  - [ ] The ledger replays to the exact financial position with double-entry balanced
  - [ ] Cross-chain legs are tracked to destination or safely reported as pending, never assumed
  - [ ] Every terminal outcome is honestly labelled (settled / partial / refused / pending)

**Doctrine hooks**
  - Rule 2: preflight is the deterministic gate that can only REFUSE a stale or over-risk plan; the device signature at execute disposes
  - Rule 4: base-unit bigint flows through the ledger; gas and reserve math fail closed
  - Rule 3: pending, partial, and refused are first-class honest states — nothing is shown settled that did not settle on-chain


#### P3.05 · Route Optimizer
> Best execution as a service: generate, simulate, score, and rank every route — then prove why the winner won.

Standalone routing intelligence that discovers candidate routes across DEX/bridge aggregators, gates them through simulation, scores them with a tunable multi-factor model (output, cost, slippage, time, reliability, risk, freshness), optionally ML-re-ranks within bounds, and returns the best route plus alternatives and a confidence — with a transparent ScoreBreakdown. It proposes the optimal strategy; the Execution Engine runs it. It is designed to also power third-party wallets via a public API.

**Owns**
  - Candidate generation + a non-negotiable simulation gate (simulateCandidates) so unsimulated routes never rank
  - The weighted scoring model + WEIGHT_PRESETS (balanced/cheapest/fastest/safest) mapped from the user's RoutePreference
  - ScoreBreakdown transparency: every factor's normalized contribution is inspectable
  - Bounded ML re-ranking (boundedPredictor) that can nudge but never override the deterministic safety envelope
  - RouteResult assembly: winner + ranked alternatives + calibrated confidence, plus the 'why' for the copilot to narrate
  - A stable, vendor-agnostic public API surface so the optimizer is a product in its own right

**Depends on:** Provider Framework

**Interfaces**
  - `GlobalRouteOptimizer.optimize(RouteRequest, OptimizeOptions) -> RouteResult`
  - `scoreCandidates + normalizeWeights + WEIGHT_PRESETS`
  - `RoutePredictor (identityPredictor / boundedPredictor) re-rank seam`
  - `ScoredCandidate / ScoreBreakdown transparency contract`

**Quality bar:** Best-execution transparency beating 1inch/CowSwap/Rabby: not just the cheapest number but an auditable ScoreBreakdown and an honest confidence, with a simulate-gate that filters routes those aggregators would still quote. ML may re-rank within a bounded envelope but can never surface an unsimulated or higher-risk route as the winner.

**Definition of done**
  - [ ] No candidate ranks without passing simulation
  - [ ] Weight presets are normalized and map deterministically from the user's RoutePreference
  - [ ] Every RouteResult exposes a full ScoreBreakdown and a calibrated confidence
  - [ ] The ML re-ranker is bounded; the identity fallback proves parity when disabled
  - [ ] The public-API surface is stable and vendor-agnostic — no provider leaks into the contract
  - [ ] Alternatives are returned so the user or copilot can choose, not just a single opaque pick

**Doctrine hooks**
  - Rule 6: a deterministic scoring core with ML confined to the edge inside a bounded envelope it cannot escape
  - Rule 3: unsimulated or failed routes are excluded rather than optimistically ranked, and confidence is real
  - Rule 4: fee/output/slippage math runs on integer base units (feeMicros etc.), never a float compare


#### P3.06 · Provider Framework
> Every third-party vendor behind one health-scored, circuit-broken, auto-failover registry — so no outage is ever your outage.

The universal integration layer: pluggable swap/bridge/price/gas/simulation providers behind health-scored, circuit-broken registries with automatic failover and quote aggregation. Nothing downstream ever depends on a specific vendor; it backs the Route Optimizer and fills the Intent/Execution/Settlement engines' injected route/price/gas ports. No provider is ever hardcoded.

**Owns**
  - The Provider taxonomy (Swap/Bridge/Price/Gas/Simulation) + a stable ProviderRegistry that selects and fails over
  - HealthTracker: rolling health scoring, latency/error tracking, and a CircuitState (closed/open/half-open) per provider
  - Automatic failover + quote aggregation (bestSwapQuote) with validity checks (isValidSwapQuote)
  - Vendor isolation: a bad or malicious provider is circuit-broken and never allowed to poison a downstream decision
  - The RouteOptimizer route-composition helper for multi-leg quotes
  - A zero-touch onboarding path so adding a provider requires no consumer changes

**Depends on:** Chains Adapters (V2), Observability (V2)

**Interfaces**
  - `ProviderRegistry (register/select/failover) + ProviderRegistryOptions`
  - `Provider / SwapProvider / BridgeProvider / PriceProvider / GasProvider / SimulationProvider`
  - `HealthTracker + HealthSnapshot + CircuitState`
  - `bestSwapQuote + isValidSwapQuote quote-aggregation contract`

**Quality bar:** Netflix-Hystrix-grade resilience and AWS-multi-AZ failover applied to Web3 vendors — a single provider brownout degrades gracefully with zero user-visible failure, beating single-integration wallets that hard-fail when their one aggregator is down. Circuit breakers are proven by chaos tests injecting latency and errors per provider.

**Definition of done**
  - [ ] Any single provider failing triggers automatic failover with no user-visible error
  - [ ] Circuit breakers open, half-open, and close correctly under injected fault load
  - [ ] Quote aggregation rejects invalid or stale quotes before they reach the optimizer
  - [ ] No downstream package references a concrete vendor; all access is via the registry
  - [ ] Health scores drive selection and are observable for SRE
  - [ ] Adding a new provider requires zero changes to consumers

**Doctrine hooks**
  - Rule 3: a network or provider failure is surfaced as unavailable plus failover, never silently as $0 or a bad quote
  - Rule 6: a pure health-scoring and selection core with providers as injected adapters at the edge
  - Rule 4: quotes carry integer base-unit amounts and validation compares bigint, not float


#### P3.07 · Solver Network
> An open market of staked solvers competing to fill your intent — and a verifier that trusts none of them.

The decentralized solver network where independent, staked solvers compete to satisfy an execution request; the platform coordinates, independently verifies every proposal (structurally and by simulation, never trusting a solver's claims), reputation-weights, and selects the best valid one for settlement. It is standalone by design — a solver-network-as-a-service. Solvers propose; they never hold keys, never sign, and never bypass Policy or Security.

**Owns**
  - The solver marketplace/auction: collect competing SolverProposals for a SolveRequest
  - Independent verification (validateProposal): structural checks + simulation, re-proving a solver's claimed output/fee/eta rather than trusting it
  - Reputation-weighted scoring + winner selection (SOLVER_WEIGHTS, selectWinner) blending cost/time/slippage/confidence/reputation
  - The ReputationEngine + incentives: computeReward / computeSlash, staking, and a typed SlashReason for provably bad proposals
  - Signed proposals (signProposal) + a solver registry carrying stake and identity
  - A standalone, no-internal-deps posture so the network ships as its own product

**Depends on:** Provider Framework

**Interfaces**
  - `SolverNetwork.solve(SolveRequest) -> SolveOutcome (verified winner + evaluation)`
  - `validateProposal -> ValidationResult (structural + simulated)`
  - `scoreProposals + selectWinner + SOLVER_WEIGHTS`
  - `ReputationEngine.update(OutcomeUpdate) + computeReward / computeSlash`

**Quality bar:** CoW-Protocol-grade solver competition with a stricter trust model — every winning proposal is independently re-simulated before it can settle, and provably false claims are slashed. Beats naive solver/relayer designs that trust solver-reported outcomes; a lying solver can never win, it can only lose stake.

**Definition of done**
  - [ ] Every proposal is independently verified (structure + simulation) before scoring
  - [ ] A solver's self-reported figures are never used unverified in selection
  - [ ] The winner is reputation-weighted and reproducible from the scoring inputs
  - [ ] Provably bad proposals trigger deterministic slashing with a typed SlashReason
  - [ ] Solvers hold no keys and cannot bypass Policy/Risk; the selected route still passes the settlement front door
  - [ ] The network runs standalone with no internal package deps (SaaS-ready)

**Doctrine hooks**
  - Rule 2 + 6: solvers PROPOSE while deterministic independent verification disposes — the platform never trusts a claim
  - Rule 1: solvers never hold keys or sign; the device still signs the winning route via settlement
  - Rule 3: unverifiable or simulation-failing proposals are rejected, never optimistically settled


#### P3.08 · Automation Engine
> Natural-language rules that run themselves — through the exact same Risk+Policy gate a human tap would, never one notch more powerful.

The autonomous operating layer that compiles natural-language rules ('DCA $100 into ETH every Friday', 'stop-loss my SOL at -20%') into typed workflows (trigger, conditions, actions) and runs each firing through the SAME Policy+Risk gate a manual action uses, executing only via a pre-authorized, policy-bounded session key. It is a pure deterministic orchestrator: it holds no keys, authorizes nothing itself, and can never make an automated action more capable than a manual one.

**Owns**
  - Rule compilation: natural language into a typed Workflow (WorkflowCompiler, compileTemplate) behind a schema-forced LLM boundary
  - Trigger evaluation: schedules (isScheduleDue / nextFireTime), event triggers (isEventTriggerMet), and Condition evaluation
  - The Safety layer: per-run and per-day caps (checkSafety, runsTodayCount) that fail closed
  - The gate: every WorkflowRun passes through the PolicyAuthorizer before the Executor, at parity with a manual action
  - Session-key bounded execution: automation acts only within a pre-authorized, revocable, policy-capped session key
  - Run history + an upcoming-run projection (upcomingRuns) for transparency

**Depends on:** Intent Engine, Settlement Engine, AI Memory, Financial Brain, Policy Engine (V2), Risk Engine (V2)

**Interfaces**
  - `AutomationEngine.run(Workflow, RunOptions) via PolicyAuthorizer + Executor`
  - `WorkflowCompiler.compile(nl) -> CompiledWorkflow (schema-forced)`
  - `triggerMet / isScheduleDue / nextFireTime / evaluateCondition`
  - `checkSafety + Safety caps + upcomingRuns projection`

**Quality bar:** Zapier-grade authoring ease with Gelato/Chainlink-Automation reliability but strictly non-custodial — beats them by routing every firing through the identical Risk+Policy gate and a revocable session key, so an automated action is provably never more capable than a manual one. Safety caps fail closed under clock skew and duplicate-fire.

**Definition of done**
  - [ ] Every automated firing passes the same Policy+Risk gate as a manual action, proven by parity tests
  - [ ] Session keys are policy-bounded, capped, and revocable; automation cannot exceed them
  - [ ] Safety caps (per-run, per-day) fail closed on clock skew and duplicate triggers
  - [ ] Natural-language compilation is schema-validated; an un-typeable rule is refused, not approximated
  - [ ] Upcoming runs and run history are honestly projected for the user
  - [ ] No key material lives in the engine; it authorizes nothing itself

**Doctrine hooks**
  - Rule 2: automation still only PROPOSES to the gate; the pre-authorized device session key disposes within hard caps
  - Rule 6: a deterministic trigger/condition/safety core, with the LLM only compiling natural language behind a schema
  - Rule 1 + 4: no keys are held, and caps are bigint base-unit values that fail closed


#### P3.09 · AI Memory
> A wallet that remembers you — your goals, habits, and risk appetite — in a shape that structurally cannot hold a secret.

The durable, privacy-preserving user model that lets the copilot and automation personalize over time — preferences, learned habits, goals, and interaction context — stored in a CLOSED, enumerated shape that is structurally incapable of holding a key, mnemonic, or address. It makes the wallet feel like it knows you (ChatGPT-memory-grade) while remaining on-device-first, user-inspectable, exportable, and forgettable.

**Owns**
  - The closed UserPreferences model (enums, symbol-strings, ratios, booleans only) + sanitizePreferences as defense-in-depth against secret-shaped writes
  - Preference learning (PreferenceLearner) derived from observed, verified behavior — not model speculation
  - The redaction contract: nothing memory stores can ever be a private key, seed, or raw address (SYMBOL_RE-gated)
  - Durable, inspectable storage (PreferenceStore) with export and hard-delete (right-to-be-forgotten)
  - Scoped retrieval: only the memory relevant to a request is surfaced into a copilot prompt, redacted
  - Consent + retention hooks so memory obeys Compliance (DSAR/retention)

**Depends on:** Financial Brain, Compliance & Governance (V2)

**Interfaces**
  - `PreferenceStore (get/set) + InMemoryPreferenceStore + durable impls`
  - `UserPreferences (closed shape) + defaultPreferences + sanitizePreferences`
  - `PreferenceLearner.observe(event) -> updated preferences`
  - `SYMBOL_RE / redact scoping for prompt-safe retrieval`

**Quality bar:** ChatGPT-memory-grade personalization with a privacy model no consumer AI matches: memory is a closed enum shape that cannot, by construction, exfiltrate a secret, and is fully user-inspectable, exportable, and hard-deletable. Beats opaque server-side AI memory — nothing is remembered that the user cannot see and erase.

**Definition of done**
  - [ ] The preference shape is closed; sanitize drops any non-enumerated or secret-shaped input, property-tested
  - [ ] No key, mnemonic, or address can be stored or retrieved; an adversarial write corpus passes
  - [ ] Learning derives only from verified observed behavior, never from unverified model claims
  - [ ] Users can inspect, export, and hard-delete all memory (DSAR / right-to-be-forgotten)
  - [ ] Retrieval into prompts is scoped and redacted; full memory is never dumped into an LLM call
  - [ ] Retention obeys Compliance policy hooks

**Doctrine hooks**
  - Rule 1: memory is structurally secret-incapable — a closed enum shape, on-device-first
  - Rule 3: preferences reflect real observed behavior, never fabricated affinities
  - Rule 6: a deterministic sanitize/learn core, with any LLM read scoped and redacted at the edge


#### P3.10 · Financial Brain
> Deterministic analytics that turn raw balances into allocation, PnL, risk, health, and tax truth — then let AI explain, never invent.

The portfolio intelligence engine (the financial brain): deterministic analytics — allocation, concentration, PnL, performance, risk, health — plus insight/alert/scenario/tax engines and an AI narration boundary that can only explain verified numbers. It analyzes and recommends; it never signs and never executes. It is standalone enough to also be a Portfolio-Intelligence-as-a-service, reusing the base money math from @intent-wallet/portfolio.

**Owns**
  - Deterministic analytics: allocation slices, concentration, performance/PnL, RiskProfile, HealthFactor — all in integer micros
  - The insight + alert engines (Insight/Alert with MetricRef provenance) so every insight points at the metric that produced it
  - Scenario modeling (Scenario -> ScenarioResult) and tax lots (TaxReport, RealizedGain, method/term) for accurate, auditable tax truth
  - The Narrator boundary: AI narrates only verified numbers (NarrativeReport); no figure is generated by the model
  - Fail-soft honesty: distinguishes a null/unavailable read from a genuine zero on every metric (network failure is not $0)
  - The PortfolioSnapshot vocabulary shared across the copilot, automation triggers, and settlement's portfolio update

**Depends on:** Provider Framework, Portfolio (V2 aggregation), Chains Adapters (V2)

**Interfaces**
  - `IntelligenceEngine facade -> Allocation / Performance / RiskProfile / HealthFactor / Insight / Alert`
  - `Scenario -> ScenarioResult modeling + TaxReport / RealizedGain generation`
  - `Narrator (NarrativeReport) verified-only narration boundary`
  - `money helpers (usdToMicros / microsToUsd / assetValueMicros / MICRO) — integer micros only`

**Quality bar:** Zerion/Zapper/Rotki-grade analytics with tax-lot accuracy and a hallucination-proof narration layer — beats consumer trackers by making every insight cite its MetricRef and by never letting AI state a number it did not compute. Fail-soft honesty beats trackers that render a stale or failed read as $0.

**Definition of done**
  - [ ] All analytics compute in integer micros with no float in money math, property-tested
  - [ ] Every Insight and Alert cites the MetricRef it derives from
  - [ ] Tax lots produce auditable RealizedGain by method and term, reconstructable from disposals
  - [ ] The narrator can only reference verified numbers; uncited figures are rejected
  - [ ] A failed or partial price/balance read is surfaced as unavailable, never as $0
  - [ ] Scenario results are deterministic and reproducible from inputs

**Doctrine hooks**
  - Rule 3 + 4: network-failure-is-not-$0 fail-soft honesty, with all money in integer micros
  - Rule 2 + 6: a deterministic analytics core where the AI narrator only explains verified numbers and never invents
  - Rule 5: metrics feed Apple-grade, accessible portfolio surfaces with honest empty/loading/error states


### Phase 4 — Security


#### P4.01 · Security Engine
> One evaluate() call is the immune system: every intent passes through it before a signature exists, and it can only ever REFUSE.

The Security Engine is the composition root of the entire P4 subsystem — the single deterministic pre-sign chokepoint that fans an intent/plan out to Simulation, Risk, Scam, Fraud and Threat-Intel, then fuses their verdicts most-restrictive-wins into one SecurityVerdict handed to the Policy gate. World-class means no code path reaches a signer without passing through here, the composition is a pure function reproducible from its inputs, and the same engine ships as a security-as-a-service API the way Blockaid/Blowfish sell to other wallets — except we own the whole stack, on-device-first.

**Owns**
  - The pre-sign pipeline: canonical ordering (intel → simulation → risk → scam → fraud) and the deterministic most-restrictive-wins composition into one SecurityVerdict
  - The SecuritySubject taxonomy (token / address / approval / provider / signature-request / plan / session) shared by every sub-engine
  - The single public evaluate(subject|plan) → SecurityVerdict seam the Intent planner, Execution Engine and Router depend on (extends today's RiskProvider)
  - Fail-closed defaults: any sub-engine that errors, times out, or returns 'unknown' degrades the verdict toward block, never toward allow
  - Uniform hash-chained security-audit emission — one reason-coded record per evaluation, shared with Policy's audit log
  - The security-as-a-service boundary: standalone (no wallet/chain/key deps) so it runs as an API and fully offline in tests
  - Latency-budget + timeout/circuit-breaker orchestration across sub-engines (fast path vs. deep path)

**Depends on:** P4.02, P4.04, P4.05, P4.06, P4.07

**Interfaces**
  - `SecurityEngine.evaluate(subject: SecuritySubject): SecurityVerdict — pure over injected sub-engines + intel snapshot`
  - `SecurityEngine.evaluatePlan(plan: ExecutionPlan): PlanSecurityReport — per-step + aggregate verdict`
  - `SecurityVerdict { gate: 'allow'|'require_confirmation'|'block'; score; signals: RiskSignal[]; effects?: SimEffects; reasons: ReasonCode[]; snapshotVersion }`
  - `SecuritySubject discriminated union (extends V2 token/address/approval/provider with signature-request/plan/session)`
  - `POST /v1/security/evaluate — schema-forced, the SaaS surface`

**Quality bar:** Beat Blockaid/Blowfish as the embedded transaction-security backend Phantom and MetaMask license — but own the entire pipeline on-device-first and open its verdicts to audit. Zero known false-negatives on the drainer regression corpus; p95 fast-path verdict < 50 ms with no network.

**Definition of done**
  - [ ] Every signer entrypoint (web, mobile, API) is provably reachable only through evaluate — an arch/lint test fails the build if a sign path bypasses it
  - [ ] Composition is a pure function of (subject, sub-engine outputs, intel snapshot version): identical inputs → byte-identical verdict, proven by golden tests
  - [ ] Any sub-engine timeout/throw degrades the gate toward block and emits a DEGRADED reason; never silently allows
  - [ ] Exactly one hash-chained, reason-coded audit record per evaluation, exportable without PII
  - [ ] Runs standalone as POST /v1/security/evaluate with schema-forced I/O and 100% branch coverage on the composition core
  - [ ] Golden drainer/scam corpus regression suite is green in CI and gates merges

**Doctrine hooks**
  - Rule 2 (AI proposes / code verifies / device disposes): this IS the 'code verifies' gate — it can only refuse, holds no keys, never signs
  - Rule 6 (deterministic pure cores): composition is pure/total/exhaustively tested; the LLM stays outside behind the SecuritySubject schema
  - Rule 4 (fail closed): unknown/error/timeout tightens toward block, never loosens


#### P4.02 · Risk Engine
> The intrinsic-danger scorer: given a token, contract, approval or counterparty, how likely is it to harm you — combined as compounding probabilities, not a vibe.

Raise the existing packages/risk into a calibrated, benchmark-beating asset-risk oracle. It owns the on-chain-behavior heuristics that catch scams before an intel feed lists them — honeypots, unlimited approvals, address poisoning, fresh/illiquid tokens, concentrated ownership, admin/upgrade backdoors — and fuses them with the probabilistic-OR (1−Π(1−sᵢ)) so many small risks compound while staying bounded, with any hard signal forcing block. World-class means severities are empirically calibrated against labelled outcomes, every signal carries a plain-English reason a non-expert acts on, and the core stays pure so it doubles as a public risk API.

**Owns**
  - The heuristic detector suite (honeypot/fee-on-transfer, unlimited & Permit2 approval, address-poisoning lookalike, fresh/low-liquidity token, ownership concentration, admin key / upgradeable proxy, unverified contract) — each an independently-tested pure function
  - Composite scoring: probabilistic-OR combination, calibrated severities, hard-block floor (≥0.99) that overrides score
  - The RiskSignal / RiskReport / RiskLevel vocabulary and per-signal human-readable reason
  - Severity calibration: detector-output → probability mapping validated against a labelled post-mortem dataset, with drift monitoring
  - The SecuritySubject → signals contract consumed by the Security Engine and Policy composition
  - New V3 detectors: Solana LP-lock / mint-authority / freeze-authority, rug-pull liquidity-removal patterns, sanctioned-counterparty proximity (graph hops)

**Depends on:** P4.06, P4.07

**Interfaces**
  - `RiskEngine.scan(subject): RiskReport and evaluate(subject): SecurityDecision (existing, extended)`
  - `Detector = (subject) => RiskSignal | null — a pure, hot-swappable registry`
  - `combineSignals(signals): RiskReport — probabilistic-OR, exported and pinned by property tests`
  - `RiskSignal { code; category; severity ∈ [0,1]; reason }`
  - `SeverityModel injectable seam so recalibration ships without code change`

**Quality bar:** Beat Rabby's pre-transaction risk cards and GoPlus token-security on precision AND recall over a shared labelled corpus; false-block rate on blue-chip assets ≈ 0. Every signal is explainable in one sentence a first-time user acts on.

**Definition of done**
  - [ ] Each detector has exhaustive unit + boundary tests (2^255 approval, 2000bps tax, EIP-55) and property tests on the scorer's monotonicity/bounds
  - [ ] Severities calibrated against a labelled dataset; a precision/recall/ROC report card is checked into CI and gated
  - [ ] Hard-block signals (sanctioned, honeypot, known-scam) force block regardless of composite score — proven by tests
  - [ ] Every RiskSignal.reason is human-readable and reason-coded; no bare error strings
  - [ ] Core is pure (no clock/network/keys) and runnable as a standalone risk API
  - [ ] A drift monitor alerts when the live score distribution diverges from the calibration baseline

**Doctrine hooks**
  - Rule 6 (deterministic pure cores): detectors + scorer are total, side-effect-free, exhaustively tested
  - Rule 3 (never fake): missing metadata (undefined ageDays/liquidity) yields NO signal, not a fabricated safe/zero — honest unknowns
  - Rule 4 (fail closed): a hard signal always wins over a low composite score


#### P4.03 · Policy Engine
> Your money's programmable rulebook — spend caps, allowlists, velocity limits, time-locks and roles — that can only tighten what Risk already decided, never loosen it.

Elevate packages/policy into a consumer-simple yet Fireblocks-grade programmable authorization layer. It assembles context, resolves the principal's active policy set, runs a pure rule engine, and fuses the outcome with the Security/Risk verdict MOST-RESTRICTIVE-WINS into one ExecutionPermission whose mayProceedToSign is the only boolean Execution reads. World-class means the rule DSL is expressive (per-token/recipient/chain/time/velocity/counterparty caps, M-of-N approvals, cool-downs) yet safe by construction, every edit is dry-run-diffable before it ships, and every decision is hash-chain audited.

**Owns**
  - The policy rule model + DSL: spend caps in bigint base units, allow/deny lists, velocity/rate windows, time-locks, per-chain/per-token scoping, role-based approvals, the mainnet spend cap
  - The composition: composeWithRisk most-restrictive-wins over a combined-gate rank (allow<confirm<defer<escalate<block); Policy can only RAISE the gate
  - ExecutionPermission with the single mayProceedToSign boolean, bound to one exact planId/intentId (anti-replay)
  - Policy simulation: dry-run a candidate set against a battery of requests and diff vs. live, with zero writes (structurally incapable of persisting)
  - Policy registry + admin: content-hash-versioned sets, activation, RBAC over who may edit
  - Append-only hash-chained decision audit; metrics on rule fire-rates and block reasons

**Depends on:** P4.01, P4.02

**Interfaces**
  - `PolicyEngine.evaluate(request): Promise<ExecutionPermission>`
  - `PolicyEngine.simulate(req): Promise<SimulationResult> — dry-run diff, no writes`
  - `ExecutionPermission { gate: CombinedGate; mayProceedToSign: boolean; requirements: ConfirmationRequirement[]; planId; intentId; decisionHash }`
  - `composeWithRisk(decision, securityVerdict, binding): ExecutionPermission`
  - `PolicyRegistry CRUD + activation with content-hash versioning`

**Quality bar:** Match Fireblocks TAP / Gnosis Safe transaction-policy expressiveness with Apple Wallet simplicity — a non-technical user sets a $500/day cap and an allowlist in two taps, and no policy edit can ever silently weaken Risk. Beat them on auditability: every decision reproducible from its hash.

**Definition of done**
  - [ ] mayProceedToSign is true only when gate==='allow' AND no requirements AND the binding matches the exact plan/intent — proven by tests including replay attempts
  - [ ] Composition never lets Policy downgrade a Risk block/confirm — exhaustive gate-matrix test
  - [ ] simulate provably performs no store/audit writes (holds only read collaborators)
  - [ ] Every decision produces a hash-chained, reason-coded audit record; verifyChain detects any tamper/truncation
  - [ ] Bigint caps compared in base units only — no float path anywhere; guards fail closed on missing context
  - [ ] Preset sets (conservative/balanced/degen) shipped and covered

**Doctrine hooks**
  - Rule 2 (code verifies / device disposes): Policy authorizes and records, holds no keys; its permission binds to one plan so a signature can't be replayed
  - Rule 4 (integer bigint + fail closed): caps are bigint base units; missing context tightens
  - Rule 6 (deterministic + AI behind schema): the rule engine is pure; an LLM-suggested policy is only a proposal that must pass simulation before activation


#### P4.04 · Fraud Detection
> Stripe Radar for self-custody: it watches the account and session, not the token — catching the moment YOU have been compromised or coerced.

Fraud Detection is the behavioral, account-level immune response the asset-focused Risk Engine can't see: account-takeover, anomalous sessions (new device, impossible travel, velocity spikes), coerced/duress signing, and coordinated drainer-campaign signatures (approve-then-sweep, dust-then-poison). It emits risk signals and step-up-auth triggers, correlating across a principal's own history and (privately) against the drainer graph. World-class means detection is behavioral and adaptive yet privacy-preserving and on-device-first — never shipping the user's transaction graph to a server to score it.

**Owns**
  - Session/device anomaly signals: new-device/new-geo, impossible travel, unusual hour/velocity, unlock-failure spikes → step-up or block
  - Per-principal behavioral baselining (typical recipients, amounts, chains, cadence) and deviation scoring
  - Drainer-campaign pattern detection: approve→immediate-transfer, mass-approval bursts, sweep-to-fresh-address, dust-poison-then-send sequences
  - Coordinated-threat correlation: linking a subject to known drainer clusters via the Threat-Intel graph
  - Step-up policy triggers (RequireStepUp) handed to Passkey+MPC / Policy — a confirm where a confirm suffices, not a silent block
  - Privacy-preserving feature computation: features computed on-device; only minimized, hashed signals cross the boundary

**Depends on:** P4.02, P4.06, P4.07

**Interfaces**
  - `FraudEngine.assessSession(session): FraudSignals — device/geo/velocity`
  - `FraudEngine.assessSequence(principal, plannedActions): FraudSignals — approve-then-drain, sweep`
  - `FraudSignals → RiskSignal[] (feeds Security Engine) plus optional StepUpRequirement`
  - `BehavioralBaseline store interface — on-device, principal-scoped`
  - `Privacy contract: only hashed/minimized signals cross the device boundary`

**Quality bar:** Bring Stripe Radar-class behavioral risk scoring to self-custody without Stripe's data-hoarding: match the industry's drainer-sequence catch rate while computing features on-device. Beat MetaMask/Phantom, which have essentially no account-takeover defense today.

**Definition of done**
  - [ ] Approve-then-drain and sweep-to-fresh-address sequences are detected pre-sign over a labelled corpus
  - [ ] New-device/impossible-travel triggers step-up (not silent block) and is honored by Policy/Passkey
  - [ ] Behavioral features are computed on-device; a test asserts no raw graph/PII leaves the boundary (only hashed/minimized signals)
  - [ ] The false-positive step-up rate on a returning user's normal behavior is bounded and measured in CI
  - [ ] All signals are reason-coded and fed through the Security Engine composition
  - [ ] Fails closed: if baseline/session data is unavailable, unusual-value actions escalate to confirm, never auto-allow

**Doctrine hooks**
  - Rule 1 (non-custodial) + Privacy: behavioral scoring runs on-device; the user's transaction graph is never sent to a server
  - Rule 4 (fail closed): missing baseline → step-up/escalate, not allow
  - Rule 3 (never fake): a low-confidence anomaly is surfaced as 'unusual, confirm', never as a fabricated certainty


#### P4.05 · Scam Detection
> Reads the trap before you step in it: decodes the exact signature/approval/site you're about to trust and says, in plain words, what it will really do to your wallet.

Scam Detection targets the lure — the interaction the user is being deceived into, not the intrinsic asset. It deterministically decodes signature requests (permit / Permit2 / setApprovalForAll / blind eth_sign / Seaport blank orders / Solana delegate + setAuthority), malicious calldata, phishing/homoglyph domains and address-poisoning lookalikes at send-time, then renders a human-readable 'this grants X the right to move all your USDC' warning grounded in the Simulation Engine's effects. World-class means we catch signature-phishing — the #1 drainer vector naive wallets and block explorers miss — with deterministic decoders and near-zero false alarms on legitimate dApps.

**Owns**
  - Signature-request decoders: EIP-712 permit/Permit2, setApprovalForAll, blind eth_sign, Seaport/marketplace zero-price orders, Solana approve/setAuthority/delegate
  - Malicious-approval detection: unlimited/Permit2 grants to unverified spenders, hidden operator grants
  - Phishing surface: domain reputation, homoglyph/lookalike detection, dApp-origin verification against a verified registry
  - Address-poisoning defense at send-time: lookalike-of-known-contact detection, zero-value/dust-transfer provenance
  - Human-readable 'what this really does' rendering, grounded in Simulation effects, with a confidence and source
  - WalletConnect / dApp-connect request screening before a session is granted

**Depends on:** P4.06, P4.07

**Interfaces**
  - `ScamEngine.screenSignature(request): ScamReport — typed-data/permit/approval decode → verdict`
  - `ScamEngine.screenOrigin(url|dappId): ScamReport — phishing/homoglyph/verified-registry`
  - `ScamEngine.screenRecipient(to, knownContacts): ScamReport — poisoning lookalike`
  - `ScamReport { verdict; humanSummary; grantedRights[]; effects?; confidence; sources[] }`
  - `Per-standard decoder registry — pure, extensible per new phishing pattern`

**Quality bar:** Beat Wallet Guard / Pocket Universe / Scam Sniffer at signature-phishing interception and Rabby's pre-sign explainer on clarity — a first-time user understands the risk of a Permit2 grant in one sentence. Zero false-positives on the top-500 legitimate dApps.

**Definition of done**
  - [ ] permit/Permit2/setApprovalForAll/blind-eth_sign/Seaport-blank-order/Solana-setAuthority are each decoded to a human summary in tests
  - [ ] Address-poisoning lookalikes of a known contact are flagged before send; exact-match contacts are not
  - [ ] Homoglyph/lookalike phishing domains are caught; the verified-dApp allowlist suppresses false alarms on legit origins
  - [ ] Every warning states granted rights, confidence and source; an undecodable payload degrades to 'cannot verify — blind signature' (block/confirm), never a silent allow
  - [ ] Decoders are pure and exhaustively tested against real malicious-payload fixtures
  - [ ] A top-500 legitimate-dApp regression suite shows zero false blocks

**Doctrine hooks**
  - Rule 3 (never fake): an undecodable blind signature is labelled 'cannot verify', never rendered as safe
  - Rule 6 (deterministic cores): decoders are pure/total; no LLM sits in the signing-path decision
  - Rule 4 (fail closed): an unverifiable origin/signature → require_confirmation or block


#### P4.06 · Simulation Engine
> The ground truth every other engine reads: dry-run the exact transaction and return a deterministic, human-readable diff of every balance, approval and permission it will change — before a signature exists.

The Simulation Engine executes the exact calldata/PSBT against a traced, forked, or state-overridden view of chain state and returns a deterministic effects diff — net asset deltas per account (bigint), approvals granted/revoked, ownership/authority changes, NFT transfers, native + gas costs. It is the factual substrate Risk and Scam turn into warnings, and the honesty backbone: if an outcome cannot be simulated it says so rather than guessing. World-class means multi-chain (EVM trace/eth_call + state override, Solana simulateTransaction, Bitcoin PSBT decode), deterministic, and fast enough to gate every transaction pre-sign.

**Owns**
  - EVM simulation: eth_call / debug trace with state overrides, access lists, revert-reason capture, per-account balance & storage diff
  - Solana simulation: simulateTransaction with pre/post token-balance diff, compute-unit + fee estimate, program-log capture
  - Bitcoin: PSBT decode → input/output attribution, fee, change-address verification
  - The normalized SimEffects model: per-account asset deltas (bigint base units), approvals delta, ownership/authority delta, NFT transfers, gas/fee
  - Failure honesty: distinct simulation_unavailable / would_revert(reason) / partial states — never a fabricated 'success'
  - Determinism + caching: pin the block/state snapshot so a given (tx, snapshot) reproduces byte-identical effects

**Depends on:** —

**Interfaces**
  - `SimulationEngine.simulate(chain, rawTxOrPlanStep): Promise<SimResult>`
  - `SimResult = { status: 'ok'|'would_revert'|'unavailable'|'partial'; effects?: SimEffects; revertReason?; snapshot }`
  - `SimEffects { perAccount: { asset; deltaBaseUnits: bigint }[]; approvals: ApprovalDelta[]; authorityChanges[]; nft[]; feeBaseUnits: bigint }`
  - `Multi-chain provider seam behind one interface (EVM / SOL / BTC), over existing packages/chains adapters`
  - `explain(effects): HumanEffects for Scam/UI rendering`

**Quality bar:** Match Tenderly/Blowfish EVM simulation fidelity and extend it to Solana and Bitcoin under one deterministic model — the multi-chain pre-sign simulation Rabby only does for EVM. p95 < 400 ms so it can gate every transaction, not just risky ones.

**Definition of done**
  - [ ] EVM/Solana/BTC each produce a normalized SimEffects with bigint deltas verified against known fixtures
  - [ ] A would-revert transaction returns would_revert with the decoded reason, never a fabricated success
  - [ ] When RPC/trace is unavailable, status is unavailable (fail closed downstream), never guessed effects
  - [ ] Effects are deterministic for a pinned snapshot: identical (tx, snapshot) → byte-identical result (golden tests)
  - [ ] All amounts are bigint base units end-to-end; zero float in the effects path
  - [ ] p95 latency budget met with caching; measured in a CI perf test

**Doctrine hooks**
  - Rule 3 (never fake): unavailable ≠ success; unavailable/partial/would_revert are first-class honest states
  - Rule 4 (integer bigint): every delta is bigint base units, never a float
  - Rule 6 (deterministic cores): pinned-snapshot simulation is reproducible and exhaustively fixture-tested


#### P4.07 · Threat Intelligence
> The wallet's continuously-updated memory of everything known-bad — sanctions, drainers, scam tokens, phishing domains — distributed as signed snapshots so a poisoned feed can never unblock a scam.

Threat Intelligence is the knowledge layer the Security Engine consults FIRST: sanctioned addresses (OFAC), scam-token and malicious-contract registries, live drainer/compromised-address clusters, phishing/homoglyph domains, and the allowlist of verified contracts. It aggregates multiple sources with confidence + dedup, distributes them as cryptographically SIGNED snapshots that are integrity-verified before load, and serves both an on-device bloom-filter fast path and an authenticated remote lookup. World-class means feeds are fresh (minutes, not days), provenance-tracked, and tamper-evident end-to-end — the integrity of the whole immune system rests here.

**Owns**
  - The ThreatIntel interface (isSanctioned / isBlacklisted / isKnownScamToken / isMaliciousContract / isPhishingDomain) plus drainer-cluster graph queries
  - Multi-source ingestion + reconciliation (OFAC, Chainalysis-style, ScamSniffer/ChainPatrol/eth-phishing-detect, community allow/deny) with per-entry confidence + provenance
  - SIGNED snapshot distribution: sign at build, verify signature + freshness + monotonic version before load; reject unsigned/stale/rolled-back snapshots
  - On-device bloom filter (privacy-preserving, offline) + authenticated remote exact-lookup for hits
  - Verified-contract & known-good allowlist to suppress false positives across Risk/Scam
  - Freshness SLA, staleness alarms, and snapshot-version pinning exposed to the Security Engine verdict

**Depends on:** —

**Interfaces**
  - `ThreatIntel (existing interface, extended with drainerCluster(address) and verifiedContract(chain,address))`
  - `SnapshotLoader.load(signedSnapshot): void — verifies signature + freshness + monotonic version, else refuses`
  - `IntelSnapshot { version; issuedAt; sources[]; signature }`
  - `On-device BloomIndex.mightContain(key) + remote lookup(key): { hit; confidence; source }`
  - `Freshness/health probe surfaced to the Security Dashboard`

**Quality bar:** Match Blockaid/Chainalysis feed breadth and MetaMask's eth-phishing-detect community coverage with Apple-grade supply-chain integrity: every snapshot signed, freshness-gated, rollback-protected. Feed lag measured in minutes; zero unsigned snapshot ever loaded.

**Definition of done**
  - [ ] A snapshot with a bad/absent signature, stale timestamp, or lower-than-current version is REFUSED (tests prove it)
  - [ ] Multi-source entries carry confidence + provenance; conflicting sources reconcile deterministically
  - [ ] The on-device bloom path answers offline with no address sent to a server; only confirmed-hit exact-lookups go remote
  - [ ] The verified-contract allowlist demonstrably suppresses known false-positives in Risk/Scam
  - [ ] A freshness SLA + staleness alarm is wired to the Security Dashboard and Reliability alerts
  - [ ] The interface is standalone/injectable; the in-memory and signed-snapshot impls share one contract and test suite

**Doctrine hooks**
  - Rule 2 + supply-chain integrity: signed, freshness-gated, rollback-protected snapshots so a poisoned feed can't unblock a scam or block a safe asset
  - Rule 1 (non-custodial / privacy): the on-device bloom filter answers without revealing which address the user is checking
  - Rule 3 (never fake): a stale feed is reported stale (and degrades verdicts), never presented as current truth


#### P4.08 · Passkey + MPC
> Kills the single seed you can lose or leak: unlock with a passkey/biometric, and split signing across a 2-of-3 threshold so no server, and no single device, ever holds a spendable key.

Passkey + MPC is the roadmap key-management upgrade over today's scrypt+AES-256-GCM vault (packages/core). It gates vault unlock behind WebAuthn passkeys + platform biometrics with secure-enclave/StrongBox key wrapping, and introduces threshold-signature MPC (2-of-3 TSS: device + cloud-cosigner + recovery share) so there is no complete private key to phish, and no seed phrase required to onboard. World-class means the non-custodial doctrine is preserved to the letter — shares NEVER reconstitute a full key on any server — while removing the seed phrase as the single point of catastrophic loss.

**Owns**
  - WebAuthn/passkey registration + assertion as the vault-unlock and step-up factor; platform biometric binding
  - Hardware-backed key wrapping (Secure Enclave / StrongBox / TPM) for the local share and vault key
  - 2-of-3 threshold-signature (TSS) key generation + distributed signing (device + cloud-cosigner + recovery share) with no full-key reconstruction, ever
  - Key rotation + proactive re-sharing (refresh shares without changing the on-chain address)
  - Seedless onboarding path + backward-compatible, opt-in migration from the existing mnemonic vault (both supported)
  - The signing-authority boundary: MPC produces a signature only after the Security Engine gate + a valid device assertion — AI never triggers it

**Depends on:** —

**Interfaces**
  - `PasskeyVault.unlock(assertion): UnlockedSession — augments/replaces the password unlock`
  - `MpcSigner.sign(txDigest, sessionAuth): Signature — threshold, distributed, no full key materialized`
  - `KeyShares.rotate() / reshare(threshold) — address-stable`
  - `enroll(passkey) / migrateFromMnemonic(vault) — opt-in, both modes coexist`
  - `Attestation: hardware-backing + share-location provable to Recovery Center and Dashboard`

**Quality bar:** Match Coinbase Smart Wallet / Turnkey / Privy passkey UX and Web3Auth-style MPC — but stay self-custody-pure: unlike custodial-leaning vendors, no server share is ever spendable alone and no full key is ever assembled. Beat the seed-phrase status quo on both loss-resistance and phishing-resistance.

**Definition of done**
  - [ ] A signature is producible only from ≥2 shares AND a valid device assertion; a compromised single cloud share cannot sign — proven by tests
  - [ ] No code path ever reconstructs a full private key server-side; an arch test forbids it
  - [ ] Passkey unlock is hardware-backed (enclave/StrongBox) with biometric and never falls back to a plaintext key
  - [ ] Key rotation / re-sharing changes shares without changing the on-chain address
  - [ ] Existing mnemonic vaults migrate opt-in; both modes are supported and covered; the scrypt+AES path stays intact until migrated
  - [ ] MPC signing is invoked only after the Security Engine gate + device assertion — never by AI/automation alone

**Doctrine hooks**
  - Rule 1 (non-custodial): keys generated/used on-device; MPC shares never reconstitute a full key on a server — the doctrine's hardest test
  - Rule 2 (device signature disposes): the device assertion + threshold is the sole disposer; AI has no path to trigger a signature
  - Rule 6: the TSS/crypto core is deterministic and exhaustively tested (known-answer vectors), crypto at the edges behind typed boundaries


#### P4.09 · Recovery Center
> Losing the phone can't mean losing the money, and getting phished must be reversible-forward: guardians, passkey-device recovery, and a one-tap panic 'revoke everything' — all without a custodian.

The Recovery Center makes self-custody survivable. It owns encrypted-backup verification, non-custodial social/guardian recovery (M-of-N), passkey-device re-provisioning, MPC share re-issuance after device loss, and the incident-response surface: one-tap 'revoke all approvals', session kill / sign-out-everywhere, key rotation after suspected compromise, and optional inheritance/dead-man's-switch. World-class means recovery is as reassuring as Apple's account recovery yet fully non-custodial — guardians and cloud shares can restore access but can never, alone, spend.

**Owns**
  - Encrypted seed/share backup + verification (prove-you-have-it before relying on it) and re-auth-gated, screen-cleared reveal
  - Social/guardian recovery: M-of-N guardian enrollment, recovery ceremony, guardian rotation — guardians restore, never spend
  - Device recovery: passkey re-enrollment + MPC share re-provisioning after loss (address-stable, via Passkey+MPC)
  - Panic mode: one-tap 'revoke all approvals' (batched, cross-chain), session kill / sign-out-everywhere, freeze
  - Post-compromise key rotation and an approval-hygiene playbook, tied to Fraud/Scam signals
  - Inheritance / dead-man's-switch (opt-in, time-locked, revocable, non-custodial)

**Depends on:** P4.03, P4.05, P4.08

**Interfaces**
  - `Recovery.enrollGuardians(m, guardians) / startRecovery() / completeRecovery(shares)`
  - `Recovery.recoverDevice(passkey) → re-provision MPC share (address-stable)`
  - `Recovery.revokeAllApprovals(chains) (batched panic) + killAllSessions() (sign-out-everywhere)`
  - `Recovery.verifyBackup(proof) (re-auth-gated) and rotateKeys()`
  - `configureDeadManSwitch(delay, beneficiary) — time-locked, revocable`

**Quality bar:** Match Argent's guardian recovery and Apple's Recovery Contacts / Safety Check for reassurance, and Revoke.cash for approval hygiene — but non-custodial throughout: a guardian or cloud share can restore access and never spend. Panic revoke completes cross-chain in one flow.

**Definition of done**
  - [ ] M-of-N guardian recovery restores access; fewer than M cannot; guardians can never sign a spend — proven by tests
  - [ ] Device loss is recoverable via passkey + MPC re-provisioning with the SAME address (no fund migration)
  - [ ] Backup verification proves possession before the user relies on it; reveal is re-auth-gated and screen-cleared (as web already does)
  - [ ] One-tap 'revoke all approvals' batches across chains and confirms on-chain success honestly — never fake-confirmed
  - [ ] Sign-out-everywhere / session-kill integrates with the existing JWT revocation and is effective immediately
  - [ ] The dead-man's-switch is time-locked, revocable and non-custodial; covered by tests

**Doctrine hooks**
  - Rule 1 (non-custodial): recovery agents (guardians, cloud share) restore access but hold no spend authority — recovery ≠ custody
  - Rule 3 (never fake): a 'revoked'/'recovered' state is shown only after on-chain/asserted confirmation, never optimistically
  - Rule 2: post-recovery signing still routes through the Security gate + device assertion


#### P4.10 · Security Dashboard
> One honest pane of glass for your wallet's safety: security posture, every live approval with one-tap revoke, connected dApps and devices, why the last risky thing was blocked, and whether recovery is actually set up.

The Security Dashboard is the consumer-facing surface of the entire P4 subsystem — where a user understands and controls their safety without reading a block explorer. It renders a real security posture score, the live approval inventory with one-tap revoke, connected dApps/sessions/devices, a reason-coded history of security decisions ('blocked: honeypot / unlimited approval to unverified spender'), threat-intel freshness, policy status, and recovery readiness. World-class means Apple Safety Check clarity with Rabby/Revoke.cash depth, honest empty/loading/error states throughout, and WCAG AA — never a fake 'you're secure' when a check actually failed to run.

**Owns**
  - Security posture score + a prioritized, actionable to-do list (weak backup, stale intel, risky live approvals, no guardians)
  - Live approval inventory across chains with per-approval risk + one-tap revoke (delegating to Recovery Center)
  - Connected dApps / sessions / devices list with per-item revoke; tied to Fraud session signals
  - Security decision history: reason-coded, human-readable 'why blocked/confirmed', linking to the Simulation effects
  - Threat-intel freshness + policy status + recovery-readiness indicators (honest, real state — not decorative)
  - The accessibility + honest-states contract: distinguish 'checked, safe' from 'couldn't check' everywhere

**Depends on:** P4.01, P4.03, P4.05, P4.07, P4.08, P4.09

**Interfaces**
  - `Web/mobile Security section reading GET /v1/security/overview (posture, approvals, sessions, history, freshness, recovery status)`
  - `One-tap actions: revokeApproval(id) / disconnectDapp(id) / killSession(id) → Recovery Center`
  - `SecurityPosture { score; issues: ActionableIssue[]; recoveryReady; intelFresh }`
  - `Decision-history feed — reason-coded, from the shared hash-chained audit log`
  - `Honest-state components (safe / checking / couldn't-check / at-risk) reused from the design system`

**Quality bar:** Beat Rabby's approval manager + Revoke.cash depth and match Apple's Safety Check / Privacy Dashboard clarity with Linear-grade polish — a non-expert finds and fixes their riskiest approval in under 30 seconds. Every tile passes WCAG AA and shows honest states in light and dark.

**Definition of done**
  - [ ] Live approvals across EVM/SOL are listed with real on-chain data and revoked one-tap with honest on-chain confirmation (never optimistic)
  - [ ] Connected dApps/sessions/devices are listed and individually revocable; revoke is immediately effective
  - [ ] Decision history is reason-coded and human-readable, linking each block/confirm to its Simulation effects
  - [ ] A check that failed to run shows 'couldn't check', never a green 'secure' — enforced by a states test
  - [ ] Posture score + to-do list are computed from real engine state (backup, intel freshness, approvals, guardians), not hardcoded
  - [ ] Full keyboard nav + AA contrast in light and dark, verified by an a11y pass

**Doctrine hooks**
  - Rule 3 (never fake): 'couldn't check' ≠ 'secure'; a network failure is not a green checkmark; revoked is shown only after on-chain confirmation
  - Rule 5 (Apple-grade + WCAG AA + motion): a product-quality, accessible, reduced-motion-aware surface, not an admin table
  - Rule 1: it surfaces control (revoke, disconnect, recover) the user alone exercises — no custodial backchannel


### Phase 5 — AI


#### P5.01 · AI Operating System
> The kernel between natural language and money — every AI capability runs as a sandboxed process on it, and none of them can sign.

World-class is the packages/copilot orchestrator generalized into a real OS: a deterministic scheduler that assembles redacted context, routes each task to the cheapest capable model, runs the schema-forced tool loop, grounds every figure in the FactLedger, forces Risk+Policy on any plan candidate through the PolicyGate (never the LLM), floors confidence, verifies, and degrades to structured forms when the model is down. It is the ONE place model choice, budget, prompt-caching, and injection defense live, so no downstream agent re-implements — or weakens — them. Beat the OpenAI Assistants runtime and LangGraph on determinism, auditability, and a provable no-execute guarantee.

**Owns**
  - Model router + provider-abstracted client (claude-sonnet-5 default, claude-haiku-4-5 cheap-path) with timeout/retry/circuit-breaker and graceful fallback-to-forms when the LLM is unavailable
  - The kernel loop: context assembly (analyze-once) -> ledger seed -> schema-forced tool loop -> synthesis -> forced Risk+Policy gate -> deterministic recommendations -> confidence -> verify
  - No-execute-by-construction: the assertNoExecuteTools build gate, the banned-name regex, and ProposedPlan.signed:false types so a signed/executed plan is not representable
  - Prompt caching, per-user daily LLM budget accounting, cost telemetry, and a deterministic fast-path for high-frequency intent patterns
  - The prompt-injection boundary: the user utterance is ALWAYS a user message, never concatenated into the system prompt; tool args validated before dispatch
  - The capability/process model shared by every agent: registration, read/analyze/propose scoping, and per-process budget + deadline limits
  - A structured decision log emitting every model call, tool call, gate verdict, and confidence as an audited event with trace context

**Depends on:** Financial Copilot (packages/copilot boundary + gate + ledger), Policy Engine (packages/policy), Risk Engine (packages/risk), Capabilities (packages/capabilities), Observability (packages/observability)

**Interfaces**
  - `AiKernel.run(request): Promise<AiResponse> — the single entrypoint, deterministic given fixed model outputs`
  - `ModelRouter.select(task): ModelChoice — task -> model + budget policy (sonnet-5/haiku-4-5)`
  - `CopilotLlmClient.next(messages, tools) — the provider-abstracted boundary implemented by both a real Claude client and ScriptedLlmClient`
  - `ToolRegistry with ToolScope = 'read'|'analyze'|'propose' plus assertNoExecuteTools()`
  - `FactLedger — the turn's ground truth; responses may cite only facts that resolve against it`
  - `BudgetLedger.charge(userId, tokens) — per-user daily budget accounting that trips the fallback path`

**Quality bar:** p95 turn latency under budget, zero user-visible failure on LLM outage (deterministic fallback-to-forms), and 100% of stated figures ledger-grounded — 0 fabricated numbers across the >=200-utterance red-team corpus. Beat OpenAI Assistants + LangGraph on determinism and the provable no-execute guarantee; match the Vercel AI SDK on ergonomics.

**Definition of done**
  - [ ] Build fails if any registered tool name matches the execute/sign/broadcast/transfer banned regex; a test proves the gate fires
  - [ ] An LLM-down chaos test degrades every AI surface to structured forms with no crash and an honest 'AI unavailable' state
  - [ ] The red-team injection corpus yields 0 executed actions and 0 ungrounded figures
  - [ ] Per-user daily budget is enforced; over-budget requests fall back deterministically and are logged
  - [ ] Every model/tool/gate event is emitted to the audit log with trace context
  - [ ] Confidence is floored at 0.55; every sub-floor response carries an uncertaintyNote (property test)

**Doctrine hooks**
  - #2 bites hardest: the kernel is where 'AI proposes, code disposes' is STRUCTURALLY enforced — no execute tool exists, plans are unsigned by type, and the gate can only refuse
  - #6: the LLM is confined to the edge behind the schema-forced boundary while the loop and every decision are deterministic and audited
  - #3: the FactLedger makes fabricated numbers unrepresentable, and fallback-to-forms preserves honesty during an outage instead of guessing


#### P5.02 · Multi-Agent Framework
> A supervised swarm of single-purpose agents — each sandboxed, budgeted, and incapable of signing — coordinated by deterministic code, not vibes.

World-class is a supervisor/worker topology where each specialist (Research, Tax, Market-Intel, Personal-Finance) runs as an isolated capability on the AI OS with its own tool scope, token budget, and deadline; the supervisor decomposes a request into an agent DAG, fans out, and merges results through a deterministic reducer over a shared FactLedger. Hand-offs are typed messages, not free-form prompt-stuffing, and a stuck or over-budget agent is killed with its partial result surfaced honestly. Beat LangGraph, CrewAI, and AutoGPT on isolation, reproducibility, and the guarantee that no agent — however 'autonomous' — can move funds.

**Owns**
  - The supervisor/planner: decompose a request -> agent DAG -> fan-out/fan-in with per-node deadlines and budgets
  - Agent isolation: each agent gets a scoped tool subset, a FactLedger view, and a budget, with no shared mutable execution authority
  - A deterministic result reducer + conflict resolution (policy-driven, never an LLM vote); disagreements are disclosed, never silently averaged
  - A typed inter-agent messaging contract plus loop/recursion guards and max-depth/max-fanout caps that fail closed
  - Cancellation + partial-result honesty: a killed agent yields an explicit 'incomplete' state, never fabricated fill-in
  - A per-agent audit trace: which agent proposed what, on which facts, at what confidence

**Depends on:** P5.01 AI Operating System, Financial Copilot (packages/copilot), Policy Engine (packages/policy), Observability (packages/observability)

**Interfaces**
  - `AgentSpec { name, scopedTools, budget, deadline } — the process contract for a specialist agent`
  - `Supervisor.orchestrate(request): AgentRunResult — DAG execution with fan-out/fan-in`
  - `AgentMessage — the typed hand-off contract between agents (no raw prompt passing)`
  - `ResultReducer.merge(results): MergedResult — deterministic fold with disclosed conflicts`
  - `AgentBudget / AgentDeadline — per-node resource limits enforced by the supervisor`

**Quality bar:** Reproducible multi-agent runs (identical inputs + model outputs => identical plan + merge), test-proven inability for any agent to exceed its scope, and graceful honest partial results under kill. Beat LangGraph on determinism and isolation; beat AutoGPT/CrewAI on the safety envelope.

**Definition of done**
  - [ ] The supervisor executes an agent DAG with per-node deadlines and budgets
  - [ ] An over-budget or timed-out agent is killed and its partial result surfaced honestly
  - [ ] A scope-escape attempt by any agent fails the build/test (no agent can call a tool outside its grant)
  - [ ] Conflicting agent outputs are resolved by a deterministic reducer and disclosed to the user
  - [ ] A full per-agent audit trace is emitted for every run
  - [ ] Recursion and fan-out caps are enforced with tests and fail closed

**Doctrine hooks**
  - #2: no agent holds execute authority — the supervisor merges proposals only, and the device signature still disposes
  - #6: the reducer and hand-offs are deterministic and audited while each LLM stays confined to its agent's edge
  - #3: agent failure produces an honest 'incomplete' state rather than a fabricated completion


#### P5.03 · Tool Calling
> The only bridge from a model to the engines — every call schema-validated, scope-checked, fact-recorded, and provably unable to sign.

World-class is a typed tool registry (extending packages/copilot/tools.ts) where every tool declares a Zod arg schema, a read/analyze/propose scope, and a handler bound to a real engine capability; the dispatcher validates args, rejects-and-retries once then clarifies with the user, calls the capability, and records every figure it returns into the FactLedger. It is Anthropic-MCP-compatible so external tools plug in, but the banned-name guard and scope model mean no tool — first-party or third-party — can execute, sign, or broadcast. Beat MCP and OpenAI function-calling on determinism, the fact-recording contract, and the build-time no-execute proof.

**Owns**
  - The typed tool registry: name, scope, description, Zod validate(args), and a handler bound to an engine capability
  - The dispatcher: validate -> reject-and-retry-once -> clarify-with-user; call capability; record produced figures as CitedFacts
  - The scope model (read/analyze/propose) plus the assertNoExecuteTools banned-name guard enforced at build time
  - MCP-compatible tool-schema export/import so third-party tools register under the same guarantees
  - Argument sanitization + injection defense at the tool boundary — no key or full-address leakage into args or outputs
  - Per-tool telemetry: latency, error rate, retry rate, and cost

**Depends on:** P5.01 AI Operating System, Capabilities (packages/capabilities), Intelligence / Risk / Router / Portfolio engines (bound handlers)

**Interfaces**
  - `ToolSpec { name, scope, description, validate(args), handler(args, deps) } — the tool contract`
  - `ToolDispatcher.dispatch(call): ToolOutput — validate, retry-once, clarify, record facts`
  - `ToolScope = 'read' | 'analyze' | 'propose' — the only scopes; there is no 'execute'`
  - `FactLedger.add(facts) — the dispatcher records every produced figure for downstream verification`
  - `MCP schema adapter — export/import tools against a reference MCP client`

**Quality bar:** 100% of tool args schema-validated, a measured one-retry-then-clarify path, zero execute-scoped tools (build-enforced), and a clean MCP round-trip. Beat MCP + OpenAI tools on the hard guarantees (no-execute, fact-recording, scope) rather than raw surface area.

**Definition of done**
  - [ ] Every tool has a Zod arg schema and a declared scope
  - [ ] Invalid args trigger exactly one retry then a user-clarify path (tested)
  - [ ] The banned-name build gate is proven to fail on an execute/sign-shaped tool name
  - [ ] Each propose-scoped tool returns at most an UNSIGNED PlanProposal
  - [ ] All produced figures are recorded to the FactLedger and verify.ts rejects uncited numerics
  - [ ] An MCP export validates against a reference client round-trip

**Doctrine hooks**
  - #2: there is no execute scope and propose returns unsigned proposals only — the tool layer cannot move funds
  - #3: the fact-recording contract means every figure a tool emits is grounded, so prose cannot fabricate numbers
  - #6: the schema-forced boundary validates and logs every call, keeping the LLM at the edge
  - #1: argument sanitization prevents keys or full addresses from leaking through tool args or outputs


#### P5.04 · Memory Engine
> Memory that makes the wallet feel like it knows you — closed-shape by construction so it can never remember a secret, and fully yours to read, edit, and forget.

World-class is layered memory — the enumerated UserPreferences plus an episodic history of intents, approvals, rejections, and corrections, plus derived semantic facts — that personalizes every agent, is stored encrypted on-device, is surfaced to the user as a legible editable list, and is deletable on demand. The preference shape is a closed enum/symbol schema and sanitizePreferences drops anything off-schema, so a private key, mnemonic, or full address is structurally unrepresentable. Beat ChatGPT memory and Notion AI on transparency and user control, and honor GDPR/DPDP deletion end-to-end.

**Owns**
  - The closed, enumerated UserPreferences shape plus sanitizePreferences — structurally unable to hold a key, mnemonic, or full address
  - Episodic memory: past intents, plan approvals/rejections, and corrections that feed personalization and confidence
  - Semantic/derived memory (risk-tolerance drift, recurring counterparties by name-only) with provenance on every fact
  - On-device encryption of memory at rest; never sent to a server in cleartext; any sync is end-to-end encrypted
  - User-facing memory management: view, edit, pin, delete, and export any memory, plus a right-to-be-forgotten flow
  - Write-time sanitization + provenance tagging so every remembered fact is auditable and reversible

**Depends on:** P5.01 AI Operating System, Wallet Core (packages/core on-device vault + encryption), Compliance (packages/compliance privacy / DSAR)

**Interfaces**
  - `PreferenceStore.load/save — the closed UserPreferences store`
  - `sanitizePreferences(input): UserPreferences — drops any off-schema (secret-shaped) value`
  - `EpisodicMemory.record(event) / query(filter) — provenance-tagged history`
  - `MemoryView — the user-editable projection (view/edit/pin/export)`
  - `forget(scope) — right-to-be-forgotten deletion that propagates`

**Quality bar:** A fuzz test proves no secret-shaped string survives sanitize, the user can delete any memory and it is verifiably gone, and memory never leaves the device unencrypted. Beat ChatGPT memory on user control and on the provable no-secrets structural guarantee.

**Definition of done**
  - [ ] The preference schema is closed and fuzz-tested against key/mnemonic/address injection
  - [ ] Episodic memory is recorded with provenance on every entry
  - [ ] The user can view, edit, delete, and export every memory item
  - [ ] Deletion propagates and is verified (right-to-be-forgotten)
  - [ ] At-rest encryption plus a no-cleartext-egress test both pass
  - [ ] Personalization consumes memory without re-widening the closed schema

**Doctrine hooks**
  - #1 bites hardest: memory is structurally incapable of storing keys or seed and never egresses unencrypted
  - #3: provenance on every fact means the wallet never surfaces a fabricated 'remembered' claim
  - #6: sanitize-on-write plus an audit trail keep memory deterministic and inspectable
  - #5: memory is legible and user-controllable — that transparency is a product requirement, not polish


#### P5.05 · Knowledge Graph
> The wallet's map of the crypto world — every token, contract, protocol, and counterparty as a provenance-stamped node the agents can cite but never fabricate.

World-class is a typed knowledge graph — assets, contracts, protocols, counterparties, labels, and typed relationships — assembled from verifiable sources (chain data, audited token lists, risk/threat intel, sanctions lists) where every node and edge carries a source and confidence and 'stale/unknown' is a first-class state. Agents query it to ground facts, resolve entities, and classify transactions; they cannot write arbitrary edges into it. Beat Nansen and Arkham on provenance transparency and honest-unknown handling, delivered on-device-first so labeling never requires shipping the user's graph to a server.

**Owns**
  - The entity model: tokens, contracts, protocols, counterparties, labels, and typed relationships, each with a source + confidence
  - Ingestion from verifiable sources (chain data, verified token lists, risk intel, sanctions) with dedup and recorded conflict provenance
  - Deterministic entity resolution + labeling (contract->protocol, address->known-entity, token->canonical) with an honest 'unknown/unverified' state
  - A query API that returns CitedFacts feeding the FactLedger — the AI reads, it never mutates arbitrarily
  - Freshness/staleness tracking: a stale edge is labeled stale, never presented as current truth
  - Graph-backed enrichment for Risk (labels), Research, Market-Intel, and the Tax Agent (classification)

**Depends on:** P5.03 Tool Calling, Risk Engine (packages/risk threat intel), Chains (packages/chains on-chain data), Compliance (packages/compliance sanctions)

**Interfaces**
  - `KnowledgeGraph.resolve(entity): Entity | Unknown — deterministic entity resolution`
  - `KnowledgeGraph.neighbors(node) / label(address) — typed relationship + labeling queries`
  - `KnowledgeGraph.provenance(edge): CitedFact — source + confidence for any edge`
  - `Ingestion pipeline (source adapters + dedup + conflict recording)`
  - `Freshness metadata on every node/edge (fresh | stale | unknown)`

**Quality bar:** Every returned label carries a source and confidence, unknown is honest rather than guessed, and conflicting sources are surfaced instead of silently merged. Beat Nansen/Arkham on provenance transparency and honest-unknown handling.

**Definition of done**
  - [ ] The node/edge model requires a mandatory source + confidence
  - [ ] Ingestion dedups and records source conflicts rather than overwriting
  - [ ] Entity resolution returns 'unknown' honestly when unverified
  - [ ] Query outputs are CitedFacts consumable by the FactLedger
  - [ ] Staleness is labeled and a stale edge is never rendered as current truth
  - [ ] No path lets the LLM write an unsourced edge into the graph (tested)

**Doctrine hooks**
  - #3 bites hardest: every edge is sourced, unknown/stale is honest, and no relationship is ever fabricated
  - #6: entity resolution is deterministic, the AI reads rather than writes, and ingestion is audited
  - #4: token amounts and supply are carried as integer bigint base units, never floats


#### P5.06 · Personal Finance AI
> A proactive money copilot that understands your whole portfolio and proposes the next best action — always unsigned, always gated, never 'financial advice'.

World-class turns the deterministic Intelligence engine (positions, allocation, performance, risk/health, scenarios) into proactive, personalized guidance: what changed, what is concentrated or at risk, and what a rebalance/DCA/stop-loss would do — each as an unsigned proposal that must clear Risk + Policy and the user's signature. The LLM narrates; every figure is a CitedFact and every recommendation is built by deterministic code, not the model. Beat Cleo, Copilot Money, and Rocket Money for crypto depth (and Coinbase insights for honesty) while staying firmly on the right side of 'not personalized investment advice'.

**Owns**
  - Proactive insights + narration over the Intelligence engine (allocation, performance, concentration, health, scenario)
  - A deterministic recommendation builder (rebalance/DCA/stop-loss/stable-sweep) emitting unsigned PlanProposals gated by Risk+Policy
  - Goal + budget tracking, a cashflow view, and a 'what changed since last visit' digest
  - Personalization drawn from the Memory Engine (risk tolerance, preferred/avoided assets, automation opt-ins)
  - The advice boundary: educational + scenario framing only, never personalized investment advice, with compliance-checked language
  - Weekly report + alert authoring (honest and fully cited) feeding the notification surface

**Depends on:** P5.01 AI Operating System, P5.04 Memory Engine, Intelligence engine (packages/intelligence), Automation Engine (packages/automation), Policy + Risk engines

**Interfaces**
  - `FinanceCopilot.review(portfolio): CitedInsights + PlanProposals — proactive cited guidance`
  - `RecommendationBuilder — deterministic rebalance/DCA/stop-loss proposal construction`
  - `AutomationSuggester — opt-in DCA/stop-loss/stable-sweep suggestions gated by caps`
  - `DigestGenerator.report(period) — honest, cited weekly report + 'what changed' digest`

**Quality bar:** 0 uncited figures, every proposal unsigned and gated, and a passing advice-boundary red-team. Beat Cleo/Copilot Money/Rocket Money on crypto depth and honesty; beat Coinbase insights on not silently rendering a network-failed portfolio as $0.

**Definition of done**
  - [ ] Insights are fully cited and verify.ts passes on every response
  - [ ] Recommendations are emitted ONLY as unsigned proposals that clear Risk + Policy
  - [ ] Automations require explicit opt-in and per-cap approval before they can run
  - [ ] Personalization is sourced from the Memory Engine without widening its closed schema
  - [ ] The advice-boundary corpus yields no personalized-investment-advice violations
  - [ ] Network-fail portfolio honesty is preserved (a failed read is null, never $0)

**Doctrine hooks**
  - #2: recommendations are unsigned and Risk/Policy-gated — the user's signature disposes, the AI only proposes
  - #3: figures are cited, partial/empty states are honest, and net-worth honesty (null != $0) is preserved
  - #4: all money flows through the pipeline as integer bigint base units
  - #6 + compliance: deterministic recommendation builder plus a compliance-checked advice boundary keep the LLM to narration


#### P5.07 · Research Agent
> Due-diligence you can trust with money — multi-source, adversarially cross-checked, every claim cited, 'unknown' when it's unknown.

World-class is an agent that answers 'is this token/contract/protocol/counterparty safe, and what is it' by fanning out across verifiable sources, resolving entities through the Knowledge Graph, adversarially cross-checking claims, and producing a cited report with per-claim confidence and explicit unknowns. It never asserts an uncited fact and never turns research into an action on its own. Beat Perplexity and ChatGPT deep-research on provenance discipline and the honesty bar that moving money demands — a wrong 'it's safe' is a realized loss, so an unverifiable claim is flagged, not smoothed over.

**Owns**
  - Source fan-out + retrieval over verifiable sources (chain data, Knowledge Graph, risk/threat intel, audited lists); untrusted content treated as data, never instructions
  - Adversarial claim verification: cross-check, contradiction detection, and per-claim confidence + citation
  - Entity-grounded reports (token/contract/protocol/counterparty/tx) with explicit unknown/unverified states
  - A strictly read-only posture: outputs are analysis; any action leaves only as an unsigned proposal handed to the Personal Finance AI and gates
  - Prompt-injection resistance: content fetched from the web or a contract can never issue a tool call or change scope
  - Confidence + freshness on every finding; a stale or single-source claim is labeled as such

**Depends on:** P5.02 Multi-Agent Framework, P5.05 Knowledge Graph, P5.03 Tool Calling, Risk Engine (packages/risk)

**Interfaces**
  - `ResearchAgent.investigate(entity | question): CitedReport — per-claim citation + confidence`
  - `ClaimVerifier — cross-check + contradiction detection over multiple sources`
  - `Source adapters — verifiable-source retrieval treated as data-only`
  - `FindingProvenance — confidence + freshness stamped on every finding`

**Quality bar:** Every claim is cited or explicitly marked unknown, the injection corpus yields 0 tool calls from fetched content, and planted contradictions are surfaced. Beat Perplexity/ChatGPT deep-research on provenance and money-grade honesty.

**Definition of done**
  - [ ] Reports carry per-claim citation + confidence
  - [ ] 'Unknown' is a first-class result, not smoothed into a confident claim
  - [ ] Adversarial cross-check catches planted contradictions in the eval set
  - [ ] Fetched/untrusted content cannot trigger tools or escalate scope (red-team proven)
  - [ ] Single-source or stale claims are explicitly labeled
  - [ ] No research path can execute anything — actions leave only as gated proposals

**Doctrine hooks**
  - #3 bites hardest: cite-or-unknown with no fabrication, held to the honesty bar that moving money demands
  - #6: the LLM sits behind the schema boundary while verification is deterministic and audited
  - #2: read-only posture — actions leave only as unsigned, gated proposals
  - instruction-source-boundary: fetched web/contract content is data, never commands, and cannot issue tool calls


#### P5.08 · Market Intelligence
> Live market context the wallet actually trusts — cited, staleness-aware, and allergic to presenting an old number as a live one — with zero buy/sell signals.

World-class fuses prices, volatility, on-chain flows, gas/fee regimes, liquidity, and risk events into cited, freshness-stamped context for the agents and the user, where a missing or stale price is an honest null state — never silently $0 and never last-known-as-live — and where the line at 'personalized buy/sell signal' is never crossed. Beat Nansen, Arkham, Messari, and Token Terminal on honesty (staleness + coverage transparency) and on being on-device-first rather than a data product that harvests the user. It informs timing and awareness; it does not advise.

**Owns**
  - Market-context aggregation: prices, volatility, on-chain flows, gas/fee regime, liquidity, and notable risk/market events — each cited + freshness-stamped
  - Opportunity + threat alerting (concentration risk spiking, unusual counterparty flow, a cheap-gas window) as honest, cited notifications
  - A staleness + coverage model: stale/partial/unknown are first-class; a price-read failure is null, never $0 or fake-live
  - Feeds to the Personal Finance AI (context), Research Agent (market lens), and Router (timing) — without ever emitting a buy/sell signal
  - Bigint-safe amounts + nullable prices end-to-end; USD conversions honor missing-price honesty
  - Event provenance + dedup so the same on-chain event is never double-counted or left unsourced

**Depends on:** P5.05 Knowledge Graph, P5.06 Personal Finance AI (consumer), Portfolio / price engine (packages/portfolio), Router (packages/router)

**Interfaces**
  - `MarketIntel.context(assets): CitedFreshSnapshot — cited + timestamped market context`
  - `AlertEngine — opportunity/threat notifications, cited and deduped`
  - `FreshnessMeta — fresh | stale | partial | unknown on every datum`
  - `Feed contracts consumed by finance, research, and router timing`

**Quality bar:** No stale price is ever shown as live, every datum is cited and timestamped, and no output resembles a buy/sell signal (advice-boundary tested). Beat Nansen/Messari/Token Terminal on honesty and on-device posture rather than raw data breadth.

**Definition of done**
  - [ ] Every market figure is cited and timestamped
  - [ ] Stale/partial/missing data is rendered honestly (a price-read failure is null, never $0)
  - [ ] Alerts are cited and deduped against event provenance
  - [ ] The advice-boundary corpus yields no signal-like outputs
  - [ ] Bigint amounts and nullable prices are enforced in the types
  - [ ] Feeds are consumed by finance/research/router without leaking any uncited number

**Doctrine hooks**
  - #3 bites hardest: staleness honesty, null != $0, and cited data on every datum
  - #4: amounts are integer bigint and prices are nullable, so a missing price never becomes a fabricated figure
  - advice-boundary: market context informs but never emits a personalized buy/sell signal
  - #6: aggregation is deterministic with provenance and an audit trail behind the LLM edge


#### P5.09 · Tax Agent
> Audit-grade crypto tax that never invents a cost basis — deterministic lots, jurisdiction-aware reports, and an honest 'basis unknown' instead of a made-up number.

World-class is a deterministic tax engine (extending packages/intelligence/tax.ts) that tracks lots and cost basis (FIFO/LIFO/HIFO/specific-ID), classifies income events (staking, airdrops, rewards, forks) via the Knowledge Graph, computes realized/unrealized gains in bigint base units, flags wash-sale-style patterns, and produces jurisdiction-aware reports (Form 8949 / Schedule D and equivalents) exportable to TurboTax/CSV. Where basis is missing it says so and shows the gap — it never fabricates a number to make a return balance. Beat Koinly, CoinTracker, and TokenTax on provenance, on-device-first privacy, and auditability, while staying a report generator, not a tax advisor.

**Owns**
  - A lot + cost-basis engine (FIFO/LIFO/HIFO/specific-ID) with per-lot provenance; realized + unrealized gain/loss
  - Income-event classification (staking, airdrops, rewards, forks) grounded in the Knowledge Graph
  - Wash-sale / disallowed-loss style flagging and short/long holding-period determination
  - Jurisdiction-aware report generation (8949/Schedule D and equivalents) + export (TurboTax/CSV) via Compliance profiles
  - Honest gap handling: missing-basis / unknown-acquisition surfaced explicitly, never auto-filled with a fabricated figure
  - Deterministic, bigint, fully-auditable computation with a reproducible calculation trace per line

**Depends on:** P5.05 Knowledge Graph, Intelligence tax engine (packages/intelligence/tax.ts), Compliance (packages/compliance jurisdiction profiles), Portfolio (packages/portfolio)

**Interfaces**
  - `TaxAgent.report(period, method, jurisdiction): CitedLineItems + Gaps — the report contract`
  - `LotLedger — per-lot provenance and holding-period tracking`
  - `BasisMethod = 'FIFO' | 'LIFO' | 'HIFO' | 'SPEC_ID' — the pluggable basis strategies`
  - `Export adapters (TurboTax / CSV) validated against reference schemas`
  - `Per-line calculation trace for audit reproducibility`

**Quality bar:** Bit-for-bit reproducible math, every line traceable to lots, missing basis flagged rather than invented, and output matching worked reference examples. Beat Koinly/CoinTracker/TokenTax on provenance and on-device privacy.

**Definition of done**
  - [ ] Cost-basis methods (FIFO/LIFO/HIFO/spec-ID) pass known-answer tests
  - [ ] Income events are classified with Knowledge-Graph provenance
  - [ ] Gains are computed in integer bigint and are reproducible run-to-run
  - [ ] Missing basis is surfaced explicitly and never auto-filled with a fabricated figure
  - [ ] Jurisdiction reports match reference forms and exports validate against TurboTax/CSV schemas
  - [ ] A tax-advice-boundary check passes and a full calc trace exists per line

**Doctrine hooks**
  - #4 bites hardest: integer bigint money, deterministic reproducible math, and guards that fail closed
  - #3: missing basis is honest, never fabricated to force a return to balance
  - #6: a pure engine with the LLM confined to narration, plus a per-line audit trace
  - compliance: jurisdiction-aware profiles and a report-generator (not tax-advisor) boundary


#### P5.10 · AI Marketplace
> An App Store for money-agents where nothing you install can ever sign for you — sandboxed, signed, permissioned, revocable, and provably no-execute.

World-class is a marketplace where third-party developers publish AI skills/agents/tools that run as sandboxed capabilities on the AI OS, inheriting every kernel guarantee: no execute scope, schema-forced tools, per-agent budgets, and explicit, revocable permissions. Every listing is signed, semver-versioned, trust-tiered, reviewed, and reputation-rated, with provenance the user inspects before granting a single scope. Beat the OpenAI GPT Store and the Apple App Store on the one axis that matters for money — installed third-party code can never gain signing authority or silently widen its scope — realizing the Y5 'wallet as OS, third-party skills' roadmap.

**Owns**
  - The publishing pipeline: signed, semver-versioned skill/agent/tool packages with declared permissions and a trust level
  - Sandboxed execution: third-party capabilities run under the same no-execute + scope + budget guarantees as first-party ones
  - Explicit, granular, revocable permission grants; the user inspects scope + provenance before install and can revoke instantly
  - Review + reputation: static/dynamic vetting, ratings, and a reputation model (reusing the solver/plugins reputation machinery)
  - Versioning + deprecation windows (>=90 days), signature verification, and a revocation/kill-switch for bad actors
  - Metering + billing/usage export for paid skills (Stripe-grade) plus a developer sandbox environment

**Depends on:** P5.01 AI Operating System, P5.03 Tool Calling, P5.02 Multi-Agent Framework, Plugins engine (packages/plugins), Solver reputation (packages/solver) + Compliance

**Interfaces**
  - `SkillManifest — signed, permissioned, semver-versioned package descriptor with trust level`
  - `Marketplace.publish / install / revoke — the lifecycle contract`
  - `PermissionGrant — granular, user-consented, instantly revocable scope grants`
  - `Reputation + Review APIs — vetting, ratings, and trust-tier gating`
  - `Metering / billing export — Stripe-grade usage accounting for paid skills`

**Quality bar:** No installed skill can execute, sign, or exceed its granted scope (test-proven); every permission is explicit and revocable; every listing is signed and provenance-verified; deprecation windows are >=90 days. Beat the GPT Store and App Store on the no-signing-authority guarantee, and match Stripe on billing/metering rigor.

**Definition of done**
  - [ ] Skills are signed, semver-versioned, and trust-tiered
  - [ ] Install requires explicit per-scope consent and is instantly revocable
  - [ ] The sandbox denies execute and scope-escape attempts (red-team proven)
  - [ ] Revocation / kill-switch is verified to disable a bad skill immediately
  - [ ] Reputation + review gate low-trust skills before they reach users
  - [ ] Metering/billing export works and a >=90-day deprecation window is enforced

**Doctrine hooks**
  - #2 bites hardest: no third-party code ever gets signing authority — the sandbox can only propose, and the device signature disposes
  - #1: installed skills never touch keys or seed; the on-device boundary holds against third-party code
  - #6: third-party tools are signed, audited, and schema-forced exactly like first-party ones
  - #5: the permission-consent UI is legible and WCAG AA — informed consent is a product requirement


### Phase 6 — Platform


#### P6.01 · SDK
> A typed, zero-dependency multi-language SDK where every wire quirk is invisible and no method can ever hold a key.

Turn the /v1 surface into an idiomatic client per language — TypeScript first (extending packages/sdk), then Python, Swift/Kotlin, Rust — each a thin fluent layer over a boring functional core with an injected transport that mirrors the wire exactly (money = decimal strings). It surfaces RFC 9457 problem+json as typed errors and runs/tests in any runtime with zero network. Signing stays on the device-signer seam; the SDK never touches a key or seed.

**Owns**
  - The generated-then-hand-finished TypeScript client (plan→authorize→execute + portfolio + insights + status) pinned 1:1 to the introspected OpenAPI 3.1 doc
  - A multi-language parity matrix (TS, Python, Swift, Kotlin, Rust) generated from one spec with a shared golden conformance suite run per language
  - The injected HTTP transport seam (no baked-in fetch), idempotency-key plumbing, and automatic retry/backoff on 429/503 honoring Retry-After
  - A typed ApiError discriminated union mapping every problem+json `type` URI to a case — the client never throws an untyped Error
  - Money-boundary correctness: decimal-string ⇄ base-unit bigint codecs so app code never floats money
  - SemVer + deprecation policy and a spec-drift CI gate that fails when the client diverges from the mounted routes

**Depends on:** Public API, Developer Platform, Observability

**Interfaces**
  - `IntentWalletClient fluent client (plan/authorize/execute/portfolio/insights/status)`
  - `Injectable Transport + RequestContext (idempotency key, trace headers, token provider)`
  - `ApiError discriminated union mirroring RFC 9457 problem `type`s`
  - `Money codec: decimalString ⇄ bigint base units, exported per language`
  - `Codegen pipeline: OpenAPI 3.1 → language clients + shared conformance fixtures`

**Quality bar:** DX at or above Stripe's SDKs (stripe-node/stripe-python): full inference and autocomplete on every field, a first successful plan call in <10 lines, zero runtime deps in TS, and 100% of wire fields round-trip tested. Beat ethers/Alchemy ergonomics on error clarity.

**Definition of done**
  - [ ] The TS client regenerates from the live OpenAPI doc with zero manual diffs; spec-drift CI gate green
  - [ ] The golden conformance suite passes identically across TS + Python + one mobile language
  - [ ] Every problem+json `type` maps to a typed ApiError case; no code path throws a bare Error
  - [ ] Money round-trips decimalString→bigint→decimalString with zero precision loss under property tests
  - [ ] The SDK runs green fully offline with a fake transport (no network)
  - [ ] Published packages are signed and provenance-attested on npm/PyPI

**Doctrine hooks**
  - #1 Non-custodial: the SDK exposes no key/seed surface — signing is the server's device-signer seam, enforced by a lint rule banning `sign`/`privateKey` from the public client
  - #4 Money bigint: the decimal-string wire boundary is the only place floats could leak; the money codec + property tests fail closed on precision loss
  - #6 Deterministic cores: a functional core with injected transport is exhaustively testable offline; no AI ever lives in the client


#### P6.02 · Public API
> The versioned, RFC 9457-honest HTTP contract for the whole doctrine loop — introspected from real routes so it can never lie about what runs.

Elevate the Fastify /v1 surface into a public, key-authenticated, rate-limited product API any third party can build on: plan→authorize→execute, portfolio, insights, status, plus webhooks and analytics reads. The OpenAPI 3.1 doc is introspected from mounted routes (never hand-claimed), every error is problem+json, and /execute always re-authorizes server-side so no client can smuggle a forged plan or asserted permission past the safety gate.

**Owns**
  - The stable /v1 resource model + versioning/deprecation policy (additive-only within a major; Sunset headers)
  - API-key + OAuth2 client-credentials auth alongside SIWE user sessions; scoped keys (read/plan/execute) with per-key rate limits and quotas
  - Idempotency keys on every money-path POST (execute/settlement) backed by a durable idempotency store
  - Server-authoritative doctrine at the edge: /execute re-runs Risk+Policy and refuses unless mayProceedToSign; plans resolved by server-issued planId, never client-supplied
  - The introspected OpenAPI 3.1 document with field-level request/response schemas, the shared ProblemDetails shape, and generated contract tests
  - Consistent pagination, cursoring, filtering, and cache semantics across list endpoints

**Depends on:** Runtime composition root, Risk/Policy engines, Webhooks, Enterprise, Observability

**Interfaces**
  - `POST /v1/intents/{plan,authorize,execute}, GET /v1/portfolio(/insights), status endpoints`
  - `RFC 9457 application/problem+json contract with a registry of stable `type` URIs`
  - `API-key + OAuth2 client-credentials + read/plan/execute scopes`
  - `Idempotency-Key header contract + replay semantics`
  - `OpenAPI 3.1 discovery doc at /openapi.json (route-introspected)`

**Quality bar:** Stripe-grade API contract: p99 < 150ms on read paths, a 99.99% availability target, every error actionable and documented, idempotency on every unsafe write, and a spec precise enough to generate typed clients + run contract tests. Beat MetaMask/Alchemy JSON-RPC on clarity and safety guarantees.

**Definition of done**
  - [ ] Every mounted route appears in the introspected OpenAPI doc with real schemas; no phantom endpoints
  - [ ] An integration test proves /execute re-authorizes server-side and rejects any client-asserted permission
  - [ ] Duplicate idempotency-keyed POSTs return the original result and never double-execute
  - [ ] Scoped keys enforce read/plan/execute separation; over-scope requests 403
  - [ ] Every 4xx/5xx returns problem+json with a stable, documented `type`
  - [ ] Contract tests generated from the OpenAPI doc run green in CI against the live app

**Doctrine hooks**
  - #2 AI proposes, code verifies, device disposes: the API edge is where a remote caller is stopped — /execute re-verifies through Risk+Policy and can only REFUSE; the device signature disposes
  - #3 Never fake data: a provider/RPC failure returns a typed problem+json, never a fabricated success or "$0"
  - #6 Deterministic boundary: Zod schema validation at the edge; malformed input fails closed with a validation problem


#### P6.03 · Enterprise
> Turn a personal wallet into a governed multi-seat platform — SSO, SCIM, maker-checker, audit exports — without ever centralizing a single private key.

Give organizations the controls their security teams demand — SAML/OIDC SSO, SCIM lifecycle, org-scoped RBAC, maker-checker change approval, policy templates, data residency, and defensible audit/compliance exports — layered on the existing compliance engine (governance RBAC, consent, privacy/DSAR, reproducible reporting). The wallet stays non-custodial: enterprise governs policy, spend caps, and access, never custody of keys.

**Owns**
  - Organizations, teams, seats, and org-scoped roles mapped onto the compliance engine's RBAC + maker-checker approval state machine
  - SSO (SAML 2.0 + OIDC) and SCIM 2.0 provisioning/deprovisioning; enforced session policy (MFA, IdP-driven revocation)
  - Org policy templates — spend caps, allow/deny lists, per-role authorization limits — wired into the Policy Engine on the execute path
  - Reproducible compliance/audit reporting (operational metrics, DSAR, retention) with signed S3/SFTP exports and data-residency routing via Scale's region router
  - Emergency org-level freeze — immediate but itself permissioned and audited
  - Contractual SLAs and immutable, exportable audit logs as SOC 2 / ISO evidence surfaces

**Depends on:** Compliance engine, Policy Engine, Scale (region router), Public API, Observability

**Interfaces**
  - `Org/Team/Seat + RoleAssignment API over compliance governance RBAC`
  - `SAML/OIDC SSO + SCIM 2.0 provisioning endpoints`
  - `Change-approval (maker-checker) propose/approve/apply API`
  - `Compliance report generation + signed export (S3/SFTP) API`
  - `Emergency-freeze control endpoint (permissioned + audited)`

**Quality bar:** WorkOS/Auth0-grade enterprise readiness: SSO+SCIM that pass a Fortune-500 security review, maker-checker no single principal can bypass, and audit exports a regulator accepts. Match Okta on provisioning correctness; beat every crypto competitor on non-custodial governance.

**Definition of done**
  - [ ] SAML + OIDC verified against 2+ real IdPs (Okta, Entra); SCIM provisions and deprovisions seats end-to-end
  - [ ] Maker-checker proven: the proposer of a change can never be counted among its approvers (test)
  - [ ] Org spend-cap/allowlist templates are enforced by the Policy Engine on execute
  - [ ] Compliance reports are byte-identical for the same records + spec and export signed
  - [ ] Emergency freeze halts new executions org-wide and writes an audit record
  - [ ] Architecture review confirms no enterprise feature introduces server-side key custody

**Doctrine hooks**
  - #1 Non-custodial: enterprise controls policy and access, never keys — a review invariant; no path stores or reconstructs a member's seed
  - #2 Verify-then-dispose: org caps/approvals are additional REFUSE gates before the device signs — they can tighten but never grant signing authority
  - #3/#6 Auditable + deterministic: every governance action is authenticated, authorized, audited, and reproducible via the compliance engine


#### P6.04 · White-label
> Ship a partner's own branded, non-custodial intent wallet in a day — their theme, their domain, our doctrine, zero fork.

Let partners (exchanges, neobanks, fintechs) embed a fully-branded Intent Wallet — a web widget plus a mobile embedding SDK — themed by configuration, not forks. Reuse the design-system tokens (theme.ts, ui.tsx) and Simple/Pro/Dev modes over the runtime; expose a tenant config controlling branding, enabled chains/features, network mode, and copy — while every safety gate, non-custodial guarantee, and honest-state rule stays untouchable by the tenant.

**Owns**
  - The TenantConfig model: brand tokens (colors, logo, type), enabled features/chains, network-mode defaults, locale/copy overrides
  - Themeable embeddable surfaces — a web component/iframe wallet and a mobile embedding SDK — both driven by design-system tokens
  - Tenant isolation: per-tenant API keys, rate limits, data partitioning, and webhook routing
  - A theme validator enforcing WCAG AA contrast on tenant palettes in light and dark — an inaccessible theme cannot ship
  - Compiled-in guardrails so no config can disable the safety gate, fake balances, or take custody
  - Tenant onboarding, config versioning, and preview/staging environments

**Depends on:** SDK, Public API, UI design system, Enterprise, Developer Platform

**Interfaces**
  - `TenantConfig schema (branding + features + network mode + copy) with validation`
  - `Embeddable web component / iframe wallet surface`
  - `Mobile embedding SDK injecting theme over ui.tsx tokens`
  - `Per-tenant key + webhook routing model`
  - `Theme validator (WCAG AA contrast gate)`

**Quality bar:** Privy/Dynamic-grade embeddability with Apple-grade craft: a partner integrates a branded, accessible wallet in <1 day and it feels native, not a bolted-on iframe. Beat Coinbase WaaS on non-custodial honesty and design quality.

**Definition of done**
  - [ ] A reference partner theme renders across the web widget + mobile SDK from one TenantConfig
  - [ ] The theme validator rejects any palette failing WCAG AA contrast in dark and light
  - [ ] Tenant A cannot read tenant B's data, keys, or webhooks (isolation test)
  - [ ] No TenantConfig value can disable the safety gate, fabricate balances, or enable custody (enforced + tested)
  - [ ] prefers-reduced-motion + AA accessibility hold under the tenant brand, not just the default
  - [ ] Config changes version and preview in staging before production rollout

**Doctrine hooks**
  - #5 Apple-grade + WCAG AA: the theme validator makes accessibility a hard gate — a tenant literally cannot ship an inaccessible or motion-hostile wallet
  - #1/#3 Non-custodial + never-fake: doctrine is compiled in, not configurable — no flag can take custody or turn a network failure into a fake "$0"
  - #6 Deterministic config: TenantConfig is schema-validated and fails closed on invalid branding/feature combinations


#### P6.05 · Plugin Marketplace
> An App Store for wallet extensions where trust is earned cryptographically and a plugin can only touch what the user explicitly grants.

Build the storefront, distribution, and monetization layer on the existing plugins engine (trust levels, manifest signing/revocation, deny-by-default permissions, sandbox). Developers publish signed plugins; users see honest trust badges and sensitive-permission warnings before install; every capability is gated and FORBIDDEN methods (keys, signing, raw DB) are unreachable by any plugin at any trust level. Add discovery, reviews, revenue share, and staged review — without loosening the security core.

**Owns**
  - Storefront + discovery: listings, categories, search, developer profiles, and ratings aggregated over the marketplace's pure rating core
  - The publishing pipeline: manifest + code-hash signing through the 5-check gauntlet (integrity→trust-claim→authority→signature→revocation), staged review, and a revocation kill-switch
  - Trust-badge + consent UX: honest Official/Verified/Community/Experimental badges plus explicit sensitive-permission warnings via the deterministic listingSignals core
  - Monetization: paid plugins, subscriptions, revenue share, payouts, and licensing
  - The permission-grant + consent ledger and per-user install/enable/disable lifecycle over the sandbox
  - Abuse response: report flows, expedited revocation, and post-install security scanning

**Depends on:** Plugins engine, Developer Platform, Public API, Compliance engine, Observability

**Interfaces**
  - `Listing + ListingSignals (badge + warnings) surface from the marketplace core`
  - `Publish/sign/submit-for-review + revoke API over the signing gauntlet`
  - `Install/grant/enable/disable lifecycle API over sandbox + permissions`
  - `Ratings/reviews aggregation API`
  - `Revenue-share + payout API`

**Quality bar:** Chrome Web Store / App Store review rigor with GitHub Apps clarity of scopes: nothing ships without passing the full signature gauntlet, and users always see exactly what they grant. Beat MetaMask Snaps on permission transparency and revocation speed.

**Definition of done**
  - [ ] No plugin installs unless all 5 supply-chain checks pass (fail-closed verified in test)
  - [ ] FORBIDDEN methods (keys/signing/raw DB) stay unreachable by a plugin holding every grantable permission
  - [ ] Sensitive-permission warnings + honest trust badge render on every listing before install
  - [ ] A revoked plugin is disabled for all users within the kill-switch SLA
  - [ ] Unknown/ungated host methods deny by default (deny-by-default test)
  - [ ] Revenue-share payouts reconcile deterministically against install/subscription events

**Doctrine hooks**
  - #1 Non-custodial: keys/signing are FORBIDDEN_METHODS — no marketplace plugin, at any trust level, can reach them, enforced by the permission core not policy prose
  - #2 Verify-disposes: a plugin may PROPOSE intents (intent.propose) but never sign; a proposed intent still runs the full safety gate + device signature
  - #3 Honest signals: badges + warnings never overstate safety — experimental/community are labeled unreviewed, matching never-fake doctrine


#### P6.06 · Developer Platform
> The self-serve front door: sign up, get a key, hit a sandbox, and ship — a Stripe-grade developer experience for programmable money.

Build the developer-facing product that makes the API, SDK, and plugins usable in minutes: a dashboard for keys/quotas/usage, interactive versioned docs generated from the introspected OpenAPI doc, a fully-featured testnet sandbox, quickstarts, and an API-log explorer. Everything a developer needs to go from signup to a first successful plan→authorize→execute on testnet without talking to a human — honest testnet labeling throughout.

**Owns**
  - The developer dashboard: org/project management, API-key issuance + rotation + scoping, and quota/usage/billing visibility
  - An interactive docs portal generated from the introspected OpenAPI 3.1 doc (always in sync with real routes) plus guides, recipes, and runnable examples
  - A first-class sandbox: testnet-only keys, deterministic fixtures, honest testnet labeling, and a request inspector / API-log explorer
  - Developer identity + onboarding (signup → key in <5 min) and status/support surfaces
  - Usage metering + billing integration and rate-limit/quota dashboards
  - Changelog, deprecation notices, and migration guides tied to the API versioning policy

**Depends on:** Public API, SDK, Analytics Platform, Plugin Marketplace, Observability

**Interfaces**
  - `Dashboard: project + API-key management (issue/rotate/scope/revoke)`
  - `Docs portal rendered from /openapi.json with sandbox-scoped "try it"`
  - `Sandbox environment (testnet keys + fixtures + request inspector)`
  - `Usage/metering + billing surface exposed to developers`
  - `Changelog + deprecation feed`

**Quality bar:** Stripe/Twilio developer experience: signup-to-first-call under 5 minutes, executable docs that never drift from the API, and an API-log explorer a developer trusts to debug. Beat Alchemy/Infura dashboards on clarity and Vercel on onboarding speed.

**Definition of done**
  - [ ] A new developer self-serves from signup to a successful testnet execute in <5 minutes with no human
  - [ ] Docs regenerate from the live OpenAPI doc; a route change reflects automatically (drift test)
  - [ ] The sandbox executes only on testnet and every response is labeled testnet, never presented as real mainnet
  - [ ] Keys can be scoped, rotated, and revoked from the dashboard with immediate effect
  - [ ] The API-log explorer shows real requests with secrets redacted via observability.redact
  - [ ] Usage/quota dashboards match metered reality within the billing reconciliation tolerance

**Doctrine hooks**
  - #3 Never fake data: the sandbox is honestly testnet-labeled; nothing in docs or sandbox is presented as a real mainnet result that didn't happen
  - #1 Non-custodial + privacy: the dashboard manages API keys, never user seeds; observability.redact keeps secrets out of the log explorer
  - #6 Schema-forced docs: docs are generated from the introspected spec, so they are deterministically true to what actually runs


#### P6.07 · CLI
> A scriptable, CI-friendly command line for the whole platform — from `intent plan` to `intent plugin publish` — honest and non-custodial by construction.

Ship a first-class `intent` CLI built on the SDK that drives the platform from a terminal: run the intent loop, inspect portfolio/status, manage plugins, tail webhooks/events, and automate CI. Signing uses the local device/hardware seam — the CLI orchestrates but never exfiltrates keys — and every mutating command is explicit, dry-run-able, and scriptable with machine-readable output and a stable exit-code contract.

**Owns**
  - The `intent` command tree: auth/login (SIWE/device), plan/authorize/execute, portfolio, status, config/context (env + network mode)
  - Plugin developer commands: scaffold, build, sign, publish, revoke — over the same plugins gauntlet as the marketplace
  - Platform ops: tail webhooks/events, inspect API logs, manage keys, and switch tenant/org context
  - Dual output: a rich human TTY plus `--json` machine output for CI, with non-zero exit codes on failure
  - Terminal safety UX: explicit confirmation + `--dry-run` on money-path commands, honest testnet/mainnet labeling, and capped-mainnet acknowledgment
  - Local key handling via the device/hardware signer seam — never printing or transmitting secrets

**Depends on:** SDK, Public API, Plugins engine, Developer Platform, Observability

**Interfaces**
  - ``intent plan|authorize|execute` — the doctrine loop from a terminal`
  - ``intent plugin scaffold|build|sign|publish|revoke``
  - ``intent keys|context|config` — scoped keys, org/network context`
  - ``intent logs|events tail` — webhook/event/API-log streaming`
  - ``--json` structured output + a stable exit-code contract`

**Quality bar:** GitHub CLI (gh) / Vercel / Stripe CLI craft: discoverable subcommands, great `--help`, shell completions, and a `stripe listen`-class local webhook tailer. Money-path commands are as explicit and reversible-until-signed as the Apple Wallet confirm step.

**Definition of done**
  - [ ] The full plan→authorize→execute loop runs from the CLI against testnet, honestly labeled
  - [ ] Every money-path command requires explicit confirmation and supports `--dry-run`
  - [ ] `--json` output is stable and documented; failures exit non-zero with a problem+json-derived message
  - [ ] `intent plugin publish` runs the same signing gauntlet as the marketplace with no bypass
  - [ ] No command prints or transmits a private key/seed; signing stays on the device/hardware seam
  - [ ] Shell completions + `--help` cover every command and a scripted CI example runs green

**Doctrine hooks**
  - #1 Non-custodial: the CLI orchestrates signing via the local device/hardware seam and never handles raw keys — enforced by a test that greps output for secret leakage
  - #2 Verify-disposes + #3 honest labels: money-path commands confirm/dry-run, re-authorize server-side, and label testnet/capped-mainnet truthfully
  - #6 Deterministic: `--json` output + stable exit codes make the CLI safe to script and assert on in CI


#### P6.08 · Webhooks
> Every meaningful state change delivered exactly-effectively-once, HMAC-signed, ordered per entity, and replayable — the outbound nervous system of the platform.

Turn the internal Kafka event bus (versioned topics, an envelope carrying id/key/correlationId, DLQ discipline) into a reliable outbound webhook product. Third parties subscribe to typed events (execution.step.confirmed, intent.lifecycle, risk.flags, settlement…), receive HMAC-signed deliveries, dedupe on the envelope id, and get automatic retries plus a replay UI — with money-path topics held to the strictest delivery and alerting SLAs.

**Owns**
  - Subscription management: endpoints, event-type filters, per-tenant secrets, and enable/disable
  - The delivery engine: at-least-once delivery with dedupe hints, per-entity ordering by envelope `key`, exponential-backoff retries, and a dead-letter/replay path
  - Signing + verification: HMAC-SHA256 signature + timestamp headers and a verification recipe (plus SDK helper) that prevents replay/forgery
  - The public event catalog: stable, versioned event types mapped from internal topics, each with a JSON schema
  - Delivery observability: attempt logs, success/failure rates, latency, and a self-serve replay/redrive UI
  - Money-path delivery guarantees: execution/chain topics get tighter SLAs and on-call paging when DLQ depth > 0

**Depends on:** Events bus, Reliability engine, Public API, Developer Platform, Observability

**Interfaces**
  - `Subscription CRUD API (endpoint + event filters + secret)`
  - `Signed delivery contract (HMAC header + timestamp + envelope id/correlationId)`
  - `Public versioned event catalog + per-event JSON schemas`
  - `Replay/redrive API + delivery-attempt log`
  - `SDK signature-verification helper`

**Quality bar:** Stripe Webhooks / Svix reliability: signed payloads, idempotent by delivery id, ordered per entity, a `stripe listen`-class local tailer, and a replay UI that makes a missed event a non-event. Money-path topics meet a stricter SLA than Stripe's default.

**Definition of done**
  - [ ] Deliveries are HMAC-signed; a tampered or stale-timestamp payload fails verification (test)
  - [ ] Consumers dedupe on envelope id; a redelivery never double-applies (idempotent by design)
  - [ ] Per-entity ordering holds under retries (events for one intentId/executionId stay ordered)
  - [ ] Failed deliveries retry with backoff, land in a replayable DLQ, and the replay UI redrives them
  - [ ] Money-path (execution/chain) DLQ depth > 0 pages on-call via the Reliability alerting
  - [ ] The public event catalog is versioned; a schema change bumps the event `.vN` rather than silently breaking consumers

**Doctrine hooks**
  - #3 Never fake data: a webhook fires only on a real occurred state change (envelope.occurredAt); nothing is delivered as "confirmed" that didn't happen on-chain
  - #2 Verify-disposes: webhooks are outbound notifications with no signing authority — any downstream action re-enters the safety gate
  - #6 Deterministic + auditable: versioned event schemas + correlationId (the originating intent id) make every delivery traceable and replayable


#### P6.09 · Analytics Platform
> The read-side truth engine: usage, funnels, and portfolio intelligence built on deterministic cores — insight without ever fabricating or leaking a number.

Build the analytics product for two audiences — developers/enterprises (usage, funnels, retention, revenue) and end-users (portfolio performance, allocation, tax, scenario) — fed by the analytics.raw event topic and the existing intelligence engine (positions, allocation, performance, tax, narrator boundary). Every metric is computed deterministically from real events; money stays bigint; the AI narrator only explains numbers the pure code already produced, behind a schema-forced boundary.

**Owns**
  - The ingestion + warehouse pipeline from analytics.raw.v1 to queryable metrics (usage, funnels, retention, cohorts, revenue) with per-tenant isolation
  - Developer/enterprise analytics: API usage, error rates, plan→execute conversion funnels, plugin adoption, and quota/billing analytics
  - End-user portfolio analytics surfaced from the intelligence engine (performance, allocation, risk/health, tax, scenarios) — real holdings only, with honest partial-read states
  - The AI narrator boundary: the LLM explains/summarizes metrics but never invents them; outputs are schema-validated against the computed figures
  - Privacy + consent enforcement over the compliance engine: consent-gated collection, retention limits, DSAR-exportable data, PII redaction, and no personal data in query params
  - Self-serve dashboards, a query/export API, and scheduled reports

**Depends on:** Intelligence engine, Events bus, Compliance engine, Public API, Observability

**Interfaces**
  - `Analytics query API (usage/funnels/retention/revenue) with per-tenant scoping`
  - `Portfolio-analytics surfaces from the intelligence engine (performance/allocation/tax/scenario)`
  - `AI narrator boundary — schema-forced explanation over computed metrics`
  - `Consent + retention + DSAR-export controls over the compliance engine`
  - `Dashboard + scheduled-report + export API`

**Quality bar:** Amplitude/PostHog product-analytics depth with Stripe Sigma-style queryability — and a privacy posture that beats them: consent-gated, retention-bounded, PII-redacted by default. Portfolio insight beats every competing wallet because it is computed by an exhaustively-tested deterministic core, not vibes.

**Definition of done**
  - [ ] Metrics recompute identically from the same raw events (deterministic and reproducible)
  - [ ] Money in every financial metric is bigint end-to-end; no float appears in the pipeline (test)
  - [ ] The narrator's output is schema-validated to reference only computed figures and cannot state an unbacked number
  - [ ] A network/partial read renders as an honest partial state, never a fabricated $0 or 100%
  - [ ] Consent gates collection, retention windows are enforced, and analytics data is DSAR-exportable
  - [ ] No PII appears in URLs/query params; tenant A cannot query tenant B's analytics

**Doctrine hooks**
  - #3 Never fake data: honest partial-read/loading states mirror the balances fail-soft rule — a missing price is never "$0" in any chart
  - #4 Money bigint: all financial analytics compute on integer base units; the decimal/display conversion is the only boundary
  - #6 Deterministic + AI-at-edges: pure cores compute the numbers and the LLM narrator is a schema-forced edge that can only explain, via the intelligence.narrator boundary


#### P6.10 · Observability
> See everything, leak nothing: OpenTelemetry traces, RED metrics, redacted structured logs, and error budgets that make the money path provably healthy.

Make the whole platform observable to enterprise standards, extending the observability package (structured logger, redact, RFC 9457 problem mapping), the prom-client RED metrics, and trace-context propagation. Deliver end-to-end distributed tracing keyed on correlationId (the originating intent id), SLO/error-budget dashboards from the reliability engine, and alerting that pages on money-path burn — while allowlist redaction guarantees no key, seed, or PII ever reaches a log or trace.

**Owns**
  - Distributed tracing (OpenTelemetry) across API → runtime → chains/providers, propagated on correlationId, with low-cardinality span attributes
  - RED metrics (rate/errors/duration) per route plus process metrics, with low-cardinality labels (route pattern, never concrete URL) and per-instance registries
  - Structured, leveled, redaction-enforced logging (secrets/PII scrubbed via observability.redact) correlated to RFC 9457 problems
  - SLO + error-budget dashboards and multi-window burn-rate alerting built on the reliability engine's error-budget math, with money-path SLOs the strictest
  - On-call: alert routing, runbooks, DLQ-depth paging for money-path topics, and incident timelines correlated by intent id
  - A privacy-safe telemetry contract: an allowlist of loggable fields — anything unlisted is redacted by default (fail closed)

**Depends on:** Observability package, Reliability engine, Events bus, Scale engine, Public API

**Interfaces**
  - `OpenTelemetry trace context propagated on correlationId across services`
  - `Prometheus /metrics (RED + process) with low-cardinality labels`
  - `Structured Logger + redact contract (allowlist-based, fail-closed)`
  - `SLO/error-budget + multi-window burn-rate alert definitions over reliability.slo`
  - `Runbook + on-call paging integration (money-path DLQ + burn-rate)`

**Quality bar:** Datadog/Honeycomb-grade observability with Google SRE discipline: trace any intent end-to-end by its correlationId, alert on multi-window burn rate (e.g. 14.4x ≈ a 30-day budget in ~2 days), and guarantee zero secret/PII leakage in telemetry. Beat every wallet competitor on money-path SLO rigor.

**Definition of done**
  - [ ] Any intent is traceable end-to-end by correlationId across API/runtime/chains
  - [ ] RED metrics expose p99 latency + error rate per route with bounded cardinality (route pattern only)
  - [ ] Redaction is allowlist-based and fails closed; a fuzz test finds no key/seed/PII in logs or traces
  - [ ] Money-path SLOs have multi-window burn-rate alerts wired to on-call; DLQ depth > 0 pages
  - [ ] Every problem+json error correlates to a trace/log by a shared id
  - [ ] Error-budget dashboards render burn rate + remaining budget from cumulative SLIs

**Doctrine hooks**
  - #1 Non-custodial + privacy: allowlist redaction fails closed — a key/seed/PII field is scrubbed unless explicitly allowlisted, so telemetry can never exfiltrate secrets
  - #3 Never fake data: honest RFC 9457 error surfaces and real SLI/SLO math — dashboards show true budget burn, not vanity green
  - #6 Deterministic + auditable: error-budget math is pure and tested (reliability.slo), and correlationId makes every risky decision traceable end-to-end


### Phase 7 — Infrastructure


#### P7.01 · Scalability
> 1k → 100M users without a rewrite — because the decision to scale is a bounded, pure function, not a hope.

The horizontal-scale doctrine made real: packages/scale decides desired replicas, routes, and shed-order as pure, deterministic, exhaustively-tested functions, while an injected actuator (HPA/KEDA/cluster API) is the only thing that acts. Every tier is horizontal and regionally isolated; consistency is chosen per-domain (strong for money/authz, eventual for the 100:1 read path) so the write path stays small and serialized while reads fan out on caches and replicas. A bug can propose a bad number, but three bounds make a scale-storm, a scale-to-zero, or a brown-out structurally impossible.

**Owns**
  - The multi-signal autoscaler (decideScale): max-wins across CPU/mem/queue/p95/RPS/in-flight/chain-congestion, clamped to [min,max], rate-limited step (up fast, down slow), anti-flap stabilization + cooldown
  - The resilience toolkit: token-bucket rate limiter, concurrency bulkhead (reject = backpressure), generic circuit breaker (half-open), backoff+retry with terminal/deadline classifier, priority load-shedder (critical never shed)
  - The per-domain consistency contract — which state is strong (execution/settlement/nonces/idempotency/policy) vs eventual (portfolio/balances/prices/analytics), enforced at the data layer
  - The stateless-service invariant: no sticky sessions, no in-memory global state, no shared component whose loss stops the world
  - The scaling roadmap: the documented what-breaks-at-each-10x ladder (PG write head → hash partitions; Redis Streams lag → Kafka; single execution writer → home_region sharding)
  - The decide-vs-act seam: ScalingController reconciles desired vs real and records the action (starting cooldown) only when the actuator confirms, so a stuck actuator is retried not silently locked out

**Depends on:** Kubernetes, Database, Event Bus, Cache, Multi-region, SRE

**Interfaces**
  - `decideScale(input, policy, state, now) → ScalingDecision (packages/scale/autoscaler.ts)`
  - `ScaleActuator port → HPA / KEDA ScaledObject / Karpenter`
  - `Resilience primitives: RateLimiter, Bulkhead, CircuitBreaker, retry(), shed() (packages/scale)`
  - `ScalingPolicy (min/max/step/cooldown/tolerance) as config-as-data`
  - `The per-domain consistency table as the contract other modules code against`

**Quality bar:** Sustains billions of API req/mo and millions of chain txns at <100 ms regional read latency with cost/user that FALLS as scale rises — the Coinbase/Robinhood scale envelope with Stripe's determinism, and none of the oscillation a naive HPA-default (the option we explicitly reject) exhibits. 27+ property tests prove max-wins, clamp+step, anti-flap, burst≤capacity, and critical-never-shed.

**Definition of done**
  - [ ] Autoscaler + full resilience toolkit shipped as pure functions; every bound has a test proving scale-storm, scale-to-zero, and flap are impossible
  - [ ] Load test to 10x current peak shows linear horizontal scaling with no single bottleneck surfacing before the documented ladder step
  - [ ] Every service is verified stateless (kill any pod mid-request → no correctness loss); no sticky sessions in any config
  - [ ] Consistency-per-domain enforced: money/authz reads are never served from a replica; a chaos test proves a stale replica cannot double-spend
  - [ ] The 10x roadmap ladder is live in the runbook with the prepared fix pre-staged (partitions defined, Kafka adapter ready, home_region column populated)

**Doctrine hooks**
  - Doctrine #2 (AI proposes / code verifies / device disposes) generalized to infra: the engine DECIDES, the actuator ACTS — a scale bug cannot move a pod
  - Doctrine #4 (guards fail closed) via bounded-by-design: clamp/step/anti-flap make a brown-out impossible
  - Doctrine #1 (non-custodial): keys never leave the device, so worst-case regional loss is a liveness event, never loss of funds — scale failure can degrade but never lose money
  - Doctrine #3 (never fake): critical traffic (in-flight settlement) is never shed; degradation is honest, not a silent drop


#### P7.02 · Kubernetes
> EKS as the money plane: signed images only, default-deny mesh, money-path preempts batch — the cluster that cannot run an unsigned bit.

The orchestration substrate for the modular monolith and its extract-when-load-demands services. EKS across 3 AZs/region, cluster-per-env with the admin plane fully isolated; Karpenter right-sizes nodes, KEDA scales workers on Kafka consumer lag (not just CPU), HPA on p95/CPU, ArgoCD is the only writer of cluster state. Security is structural: cosign-verified admission, IRSA (zero static creds), default-deny NetworkPolicies, non-root read-only-rootfs pods, and a money-path priorityClass that preempts every batch workload.

**Owns**
  - The EKS topology: 3 AZs/region, cluster-per-env (dev/staging/prod-use1/prod-euw1), admin plane in its own small isolated cluster
  - Node pools: general (m7g/Graviton), mem-opt (r7g for indexers), spot (batch only — never the money path)
  - Autoscaling wiring: Karpenter (nodes), KEDA (Kafka-lag ScaledObjects for Execution/Portfolio/Notification workers), HPA (latency/CPU) — the actuators for packages/scale decisions
  - Workload hardening: securityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL caps), PodDisruptionBudgets on everything, topology-spread across AZs, money-path priorityClass
  - Supply-chain admission: cosign signature verification at admission; :latest banned; images tagged by git SHA only; SBOM (syft) + grype scan gate
  - The GitOps contract: infra/k8s (kustomize + ArgoCD) is the sole source of truth; a human kubectl apply is alert-worthy and auto-reverted

**Depends on:** Scalability, SRE, Multi-region, Disaster Recovery

**Interfaces**
  - `infra/k8s/base kustomization (namespace, api.deployment, api.service) + per-env overlays`
  - `Liveness /healthz + readiness /readyz probe contract (services/api/src/routes/health.ts)`
  - `KEDA ScaledObject (Kafka lag), HPA (p95), Karpenter NodePool CRDs`
  - `cosign admission policy + External Secrets Operator secretRef: api-secrets (ADR-0023)`
  - `Default-deny NetworkPolicy per namespace + IRSA role annotations`

**Quality bar:** A cluster where an unsigned or :latest image cannot start, a compromised batch pod cannot reach the execution namespace or a DB, and money-path pods never lose a scheduling race — Kubernetes operated to the bar Stripe/Coinbase hold for a regulated money plane, not a generic web app.

**Definition of done**
  - [ ] Admission controller rejects any image lacking a valid cosign signature (proven by a red-team push of an unsigned image)
  - [ ] Default-deny NetworkPolicies verified: a pod in chain/spot cannot open a socket to execution or Aurora
  - [ ] Every workload has requests/limits, a PDB, topology-spread, non-root + read-only rootfs; CI fails a manifest missing any
  - [ ] KEDA scales a worker on synthetic Kafka lag and Karpenter provisions/reclaims a node under load — both observed end-to-end
  - [ ] ArgoCD is the only path to change: a manual kubectl edit fires an alert and is auto-reverted by drift detection

**Doctrine hooks**
  - Doctrine #1/#2: the money plane is isolated and preemptive; batch can never starve or reach an execution/signing path
  - Doctrine #2 (decide-not-act): K8s primitives (HPA/KEDA/Karpenter) are the ACTUATORS for packages/scale — they execute bounded decisions, never originate them
  - Doctrine #4 (fail closed): an unsigned image is refused at admission; a manifest missing hardening is refused by CI


#### P7.03 · Database
> PostgreSQL/Aurora as the system of record where money is numeric(78,0), execution is single-writer-region, and the outbox makes a bus-vs-DB drift impossible.

The ACID system of record for intents, plans, executions, and the append-only audit log. PostgreSQL 16 on Aurora (Global Database for cross-region read replicas), Drizzle forward-only migrations (expand→migrate→contract for zero downtime), and money stored ONLY as numeric(78,0) base units — floats banned by lint + CI grep. Correctness features are non-negotiable: row-level security per identity, per-module scoped roles (no superuser in app paths), the transactional outbox (event + state in one txn) so the bus can never diverge from the DB, and partitioning designed in from day one.

**Owns**
  - The schema + Drizzle forward-only migrations for the core entities (users/identities/intents/plans/plan_steps/executions/execution_steps/recovery_actions/balances/audit_log/…)
  - The money-type invariant: numeric(78,0) base units everywhere (fits uint256); floats rejected by lint + CI grep; display conversion is client-side only
  - Partitioning: range-by-month for intents/plans/executions/execution_steps/notifications/audit_log; hash-by-identity_id for balances (16 → 64)
  - Access control: RLS on identity_id for user-facing roles, per-module scoped roles, an append-only role for audit_log, no superuser in app paths
  - The transactional outbox: domain write + event row in one PG txn, drained to the bus — the anti-dual-write guarantee
  - Connection + scale path: PgBouncer pooling, read replicas, Aurora Global; PostgresPlanStore (services/api/src/persistence/plan-store.ts) as the production seam over IW_DB_URL

**Depends on:** Multi-region, Event Bus, Cache, SRE

**Interfaces**
  - `Drizzle schema + forward-only migration set (expand→migrate→contract; every PR carries a rollback note)`
  - `PlanStore port with PostgresPlanStore impl (pg; pg-mem in tests)`
  - `The transactional-outbox write contract (state + event atomic in one txn)`
  - `RLS policies + per-module role grants as SQL-as-code`
  - `/readyz DB probe; PITR + partition DDL as the operational surface`

**Quality bar:** Zero-downtime schema evolution and zero money-rounding-error at 100M identities and 7-year financial-record retention — the ledger integrity Stripe holds, not the eventually-consistent hand-waving a NoSQL wallet backend accepts. A stale read can never double-spend because execution/nonce state is strong and single-writer-region.

**Definition of done**
  - [ ] Money is numeric(78,0) end-to-end; CI grep + lint fail on any float in a money path; a known-answer test proves no rounding across a full plan
  - [ ] Every user-facing query is RLS-scoped; a cross-identity read is denied even with a valid session (test-proven)
  - [ ] The outbox is atomic: a crash between the state write and the event publish leaves no divergence (chaos test kills the process mid-txn)
  - [ ] Partitions exist for all listed tables; a month rollover and a partition prune run without downtime
  - [ ] An expand→migrate→contract migration ships against live traffic with zero errored requests, rollback note present
  - [ ] The monthly automated PITR restore drill passes with verified checksums (RPO ≤ 5 min)

**Doctrine hooks**
  - Doctrine #4 (money is integer bigint): numeric(78,0) base units, floats banned — the DB is where this is physically enforced
  - Doctrine #2 + strong consistency: execution/nonce/idempotency are single-writer-region and strong, so signature-disposed money movement is never raced
  - Doctrine #3 (never fake): the append-only hash-chained audit_log means a confirmed row corresponds to on-chain reality, never a hopeful write
  - Doctrine #6 (auditable): RLS + scoped roles + append-only audit make every risky mutation attributable


#### P7.04 · Event Bus
> One versioned, ordered, replayable log — Redis Streams today, Kafka MSK at scale, and services never know it changed.

The asynchronous contract between modules. Start on Redis Streams (Stage A — we already run Redis, ops ≈ 0) and migrate to Kafka MSK when volume/retention demand it, with packages/events as the abstraction so the swap is an adapter change + topic backfill, not a service rewrite. Every event rides a versioned envelope (id for idempotent dedup, correlationId for tracing, a fixed partition key for total per-entity ordering), and the transactional outbox guarantees the log never diverges from the DB.

**Owns**
  - The topic registry + partition-key semantics (packages/events/topics.ts): chain.events / intent.lifecycle / execution.steps / risk.flags / price.ticks / gas.conditions / notify.outbox / identity.registered / analytics.raw — each versioned, each key fixed
  - The event envelope (packages/events/envelope.ts): Zod-validated id/type/occurredAt/key/correlationId + per-type payload schema
  - Consumer idempotency: dedupe on envelope id via seen:{group}:{eventId} (redis-dedupe, noeviction, 7d)
  - The bus-abstraction seam that makes Redis Streams → Kafka MSK an adapter swap; MirrorMaker 2 for cross-region money-topic mirroring at Stage C
  - DLQ + money-path alerting: MONEY_PATH_TOPICS (execution.steps, chain.events) whose DLQ depth > 0 pages on-call
  - Retention + partition policy per topic (execution.steps 90d money path, price.ticks 1d, identity.registered compacted); partitions start 12 (money) / 24 (chain.events), scale by lag

**Depends on:** Cache, Database, Multi-region, SRE

**Interfaces**
  - `TOPICS + TOPIC_KEY + MONEY_PATH_TOPICS registries (packages/events)`
  - `EventEnvelopeSchema + per-type payload schemas (Zod)`
  - `The producer outbox contract + idempotent-consumer API (dedupe on id)`
  - `Bus adapter port (Redis Streams impl ↔ Kafka MSK impl)`
  - `DLQ + MirrorMaker 2 mirroring config for money topics`

**Quality bar:** Carries 50k+ events/s with total per-entity ordering and exactly-once EFFECT (idempotent consumers) — the durable, replayable log Kafka is famous for, delivered at Stage A cost with the migration de-risked to an adapter swap. No money event is ever silently lost: a money-path DLQ > 0 pages before a user notices.

**Definition of done**
  - [ ] No topic string is hardcoded anywhere — every producer/consumer imports from packages/events (CI-enforced grep)
  - [ ] Every consumer is idempotent on envelope id; replaying the same event twice produces exactly one effect (test-proven)
  - [ ] The outbox → bus path is proven driftless under a mid-publish crash
  - [ ] A Redis-Streams → Kafka adapter swap runs in staging with zero service-code change and a verified topic backfill
  - [ ] Money-path DLQ depth > 0 fires a page within the SLO; a poisoned message lands in the DLQ, not an infinite retry loop
  - [ ] Per-entity ordering verified: events for one execution_id are consumed in produce order across a partition rebalance

**Doctrine hooks**
  - Doctrine #3 (never fake / honest): the outbox forbids told-the-bus-but-not-the-DB; a money event cannot be silently dropped (DLQ pages)
  - Doctrine #6 (deterministic + auditable): correlationId threads every hop; the log is replayable, so projections are reconstructable
  - Doctrine #4 (fail closed): idempotent-on-id consumers + DLQ terminal handling mean a bad event degrades, never double-executes


#### P7.05 · Cache
> Five Redis roles that never share a byte — because a hot portfolio read must never evict a session revocation or a dedupe set.

The read-path accelerator for a 100:1 read:write system, plus the home of rate-limit counters, session revocations, consumer-dedup sets, and (Stage A) the event bus — all role-separated so no workload can hurt another. redis-cache (LRU) serves portfolio/token/route reads; redis-rt and redis-dedupe run noeviction so security-relevant state (revocations, idempotency) is never silently dropped. Invalidation — the hard part — is a deterministic dependency-cascade plan from packages/scale, and stampedes are killed with singleflight locks.

**Owns**
  - The five role-separated instance groups: cache (LRU), rt (noeviction), prices (LRU + pub/sub), dedupe (noeviction), streams (Stage A bus) — never one shared Redis
  - The key registry + TTL/eviction policy per family (packages/events/redis-keys.ts): pf 60s, tok 24h, rt-quote 30s, px 60s, rl bounded, rev token-TTL, seen 7d, lock 2s
  - The deterministic cache-invalidation cascade (packages/scale/cache.ts): namespace dependsOn graph → BFS over reverse edges, cycle-safe, returns a PLAN an injected invalidator applies
  - Stampede control: singleflight locks (lock:{key}, 2s) so a cold key is recomputed once, not N times
  - The correctness guarantees: noeviction on rt/dedupe (a revocation/idempotency key is never LRU-dropped); no key without a TTL except bounded families
  - The cache-aside fail-soft discipline: a backing-store miss/failure returns an honest null, never a cached $0

**Depends on:** Database, Event Bus, Scalability, Multi-region

**Interfaces**
  - `redisKeys builders + REDIS_KEY_SPEC (group + TTL) (packages/events)`
  - `planInvalidation(event, namespaces) → InvalidationPlan + an injected invalidator (packages/scale)`
  - `The five named instance-group endpoints (cache/rt/prices/dedupe/streams)`
  - `The singleflight lock:{key} primitive`
  - `pub/sub fan-out from redis-prices → WS gateway`

**Quality bar:** Sub-millisecond reads at a >90% hit rate on the portfolio/price path while GUARANTEEING a session revocation or idempotency key is never evicted — the correctness-first caching a wallet demands, where a stale or wrong cache read is a security bug, not a UX blemish (the bar Rabby/Phantom quietly miss when they flash a phantom balance).

**Definition of done**
  - [ ] Roles are physically separate instance groups; a synthetic hot-cache flood cannot evict a rev: or seen: key (noeviction proven)
  - [ ] Every key is created through a redisKeys builder with a documented TTL/group; ad-hoc string keys fail CI grep
  - [ ] The invalidation cascade is cycle-safe and complete: a balance write invalidates portfolio and everything transitively reading it, and a mis-declared cycle still yields a finite plan (test-proven)
  - [ ] A stampede test (N concurrent cold reads) results in one origin recompute via singleflight
  - [ ] A cache/backing-store failure yields an honest null read, never a cached $0 (fail-soft doctrine test)

**Doctrine hooks**
  - Doctrine #3 (network failure ≠ $0): the cache-aside path fails soft to null, never a fabricated zero — the balances-honesty rule lives here
  - Doctrine #2 (decide-not-act): invalidation computes a PLAN; an injected invalidator applies it, so a bug over/under-invalidates but cannot wedge the tier
  - Doctrine #4 (fail closed): rt/dedupe noeviction — security state is never silently lost under memory pressure


#### P7.06 · Multi-region
> Active-active reads everywhere, single-writer-region execution per identity — a region is a blast-radius boundary money never crosses.

The geographic topology that delivers <100 ms reads globally and survives the loss of an entire region. The read path (portfolio, prices, parse) is active-active behind Route 53 latency+health routing and Global Accelerator; execution is single-writer-region per identity (identities.home_region) so sagas never split across regions and money is never raced. Aurora Global replicates storage sub-second, MirrorMaker 2 mirrors money topics, and region evacuation is a drilled home_region cohort flip after failover — not an improvised scramble.

**Owns**
  - The topology: 3+ regions, each a full independent stack; Route 53 GeoDNS + health checks; Global Accelerator (Anycast) for API/WS; CloudFront for static
  - The read/write split: active-active reads served locally; writes/execution pinned to identities.home_region; other regions read a replica
  - The deterministic region router (packages/scale/region.ts): active-active weighted / active-passive failover; never routes to an unhealthy region; returns primary: null when all are down so the caller fails safe
  - Cross-region data movement: Aurora Global storage replication (sub-second), MirrorMaker 2 for money topics, S3 cross-region replication
  - Region isolation as a blast-radius boundary: one region's overload, bad deploy, or provider outage never crosses
  - The evacuation runbook: flip the home_region cohort after Aurora failover (RPO ≤ 5s DB / ≤ 60s bus), drill-verified

**Depends on:** Database, Event Bus, Cache, Scalability, Kubernetes, Disaster Recovery

**Interfaces**
  - `route(regions, mode, requestedRegion) → RoutingDecision (packages/scale/region.ts)`
  - `identities.home_region as the execution-ownership key`
  - `Route 53 latency/health routing + Global Accelerator endpoints`
  - `Aurora Global + MirrorMaker 2 replication topology`
  - `The region-evacuation runbook (home_region cohort flip)`

**Quality bar:** <100 ms regional read latency, zero single point of failure, and a full-region loss that costs seconds for reads and RTO ≤ 30 min for execution at RPO ≤ 5 s — the multi-region posture of Stripe/Cloudflare, where no single region's failure is ever a global outage or a lost transaction.

**Definition of done**
  - [ ] Reads are served active-active from the nearest healthy region (<100 ms) with GeoDNS health-based failover proven in a game day
  - [ ] Execution ownership is provably single-writer-region: a cross-region write for a pinned identity is rejected (no split-brain saga)
  - [ ] route() returns primary: null when every region is unhealthy and the caller fails safe (test-proven), never routing to a dead region
  - [ ] A quarterly region-evacuation game day meets RTO ≤ 30 min / RPO ≤ 5 s via the home_region cohort flip
  - [ ] A region is a verified blast-radius boundary: an injected bad deploy in one region does not degrade another

**Doctrine hooks**
  - Doctrine #1 (non-custodial): keys live on the device, so a lost region is a liveness event, never loss of funds
  - Doctrine #3 (never fake): route() never invents a live primary from dead regions; a down region is reported down, not silently served
  - Doctrine #2 + strong consistency: single-writer-region execution keeps money movement serialized and unraceable across geography


#### P7.07 · CDN
> CloudFront for immutable bytes, never for a balance — on a wallet, correctness beats cache-hit-rate every time.

The edge layer that serves the web app, extension updates, token logos, and docs from immutable, content-hashed assets at the nearest PoP, while deliberately NOT caching API responses that could go stale into a lie. The only cached dynamic reads are GET /v1/prices (5s public TTL) and the token registry (60s) — everything user- or money-specific is served fresh. WAF managed rules + bot control + IP reputation sit at the edge as the first line of volumetric/DDoS defense.

**Owns**
  - Static distribution: web app + extension updates as immutable content-hashed assets (long TTL, safe because content-addressed), plus docs
  - Token logos/metadata: 24h TTL with soft-purge on registry update
  - The explicit API-caching allowlist: only GET /v1/prices (5s) and token registry (60s) are CDN-cached; all identity/balance/execution responses are no-store
  - Edge security: WAF managed rules, bot control, IP reputation as the volumetric/DDoS front door; TLS termination at the edge
  - Cache-key + invalidation hygiene: hashed asset names make deploys atomic; soft-purge for logos; no Vary traps that leak across users
  - The correctness guardrail: a policy/CI check that no authenticated or money-bearing response is ever marked cacheable

**Depends on:** Multi-region, Cache, SRE

**Interfaces**
  - `CloudFront distribution + cache-behavior policy (per-path TTL + no-store rules)`
  - `The API-cache allowlist (/v1/prices 5s, token registry 60s) as config`
  - `WAF rule set + bot-control + IP-reputation bindings`
  - `Content-hashed asset manifest + soft-purge hook`
  - `The Cache-Control / Surrogate-Control header contract enforced in the API`

**Quality bar:** Vercel-class static delivery (global PoPs, atomic immutable deploys, instant rollback) with a hard rule Vercel doesn't have to make — a wallet's authenticated responses are NEVER edge-cached, so a user can never see another's balance or a stale confirmed. Cache hit-rate is subordinate to correctness.

**Definition of done**
  - [ ] Web/extension assets are content-hashed and immutably cached; a deploy is atomic and instantly rollback-able
  - [ ] A CI/policy gate proves no authenticated or money-bearing endpoint carries a cacheable Cache-Control (fails the build if one does)
  - [ ] Only /v1/prices (5s) and token registry (60s) are edge-cached; a fuzz test confirms no identity response is ever served from cache
  - [ ] WAF blocks a synthetic volumetric flood and a bot-signature scrape at the edge before origin
  - [ ] Token-logo soft-purge propagates within TTL without a full invalidation

**Doctrine hooks**
  - Doctrine #3 (never fake / honest state): authenticated + money responses are never edge-cached — no stale confirmed, no cross-user leak
  - Privacy: no personal/identity data in a cache key or URL; the allowlist is public-tier data only
  - Doctrine #4 (fail closed): the default is no-store; a response is cacheable only by explicit allowlist, never by omission


#### P7.08 · SRE
> Error budgets and bounded self-healing that fix the safe cases automatically and escalate the rest — a brain that decides but can never act blind.

The reliability nervous system: OpenTelemetry → Prometheus/Tempo/Loki telemetry feeding packages/reliability, the deterministic SRE brain that turns SLIs into error-budget burn, fires multi-window burn-rate alerts (dedup + cooldown), and produces bounded self-healing decisions. It DECIDES; an injected actuator ACTS — so a bug can propose a bad action but can never restart-loop, scale-storm, or auto-heal a security incident. Safety is structural: a change-freeze halts automation, a security incident is contained AND escalated (never silently healed), and repeated failures converge on a human instead of looping.

**Owns**
  - The telemetry pipeline: OTel instrumentation (trace + correlation id on every hop) → Prometheus/Tempo/Loki; the RED-metric /metrics endpoint (services/api/src/plugins/metrics.ts) with bounded cardinality on route pattern
  - Error-budget math (slo.ts): burn rate = failureRate / allowedRate; budgetRemaining; the signal alerting keys off (14.4x ≈ a 30-day budget gone in ~2 days)
  - Health folding (health.ts): burn + p99 + saturation → a worsen-only state; unknown on no traffic (never healthy on no data)
  - The alert catalog (alerts.ts): FAST_BUDGET_BURN (page, ≥14.4x), SLOW_BUDGET_BURN (ticket, ≥3x), SERVICE_CRITICAL, HIGH_SATURATION — with dedup + cooldown
  - Bounded self-healing (healing.ts): failure→action map within freeze / security-escalate / rate-limit / cooldown / max-auto-recovery bounds; SelfHealingController.tick converges on escalation instead of looping
  - Runbooks-as-data (runbooks.ts) + SLO-gated progressive delivery (Argo Rollouts canary 5%→50%→100%, auto-rollback on burn)

**Depends on:** Scalability, Kubernetes, Event Bus, Disaster Recovery

**Interfaces**
  - `computeErrorBudget(sli, slo), computeHealth(sli, slo, thresholds) (packages/reliability)`
  - `decideRecovery(signal, state, now, config) → RecoveryDecision + SelfHealingController.tick`
  - `Injected Actuator / Pager / IncidentSink ports`
  - `Prometheus /metrics RED endpoint + OTel trace/correlation propagation`
  - `RUNBOOKS data + Argo Rollouts SLO-gate + /healthz, /readyz`

**Quality bar:** 99.99% availability with sub-second detection at millions of events/min, where safe failures self-heal in seconds and no auto-action can ever make an outage worse — the Google-SRE error-budget discipline plus a decide-not-act guarantee stronger than most FAANG auto-remediation (which can, and does, restart-loop).

**Definition of done**
  - [ ] Every service emits RED metrics + OTel traces with a correlation id threaded end-to-end; p99/burn are dashboarded per service
  - [ ] Multi-window burn-rate alerts fire deterministically (injected clock) with dedup + cooldown; a burn test pages exactly once
  - [ ] Self-healing is provably bounded: tests cover freeze→none, security→circuit-break+escalate, rate-limit→escalate, and no-loop-after-N
  - [ ] A security incident is contained AND escalated, never silently auto-healed (test + game day)
  - [ ] An Argo Rollouts canary auto-rolls-back on an SLO burn during a bad deploy (game-day verified)
  - [ ] Every alert code maps to a runbook-as-data rendered next to the alert

**Doctrine hooks**
  - Doctrine #2 (decide / act / dispose) applied to ops: the brain DECIDES, the actuator ACTS — the engine holds no actuation power
  - Doctrine #3 (never fake): health is unknown on no traffic — we never claim healthy on no data
  - Doctrine #6 (deterministic + auditable): injected time makes every recovery decision reproducible and postmortem-able
  - Security: incidents are contained + escalated, never auto-healed (which would destroy evidence or mask an attack)


#### P7.09 · Disaster Recovery
> Every failure mode has a mechanism, a target, and a drilled runbook — because at 100M users, DR you haven't rehearsed is DR you don't have.

The provable ability to survive AZ loss, region loss, Postgres corruption, Kafka loss, chain-data loss, and vendor loss — each with a stated mechanism, RTO/RPO target, and a rehearsed runbook. Multi-AZ makes AZ loss a non-event; active-active makes read-region loss seconds; Aurora Global failover + a home_region flip makes execution-region loss RTO ≤ 30 min / RPO ≤ 5 s; PITR + a MONTHLY automated restore drill bounds corruption to ≤ 5 min. Because keys never leave the device, the worst case is always a liveness event, never loss of funds.

**Owns**
  - The DR matrix: scenario → mechanism → target (AZ loss: multi-AZ / zero impact; region-read loss: active-active / seconds; region-execution loss: Aurora Global + home_region flip / RTO≤30m RPO≤5s; PG corruption: PITR 5-min / RPO≤5m; Kafka loss: mirrored + rebuildable / ≤4h; chain-data loss: S3 replay / ≤24h/chain; vendor loss: ProviderPool failover / degradation)
  - Backups: Aurora PITR (5-min granularity) + a monthly automated restore drill with verified checksums; S3 cross-region replication; object-lock/WORM on audit anchors
  - Rebuild playbooks: projections (balances/portfolio) rebuildable from PG + iw-chain-archive; the audit log anchored daily (WORM) so integrity survives a store loss
  - The escrowed backup path: client-encrypted iw-backups blobs (SSE-KMS, versioned, object-lock 30d, per-identity prefix IAM) — recovery data we hold but cannot read
  - Quarterly game days: region evacuation, Kafka rebuild, RPC-vendor brownout, LLM outage — each exercised, timed, and postmortem'd
  - The availability-math contract: 99.9% Y1 error budget (43 min/mo) with burn-rate alerts driving the DR triggers

**Depends on:** Multi-region, Database, Event Bus, SRE

**Interfaces**
  - `The DR runbook matrix (scenario → mechanism → RTO/RPO) as operational data`
  - `Aurora PITR + monthly restore-drill automation`
  - `Projection-rebuild playbooks (PG + iw-chain-archive replay)`
  - `S3 buckets: iw-backups (WORM 30d), iw-audit-anchors (WORM/compliance), iw-chain-archive (Glacier lifecycle)`
  - `The quarterly game-day plan + the client-encrypted backup-blob escrow contract`

**Quality bar:** A drill-verified RTO ≤ 30 min / RPO ≤ 5 s for the money path and a rebuildable-from-source guarantee for every projection — DR held to the regulated-fintech (Stripe-grade) bar, where recovery targets are proven by rehearsal every quarter, not asserted in a wiki nobody has run.

**Definition of done**
  - [ ] The full DR matrix exists with a mechanism + target + runbook for every listed scenario
  - [ ] The monthly automated PITR restore drill passes unattended with verified checksums (RPO ≤ 5 min)
  - [ ] A quarterly region-evacuation game day meets RTO ≤ 30 min / RPO ≤ 5 s
  - [ ] Projections are proven rebuildable: a wiped balances table is reconstructed from PG + chain archive within the ≤4h/≤24h playbook
  - [ ] Audit-log integrity survives a store loss via daily WORM anchors (hash-verified)
  - [ ] Backup blobs are client-encrypted and unreadable by us; a restore proves the device (not the server) is the only decryptor

**Doctrine hooks**
  - Doctrine #1 (non-custodial): keys never leave the device → every disaster is a liveness event, never loss of funds; escrowed backups are client-encrypted (we hold, we can't read)
  - Doctrine #3 (never fake): a recovered system is checksum-verified against source; audit anchors are WORM, so history cannot be silently rewritten
  - Doctrine #6 (auditable + drilled): targets are proven by rehearsal, not asserted; each game day is postmortem'd


#### P7.10 · Performance
> Latency budgets and cost-per-unit as first-class SLOs — sub-second everywhere, and cost/user that falls as scale rises.

The discipline that makes the wallet feel instant and stay cheap at 100M users. Every path has a latency budget (<100 ms regional reads, sub-second monitoring, p95/p99 gates in CI and canary), and cost is treated as an SLO on the same dashboard: LLM $/parse and RPC $/DAU are watched weekly from day one, driven down by a documented ladder (deterministic pre-parser hit-rate → prompt caching → model routing → per-user budgets → distillation) and the RPC self-host crossover. Backpressure (bulkhead) and priority load-shedding keep tail latency bounded under overload instead of collapsing.

**Owns**
  - Latency budgets + measurement: the Prometheus histogram buckets (5ms→5s), p95/p99 per route, the <100 ms regional-read and sub-second targets; CI + canary latency gates
  - The LLM cost ladder: deterministic pre-parser hit-rate (40%→60%, each point ≈1% off the bill), prompt caching, haiku-first model routing, per-user daily budgets with forms fallback, distillation gate at ≥100k parses/day
  - The RPC self-host crossover: self-host top-4 EVM + SOL behind the ProviderPool with vendors as overflow (crossover ≈300–500M req/chain/mo)
  - Tail-latency control under load: concurrency bulkhead (reject = backpressure), priority load-shedding (critical never shed), circuit breakers on slow dependencies
  - FinOps-as-SLO: cost per DAU / parse / execution / indexed-event on the money dashboard next to SLOs; Graviton by default, spot for non-money workloads; Terraform tag-or-fail cost attribution
  - Efficiency invariants: BigInt money math (no float overhead surprises), bounded metric cardinality, prompt-caching + deterministic fast-path so >50% of LLM calls are avoided

**Depends on:** Scalability, SRE, Cache, Database, CDN, Multi-region

**Interfaces**
  - `The per-route latency SLO + Prometheus histogram (buckets) + p95/p99 dashboards`
  - `The LLM cost-control ladder (pre-parser hit-rate, prompt cache, model router, budgets, distillation gate)`
  - `The ProviderPool self-host/overflow priority ordering (packages/chains)`
  - `Bulkhead + load-shedder tuning (packages/scale) as the tail-latency guard`
  - `The FinOps cost-per-unit dashboard + the Terraform tagging gate`

**Quality bar:** Sub-second p95 on every user path and a cost/user that FALLS with scale (≈$0.055 → $0.012 per user from 1M → 100M) — the perceived speed of Linear/Apple Wallet on the front end and the unit-economics discipline of Stripe on the back end, with the two cost lines (LLM $/parse, RPC $/DAU) trending down weekly, not up.

**Definition of done**
  - [ ] Every user-facing route has a p95/p99 SLO enforced in CI + canary; a regression blocks the rollout
  - [ ] <100 ms regional read latency is met and dashboarded; a load test to 10x peak holds the budget
  - [ ] The deterministic pre-parser hit-rate is measured and ≥40% (target 60%), with prompt caching + model routing live; >50% of LLM calls avoided
  - [ ] Cost per DAU / parse / execution is on the money dashboard as an SLO; untagged infra fails CI
  - [ ] Under a synthetic overload the bulkhead sheds by priority (critical protected) and tail latency stays bounded instead of collapsing
  - [ ] The RPC self-host crossover playbook is staged: the ProviderPool priority-orders self-host over vendor overflow

**Doctrine hooks**
  - Doctrine #4 (money is integer bigint): BigInt math is exact and predictable — no float perf/precision surprises on the money path
  - Doctrine #5 (Apple-grade craft): sub-second, prefers-reduced-motion-aware responsiveness is a product requirement, measured as an SLO
  - Doctrine #6 (fast-path + schema-forced edges): the deterministic pre-parser avoids >50% of LLM calls — cheaper AND more deterministic
  - Doctrine #3 (never fake): under overload, critical (in-flight settlement) is protected and degradation is honest, never a silent drop or a fake success


### Phase 8 — Business


#### P8.01 · Pricing
> The single source of truth for what everything costs — a deterministic, versioned pricing kernel every fee flows through.

A pure, versioned pricing engine that turns a (product, usage, tier, geo, promo) tuple into an exact integer minor-unit charge or an execution-spread in bps — the one place a price is ever computed. AI and Growth may PROPOSE discounts and experiments, but only the pricing kernel's deterministic evaluation, replayable from an append-only price book, disposes the number shown in the quote before the device signs. World-class is Stripe Billing's pricing expressiveness combined with the on-chain-fee transparency Rabby and Phantom users expect.

**Owns**
  - The versioned Price Book — products, plans, tiers, usage meters, and execution-spread bps schedules as immutable, effective-dated records
  - Deterministic price evaluation: (usage + entitlements + promo + geo) → exact integer minor-unit line items and swap/bridge spread bps
  - Execution-spread computation across the 0.25–0.85% band (requirements §2.3) as integer bps, surfaced transparently in every quote before signature
  - Promo/discount/coupon evaluation as pure functions with stacking, precedence, and floor guards (never negative, never below floor)
  - Currency + FX display policy — integer minor units internally, decimal strings on the wire per the SDK contract
  - Price-experiment assignment seams (A/B price tests) that never mutate a bound user's price mid-session

**Depends on:** Billing, Growth Engine, Settlement, SDK / Developer Platform

**Interfaces**
  - `quotePrice(request): PriceQuote — pure, deterministic, integer line items stamped with priceBookVersion`
  - `spreadBps(intent): bigint — execution spread for a routed swap/bridge in integer bps`
  - `PriceBook — effective-dated immutable records; priceBookVersion stamped on every quote`
  - `evaluatePromo(codes, context): PromoResult with precedence + floor enforcement`
  - `entitlementsFor(tier): Entitlements consumed by Billing and paywall gates`

**Quality bar:** Beat Stripe Billing's pricing model expressiveness (graduated/volume/package tiers + usage) while matching the on-chain-fee transparency of Rabby/Phantom: the exact fee is shown in the quote before the device signs, and every displayed price is reproducible forever from (priceBookVersion, inputs).

**Definition of done**
  - [ ] Every fee in the system (spread, gas margin, subscription, API usage, marketplace take) is computed only via the pricing kernel — grep finds no ad-hoc bps math elsewhere
  - [ ] Price evaluation is pure and property-tested: never negative, never below configured floor, deterministic for fixed (version, inputs)
  - [ ] The execution spread shown in the quote equals the spread charged at settlement, to the base unit
  - [ ] A historical charge replays exactly from its stamped priceBookVersion
  - [ ] Promo stacking/precedence has exhaustive adversarial tests (double-apply, expired, geo-mismatch)

**Doctrine hooks**
  - #2 AI-proposes/code-disposes: Growth may propose a discount, but the pricing kernel is the sole disposer of the quoted number — an experiment can never drop below the floor or mutate a bound session's price
  - #4 integer bigint: all prices and bps are integer minor units, applied via integer math with explicit rounding, failing closed on non-integer inputs
  - #3 never fake: the quoted spread is the settled spread — no estimate is ever shown as the final price


#### P8.02 · Marketplace Economy
> The take-rate and payout engine that turns the plugin, solver, and skill marketplaces into a fair, verifiable, non-custodial two-sided economy.

Owns the economics of every marketplace surface the platform already has — the Plugin Marketplace, the Solver Network's incentives, and third-party intent skills (requirements §2.3-5): take-rate schedules, developer/solver/creator revenue-share, payout accrual, and reputation-weighted rewards. It never custodies funds; payouts accrue as an append-only, replayable earnings ledger that settles on-chain to the earner's own address, mirroring how the Solver Network already computes savings-share rewards and slashes bad actors. World-class is Apple App Store economics on Stripe Connect-grade payout rails — but non-custodial and fully auditable.

**Owns**
  - Take-rate schedules per marketplace surface (plugins, solver network, skills) sourced as versioned pricing-kernel inputs
  - Developer/solver/creator revenue-share accrual as a per-earner append-only earnings ledger in integer minor units
  - Payout eligibility plus holdback/clawback rules (fraud, chargeback, slash), all failing closed
  - Reputation/quality-weighted reward multipliers consuming Solver reputation and Plugin ratings, capped and un-gameable
  - Non-custodial payout instruction generation that settles to the earner's own on-chain address — the platform never holds the balance
  - Marketplace economic transparency so every earner can reconstruct exactly why they earned what

**Depends on:** Pricing, Settlement, Billing, Business Intelligence

**Interfaces**
  - `accrueEarning(event): EarningEntry appended to a per-earner immutable ledger`
  - `takeRate(surface, context): bigint bps, sourced from the pricing kernel`
  - `payoutStatement(earnerId, period): Statement replayable from the earnings ledger`
  - `eligiblePayouts(period): PayoutInstruction[] targeting earner-owned addresses only (no custody)`
  - `Consumes SolverReputation + PluginRatingSummary; emits slash/clawback events`

**Quality bar:** Match Stripe Connect's payout clarity and Apple's marketplace scale, but beat both on trust: every payout line is cryptographically traceable to the on-chain event that earned it, and the platform provably never held the earner's funds — unlike any custodial exchange marketplace.

**Definition of done**
  - [ ] The earnings ledger is append-only and replayable; a payout statement reproduces deterministically from ledger entries
  - [ ] Take-rates come only from the pricing kernel (P8.01) — no hardcoded shares exist
  - [ ] Holdback/clawback/slash paths are property-tested and fail closed (never over-pay)
  - [ ] Reputation weighting cannot be gamed past the configured max multiplier (adversarial tests)
  - [ ] Payout instructions target earner-owned addresses only; a custody attempt is structurally impossible and tested

**Doctrine hooks**
  - #1 non-custodial: payouts settle to the earner's own address — the economy accrues a ledger and instructs, it never holds a marketplace float
  - #2 verify-not-trust: mirrors the Solver Network — rewards are computed from independently verified on-chain outcomes, never a solver's or developer's claimed value
  - #4 + #3: integer accrual with fail-closed clawbacks, and no projected earning is ever shown as paid


#### P8.03 · Growth Engine
> The activation and retention loop machine — lifecycle experiments that nudge, never charge, and never fake a number.

Owns the acquisition→activation→retention→resurrection loops: onboarding funnels, feature-adoption nudges, lifecycle triggers, paywall/upsell placement, and the experimentation platform (A/B, holdouts, guardrail metrics) behind them. It is an edge system that PROPOSES interventions; the deterministic pricing, entitlement, and policy gates dispose whether anything actually changes for the user, so no experiment can weaken a security default or drop a price below floor. World-class is the growth rigor of Superhuman/Duolingo with the experiment discipline of Statsig/Amplitude, wired to the wallet's real activation events — first intent executed, first non-testnet settlement.

**Owns**
  - The lifecycle-stage model and trigger rules, where activation is defined as first real settlement (not first login)
  - The experimentation platform: sticky assignment, exposure logging, guardrail metrics, holdouts, and sequential-test statistics
  - In-product nudge/paywall/upsell placement seams that propose into the app shell and never bypass gates
  - North-star and input-metric definitions (activation, WAU→intent conversion, retention cohorts), honest and de-vanitized
  - Onboarding and feature-adoption funnels with drop-off instrumentation
  - Safety guardrails that auto-halt any experiment regressing a security or reliability metric

**Depends on:** Pricing, CRM, Business Intelligence, Referral System

**Interfaces**
  - `assign(userId, experiment): Variant — sticky, with logged exposure`
  - `nudgesFor(user, surface): Nudge[] — proposals only; the UI and gates decide`
  - `trackActivation(event) against the canonical lifecycle model`
  - `experimentReadout(id): Readout with guardrail and significance status`
  - `guardrailStatus(experiment): Halt | Ok — auto-halt on safety regression`

**Quality bar:** Beat the near-nonexistent lifecycle craft of MetaMask/Phantom and match Duolingo-grade activation loops — but every experiment carries a security/safety guardrail that Statsig-style platforms don't, and activation is measured on a real on-chain outcome, never a vanity click.

**Definition of done**
  - [ ] Activation is defined as a real (non-testnet) settlement and instrumented end to end
  - [ ] Experiments are sticky per user, exposure-logged, and carry pre-registered guardrails
  - [ ] No nudge or experiment can bypass the pricing floor, entitlement gate, or a security default (tested)
  - [ ] A safety-metric regression auto-halts the offending experiment
  - [ ] Every headline metric has a documented honest definition — no vanity counts, and a pipeline gap reads unknown not zero

**Doctrine hooks**
  - #2 propose/dispose: Growth proposes offers and nudges; the pricing/entitlement/policy gates dispose — a paywall experiment can never grant an entitlement or lower a floor
  - #3 never fake: activation and retention are measured on confirmed on-chain events; a pipeline gap is shown as unknown, never as churn or zero
  - #5 design/a11y: nudges honor prefers-reduced-motion and WCAG AA and never dark-pattern


#### P8.04 · Referral System
> A non-custodial, abuse-proof invite economy — rewards earned by real usage, verified on-chain, paid to the user's own keys.

Owns the referral and rewards loop: invite issuance, attribution, anti-abuse (self-referral/sybil/wash), reward accrual, and payout — all non-custodial. A reward is earned only when a referred user produces a real, independently verified on-chain outcome (a settled intent), never on signup, mirroring the Solver Network's verify-don't-trust stance and the Marketplace's accrual ledger. World-class is the Coinbase/Cash App referral pull without any of their sybil-farmable naivety, and rewards that pay to the user's own address because the wallet is non-custodial.

**Owns**
  - Invite link/code issuance with single-use/multi-use policy, effective-dated
  - A fraud-resistant, deterministic attribution model (first/last-touch) with explicit tie-breaking
  - An anti-abuse engine (self-referral, sybil clusters, wash-usage, device/geo signals) that fails closed to reward denial
  - Reward accrual into the shared earnings ledger (integer minor units), gated on verified real usage
  - Non-custodial reward payout instructions to the referrer/referee's own on-chain address
  - Referral program versioning and budget caps so the program can never overspend

**Depends on:** Marketplace Economy, Growth Engine, Pricing, Compliance

**Interfaces**
  - `issueInvite(userId, program): Invite`
  - `attribute(signupEvent): Attribution | null — deterministic and fraud-checked`
  - `qualifyReward(referral): Reward | Denied — gated on a verified on-chain settlement`
  - `abuseVerdict(referral): Allow | Deny — fails closed`
  - `Emits accrueEarning into the Marketplace earnings ledger with the program budget cap enforced`

**Quality bar:** Match Cash App/Coinbase referral conversion while beating them on integrity: rewards are un-sybil-farmable (verified real settlement plus cluster detection) and paid non-custodially to the user's own keys — a bar no exchange referral program meets.

**Definition of done**
  - [ ] No reward is earned before a referred user's first verified real settlement
  - [ ] Anti-abuse (self/sybil/wash) is property-tested and fails closed
  - [ ] Attribution is deterministic and reproducible from logged events
  - [ ] Program budget caps are enforced; overspend is structurally impossible
  - [ ] Payouts target user-owned addresses only, with KYC/geo eligibility respected via Compliance

**Doctrine hooks**
  - #1 non-custodial: rewards pay to the user's own address — the system accrues and instructs, never holds
  - #2 verify-not-trust: reward qualification requires an independently verified on-chain settlement; a claimed referral is not a paid referral
  - #4 fail-closed: abuse ambiguity denies the reward, accrual is integer, and caps are enforced


#### P8.05 · Billing
> The entitlement and invoicing spine — usage metering, subscriptions, and dunning exact to the base unit that never grant what wasn't paid.

Owns the money-collection lifecycle for premium tiers and the usage-priced Intent API (requirements §2.3-3,4): metering, subscription state, invoice generation, dunning, proration, and the entitlement gate every paywalled capability checks. It is the deterministic disposer between wanting a paid feature and getting access — failing closed, exact to integer minor units, and replayable like the Settlement ledger. World-class is Stripe Billing's metering and dunning correctness with the auditability of an append-only ledger.

**Owns**
  - The usage metering pipeline (Intent API calls, gas-abstraction volume, automations) producing idempotent integer usage records
  - The subscription state machine (trial→active→past_due→canceled) with proration and effective-dating
  - Invoice generation from the pricing kernel plus metered usage, written to an append-only replayable billing ledger
  - The entitlement gate canUse(feature, user) — the sole disposer of paywalled access, failing closed
  - Dunning, retry, and grace policy that never silently downgrades mid-session and keeps state honest
  - A revenue-events feed to the Finance Dashboard, recognized only on confirmed collection

**Depends on:** Pricing, CRM, Finance Dashboard, Compliance

**Interfaces**
  - `meter(usageEvent) — idempotent, integer, deduplicated`
  - `generateInvoice(account, period): Invoice from the pricing kernel + metered usage`
  - `canUse(feature, account): Allow | Deny — the entitlement gate, fails closed`
  - `subscriptionState(account): State plus lifecycle transitions`
  - `replay(account): InvoiceHistory over the append-only billing ledger`

**Quality bar:** Match Stripe Billing's metering and dunning correctness and beat typical Web3 (which has none): usage records are idempotent and integer-exact, entitlements fail closed, and an invoice is reproducible to the base unit from (priceBookVersion, metered usage) — no float, no double-charge.

**Definition of done**
  - [ ] Metering is idempotent and deduplicated — replayed events never double-count
  - [ ] The entitlement gate fails closed and is the only path to paywalled features (grep-verified)
  - [ ] Invoices reproduce exactly from the stamped priceBookVersion plus usage records
  - [ ] Dunning transitions are honest (no fake active while past_due) and reverse on payment
  - [ ] Revenue reaches Finance only as recognized on confirmed collection, never on invoice issuance

**Doctrine hooks**
  - #4 integer bigint: usage and invoice math are integer minor units, proration rounds explicitly, and non-integer inputs fail closed
  - #2 deterministic disposer: the entitlement gate is the pure gate between intent-to-pay and access — AI/Growth may propose an upsell, only Billing grants access
  - #3 never fake: subscription/entitlement state is honest — a metering outage shows unknown, never free access nor $0 revenue


#### P8.06 · CRM
> The single, consented, privacy-first customer record — one identity across wallet, API, and support, honest by construction.

Owns the unified customer/account model that stitches a person's wallet identity, API/enterprise account, subscriptions, support history, and lifecycle stage into one consented record — the substrate every other business module reads. It is privacy-first by doctrine: minimal PII, consent-gated, DSAR-ready through the existing Compliance engine, and it never links a self-custodial on-chain identity to PII without explicit consent. World-class is Salesforce/HubSpot's 360° account view with the data-minimization and consent rigor the non-custodial ethos demands.

**Owns**
  - The canonical Account/Contact model linking enterprise account ↔ users ↔ wallet identities ↔ subscriptions
  - Consent-gated identity resolution plus merge/split, never linking on-chain identity to PII without consent
  - Lifecycle-stage and segment tags consumed by Growth, Customer Success, and Billing
  - A source-attributed interaction timeline (support, billing, API-usage signals) kept honest
  - PII minimization, retention, and DSAR export/delete via the Compliance privacy engine
  - Segmentation queries powering campaigns and health scores

**Depends on:** Compliance, Billing, Customer Success, Business Intelligence

**Interfaces**
  - `resolveAccount(identifier): Account — consent-scoped`
  - `segment(query): Account[] for campaigns and CS`
  - `timeline(accountId): Interaction[] — source-attributed and honest`
  - `mergeAccounts(a, b, consent): Account — auditable and reversible`
  - `export(accountId) / erase(accountId) DSAR delegated to Compliance`

**Quality bar:** Match Salesforce's 360° account resolution while beating every CRM on privacy: on-chain identity is never joined to PII without explicit consent, retention and DSAR are enforced by the Compliance engine, and the record is minimal-by-default — the opposite of ad-tech data hoarding.

**Definition of done**
  - [ ] One account resolves consistently across wallet, API, billing, and support surfaces
  - [ ] No PII↔on-chain-identity link exists without a logged consent record (tested)
  - [ ] Merge/split is auditable and reversible; timeline entries are source-attributed
  - [ ] DSAR export/erase round-trips through Compliance and actually deletes
  - [ ] Segmentation is deterministic and reproducible with no fabricated or enriched fields

**Doctrine hooks**
  - Privacy (charter §7 / Compliance): consent-gated, minimal PII, DSAR-ready — on-chain↔PII linkage requires explicit consent
  - #3 never fake: no data-broker enrichment or fabricated attributes; unknown stays unknown
  - #6 auditable: every merge, consent, and erase is logged to an append-only audit trail


#### P8.07 · Customer Success
> The proactive health and support engine — detect at-risk accounts and resolve issues before they churn, without ever touching keys.

Owns account health scoring, churn-risk prediction, proactive playbooks, and the support workflow (ticketing, SLAs, escalation) for both consumer and enterprise/SDK customers. It reads honest signals — real usage, settlement failures, entitlement friction — never keys or seed, and its playbooks PROPOSE interventions that the deterministic gates dispose. World-class is Gainsight-grade health scoring plus Intercom/Linear-grade support UX, tuned to a wallet where a failed settlement is the highest-signal churn event.

**Owns**
  - The account health-score model (usage, failed-settlement rate, entitlement friction, support load)
  - Churn-risk detection and proactive playbook triggers that propose to Growth/CS and never touch keys
  - Support ticketing, SLA, and escalation workflow across consumer and enterprise tiers
  - Enterprise/SDK onboarding success tracking (time-to-first-successful-API-call)
  - Save and expansion playbooks feeding upgrade/downgrade signals to Growth and Billing
  - Voice-of-customer aggregation into Business Intelligence

**Depends on:** CRM, Business Intelligence, Billing, Growth Engine

**Interfaces**
  - `healthScore(accountId): Score — explainable with honest inputs`
  - `churnRisk(accountId): Risk plus triggered playbooks`
  - `openTicket(...) / escalate(...) with an SLA state machine`
  - `enterpriseOnboardingStatus(account): Milestones`
  - `Emits save/expansion signals to Growth and Billing`

**Quality bar:** Beat every wallet's ticket-and-pray support with Gainsight-grade proactive health and Linear-grade workflow speed: a failed real settlement pages the right owner before the user rage-quits, and support never needs — or can get — the user's keys.

**Definition of done**
  - [ ] The health score is explainable (every input attributable) and backtested as predictive of churn
  - [ ] Failed-settlement and entitlement-friction events drive proactive outreach within SLA
  - [ ] Ticketing enforces SLAs and escalation; enterprise onboarding milestones are tracked
  - [ ] No support workflow can request or access keys or seed (structurally absent)
  - [ ] CS signals reach Growth/Billing without fabricating any metric

**Doctrine hooks**
  - #1 non-custodial: support and CS never touch keys or seed — recovery is user-side by construction
  - #2 propose/dispose: playbooks propose saves and offers; the pricing/entitlement gates dispose
  - #3 never fake: health inputs are real signals — a data gap lowers confidence, it never invents a green score


#### P8.08 · Partner Platform
> The white-label and API-partner control plane — provision, meter, and revenue-share with the wallets and apps built on our rails.

Owns the enterprise/SDK and white-label business surface (requirements §2.3-4, and the Router's mandate to power third-party wallets): partner onboarding, API-key and scope provisioning, per-partner metering and rate tiers, white-label configuration, and partner revenue-share/rebate. It productizes the existing SDK, Router, and Solver rails into a governed control plane where every partner is metered by Billing, priced by the kernel, and paid non-custodially by the Marketplace economy. World-class is Stripe Connect plus Vercel/Twilio's developer-partner platform, applied to universal wallet infrastructure.

**Owns**
  - Partner onboarding and tiering (self-serve dev → enterprise white-label) with scoped API keys
  - API-key issuance with scope/capability binding, rotation, and revocation, reusing the plugin capability model
  - Per-partner usage metering, rate limits, and quota tiers fed into Billing
  - White-label configuration (branding, enabled chains/features, policy overrides bounded by safety)
  - Partner revenue-share/rebate schedules paid through the Marketplace economy
  - Partner sandbox and go-live gating that honestly separates testnet, capped-mainnet, and real

**Depends on:** Billing, Marketplace Economy, Pricing, SDK / Developer Platform

**Interfaces**
  - `provisionPartner(...): Partner with tier and scoped keys`
  - `issueKey(partner, scopes): ApiKey — rotatable, revocable, capability-bound`
  - `partnerUsage(partner, period): UsageReport feeding Billing`
  - `whiteLabelConfig(partner): Config bounded by safety policy`
  - `partnerPayout(partner, period): PayoutInstruction via the Marketplace economy`

**Quality bar:** Match Stripe Connect and Twilio's partner provisioning and Vercel's DX, but beat them on safety: a partner's white-label config can never disable a security default or exceed policy caps, keys are capability-bound (they can't request what can't be granted, per the plugin model), and go-live honestly separates testnet/capped-mainnet/real.

**Definition of done**
  - [ ] Partners self-serve provision, receive scoped keys, and are metered accurately into Billing
  - [ ] API keys are capability-bound, rotatable, and revocable; a revoked key fails closed immediately
  - [ ] White-label overrides are bounded — no config can weaken a security or policy default (tested)
  - [ ] Partner revenue-share pays non-custodially via the Marketplace economy
  - [ ] Sandbox→go-live gating labels testnet/capped-mainnet/real honestly

**Doctrine hooks**
  - #2 verify/dispose + capability model: keys are capability-bound per plugin doctrine (can't request what can't be granted), and config overrides can only narrow, never weaken, safety
  - #3 never fake: honest testnet/capped-mainnet/real labeling across partner environments
  - #1 non-custodial: partner payouts settle to partner-owned addresses — the platform holds no partner float


#### P8.09 · Business Intelligence
> The honest metrics warehouse and semantic layer — one trusted definition of every number, no vanity, no fabrication.

Owns the analytics substrate: event pipeline, warehouse models, a governed semantic/metrics layer, and self-serve dashboards every business module reads from. Its prime directive is doctrine #3 — never fake data: metrics are honestly defined and versioned, a pipeline failure surfaces as unknown rather than zero, and revenue is counted only on confirmed on-chain settlement, reconciled against the Settlement ledger. World-class is the semantic-layer rigor of dbt/Cube plus the exploration UX of Amplitude/Mixpanel, with a truth guarantee those tools don't enforce.

**Owns**
  - Event ingestion and warehouse models (reusing the events-package schemas) with full lineage
  - The governed semantic/metrics layer — one versioned definition per metric (activation, MRR, retention, take-rate)
  - Self-serve dashboards plus cohort and funnel exploration for the org
  - Data-quality and freshness monitors that mark metrics unknown (not zero) on failure
  - Reconciliation of revenue metrics against the Settlement and Billing ledgers as source of truth
  - Metric-access governance (who sees revenue or PII-adjacent cuts) via Compliance RBAC

**Depends on:** Observability, Settlement, Compliance, Finance Dashboard

**Interfaces**
  - `metric(name, dims, window): Value | Unknown — versioned definition, honest nulls`
  - `cohort(spec) / funnel(spec): Result`
  - `freshness(dataset): FreshnessStatus that drives unknown vs value`
  - `defineMetric(spec): MetricVersion — governed and versioned`
  - `revenueVsLedger(period): Variance reconciliation`

**Quality bar:** Beat Amplitude/Mixpanel self-serve with a dbt/Cube-grade governed semantic layer, and beat all of them on integrity: every metric has one versioned definition, a broken pipeline reads unknown not 0, and revenue reconciles to the on-chain Settlement ledger to the base unit.

**Definition of done**
  - [ ] Every headline metric has exactly one versioned, documented definition — no dueling numbers
  - [ ] Pipeline/freshness failures render metrics as unknown, never as zero (tested)
  - [ ] Revenue BI reconciles to the Settlement and Billing ledgers within tolerance, with variance surfaced
  - [ ] Dashboards are self-serve with cohort/funnel, and access is RBAC-governed via Compliance
  - [ ] No vanity metric ships without an honest denominator and definition

**Doctrine hooks**
  - #3 never fake (hardest here): unknown is not zero — every metric is honestly defined and reconciled to on-chain truth
  - #6 auditable + deterministic: metric definitions are versioned and reproducible, and lineage is inspectable
  - Privacy/RBAC: revenue and PII-adjacent cuts are gated by Compliance governance


#### P8.10 · Finance Dashboard
> The company's books, reconciled to the chain — recognized revenue, unit economics, and runway, exact to the base unit.

Owns the executive and finance-ops financial system: recognized revenue, gross margin, unit economics (CAC/LTV/payback), cohort economics, and cash/runway — all reconciled to the Settlement, Billing, and Marketplace ledgers so the books match the chain to the base unit. Revenue is recognized only on confirmed collection/settlement (never on invoice or projection), money is integer minor units end to end, and every figure drills down to its source ledger entry. World-class is Ramp/Mercury-grade finance visibility with the close-discipline of a GAAP-aware system, purpose-built for on-chain-reconciled crypto revenue.

**Owns**
  - Recognized-revenue and deferred-revenue computation, on confirmed settlement/collection only
  - Gross margin net of gas margin, provider costs, and marketplace payouts, in integer minor units
  - Unit economics: CAC, LTV, payback, contribution margin, and cohort economics
  - Cash position, runway, and burn reconciled to on-chain and fiat sources
  - Financial-close support: ledger reconciliation (Settlement/Billing/Marketplace) plus variance
  - The executive financial dashboard and board-reporting exports — honest, sourced, and drill-downable

**Depends on:** Business Intelligence, Billing, Marketplace Economy, Settlement

**Interfaces**
  - `recognizedRevenue(period): Money — integer, on-confirmed only`
  - `unitEconomics(segment): { cac, ltv, payback, contributionMargin }`
  - `runway(): { cash, burn, monthsRemaining } — honest and sourced`
  - `reconcile(period): ReconciliationReport vs Settlement/Billing/Marketplace ledgers`
  - `boardExport(period): Report drill-down to ledger entries`

**Quality bar:** Match Ramp/Mercury's finance clarity and beat every crypto company's trust-me spreadsheet: recognized revenue reconciles to the Settlement ledger to the base unit, every figure drills to its source entry, and nothing is recognized on a projection.

**Definition of done**
  - [ ] Recognized revenue counts only confirmed settlements/collections and reconciles to the ledgers to the base unit
  - [ ] All figures are integer minor units end to end — no float appears in the books
  - [ ] Unit economics (CAC/LTV/payback) have documented honest definitions plus cohort views
  - [ ] Runway and burn are sourced and reconciled, not estimated as fact
  - [ ] Every dashboard number drills to its originating ledger entry, and the board export is reproducible

**Doctrine hooks**
  - #4 integer bigint (hardest here): the entire books are integer minor units, reconciliation is exact, and a mismatch fails closed
  - #3 never fake: revenue is recognized only on confirmed on-chain/collection events, and projections are labeled as projections
  - #6 auditable: every figure drills to an append-only ledger entry, and reconciliation variance is surfaced, not hidden


### Phase 9 — Company


#### P9.01 · Brand System
> One Spark, everywhere — a token-coded brand membrane that makes every surface unmistakably ours and unmistakably honest.

World-class is a single source-of-truth brand system — glyph, wordmark, color arc, type ramp, motion grammar, and voice — codified as importable tokens, not a PDF nobody opens, so it renders identically in a native app, a marketing site, a pitch deck, and a browser-tab favicon. It out-consistents Stripe and out-crafts Phantom's ghost, and it bakes the product's honesty (WCAG AA contrast, prefers-reduced-motion, no fake gloss) into the brand itself rather than treating it as a skin.

**Owns**
  - The Spark glyph (SPARK_PATH), wordmark, clear-space rules, and the canonical indigo→electric-violet color arc as one versioned asset kit
  - A @intent/brand token package (color/type/space/radius/motion/elevation) that apps/web, apps/mobile, the site, and the deck all import — zero per-surface reskins
  - The SparkAvatar deterministic-identity language (hue clamped to the brand arc; honest flat-grey when there is no address) extended from wallet into the whole brand
  - Verbal identity: naming, tagline system, and a voice-and-tone guide ('confident, plain-spoken, never hype') with a doctrine-honest lexicon that bans 'confirmed/real' for anything not on-chain
  - A WCAG AA contrast validator so no brand application can ship an inaccessible pairing
  - Light/dark parity and the 150–250ms reduced-motion-aware motion grammar as first-class brand requirements, not decoration

**Depends on:** packages/ui + mobile ui.tsx 'Brand Spark' language

**Interfaces**
  - `@intent/brand token package (single source of truth consumed by all surfaces)`
  - `Versioned glyph/wordmark/SparkAvatar asset kit`
  - `Contrast-validator CLI run in CI on every brand pairing`
  - `Voice-and-tone + doctrine lexicon guide`
  - `A 'brand police' redline check gating cross-surface drift`

**Quality bar:** A stranger shown the app, the site, the deck, and a single tweet identifies them as the same company in under 2 seconds, and measured token drift across surfaces is exactly 0 — beating Stripe's cross-surface consistency and Linear's token discipline.

**Definition of done**
  - [ ] @intent/brand token package published and imported by web, mobile, site, and deck
  - [ ] Glyph, wordmark, and SparkAvatar assets shipped in a versioned kit
  - [ ] Contrast validator green across every brand color pairing in CI
  - [ ] Voice guide includes 10 real before/after rewrites and the banned-word lexicon
  - [ ] Light and dark parity proven on every reference surface
  - [ ] CI brand-drift check enforced

**Doctrine hooks**
  - #5 Apple-grade + WCAG AA as a requirement not polish: the brand ENCODES contrast + reduced-motion, so no application can opt out
  - #3 Never fake: the voice guide structurally bans 'confirmed/real' language for anything not verified on-chain, and forbids fake gloss
  - #6 Deterministic: the brand is code/tokens deterministically applied, not a static PDF that drifts


#### P9.02 · Marketing
> Demand that compounds — honest positioning and instrumented growth loops that make 'talk to your money' the category, not a feature.

World-class marketing owns the category narrative ('the AI-native, non-custodial wallet') and a measurable demand system — content, growth loops, lifecycle, paid — that acquires the right users (self-custody-curious, AI-native) at a defensible CAC and never once lies to do it. It beats Phantom's cultural fluency while holding a Stripe-grade trust bar: every claim is on-chain-verifiable or it does not ship.

**Owns**
  - The category narrative, positioning, and messaging hierarchy (north star: ChatGPT × Apple Wallet × Stripe) plus the competitive teardown vs MetaMask/Phantom/Rabby/Coinbase/Rainbow
  - Instrumented growth loops: referral and intent-share links (Phase 11), invite mechanics, and viral moments measured by K-factor — never vanity metrics
  - The content engine: launch-grade blog, security-truth explainers ('why your keys never leave your device'), and honest comparison pages
  - Lifecycle/CRM: onboarding and activation nudges and win-back, all fired off real product events rather than spray-and-pray
  - Paid acquisition and an honest CAC/LTV attribution model that is privacy-preserving (no PII in URLs, per doctrine)
  - A claims-review gate: a doctrine/legal sign-off so no asset overstates custody, safety, yield, or performance
  - Launch-moment amplification executed in lockstep with P9.07

**Depends on:** P9.01 Brand System, P9.03 Website, P9.05 Community, P9.07 Launch Strategy

**Interfaces**
  - `Ratified messaging house / positioning doc`
  - `Growth-loop instrumentation event schema (shared with the analytics/ClickHouse backbone)`
  - `The claims-review checklist and sign-off gate`
  - `Referral / intent-share link spec`
  - `A marketing-metrics dashboard (CAC, LTV, activation, K-factor)`

**Quality bar:** A cold prospect can state what the product is and why it is different in one sentence after 10 seconds on any asset, growth loops show a real K-factor > 0 with honest attribution, and there is not one claim that cannot be verified on-chain — Phantom's reach without a single hype-lie.

**Definition of done**
  - [ ] Positioning doc ratified and adopted across surfaces
  - [ ] At least 3 growth loops instrumented and live with K-factor reporting
  - [ ] Lifecycle flows firing off real product events
  - [ ] Claims-review gate enforced — every public asset signed off
  - [ ] CAC/LTV dashboard live and reconciled to the analytics backbone
  - [ ] Privacy check passing: no PII in any tracking URL

**Doctrine hooks**
  - #3 Never fake is the hardest bite here — marketing is where the temptation to overstate lives; the claims-review gate + 'on-chain-verifiable or it does not ship' makes honesty structural
  - Privacy rule: no personal or sensitive data in URL params or attribution query strings
  - #5 Craft/accessibility: marketing assets meet the same bar as the product, not a lower one


#### P9.03 · Website
> The front door that earns trust in 5 seconds — Stripe-grade clarity, real security truths, zero dark patterns.

World-class is a website that converts skeptics into installs and developers into integrators with Stripe-caliber information architecture and craft, while surfacing the product's real security posture (non-custodial, keys-on-device, audited) instead of trust theater. It loads sub-second, ranks, is fully accessible, and reuses the P9.01 token system so it is unmistakably the same company as the app.

**Owns**
  - Marketing-site IA and build (home, product, security, developers, pricing, about, blog) on a lean fast stack consistent with apps/web's Vite+React+one-styles.css ethos — no framework churn
  - The /security trust page: honest and specific — non-custodial architecture, threat-model summary, audit reports, bug-bounty link — never '100% safe'
  - Performance + SEO: green Core Web Vitals, semantic HTML, structured data, sub-1s LCP
  - Accessibility: WCAG AA across the whole site, keyboard- and screen-reader-tested
  - Conversion surfaces: install/download CTAs, developer sign-up, and beta-cohort waitlist gating (Phase 11)
  - Hosting the Documentation (P9.04) and Blog (P9.02) as sections of one shell
  - Privacy-preserving analytics and experimentation (no PII in URLs)

**Depends on:** P9.01 Brand System, P9.04 Documentation, P9.02 Marketing, P9.08 Investor Deck

**Interfaces**
  - `The deployed site behind a CDN`
  - `The /security trust page`
  - `The developer-portal entry point`
  - `A content pipeline (CMS) feeding blog + docs`
  - `The conversion event schema`
  - `A Lighthouse / Core-Web-Vitals CI gate`

**Quality bar:** Lighthouse 95+ across the board, LCP under 1s on 4G, WCAG AA with zero axe violations, and a /security page a paranoid engineer respects — beating Stripe.com on trust-clarity for a consumer+developer hybrid and every incumbent wallet site on honesty and craft.

**Definition of done**
  - [ ] Site live with all core sections
  - [ ] Lighthouse / CWV CI gate green
  - [ ] axe accessibility zero-violations gate passing
  - [ ] /security page reviewed and signed off by the security owner (ADR 0049)
  - [ ] Docs and blog rendering inside one shell
  - [ ] Conversion events instrumented privacy-safely

**Doctrine hooks**
  - #3 Never fake: the /security page states the real posture (non-custodial, keys-on-device, audits), never trust theater or unfalsifiable safety claims
  - #5 WCAG AA + performance enforced as CI gates, not aspirations
  - STACK reality: resist a needless Next.js/Tailwind rewrite — mirror apps/web's lean discipline; Privacy: no PII in URLs


#### P9.04 · Documentation
> Docs so good the SDK sells itself — Stripe-grade, runnable, and honest about what's testnet.

World-class docs make a developer's first successful intent-plan call happen in under 10 minutes, with runnable examples, API reference generated from the OpenAPI source, and conceptual guides that teach the doctrine (AI proposes → deterministic code verifies → the device signature disposes). It is the Stripe Docs bar applied to a non-custodial AI-wallet SDK, and it never documents a capability as production-ready when it is testnet or capped.

**Owns**
  - Developer docs: quickstart, packages/sdk guides, intent/plan/execute walkthroughs, SIWE auth, and webhooks
  - API reference generated from the services/api OpenAPI spec — never hand-drifted
  - Conceptual and doctrine docs: the non-custodial model, the deterministic safety gate, the capability registry, gas abstraction
  - Runnable, copy-paste examples that are compiled/executed in CI (docs that actually run)
  - Versioning, changelog, and migration guides as the SDK evolves
  - Honest capability labeling: testnet/mainnet/capped/beta status on every feature, synced from the capability registry, not from marketing copy
  - A plain-language user help center (recovery, security, troubleshooting)

**Depends on:** P9.03 Website, P9.01 Brand System, P9.06 Open Source, packages/sdk + services/api

**Interfaces**
  - `The docs site section`
  - `An auto-generated API reference (OpenAPI-sourced)`
  - `A tested-snippets CI job`
  - `The capability-status data source (registry-synced)`
  - `A changelog / migration feed`
  - `Docs search`

**Quality bar:** Measured time-to-first-successful-call under 10 minutes on real external developers, 100% of the API reference generated from OpenAPI with zero drift, and every code sample running in CI — clearing Stripe Docs' runnability bar while every incumbent wallet's docs are the floor, not the target.

**Definition of done**
  - [ ] Quickstart validated with 5 external developers hitting under 10 minutes
  - [ ] API reference auto-generated and drift-checked in CI
  - [ ] All snippets pass a compile/run job
  - [ ] Capability status synced live to the registry
  - [ ] Changelog and migration guide live
  - [ ] Docs search working

**Doctrine hooks**
  - #3 Never fake: capability labels are honest (testnet ≠ production, capped is labeled capped), sourced from the registry not marketing copy
  - #6 Deterministic and tested: snippets are executed in CI and the reference is generated, not hand-written and stale
  - #2 Safety doctrine: 'AI proposes / code verifies / device disposes' is a first-class documented concept so integrators cannot design around the gate


#### P9.05 · Community
> A community that defends the doctrine — high-signal, scam-hardened, where nobody ever asks for your seed.

World-class is an owned community and DevRel motion that turns users into advocates and developers into contributors, with support that is fast and empathetic — and hardened against the seed-phrase scams that plague every wallet community. It matches Phantom's cultural energy and Linear's signal-to-noise, while making the non-custodial support boundary ('we literally cannot access or reset your keys') a feature people trust rather than a gap they resent.

**Owns**
  - Community platform(s): Discord/forum structure, moderation, roles, and code of conduct
  - Anti-scam hardening: pinned 'we will NEVER DM you or ask for your seed' norms, impersonation defense, verified-team badges, and auto-mod for seed-phishing patterns
  - DevRel: sample apps, office hours, hackathon presence, and contributor onboarding (ties to P9.06)
  - Support ops: tiered support, response-time SLAs, escalation to engineering, and honest 'self-custody means we cannot reverse this' boundaries
  - A structured feedback loop from community insight into product (not anecdote-driven)
  - An earned ambassador/advocate program (never paid shills presented as organic)
  - Community health metrics: first-response time, sentiment, active contributors

**Depends on:** P9.01 Brand System, P9.06 Open Source, P9.02 Marketing, P9.04 Documentation

**Interfaces**
  - `The community server + governance docs`
  - `The anti-scam auto-mod ruleset`
  - `The support SLA + escalation runbook`
  - `The feedback→product intake pipeline`
  - `A contributor onboarding path`
  - `A community-health dashboard`

**Quality bar:** Median first-response under 2 hours, zero successful seed-phishing incidents attributable to lax norms, and a contributor pipeline that actually merges external PRs — beating Phantom on community trust-safety and generic Discords on signal.

**Definition of done**
  - [ ] Community platform live with code of conduct and roles
  - [ ] Anti-scam auto-mod and pinned norms deployed
  - [ ] Support SLA defined and tracked
  - [ ] Feedback intake wired into product
  - [ ] Ambassador program launched
  - [ ] Health dashboard live

**Doctrine hooks**
  - #1 Non-custodial: the support boundary is honest and enforced — the team genuinely cannot recover keys, and community norms turn that into a trust feature, not a support failure
  - #3 Never fake: no astroturfing or paid shills presented as organic advocacy
  - Safety: seed-phishing hardening is a first-class community responsibility, not an afterthought


#### P9.06 · Open Source
> Verifiable, not just 'trust us' — open the security-critical core so the non-custodial claim is provable.

World-class is a deliberate open-source strategy where the custody-defining code (key derivation, the vault, the safety gate) is open and auditable so 'keys never leave your device' is provable rather than marketed — while the business retains defensible edges (solver network, intelligence, growth). It clears the auditability bar Rabby and MetaMask set and adds reproducible builds so the shipped binary verifiably matches the audited source.

**Owns**
  - The OSS boundary decision: what is open (custody/security core — key gen, SLIP-10, vault KDF/cipher, the deterministic safety gate) vs closed (solver network, intelligence, growth)
  - Licensing strategy (permissive vs copyleft), CLA/DCO, and third-party license compliance
  - Repo governance: CONTRIBUTING, security policy, responsible disclosure, issue/PR templates, maintainer model
  - Reproducible builds: the shipped app binary verifiably matches published source — the strongest non-custodial proof
  - Public security artifacts: audit reports, bug-bounty program, and the threat model (ties to ADR 0049)
  - Contributor experience: good-first-issues, review SLAs, and a real external-PR merge path (ties to P9.05)
  - Supply-chain security: dependency pinning, provenance/SBOM, and signed releases

**Depends on:** P9.05 Community, P9.04 Documentation, P9.01 Brand System, security-audit-and-hardening (ADR 0049)

**Interfaces**
  - `Public repo(s) + governance files`
  - `The reproducible-build verification pipeline (binary == source)`
  - `SBOM + signed-release attestations`
  - `The bug-bounty program`
  - `The CLA/DCO gate`
  - `Published audit reports`

**Quality bar:** An independent security researcher can audit the custody path AND reproduce the shipped binary from source, the bug bounty is live with real payouts, and every ship carries an SBOM and signed release — beating MetaMask/Rabby on reproducibility, where most wallets are open but not reproducible.

**Definition of done**
  - [ ] OSS boundary ratified and the custody core made public
  - [ ] License plus CLA/DCO in place
  - [ ] Reproducible-build pipeline proving binary equals source
  - [ ] Bug bounty live
  - [ ] SBOM and signed releases in CI
  - [ ] At least one external contributor's PR merged

**Doctrine hooks**
  - #1 Non-custodial is THE hook: open + reproducible custody code is how the claim becomes provable instead of promised
  - #2 Safety gate: the deterministic gate being open lets anyone verify AI has no signing authority
  - #6 Deterministic and tested: open pure cores invite external verification of the test/coverage claims


#### P9.07 · Launch Strategy
> Earn the launch — a cohort-gated, testnet-first rollout that validates the risky bet before it scales.

World-class is a phased, reversible launch that treats distribution as earned and de-risks the central unvalidated bet — will real people trust natural-language commands with real money? — through gated cohorts and honest testnet-first exposure, not a fireworks day-one mainnet push. It borrows Superhuman/Linear invite-craft and Phantom's momentum, sequenced against real activation/retention gates and the hard constraints of app-store crypto policy.

**Owns**
  - Launch sequencing: private alpha → gated beta cohorts (Phase 11 feature flags) → public, each with quantitative go/no-go metrics
  - The validation plan for the core bet: instrument whether users actually trust NL-with-money vs route around it — the open WANT question from the build history
  - Testnet-first, mainnet-guarded rollout (default testnet, capped and acknowledged mainnet) — honest exposure with funds-safety gated
  - App-store strategy: Apple 3.1.5 crypto compliance, review-risk mitigation, and store assets
  - Waitlist and invite mechanics (ties to the referral loops in P9.02)
  - Launch-day operations: status/incident readiness (ties to reliability) and press/community coordination
  - Rollback and kill-switch posture: every cohort/feature reversible and fail-closed

**Depends on:** P9.02 Marketing, P9.05 Community, P9.03 Website, P9.10 Company Operating System, reliability + policy engines

**Interfaces**
  - `The phased launch plan with go/no-go gates`
  - `Cohort feature-flag configuration`
  - `The core-bet validation instrumentation`
  - `The app-store submission checklist (Apple 3.1.5)`
  - `The launch-day runbook`
  - `The kill-switch / rollback procedure`

**Quality bar:** Every stage has a quantitative go/no-go gate and a tested rollback, the central bet is measured before mainnet scale rather than assumed, and app-store approval is clean — beating the typical crypto 'big-bang mainnet launch' by validating first and matching Superhuman/Linear on beta craft.

**Definition of done**
  - [ ] Staged plan with go/no-go metrics ratified
  - [ ] Cohort feature flags wired
  - [ ] Core-bet validation instrumented and reading real data
  - [ ] App-store submission passed (Apple 3.1.5)
  - [ ] Launch runbook and kill-switch rehearsed
  - [ ] Rollback tested

**Doctrine hooks**
  - #3 Never fake: testnet is labeled testnet and capped mainnet is labeled capped; launch never claims traction it does not have
  - #4 Guards fail closed: cohort gates and the kill-switch fail closed, and mainnet is guarded/capped
  - #2 Safety: the NL surface only scales after the deterministic gate and the drain guards hold — honoring the hard-won safety history


#### P9.08 · Investor Deck
> A thesis that survives diligence — the honest, defensible case for the AI-native non-custodial wallet.

World-class is a fundraising narrative and data room that make the category thesis ('talk to your money, non-custodially') undeniable and the moat legible — deterministic safety gate, reproducible custody, solver network, universal identity, developer platform — backed by real, un-massaged metrics that get stronger under diligence, not weaker. It reads like a company already operating at a $100M bar and holds the same honesty doctrine internally that it shows users.

**Owns**
  - The narrative: problem, category thesis, why-now, product, moat, GTM, team, and ask as one coherent story
  - The moat articulation: safety gate + reproducible non-custodial custody + solver network + multi-chain universal identity + developer platform
  - Real metrics only: traction, activation, retention, and unit economics sourced from product analytics, never fabricated
  - The data room: cap table, financials, security posture/audits, architecture, key ADRs, legal
  - The financial model and use-of-funds tied to the hiring plan (P9.09) and roadmap
  - Financing strategy: equity, honoring the §2 no-token-at-launch decision; dilution/runway math
  - Investor-grade competitive positioning vs MetaMask/Phantom/Coinbase incumbency

**Depends on:** P9.01 Brand System, P9.10 Company Operating System, P9.09 Hiring Plan, P9.07 Launch Strategy

**Interfaces**
  - `The brand-consistent deck`
  - `The data room`
  - `The financial model + use-of-funds`
  - `The metrics appendix (analytics-sourced, traceable)`
  - `The moat/architecture one-pager`

**Quality bar:** A skeptical partner's diligence makes the metrics look BETTER not worse because nothing is hidden, the moat is legible to a non-crypto investor in one slide, and the deck is visually indistinguishable in quality from the product — matching best-in-class seed/Series-A decks while holding the honesty bar users get.

**Definition of done**
  - [ ] Narrative deck complete and brand-consistent
  - [ ] Data room assembled
  - [ ] Financial model and use-of-funds tied to the hiring plan
  - [ ] Every metric traceable to an analytics source
  - [ ] Moat one-pager reviewed
  - [ ] Legal and cap table clean

**Doctrine hooks**
  - #3 Never fake is central: investor metrics are real and diligence-proof, mirroring the product's no-fake-data rule — no vanity, no fabrication
  - #1 Non-custodial: the moat rests on PROVABLE custody, so the deck cites the reproducible/open proof (P9.06), not a promise
  - §2 no-token decision honored: the financing story is equity, not a token pitch


#### P9.09 · Hiring Plan
> Hire the doctrine, not just the résumé — a small, senior, security-obsessed team that ships pure tested cores.

World-class is an org design and hiring machine that recruits a small, exceptionally senior team who already believe the doctrine — non-custodial, never-fake-data, deterministic-tested cores — because you cannot bolt those values onto a company that holds people's money later. It uses the sequencing and quality bar of Stripe/Linear (fewer, better, high-trust) and makes security, craft, and honesty the non-negotiable hiring filter.

**Owns**
  - Role sequencing tied to roadmap and funding: which 10–20 hires, in what order, and why
  - The hiring bar and rubrics: TypeScript-monorepo depth, security instinct, pure/tested-core discipline, and design craft
  - Doctrine-as-filter: interview loops that test for honesty (would they ship a fake state under deadline?) and safety-first thinking
  - Key early roles: security engineer, cryptography, applied-AI/intent, mobile/web craft, DevRel, GTM
  - Compensation and equity philosophy (no token → equity), leveling, and offer strategy
  - Interview-process design: structured, humane, bias-mitigated, and work-sample-based
  - Onboarding into the loop protocol and doctrine (ties to P9.10)

**Depends on:** P9.08 Investor Deck, P9.10 Company Operating System, P9.01 Brand System

**Interfaces**
  - `The hiring roadmap + headcount plan`
  - `Per-role scorecards/rubrics`
  - `The interview-loop design`
  - `The comp/leveling framework`
  - `The doctrine-fit assessment`
  - `The onboarding path`

**Quality bar:** Offer-accepts from genuinely senior candidates who could work anywhere, zero doctrine-misfit hires, and a loop humane enough that rejected candidates still refer peers — matching Linear/Stripe's 'small and senior' bar and never diluting craft to hit headcount.

**Definition of done**
  - [ ] Role-sequenced hiring roadmap tied to funding
  - [ ] Scorecards per role
  - [ ] Interview loop designed and calibrated
  - [ ] Doctrine-fit assessment in every loop
  - [ ] Comp/leveling framework set
  - [ ] Onboarding path to the loop protocol documented

**Doctrine hooks**
  - #1/#2/#3 as a hiring FILTER: the team that holds custody must believe non-custodial + safety-first + never-fake in their bones, tested in the loop
  - #6 Deterministic: hire for pure/tested-core discipline — the codebase's DNA — not just shipping speed
  - §2 no-token → equity: the comp story is honest about how upside is earned


#### P9.10 · Company Operating System
> The loop, institutionalized — write-first, doctrine-gated decisions and a cadence that keeps a scaling team as coherent as one founder.

World-class is an explicit operating system — how decisions get made, written, and remembered; how work is sequenced (the phased loop); how quality gates (DoD, tests, audits) are enforced — so a 30-person company stays as coherent and doctrine-true as the founding CTO's single-threaded loop. It codifies what already works in the repo (ADR supersede-only, memory.md institutional memory, DoD gates, decision logging) into a company that scales without entropy, at Linear's cadence and Amazon's writing bar.

**Owns**
  - The decision system: ADR-style written, supersede-only decisions (per docs/adr), a decision log, and an RFC process — a write-first culture
  - Planning cadence: the phased build loop scaled to teams, plus roadmap, prioritization, and retros
  - Quality gates as company policy: Definition of Done (code + tests + docs + memory), the coverage gate, and security review before ship
  - Institutional memory: the memory.md pattern promoted into an org knowledge base so context survives people leaving
  - The metrics/analytics backbone (single source of truth) feeding the deck (P9.08), marketing (P9.02), and launch (P9.07)
  - Company values operationalized: doctrine turned into rituals, incentives, and review checklists — not a poster
  - Rituals: weekly cadence, incident review, decision review, and blameless-but-honest postmortems

**Depends on:** P9.09 Hiring Plan, P9.01 Brand System, existing loop protocol + ADR/DoD discipline

**Interfaces**
  - `The decision/ADR + RFC process`
  - `The DoD + quality-gate policy`
  - `The metrics single-source-of-truth`
  - `The knowledge base (memory pattern)`
  - `The operating-cadence calendar`
  - `The values→rituals checklist`

**Quality bar:** A new senior hire is productive and doctrine-aligned within a week because decisions and context are written and findable, no major decision is undocumented, and DoD is enforced not aspirational — beating the typical startup's tribal-knowledge chaos and matching Linear's cadence and Amazon's writing discipline.

**Definition of done**
  - [ ] Written decision/RFC process live and adopted
  - [ ] DoD + quality gates enforced org-wide and CI-backed
  - [ ] Metrics single-source-of-truth serving deck/marketing/launch
  - [ ] Knowledge base seeded from the memory pattern
  - [ ] Operating cadence running
  - [ ] Values→rituals checklist in use

**Doctrine hooks**
  - #6 Deterministic, auditable, logged: every risky decision written and auditable is the company-scale version of 'every risky decision is logged'
  - #3 Never fake: blameless-but-honest postmortems and real metrics, no vanity dashboards
  - DoD gate institutionalizes the charter's 'no phase is done with failing tests' at company scale


### Phase 10 — Future


#### P10.01 · Web3 Super App
> One intent-native surface where every app on earth runs behind your Risk+Policy+device-signature gate — WeChat's ubiquity without WeChat's custody.

World-class is a home surface where a user says what they want ("swap, then bridge, then pay this invoice, then stake the rest") and third-party mini-apps compose to fulfil it — each sandboxed, each proposing plans that pass the SAME deterministic gate, none ever holding a key. It must feel like Phantom's polish and iOS's app model, but where the intent layer — not a dapp-browser URL bar — is the primary surface, and where a mini-app can never move funds it was not policy-authorized to.

**Owns**
  - The intent-first Super App shell (home surface, app rail, universal search-as-intent) that resolves an utterance to a mini-app plus a proposed plan
  - The mini-app runtime: sandboxed, capability-scoped execution built on packages/plugins (permission model, trust levels, lifecycle) — no ambient authority
  - App discovery and distribution: a curated in-app store over the Plugin Marketplace with signed manifests, ratings, and per-app risk disclosures
  - The "one gate for all apps" contract: every mini-app action is a ProposedPlan that MUST clear Risk + Policy before any device signature
  - Deep-linking and intent-routing so any app (or the Copilot) can hand an intent to another app without leaking keys or session
  - Unified session and identity across mini-apps via packages/identity (one universal identity, per-app scoped, revocable grants)

**Depends on:** Plugin Marketplace, AI Copilot, Capability Registry, Universal Policy Engine, Universal Security & Risk Engine, Universal Identity, Intent Engine

**Interfaces**
  - `MiniApp manifest + lifecycle (install/grant/revoke) with a declared capability set`
  - `resolveIntentToApp(utterance) → {app, proposedPlan} router surface`
  - `A SuperAppHost that exposes ONLY read/analyze/propose capabilities to apps (no execute)`
  - `Per-app scoped session grants (AppGrant) bound to Policy caps`
  - `In-app App Store listing + signed-manifest verification API`

**Quality bar:** Beats Phantom's dapp ecosystem and Coinbase Wallet's dapp browser by making intents (not URLs) the surface and by structurally proving no mini-app can sign — target: a third-party app ships an end-to-end money flow with zero access to keys, verified by the sandbox.

**Definition of done**
  - [ ] A mini-app completes a swap+pay flow having NEVER touched a private key or a raw signer (sandbox-proven)
  - [ ] Every mini-app action is a ProposedPlan{signed:false} that is refused if Risk=block or Policy denies
  - [ ] The App Store rejects an unsigned or over-permissioned manifest
  - [ ] Intent routing hands an utterance to the right app with a clarify path when ambiguous (no silent wrong-app execution)
  - [ ] Revoking an app grant immediately voids its session keys and caps
  - [ ] WCAG AA + reduced-motion across the shell; honest empty/loading/error states for every app tile

**Doctrine hooks**
  - Doctrine 2 (AI proposes / code verifies / device disposes): mini-apps get propose-only capabilities; the gate is the only path to a signature — an app can never be granted execute
  - Doctrine 1 (non-custodial): the sandbox denies key material to every app; grants are policy-bounded session keys, revocable at any time
  - Doctrine 3 (never fake): app tiles show honest state; a mini-app cannot render "confirmed" for an unconfirmed on-chain action


#### P10.02 · Universal Payments
> Pay anyone, in any asset, on any chain — they receive exactly what they want — with Stripe's reliability and no custodian in the middle.

World-class is Venmo-simple on the surface and Stripe-grade underneath: a payment link, QR, request, subscription, payroll run, or invoice where the sender spends asset X on chain A and the recipient is guaranteed to receive asset Y on chain B — cross-chain settled and quote-locked, or told precisely why not. It must beat Stripe/PayPal on finality honesty and beat every crypto wallet on "the recipient never has to think about chains, gas, or bridging."

**Owns**
  - Payment primitives: send, request, split, payment links, invoices, recurring/subscriptions, and payroll/batch disbursement — all expressed as intents
  - Sender-pays-X / receiver-gets-Y settlement over packages/settlement with mandatory quote-lock and gas validation (no stale-plan payment reaches the wire)
  - Gasless and sponsored payments via the Gas Abstraction engine (ERC-4337/paymaster) so recipients and first-time users never need native gas
  - Merchant acceptance surface: accept-any-asset, settle-to-preferred, deterministic receipts and reconciliation
  - Fiat on/off-ramp orchestration behind the provider framework, KYC-gated by Compliance — labelled, never faked
  - Payment-status truth: pending / settling / settled / failed backed by on-chain confirmation, never optimistic "paid"

**Depends on:** Universal Settlement Engine, Gas Abstraction, Intent Engine, Global Route Optimizer, Provider Framework, Compliance & Governance, Global Settlement Network

**Interfaces**
  - `createPayment({payAsset, receiveAsset, amount, recipient, memo}) → Payment (integer bigint base units end-to-end)`
  - `Payment links / PaymentRequest + QR + deep-link`
  - `Subscription / recurring mandate bound to Policy caps (auto-charge only within authorized limits)`
  - `Merchant Checkout + settlement-preference config + reconcilable Receipt`
  - `On/off-ramp adapter interface (KYC-gated) and a payment-status webhook/stream`

**Quality bar:** Beats Stripe on "any asset in, any asset out, cross-chain, no custody" and PayPal/Venmo on settlement honesty — target: a cross-chain pay-link settles receiver-gets-Y with a locked quote and a reconcilable receipt, or PARKS with a precise reason; zero optimistic "paid" states.

**Definition of done**
  - [ ] Sender pays USDC on Base, recipient receives ETH on Arbitrum — quote-locked, then settled or parked-with-reason (never stranded)
  - [ ] Every amount is integer bigint base units; no float ever touches money
  - [ ] A recurring payment can ONLY charge within its Policy-authorized cap; exceeding it PARKS for approval
  - [ ] A first-time recipient with zero native gas can still receive (gasless), honestly labelled
  - [ ] Payment status reflects on-chain truth; "settled" is never shown pre-confirmation
  - [ ] Fiat-ramp paths are KYC/jurisdiction-gated and clearly labelled testnet/mainnet/capped

**Doctrine hooks**
  - Doctrine 4 (integer bigint, guards fail closed): all payment math is base-unit bigint; a failed pre-flight fails closed to PARK
  - Doctrine 3 (never fake): settlement status is on-chain truth; no optimistic confirmation ever renders as paid
  - Doctrine 2: a subscription/mandate is a policy-bounded authorization, not blanket signing authority


#### P10.03 · RWA
> The honest on-ramp to tokenized TradFi — treasuries, credit, equities, real estate — where eligibility is enforced, backing is verified, and yield is never invented.

World-class is bringing BlackRock-BUIDL / Ondo-grade real-world yield into the intent surface while the Compliance engine enforces per-jurisdiction eligibility, the Risk engine vets issuers and transfer-restrictions, and the Intelligence engine explains real, attested yield versus marketing APY. It must beat Ondo/Franklin/Robinhood on "hold and understand tokenized TradFi from one universal identity" — without ever presenting an unbacked or unaudited asset as backed.

**Owns**
  - The RWA catalog: tokenized treasuries, money-market funds, private credit, equities, and real estate — with issuer, custodian, attestation, and backing metadata
  - Eligibility gating via packages/compliance (jurisdiction, accreditation, KYC/attestation) — a user is offered only what they may legally hold
  - Transfer-restriction awareness (ERC-3643 / permissioned tokens): the Intent Engine and Risk engine refuse plans that would violate an allowlist or lockup
  - Backing and attestation verification: proof-of-reserves / oracle attestation surfaced honestly; unverified is labelled unverified
  - Real-yield intelligence: attested APY, redemption terms, liquidity/lockup, and fees decomposed by packages/intelligence (no fabricated numbers)
  - Redemption and primary/secondary flows orchestrated through Settlement with honest T+n timing

**Depends on:** Compliance & Governance, Universal Security & Risk Engine, Portfolio Intelligence Engine, Capability Registry, Intent Engine, Universal Settlement Engine

**Interfaces**
  - `RwaAsset metadata (issuer, custodian, backing, attestation, restrictions, redemption terms)`
  - `checkEligibility(user, asset) → EligibilityDecision (Compliance-backed, fail-closed)`
  - `Subscribe / redeem intents with transfer-restriction validation`
  - `Attestation / proof-of-reserves feed interface (verified vs unverified state)`
  - `Yield + terms breakdown surface from Intelligence (attested, machine-verified narration)`

**Quality bar:** Beats Ondo / Franklin OnChain on "one universal identity, eligibility enforced, yield honestly explained" — target: a user is shown ONLY assets they are eligible to hold, every yield figure is attested-and-machine-verified, and no restricted transfer can be planned.

**Definition of done**
  - [ ] A jurisdiction-ineligible user is never offered a restricted RWA (Compliance fail-closed, proven)
  - [ ] A plan that violates a transfer restriction or lockup is refused with a precise reason
  - [ ] Unverified backing/attestation is labelled unverified; nothing unbacked is shown as backed
  - [ ] Every displayed APY/term traces to an attested source and passes narrative verification
  - [ ] Redemption shows honest T+n / lockup state, never instant-if-not-instant
  - [ ] Issuer and token risk is scored by the Risk engine; a sanctioned or blacklisted issuer is hard-blocked

**Doctrine hooks**
  - Doctrine 3 (never fake): attested-only yield, verified-only backing, honest redemption timing — marketing APY is never presented as real return
  - Doctrine 4 (guards fail closed): eligibility and transfer-restriction checks fail closed — unknown means refuse
  - Doctrine 2: the Intelligence engine narrates but never signs; every RWA number is machine-verified against computed or attested facts


#### P10.04 · DeFi Hub
> Say "earn 6% on my USDC, protect me from liquidation" — the hub routes it across every protocol, tracks the position, and defends it through the gate.

World-class is one intent surface for lending, staking, restaking, LPing, and yield strategies that abstracts Aave/Morpho/Compound/Lido/Pendle into positions with live health, impermanent-loss, and liquidation intelligence — and can auto-defend them via policy-bounded automation. It must beat DeFi Saver / Instadapp / Summer.fi on breadth and beat Zapper/DeBank/Zerion on "it doesn't just show the position, it manages and protects it — safely."

**Owns**
  - Strategy-as-intent: "earn / stake / provide liquidity / restake / hedge" compiled into multi-step plans by the Intent Engine
  - Cross-protocol routing via packages/router + Capability Registry (which chain/protocol supports which primitive, at what live health)
  - Unified position model: aggregated positions with health factor, LTV, IL, and reward accrual — Intelligence-computed, bigint-exact
  - Liquidation and risk defense: automation workflows (auto-deleverage, auto-compound, stop-loss) that run through Policy+Risk before any signature
  - Protocol risk vetting: honeypot / unaudited / admin-key / upgradeable detection via packages/risk before entering any position
  - Scenario and what-if: price-shock, IL, and liquidation simulation via packages/intelligence before committing

**Depends on:** Intent Engine, Global Route Optimizer, Capability Registry, Portfolio Intelligence Engine, Universal Security & Risk Engine, Automation & Workflow Engine, Universal Policy Engine

**Interfaces**
  - `Strategy intents (earn, stake, restake, lp, hedge) → ExecutionPlan`
  - `Position model (protocol, chain, healthFactor, ltv, il, rewards) — unified across venues`
  - `Defense workflows (autoDeleverage, autoCompound, stopLoss) bound to Policy caps`
  - `Protocol/pool risk-score surface (Risk engine)`
  - `Scenario / what-if API (price shock, IL, liquidation threshold)`

**Quality bar:** Beats Summer.fi / DeFi Saver on automated position defense and Zerion/DeBank on "manage, not just view" — target: a leveraged position auto-deleverages through the Policy+Risk gate before liquidation, and every entry is pre-vetted for honeypot/admin-key risk.

**Definition of done**
  - [ ] A yield intent routes across at least 3 protocols and picks the best SAFE route (Risk-gated, not merely cheapest)
  - [ ] Positions show bigint-exact health/LTV/IL with honest stale/unavailable states
  - [ ] An auto-deleverage workflow fires only within Policy caps; over-cap actions PARK for approval
  - [ ] Entering a honeypot or unaudited pool is blocked or requires explicit confirmation per Risk policy
  - [ ] Scenario simulation runs before commit and matches on-chain outcome within tolerance
  - [ ] No strategy ever bypasses the Risk+Policy gate — automation included

**Doctrine hooks**
  - Doctrine 2: automation defends positions but always via the gate — a session key with hard caps, never unbounded signing
  - Doctrine 4 (bigint, fail closed): health/LTV/IL are exact bigint; a missing price fails closed (no fabricated health factor)
  - Doctrine 3: unaudited/upgradeable protocol risk is disclosed, not hidden; unavailable data is labelled, not zero-filled


#### P10.05 · AI Economy
> AI agents that transact for you — autonomously, within hard policy caps — where the agent can propose anything but sign nothing beyond what you bounded.

World-class is the safest agentic-commerce substrate on earth: AI agents (yours and third parties') that discover, negotiate, and pay for machine services and each other — every action bounded by a policy-scoped session key with hard caps, every plan cleared by Risk+Policy, and the agent structurally incapable of exceeding its mandate. It must lead the frontier (Coinbase AgentKit, Skyfire, Google AP2, x402) by being the one where the doctrine — AI proposes, code verifies, the bounded key disposes — is architecture, not a promise.

**Owns**
  - Agent identity and mandate: an agent is a policy-bounded principal with a session key, hard caps, and an auditable scope (built on Automation + Policy + Identity)
  - Agent-to-agent and machine-payable API rails (x402-style pay-per-call) settled via Universal Payments
  - The agent marketplace: discover, grant, and revoke agents (built on the AI Agent Framework + Plugin Marketplace), each with a risk/permission disclosure
  - Autonomy within the gate: every agent action runs trigger→conditions→Risk→Policy→session-key execution — never per-transaction key access
  - Agent accountability: an append-only, replayable audit of every agent decision (the Copilot fact-ledger + Policy audit chain)
  - Kill-switch and cap governance: instant revoke, spend caps, cooldowns, and daily limits per agent

**Depends on:** AI Agent Framework, Automation & Workflow Engine, Universal Policy Engine, AI Copilot, Universal Payments, Plugin Marketplace, Universal Identity

**Interfaces**
  - `Agent mandate (scope, caps, session key, expiry) + grant/revoke`
  - `Agent tool registry exposing read|analyze|propose ONLY (no execute) — a ProposedPlan is the sole output`
  - `Machine-payable API contract (pay-per-call, bigint, settled via Payments)`
  - `Agent-to-agent payment + negotiation channel`
  - `Per-agent audit stream + kill-switch API`

**Quality bar:** Beats Coinbase AgentKit / Skyfire / AP2 on safety-by-construction — target: an autonomous agent runs for a week, transacts within caps, and is provably unable to exceed its policy scope or obtain a raw key; every action is replayable from the audit chain.

**Definition of done**
  - [ ] An agent proposes and executes payments ONLY within its policy caps; an over-cap plan PARKS for human approval
  - [ ] No agent ever obtains signing authority beyond its bounded, revocable session key (sandbox-proven)
  - [ ] Every agent action is on the append-only audit chain and replayable
  - [ ] A kill-switch instantly voids an agent's session keys mid-flight
  - [ ] Agent-to-agent and machine-API payments are integer bigint and settle honestly (no optimistic "paid")
  - [ ] A malicious or injected agent instruction cannot escalate scope (fails closed to refuse)

**Doctrine hooks**
  - Doctrine 2 (the architecture's whole reason to exist): agents get propose-only tools + a policy-bounded key; code verifies every action; the bounded, device-authorized key disposes — an agent structurally cannot self-authorize
  - Doctrine 1 (non-custodial): agent keys are on-device-authorized session keys, revocable, never server-held
  - Doctrine 6 (deterministic core, AI at the edges): the LLM plans; the deterministic Policy+Risk gate decides; agent audit is exhaustive


#### P10.06 · Intent Network
> Open the moat into a protocol — a public intent mempool where independent solvers compete to fill you best, and the platform verifies every fill instead of trusting it.

World-class is turning the internal Intent and Solver engines into an open, credibly-neutral network: users broadcast intents, independent solvers compete to satisfy them, and a coordinator independently verifies + reputation-weights + selects the best VALID fill (never trusting a solver's claim). It must beat UniswapX / CoW Protocol / Across / Anoma on generality (any asset, any chain, any action — not just swaps) and on verification rigor, with MEV protection and coincidence-of-wants matching built in.

**Owns**
  - The open Intent standard: a signed, schema-forced intent format (what the user wants, constraints, deadline, max-risk) — chain-agnostic
  - The intent mempool + solver-competition protocol built on packages/solver (collect proposals, independently verify, reputation-weight, select)
  - Independent fill verification: every solver claim is re-simulated/checked deterministically before selection — never trust, always verify
  - Solver economics: bonding, reputation, and slashing for misreported fills, plus a Solver SDK to join the network
  - MEV protection + batch matching: coincidence-of-wants / batch auctions that return surplus to users, not extractors
  - Settlement of winning fills through the Settlement Engine (winner's plan → mandatory pre-flight → wire)

**Depends on:** Decentralized Solver Network, Intent Engine, Global Route Optimizer, Universal Settlement Engine, Universal Security & Risk Engine

**Interfaces**
  - `Intent wire schema (signed, constrained, deadlined) + a public submit endpoint`
  - `Solver SDK: subscribe to intents, propose fills, post bonds`
  - `verifyFill(intent, proposal) → Verified | Rejected (deterministic, independent re-check)`
  - `Reputation + bond/slash ledger`
  - `Batch-auction / CoW matching surface`

**Quality bar:** Beats CoW Protocol / UniswapX on generality (cross-domain intents, not just swaps) and on verification — target: a solver that misreports a fill is provably caught by independent verification and slashed; users capture batch/CoW surplus that centralized routers keep.

**Definition of done**
  - [ ] A user intent is filled by the best independently-VERIFIED solver proposal, not the best CLAIMED one
  - [ ] A misreported fill is caught pre-settlement and slashed (verification is non-skippable)
  - [ ] The Solver SDK lets an external solver join, propose, and get paid without platform trust
  - [ ] Batch/CoW matching returns measurable surplus versus solo routing
  - [ ] A winning fill always passes Settlement's mandatory pre-flight before broadcast (no stale fill wires)
  - [ ] Sanctioned or blacklisted solvers and recipients are hard-blocked by the Risk engine

**Doctrine hooks**
  - Doctrine 2 & 6: solvers propose, deterministic verification disposes — a solver's claim is never trusted; the coordinator can only refuse invalid fills
  - Doctrine 3 (never fake): a fill shown as executed is one independently verified on-chain, not a solver's assertion
  - Doctrine 4 (fail closed): unverifiable proposals are rejected, not optimistically accepted


#### P10.07 · Digital Asset OS
> Stop being an app; be the OS — universal identity, key management, and an app platform that a thousand other wallets and apps are built on.

World-class is the operating system for digital assets: one universal identity across Bitcoin/EVM/Solana, best-in-class key management (passkey + MPC on the roadmap), account abstraction, recovery, and an SDK/embedded-wallet platform others build products on — Apple's OS+App-Store leverage applied to money. It must beat Privy/Dynamic/Turnkey on non-custodial key infra and MetaMask Snaps/WalletConnect on extensibility, while never compromising the on-device-keys doctrine.

**Owns**
  - The universal-identity + key-management substrate: packages/core (scrypt+AES-GCM today → passkey + MPC threshold signing) plus packages/identity (one identity, many chains)
  - Account abstraction + recovery: smart-account primitives, social/passkey recovery, and session-key issuance — non-custodial throughout
  - The developer platform: the TypeScript SDK + White-label engine + Plugin/App model — embedded and branded wallets as first-class
  - The Capability Registry as the OS's device-manager: what every chain/provider/feature supports, live
  - System services exposed to apps: identity, signing (via the gate), balances, intents, and policy — as stable OS APIs
  - Backward-compatible platform versioning so apps built on it do not break

**Depends on:** Wallet Core, Universal Identity, TypeScript SDK, White-label Wallet Platform, Plugin Marketplace, Capability Registry, Web3 Super App

**Interfaces**
  - `WalletManager / signing surface (on-device, gate-mediated) as a stable OS API`
  - `Embedded-wallet + white-label SDK (branding tokens, feature flags per tenant)`
  - `Key-management interface: passkey / MPC / threshold + social recovery`
  - `Capability Registry query API (chain/provider/feature support)`
  - `System-service APIs for apps (identity, balances, intents, policy) with versioned contracts`

**Quality bar:** Beats Privy/Dynamic/Turnkey on "non-custodial by construction" and Vercel on developer experience — target: a third party ships a branded, embedded, non-custodial wallet on the SDK in a day, with MPC/passkey keys that never leave the user's control, inheriting the full Risk+Policy gate for free.

**Definition of done**
  - [ ] A developer stands up a white-label, embedded, non-custodial wallet on the SDK end-to-end
  - [ ] Keys are managed on-device (passkey/MPC path) and provably never server-held
  - [ ] Social/passkey recovery restores identity without any custodian holding a key
  - [ ] Every app built on the OS inherits the Risk+Policy+device-signature gate automatically
  - [ ] The Capability Registry drives dynamic chain/provider support — adding a chain needs no app rewrite
  - [ ] Platform APIs are versioned; an app built on vN keeps working across a minor upgrade

**Doctrine hooks**
  - Doctrine 1 (non-custodial, the OS's spine): keys are generated and used on-device (passkey/MPC), never leave, never server-held — recovery and embedded-wallet paths preserve this
  - Doctrine 2: signing is gate-mediated for every app on the OS; no app gets raw signing authority
  - Doctrine 5 (Apple-grade + WCAG AA): OS-level design and accessibility are platform contracts every app inherits


#### P10.08 · Global Settlement Network
> Scale the Stripe-of-Web3 into global rails — multi-region, netted, liquidity-routed, SLA-backed money movement that always settles or safely says why not.

World-class is the institutional-grade rails beneath every payment and intent: a globally distributed settlement network with netting, liquidity-provider routing, guaranteed-or-parked settlement, deterministic reconciliation, and enterprise SLAs — Visa/SWIFT/CCTP-scale reliability with none of the custody. It must beat Circle CCTP / Fireblocks on cross-chain settlement guarantees and Stripe's infra on global availability, while the settlement engine still never holds a key or a user's funds.

**Owns**
  - The global settlement fabric: multi-region, high-availability orchestration of packages/settlement at scale (built on packages/scale + packages/reliability)
  - Netting and batching: net offsetting flows across users and legs to cut cost and on-chain load, deterministically reconciled
  - Liquidity routing: a liquidity-provider network for instant cross-chain settlement (LP inventory, rebalancing, honest slippage)
  - Settlement guarantees + SLAs: guaranteed-or-parked, with enterprise-grade uptime, latency, and audit commitments
  - Deterministic reconciliation + a replayable ledger across regions (the settlement ledger, globally consistent)
  - Institutional interface: high-throughput settlement APIs and custody-adjacent integrations (still non-custodial) with compliance-attested audit trails

**Depends on:** Universal Settlement Engine, Decentralized Solver Network, Global Scalability, Reliability & Self-Healing, Observability & SRE, Compliance & Governance, Universal Payments

**Interfaces**
  - `High-throughput settlement submission + status stream (guaranteed-or-parked)`
  - `Netting / batch-settlement API + reconciliation report`
  - `Liquidity-provider interface (inventory, quote, rebalance)`
  - `Multi-region ledger + replay/audit API`
  - `Enterprise SLA + settlement-guarantee contract surface`

**Quality bar:** Beats Circle CCTP / Fireblocks on cross-chain settlement guarantees at scale — target: N-region, high-TPS settlement with deterministic reconciliation and an enterprise SLA, where a stale or unsafe settlement always PARKS (never wires) and every settlement is replayable from the ledger.

**Definition of done**
  - [ ] Multi-region settlement sustains target TPS with no double-settlement (idempotency proven at scale)
  - [ ] Netting measurably reduces on-chain cost/load versus per-leg settlement, deterministically reconciled
  - [ ] Liquidity routing settles cross-chain within SLA or PARKS with a precise reason (never strands)
  - [ ] The global ledger is consistent and replayable across regions
  - [ ] Mandatory pre-flight is non-skippable even at scale — no stale plan ever reaches the wire
  - [ ] Enterprise SLA + audit trail meets institutional and compliance requirements

**Doctrine hooks**
  - Doctrine 1 (non-custodial at institutional scale): the network orchestrates settlement but never owns funds or keys — even LPs settle via device-/session-authorized signatures
  - Doctrine 4 (fail closed) + Doctrine 3: guaranteed-or-parked; a stale/unsafe settlement fails closed to PARK; "settled" is on-chain truth, reconciled
  - Doctrine 6: deterministic settlement + reconciliation core; the ledger is replayable and auditable


#### P10.09 · V2 Roadmap
> The living release train for everything after V1 — sequenced bets, explicit kill criteria, and doctrine-preserving migrations, run with Linear's discipline and Stripe's versioning.

World-class is a roadmap that is a governance instrument, not a wish-list: every Future module (P10.01–P10.08) staged behind measurable GA gates, dependency-ordered, with pre-committed kill criteria and a migration path that never breaks the doctrine or a shipped integration. It must beat typical crypto roadmaps (vaporware theatre) by being falsifiable, beat Stripe on API-versioning discipline, and beat Linear on execution cadence.

**Owns**
  - The sequenced V2 roadmap: dependency-ordered staging of P10.01–P10.08 (and Stage-D platform work) with named owners and GA gates
  - Kill criteria and bet discipline: every initiative has pre-committed success metrics and a written kill condition (no zombie projects)
  - Release-train governance: cadence, feature flags (via Compliance/white-label flags), staged rollout, and rollback
  - API and platform versioning: semantic, backward-compatible evolution of the SDK/OS/Payments/Network contracts (no silent breaking change)
  - Migration and upgrade paths: V1→V2 data/identity/plan migrations that preserve keys, history, and the doctrine
  - Doctrine-preservation review: a gate that every roadmap item passes the 6 non-negotiables before GA

**Depends on:** Digital Asset OS, TypeScript SDK, Compliance & Governance, Launch Readiness & Day-2 Ops, Security Audit & Hardening

**Interfaces**
  - `The roadmap register (module → stage → GA gate → owner → kill criteria)`
  - `Release-train + feature-flag rollout process`
  - `SemVer/versioning policy for all public contracts (SDK, OS, Payments, Network)`
  - `Migration runbooks (V1→V2) + a compatibility matrix`
  - `The doctrine-preservation GA checklist`

**Quality bar:** Beats Stripe on versioning discipline and Linear on cadence — target: every Future module ships behind a measurable GA gate with a written kill criterion, no public contract breaks without a version bump + migration path, and nothing reaches GA without passing the doctrine checklist.

**Definition of done**
  - [ ] Each P10.01–P10.08 module has a stage, GA gate, owner, and pre-committed kill criteria on the register
  - [ ] No public API/contract breaks without a version bump and a published migration path
  - [ ] A V1→V2 migration preserves keys, identity, and history with zero custody exposure
  - [ ] Feature-flagged staged rollout + rollback is exercised (not theoretical)
  - [ ] Every GA'd item carries a signed doctrine-preservation checklist
  - [ ] At least one initiative is killed-by-criteria to prove the discipline is real

**Doctrine hooks**
  - All six doctrines: the GA checklist IS the 6 non-negotiables — nothing ships that weakens non-custody, the gate, honesty, bigint money, accessibility, or the deterministic-core boundary
  - Doctrine 3 (never fake): the roadmap itself is honest — falsifiable gates and kill criteria, not vaporware
  - Doctrine 2: versioning never lets a migration quietly grant AI or agent signing authority


#### P10.10 · Vision 2035
> By 2035 everyone just talks to their money — universal, non-custodial, AI-native financial agency — and the wallet has dissolved into an ambient intent layer across every chain, asset, and agent.

World-class is a decade-durable thesis that survives every pivot: financial agency for billions through natural-language intent, where a person (or their agent) says what they want and a non-custodial, AI-native system makes it safe and real across all money. It must be to money what ChatGPT is to knowledge and Apple was to computing — and it holds only if the doctrine holds, so this card owns the invariants that must still be true in 2035.

**Owns**
  - The north-star thesis and the anti-goals — what we will never become: a custodian, a black-box, a yield-casino, or a surveillance ledger
  - The durable invariants: the 6 non-negotiables re-expressed as 2035 promises the whole platform is measured against
  - The measurable civilizational outcomes: reach (billions), self-custody rate, honest-outcome rate, and agent-safety record
  - The horizon bets that P10.01–P10.09 ladder up to (super app, payments, RWA, DeFi, AI economy, intent network, OS, global settlement)
  - The "still true in 2035" test: any major decision is checked against non-custody, the gate, honesty, bigint money, accessibility, and the deterministic-core boundary
  - Narrative and strategy alignment: keeping every team pointed at "talk to your money," not feature sprawl

**Depends on:** V2 Roadmap, Digital Asset OS, AI Economy, Global Settlement Network, Intent Network

**Interfaces**
  - `The vision statement + anti-goals charter`
  - `The 2035 invariants scorecard (doctrine → measurable promise)`
  - `The north-star metric set (reach, self-custody %, honest-outcome %, agent-safety)`
  - `The "still-true-in-2035" decision test applied to major bets`
  - `The strategy narrative that ladders the P10 modules to the thesis`

**Quality bar:** Be to money what ChatGPT was to knowledge work and Apple to computing — target: a 2035 where billions hold their own keys, express intent in natural language, delegate safely to agents, and never once have their funds custodied or their outcomes faked; the invariants scorecard is green every year.

**Definition of done**
  - [ ] The vision + anti-goals are written, adopted, and used to arbitrate real roadmap decisions
  - [ ] The 2035 invariants scorecard exists and is reviewed on cadence (doctrine → measurable promise)
  - [ ] North-star metrics (reach, self-custody %, honest-outcome %, agent-safety) are defined and tracked
  - [ ] Every major bet is checked against the "still-true-in-2035" test before commitment
  - [ ] The P10 modules demonstrably ladder to the thesis (no orphan initiatives)
  - [ ] At least one proposed feature is rejected for violating an anti-goal (the charter has teeth)

**Doctrine hooks**
  - All six doctrines as destiny: the vision IS the doctrine extended to a decade — non-custody, AI-proposes/code-verifies/device-disposes, never-fake, bigint money, accessibility, and the deterministic core are the 2035 promises
  - Doctrine 1 & 2 hardest: the AI-native, agentic thesis is only safe because keys stay on-device and AI can never self-authorize — abandon either and 2035 becomes a custodial surveillance casino the anti-goals forbid
  - Doctrine 3: an honest-outcome rate is a tracked north-star metric, not an aspiration


---

## 7 · Standards — the language every module speaks

**Engineering standards**
- **Language & shape:** TypeScript, strict. A pnpm **monorepo** of small, single-purpose packages with explicit public interfaces. Pure logic in `packages/*`; apps compose.
- **Web:** Vite + React + **one `styles.css`** (class-based; no Tailwind, no router library, no component-kit lock-in). State-based navigation. Premium via a disciplined CSS layer, not a framework.
- **Mobile:** Expo / React Native, sharing the audited core.
- **Money & time:** bigint base units; never float. No `Date.now()`/`Math.random()` inside pure cores that must be deterministic/replayable.
- **Testing:** pure cores unit-tested to exhaustion; real request paths integration-tested; known-answer conformance tests where a standard exists.
- **Boundaries:** LLMs behind schema-forced I/O; deterministic verification always downstream of AI output.
- **Secrets:** never logged, never committed; a leak-scan gate before every commit; build artifacts never in `src/`.

**Design standards (the house style)**
- **Aesthetic:** elegant, modern, premium, calm — Apple × Stripe × Linear × Phantom. Tasteful depth (soft layered backgrounds, subtle gradients, considered shadows, one earned glow), never flat-cheap, never Web2-SaaS, never big empty voids.
- **Colour:** modern indigo primary + electric-violet secondary; emerald/amber/rose for success/warn/danger; soft, layered, AA-contrast in **both** themes.
- **Type:** SF Pro / Inter / Geist-grade hierarchy — perfect weights, tracking, and rhythm on an 8px system.
- **Motion:** 150–250ms, GPU-accelerated, `prefers-reduced-motion` aware; page/skeleton/success/error transitions.
- **Never fabricate UI for features that don't exist.** Design the real screen premium instead.

---

## 8 · The Module Ritual — building any one of the 100

For each module, in order:

1. Open its **card** in §6 — internalise mission, owns, interfaces, quality bar, done-definition, doctrine hooks.
2. Run the **Loop** (§3) end to end; convene the **Council** members the card implicates.
3. Hold the work to every applicable **Bar** (§4); let **Security veto** anything touching keys/funds/data.
4. Speak the **Standards** (§7) — code that reads like the codebase, design that matches the house style.
5. Ship only when the card's **done-definition** is checked *and verified by driving it*, then **document** (ADR + memory + card status).
6. Respect dependencies (§5): never build a layer on an unfinished, un-audited layer beneath it.

---

## 9 · The Living Mechanism — how this spec stays true

- **This document is versioned.** Material changes bump the version and are recorded as **ADRs** (Architecture Decision Records) — the *why* behind every irreversible choice.
- **Memory over repetition.** Non-obvious facts (a gotcha, a chosen trade-off, a doctrine clarification) are captured so the next session inherits them instead of rediscovering them.
- **Drift is a defect.** If code and spec disagree, that is a bug in one of them; reconcile deliberately. The spec is not decoration — it is the contract.
- **Scorecards, not vibes.** Progress is tracked per module against its done-definition. "In progress" is honest; "done" is earned and verified.

---

## 10 · North Star & Vision

**Mission:** make self-custody of money as easy as talking — and as safe as a bank vault you alone hold
the key to. You say what you want; the wallet plans it, proves it safe, and your device does it — across
every chain, under one identity, with the polish of the best product you use all day.

**The test we hold ourselves to:** *can a stranger, non-technical, move real money across chains by
typing one sentence — and never once be lied to, never lose funds, and enjoy it?* When that is true at
scale, audited and honest, Intent Wallet V3 is not competing with wallets. It is the interface layer
for on-chain money — Crypto's ChatGPT × Apple Wallet × Stripe.

---

## Appendix A · The Master Prompt (V3)

This is the one prompt that activates everything above. Paste it at the start of a build session (or set
it as the project's system prompt). It loads the Council, the Doctrine, and the Loop, and points every
task at the module cards in §6. It replaces the old 100 separate prompts: **one philosophy, orchestrated.**

```text
You are the founding team of INTENT WALLET V3 — the AI-native, non-custodial wallet whose promise is
"talk to your money." Not a MetaMask clone; the north star is Crypto's ChatGPT × Apple Wallet × Stripe:
conversational intent UX with Apple-grade craft on Stripe-grade rails.

━━ WHO YOU ARE ━━
You are not "a coder." You convene a COUNCIL and wear the right hat for the moment, out loud
("as the Principal Security Engineer, I object because…"):
• Founder & CEO — owns the why and the no; final call; guards the north star.
• Chief Product Officer — vision → ruthless sequenced roadmap.
• Staff Product Designer (Apple-level) — owns the feeling: pixel, type, motion, restraint.
• Principal UX Researcher — owns the truth about users; kills assumptions with evidence.
• Principal Blockchain Architect — keys, signing, chains, settlement; money is bigint; guards fail closed.
• Principal Security Engineer — the threat model and a HARD VETO on anything touching keys/funds/data;
  only the CEO overrules, and only in writing (an ADR).
• Principal AI Engineer — the intent pipeline + agents; LLM at the edges behind schema-forced boundaries.
• Principal Backend / Frontend / Mobile / SRE / Performance / DevOps Engineers — own their surface to a
  world-class bar.
Ties break toward the Doctrine, then the user, then the simpler thing.

━━ THE DOCTRINE (unbreakable) ━━
1. NON-CUSTODIAL: keys/seed live and are used ON-DEVICE, encrypted; never leave the device, never hit a
   server. If a feature needs the server to know a secret, redesign the feature.
2. AI PROPOSES, DETERMINISTIC CODE VERIFIES, THE DEVICE SIGNATURE DISPOSES. AI has no signing authority;
   a pure, exhaustively-tested gate between plan and wire can only REFUSE.
3. NEVER FAKE DATA: honest empty/loading/error; network-fail ≠ $0; nothing shown "confirmed/real" that
   didn't happen on-chain; testnet labelled testnet, capped mainnet labelled capped.
4. MONEY IS INTEGER BIGINT end-to-end; format only at the edge.
5. FAIL CLOSED: what can't be positively verified is blocked; irreversible actions need informed confirm.
6. APPLE-GRADE DESIGN + WCAG AA + tasteful reduced-motion-aware motion are acceptance criteria, not polish.
7. DETERMINISTIC CORES, AI AT THE EDGES; every risky decision logged + auditable.

━━ HOW YOU WORK (the Loop — every stage has a gate; do not skip) ━━
Think → Research → Critique → Design → Review → Implement → Test → Security Audit → Performance Audit →
UX Audit → Refactor → Document.
• Think: sharpen the goal + the module's definition-of-done.
• Research: read the existing monorepo + the best-in-class competitor; never reinvent.
• Critique: write the top 3 ways this leaks keys / loses precision / lies to the user / breaks on failure.
• Design: interfaces + all states (empty/loading/error/partial/success) + the FEELING, before code.
• Review: Council signs off; Security may veto.
• Implement: code that reads like the surrounding code; small honest commits; type-checks clean.
• Test: pure cores to exhaustion incl. adversarial inputs; real path integration-tested; each failure
  mode from Critique has a test.
• Security / Performance / UX Audits: re-derive the threat model; measure don't guess; drive the real
  flow as a first-time user in light AND dark, keyboard-reachable, AA, reduced-motion-safe, delightful —
  prove it with a screenshot/recording.
• Refactor + Document: leave it better than average; ADR for every real decision; update the module card;
  record the non-obvious in memory.
VERIFY BEFORE YOU CLAIM: "done" is earned by driving the actual thing, not a green type-check. If tests
fail, say so with output. If you skipped a step, say which.

━━ WHAT YOU BUILD ━━
Intent Wallet V3 is 100 modules across 10 phases (Product & Design · Wallet Foundation · Intent Platform ·
Security · AI · Platform · Infrastructure · Business · Company · Future). For the module in play, open its
CARD in the Living Master Specification §6 (mission · owns · interfaces · quality bar · done-definition ·
doctrine hooks) and execute against it. Respect the dependency stack: never build a layer on an
un-audited layer beneath it. Build bottom-up for trust, top-down for meaning.

━━ STANDARDS ━━
TypeScript strict; pnpm monorepo of small pure packages. Web = Vite + React + ONE styles.css (no
Tailwind/router lib); Mobile = Expo. Design = indigo/violet, 8px system, SF Pro/Inter hierarchy, both
themes with equal care, never AI-generic, never fabricate UI for features that don't exist.

Now: state which module you are building, open its card, and run the Loop. Wear the hats out loud.
Refuse to fake, refuse to leak a key, refuse to ship ugly. Ship world-class or don't ship.
```

**How to drive it.** Say *"Build P2.01 Wallet Core"* (or any module id) and Claude runs the full Loop as
the Council, against that card, to the Bars. For a whole phase, say *"Execute Phase 4 — Security,
module by module."* For a decision, ask the specialist by name. The spec keeps 100 sessions coherent
because they all descend from this one prompt and these same cards.
