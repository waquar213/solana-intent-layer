# TESTING.md — The Testing Constitution of Intent Wallet V3

> **This document is binding.** It is the canonical, authoritative testing standard for the repo — the
> constitution section that [`CLAUDE.md`](CLAUDE.md) routes to for "any code at all." The deep field
> manuals it sits above are [`docs/handbook/04-quality.md`](docs/handbook/04-quality.md) (coverage tiers,
> Definition of Done, security gates) and [`docs/handbook/03-environments-cicd.md`](docs/handbook/03-environments-cicd.md)
> (the pipeline). Where this file and the code disagree, one of them is a defect — reconcile it on purpose,
> never let it drift.
>
> **Read this before you** write a test, open a PR, wire a CI gate, change a pure core, touch a guard, an
> auth path, or a signing/broadcast path — or before you type the word **"done."** A green type-check is
> not a passed test, and a passed test is not a verified feature.

**The one-line promise this protects:** a non-technical stranger can move real money by typing one sentence
— and *never be lied to, never lose funds.* Every test below exists to make that true **and provable**.

**The test we hold ourselves to (verbatim from the Doctrine):** *can a non-technical stranger move real
money across chains by typing a sentence — and never be lied to, never lose a cent?* A suite that cannot
answer that with evidence has not been run.

---

## 0 · Status legend — this document never fakes a gate

Per Doctrine law #3 (*never fake data*), a testing document that claims a gate it does not run is itself a
lie. Every gate and standard below is tagged with its **real** state. When you promote a gate from mandate
to enforcement, promote its tag in the same PR.

| Tag | Meaning |
|---|---|
| ✅ **Enforced** | Runs in CI or is wired in the repo **today**; a violation fails the build. Cite the file. |
| 🔶 **Partial** | Real, but only for some packages / one surface / one env. The gaps are named explicitly. |
| ⏭ **Mandated (roadmap)** | A **binding** standard with a landing phase — not a claim that it runs yet. |

A `⏭` gate is still law: you may not ship the feature it gates until it lands, and you may not describe it
as "passing." It is a promise, honestly labelled as not-yet-kept — never dressed up as done.

---

## 1 · The testing doctrine (the laws no test may break)

