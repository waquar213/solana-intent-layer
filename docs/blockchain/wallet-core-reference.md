[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Volume V — the long-form behind [Chapter 6 — Wallet Core Architecture](../bible/chapter-06-wallet-core-architecture.md)

# The Wallet Core Reference

*The production wallet engine, grounded in the real V2 core — lifecycle, keys, signing, transactions, balances, sync, sessions, error recovery, and the performance & production standards.*

**About this document.** This is the deep, buildable reference for **Chapter 6 — Wallet Core Architecture**,
the production engine every other feature is built on. It was authored one step ahead of the chapter's
canonical charter; each section is tagged **SHIPPED** (cite the real code) or **ROADMAP**. Two lines never
move: **keys live on-device and never touch a server**, and **every signature happens on-device** — the AI
has zero signing authority.

| § | Section | Grounded in |
|---|---|---|
| 1 | The Wallet Lifecycle | `WalletManager`, `apps/web/src/wallet.ts` |
| 2 | Key Management Architecture | `SecureStore` (scrypt + AES-256-GCM), `SECURITY.md` |
| 3 | The Signing Engine | unified `Signer` + `SigningManager`, conformance vectors |
| 4 | The Transaction Builder | the per-chain signers, `apps/web/src/broadcast.ts` |
| 5 | The Balance Engine | `packages/portfolio`, `balances.ts` (four-state honesty) |
| 6 | Multi-Chain Sync & Background Indexing | the load-concurrency guard, provider framework |
| 7 | Session Management | `SessionManager`, device vs SIWE session |
| 8 | Offline Behavior & Error Recovery | `packages/execution` recovery/park/resume |
| 9 | Performance Targets & Production Standards | `CLAUDE.md` §5/§8, `TESTING.md` |

Honesty first: shipped vs roadmap is tagged throughout; money is bigint; a network failure is never "$0".

---

## §1 · The Wallet Lifecycle

Chapter 5 answered *who the user is* — one Universal Identity, three receive addresses, keys that never
leave the device. This section answers the question beneath it: **what state is that identity's key
material in, right now, and what is allowed to happen next?** Every other section in Chapter 6 — the
signing engine (§3), the transaction builder (§4), session management (§7) — is a guest of the lifecycle.
None of them may run until the lifecycle says the seed is present in memory, and all of them must stop the
instant it says the seed is gone.

We therefore model the wallet not as an object with methods but as an **explicit, guarded state machine**.
There are five states. Every edge between them has a single, named guard, and no edge exists without one.
This is Doctrine #5 (*fail closed*) made structural: a wallet cannot slide from "locked" to "can sign a
transaction" by accident, because the only path runs through a scrypt derivation and an AES-GCM
authentication that a wrong password cannot satisfy.

The machine is implemented in `packages/core/src/wallet/wallet-manager.ts` (`WalletManager`, the single
public facade), with its persistence boundary in `wallet/secure-store.ts`, its timer in `wallet/session.ts`,
and its cryptography in `vault.ts` and `keyring.ts`. The web app drives it through the thin adapter in
`apps/web/src/wallet.ts`; the mobile app drives the same core through its own `SecureStore`.

---

### 1.1 · The five states

| State | Meaning | Persisted on device | Seed in memory | Permitted operations |
|---|---|---|---|---|
| **Uninitialized** | No vault has ever been written to this store. | — | — | `createWallet`, `importWallet` |
| **Creating / Importing** | Transient: entropy → mnemonic → sealed vault is being written. | vault being written | seed being built | (none exposed; async transition) |
| **Unlocked** | The HD keyring is live in memory; the Universal Identity is derivable and signing is possible. | sealed vault | **yes** (`HDKeyring` holds seed) | read identity, derive accounts, **sign** (EVM/BTC/SOL), export mnemonic, change password, add/switch account, lock, wipe |
| **Locked** | A sealed vault exists but the keyring has been destroyed; the seed is gone from RAM. | sealed vault | — | `unlock`, `verifyPassword`, `wipe` |
| **Wiped** | The vault ciphertext has been deleted from the store. Terminal → collapses back to **Uninitialized**. | — | — | `createWallet`, `importWallet` |

The state is not a stored enum — it is **derived from two facts**, which is why it cannot lie:

- `isUnlocked()` ⇔ `#keyring !== null && !#keyring.destroyed` — the keyring's own liveness flag is the
  source of truth, so a destroyed keyring can never read as unlocked.
- `hasWallet()` ⇔ `store.has(STORE_KEYS.vault)` — an async probe of the persistence layer
  (`iw.vault.v1`), the only durable artifact the wallet writes.

`Uninitialized` = `!hasWallet()`. `Locked` = `hasWallet() && !isUnlocked()`. `Unlocked` =
`isUnlocked()`. There is no fourth combination the code can reach.

---

### 1.2 · The state machine

```
                         createWallet(pw)              ┌──────────────────────┐
        ┌──────────────┐   guard: no existing vault    │   generate 128-bit    │
        │              │ ────────────────────────────▶ │   entropy → mnemonic  │
        │ UNINITIALIZED│   importWallet(m, pw)          │   → seal → keyring    │
        │  (no vault)  │   guard: BIP-39 checksum OK    └───────────┬──────────┘
        │              │ ────────────────────────────▶             │  keyring built,
        └──────▲───────┘                                           │  vault persisted
               │                                                   ▼
               │  wipe()                                    ┌──────────────┐
               │  guard: typed destructive confirm          │              │
               │  (effect: lock() → seed zeroized,          │   UNLOCKED   │ ──┐ sign / derive /
               │   then delete vault ciphertext)            │ (seed in RAM)│ ◀─┘ export  (self-loop;
               └────────────────────────────────────────── │              │      each touch() re-arms
                                                            └──┬────────▲──┘      the auto-lock timer)
                                                    lock() OR  │        │
                                              auto-lock fires  │        │  unlock(pw)
                                     guard: manual / idle T    │        │  guard: openVault succeeds
                                     (effect: keyring.destroy  │        │  (scrypt derive + AES-GCM
                                      → seed zeroized)         ▼        │   auth); wrong pw / tamper
                                                            ┌──────────────┐  → VAULT_DECRYPT_FAILED,
                                                            │    LOCKED    │  stays LOCKED (fail closed)
                                                            │ (vault only) │
                                                            └──────────────┘
```

Read the edges as *guard → effect*, never as a bare call:

| From | To | Trigger | Guard (must be true to cross) | Effect on secrets |
|---|---|---|---|---|
| Uninitialized | Unlocked | `createWallet(pw)` | no vault already in store (`INVALID_INPUT` otherwise); password non-empty | 128-bit entropy → 12-word mnemonic; sealed under scrypt+AES-GCM; keyring built in RAM |
| Uninitialized | Unlocked | `importWallet(m, pw)` | mnemonic passes BIP-39 wordlist **and** checksum (`validateMnemonic`); no existing vault | mnemonic normalized, sealed, keyring built |
| Locked | Unlocked | `unlock(pw)` | `openVault` authenticates: scrypt(pw)→key, AES-256-GCM decrypt+verify. Wrong pw or any tampered envelope byte → `VAULT_DECRYPT_FAILED` | plaintext seed lives only inside the `try`; the decoded buffer is `zeroize`d in `finally` after the keyring copies it |
| Unlocked | Locked | `lock()` (manual) or auto-lock timeout | none for `lock`; timeout requires the session still active | `keyring.destroy()` → seed, root node, and mnemonic string zeroized; signer dropped |
| Unlocked | Unlocked | any read/sign; `touch()` | keyring alive (else `KEYRING_DESTROYED`) | none; `touch()` only re-arms the idle timer |
| Locked / Unlocked | Wiped→Uninitialized | `wipe()` | UI destructive confirmation (type **REMOVE**) | `lock()` first (zeroize seed), then delete `vault` + `meta` from the store |

Two properties fall out of this table and are worth stating plainly, because §3–§9 depend on them:

1. **Signing authority is a strict subset of the Unlocked state.** `getSigner()` and `getAccount()` route
   through `#requireKeyring()`, which throws `KEYRING_DESTROYED` unless `isUnlocked()`. There is no cached
   signer that survives a lock; `lock()` nulls `#signer` alongside the keyring. The signing engine (§3)
   cannot outlive the seed.
2. **The only durable secret is opaque ciphertext.** Across every state, the sole thing written to the
   `SecureStore` is the vault envelope — a versioned JSON blob of salt, nonce, KDF params, and AES-GCM
   ciphertext+tag. It is useless without the password (Doctrine #1). Nothing that can move funds is ever
   persisted, and nothing secret is ever sent to a server.

---

### 1.3 · Create — entropy, then a backup you cannot skip

`WalletManager.createWallet(password)` runs a deliberate, ordered sequence:

1. **Refuse to clobber.** If a vault already exists, throw `INVALID_INPUT` — creating over an existing
   wallet would strand its funds. (The doctrine: never destroy recoverability silently.)
2. **Generate real entropy.** `generateMnemonic(128)` → a 12-word BIP-39 mnemonic (256-bit / 24-word is
   available as the paranoid tier). Entropy comes from `@noble/hashes`' CSPRNG, not `Math.random`.
3. **Seal before exposing.** The mnemonic is `utf8ToBytes`-encoded, sealed into the vault
   (§1.5), and written to the store — *then* the plaintext byte buffer is `zeroize`d in a `finally`.
4. **Unlock in place** and return the mnemonic **exactly once**, for the backup screen. It is never
   persisted in the clear and never returned again.

The return-once contract is the load-bearing detail. `createWallet` hands the caller
`{ mnemonic, account }`; after that the only way to see the phrase again is `exportMnemonic()` on an
unlocked wallet, gated by re-auth (§1.6). The UI (`apps/web/src/App.tsx`, `AuthGate`) turns this into a
**backup you cannot skip**: after `createWallet` succeeds the app is technically unlocked in core, but the
shell withholds `onEntered()` until the user passes a **confirmation quiz** — a checkbox plus re-typing two
*randomly chosen* words from the phrase. Only then does the app enter its main experience. Chapter 3/4's
onboarding screens map to this exactly: `none → create → backup → (quiz) → home`. The subtle honesty here:
*unlocked in the engine* and *entered in the UI* are two different gates, and we do not let the second imply
the first. Losing the phrase is unrecoverable — we say so on the screen, because we cannot recover it for
the user and will never pretend otherwise.

### 1.4 · Import — validate hard, normalize, optionally passphrase

`importWallet(mnemonic, password)` is create's mirror with a stricter front door:

- **BIP-39 validation is a hard gate.** `validateMnemonic` checks the words against the English wordlist
  **and** verifies the checksum before anything is sealed. A phrase with a typo'd or transposed word fails
  here, not three screens later at a confusing empty balance.
- **Normalization is deterministic.** Input is trimmed, lowercased, and internal whitespace collapsed
  (`trim().toLowerCase().split(/\s+/).join(' ')`), so `"  Legal   Winner …"` and `"legal winner …"` seal to
  the same wallet. BIP-39 English words are pure ASCII, so lowercasing is safe and forgiving of keyboard
  auto-capitalization.
- **Passphrase ("25th word") is core-capable.** `HDKeyring.fromMnemonic` and `mnemonicToSeed` accept an
  optional BIP-39 passphrase that derives an entirely distinct wallet (PBKDF2-HMAC-SHA512, salt
  `"mnemonic"+passphrase`). The current web `importWallet` does not yet surface a passphrase field —
  **[ROADMAP: expose optional passphrase in the import UI]** — but the engine already supports it, and when
  it ships the copy must warn that losing the passphrase loses the funds.

Import paths (BTC `m/84'/…`, EVM `m/44'/60'/…`, SOL `m/44'/501'/…`) follow ecosystem conventions so a phrase
restored here reproduces the same addresses as MetaMask, Ledger, Phantom, or Solflare — the interoperability
contract detailed in Chapter 5's reference.

### 1.5 · Unlock and auto-lock — a deliberately slow door and a self-closing one

**Unlock is intentionally expensive.** `unlock(password)` fetches the envelope and calls `openVault`, which
runs scrypt with `DEFAULT_SCRYPT_PARAMS = { N: 2^15, r: 8, p: 1 }` — **32 MiB of memory-hard work, ≈100 ms**
on current phones (per OWASP scrypt guidance; `vault.ts`). This cost is a feature, not a regression against
our <100 ms interaction budget (§9): it is the cold, once-per-session path whose slowness is what makes an
offline brute-force of a stolen vault economically hopeless. The KDF parameters live *inside* the envelope,
so they can be raised per platform without breaking existing vaults, and every envelope field is bound to
the ciphertext as GCM **additional authenticated data** — flip any byte of salt, nonce, or params and
authentication fails as `VAULT_DECRYPT_FAILED`, indistinguishable by design from a wrong password. A failed
unlock changes no state: the wallet stays **Locked**. Fail closed.

Once open, the decoded seed is copied into the keyring and the transient buffer is `zeroize`d in a `finally`
— the plaintext exists for microseconds outside the keyring.

**Auto-lock is the door closing itself.** `SessionManager` (`wallet/session.ts`) arms a single timer on
`start()` (fired from unlock) and re-arms it on every `touch()`. When the idle window elapses it invokes the
`onLock` callback, which is `WalletManager.lock()` → `keyring.destroy()` → seed zeroized. The timer holds
**no key material** — it is pure timing state — and the scheduler is injectable so tests are deterministic
(no wall clock). Defaults: the core ships 5 minutes; the web app configures **15 minutes** by default with
user-selectable `[0, 5, 15, 30, 60]` minutes (`apps/web/src/settings.ts`, `AUTO_LOCK_OPTIONS`), where `0`
means never. A settings change takes effect on the next unlock/reload, because `autoLockMs()` is read once at
manager construction. Locking is idempotent and safe to call from a visibility/background handler — the
recommended trigger on mobile and on tab-blur.

### 1.6 · Wipe and re-auth — the two most dangerous edges

**Wipe** is the only edge that destroys recoverability, so it is the most heavily gated in the UI and the
most careful in the engine. `WalletManager.wipe()` **locks first** — `keyring.destroy()` zeroizes the seed —
and only then deletes the `vault` and `meta` keys from the store; the web adapter additionally clears the
multi-account index. Ordering matters: if deletion somehow failed, the seed is already gone from RAM, so a
half-wipe can never leave a live keyring pointing at a deleted vault. The UI gate is an explicit destructive
confirmation — the user must type **REMOVE** verbatim (`App.tsx`), mirrored by the mobile "type to confirm"
pattern — and the copy states that without the recovery phrase the funds are lost forever.
*[ROADMAP: add password re-auth before wipe, matching the reveal gate below, so a shoulder-surfer with an
unlocked screen cannot both wipe and re-seed.]*

**Re-auth without unlocking.** Revealing the recovery phrase for backup is as sensitive as unlocking, yet the
wallet is *already* unlocked when the user asks — so `unlock()` is the wrong tool: it is a **no-op when
already unlocked and would accept any password**. Instead `verifyPassword(password)` (`wallet-manager.ts`)
re-derives the key straight from the sealed vault via `openVault`, returns `true` iff it authenticates, and
`zeroize`s the decoded secret immediately — it never consults the in-memory unlock flag. The reveal flow
(`App.tsx`) requires this fresh check to pass, shows the phrase, and auto-clears it from the DOM after a
short window. This is the honest pattern for every "prove it's still you" moment (reveal seed, export key,
and — on the roadmap — wipe).

---

### 1.7 · How states map to what the user sees

The UI never invents a state the engine cannot be in; each `WalletView` in `apps/web/src/App.tsx` is a
faithful render of an engine state (Chapters 3–4 own the pixels, this section owns the truth behind them):

| Engine state | UI view (`WalletView`) | What the user can do |
|---|---|---|
| resolving on load | `checking` | nothing — a neutral placeholder card, never a fake "$0" or a spinner that implies a balance |
| Uninitialized | `none` | Create new wallet · Import recovery phrase |
| Creating | `create` | set + confirm a password (min 8) |
| just created | `backup` | read the phrase; pass the two-word quiz to enter |
| Importing | `import` | paste a 12/24-word phrase + set a device password |
| Locked | `locked` | enter password to unlock; wrong password → inline "Wrong password", still Locked |
| Unlocked | (the shell) | the full experience: identity, send, chat, sign, settings, reveal, wipe |

Because the shell's `entered` flag is the app's *own* gate — deliberately stricter than `isUnlocked()` on
the create path (§1.3) — a network blip or a stale render can never surface a signing surface for a wallet
whose seed isn't in memory. Every screen that could touch funds sits strictly inside **Unlocked**.

---

### 1.8 · Where we stand against the best — and what's still roadmap

Measured against Ledger and Trezor, the honest comparison is precise: their seed lives in a **secure
element** and is never exposed to application code even during signing; ours lives in the JavaScript heap
while unlocked. We narrow that gap deliberately — the seed is present only between unlock and lock, every
derived private key is wiped immediately after each signature (§3), and `zeroize` is called consistently —
but we **document its limit rather than hide it**: a JS engine may copy bytes during GC or JIT, and pure-JS
code cannot prevent that (`bytes.ts`). Closing the remaining distance is explicitly **roadmap**, and none of
it ships today:

- **[ROADMAP]** hardware-backed key storage — iOS Secure Enclave / Android StrongBox / external hardware
  wallets — so the seed never enters app memory.
- **[ROADMAP]** MPC / threshold signing and **passkeys**, removing the single-seed single-point-of-loss.
- **[ROADMAP]** air-gapped / offline signing for high-value transfers.
- **[ROADMAP]** encrypted multi-device sync of the *vault only* (never plaintext keys), per Chapter 5 §10.

What ships **today**, and is cited above, is the complete five-state lifecycle: on-device create/import,
scrypt+AES-256-GCM sealed vault, deterministic BIP-39 validation, memory-hard unlock, self-closing
auto-lock, seed-zeroizing lock and wipe, and re-auth that never trusts the unlock flag. That machine is the
floor the rest of Chapter 6 is built on: §2 details the key hierarchy it protects, §3 the signing it gates,
and §7 the session model it arms.

> **Lifecycle invariants (any change that breaks one is a defect, reverted):**
> ① the seed exists in memory only in **Unlocked**, and is zeroized on the edge out of it;
> ② no state transition to a signing-capable state exists without a cryptographic guard (scrypt+GCM auth or
> fresh entropy); ③ the only durable artifact is opaque vault ciphertext — never a plaintext key, never on a
> server; ④ a failed unlock is a distinct, non-destructive outcome that stays **Locked** — never a silent
> success and never a fake balance.


## §2 · Key Management Architecture

> *As Principal Security Engineer, I hold the pen on this section — and a hard veto over any change to it.*
> This is the lifecycle of the one asset whose loss is irreversible and total: the seed. Everything else in
> Chapter 6 — the [Signing Engine](#) (§3), the [Transaction Builder](#) (§4), the [Balance Engine](#) (§5) —
> is a privacy or availability concern. **Only the secret is catastrophic, and it never leaves the device.**
> Chapter 5 said *who the user is*; this section is *where the key that proves it lives, and exactly when it
> is wiped.* Everything below is **shipped code** in [`packages/core`](../../packages/core) unless tagged
> otherwise. Status tags follow [`SECURITY.md §0`](../../SECURITY.md): ✅ **shipped & tested** ·
> 🔶 **partial** · ⏭ **roadmap (mandated, not yet running)**.

The governing law is [Doctrine #1](../../CLAUDE.md#3--the-doctrine--laws-no-change-may-break): *keys and
seed are generated and used on-device, encrypted at rest, and never leave the device or touch a server.*
`packages/core` has **zero network I/O** — it imports no HTTP client, no socket, nothing that can reach a
wire. This is not a convention we hope holds; it is a structural property enforced by lint and review, so
**there is no code path by which a key could be transmitted.** The rest of this section is the machinery that
makes that boast survive contact with a real device, a stolen phone, and a heap dump.

---

### §2.1 · The one secret and its states — the lifecycle machine

The secret is not "a key." It is a single **BIP-39 mnemonic** (12 or 24 words) from which a 64-byte seed is
derived, and from that seed every BTC / EVM / SOL private key in the [Universal Identity](../bible/chapter-05-universal-identity.md).
Guarding it well means knowing, at every instant, **which of exactly five states it is in and what physical
memory holds it.** That is a state machine, and the security of the whole wallet is the claim that no
transition leaks.

```
            createWallet / importWallet                    unlock(password)
            ┌───────────────────────────┐          ┌───────────────────────────────┐
            ▼                           │          ▼                               │
  ┌───────────────┐   seal + persist  ┌─┴──────────────┐   openVault + decode   ┌──┴───────────────┐
  │  NONEXISTENT   │ ────────────────▶ │  SEALED-AT-REST │ ─────────────────────▶ │  UNLOCKED-IN-RAM  │
  │ (no bytes      │                   │ (ciphertext only│                        │ (seed in JS heap, │
  │  anywhere)     │ ◀──────────────── │  in SecureStore)│ ◀───────────────────── │  keyring alive)   │
  └───────────────┘   wipe()          └────────────────┘   lock / auto-lock /    └──────┬───────┬────┘
        ▲                                                   background   destroy()       │       ▲
        │                                                                                │ derive │ zeroize
        │  wipe() (from any state — always lands here)                                    ▼       │ (finally)
        └──────────────────────────────────────────────────────────────────────  ┌──────────────┴────┐
                                                                                   │ DERIVED-KEY-TRANSIENT│
                                                                                   │ (one private key,    │
                                                                                   │  one operation)      │
                                                                                   └──────────────────────┘
```

| State | Where the secret physically is | Entry transition (+ guard) | Exit |
|---|---|---|---|
| **NONEXISTENT** | Nowhere | — | `createWallet` / `importWallet` |
| **SEALED-AT-REST** | `SecureStore` as **opaque AES-256-GCM ciphertext** — no plaintext, no key | `seal(mnemonic, password)` — *guard:* non-empty secret + non-empty password | `unlock` (needs password) · `wipe` |
| **UNLOCKED-IN-RAM** | `HDKeyring` private fields (`#mnemonic`, `#seed`, `#root`) in JS heap | `openVault(envelope, password)` succeeds — *guard:* GCM authentication (wrong password ⇒ no transition) | `lock` / auto-lock / `destroy` |
| **DERIVED-KEY-TRANSIENT** | One `Uint8Array` private key, for the span of one signature | `exportPrivateKey(chain, index)` — *guard:* keyring alive (`KEYRING_DESTROYED` otherwise) | `zeroize()` in a `finally` — **always** |
| — (terminal) | — | `wipe()` deletes the ciphertext; `destroy()` zeroizes RAM | back to NONEXISTENT / SEALED |

The whole of §2 is the defense of the four arrows that touch plaintext. Two of them (`unlock`, `destroy`) are
the [Wallet Lifecycle](#) machine in §1; here we care about what happens to the **bytes** on each.

---

### §2.2 · Generation — CSPRNG → mnemonic → seed

A wallet is born from entropy, never from a timestamp or a counter.
[`mnemonic.ts`](../../packages/core/src/mnemonic.ts) delegates entropy to the audited
[`@scure/bip39`](https://github.com/paulmillr/scure-bip39), which draws from the platform **CSPRNG**
(`crypto.getRandomValues` / `randomBytes`) — never `Math.random()`, never `Date.now()`. This is the *only*
place randomness enters the key path; everything downstream is deterministic derivation, which is what makes
the same mnemonic restore the identical wallet on any device.

| Step | Primitive | Detail |
|---|---|---|
| Entropy | CSPRNG | **128 bits** → 12 words (default) or **256 bits** → 24 words (`MnemonicStrength`, the paranoid tier) |
| Mnemonic | BIP-39 | English wordlist; checksum-validated on every import (`INVALID_MNEMONIC` on failure) |
| Seed | PBKDF2-HMAC-SHA512 | **2048 iterations**, salt `"mnemonic"` + optional passphrase → **64-byte seed** |
| Passphrase | BIP-39 "25th word" | Optional; a distinct passphrase is a **distinct wallet** — losing it loses the funds, and the UX must say so before enabling it |
| Root | BIP-32 | `HDKey.fromMasterSeed(seed)` — secp256k1 for BTC/EVM; **SLIP-0010** ed25519 for SOL ([`slip10.ts`](../../packages/core/src/slip10.ts)) |

The derivation paths and address encodings are Chapter 5's charter and the [`keyring.ts`](../../packages/core/src/keyring.ts)
`derivationPaths` table — not re-derived here. What matters for §2 is that **generation produces exactly one
secret to protect**, and it is protected the instant it exists: `createWallet` seals the mnemonic into the
vault *before* returning it to the caller, and the plaintext is shown to the user exactly once, for backup,
then never persisted in the clear again (§2.4).

Correctness of every path is nailed down by an **official-vector + cross-implementation conformance suite**
(BIP-32/44/84 and SLIP-0010 known-answer vectors, cross-checked against `viem` and `@scure/btc-signer` — the
115-test core suite in [`packages/core/test`](../../packages/core/test)). A derivation bug here would mint
the wrong address and silently strand funds; it is tested to the standard, not asserted.

---

### §2.3 · The sealed vault — encryption at rest

The moment the mnemonic exists it is sealed. [`vault.ts`](../../packages/core/src/vault.ts) is the whole
of it, and its shape is:

```
Vault = AES-256-GCM(
          key       = scrypt( NFKD(password), salt, N,r,p ),
          plaintext = mnemonic UTF-8 bytes,
          aad       = ⟨version ‖ scrypt params ‖ salt ‖ cipher ‖ nonce⟩   // every envelope field
        )
```

A memory-hard KDF turns the user's password into the AES key; an **AEAD** cipher gives confidentiality and
integrity in one primitive; and the envelope's own metadata is bound as **additional authenticated data** so
that tampering with *any* field — not just the ciphertext — fails authentication.

| Property | Value | Why |
|---|---|---|
| KDF | **scrypt**, `N=2¹⁵, r=8, p=1` (`DEFAULT_SCRYPT_PARAMS`) | ≈ **32 MiB** memory (`128·N·r`), **~100 ms** on a current phone — a deliberate cost (§2.3.1) |
| KDF choice | scrypt over argon2id | First-class **audited `@noble/hashes`** impl, **no native module** in React Native (ADR-0005) |
| KDF bounds | `N ∈ [2¹³,2²²]` power-of-two, `r ∈ [1,64]`, `p ∈ [1,16]` | Enforced **on open** — a hostile envelope cannot demand gigabytes of KDF memory (DoS gate) |
| Cipher | **AES-256-GCM** | AEAD: confidentiality **and** integrity together; 16-byte tag appended to ciphertext |
| Salt | **32 bytes**, fresh CSPRNG per seal | Distinct key per vault even for identical passwords; no rainbow reuse |
| Nonce | **12 bytes**, fresh CSPRNG per seal | GCM nonce uniqueness (verified: same input → different envelopes) |
| AAD | canonical string of version+params+salt+cipher+nonce | Flip any byte of metadata ⇒ `VAULT_DECRYPT_FAILED` |
| Envelope | versioned JSON (`v:1`), **params stored inside** | We can raise the KDF cost later without breaking existing vaults |
| Password | **NFKD-normalized** before KDF | Visually-identical unicode passwords derive the same key across keyboards |

**The KDF key itself is a secret too**, and it is treated as one: `deriveKey` zeroizes both the derived
32-byte AES key and the intermediate password bytes in a `finally` block, so the only long-lived secret is the
password in the caller's string (which JS controls less tightly — an honest residual, §2.4).

**Error taxonomy — failure teaches an attacker nothing.** A wrong password and a *tampered* vault both raise
the **same** `VAULT_DECRYPT_FAILED`; an attacker who mutates the ciphertext cannot distinguish "wrong key"
from "you broke the tag." Structural garbage raises `VAULT_CORRUPTED`; a future format raises
`VAULT_UNSUPPORTED_VERSION`. These codes are the *only* thing that leaves the failure path — never a fragment
of key material ([`errors.ts`](../../packages/core/src/errors.ts) invariant: messages carry codes, not
secrets). Each of these is a test in [`vault.test.ts`](../../packages/core/test/vault.test.ts):
roundtrip at production params, unique salt/nonce, NFKD equivalence, the four tamper vectors (ciphertext,
nonce, salt, KDF-param), the DoS-param rejection, and a `fast-check` property that round-trips arbitrary
secrets and passwords.

#### §2.3.1 · The 100 ms is the feature

scrypt at `N=2¹⁵` is **deliberately slow** — ~100 ms and ~32 MiB per attempt. On unlock the legitimate user
pays it once and never notices. An offline attacker who has stolen the ciphertext pays it **per password
guess**, and because scrypt is *memory-hard*, they cannot buy their way out with GPUs or ASICs the way they
can against an iteration-only KDF: every parallel guess needs its own 32 MiB. This is the difference between a
weak password surviving a laptop and surviving a cracking rig. The parameters live inside the envelope so the
cost is a **per-vault, upgradable** decision, not a compile-time constant — the honest posture is that 100 ms
is *today's* floor, to be raised as phones get faster.

---

### §2.4 · The in-memory-only rule — decrypt transiently, sign, zeroize

At rest there is only ciphertext. The instant of risk is **while unlocked**, and the design principle is that
plaintext key material should have the **shortest possible lifetime in memory** and exist **only to sign**.

**The seed lives in a keyring, and only while unlocked.** `unlock(password)` calls `openVault`, decodes the
mnemonic into an `HDKeyring`, and then **zeroizes the decrypted secret buffer in a `finally`** — the plaintext
seed exists in `WalletManager` scope for microseconds ([`wallet-manager.ts`](../../packages/core/src/wallet/wallet-manager.ts)
`unlock`). The keyring holds `#seed` / `#mnemonic` / `#root` in **`#`-private class fields** — not reachable
from any other object — for the duration of the session.

**Private keys are derived per operation and never stored per account.** We do **not** keep a table of unlocked
private keys. `getAccount` derives only *public* keys and wipes each node's private data immediately
(`btcNode.wipePrivateData()`, `evmNode.wipePrivateData()`, `zeroize(solNode.privateKey, solNode.chainCode)`) —
the Universal Identity is returned with **no key material in it.** When a signature is actually needed, the
[SigningManager](#) (§3) calls `exportPrivateKey(chain, index)`, signs, and **zeroizes the key in a `finally`**:

```ts
#withEvmKey<T>(accountIndex: number, fn: (key: Uint8Array) => T): T {
  const key = this.#keyring.exportPrivateKey('evm', accountIndex);
  try { return fn(key); }
  finally { zeroize(key); }        // key lives for exactly one signature
}
```

No signer keeps a key past its own call — the `finally` runs even if signing throws. This is the same
lifetime discipline Rabby and other careful hot wallets apply at pre-sign; the transaction *bytes* the key
signs are decoded and shown to the user upstream (§3, §4), because the key's job is only to prove the user's
already-informed decision.

**Lock destroys everything.** `lock()` (manual, or fired by the [SessionManager](#) §7 auto-lock idle timer)
calls `keyring.destroy()`, which zeroizes `#seed`, wipes the BIP-32 root's private data, and blanks
`#mnemonic`; every subsequent method throws `KEYRING_DESTROYED`. The signer reference is dropped. After lock,
the device is back to **SEALED-AT-REST** — ciphertext only, nothing that can move funds.

**Re-authentication is a distinct primitive, and it matters.** Sensitive reveals (showing the recovery phrase)
must re-verify the password even while unlocked. We do **not** reuse `unlock` for this: `unlock` is a no-op
when the wallet is already open and would therefore accept *any* password. `verifyPassword` instead decrypts
the vault directly, zeroizes the result, and returns a boolean — it never short-circuits on the in-memory
unlock flag ([`wallet-manager.ts`](../../packages/core/src/wallet/wallet-manager.ts) `verifyPassword`).
Getting this wrong would turn the seed-reveal gate into a rubber stamp; it is called out in code precisely
because it is a subtle, security-critical distinction.

**The honest residual — we shrink the window, we do not lie about closing it.** While unlocked, the seed is in
the JavaScript heap. `zeroize` ([`bytes.ts`](../../packages/core/src/bytes.ts)) is a **best-effort**
`fill(0)`: a JS engine may have copied the bytes during GC or JIT, and that copy cannot be reached from
JavaScript. So malware with process-memory access **on an already-unlocked device** can read the seed. This is
game over for *any* hot wallet — MetaMask, Phantom, Rabby included — and [`SECURITY.md §3.3`](../../SECURITY.md)
says so plainly rather than implying a guarantee we cannot keep. Our mitigations *shrink the window*:
per-operation derivation, `finally`-zeroize, destroy-on-lock, and an auto-lock timer. Closing it further —
moving the secret into hardware that the host never sees — is the roadmap in §2.7.

---

### §2.5 · The persistence boundary — SecureStore

The seal has to be written somewhere. [`secure-store.ts`](../../packages/core/src/wallet/secure-store.ts)
defines that boundary as a tiny async interface — `get / set / delete / has` over string values — and
**what crosses it is only the opaque vault envelope** (plus non-secret metadata under `STORE_KEYS`). The store
never sees a key; it sees ciphertext that is useless without the password.

| Platform | SecureStore implementation | Status |
|---|---|---|
| Web (today) | `LocalStorageSecureStore` — sealed vault in `localStorage`; useless at rest without the password ([`apps/web/src/wallet.ts`](../../apps/web/src/wallet.ts)) | ✅ |
| Tests / ephemeral | `InMemorySecureStore` — process-memory only, never for production persistence | ✅ |
| Mobile | **iOS Keychain / Android Keystore** — a second, OS-level layer under the app-level encryption | ⏭ Phase 8 |
| Extension | OS credential store or IndexedDB + WebCrypto | ⏭ |

The async signature exists precisely so the native secure stores can slot in without an interface change. The
critical property is defense-in-depth framed honestly: **the client-side AES-256-GCM vault is the primary line
of defense** — it holds even if the store is fully readable — and the OS keystore, when it lands, is a
*second* wrapping layer, not the only one. `wipe()` deletes the vault and metadata keys; a wiped device holds
nothing recoverable, and recovery is re-import of the mnemonic (deterministic derivation restores the identical
identity — **no server involvement**, [`SECURITY.md §3.5`](../../SECURITY.md)).

---

### §2.6 · Threat model — at rest and in use

| Threat | Where it hits | Mitigation | Status |
|---|---|---|---|
| Seed theft **at rest** (stolen device/backup) | SEALED-AT-REST | scrypt (memory-hard) + AES-256-GCM; ciphertext only; per-guess 32 MiB / 100 ms cost | ✅ |
| Vault **tampering** | SEALED-AT-REST | GCM AEAD; every envelope field AAD-bound; any mutation ⇒ `VAULT_DECRYPT_FAILED` | ✅ |
| **KDF-param DoS** (hostile envelope) | `openVault` | `N/r/p` bounds enforced on open — cannot demand gigabytes | ✅ |
| **Oracle** on wrong-password vs tamper | `openVault` | Indistinguishable by design — one `VAULT_DECRYPT_FAILED` code | ✅ |
| Seed theft **in memory** (malware, unlocked) | UNLOCKED-IN-RAM | Per-op derive+zeroize; destroy-on-lock; auto-lock — **window, not zero** (honestly documented) | 🔶 |
| Key material in **logs / errors** | any | `WalletError` carries codes, never secrets; no `console` of buffers | ✅ |
| Key exfiltration **to a server** | any | `packages/core` has **zero network I/O** — no code path exists (lint+review enforced) | ✅ |
| OS-keystore wrap + biometric gate | at rest | Secure Enclave / StrongBox wrap of the vault key | ⏭ Phase 8 |
| Single-seed **single point of failure** | the whole model | MPC / threshold signing; hardware co-signing | ⏭ (§2.7) |

**Benchmark — where we stand against the best.** A Ledger or Trezor keeps the secret inside a **secure element**
and signs *in hardware*; the seed is never in host memory, so the "unlocked-device malware" row above simply
does not exist for them — that is the bar, and we do not pretend to meet it as a browser/RN hot wallet. What we
*do* match or beat among hot wallets: a **memory-hard** KDF (many hot wallets historically used iteration-only
PBKDF2, which parallelizes on GPUs far more cheaply), **full-envelope AAD binding** so metadata tampering is
caught, an **audited-primitives-only** key path (`@noble`/`@scure`, no framework in `packages/core` — a smaller
attack surface than any framework-based wallet), and a **provably network-free** core. The gap to hardware is
real, named, and the subject of §2.7 — not hidden.

---

### §2.7 · Removing the single-seed SPOF — roadmap (⏭, tagged)

Everything above protects **one seed on one device** as well as software can. The seed is still a single point
of catastrophic failure: whoever reconstructs it, from a heap dump or a shoulder-surfed backup, owns the funds.
The roadmap attacks the SPOF itself, and none of it ships today — each item is designed as a **target**, tagged
so no one mistakes it for a live control:

- **MPC / threshold signing (⏭).** Split the key across parties/devices so **no single location ever holds a
  complete private key** — signing becomes a protocol, not a decryption. This dissolves the "seed in one heap"
  residual of §2.4 rather than merely shrinking its window. It is the highest-leverage item.
- **Passkeys + secure hardware (⏭ Phase 8, ADR-0029).** Wrap the vault key in the **Secure Enclave (iOS)** /
  **StrongBox (Android)** behind a biometric gate, and use **native secure memory** for the transient key so
  zeroization is real rather than best-effort. Closes most of the in-memory residual on mobile.
- **Hardware-wallet co-signing (⏭).** Ledger/Trezor as an external signer for high-value accounts — the seed
  never enters the app process at all; the app becomes a UI over a hardware signature.
- **Air-gapped / offline signing (⏭).** Sign on a device that never touches a network; the [Offline Behavior](#)
  neighbor (§8) owns the mechanics. Complements, does not replace, the on-device rule.
- **Social / multi-device recovery (⏭).** Reduce the "forgotten password is unrecoverable by design" cliff
  ([`SECURITY.md §3.5`](../../SECURITY.md)) — always in ways that keep encrypted-only data crossing the wire,
  never a plaintext key ([Chapter 5 §14](../bible/chapter-05-universal-identity.md)).

Each of these is a *binding requirement with a landing phase*, not a claim that it runs. Until it lands, the
feature it gates does not ship — a promise honestly labelled as not-yet-kept.

---

### What §2 commits us to

- **One secret, five states, every transition audited** — the mnemonic is sealed the instant it exists, lives
  as plaintext only in RAM while unlocked, is derived to a private key for exactly one signature, and is
  zeroized in a `finally` that always runs.
- **scrypt (`N=2¹⁵`, ~32 MiB, ~100 ms) + AES-256-GCM with full-envelope AAD** — a deliberate per-guess cost and
  tamper-evidence in one AEAD, with wrong-password and tampering indistinguishable by design.
- **`packages/core` is provably network-free** — there is no code path by which a key reaches a wire, a log, or
  a server, on any branch including error paths.
- **The unlocked-device residual is named, not hidden** — best-effort zeroization shrinks the window; hardware
  and MPC (⏭) close it, and we say which is which.
- **The seal is the primary defense; the OS keystore is a second layer** — recovery is deterministic re-import
  of the mnemonic, with no server ever holding a secret.

> **The one question this section must always answer *yes* to:** *can a key or seed reach a wire, a log, an
> error message, or a server on any path — including error paths?* The answer is **no, by construction** — and
> [`SECURITY.md §13`](../../SECURITY.md) makes that a merge-blocking review gate, not a hope. → Continue to
> [§3 · Signing Engine](#), where these transient keys produce exact, chain-correct bytes.


## §3 · The Signing Engine

> **Shipped.** `packages/core/src/signing/*` + `packages/core/src/accounts/*`. This is the heart of the
> wallet: the one place a private key ever touches a message, and the last line of Doctrine #2 —
> *AI proposes, deterministic code verifies, the device signature disposes.* Everything in Chapters 7–8
> (Intent, Execution) is choreography around the single primitive defined here: **an unlocked device key,
> applied to canonical bytes, for the shortest possible instant, and never anywhere else.**

The signing engine has exactly one job and refuses every other one. It does not build transactions (that is
§4 and the chain layer), it does not choose fees, it does not decide *whether* to sign — it takes bytes that
someone else assembled, applies the user's on-device key under the rules of the target ecosystem, zeroizes
the key, and hands back a signature. The AI never reaches it; the network never sees what it holds. That
narrowness is the security property. A component that can only *refuse or sign* — never originate, never
persist, never phone home — is a component whose entire threat surface fits on one page.

---

### 3.1 · One interface, three ecosystems

Bitcoin, the EVM world, and Solana disagree about almost everything — curve (secp256k1 vs ed25519),
serialization (RLP vs PSBT vs a compiled message), what "a signature" even is (65-byte recoverable r‖s‖v vs
64-byte detached ed25519), and how many parties sign one transaction. Rather than leak that zoo into every
caller, the core exposes a **single typed surface** — `WalletSigner` in `signing/signer.ts`:

```ts
export interface WalletSigner {
  signEvmTransaction(tx: Eip1559Transaction, accountIndex?: number): SignedEvmTransaction;
  signEvmTypedData(typed: TypedData, accountIndex?: number): Uint8Array;      // EIP-712
  signEvmPersonalMessage(message: Uint8Array, accountIndex?: number): Uint8Array; // EIP-191
  signBitcoinPsbt(psbt: Uint8Array, accountIndex?: number, options?: SignPsbtOptions): SignPsbtResult;
  signSolanaTransactionMessage(message: Uint8Array, accountIndex?: number): Uint8Array;
}
```

The sole implementation is `SigningManager`, constructed over the unlocked `HDKeyring` (§1–§2). It is
deliberately thin: each method derives the right key for `accountIndex` on demand, calls the pure per-chain
signer, and **guarantees zeroization in a `finally`** — the key exists for the duration of one function call
and no longer:

```ts
#withEvmKey<T>(accountIndex: number, fn: (key: Uint8Array) => T): T {
  const key = this.#keyring.exportPrivateKey('evm', accountIndex);
  try { return fn(key); } finally { zeroize(key); }
}
```

`accountIndex` is how the Universal Identity of Chapter 5 shows up at the signing layer: one keyring, an
unbounded HD account tree, and the caller names *which* account signs without ever holding its key. The
manager is the only object the rest of the app touches — `WalletManager.getSigner()` hands it out, and it
throws `KEYRING_DESTROYED` the instant the wallet locks (§7). There is no second door.

| Surface | Curve | Digest / payload | Output | Backing signer |
|---|---|---|---|---|
| EVM transaction | secp256k1 | `keccak256(0x02 ‖ rlp(fields))` | raw tx + hash | `signEip1559Transaction` |
| EIP-712 typed data | secp256k1 | `keccak256(0x1901 ‖ domainSep ‖ hashStruct)` | 65B r‖s‖v, v∈{27,28} | `signTypedData` |
| EIP-191 personal_sign | secp256k1 | `keccak256("\x19Ethereum Signed Message:\n"+len+msg)` | 65B r‖s‖v, v∈{27,28} | `hashPersonalMessage`+`signEvmDigest` |
| Bitcoin PSBT | secp256k1 | BIP-143 sighash per input | updated PSBT (+ raw tx if final) | `signPsbt` |
| Solana message | ed25519 | the serialized message itself | 64B detached signature | `signSolanaTransactionMessage` |

---

### 3.2 · EVM — RLP, EIP-1559, EIP-712, EIP-191

**Transactions.** The shipped transaction path is **EIP-1559 (type-`0x02`)**, in `signing/evm-transaction.ts`.
The pipeline is exactly the spec: build the nine-field payload `0x02 ‖ rlp([chainId, nonce,
maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList])`, `keccak256` it, sign the
digest with secp256k1, then re-RLP with `[yParity, r, s]` appended — returning `{ raw, hash }` ready for
`eth_sendRawTransaction`. Every numeric field on `Eip1559Transaction` is a `bigint` base unit (Doctrine #4);
`bigintToMinimalBytes` enforces Ethereum's quantity rule — zero is the *empty* string, never a zero byte, and
there are never leading zeros. `r`/`s` get the same minimal treatment. The input is validated before a key is
ever derived: addresses must be 20-byte hex with a *correct* EIP-55 checksum (a wrong checksum is a
silent-corruption signal and is rejected), `maxPriorityFeePerGas ≤ maxFeePerGas`, and no negative quantities.

RLP itself (`signing/rlp.ts`) is written in-repo, not pulled from ethers/viem — a deliberate choice
(ADR-0003) to keep the crown-jewel package on a minimal, audited dependency set. It is type-agnostic: legacy
type-0 transactions are *not* a separate shipped signer today, because every chain the wallet targets accepts
1559, so we ship one canonical modern path; a legacy signer is a small addition over the same RLP core if a
future target chain ever requires it (roadmap, tagged).

**Signing the digest.** All three EVM surfaces funnel through one primitive — `signEvmDigest` in
`accounts/evm.ts`:

```ts
const sig = secp256k1.sign(digest, privateKey); // lowS: true (default) — malleability guard
```

It is **deterministic (RFC 6979)** and **low-s normalized**, returning 65 bytes `r(32) ‖ s(32) ‖
recovery(1)` with `recovery ∈ {0,1}`. That is the raw yParity form 1559 wants; the message surfaces
(`signTypedData`, `signEvmPersonalMessage`) add `27` to follow the `eth_sign`/typed-data convention, which is
why their tests assert `v ∈ {27,28}`. Low-s matters: an un-normalized ECDSA signature is malleable (two valid
`s` values per message), which has historically enabled txid-based replay confusion — normalizing closes it
by construction.

**EIP-712.** `signing/evm-typed-data.ts` implements the typed-data standard from the spec — recursive
`encodeType`/`hashStruct`, the implicit `EIP712Domain` built from whichever domain fields are present, and
correct encoding of the awkward cases (fixed `bytesN` right-padded, dynamic `bytes`/`string` hashed, arrays
hashed over concatenated elements, negative ints in two's-complement). This is the surface that makes *signed
intents*, permits, and dApp logins possible without a transaction. Digest =
`keccak256(0x19 0x01 ‖ domainSeparator ‖ hashStruct(primaryType, message))`.

**EIP-191.** `signEvmPersonalMessage` prefixes `"\x19Ethereum Signed Message:\n" + length` and signs the
keccak — and refuses an empty message outright (`INVALID_INPUT`), because "sign nothing" is never a
legitimate request.

---

### 3.3 · Bitcoin — PSBT, multi-party by construction

Bitcoin signing lives in `signing/bitcoin-psbt.ts`, backed by the audited `@scure/btc-signer` (same `@scure`
family as the rest of core, ADR-0003). Core does **not** build fee/UTXO logic here — that is the chain
layer's job; core receives a **PSBT (BIP-174)** and does exactly and only one thing: apply the user's key to
the inputs it owns. `signPsbt` signs every matching input, and — because a PSBT is inherently a multi-party,
multi-input artifact — a key that owns *none* of the inputs is a valid **no-op**, not an error: it returns the
PSBT unchanged with `signedInputs: 0`. Only when every input is signed (`allInputsSigned`) does it finalize
and `extract()` the broadcastable raw transaction, returning `txHex` + `txid`; otherwise it returns the
still-partial PSBT for the next signer. `finalize: false` lets a caller sign-and-hold for a later
co-signer. Malformed PSBTs and wrong-size keys fail closed with `INVALID_INPUT`.

This shape is what makes settlement-safe sequencing (§4, Ch8) and future co-signing / collaborative custody
possible without re-architecting the signer — the primitive is already "sign what's mine, pass the rest
along."

---

### 3.4 · Solana — sign the message, nothing more

Solana's model is the simplest and `signing/solana-transaction.ts` keeps it that way. A Solana transaction is
authorized by an **ed25519 signature over the serialized message** (the compiled instructions + recent
blockhash). The chain layer (`@solana/kit`) compiles the message and assembles the final transaction; core
signs the bytes and returns the 64-byte signature to drop into the transaction's signature array. It refuses
an empty message and enforces a 32-byte key — the same fail-closed discipline as every other surface. This is
the identical **"chains build, core signs"** split used everywhere: the signer never learns Solana's
transaction format, only how to produce an ed25519 signature over bytes.

---

### 3.5 · The conformance guarantee — correctness is demonstrated, not asserted

A signer is either bit-exact or it is a fund-loss bug; "looks right" is not a standard. So every serializer
and every derivation path is pinned two ways — **official known-answer vectors** where a standard publishes
them, and a **differential oracle** against an independent, widely-used implementation (a dev-only
dependency, never shipped) for everything else. If our from-scratch encoders agree with the reference on the
serialized bytes and the digest, they are correct.

| Layer | Conformance method | Test |
|---|---|---|
| SLIP-0010 (ed25519 HD) | **Official satoshilabs vectors** (2 seeds × 6 paths) + property cross-check vs `ed25519-hd-key`, 50 runs | `test/slip10.test.ts` |
| RLP | Canonical spec examples (`"dog"`→`0x83646f67`, empty/list, quantity rules) | `test/evm-transaction.test.ts` |
| EIP-1559 tx | Unsigned serialization **byte-identical to viem** `serializeTransaction`; property test, 30 runs; signed tx recovers to signer via viem `recoverTransactionAddress` | `test/evm-transaction.test.ts` |
| EIP-712 | `encodeType` matches the spec string; `hashTypedData` matches viem on the canonical *Mail* example, arrays, nested structs, `bytesN`, dynamic bytes, negative `int256` | `test/evm-transaction.test.ts`, `test/signing-edge.test.ts` |
| Bitcoin PSBT | Real P2WPKH spend derived from the HD keyring finalizes to a stable, deterministic `txid`; no-op when the key owns no inputs; rejects malformed | `test/bitcoin-psbt.test.ts` |
| Solana | 64-byte signature verifies against the account key; deterministic; rejects empty/wrong-size | `test/solana-transaction.test.ts` |

BIP-39/32/44/84 conformance (mnemonic → seed → the three receive addresses) is covered by the identity layer
of Chapter 5 and its own known-answer tests; the signing engine consumes those keys and adds the
transaction-level vectors above. The union is a chain from *wordlist to broadcast bytes* where no link is
merely assumed.

---

### 3.6 · The strict boundary — where the key lives, and for how long

This is the section the Principal Security Engineer signs. Three invariants, each enforced in code, not by
convention:

**1 · The AI has no signing authority.** No LLM call path can reach `SigningManager`. The AI produces a plan
(Ch7); a pure, exhaustively-tested gate verifies it; and only then does a *human* unlock and a *device* sign.
The signer's API cannot originate a transaction — it can only apply a key to bytes the deterministic layer
already validated. The AI's worst case is proposing bytes the gate rejects.

**2 · Only an unlocked device key signs, and only on this device.** `packages/core` has **zero network I/O**
(an enforced package boundary — `index.ts`). The key material is derived from a seed that exists in memory
*only while unlocked*, and only after a **deliberate scrypt unlock** — `N=2^15, r=8, p=1` ≈ 32 MiB, ~100 ms
on current phones (§2). That cost is a feature: it rate-limits offline password guessing against a stolen
vault. On lock — manual or the 5-minute idle auto-lock (§7) — `HDKeyring.destroy()` zeroizes the seed and
every subsequent call throws `KEYRING_DESTROYED`.

**3 · A key's lifetime is one function call.** No signing method retains key material past its own stack
frame. The lifecycle of every signature:

```
   unlocked keyring (seed in memory, post-scrypt)
                │  exportPrivateKey(chain, accountIndex)   ← derive on demand
                ▼
        ┌───────────────┐   sign(digest / psbt / message)
        │  key: Uint8Array ──────────────────────────────►  signature
        └───────────────┘
                │  finally { zeroize(key) }                ← always runs
                ▼
        key buffer filled with 0x00   (never persisted, never transmitted)
```

The `try { … } finally { zeroize(key) }` pattern is uniform across `SigningManager` and `HDKeyring` — the
derived key is wiped whether the sign succeeds *or throws*. We are honest about the limit (documented in
`bytes.ts`, not hidden): JavaScript cannot guarantee the GC/JIT did not copy the bytes, so `zeroize` is
best-effort — it *shrinks* the heap-dump recovery window rather than eliminating it. Native secure memory
(iOS Secure Enclave / Android StrongBox) and hardware-backed keys are the roadmap answer, tagged as such —
**not claimed as shipped.** Against that benchmark: a Ledger/Trezor never exposes the key to application
memory at all because it signs inside a secure element; our shipped software signer is one deliberate tier
below that, and closing the gap (secure-enclave-resident keys, hardware-wallet cosigning, MPC, passkeys,
air-gapped/offline signing) is the explicit roadmap for §2's key-management architecture — none of it ships
today, and this document says so plainly (Doctrine #3).

---

### 3.7 · How the intent & execution engines call in — without ever seeing a key

Chapters 7–8 orchestrate multi-step, multi-chain flows (bridge → swap → send), and they do it **without ever
holding key material.** The seam is `StepDriver.broadcast` (`packages/execution/src/driver.ts`), whose
contract is a single sentence — *build → device-sign → broadcast → return the txid*. Its own doc comment
states the cardinal rule: *"the driver SIGNS ON THE DEVICE and the engine NEVER sees a key — the non-custodial
invariant holds through execution."* The `ExecutionEngine` owns ordering, retries, recovery, and parking; it
receives only a `txid` back. Crucially, signing sits **behind the Execution Sandbox**: the engine runs
`driver.simulate` first and, if the simulated effects don't match the plan, the step is **never broadcast** —
so a key is applied only to bytes that already passed a pre-broadcast simulation (a discipline in the spirit
of Rabby's pre-sign checks, made a hard gate rather than a UI hint; see §4/§8).

Concretely, the shipped web driver (`apps/web/src/broadcast.ts`) calls `signEvmTransaction(tx)` /
`signBitcoinPsbt(psbt)` — each annotated *"in-browser, with the user's key"* — then broadcasts the raw bytes
through the chain adapter. The engine above it, the API behind it, and the AI beside it all pass around
*plans, digests, and txids*. The one place a key meets a message is `SigningManager`, on the device, for one
call, and then it is zero. That is the whole engine, and it is the whole point.

> **§3 exit criteria (Design Review Gate).** One typed `WalletSigner` surface; EVM (1559 tx + EIP-712 +
> EIP-191), Bitcoin PSBT, and Solana ed25519 all shipped and conformance-pinned to official vectors and a
> differential oracle; money is `bigint` end-to-end with no float in the signing path; keys derived on
> demand, zeroized in `finally`, never networked; the AI holds no signing authority and the execution engine
> never sees a key; and every roadmap tier (secure enclave, hardware, MPC, passkeys, air-gapped) is labelled
> roadmap, not shipped. **Next:** §4 · The Transaction Builder — how the bytes this engine signs get
> assembled and simulated.


## §4 · The Transaction Builder

> *Where an intent becomes exact bytes. The Signing Engine (§3) knows how to turn a digest into a
> signature; the Transaction Builder decides **which digest**, and stakes the wallet's honesty on getting
> the last field right — because on-chain, a transaction that is 99% correct is 100% wrong.*

The builder is the deterministic core that sits between "the user approved a plan" and "the device
produces a signature." Its job is narrow and unforgiving: assemble the **minimal, canonical, unsigned**
transaction that a specific chain's node will accept, prove it safe, and hand the exact signing payload to
§3. It holds no keys and moves no funds — like the broadcast guard, its only powers are to **build
correctly** or to **refuse**. Everything downstream (the on-device signature, the broadcast, the
confirmation) is only ever as trustworthy as the bytes this layer produced. A wrong recipient, a stale
nonce, a fee field off by a factor of ten, an amount that lost precision through a float — each is
irreversible the moment the signature lands.

Two rules from the Doctrine govern the whole section and are repeated nowhere by accident: **money is
integer bigint end-to-end** (#4), and the pipeline **fails closed** (#5). We build in base units, we
guard before we sign, and anything we cannot positively verify we do not broadcast.

---

### 4.1 · The unsigned → signed → broadcast → confirmed lifecycle

Every transaction, on every chain, walks the same seven-state machine. What differs per chain is only how
a state's work is *done*; the states, the order, and the **guard on each edge** are universal. This is the
spine the execution engine (`packages/execution/src/engine.ts`) drives for multi-step plans, and that
`apps/web/src/broadcast.ts` drives inline for a single manual send.

| State | Meaning | Guard on the edge **into** the next state |
|---|---|---|
| `DRAFT` | An approved intent step: `{asset, amountBase, to, chain}` in base units. | Amount is a positive bigint; asset is executable on a wired network (`isExecutableAsset`). |
| `BUILT` | Freshly-fetched chain context (nonce / UTXOs / blockhash + live fees) assembled into an unsigned tx. | Every numeric field is a non-negative bigint; `maxPriorityFeePerGas ≤ maxFeePerGas`; UTXO set covers `amount + fee`. |
| `GUARDED` | `assertBroadcastAllowed` has passed. | **Fail-closed:** known chain, well-formed (EIP-55-valid, if mixed-case) recipient, and — on mainnet — an explicit `acknowledgeMainnet` (+ high-value ack above the $1,000 cap). |
| `SIMULATED` | Pre-broadcast dry-run succeeded. | EVM: `eth_call` / `eth_estimateGas` did not revert. Multi-step: the sandbox's predicted effects match the plan (else the step is **never** broadcast). |
| `SIGNED` | The device produced a signature over the exact payload (§3). | Signing happens on-device only; the builder never sees the key. The payload signed is byte-identical to the one guarded. |
| `BROADCAST` | The node accepted the raw bytes and returned a `txid`. | The node's own acceptance (a rejected tx — "insufficient funds", "nonce too low" — surfaces its real error, never a fake success). |
| `CONFIRMING → CONFIRMED` | Receipt polled; on-chain status verified; post-invariants checked. | A `0x0` / reverted receipt throws; a "confirmed but wrong" outcome (e.g. `received < minReceived`) **parks** rather than reports success. |

Two terminal branches leave this machine and are first-class, never swept under "error": `REVERTED`
(included on-chain but failed) and `PARKED` (stopped safely with the funds' exact location recorded — the
§8 park guarantee). The single most important property of the whole diagram is that **the guard runs
before the signature, and the signature runs before the wire.** Rabby popularised showing the user a
pre-sign simulation; we make that simulation a *gate*, not a courtesy — a mismatched simulation is a hard
stop that the bytes never survive.

---

### 4.2 · Money is bigint, base units, end-to-end

There is exactly one place a decimal ever exists in the money path: the human edge. A user types `0.021`;
the builder immediately converts it to an integer number of base units and never converts back until it
renders a receipt. The conversion functions are total and float-free — they split on the decimal point and
do integer arithmetic on the fractional string:

- `parseEther` → wei (`× 10^18`), `parseLamports` → lamports (`× 10^9`), `parseSats` → satoshis
  (`× 10^8`), and the generic `decimalToBase(input, decimals)` for any token.
- The inverse, `baseToDecimal`, exists **only** for display and is applied at the very last moment.

Below that edge, `amountBase` is a bigint (or its exact decimal-string encoding when it must cross a JSON
boundary), gas is a bigint, fees are bigints, UTXO values are bigints, lamports are `u64` little-endian
bigints. `Number` never touches a value that funds depend on. This is why `sendErc20Transfer` and
`executeTransferStep` thread `amountBase` untouched from the planner all the way to the ABI encoder: the
planner already did the decimals math once, correctly, and re-parsing would only invite rounding. The one
grep that must always return zero over the money path is `parseFloat` / `Number(` on an amount — and it
does.

---

### 4.3 · Per-chain construction

The build/sign split is identical on all three ecosystems: **chains build, core signs.** The builder
produces the unsigned artifact; §3 applies the key. What follows is what "build" means on each chain, and
where each freshness dependency comes from.

#### EVM — nonce, EIP-1559 fees, gas, RLP

An EVM transaction is a type-`0x02` (EIP-1559) envelope. The builder assembles the nine fields of
`Eip1559Transaction` (`packages/core/src/signing/evm-transaction.ts`) and hands them to §3, which
RLP-encodes `0x02 ‖ rlp([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data,
accessList])`, keccak-256s it, and signs with low-s secp256k1. The builder's responsibility is the three
live inputs:

- **Nonce.** `EvmAdapter.getNonce` reads `eth_getTransactionCount(address, 'pending')` — the *pending*
  tag, deliberately, so a second send while a first is still in the mempool gets `n+1`, not a colliding
  `n`. (This is also the hook that stuck-tx recovery exploits; see §4.4.)
- **Fee fields.** `estimateFees` pulls a 5-block `eth_feeHistory`, takes the reward percentile for the
  requested speed (`slow`/`normal`/`fast` → 20/50/80), floors the tip at **1 gwei** so a tx never proposes
  a zero priority fee and stalls, and sets `maxFeePerGas = baseFee × 2 + tip` — roughly two base-fee bumps
  of headroom. These are two independent bigint fields, never a single legacy `gasPrice`.
- **Gas limit.** A native transfer is the protocol constant `21_000n` — no estimation needed, no room to
  be wrong. A contract call (`transfer`, `approve`, a swap) is `eth_estimateGas` **× 1.2** for headroom,
  with a conservative literal fallback (100k for an ERC-20 transfer, 60k for an approve, 300k for a swap)
  when the call can't be simulated on an under-funded account — and then the node is the final arbiter.

The calldata itself is built by dependency-free ABI encoders (`packages/chains/src/evm/abi.ts`):
`encodeErc20Transfer(to, amount)` is `0xa9059cbb ‖ pad32(to) ‖ pad32(amount)`, and refuses to encode a
malformed address or a negative `uint256`. `chainId` is the *first* signed field, which is what gives us
EIP-155 replay protection for free: a Sepolia-signed tx cannot be replayed on mainnet because its chainId
is baked into the digest. *(Shipped honesty: the `accessList` field is fully supported by the encoder but
the current send paths always emit an empty list; access-list optimisation is a roadmap item, not a
claimed feature.)*

#### Bitcoin — UTXO selection, fee rate, PSBT, change

Bitcoin has no nonce and no account balance — it has coins. `buildBtcTransfer`
(`packages/chains/src/bitcoin/transaction.ts`) is pure and does the coin arithmetic: it takes the sender's
33-byte compressed public key and its live UTXO set, wraps each output as a P2WPKH (native SegWit) input,
and calls `@scure/btc-signer`'s `selectUTXO` in `default` (largest-first) mode with `feePerByte` in
sat/vByte. It computes the fee for the selected input count, sends the recipient output, and returns
**change to the sender's own P2WPKH address**. Outputs are **BIP-69 ordered**, so the same spend is
byte-deterministic. If the UTXO set cannot cover `amount + fee` it throws `INSUFFICIENT_FUNDS` — it never
silently under-pays or drops the change. The output is an **unsigned PSBT** (BIP-174); §3's `signPsbt`
applies the key to the inputs it owns, finalizes, and extracts the broadcastable raw hex and `txid`. The
fee rate itself is live, from `BitcoinAdapter.estimateFees`, with a caller override for RBF/priority.

#### Solana — recent blockhash, instructions, message

A Solana transaction is an ed25519 signature over a **serialized legacy message**.
`buildSolTransferMessage` (`packages/chains/src/solana/transaction.ts`) compiles the message byte-exactly
to the on-chain spec: the account keys as a deduplicated, privilege-ordered set (signer+writable, then
writable, then readonly `SystemProgram`), the `[1,0,1]` header, short-vec (compact-u16) length prefixes,
and a SystemProgram `Transfer` instruction (`u32` tag `2` + `u64`-LE lamports). It collapses the
self-transfer case so a key never appears twice (which the node rejects). The **recent blockhash** comes
from `getLatestBlockhash({commitment:'finalized'})` at build time and is the transaction's freshness *and*
its replay/dedup token. `assembleSolTransaction` prepends the single signature to produce the base64 wire
transaction. SPL token transfers (`buildSplTransferMessage`) additionally build an *idempotent* recipient
ATA-creation instruction plus a checked transfer, so sending to a never-before-seen token account is one
atomic message.

*(Roadmap, tagged honestly: today's SOL/SPL messages ride the network's **default** compute limits and pay
no priority fee — there is no explicit `ComputeBudget` instruction yet. A compute-unit-limit + unit-price
instruction pair is the planned upgrade for priority-fee control under congestion; it is not shipped, and
this section does not claim it is.)*

---

### 4.4 · Freshness, idempotency, and replay safety

Every "build" fetches its freshness inputs *fresh* — there is no cached nonce, no cached UTXO set, no
cached blockhash carried across a user's deliberation. That is the point: the window between build and
broadcast is short and the inputs are current when signed.

| Chain | Freshness input | Validity window | Replay / double-spend defense |
|---|---|---|---|
| EVM | `pending` nonce + `feeHistory` | Until a same-nonce tx mines | EIP-155 chainId in the signed digest; nonce is single-use per account |
| Bitcoin | Live UTXO set + fee rate | Until an input is spent elsewhere | UTXOs are single-spend by consensus; a double-spent input is simply rejected |
| Solana | `finalized` blockhash | ~150 slots (~60–90 s) | Blockhash is the dedup key; an expired hash is rejected, never silently re-run |

The failure mode this design guards against is the **stale re-send** — the user builds, walks away, and
signs a transaction whose context has moved. On EVM the symptom is a stuck (underpriced) transaction, and
the builder ships the standard recovery: `checkStuckTx` compares the `latest` mined nonce against the
`pending` nonce and, if they diverge, `cancelStuckTx` rebuilds a **0-ETH self-send at the same nonce with
a 2× fee** so it outbids and replaces the stuck one. Because the nonce is the same, this is a *replacement*,
not a second spend — idempotent by construction. On Solana an expired blockhash cannot be replayed at all,
so the safe move is to rebuild; on Bitcoin a UTXO consumed elsewhere makes the build fail closed with
`INSUFFICIENT_FUNDS`. In no case can a re-submission double-spend.

---

### 4.5 · Settlement-safe sequencing

A single transfer is one step. A **swap** is a settlement problem: the router can only pull your token
after an ERC-20 `approve`, and if the swap is mined *before* the approval confirms, it reverts — while a
naïve UI cheerfully reports success. `sendSwap` (`apps/web/src/broadcast.ts`) is written to make that
race impossible, in four ordered stages, each a guard on the next:

1. **Read, then approve only if short.** Read the live allowance to the router; issue an `approve(router,
   amountIn)` *only* if the current allowance is below `amountIn`. No blanket infinite approvals.
2. **Wait for the approval receipt.** `waitForReceipt` polls `eth_getTransactionReceipt` (up to ~90 s) and
   **throws** on a revert (`status 0x0`) or timeout. The swap is not built, signed, or broadcast until the
   router can actually pull the token.
3. **Preflight the swap.** `eth_call` the swap against `latest` state; a guaranteed revert (slippage floor
   too high, no liquidity) fails here **cheaply**, before a signature and before gas is spent on-chain.
4. **Sign + broadcast** the swap, at `approveNonce + 1`.

For multi-step intents the same discipline is generalised by the execution engine: per step it runs
**simulate (sandbox) → broadcast (device-signed) → confirm → verify**, advances the recorded funds
location only on a confirmed step, retries transient failures idempotently up to a cap, and **parks** —
never strands — on an unrecoverable one. A `swap → bridge → deposit` plan therefore never signs step *n+1*
until step *n* is confirmed *and* its post-invariant holds. This is the "settlement-safe sequencing" the
Doctrine's "deterministic code verifies" clause demands, made concrete: the builder produces bytes, the
guard and sandbox decide whether those bytes may proceed, and only then does the device dispose.

---

### 4.6 · Confirmation, verification, and performance

Broadcast returns a `txid`; it does not return truth. `EvmAdapter.getTransactionStatus` polls the receipt
and reports `confirmed` only on `status === '0x1'`, `failed` on `0x0`, and `pending` until a receipt
exists — computing confirmations against the live head. The execution engine adds a post-broadcast
**verify** step (e.g. `received ≥ minReceived`): a transaction that confirmed but did not deliver what the
plan promised is treated as a fault and parked, never as a win. This is the same honesty rule as §5's
balance engine — a bad outcome is a distinct state, never dressed up as success.

On cost: the build path is dominated by **network round-trips, not computation**, and those are
parallelised — nonce and fee history are fetched with a single `Promise.all`, as are UTXOs and fee rate on
Bitcoin. The deterministic work (RLP + keccak on EVM, message serialization + short-vec on Solana, PSBT
assembly on Bitcoin) is sub-millisecond to low-single-digit-millisecond in the browser via the audited
@noble/@scure primitives. Critically, **the transaction path pays no scrypt cost**: the deliberate
~2^15-iteration KDF is spent once at *unlock* (§2), so the vault is already open and each subsequent build
+ sign is cheap. The only intentionally *slow* waits are the confirmation polls (2 s cadence, ~90 s bound)
and, for swaps, the approval-receipt wait — both correctness features, not latency bugs. Benchmarked
against the field: we match Rabby's pre-sign simulation but promote it to a hard gate; we mirror
Ledger/Trezor "clear-signing" by refusing to sign anything the user (and the deterministic guard) cannot
positively verify; and we manage nonces with the `pending`-tag discipline exchange-grade senders use to
avoid gaps and collisions.

---

### 4.7 · Shipped vs roadmap

| Capability | Status |
|---|---|
| EVM native + ERC-20 (USDC) transfers on Sepolia — nonce, EIP-1559, gas, RLP, real broadcast | **Shipped** (`broadcast.ts`, `evm-transaction.ts`) |
| Uniswap v3 swap with settlement-safe approve→confirm→swap sequencing | **Shipped** (`sendSwap`) |
| Solana devnet SOL + SPL transfers (blockhash, legacy message, idempotent ATA) | **Shipped** (`solana/transaction.ts`, `spl.ts`) |
| Bitcoin testnet native P2WPKH (UTXO selection, fee, change, PSBT) | **Shipped** (`bitcoin/transaction.ts`) |
| Guarded mainnet **ETH native** (explicit ack + $1,000 spend cap) | **Shipped, gated** (`guard.ts`) |
| Stuck-tx cancel/replace (same-nonce, 2× fee) | **Shipped** (`cancelStuckTx`) |
| Mainnet ERC-20 / SOL / BTC (verified token maps + mainnet RPC paths) | **Roadmap** — refused honestly today, never faked |
| Solana `ComputeBudget` priority-fee instructions; EVM access-list optimisation | **Roadmap** — encoder-ready, not emitted |
| Air-gapped / offline PSBT signing; MPC / hardware co-signers | **Roadmap** (see §2, §8) |

The through-line: the builder is honest about the exact instant a mistake becomes irreversible, and it
puts a deterministic guard immediately before that instant every time. It builds in integers, it fetches
freshness fresh, it sequences settlement so nothing signs on a promise, and it refuses — loudly, in the
node's own words — before it ever lies. Next, **§5 · The Balance Engine** describes how the wallet reads
the world these transactions change, with the same four-state honesty.


## §5 · The Balance Engine

> **Mission:** know what the user owns — *honestly*. Every figure on every screen traces to a real
> on-chain read or is labelled as absent. A network failure is a distinct state, never the number `$0`
> (Doctrine #3). Money is integer bigint from the RPC wire to the display edge (Doctrine #4). Anything a
> read cannot positively confirm is shown as "—", not invented (Doctrine #5).

The Balance Engine answers one deceptively simple question — *how much do I have?* — for a wallet that owns
one identity across three ecosystems (Chapter 5) and up to seven EVM networks under a single address. The
difficulty is not arithmetic; it is **honesty under partial failure**. Six independent RPC endpoints, a
price feed, and a UTXO indexer all fail differently, at different times, for different chains. A lesser
wallet collapses that uncertainty into a confident round number. We refuse to. This section specifies the
read model, the money math, the four-state honesty contract, aggregation to one net worth, and the
staleness discipline — all grounded in shipped code.

---

### 5.1 Two paths, one doctrine

There are two balance implementations in the tree today, deliberately, because they serve different callers
under the same law:

1. **The pure aggregation engine — `@intent-wallet/portfolio`** (`packages/portfolio/src`). A dependency-free,
   exhaustively-tested core that takes `PortfolioBalance[]` + `PriceInfo` and returns one `UnifiedPortfolio`:
   a single net-worth figure in micro-USD, an asset list merged across chains with per-chain provenance,
   dust folded away, and a `stale` flag. It touches no network — data arrives through the injected
   `BalanceSource` / `PriceSource` interfaces (`source.ts`), which is what makes it fixture-testable and
   cache-pluggable. This is the engine the API/intelligence path drives.
2. **The in-browser live read — `apps/web/src/balances.ts`.** The **non-custodial** path the user actually
   sees: `fetchLiveBalances()` reads native balances straight from public/keyed RPCs *in the browser*, for
   the unlocked wallet's own addresses, with **no server in the loop** (Doctrine #1). It produces the
   headline "net worth" and the per-asset cards in `LiveBalancesPanel` (`App.tsx`).

Both obey the same contract below. The split is honest: the pure engine is the general, token-aware
aggregator; the browser path is the shipped, native-asset, server-free reality. Folding ERC-20/SPL token
balances into the browser *headline* net worth (the aggregation engine already does this) is a wiring task,
not a new capability — tagged **§6 Sync**.

---

### 5.2 The read model — the adapter registry is the only door

No balance code constructs a transport. Every chain read goes through the **`AdapterRegistry`**
(`packages/chains/src/adapter-registry.ts`, ADR-0031): given a `ChainId`, it returns the memoized
`BlockchainAdapter` for that chain, wired with a `ProviderPool` (EVM/Solana JSON-RPC, with priority-order
failover + cooldown) or an esplora `HttpRestTransport` (Bitcoin). Endpoints resolve injected keyed URLs
first, then the registry's public defaults — so a keyless first-time user still reads real balances, and an
operator's private nodes slot in without a code change.

The adapter exposes exactly two balance reads (`adapter.ts`):

```
getNativeBalance(address): Promise<bigint>
getTokenBalances(address, tokens: TokenRef[]): Promise<AssetBalance[]>
```

Both return **base units as bigint** — never a float, never a display string. Each ecosystem satisfies the
interface with its own truth:

| Chain | Native read | Token read |
|---|---|---|
| **EVM** | `eth_getBalance(addr,'latest')`, hex → bigint (`decodeUint`) | per-token `balanceOf(addr)` (selector `70a08231`); each call `.catch(() => null)` and filtered — **one bad token never sinks the batch** |
| **Solana** | `getBalance` → lamports bigint | a single `getTokenAccountsByOwner(SPL_TOKEN_PROGRAM, jsonParsed)` fetches **all** SPL accounts at once; unheld mints are simply absent (a zero is an omission, not a lie) |
| **Bitcoin** | esplora `/address/{addr}` → `funded_txo_sum − spent_txo_sum` (satoshi bigint, UTXO model) | none — Bitcoin has no tokens; returns `[]` for interface uniformity |

The browser path (`balances.ts`) fans these out with `Promise.all` — ETH + SOL + BTC native balances on
**both** mainnet and their respective testnets (Sepolia / devnet / BTC-testnet), plus the price feed, all
concurrently — then divides base units by `1e18 / 1e9 / 1e8` *only at the display boundary* for the amount
label. The internal money math never sees that float.

---

### 5.3 The four-state honesty model — the heart of the engine

This is the section's reason to exist. A single (address, chain, asset) balance read is a **state machine
with four terminal states**, and the UI renders each one distinctly. There is no fifth state that quietly
means "$0."

```
                 unlock / refresh
      IDLE ──────────────────────────► READING
                                          │
        RPC ok, amount > 0  ┌─────────────┼─────────────┐  RPC error / timeout
                            ▼             ▼             ▼
                     ① REAL VALUE   ② GENUINE ZERO   ④ UNREAD (network fail)
                     amount:bigint   amount === 0n    amount === null
                      → "$X.XX"        → "0"            → "—", NEVER "$0"

   Portfolio level: some legs ①/② AND some leg ④  →  ③ PARTIAL
                    (headline sums only what was read; failed legs stay "—")
```

The guard on every transition is the same: **a value is rendered as money only if it was positively read.**

- **① Real value.** A confirmed non-zero on-chain balance. Priced → shown as a USD figure.
- **② Genuine on-chain zero.** `amount === 0n`. This is *knowledge* — we read the chain and it holds
  nothing — and is shown as `0`, cleanly distinct from failure. In the pure engine, zero *positions* are
  dropped from the asset list (`if (amount === 0n) continue`), because "you don't own it" is not a line
  item; in the per-asset card, `fmtAmount(0) === '0'`.
- **③ Partial read.** Some chains answered, some did not. The headline **sums only the legs that were read
  and priced**; each unread leg renders "—" in place. We never backfill a missing leg with zero to make the
  total look complete.
- **④ Network failure — never $0.** The load-bearing state. In `balances.ts`, every read is wrapped in
  `nullable(p) = p.then(n => n, () => null)`, so a thrown/timed-out RPC becomes `NetBalance.amount = null`,
  which `fmtAmount(null)` renders as "—". In the panel, `netWorth == null` yields a loading skeleton while
  in-flight and a plain "—" otherwise — **`$0` is unreachable from a failed read.** The recovery copy is
  explicit and calming: *"Couldn't reach the balance service just now… Your funds are safe — try Refresh."*
  (`UniversalBalancesModal`).

This is the same four-state contract shipped on mobile Home and Portfolio (memory: *balances fail-soft
honesty*, *Portfolio honesty fix — network-fail ≠ $0*). Contrast the industry default: most wallets show a
skeleton, then a number, with no third thing — a failed indexer read is indistinguishable from an empty
account. Ours are different states with different pixels.

---

### 5.4 Pricing — an unpriced asset is not a zero-value asset

Value is a *second, independent* honesty axis, and it fails independently of the balance read.

- **Money is micro-USD bigint.** `money.ts` defines `MICRO = 1_000_000n`. Prices arrive as decimal strings
  ("2100.55") and go through `usdToMicros` — regex-validated, split on the decimal, padded to 6 places,
  assembled as `BigInt(whole) * MICRO + BigInt(frac)`. Value is exact integer math:
  `assetValueMicros(amount, decimals, priceMicros) = amount * priceMicros / 10n ** BigInt(decimals)`. No
  float touches a balance. `formatUsd` is the *only* float-free-to-string step, and it lives at the very
  display edge.
- **Unpriced ≠ $0.** When no price exists for an asset, `aggregatePortfolio` sets `valueMicros = 0n` **and**
  `priceUsd = null`, and the asset is still listed (as dust — see below). It is never silently valued at
  zero and never dropped for lack of a quote. Test: *"handles unpriced assets (value 0, still listed)."*
- **The price feed fails soft, per asset.** `fetchPrices()` (CoinGecko, CORS-enabled, keyless) returns
  `{ ETH, SOL, BTC } → number | null`; any failure yields all-null. The headline only exists if *some*
  price is available (`anyPrice`); if the whole feed is down, `totalUsd = null` → the net worth shows "—",
  not "$0" — a network failure on the *price* axis is treated exactly like one on the *balance* axis.
- **The dust threshold.** `DEFAULT_DUST = 1_000_000n` (**$1**). Assets valued strictly below it are split
  into `UnifiedPortfolio.dust` and folded out of the headline list, so a first-timer's screen shows the
  three things they own, not forty airdropped spam tokens. Dust is *hidden, not deleted* — it remains in the
  structure, expandable. (Unpriced assets, valued 0, sort into dust by construction.)

---

### 5.5 Aggregation — one number, chains invisible

`aggregatePortfolio` (`aggregate.ts`) is the pure realization of Chapter 5's "chains are invisible" promise:

1. **Group** balances by asset key. The MVP key is the uppercased symbol; a canonical asset registry
   mapping `(chain, address) → assetId` (so two tokens sharing a symbol can't collide) is a documented
   follow-up — the function already accepts an `assetKey` override so that registry plugs in with **no API
   change**. *(Roadmap-tagged.)*
2. **Merge across chains, exactly.** Amounts are summed after normalizing to the group's *maximum* decimals
   via `scaleAmount` (scale-up only, pure bigint) — so 1.0 at 6 decimals + 0.5 at 8 decimals = `150_000_000n`
   at 8 decimals, with **no float error** (test: *"merges assets with differing decimals by normalizing up"*).
   Per-chain provenance is preserved in `chains: ChainHolding[]` for the expand view — the user sees one ETH
   line, taps it, and sees Ethereum + Base underneath.
3. **Value + sort.** Each asset gets `valueMicros`; the list sorts by value desc with a symbol tiebreak for
   stable ordering of equal/unpriced assets. `totalValueMicros` is the integer sum across every asset.
4. **Defensive floors.** Negative holdings are dropped (`amount < 0n → continue`), zero positions are
   dropped, empty input yields an all-zero portfolio — each with a test.

The result is one `UnifiedPortfolio { totalValueMicros, assets, dust, stale }`. The **per-account /
per-chain breakdown** is inherent: the browser path keys its refetch on `${isUnlocked()}:${activeAccountIndex()}`
(`useWalletKey`), so switching HD accounts re-reads for the newly-selected wallet's addresses; the pure
engine's `ChainHolding[]` carries the per-chain split for any account.

**The insights honesty guard.** The server-side intelligence portfolio (`/v1/portfolio/insights`) is
computed for the signed-in *principal* — but this is a non-custodial wallet whose real holdings live only on
the device and never reach the server, so that figure can be a demo portfolio, not *this* wallet.
`InsightsPanel` therefore fetches both the server figure **and** the real on-chain net worth, and renders
the analytics only if the two **agree** within `max(1, realUsd * 0.02)`; otherwise it returns `null`.
Doctrine #3 made mechanical: never present a borrowed number as the user's.

---

### 5.6 Caching, staleness, and freshness labelling

Stale data is **labelled, never hidden** (Doctrine #3). The type system carries this end to end:
`PriceInfo` has `stale?: boolean` and `asOf?: string` (ISO-8601); `aggregatePortfolio` propagates any stale
input up to `UnifiedAsset.stale` and `UnifiedPortfolio.stale` (test: *"propagates staleness from prices"*);
the UI renders a "some data stale" chip (`ins-stale`) rather than dropping to a spinner or, worse, showing a
confidently wrong number. A stale quote is still *shown* — an old price is more useful than a blank, as long
as its age is honest.

What is shipped vs. targeted, precisely:

| Capability | Status |
|---|---|
| Four-state read + render (value / zero / partial / fail) | **Shipped** — `balances.ts`, `App.tsx`, mobile Home + Portfolio |
| Bigint micro-USD math, dust, unpriced-≠-$0, stale propagation | **Shipped** — `packages/portfolio`, 9 aggregation + money tests |
| Per-chain merge with provenance, per-account refetch | **Shipped** — `aggregate.ts`, `useWalletKey` |
| Live pull-on-view (refresh button, parallel fan-out) | **Shipped** — `fetchLiveBalances()` |
| Persistent cross-session cache with TTL + `asOf` badging | **Partial** — the `stale`/`asOf` seams exist in the core; the browser path reads live each open |
| Push/WebSocket balance streaming, dedicated indexer, background sync | **Roadmap** — specified in **§6 Multi-Chain Sync & Background Indexing** |

Today's model is **honest pull**: read live on unlock, account-switch, and explicit refresh. Exchange-grade
push indexing (Zerion/Rabby-style websocket deltas, a server-side indexer) is the §6 target, and it must
arrive *without* weakening any of the four states above — a streamed update is just another input to the
same contract.

---

### 5.7 Performance & benchmark

The read path is **parallel and bounded**. `fetchLiveBalances` issues all six native reads plus the price
call in one `Promise.all`, so wall-clock latency is one slow RPC, not the sum. Solana's token read is a
*single* `getTokenAccountsByOwner` for the whole wallet rather than one call per mint. The `AdapterRegistry`
memoizes adapters and the `ProviderPool` fails over on a dead endpoint within its cooldown, so a flaky
public node degrades to "—" on one leg instead of hanging the view. Balance math is O(assets) integer
arithmetic — negligible against network time. We do not yet publish a p95 read budget; the budget and its
measurement land with the §6 sync layer and §9 production standards. Against the field: our *correctness*
bar (four honest states, no float, no fabricated total) already exceeds the common "skeleton → number"
pattern; our *latency* story (on-demand pull) is deliberately behind exchange-grade push indexing, and named
as such rather than dressed up.

---

### What §5 commits us to

- **Four states, always distinct** — a real value, a genuine on-chain zero, a partial read, and a network
  failure that is rendered "—" and is *never reachable as $0*. This holds on both the balance axis and the
  price axis.
- **Bigint from wire to edge** — base units and micro-USD as integers; the only float is the final display
  string.
- **Unpriced is not zero, and dust is hidden not deleted** — an asset without a quote is listed with a null
  price; sub-$1 value folds away but stays in the structure.
- **One number, chains invisible, provenance kept** — assets merge across chains by asset key with exact
  decimal normalization, and per-chain holdings survive for the expand view.
- **Stale is labelled, borrowed is refused** — an old quote is shown with its age; a figure that isn't
  demonstrably *this* wallet's (the insights guard) is not shown at all.

The signing engine that spends these balances is **§3**; the transaction builder that reserves fees against
them is **§4**; the push-indexer and freshness budget that will make these reads instant are **§6** and
**§9**. This section's only job is to make sure the number is *true*.


## §6 · Multi-Chain Synchronization & Background Indexing

> **Section objective.** Keep on-screen state *fresh across three ecosystems* — Bitcoin, the EVM world, and
> Solana — without ever printing a number that isn't true. Freshness and honesty pull in opposite directions:
> the fastest way to look up-to-date is to keep showing the last value, and the fastest way to look complete
> is to treat a failed read as `$0`. Doctrine #3 forbids both. This section specifies the synchronization
> engine that ships **today** — an on-demand, fail-soft pull model with a race-proof liveness guard — and
> the **push-based indexer** it grows into, drawn so the honesty invariant survives the upgrade. It builds
> *beneath* Chapter 5's Universal Identity: identity answers *whose* addresses to watch; this section answers
> *how their state is refreshed and reconciled*. It reads *with* §5 (Balance Engine — the honest four-state
> read and the pure aggregator) and §8 (Offline Behavior & Error Recovery); it does not restate them.

### 6.0 · Shipped vs roadmap — read this first

| Capability | Status | Ground truth |
|---|---|---|
| On-demand balance reads, fanned out per chain, fail-soft | **Shipped** | `apps/web/src/balances.ts`, `apps/mobile/balances.ts` → `fetchLiveBalances()` |
| Concurrency + liveness guard (monotonic `runId`) | **Shipped** | `apps/mobile/ScreenHome.tsx` (`runId` ref); web `useWalletKey`/`useEffect` re-fetch |
| Refresh on mount · focus/visibility · poll · post-broadcast · pull | **Shipped** | `App.tsx` (`visibilitychange`, 500 ms key poll), `ScreenHome.tsx` `RefreshControl` |
| Stale / partial / network-fail labelling (never stale-as-fresh) | **Shipped** | `packages/portfolio` (`stale` flags), four-state derivation in Home/Portfolio |
| Confirmation reconciliation (receipt poll → balance + activity refresh) | **Shipped** | `broadcast.ts` `waitForReceipt`/`checkStuckTx`; `packages/execution` confirm step |
| Rate-limit handling + multi-endpoint provider failover | **Shipped** | `packages/chains/src/provider.ts` `ProviderPool` |
| Dedicated indexer service · push/WebSocket updates | **Roadmap** | `ARCHITECTURE.md` §"Per-chain checkpointed indexers" |
| Cursor-based history backfill · unified cross-chain activity feed | **Roadmap** | tagged 🔜 in §6.7 |
| Deep background sync (worker / silent push while backgrounded) | **Roadmap** | tagged 🔜 in §6.7 |

Nothing below presents a roadmap item as shipped. Where the target design is described, it is tagged **🔜**.

---

### 6.1 · The freshness model we ship: on-demand, fail-soft pull

The wallet holds keys on-device and, by Doctrine #1, has no server that watches the chains for it. So the
shipped synchronization model is a **client-side pull**: when a surface needs current state, it reads it
directly from public/keyed RPCs and REST endpoints, in the browser or on the phone, over the
`@intent-wallet/chains` adapters. There is no server-side cache of balances to go stale, and no plaintext
key or holdings ever leave the device to make one.

The unit of synchronization is `fetchLiveBalances()`. For the active identity it fans every native read out
in parallel — mainnet **and** testnet for ETH, SOL, BTC — plus a live USD price lookup, in a single
`Promise.all`:

```ts
const [ethM, ethT, solM, solT, btcM, btcT, px] = await Promise.all([
  nullable(evmBalance('ethereum', ETH_MAINNET_RPC, me.evm.address)),
  nullable(evmBalance('sepolia',  SEPOLIA_RPC,      me.evm.address)),
  nullable(solBalance('solana',   SOL_MAINNET_RPC,  me.sol.address)),
  // …devnet, btc mainnet, btc testnet…
  fetchPrices(),
]);
```

Two design choices carry the doctrine. First, **`nullable()` wraps every read** —
`p.then(n => n, () => null)` — so one chain's outage collapses to `null` (*"—"*) for that asset alone and
never rejects the whole `Promise.all`. A degraded Solana RPC cannot blank an otherwise-good ETH balance.
Second, **`null` and `0n` are different values with different meanings**: `null` is *"we could not read this"*,
`0` is *"we read it and the balance is genuinely zero."* This is the seam §5 formalizes; §6 is the code path
that produces it under concurrency and refresh. Money is `bigint` end-to-end — the adapters return base
units (wei / lamports / sats) and the only float conversion (`Number(wei)/1e18`) happens at the very display
edge, never in the sync or aggregation path.

Benchmarked against exchange-grade infrastructure (Coinbase/Binance push their users a server-maintained
balance the instant an internal ledger row changes), an on-device pull is *slower to notice* a deposit —
it learns on the next read, not the next block. That is the deliberate cost of custody-free operation: we
trade push latency for the guarantee that no server ever holds the user's keys or watches their addresses.
§6.7's indexer narrows the latency gap **without** re-introducing that server-side secret.

---

### 6.2 · The liveness guard: making concurrent reads race-proof

Pull-based refresh invites three classic races: a slow response clobbering a newer one, out-of-order
secondary data (recent activity) sticking after the balance it belonged to is gone, and a `setState` firing
after the view unmounted. The shipped guard is a **monotonic run id** — a tiny, deterministic state machine
around every `load()` (`apps/mobile/ScreenHome.tsx`):

```ts
const runId = useRef(0);
const load = useCallback(async (isRefresh) => {
  const my = ++runId.current;                 // claim this run
  // …setData(undefined) skeleton, or setRefreshing(true)…
  const [bal, health] = await Promise.all([ fetchLiveBalances().catch(() => null), apiHealthy() ]);
  if (my !== runId.current) return;           // a newer run (or unmount) superseded me → commit nothing
  setData(bal);
  // secondary: recent activity commits only if `my` is still the live run
}, []);
useEffect(() => { void load(false); return () => { runId.current++; }; }, [load]); // unmount invalidates in-flight
```

The invariant: **only the latest invocation is allowed to commit state.** `++runId.current` claims a run;
the `if (my !== runId.current) return` gate is checked *after every await* before any `setState`; unmount
(`runId.current++` in cleanup) invalidates all in-flight loads. The secondary activity fetch re-checks the
same `my === runId.current` before it commits, so an out-of-order history response can never attach to a
balance snapshot that has already been replaced.

```
        ┌─────────┐  load(false)      ┌──────────┐  await settles, my===runId   ┌───────────┐
        │  idle   │ ────────────────▶ │ in-flight │ ───────────────────────────▶ │ committed │
        └─────────┘  my = ++runId     └──────────┘                              └───────────┘
             ▲                              │  newer load() OR unmount (runId bumped)   │
             │                              ▼   my !== runId → drop result, no setState │
             └──────────────────────────────────────────────────────────────────────────┘
```

The web surfaces achieve the same discipline structurally: `LiveBalancesPanel` keys its `load()` to
`useWalletKey()` and re-runs through `useEffect(load, [walletKey])`, where `walletKey` is
`${isUnlocked()}:${activeAccountIndex()}` polled every 500 ms — so a lock, unlock, or **account switch**
tears down and re-issues the read against the correct principal (the wrong-principal session bug the recent
account-switcher fix closed). The guarantee both platforms hold: **a balance on screen always belongs to the
identity and account currently selected, read by the newest request in flight.**

---

### 6.3 · Refresh triggers

Because there is no push channel yet, freshness is a function of *when* we re-pull. The shipped triggers,
in order of how the product actually stays current:

- **On mount / navigation.** Home unmounts on every tab switch, so returning to it re-issues `load(false)`.
  The web panels re-fetch whenever `walletKey` changes (unlock, lock, account switch).
- **Poll-on-focus / visibility.** `App.tsx` registers a `visibilitychange` listener and a 500 ms interval
  that re-derives `walletKey`; a tab regaining focus re-reads rather than trusting a value that may be
  minutes old. This mirrors Rabby/Phantom, which refresh balances on window focus rather than on a fixed
  wall-clock timer.
- **Post-broadcast reconciliation.** After a send/swap confirms, the originating surface calls
  `refreshBalance()` / `load()` so the number the user just changed updates from the chain, not from local
  optimism (see §6.5).
- **Manual.** Pull-to-refresh (`RefreshControl`) on mobile and the ↻ control on web share the *same*
  `load()` as the error-state Retry — one code path, so manual and automatic refresh can never diverge in
  behavior or honesty.

We deliberately do **not** run an aggressive background timer. A fixed 5-second poll across six
chain/network reads per tick would burn public-RPC rate budget (§6.6) for state the user isn't looking at,
and on mobile would drain battery for no visible benefit. Freshness is tied to *attention* (focus, mount,
explicit refresh) and *causation* (a tx we just sent), which is where it matters.

---

### 6.4 · Staleness and the "never stale-as-fresh" rule

The cardinal sin of a sync layer is showing an old or partial number as if it were current and complete.
The engine refuses this in two layers.

**Per-value provenance.** The pure aggregator (`packages/portfolio/src/aggregate.ts`) carries a `stale` bit
from source to summary: `PriceInfo.stale` and `PortfolioBalance` freshness propagate into `UnifiedAsset.stale`
and `UnifiedPortfolio.stale` (`anyStale`). Valuation is integer micro-USD throughout (`assetValueMicros`,
`usdToMicros`); a stale price still *values* the holding but the position is flagged, never silently trusted.

**Four-state derivation at the edge.** Home and Portfolio don't render a balance as a scalar; they derive
one of four honest states from the read results (`ScreenHome.tsx`):

| State | Condition | What the user sees |
|---|---|---|
| `funded` | at least one held asset read | real balances + net worth |
| `emptyGenuine` | every read succeeded **and** all zero | an honest "$0 / empty" |
| `partialEmpty` | some chains read, some failed, no funds seen | balances **+ "some balances unavailable"**, change pill hidden |
| `errored` | `data === null` or **every** read failed | a network-error state with **Retry — never "$0"** |

`trustworthy = allReadOk && heldPriced` gates the 24h change pill: because the total sums only priced,
successfully-read assets, a held-but-unpriced or unread asset would *under-count* the total — so when
`trustworthy` is false the wallet shows the balances it has, annotates the shortfall (`degradedNote`), and
**suppresses** the derived change figure rather than present an under-count as complete. This is the same
honesty contract §5 defines for the Balance Engine; §6 guarantees it holds under partial multi-chain
failure, which is the *common* case with public RPCs, not the exotic one.

---

### 6.5 · Reconciliation: detecting a confirmed transaction and updating state

Synchronization isn't only reads-at-rest; it's closing the loop after the wallet *changes* state. The
shipped reconciliation path answers *"is my transaction really on-chain, and does the balance now reflect
it?"* without ever reporting success the chain didn't grant.

- **Receipt polling (settlement-safe).** `broadcast.ts::waitForReceipt` polls `eth_getTransactionReceipt`
  (up to 45 attempts × 2 s ≈ 90 s bound) and treats a `status === '0x0'` receipt as a **revert that throws** —
  so a failed approval is never mistaken for success, and the settlement-safe swap sequencing (approve →
  *wait for receipt* → preflight → swap) never fires the second leg until the first is genuinely mined.
- **Confirmation in the execution engine.** For AI-planned multi-step flows, `packages/execution` runs each
  step through `simulating → broadcasting → confirming → confirmed`; the driver's `confirm()` must report an
  un-reverted inclusion or the step **parks** with the funds' location recorded (§8, the park guarantee).
  A `StepStatus` never advances to `confirmed` on optimism — only on an observed on-chain result.
- **Balance + activity refresh.** On a confirmed send the surface re-runs `load()`/`refreshBalance()`, so the
  new balance is *read from the chain*, not decremented locally. Recent activity is refreshed as a secondary,
  best-effort read (`fetchEvmHistory` → `/v1/history/evm`, Sepolia today) that commits only under the same
  `runId` liveness gate; a failure there yields an honest empty list, never a fabricated row.
- **Stuck-transaction detection.** `checkStuckTx` compares the mined nonce (`latest`) with the mempool nonce
  (`pending`); `pending > latest` means queued-but-unmined, and `cancelStuckTx` replaces the oldest at the
  same nonce with a fee-bumped self-send — reconciliation that *repairs* state, not just reports it.

The invariant across all four: **the chain is the source of truth, and the UI converges to it.** We do not
mutate a displayed balance from a locally-assumed outcome; we broadcast, observe, and re-read.

---

### 6.6 · Rate limits and provider failover

Public RPCs are the default endpoints (each overridable to a keyed node via a gitignored `VITE_*` env var),
and they *will* rate-limit and flap. The shipped resilience lives in `ProviderPool`
(`packages/chains/src/provider.ts`), the single choke point every read and broadcast passes through. Its
contract (ADR-0034):

- **Deterministic priority-order selection.** Endpoints are tried in *configured order* (keyed providers
  first, public fallbacks last), skipping any in cooldown. If **every** endpoint is cooling down, all are
  tried anyway — a pool degrades to *best-effort*, never to *bricked*. Latency EWMA is tracked for
  observability only, **not** for selection, to avoid routing flap (memory D9).
- **A precise error taxonomy that drives failover.** A `JsonRpcError` (a valid error *response* — a revert,
  bad params) is **propagated immediately with no failover**: it is deterministic chain state, and asking a
  second node would only get the same true answer. Transport-class `ChainError`s — `TIMEOUT` (a 10 s
  `AbortSignal.timeout` default), `RATE_LIMITED` (HTTP 429), `TRANSPORT_FAILED`, `INVALID_RESPONSE` — mark
  the endpoint unhealthy and advance to the next. Exhausting all candidates raises `ALL_PROVIDERS_FAILED`,
  which is exactly the signal the fail-soft `nullable()` wrapper converts into the honest `null`/`errored`
  state of §6.4.
- **Bounded backoff.** A failed endpoint cools down (30 s default) with linear backoff capped at 5× —
  enough to shed a flapping node without exiling a recovered one longer than it deserves.
- **Secrets never logged.** `redactRpcUrl` strips path and query (where keyed URLs embed the API key) from
  every stat and error, so failover diagnostics can never leak a credential (Doctrine #8 / SECURITY.md).

The honesty tie-in is direct: rate-limit and outage handling exist so that a throttled provider becomes a
*labelled unavailable state*, not a wrong number. Failover buys us more chances to read the truth; when they
run out, we say so.

---

### 6.7 · Roadmap — the indexer the pull model grows into 🔜

The pull model is correct and honest but latency-bound and read-heavy. The target architecture
(`ARCHITECTURE.md`, "per-chain checkpointed indexers") closes the gap **without** weakening a single
doctrine. Each item is roadmap, tagged, and constrained by the same rule: *the indexer may serve only
public, on-chain-derived, address-scoped data — never a key, never a secret, never a fabricated or
stale-as-fresh value.*

- **🔜 Dedicated indexer service.** Per-chain, checkpointed followers that watch confirmed blocks and expose
  address-scoped balance/activity queries — turning today's N live RPC round-trips into one warm read, with
  the RPC fan-out as the fallback. It stores only public chain data; it holds nothing that couldn't be
  re-derived by anyone from the ledger.
- **🔜 Push / WebSocket updates.** A subscription that pushes *"address X changed at block N"* so the client
  re-reads on causation instead of on focus — shrinking deposit-notice latency toward the exchange-grade
  benchmark while the balance itself is still confirmed against the chain before display.
- **🔜 Cursor-based history backfill.** Paginated, resumable backfill of full transaction history behind a
  monotonic cursor (the same liveness discipline as §6.2, persisted), replacing today's fixed
  most-recent-N window.
- **🔜 Unified cross-chain activity feed.** One time-ordered stream merging BTC + EVM + SOL events under the
  Chapter 5 identity — the sync-layer complement to the portfolio's already-unified balance view. Today
  activity is EVM/Sepolia-only; unification is a feed-merge over per-chain indexers, not a new trust model.
- **🔜 Deep background sync.** A worker / silent-push refresh so returning to the app shows already-current
  state. It stays honest by re-validating freshness on foreground and by never persisting a value it would
  later render without a staleness check.
- **🔜 Roadmap alongside identity.** MPC, passkeys, secure-enclave and hardware-wallet custody, and
  air-gapped signing (Chapter 5 / §2–§3) remain roadmap; none of them changes this section's contract, which
  is about *reading and reconciling* public state, not about where the key lives.

---

### What §6 commits us to

- **Custody-free synchronization.** State is pulled on-device from public endpoints; no server watches the
  user's addresses and no secret leaves the device to make that faster.
- **`null` ≠ `0`, always.** A network failure is a distinct, labelled state with Retry — never "$0", never a
  stale value dressed as fresh. Partial multi-chain failure degrades to an annotated partial, not a false
  total.
- **Race-proof reads.** The monotonic `runId` guard guarantees the balance on screen belongs to the current
  identity/account and to the newest request in flight; no superseded or out-of-order result ever commits.
- **The chain is the source of truth.** Confirmation is observed (receipt / execution-engine confirm),
  reverts throw, and the UI converges by re-reading — never by locally assuming an outcome.
- **Failover buys truth, not lies.** `ProviderPool` fails over on transport errors, propagates deterministic
  chain answers untouched, redacts keys, and hands the honest `unavailable` state to the edge when every
  endpoint is exhausted.
- **The indexer is an optimization, not a compromise.** The push-based roadmap narrows latency while
  preserving every honesty and custody invariant above.

*Sibling sections:* §4 Transaction Builder and §5 Balance Engine (the honest read + pure aggregator this
section keeps fresh), §8 Offline Behavior & Error Recovery (what the four-state `errored` path renders), and
§9 Performance Targets. Identity and the addresses this engine watches are Chapter 5.


## §7 · Session Management

> **Shipped.** `packages/core/src/wallet/session.ts` (SessionManager) + `wallet-manager.ts` (lifecycle) +
> the server auth stack in `services/api/src/auth/*`. A *session* is the single most dangerous object in the
> wallet, because a session is **the transient authority to sign**. §2 says where the key lives; §3 says how
> it signs; this section says **for how long that power exists, what re-arms it, and what kills it** — and it
> draws the hard line between the on-device *unlock* session (which can move funds) and the server *SIWE*
> session (which authenticates a name and can move nothing). Money is `bigint` throughout (Doctrine #4); every
> guard fails closed (#5); every revocation is auditable (#8).

Most wallets treat "unlocked" as a mood — a boolean that flips true on password entry and stays true until
the tab closes. We treat it as **a scoped grant of signing authority with an expiry**, because that is what it
is. The instant the vault is decrypted, the seed is resident in process memory (§2), and every private key in
the Universal Identity of Chapter 5 is one derivation away. An unlocked session is therefore not a convenience
flag; it is the live window during which a stolen or unattended device can sign. This section's entire job is
to make that window **short by default, re-authenticated at the moments that matter, and destroyed decisively**
— and to keep the timing machinery that governs it scrupulously separate from the secret it governs.

---

### 7.1 · What a session *is* — authority, not state

The unlock session is backed by exactly one thing: the **in-memory decrypted vault**, held as a live
`HDKeyring` inside `WalletManager` (`#keyring`). There is no session token, no cookie, no server record that
constitutes the right to sign — the *presence of a non-destroyed keyring in device RAM* **is** the session.
`WalletManager.isUnlocked()` is the whole truth:

```ts
isUnlocked(): boolean {
  return this.#keyring !== null && !this.#keyring.destroyed;
}
```

This is a deliberate design choice with a security payoff: because the session *is* the in-memory key, ending
the session and destroying the key are **the same action** (§7.4) — there is no way to "log out" while leaving
the key resident, and no token to leak that outlives the key. The AI never holds this authority (Doctrine #2,
§3.6); a plan is only ever *proposed* to a session, and only a human unlock plus a device signature disposes.

Crucially, the component that *times* the session holds no part of the secret. `SessionManager`
(`session.ts`) is pure scheduling — an idle timer and a boolean — and its own header states the invariant:
*"Purely about timing and state; it holds no key material."* It knows *when* to end the session; it never
knows *what* the session protects. The `WalletManager` owns the keyring and wires the two together: it passes
`() => this.lock()` as the manager's `onLock` callback, so when the timer fires, the manager destroys the key.
This split is the reason a bug in the timer can, at worst, lock you out — never leak a seed. Timing logic and
secret material live in different objects, on purpose.

---

### 7.2 · The lifecycle — a four-state machine with a guard on every edge

An account on this device is always in exactly one of four states. The transitions, and the guard that governs
each, are the contract:

```
        createWallet / importWallet
        (seal vault, keyring→memory,          touch()  ── any user activity
         session.start)                       re-arms the idle timer (no-op if not ACTIVE)
                                                     ┌───────┐
   ┌───────────┐  ───────────────────────────►  ┌───┴───────▼──┐
   │ NO_WALLET │                                 │    ACTIVE    │
   │ (no vault)│  ◄───────────────────────────   │ seed in RAM, │
   └───────────┘        wipe()                    │ timer armed  │
        ▲          (lock, then delete vault       └───┬───────▲──┘
        │           + meta from SecureStore)          │       │
        │                                       lock()│       │ unlock(password)
        │                                    OR idle   │       │ guard: openVault(envelope,pw)
        │                                    timeout   ▼       │  decrypts → wrong pw THROWS
        │                                        ┌────────────┐│  VAULT_DECRYPT_FAILED
        └──────────  wipe()  ──────────────────► │   LOCKED   ├┘
                                                 │ ciphertext │
                                                 │ at rest,   │
                                                 │ keyring    │
                                                 │ destroyed  │
                                                 └────────────┘
```

| Transition | Trigger | Guard (fail-closed) | Effect |
|---|---|---|---|
| NO_WALLET → ACTIVE | `createWallet` / `importWallet` | mnemonic passes BIP-39 validation; no vault may already exist | seal vault (scrypt+AES-256-GCM), persist ciphertext, keyring→memory, `session.start()` |
| LOCKED → ACTIVE | `unlock(password)` | `openVault` must decrypt — a wrong password or tampered vault **throws** `VAULT_DECRYPT_FAILED` | keyring→memory, `session.start()` arms the idle timer |
| ACTIVE → ACTIVE | `touch()` | no-op unless `active` | idle timer re-armed from now |
| ACTIVE → LOCKED | `lock()` **or** idle-timeout fires `onLock` | none — locking never fails | `session.stop()`, `keyring.destroy()` (seed zeroized), `#keyring`/`#signer` → null |
| LOCKED/ACTIVE → NO_WALLET | `wipe()` | UI gates behind explicit typed confirmation (§7.3) | `lock()` first, then delete `vault` + `meta` keys from the store |

The load-bearing guard is on **LOCKED → ACTIVE**. Note what `unlock()` does *not* do: it does not compare a
stored password hash, it does not consult a flag. It attempts the actual AES-256-GCM decryption of the vault,
and a wrong password is indistinguishable from a tampered vault by construction (GCM authentication, §2) — both
surface as `VAULT_DECRYPT_FAILED`. There is no password oracle to attack because there is no stored password.
And the cost of each attempt is the **deliberate scrypt work factor** — `N=2¹⁵, r=8, p=1` ≈ 32 MiB, ~100 ms
per attempt on a current phone. That latency is a session-security feature: it rate-limits offline password
guessing against a stolen device to roughly ten tries a second per core, turning a weak-but-nontrivial
passphrase into hours of attacker work rather than microseconds.

**Idle auto-lock.** The timer lives in `SessionManager` and is injected end-to-end so tests run on a fake
clock (no real `setTimeout` in the pure path). `start()` arms it, `touch()` re-arms it on activity, `stop()`
cancels it, and when it elapses the manager locks:

```ts
#arm(): void {
  this.#cancel();
  if (this.#autoLockMs <= 0) return;         // 0 disables auto-lock (an explicit, honest opt-out)
  this.#handle = this.#scheduler.setTimer(() => {
    if (!this.#active) return;               // a stop() that raced the callback wins
    this.#active = false;
    this.#onLock();                          // → WalletManager.lock() → keyring.destroy()
  }, this.#autoLockMs);
}
```

The core default is **5 minutes**; the shipped web app raises it to a user-configurable **15-minute** default
(`apps/web/src/settings.ts`, `autoLockMinutes: 15`), read **once at `WalletManager` construction** so a change
takes effect on the next unlock/reload rather than silently mid-session. This gap is documented, not
accidental: the core ships a conservative default and the app owns the product tradeoff. A value of `0` is a
real, labelled setting ("never auto-lock") — honest about the risk rather than hiding it; the auto-lock table
in Settings tells the user plainly that *"the wallet locks itself after this idle time — keys are wiped from
memory (the encrypted vault stays on this device)."* Against the field: a browser-extension wallet's auto-lock
is our nearest analogue and we match its model; a Ledger/Trezor sidesteps the question entirely because the
secret never leaves the secure element (the roadmap target, §2, tagged — not claimed here).

---

### 7.3 · Re-authentication gates — freshness for the irreversible

Being unlocked is *not* a blanket authorization for every action. Three classes of operation demand a **fresh
proof of the password even while the wallet is already unlocked**, because each is either irreversible or hands
over the crown jewels. The mechanism is `WalletManager.verifyPassword()`, and its most important property is a
security subtlety spelled out in its own doc comment:

```ts
// NEVER use unlock() for re-auth: unlock() is a no-op when already unlocked and would accept ANY password.
async verifyPassword(password: string): Promise<boolean> {
  const envelope = await this.#store.get(STORE_KEYS.vault);
  if (!envelope) return false;
  try { const secret = openVault(envelope, password); zeroize(secret); return true; }
  catch { return false; }
}
```

`unlock()` short-circuits on the in-memory unlock flag (`if (this.isUnlocked()) return`), so it would *accept
any password* on an already-open wallet — useless, and dangerous, as a re-auth check. `verifyPassword()`
instead re-decrypts the sealed vault directly, never consulting the flag, and zeroizes the recovered secret
immediately. It re-authenticates correctly *because* it ignores session state. The three gates:

| Gate | Why it re-auths | Mechanism | Post-conditions |
|---|---|---|---|
| **Reveal recovery phrase** | the seed *is* the wallet; showing it is the single highest-value read | `verifyPassword(pw)` before `exportMnemonic()` (`revealMnemonic`) | phrase auto-hides after **45 s**, on window **blur**, on tab **visibility→hidden**, and on **leaving Settings** — never left on screen, never put on a wire |
| **Wipe** | deleting the vault is irreversible; a mis-tap must not nuke funds | explicit typed confirmation in the UI; `wipe()` `lock()`s first, then deletes ciphertext | keyring destroyed, vault + meta removed, multi-account state reset |
| **Mainnet / high-value send** | real, irreversible funds movement (Ch4/Ch5 policy) | fresh confirmation of the **exact amount + recipient** before signing, threaded as a `GuardAck` | `assertBroadcastAllowed` (`packages/chains/src/guard.ts`) refuses without `acknowledgeMainnet`; above the **$1,000** cap (`MAINNET_SPEND_CAP_USD`) it additionally requires `acknowledgeHighValue` |

The seed-reveal flow is the exemplar of "comprehension precedes disclosure." The wallet is already unlocked,
yet the reveal UI still demands the password (`revealAsk` → `doReveal`), and the moment the phrase is on screen
a battery of listeners races to clear it — a 45-second timer, `window blur`, `visibilitychange`, and any
navigation away from Settings. The phrase never touches the network, never enters a form that submits, and
never survives a context switch. That is the standard for anything that exposes key material: shown reluctantly,
under fresh proof, and retracted the instant attention wanders.

The mainnet gate is the same discipline applied to *spending* rather than *revealing*. On testnet (the default),
`assertBroadcastAllowed` merely validates the recipient — test coins are free, so there is nothing to gate. On
mainnet it fails closed unless the user has explicitly acknowledged a real-funds broadcast for this exact
transfer, and it enforces the **integer** `$1,000` spend cap as a second, independent acknowledgement above
the line. This is Rabby-style pre-sign friction made a hard gate rather than a hint (§3.7, §8): the session may
be open, but each irreversible mainnet action re-earns its authorization.

---

### 7.4 · Ending a session — lock, and the zeroization it forces

Locking is the one transition that can never fail and never be refused, because its job is destruction:

```ts
lock(): void {
  this.#session.stop();       // cancel the idle timer
  this.#keyring?.destroy();   // zeroize seed, wipe root HDKey, blank the mnemonic
  this.#keyring = null;
  this.#signer = null;        // the SigningManager cannot outlive its keyring
}
```

`HDKeyring.destroy()` zeroizes `#seed`, calls `#root.wipePrivateData()`, and empties `#mnemonic`; every method
on the dead keyring thereafter throws `KEYRING_DESTROYED` (§3.1). Because the `SigningManager` is nulled in the
same breath, there is no dangling signer holding a reference to a destroyed keyring — a lock is a clean cut
across the whole signing surface. We are honest about the one limit JavaScript imposes (documented in
`bytes.ts`, echoed in §3.6): `zeroize` is best-effort — the GC/JIT may have copied bytes we cannot reach — so
lock *shrinks* the heap-dump recovery window rather than eliminating it. Native secure memory (Secure Enclave /
StrongBox) is the roadmap answer and is tagged as such, not claimed as shipped.

What survives a lock is *only* the sealed vault (opaque ciphertext) in the `SecureStore`, plus two integers of
public multi-account metadata. Nothing that can move funds persists. And what survives a **wipe** is nothing at
all: `wipe()` locks first (destroying the in-memory key), then deletes both the `vault` and `meta` keys, so the
device is returned to `NO_WALLET`. Recovery from that point is only via the recovery phrase the user backed up
— by design (Doctrine #1): if the device forgot it and the server never had it, the phrase is the sole path
back.

---

### 7.5 · Two sessions, one of which cannot sign — the device/server separation

This is the section the Principal Security Engineer signs, and it is the most misunderstood boundary in a
non-custodial wallet. There are **two entirely separate sessions**, and conflating them is exactly the mistake
that turns a non-custodial wallet into a custodial one by accident. They share no authority.

The **device unlock session** (everything above) is the authority to *sign* — backed by the in-memory keyring,
resident only in device RAM, never transmitted. The **server SIWE session** is the authority to *read a
principal's server-side data* (plan cache, portfolio insights, history) — backed by a stateless HS256 JWT, and
it **holds no key and can sign nothing**. The server authenticates *who is asking*; it has no power to *act on
funds*, because the only thing that acts on funds is a device signature the server never sees.

The server session is established over the *same* non-custodial signature the wallet already produces. SIWE
(EIP-4361, `auth/siwe.ts`) issues a one-time nonce challenge; the wallet signs it **in the browser** with
`personal_sign` (`signPersonalMessage` → the §3 EIP-191 path); the server recovers the signer address
(`recoverSiweSigner` → `recoverEvmAddress`) and checks it against the nonce. **No key reaches the server** —
authentication is just a public-key recovery over a signature. The recovered address becomes the JWT `sub`, and
that principal is bound to plan ownership downstream (principal-binding, task #92). The issued token
(`auth/jwt.ts`) is a minimal HS256 JWT over `node:crypto` HMAC — constant-time verified, **fail-closed** (bad
signature, malformed token, or expired `exp` → `null`), carrying a per-token `jti` for revocation.

| | **Device unlock session** | **Server SIWE session** |
|---|---|---|
| Authorizes | **signing** — spending funds | reading a *principal's* server data |
| Backed by | in-memory decrypted vault (`HDKeyring`) | stateless HS256 JWT |
| Lives in | device RAM only | `Authorization: Bearer <token>` header |
| Secret it holds | the seed (transiently, §2) | **none** — `sub` is a public address |
| Can move funds? | yes (with a device signature) | **never — it is not custody** |
| Ended by | `lock()` / idle auto-lock / `wipe()` | logout (`jti` revoke) / logout-all / `exp` |
| Revocable remotely? | no — it is device-local | **yes** — the Redis revoker |

The honest punchline: a *fully compromised* server session cannot sign a transaction. It can read what that
principal is allowed to read, and that is the ceiling. Signing requires the device-resident keyring, which
never leaves the browser and never touches the server. This is Doctrine #1/#2 expressed at the session layer —
the server can authenticate a name, and can never dispose of a coin.

**JWT revocation — the kill switches.** A stateless JWT is valid until it expires; without a revocation list a
leaked token is usable for its full life. `auth/revoker.ts` closes that with two controls, backed by an
in-memory store locally and **shared Redis across replicas** in production (a token revoked on pod A must be
dead on pod B):

- **`revoke(jti, ttlSec)`** — invalidate *one* session (a normal sign-out / lost device). `POST /v1/me/logout`
  revokes the exact `jti` on the auth context, kept in Redis only until the token would have expired anyway, so
  the list stays bounded.
- **`revokeAllFor(sub, beforeSec)`** — **sign out everywhere**: every token for that subject issued at/before
  now is dead. `POST /v1/me/logout-all` sets a **monotonic `notBefore` cutoff** (it never moves backwards, so
  an older call cannot un-revoke a newer sign-out), and `isRevoked` rejects any token whose `iat` precedes it.
  This is the response to a suspected token theft or a password change.

The guard (`plugins/auth-guard.ts`) is fail-closed by construction: its default verifier **rejects every
token** until a real one is wired, so nothing is silently trusted, and the injected `makeJwtVerifier` consults
the revoker on every protected request. Every revocation is an auditable server event (Doctrine #8).

---

### 7.6 · Session hardening — shipped floor, and the honest roadmap

What is shipped is a genuine floor, not a stub — a real idle auto-lock that zeroizes the seed, real
re-authentication gates on the three irreversible actions, and a real, revocable server session that provably
cannot sign. What is *targeted* is labelled plainly, because presenting roadmap as shipped is itself a Doctrine
#3 violation.

| Capability | Status |
|---|---|
| Idle auto-lock (injectable timer, seed zeroized on fire) | **Shipped** — `SessionManager`, `WalletManager.lock()` |
| Re-auth gates: seed-reveal (`verifyPassword`), wipe, mainnet/high-value confirm | **Shipped** — `wallet-manager.ts`, `App.tsx`, `guard.ts` |
| Scrypt work factor as guessing rate-limit (~100 ms/attempt) | **Shipped** — `vault.ts` (§2) |
| SIWE sign-in + HS256 JWT + `jti` single-session revoke + sign-out-everywhere (Redis) | **Shipped** — `services/api/src/auth/*` |
| Fail-closed auth guard (rejecting default verifier) | **Shipped** — `plugins/auth-guard.ts` |
| **Biometric / passkey unlock** (device auth instead of typed password) | **Roadmap** — pairs with the §2 secure-enclave target |
| **Shorter default TTLs + adaptive/risk-based auto-lock** (tighten by device trust, §Ch5) | **Roadmap** |
| **ES256 + JWKS rotation, proof-of-possession refresh** bound to the device | **Roadmap** — `SECURITY.md §6` mandated hardening |
| **Device trust levels + per-session risk score + "revoke any session" list** | **Roadmap** — Chapter 5 §8/§9 identity-graph target |
| **Secure-enclave-resident keys / hardware cosign / MPC** (removes the RAM window entirely) | **Roadmap** — §2, §3.6 |

The through-line: today's session model already makes the unlocked window *short, re-authenticated, and
decisively destroyed*, and keeps the fund-moving authority strictly on the device where the server can never
reach it. Every hardening tier above tightens that same model — a shorter TTL, a biometric in place of a
password, a key that lives in silicon we cannot read — without ever weakening the two invariants this section
exists to hold.

---

> **§7 exit criteria (Design Review Gate).** A session is the transient authority to sign, backed by the
> in-memory keyring — not a token, so ending the session and destroying the seed are one act. The lifecycle is
> a four-state machine (NO_WALLET / LOCKED / ACTIVE / wipe) with a fail-closed guard on every edge; unlock is
> real AES-256-GCM decryption at ~100 ms scrypt cost, not a flag check. Idle auto-lock zeroizes the seed on
> fire; three irreversible actions (reveal, wipe, mainnet/high-value) re-authenticate via `verifyPassword`,
> which correctly ignores the unlock flag. The device unlock session and the server SIWE session are separate
> authorities — the server session authenticates a principal, holds no key, and **cannot sign** — with `jti`
> single-session revocation and monotonic sign-out-everywhere over shared Redis. Biometrics, shorter/adaptive
> TTLs, ES256+JWKS, device-trust scoring, and enclave-resident keys are labelled roadmap, not shipped.
> **Next:** §8 · Offline Behavior & Error Recovery — how the wallet behaves, and stays honest, when the
> network the session reaches across is gone.


## §8 · Offline Behavior & Error Recovery

> **Section objective.** Degrade *gracefully* and never lose money. Two failure regimes threaten a
> non-custodial multi-chain wallet: the **network is gone** (no RPC, no price feed, no broadcast) and the
> network is present but **something goes wrong mid-flight** (a node throttles, a tx reverts, a bridge stalls,
> a multi-step intent dies halfway). This section specifies both — the honest offline split, the error
> taxonomy, and the recovery machinery that guarantees a partially-executed intent is *never left in an
> unknown state*. Its load-bearing invariant is the **park guarantee**: at every instant, the funds' location
> is known and reportable, even when everything else has failed. It reads *with* §3 (signing is the local
> primitive that survives offline), §4 (the builder whose live reads are the network dependency), §6 (the
> fail-soft sync layer and `ProviderPool` taxonomy this section consumes), and §7 (the lock that ends a
> session). It does not restate them.

### 8.0 · Shipped vs roadmap — read this first

| Capability | Status | Ground truth |
|---|---|---|
| Local signing with **zero network I/O** in core (works without connectivity) | **Shipped** | `packages/core` enforced no-I/O boundary (§3); `SigningManager` |
| Execution park / resume state machine (funds never stranded) | **Shipped** | `packages/execution/src/engine.ts`, `state.ts`; resume tests |
| Simulate-before-broadcast gate (a mismatch is never signed) | **Shipped** | `engine.ts` `#runStep` → `driver.simulate` |
| Idempotent per-step retries with a cap | **Shipped** | `engine.ts` `maxAttempts` (default 3), retry-same-step loop |
| Settlement recovery taxonomy (retry/requote/wait/compensate/ignore/park) | **Shipped** (pure core) | `packages/settlement/src/recovery.ts`, `coordinator.ts` |
| Mandatory pre-flight re-validation + settlement idempotency (no double-send) | **Shipped** (pure core) | `coordinator.ts` `settle` / `settlementIdFor` |
| Bounded receipt reconciliation; reverts throw; stuck-tx detect + cancel | **Shipped** | `apps/web/src/broadcast.ts` `waitForReceipt` / `checkStuckTx` / `cancelStuckTx` |
| Transport-error failover + bounded backoff; deterministic chain answers propagated | **Shipped** | `packages/chains/src/provider.ts` `ProviderPool` (§6) |
| Fail-closed broadcast guard (unknown chain / bad recipient / unacked mainnet → block) | **Shipped** | `packages/chains/src/guard.ts` |
| Concrete cross-chain **compensator** (reverse a failed bridge leg) | **Roadmap** (seam) | `coordinator.ts` injects `sources.compensator`; logic tagged 🔜 |
| Air-gapped / QR offline signing (build on one device, sign on another) | **Roadmap** | tagged 🔜 in §8.8 |
| Deep background sync / silent-push resume of parked flows | **Roadmap** | tagged 🔜 in §8.8; §6.7 |

Nothing below presents a roadmap item as shipped. Where the target is described, it is tagged **🔜**.

---

### 8.1 · The offline split — what can happen without a network, honestly

A wallet's promise under a dropped connection depends entirely on *which* operation you mean, and the honest
answer is a hard split, not a slogan. The dividing line is Doctrine #1 made physical: **the key lives on the
device, so anything that is only key-math is offline-capable; anything that needs the chain's current state
is not.**

| Operation | Offline? | Why |
|---|---|---|
| Derive addresses / show the identity | ✅ Local | `packages/core` derivation is pure (§3, Ch5); no RPC |
| Unlock the vault (scrypt + AES-256-GCM) | ✅ Local | the ~100 ms scrypt cost (§2–§3) is CPU, not network |
| **Sign** canonical bytes (EVM/BTC/PSBT/Solana) | ✅ Local | `SigningManager` is pure key-math; core has **zero network I/O** (§3) |
| Read cached last-known balance | ⚠️ Labelled stale | shown only with its age (§5.6); never as fresh |
| Read a **live** balance / price / quote | ❌ Network | `fetchLiveBalances`, price feed, quoter all hit RPC/REST (§5–§6) |
| Build a transaction (nonce + fee estimate) | ❌ Network | `broadcast.ts` reads `getNonce` + `estimateFees` live before signing |
| Simulate / pre-flight (`eth_call`) | ❌ Network | the sandbox gate needs the node's current state |
| **Broadcast** + confirm | ❌ Network | `eth_sendRawTransaction`, receipt polling |

So the precise truth: **signing is offline; sending is not.** The cryptographic core that disposes of funds
never needs connectivity — but a *complete* send today reads the live nonce and fee inline in the builder
(§4, `broadcast.ts`), so in practice a send is network-bound end to end. The architectural gap between "the
signer works offline" and "you can send offline" is exactly what air-gapped/QR signing closes — build and
freeze the unsigned tx on a connected device, carry it by QR to an offline signer, carry the signature back.
The signer's pure *"apply the key to bytes someone else assembled"* shape (§3) already supports this; only
the transport is unbuilt. It is roadmap (§8.8), and we do not claim it ships. Benchmarked against
Ledger/Trezor, whose entire value proposition is signing on a permanently-offline element, our software
signer is one tier below hardware today and says so.

The other half of offline honesty is the reads. When the network is gone, a balance is **not `$0`** — it is
the `errored`/`unavailable` state of §5's four-state model, rendered "—" with a Retry, never a fabricated
zero. That contract is defined in §5–§6; §8's job is that *every* failure path lands there rather than in a
confident lie.

---

### 8.2 · The error taxonomy — three families, three dispositions

Every failure the engine can see sorts into one of three families, and the family *determines the recovery*.
Conflating them is how wallets lie: retrying a deterministic revert wastes gas and never succeeds; parking on
a transient timeout strands a flow that a single retry would have finished.

**① Network / transport errors — *retryable, fail over.*** A `ChainError` of class `TIMEOUT` (a 10 s
`AbortSignal.timeout`), `RATE_LIMITED` (HTTP 429), `TRANSPORT_FAILED`, or `INVALID_RESPONSE` (§6). These say
nothing about the truth of the chain — only that *this endpoint, right now* could not answer. The disposition
is failover to the next endpoint and, if all are exhausted, `ALL_PROVIDERS_FAILED` → the honest `unavailable`
state (reads) or a bounded retry (writes). A second node may hold the answer.

**② Chain / deterministic errors — *never retried.*** A `JsonRpcError` (a valid error *response*: a revert,
bad params), a receipt with `status === '0x0'`, an execution `confirm()` reporting `reverted`. These are the
chain's true, final answer; asking a different node returns the *same* answer. The disposition is to
propagate immediately (no failover — §6) and, for a write that already moved, to **park** with the funds'
location recorded. `DriverError` carries `retryable: false` for exactly this class.

**③ User / intent errors — *stop and explain, don't retry.*** Insufficient funds, a recipient that fails its
EIP-55 checksum, a `GUARD_BLOCKED` (unacknowledged mainnet, over the spend cap), a simulation mismatch, a
pre-flight `eth_call` that would revert (`amountOutMin` too high). These are not transient and not the
device's fault to fix silently — they need the *user* to change the input. The disposition is an honest
`reason + suggestion` (§8.7) and no automatic retry.

The tie-in to §6's `ProviderPool` is direct: it is the one choke point that *classifies* transport-vs-chain
before this section ever sees the error, so a deterministic revert never masquerades as a flaky node, and a
throttled node never masquerades as a real failure.

---

### 8.3 · The park / resume state machine — a partial intent is never in an unknown state

This is the section's reason to exist. A single-step send is easy to reason about; a multi-step intent
(approve → bridge → swap → send) can die between any two steps, and the cardinal sin is leaving the user's
money somewhere the wallet can no longer name. `packages/execution` (ADR-0033) makes that impossible by
construction: it is a **persisted, resumable step machine** whose every transition is saved before the next
begins, and whose `Execution.fundsLocation` is **never unknown** — the type has no "somewhere" value.

An `Execution` has four statuses and each `StepState` moves through seven (`state.ts`):

```
 Execution:  running ──► completed        (every step confirmed)
                │
                ├──────► parked            (unrecoverable step; funds' location recorded)
                └──────► failed            (no runnable step, not all confirmed)

 Step:  pending ─► simulating ─► broadcasting ─► confirming ─► confirmed
                       │  sim !ok               │ reverted / verify !ok
                       ▼                        ▼
                     failed ───────────────► PARK (record fundsLocation, stop)
```

The guards on those transitions are the whole safety argument (`engine.ts` `#runStep`):

- **Simulate → broadcast is gated.** `driver.simulate(step, plan)` runs first; if the simulated effects don't
  match the plan, the step is **never broadcast** — it parks. A key is applied only to bytes that already
  passed a pre-broadcast simulation. This is Rabby's pre-sign idea made a *hard gate* rather than a UI hint.
- **Only a confirmed step advances the funds.** `StepStatus` reaches `confirmed` **only** on an observed,
  un-reverted on-chain result — never on optimism. A reverted inclusion, or a post-confirmation invariant
  failure (`verify` — e.g. received `< minReceived`), parks with the funds' location recorded: *funds moved,
  but not as promised → stop, don't proceed.*
- **Dependencies are strict.** `nextRunnableStep` runs a step only when all `dependsOn` steps are `confirmed`
  (`isRunnable`), so a swap never fires before its approval mined.
- **Resume is exact.** State is saved after *every* transition (`store.save`), so `resume(id, plan)` reloads
  and continues from the first unconfirmed step — the resume behaviour is pinned by tests, not asserted. A
  crash mid-execution is indistinguishable from a clean restart.

The **park guarantee** in prose: when a step cannot be recovered, `#park` sets `status='parked'`, stamps
`fundsLocation` with the chain the funds are actually on, and stops — emitting `execution.parked` with a
human note (*"Paused safely. Your funds are on Ethereum and can be resumed."*). The engine never hands
control back without an answer to *"where is my money?"* — even when it has just failed. And it holds this
without ever seeing a key: signing lives inside the injected `StepDriver.broadcast`, on the device (§3, §3.7);
the engine owns ordering, retries, recovery, parking, and persistence, and receives only a `txid` back.

---

### 8.4 · Retry, backoff, idempotency — repairing without double-spending

Recovery that isn't idempotent is worse than no recovery: a naive "just retry the send" is how a wallet
double-spends. The engine's retries are safe because they retry the *same* step, and the platform's true
idempotency key is the one the chain already enforces — **the nonce**.

- **Idempotent step retry.** On a `DriverError` with `retryable: true`, `#runStep` loops the *same* step (same
  seq, same intended effect) up to `maxAttempts` (default **3**); a non-retryable error or an exhausted count
  parks. The step's `attempts` counter is persisted, so retries survive a restart.
- **The nonce is the anti-double-spend guarantee.** An EVM account nonce admits exactly one mined transaction
  per value; re-broadcasting the same nonce cannot produce two effects — either the original mines, or a
  replacement at the same nonce *replaces* it. This is what makes "retry after an ambiguous timeout" safe:
  the chain, not the client, enforces at-most-once.
- **Bounded, honest reconciliation.** After a write, `broadcast.ts::waitForReceipt` polls
  `eth_getTransactionReceipt` up to **45 × 2 s ≈ 90 s**; a `status === '0x0'` receipt **throws** (a revert is
  never mistaken for success), and a timeout throws *"not confirmed in time — not broadcasting the swap"* —
  the second leg of a settlement-safe swap never fires on an unconfirmed first leg (§6.5, ADR-0091 sequencing).
- **Stuck-transaction repair.** `checkStuckTx` compares the mined nonce (`latest`) with the mempool nonce
  (`pending`); `pending > latest` means queued-but-unmined. `cancelStuckTx` broadcasts a 0-ETH self-send at
  the *same* stuck nonce with a 2× fee bump — it outbids and replaces the underpriced original. Recovery that
  *repairs* state, not merely reports it, and still non-custodial (signed in-browser).
- **Backoff lives in the pool.** A failed endpoint cools down (30 s default) with linear backoff capped at 5×
  (§6.6) — enough to shed a flapping node without exiling a recovered one. The settlement coordinator adds a
  wall-clock ceiling: `maxSettlementSeconds` (default **3600 s**) → a settlement that outruns its budget ends
  `timed_out` rather than looping forever.

---

### 8.5 · Settlement reconciliation — the pipeline that can't reach broadcast stale

Above the single-step engine sits the **Universal Settlement Engine** (`packages/settlement`, ADR-0041): the
mandatory front door that drives an approved plan through a fixed, ordered pipeline to a *financial outcome*
or a safe, explained stop. It is the layer that turns "the intent was approved" into "the intent settled, and
here is the ledger." Three of its guarantees are §8's:

- **Mandatory pre-flight — an approved-but-stale plan can never broadcast.** `preflight` is the first,
  non-skippable stage; it re-validates the plan against *current* state (balance, quote TTL, risk, gas,
  policy). A failure **parks the settlement before any transaction is prepared** — approval is not a licence
  to execute a plan the world has since invalidated.
- **Idempotency by construction.** The settlement id is derived from the plan id (`settlementIdFor`); a
  claimed id is never re-executed, so re-settling the same plan is a no-op that returns the existing result.
  No double-send, even under a retried request.
- **Recovery is a deterministic table, and reconciliation is a stage.** `classifyRecovery` maps each failure
  class to exactly one action — the fuller taxonomy the single-step engine's retry-or-park is a subset of:

  | Class | Action | Meaning |
  |---|---|---|
  | `rpc_failure`, `provider_outage` | **retry** | transient — try again within the attempt cap |
  | `bridge_delay` | **wait** | the leg is still settling — stop, resumable |
  | `quote_expiry`, `gas_spike` | **requote** | amounts are stale — bounce back for a fresh quote |
  | `bridge_failure`, `partial_execution` | **compensate** | reverse what completed (🔜 concrete compensator) |
  | `duplicate_execution`, `unexpected_confirmation` | **ignore** | idempotency — already done, don't redo |
  | `chain_halt`, `unknown` | **park** | stop safely, funds untouched |

  A dedicated **`reconcile`** stage then checks *actual on-chain effects against the plan* before the
  settlement is called `settled` — the loop is closed against the chain, not against optimism.
- **Everything is auditable.** Every transition appends to an append-only, replayable **ledger** (`ledger.ts`,
  Doctrine #8); a settlement's entire life is reconstructable in order, deterministically. Even a
  best-effort user notification on a non-settled terminal never masks the outcome (the coordinator swallows a
  notify failure but not the settlement's real status).

Honesty note: the coordinator and its recovery classification ship as an exhaustively-tested *pure core*, but
its stage sources (`executor`, `crossChain`, `reconcile`, and especially `compensator`) are **injected
seams**. The concrete cross-chain reversal that `compensate` calls is roadmap (§8.8). The shipped live app
drives the direct `broadcast.ts` path — settlement-safe sequencing + receipt reconciliation + stuck-tx
recovery (§8.4) — while the coordinator is the target orchestration the multi-step/AI-planned path grows
into. We tag the seam rather than imply the full pipeline runs against mainnet today.

---

### 8.6 · The fail-closed rule — anything unverifiable is blocked

Doctrine #5 is not a sentiment; it is a pure, total function at the most dangerous moment in the system — the
instant before a signed transaction hits the wire. `guardBroadcast` / `assertBroadcastAllowed`
(`packages/chains/src/guard.ts`) holds no keys and moves no funds; its only power is to **refuse**, and it
refuses anything it cannot *positively* verify:

- **Unknown chain → refuse.** `getChain` throws for an unrecognized chain and the guard returns
  `ok: false` — it will not broadcast to a chain it does not understand.
- **Malformed recipient → block.** A non-well-formed EVM address is rejected; a *mixed-case* address whose
  EIP-55 checksum fails is rejected as a likely typo (the cheapest defense against a subtly-wrong recipient);
  an empty non-EVM recipient is rejected early.
- **Mainnet requires explicit acknowledgement → block by default.** A live-funds broadcast needs
  `acknowledgeMainnet`; above `MAINNET_SPEND_CAP_USD` ($1,000) it *additionally* needs `acknowledgeHighValue`.
  Testnets are free; every acknowledged mainnet send still carries an "irreversible" warning.
- **Simulation / pre-flight negative → don't sign.** The execution sandbox (§8.3) and the swap's `eth_call`
  preflight (§8.4) both refuse to broadcast bytes that would revert.

The guard is pure and total — no network, no clock, no keys, no I/O — so it is exhaustively testable and
cannot itself become an attack surface. The one *graceful* degradation is deliberate and still fail-safe: when
gas can't be simulated (e.g. an unfunded wallet), the builder falls back to a conservative gas ceiling and
*lets the node be the final arbiter* — the chain refuses an underpriced or impossible tx, so the fallback
never fabricates success.

---

### 8.7 · Honest error UI — reason, suggestion, never a dead end

An error that reaches the user must obey the same doctrine as a balance: **never fake, never a raw stack
trace, never a false success.** The design contract is Chapter 3 §21 (*Error Design — "Never display raw
errors. Always: reason + suggestion"*) and Chapter 4's *Error Recovery — "Never a dead end."*

- **Reason + suggestion, always.** Not *"Transaction failed"* but *"Reason: insufficient liquidity ·
  Suggestion: try reducing the amount."* The taxonomy of §8.2 is what makes this possible: the family of the
  error determines the suggestion (retry vs change-input vs wait).
- **The chain's real error is surfaced, not swallowed.** `broadcast.ts` deliberately throws the node's
  genuine error — *"insufficient funds"* — because that error *is proof the path reached the real chain*. We
  translate it into calm, plain language; we never replace it with a fabricated confirmation.
- **A network failure is a state, not a zero.** A dropped read renders the `errored`/"—" state with a Retry
  and the calming copy *"Your funds are safe — try Refresh"* (§5.3, §6.4) — `$0` is unreachable from a failed
  read.
- **A park is explained and resumable.** The `execution.parked` / settlement `parked` events carry the funds'
  location and the reason, so the UI can say exactly *where the money is* and offer Resume — the AI's
  "never a dead end" applied to execution, not just conversation.

---

### 8.8 · Roadmap 🔜

Each item is roadmap, tagged, and constrained by the same rule: it may improve resilience, but never at the
cost of a key leaving the device, a fabricated value, or a stranded fund.

- **🔜 Air-gapped / QR offline signing.** Build and freeze the unsigned tx on a connected device, carry it by
  QR to a permanently-offline signer, carry the signature back. The signer's pure "apply key to bytes" shape
  (§3) already supports it; the transport is the work. Closes the §8.1 gap between "signing is offline" and
  "you can send offline."
- **🔜 Concrete cross-chain compensator.** The settlement coordinator already *classifies* `bridge_failure` /
  `partial_execution` → `compensate` and invokes an injected `compensator`; the real reverse-swap / refund
  logic that unwinds a failed bridge leg is the seam to fill.
- **🔜 Deep background sync / silent-push resume.** A worker that re-validates parked flows and surfaces
  already-current state on foreground — staying honest by re-checking freshness rather than trusting a
  persisted value (§6.7).
- **🔜 Secure-enclave, hardware, MPC, passkeys.** The custody roadmap of §2–§3; none changes §8's contract,
  which is about *recovering* flows and *reading* state, not about where the key lives.

---

### What §8 commits us to

- **Signing is offline; sending is not — and we say which.** The key-math core needs no network; a live send
  is network-bound because the builder reads the current nonce and fee. Air-gapped signing that bridges the
  gap is roadmap, tagged, not claimed.
- **The park guarantee.** A multi-step intent is never in an unknown state: every transition is persisted,
  the funds' location is always recorded, an unrecoverable failure parks with that location, and resume
  continues from the first unconfirmed step.
- **The family determines the recovery.** Transport errors fail over and retry; deterministic chain answers
  are propagated untouched; user errors stop and explain. Retries are idempotent — the nonce enforces
  at-most-once, so recovery never double-spends.
- **Stale can't reach broadcast, and success can't be faked.** Mandatory pre-flight parks an
  approved-but-stale plan; reconciliation checks real on-chain effects; a reverted receipt throws; a network
  failure is "—", never "$0".
- **Fail closed.** Unknown chain, malformed recipient, or unacknowledged mainnet is *blocked* by a pure,
  total, keyless guard — and every error the user sees is a reason plus a suggestion, never a dead end.

*Sibling sections:* §3 Signing Engine (the offline-capable primitive), §4 Transaction Builder (the live reads
that make a send network-bound), §6 Multi-Chain Sync (the `ProviderPool` taxonomy and four-state read this
section routes into), §7 Session Management (the lock that ends a session), and §9 Performance Targets (the
budgets these bounds live inside). The identity whose funds are being protected is Chapter 5.


## §9 · Performance Targets & Production Engineering Standards

> **Section objective.** Two promises that sound like one: the wallet must *feel instant* and be *built to
> last*. Sections §1–§8 defined what the engine does; this section defines how fast it is allowed to do it
> and how it is held accountable for doing it correctly for years. The through-line is a single refusal —
> **correctness precedes latency** (`docs/handbook/04-quality.md` §2): we never shave a simulation, a risk
> check, an invariant verification, or a scrypt round to hit a speed number. Everywhere else, we are ruthless
> about the milliseconds a user can feel. This section reads *with* §5 (Balance Engine) and §6 (Sync) for the
> read path and *with* §1–§3 for the key path; it does not restate them.

Performance in a wallet is not a vanity metric — it is trust made tactile. A signature that lands in one
frame and a balance that updates the instant a user looks feel like a system that knows what it is doing; a
half-second of jank on a screen that spends money feels like a system that might lose it. But the same
sentence contains the trap: the one place we *want* to be slow is the door to the keys, because a fast door
is a cheap door to brute-force. So this section draws the budget in two colours — the paths that must be
imperceptible, and the one deliberate cost we defend as a feature.

---

### 9.1 · The interaction budget and the one exception

The governing number is **CLAUDE.md's <100 ms interaction budget**: any action a user takes and waits on —
a tap, a keystroke, opening a panel, confirming a transaction preview — must acknowledge within 100 ms or it
reads as lag. The pure cores make this easy: they are synchronous, allocation-light integer functions with
no I/O, so a signature, a balance aggregation, or a guard verdict is bounded by CPU alone and finishes in
well under a frame (§9.3). Everything the user perceives as *the wallet thinking* is either that fast or it
is network time, which we render as an honest loading state (§5, §6) rather than a frozen thread.

There is exactly **one deliberate exception**, and the whole security model leans on it: **unlock is
supposed to be slow.**

---

### 9.2 · The budget table — operation · target · why · source

Every figure below traces to a real cost source in the shipped tree or to a named SLO. The **Status** column
is honest about which are measured-in-code, which are enforced SLO gates today, and which are budgets whose
load tests are still roadmap (`TESTING.md` §9.2 lists performance-budget load tests as **⏭ mandated**, not
yet CI jobs).

| Operation | Target | Why this number | Status / source |
|---|---|---|---|
| **Vault unlock** (scrypt + AES-GCM) | **~100 ms**, *deliberately* | Memory-hard KDF is the anti-brute-force rate limiter on a stolen vault. Fast here = cheap to crack. | **Shipped, measured** — `DEFAULT_SCRYPT_PARAMS { N:2¹⁵, r:8, p:1 }` = 32 MiB, ~100 ms on current phones (`vault.ts`, OWASP scrypt guidance) |
| **Single signature** (secp256k1 / ed25519) | **< 5 ms**, sub-frame | Dominated by one curve operation over a 32-byte digest; RFC-6979 deterministic, no I/O. | **Shipped** — `signEvmDigest`/Solana/PSBT in `packages/core/src/signing/*`, `@noble` primitives |
| **Transaction build + encode** (RLP / PSBT / message) | **< 5 ms** | Pure byte assembly + one keccak/sha; O(fields) integer work. | **Shipped** — §4 builder, `signing/rlp.ts` |
| **Portfolio aggregation** (merge, value, sort) | **< 5 ms** | O(assets) bigint arithmetic — negligible against network time. | **Shipped** — `packages/portfolio/src/aggregate.ts` |
| **Guard / risk verdict** | **< 100 ms** | A pure decision function; determinism-hashed and stable (§9.6). | **Shipped** — `packages/policy`, `chains/guard.ts` |
| **Balance read (warm)** | **< 300 ms p95** | The read a user stares at; today it is one slow RPC in a parallel fan-out, warm-read latency is the indexer's job. | **Budget (SLO)** — `handbook 04 §2`; warm path is **🔜 §6 indexer**; today read live, no p95 published (§5.7) |
| **Intent parse** — fast-path / LLM | **< 150 ms / < 2.5 s** | Deterministic parser is local; the LLM path is network-bound and schema-forced. | **Budget (SLO)** — `handbook 04 §2` |
| **Execution step push after confirmation** | **< 1 s** | Time from on-chain confirmation to a visible state change. | **Budget (SLO)** — `handbook 04 §2` |
| **Mobile cold start → interactive** | **< 2 s** on a mid-tier device | The first impression; the audited core loads once, no network on boot. | **Budget (SLO)** — `handbook 04 §2`, device-farm perf CI **⏭ pre-GA** |
| **Every interaction** (tap/keystroke/panel) | **< 100 ms** | The felt-latency floor; below it the UI reads as instant. | **Standard** — CLAUDE.md §5; enforced by manual UI verification (§8, TESTING.md) |

Two honesty notes the table must carry. First, the SLO rows are **budgets with a regression policy**, not
metrics we currently emit from a load-test gate — the load tests that would enforce them are roadmap, and we
say so rather than dressing a target as a measurement (`TESTING.md` §9.2). Second, the balance-read budget is
deliberately the *warm* number the **§6 indexer** will deliver; the shipped on-demand pull is bounded by the
slowest live RPC in a `Promise.all`, which is honest but not yet sub-300 ms, and §5.7/§6.1 name that gap
plainly rather than hide it.

---

### 9.3 · The one deliberate cost — scrypt unlock as a security feature

The unlock latency is the single number in this document we would *refuse to improve*. `openVault` runs
scrypt with `N = 2¹⁵, r = 8, p = 1` — **32 MiB of memory-hard work, ≈100 ms** on a current phone (`vault.ts`,
following OWASP's password-storage guidance). That cost is not overhead; it is the entire economic argument
against an offline attack on a stolen device. A vault is opaque AES-256-GCM ciphertext (§1, §2); the only way
in is to guess the password and pay the KDF each guess. At 32 MiB and ~100 ms per attempt, a brute-force of
even a modest password is memory-bound and hopeless at scale — which is exactly what a fast KDF would give
away for free. The parameters live *inside* the envelope, bound as GCM additional authenticated data, so they
can be **raised** per platform as hardware improves without invalidating a single existing vault, and a
tampered param is an authentication failure, not a weaker unlock.

This is why §1.5 frames unlock as *"a deliberately slow door"* and why it is **not** a violation of the
<100 ms budget: the budget governs the interactions a user repeats all day; unlock is the cold,
once-per-session gate whose slowness is the feature. Benchmarked against the field: a Ledger or Trezor rate-limits
guessing in a secure element with dedicated anti-tamper silicon — a tier our software KDF cannot reach and
which §1.8/§3.6 tag as roadmap (secure enclave / StrongBox); scrypt is the strongest defense a pure-JS,
on-device wallet *can* ship, and we ship it at the OWASP-recommended cost rather than a comfortable-feeling
lower one. The money-path rule is absolute here: **we do not trade this millisecond budget for security.**

---

### 9.4 · No main-thread jank, no unbounded work

A fast median is worthless if the tail freezes the UI thread on a screen that moves money. Two disciplines
keep the engine's worst case bounded, and both are structural, not aspirational.

**Every loop has a ceiling.** There is no unbounded work anywhere a hostile input or a flaky network could
reach it:

- **KDF cost is bounds-checked.** `validateScryptParams` rejects `n` outside `2¹³…2²²` (and non-powers-of-two),
  `r` outside `1…64`, `p` outside `1…16` — so a hostile vault envelope *cannot* demand gigabytes of KDF
  memory as a denial-of-service (`vault.ts`, comment: *"bounds double as DoS protection"*).
- **Log redaction is depth- and breadth-capped.** `redact` stops at `MAX_DEPTH = 6`, slices arrays to 100,
  and guards cycles with a `WeakSet` — a hostile or cyclic object can never blow up the logger
  (`packages/observability/src/redact.ts`).
- **Provider failover backs off, bounded.** `ProviderPool` cools a failed endpoint for 30 s with linear
  backoff **capped at 5×**, and degrades to best-effort rather than exiling a recovered node (§6.6).
- **Receipt polling is time-bounded.** `waitForReceipt` polls `eth_getTransactionReceipt` **45 × 2 s ≈ 90 s**
  and then gives up honestly — it never spins forever waiting for a mine (`apps/web/src/broadcast.ts`).
- **Execution retries are capped.** The engine retries a transient step to `maxAttempts` (default **3**) and
  then **parks** with the funds' location recorded — a simulation mismatch is never retried at all
  (`packages/execution/src/engine.ts`, §8).

**The heavy path never blocks perception.** Balance reads fan out with `Promise.all`, so wall-clock latency
is one slow RPC, not the sum of six (§5.7, §6.1); the money math that follows is O(assets) integer arithmetic.
The only genuinely CPU-heavy operation — scrypt — runs on the unlock interaction the user has explicitly
initiated and is waiting on, with a spinner that is honest about the work, never on a background thread that
janks an unrelated animation. Motion honours `prefers-reduced-motion` per the Design System (Doctrine #6),
so the craft budget and the accessibility budget are the same budget.

---

### 9.5 · Production engineering standards — the bar the core is held to

Performance buys the *feel*; these standards buy the *lasts*. They are the concrete realization of CLAUDE.md
§5/§8 and `TESTING.md`, and each is enforced in code or CI, not by hope.

**TypeScript strict, everywhere, one language.** The whole platform is strict-mode TypeScript — device,
engines, and server (`ARCHITECTURE.md` §6, ADR-0002). Types are the contract, and the payoff is direct: the
*same audited `packages/core`* signs on web and on mobile, so there is one code path to review for the thing
that touches keys, not two (§1, §3). `pnpm -r typecheck` is a **hard CI gate**, and a full topological
`pnpm -r build` runs alongside it to catch `.d.ts`/emit drift a typecheck alone would miss (`TESTING.md` §9.2).

**Pure, single-purpose packages with explicit public interfaces.** The monorepo is layered L0→L3 under a
one-way **dependency rule** (`ARCHITECTURE.md` §3.1): a package may only import from a lower tier, business
logic lives in `packages/*`, and apps merely compose. Each package's `index.ts` is its whole public surface —
`packages/core/src/index.ts` documents its hard boundary in a comment (*"Zero network I/O in this package …
Key material never crosses this package's public API except via the explicitly SENSITIVE members"*). That
boundary is what lets §3 promise the signer has no network reach and §6 promise sync never sees a key: it is
a package law, not a convention.

**Deterministic cores — no clock, no RNG, no ambient I/O where determinism is required.** A pure core is
*provably* pure. Money is `bigint` from wire to display edge; the only float is the final format string
(Doctrine #4, §5.4). Cores that must be deterministic take a wall clock as an *input*, never read one:
`packages/execution`'s state carries *"Caller-supplied timestamps (the package does no clock access)"*
(`execution/src/state.ts`), and the identical discipline holds for the signing serializers (RFC-6979
determinism, §3.2) and the aggregator. This is not asserted — it is **tested at the source level**: a
determinism test greps evaluator modules and *fails the build* if `Date.now`, `Math.random`, `node:crypto`,
`fetch(`, or `process.env` appears (`packages/policy`, `TESTING.md` §4.2). "No clock in the core" is a red
build, not a code-review wish.

**Exhaustive unit + known-answer conformance + property tests.** Correctness is *demonstrated, not asserted*
(Doctrine #8). The pyramid is weighted hard to the bottom (`TESTING.md` §2), where a bug spends money: every
branch and every error `code` has a test, every boundary (empty/zero/max/wrong-length) is hit, and adversarial
input is first-class. Where a standard exists we reproduce the **official vectors byte-for-byte** — BIP-39,
SLIP-0010, BIP-32/44/84, EIP-55 — and additionally cross-check against an *independent* implementation
(`viem`, `@scure/btc-signer`, `ed25519-hd-key`) over generated inputs, because agreement with a second
implementation is far stronger than agreement with ourselves (§3.5, `TESTING.md` §4–§5). `core` carries a
**≥90% coverage floor wired into its `vitest.config.ts`** today; the other critical packages are mandated to
the same tier as their thresholds land (`TESTING.md` §9.1).

**Integration over the real request path.** Above the pure cores, integration tests drive the **actual**
production pipeline — Fastify `inject()` with real hooks, error handler, and serializers, backed by `pg-mem`
and `ioredis-mock` so the same `PostgresPlanStore` / `RedisNonceStore` classes run in test as in prod, with
no container and no socket (`TESTING.md` §6). The auth path is real (SIWE recover → nonce → JWT → guarded
call), per-user isolation is proven as an IDOR test, and the SDK wire contract is exercised end-to-end — a
breaking change fails a test, not a user.

**Observability — metrics, traces, redacted logs, and an audit trail.** Everything auditable (Doctrine #8).
The platform has one cross-cutting `@intent-wallet/observability` package (structured `Logger`, an `AppError`
taxonomy, problem+json) that domain code is allowed to depend on. Three properties matter here: (1) the API
exposes **Prometheus `/metrics`** and propagates a **W3C `traceparent`** trace id across every hop and onto
every log line (`services/api/src/plugins/request-context.ts`, `plugins/metrics.ts`), so a request is one
correlated trace; (2) **secrets are never logged** — `redact` scrubs by key name (`password|mnemonic|seed|
private_key|token|…`) recursively before anything is serialized (`observability/src/redact.ts`), and
`ProviderPool` runs every RPC URL through `redactRpcUrl` so a keyed endpoint can't leak in a failover
diagnostic (§6.6); (3) every risky decision — a risk verdict, a policy denial, an execution park — is logged
with its inputs and reason, and the execution record itself is the persisted, resumable **system of record**
(`execution/src/state.ts`).

**Leak-scan, and no build artifacts in `src/`.** Two hygiene rules with teeth. `gitleaks` runs on **every
PR** as a hard gate, and before any sanctioned `--no-verify` commit a manual **leak-scan** (grep the known
secret prefixes → must be 0) is required by CLAUDE.md §8 / `TESTING.md` §7. Separately, **compiled artifacts
never live in `src/`** — a stale `.js` beside a `.ts` in `packages/core/src` is a real Vite gotcha this repo
has been bitten by (project memory: *wallet real execution*), so purging build output from source trees is
part of the standard, not an afterthought.

**Verify before you claim.** The rule that sits over all of the above (CLAUDE.md §4, `TESTING.md` §10):
*"done" is a claim about reality, earned by driving the actual thing* — light and dark, keyboard-reachable,
the five honest states each rendered, a screenshot as evidence. A green type-check is not a passed test, and
a passed test is not a verified feature. If a step was skipped, the honest report is *"implemented, not yet
verified"* — a legitimate state, and a lie to call "done."

---

### 9.6 · Where we stand against the best

The honest benchmark, one axis at a time. On **key handling**, a Ledger/Trezor signs inside a secure element
and rate-limits guessing in dedicated silicon; our shipped software wallet defends the vault with a 32 MiB
scrypt KDF and zeroizes keys after every signature (§3.6) — the strongest a pure-JS on-device wallet can do,
with secure-enclave/hardware parity tagged roadmap, never claimed. On **pre-sign safety**, Rabby surfaces a
simulation as a UI hint; we make it a **hard gate** — the execution engine will not broadcast a step whose
simulated effects don't match the plan (§3.7, §8). On **indexing latency**, exchange-grade infrastructure
pushes a server-maintained balance the instant a ledger row changes; our custody-free pull *learns on the
next read*, and we trade that push latency for the guarantee that no server holds a key or watches an address
(§6.1) — with the **🔜 §6 indexer** drawn to close the gap *without* re-introducing a server-side secret. On
**test rigour**, the bottom-heavy pyramid, official vectors, and cross-implementation property tests put our
correctness bar level with the wallet teams that live or die on derivation and encoding (`TESTING.md` §2).
Each comparison is stated as it is — a lead where we lead, a labelled gap where we lag.

---

### What §9 commits us to

- **A budget with one deliberate exception.** Every user interaction is held to <100 ms; the sole exception
  is the ~100 ms scrypt unlock, which is slow *on purpose* and defended as the anti-brute-force feature it is.
- **Correctness precedes latency, always.** No simulation, risk check, invariant verification, or KDF round
  is ever shaved to hit a speed number.
- **No unbounded work.** Every loop — KDF cost, log redaction, provider backoff, receipt polling, step
  retries — has an explicit, tested ceiling; money math is O(assets) integer work off the perception path.
- **Deterministic, pure, typed cores.** Strict TypeScript, one-way package layering, `bigint` money, and
  clock/RNG/IO banned from cores that must be deterministic — enforced by a source-grep that fails the build.
- **Proven, not asserted.** Known-answer vectors + cross-implementation property tests + integration over the
  real request path; `core` at a ≥90% coverage floor; verify-before-you-claim as the standing rule.
- **Auditable and secret-safe by construction.** Prometheus metrics, W3C trace propagation, redact-by-key
  logging, `gitleaks` + manual leak-scan, and no build artifacts in `src/`.
- **Honest about the roadmap.** The warm-read SLO belongs to the §6 indexer, secure-enclave/hardware key
  storage is tagged roadmap, and load-test enforcement of the perf budgets is labelled ⏭ — not one presented
  as shipped.

*This is Chapter 6's last section. It ties the engine together: §1–§2 the lifecycle and keys it protects,
§3–§4 the signing and building it makes fast and correct, §5–§6 the reads it keeps honest and fresh, §7–§8
the sessions and failures it survives — all held to the budgets and standards above. The chapters that
follow (Intent, Execution, Security) are choreography on top of this floor; none of them may lower it.*


---

## Where this sits

This is the engineering reference beneath **Chapter 6 — Wallet Core Architecture**. The shipped core — the
lifecycle state machine, the scrypt+AES-GCM on-device keystore, the unified signing engine (EVM/BTC/SOL,
conformance-tested), the per-chain transaction builders, the four-state balance engine (network-fail ≠ $0),
session management, and the execution engine's recovery/park/resume — is real today; MPC, passkeys, hardware
wallets, air-gapped signing, and a push-based indexer are roadmap, designed here so they are built without
ever crossing the non-custodial line. When the founder's Chapter 6 charter lands, it becomes the canonical
front of this reference.
