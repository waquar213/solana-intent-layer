# SECURITY.md — The Security Constitution of Intent Wallet V3

> **This document has veto authority.** It is the canonical, binding security standard for the repo. The
> Principal Security Engineer holds a **hard veto** over any change touching keys, funds, or user data
> ([CLAUDE.md §2](CLAUDE.md)); only the CEO overrules, and only in writing (an ADR). Where this file and
> code disagree, one of them is a defect — reconcile it on purpose, never drift.
>
> **Read this before you** touch a key, a signature, a broadcast, an auth path, a secret, an LLM prompt,
> or anything that spends money — and pull in the Principal Security Engineer. The deep references it routes
> to are [`docs/architecture/06-security.md`](docs/architecture/06-security.md) (platform threat model) and
> [`docs/security/wallet-core-threat-model.md`](docs/security/wallet-core-threat-model.md) (device engine).
> This is the constitution; those are the field manuals.

**The one-line promise this protects:** a non-technical stranger can move real money by typing one
sentence — and *never be lied to, never lose funds.* Every rule below exists to make the second half true.

---

## 0 · Status legend — this document never fakes a control

Per Doctrine law #3 (*never fake data*), a security document that claims a control it does not run is
itself a lie. Every control below is tagged with its **real** state. When you ship a control, promote its
tag in the same PR.

| Tag | Meaning |
|---|---|
| ✅ **Shipped** | Implemented **and tested** in the repo today; cite the file. |
| 🔶 **Partial** | Implemented for one surface / one env; gaps named explicitly. |
| ⏭ **Mandated (roadmap)** | A **binding requirement** with a landing phase; not a claim that it runs yet. |

A `⏭` control is still law: you may not ship the feature it gates until it lands. It is a promise, honestly
labelled as not-yet-kept — never dressed up as done.

---

## 1 · The security doctrine (the laws no change may break)