These are the testing-load-bearing subset of the [Doctrine](CLAUDE.md#3--the-doctrine--laws-no-change-may-break).
A test suite that violates one is **wrong even when green**.

1. **The gate is the product.** "AI proposes, deterministic code verifies, the device signature disposes."
   The verifier — every pure guard between a plan and a wire — is the single most tested code in the
   platform. A guard is only trustworthy in proportion to how hard we tried to make it wrongly say *yes*.
   Guards can only **refuse**; tests prove they refuse everything they cannot positively verify.
2. **Determinism is testable; test it.** Pure cores are pure: same input → same output, no clock, no RNG,
   no network, no `process.env`. That is not a code comment — it is an assertion (§4, §7). Non-determinism
   in a core is a bug the suite must catch, not tolerate.
3. **Money is `bigint`; assert it.** No test may launder a `number` through a money path. Amounts are
   integer base units end-to-end; tests use `bigint` literals (`5n * 10n ** 18n`) and assert exact
   equality, never `toBeCloseTo` (§4).
4. **Fail closed, and prove the close.** For every "happy path" test there is at least one test that feeds
   the malformed / adversarial / unpriced / unknown input and asserts the system **blocked** with the
   right error `code`. Untested error paths are untested product.
5. **Never fake the pass.** No test asserts a network-fail is `$0`, no test stubs a signature it should
   compute, no gate is reported "green" from a warning-only step. A skipped test is stated, with output.
6. **Verify before you claim (§10).** "Done" is a claim about reality, earned by driving the actual thing
   — not by a type-check, not by a mock that always returns success.

---

## 2 · The pyramid — the shape of the suite

We run a classic pyramid, weighted hard toward the bottom because that is where correctness of money
lives. **Reality today:** 108 test files across 27 workspace packages + `services/api`, all Vitest.

```
                 ▲  Manual UI verification — drive the real flow, light+dark, a11y, screenshot (§8)
                /E2E\   few, high-value: the production-wired request path end-to-end (services/api/test/e2e) (§6)
             /Integration\  Fastify inject() + pg-mem + ioredis-mock + SDK wire contract; per-endpoint authz/IDOR (§6)
          /  Property / KAT  \  fast-check invariants + official known-answer vectors on the crypto cores (§4, §5)
       /        Unit — pure cores exhausted, every error path, every branch          \  (§4)
```

| Layer | What it proves | Where it lives | Tooling |
|---|---|---|---|
| **Unit** | Pure functions & state machines: every branch, every error `code`, every boundary. | `packages/*/test/*.test.ts` | Vitest |
| **Property** | Invariants over *generated* inputs — roundtrips, cross-impl agreement, no-crash on garbage. | `packages/core/test/*` (today) | Vitest + `fast-check` |
| **Known-answer (KAT)** | Byte-exact conformance to a published standard. | `packages/core`, `packages/chains` | Vitest + official vectors |
| **Integration** | The real HTTP pipeline: hooks, auth, error handler, per-user runtime, stores, SDK contract. | `services/api/test/*` | Vitest + `inject()` + `pg-mem` + `ioredis-mock` |
| **E2E (wired)** | The seams that only run deployed, exercised *together*, hermetically. | `services/api/test/e2e.test.ts` | as above |
| **UI verification** | The human truth: a first-time user can complete the flow, in both themes, reachable and legible. | manual, per §8 | in-app preview + screenshot |

**Why so bottom-heavy.** The best wallet teams (Phantom, Rabby) live or die on the correctness of key
derivation, transaction encoding, and the simulate/deny gate — none of which need a browser to test
exhaustively, and all of which are catastrophic to get wrong. We put the overwhelming majority of assertions
where a bug spends someone's money: the pure cores. The top of the pyramid stays deliberately thin and
high-signal, the way Stripe treats contract tests and Linear/Vercel treat fast hermetic CI.

---

## 3 · Tooling, layout & how to run

| Concern | Standard |
|---|---|
| **Runner** | **Vitest `^3`**, invoked as `vitest run` (no watch in CI). One `test` script per package. ✅ |
| **Property testing** | **`fast-check ^3`** for invariants and cross-implementation checks. ✅ (`packages/core` today; extend to any pure core with a checkable invariant.) |
| **Coverage** | **`@vitest/coverage-v8`**, `provider: 'v8'`, `include: ['src/**']`. Thresholds enforced per-package as each reaches its tier (§9). 🔶 (`core` wired at 90%.) |
| **Integration infra** | **`pg-mem`** (in-memory Postgres) and **`ioredis-mock`** (in-memory Redis) — hermetic, no containers, no sockets. ✅ |
| **Layout** | Tests live in `<package>/test/*.test.ts`, a sibling of `src/`. One file per unit under test; the filename names the unit (`vault.test.ts`, `guard.test.ts`). ✅ |
| **Resolution** | Package `vitest.config.ts` aliases workspace deps to their **source** (`../../packages/<x>/src/index.ts`) so tests run with **no prior build**. ✅ |
| **Imports** | Tests import from the package's `src` via `.js` specifiers (NodeNext), exactly as production does. |

**Running the suite:**

```bash
pnpm -r test                              # every package + service (what CI runs)
pnpm --filter @intent-wallet/core test    # one package
pnpm --filter @intent-wallet/core test:coverage   # coverage (where wired)
pnpm -r typecheck                         # strict tsc, no emit — a separate gate, not a substitute for tests
```

**A package's baseline `vitest.config.ts`** (aliasing its one workspace dep to source):

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
const pkg = (rel: string) => fileURLToPath(new URL(`../../packages/${rel}/src/index.ts`, import.meta.url));
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], coverage: { provider: 'v8', include: ['src/**'] } },
  resolve: { alias: { '@intent-wallet/risk': pkg('risk') } },
});
```

**Test file header rule.** A non-trivial test file opens with a short doc comment stating *what invariant it
defends and why* — not narration of the code. The crypto and guard suites do this (see `core/test/slip10.test.ts`,
`intents/test/golden.test.ts`); match it. The header is the first thing a reviewer reads to know what breaks
if the file goes red.

---

## 4 · Pure-core exhaustion + adversarial inputs

Pure cores (`core`, `intents`, `risk`, `policy`, `router`, `portfolio`, `execution`, `capabilities`, …) are
deterministic, side-effect-free, and **exhaustively** tested. "Exhaustively" is specific:

- **Every branch and every error `code`.** Each `throw` path has a test that triggers it and asserts the
  code, not just that it threw. Pattern used repo-wide:
  ```ts
  expect(() => openVault(envelope, 'wrong')).toThrowError(
    expect.objectContaining({ code: 'VAULT_DECRYPT_FAILED' }),
  );
  ```
- **Every boundary.** Empty, zero, max, off-by-one, wrong-length, wrong-encoding. The vault suite rejects
  empty secrets *and* empty passwords *and* out-of-bounds/ non-power-of-two scrypt params — each its own
  assertion (`core/test/vault.test.ts`).
- **Adversarial / hostile inputs are first-class, not an afterthought.** A core that parses untrusted bytes
  or untrusted text (mnemonics, addresses, PSBTs, envelopes, NL utterances) has tests that feed it garbage
  and malformed structure and assert a clean typed refusal — never a crash, never a silent wrong answer.
  Fuzz of the intent parser, tx decoders, and vault-envelope parser is a **⏭ nightly** target
  ([handbook 04 §3](docs/handbook/04-quality.md)); the deterministic parser already ships an in-repo
  adversarial corpus (§7).

### 4.1 Property-based testing (`fast-check`) ✅ in `core`

Where a function has an *invariant* — a property that must hold for all inputs — assert the property over
generated inputs, don't cherry-pick examples. Real patterns in the repo:

- **Roundtrip:** `open(seal(x, pw), pw) === x` for arbitrary secrets/passwords.
- **Cross-implementation agreement:** our derivation/encoding must match an *independent* library on
  arbitrary keys — SLIP-0010 vs `ed25519-hd-key`, P2WPKH vs `@scure/btc-signer`, EVM signing vs `viem`.
  Agreement with a second implementation is far stronger evidence than agreement with ourselves.
- **No-crash / structural invariants:** malformed generated input never throws an *untyped* error and never
  produces a fund-moving result.

```ts
fc.assert(
  fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (candidate) => {
    fc.pre(secp256k1.utils.isValidPrivateKey(candidate));
    const pub = secp256k1.getPublicKey(candidate, true);
    expect(btcP2wpkhAddress(pub)).toBe(btcSigner.p2wpkh(pub).address); // independent impl
  }),
  { numRuns: 50 },
);
```

`numRuns` is tuned per cost (15–50 in `core`); keep property tests deterministic (fast-check seeds are
reproducible) so a failure is a **repro**, not a flake.

### 4.2 Determinism is an assertion, not a hope

A core that claims determinism must prove it. Two enforced techniques, both in `packages/policy`:

- **Stability:** run the same input N times; assert a single stable output/decision hash.
  ```ts
  const hashes = new Set<string>();
  for (let i = 0; i < 50; i++) hashes.add((await engine.evaluate(req)).policy.decisionHash);
  expect(hashes.size).toBe(1);
  ```
- **Clock/RNG/IO independence at the source level** — a test that *greps the module source* and fails if a
  banned primitive appears in an evaluator:
  ```ts
  const banned = /Date\.now|Math\.random|from ['"]node:crypto|fetch\(|process\.env/;
  for (const mod of ['conditions.ts', 'rules.ts', 'decision.ts', 'presets.ts'])
    expect(readSource(mod)).not.toMatch(banned);
  ```
  This makes "no clock in the core" a build failure, not a code-review hope.

### 4.3 Money is `bigint`

Amounts are integer base units. Tests assert **exact** equality on `bigint`. `toBeCloseTo` on a money value
is a review-reject. A **float-in-money grep** (numeric `number` in a money path outside the display edge) is
a **⏭ mandated** PR gate ([handbook 04 §3](docs/handbook/04-quality.md)); until it is a CI job, it is a
manual review checklist item, not a passing gate.

---

## 5 · Known-answer conformance vectors

Where a public standard exists, we do not trust our own math — we reproduce the **official test vectors
byte-for-byte**, and additionally cross-check against an independent implementation. This is table stakes
for a multi-chain wallet: a one-bit error in derivation or encoding sends funds to a stranger.

| Standard | What it fixes | Vector source | Test |
|---|---|---|---|
| **BIP-39** | mnemonic → seed | Trezor `vectors.json` (all-zero entropy, passphrase `TREZOR`) | `core/test/mnemonic.test.ts` ✅ |
| **SLIP-0010 (ed25519)** | Solana HD derivation | official SLIP-0010 vectors + `ed25519-hd-key` cross-check | `core/test/slip10.test.ts` ✅ |
| **BIP-32 / BIP-44** | secp256k1 HD tree, EVM path | derivation cross-checked to `viem` / `@scure/bip32` | `core/test/evm*.test.ts` ✅ |
| **EIP-55** | address checksum | every official EIP-55 example address | `core/test/evm.test.ts` ✅ |
| **BIP-84 (P2WPKH)** | native SegWit `bc1…`/`tb1…` | `@scure/btc-signer` cross-check on arbitrary keys | `core/test/bitcoin.test.ts` ✅ |

Rules for conformance tests:

- **Paste the vector, cite the URL.** The expected value is a literal in the test with a source comment.
  A computed "expected" is not a known answer.
- **Cover both mainnet and testnet encodings** where the prefix differs (`bc1q…` vs `tb1q…`).
- **A new chain or a new signing scheme does not merge without its KAT layer.** This was an explicit exit
  criterion ("BIP-32/44/84 + SLIP-0010 known-answer conformance tests") and remains one for every future
  curve/derivation we add.

---

## 6 · Integration over the REAL request path

Integration tests exercise the **actual production pipeline**, not a hand-rolled harness. For the API that
means Fastify's `inject()` — the real router, real `onRequest`/`preHandler` hooks, real error handler, real
serializers — with **no socket bound**, so tests are fast and hermetic.

- **Real infra, in memory.** Postgres is `pg-mem`; Redis is `ioredis-mock`. The same `PostgresPlanStore`,
  `RedisNonceStore`, and `RedisSessionRevoker` classes run in tests as in production — we substitute the
  driver, never the logic. No test spins a container or reaches the internet.
- **The auth path is real.** `services/api/test/auth.test.ts` and `e2e.test.ts` build a real SIWE message,
  `personal_sign` it with an `HDKeyring` from the canonical `abandon…about` mnemonic, and prove the guarded
  route is genuinely gated (recover → nonce → JWT → protected call), not a reject-all stub.
- **Per-user isolation is a test, not a claim.** The e2e proves a runtime resolved from the SIWE subject
  sees *that* user's holdings and no one else's — the wallet-level equivalent of an **IDOR** test. Every
  authenticated endpoint owes an authz/ownership test ([handbook 04 §1](docs/handbook/04-quality.md),
  Standard tier: "contract tests on every endpoint incl. authz/IDOR").
- **The SDK wire contract is exercised end-to-end.** The e2e drives the API through the real
  `@intent-wallet/sdk` client over a `TransportFetch` seam, so a breaking wire change fails a test, not a
  user. (The handbook's north star — API generated from schemas, examples compiled in CI — is the
  **⏭ mandated** endpoint of this; today the contract is pinned by the e2e + typed client.)
- **Edge hardening has its own suite.** `hardening.test.ts` proves helmet headers (`nosniff`, frameguard),
  the CORS allowlist (reflect an allowed origin, refuse an unlisted one), and the global rate limit —
  wrappers that sit before every route.

**What integration does *not* do:** touch a real chain RPC or a real LLM. Those live behind seams that are
faked deterministically in test and driven for real only in manual verification (§8) and in the live
testnet paths the apps exercise. A test that depends on the internet is a flake generator; we don't ship one.

---

## 7 · Security & guard tests (fail-closed)

The guard between a plan and a broadcast is the constitution's hard line — see
[`SECURITY.md §5`](SECURITY.md). It is a **pure function that can only refuse**, and it is tested as an
adversary would attack it: by trying to make it wrongly permit a fund move.

- **The REFUSE-only gate, exhaustively.** `chains/test/guard.test.ts` proves the three defenses of
  `guardBroadcast`: EIP-55 recipient validation (accepts checksummed / all-one-case; **rejects a
  single flipped-case typo**, too-short, too-long, non-address), the mainnet-acknowledgment gate, and the
  mainnet spend cap. The malformed-recipient case asserts `ok: false` with the block reason — a guard that
  can't explain its refusal is not done.
- **Injection red-team on the AI boundary.** `intents/test/golden.test.ts` is a ≥200-utterance corpus that
  is simultaneously a regression net, living documentation of the deterministic parser's real coverage
  boundary, and an **injection red-team**: adversarial / prompt-injection inputs must **never** resolve to a
  fund-moving intent (`transfer/swap/buy/stake/rebalance/recurring/emergency_exit`). They must `defer`,
  `clarify`, or stay read-only. This encodes Doctrine law #2 as an executable test: the LLM has no signing
  authority, and no string can grant it one.
- **Determinism of the policy verdict** (§4.2) is a security property: a non-deterministic gate is an
  exploitable gate.
- **Secret hygiene is enforced, not trusted.** `gitleaks` runs on every PR ✅. Before any `--no-verify`
  commit, a manual **leak-scan** (grep for known secret prefixes → must be 0) is required by
  [`CLAUDE.md`](CLAUDE.md). Semgrep (SAST) and `osv-scanner` (deps) are **⏭ mandated**
  ([handbook 04 §3](docs/handbook/04-quality.md)) — not yet CI jobs, so not claimed as passing.
- **Never-log-a-secret** is a testable invariant for any code near key material: assert the log sink never
  received the seed/private key. Key material lives only in `packages/core`/`apps/*`; a test that imports
  key types outside that boundary is itself the failure.

**Security-owner review.** Changes to `core` / `execution` / `risk` / auth require CODEOWNERS approval
(2 approvals) on top of green tests ([handbook 04 §3](docs/handbook/04-quality.md)). Tests are necessary,
not sufficient, for the money-path.

---

## 8 · Verifying the UI — drive it, don't describe it

**There is no web unit-test runner today.** `apps/web` ships a `typecheck` script and no `test` script —
by design. React logic that deserves exhaustive testing belongs in a pure package and is tested there; the
UI's job is verified the only way a UI can be honestly verified: **by driving the real thing.** UI-tier
coverage (≥70% logic + a11y snapshot at largest Dynamic Type) is a **⏭ mandated** bar
([handbook 04 §1](docs/handbook/04-quality.md)); manual verification is the standing gate until it lands.

**The verification ritual (required after any UI change — [CLAUDE.md](CLAUDE.md)):**

1. **Drive the flow as a first-time user.** Run the app with the in-app preview tools (never Bash for dev
   servers). Complete the actual task — create a wallet, parse an intent, confirm, authorize, execute —
   don't assert a component renders in isolation.
2. **Both themes.** Exercise light **and** dark. Contrast, elevation, and state colors must hold in both.
3. **The five states, every screen.** Empty · loading · **error** · partial · populated must each render —
   and be *honest*. A network failure is **not `$0`**; a partial read is labelled partial; testnet is
   labelled testnet; a dust balance is a dust pill, not a rounded zero. This honesty is itself the thing
   under test (it is the subject of multiple shipped fixes — Home/Portfolio four-state honesty).
4. **Accessibility.** Keyboard-reachable, focus-visible, AA contrast, correct roles/labels, a single
   loading announcement (no double-speak to a screen reader), reduced-motion respected.
5. **Prove it with a screenshot / recording.** A claim of a visual change is not accepted without a
   **light + dark screenshot** of the driven state. "It should look right" is not verification; the image
   is the evidence.

Benchmark: this is the Apple/Linear bar — the feature is not the diff, it's the experience a real person has
when they use it, in the state they're actually in.

---

## 9 · Coverage tiers & the CI gate policy

### 9.1 Coverage is tiered by blast radius, not one blanket number

([handbook 04 §1](docs/handbook/04-quality.md) — canonical.)

| Tier | Packages | Line/branch floor | Extra requirement |
|---|---|---|---|
| **Critical** | `core`, `execution`, `risk`, auth | **≥ 90%** | official/known vectors **+** property tests; every error path tested |
| **High** | `chains`, `intents`, `portfolio`, adapters, `events` | **≥ 85%** | integration tests against forks/mocks |
| **Standard** | `services/*`, `config`, `observability` | **≥ 80%** | contract test on every endpoint (incl. authz/IDOR) |
| **UI** | `ui`, `apps/*` | **≥ 70%** logic; **100% of the 5 states** rendered | a11y snapshot at largest Dynamic Type |

Coverage is a **floor, not a goal.** 100% coverage of trivial code proves nothing; we require coverage of
**behavior and failure modes**. Enforcement is wired per-package as it reaches its tier: `core` enforces a
**90%** statements/branches/functions/lines threshold in its `vitest.config.ts` today ✅; the remaining
packages collect coverage but do not yet fail on a threshold 🔶. Adding a package's threshold is part of
bringing it to tier — not a separate favor.

### 9.2 What CI runs today (the honest gate list)

The pipeline is [`.github/workflows/ci.yml`](.github/workflows/ci.yml). It claims only gates it runs.

| CI step | Command | State |
|---|---|---|
| Conventional Commits | `scripts/validate-commit-msg.mjs` | ✅ hard |
| Format check | `prettier --check` | 🔶 **warning-only** (`\|\| echo`) — not yet a hard gate |
| Typecheck (strict) | `pnpm -r typecheck` | ✅ hard |
| Full topological build | `pnpm -r build` | ✅ hard — catches `.d.ts`/emit drift a typecheck misses |
| Unit & property tests | `pnpm -r test` | ✅ hard |
| Secret scan | `gitleaks-action` | ✅ hard |

**Mandated but not yet CI jobs (⏭, [handbook 04 §3](docs/handbook/04-quality.md)):** coverage-threshold
enforcement beyond `core`, Semgrep (SAST), `osv-scanner` (deps), dependency review, the float-in-money grep,
nightly fuzz, and the performance-budget load tests. They are binding standards; they are **not** reported
as passing until they run. Do not write "CI enforces X" for an X that is not in the table above.

### 9.3 Local gates

- **pre-commit hook** (`.githooks/pre-commit`): `pnpm -r typecheck` + `pnpm lint`. Fast; full tests run in
  CI. On a low-memory machine the hook can OOM — the sanctioned fallback is `npx tsc --noEmit` per app, a
  leak-scan (grep known secret prefixes → 0), then `git commit --no-verify` ([CLAUDE.md](CLAUDE.md)).
- **commit-msg hook**: Conventional Commits, same validator as CI.

---

## 10 · "Verify before you claim done" — the unbreakable rule

> **"Done" is a claim about reality.** It is earned by driving the actual thing, not by a green type-check.
> If tests fail, say so — with output. If you skipped a step, say which. ([CLAUDE.md](CLAUDE.md).)

A change is **done** only when ([handbook 04 §6](docs/handbook/04-quality.md), Definition of Done):

- [ ] Code **and tests** meeting the package's tier bar are **green in CI** — you ran them, you saw them pass.
- [ ] `typecheck` / `lint` / secret-scan pass.
- [ ] The **error paths** are tested, not just the happy path.
- [ ] A money/guard/signing change added or extended a **fail-closed** test that tries to break it.
- [ ] A standards-touching change (new chain, new curve, new encoding) added its **KAT** layer.
- [ ] A UI change was **driven** in the real app, in **light + dark**, with a11y checked, and a
      **screenshot** attached (§8).
- [ ] Docs updated in the same PR (package README / ADR / this file if the standard changed).
- [ ] Incomplete user-visible work is behind a **flag**.

"It works on my machine" is not done. **"The gate proves it" is done.** If you cannot show the evidence, the
honest report is *"implemented, not yet verified"* — which is a legitimate state to be in, and a lie to call
"done."

---

## 11 · Anti-patterns (a test that looks green and proves nothing)

Opinionated, and enforced in review:

- **Asserting the mock.** A test whose only assertion is that a stub you wrote returned what you told it to.
  Test *your* logic against a *real* substitute (`pg-mem`, `ioredis-mock`, an independent crypto impl).
- **Happy-path-only.** No error-code assertion, no boundary, no adversarial input. See §4.
- **`toBeCloseTo` on money.** Any float tolerance in a value path is a defect (§4.3). Exact `bigint` or it
  didn't happen.
- **Snapshot-as-a-test.** A giant serialized snapshot nobody reads, that gets `--update`d on every failure,
  asserts nothing about behavior. Assert the specific fact you care about.
- **Network / clock / RNG in a "unit" test.** Sources flakes and hides non-determinism. Cores must be pure
  (§4.2); the internet is banned below §8.
- **Testing that a component *renders*** in isolation as a proxy for "the feature works." Drive the flow (§8).
- **A gate reported green from a warning-only step.** Prettier is `warning-only` today; do not describe it as
  a passing gate (§9.2).
- **`it.skip` without a stated reason** and a linked follow-up. A silent skip is a hidden red.

---

## 12 · Authoring a test — the checklist

1. **Name it after the unit** (`vault.test.ts`) and put it in `<package>/test/`.
2. **Open with a header comment**: the invariant it defends and why (one paragraph).
3. **Cover, in order:** the happy path → every boundary → **every error `code`** → the adversarial input.
4. **Reach for a property test** when an invariant holds for all inputs (roundtrip, cross-impl agreement,
   no-crash). Cross-check crypto against an **independent** library.
5. **Paste the official vector** (with its URL) when a standard exists — never compute the expected value.
6. **For a guard/money change:** add the test that tries to make it wrongly say *yes*, and assert it refuses
   with the right reason.
7. **For an endpoint:** drive it through `inject()` with real hooks and a real (in-memory) store; add the
   **authz/ownership** case.
8. **For UI:** there is no unit runner — drive it (§8) and attach the light+dark screenshot.
9. **Run it** (`pnpm --filter <pkg> test`), watch it pass, and — for a bug fix — confirm it **fails before
   the fix** (a test that can't fail proves nothing).

---

## 13 · References

- [`CLAUDE.md`](CLAUDE.md) — the constitution: the Doctrine, "verify before you claim," the root Engineering Bible index.
- [`SECURITY.md`](SECURITY.md) — the guard rules (§5), key lifecycle, and the Security Review veto that gates money-path tests.
- [`docs/handbook/04-quality.md`](docs/handbook/04-quality.md) — coverage tiers, performance budgets, security gates, and the Definition of Done (canonical).
- [`docs/handbook/03-environments-cicd.md`](docs/handbook/03-environments-cicd.md) — the CI/CD pipeline and environments.
- [`docs/handbook/01-standards.md`](docs/handbook/01-standards.md) — commits, branching, PR review.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — the gates that run **today** (§9.2).
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) · [`UX_GUIDELINES.md`](UX_GUIDELINES.md) — the five states, a11y, and reduced-motion bar that UI verification (§8) checks against.
- Exemplar suites to copy: `packages/core/test/slip10.test.ts` (KAT + property), `packages/core/test/vault.test.ts` (adversarial crypto), `packages/policy/test/determinism.test.ts` (determinism), `packages/chains/test/guard.test.ts` (fail-closed gate), `packages/intents/test/golden.test.ts` (injection red-team), `services/api/test/e2e.test.ts` (wired request path).
