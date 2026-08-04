[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Volume VII — the long-form behind [Chapter 10 — Security & Trust Engine](../bible/chapter-10-security-trust-engine.md)

# The Security & Trust Engine Reference

*The buildable expansion of Chapter 10's charter — security as a core product capability — grounded in the real risk/policy/guard, with **every control tagged ✅ shipped / 🔶 partial / ⏭ roadmap.** This document carries the Principal Security Engineer's veto and **never claims a control it does not run.***

**About this document.** [Chapter 10](../bible/chapter-10-security-trust-engine.md) is the memorize-it
charter. This is its **reference spec**: the threat model, transaction simulation, contract/scam/phishing
detection, wallet reputation & address verification, approval management, the risk engine & score,
behavioral anomaly detection, device & session security, and emergency/recovery + explainable risk reports —
each honestly tagged. The invariants never move: **keys never leave the device · the AI never signs · guards
fail closed · nothing bypasses the security engine.**

| § | Section | Grounded in |
|---|---|---|
| 1 | Security Architecture & Threat Model | `SECURITY.md` + the wallet-core threat model |
| 2 | Transaction Simulation | the pre-sign simulation seam |
| 3 | Contract Risk & Scam/Phishing Detection | `packages/risk` detectors (much roadmap) |
| 4 | Wallet Reputation & Address Verification | `packages/chains/guard.ts` (EIP-55, shipped) |
| 5 | Approval Management | the allowance-revoke tool (shipped) |
| 6 | The Risk Engine & Risk Score | `packages/risk` + `runtime/policy` |
| 7 | Behavioral Anomaly Detection | device trust (shipped) + AI (roadmap) |
| 8 | Device Trust & Session Security | `SessionManager` + the mainnet guard + JWT revocation |
| 9 | Emergency, Recovery & Explainable Risk Reports | `SECURITY.md` IR + the guard's refusals |

Honesty first: every control's real state is tagged; overclaiming a security control is the worst failure
this document can commit.

---

## §1 · Security Architecture & Threat Model

> **This section is the foundation the rest of Chapter 10 stands on.** It states the adversaries we
> design against, the assets they want, the boundaries that contain them, and the invariants that hold
> across every layer. §2–§9 each detail one layer of the defense — transaction simulation (§2), contract
> and scam/phishing risk (§3), wallet reputation and address verification (§4), approval management (§5),
> the Risk Engine and Risk Score (§6), behavioral anomaly detection (§7), device trust and session
> security (§8), emergency freeze and explainable risk reports (§9). Read this first; the others assume it.
>
> **Status legend (carried from [`SECURITY.md §0`](../../SECURITY.md)):** ✅ **Shipped** — implemented
> *and tested* in-repo, cited by file. 🔶 **Partial** — real on one surface/env, gaps named. ⏭ **Mandated
> (roadmap)** — a binding requirement with a landing phase, *not* a claim it runs today. Per Doctrine law #3,
> a security document that claims a control it does not run is itself a lie. Every control below carries its
> **real** state. The Principal Security Engineer signs only what is true.

---

### 1.1 · The thesis — security is a product capability, not a wrapper around one

Most wallets treat security as a perimeter: a lock screen, a seed-phrase warning, and a hope that the user
reads the hex before they tap "Confirm." That model fails at exactly the moment it matters, because it asks
the least-equipped party — a non-technical human, mid-transaction, wanting to be done — to be the last line
of defense against an adversary who spent weeks engineering the trap. Our promise is the opposite of that:
*"talk to your money, never be lied to, never lose funds."* The second clause is not marketing; it is an
engineering specification, and it means **the wallet must understand the danger before the user does, and
must be able to refuse on their behalf.**

So in Intent Wallet, security *is* a feature the user experiences — a Risk Score they can read, a plain-
English reason a transfer was blocked, a simulation of what a signature will actually do — not an invisible
layer they only notice when it fails. This reframes the whole chapter: the Risk Engine (§6), simulation
(§2), and phishing detection (§3) are not back-office plumbing; they are the product surface where trust is
earned, one decision at a time. The architecture exists to make that surface *honest* — everything it shows
is deterministically derived and auditable, and nothing it can't verify is ever dressed up as safe.

The design also refuses a false comfort. We do not claim to protect a fully-owned, unlocked device with the
wallet open — no hot wallet can, and §1.4 says so plainly. We shrink that window; we never lie about closing
it. Honesty about what we *cannot* do is not a hole in the posture — it *is* the posture.

---

### 1.2 · Defense in depth — six layers, each of which fails closed

The architecture is a series of independent gates between an intent and an irreversible on-chain action.
No single layer is trusted to be sufficient; each is designed so that its *failure* denies the action rather
than permitting it. An attacker must defeat **all** of them, in order, and every one of them can only ever
**refuse** — none holds a key, none can be talked into signing.

```
  What the user says ("send 0.2 ETH to alice.eth")
        │
        ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │ L0  DEVICE / KEYSTORE   keys on-device, scrypt+AES-256-GCM vault,       │  §8, Ch6
  │     the seed never leaves — the root asset lives behind this line       │
  ├───────────────────────────────────────────────────────────────────────┤
  │ L1  AI ↔ DETERMINISTIC BOUNDARY   the model emits only intent-schema    │  Ch7, Ch9
  │     JSON; it has NO fund-moving tool. Worst hijack = a rejectable plan  │
  ├───────────────────────────────────────────────────────────────────────┤
  │ L2  RISK ENGINE + POLICY ENGINE   composite score + most-restrictive   │  §3–§7
  │     policy → allow / require_confirmation / block                       │
  ├───────────────────────────────────────────────────────────────────────┤
  │ L3  SIMULATION   what will this signature actually do? (pre-sign)       │  §2
  ├───────────────────────────────────────────────────────────────────────┤
  │ L4  BROADCAST GUARD   pure, total gate: EIP-55, unknown-chain block,    │  Ch7/Ch8
  │     mainnet ACK + spend cap — the last deterministic refusal            │
  ├───────────────────────────────────────────────────────────────────────┤
  │ L5  USER CONFIRMATION   decoded, human-readable effects on the confirm  │  Ch4, §2
  │     sheet — comprehension precedes signature                            │
  ├───────────────────────────────────────────────────────────────────────┤
  │ L6  DEVICE SIGNATURE   the sole disposer of funds — the human's key     │  L0
  ├───────────────────────────────────────────────────────────────────────┤
  │ AUDIT   every risky decision (risk verdict, policy denial, guard block, │  §9
  │         auto-exec) logged with inputs + reason — spans all layers       │
  └───────────────────────────────────────────────────────────────────────┘
```

The ordering is deliberate: cheap, certain refusals come first (an unknown chain or a malformed address
never reaches simulation), and the *human* decision (L5→L6) comes last, after every machine that could
inform it has spoken. This is the doctrine — *AI proposes, deterministic code verifies, the device signature
disposes* — expressed as a pipeline.

**Layer states, honestly tagged:**

| Layer | Control | State | Where |
|---|---|---|---|
| L0 | On-device keystore, scrypt+AES-256-GCM vault, per-op zeroize | ✅ | [`packages/core`](../../packages/core) — 115-test conformance suite; native Keychain/StrongBox wrap ⏭ Phase 8 |
| L1 | Schema-forced LLM boundary (no fund-moving tool) | ✅ boundary; ⏭ red-team CI corpus | [`parser.ts`](../../packages/intents/src/parse/parser.ts), Ch7 |
| L2 | Risk Engine (composite score + detectors) | ✅ engine | [`packages/risk/src/engine.ts`](../../packages/risk/src/engine.ts) |
| L2 | Policy Engine (most-restrictive-wins) | ✅ | [`packages/policy/src/engine.ts`](../../packages/policy/src/engine.ts) |
| L2 | **Live threat-intel feed** (sanctions/scam/phishing) | ⏭ default is `emptyThreatIntel`; signed-snapshot sync is roadmap | [`intel.ts`](../../packages/risk/src/intel.ts) |
| L3 | Pre-sign transaction simulation | 🔶 surfaced; deep decode maturing (§2) | Ch8, §2 |
| L4 | Broadcast guard (EIP-55, unknown-chain, mainnet ACK, spend cap) | ✅ | [`guard.ts`](../../packages/chains/src/guard.ts) |
| L5 | Decoded human-readable confirm sheet | 🔶 (Ch4/§2) | Ch4 |
| L6 | Device signature (exact bytes) | ✅ | [`signing/signer.ts`](../../packages/core/src/signing/signer.ts) |
| Audit | Structured, reason-carrying decision logs | ✅ logs; ⏭ tamper-evident hash chain | [`packages/policy/src/audit.ts`](../../packages/policy/src/audit.ts), §9 |

> **The critical honesty note for L2:** the Risk Engine *machinery* is shipped and tested — the composite
> scoring, the heuristic detectors, the policy verdict. What is **roadmap** is the *live intelligence that
> feeds it*: the default threat-intel source knows nothing ([`emptyThreatIntel`](../../packages/risk/src/intel.ts)),
> and the production feeds (sanctions lists, scam registries, phishing domains, distributed as *signed*
> snapshots) are not yet wired. "The engine exists" is not "the product ships a live scam database." §3, §4,
> and §6 carry this distinction control-by-control; do not read a ✅ on the engine as a ✅ on the data.

---

### 1.3 · Assets, ranked by blast radius

The whole architecture bends around one asymmetry: **exactly one asset is catastrophic, and by construction
it never leaves the device.** Everything a server holds is a privacy or availability concern — never, by
construction, a path to fund loss.

| Rank | Asset | Compromise means | Where it lives |
|---|---|---|---|
| 1 | **Seed / mnemonic & derived private keys** | Total, irreversible fund loss | Device only — encrypted vault at rest; RAM only while unlocked ([`packages/core`](../../packages/core)) |
| 2 | **The signing decision** (what the user approves) | Funds sent somewhere unintended | The confirm sheet — *the* trust boundary |
| 3 | **Session credentials** (SIWE JWT, refresh) | Impersonation; read of one user's portfolio/watch-list | Client storage + server verify path ([`services/api/src/auth`](../../services/api/src/auth)) |
| 4 | **User privacy data** (addresses, balances, history, intents) | Deanonymization, targeting | Backend datastores |
| 5 | **Platform integrity** (routing config, token registry, LLM templates, **threat-intel feeds**) | Systemic mis-routing, injection or *mis-scoring* at scale | Admin plane |

Note asset #5 for this chapter specifically: a poisoned threat-intel feed could either *unblock* a scam or
*block* a safe asset. That is why the mandated feed design distributes **signed** snapshots that are
integrity-verified before load ([`intel.ts`](../../packages/risk/src/intel.ts)) — the security data is
itself a trust boundary, and until that signing/verification path ships it stays ⏭.

---

### 1.4 · Adversaries we design against

We name the attacker explicitly so every control in §2–§9 can be traced to *whom* it stops and *what* it
protects. Benchmarks in brackets are the best-in-class controls this chapter measures itself against.

| Adversary | Goal | Primary asset targeted | Where it's countered |
|---|---|---|---|
| **Remote network attacker / MITM** | Tamper with traffic in flight, forge a response | #2 signing decision, #4 privacy | TLS 1.3+HSTS (🔶); cert pinning ⏭ apps |
| **Malicious dApp / counterparty / venue** | Craft a payload or quote that makes you sign harm | #1 funds via #2 | Simulation §2 [Rabby/Blowfish-class pre-sign], Risk Engine §6, guard §L4 |
| **Malicious contract** (honeypot, hidden admin, fee-on-transfer, unlimited-approval drainer) | Trap funds after a signature looks benign | #1 funds | Contract-risk detectors §3, approval management §5 [Pocket Universe / Wallet Guard] |
| **Phishing site / lookalike** | Trick a signature or a seed reveal | #1 seed, #2 decision | Phishing/reputation §3–§4 [Wallet Guard], seed-reveal re-auth §8 |
| **Prompt injector** | Plant instructions in intent text / token names / on-chain metadata to hijack the AI | #1 funds via the AI | L1 schema-forced boundary (Ch7); input is data, never a tool call |
| **Compromised / stolen device** | Read keys or forge intent locally | #1 seed | Vault at rest ✅, auto-lock ✅, OS-keystore wrap ⏭ Phase 8 (§8) |
| **Malicious RPC / aggregator / price feed / LLM (Zone 4)** | Lie to the wallet to skew a decision | #2 decision, #3 availability | Every external input validated, bounded, treated as attacker-controlled; provider-health risk §6 |
| **Supply-chain / malicious dependency** | Ship a key-stealing build | #1 seed | Minimal `@noble`/`@scure` only, lockfile-only, no `postinstall` ✅; SAST/OSV/cosign ⏭ |
| **Server-side attacker / rogue insider** | Pop a service and move funds | *cannot reach #1* | Zones + least-priv; server **cannot sign** (§1.5) |
| **Local attacker on an unlocked device with the wallet open** | Read the live keyring | #1 seed | *Honestly uncloseable for any hot wallet* — window shrunk, not zero (§1.4 residual) |

**The residual we refuse to hide.** Against the last row, no hot wallet wins: while unlocked, keys are in
the JS heap and malware with process-memory access can read them. We say so ([`SECURITY.md §3.3`](../../SECURITY.md),
[wallet-core §7](../security/wallet-core-threat-model.md)). Mitigations shrink the window — auto-lock,
per-operation zeroize in a `finally` block ([`signer.ts`](../../packages/core/src/signing/signer.ts)),
keyring destroyed on lock — and moving signing behind native secure hardware is ⏭ Phase 8. This is out of
scope for the bug bounty precisely because it is honestly documented, not because it is unimportant.

---

### 1.5 · Trust boundaries — signing authority lives in exactly one place

```
 Zone 0 — DEVICE (highest trust)          Zone 1 — Edge     Zone 2 — Services      Zone 3 — Data      Zone 4 — External (hostile)
 ┌──────────────────────────────┐         ┌──────────┐      ┌───────────────┐      ┌───────────┐      ┌──────────────────────┐
 │ keys · vault · signing        │ ─sig──▶ │ gateway  │ ───▶ │ intent/exec/  │ ───▶ │ PG/Redis  │      │ RPCs · aggregators   │
 │ (@intent-wallet/core)         │  only   │ WAF/WS   │      │ risk/policy   │      │           │ ◀──▶ │ LLM · price feeds    │
 │ CONFIRM SHEET = trust boundary│ ◀approval│         │      │ (CANNOT SIGN) │      │           │      │ chains · intel feeds │
 └──────────────────────────────┘         └──────────┘      └───────────────┘      └───────────┘      └──────────────────────┘
         ▲ key material NEVER crosses this line ▲       the only bytes that leave Zone 0 are SIGNATURES and OPAQUE VAULT CIPHERTEXT
```

The invariant, stated as a testable rule: **the only bytes that ever leave Zone 0 are (a) signatures and
(b) opaque vault ciphertext.** Neither can be reversed into a key. A breach of Zones 1–3 is a
privacy/availability incident — *never* fund loss. Zone 4 is assumed adversarial by default: RPC responses,
quotes, token metadata, LLM output, and threat-intel snapshots are all validated, bounded, and treated as
attacker-controlled. Note where the Risk and Policy engines sit — **Zone 2, the untrusted-to-sign tier.**
They *evaluate and authorize*; they never hold a key and never dispose of funds
([`engine.ts` header](../../packages/risk/src/engine.ts): *"It EVALUATES and AUTHORIZES; it never signs
and never holds funds"*). A fully-compromised Risk Engine can, at absolute worst, wave a bad transaction
*through to the confirm sheet* — where the guard (L4) and the human (L5) still stand. It cannot itself move
money. This is why we can run risk logic server-side as a "security-as-a-service" surface without expanding
the fund-loss blast radius.

---

### 1.6 · The core invariants — what no change in §2–§9 may break

These are the security-load-bearing subset of the [Doctrine](../../CLAUDE.md#3--the-doctrine--laws-no-change-may-break).
A change that violates one is **wrong even if it works**, and is reverted. Every subsequent section of this
chapter is an instantiation of these; none may weaken one.

| # | Invariant | Made concrete by | State |
|---|---|---|---|
| I1 | **Keys never leave the device.** No code path transmits a key; `packages/core` has *no network I/O* (lint/review-enforced). | Vault ([`vault.ts`](../../packages/core/src/vault.ts)), per-op zeroize ([`signer.ts`](../../packages/core/src/signing/signer.ts)) | ✅ |
| I2 | **The AI never signs.** The model emits only intent-schema JSON; there is no fund-moving tool. Worst hijack = a rejectable proposal. | Schema-forced parse ([`parser.ts`](../../packages/intents/src/parse/parser.ts)), Ch7 | ✅ boundary; ⏭ red-team CI |
| I3 | **Fail closed.** Anything a gate cannot *positively* verify — unknown chain, malformed address, unpriced asset, unparseable intent — is blocked, never waved through. | Guard ([`guard.ts`](../../packages/chains/src/guard.ts)), risk hard-block, policy most-restrictive-wins | ✅ |
| I4 | **Every risky decision is auditable.** Risk verdict, policy denial, guard block, and auto-execution are logged with their inputs and reason. | Policy audit ([`audit.ts`](../../packages/policy/src/audit.ts)) | ✅ structured logs; ⏭ tamper-evident chain (§9) |
| I5 | **Never fake a control.** A claimed control must actually run; a tag is its real state. Network-fail ≠ safe. | This chapter's status tags; [`SECURITY.md §0`](../../SECURITY.md) | ✅ (discipline) |

**How "fail closed" (I3) shows up as code, three times over**, so it is not a slogan:

- The **broadcast guard** returns `ok: false` and refuses on an unknown chain, a malformed or bad-checksum
  EVM recipient, or an unacknowledged mainnet send — the block list is non-empty, so `assertBroadcastAllowed`
  *throws* rather than proceeding ([`guard.ts`](../../packages/chains/src/guard.ts)).
- The **Risk Engine** treats any single hard signal (severity ≥ 0.99 — sanctioned, blacklisted, honeypot,
  malicious contract) as a **forced block regardless of the composite score**
  ([`scoring.ts`](../../packages/risk/src/scoring.ts)); the composite itself is a probabilistic-OR
  (`1 − Π(1 − sᵢ)`) so many small risks compound upward, never cancel out.
- The **Policy Engine** composes with risk under **most-restrictive-wins** and returns a single
  `ExecutionPermission` — callers read `permission.gate` / `permission.mayProceedToSign`, never the two
  verdicts in isolation, precisely so a lenient layer can't override a strict one
  ([`engine.ts`](../../packages/policy/src/engine.ts), [`decision.ts`](../../packages/policy/src/decision.ts)).

The unifying property: at every gate, the *absence* of a positive verdict is a denial. There is no default-
allow path anywhere in the chain from intent to wire.

---

### 1.7 · How this frames the rest of Chapter 10

Each following section takes one layer of §1.2 and drives it to depth — always tagging real vs roadmap,
always tracing a control to the adversary (§1.4) and asset (§1.3) it defends, always showing how it fails
closed (§1.6 I3). Where a section describes a control that is not yet shipped — a live scam/phishing database
(§3), wallet-reputation scoring (§4), behavioral-anomaly AI (§7), an emergency freeze/kill-switch as a
shipped feature (§9), hardware wallets and the pre-GA third-party audit + bug bounty — it says so in the same
breath, because **overclaiming a security control is the worst failure this chapter can commit.** What is
*real today* is the deterministic spine: the broadcast guard, the Risk and Policy engines, pre-sign
simulation surfaced to the user, the approval/revoke tool (§5), and device/session security (§8). That spine
is what earns the signature at L6. The intelligence that will make it sharper is coming, honestly labelled
until it lands.

> **Section invariant.** If a later section and this one disagree about a control's state, one of them is a
> defect — reconcile it on purpose, never drift. The Principal Security Engineer signs §1 as true today; the
> ⏭ items are promises, not present tense.


## §2 · Transaction Simulation

> *"See before you sign."* The single most valuable second in a wallet's life is the one **before** a
> signature exists. A signed transaction is a bearer instrument on an irreversible ledger; a simulation is
> the only chance to turn *"I think this does what I asked"* into *"I can see what this does."* This section
> specifies what our simulation seam predicts, where it runs in the flow, and — held to Doctrine #3 — exactly
> **which parts are shipped and which are roadmap.** A simulation that lied would be worse than none, because
> it would launder a bad transaction into a trusted one. So every claim here is tagged with its real state.

**Status legend** (per `SECURITY.md`): ✅ Shipped (implemented **and** tested in-repo — file cited) · 🔶
Partial (one surface/env; gaps named) · ⏭ Mandated/roadmap (binding requirement + landing phase; **not** a
claim it runs).

---

### 2.1 · What simulation is — and what it is not

Simulation is a **prediction**: run the candidate transaction against current chain state *without*
broadcasting it, and report the effects the user is about to authorize — **expected output, fees (gas ·
bridge · DEX), price impact, slippage / minimum-received, ETA**, and — the north-star target — the full
**asset-change diff** (which balances go up, which go down, which approvals are granted). This is Ch7 §12's
Simulation Layer surfaced *before* the device signs, and it is the pre-sign contract every serious wallet
now offers (Rabby's pre-sign panel, Blowfish/Wallet Guard, Pocket Universe).

It is **not** a verdict, and it is **not** truth. Three hard boundaries define what simulation may claim:

- **A simulation is a prediction, labelled as such.** It is computed against a *snapshot* of state; the
  chain can move between the prediction and the broadcast. The UI must never render a predicted effect with
  the visual language of a settled one. Nothing is "confirmed / received" until it settles on-chain
  (**Ch8 §17 Settlement Verification**, §12 Confirmation) — "success means the intended outcome was
  achieved, not just that a transaction was broadcast."
- **Simulation authorizes nothing.** Per Doctrine #2, the AI proposes and the simulator predicts, but only
  the **deterministic guard** (`packages/chains/src/guard.ts`) can refuse and only the **device signature**
  disposes. A green simulation is a *reason to trust*, never a bypass of the guard, the risk verdict (§6),
  or the user's confirmation.
- **Simulation fails closed.** A simulation that cannot run, times out, or returns effects that don't match
  the plan is **not** a pass — it aborts the step (2.4). An attacker who can make the simulator *fail*
  must not thereby make the wallet *sign blind*.

---

### 2.2 · The shipped simulation seam — the Execution Sandbox

Our production-wired simulation surface is the **Execution Sandbox**: a mandatory `simulating` state that
every step passes through *before* it can be broadcast, inside the execution state machine.

- **✅ Shipped — the sandbox gate.** The engine runs each step through `simulate → broadcast → confirm →
  verify` (`packages/execution/src/engine.ts` `#runStep`). The step enters `status = 'simulating'`
  (`packages/execution/src/state.ts`), the driver's `simulate()` is awaited, and **if the result is not
  `ok` the step is set `failed` and the execution PARKS — it is *never* broadcast, and a simulation mismatch
  is explicitly *never retried*** (`engine.ts`; `SimulationResult` in `packages/execution/src/driver.ts`).
  Parking (never stranding funds) is Ch8's recovery philosophy. This is the concrete realization of "a pure
  gate can only refuse."
- **✅ Shipped — the deterministic structural simulator.** The wired simulator
  (`packages/runtime/src/demo.ts` `demoSimulator`, seam typed in `packages/runtime/src/execution.ts`
  `StepSimulator`) re-checks the step's structural invariants offline and pure: the step must carry a target
  chain, and **a swap or bridge must carry a minimum-received guarantee (`plan.quote.youReceiveMin`) or it
  is refused** — an unbounded-slippage swap can never reach the wire. Being pure and total, it cannot itself
  become an attack surface.
- **✅ Shipped — the real EVM revert preflight.** On the browser wallet's live Sepolia swap path, before
  signing we run a real `eth_call` against the router with the exact calldata; **a guaranteed revert throws
  `"swap would revert … — not broadcasting"` and no signature is produced**
  (`apps/web/src/broadcast.ts`). Gas is likewise probed with `eth_estimateGas`, with a safe fallback when
  the node can't simulate (low balance). This is a genuine on-chain dry-run: the transaction is priced and
  its success is checked against current state before a key ever touches it.
- **✅ Shipped — the pre-sign quote preview.** The planner emits the human-facing prediction the user reads
  before approving — `youSend`, `youReceiveMin`, `totalFeeMicros`, `feePct`, `slippageBps`, `etaSeconds`
  (`packages/intents/src/plan/planner.ts`; schema `packages/intents/src/schema.ts`) — surfaced in the
  confirm flow (web/mobile tx preview; task #79). This is Ch7 §12's expected-output / fee / slippage / ETA
  panel, shown *before* the signature.
- **🔶 Partial — the RPC simulation provider seam.** A pluggable `SimulationProvider` is a first-class
  provider kind (`packages/providers/src/provider.ts`: `kind: 'simulation'`, `simulate(request) →
  { ok, reason? }`), health-scored and swappable like any other provider. The **seam exists and is wired**
  (optional `simulator` through `services/api/src/routes/v1/intents.ts` and the runtime driver). **Gap:** the
  default wired simulator is the deterministic/offline structural one; the contract today returns a
  pass/refuse **boolean with reason**, *not* an itemized effects diff. A production RPC simulator that
  returns full simulated effects is a drop-in for this seam but is not the shipped default.

| Attack / failure | What it tries | Defense (shipped) | Fails closed by |
|---|---|---|---|
| Unbounded-slippage swap | sign a swap with no floor, get sandwiched | sandbox refuses a swap/bridge lacking `youReceiveMin` (`demo.ts`) | step parks, never signed |
| Router revert / bad calldata | broadcast a tx that reverts, burning gas | `eth_call` preflight before signing (`broadcast.ts`) | throws "not broadcasting" |
| Step with no target chain | slip a malformed step past the machine | sandbox requires `step.chainId` (`demo.ts`) | `ok:false` → park |
| Simulator outage | force a blind sign by breaking the simulator | mismatch/failure is not a pass; step parks (`engine.ts`) | never broadcast |

---

### 2.3 · The honesty rule — predicted vs confirmed

The most dangerous UI lie a simulator can tell is to render a *prediction* as a *fact*. Our rule, binding
on every surface:

1. **Predicted effects are labelled predictions.** The confirm screen shows "you'll receive **at least**
   `youReceiveMin`", estimated fees, and estimated ETA — framed as estimates, never as balances that have
   changed. Balances on the portfolio/activity surfaces reflect only **settled, on-chain** reads (and a
   network failure is shown as *unknown*, never `$0` — the fail-soft honesty rule).
2. **"Confirmed" requires settlement, not broadcast.** A step is `confirmed` only after the Confirmation
   Engine sees sufficient on-chain confirmations (Ch8 §12) and Settlement Verification passes — assets
   received, balances updated, activity recorded (Ch8 §17). Until then the progress timeline shows the
   honest intermediate state; the wallet never claims an outcome the chain hasn't produced.
3. **Post-settlement, invariants are re-checked against reality.** After confirmation the engine runs
   `verify()`; if the realized effect fails the plan's promise (e.g. received `< youReceiveMin`) the step is
   `failed` and the execution **parks** — funds moved but not as promised is a stop, not a shrug
   (`engine.ts`). **🔶 Gap to name:** the execution engine *wires* this verify→park path and the browser
   swap path enforces `amountOutMinimum` on-chain, but the runtime driver's `verify()` is currently a
   **stub returning `ok:true`** with an explicit TODO to assert `received ≥ youReceiveMin` once the gateway
   surfaces effects (`packages/runtime/src/execution.ts`). Until that lands, realized-vs-promised
   enforcement rides on the on-chain `amountOutMinimum` and confirmation/revert checks, **not** on a driver
   effect-assertion. This is disclosed, not hidden.

---

### 2.4 · Re-simulation and abort — a stale prediction is a blocked step

A prediction made at plan time is worthless if state has moved by sign time. This is the classic multi-step
attack: approve a plan while a pool is healthy, then have the pool drained (or the approval front-run) before
the swap signs. Ch8 §21 (Security Integration) mandates that before each critical step the engine **"confirm
the simulation still matches current conditions … abort if risk exceeds the user's configured limits."**

- **✅ Shipped — re-simulate per step, at execution time.** The engine calls `simulate()` inside `#runStep`
  **for each step, immediately before that step's broadcast** — not once at plan time (`engine.ts`). A plan
  approved a minute ago is re-checked against *now* right before the signature. On a swap whose
  minimum-received guarantee has gone missing, or a step whose invariants no longer hold, the sandbox
  returns `!ok` and the step parks. The abort is the default outcome of any non-match: **there is no path
  from a failing simulation to a broadcast.**
- This composes with the guard (`guard.ts`) and the risk verdict (§6): re-simulation checks *effects still
  match*, the guard checks *recipient/chain/mainnet-cap still hold*, and risk checks *the counterparty isn't
  newly flagged*. Each can independently abort; all fail closed.

```
plan approved ──► [step N] ──► SIMULATE (re-run, now) ──► ok? ──no──► PARK (never signed)
                                     │ yes
                                     ▼
                              guard + gas ──► DEVICE SIGN ──► broadcast ──► confirm ──► verify ──► settled
                                     ▲                                                      │ !ok
                                     └────────────── nothing is "confirmed" until here ─────┴──► PARK
```

---

### 2.5 · Roadmap — deeper simulation, honestly scoped

We ship a real revert/feasibility dry-run and a pre-sign quote today; the **rich asset-diff experience** is
mandated but not yet shipped. Naming the gap is the point.

- **⏭ Full effects-diff simulation (landing: post-audit, pre-GA).** An itemized "you will send X, receive Y,
  grant approval Z" balance-and-approval delta for **every** asset touched — the Rabby/Blowfish/Tenderly
  bar. The `SimulationProvider` seam is built for exactly this drop-in; the RPC simulator that returns
  itemized effects (and the UI to render them) is the work.
- **⏭ Runtime effect-verification (landing: with the gateway effects API).** Replace the stubbed
  `verify()` (2.3) with a real `received ≥ youReceiveMin` assertion from returned on-chain effects.
- **⏭ Broader chain coverage.** The shipped real preflight is EVM/Sepolia; production RPC simulation across
  mainnet EVM, L2s, Solana, and Bitcoin (each with its own simulation model) is roadmap.
- **⏭ AI-assisted explanation of simulated effects.** Plain-English narration of the diff ("this approves
  unlimited USDC to a 2-day-old contract") is roadmap and, per Doctrine #7, will sit **behind** the
  deterministic simulation — the AI explains what the deterministic simulator found; it never *is* the
  simulator and never gains authority to wave a step through. See §3 (contract risk) and §9 (explainable
  risk reports).

**Definition of done for this section's controls:** the sandbox gate parks on any non-match ✅; no swap
without a minimum-received floor is signable ✅; a guaranteed EVM revert never broadcasts ✅; predictions are
never rendered as settled state ✅; re-simulation runs per step at execution time ✅; the effects-diff, the
runtime effect-assertion, and multi-chain RPC simulation are tracked as ⏭ with the landing phases above —
**and the wallet says so, rather than implying a control it does not run.**


## §3 · Contract Risk Analysis & Scam/Phishing Detection

> *Blocking the trap before the signature.* The single most common way people lose funds in a modern wallet
> is not a broken cipher — it is a **correct signature over a malicious payload**: an unlimited approval to a
> drainer, a swap into a honeypot, a "claim" on a phishing look-alike of the real dApp. §2 showed the user
> *what a transaction does*; this section is about deciding *whether it should be allowed to do it.* It is the
> most **honestly mixed** section in the chapter — a real deterministic core that ships today, bolted to a
> body of intelligence that is still mostly **roadmap**. We tag every control with its real state and we do
> not let the roadmap borrow the credibility of the shipped core.

The Principal Security Engineer's rule for this section, stated once: **a control we describe here either runs
in the repo (with a file to cite) or it is marked `⏭` and does not.** A risk screen that *claims* to know a
contract is malicious when its threat feed is empty is worse than no screen at all — it manufactures false
safety, and false safety is what gets people drained. So the load-bearing promise of §3 is not "we detect
every scam." It is: **what we cannot positively verify, we raise, never silently trust** (Doctrine #5, fail
closed).

---

### 3.1 The threat — what an attacker actually does

The adversary here is the **malicious counterparty** from the platform threat model (§1, [SECURITY.md §2.2](../../SECURITY.md)):
a dApp, a token contract, a spender, or a domain crafted to make an honest user sign their own loss. Their
asset target is the *signing decision* (asset #2) — they cannot reach the key (asset #1, on-device, §1/Ch6),
so they weaponize the user's own hand. The canonical traps:

| Attack | Mechanism | What the signature actually authorizes | Real-world class |
|---|---|---|---|
| **Unlimited-approval drain** | dApp requests `approve(spender, 2²⁵⁶−1)`; a later `transferFrom` empties the token | "Let this contract move *all* of this token, forever" | The #1 hot-wallet loss vector; every major drainer (Inferno, Angel, Pink) |
| **Honeypot token** | Token you can *buy* but a `feeOnTransfer` / blacklist makes it un-*sellable* | A swap into an asset you can never exit | Fake-token rug pulls |
| **Malicious contract** | A verified-looking contract whose logic drains on interaction, or an upgradeable proxy that changes under you | An interaction that does more than the label says | Fake airdrop / "claim" contracts |
| **Address poisoning** | Attacker seeds your history with a look-alike of your real counterparty (same prefix+suffix) | A transfer to the attacker, one copy-paste away from correct | Rampant on EVM + Tron |
| **Drainer dApp / phishing** | A look-alike domain (`app.uniswaq[.]org`) serves a real-looking UI that requests a hostile signature | Anything — the UI lies about what you're signing | Wallet-drainer-as-a-service |
| **Fake token / fake counterparty** | A token spoofing a real symbol/name; a spender spoofing a known protocol | Trust transferred to an impostor | Symbol-confusable scams |

Two structural facts shape the whole defense. First, **most of these are not cryptographic failures** — the
transaction is well-formed and the signature is valid; the *intent* is wrong. That is why §3 lives upstream of
the signer, in the risk layer, not in Ch6. Second, **the ground truth for "is this malicious" lives off-device
and changes hourly** — a drainer registered ten minutes ago is not in any static list. This splits our defense
cleanly into two halves with very different maturity: **deterministic on-chain-behavior heuristics** that need
no feed (largely shipped), and **intelligence-backed known-bad lookups** that need a live, signed threat feed
(largely roadmap). We describe both, honestly labelled.

---

### 3.2 What ships today — the deterministic detectors ✅

The engine of record is [`packages/risk`](../../packages/risk/src) — the composite Risk Engine that §6
specifies in full. This section owns the *contract-, token-, and address-shaped* detectors inside it. They are
**pure functions** — `subject → RiskSignal | null` — each independently testable, each carrying a `severity`
in `[0,1]` and a human `reason` string. They run with **no network, no clock, no keys**, so they cannot
themselves become an attack surface or a data-exfiltration path. State: ✅ shipped, in
[`detectors.ts`](../../packages/risk/src/detectors.ts), covered by the risk test suite (ADR-0036).

**Approval-trap detection — `detectUnlimitedApproval` ✅.** The most valuable control we ship. Any approval at
or above `2²⁵⁵` base units is flagged `UNLIMITED_APPROVAL` (severity `0.7`) with the reason *"a compromised
spender could drain it all."* This is deterministic and feed-free — it reads the amount in the payload itself.
The `strict` policy preset (§6) turns this into an outright block (`blockUnlimitedApproval: true`); `balanced`
raises it to a confirmation. It pairs with the **shipped allowance-revoke tool** (§5) so the user can both be
*warned before* granting and *unwind after*. Benchmark: this is the Rabby/Wallet-Guard "unlimited approval"
warning — and on the detection side we match it, because it needs no external data.

**Honeypot detection — `detectHoneypot` ✅.** A sell/transfer tax at or above **2000 bps (20%)** is the classic
honeypot signature and is flagged `HONEYPOT` at severity `0.99` — a **hard block** (§3.4). The catch, stated
plainly: this fires **only when `feeOnTransferBps` is populated in the token metadata.** Computing that field
for an arbitrary token — statically from bytecode, or dynamically via a buy/sell simulation — is the
**roadmap** contract-analyzer's job (§3.3). Today the *rule* is shipped and correct; the *enrichment that feeds
it* is partial. We do not claim honeypot detection on an unenriched token.

**Contract-shape heuristics — token subjects ✅ (rule) / 🔶 (enrichment).** Given token metadata, the engine
raises graduated signals: `BRAND_NEW_TOKEN` / `FRESH_TOKEN` (age < 1d / < 7d), `VERY_LOW_LIQUIDITY` /
`LOW_LIQUIDITY` (< \$10k / < \$50k), `OWNERSHIP_CONCENTRATION` (one holder > 50% of supply — rug risk),
`ADMIN_PRIVILEGES` (an admin key or an upgradeable proxy — *"the contract can change under you"*), and
`UNAUDITED` (no known audit). Each is a pure rule over the `TokenSubject.meta` fields
([`types.ts`](../../packages/risk/src/types.ts)). By composite scoring (§6), several small signals
*compound* — a fresh **and** illiquid **and** admin-keyed token scores far higher than any one alone — which is
the correct model for how these traps actually stack. **The honest gap (🔶):** every one of these depends on a
metadata field (`ageDays`, `liquidityUsd`, `ownershipConcentrationBps`, `hasAdminKey`, …) that must be
*sourced* from an indexer/analyzer. The rules are shipped and tested; the **pipeline that reliably fills those
fields for any token on any chain is roadmap.** Where a field is `undefined`, the detector returns `null` — it
raises **no** signal, and the *absence of the field itself* is surfaced as reduced confidence (§3.4), never as
"safe."

**Address-shaped detectors ✅.** Two ship and are feed-free:
- `detectAddressPoisoning` — flags a target address that **look-alikes** a known-good contact (same first-6 +
  last-4 hex chars, different middle, same length) as `ADDRESS_POISONING` (severity `0.85`). It reads the
  user's own `knownAddresses`, needs no network, and directly kills the copy-the-wrong-one attack. An exact
  match to a saved address returns `null` (it *is* the real one).
- `detectBurnAddress` — flags the null address (`0x0…0`, matched at **any length** so a truncated one still
  fails closed) and the canonical burn `0x…dEaD` as `BURN_ADDRESS` (severity `0.9`): *"funds sent here are
  permanently unrecoverable."*

These are pure string logic on the payload — the strongest kind of control, because there is nothing external
to spoof.

**The deterministic detector map — attack → defense (feed-free subset):**

| Attack | Detector (`detectors.ts`) | Signal · severity | Needs a feed? |
|---|---|---|---|
| Unlimited-approval drain | `detectUnlimitedApproval` | `UNLIMITED_APPROVAL` · 0.7 | **No** ✅ |
| Address poisoning | `detectAddressPoisoning` | `ADDRESS_POISONING` · 0.85 | **No** ✅ |
| Burn/null-address loss | `detectBurnAddress` | `BURN_ADDRESS` · 0.9 | **No** ✅ |
| Honeypot (tax) | `detectHoneypot` | `HONEYPOT` · 0.99 (block) | rule ✅ · needs `feeOnTransferBps` 🔶 |
| Fresh/illiquid/rug token | `detectFreshToken` · `detectLowLiquidity` · `detectOwnershipConcentration` | graduated 0.35–0.6 | rule ✅ · needs metadata 🔶 |
| Mutable/admin contract | `detectAdminPrivileges` · `detectUnaudited` | `ADMIN_PRIVILEGES` 0.3 · `UNAUDITED` 0.2 | rule ✅ · needs metadata 🔶 |

---

### 3.3 What is roadmap — the intelligence layer ⏭

Everything above is *behavioral inference from the payload.* The other half of the problem — *"is this specific
contract / domain a known scam?"* — cannot be inferred; it must be **looked up** against continuously-updated
knowledge of known-bad entities. The interface for that exists and is wired; the **live data behind it does
not, and we say so.**

**The `ThreatIntel` interface — shipped seam, empty by default 🔶/⏭.** [`intel.ts`](../../packages/risk/src/intel.ts)
defines the contract the engine depends on:

```ts
interface ThreatIntel {
  isSanctioned(address: string): boolean;
  isBlacklisted(address: string): boolean;
  isKnownScamToken(chainId: string, address: string): boolean;
  isMaliciousContract(chainId: string, address: string): boolean;
  isPhishingDomain(domain: string): boolean;
}
```

The engine consults it **first**, and a hit is a **hard-block** signal at severity `1.0` (`KNOWN_SCAM_TOKEN`,
`MALICIOUS_CONTRACT`, `SANCTIONED_ADDRESS`, `BLACKLISTED_ADDRESS`, `MALICIOUS_SPENDER` — [`engine.ts`](../../packages/risk/src/engine.ts)).
That wiring is **shipped and tested.** But the only concrete implementation in the repo is
`InMemoryThreatIntel`, seeded from a static list — it serves tests and defines the shape a real backend must
fill. **The default engine runs `emptyThreatIntel`, which knows nothing** and answers `false` to every query.

State it without flinching: **the scam-database-backed detectors are `⏭` roadmap, not shipped.** The
*mechanism* to block a known drainer is real; the *knowledge of which addresses are drainers* is not yet
plugged in. Anyone reading a `MALICIOUS_CONTRACT` block in a demo should know it fired off a **seeded test
list**, not a live feed.

**What the live intelligence layer requires (the binding roadmap):**

| Capability | What it defends | State · landing |
|---|---|---|
| **Live scam/malicious-contract registry** | Known drainers, fake-airdrop/claim contracts | ⏭ — sync from multiple sources (e.g. ScamSniffer/Chainabuse-class feeds); **no live feed today** |
| **Sanctions + blacklist screening** | Regulated/known-theft addresses (feeds the compliance gateway, §3.5) | ⏭ — the *gate* consumes intel; the intel *source* is roadmap |
| **Phishing-domain / malicious-origin protection** | Look-alike dApp domains, drainer front-ends | ⏭ — `isPhishingDomain` exists; the domain feed and the **dApp-origin capture path** do not |
| **AI deep contract analyzer** | Bytecode/source semantics → honeypot, hidden-mint, proxy-swap, blacklist functions | ⏭ — this is what would *compute* the `feeOnTransferBps` / `hasAdminKey` fields the shipped rules consume |
| **Signed-snapshot feed integrity** | A poisoned feed that *un*blocks a scam or blocks a safe asset | ⏭ **mandated** — feeds distributed as **signed snapshots, integrity-verified before load** |

Two roadmap points carry their own veto weight. **(a) Phishing protection needs an origin.** The risk engine is
standalone and chain-shaped; it evaluates *addresses and tokens*, not *web origins*. Real phishing defense
(Wallet-Guard / Blowfish-class) requires capturing the **requesting dApp's domain** at the WalletConnect / dApp
boundary and checking it against a live list — that capture path and that list are both roadmap, so today the
wallet does **not** warn on a look-alike domain, and we must not imply it does. **(b) The feed itself is an
attack surface.** A threat feed is trusted-by-construction: whoever controls it can block a competitor's token
or, far worse, *silently un-flag* a drainer. So the mandated design (per the `intel.ts` doc contract) is
**signed snapshots, verified before load** — until that lands, no production feed may be wired in, because an
unauthenticated feed converts our best defense into a single point of remote compromise.

**Benchmark, honestly.** Rabby, Wallet Guard, Blowfish, and Pocket Universe lead here precisely because they
run **live, curated threat intelligence** plus **transaction simulation** against it. On the deterministic,
payload-derived detectors (unlimited approval, address poisoning, burn address, the honeypot *rule*) we stand
with them today. On the **live-intel and phishing-origin** half, they ship and **we do not yet** — that is the
gap between `packages/risk` as *an engine that exists* and *a product that protects*, and closing it (a live,
signed feed + a dApp-origin path + the deep analyzer that enriches token metadata) is the headline roadmap of
this section.

---

### 3.4 How it fails — closed, always

The invariant that makes an *incomplete* risk layer still trustworthy: **the absence of a bad signal is never
an assertion of safety.** Three fail-closed behaviors enforce it:

1. **A missing field raises confidence-loss, not "safe."** When a detector's input is `undefined` (no age, no
   liquidity, no tax data because the analyzer hasn't run), it returns `null` and raises **no** positive-safety
   claim. An **unverifiable contract is surfaced as unverified** — reduced confidence in the risk report and in
   the §9 explainable report — never rendered green. We show *"we could not verify this contract,"* not
   *"this contract is safe."*
2. **The verdict pipeline is fail-closed by construction.** Detectors feed composite scoring (§6, probabilistic-OR
   so risks compound and stay bounded), which feeds the policy engine ([`policy.ts`](../../packages/risk/src/policy.ts)).
   A **hard-block report is final — no policy can loosen it** (`report.level === 'block'` returns `block`
   unconditionally); policies may only make a verdict *stricter*, never looser. A `require_confirmation` verdict
   gates on **explicit, informed** user acknowledgement (Doctrine #5) — the trap is not blocked *for* the user,
   it is *shown* to the user with comprehension required before their signature (§9).
3. **The engine can only ever refuse.** Like the broadcast guard (§5, Ch7), the Risk Engine *"evaluates and
   authorizes; it never signs and never holds funds."* Its maximal power is to turn an `allow` into a
   `require_confirmation` or a `block`. It is architecturally incapable of *approving* a transfer into
   existence — so a bug or a stale feed can, at worst, be over-cautious; it can never wave a scam through that
   the deterministic guard and the human confirm sheet would otherwise stop. Defense in depth: even a fully
   empty threat feed does not disable the broadcast guard's EIP-55 checksum, the mainnet ACK, the spend cap, or
   the human confirm sheet.

**The one thing §3 must never do** is the inverse of fail-closed: present a scam as safe because our feed was
empty. Every gap above is therefore designed to degrade toward *friction* (a warning, a confirmation, a block),
never toward *false green*.

---

### 3.5 Where §3 sits in the pipeline

These detectors are **consumed, not standalone.** Their signals flow into the composite Risk Score and verdict
(**§6**), which the Intent Engine attaches to a plan (**Ch7**, Risk Analysis stage) and the Execution Engine
re-checks per leg (**Ch8**). Sanctions/blacklist intel additionally feeds the **compliance gateway**
([`packages/compliance`](../../packages/compliance/src/gateway.ts)), which is *itself* fail-closed — an
unknown jurisdiction posture → `block`; the gateway decides the *obligation* (report/screen/disclose) while the
risk engine supplies the *hit*. Approval-specific handling (the revoke tool, allowance hygiene) is **§5**;
address/counterparty reputation and verification is **§4**; the scoring math and policy presets are **§6**; the
human-readable *"why was this flagged"* surface a user reads before signing is **§9**. §3's job is narrow and
owned: **turn a contract, a token, or a counterparty into an honest risk signal — and when we cannot, say so.**

> **Section verdict (Principal Security Engineer).** Shipped and signed: the deterministic, feed-free detectors
> — unlimited approval, address poisoning, burn address, and the honeypot/token-shape *rules*. Explicitly
> roadmap and **not** to be presented as shipped: the live scam/malicious-contract database, sanctions/phishing
> feeds, dApp-origin phishing protection, and the AI deep contract analyzer that would enrich token metadata.
> The seam is real and the intel default is *empty* — which is the honest, fail-closed state until a **signed,
> verified feed** lands. We block what we can prove, we flag what we cannot verify, and we never paint a scam
> green.


## §4 · Wallet Reputation & Address Verification

*Is this the right recipient?* — the one question this section exists to answer before a signature
disposes of funds. It splits cleanly into two failure classes, and we are honest that we defend them
unevenly today:

1. **Wrong address** — the recipient is not who the user thinks: a transcription typo, a homoglyph
   look‑alike pasted from a poisoned history, a name/ENS that resolves somewhere unexpected, or a
   one‑way burn hole. **Address correctness is largely SHIPPED** and lives in pure, exhaustively‑tested
   code.
2. **Bad actor** — the address is well‑formed and exactly what the user typed, but the *counterparty*
   is hostile: a known‑scammer, a sanctioned entity, a drainer that has burned others. **Reputation is
   largely ROADMAP**, with one real, shipped exception (OFAC sanctions screening) and one engine that
   exists but is not yet fed a live feed.

The doctrine that governs this whole section is the anti‑spoofing rule, stated once and never relaxed:
**a name, alias, ENS, or contact label NEVER bypasses showing the real destination bytes on the confirm
sheet.** The human approves an address, not a label. Everything below either verifies those bytes or
attaches honest risk to them — and everything that cannot be *positively* verified **fails closed**.

> Benchmark: this is the same job Rabby, Wallet Guard/Blowfish, and Pocket Universe do at pre‑sign
> time. Where they show a poisoning badge or a "first interaction" pill, we say plainly which of those
> we run today and which we do not. Overclaiming here is the worst thing this chapter can do.

### 4.1 Threat model — attacker × asset × vector

| # | Attacker | Asset at risk | Vector | Primary defense | State |
|---|---|---|---|---|---|
| A1 | The user's own fingers | Funds (irreversible) | Mistyped recipient | EIP‑55 checksum on mixed‑case | ✅ §4.2 |
| A2 | Malicious dApp / clipboard hijacker | Funds | Swap the pasted address | Checksum + confirm‑sheet bytes | ✅/🔶 §4.2, §4.4 |
| A3 | Address poisoner | Funds | Seed history with a homoglyph look‑alike of a real contact | `detectAddressPoisoning` | 🔶 §4.4 |
| A4 | Anyone | Funds (permanent) | Trick a send to `0x…dEaD`/null | `detectBurnAddress` | ✅ §4.4 |
| A5 | Hostile ENS resolver / registrar | Funds | Resolve a name to an attacker address | Show + confirm resolved bytes (checksum can't help — §4.3) | 🔶 §4.3 |
| A6 | Scammer / drainer wallet | Funds | Be an untrusted, unknown, or known‑bad counterparty | OFAC deny‑list ✅; scam DB / reputation ⏭ | 🔶/⏭ §4.6 |
| A7 | Sanctioned entity | Compliance + funds | Receive a transfer | OFAC sanctions hard‑block | ✅ §4.6 |

### 4.2 Address well‑formedness & the EIP‑55 checksum — ✅ shipped

**Defends:** A1, A2 — the everyday, catastrophic case of sending real funds to a *subtly* wrong
address that no on‑chain actor can ever return.

**How it works.** The pure broadcast guard —
[`packages/chains/src/guard.ts`](../../packages/chains/src/guard.ts), `checkEvmRecipient` — is the
gate. It is total: no network, no clock, no keys, no I/O, same input → same decision, so it can never
itself become an attack surface (Ch10 §1; Ch8 execution safety). Its logic is deliberately precise:

- An EVM recipient **must** match `^0x[0-9a-fA-F]{40}$`. Anything else — truncated, over‑long,
  non‑hex — is **blocked** as "not a well‑formed 20‑byte EVM address."
- If the address is **mixed‑case**, it **must** pass its EIP‑55 checksum (keccak‑256 over the
  lowercase nibbles decides each character's case). A mixed‑case address that fails is *almost always a
  transcription typo* and is **rejected** — the cheapest possible defense against a one‑character slip.
- An **all‑lowercase** (or all‑uppercase) address carries **no** EIP‑55 information. We treat it as
  *well‑formed‑but‑unverifiable*, **not wrong** — blocking it would be dishonest (it may be perfectly
  correct) and would punish the many tools that emit lowercase. It passes well‑formedness but earns no
  checksum assurance; §4.4's poisoning/burn checks and the confirm sheet still apply.

**Non‑EVM recipients** are not hand‑validated here — the guard rejects an *empty* recipient early and
clearly, and the real decode (bech32 for Bitcoin, base58 for Solana) happens in each ecosystem's
transaction builder, which fails closed on a malformed string before any bytes are signed. **Unknown
chain** is refused outright: a chain not in the registry is never guessed.

**How it fails closed.** Every negative path *blocks*. There is no branch where an unrecognized,
malformed, or checksum‑failing address is waved through. `assertBroadcastAllowed` throws
`ChainError('GUARD_BLOCKED')` rather than returning a soft warning. Tested in `guard.test.ts`
(SECURITY.md §5).

> Benchmark: Rabby and MetaMask both surface a checksum/typo warning; we make it a hard block on the
> unambiguous mixed‑case‑fail case, which is the strongest honest position — we only reject when the
> address *proves* itself inconsistent.

### 4.3 ENS resolution & the checksum gap — ✅ shipped, with a named honest gap

**Defends (usability, not spoofing):** lets a user send to `vitalik.eth` instead of 42 hex characters
(Ch5 §6–7 address resolution).

**How it works.** [`services/api/src/ens.ts`](../../services/api/src/ens.ts) resolves a `name.eth`
**live over Ethereum mainnet** with two `eth_call`s — registry → resolver, then resolver → `addr` —
using an ENSIP‑1 `namehash` computed locally with audited `@noble` keccak. Wired into the runtime
resolver ([`packages/runtime/src/runtime.ts`](../../packages/runtime/src/runtime.ts)) and exposed at
`GET /v1/resolve/ens`; tested in `services/api/test/resolve.test.ts`. Its honesty properties:

- A name with **no resolver or no address record returns `null`** — never a guessed or placeholder
  address (Doctrine #3). The planner turns `null` into a `not_found` that asks the user to clarify; it
  never silently substitutes a "close" match.
- The resolved value is shown on the confirm sheet and **confirmed as the destination** (Ch5 §7). The
  anti‑spoofing rule binds here hardest: the sheet shows the *resolved address bytes*, not just the
  pretty name, so the user approves what actually gets signed.

**The named gap (do not overclaim).** `ens.ts` returns a **lowercase** address (`wordToAddress`
lowercases the 20‑byte word). Lowercase carries **no EIP‑55 checksum information (§4.2)**, so the
guard's checksum test **cannot** catch a *lying resolver* (A5) — a hostile resolver that returns a
well‑formed attacker address will pass well‑formedness cleanly. We do not pretend otherwise. The
compensating controls are: (a) the confirm sheet always displays the real resolved bytes for human
inspection; (b) sanctions/blacklist screening (§4.6) still runs on the resolved address; and (c) an
ENS name is a *convenience over a public registry*, not a trust attestation. ⏭ **Roadmap:** re‑checksum
the resolved address for display and add a "resolved via ENS — verify the address" caution pill so the
provenance is explicit, plus optional forward/reverse‑resolution round‑trip agreement.

### 4.4 Address‑poisoning & burn‑address defense — detector ✅ shipped & tested; live feed 🔶 partial

**Defends:** A3 (poisoning), A4 (burn / null sink).

**How it works.** Two pure detectors in
[`packages/risk/src/detectors.ts`](../../packages/risk/src/detectors.ts), consulted by the Risk
Engine's address‑signal path ([`engine.ts`](../../packages/risk/src/engine.ts) `#addressSignals`):

- **`detectAddressPoisoning`** compares the target against the user's `knownAddresses`. An **exact**
  match is the real, saved address (no signal). A **look‑alike** — same‑prefix/suffix homoglyph of a
  known‑good address, the classic dust‑poisoning trick — raises `ADDRESS_POISONING` at severity 0.85
  with a human reason ("looks like `0x1234…abcd` but is not it"). Tested in `detectors.test.ts`.
- **`detectBurnAddress`** flags the null address (matched at *any* length so a truncated all‑zeros
  string still fails closed) and the canonical `0x…dEaD` burn, at severity 0.9 — because funds sent
  there are provably unrecoverable and must never leave without explicit, informed confirmation.

**Named gap (why 🔶, not ✅).** Poisoning detection is only as good as the `knownAddresses` set it is
given, and the shipped runtime constructs `RiskEngineProvider` **without** one — it defaults to `[]`
([`runtime.ts`](../../packages/runtime/src/runtime.ts); `adapters.ts` `knownAddresses = []`). So the
**detector is real, pure, and tested, but is not yet fed the user's contacts/history in the live send
path** — it will not currently catch a look‑alike of a *saved* contact because it has no saved
contacts to compare against. Burn/null detection needs no feed and is fully live. ⏭ **Landing:** wire
the Contact Intelligence address book (Ch5 §16) and prior‑recipient history into `knownAddresses` so
poisoning detection fires in production; until then, tag it partial and say so.

**Fail‑closed posture.** Both detectors only ever *add* risk; they cannot mask it. A `HARD` intel hit
(§4.6) blocks regardless of any heuristic score, and the burn/poisoning signals feed the Risk Score
(§6), which the confirm sheet and policy gate (Ch7 constraint gates) consume.

### 4.5 First‑send‑to‑a‑new‑address warning — ⏭ roadmap

The "you've never sent to this address before" pill (Rabby's "first interaction", Wallet Guard's new‑
recipient flag) is a **binding requirement, not a shipped control.** Scrupulous check of the codebase
found **no** first‑send / new‑recipient warning in the web or mobile send path today, so it is tagged
⏭ — not ✅ — even though it is a small feature. It **lands on** the same address‑book + recipient‑
history substrate as §4.4: the first time a recipient appears with **zero** prior successful
interactions and **not** in the contact book, the confirm sheet must show a caution and require an
extra beat of attention (never an auto‑approve, and it interacts with auto‑execution's fail‑safe in
SECURITY.md §5 — a brand‑new recipient should not be silently auto‑executed). We do not render this UI
until the history/contacts source exists; fabricating a "first‑send" badge with no data behind it
would itself be fake safety (Doctrine #3).

### 4.6 Wallet / address reputation — one control ✅ shipped, the rest ⏭ roadmap

This is the "is the *counterparty* trustworthy?" half, and it is where we are most careful not to
imply capabilities we lack.

**Shipped today (✅).** **OFAC sanctions screening.**
[`services/api/src/sanctions.ts`](../../services/api/src/sanctions.ts) fetches OFAC's published
list of sanctioned digital‑currency addresses at boot and seeds it into the Risk Engine's
`ThreatIntel`. A recipient on the list raises `SANCTIONED_ADDRESS` at `HARD` severity, which is a
**non‑overridable block** — a permissive policy cannot un‑block it (Ch7; §6). This is the deterministic
"disposes" half of the doctrine applied to a real government deny‑list; every entry is a real OFAC SDN
address, nothing hardcoded. If the feed is unavailable at boot, the service degrades to
no‑sanctions‑intel **with a loud warning** rather than blocking startup — an availability trade‑off
documented honestly, and a production deployment is expected to point it at an authoritative source.

**Engine‑ready but not fed (🔶).** The general **`isBlacklisted` / known‑theft‑&‑scam‑address** path
exists in the same `ThreatIntel` interface and `#addressSignals` consults it, but the shipped build
seeds only the OFAC list — there is **no live, continuously‑updated scam/theft feed** behind
`isBlacklisted` yet. The interface is designed for **signed snapshots** (integrity‑verified before
load, so a poisoned feed can't unblock a scam or block a safe asset — [`intel.ts`](../../packages/risk/src/intel.ts)),
but that pipeline is roadmap. Cross‑reference §3 (contract risk & scam/phishing detection) and §6 (the
Risk Engine & Risk Score) rather than duplicating the scoring model here.

**Roadmap (⏭).** The full reputation story is *not* shipped and must be labelled so:

- **Known‑scammer lists / live scam DB** — a curated, refreshed, signed feed powering `isBlacklisted`
  (⏭; today only OFAC sanctions is live).
- **Wallet‑reputation scoring** — a graded trust score for an address (prior drains, age, funding
  graph). We surface hard *deny* signals today, not a graded reputation number.
- **Allow / deny lists** — user‑ and policy‑level allowlists (trusted recipients) and denylists,
  integrating with the Policy Engine's most‑restrictive‑wins model (Ch7).
- **Prior‑interaction trust** — "you've sent to this address 5× successfully" as a positive trust
  signal, drawn from Contact Intelligence (Ch5 §16, which *stores* verification status and remembers
  successful interactions as a spec commitment, not yet a shipped scorer).
- **Behavioral‑anomaly reputation** — deferred entirely to §7.

**Fail‑closed rule for reputation.** Absence of a *bad* signal is **not** a *good* signal. An unknown
address with no reputation data is treated as **unverified**, never as "safe" — the confirm sheet says
what we do and don't know (honest empty state, Doctrine #3), and the first‑send caution (§4.5, when it
lands) covers precisely the "we have no history for this recipient" case. We never render a green
"trusted" badge we cannot substantiate.

### 4.7 Attack → defense summary

| Attack | Today's outcome | Control | State |
|---|---|---|---|
| Mixed‑case typo | **Blocked** at the guard | EIP‑55 checksum (`guard.ts`) | ✅ |
| Malformed / truncated address | **Blocked** ("not well‑formed") | `HEX_40` + ecosystem decode | ✅ |
| Unknown chain | **Refused** | registry lookup, fail closed | ✅ |
| Send to null / burn | **Flagged** (sev 0.9), needs explicit confirm | `detectBurnAddress` | ✅ |
| Look‑alike of a **saved** contact | Detector ready; **not firing** until contacts feed it | `detectAddressPoisoning` + `knownAddresses` | 🔶 (feed ⏭) |
| Sanctioned recipient | **Hard‑blocked**, non‑overridable | OFAC `SANCTIONED_ADDRESS` | ✅ |
| Known scammer / drainer (non‑sanctions) | Interface present; **no live feed** yet | `isBlacklisted` + signed snapshots | 🔶 / ⏭ |
| Lying ENS resolver | Address shown for human check; checksum **can't** help | confirm‑sheet bytes + sanctions screen | 🔶 (§4.3) |
| Brand‑new recipient | **No warning today** | first‑send caution | ⏭ |
| Untrusted unknown wallet | Treated as **unverified**, never "safe" | fail‑closed reputation rule | ✅ (posture) / ⏭ (scoring) |

**The section's promise, stated honestly:** the *address‑correctness* controls a first‑time user
depends on — checksum, malformed/unknown rejection, burn detection, fail‑closed everywhere — are real,
pure, and tested today. The *counterparty‑reputation* controls beyond OFAC sanctions are engine‑ready
but roadmap, and are labelled `⏭`/`🔶` here rather than dressed up as done. The Principal Security
Engineer signs §4.2, §4.3, §4.4‑burn, and §4.6‑sanctions as shipped — and signs the rest only as the
binding roadmap it truly is.


## §5 · Approval Management

> **Status legend** (per [`SECURITY.md §0`](../../SECURITY.md)): ✅ Shipped — implemented **and** tested in-repo, file cited · 🔶 Partial — one surface/env, gaps named · ⏭ Roadmap — a binding requirement with a landing phase, **not** a claim that it runs. The Principal Security Engineer signs only what is true; an approvals control we overstate is itself a lie (Doctrine #3).

The single most reliable way a self-custody wallet loses funds is not a stolen key and not a forged
signature — it is an approval the user granted on purpose, months ago, to a contract that later turned
hostile. The seed never leaked; the vault held; the device signed exactly what was shown. And the wallet
still drained, because at some point the owner clicked *Approve* on an **unlimited ERC-20 allowance** and
walked away. That standing grant is a loaded gun pointed at the balance, and its trigger is held by a
third-party contract the user no longer controls.

This section owns that vector: the token-approval risk, the deterministic defenses we ship against it, and
the honestly-labelled gaps. It is deliberately *narrow* — reputation and address-poisoning belong to §4,
contract/scam analysis to §3, the composite Risk Engine to §6, the guard-of-last-resort to §1. Here the
asset is **the standing spend permission**, and the attacker is **any spender that can call `transferFrom`
against it.**

### 5.1 The threat — why `approve(∞)` is how wallets die

ERC-20 has no native "pay this contract once" primitive. To let a router, bridge, or market pull your
tokens, you first call `approve(spender, amount)`, which writes an *allowance* into the token contract; the
spender can thereafter call `transferFrom` up to that allowance, **any number of times, with no further
signature from you.** The ecosystem's dominant UX shortcut — approve `2²⁵⁶−1` once so the user never sees a
second prompt — is precisely the anti-pattern the [Ch2 anti-pattern catalogue lists as **X23**](../bible/chapter-02-product-philosophy.md): a convenience that converts a one-time interaction into a **permanent, unbounded liability.**

| Stage | What the attacker does | Why the standing approval makes it work |
|---|---|---|
| **Bait** | A legit-looking dApp, or a spoof of one, requests an *unlimited* allowance for a "swap" | The user approves once; the grant persists after the session ends |
| **Dormancy** | Nothing happens — for weeks or months | The allowance is invisible; the user forgets it exists |
| **Trigger** | The spender is upgraded to hostile, its admin key is stolen, or it was malicious from the start | A contract with an admin/upgrade key (see §6 `ADMIN_PRIVILEGES`) can change behaviour under a live allowance |
| **Drain** | The spender calls `transferFrom(victim, attacker, balance)` — no user prompt | The allowance already authorized it; the wallet is never asked |

The asymmetry is brutal: the user's protection lasted one click; the attacker's window lasts until the
allowance is revoked. **Bounded approvals collapse that window to a single transaction's worth of tokens;
revocation closes it entirely.** Those are our two shipped controls, plus a re-check that stops a stale
allowance from silently authorizing a fresh swap.

### 5.2 Control 1 — bounded-by-default approvals (✅ shipped)

**Defends against:** the dormant-unlimited-allowance drain (§5.1) for approvals **we ourselves issue** on the
user's behalf. **Attacker:** a router/spender that turns hostile after the grant. **Asset:** every token
beyond the amount actually being spent right now.

Our doctrine is the inverse of the ecosystem default: **we never issue an infinite approval.** When the
swap path needs the Uniswap router to pull a token, it approves **exactly the input amount of this swap and
not one unit more** — [`apps/web/src/broadcast.ts:624`](../../apps/web/src/broadcast.ts) encodes
`encodeErc20Approve(swapRouter02, amountIn)`, where `amountIn` is the precise base-unit quantity the user
confirmed. There is no code path in our swap flow that emits `2²⁵⁶−1`. The consequence is structural: even
if the router were compromised the instant after we approve, the most it could pull is the tokens for the
trade the user is already making — the residual allowance after a completed swap is **zero**, because the
router consumes exactly what it was granted.

- **How it fails closed:** the encoder (`packages/chains/src/evm/uniswap.ts:71`) takes an explicit `bigint`
  amount — money is `bigint` end-to-end, never a float, never a sentinel "max." A caller must pass a
  concrete number; there is no "infinite" default to fall into. If the amount is unknown, the swap does not
  proceed to an approve at all.
- **Benchmark:** this matches the posture Rabby and Uniswap's own newer flows moved to (exact-amount
  approvals, or Permit2 time-boxed grants) after unlimited-approval drains became the dominant loss class.
  We ship the exact-amount half today; the Permit2 / time-boxed half is §5.6 roadmap.
- **Honest scope (🔶):** this is a truth about the approvals *our product originates.* It does **not** and
  cannot govern an allowance a user granted to some **external** dApp in another wallet or another session —
  that is what Control 2 (revoke) and Control 3 (surface-for-review) exist to clean up. We do not claim to
  prevent approvals we never issued.

### 5.3 Control 2 — the allowance revoke tool (✅ shipped, 🔶 testnet-only)

**Defends against:** an existing over-broad or stale allowance — including unlimited grants made elsewhere.
**Attacker:** any spender holding a live allowance. **Asset:** the tokens still exposed by that grant.

Revocation is `approve(spender, 0)`: it rewrites the allowance to zero so the spender can no longer call
`transferFrom` against the balance. It is the standard, and only fully-reliable, defense against a grant
that already exists. We ship it as a **non-custodial, in-browser** flow:

- **Read the live allowance first** — [`readErc20Allowance`](../../apps/web/src/broadcast.ts) (`broadcast.ts:384`)
  does an `eth_call` to `token.allowance(owner, spender)` and flags anything `≥ 2²⁵⁵` as effectively
  unlimited (`UNLIMITED_ALLOWANCE`, `broadcast.ts:381`). The user sees the *actual* on-chain exposure — an
  honest number, or the loud "⚠️ Unlimited allowance granted," never a guess.
- **Revoke by signing on-device** — [`sendRevokeApproval`](../../apps/web/src/broadcast.ts) (`broadcast.ts:402`)
  builds `approve(spender, 0)`, runs it through the **broadcast guard** (`assertBroadcastAllowed`, §1) like
  any other send, then signs it **in the browser with the user's key** (`signEvmTransaction`) and
  broadcasts the raw tx. The key never leaves the device; the server is never in the loop.
- **The UI** — [`RevokeApprovalModal`](../../apps/web/src/App.tsx) (`App.tsx:812`) takes a token contract
  + spender, shows the live allowance, and disables *Revoke* when the allowance is already zero
  ("✓ No allowance — nothing to revoke"). Honest empty/success states, no fabricated confirmation.

**How it fails closed:** the revoke tx is itself a guarded broadcast — an unknown chain, a malformed
address, or an unacknowledged mainnet send is blocked by the same gate that guards a transfer (§1). If the
allowance read fails, the modal surfaces the error and offers no false "revoked" state. And gas-estimation
failure falls back to a safe fixed `gasLimit` (`broadcast.ts:422`) rather than guessing low and stranding
the tx.

**Named gaps (🔶):**
1. **Sepolia-only.** `sendRevokeApproval` hard-codes the `sepolia` chain (`broadcast.ts:412`); revoking a
   *mainnet* allowance is not wired yet. This is testnet-honest, not a claim of mainnet coverage.
2. **Manual token+spender entry.** The user must paste the token and spender addresses — there is no
   one-click "revoke everything risky." That auto-discovery is Control 3's roadmap half (§5.4).

### 5.4 Control 3 — surfacing approvals for review

**Defends against:** the *invisibility* that lets a dangerous allowance lie dormant. **Asset:** the user's
ability to make an informed decision before, and after, granting.

Two pieces, at two different maturities:

- **Approval-risk detection at decision time (✅ engine shipped).** The Risk Engine treats an *approval* as a
  first-class subject: [`detectUnlimitedApproval`](../../packages/risk/src/detectors.ts) (`detectors.ts:13`)
  fires an `UNLIMITED_APPROVAL` signal (severity `0.7`) for any allowance `≥ 2²⁵⁵`, and the Policy Engine's
  default profile **blocks** it — [`packages/risk/src/policy.ts:19,70`](../../packages/risk/src/policy.ts)
  (`blockUnlimitedApproval: true`), yielding the human-readable violation *"Policy: unlimited approvals are
  not allowed."* The engine also raises `INTEL_MATCH` when the *spender* is a flagged contract
  (`engine.ts:127`). This is the deterministic verdict that lets the product warn — or refuse — before a
  user signs an unlimited grant. It is real, and it is tested (§6, `packages/risk/test`). What is **partial
  (🔶)** is universal wiring of that verdict into an always-on, pre-sign approval banner across *every*
  surface (web, mobile, and arbitrary dApp connections) — the engine exists; blanket surfacing does not yet
  cover every path, and we do not claim it does.
- **A full approvals dashboard (⏭ roadmap — Phase: post-mainnet-revoke).** A "here is every standing
  approval on your addresses, ranked by exposure, one tap to revoke" view — the Revoke.cash / Rabby
  approvals-manager experience — is **not shipped.** It needs a **log-indexer** to reconstruct every
  historical `Approval` event, which the free-tier RPC throttles; that constraint is documented honestly in
  the code itself ([`App.tsx:810`](../../apps/web/src/App.tsx): *"the high-value 'discover all approvals'
  list needs a log-indexer…this manual path always works"*). Until the indexer lands, the manual revoke path
  (§5.3) is the shipped truth and the dashboard is a labelled promise, not a live feature.

### 5.5 Control 4 — re-check approvals before the critical step (✅ shipped)

**Defends against:** a **time-of-check/time-of-use** gap — a swap being mined *before* its approval, or on a
*stale* allowance, and reverting on-chain while the UI cheerfully reports success. **Asset:** the user's gas
and their trust that "success" means success.

[Ch8 §21](../bible/chapter-08-universal-execution-engine.md) mandates that before each critical step the engine
**re-verifies recipient, validates approvals, and re-checks policy** — approvals are not assumed from an
earlier moment; they are re-read against live chain state at the point of use. Our swap path is the concrete
implementation, and it is **settlement-safe by construction** — [`sendSwap`, `broadcast.ts:572–655`](../../apps/web/src/broadcast.ts):

```
1. read the LIVE allowance (readAllowance)                        ← current on-chain truth, not a cached assumption
2. approve ONLY IF allowance < amountIn, then WAIT for the receipt ← waitForReceipt throws on revert/timeout
3. eth_call-preflight the swap (a guaranteed revert fails cheaply) ← simulate before spending gas (§2)
4. sign + broadcast the swap                                       ← only now, and only if 1–3 held
```

The ordering is the defense. The swap is **never broadcast until the approval receipt confirms the router
can actually pull the token** (`broadcast.ts:627`, `await waitForReceipt(...)` — "throws on revert / timeout —
swap won't fire"); if the approval is not confirmed in time the code throws *"approval not confirmed in time
— not broadcasting the swap"* (`broadcast.ts:569`) rather than firing a swap that would revert. And because
step 1 re-reads the live allowance, an already-sufficient standing allowance is **not re-approved** — no
redundant, exposure-widening grant is issued.

**How it fails closed:** every branch that cannot *positively* confirm the precondition throws and stops —
an unconfirmed approval, a reverting preflight, a non-EVM fee estimate. The swap only reaches the wire when
allowance, receipt, and preflight all hold; otherwise nothing is broadcast and the user is told why.

### Attack → defense map

| Attack | Shipped defense | Where | State |
|---|---|---|---|
| We hand a router an unlimited allowance | Exact-amount approve (`amountIn`) — never `2²⁵⁶−1` | `broadcast.ts:624` | ✅ |
| A stale/over-broad allowance sits exposed | Read live allowance + `approve(spender,0)` revoke, signed on-device | `broadcast.ts:384,402`; `App.tsx:812` | ✅ (🔶 Sepolia-only) |
| User about to sign an unlimited grant | `UNLIMITED_APPROVAL` signal + policy **block** | `detectors.ts:13`; `policy.ts:19,70` | ✅ engine (🔶 universal surfacing) |
| Spender is a known-bad contract | Intel match on the spender | `engine.ts:127` | ✅ |
| Swap mined before/without its approval | Approve → **wait for receipt** → preflight → swap | `broadcast.ts:572–655` | ✅ |
| "Which approvals do I even have?" | Auto-discovery approvals dashboard | (log-indexer) | ⏭ roadmap |

### 5.6 Roadmap — labelled, not hidden (⏭)

These are binding requirements with landing phases, **not** running controls:

- **Full approvals dashboard** — indexer-backed enumeration of every standing allowance across BTC-N/A,
  EVM, and (approval-equivalent) Solana delegate authorities, ranked by USD exposure, with one-tap revoke.
  Lands when the log-indexer service ships; today's shipped truth is the manual revoke path (§5.3).
- **Mainnet revoke** — promote `sendRevokeApproval` beyond Sepolia to guarded, capped mainnet, under the
  same `acknowledgeMainnet` gate as any real-funds broadcast (§1).
- **Time-boxed / auto-expiry approvals (Permit2-style)** — signature-based, amount-and-deadline-bounded
  grants so an approval **expires** instead of persisting forever; the natural successor to exact-amount.
- **Approval-revoke reminders** — surface long-lived or unlimited grants proactively (a behavioral nudge, §7),
  rather than waiting for the user to go looking.

Until each lands it stays `⏭`. The rule that governs this whole section is the rule that governs the
chapter: **a control we have not shipped is marked roadmap, never dressed up as done.** Bounded-by-default
and on-device revoke are real today and cited above; the dashboard and auto-expiry are honest promises. That
distinction is not a weakness in the approval posture — it *is* the posture.


## §6 · The Risk Engine & Risk Score

> *The AI proposes. The device disposes. In between stands a pure function that can only say **no**.*

Sections §2–§5 each hunt one class of harm — a bad simulation, a malicious contract, a poisoned address,
a runaway approval. This section is where those hunts converge into **one number and one verdict**. The
Risk Engine ([`packages/risk`](../../packages/risk/src)) is the deterministic heart of trust: it takes
everything we know about a subject, folds it into a bounded composite **risk score**, resolves that to a
**level** (`low` / `medium` / `high` / `block`), and hands the Policy Engine a verdict it can tighten but
never loosen. It **evaluates and authorizes; it never signs and never holds funds** — its only power over
your money is the power to *refuse* it. That asymmetry is the whole design. Rabby, Blowfish, and Pocket
Universe render a risk banner; we render a risk banner **and** wire the same verdict into a gate that
mechanically cannot be waved past.

### 6.1 What it defends against

| Attacker | Asset at risk | The play |
|---|---|---|
| Malicious token deployer | Your principal in a swap | Honeypot (un-sellable), fresh rug-pull, one-holder supply, hidden mint/upgrade key |
| Sanctioned / blacklisted counterparty | Your legal standing + funds | Route funds to an OFAC-listed or known-theft address |
| Approval-drain operator | Your entire token balance | Trick you into an unlimited (`2²⁵⁵+`) allowance to a spender they control |
| Address poisoner | A single transfer | Seed your history with a look-alike address; you copy the wrong one |
| Fat-finger / burn | A single transfer, irreversibly | Send to `0x0…0` or `0x…dEaD` — a one-way hole no key can reverse |
| Degraded venue | Execution integrity | Route through an unhealthy bridge/DEX likely to fail mid-flight |

The engine's job is not to *know* the attacker's intent — it is to **detect the observable signature** of
each play and price it, so a human (or a policy) decides with eyes open.

### 6.2 The pipeline — subject in, decision out

`RiskEngine` ([`engine.ts`](../../packages/risk/src/engine.ts), **✅ shipped**, covered by
`engine.test.ts` + `detectors.test.ts`) is a standalone facade with no wallet or chain dependency — the
real backing for the `RiskProvider` the Intent planner, Execution Engine, and Route Optimizer consume, and
deployable as a security-as-a-service API on its own.

```
                 ┌───────────── RiskEngine.evaluate(subject) ─────────────┐
  SecuritySubject│                                                         │
  token/address/ │   ① threat-intel lookup ─── hit? ─► severity 1.0 signal │
  approval/prov. ─►  ② heuristic detectors ─── pure fns → RiskSignal[]     │──► SecurityDecision
                 │   ③ combineSignals ──── probabilistic-OR → score+level  │    { verdict, report,
                 │   ④ evaluatePolicy ──── configurable, tighten-only      │      policyViolations }
                 └─────────────────────────────────────────────────────────┘
                        pure · total · no network · no clock · no keys
```

Every stage is a pure function of its input. Same subject in → same decision out, always — which is *why*
it is safe to make it the gate: a gate with hidden state or I/O is itself an attack surface, and this one
has neither. `scan(subject)` returns the report alone; `evaluate(subject)` returns the report **plus** the
policy verdict. ([`types.ts`](../../packages/risk/src/types.ts) defines the four subject kinds.)

**① Threat intelligence** ([`intel.ts`](../../packages/risk/src/intel.ts)) is consulted *first*, and a
hit is a **hard** signal (severity `1.0`): a known scam token, a flagged malicious contract, a
sanctioned or blacklisted recipient, a malicious approval spender. The `ThreatIntel` **interface** and its
in-memory implementation are **✅ shipped**; the *continuously-synced, multi-source, signed-snapshot feed*
described in §3–§4 is **⏭ roadmap**. This is a load-bearing honesty point: **`RiskEngine` defaults to
`emptyThreatIntel`, which knows nothing.** Until a populated, integrity-verified intel snapshot is injected,
the intel-based hard blocks *do not fire* — the engine falls through to the heuristics. We do not pretend a
live scam database ships today; we ship the socket it plugs into and the guarantee that a hit, once wired,
is un-overridable.

**② Heuristic detectors** ([`detectors.ts`](../../packages/risk/src/detectors.ts), **✅ shipped**) are the
on-chain-behavior heuristics that catch what no list has flagged yet. Each is an independently-tested pure
function returning one `RiskSignal` or `null`:

| Detector | Signal → severity | Trigger |
|---|---|---|
| `detectHoneypot` | `HONEYPOT` → **0.99** | sell/transfer tax ≥ 2000 bps — a hard block on its own |
| `detectBurnAddress` | `BURN_ADDRESS` → 0.9 | `0x0…0` (any length, so a truncated one still fails) or `0x…dEaD` |
| `detectAddressPoisoning` | `ADDRESS_POISONING` → 0.85 | same-length look-alike of a known-good contact (first-6 + last-4 match, middle differs) |
| `detectUnlimitedApproval` | `UNLIMITED_APPROVAL` → 0.7 | allowance ≥ `2²⁵⁵` base units |
| `detectFreshToken` | `BRAND_NEW`/`FRESH` → 0.6 / 0.45 | token age < 1 / < 7 days |
| `detectLowLiquidity` | `VERY_LOW`/`LOW_LIQUIDITY` → 0.55 / 0.35 | liquidity < $10k / < $50k |
| `detectOwnershipConcentration` | `OWNERSHIP_CONCENTRATION` → 0.5 | one holder > 50% of supply |
| `detectAdminPrivileges` | `ADMIN_PRIVILEGES` → 0.3 | admin key and/or upgradeable proxy |
| `detectUnaudited` | `UNAUDITED` → 0.2 | no known audit |

**Honest gap (🔶 partial):** these detectors are only as good as the `meta` they are handed —
`feeOnTransferBps`, `liquidityUsd`, `ageDays`, `ownershipConcentrationBps`. In the composed runtime path
(below) the plan carries a recipient and an approval, but **does not yet populate on-chain token meta from a
live source**, so honeypot/liquidity/ownership detectors are *shipped code presently starved of live
inputs*. They fire in tests and against injected meta; wiring a real token-intelligence feed into the plan
pipeline is **⏭ roadmap**. A detector with no data returns `null` (no signal) — which is exactly why the
Risk Engine is **never trusted alone** (§6.6).

**③ Composite scoring** ([`scoring.ts`](../../packages/risk/src/scoring.ts), **✅ shipped**). Signals are
treated as **independent probabilities of harm** and combined with the probabilistic-OR:

```
score = 1 − Π(1 − sᵢ)        level:  score < 0.30 → low
                                      score < 0.60 → medium
                                      else         → high
any sᵢ ≥ 0.99                →  level = block  (regardless of score)
```

This is a deliberate choice over a weighted sum: small risks **compound** (a fresh token *and* thin
liquidity *and* an admin key is worse than any one alone) while the result stays bounded in `[0,1]` — a
property a sum cannot promise. The score is rounded to two places; signals are returned most-severe-first so
the UI and the explainable report (§9) lead with what matters. Any single hard signal (sanctioned,
blacklisted, honeypot) forces `block` *even if the arithmetic score is low* — a listed scam is not a
"probably fine on average" situation.

**④ Risk-policy resolution** ([`policy.ts`](../../packages/risk/src/policy.ts), **✅ shipped**) turns the
report into a verdict under a **configurable** posture (`strict` / `balanced` / `permissive`). The rule that
makes this safe: **a policy can only ever tighten, never loosen.** A `block`-level report is terminal — no
policy, however permissive, can turn it into an `allow`. Policies add *stricter* gates on top: block any
unaudited contract, block any unlimited approval, block above a max score, require confirmation above a
lower score. The three presets:

| Preset | maxRiskScore (block) | requireConfirmationAbove | blockUnaudited | blockUnlimitedApproval |
|---|---|---|---|---|
| `strict` | 0.60 | 0.30 | yes | yes |
| `balanced` *(default)* | 0.85 | 0.50 | no | no |
| `permissive` | 0.95 | 0.75 | no | no |

### 6.3 How the score gates a real decision — composition with the Policy Engine

The Risk Engine does not act in isolation at runtime. The authorization gate
([`packages/runtime/src/policy.ts`](../../packages/runtime/src/policy.ts) `authorizePlan`, **✅ shipped**)
composes it with the runtime **Policy Engine** so both see the *same* subject: `subjectFor(request)`
([`packages/policy/src/context.ts`](../../packages/policy/src/context.ts)) maps a plan's recipient to an
`address` subject and its approval to an `approval` subject, then the Policy Engine calls
`RiskEngine.evaluate` on it. The two verdicts fuse in `composeWithRisk`
([`packages/policy/src/decision.ts`](../../packages/policy/src/decision.ts), **✅ shipped**) under
**MOST-RESTRICTIVE-WINS** over a combined-gate rank:

```
rank:  allow(0) < require_confirmation(1) < defer(2) < escalate(3) < block(4)
gate = RANK_TO_GATE[ max(rank(riskGate), rank(policyGate)) ]
mayProceedToSign = (gate === 'allow') && requirements.length === 0
```

Neither side has silent authority to downgrade the other. A `block` on *either* side is terminal. The one
boolean the Execution layer is allowed to read is `mayProceedToSign` — and it is true only when *both* Risk
and Policy independently reach `allow` with no outstanding confirmation. This is how a `high` risk score
mechanically becomes a required step-up sheet, and a `block` mechanically becomes a refusal the device
signer never sees a payload from.

**Attack → defense, end to end:**

| Attack | Signal / verdict | Composed outcome |
|---|---|---|
| Swap into a 30%-tax honeypot | `HONEYPOT` sev 0.99 → level `block` | `gate=block`; un-overridable by any preset; no payload reaches the signer |
| Send to a sanctioned address | `SANCTIONED_ADDRESS` sev 1.0 → `block` | terminal; permissive policy cannot loosen it (tested) |
| Unlimited approval to unknown spender | `UNLIMITED_APPROVAL` sev 0.7 → `high`/confirm; `block` under `strict` | `require_confirmation` (balanced) or `block` (strict) |
| Look-alike poisoned recipient | `ADDRESS_POISONING` sev 0.85 → `high` | step-up confirmation naming the real contact it mimics |
| Everything clean | no signals → score 0 → `low` | `allow` — *and only then* `mayProceedToSign` is true |

### 6.4 The identity security **score** (distinct — and honestly labelled)

There are two different "scores" and conflating them would be a lie. The **transaction risk score** above is
per-action, computed, and **✅ shipped**. The **identity security score** of
[Chapter 5 §15](../bible/chapter-05-universal-identity.md) — the actionable posture number
(`92 / 100 · ✓ Backup · ✓ Trusted devices · ⚠ one unknown session · Review recommended`) — is a *product
surface* that grades the user's standing account-security posture and tells them the single next thing to
fix. It is a **⏭ design-mandated** surface per Ch5, not a claim that a composed posture score ships in the
Risk Engine today. Its inputs (backup state, device trust, session hygiene) live in Ch5/§8, not
`packages/risk`. We name it here only to draw the line: risk scores an *action*; the security score grades
an *identity*.

### 6.5 Auditability — every verdict is logged with its inputs and reason (Doctrine #8)

A refusal you cannot explain is indistinguishable from a bug. Every risk verdict carries its evidence:
`SecurityDecision` bundles the full `report` (score, level, **every** signal with its human `reason`) and
the `policyViolations` that drove the verdict. When composed, `ExecutionPermission` carries `reasons[]`
(`risk: …`, `risk-policy: …`, `policy: …`) and a `drivenBy` list naming which side won. That permission is
then written into the **hash-chained, append-only audit log**
([`packages/policy/src/audit.ts`](../../packages/policy/src/audit.ts), **✅ shipped**):
`entry_hash = hash(prevHash ‖ canonical(record))`, with a pure `verifyChain` that pinpoints the exact index
of any tampering. There is no update or delete surface on the log.

**Honest scope:** the hash-chained log *object* is shipped and tested; the full production tamper-evidence
regime from [`SECURITY.md §9`](../../SECURITY.md) — an INSERT-only DB role, a daily WORM/object-lock
anchor, and a nightly re-walk that pages security on mismatch — is **⏭ mandated roadmap**. "Auditable"
today means structured, reason-carrying, chain-linked records; it does not yet mean an externally-anchored
chain. We do not overstate it.

### 6.6 Fail-closed — and where "closed" actually lives

The subtle, must-not-lie truth: **the Risk Engine, alone, does not fail closed.** A detector with no `meta`
returns `null`; the default intel knows nothing; absent evidence, the engine reaches `low → allow`. That is
*fail-quiet*, not fail-closed — and it is fine, because the engine is **one layer of a defence in depth**,
never the last word. The system's hard fail-closed guarantees live in the layers it composes with:

- The **broadcast guard** ([`guard.ts`](../../packages/chains/src/guard.ts), §1/§5) refuses an unknown
  chain, a malformed or checksum-failing address, and an un-acknowledged mainnet/high-value spend — *whatever*
  the risk score says.
- The **spend caps** and `txMode: 'manual'` default (§8) refuse to auto-execute an unpriced or over-cap action.
- The **composition** (§6.3): a `block` is terminal and un-loosenable, and `authorizePlan` fails closed if a
  plan is *claimed but absent* (the authoritative amount is re-derived from the plan's own quote, never a
  spoofable request field).

So the honest posture is: the Risk Engine **maximises informed refusal** — it turns everything we *do* know
into a compounding, bounded, auditable verdict that can only tighten toward `no` — and it hands off to
deterministic gates that fail closed on everything we *don't*. A `block` here is a wall; a silence here is
caught by the wall next to it. Neither the AI nor the score can ever conjure an `allow` the guard and the
device signature didn't independently grant.

> **The litmus test for this section:** if the threat feed is empty, the meta is missing, and the model is
> hijacked, what is the worst outcome? A *proposal* that still faces the guard, the caps, the tighten-only
> composition, and — finally — a human signature on exact bytes. The Risk Engine makes that human decision
> *informed*; it never makes it *for* them, and it can never make the wall lower.


## §7 · Behavioral Anomaly Detection

> **The honesty this section is built on.** Almost everything a marketing deck would call "AI fraud
> detection" is **roadmap** here, and this section says so in every paragraph. What *ships today* is the
> **step-up machinery** — the re-authentication, the acknowledgement gates, the auto-lock — that an anomaly
> signal would *drive*. The scoring that decides *when* to pull those levers on the basis of amount,
> recipient, time, or velocity is **not built**, and a security document that implied it were would be
> committing the exact lie ([Doctrine #3](../../CLAUDE.md)) this chapter exists to refuse. The rule for §7:
> **a control that produces *false confidence* is worse than no control**, because a user who trusts an
> anomaly detector that isn't watching is *less* careful than one who knows they're on their own. So the
> mechanism is real and cited; the intelligence behind it is labelled `⏭` without apology.
>
> **Status legend** (from [`SECURITY.md §0`](../../SECURITY.md)): ✅ **Shipped** — in-repo and tested, cited
> by file · 🔶 **Partial** — real on one surface/env, gaps named · ⏭ **Mandated (roadmap)** — a binding
> requirement with a landing phase, *not* a claim it runs.

---

### 7.1 · What "anomaly" means here — and what it does *not*

The other sections of this chapter judge the **target** of an action: is this token a honeypot (§3), is this
address poisoned (§3/§6), is this spender malicious (§5)? Behavioral anomaly detection asks an orthogonal
question — **is this action unusual *for this user*?** A transfer can be to a perfectly clean address, a
perfectly audited contract, with a green Risk Score (§6), and still be the first sign of a compromise:
because it is 40× the largest amount this wallet has ever sent, at 4am when the user has never transacted at
night, to a brand-new recipient, as the third send in ninety seconds. None of the target-risk detectors fire
on that transaction — the *pattern* is the signal, not the payload.

This is the layer that catches the attacker who has already won the earlier rounds: the one who phished a
session, socially-engineered an approval the user genuinely tapped, or is operating a device whose owner
walked away from it unlocked. Every other gate in Chapter 10 assumes the *device and the human* are honest
and asks whether the *counterparty* is. Anomaly detection inverts that assumption and asks whether *this
behaviour* matches the human we've seen before — the last independent check before the doctrine's final
authority, the on-device signature, disposes of funds.

**What it explicitly is not:** it is not a second signing authority, and it is not a silent judge. Per the
doctrine, no engine in this system *moves* funds and no engine *silently blocks* a legitimate user from their
own money. An anomaly resolves to exactly one of three visible outcomes — **step-up**, **hold**, or **let
through with a logged note** — never a quiet allow and never an unexplained denial. A non-custodial wallet
cannot lock a user out of their own keys on a hunch; it can only *insert friction and demand proof of intent*.

---

### 7.2 · The signals — and each one's real state

We separate the signals by whether the wallet can *observe* them today. The distinction is load-bearing:
some signals are byproducts of state we already keep (a device is or isn't the one that unlocked the vault);
others require a **behavioural baseline** — a learned model of this user's normal — that the wallet does not
yet build.

| Signal | What it catches | Attacker it defends against | State |
|---|---|---|---|
| **New / untrusted device** | Action initiated from a device the identity has not established trust with | Stolen session replayed elsewhere; account takeover on a fresh device | 🔶 **the *mechanism* is real** — re-auth + auto-lock ship (§7.4); the enumerated 5-level device-trust *taxonomy* is Ch5-charter |
| **Unusual amount** | A transfer far outside this wallet's historical range | Drainer that maxes out a compromised session in one shot | ⏭ requires a per-user baseline — not built |
| **New / unusual recipient** | First-ever send to an address, or a sudden shift in counterparty pattern | Redirected funds after a session/approval compromise | ⏭ recipient-history model — not built |
| **Unusual time** | Activity at an hour this user never transacts | A compromised device operated while the owner sleeps | ⏭ temporal baseline — not built |
| **Velocity / burst** | Many actions in a short window; rapid drain pattern | Automated draining of an unlocked or session-compromised wallet | ⏭ rate model — not built; a *deterministic* daily/per-tx cap is the shipped cousin (see §7.4) |

> **The one-line truth for the whole table:** the columns that require *learning what is normal for you* are
> **roadmap**. The wallet does not today maintain a behavioural profile per user, and it must never render a
> UI badge — "unusual amount," "off-hours" — that implies it does. The signals that ship are the ones derived
> from **present, deterministic state** (is this device trusted? has the session re-authed? is this over a
> hard cap?), not from a statistical baseline.

**Why we hold the line so hard here.** A behavioural detector that is *wrong* is uniquely dangerous in two
directions. A **false negative** dressed as a green light ("no anomalies detected") teaches the user the
wallet is watching, so they stop watching — and the one time the model misses, they sign blind. A **false
positive** that hard-blocks a legitimate 3am transfer trains the user to reflexively tap through step-up
prompts, which *destroys* the value of step-up for the real attack. Both failures degrade the human's
vigilance, which is the most valuable — and least replaceable — sensor in the system. So the bar to *ship*
this class of control is not "the model is plausible"; it is "the model's false-positive and false-negative
rates are measured, bounded, and honestly surfaced," and until then it stays `⏭`.

---

### 7.3 · The response — step-up, never a silent verdict

An anomaly does not decide; it **escalates the proof it demands**. This maps cleanly onto the verdict
vocabulary the Risk and Policy engines already speak — `allow` / `require_confirmation` / `block`
([`packages/risk/src/types.ts`](../../packages/risk/src/types.ts)) — extended with the crucial middle rung a
non-custodial wallet needs: a **hold**, which is a *reversible pause pending proof of intent*, distinct from
a *block*, which is a refusal. The ladder, weakest to strongest:

```
   anomaly strength ─────────────────────────────────────────────▶
   ┌──────────┬───────────────────┬────────────────────┬─────────────────────┐
   │ note     │ extra confirmation │ re-authentication  │ hold (time-lock)    │
   │ (log +   │ (explicit "yes, I  │ (password / device │ (delay + out-of-    │
   │  surface)│  meant this")      │  biometric again)  │  band confirm)      │
   └──────────┴───────────────────┴────────────────────┴─────────────────────┘
        ✅              ✅ (guard ACK)      ✅ (reveal re-auth)      ⏭ roadmap
```

- **Note.** The action proceeds, but the anomaly and its reason are written to the audit trail (Doctrine #5)
  and surfaced in the Explainable Risk Report (§9). This is the correct response to a *weak* signal: we do not
  add friction we can't justify, but we never let an unusual action pass *unrecorded*. ✅ (the audit-log
  substrate ships — [`packages/policy/src/audit.ts`](../../packages/policy/src/audit.ts); the anomaly *reasons*
  that would populate it are ⏭).
- **Extra confirmation.** The user must explicitly acknowledge the unusual property before the wallet
  proceeds — the same shape as the broadcast guard's `acknowledgeMainnet` / `acknowledgeHighValue` gates,
  which already demand a distinct, un-fakeable "yes" for real-funds and above-cap transfers
  ([`guard.ts`](../../packages/chains/src/guard.ts), Ch7/§5). ✅ for the mechanism; wiring an *amount/recipient
  anomaly* into a new acknowledgement flag is ⏭.
- **Re-authentication.** The wallet demands the password (and, on mobile, the device biometric — ⏭ Phase 8)
  *again*, proving a human who holds the secret is present. This is **shipped today** for seed-reveal, the
  single most sensitive read in the product: the reveal flow re-prompts for the password and verifies it
  before the phrase is shown ([`apps/web/src/App.tsx`](../../apps/web/src/App.tsx) `verifyPassword` →
  `revealMnemonic`), and mainnet spends re-gate through explicit acknowledgement. ✅
- **Hold (time-lock).** The strongest reversible response: delay the action for a cooling-off window and
  require an out-of-band confirmation (a second trusted device, an emergency contact — Ch5 §14) to release or
  cancel it. This converts a fast, irreversible drain into a *slow, cancellable* one, giving a compromised
  user a window to react. It is the natural companion to the emergency freeze of §9. ⏭ **roadmap** — the
  wallet ships no time-lock today; do not imply it does.

**The invariant across the ladder:** every rung is either *more proof of intent* or *more time to react* —
**never a silent block and never a silent allow**. A user is always told *why* they're being asked for more,
and a legitimate user can always satisfy the demand (they hold the key; they can re-auth; they can wait out a
hold). The wallet inserts friction; it never confiscates access. That is the only anomaly response compatible
with law #1 — *the keys are the user's, on their device, always.*

---

### 7.4 · What actually ships — the deterministic floor under the roadmap

Strip away the unbuilt AI and there is still a real, tested behavioural-safety floor. These are the controls
that run *now*, and they are deterministic — no model, no baseline, no false-confidence surface:

| Control | What it does behaviourally | State · file |
|---|---|---|
| **Auto-lock on idle** | Ends the unlocked window after inactivity → an abandoned unlocked device self-heals into a locked one; the keyring is destroyed on lock | ✅ [`packages/core/src/wallet/session.ts`](../../packages/core/src/wallet/session.ts) (`SessionManager`, default 5-min idle) |
| **Re-auth for the crown-jewel read** | Seed reveal demands the password again, regardless of unlocked state | ✅ [`apps/web/src/App.tsx`](../../apps/web/src/App.tsx) |
| **Mainnet + high-value step-up** | A real-funds broadcast is blocked without explicit acknowledgement; above **$1,000** it demands a *second* high-value ack | ✅ [`guard.ts`](../../packages/chains/src/guard.ts) (`acknowledgeMainnet`, `MAINNET_SPEND_CAP_USD`) |
| **Automation velocity caps** | Auto-execution (no per-tx confirm) binds a **$25** per-tx and **$100** daily cap and *fails safe* to manual confirmation when a USD value is unknown or a cap would be exceeded | ✅ [`SECURITY.md §5`](../../SECURITY.md); never weaken `autoDecision` |
| **Session revocation / sign-out-everywhere** | A user who suspects a compromised device can instantly invalidate its sessions server-side | ✅ [`services/api/src/auth`](../../services/api/src/auth) (JWT `jti` revoker) |

The automation caps deserve emphasis as the *shipped, deterministic ancestor* of velocity anomaly detection.
An AI "unusual burst" model is roadmap — but the hard daily/per-tx cap already bounds the blast radius of any
runaway automation to a fixed dollar figure and **fails closed** when it can't price the action. That is the
doctrine's move throughout: where the *smart* control isn't built, a *dumb, total* one holds the floor, and
the dumb one is honest about being dumb. The AI, when it lands, will make these gates *tighter and
context-aware* — it will never be the thing standing between a drain and the funds, because a deterministic
cap already is.

---

### 7.5 · The privacy constraint — anomaly detection that exfiltrates nothing

A behavioural profile is, by definition, a dossier: amounts, times, counterparties, rhythms. The naive
architecture ships that dossier to a server to be scored — and in doing so converts a *safety* feature into
the single richest **deanonymization** asset in the system (asset #4, §1). We refuse that trade. The binding
constraints on any anomaly detection we ship, present and future:

1. **On-device baseline.** The behavioural model is computed and stored **on the user's device**, from data
   the device already holds. Learning "what is normal for you" must not require telling a server what you do.
   This mirrors law #1's shape for privacy data: the sensitive material stays local by construction, not by
   policy. (⏭ — the on-device model is roadmap; this is the *design constraint it must land under*, stated now
   so it is never violated later.)
2. **No new server-side dossier.** Anomaly detection introduces **no** collection of transaction patterns the
   backend does not already, unavoidably, see. The server routes and prices; it does not get a behavioural
   profile it wouldn't otherwise have. If a future design *needs* server-side scoring, it must operate on
   *minimized, non-identifying* features — never a raw history — and pass the §13 security review before it
   ships.
3. **Non-custodial is not negotiable.** No anomaly outcome — not a hold, not a freeze (§9) — is ever an
   *external* party gaining control of the user's keys or funds. A "hold" is a local, user-releasable pause; it
   is not the wallet, the server, or a recovery contact taking custody. The keys never leave the device to
   satisfy a safety feature, exactly as they never leave it to satisfy anything else.
4. **Audit without leakage.** The anomaly and its reason are logged (Doctrine #5, §9) in a form safe to
   retain — reason codes and bounded features, never a running plaintext biography of the user's finances,
   and never key material (the `WalletError`/audit contract keeps messages code-not-secret,
   [`SECURITY.md §7`](../../SECURITY.md)).

---

### 7.6 · How it fails — and why it fails *closed*

Every control must have a defined behaviour under its own failure. For anomaly detection the honest analysis
is unusually important, because the *tempting* failure mode — "the model is uncertain, so let it through so we
don't annoy the user" — is precisely the fail-*open* the doctrine forbids.

| Failure | Wrong (fail-open) behaviour | Our behaviour |
|---|---|---|
| Model unavailable / not yet built | Show "no anomalies detected" (false all-clear) | Show **nothing** — the wallet does not claim a check it didn't run; the deterministic floor (§7.4) still holds |
| Baseline too sparse (new user) | Suppress all step-up until "enough" data | Fall back to the deterministic gates (mainnet ack, caps, re-auth) — a new user is *never* less protected |
| Anomaly *suspected* but unpriceable / ambiguous | Silently allow | **Step up** — demand more proof; ambiguity resolves toward friction, not through it |
| Signal source (device-trust state) unreadable | Assume "trusted" | Assume **untrusted** → require re-auth; an unverifiable device is treated as new |

The governing rule is the same one that governs the broadcast guard: **anything the layer cannot *positively*
verify is escalated, never waved through** ([`guard.ts`](../../packages/chains/src/guard.ts) fails closed on
unknown chain / malformed address; this layer fails closed on unknown *behaviour*). And the meta-failure —
the layer being absent entirely, which is *today's* reality for the AI portion — fails closed too, because it
was never the thing authorizing the action. It is an *escalator*, sitting on top of a deterministic floor
(caps, re-auth, auto-lock, the guard) that already refuses on its own. Remove the anomaly AI and nothing
becomes *permitted* that wasn't already permitted; you lose sensitivity, not safety.

---

### 7.7 · Benchmark and honest positioning

The best-in-class comparison for §7 is not another wallet's pop-up; it is the **card networks' fraud
scoring** and modern **passwordless step-up** (the "we noticed a sign-in from a new device" flow). Those
systems earn trust because their step-up is *proportionate and explained* — a challenge appears when the risk
is real and stays out of the way when it isn't. That proportionality is the whole game, and it is exactly what
an *unmeasured* anomaly model cannot deliver, which is why ours stays `⏭` until its error rates are bounded.

Against wallet peers: pre-sign risk surfaces (Rabby, Wallet Guard/Blowfish, Pocket Universe) are strong on
**target risk** — is this contract/approval dangerous — which we address in §2–§6. **Behavioural** anomaly
("this is unusual *for you*") is a thinner field precisely because doing it without building a server-side
surveillance profile is hard; most who do it, do it in the cloud. Our differentiated bet is the **on-device
baseline** (§7.5) — safety without a dossier. Today that bet is a *design constraint on a roadmap feature*, and
we say exactly that. Hardware wallets, worth naming, provide the strongest *device-trust* anchor of all (the
key can't act without the physical device); integrating them (⏭, [`SECURITY.md §3.5`](../../SECURITY.md)) would
make "new/untrusted device" a cryptographic fact rather than a heuristic.

> **The Principal Security Engineer's sign-off for §7.** I sign the *mechanism* — auto-lock, re-auth,
> acknowledgement gates, deterministic caps, session revocation — as **shipped and true**. I sign the
> behavioural-anomaly AI, the per-user baseline, and the time-lock hold as **roadmap**, bound by the
> privacy constraints of §7.5 and the fail-closed rule of §7.6, and I **veto** any build that surfaces an
> anomaly verdict the model did not actually compute, or that ships a behavioural baseline to a server. A
> detector that lies about watching is worse than no detector; this section ships only what watches.

**Cross-references:** device-trust levels and the session model — Ch5 §8–§9; the on-device keystore and
auto-lock substrate — Ch6; the deterministic broadcast/constraint gates this layer escalates on top of — Ch7
and §5; the composite Risk Score and verdict vocabulary — §6; device trust & session security in depth — §8;
emergency freeze, time-lock recovery, and the Explainable Risk Report that renders an anomaly's reason — §9.


## §8 · Device Trust & Session Security

> *Signed by the Principal Security Engineer. Every control below carries its real
> state — ✅ shipped (with the file), 🔶 partial (with the named gap), or ⏭ roadmap
> (with the landing). A security document that claims a control it does not run is
> itself a lie ([Doctrine #3](../../CLAUDE.md); [SECURITY.md §0](../../SECURITY.md)).
> This section overclaims nothing.*

Everything else in Chapter 10 — simulation (§2), contract and scam detection (§3),
reputation (§4), approval hygiene (§5), the Risk Engine (§6), anomaly detection (§7) —
runs *upstream* of a decision and produces at most a **verdict the user can read**. This
section is about the two things that decide whether that user, on that device, in that
moment, is *allowed to act at all*: **is this device trusted enough for what it is
asking, and is this session still the one the human opened?** The device is the root of
trust. It is where the keys live ([Ch5 §2](../bible/chapter-05-universal-identity.md),
[Ch6 §3](../bible/chapter-06-wallet-core-architecture.md)), where the confirm sheet is *the*
trust boundary ([SECURITY.md §2.2](../../SECURITY.md)), and where — by construction —
the only bytes that ever leave are signatures and opaque vault ciphertext. So the
controls here are not "nice to have." They are the last locks before the one asset that
is catastrophic and irreversible: **the seed** ([SECURITY.md §2.1](../../SECURITY.md)).

The honest headline: **the session and guard machinery is largely real and shipped; the
device-*attestation* machinery is largely roadmap.** We separate the two rigorously
below, because conflating "we have an auto-lock timer and a revocable session" (true,
shipped, cited) with "we cryptographically bind trust to a hardware-attested device"
(mandated, not built) would be exactly the lie this chapter exists to refuse.

---

### 8.1 · The two sessions — do not confuse them

The single most important mental model in this section is that **there are two distinct
sessions**, they protect different assets, they fail in different ways, and a control that
belongs to one does **not** cover the other.

| | **Device unlock session** | **Server (SIWE) session** |
|---|---|---|
| **What it gates** | Access to the *decrypted keyring* in device RAM — i.e. the power to **sign** | Access to *this user's* server-side reads (watch-list, portfolio, plan cache) |
| **Where it lives** | Zone 0 — the device only ([Ch6 §3](../bible/chapter-06-wallet-core-architecture.md)) | Client storage ↔ server verify path (Zone 1→2) |
| **What backs it** | The vault password (scrypt+AES-256-GCM) → in-memory keyring | An HS256 JWT recovered from a SIWE signature |
| **Worst case if stolen** | **Fund loss** — the attacker can sign | **Privacy breach** — read one user's data; *cannot sign, cannot move funds* |
| **How it ends** | Auto-lock timer, manual lock, wipe → keyring destroyed | `exp`, individual revoke (`jti`), or sign-out-everywhere |
| **Real state** | ✅ SessionManager + WalletManager | ✅ SIWE + JWT + revoker |

The asymmetry is the whole point and it is enforced by architecture, not policy: **a
fully-compromised server session can never become fund loss**, because the server holds no
key and the JWT authorizes reads and *plan ownership*, never a signature
([SECURITY.md §2.3](../../SECURITY.md); Ch10 §1). The catastrophic asset is reachable
only through the *device* session. That is why the device session gets re-auth gates and
the server session gets revocation — each hardened where its blast radius actually is.

---

### 8.2 · Device trust levels — the model (mostly roadmap, stated plainly)

[Ch5 §8](../bible/chapter-05-universal-identity.md) defines a five-level device trust ladder,
and high-risk actions from **new** devices are meant to demand step-up verification:

```
 revoked ──▶ (dead: no action permitted, ever)
suspicious ──▶ step-up required for ANY signing action; read-only until cleared
    new    ──▶ step-up required for high-risk / mainnet / high-value actions
 verified  ──▶ normal use; step-up only at the re-auth gates (§8.4)
 trusted   ──▶ normal use; the device the identity was created on
```

**Attacker and asset.** The adversary is someone who has obtained a *credential* (a leaked
SIWE token, a phished password) but is operating from a **device the user has never used** —
the classic account-takeover-from-a-new-machine. The asset defended is the signing
decision and, transitively, the funds. The intended defense: a new or suspicious device
cannot perform a high-risk action on credentials alone; it must clear an additional,
device-bound step-up.

**REAL STATE — ⏭ roadmap (largely), with one shipped primitive.**

- ✅ **Shipped — the re-auth gate the ladder would trigger.** The *mechanism* a step-up
  invokes on the device — password re-authentication that works even while unlocked — is
  real and cited in §8.4 (`WalletManager.verifyPassword`). What is roadmap is the
  *classifier* that decides a given device is "new" and therefore *must* invoke it.
- ⏭ **Roadmap — device identity, attestation, and the trust-level store.** There is today
  **no** persisted per-device identity, **no** hardware attestation (Secure Enclave /
  StrongBox / WebAuthn device binding), and **no** server-side trust-level table keyed by
  device. The SIWE session ([§8.3](#83--the-server-siwe-session--shipped)) authenticates an
  *address*, not a *device*; it cannot today tell "same key, brand-new machine" from "same
  key, home machine." Landing: device-keypair enrollment + proof-of-possession refresh
  bound to that keypair ([SECURITY.md §6](../../SECURITY.md), ⏭ mandated), which is the
  substrate a real trust ladder needs.

**How it fails closed (in design).** Every unclassifiable device must resolve to the *most
restrictive* level its evidence supports — an un-attested, unrecognized device is treated
as **new**, never as **trusted**; a device flagged `suspicious` or `revoked` is refused,
not "probably fine." Until the attestation substrate lands, we do **not** claim a device
trust decision we cannot make — the current build's real, shipped boundary is the on-device
password re-auth (§8.4) and the mainnet/high-value guard (§8.5), and those are what protect
funds today.

> **Benchmark, honestly.** Hardware wallets (Ledger, Trezor) *are* device attestation —
> the private key is inside a device you physically possess and the screen is the trust
> boundary. That is exactly the assurance our ⏭ hardware-wallet and passkey-unlock roadmap
> targets ([§8.6](#86--roadmap--stronger-device-binding)). We do not imply we have it.

---

### 8.3 · The server (SIWE) session — shipped

**Attacker and asset.** A network attacker or a popped service tries to *impersonate* a
user to read their private data, or replays a captured credential. The asset is asset #3 —
session credentials — whose compromise is a **privacy** incident, never fund loss
([SECURITY.md §2.1](../../SECURITY.md)).

**How it works.**

- **Non-custodial auth, ✅** — [`services/api/src/auth/siwe.ts`](../../services/api/src/auth/siwe.ts).
  Sign-in reuses the *same* signature the wallet already makes: the server issues a
  one-time nonce; the wallet signs it with `personal_sign` **in the browser** (no
  transaction, no fee, **key never leaves the device**); the server recovers the address
  and matches it to the nonce. No new secret, and no password ever reaches a server —
  the auth path itself honors Doctrine #1.
- **Session token, ✅** — [`services/api/src/auth/jwt.ts`](../../services/api/src/auth/jwt.ts).
  A minimal HS256 JWT over `node:crypto` HMAC (no JWT dependency, no key beyond the shared
  `IW_AUTH_SECRET`). Verification is **constant-time** (`timingSafeEqual`) and
  **fail-closed**: a length-mismatched signature, a non-three-part token, a malformed
  base64url segment, a missing `sub`/`iat`/`exp`, or an `exp` in the past all return
  `null`, never a partial trust. The `jti` claim is what makes a single session
  individually killable.

**How it fails closed.** `verifyJwt` has exactly one success path and many null-returning
failure paths; anything it cannot positively verify is rejected. A tampered payload breaks
the HMAC; an expired token is refused even with a valid signature. There is no "verify but
warn" — the auth guard treats `null` as unauthenticated, full stop.

---

### 8.4 · Re-auth gates — the seed-reveal and high-value step-ups (shipped)

Some actions are dangerous enough that "the wallet is already unlocked" is **not** sufficient
authorization. The two we gate today are **revealing the recovery phrase** and the
**mainnet / high-value confirmations**.

**Attacker and asset.** The adversary here is the §2.2 *local attacker with the device* — a
borrowed, shoulder-surfed, or briefly-unattended **already-unlocked** phone. Auto-lock
(§8.7) shrinks this window but cannot close it; the re-auth gate is the defense that
survives inside an open session. The asset is the seed itself (reveal) and a real-funds
broadcast (mainnet).

**How it works — and the subtle correctness rule that makes it real.**

```
Reveal seed  ─▶  prompt for password  ─▶  WalletManager.verifyPassword(pw)  ─▶  decrypt vault directly
                                                    │                              (does NOT read the unlock flag)
                                                    ▼
                                          true → reveal · false → refuse
```

- ✅ **Shipped** — [`packages/core/src/wallet/wallet-manager.ts`](../../packages/core/src/wallet/wallet-manager.ts)
  `verifyPassword`, surfaced in [`apps/web/src/wallet.ts`](../../apps/web/src/wallet.ts)
  and driven by the reveal flow in [`apps/web/src/App.tsx`](../../apps/web/src/App.tsx)
  (`revealAsk` → `verifyPassword(revealPw)` → `revealMnemonic()`).
- **The load-bearing detail:** re-auth **must not** be implemented with `unlock()`.
  `unlock()` is a **no-op when the wallet is already unlocked** — it would accept *any*
  password and silently "succeed," turning the gate into theater. `verifyPassword` instead
  **decrypts the sealed envelope directly** and returns true iff the password actually
  opens the vault, so it re-authenticates correctly *even while unlocked*. This is called
  out in the code's own contract comment and is a standing invariant: **never route a
  re-auth through `unlock()`.** It is exactly the kind of "green but fake" control this
  chapter forbids.

**How it fails closed.** A wrong password returns `false` and the seed is never shown; a
tampered or corrupt vault raises `VAULT_DECRYPT_FAILED` / `VAULT_CORRUPTED` (a wrong password
and a tampered vault are **indistinguishable by design** —
[SECURITY.md §3.2](../../SECURITY.md) — so the attacker learns nothing). The phrase is
shown once, is never persisted outside the vault, and never touches a wire — core has no
network path to leak it ([SECURITY.md §3.4](../../SECURITY.md)).

**🔶 Named gap.** The re-auth factor today is the **vault password only**. It is not yet a
biometric or a hardware-attested factor, so it does not defend against an attacker who *also*
has the password (e.g. a keylogger on the device). Biometric/passkey step-up is ⏭ (§8.6). We
label this a partial, not a "strong step-up."

---

### 8.5 · The mainnet / high-value guard — shipped

The single most dangerous moment in the whole system is a real, mainnet, irreversible
transfer, and the gate that stands there is the *same* deterministic broadcast guard that
[Ch10 §1](#1--security-architecture--threat-model) and
[Ch8](../bible/chapter-08-universal-execution-engine.md) build on. From the *session* angle it is the
control that says: even a fully-authorized, fully-unlocked session cannot move real funds
without an **explicit, informed, un-fakeable acknowledgement**.

- ✅ **Shipped** — [`packages/chains/src/guard.ts`](../../packages/chains/src/guard.ts),
  covered by `guard.test.ts`. Pure and total: **no network, no clock, no keys, no I/O**;
  same input → same decision; its only power is to **refuse**. It therefore cannot itself
  become an attack surface.
- **The two acknowledgements it enforces:**
  1. **Mainnet → `acknowledgeMainnet` required.** A non-testnet broadcast is *blocked*
     without an explicit confirmation, and always carries an *"irreversible"* warning even
     once acknowledged.
  2. **Above `MAINNET_SPEND_CAP_USD` ($1,000) → `acknowledgeHighValue` required.** A single
     mainnet transfer over the cap additionally demands a high-value confirmation.
- **Wired end-to-end:** the acks ride through
  [`apps/web/src/broadcast.ts`](../../apps/web/src/broadcast.ts) into the guard; network
  mode defaults to **testnet** ([`apps/web/src/settings.ts`](../../apps/web/src/settings.ts)),
  so mainnet is opt-in and guarded, never the silent default.

**How it fails closed.** The guard's default answer is *no*: an unknown chain, a malformed
or EIP-55-failing recipient, an unacknowledged mainnet send, or an over-cap send with no
high-value ack all populate `blocked[]`, and `assertBroadcastAllowed` **throws**
`GUARD_BLOCKED` at the call site. A *missing* USD value does not silently bypass the cap —
auto-execution falls back to manual confirmation when a real USD value is unknown or a cap
would be exceeded ([SECURITY.md §5](../../SECURITY.md); "never weaken `autoDecision`").
The full rule set and its EIP-55 recipient check are detailed in §1 and §5; here the point
is that it is the **session-level backstop**: no unlock, no trust level, no automation grant
can route a real-funds broadcast around these acknowledgements.

---

### 8.6 · Session revocation & sign-out-everywhere — shipped

**Attacker and asset.** A stolen or leaked **JWT** (asset #3). Without revocation a
stateless JWT is valid until `exp`, so a captured token is usable for its full remaining
life — the classic weakness of stateless auth. The asset is the user's private reads; again,
**never funds**.

**How it works** — [`services/api/src/auth/revoker.ts`](../../services/api/src/auth/revoker.ts),
enforced in the request path via `makeJwtVerifier` →
[`services/api/src/routes/v1/auth.ts`](../../services/api/src/routes/v1/auth.ts) and the
auth guard.

| Kill switch | Method | Use case | Mechanism |
|---|---|---|---|
| **Revoke one session** | `revoke(jti, ttlSec)` | Normal sign-out; lost device | Blocklist the token's `jti` until its own `exp` |
| **Sign out everywhere** | `revokeAllFor(sub, beforeSec)` | Password change; suspected theft | Set a per-subject cutoff; every token with `iat < cutoff` is dead |

- ✅ **Shipped**, with two backing stores behind one `SessionRevoker` interface: an
  `InMemorySessionRevoker` (dev/tests, single process) and a **Redis-backed**
  `RedisSessionRevoker` for multi-replica deployments — *a token revoked on pod A must be
  dead on pod B*, which is exactly why the store is shared. Wired in
  [`services/api/src/main.ts`](../../services/api/src/main.ts) (Redis when present).
- **Two correctness details that make it safe:** the sign-out-everywhere cutoff is
  **monotonic** — `revokeAllFor` never moves the cutoff backward, so a stale/replayed
  older call cannot *un-revoke* a subject. And every blocklist entry is TTL'd to no longer
  than a token could live, so the revocation lists stay bounded (they cannot grow forever).

**How it fails closed.** `makeJwtVerifier` first runs the fail-closed `verifyJwt`, then, if
a revoker is wired, calls `isRevoked` and **rejects on true** before the request is
authorized. The check runs *ahead* of trust, not after. 🔶 **Named gap:** revocation is
enforced only where a revoker is actually injected (deployed envs with Redis, plus tests);
a deployment that forgot to wire the revoker would fall back to expiry-only. The mandated
hardening — proof-of-possession refresh bound to a per-device keypair, refresh-reuse
detection with family revoke ([SECURITY.md §6](../../SECURITY.md)) — is ⏭ and would make
a stolen refresh token useless without the device key.

---

### 8.7 · Auto-lock — the idle timer (shipped)

**Attacker and asset.** The §2.2 local attacker again — a device left unlocked and
unattended. Auto-lock's job is to **shrink the unlocked window**, the honestly-documented
residual that no hot wallet can eliminate ([SECURITY.md §3.3](../../SECURITY.md)).

**How it works** — [`packages/core/src/wallet/session.ts`](../../packages/core/src/wallet/session.ts).
`SessionManager` is a pure timing/state object that **holds no key material**. `WalletManager`
wires it: `start()` on unlock, `touch()` on user activity (which re-arms the idle timer), and
an **`onLock` callback that fires when the idle timeout elapses** — at which point the
WalletManager **destroys the in-memory keyring**. The timeout is user-configurable
(`autoLockMinutes`, [`apps/web/src/settings.ts`](../../apps/web/src/settings.ts); default
**5 minutes**), and the scheduler is injectable so tests are deterministic (no real clocks in
the core).

**How it fails closed.** When the timer fires, the keyring is *destroyed*, not merely flagged
— any subsequent signing attempt hits `KEYRING_DESTROYED` and requires a fresh unlock. Two
honest residuals we state rather than hide:

1. **The default 5-minute window is a usability↔security tradeoff**, not zero exposure.
   Shorter TTLs and a foreground/background-aware immediate lock are ⏭ (§8.6).
2. **Auto-lock evicts keys from the keyring, but keys transiently in JS heap during an
   in-flight signing operation are outside its reach** — those are zeroized per-operation in
   a `finally` block by the signer, not by this timer
   ([SECURITY.md §3.3](../../SECURITY.md)). And while unlocked, malware with
   process-memory access on the device can still read the keyring — **game over for any hot
   wallet, and we say so.** Auto-lock shrinks that window; it does not claim to close it.

---

### 8.8 · Roadmap — stronger device binding

Named as ⏭ **mandated**, honestly labelled as not-yet-running. None of these may be presented
as shipped, and the features that depend on them may not claim the assurance they provide
until they land.

| Control | What it would defend | Landing |
|---|---|---|
| **Biometric / passkey unlock** (WebAuthn, Face ID / Touch ID, StrongBox) | Replaces/augments the password re-auth factor (§8.4); resists keyloggers | ⏭ Phase 8 (apps) — [SECURITY.md §2.4 (OS-keystore wrap), ADR-0029](../../SECURITY.md) |
| **OS-keystore-wrapped vault key** (Secure Enclave / StrongBox) | Vault key never in plain JS heap; hardware-gated unlock | ⏭ Phase 8 — ADR-0029 |
| **Device enrollment + attestation + trust-level store** | Makes §8.2's ladder real — "same key, new device" becomes detectable and step-up-able | ⏭ — substrate is PoP refresh bound to a device keypair ([SECURITY.md §6](../../SECURITY.md)) |
| **Shorter / adaptive auto-lock TTLs + background-lock** | Further shrinks the unlocked-device window (§8.7) | ⏭ |
| **Hardware wallet co-signing** (Ledger/Trezor) | Moves signing to a device you physically hold; screen becomes the trust boundary | ⏭ v2 — [SECURITY.md §3.5](../../SECURITY.md) |
| **Session risk score in the trust decision** (Ch5 §9 fields) | Feeds anomaly signal (§7) into step-up decisions | ⏭ |

---

### 8.9 · Attack → defense summary

| Attack | Defense | State |
|---|---|---|
| Stolen unlocked device signs a transfer | Auto-lock destroys keyring on idle; keyring not merely flagged | ✅ `session.ts` |
| Stolen unlocked device reveals the seed | Password re-auth via `verifyPassword` (direct vault decrypt, not `unlock()`) | ✅ `wallet-manager.ts` |
| Attacker with the password reveals the seed | Biometric/passkey step-up | ⏭ (🔶 password-only today) |
| Leaked JWT reused until expiry | `revoke(jti)` / `revokeAllFor(sub)`; enforced pre-authorization; Redis-shared across replicas | ✅ `revoker.ts` |
| Replayed old sign-out-everywhere call un-revokes a subject | Monotonic cutoff (`revokeAllFor` never moves backward) | ✅ `revoker.ts` |
| Forged / tampered / expired session token | Constant-time, fail-closed `verifyJwt` (single success path) | ✅ `jwt.ts` |
| Password sent to a server during auth | SIWE — wallet signs a nonce in-browser; no password on a server | ✅ `siwe.ts` |
| Fully-authorized session moves real mainnet funds silently | Guard: mainnet ack + `MAINNET_SPEND_CAP_USD` high-value ack; throws `GUARD_BLOCKED` | ✅ `guard.ts` |
| Account-takeover from a brand-new device | Device trust ladder + step-up on `new`/`suspicious` | ⏭ (mechanism ✅; classifier ⏭) |
| Server breach → move a user's funds | Impossible by construction — server holds no key; JWT gates reads + plan ownership only | ✅ by design (Ch10 §1) |
| Keylogger / process-memory read on unlocked device | Per-op zeroize + auto-lock shrink the window; **not closed** for any hot wallet | 🔶 honest residual |

---

**Section verdict.** Session security, re-auth gates, revocation, auto-lock, and the
mainnet/high-value guard are **real, shipped, and cited**. The device-*trust-ladder* — the
classifier that would recognize a device and force step-up on a new one — is **roadmap**, and
its hardware-attested unlock is **roadmap**. The Principal Security Engineer signs the shipped
controls as run-today and signs the roadmap controls only as binding, honestly-labelled
promises — never as protections that already stand. The residual of a fully-owned, unlocked,
malware-present device is named, not buried: no hot wallet closes it, and we do not pretend to.


## §9 · Emergency Freeze, Recovery & Explainable Risk Reports

> **Status legend** (per [`SECURITY.md §0`](../../SECURITY.md)): ✅ Shipped — implemented **and** tested in-repo, file cited · 🔶 Partial — one surface/env, gaps named · ⏭ Roadmap — a binding requirement with a landing phase, **not** a claim that it runs. This section is the last one in Chapter 10, and it is where the temptation to overclaim is greatest: "freeze," "recovery," "incident response" are exactly the words a security page loves to promise and rarely ships. The Principal Security Engineer signs only what is true — so every capability here is tagged, and the roadmap ones say *roadmap* in the same breath they are described.

Everything upstream of this section is about stopping the *first* bad thing: the simulation that shows you the drain before you sign (§2), the contract analysis that flags the honeypot (§3), the reputation check on the recipient (§4), the bounded approval that caps the blast radius (§5), the composite Risk Engine verdict (§6), the anomaly signal (§7), the device-trust and session controls (§8). This section is about the moment *after* — when a step has already gone sideways, when a device is lost, when a researcher finds a hole, when a user stares at a red **BLOCKED** banner and does not understand why. A security engine that only knows how to say *no* is a wall. A security engine that says *no, here is exactly why, and here is the safe way forward* is a guardrail. This section builds the second one.

Four capabilities, in escalating scope: **emergency handling** (what the running system does when a step fails), **recovery** (how a user gets their identity back), **incident response & disclosure** (how the *organization* responds when something is found), and — the capability that ties the whole chapter together — **explainable risk reports** (how every refusal in this chapter turns into understanding rather than a dead end).

---

### 9.1 The honest frame — what "freeze" can and cannot mean in a non-custodial wallet

Start with the hardest truth, because getting it wrong here would be a lie that undoes the whole chapter.

In a custodial exchange, "freeze the account" is a real, powerful, server-side lever: the operator holds the keys, so the operator can refuse to move the funds no matter what the user does. That lever does not exist here, **by construction and on purpose.** Per Doctrine #1 and [Ch6](../bible/chapter-06-wallet-core-architecture.md), the seed and the derived private keys live on the device, encrypted at rest (scrypt + AES-256-GCM), and **never touch a server.** The only bytes that ever leave [Zone 0 are signatures and opaque vault ciphertext](../../SECURITY.md#23-trust-boundaries--signing-authority-lives-in-exactly-one-place). It follows, inescapably, that:

> **No server we run can freeze a user's funds — and that is a security *property*, not a gap.** The same wall that stops us from seizing a user's money stops an attacker who pops our servers from seizing it too. A breach of Zones 1–3 is a privacy or availability incident, [never fund loss](../../SECURITY.md#22-adversaries-we-design-against).

So when this section says "emergency freeze," it means something narrower and more honest than an exchange's kill switch. It means, in order of what is real today versus mandated later:

| What "emergency" can mean here | Mechanism | Real state |
|---|---|---|
| **Halt the in-flight execution** — stop the *next* step of a multi-leg plan the moment a leg fails or a post-condition breaks | Execution Engine emergency handling ([Ch8 §20](../bible/chapter-08-universal-execution-engine.md)) | ✅ shipped (see §9.2) |
| **Cut a bad *surface*** — disable a venue, a chain, the LLM path, or session-key automation without a full outage | Independent kill-switches | ⏭ mandated ([SECURITY.md §11](../../SECURITY.md#11--incident-response--kill-switches)) |
| **Revoke a standing permission** — kill an ERC-20 allowance or an automation grant that has become a liability | Approval revoke (§5) + session/automation caps (§8) | ✅ revoke shipped (§5); 🔶 automation caps |
| **Lock the wallet** — destroy the in-memory keyring so a walk-away device cannot sign | Auto-lock idle timer + explicit lock ([Ch6](../bible/chapter-06-wallet-core-architecture.md)) | ✅ shipped |
| **Guidance, not seizure** — when funds are already exposed, tell the user the true safe action (move funds to a fresh seed) | Recovery guidance (§9.3) + explainable reports (§9.6) | ✅ guidance; ⏭ in-app assisted migration |

What "freeze" **never** means here is a server reaching into a user's wallet and stopping a transaction. We do not have that power, we do not want it, and we will not imply we have it. The most a compromised-but-not-yet-drained user can do that we *facilitate* is: lock the device, revoke the dangerous approval, and move funds to a clean identity. Everything below is built around making those three actions fast, clear, and un-fakeable — and around never pretending we can do the fourth thing that only a custodian can.

Benchmark honestly: a hardware wallet's "freeze" is the same story — pull the device and no one can sign. Our lock + revoke + migrate is the hot-wallet analogue, and like every hot wallet we [say plainly](../../SECURITY.md#33-use--keys-live-for-one-operation-and-are-wiped) that a fully-owned, unlocked device with the wallet open is game over. We shrink that window; we do not lie about closing it.

---

### 9.2 Emergency handling in execution — pause, preserve, explain (✅ shipped)

**Defends against:** a multi-leg plan (approve → swap → bridge) where an early leg succeeds and a later leg fails, is delayed, or violates its post-condition — the classic partial-execution trap where a naïve engine barrels ahead and strands or loses funds. **Attacker/failure:** a flaky RPC, a venue that fills half a route, a bridge that accepts a deposit but stalls on the far side, an oracle that moves under a live slippage bound. **Asset:** the funds mid-flight between legs.

[Ch8 §20](../bible/chapter-08-universal-execution-engine.md) is the real, shipped core here, and its charter is exactly the three verbs this section cares about: **pause further steps when possible · preserve user funds · explain the situation clearly.** Concretely, the Execution Engine ([`packages/execution`](../../packages/execution), tasks #24–#26) runs a state machine per plan where each leg is a discrete, resumable step with an explicit post-condition. When a step fails or its post-condition does not hold:

1. **It fails closed and halts the sequence.** The engine does not advance to the next leg on unverified state. A plan that cannot *positively* confirm leg N succeeded does not sign leg N+1 — the same fail-closed law the [broadcast guard](../../packages/chains/src/guard.ts) enforces one level down. There is no "assume it worked" path.
2. **It parks, it does not silently retry into loss.** Recovery/park (task #25) captures the plan's exact state — which legs completed on-chain, which did not — so nothing is double-spent on a resume and nothing is lost to a blind retry. A parked plan is a *known, inspectable* state, not a dropped ball.
3. **It preserves the invariant that already-signed legs were what the user approved.** Because the device signed exact bytes per leg ([Ch6](../bible/chapter-06-wallet-core-architecture.md)) and each leg was independently guarded, a halt mid-plan never leaves an *unauthorized* transaction in flight — only an *incomplete* authorized one, which is a recoverable position, not a breach.
4. **It explains.** The parked state carries a plain-language reason (which leg, what broke, what the safe options are) — the seed of the explainable-report machinery in §9.6.

**How it fails closed:** the default on any ambiguity is *stop and surface*, never *continue and hope.* This mirrors the [auto-execution fail-safe in the guard](../../SECURITY.md#5--the-guard-rules--the-deterministic-gate-between-plan-and-wire): when a USD value is unknown or a cap would be exceeded, automation degrades to manual confirmation rather than guessing. The execution emergency handler degrades to *parked + explained* rather than guessing that a stalled leg will resolve itself.

**Honest gap (🔶 / ⏭):** what is ✅ is the engine's halt-park-explain behaviour on the paths it drives. What is **not** yet shipped is the *cross-surface* kill-switch above it — the ability to trip a single lever that disables an entire *venue* or *chain* or the *LLM path* for all plans at once. That is [SECURITY.md §11's mandated design](../../SECURITY.md#11--incident-response--kill-switches), ⏭ roadmap, and its cardinal rule is written to fail closed: **a tripped switch blocks the action; it must never silently degrade to unguarded execution.** Until it lands, the honest statement is: individual plans pause and park safely today; org-wide "cut this surface now" is a roadmap lever, not a shipped button.

---

### 9.3 Recovery — getting the identity back without ever holding a key

**Defends against:** the two ways a user loses access — a **lost/destroyed device** and a **forgotten password** — plus the worst case, a **compromised device** where the seed must be treated as burned. **The hard constraint:** we hold no key, so we can offer *no* server-side reset. Recovery must be honest about that or it is a false promise.

The full recovery model is [Ch5 §14 (Identity Recovery)](../bible/chapter-05-universal-identity.md) and [SECURITY.md §3.5](../../SECURITY.md#35-wipe--recovery); this section states the security-load-bearing truths and their real state.

| Scenario | Recovery path | Real state | Honesty note |
|---|---|---|---|
| **Lost / destroyed device** | Re-import the BIP-39 mnemonic on a clean device → deterministic derivation ([BIP-32/44/84, SLIP-0010](../../SECURITY.md#31-generation)) restores the identical BTC + EVM + Solana identity and funds. **No server involvement.** | ✅ shipped (import flow; conformance-tested, task #93) | The mnemonic *is* the recovery. If it is gone, so are the funds — we cannot regenerate it. |
| **Forgotten password** | Unrecoverable by design. We hold no key, so we cannot reset one. Recovery = re-import from the mnemonic and set a new password. | ✅ (stated plainly in UX) | We [never soften this into false hope](../../SECURITY.md#35-wipe--recovery). A "reset password" that worked would prove we held the key — a doctrine violation. |
| **Compromised device** | Treat the mnemonic as burned. Out-of-band: create a *new* wallet on a clean device, move funds to it. Revoke standing approvals from the exposed identity first (§5). | ✅ mechanism (new wallet + revoke); ⏭ in-app *assisted* migration | The safe action is a fresh seed, not a "clean" of the old one. Guidance is honest today; a guided in-app sweep is roadmap. |
| **Wipe** | `WalletManager.wipe` destroys the vault + keyring; a wiped device holds nothing recoverable. | ✅ shipped ([Ch6](../bible/chapter-06-wallet-core-architecture.md); hardened confirm, task #90) | Irreversible, and gated behind explicit confirmation so it is never fired by accident. |

**The single-point-of-failure we name, do not hide:** today, the mnemonic is the sole root of recovery. Lose it *and* the device, and there is no backdoor — that is the price of true self-custody, and we charge it openly rather than pretend at a safety net. The mitigations that *shrink the single-device blast radius* are exactly the ones [Ch5 §14](../bible/chapter-05-universal-identity.md) and [SECURITY.md §3.5](../../SECURITY.md#35-wipe--recovery) mark **⏭ roadmap**, and this section will not upgrade their tags:

- **Social recovery** (guardian-based reconstruction) — ⏭.
- **MPC / threshold signing** (no single device holds a full key) — ⏭.
- **Passkey-gated recovery** and **hardware-wallet co-signing** — ⏭ ([Ch5 §14](../bible/chapter-05-universal-identity.md) lists passkeys as "future-ready," hardware-wallet recovery as a target).

Each of these, when built, must obey the same wall: **keys never leave the device; only encrypted data ever syncs** ([Ch5](../bible/chapter-05-universal-identity.md)). A social-recovery or MPC scheme that shipped a key share to our server to make recovery "easier" would be redesigned, not shipped. The litmus is unchanged from Doctrine #1: if a recovery feature needs the server to know a secret, the *feature* is wrong.

**How recovery fails closed:** every path above either restores from something *only the user holds* (the mnemonic) or refuses (forgotten password). There is no path where *we* supply the missing secret — because we do not have it. The failure mode of recovery is "we cannot help you regenerate a key you lost," and we say so, rather than a silent custodial backstop that would betray the entire premise.

---

### 9.4 Incident response — because keys are on-device, the worst server day is a privacy day

**Defends against:** the organizational failure mode — a vulnerability is found, a service is popped, a dependency is poisoned — and the risk that the *response* is slow, dishonest, or hides a loss. **Asset:** user trust, which is destroyed as fast by a covered-up incident as by the incident itself.

The full program is [SECURITY.md §11](../../SECURITY.md#11--incident-response--kill-switches); the security-defining shape is:

- **The blast-radius truth, again, load-bearing.** Because [signing authority lives in exactly one place](../../SECURITY.md#23-trust-boundaries--signing-authority-lives-in-exactly-one-place) and it is the device, **the highest-severity server-side incident is a *privacy* breach, never a *fund* breach.** The IR plan is scoped to that reality — containment + disclosure of exposed *data*, not a scramble to stop fund movement the servers were never able to cause. We state this to users honestly rather than implying servers can lose their money. This is the single most important thing incident response inherits from the architecture: the catastrophic asset (asset #1, the seed) is out of the server's reach, so the server's worst day is bounded.
- **Response machinery (⏭ mandated, honestly not-yet-operational at GA scale):** a severity matrix, an on-call rotation, user-comms templates, and — the doctrine's teeth — **public post-mortems for any fund-adjacent incident.** [The doctrine forbids hiding a loss.](../../SECURITY.md#11--incident-response--kill-switches) A wallet that quietly ate a bug that touched funds and said nothing would violate Doctrine #3 (never fake) as surely as a fabricated balance.
- **Kill-switches (⏭ mandated), reiterated from §9.2 for the IR reader:** independent, fast disable of a venue / chain / LLM path / automation, each failing closed. These are the levers IR *pulls*; they are roadmap, and IR planning must not assume a lever that is not yet wired.

**How IR fails closed / stays honest:** the response posture defaults to *disclose*, and the containment posture defaults to *block the surface, do not degrade it to unguarded*. The honesty rule is structural: an incident that touched funds cannot be resolved silently, by policy.

---

### 9.5 Responsible disclosure + the mandated audit & bug bounty (⏭ — real gates, not aspirations)

**Defends against:** the vulnerability we did not find ourselves — and the failure of *not having a channel* for the researcher who did. **Asset:** every asset in the chapter, because an unreported hole in the key path or the guard is the one that drains everyone.

Two things live here, and both are honestly labelled as **binding requirements, not shipped controls.**

**Responsible disclosure ([SECURITY.md §12](../../SECURITY.md#12--responsible-disclosure)) — 🔶 today.** The channel that exists *now* is private **GitHub Security Advisories** on the repo (preferred) or email to the maintainers — never a public issue, no public disclosure until a fix ships. In scope, prioritized: anything that can (1) extract or exfiltrate a key/seed, (2) cause an unintended or unconfirmed fund movement, (3) defeat the broadcast guard, (4) bypass the AI↔deterministic boundary, (5) leak one user's data to another, or (6) forge/replay a session. **Out of scope:** the honestly-documented residual of an unlocked, malware-owned device ([§3.3](../../SECURITY.md#33-use--keys-live-for-one-operation-and-are-wiped)); testnet-only behaviour. The **⏭ gap named plainly:** a dedicated `security@` address, a published `security.txt`, and a formal safe-harbor policy are *not yet stood up* — they are mandated before public launch; until then, private advisory is the channel, and we do not pretend a bounty program exists.

**Third-party audit + bug bounty ([SECURITY.md §10](../../SECURITY.md#10--audit--bug-bounty-requirements-gate-to-real-funds)) — ⏭, and these are release *gates*.** This is the closing honesty of the whole security chapter: **the wallet has not yet been through a third-party audit, and there is no bug bounty running.** Those are mandated *before real, uncapped funds*, and stated as hard gates, not intentions:

| Requirement | Gate | State |
|---|---|---|
| External audit of **`packages/core`** (the key engine) | Before public beta | ⏭ not done |
| External audit of the **execution path + smart-account modules** | Before GA | ⏭ not done |
| **Bug bounty (Immunefi-class)** with published **safe-harbor**, crits scoped to **$250k** | At GA | ⏭ not done |
| Property / invariant tests on core crypto | Continuous | ✅ shipping ([`packages/core/test`](../../packages/core/test)) |
| Fuzz targets: intent parser, tx decoders, vault-envelope parser | Nightly | ⏭ not done |

What ships *today* is [**real testnet** and **guarded, capped mainnet ETH**](../../SECURITY.md#10--audit--bug-bounty-requirements-gate-to-real-funds) — Sepolia / devnet / BTC-testnet, plus mainnet behind the [ACK + `MAINNET_SPEND_CAP_USD = $1,000` guard](../../packages/chains/src/guard.ts), each labelled exactly as such. **Uncapped mainnet stays behind the audit and bounty gates.** Saying this out loud, on the security page, is the point: a wallet that claimed an audit it had not had would be committing the exact lie this chapter exists to forbid.

---

### 9.6 Explainable risk reports — the closing capability: a refusal is never a dead end (✅ shipped core, 🔶 surface polish)

This is where the chapter lands. Every control in §§2–8 can produce a **no** — a blocked broadcast, a required confirmation, a flagged token, a paused execution. A security engine that emits a bare red banner has done half its job and failed the product's north star: *a non-technical stranger can move real money and never be lied to.* Fail-closed is a law ([Ch3 §21](../bible/chapter-03-design-system.md) — [error design](../bible/chapter-03-design-system.md); the doctrine's *"fail closed, but never a dead end"*), and the way you honour both halves is to make every refusal **explainable**: it says, in plain language, **WHY** (the risk), **WHAT was considered** (the inputs), and **WHAT to do** (the safe next step).

**The refusal turns into understanding — three questions, always answered:**

| The user sees | The report answers | Where it comes from |
|---|---|---|
| **WHY** — "This is blocked because…" | the specific risk, in a human sentence, not an error code | Risk Engine signal `reason` strings + guard block strings |
| **WHAT was considered** — "We checked…" | the inputs that produced the verdict, so it is inspectable, not oracular | Composite `RiskReport` signals + policy violations |
| **WHAT to do** — "Your safe options are…" | the next un-blocked action (revoke, reduce amount, use testnet, cancel, re-import) | Per-verdict guidance mapped to the failure |

**This is real, and here is the code it stands on:**

- **The Risk Engine already speaks in reasons, not codes** ([`packages/risk/src/engine.ts`](../../packages/risk/src/engine.ts), ✅ tested, tasks #33–#35). Every signal it emits carries a plain-language `reason` — `"${symbol} is a known scam token."`, `"Recipient is on a sanctions list."`, `"Recipient is blacklisted (known theft/scam address)."`, `"${role} ${providerId} health ${score} is below the ${threshold} threshold."`. The `SecurityDecision` it returns is a triple — `verdict` (allow / require_confirmation / block) **plus** the full `report` of signals **plus** the `policyViolations` — which is *exactly* the WHY + WHAT-was-considered pair. The engine was built to explain, not merely to gate. (Detail per signal: §6.)
- **The broadcast guard already emits plain-language refusals** ([`packages/chains/src/guard.ts`](../../packages/chains/src/guard.ts), ✅ `guard.test.ts`). Its `GuardDecision` is `{ ok, blocked[], warnings[] }`, and the `blocked`/`warnings` entries are human sentences by design — `"unknown chain \"…\" — refusing to broadcast"`, `"recipient address failed its EIP-55 checksum — likely a typo"`, `"MAINNET broadcast on … moves REAL funds — explicit confirmation required"`, `"This is a live … transaction and cannot be undone."` The guard's *only* power is to refuse ([Ch7](../bible/chapter-07-universal-intent-engine.md), §1), and it refuses *legibly*: each block already tells the user which of the four rules ([§5 of SECURITY.md](../../SECURITY.md#5--the-guard-rules--the-deterministic-gate-between-plan-and-wire)) tripped and why. The checksum message even names the likely *cause* (a typo) and thereby the *fix* (re-check the address) — WHY and WHAT-to-do in one string.
- **The verdict is auditable** ([`packages/compliance/src/audit.ts`](../../packages/compliance/src/audit.ts), ✅ tested). Every risky decision — risk verdict, policy denial, guard block, auto-execution — is recorded with its inputs and reason (Doctrine #5), so the explanation shown to the user is the *same* explanation written to the log. The report is not marketing narration bolted on after the fact; it is the decision's own recorded rationale, surfaced. (The stronger *tamper-evident* hash-chain guarantee is [honestly bounded](../../SECURITY.md#9--audit-trail--tamper-evident-by-construction): the default hash is unkeyed and adequate for tests; production keyed-HMAC + WORM anchoring is ⏭.)

**The pattern, stated as a rule the whole chapter obeys:** *no verdict without a reason, no block without a next step.* A guard or engine may only refuse — but it may never refuse *silently* or *opaquely*. Benchmark: this is the same instinct behind Rabby's and Blowfish's pre-sign explanations and the "what will this transaction do" simulations users have learned to trust ([§2](02-transaction-simulation.md), [§3](03-contract-scam-phishing.md)) — except we hold ourselves to it at *every* refusal surface, and we hold ourselves to naming the *fix*, not just the fear.

**Real state, scrupulously:**

- ✅ **The engines produce reason-carrying, inspectable verdicts** — Risk Engine `reason` strings + `SecurityDecision` triple; guard `blocked`/`warnings` sentences; audited rationale. This is the substrate of every explainable report and it is shipped and tested.
- 🔶 **The consistent, designed *presentation* of those reasons** — a unified "why blocked → what to do" report component across every refusal surface (chat, confirm sheet, execution park, approvals) — is partially realized: the confirm/preview flow ([tasks #71, #95](../../SECURITY.md)) surfaces guard blocks and simulation results honestly today; a single, WCAG-AA, plain-language *report card* wrapping every verdict with its safe next-step is the design target, not uniformly shipped on every surface yet. Named as a gap, not painted as done.
- ⏭ **The richer explanations that depend on roadmap engines** — plain-language write-ups of a deep contract-analysis finding (§3 roadmap), a wallet-reputation score (§4 roadmap), or a behavioral-anomaly signal (§7 roadmap) — arrive when those engines arrive. The *report framework* can explain them; the *content* is only as real as the engine behind it. We do not render an explanation for an analysis we did not run.

**How the explainable report fails closed:** if the system cannot produce a *reason*, it does not fabricate a reassuring one — it defaults to the refusal with the most honest available message ("this could not be positively verified"), because a confident-but-empty explanation would itself be a fake control. The report degrades toward *more* caution and *more* honesty, never toward a soothing green that isn't earned. A dead-end refusal and a fabricated explanation are the two failures this capability exists to prevent, and it fails toward *"blocked, and here is the little we can honestly say"* rather than either.

---

### 9.7 The section's contract — what the Principal Security Engineer signs

Pulling the four capabilities together, tagged, no overclaim:

| Capability | Real state | The honest one-line truth |
|---|---|---|
| In-flight execution halt / park / explain | ✅ ([Ch8 §20](../bible/chapter-08-universal-execution-engine.md), [`packages/execution`](../../packages/execution)) | A failing leg stops the sequence and parks a known, explained state — never barrels ahead. |
| Cross-surface kill-switch (venue/chain/LLM/automation) | ⏭ ([SECURITY.md §11](../../SECURITY.md#11--incident-response--kill-switches)) | Org-wide "cut this surface now" is mandated and fails-closed *by design* — not yet a shipped button. |
| Lock + revoke + move-to-fresh-seed | ✅ lock/revoke; ⏭ assisted migration | The non-custodial analogue of "freeze": local safeguards + honest guidance, never server seizure. |
| Recovery (mnemonic re-import) | ✅ ([Ch5 §14](../bible/chapter-05-universal-identity.md)) | The seed is the recovery; lose it and the device and there is no backdoor — stated plainly. |
| Social / MPC / passkey / hardware recovery | ⏭ ([Ch5 §14](../bible/chapter-05-universal-identity.md)) | Shrinks single-device blast radius; roadmap, and must keep keys on-device when it lands. |
| Incident response + public post-mortems | ⏭ mandated ([SECURITY.md §11](../../SECURITY.md#11--incident-response--kill-switches)) | Worst server day is a *privacy* day; a fund-adjacent loss cannot be hidden, by policy. |
| Responsible disclosure channel | 🔶 (advisory today; `security@`/safe-harbor ⏭) | A private channel exists now; the formal program is mandated pre-launch and labelled not-yet-done. |
| Third-party audit + bug bounty | ⏭ ([SECURITY.md §10](../../SECURITY.md#10--audit--bug-bounty-requirements-gate-to-real-funds)) | **Not done.** Hard gates before uncapped real funds; capped mainnet + testnet only until then. |
| Explainable risk reports (engines) | ✅ ([`risk/engine.ts`](../../packages/risk/src/engine.ts), [`guard.ts`](../../packages/chains/src/guard.ts)) | Every verdict already carries WHY + what-was-considered + what-to-do; refusal → understanding. |
| Explainable reports (unified presentation) | 🔶 | Reason-carrying verdicts are shipped; a single AA report-card on *every* surface is the design target. |

The last word of Chapter 10 is the same as its first: **security here is a product capability, and a product capability you claim but do not run is a lie.** This section describes the moment things go wrong — and in that moment the temptation to promise a "freeze" we cannot deliver, an "audit" we have not had, a "recovery" that quietly needs a server, is at its peak. We refuse each one, out loud, on the page. What we *do* run — the execution halt that fails closed, the mnemonic recovery that needs no server, the disclosure channel that exists today, and above all the explainable verdict that turns every refusal into a reason and a safe next step — is real, cited, and tested. What we do not yet run is tagged ⏭, with its landing gate named.

The Principal Security Engineer signs only what is true, and holds a **veto** ([CLAUDE.md §2](../../CLAUDE.md), [SECURITY.md §13](../../SECURITY.md#13--the-security-review-gate-what-triggers-the-veto)) over any change that would blur a `⏭` into a `✅`, let a refusal go silent, or let a server learn a secret it must never hold. That veto is not bureaucracy. It is the mechanism by which this chapter's central promise — *never be lied to* — is enforced against the one party most able to break it: us.


---

## Where this sits

This is the reference behind [Chapter 10 — the Security & Trust Engine charter](../bible/chapter-10-security-trust-engine.md),
and the material Volume VII (the Security Bible) is built from. The shipped controls — the risk engine +
policy gate, the pure broadcast guard (EIP-55 + fail-closed + mainnet ack + spend cap), pre-sign simulation,
the allowance-revoke tool, session security + JWT revocation, and the device trust model — are real today;
deep contract analysis, a live scam/phishing database, wallet-reputation scoring, behavioral-anomaly AI, an
emergency freeze feature, hardware wallets, and the mandated third-party audit + bug bounty are honestly
tagged partial/roadmap. **This Bible never claims a control it does not run — the Principal Security Engineer
signs only what is true, and holds a veto.**