These are the security-load-bearing subset of the [Doctrine](CLAUDE.md#3--the-doctrine--laws-no-change-may-break).
A change that violates one is **wrong even if it works**, and is reverted.

1. **Non-custodial, absolutely.** Keys/seed are generated and used **on-device**, encrypted at rest, and
   **never** leave the device or touch a server. If a feature needs the server to know a secret, the
   feature is redesigned — not the doctrine.
2. **AI proposes, deterministic code verifies, the device signature disposes.** The AI has **no signing
   authority**. A pure, exhaustively-tested gate between plan and wire can only **refuse**. The user's
   on-device signature is the sole disposer of funds.
3. **Fail closed.** Anything a guard cannot *positively* verify — unknown chain, malformed address,
   unpriced asset, unparseable intent — is **blocked**, never waved through. Irreversible actions require
   explicit, informed confirmation.
4. **Never fake data / never fake safety.** Network-fail ≠ `$0`; testnet is labelled testnet; a claimed
   control must actually run. Nothing is shown as "confirmed / safe" that isn't.
5. **Everything auditable.** Every risky decision (risk verdict, policy denial, guard block,
   auto-execution) is logged with its inputs and reason. Security is *demonstrated*, not asserted.

---

## 2 · Threat model

The full STRIDE × trust-boundary matrices live in the deep docs; this section is the constitution-level
summary that every contributor must hold in their head.

### 2.1 Assets, ranked by blast radius

| Rank | Asset | Compromise means | Where it lives |
|---|---|---|---|
| 1 | **Seed / mnemonic & derived private keys** | **Total, irreversible fund loss** | Device only — `packages/core`, in the encrypted vault at rest, in RAM only while unlocked |
| 2 | **The signing decision** (what the user approves) | Funds sent somewhere unintended | The device confirm sheet — *the* trust boundary |
| 3 | **Session credentials** (SIWE JWT, refresh) | Impersonation, read of one user's watch-list/portfolio | Client storage + server verify path |
| 4 | **User privacy data** (addresses, balances, history, intents) | Deanonymization, targeting | Backend datastores |
| 5 | **Platform integrity** (routing config, token registry, LLM templates) | Systemic mis-routing, injection at scale | Admin plane |

Note the asymmetry: **only asset #1 is catastrophic and it never leaves the device.** Everything a server
holds is a privacy or availability concern — never, by construction, a path to fund loss.

### 2.2 Adversaries we design against

- **Remote network attacker / MITM** — sees traffic, tries to tamper in flight.
- **Malicious dApp / counterparty / venue** — crafts a payload or quote to make you sign harm.
- **Prompt injector** — plants instructions in intent text, token names, or on-chain metadata to hijack the AI.
- **Hostile external source (Zone 4)** — RPCs, aggregators, price feeds, the LLM: assumed to lie.
- **Server-side attacker** — pops a service and expects to move funds (they cannot — see §2.3).
- **Malicious dependency / build** — supply-chain compromise.
- **Rogue insider** — an operator with privileged access.
- **Local attacker with the device** — stolen phone, malware on an unlocked device.

We do **not** promise to protect a fully-owned, unlocked device with the wallet open — no hot wallet can,
and we say so plainly (§3.3). We shrink that window; we do not lie about closing it.

### 2.3 Trust boundaries — signing authority lives in exactly one place

```
Zone 0 — DEVICE (highest trust)          Zone 1 — Edge      Zone 2 — Services      Zone 3 — Data       Zone 4 — External (hostile)
┌──────────────────────────────┐         ┌──────────┐       ┌────────────────┐     ┌────────────┐      ┌──────────────────────┐
│ keys · vault · signing        │ ─sig──▶ │ gateway  │ ────▶ │ intent/exec/...│ ──▶ │ PG/Redis/…│      │ RPCs · aggregators   │
│ (@intent-wallet/core)         │  only   │ WAF/WS   │       │ (cannot sign)  │     │            │  ◀─▶ │ LLM · price feeds    │
│ CONFIRM SHEET = trust boundary│ ◀approval│         │       │                │     │            │      │ chains               │
└──────────────────────────────┘         └──────────┘       └────────────────┘     └────────────┘      └──────────────────────┘
        ▲ key material NEVER crosses this line ▲          the only things that leave Zone 0 are SIGNATURES and OPAQUE VAULT CIPHERTEXT
```

**The invariant, stated as a testable rule:** the only bytes that ever leave Zone 0 are (a) **signatures**
and (b) **opaque vault ciphertext**. Neither can be reversed into a key. A breach of Zones 1–3 is a
privacy/availability incident, **never** fund loss. Zone 4 is assumed adversarial: every external input
(RPC responses, quotes, token metadata, LLM output) is validated, bounded, and treated as attacker-controlled.

### 2.4 STRIDE summary (deep tables in the field manuals)

| Threat | Primary mitigation | Status | Reference |
|---|---|---|---|
| Seed theft at rest | scrypt+AES-256-GCM vault; ciphertext only | ✅ | [wallet-core §6 WC1](docs/security/wallet-core-threat-model.md) |
| Seed theft in memory (unlocked) | keyring destroyed on lock; per-op zeroize; auto-lock | ✅ (window, not zero) | wallet-core §6 WC2 |
| OS-keystore wrap + biometric gate | Secure Enclave / StrongBox wrap of the vault key | ⏭ Phase 8 (apps) | ADR-0029 |
| Blind signing | signer emits exact bytes; decode + simulate + risk verdict upstream cover what's shown | 🔶 core exact; decode/sim maturing | arch06 §2.2, wallet-core §6 WC4 |
| Wrong recipient (typo) | EIP-55 checksum enforced on mixed-case; fail closed | ✅ | [`guard.ts`](packages/chains/src/guard.ts) |
| Wrong-chain replay | `chainId` bound into the EIP-1559 signed payload | ✅ | wallet-core §6 WC6 |
| Sig malleability | low-s normalized (RFC 6979 deterministic) | ✅ | wallet-core §6 WC5 |
| Vault tampering | GCM AEAD; every envelope field bound as AAD | ✅ | [`vault.ts`](packages/core/src/vault.ts) |
| KDF-param DoS | scrypt N/r/p bounds enforced on open | ✅ | `vault.ts` `validateScryptParams` |
| Prompt injection | schema-forced parse; no fund-moving tool; input is data | ✅ boundary; ⏭ red-team CI | [`parser.ts`](packages/intents/src/parse/parser.ts), arch06 §2.3 |
| Server compromise | server **cannot sign**; zones + least-priv | ✅ (by design) / ⏭ (RLS, KMS) | arch06 §3 T6 |
| MITM / TLS | TLS 1.3 + HSTS in transit; cert pinning in apps | 🔶 TLS; ⏭ pinning | arch06 §3 T7 |
| Session-key / automation abuse | hard caps + allowlist + expiry + revocation | 🔶 caps shipped web; ⏭ full grant model | ADR-0028 |
| Supply chain | minimal audited deps; lockfile-only; scanners | 🔶 deps+gitleaks; ⏭ Semgrep/osv/cosign | ADR-0003/0023 |
| Insider / cross-user leak | admin split, 4-eyes, RLS, hash-chained audit | ⏭ | arch06 §2.5, §3 T11/T12 |

---

## 3 · The KEY lifecycle — the most guarded code in the platform

All of the below is `packages/core`, the device-only engine (✅ implemented, covered by an official-vector +
cross-implementation conformance suite — 115 tests: BIP-32/44/84 & SLIP-0010 known-answer vectors,
cross-checked against `viem` and `@scure/btc-signer`). **No network I/O exists in this package** — it is
lint- and review-enforced, so there is *no code path* by which a key could be transmitted.

### 3.1 Generation

- Entropy from a **CSPRNG** (`@noble`), 128- or 256-bit, → BIP-39 mnemonic → one seed.
- One seed → three identities under a **Universal Identity**, matching Ledger/MetaMask/Phantom so
  imports/exports interoperate:

| Ecosystem | Curve | Path | Encoding |
|---|---|---|---|
| Bitcoin | secp256k1 | BIP-84 `m/84'/{0,1}'/0'/0/i` | bech32 P2WPKH `bc1q…` |
| Universal EVM | secp256k1 | BIP-44 `m/44'/60'/0'/0/i` | EIP-55 `0x…` (one address, every EVM chain) |
| Solana | ed25519 | SLIP-0010 `m/44'/501'/i'/0'` | base58 pubkey |

- **Deterministic cores only:** no `Date.now()` / `Math.random()` in derivation. Randomness enters *only*
  at entropy generation, from the CSPRNG.

### 3.2 Encryption at rest — the Vault

The mnemonic is sealed the instant it exists and is never persisted in the clear.

```
Vault = AES-256-GCM( key = scrypt(NFKD(password), salt), plaintext = mnemonic, aad = ⟨every envelope field⟩ )
```

| Property | Value | Why it matters |
|---|---|---|
| KDF | scrypt, **N=2¹⁵, r=8, p=1** (≈32 MiB, ~100 ms/phone) | OWASP scrypt guidance; audited `@noble` impl; no native module (ADR-0005) |
| KDF param bounds | N ∈ [2¹³, 2²²] power-of-two, r ∈ [1,64], p ∈ [1,16] | Enforced on **open** → a hostile envelope cannot demand gigabytes (DoS gate) |
| Cipher | AES-256-GCM (AEAD) | Confidentiality **and** integrity in one primitive |
| Salt / nonce | 32 B / 12 B, fresh random per seal | No reuse |
| AAD | version + KDF params + salt + cipher + nonce, canonically encoded | Tampering with **any** field fails authentication, not just the ciphertext |
| Envelope | versioned JSON (`v:1`), KDF params **inside** it | Strengthen KDF later without breaking existing vaults |
| Password | NFKD-normalized before KDF | Visually-identical unicode passwords derive the same key across keyboards |

**Failure is indistinguishable by design:** a wrong password and a tampered vault both raise
`VAULT_DECRYPT_FAILED` — an attacker learns nothing about *which*. Structural problems raise
`VAULT_CORRUPTED`; a future format raises `VAULT_UNSUPPORTED_VERSION`.

### 3.3 Use — keys live for one operation and are wiped

- Private keys are `Uint8Array`, **derived per-operation** via `exportPrivateKey`, used, and **zeroized in a
  `finally` block** — see [`signing/signer.ts`](packages/core/src/signing/signer.ts). No signer keeps a key
  past its own call.
- The in-memory keyring is **destroyed on lock**; `SessionManager` arms an **auto-lock idle timer**.
- Signers emit **exact bytes**: EIP-1559 · EIP-712 · EIP-191 · PSBT · ed25519. The signature covers exactly
  what the confirm sheet showed — core never blind-trusts, but core is not where the human decision happens.
- **Honest residual:** while unlocked, keys are in JS heap; malware with process-memory access on an
  unlocked device can read them. This is game over for *any* hot wallet and we **say so**. Mitigations shrink
  the window (auto-lock, per-op zeroize); moving signing behind native secure hardware is ⏭ Phase 8.

### 3.4 Backup

- The mnemonic is the sole root of recovery. Shown **once**, **quiz-verified**, and **never persisted
  outside the vault, never transmitted.** Core has no network path to leak it.
- The reveal flow gates re-auth and never puts the phrase on a wire (design 04 S-05).

### 3.5 Wipe & recovery

- `WalletManager.wipe` destroys the vault + keyring; a wiped device holds nothing recoverable.
- **Lost device:** re-import the mnemonic on a clean device → deterministic derivation restores the identical
  identity and funds. **No server involvement.**
- **Forgotten password:** unrecoverable **by design** — we hold no key, so we cannot reset one. Recovery =
  re-import from the mnemonic and set a new password. Stated plainly in UX; never softened into a false hope.
- **Compromised device:** treat the mnemonic as burned. Recover out-of-band — new wallet on a clean device,
  move funds. MPC / social recovery / hardware co-signing to shrink single-device blast radius is ⏭ v2.

---

## 4 · The AI ↔ deterministic boundary — why the AI never signs

Prompt injection is a **when, not an if.** The architecture makes it *survivable* by giving the model no
dangerous capability in the first place.

- **The model can only emit intent-schema JSON.** There is no tool that moves funds, changes settings, or
  reads another user's data. The worst a fully-hijacked model can do is emit a *proposal* — which then faces
  every deterministic gate below.
- **Schema-forced output.** `CompositeParser` runs a deterministic fast-path first, then defers to the LLM,
  whose output is **validated against `IntentSchema` (Zod)** before it is trusted. Invalid or injected output
  degrades to a `clarify` intent (the forms fallback) — **never a guess**. See
  [`parser.ts`](packages/intents/src/parse/parser.ts).
- **Input is data, not instructions.** User text and on-chain metadata enter prompts as delimited content
  blocks; the system instruction is a static, versioned template. Token names/symbols are length-capped and
  unicode-confusable-folded before they reach a prompt or the UI.
- **No secrets in context.** The LLM context carries *no keys and no full addresses* — enforced at the
  `LlmClient` boundary.
- **The chain of custody after the AI:** `proposal → deterministic plan (quote + minReceived + risk verdict)
  → client re-derives human-readable effects locally → user approves exact bytes → device signs → execution
  verifies post-conditions per leg`. The AI touches only the first arrow.

> **Litmus test for any AI feature:** *"If the model were fully controlled by an attacker, what is the worst
> outcome?"* If the answer is anything worse than "a bad proposal the user can reject," the design is wrong —
> add a deterministic gate or remove the capability.

⏭ **Mandated:** a red-team injection corpus in CI (every attempt must yield `clarify` or the correct parse,
never an unintended intent), and per-call template-version logging for forensics (arch06 §2.3).

---

## 5 · The guard rules — the deterministic gate between plan and wire

The single most dangerous moment in the system is a real, mainnet, irreversible transfer.
[`packages/chains/src/guard.ts`](packages/chains/src/guard.ts) is the pure, total gate that stands there.
It **holds no keys and moves no funds; its only power is to REFUSE** — the doctrine made concrete. ✅ shipped,
covered by `guard.test.ts`.

**Properties (why the gate cannot itself become an attack surface):** pure and total — *no network, no clock,
no keys, no I/O.* Same input → same decision, always. It **fails closed**.

```ts
export function guardBroadcast(input: BroadcastGuardInput): GuardDecision   // { ok, blocked[], warnings[] }
export function assertBroadcastAllowed(input: BroadcastGuardInput): void    // throws ChainError('GUARD_BLOCKED')
export const MAINNET_SPEND_CAP_USD = 1_000
```

The rules, in order:

1. **Unknown chain → block.** Anything not in the registry is refused, never guessed.
2. **EVM recipient must be well-formed**, and if **mixed-case**, must pass its **EIP-55 checksum** — a
   mixed-case address that fails is almost always a transcription typo and is rejected. (All-lowercase carries
   no checksum information → well-formed-but-unverifiable, not wrong.) Non-EVM recipients are decoded for real
   by their ecosystem builder (bech32 / base58); the guard rejects an empty recipient early.
3. **Mainnet requires `acknowledgeMainnet`.** Testnets are free; a mainnet (real-funds) broadcast is blocked
   without explicit confirmation, and always carries an *"irreversible"* warning even once acknowledged.
4. **Above the spend cap requires `acknowledgeHighValue`.** A single mainnet transfer over
   **$1,000** additionally demands high-value confirmation.

**Network-mode default = `testnet`** ([`apps/web/src/settings.ts`](apps/web/src/settings.ts)); mainnet is
opt-in and guarded. **Auto-execution** (no per-tx confirm) is off by default (`txMode: 'manual'`); when
enabled it binds a per-tx cap (**$25**) and a daily cap (**$100**) and **fails safe** — when a real USD value
is unknown or a cap would be exceeded, it falls back to manual confirmation. Never weaken `autoDecision`.

---

## 6 · Authentication & sessions

Non-custodial auth uses the *same* signature the wallet already produces — no new secret, no password on a server.

- **SIWE (EIP-4361), ✅.** Server issues a one-time nonce challenge; the wallet signs it **in the browser**
  with `personal_sign` (no transaction, no fee, **key never leaves the device**); the server recovers the
  address and checks it against the nonce. See [`services/api/src/auth/siwe.ts`](services/api/src/auth/siwe.ts).
- **Session token, ✅.** HS256 JWT over `node:crypto` HMAC — no dependency, no key beyond the shared server
  secret (`IW_AUTH_SECRET`, required in every deployed env). Verification is **constant-time** (`timingSafeEqual`)
  and **fail-closed**: bad signature, malformed token, or expired `exp` → `null`. `jti` enables single-session
  revocation. See [`services/api/src/auth/jwt.ts`](services/api/src/auth/jwt.ts).
- **Revocation, ✅.** Redis-backed revoker + sign-out-everywhere.
- **Principal binding, ✅.** A plan is bound to its authenticated subject; execution enforces plan ownership
  (no acting on another principal's plan).

⏭ **Mandated hardening:** migrate JWT to **ES256 + JWKS rotation** with **proof-of-possession refresh** bound
to a per-device keypair (a stolen refresh token is then useless without the device key); refresh-reuse
detection with family revoke; row-level security (RLS) as a data-layer backstop below app authz; argon2id-hashed,
scoped, revocable enterprise API keys (arch06 §2.1).

---

## 7 · Secret handling

**A leaked secret is a shipped incident.** Secrets are never logged, never committed, never bundled into a client.

- **Never in the tree.** `.gitignore` blocks `.env*` (except `.env.example`), and `*.pem *.key *.p12 *.pfx
  *.keystore *.jks *.mnemonic *.seed`, `secrets/`, and the TESTNET-only `dev-wallet.json`. The dev wallet seed
  is **testnet-only, reproducible, never real funds.**
- **Client apps receive PUBLIC vars only.** `IW_LLM_API_KEY` and every backend secret are **never bundled into
  a client** ([`.env.example`](.env.example)); real envs inject them from a secrets manager (ADR-0023).
- **Leak-scan before every commit.** CI runs **gitleaks** on every push/PR
  ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Locally, when the OOM-prone pre-commit hook forces
  a `--no-verify` commit, you **grep for the known secret prefixes first — the count must be 0**
  ([CLAUDE.md §8](CLAUDE.md)).
- **Build artifacts never in `src/`.** Emitted `*.js / *.d.ts / *.map` under `packages/*/src/**` are gitignored:
  a stale `.js` **shadows** the `.ts` for Vite's `.js`-extension imports and can silently ship dead code — a
  correctness *and* security hazard. Purge them; never commit them.
- **Error messages never carry key material.** The `WalletError` contract keeps messages safe to log
  (`VAULT_DECRYPT_FAILED`, `KEYRING_DESTROYED`, … — codes, not secrets).

---

## 8 · Supply chain

- **Minimal, audited crypto only:** the `@noble` / `@scure` family and nothing else in the key path (ADR-0003).
  `packages/core` pulls in **no runtime framework** — a smaller attack surface than any framework-based wallet.
- **Lockfile-only installs** (`pnpm install --frozen-lockfile` in CI); no `postinstall` scripts.
- ⏭ **Mandated:** Semgrep (SAST) + osv-scanner + dependency review on every PR; Renovate with a cooldown +
  provenance checks; signed containers (cosign) verified at admission; SBOM per image; base-image digest
  pinning; SRI on web builds (arch06 §2.4). Today's CI runs typecheck (strict) · full topological build ·
  unit/property tests · gitleaks — **and does not claim the scanners it does not yet run.**

---

## 9 · Audit trail — tamper-evident by construction

- Every risky decision (risk verdict, policy denial, guard block, auto-execution) is logged with its inputs
  and its reason — Doctrine law #5.
- ⏭ **Mandated design:** an append-only `audit_log` where `entry_hash = SHA-256(prev_hash ‖ canonical(entry))`;
  the DB role may **INSERT only**; a daily anchor writes the latest hash to WORM object-lock storage; a nightly
  job re-walks the chain and **pages security on any mismatch** (arch06 §4). Until this lands, "auditable"
  means structured, reason-carrying logs — not a cryptographically tamper-evident chain; do not overstate it.

---

## 10 · Audit & bug-bounty requirements (gate to real funds)

These are **release gates**, not aspirations. GA for real, uncapped funds is blocked until the ✅ items are done.

| Requirement | Gate |
|---|---|
| External audit of **`packages/core`** (the key engine) | Before public beta |
| External audit of the **execution path + any smart-account modules** | Before GA |
| Annual re-audit + re-audit on any change to the crypto or guard surface | Continuous |
| Property / invariant tests on core crypto | ✅ shipping ([`packages/core/test`](packages/core/test)) |
| Fuzz targets: intent parser, tx decoders, vault-envelope parser | ⏭ nightly |
| **Bug bounty (Immunefi-class)** with a published **safe-harbor** policy; crits scoped up to **$250k** | ⏭ at GA |

The current build executes **real testnet** transactions (Sepolia / devnet / BTC-testnet) and **guarded,
capped mainnet ETH** — labelled exactly as such. Uncapped mainnet stays behind these gates.

---

## 11 · Incident response & kill-switches

- **Kill-switches (⏭ mandated):** independent, fast disable of a **venue**, a **chain**, the **LLM path**, and
  **session-keys/automation** — so one bad surface can be cut without a full outage. Fail closed: a tripped
  switch blocks the action, it does not silently degrade to unguarded execution.
- **Response:** severity matrix, on-call rotation, user-comms templates, and **public post-mortems for any
  fund-adjacent incident.** The doctrine forbids hiding a loss.
- **Because keys are on-device,** the highest-severity server incident is a **privacy** breach, never a fund
  breach — the response plan is scoped accordingly (containment + disclosure), and this is stated to users
  honestly rather than implying servers can lose their money.

---

## 12 · Responsible disclosure

We want to hear about vulnerabilities and we will not punish good-faith research.

- **Report privately.** Use **GitHub Security Advisories** on this repository (preferred), or email the
  maintainers. **Do not open a public issue** for a security bug, and do not disclose publicly until a fix
  ships. *(⏭ before public launch: stand up a dedicated `security@` address and a published `security.txt` /
  safe-harbor policy — until then, private advisory is the channel.)*
- **Include** a clear description, reproduction steps or PoC, affected component/version, and impact.
- **In scope, prioritized:** anything that can (1) extract or exfiltrate a key/seed, (2) cause an unintended
  or unconfirmed fund movement, (3) defeat the broadcast guard, (4) bypass the AI↔deterministic boundary,
  (5) leak one user's data to another, or (6) forge/replay a session.
- **Out of scope:** the honestly-documented residual of an unlocked, malware-owned device (§3.3); testnet-only
  behavior; findings that require physical access to an unlocked device with the wallet open.
- **Our commitment:** timely acknowledgement, a fix or mitigation timeline, credit if you want it, and
  safe-harbor for research that respects user funds and privacy and doesn't exfiltrate real user data.

---

## 13 · The Security Review gate (what triggers the veto)

Every change on this list **must pass a security review before merge**; the Principal Security Engineer may
**veto** (CLAUDE.md §2, §4 "Security Review"). Skipping it is itself a doctrine violation.

- Anything touching **keys, the seed, the vault, derivation, or a signer.**
- Anything touching the **broadcast guard**, network-mode, spend caps, or auto-execution.
- Any new **LLM prompt, tool, or parser path**, or a change to the intent/plan schema.
- Any **auth / session / principal-binding** change.
- Any new **secret**, env var, or logging of a value that *could* contain user data.
- Any new **runtime dependency** in the key path, or a change under `packages/core` / `packages/chains`.

**Reviewer checklist (the questions the veto asks):**

1. Can a key or seed reach a wire, a log, an error message, or a server on any path — including error paths?
2. Does every new gate **fail closed**? What exactly happens on unknown / malformed / unpriced input?
3. Is money `bigint` end-to-end? Any float in a value path?
4. If the LLM were attacker-controlled, is the worst case still just "a rejectable proposal"?
5. Is the irreversible action gated by explicit, informed, un-fakeable confirmation?
6. Is the decision **logged with inputs and reason**?
7. Does the change claim any control it doesn't actually run (a `✅` that's really `⏭`)?

If you cannot answer all seven cleanly, the change is not ready — regardless of whether it "works."

---

## 14 · References

| Topic | Canonical source |
|---|---|
| Constitution & doctrine | [`CLAUDE.md`](CLAUDE.md) |
| Platform threat model (STRIDE × zones, audit, program) | [`docs/architecture/06-security.md`](docs/architecture/06-security.md) |
| Device engine threat model (vault, derivation, signing) | [`docs/security/wallet-core-threat-model.md`](docs/security/wallet-core-threat-model.md) |
| Vault (scrypt + AES-256-GCM) | [`packages/core/src/vault.ts`](packages/core/src/vault.ts) · ADR-0005 |
| Signing manager (per-op key + zeroize) | [`packages/core/src/signing/signer.ts`](packages/core/src/signing/signer.ts) · ADR-0029 |
| Broadcast guard (EIP-55, mainnet ack, spend cap) | [`packages/chains/src/guard.ts`](packages/chains/src/guard.ts) |
| Intent parser boundary (schema-forced LLM) | [`packages/intents/src/parse/parser.ts`](packages/intents/src/parse/parser.ts) · ADR-0013/0014 |
| SIWE + JWT sessions | [`services/api/src/auth/`](services/api/src/auth/) · ADR-0015 |
| Session keys / automation caps | ADR-0028 |
| Crypto library choice | ADR-0003 · ADR-0004 |
| Secrets management | ADR-0023 |
| Security audit & hardening program | ADR-0049 · [`docs/architecture/30-security-audit.md`](docs/architecture/30-security-audit.md) |
| CI gates that run today | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

> **Last word.** This wallet earns trust by being *honest about what it cannot do* as much as by what it does.
> A control we haven't shipped is marked `⏭`, not hidden. A residual risk is named, not buried. That honesty
> is not a weakness in the security posture — it *is* the security posture. Ship world-class or don't ship;
> refuse to fake, refuse to leak a key.
