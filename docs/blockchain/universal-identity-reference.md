[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Volume V — the long-form behind [Chapter 5](../bible/chapter-05-universal-identity.md)

# The Universal Identity Reference

*The buildable expansion of Chapter 5's charter — exact derivation paths, the recovery threat model, and the sync cryptography, grounded in the real identity engine, with the shipped-vs-roadmap line drawn honestly.*

**About this document.** [Chapter 5](../bible/chapter-05-universal-identity.md) is the memorize-it charter —
one identity, few addresses, many chains. This is its **reference spec**: the 3-address architecture with
exact paths, account abstraction, human-readable identity, address virtualization, HD accounts, recovery,
device trust, multi-device sync, and enterprise identity — each tagged **SHIPPED** (cite the real code) or
**ROADMAP**. Two lines never move: **keys are on-device and never touch a server**; any recovery or sync
that would need a server to hold a secret is redesigned, not shipped.

| § | Section | Grounded in |
|---|---|---|
| 1 | The 3-Address Architecture | `packages/identity`, BIP-32/44/84 + SLIP-0010 vectors |
| 2 | Smart Account Abstraction | ERC-4337 (roadmap), the policy engine |
| 3 | Human-Readable Identity & Universal Username | `services/api/src/ens.ts` (ENS shipped) |
| 4 | Address Virtualization & Cross-Chain Mapping | the AdapterRegistry model |
| 5 | HD Accounts & the Multi-Account Model | `apps/web/src/wallet.ts` |
| 6 | Recovery Architecture | `SECURITY.md`, backup/verify/wipe |
| 7 | The Device Trust Model | `packages/core` signing, scrypt+AES-GCM |
| 8 | Multi-Device Sync | the non-custodial doctrine (roadmap) |
| 9 | Enterprise Identity | the policy/compliance seams (roadmap) |

Honesty first: shipped vs roadmap is tagged throughout.

---

## §1 · The 3-Address Architecture

> *Thirty chains, three addresses, one identity. The user learns a person; the wallet keeps the ledger of
> where that person lives on every network. This section is the seed of the whole chapter: it says exactly
> what "my wallet" resolves to, proves it with published test vectors, and hands §2–§9 a foundation they
> only ever build up from — never rewrite.*

Chapter 1 promised a wallet where the user "never has to think about chains," and Chapter 4 made the
conversation the front door to that promise. But a promise about chains has to be *paid for somewhere in the
key material*, and this is where it is paid. The single most consequential design decision in the product is
not in the AI, the router, or the UI — it is that **one BIP-39 seed resolves to exactly three receive
addresses, and the user is taught to think of those three as one identity.** Everything else in Chapter 5 —
smart accounts (§2), a human-readable username (§3), cross-chain virtualization (§4), multiple accounts
(§5), recovery (§6) — is an *elaboration* of this triple. Get the triple wrong and every later section
inherits the mistake; get it right and they inherit a foundation that has already passed known-answer
conformance against the reference implementations of three ecosystems.

The naïve multi-chain wallet is a drawer of thirty keys: an address for Ethereum, another for Arbitrum,
another for Base, another for Optimism, one for Polygon, one for BNB, one for Bitcoin, one for Solana, and
the drawer grows every time a chain launches. That is the mental model Intent Wallet refuses. We derive
**three** addresses, not thirty, because the number of *cryptographic identities* a human needs is set by
the number of distinct **signature schemes** the supported networks use — and that number is two curves and
three canonical address encodings, not thirty chains. The rest is accounting the wallet does silently, which
is precisely the "hide complexity" pillar rendered in key material.

---

### 1.1 · One seed, three addresses — the exact derivation

The whole architecture is a single deterministic function. A BIP-39 mnemonic becomes a 64-byte seed
(PBKDF2-HMAC-SHA512, 2048 iterations, per BIP-39 — `packages/core/src/mnemonic.ts`), and that seed is fed
through three ecosystem-standard derivation paths to produce the triple. This is not a design sketch; it is
the shipped body of `HDKeyring.getAccount()` in `packages/core/src/keyring.ts`, and the paths are a frozen
table in the same file:

```ts
export const derivationPaths = {
  btc: (index, network = 'mainnet') => `m/84'/${network === 'mainnet' ? 0 : 1}'/0'/0/${index}`,
  evm: (index) => `m/44'/60'/0'/0/${index}`,
  sol: (index) => `m/44'/501'/${index}'/0'`,
} as const;
```

| Ecosystem | Curve | Derivation path (account 0) | Standard | Encoding |
|---|---|---|---|---|
| **Bitcoin** | secp256k1 | `m/84'/0'/0'/0/0` | BIP-84 (native SegWit) | bech32 P2WPKH `bc1q…` |
| **Universal EVM** | secp256k1 | `m/44'/60'/0'/0/0` | BIP-44 (coin type 60) | EIP-55 checksummed `0x…` |
| **Solana** | ed25519 | `m/44'/501'/0'/0'` | SLIP-0010 (coin type 501) | base58-encoded public key |

Three properties of this table are load-bearing, and each is chosen on purpose:

- **The paths are the ecosystem canon, not our invention.** `m/84'/0'/0'/0/0` is the BIP-84 native-SegWit
  path MetaMask and Ledger and every modern Bitcoin wallet use; `m/44'/60'/0'/0/0` is *the* Ethereum path;
  `m/44'/501'/0'/0'` is the Phantom/Solflare/`solana-keygen` convention. This is deliberate
  interoperability: a user can import our seed into MetaMask or Phantom and see the *same* address, and
  import theirs into us and see theirs. Non-custodial is meaningless if the seed is a roach motel — the
  standard paths are what make "your keys" also mean "your keys anywhere."
- **Bitcoin is native SegWit today, on purpose.** Launch scope is BIP-84 P2WPKH (`bc1q…`) — the lowest-fee,
  universally-accepted address type in 2026 (`packages/core/src/accounts/bitcoin.ts`). Taproot (BIP-86,
  `bc1p…`) is a derivation we can add without touching the identity model, because the identity is the seed,
  not the address encoding.
- **The BTC coin type flips with network; EVM and Solana do not.** On testnet the Bitcoin path becomes
  `m/84'/1'/0'/0/0` (coin type 1, encoded `tb1q…`) — an honest reflection of BIP-44's testnet coin type. The
  EVM and Solana addresses are *network-agnostic at this layer*: the same `0x…` is used on Sepolia and
  mainnet, the same base58 key on devnet and mainnet-beta. The keyring test pins exactly this
  (`testnet.evm.address === mainnet.evm.address`), and it is why our network labels are honest rather than
  cosmetic (per the "network-labeling truths" doctrine note).

A worked example makes the determinism concrete. The all-zero-entropy "abandon" mnemonic — the industry's
canonical test seed — resolves, in our shipped code, to:

```
BTC  m/84'/0'/0'/0/0  →  bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu   (BIP-84 official vector)
EVM  m/44'/60'/0'/0/0  →  0x9858EfFD232B4033E47d90003D41EC34EcaEda94   (canonical across MetaMask/ethers)
SOL  m/44'/501'/0'/0'  →  base58 ed25519 pubkey (matches ed25519-hd-key reference)
```

Those are not aspirational strings; they are `expect(...)` assertions in
`packages/core/test/keyring.test.ts`. The same mnemonic always produces the same triple on any device, which
is the entire basis of the recovery and multi-device stories (§6, §8): the identity is *rederived*, never
*transported*.

One clarification the chapter must state once and inherit everywhere: "three addresses" is three **per HD
account index**. An identity *is* an account index (`identity.accountIndex`), and the seed can derive 2³¹ of
them; adding an account rotates the index and yields a fresh, unlinkable triple. The multi-account mechanics
belong to §5 — here the only claim is that **each identity is exactly three addresses**, and the default
wallet has one identity.

---

### 1.2 · The curve split — why two signature schemes, not one

The reason the number is *three and not one* is that no single keypair can sign for all three ecosystems.
This is a cryptographic fact, not a product choice, and it is the deepest thing in the section.

Bitcoin and every EVM chain sign with **ECDSA over the secp256k1 curve**. Solana signs with **EdDSA over
Curve25519 (ed25519)**. These are different elliptic curves with different scalar fields, different public-key
formats, and — critically — *different key-derivation trees*: standard BIP-32 hierarchical derivation is
defined for secp256k1 and cannot produce ed25519 child keys, which is exactly why SLIP-0010 exists. A single
private key literally cannot produce a valid signature on both systems; the math does not connect. So the
triple decomposes cleanly into **two curve families**:

| | secp256k1 family | ed25519 family |
|---|---|---|
| **Chains** | Bitcoin, all EVM (ETH, Arbitrum, Base, Optimism, Polygon, BNB, …) | Solana |
| **Derivation** | BIP-32 via `@scure/bip32` (`HDKey`) | SLIP-0010, vendored `packages/core/src/slip10.ts` |
| **Address from key** | Bitcoin: `hash160(pubkey)` → bech32 · EVM: `keccak256(pubkey)[12:]` → EIP-55 | base58 of the raw 32-byte ed25519 public key |
| **Signature** | ECDSA, RFC-6979 deterministic, low-s normalized (65 B `r‖s‖v`) | EdDSA, 64-byte, inherently deterministic |
| **Signer** | `accounts/evm.ts`, `signing/bitcoin-psbt.ts` | `accounts/solana.ts` |

The split is visible in the code's own shape. In `HDKeyring.getAccount()`, the BTC and EVM addresses are
derived through the *same* secp256k1 node factory (`#deriveSecp`, over `@scure/bip32`'s `HDKey`), while the
Solana address goes through an *entirely separate* SLIP-0010 path (`slip10DerivePath`) because it has to —
there is no way to hang an ed25519 key off the secp256k1 tree. We chose to **vendor SLIP-0010 in ~60 lines
over `@noble/hashes` HMAC-SHA512** rather than pull the unmaintained `ed25519-hd-key` dependency
(ADR-0004); the honesty tax on that choice is a stricter test burden, which §1.5 shows we paid.

Why does the split *matter* to the product, beyond being true? Because it sets a hard, non-negotiable floor
under the "make chains invisible" promise. We can hide Arbitrum-vs-Base from the user (§1.3) — those share a
key. We **cannot** hide Solana-vs-Ethereum at the key layer, because they are different curves; a Solana
receive is genuinely a different cryptographic identity than an Ethereum receive. The 3-address model is the
*minimum honest surface*: it collapses everything that can be collapsed (the many EVM chains) and exposes
exactly what physics forces us to expose (one Bitcoin identity, one EVM identity, one Solana identity). A
wallet that claimed "one address for everything" would either be lying or be custodial. Ours is neither.

---

### 1.3 · The Universal EVM address — one address, every EVM chain

The middle row of the triple carries the most user-visible magic, and it is worth being precise about *why*
it works, because it is easy to mistake for a bridge and it is nothing of the kind. There is **one EVM
address**, and it is valid — natively, with no wrapping, bridging, or mapping — on Ethereum mainnet,
Arbitrum, Base, Optimism, Polygon, BNB Chain, and every other EVM-compatible network, present and future.

This is not a feature we built; it is a property of how EVM chains derive addresses. Every EVM chain uses the
identical scheme: `address = keccak256(secp256k1_pubkey)[-20:]`, EIP-55 checksummed
(`evmAddressFromPublicKey` in `packages/core/src/accounts/evm.ts`). The address is a pure function of the
public key and nothing else — no chain ID enters it. So the same key that produces `0x9858…` on Ethereum
produces the same `0x9858…` on Base, because the *chain* only shows up later, in the transaction's
`chainId` field, never in the address. Our identity layer encodes this truth as data, not marketing: the EVM
receive address is tagged `worksOn: 'Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain'` and the
identity test asserts it (`packages/identity/src/identity.ts`; `identity.test.ts`).

The distinction the user must never be confused about — and the section states it plainly so §4 can build the
UI on it — is:

> **Same address, every EVM chain: true and free.** *Same balance, every EVM chain: false.* Your USDC on
> Base and your USDC on Arbitrum sit at the identical address but are distinct on-chain balances; moving
> value between them is a **bridge**, a real transaction with real cost — never a relabeling.

That line is the whole safety boundary of address virtualization. The wallet can *show* one EVM identity and
aggregate balances across chains under it (Portfolio does exactly this), but it must never let the calm
single-address UI imply that cross-chain movement is free. The 3-address model gives us the clean surface;
§4 (Address Virtualization & Cross-Chain Mapping) owns the discipline of not abusing it.

Benchmark: this is the same insight **Phantom** reached when it went multi-chain (one Solana identity, one
EVM identity, one Bitcoin identity under a seed) and **Rabby** institutionalized on the EVM side (one address
the user carries across every L2, with the chain as a context switch rather than a new account). We are
deliberately convergent with them on the derivation paths — that convergence *is* the interoperability — and
we differ only in wrapping the triple in an explicit "identity" object (§1.4) rather than presenting three
loose accounts.

---

### 1.4 · Identity, not addresses — the user's mental model

A wallet that shows three hex strings has not hidden any complexity; it has just given the user three things
to be confused by instead of thirty. The architectural move that earns the chapter's title is that the three
addresses are wrapped into **one first-class `UniversalIdentity` object** with a stable, human-facing id —
so the user's mental model is *"my identity,"* and the addresses are a detail they can reveal, not a thing
they must manage. This is `packages/identity/src/identity.ts`, the layer that sits directly above the keyring:

```ts
export interface UniversalIdentity {
  id: string;              // stable, opaque, device-independent
  accountIndex: number;
  addresses: { btc: ReceiveAddress; evm: ReceiveAddress; sol: ReceiveAddress };
  metadata: { label: string; createdAt?: string };
}
```

Two design choices in this shape carry the mental model:

- **The identity has one stable id, derived from the triple.** `computeIdentityId()` hashes the three
  addresses — `sha256(btc | evm.toLowerCase() | sol).slice(0, 32)` — into a short, opaque, *device-independent*
  id. Because it is a function of the addresses (which are a function of the seed), the **same seed yields the
  same identity id on every device**, with no server and no sync — the id is rederived, never stored
  centrally. The identity test pins this determinism, and pins that different account indexes are different
  identities. This is the hook every later section hangs on: a username (§3) resolves *to* this id; recovery
  (§6) restores *this* id; sync (§8) reconciles preferences *keyed by* this id — none of them needs a server
  to hold a secret, because the id is public and the secret that generates it never leaves the device.
- **`getReceiveAddresses()` returns exactly three.** The product's "only 3 identities" promise is a typed
  contract with a test asserting `toHaveLength(3)`. The UI's Receive screen is a projection of this array,
  labelled by `worksOn` so the user reads *"Ethereum, Arbitrum, Base…"* under one address rather than a wall
  of chains.

The everyday consequence is the sentence a first-time user should be able to say after thirty seconds:
*"I have a Bitcoin address, a Solana address, and one address for all the Ethereum-style networks — and
together they're just **me**."* Compare the wallet they left behind, where "me" was a spreadsheet of
per-chain accounts they were personally responsible for keeping straight. Apple Wallet does not make you
think about the magnetic-stripe track format of each card; it shows you *a card.* The `UniversalIdentity`
object is our card — a calm, named thing over cryptography the user never has to hold in their head.

---

### 1.5 · The known-answer conformance guarantee

None of the above is allowed to be *asserted*; per the Doctrine ("correctness is demonstrated, not
asserted"), the derivation is pinned to the published, independent reference vectors of each standard. If a
future refactor moved a single address by one bit, the suite goes red. This is the difference between a
wallet you can trust with real funds and a demo: the derivation is a **conformance-tested** artifact.

| What is pinned | Against | Where |
|---|---|---|
| **Bitcoin BIP-84 addresses** | The official BIP-0084 test vectors (`bc1qcr8te4…`, account 0 & 1) | `keyring.test.ts` |
| **EVM BIP-44 address** | The canonical "abandon" address `0x9858…EcaEda94` (MetaMask/MEW/ethers agree) | `keyring.test.ts` |
| **Solana SLIP-0010 key** | The independent `ed25519-hd-key` reference implementation | `keyring.test.ts` |
| **SLIP-0010 nodes** | The **official SLIP-0010 test vectors** (vector 1 & 2, every hardened level) | `slip10.test.ts` |
| **SLIP-0010, arbitrary inputs** | Property-based cross-check vs `ed25519-hd-key` (fast-check, random seeds & paths) | `slip10.test.ts` |
| **Signature ↔ address round-trip** | EVM sig recovers to the account address; ed25519 sig verifies against the account pubkey | `keyring.test.ts` |

The SLIP-0010 coverage deserves a note because it is the load-bearing consequence of choosing to vendor the
code (§1.2). We do not merely check our own math against itself — we check it against the *official
SatoshiLabs vectors* **and** run a property-based test that hammers random seeds and random hardened paths
through both our implementation and the independent `ed25519-hd-key`, asserting byte-for-byte agreement on
both private key and chain code (`slip10.test.ts`, 50 randomized runs). A vendored crypto primitive with no
independent cross-check would be a doctrine violation; this is how we earn the right to have vendored it. The
broader device-core suite (per SECURITY.md §3, ~115 tests including BIP-32/44/84 and SLIP-0010 known-answer
vectors) surrounds these path assertions with signer, vault, and edge-case coverage — but §1's specific
guarantee is narrow and total: **the three addresses this identity resolves to are the three addresses the
standards say they must be, proven against three ecosystems' reference implementations.**

There is a security corollary worth stating explicitly, because it is where conformance meets the
non-custodial line. All of this runs in `packages/core`, a package with **zero network I/O** — lint- and
review-enforced, so there is no code path by which a seed or derived key could be transmitted (SECURITY.md
§3). Per-call private keys are wiped immediately after use (`node.wipePrivateData()` / `zeroize()` in
`keyring.ts`), and `destroy()` renders a locked keyring unusable. The derivation is not only correct; it is
correct *on the device, and only on the device.* Recovery (§6), device trust (§7), and sync (§8) all inherit
this floor and may never lower it: if any of them ever required a server to hold seed-equivalent material,
the feature would be redesigned, not shipped.

---

### 1.6 · What is real here, and what §2–§9 will build (roadmap, tagged)

Because most of Chapter 5 describes a *target*, §1 must be scrupulous about the line — and the line is
unusually favorable here: **the 3-address architecture is shipped and conformance-tested today.** What §1
asserts is real, in the code cited above:

- ✅ **Shipped:** the one-seed → three-address derivation (BIP-84 / BIP-44 / SLIP-0010); the secp256k1/ed25519
  curve split; the universal EVM address across all EVM chains; the `UniversalIdentity` object with a stable
  device-independent id and exactly three receive addresses; multi-account (2³¹ identities from one seed,
  §5); on-device encrypted keystore and on-device signing across all three chains; seed backup / verify /
  wipe; import by mnemonic; and the known-answer conformance suite.

The elaborations this triple *enables* are the target the rest of the chapter designs, and none of them ship
today — they are tagged **(roadmap)** wherever they appear:

- **(roadmap)** ERC-4337 smart-account abstraction, gas abstraction, and session keys build *on top of* the
  EVM leg of the triple without changing it — the EOA address stays the identity's root (§2).
- **(roadmap)** A human-readable universal username (ENS/SNS-style resolution) resolves *to* the identity id
  of §1.4, never replacing the addresses beneath it (§3).
- **(roadmap)** Address virtualization and cross-chain mapping present the triple as an even calmer surface,
  bounded by the "same address ≠ same balance" discipline of §1.3 (§4).
- **(roadmap)** Social recovery / MPC / passkey recovery, device trust, and multi-device sync all reconcile
  *around* the seed and the identity id — and, per §1.5's corollary, none may put seed-equivalent material on
  a server (§6, §7, §8).
- **(roadmap)** Enterprise identity (teams, roles, treasury) composes multiple of these identities under
  organizational policy (§9).

Stating the split this way is not a hedge; it is the point. The parts of "universal identity" that already
work are the parts rooted in *deterministic cryptography we could test to exhaustion.* The parts still ahead
are the parts that add *convenience and human legibility* on top — and they are ambitious precisely because
the foundation under them is solid and proven, not because we are hand-waving the hard part. §1 is the hard
part, and it is done.

---

### 1.7 · What §1 commits, and how it frames the chapter

- **Three addresses, not thirty.** One BIP-39 seed resolves to exactly one Bitcoin (BIP-84), one universal
  EVM (BIP-44), and one Solana (SLIP-0010) address per identity — the minimum honest surface, set by the
  number of signature schemes, not the number of chains.
- **The curve split is physics, not preference.** secp256k1 (Bitcoin + all EVM) and ed25519 (Solana) are
  different curves; a single key cannot sign both, which is why the triple cannot collapse further and why
  SLIP-0010 is vendored alongside BIP-32.
- **One EVM address, every EVM chain — free; every EVM *balance* — not.** The address is a pure function of
  the public key with no chain ID, so it is universal across L2s natively; cross-chain value movement remains
  an explicit bridge, never a relabeling.
- **Identity, not addresses.** The triple is wrapped in a `UniversalIdentity` with a stable, device-independent
  id derived from the addresses — so the user manages "me," rederives it on any device with no server, and the
  addresses are a detail they reveal, not a burden they carry.
- **Conformance is the guarantee.** The three addresses are pinned to the published BIP-84, BIP-44, and
  SLIP-0010 reference vectors and cross-checked against independent implementations — demonstrated, not
  asserted — and all of it runs on-device in a package with zero network I/O.

This frames the rest of Chapter 5. **§2 (Smart Account Abstraction)** adds ERC-4337 capability on the EVM leg
without disturbing the root EOA. **§3 (Human-Readable Identity & Username)** puts a name on the §1.4 identity
id. **§4 (Address Virtualization & Cross-Chain Mapping)** makes the triple an even calmer surface while
keeping the §1.3 balance-boundary honest. **§5 (HD Accounts & Multi-Account)** unfolds the "one identity per
account index, 2³¹ available" mechanics this section deferred. **§6 (Recovery)**, **§7 (Device Trust)**, and
**§8 (Multi-Device Sync)** all reconcile around the seed and the identity id, inheriting §1.5's non-custodial
floor. **§9 (Enterprise Identity)** composes many of these identities under organizational policy. Every one
of them treats the 3-address triple as the fixed point it builds up from — the seed of the chapter, in both
senses of the word.


## §2 · Smart Account Abstraction

> *An externally-owned account is a key with an address bolted on: it can do exactly one thing — sign — and
> it pays for that privilege in the chain's native coin, one signature at a time, with no memory and no
> rules. A smart account inverts that: the address becomes a small program that decides what the key is
> allowed to authorize. The prize is enormous — pay gas in any token, hand out bounded, expiring keys,
> batch a five-step intent into one tap, and let the chain itself refuse a payment that breaks your policy.
> The peril is exactly as large — because a smart account is **code with authority over your funds**, and
> code can hide a backdoor a bare key never could. This section designs the prize and fences the peril.
> Almost all of the on-chain substrate here is **roadmap**; the decision layer that will drive it is
> already shipped as pure, tested code. We are scrupulous about which is which.*

§1 established the floor: a single **externally-owned account (EOA)** on the EVM side of the Universal
Identity — one secp256k1 address, derived at BIP-44 `m/44'/60'/0'/0/i`, EIP-55-encoded, valid on every
supported EVM chain, generated and signed for entirely on-device. This section asks the next question:
*what if that address could do more than sign?* Account abstraction — the **ERC-4337** family and the
newer **EIP-7702** delegation path — turns the account from a bare key into a programmable policy object
without ever taking the key off the device. It is the mechanism behind gas abstraction, session keys,
batched intents, and on-chain policy. It **layers on** the §1 identity; it does not replace it. And to be
honest up front, in the language of [SECURITY.md §0](../../SECURITY.md)'s status legend: the account
today is **✅ an EOA**; the smart-account substrate is **⏭ mandated roadmap**; the *decision engine* that
will feed it — [`packages/gas`](../../packages/gas/src/engine.ts) — is **✅ shipped, pure, and tested**,
and deliberately stops one inch short of the wire. That inch is the whole safety story, and we spend this
section on it.

This section owns the **programmable-account layer** for the EVM identity. It does not re-derive the EOA
(that is §1), does not cover human-readable naming (§3), address virtualization (§4), the HD account tree
(§5), key recovery (§6), the device trust model (§7), multi-device sync (§8), or the enterprise treasury
model (§9). It references those siblings; it duplicates none of them. Where it touches the *approval* of a
smart-account action it defers to the shipped approval machine documented in
[Chapter 4 §7](../ai/conversation-ux-reference.md) — the smart account changes *what* gets signed, never
*who* signs.

---

### §2.1 · Why the EOA is the floor, not the ceiling

The EOA is the right default and will remain the default for a long time. It is the simplest possible
non-custodial account — *the account **is** a key* — so it inherits the Doctrine for free: there is no
contract to audit, no upgrade path to abuse, no admin role to compromise. It is universally supported on
every EVM chain, it is what MetaMask, Rabby, and Phantom's EVM side all use, and it interoperates cleanly
with import/export across Ledger and every other BIP-44 wallet ([SECURITY.md §3.1](../../SECURITY.md)).
For a first-time user moving real money by typing one sentence, "your account is your key, and only your
key can move it" is the honest, teachable mental model.

But the EOA is a floor, and the ceiling is low. Four limits matter for an intent-first wallet:

| EOA limit | What it costs the intent experience |
|---|---|
| **Gas is native-coin only** | A user holding only USDC on Base cannot pay a fee — they must first acquire ETH, a dead-end the assistant cannot route around. |
| **One signature per call** | A "move everything from Ethereum to Solana" intent is *N* separate approve/swap/bridge signatures, each a fresh confirm sheet — the exact friction Chapter 4 exists to remove. |
| **No delegated, bounded authority** | Automation ("every Monday buy ₹5000 BTC") has no on-chain way to grant a *scoped* key; today it must fall back to per-tx confirmation or an app-layer cap. |
| **No on-chain policy** | Every guarantee ("never spend over $X", "only these venues") lives in *client* code the chain never sees — advisory, not enforced by the settlement layer itself. |

Account abstraction addresses all four without asking the user to give up the thing that makes the wallet
non-custodial: sole control of a key on their own device.

---

### §2.2 · What ERC-4337 would add — the capabilities *(roadmap)*

ERC-4337 introduces an alternative transaction lifecycle that runs **above** the base protocol, so it
needs no consensus change: a user signs a `UserOperation` (not a raw EIP-1559 transaction); a **bundler**
(an untrusted relayer) packs it into a real transaction to a singleton **EntryPoint** contract; the
EntryPoint calls the user's **smart-account contract**, which runs `validateUserOp` — *its own code* —
to decide whether the operation is authorized, optionally letting a **paymaster** contract pay the gas.
The account contract is deployed (or counterfactually addressed) by an **account factory**. The four
capabilities this unlocks, each tied to a concrete intent-UX payoff:

| Capability | Mechanism | What the user finally gets |
|---|---|---|
| **Gas abstraction** | A paymaster pays the EntryPoint; the user reimburses it in an ERC-20 (or the platform sponsors it). | "Send $50 of USDC" works with *zero ETH in the wallet* — fees paid in the token they hold, or waived. |
| **Session keys** | A validation module in the account authorizes a *secondary* key under an on-chain scope (cap · allowlist · expiry). | "Every Monday buy ₹5000 BTC" runs unattended within a grant the chain itself enforces — and the grant is revocable in one tap. |
| **Batched intents** | One `UserOperation` carries an *array* of calls, executed atomically. | A five-leg cross-chain move becomes **one** signature and one confirm sheet; either all legs land or none do. |
| **On-chain programmable policy** | `validateUserOp` rejects any operation that violates the account's coded rules — spend caps, allowlists, spending limits per window. | The wallet's "never spend over $X" stops being a promise the client keeps and becomes a rule the *chain* refuses to break, even if the client is compromised. |

Benchmark: Safe (the incumbent multisig smart account), ZeroDev/Kernel and Biconomy (4337 SDKs),
Coinbase Smart Wallet and Argent (session keys + passkey/social recovery), and the modular-account
standards **ERC-7579 / ERC-6900** that make the validation modules above pluggable. We are not inventing
account abstraction; we are deciding *how to adopt it without weakening the non-custodial line* — which is
the entire content of §2.3.

---

### §2.3 · How it layers on the identity without breaking non-custodial

The load-bearing claim of this section: **a smart account is policy, not custody.** Making it true is a
design constraint, not an aspiration.

**The disposer does not change.** In an EOA transfer, the on-device secp256k1 key signs an EIP-1559
envelope. In a 4337 flow, the *same* on-device key signs the `UserOperation` hash, and the account
contract's `validateUserOp` verifies that signature against the key it was configured to trust. The
bundler and paymaster are **Zone-4, assumed-hostile relayers** in the trust model
([SECURITY.md §2.3](../../SECURITY.md)): they see the operation and the signature, but they hold no
key, and they cannot alter a byte of the validated calldata without invalidating the signature. The only
bytes that leave Zone 0 are, as always, **a signature** — never key material. Doctrine #1 is untouched:
keys are generated and used on-device, encrypted at rest (scrypt + AES-256-GCM), and never touch a server.
If any proposed smart-account design required a server to hold, co-sign with, or reconstruct a secret, it
is the wrong design and is redrawn, not shipped.

**Prefer delegating the derived address, not minting a new one.** There are two substrates, and the choice
between them is a Doctrine decision, not a convenience one:

- **EIP-7702 delegation (preferred).** The user's *existing* derived EOA — the exact `m/44'/60'/0'/0/i`
  address from §1 — signs an authorization that points the address at smart-account code. The address is
  unchanged; its balances, history, and its role as the Universal EVM identity all survive. The account
  gains smart-account powers while **staying the one address that works on every EVM chain** (§1's promise)
  and the same address contacts already know. Custody is unchanged because the authorizing signature came
  from the user's key.
- **Classic ERC-4337 counterfactual account (fallback).** An account factory yields a *new*
  `CREATE2(factory, owner, salt)` address whose owner is the derived EOA. It is deterministic, but it is a
  **different address** than the derived one — which fragments §1's single-identity promise, splits history,
  and forces a funds migration. We treat this as a fallback for chains where 7702 is unavailable, never the
  default, precisely because it dilutes the "one address" abstraction §1 exists to protect.

**Custody is what the account cannot do.** The smart account earns the name "policy, not custody" only if
it has **no path to move funds that is not gated by the user's key** — no admin role, no owner-recoverable
sweep, no vendor-held upgrade key, no module that can be installed without a user-signed grant. A contract
that a third party can upgrade to drain is a custodian wearing a non-custodial label, and the Principal
Security Engineer vetoes it on sight.

---

### §2.4 · The honest split — the decision layer is shipped, the substrate is not

This is where we refuse to overstate. None of the on-chain machinery in §2.2 ships today. What *does* ship
is the **decision engine** that a bundler-and-paymaster world would need — built to the same
"decide-not-act" pattern as `reliability`, `scale`, and the guard
([ARCHITECTURE.md §3.3](../../ARCHITECTURE.md)): a pure engine returns a *decision*; a thin injected
actuator (here, still roadmap) would perform the side effect.

[`packages/gas`](../../packages/gas/src/engine.ts) is real, pure, deterministic, unit-tested, and
already wired into runtime execution. Its own header states the line it will not cross: *"It DECIDES; it
never signs a UserOperation or moves funds."* Concretely it decides:

- **Sponsorship** ([`sponsorship.ts`](../../packages/gas/src/sponsorship.ts)) — whether the platform
  would pay a user's gas, bounded by a **per-transaction cap and a per-user-per-UTC-day cap**, and
  **failing toward `user_pays`** (the safe direction — the user can always pay their own gas; a bug can
  never over-sponsor). Money is `bigint` micro-USD end-to-end; nothing here is a float.
- **Fee-token selection** ([`feetoken.ts`](../../packages/gas/src/feetoken.ts)) — which ERC-20 the user
  would pay gas in, with a safety margin over the estimated cost.
- **Bounded EIP-1559 params** ([`estimate.ts`](../../packages/gas/src/estimate.ts)) — `maxFeePerGas` /
  `maxPriorityFeePerGas` under **hard ceilings**, so a fee spike can never silently overpay.
- **Batch grouping** ([`batch.ts`](../../packages/gas/src/batch.ts)) — folding *N* operations into the
  fewest `UserOperation`s under a max batch size; it decides the grouping, not the bundle.

So the split is clean:

| Concern | ✅ Shipped today | ⏭ Roadmap (account abstraction) |
|---|---|---|
| **Account type** | EOA — BIP-44 secp256k1, one EIP-55 address on every EVM chain (§1) | Smart account via **EIP-7702** delegation of *that same* EOA (preferred), or a 4337 counterfactual account (fallback) |
| **Gas** | User pays native ETH; bounded EIP-1559 params; `packages/gas` **decides** sponsorship / fee-token / params (pure, tested, wired into runtime) | An on-chain **paymaster** turns those decisions into real sponsored / token-paid `UserOperation`s |
| **Multi-step intent** | *N* sequential device signatures; settlement sequences approve→swap safely | One signature over a **batched** `UserOperation`; `decideBatch` already computes the grouping |
| **Delegated authority** | App-layer auto caps ($25/tx, $100/day), manual by default, off-chain guard | On-chain **session-key** module: scoped, capped, expiring, revocable (§2.5) |
| **Policy** | Off-chain pure gate (Policy ⊗ Risk), advisory to the signer, can only refuse | A most-restrictive subset enforced **in `validateUserOp`** on-chain, as defense-in-depth |

The headline, stated plainly: **the brain of account abstraction exists as audited code; the on-chain
hands do not.** We will not render a "smart account" toggle in the UI, or claim gas-in-any-token in
marketing, until the EntryPoint/paymaster/7702-delegate substrate is real and audited. A `✅` that is
really `⏭` is itself a Doctrine-#3 lie ([SECURITY.md §13, Q7](../../SECURITY.md)).

---

### §2.5 · Session keys — bounded authority, never a standing backdoor

A session key is the feature that makes automation ([Chapter 4](../bible/chapter-04-conversation-first-ux.md),
type 5) safe: a *secondary* key the account authorizes to act **within a scope the chain enforces** —
e.g. *"may swap up to $100/day on Uniswap for the next 7 days, and nothing else."* On-chain, the account's
validation module checks each operation against that grant; a request outside the cap, past the expiry, or
to a non-allowlisted venue simply fails `validateUserOp`.

Today this exists only in its **off-chain, app-layer** form, and we say so honestly. Auto-execution is
**off by default** (`txMode: 'manual'`); when a user enables it, it binds a **per-tx cap ($25)** and a
**daily cap ($100)** and **fails safe** — when a real USD value is unknown or a cap would be exceeded, it
reverts to a manual confirmation ([SECURITY.md §5](../../SECURITY.md); ADR-0028). That is a real,
shipped bound — but it is enforced by *client* code, not by the settlement layer. The roadmap upgrade is
to move the same bound on-chain, so that even a fully-compromised client cannot exceed it. In the status
legend, session-key caps are **🔶 partial** (caps shipped web-side); the on-chain grant model is
**⏭ mandated**.

Three invariants make a session key a *scoped delegation* and not a *standing backdoor*:

1. **It is minted by a device-signed grant.** Creating a session key is itself a fund-adjacent action that
   passes the full approval machine (§2.6) — the user signs a bounded authorization on-device; the platform
   never mints one.
2. **It is bounded and expiring by construction.** No unbounded amount, no open-ended venue set, no
   never-expiring key — the same fail-closed discipline as the broadcast guard. An unbounded grant is a
   rejected grant.
3. **It is revocable in one tap, always.** Revocation is an on-chain operation the account always exposes;
   a session key is a lease, never a transfer of ownership.

---

### §2.6 · The user-facing flow — states and the safety gate

Two smart-account actions are consequential enough to be first-class, audited flows: **enabling a smart
account** (a one-time, on-chain, hard-to-undo change to how the identity signs) and **granting a session
key** (delegating bounded authority). Both are *roadmap*, and both are designed now to the same standard as
every fund-moving flow: honest states end-to-end, comprehension before signature, and a gate that can only
refuse. Neither invents a new signer — both route through the shipped four-phase approval machine of
[Chapter 4 §7](../ai/conversation-ux-reference.md) (`plan → authorize → sign → confirm`); the device
signature is still the sole disposer.

**Enable smart account** *(roadmap)* and **Grant session key** *(roadmap)*, as state machines:

| State | Enable smart account | Grant session key |
|---|---|---|
| **default** | Honest "Smart account: roadmap — your account is an EOA today." No fake toggle. | Automation runs under app-layer caps; "on-chain session keys: roadmap." |
| **propose** | Explain the exact change: *same address (via 7702)*, gains gas-in-any-token + batching + on-chain policy; it is code; how to revert. | Show the scope form: cap, venue allowlist, expiry — every field bounded, none optional. |
| **gate** | Delegate contract must be on the **audited allowlist**; unknown/unaudited delegate → **block** (fail closed). | Grant must be bounded; unbounded amount / open venue set / no expiry → **block**. |
| **confirm** | Device signs the 7702 authorization; high-value confirm styling (irreversible-class warning). | Device signs the bounded grant; the user sees the literal cap/venues/expiry. |
| **active** | Smart account live; show the delegate code hash + a one-tap **disable/redelegate** path. | Session key active; show remaining budget + expiry + a one-tap **revoke**. |
| **error** | Simulation fails, chain lacks 7702, or delegate un-allowlisted → refuse with a reason; never a half-migrated account. | Cap unparseable, value unknown, or venue unresolved → refuse; never a wider-than-shown grant. |

The **safety gate** is the same one that governs every irreversible act
([SECURITY.md §5, §13](../../SECURITY.md)): the delegate/module contract is only usable if it is on an
**audited allowlist** — an unknown contract is refused, never guessed (fail closed, exactly as the
broadcast guard refuses an unknown chain); the grant is bounded; revocation is always available; and the
change passes a Security Review because it touches signing. On-chain policy, when present, composes
**most-restrictively** with the off-chain Policy ⊗ Risk gate — it can only *tighten* what is permitted,
never widen it, the same safe-by-construction direction as adding a policy rule
([ARCHITECTURE.md §7.5](../../ARCHITECTURE.md)).

---

### §2.7 · The risks — a smart account is code, and code can lie

An EOA has one failure mode: lose the key. A smart account adds a second, larger one: **the account itself
is a program that can be wrong or malicious.** This is not a reason to avoid account abstraction; it is the
reason to gate it behind the strictest review in the repo. The threats an EOA does not have:

- **Contract bugs** — a flaw in `validateUserOp` or a module can let an operation through that should have
  been refused. Mitigation: only audited, pinned account/module contracts; external audit of the execution
  path **and any smart-account modules** is a **GA gate**, not a nicety ([SECURITY.md §10](../../SECURITY.md)).
- **Upgrade / admin backdoors** — an upgradeable proxy or an admin role that a vendor (or an attacker who
  pops the vendor) can use to swap in draining code. Mitigation: **no upgrade or admin authority outside the
  user's sole, on-device key.** A remotely-upgradeable account is custody in disguise and is vetoed.
- **Malicious or over-scoped modules** — a validation module that authorizes more than the user granted, or
  a session key with a cap that is effectively unbounded. Mitigation: modules are allowlisted and audited;
  grants are bounded and fail-closed (§2.5).
- **Paymaster / bundler griefing** — a hostile relayer cannot move funds (it holds no key), but it can
  censor or reorder. Mitigation: relayers are treated as Zone-4 hostile; the account never trusts relayer
  claims, and a stuck operation falls back to a direct EOA path, never to an unguarded one.

The litmus test is the same one the whole architecture is built around
([SECURITY.md §4](../../SECURITY.md)): *if the bundler, the paymaster, the LLM, and every module were
fully attacker-controlled, what is the worst outcome?* The answer must remain **"a `UserOperation` the
account's on-chain validation refuses, or one the user declines at the confirm sheet."** If any hostile
combination can produce a fund movement the user's key did not authorize, the design is wrong — add a gate
or remove the capability. That is the price of admission for putting code between the key and the funds,
and we pay it before the substrate ships, not after.

---

### What §2 commits us to

- **The EOA is the floor and the default; the smart account is an upgrade, not a replacement** — added only
  when it can be added without weakening the non-custodial line.
- **The disposer never changes.** The on-device key signs every `UserOperation`; bundlers and paymasters
  are assumed-hostile relayers that hold no key and can move nothing. Keys never leave the device.
- **Delegate the derived address (EIP-7702), don't fork it.** The smart account keeps §1's one-address
  identity and its history; a new counterfactual address is a reluctant fallback, never the default.
- **The decision layer is shipped and honest; the substrate is roadmap and labelled.** `packages/gas`
  decides sponsorship, fee-token, bounded params, and batching as pure tested code that *never signs*; no
  smart-account UI or claim ships until the on-chain machinery is real and audited.
- **A smart account is policy, not custody** — no admin, no vendor-upgrade, no standing backdoor; session
  keys are bounded, expiring, and revocable; on-chain policy only ever tightens the off-chain gate.
- **Because it is code with authority over funds, it clears the highest bar** — external audit before GA,
  fail-closed allowlists for every module, and a worst-case that stays "a rejectable operation."

The buildable specifics — the EntryPoint/paymaster integration, the 7702 authorization format, the module
allowlist, and the on-chain session-key schema — land with their ADRs when the substrate is implemented;
until then, this section is the target we are building toward, marked as such.


## §3 · Human-Readable Identity & Universal Username

> *Names instead of hex.* Chapter 1 made the promise — *"talk to your money"* — and named the enemy on the
> way there: chains, RPCs, gas, and, most viscerally, the **address**. A `0x` string, a `bc1` string, a
> base58 string are the last place the machine still forces its internal representation onto the human. This
> section is about deleting that — letting a person send to *a name they can read and recognise* while the
> wallet does the hostile hex behind the glass. It is grounded in the **real** resolution code:
> [`services/api/src/ens.ts`](../../services/api/src/ens.ts) (ENSIP-1 namehash + live registry reads,
> known-answer-tested in [`ens.test.ts`](../../services/api/test/ens.test.ts)), the recipient resolver in
> [`packages/runtime/src/runtime.ts`](../../packages/runtime/src/runtime.ts), the contact/address engine in
> [`packages/identity/src`](../../packages/identity/src) (`contacts.ts`, `address.ts`), and the shipped
> send-by-name UX in [`apps/web/src/App.tsx`](../../apps/web/src/App.tsx) and
> [`apps/mobile/FlowSend.tsx`](../../apps/mobile/FlowSend.tsx). It obeys the Doctrine: a name is a *lookup*,
> the address it resolves to is *shown*, and the **on-device signature disposes** (Doctrine #2). Where this
> section and the code disagree, one of them is a defect — reconcile on purpose, never drift.

Cross-refs: the three real addresses a name resolves *into* are **§1 · 3-Address Architecture**; mapping one
handle across those three chains internally is the same machinery as **§4 · Address Virtualization &
Cross-Chain Mapping**; a name is *never* a recovery factor — that is **§6 · Recovery Architecture**; and the
account a name belongs to is **§5 · HD Accounts & Multi-Account**. This section owns exactly one transform:
**a human-typed name → a validated, *shown* address, or an honest question** — and its safety gate.

---

### 3.1 · The problem — an address is a hostile primitive

Chapter 1 lists the seven things a user should *never* think about. The address is not on that list only
because it is worse than the rest: bridges and gas are *decisions* we can make for the user, but an address
is a *value they must get exactly right or lose their money forever*. Consider the three canonical forms our
identity exposes (§1):

| Chain | A real receive address |
|---|---|
| Bitcoin (BIP-84) | `bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq` |
| Ethereum / EVM (BIP-44) | `0x71C7656EC7ab88b098defB751B7401B5f6d8976F` |
| Solana (SLIP-0010) | `9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM` |

Every property of these strings is user-hostile. They are **long** (34–44 chars), **unmemorable**,
**unpronounceable**, **un-typeable without copy-paste**, **visually confusable** (a truncated `0x71C7…976F`
looks like a thousand others), and **catastrophically unforgiving** — one wrong character is not an error
message, it is a permanent, irreversible loss to an address nobody controls. This is the exact opposite of
every other rail a person uses: an email address, a phone number, a bank handle, a `@username`. Chapter 1's
test — *"can a non-technical stranger move real money by typing one sentence"* — is failed at the last inch
if that sentence has to contain `bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq`.

So the goal of this section is blunt: **the user should be able to type a name.** *"Send 250 USDC to
alice.eth."* *"Pay Rahul ₹5,000."* And the wallet resolves the name to the address, **shows the address it
resolved**, and lets the on-device key sign against *that shown address* — never a hidden one.

---

### 3.2 · What "resolution" means here — a name is a pointer, the address disposes

Before any mechanism, the invariant. A human-readable name is **not** an identity and **not** an authority.
It is a *pointer* — a lookup from a label to an address — and pointers can be stale, wrong, or hostile. The
Doctrine forces the safe shape:

- **The name never signs.** Resolution produces an *address*; the address is what the confirm sheet restates
  and what the on-device key signs against (Doctrine #2). If resolution is compromised, the worst it can do is
  propose a *wrong address* — which the user still sees, still confirms, and still signs explicitly. A name is
  a convenience layer *on top of* the address flow, never a replacement for it.
- **Fail closed (Doctrine #5).** A name that does not resolve is **`not_found`** — an honest question back to
  the user — *never* a guessed or placeholder address. This is enforced in the real resolver: an unresolvable
  `.eth` returns `{ kind: 'not_found' }` and the planner asks the user to clarify
  ([`runtime.ts`](../../packages/runtime/src/runtime.ts) L197–207); a name with no address record returns
  `null`, never `0x000…` ([`ens.ts`](../../services/api/src/ens.ts) `wordToAddress`).
- **Resolution touches no secret.** A name→address lookup is a read of *public* data — as public as a balance.
  It happens with no key, no seed, no signature. The non-custodial line (Doctrine #1) is untouched: keys stay
  on-device; only public addresses ever move. *(The one honest caveat — where the read happens, and who sees
  the recipient name — is §3.8's threat model.)*

That is the whole philosophy: **names make the address typeable; the address, shown, disposes.**

---

### 3.3 · Shipped today — ENS forward resolution (`name.eth → address`)

Here the honest ledger diverges from a naïve "this is all roadmap." **Forward ENS resolution is real and
merged.** A user can already send to `alice.eth` in the web app, the mobile app, and the chat/intent path,
and the resolution is done with *correct, conformance-tested cryptography* — not a stub.

**The mechanism ([`services/api/src/ens.ts`](../../services/api/src/ens.ts)).** Resolution is the canonical
ENS two-hop, done live over the mainnet RPC:

1. **Namehash (ENSIP-1).** The name is reduced to a 32-byte node by recursive `keccak256` over the reversed,
   dot-separated labels — `namehash('') = 32 zero bytes`, then fold each label hash in. This is exact and
   **known-answer-tested** against the published vectors in
   [`ens.test.ts`](../../services/api/test/ens.test.ts):

   ```
   namehash('eth')         = 0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae
   namehash('vitalik.eth') = 0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835
   ```

   The same discipline we apply to BIP-32/44/84 and SLIP-0010 in §1 — *a standard gets a conformance test, not
   a "looks right"* — is applied to the name math here.

2. **Registry → resolver → address.** Two `eth_call`s against the well-known mainnet registry
   (`0x0000…2e1e`): `resolver(bytes32)` (selector `0x0178b8bf`) to find the name's resolver, then
   `addr(bytes32)` (selector `0x3b3b57de`) on that resolver to read the address. A name with **no resolver**
   or **no address record** returns `null` — never a fabricated address (no-fake-data, Doctrine #3). Input is
   validated by a strict grammar (`^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth$`) before any network call, so malformed
   or hostile input is rejected deterministically, offline.

**The send-by-name UX (the anti-spoof gate).** Both clients resolve *while the user types*, debounced, and —
critically — **render the resolved address and make the user confirm it.** The shipped state machine
([`apps/mobile/FlowSend.tsx`](../../apps/mobile/FlowSend.tsx) `useRecipient`;
[`apps/web/src/App.tsx`](../../apps/web/src/App.tsx) send panel):

| Input state | What the user sees | Can they proceed? |
|---|---|---|
| **Empty / not `.eth`** | falls through to contact / raw-address resolution (§3.4) | per that path |
| **Resolving** | `⏳ Resolving ENS…` (pending, non-blocking) | no — the primary action is disabled while resolving |
| **Resolved** | `✓ 0x71C7…976F` — **the actual resolved address, shown** | yes; the confirm sheet restates `alice.eth → 0x71C7…976F` |
| **No address record** | `✕ No ENS address record` | no |
| **Malformed name** | `✕ Not a valid address, ENS name, or saved contact` | no |

Two anti-spoof properties fall out of that table, and they are the reason send-by-name is *safe* and not just
*convenient*:

- **The resolved address is always surfaced, never hidden.** The green state is not `✓ alice.eth` — it is
  `✓ 0x71C7…976F`. And the review/confirm step renders the *substitution explicitly*:
  `alice.eth → 0x71C7…976F` (web: `{ensActive ? \`${sendTo} → ${effectiveTo}\` : effectiveTo}`). The user
  signs against an address they were shown, satisfying Chapter 4's *comprehension-precedes-signature* rule and
  §3.2's invariant.
- **In chat, a bad name asks instead of guessing.** The intent path resolves `.eth` through the same resolver
  and returns `not_found` on failure, which the clarification engine (Chapter 4) turns into a question —
  *never* a silent wrong send. This is Chapter 4's *"the AI asks, it never guesses"* rule enforced at the
  resolution seam.

**Honest scope of what ships.** The shipped resolver is **mainnet L1, `addr(node)`, `.eth` only.** It does not
yet do ENSIP-10 wildcard/offchain (CCIP-read) resolution, ENSIP-9 multi-coin records (a BTC or SOL address
stored under an ENS name), or L2/testnet name spaces. Those are §3.5's roadmap. What is *real* is the thing
that matters most for Chapter 1's promise: **a person can type a name instead of hex, and the wallet resolves
it correctly, shows the address, and refuses to guess.**

---

### 3.4 · The resolution ladder — contact → name service → raw address

A recipient string is not always a name-service name; it might be a saved friend, or a raw address the user
pasted. The wallet resolves recipients through a fixed, **most-trusted-first** ladder, and the order is a
safety property, not a preference:

1. **Saved contact (most trusted).** If the string matches a saved contact name, that contact's address wins —
   it is *the user's own asserted mapping*, the least spoofable link in the chain. Contacts are the shipped
   [`ContactBook`](../../packages/identity/src/contacts.ts): each is keyed by `(ecosystem, normalized
   address)` so the same address cannot be saved twice, carries a **`verified`** flag that flips true after the
   *first successful send* (a soft anti-mistake signal shown in the UI), and — per Doctrine #1 — holds **only
   public data on-device**: a name and an address, *never* a key. The mobile flow additionally re-validates a
   contact's address against the *active chain* before it reaches the signer, so a saved Solana contact can
   never be routed into the EVM signer (`FlowSend.tsx` L165–172).
2. **Name service.** If the string is a `.eth` name, resolve via §3.3. *(Other name services are §3.5 roadmap.)*
3. **Raw address (least convenient, always available).** Otherwise treat the string as a literal address and
   validate it hard through [`classifyAddress`](../../packages/identity/src/address.ts): EVM must pass its
   **EIP-55 mixed-case checksum** (the silent-corruption guard), bech32/bech32m and base58check checksums must
   verify, Solana must be a 32-byte key, and the address family must match the chain being sent on. An
   unrecognisable string is `✕ Not a valid address, ENS name, or saved contact` — closed, not guessed.

This ladder is the same [`resolveRecipient`](../../packages/identity/src/contacts.ts) contract the Intent
Engine already depends on, extended with the name-service hop. It **never guesses among ambiguity**: two
contacts named "Rahul" resolve to `{ kind: 'ambiguous' }`, which Chapter 4's clarification engine renders as
*"Which Rahul? — Rahul Sharma · Rahul Gupta · rahul.eth"* — exactly the disambiguation Chapter 4 §Clarification
shows. Raw-address send is the shipped floor; every name layer above it is an accelerator that can only ever
*propose an address the floor then re-validates*.

---

### 3.5 · The multi-chain name gap (roadmap) — SNS and ENSIP-9/10

The shipped resolver speaks one dialect: Ethereum, `.eth`, one address record. The universal-identity promise
is bigger — a name should resolve on *any* of the three chains a user holds. Closing that gap is roadmap, and
it decomposes into three honest, standards-based pieces:

- **SNS — Solana Name Service (roadmap).** A `.sol` name (the SNS / Bonfida registry, resolved through the
  Solana Name Service program's derived accounts) should resolve to a Solana address exactly as `.eth` resolves
  to an EVM one. This is a *sibling resolver* injected alongside the ENS one at the same `resolveRecipient`
  seam — no new architecture, just a second implementation of the same `(name) => Promise<address | null>`
  shape. Not shipped: today a `.sol` string falls through to raw-address validation and, unless it *is* a valid
  base58 address, is rejected.
- **Multi-coin ENS records — ENSIP-9 (roadmap).** ENS names can already store addresses for *multiple* chains
  via `addr(node, coinType)` (SLIP-44 coin types — `0` for BTC, `501` for SOL, `60` for ETH). So `alice.eth`
  could carry `alice`'s **Bitcoin** and **Solana** addresses too. The shipped resolver reads only the legacy
  single-address `addr(node)`; reading multi-coin records — so *"send BTC to alice.eth"* resolves to alice's
  *Bitcoin* address — is roadmap.
- **Offchain / wildcard — ENSIP-10 + CCIP-read (roadmap).** L2 and offchain names (the dominant growth path for
  ENS) resolve through wildcard resolution and CCIP-read gateways. The shipped path is L1-only; ENSIP-10 support
  is roadmap and gated on the same *"resolution is public data, verified, and shown"* safety bar as everything
  else here.

Benchmark: this is precisely the maturity ladder Phantom and Rabby climbed — start with the one dominant name
service on the one dominant chain, then generalise to multi-chain records and offchain resolution. We start on
the same rung (`.eth` L1, shipped) and design the next rungs as pluggable resolvers behind one seam.

---

### 3.6 · The Intent-Wallet universal username (roadmap)

ENS resolves a name to *one chain's* address; SNS to another's. But the product's core innovation (Chapter 5's
thesis) is that the user manages **one identity across three chains.** The natural apex is a **universal
username** — a single handle, say `@alice`, that resolves to *all three* of alice's addresses at once, so a
counterparty can pay her in BTC, ETH, or SOL by typing one thing. This is **roadmap**; here is the honest
design, and why it does not break the non-custodial line.

**The mapping already has a deterministic anchor.** §1's identity is not an abstraction we would have to invent
a key for — it already computes a stable, device-independent id from the address triple
([`identity.ts`](../../packages/identity/src/identity.ts) `computeIdentityId`): a short `sha256` over
`btc | evm(lowercased) | sol`. A universal username is a *human-chosen alias* for that triple:

```
@alice ──▶ { btc: bc1q…,  evm: 0x71C7…,  sol: 9WzD… }   ← the three §1 receive addresses
                    (identityId = sha256(btc|evm|sol)[:32], already computed today)
```

**It holds no secret — so it needs no custody.** Every value in that record is a **public address**. Publishing
a `@handle → {btc, evm, sol}` map exposes nothing a block explorer does not already expose. The universal
username can therefore be implemented as *public records the user controls*, with **zero server custody of any
secret** (Doctrine #1), via any of:

- **ENS text/multi-coin records (reuse, roadmap):** store the SOL and BTC addresses as ENSIP-9 records under an
  ENS name the user already owns — the "universal username" is then just *"read all coin records for this
  name."* No new registry, no new trust root.
- **A public registry (roadmap, if built):** a `@handle → triple` directory. If we ever operate one, it stores
  **only public address triples** — *never a key, seed, or any secret* — and every entry is **self-certifying**:
  a handle's binding is only valid if it carries a signature *from each of the three addresses it claims*,
  proving the identity that owns those keys asserted the mapping. A server that holds only public data and can
  only serve *self-signed* mappings cannot silently substitute an address — the substitution would fail
  signature verification on-device. This is the redesign the Doctrine demands: *if a feature would need the
  server to hold a secret, redesign the feature* — and here we do not need it to.

**It still disposes through the address.** A universal username changes *nothing* about §3.2: it resolves to
three addresses, the relevant one is *shown*, and the on-device key signs against the shown address. The handle
is sugar; the address is the authority.

Benchmark: this is the wallet analogue of a payment handle (Venmo `@user`, UPI VPA, an email you can pay) —
but built on *self-sovereign, self-certifying, non-custodial* records rather than a custodial directory. That
distinction is the whole product.

---

### 3.7 · Reverse resolution — names in Activity (roadmap)

Forward resolution (§3.3) fixes *sending*. The mirror problem is *reading*: Chapter 3 §14 is unambiguous —
**"Transactions should read like stories, not hashes"** (*"Yesterday — Swapped 1000 USDC → 0.56 ETH ·
Completed,"* not `0x123… → Swap → Hash`). A counterparty rendered as `0x71C7…976F` is a hash, not a story.
**Reverse resolution** — showing a *name* for a known address — is how Activity, contacts, and confirm sheets
become legible. Its honest status:

- **Shipped today:** Activity and the send flow already resolve an address to a **saved contact name** when one
  exists (the [`ContactBook`](../../packages/identity/src/contacts.ts) reverse lookup by normalized address),
  and a resolved/known recipient is shown with its `✓`. So *"paid Rahul"* already renders when Rahul is a saved
  contact — a real, on-device, zero-network story.
- **Roadmap:** ENS **primary names** (the reverse record — `address → name.eth`) and SNS reverse records, so an
  address the user has *never saved* still renders as `vitalik.eth` in Activity. The honest design: on rendering
  a counterparty, attempt reverse resolution, **and forward-verify the answer** (resolve the returned name back
  to an address and confirm it round-trips to the original — the standard ENS anti-spoof check, since the
  reverse record is user-set and unverified on its own). A name that does not round-trip is **not shown as a
  name** (fail closed, Doctrine #5); the address is shown instead. Reverse names are cached on-device and are
  *display-only* — a reverse name is *never* a send target and *never* a recovery factor.

The ordering of trust for a *displayed* name mirrors §3.4's ladder for a *sent* name: **saved contact
(shipped, most trusted) → verified primary name (roadmap) → raw address (always the honest fallback).**

---

### 3.8 · The threat model of names — where trust actually lives

Introducing names introduces a *resolution-trust dependency*, and an honest architect names it rather than
hiding it. Three real threats, and where the design puts the backstop:

- **A malicious or MITM'd resolver returns the wrong address.** This is the sharpest risk: a compromised
  resolution path could map `alice.eth` to an *attacker's* address, and the user — unable to eyeball whether a
  name "should" map to a given hex — might sign. The backstops are layered: (1) the resolution is
  **deterministic and standards-exact** (ENSIP-1 namehash is known-answer-tested; the registry address and
  selectors are fixed constants, not server-supplied), so a *correct* resolver cannot be tricked into the wrong
  node; (2) the resolved address is **always shown and explicitly confirmed** (§3.3) — a *known* recipient's
  substituted address is at least *visible*; (3) the **saved-contact path (§3.4) sits above name resolution** —
  for a repeat counterparty, the user's own verified mapping wins and never touches a resolver; (4) **roadmap:
  client-side resolution over the user's own RPC**, removing the server from the path entirely. The residual
  truth remains: for a *brand-new* name-based recipient, the user is trusting the resolver — which is exactly
  why the address is shown and why raw-address send (§3.4) is always the available floor.
- **Homograph / look-alike names.** `alicе.eth` (Cyrillic `е`) is not `alice.eth`. The shipped grammar already
  constrains ENS input to `[a-z0-9-]`, rejecting mixed scripts at the door; the roadmap adds confusable-script
  detection and a visible warning on names outside a normalised set. A name that looks like a trusted name but
  resolves to a different address is a spoof, and the *shown resolved address* is the tell.
- **Privacy — the resolver learns the recipient.** In the shipped path, resolution runs server-side over the
  API's mainnet RPC, so the API operator can observe *"this session is about to pay alice.eth."* No key or
  secret leaks (Doctrine #1 is intact — the private key never leaves the device), but the *recipient metadata*
  does. The honest roadmap fix is client-side resolution over the user's own node, so even that metadata stays
  local. We state this plainly rather than implying names are free of cost.

The through-line: **names are a convenience layer, and the address is the source of truth.** Every threat above
is bounded by the same invariant — the address is resolved deterministically, shown to the user, re-validated
by the deterministic core, and signed on-device. A name can make a send *easier*; it can never make a send
*happen without the user seeing and signing the address.*

---

### 3.9 · What §3 commits us to

- **The address is the last piece of hostile hex, and we delete it from the user's hands** — Chapter 1's
  promise fails at the last inch if a sentence must contain `bc1q…`. A name makes the recipient *typeable and
  recognisable*; the shown address makes it *safe*.
- **Shipped, honestly:** ENS forward resolution (`name.eth → address`) with **conformance-tested ENSIP-1
  namehash**, live registry reads that **never fabricate an address**, and a send-by-name UX in web, mobile,
  and chat that **shows the resolved address, confirms the substitution, and refuses to guess** on failure.
  Saved-contact resolution (name↔address, on-device, `verified`-marked) is shipped both directions.
- **Roadmap, designed here:** SNS and ENSIP-9/10 multi-chain resolution, the **universal username** (`@handle →
  three public addresses`, self-certifying, **no server custody of any secret**), and ENS/SNS **primary-name
  reverse resolution** so Activity reads as *stories, not hashes* (Chapter 3 §14) — each tagged roadmap, none
  presented as shipped.
- **The Doctrine holds at every layer:** a name is a *lookup, not an authority* (Doctrine #2 — the on-device
  signature disposes against the shown address); resolution failure is `not_found`, never a guess (Doctrine
  #5); resolution touches **public data only, no key ever** (Doctrine #1); and no name is ever a recovery
  factor (that is §6). Names make the wallet *legible*; they never make it *less honest*.


## §4 · Address Virtualization & Cross-Chain Mapping

> *A wallet's cruelest tax is the address. Not the key — the user never sees the key — but the
> forty-two-character strings they are forced to sort, label, and never, ever confuse. This section is
> how "one identity" hides "many addresses," and how the machine that does the hiding is the same
> deterministic machine that refuses to lie about it.*

§1 fixed **which three keys exist** and **why** — Bitcoin, EVM, and Solana, each a distinct signature
scheme, each derived on-device from one seed. This section sits one layer up. It is about **mapping**:
how a single universal identity projects into the concrete addresses a chain actually understands, how
an *outcome* the user typed in Chapter 4 ("send Priya 50 USDC," "let me receive some SOL") is resolved
to the *one correct address on the one correct network*, and how the system guarantees it never hands a
depositor an address their coins would fall through. The three keys are the atoms; virtualization is the
chemistry that makes them feel like one substance.

The load-bearing claim: **the user manages an identity; the wallet manages addresses.** Every other
wallet inverts this — it makes the human the address router, forcing them to pick "Ethereum vs.
Arbitrum vs. Base" before they are allowed to move a dollar, and punishing a wrong guess with permanent
loss. Intent Wallet's promise (Chapter 1) is that a non-technical stranger moves real money by typing
one sentence and is *never lied to and never loses funds*. Address sprawl is precisely where that
promise is won or lost, so the mapping layer is not a convenience feature — it is a **safety surface**,
and it is built like one: pure, typed, exhaustively classified, and fail-closed.

---

### 4.1 · The virtualization model — one identity, three keys, unbounded venues

The abstraction has exactly three layers, and it is worth naming them precisely because the whole
chapter's honesty depends on not blurring them:

1. **The identity** — one master identity per HD account index, a stable opaque id derived from the
   address triple (`computeIdentityId`, `packages/identity/src/identity.ts`). It is what the user *is*.
2. **The receive addresses** — exactly **three** concrete, chain-native addresses the identity exposes:
   one Bitcoin, one universal-EVM, one Solana (`getReceiveAddresses`). It is what the user *shares*.
3. **The venues** — the effectively unbounded set of chains, protocols, and token accounts those three
   addresses transact against: six-plus EVM networks on one EVM key, every SPL mint on one Solana key,
   every UTXO on one Bitcoin key. It is what the wallet *manages so the user never has to*.

The first and most important act of virtualization is already shipped, and it is the EVM key. In the
codebase, an address is not modeled as a bare string; it is a `ReceiveAddress` that carries the set of
networks it is valid on:

```ts
export interface ReceiveAddress {
  ecosystem: Ecosystem;          // 'btc' | 'evm' | 'sol'
  address: string;
  network: Network;              // 'mainnet' | 'testnet'
  derivationPath: string;        // the exact BIP/SLIP path (§1)
  /** Networks this receive address covers — one for BTC/SOL, ALL EVM chains for EVM. */
  worksOn: string;
}
```

For the EVM identity, `worksOn` reads **"Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain"**
(`deriveUniversalIdentity`). This is not marketing; it is a cryptographic fact. An EVM address is the
last 20 bytes of the Keccak-256 of the secp256k1 public key, and that derivation is **chain-independent**
— EIP-155 lives in the *transaction*, never in the *address*. One key at `m/44'/60'/0'/0/i` therefore
*is* the user's address on Ethereum L1 and on every rollup and sidechain that speaks EVM. The wallet
doesn't "support six chains" by generating six addresses; it exposes **one** address and lets the
transaction's `chainId` field select the venue. This is the same model Phantom and Rabby converged on —
a single EVM account spanning all EVM networks — and it is the strongest form of address virtualization
we ship, because there is genuinely nothing to disambiguate: the address is identical across all six.

| What the user perceives | What actually exists underneath |
|---|---|
| "My Ethereum address" | one secp256k1 key, valid unchanged on 6 EVM mainnets + testnets |
| "My Bitcoin address" | one BIP-84 P2WPKH key accumulating UTXOs |
| "My Solana address" | one ed25519 key + a deterministic ATA per SPL mint |
| "I have USDC" | balances at the *same EVM address* on several chains, read per-chain |
| "Send it" | the engine selects the network; the user selects the outcome |

---

### 4.2 · The cross-chain account map

The concrete data structure the whole platform keys off is small and total. A `UniversalIdentity`
(`packages/identity/src/identity.ts`) is one account index mapped to exactly three `ReceiveAddress`
records:

```ts
interface UniversalIdentity {
  id: string;                    // sha256(btc | evm.toLowerCase() | sol).slice(0,32)
  accountIndex: number;
  addresses: { btc: ReceiveAddress; evm: ReceiveAddress; sol: ReceiveAddress };
  metadata: { label: string; createdAt?: string };
}
```

That id is worth a beat: it is a hash of the **address triple**, not of any secret and not of any
device state. Because derivation is deterministic (§1), the *same* mnemonic produces the *same* triple
and therefore the *same* identity id on every device that imports it — which is why "the same identity
appears on all your devices" needs **no server to hold anything** (the sync of *preferences* is a
separate, optional, secret-free concern owned by §8; the identity itself is a pure function of the
seed). Non-custodial is not weakened by multi-device; it is the reason multi-device is cheap.

Beneath each of the three receive addresses hangs a per-ecosystem account structure, and the three
ecosystems virtualize their token accounts very differently — this is the substance of the map:

**EVM — zero per-token accounts.** Every ERC-20 on every EVM chain is a `balanceOf(address)` read
against the *same* 20-byte address. There is no "USDC account" to create or fund; the token contract
holds a mapping keyed by the user's address. The `EvmAdapter.getTokenBalances(address, tokens)` call
(`packages/chains`) fans one address across a token list. So "USDC on Base" and "USDC on Arbitrum" are
two reads at one address on two chains — the address never changes, only the RPC endpoint does.

**Solana — one wallet key, a deterministic ATA per mint.** A Solana wallet cannot hold an SPL token at
its own address; each token lives in an **Associated Token Account**, a Program Derived Address. Naively
this is exactly the address-sprawl nightmare — a different account per token. We collapse it with math
the wallet does on-device, with no network call:

```ts
// packages/chains/src/solana/spl.ts
export function findAssociatedTokenAddress(owner: Uint8Array, mint: Uint8Array): Uint8Array {
  return findProgramAddress([owner, TOKEN_PROGRAM_ID, mint], ASSOCIATED_TOKEN_PROGRAM_ID).address;
}
```

The ATA is `findProgramAddress([owner, TOKEN_PROGRAM_ID, mint], ATA_PROGRAM_ID)` — a SHA-256 over the
seeds with the first *off-curve* bump seed winning (bumps 255→0, rejecting any candidate that is a valid
ed25519 point). This is pure and byte-exact. The consequence for virtualization is total: **the user's
one Solana wallet address deterministically implies their token account for every mint that will ever
exist.** They never see, manage, or fund an ATA. When they receive an SPL token, our transfer builder
creates the recipient's ATA idempotently before the checked transfer (`buildSplTransferMessage` emits
`CreateIdempotent` then `TransferChecked`), so a first-time recipient's account materializes as a
side-effect of the very first deposit — the sender pays the rent, the recipient does nothing. That is
address virtualization at the protocol layer: a whole class of accounts the user would otherwise have to
comprehend simply disappears behind one wallet address plus a derivation.

**Bitcoin — one address, many UTXOs.** The BIP-84 P2WPKH address at `m/84'/0'/0'/0/i` accumulates
unspent outputs; the wallet aggregates them into a spendable balance and selects UTXOs at send time. The
UTXO model is virtualized into a single "balance" the user reads, exactly as they'd expect. (Per-deposit
fresh-address rotation for on-chain privacy — walking the external chain within the BIP-84 gap limit — is
a §5/roadmap concern; today the shipped receive address is stable per account, which is honest and
correct, just not yet privacy-optimal.)

| Ecosystem | Receive address (shipped) | Token-account model | How it is virtualized |
|---|---|---|---|
| **EVM** | one `0x…` (EIP-55), path `m/44'/60'/0'/0/i` | none — `balanceOf(addr)` per token/chain | one address across all 6+ EVM chains |
| **Solana** | one base58 pubkey, path `m/44'/501'/i'/0'` | one ATA (PDA) per SPL mint | ATA derived on-device from wallet addr + mint |
| **Bitcoin** | one `bc1q…` (bech32), path `m/84'/0'/0'/0/i` | UTXO set at the address | UTXOs aggregated to one balance |

---

### 4.3 · Intent → address resolution — how Chapter 4 picks the right address

Chapter 4 gives us a validated, typed `Intent` (e.g. `{ kind: 'transfer', asset: 'USDC', amount, recipient }`).
The mapping layer's job is to turn that outcome into a plan bound to a **specific chain and a specific
address** — and to refuse rather than guess when the mapping is unsafe. This is deterministic planner
code (`packages/intents/src/plan/planner.ts`), not the LLM; the model proposed the outcome, the map
disposes it.

Two functions do the resolution today. The first classifies the *asset* to an ecosystem:

```ts
// packages/intents/src/plan/planner.ts
function assetEcosystem(symbol: string): 'btc' | 'sol' | 'evm' {
  if (symbol === 'BTC') return 'btc';
  if (symbol === 'SOL') return 'sol';
  return 'evm';
}
```

The second, injected as `ctx.defaultChainFor(symbol)`, picks *which* chain a transfer of that asset
should ride — "usually where it's held / cheapest" (`context.ts`). The planner then binds the plan step
to that `chainId` and estimates its fee. So an intent to "send 50 USDC" resolves, without the user ever
naming a network, to a concrete `{ chainId, to, amountBase }` step on a specific EVM chain, using the
sender's one universal EVM address as the source.

The symmetric case — **"let me receive USDC"** — is where shipped and roadmap must be named exactly.
*Shipped:* the Receive surface presents the three real addresses, each labeled with its `network` and
its `worksOn` coverage, and the user (or the AI, in Simple mode) selects the ecosystem; because the EVM
address is one string across all EVM chains, "receive USDC on any EVM chain" already resolves to a single
correct address with no ambiguity to the user. *Roadmap:* a deeper virtualization in which "receive
USDC" is resolved end-to-end by the engine — auto-selecting the *specific* destination chain by fee and
liquidity, and (further out) auto-bridging an incoming deposit to the user's preferred chain — is the
target, not shipped. We call this out here rather than imply it, because implying it would violate
Doctrine #3.

An honesty note the code itself carries: `assetEcosystem` is commented **"Simplified asset → ecosystem
… (canonical registry is a follow-up)."** Today it hard-codes BTC and SOL and treats everything else as
EVM — correct for the assets we surface, but not yet the canonical asset→chain registry that a fuller
multi-chain token universe will need (USDC-on-Solana vs. USDC-on-EVM is the obvious case a registry must
disambiguate). The roadmap item is a first-class **asset registry** keyed by `(symbol, chain)` that
replaces the heuristic. Naming the seam is the point: the mapping is real and shipped, and it is
deliberately not pretending to be more general than it is.

---

### 4.4 · Deposit-address disambiguation — the fail-closed safety gate

The single most expensive mistake in crypto is a **cross-ecosystem address confusion**: pasting a Solana
address into an EVM send, or showing an EVM address to someone about to deposit BTC. The funds don't
bounce — they are gone. The mapping layer therefore treats *"which address for which network"* as a
guard problem, and it fails closed at three points.

**1 · Strict classification, never inference.** `classifyAddress` (`packages/identity/src/address.ts`)
is the one place in the system that decides an address's ecosystem, and it decides by **checksum, not by
shape**. A mixed-case EVM address must pass EIP-55 or it is rejected as a likely typo; bech32/bech32m and
base58check checksums must verify; a Solana address must decode to exactly 32 bytes. There is no
"probably EVM" branch — an input either classifies to exactly one ecosystem with a verified checksum, or
it returns `null`. This is the anti-silent-corruption primitive the whole send path leans on.

**2 · Ecosystem-match at plan time.** Before any transfer becomes a signable plan, the planner checks
the *recipient's* ecosystem against the *asset's* ecosystem and rejects the mismatch outright:

```ts
// packages/intents/src/plan/planner.ts — planTransfer
if (recipientEcosystem !== assetEcosystem(intent.asset)) {
  return { kind: 'rejected', reason: `That address is on a different network than ${intent.asset}.`, risk: LOW_RISK };
}
```

So "send BTC to a `0x…`" or "send USDC to a Solana pubkey" never produces a plan — it produces a plain,
honest refusal the user can read. The AI cannot route around this; it never reaches the planner's
authority, and the planner only ever *refuses* (Doctrine #2, #5).

**3 · Fail-closed at the wire.** The final broadcast guard (`packages/chains/src/guard.ts`) blocks on an
**unknown chain** and on a malformed recipient before a signed transaction can hit an RPC — anything it
cannot *positively* verify is refused, never waved through. Combined with the mainnet acknowledgement and
spend-cap gates (§ shared with the execution chapter), the address never silently resolves to the wrong
network at the one irreversible moment.

On the **receive** side the same principle is a UI contract: every address is rendered *with* its
ecosystem, its network label, and its `worksOn` string, and the QR encodes only that ecosystem's
address. The wallet **never shows a Solana address under a "Deposit ETH" heading** — the `ReceiveAddress`
type makes that structurally hard, because the network a deposit is valid on travels with the address as
data, not as a caption a developer might mislabel. Testnet addresses (`tb1…` for BTC) are classified and
labeled as testnet, so a mainnet deposit can never be pointed at a testnet address.

| Failure the gate prevents | Where it fails closed | Result |
|---|---|---|
| EVM address with a transcription typo | `classifyAddress` EIP-55 check | rejected as "likely a typo" |
| Sending an EVM asset to a SOL/BTC address | planner ecosystem-match | honest rejection, no plan |
| Broadcasting on an unregistered chain | `guardBroadcast` | blocked, "refusing to broadcast" |
| Showing the wrong-chain address to a depositor | `ReceiveAddress.worksOn` + labeled QR | structurally prevented |

---

### 4.5 · Shipped vs. roadmap — the honest ledger

The mapping layer is real and load-bearing, and it is also deliberately shallow in places. Drawing the
line explicitly is the point of this section.

**Shipped today** (cite the code): the three-address universal identity with per-network `worksOn`
coverage (`packages/identity`); one EVM address spanning all six EVM chains; on-device ATA derivation and
idempotent-ATA SPL transfers (`packages/chains/src/solana/spl.ts`); per-chain, per-token balance reads at
the one address per ecosystem; deterministic intent→chain resolution for sends
(`assetEcosystem` + `defaultChainFor`); and the three-point fail-closed disambiguation gate
(`classifyAddress`, planner ecosystem-match, `guardBroadcast`).

**Roadmap** (tagged, not shipped): a **canonical asset registry** keyed by `(symbol, chain)` replacing
the simplified `assetEcosystem` heuristic; a **unified asset ledger** that shows "USDC" as one line item
across chains with the engine auto-selecting the source chain to spend from by fee and liquidity;
**virtual receive routing** ("receive USDC" auto-resolving the best destination chain, later
auto-bridging deposits to a preferred chain); and **address abstraction** proper — ERC-4337 smart
accounts (§2) and human-readable universal usernames via ENS/SNS resolution (§3), which together turn
"three addresses" into "one name," the ultimate virtualization. None of these ship today; each is
designed as the target and will pass the same Design Review Gate and fail-closed discipline before it
touches funds.

The through-line back to the doctrine: virtualization must never become *obfuscation*. The instant a
mapping cannot be *positively* proven — an unknown chain, an unclassifiable address, an asset the
registry can't place — the correct behavior is not a best guess, it is a refusal the user can read. That
is what separates "one identity, many addresses" as a **product promise** from the same phrase as a
**latent fund-loss bug**: the map is deterministic, the map is checksum-strict, and where the map is
uncertain, the map says so and stops.


## §5 · HD Accounts & the Multi-Account Model

> *One seed is not one wallet. It is a tree. §1 showed the branch a user reads across — Bitcoin, EVM,
> Solana under a single identity. This section shows the branch they read down: as many independent
> identities as they want, each a full three-chain triple, every one of them derivable, on demand, from
> the one phrase they already backed up. No new secret. No server. No second backup.*

Chapter 5 §1 fixed the **horizontal** axis of identity: a single account is not one address but *three*
receive addresses — Bitcoin (BIP-84), a Universal EVM address (BIP-44), and Solana (SLIP-0010) — presented
as one identity because the chains underneath are the wallet's problem, not the user's. This section fixes
the **vertical** axis. The same seed that produces one three-address identity produces a practically
unbounded column of them — `Account 1`, `Account 2`, `Account 3` — each cryptographically independent,
each its own complete triple, all recoverable from the same twelve words. This is **shipped**, not
roadmap: it is BIP-32 hierarchical-deterministic derivation, exactly as MetaMask, Phantom, and Ledger do
it, wired into a switcher a first-timer can drive. The account-abstraction identity of §2, the human name
of §3, and the recovery story of §6 are the target; the multi-account tree in *this* section runs today,
in `packages/core/src/keyring.ts` and `apps/web/src/wallet.ts`, with known-answer tests behind it.

The one idea to hold: **an "account" is a coordinate in a tree, never a stored secret.** Adding an account
stores *nothing sensitive* — it increments an integer. Switching accounts unlocks *nothing new* — the same
seed was already in memory; only the index every read and every signature uses changes. The security of
the whole model falls out of that single fact, and §5.7 makes it explicit.

---

### 5.1 · One seed, a tree of identities — the HD account model

BIP-32 turns one seed into a *tree* of keys: from the master node you descend a path of integers, and each
path yields a distinct, deterministic keypair. BIP-44 (and its SegWit sibling BIP-84, and Solana's
SLIP-0010) standardise *which* path shape each ecosystem uses so that a phrase backed up in one wallet
restores in another. Intent Wallet exposes exactly one dial over that tree — the **account index** `i`, a
non-negative integer — and derives the full universal triple for it (`packages/core/src/keyring.ts`):

```ts
export const derivationPaths = {
  btc: (index, network = 'mainnet') => `m/84'/${network === 'mainnet' ? 0 : 1}'/0'/0/${index}`,
  evm: (index)                      => `m/44'/60'/0'/0/${index}`,
  sol: (index)                      => `m/44'/501'/${index}'/0'`,
} as const;
```

`getAccount(index)` walks all three paths, encodes each chain's canonical address, records the exact path
used, and returns **only public material** — addresses, derivation paths, public keys — never a private
key (`UniversalAccount`). Account `0` is what a fresh wallet starts on; `getAccount(1)` is a *different*
person on all three chains; `getAccount(2)` again; and so on up to `2³¹ − 1` (`MAX_INDEX`), the hardened
ceiling BIP-32 allows. That every index is a genuinely independent identity is not asserted — it is a
known-answer test (`packages/core/test/keyring.test.ts`): *"different account indexes yield different
addresses on all three chains,"* alongside vectors pinning account 0 to the official BIP-84 test-vector
BTC address, the canonical `abandon…` EVM address, and the reference SLIP-0010 Solana key.

Two properties make this safe to lean on. It is **deterministic**: the same phrase yields the same tree on
every device, forever — *"same mnemonic → same universal identity"* is a test, and it is why "restore"
needs no server (§6, §8). And it is **pure**: derivation reads the seed and returns addresses; it performs
no I/O, no clock access, no randomness. Account 7 exists whether or not the user has ever "created" it —
"creating" account 7 is merely the UI admitting that it does.

---

### 5.2 · The account index maps to each ecosystem's convention

The subtlety worth stating precisely — because getting a derivation path wrong is a silent fund-loss bug,
and because interoperability is the whole reason the paths look the way they do — is that the single
account index `i` lands on a **different level of each chain's standard path**, on purpose:

| Chain | Path for account `i` | Where `i` sits | Standard | Interop target |
|---|---|---|---|---|
| **Bitcoin** | `m/84'/0'/0'/0/i` | `address_index` (last level); BIP-44 `account'` stays `0'` | BIP-84 (P2WPKH) | Ledger, Sparrow, BlueWallet |
| **EVM** | `m/44'/60'/0'/0/i` | `address_index` (last level); `account'` stays `0'` | BIP-44 | MetaMask, MEW, ethers, Ledger |
| **Solana** | `m/44'/501'/i'/0'` | `account'` (hardened); rotates the account level | SLIP-0010 (ed25519) | Phantom, Solflare |

This is not an inconsistency — it is *fidelity to each ecosystem's dominant wallet*. On EVM and Bitcoin,
the near-universal convention (MetaMask, Ledger's Ethereum app, standard BIP-84 wallets) is to walk the
`address_index` while holding the BIP-44 `account'` field at `0'`; so that is what we walk, and a triple
imported into MetaMask reproduces the same address list. On Solana, the dominant convention set by Phantom
and Solflare rotates the hardened `account'` field (`m/44'/501'/i'/0'`); so that is what we rotate, and the
same phrase in Phantom surfaces the same accounts in the same order. The trade-off is honest and
documented in the code (`m/44'/501'/i'/0'` "rotates the ACCOUNT level (Phantom convention)"), pinned by the
derivation-path table test. A user who backs up their phrase and later opens Phantom, MetaMask, and a
Bitcoin wallet finds *their* accounts, in *their* order — which is the entire point of standard paths.

One further real dial rides alongside the index: a **BIP-39 passphrase** (the "25th word"). Supplied at
keyring construction (`KeyringOptions.passphrase`), it produces a *completely different tree* from the same
twelve words — a test asserts the plain and passphrased identities share no address. This is genuine
plausible-deniability / hidden-wallet capability at the core layer today; it is **not yet surfaced in the
web UI** (the shipped create/import flows pass no passphrase), so we treat *user-facing* passphrase wallets
as roadmap (§6) while being precise that the cryptography for them already exists and is tested.

---

### 5.3 · Accounts and the Universal Identity — the vertical and the horizontal

§1 owns the claim *"one identity is three addresses."* §5 owns the claim *"one seed is many identities."*
They meet in one line of the identity engine (`packages/identity/src/identity.ts`):

> *"an identity IS an account index of the HD wallet."*

`deriveUniversalIdentity(account)` takes a core `UniversalAccount` (one index's triple) and lifts it into
the product-level `UniversalIdentity`: it records the `accountIndex`, computes a stable, device-independent
`id` as a short hash of the three addresses (`computeIdentityId` — same phrase, same identity id, on any
device), and defaults the display label to `Account ${index + 1}`. So the two axes compose cleanly and
without duplication:

- **Horizontal (within an account):** BTC + EVM + SOL, unified into one identity the user reads across —
  the subject of §1, §3 (its human name), and §4 (its cross-chain address mapping).
- **Vertical (across accounts):** `Account 1`, `Account 2`, … — *each a full horizontal triple*, the
  subject of *this* section.

A useful mental model: the wallet is a spreadsheet whose **rows are accounts** and whose **columns are
chains**. §1 taught the reader to stop thinking in columns. §5 gives them as many rows as they want, and
every cell is still derived, never stored. Nothing in this section widens the horizontal contract — an
account added here is a `UniversalIdentity` exactly like account 0, and everything §1 promised about it
(three addresses, on-device keys, honest states) holds unchanged.

---

### 5.4 · The multi-account state — two public integers, never a secret

Because the tree is deterministic and infinite, the wallet does not *store* accounts — it stores only *how
far the user has chosen to reveal* and *which row they are looking at*. That is the entire persisted state,
in one localStorage key (`apps/web/src/wallet.ts`):

```ts
const ACCOUNTS_KEY = 'iw.accounts.v1';
interface AccountState { index: number; count: number }   // ← the whole thing: two integers
```

`count` is how many accounts the user has added (≥ 1); `index` is the active one. **Neither is a secret.**
The seed stays sealed in the scrypt + AES-256-GCM vault (§1, SECURITY §3); this key is public convenience
metadata that would be worthless to an attacker who found it — it names coordinates in a tree they cannot
walk without the seed. The read path is defensive by construction: a corrupt or out-of-range record fails
*closed* to the safe default rather than trusting bad state:

```ts
if (typeof s.index === 'number' && typeof s.count === 'number' &&
    s.count >= 1 && s.index >= 0 && s.index < s.count) return { index: s.index, count: s.count };
return { index: 0, count: 1 };   // any malformed/stale value → account 0, honestly
```

The public surface over that state is four small functions, and every balance read and every signature in
the app funnels through the active index they expose:

| Function | Effect | Persists a secret? |
|---|---|---|
| `activeAccountIndex()` | the row every read + sign uses | no |
| `accountCount()` | how many rows the user has revealed | no |
| `setActiveAccount(i)` | switch the active row (bounds-checked) | no |
| `addAccount()` | reveal + activate the next row (`count += 1`) | no |
| `accountEvmAddress(i)` | derive row `i`'s EVM address **without switching to it** | no |

`addAccount()` is the honest inverse of §5.1's "the account already exists": it does not *make* an account,
it *admits* the next one by incrementing `count` and activating it. `accountEvmAddress(i)` is the small
piece that makes the switcher truthful — it derives any row's real address on demand so the list can show
each account distinctly (`Account 2 · 0x9f3c…`), never a row of indistinguishable "Account N" labels. And
because switching is just rewriting `index`, **every downstream read and signature re-points automatically**:
`signEvmTransaction`, `signSolanaMessage`, `signBitcoinPsbt`, `evmAddress()`, `solPublicKey()`,
`btcPublicKey()` all pass `activeAccountIndex()` into the keyring, so the active row is the *only* row that
can move money.

---

### 5.5 · The account switcher — shipped UX

The switcher is real UI in `apps/web/src/App.tsx`, and it is designed to the same bar as the rest of the
wallet: every state honest, keyboard-reachable, AA-legible, in light and dark. Its states:

| State | What the user sees |
|---|---|
| **Resting** | an `account-chip` in the shell header reading **Account N** (the active row), opening the menu |
| **Menu open** | a `role="dialog"` `aria-modal` sheet, *"Your accounts"*, Escape-to-close, a Back affordance |
| **List** | one row per account — an avatar (`N`), **Account N**, its real `shortAddr(evm)`, and a **✓** on the active row (`aria-current="true"`) |
| **Add** | an **Add account** row, titled *"Derive the next HD account from your seed"* — one tap reveals the next identity |
| **Switched** | the sheet's active marker moves; the whole shell re-derives for the new row (below) |

Two engineering details make the switch feel instant and stay honest. First, the shell keys its content off
the active index: `useWalletKey()` re-renders on unlock **or** active-account change by watching
`` `${isUnlocked()}:${activeAccountIndex()}` ``, and the `WalletShell` re-derives its local `acct` on
switch — so balances, insights, receive addresses, and Activity all refetch for the newly-selected wallet
rather than showing the previous account's numbers under the new name (Doctrine #3: never show a stale
figure as if it were this account's).

Second, and load-bearing for safety, **switching reconciles the authenticated session with the new
principal.** A SIWE sign-in (§7; SECURITY §5) belongs to the *account that signed it* — its EVM address is
the principal the backend authorized. When the active account changes, that session no longer matches, so
the switcher drops it rather than let an authorized call run under the wrong identity:

```ts
const switchAccount = (i: number): void => {
  setActiveAccount(i);
  refresh();
  const s = currentSession();
  const a = evmAddress();
  if (s && a && s.address.toLowerCase() !== a.toLowerCase()) void signOut();  // never act under a mismatched principal
};
```

This is the account-model half of the principal-binding invariant the rest of Chapter 5 and the security
chapter depend on: the display never reads *"Signed in 0x…other"* while a different account is active, and
no server-authorized action ever executes under a principal the current account did not prove. The user
simply re-signs as the new account when they next need the backend — a no-gas `personal_sign`, key on
device.

---

### 5.6 · Why multiple accounts — separation of concerns

Multiple accounts exist for the reason they exist in Phantom, Rabby, and MetaMask: **compartmentalisation
the user controls.** The wallet does not prescribe what a row means; it gives clean, independent identities
and lets the user assign meaning:

- **Account 1 · Main** — everyday holdings and the identity used for routine intents.
- **Account 2 · Savings** — a cold row that rarely signs; funds parked away from daily activity.
- **Account 3 · Trading** — an active row for swaps and higher-risk protocol interaction, blast-radius
  contained if a single approval goes wrong.

Because the rows are cryptographically independent triples, a mistake, a bad token approval, or a phishing
signature on the Trading row cannot touch the Savings row — they share a *seed*, but they share **no keys
and no on-chain linkage**. Two honest notes keep this from over-promising. First, privacy is real but not
absolute: the accounts are unlinkable *on-chain* (independent addresses, independent paths), but the moment
a user bridges or sends funds *between* their own accounts, they create the link themselves — the wallet
cannot un-publish an on-chain transfer, and it says so rather than implying anonymity it can't deliver.
Second, this is human-labelled compartmentalisation, not policy enforcement: per-account spend limits,
per-account automation rules, and account-scoped risk posture are **roadmap** (they belong to the Policy
Engine surfacing, not to the identity tree). Today the separation is real; the *rules* on top of it are the
target.

---

### 5.7 · The security invariant — switching never exposes another account's key

The whole model reduces to one guarantee, and it is worth stating as a theorem the reader can check against
the code: **selecting or adding an account grants no new access to key material — it only re-points which
already-derivable coordinate the wallet reads and signs at.**

- **Derivation returns no secrets.** `getAccount(index)` yields addresses, paths, and public keys only —
  *"Pure derivation — no key material is returned."* The switcher, which calls `accountEvmAddress(i)` for
  every row, therefore renders the whole list while touching **zero** private keys.
- **Private keys are per-call and immediately wiped.** A signature derives the one key for the active
  index, uses it, and destroys it in a `finally` (`node.wipePrivateData()` for secp256k1; `zeroize(...)`
  for ed25519). No account's private key persists between operations — not the active one, and certainly
  not an inactive one.
- **The seed is in memory only while unlocked.** The keyring holds the seed exactly for the unlocked
  session and throws `KEYRING_DESTROYED` on every method after `destroy()` (lock, auto-lock, backgrounding).
  Switching accounts does not unlock anything — if the wallet is locked, `currentIdentity()`, `evmAddress()`,
  and the signers all return null / refuse. Switching a *locked* wallet is a no-op on secrets.
- **Bounds fail closed.** `setActiveAccount` rejects out-of-range indices; the persisted state validator
  collapses any malformed record to account 0; `validateIndex` throws `INVALID_INPUT` for a non-integer or
  out-of-`[0, 2³¹)` index before any derivation runs. An attacker who tampers with `iw.accounts.v1` gets a
  safe default, not another account's funds.

Put together: an account is a *view*, and the vault is the only thing that can turn any view into a
signature. There is no operation anywhere in the multi-account surface that reveals account B's key while
you are on account A — because there is no operation that reveals a key at all except a user-authorised
signature or the explicit, re-authenticated backup/reveal flow (§6; SECURITY §3.4). This is Doctrine #1
made literal at the account layer: keys are on-device, derived on demand, never stored per-account, never
sent to a server, never exposed by navigation.

---

### 5.8 · Honest limits & the roadmap

What ships is the deterministic tree, the two-integer state, the reconciling switcher, and the security
invariant above. What does **not** yet ship — and must not be described as if it does:

- **Account labels are defaults, not names.** The UI shows `Account N`; user-chosen names, emoji, and
  colours are roadmap. The label field exists in the identity model (`IdentityMetadata.label`) but is not
  yet user-editable in web V2.
- **`count` is device-local convenience state, not derived truth.** On a fresh **import**, the wallet
  resets to `{ index: 0, count: 1 }` — so a user who had five accounts on their old device sees only
  **Account 1** until they re-add the rest (their funds on accounts 2–5 are safe and re-derive the instant
  they tap *Add account* the right number of times, because derivation is deterministic — but the wallet
  does not yet *discover* which accounts were used). Automatic **gap-limit account discovery** (scan
  forward, surface any account with history) is roadmap; until then, revealing accounts after import is a
  manual step, and we say so.
- **User-facing hidden/passphrase wallets are roadmap.** The core supports BIP-39 passphrases (§5.2, tested)
  but the web create/import flows do not expose them yet.
- **Per-account policy, recovery, and sync are other sections' targets.** Account-scoped limits and
  automation belong to the Policy surfacing; social/MPC/passkey **recovery** of the seed behind all accounts
  is §6; keeping the *same* accounts and preferences across devices without a server ever holding a secret
  is §8; team/treasury accounts with roles are §9. Smart-account (ERC-4337) identities that layer session
  keys and gas abstraction over a signer are §2, and the human name that fronts an account is §3.

The line that does not move across any of that work: **more accounts never means more attack surface for
keys.** Every future account, on every future device, is one more deterministic coordinate in a tree whose
only root is a phrase the user holds — derived on demand, signed on device, and never, on any account,
handed to a server.


## §6 · Recovery Architecture

*Getting back in without a custodian — the hardest honest problem in the whole system.*

Every other section of this chapter is about giving the user *less* to hold: one identity instead of a
dozen addresses (§1), a smart account that pays its own gas (§2), a username instead of a hex string (§3).
Recovery is the section where that generosity meets its limit, because the one thing we can never take off
the user's shoulders is the thing that makes the wallet theirs: **the secret only they hold.** A wallet is
non-custodial precisely to the degree that *nobody but the user can restore access* — and that is the same
sentence, read from the other side, as *the user can permanently lose access.* You do not get one without
the other. This section is the Principal Security Engineer's account of how we live inside that trade
honestly: what we ship today (the seed phrase, and it is enough to fully reconstruct the identity), what the
roadmap adds to soften the cliff without secretly building a custodian, and the recovery designs we will
refuse forever because they are custody wearing a recovery costume.

Three seams belong to siblings and are referenced, not re-derived here. **What** gets restored — the
deterministic 3-address identity and its HD sub-accounts — is §1 and §5; recovery *reconstructs* that
identity, it does not redefine it. The **device** side of the trust boundary — biometrics, the OS keystore
wrap, what makes a device trusted enough to hold an unlocked key — is §7. And propagating *state* (contacts,
preferences, labels) across devices is **sync**, which is §8; recovery restores *signing authority*, sync
restores *convenience*, and conflating the two is the first mistake most wallets make. This section owns
exactly one question: **after loss, how does a user regain the authority to sign — and how do we guarantee
that no one else can use that same path to sign in their place?**

---

### §6.0 · The Recovery Invariant — the line the entire section defends

Before any mechanism, the law that judges every mechanism. It is the recovery-specific reading of
[Doctrine #1](../../CLAUDE.md#3--the-doctrine--laws-no-change-may-break) and
[SECURITY.md §1.1](../../SECURITY.md):

> **No recovery path may let a server, a vendor, or any single third party unilaterally restore access to
> funds. A party that can restore your access on its own can *steal* your funds on its own — the two
> capabilities are identical.** Recovery must therefore require either (a) the user's own device or secret,
> or (b) a threshold of independent parties, *none of whom is us and no proper subset of which is under our
> control.* Anything else is custody.

This is not a stylistic preference; it is a testable predicate we run against every design below. The test
has a single form: *"Draw the smallest set of parties who, colluding, can move the user's funds. Is our
infrastructure in that set — alone or as a swing vote?"* If yes, the design is rejected, no matter how good
the UX. The whole difficulty of recovery is that almost every mechanism a normal person *expects* —
"email me a reset link," "call support," "restore from my cloud backup" — answers that test with *yes*.
Honest recovery is the discipline of refusing those and building the harder thing.

---

### §6.1 · The taxonomy of loss — what are we actually recovering *from*?

"Recovery" is not one problem; it is at least six, and they have wildly different answers. Naming them
precisely is half the work, because the dangerous move is to build one warm mechanism that pretends to solve
all of them and quietly weakens the invariant to do so.

| # | The user has lost… | …but still has | Recoverable today? | By what mechanism |
|---|---|---|---|---|
| 1 | The **device** | the seed phrase | ✅ **Fully** | Re-import the mnemonic on a clean device → deterministic derivation restores the identical identity + funds (§6.2). No server. |
| 2 | The **password** | the device + the seed | ✅ **Fully** | Re-import from the seed and set a new password. The old vault is unrecoverable *by design* — we hold no key to reset. |
| 3 | The **seed backup** | the device, unlocked | 🔶 **Re-back-up now** | The seed still lives in the sealed vault; reveal it (re-auth) and back it up again *before* anything else fails (§6.2). |
| 4 | The **seed *and* the device access** | nothing | ❌ **Not recoverable today** | This is the cliff. The roadmap (§6.4) exists entirely to add a second survivable path for *this* case — honestly. |
| 5 | Control (**device or seed is compromised**) | possibly still access | ⚠️ **Rotate, don't recover** | Treat the seed as burned: create a fresh wallet on a clean device out-of-band and move funds (§6.2). Recovery ≠ rescue. |
| 6 | The **BIP-39 passphrase** ("25th word") | the 12/24 words | ❌ **Not recoverable** | The passphrase derives a *distinct* wallet; without it the words open a different, empty identity (§6.3). |

Two rows carry the whole tension. Row 4 is where an honest wallet says the hard word — *no* — today, and
where the roadmap's ambition lives. Row 5 is the row users most often misunderstand: once a secret is in an
adversary's hands, there is no "recover my account" that helps, because the adversary can run the same
recovery. The only correct response is rotation to a new secret, and the UI must say that plainly rather than
offer false comfort.

---

### §6.2 · What ships today — the seed phrase *is* the recovery method ✅

The recovery architecture we run in production is the oldest and most battle-tested one in the space, and we
chose it on purpose: the **BIP-39 mnemonic is the sole root of recovery**, and because every address is
derived deterministically from it, the seed is not a *pointer* to the wallet — it *is* the wallet. Restoring
is not a database lookup; it is re-running pure math.

**Why re-import fully restores.** The identity is a pure function of the seed. From one mnemonic
([`packages/core/src/mnemonic.ts`](../../packages/core/src/mnemonic.ts): `@scure/bip39`, PBKDF2-HMAC-SHA512,
2048 iterations, salt `"mnemonic"`+passphrase) we derive the same three receive identities on any device, on
any platform, with no server in the loop:

| Ecosystem | Curve | Path | Standard |
|---|---|---|---|
| Bitcoin | secp256k1 | `m/84'/{0,1}'/0'/0/i` → bech32 `bc1q…` | BIP-84 |
| Universal EVM | secp256k1 | `m/44'/60'/0'/0/i` → EIP-55 `0x…` | BIP-44 |
| Solana | ed25519 | `m/44'/501'/i'/0'` → base58 | SLIP-0010 |

Because this derivation is exhaustively conformance-tested against the official BIP-32/44/84 and SLIP-0010
known-answer vectors and cross-checked against `viem` and `@scure/btc-signer` (the 115-test suite in
[`packages/core/test`](../../packages/core/test), Build-loop task #93), "restore" is not a hopeful operation —
it is a *provably* identical reconstruction. [`deriveUniversalIdentity`](../../packages/identity/src/identity.ts)
even computes a device-independent `id` as a hash of the address triple, so the restored wallet is recognizably
*the same identity*, not a look-alike. This is also why §8 (sync) needs no server copy of the identity: the
math is the sync.

**The four live flows and their gates.** The shipped surface
([`apps/web/src/wallet.ts`](../../apps/web/src/wallet.ts) over
[`WalletManager`](../../packages/core/src/wallet/wallet-manager.ts)) is exactly four operations, each with a
non-custodial gate:

1. **Backup** — a new wallet returns its mnemonic **exactly once**, from `createWallet`, for the backup step
   ([SECURITY.md §3.4](../../SECURITY.md)). It is shown on-screen, **quiz-verified** (the user re-enters a
   subset of words to prove they wrote it down — hardened backup-verify, task #90), and **never persisted
   outside the sealed vault, never transmitted.** `packages/core` has no network path, so there is *no code*
   by which the phrase could leave the device.
2. **Reveal (re-back-up)** — for row 3, Settings can re-display the phrase via `revealMnemonic()` →
   `exportMnemonic()`, which requires an unlocked wallet. Critically, the UI gates this behind a **fresh
   re-auth** using `verifyPassword()`, *not* `unlock()`. This is load-bearing and subtle: `unlock()` no-ops
   when the wallet is already unlocked and would therefore accept *any* string — using it as a re-auth gate
   would be a silent bypass. `verifyPassword()` instead decrypts the sealed vault *directly* every time
   ([`wallet-manager.ts` §153](../../packages/core/src/wallet/wallet-manager.ts)), so the phrase is shown
   only to someone who can positively re-prove the password against the ciphertext.
3. **Restore (import)** — `importWallet(mnemonic, password)` normalizes the input (trim, collapse whitespace,
   lowercase — safe because BIP-39 English words are ASCII) and **validates the BIP-39 wordlist + checksum
   before deriving anything.** A phrase that fails throws `INVALID_MNEMONIC`; there is no partial or
   best-effort import (§6.6).
4. **Wipe** — `wipe()` locks first, then deletes the vault + metadata ciphertext. A wiped device holds
   *nothing recoverable*; the confirm flow is deliberately heavy (re-auth + explicit confirmation, task #90)
   because it is the one irreversible local action.

```
Reveal recovery phrase (Settings)                 Restore on a clean device
────────────────────────────────                  ─────────────────────────
enter password                                    enter 12 / 24 words
   │  verifyPassword()  (NOT unlock)                  │  normalizeMnemonic()
   │  → decrypt vault directly                        │  → validateMnemonic()  (BIP-39 checksum)
   ├─ wrong / tampered                                ├─ fails
   │    → VAULT_DECRYPT_FAILED                         │    → INVALID_MNEMONIC
   │    → refuse, no phrase shown  ── fail closed      │    → refuse, no import  ── fail closed
   └─ correct                                         └─ passes
        → exportMnemonic()                                 → set NEW password → sealVault(scrypt+AES-GCM)
        → phrase on-screen only                            → deterministic derivation
        → quiz-verify, then dismissed from view            → identical BTC / EVM / SOL identity + funds
        (never copied to a server)                         (no server involvement)
```

**The forgotten-password truth, stated without softening.** Because we hold no key, we cannot reset one. A
forgotten password is not "recovered" — the wallet is re-imported from the seed under a new password
([SECURITY.md §3.5](../../SECURITY.md)). The UI says this plainly *before* the user commits, and never dresses
it up as a resettable account. And a wrong password is indistinguishable from a tampered vault — both raise
`VAULT_DECRYPT_FAILED` ([`vault.ts`](../../packages/core/src/vault.ts), scrypt N=2¹⁵/r=8/p=1 + AES-256-GCM,
every envelope field bound as AAD) — so the failure path leaks no oracle to an attacker probing the sealed
blob.

**Honest verdict on today's model.** It is fully non-custodial and provably restorable, and it has one
brutal weakness: it is a **single point of failure.** One string, twelve words. Lose it *and* your device
(row 4) and you are out, forever, and no one can help you — that is the price of no one being able to rob you.
Leak it and you are robbed, instantly, and no one can stop it. Every roadmap item in §6.4 exists to attack
that single point of failure — *without* re-introducing the custodian we just spent this section removing.

---

### §6.3 · The optional passphrase (BIP-39 "25th word") — a real feature with a real cliff 🔶

The core already supports the BIP-39 optional passphrase: `mnemonicToSeed(mnemonic, passphrase)` folds it
into PBKDF2 so a different passphrase yields a completely different seed, and therefore a completely different
identity ([`mnemonic.ts`](../../packages/core/src/mnemonic.ts)). This is a genuinely useful security
primitive — it enables a hidden/decoy wallet and defeats an attacker who has *only* the written words — but
it is the sharpest cliff in the whole system: **the passphrase has no recovery whatsoever.** It is not stored
in the vault semantics as a resettable factor; it is an input to the math. Lose it and the 12 words open a
*different, empty* wallet, with no error and no hint that anything is wrong.

Because of that asymmetry, the passphrase is **opt-in behind an unmissable warning** (the code comment in
`mnemonic.ts` mandates it: *"losing it loses the funds; the UI layer must communicate this before enabling
it"*). The honest framing we present: a passphrase turns your one secret into *two* secrets you must never
lose, in exchange for surviving the theft of the first. That is the right trade for some users and a
foot-gun for most, so it is never a default and never enabled silently.

---

### §6.4 · The roadmap — surviving the loss of the seed, judged against the Invariant ⏭

The goal of recovery R&D is precise: **remove the single-seed single-point-of-failure without adding a
custodian.** Three mechanisms are on the map. Each is designed here as the target and tagged ⏭ roadmap —
none ships today — and each is run through the §6.0 Invariant test rather than described as if convenience
were the only axis.

**(a) Social recovery / guardians ⏭ (couples to §2 smart accounts).** The Argent/Safe model: the *account*
is a smart contract, and a threshold **M-of-N** of user-chosen guardians can authorize rotating its signing
key to a fresh device, behind a **timelock** the user can veto. Mapped to us, this rides on the ERC-4337
smart-account abstraction defined in **§2** — the recovery logic *is* account-contract logic. Against the
Invariant: it **passes** iff no single guardian can act alone and **we are never a guardian** (or are only
one of many, below threshold). Honest trade-offs and limits:
- **Chain-bound.** Smart-account recovery exists only where there are smart accounts. Bitcoin's UTXO model
  and Solana have no equivalent contract account, so social recovery is inherently **EVM-first**; the seed
  necessarily remains the recovery root for the BTC and SOL identities. Any marketing of "social recovery"
  that hides this is dishonest, and we won't.
- **Guardian availability & collusion.** Recovery requires M guardians to be reachable *and* honest; a
  colluding threshold is a theft threshold. Guardian selection UX for non-technical users is an unsolved
  design problem, not a solved one.
- **Privacy.** A naïve guardian set leaks a social graph on-chain; the design must minimize that (e.g.,
  hashed/stealth guardian references), which is exactly the kind of detail that separates a real spec from a
  slide.

**(b) MPC threshold signing ⏭ (no single seed ever exists).** The Web3Auth/tKey/Coinbase-MPC model: there is
no seed to lose because the private key is never assembled — it is split into shares, and a threshold *t* of
them jointly produce a signature. This directly attacks the single-point-of-failure. But it is where the
Invariant bites hardest, and where several shipped products quietly failed it. The test: *"which set of
shares reconstructs, and is our server in it?"* If a server share plus a login-gated share reaches threshold,
and we control the login, **we are the custodian** — MPC or not. So the only honest MPC design for us is one
where **our infrastructure never holds a thresholding share**: e.g. shares = `{device keystore, passkey/OS
factor, user-held backup share}`, with any network-assisted share deliberately *non-thresholding* (it can
help liveness but cannot, with any one user factor, sign). Trade-offs stated plainly: MPC does not delete the
backup problem, it *reshapes* it — "back up 12 words" becomes "don't lose 2 of 3 factors," which is different,
not obviously easier; and it adds share-refresh, protocol complexity, and a new audit surface. The
"who-holds-the-shares" question is not a footnote — it *is* the entire security argument.

**(c) Passkey-backed recovery ⏭ (adjacent to §7 device trust).** Passkeys/WebAuthn are attractive because
platforms already sync them (iCloud Keychain, Google Password Manager). That sync is also the trap. The
distinction the design must hold:
- **Passkey as *unlock* — allowed.** A passkey (or biometric over the OS keystore) replaces the *password*
  that opens a **locally-stored** vault. The seed never leaves the device; the passkey just gates local
  decryption. This is the natural extension of the Phase-8 OS-keystore wrap already mandated in
  [ADR-0029 / SECURITY.md §3.3](../../SECURITY.md) and lives largely in §7.
- **Passkey as *cloud seed-escrow* — forbidden.** If a passkey directly wraps a seed stored in
  Apple/Google's synced keychain, then the platform's escrow of that sync becomes a custodian of your funds,
  and a platform account compromise is a fund compromise. That fails the Invariant and is an anti-pattern
  (§6.5), no matter how smooth the UX.

The comparison, at a glance:

| Mechanism | Removes single-seed SPOF? | Passes the Invariant? | Works on | Central risk | Status |
|---|---|---|---|---|---|
| **Seed phrase** (today) | ❌ (it *is* the SPOF) | ✅ fully non-custodial | BTC · EVM · SOL | User loses / leaks the 12 words | ✅ **Shipped** |
| **Social recovery / guardians** | ✅ | ✅ *iff* no single guardian & never us | **EVM only** (needs §2) | Guardian availability & collusion | ⏭ Roadmap |
| **MPC threshold** | ✅ (no seed exists) | ✅ *iff* our infra never holds a threshold | design-dependent | "Who holds the shares" | ⏭ Roadmap |
| **Passkey-as-unlock** | ❌ (unlock, not backup) | ✅ (on-device) | all | Device loss still needs a seed/other path | ⏭ Roadmap (§7) |
| **Passkey-as-cloud-escrow** | ✅ | ❌ platform becomes custodian | — | — | ⛔ **Rejected** (§6.5) |

---

### §6.5 · The anti-patterns — recovery designs we will never ship ⛔

These are not "hard to build." They are easy to build, they *test well with users*, and they are custody.
Each one fails the §6.0 Invariant, and per the Doctrine a design that fails the Invariant is **wrong even if
it works.** They are listed so no future PR can reintroduce one under deadline pressure and call it a feature.

- **Email / SMS "reset your keys."** If a code sent to an inbox restores funds, the email provider — and
  anyone who phishes, SIM-swaps, or subpoenas it — is your custodian. This is *the* defining anti-pattern of
  fake non-custody, and the fastest tell that a "self-custody wallet" isn't one.
- **Server-held seed escrow / "encrypted cloud backup" where we hold (or can obtain) the decryption key.**
  If our infrastructure can decrypt the backup, our infrastructure can spend. "Encrypted" is not a defense
  when we hold the key.
- **"Contact support to recover your account."** If support can restore you, support can be socially
  engineered, bribed, or legally compelled to restore an *attacker*. A human override is a custodial override.
- **Security questions / knowledge-based auth.** Low-entropy, phishable, and — if they gate fund access — a
  custodial reset in disguise.
- **A recovery vendor whose share, combined with *our* infrastructure, reconstructs the key.** This is the
  Ledger-Recover cautionary tale: the controversy was precisely that a firmware path could export-and-shard
  the seed to third parties. We treat *"the seed can leave the device to anyone but the user"* as a flat
  Doctrine #1 violation — there is deliberately **no code path** in `packages/core` that transmits it.
- **Telling users to screenshot or cloud-photo the phrase.** A photo lands in cloud photo sync — an
  unaudited custodian. Our backup guidance is on-material (write it down / steel plate), never "save an image."

The rule, stated as a gate: **if a proposed recovery mechanism can be operated to completion by any party
that is not the user's own device or the user's own secret, it is rejected in Security Review** (SECURITY.md
§13), and only a written CEO ADR could overrule it — which, for Doctrine #1, would itself be a defect.

---

### §6.6 · Fail-closed recovery — the doctrine at the recovery boundary

Recovery is a *guard surface*, and it obeys the same law as every other guard in the system
([SECURITY.md §1.3](../../SECURITY.md), the [broadcast guard](../../packages/chains/src/guard.ts)): **anything
a mechanism cannot *positively* verify is refused, never best-effort'd.** Concretely, today and on the
roadmap:

- **Import verifies before it derives.** `importWallet` runs the full BIP-39 wordlist + checksum check and
  throws `INVALID_MNEMONIC` on failure; a mistyped or partial phrase yields *nothing*, never a silently-wrong
  wallet. There is no "did you mean" fuzzy match on a recovery phrase.
- **Re-auth trusts the ciphertext, not a flag.** As in §6.2, the reveal gate uses `verifyPassword()` — a
  direct vault decryption — rather than the unlock flag, so an already-unlocked session cannot be walked past
  the gate with any string. Fail-closed against the *convenient* bug, not just the malicious one.
- **Decryption failure is an opaque refusal.** Wrong password and tampered vault both fail as
  `VAULT_DECRYPT_FAILED` — no oracle, no partial reveal.
- **Roadmap rotations must gate themselves.** A guardian key-rotation that has not met threshold, or whose
  timelock has not elapsed, is refused by the account contract — with **no emergency-override path**, because
  an override is exactly the custodial backdoor §6.5 forbids. An MPC recovery that cannot assemble a legitimate
  threshold **fails to sign**; it does not degrade to a weaker single-share path on outage. This mirrors the
  never-weaken rule already binding on `autoDecision` and the spend caps (SECURITY.md §5): a recovery
  mechanism may never silently fall back to a less-safe one to "stay available."

---

### §6.7 · States & microcopy — the recovery flows a first-timer must survive

Recovery is where a frightened user meets the worst moment in the product, so its states must be *more*
honest than anywhere else, not less (Ch4 voice; UX_GUIDELINES honesty). The two live flows and the honest
copy for the cases where the truthful answer is *no*:

| Flow · state | What the user sees / the copy that never lies |
|---|---|
| **Backup → new phrase** | Phrase shown once; *"Write these 12 words down in order. This is the only way to restore your wallet. We never see it and can never recover it for you."* Then quiz-verify. |
| **Backup → quiz fails** | *"That doesn't match — check your written copy."* No skip-ahead; the wallet is not "safe" until backup is proven. |
| **Restore → typing** | Live per-word validation against the wordlist; the last word turns the checksum green only when the whole phrase is valid. |
| **Restore → invalid phrase** | *"This recovery phrase isn't valid. Check the spelling and word order."* Never a partial import, never a guess (§6.6). |
| **Restore → success** | *"Welcome back. Your Bitcoin, Ethereum, and Solana identity is restored."* — the same identity, provably, no "syncing" spinner that implies a server. |
| **Forgotten password** | *"We can't reset your password — by design, we hold no copy of your keys. If you have your recovery phrase, you can restore the wallet and set a new one."* Honest, with the one real path handed forward — never softened into false hope (SECURITY.md §3.5). |
| **Compromised seed (row 5)** | *"If someone else may have your recovery phrase, treat it as lost. Create a new wallet on a device you trust and move your funds — no recovery can undo a leaked phrase."* Rescue-honest, not recovery-fiction. |
| **Wipe device** | Re-auth + explicit confirm; *"This deletes this wallet from this device. You can only get it back with your recovery phrase."* The irreversibility is stated *before* the tap. |

The throughline: at every recovery state the interface tells the user the truth about who can and cannot help
them — which is almost always *only you, with your phrase* — because in recovery, a comforting lie is the one
that loses the funds.

---

### What §6 commits us to

- **The seed phrase is the recovery method, and it is complete.** Deterministic BIP-32/44/84 + SLIP-0010
  derivation means re-importing the mnemonic *provably* reconstructs the identical BTC/EVM/SOL identity and
  its funds, on any device, with **no server** — shipped and conformance-tested (`packages/core`, task #93).
- **Every live recovery flow gates non-custodially.** Backup is shown once and quiz-verified; reveal
  re-auths against the ciphertext (`verifyPassword`, never `unlock`); import verifies the BIP-39 checksum
  before deriving; wipe is a heavy, irreversible, re-authed delete of ciphertext only.
- **The Recovery Invariant is absolute.** No server, vendor, or single third party may unilaterally restore
  access — because that capability is identical to the capability to steal. Every roadmap mechanism is judged
  by it, and the anti-patterns (§6.5) are rejected by it.
- **The roadmap softens the single-seed cliff without a custodian.** Social recovery (EVM-only, via §2
  smart accounts), MPC where our infra never holds a threshold, and passkey-as-unlock (§7) — each ⏭ roadmap,
  each honest about its limits; passkey-as-cloud-escrow is rejected outright.
- **Recovery fails closed.** What a mechanism cannot positively verify is refused — no partial import, no
  re-auth bypass, no emergency override, no silent degrade to a weaker path.
- **The UI tells the recovery truth,** including the hard *no*s (forgotten password, leaked seed), because in
  recovery a comforting lie is the one that loses the money.

The mechanics of the smart accounts that social recovery rides on are §2; the device-trust and OS-keystore
side of passkey unlock is §7; and why deterministic derivation lets multi-device work with *no* seed sync is
§8 — this section owns only how a user regains the authority to sign, and the guarantee that no one else can.


## §7 · The Device Trust Model

> *Every promise in this chapter — three addresses, one identity, a tree of accounts, a name, a recovery
> phrase — eventually cashes out to a single physical question: on the machine in the user's hand, what
> stands between the seed and the wire? §1 proved which keys exist. §5 proved how many. This section proves
> where they live, who may wake them, and exactly which bytes are allowed to leave. The answer is the spine
> of "non-custodial": the device is the root of trust, and the server is never invited into the room.*

Chapters 1 and 4 sold a wallet a non-technical stranger can talk to and trust; §1 of this chapter showed that
"trust" is paid for in on-device key material. §7 is where we account for the *device itself* as a security
boundary. The other sections of Chapter 5 answer "what is the identity and how does it move between devices"
(§6 recovery, §8 sync); this one answers the narrower, more physical question underneath all of them: **on one
specific device, between the instant a password is typed and the instant a signature is broadcast, what
protects the secret — and what happens when that device falls into the wrong hands?** Everything here is
grounded in `packages/core` (the device-only engine) and governed by [`SECURITY.md`](../../SECURITY.md); most
of it is **shipped and tested**, and the parts that are not (biometric/passkey unlock, hardware-backed key
wrap) are tagged **⏭ (roadmap)** and never dressed up as done.

The trust model rests on one asymmetry, stated in SECURITY.md §2.1 and worth re-stating as the frame for this
whole section: **only one asset in the system is catastrophic if lost — the seed and the private keys derived
from it — and that asset never leaves the device.** Session tokens, addresses, balances, and intents all live
on servers and are privacy or availability concerns; a total server compromise is a bad day, not a lost
wallet. The device is where the only irreversible loss can happen, so the device is where the constitution
concentrates its defenses.

---

### 7.1 · The root of trust is the device, not a server

The platform's trust zones (SECURITY.md §2.3) draw one line that matters more than all the others: the
boundary around **Zone 0 — the device**, inside which the seed, the vault, and the signer live. The invariant
is testable and absolute:

> **The only bytes that ever cross out of Zone 0 are (a) signatures and (b) opaque vault ciphertext.** Neither
> can be reversed into a key.

Everything in §7 is an elaboration of that one sentence. A signature spends money but reveals no secret; the
vault ciphertext is a scrypt+AES-256-GCM sealed blob that is worthless without a password the server never
sees. So a breach of any server-side zone is, *by construction*, a privacy/availability incident and **never**
a path to fund loss — because the material that moves funds was never there to steal. This is not a policy we
enforce with vigilance; it is a shape we enforce with architecture. `packages/core` has **zero network I/O**,
lint- and review-enforced (SECURITY.md §3), so there is literally no code path by which a key could be
transmitted, even by a future mistake. The device is the root of trust because it is the only place a key ever
exists in a usable form.

---

### 7.2 · The keystore — a sealed vault, opened only into memory, only to sign

The seed is sealed the instant it exists and is never persisted in the clear. The construction is
[`packages/core/src/vault.ts`](../../packages/core/src/vault.ts), summarized in SECURITY.md §3.2; here we
read it specifically as a *trust* boundary — the at-rest half of the device model:

```
Vault = AES-256-GCM( key = scrypt(NFKD(password), salt), plaintext = mnemonic, aad = ⟨every envelope field⟩ )
```

| Property | Value | Why it is load-bearing for the device model |
|---|---|---|
| KDF | scrypt, **N=2¹⁵, r=8, p=1** (≈32 MiB, ~100 ms/phone) | A stolen vault is a brute-force problem against a memory-hard KDF, not a copyable secret |
| KDF param bounds | N ∈ [2¹³, 2²²] pow-2, r ∈ [1,64], p ∈ [1,16], enforced on **open** | A hostile envelope cannot demand gigabytes of KDF memory (DoS gate) — the device fails closed on malformed input |
| Cipher | AES-256-GCM (AEAD) | Confidentiality **and** integrity in one primitive: a tampered vault does not decrypt, it *fails* |
| AAD | version ‖ KDF params ‖ salt ‖ cipher ‖ nonce, canonically bound | Flipping *any* envelope field fails authentication, not just the ciphertext body |
| Failure mode | wrong password **and** tampered vault → the same `VAULT_DECRYPT_FAILED` | An attacker learns nothing about *which* — no oracle |

The lifecycle is the point. `sealVault` runs the moment a wallet is created or imported and the mnemonic bytes
are zeroized immediately after (`WalletManager.#seal`). `openVault` is the *only* way back to plaintext, and it
returns a `Uint8Array` the caller must own and wipe — which `WalletManager.unlock` does in a `finally` after
handing the decoded phrase to the keyring. From there the seed lives **in memory only while unlocked**, held by
the `HDKeyring`; it is never written back to disk in the clear on any path. What persists between sessions is
exactly one thing: the opaque vault envelope, sitting behind the `SecureStore` boundary
([`wallet/secure-store.ts`](../../packages/core/src/wallet/secure-store.ts)).

That `SecureStore` is deliberately a thin interface the platform fills. On the web today it is a
`LocalStorageSecureStore` ([`apps/web/src/wallet.ts`](../../apps/web/src/wallet.ts)); on mobile it will be the
iOS Keychain / Android Keystore (**⏭ Phase 8**). Crucially, whatever the platform provides, **what it stores is
already client-encrypted ciphertext** — the OS store is a *second* layer of defense, not the only one. A wallet
whose only protection was "the OS keychain is locked" would be one jailbreak away from disaster; ours is a
sealed vault whose key is derived from a password the device never persists and the server never sees, wrapped
*again* by the OS store where the platform offers one.

---

### 7.3 · The unlock model — password today, biometric/passkey tomorrow

**Shipped (✅):** the sole factor is a password, and the password *is* the key-derivation input — there is no
separate stored secret to steal. `scrypt(NFKD(password), salt)` produces the 32-byte AES key; a correct
password reconstructs the vault key and decrypts the seed, a wrong one produces a different key and GCM
authentication fails. NFKD normalization means visually-identical unicode passwords derive the same key across
keyboards and platforms. Two properties of this flow are trust-critical:

- **The server holds no password and no derived key.** Unlock is a purely local computation; nothing about it
  touches a wire. This is why a forgotten password is *unrecoverable by design* (SECURITY.md §3.5, and §6): we
  hold nothing to reset. The device model would be a lie if a server could unlock a wallet — so no server can.
- **Re-authentication is a real, separate check — never a cached flag.** Sensitive reveals (showing the
  recovery phrase) must re-verify the password even while the wallet is already unlocked.
  `WalletManager.verifyPassword` decrypts the envelope *directly* and never short-circuits on the in-memory
  unlock flag ([`wallet-manager.ts`](../../packages/core/src/wallet/wallet-manager.ts); wired through
  `apps/web/src/wallet.ts`'s `verifyPassword`). The code comments the trap explicitly: `unlock()` is a no-op
  when already unlocked and *would accept any password*, so it must never be used for re-auth. The reveal-seed
  gate re-derives the vault key from the freshly-typed password or it does not open.

**Roadmap (⏭, Phase 8, ADR-0029):** biometric and passkey unlock. The design principle we commit to now, so we
build toward it honestly, is that **a biometric never becomes the key — it gates *access to* the key.** Face
ID / Touch ID / a device passkey authorizes the OS secure element to release (or unwrap) the vault key; the
seed stays encrypted at rest under a hardware-wrapped key either way. This is the same shape Phantom and Rabby
use for biometric unlock, and it is the only shape that preserves the §7.2 invariant: convenience factors
change *who may wake the vault*, never *whether the seed is encrypted at rest*. Until it ships, we say plainly
that unlock is password-only.

---

### 7.4 · Session & auto-lock — shrinking the unlocked window

An unlocked wallet is a loaded one: the seed is in memory and signatures are possible. The trust model's job is
to make that window as small as the user will tolerate, and to slam it shut on inactivity. That is
`SessionManager` ([`wallet/session.ts`](../../packages/core/src/wallet/session.ts)) — a pure timer that holds
**no key material** and does exactly three things: arm an idle timer on unlock, reset it on user activity
(`touch()`), and fire an `onLock` callback when the timer elapses. The `WalletManager` wires that callback to
`lock()`, which **destroys the keyring** — zeroizing the seed and the root node — after which every keyring
method throws `KEYRING_DESTROYED`.

| Property | Value | Why |
|---|---|---|
| Default idle timeout | **15 min** on web (options `0 / 5 / 15 / 30 / 60`); **5 min** in the core default | User-configurable in Settings; `0` disables auto-lock, honestly labeled |
| Reset trigger | `touch()` on meaningful activity re-arms the timer | The window follows real use, not a fixed guillotine |
| On elapse / manual lock / background | keyring destroyed, seed zeroized, signer released | Locked state holds *nothing* that can sign |
| Timer source | injectable `Scheduler` (no real clock in core) | Determinism: the auto-lock is unit-tested with a fake clock, never `Date.now()` |

Two honesty notes. First, the web timeout is read once at `WalletManager` construction
(`apps/web/src/wallet.ts`), so a Settings change takes effect on the next unlock/reload — the code says so, and
so do we. Second, auto-lock **shrinks** the unlocked window; it does not eliminate the risk that lives inside
it (§7.7). It is a mitigation with an honest name, not a claim that a walked-away-from unlocked device is safe.

---

### 7.5 · The signing boundary — every signature happens on this device

The disposal of funds happens in exactly one place, and it is on the device. `SigningManager`
([`signing/signer.ts`](../../packages/core/src/signing/signer.ts)) is the unified surface over the keyring, and
every method follows the identical discipline: **derive the account key on demand, sign, and zeroize the key in
a `finally` block.** No signer keeps a key past its own call; private keys have the shortest possible lifetime
in memory. The surface spans all three ecosystems, each respecting its own rules:

| Ecosystem | What is signed | Bytes emitted |
|---|---|---|
| **EVM** | EIP-1559 transaction · EIP-712 typed data · EIP-191 `personal_sign` | secp256k1 ECDSA (RFC-6979 deterministic, low-s), 65-byte `r‖s‖v` |
| **Bitcoin** | PSBT input(s) | secp256k1 ECDSA witness, per BIP-84 P2WPKH |
| **Solana** | serialized transaction message | ed25519, 64-byte signature |

Two invariants make this a *trust boundary* rather than merely a code path. **The signer emits exact bytes:**
the signature covers precisely the transaction/message it was handed — core never blind-guesses, and the
human-comprehension work (decode, simulate, risk verdict, confirm) happens upstream where the user can see it
(SECURITY.md §3.3, §4; the confirm surface is Chapter 4's and the guard is §5 of SECURITY). And **the AI has no
signing authority** (Doctrine #2): the worst a fully-hijacked model can do is emit a *proposal*, which faces
every deterministic gate before any key is touched. The device signature is the sole disposer of funds, and it
is produced here, locally, with a key that existed for the duration of one function call. Because switching HD
accounts (§5) re-points which index the signer derives at, the signing key is always the *active* account's and
never another's — the multi-account model and the signing boundary are the same guarantee seen from two angles.

---

### 7.6 · What the server is allowed to know — and what it can never

Non-custodial does not mean serverless; it means the server is a **convenience and coordination** layer that is
structurally incapable of moving funds. The line is bright and worth drawing as a table:

| The server MAY know | The server can NEVER know |
|---|---|
| Public receive addresses (BTC / EVM / SOL) | The seed, the mnemonic, or any private key |
| A SIWE session (who is signed in) via a JWT | The vault password or the scrypt-derived vault key |
| Balances, history, intents, portfolio (privacy data) | Anything that can produce a signature |
| Plan/quote/risk metadata bound to a subject | — |

Authentication uses the *same* signature the wallet already produces — no new secret crosses the wire.
**SIWE (EIP-4361, ✅):** the server issues a one-time nonce; the wallet signs it in the browser with
`personal_sign` — *no transaction, no fee, key never leaves the device*
([`apps/web/src/auth.ts`](../../apps/web/src/auth.ts), [`services/api/src/auth/siwe.ts`](../../services/api/src/auth/siwe.ts));
the server *recovers* the address from the signature and checks it against the nonce. It never receives a
credential; it verifies a proof. The resulting session is an HS256 JWT verified constant-time and fail-closed
(SECURITY.md §6), and it is **bound to the principal** that signed it — which is exactly why the account
switcher (§5.5) drops a session the moment the active account no longer matches: a server-authorized call must
never run under an identity the current device did not prove. The takeaway for the device model: even a fully
authenticated session is a *read/coordinate* credential, not a spend credential. The spend credential is the
on-device signature, and it is minted fresh, locally, per transaction.

---

### 7.7 · The compromised-device threat model — and an honest residual

A trust model that only describes the happy path is marketing. Here is the device under attack, by tier, with
what actually protects it and what does not — because "encryption at rest" and "fail closed" are not slogans,
they are the difference between these rows:

| Attacker capability | What protects the seed | Residual (stated honestly) |
|---|---|---|
| **Stolen *locked* device** (has the vault ciphertext) | scrypt (32 MiB, ~100 ms/attempt) + AES-256-GCM; no password on device or server | Offline brute-force bounded by password strength × scrypt cost. A strong password is safe today; a weak one is the user's exposure — surfaced in UX, not hidden |
| **Tampered vault / hostile envelope** | GCM AEAD authenticates every field via AAD; scrypt param bounds enforced on open | Tampering fails to `VAULT_DECRYPT_FAILED` / `VAULT_CORRUPTED` — it *fails closed*, never degrades to plaintext or a DoS |
| **Stolen device caught *unlocked*** | Auto-lock idle timer (§7.4); manual lock; lock-on-background | Whatever the idle window allows before lock. We shrink it; we do not pretend it is zero |
| **Malware with process-memory access on an unlocked device** | Per-op key zeroize; keyring destroyed on lock; seed in heap only while unlocked | **Game over — for any hot wallet.** While unlocked, seed and derived keys are in the JS heap and readable by code that owns the process |

That last row is the one most wallets hide and we refuse to. **We do not promise to protect a fully-owned,
unlocked device with the wallet open** (SECURITY.md §2.2, §3.3) — no hot wallet can, and saying otherwise would
be the exact kind of lie Doctrine #3 forbids. What we *do* is name it, shrink the window that exposes it
(auto-lock, per-operation zeroize, keyring destruction on lock), and design the path that closes it further:

**⏭ Roadmap (Phase 8, ADR-0029):** move the vault-key unwrap and, ultimately, signing itself behind **native
secure hardware** — a Secure Enclave / StrongBox / TPM-backed key that wraps the vault key so it is never
present in application memory in the clear, gated by biometric/passkey (§7.3), with certificate pinning in the
apps to harden the transport around it. When that lands, the malware-on-unlocked-device residual shrinks from
"reads the seed" toward "must coerce a hardware signer per operation" — a categorically smaller blast radius.
Until it ships, it is a mandated requirement with a landing phase, tagged `⏭`, not a control we claim.

The reason the at-rest defenses matter so much is precisely this table's top rows: for the overwhelmingly
common loss event — a device that is *lost or stolen while locked* — encryption-at-rest plus fail-closed
parsing turn a catastrophe into a bounded brute-force problem the user's password strength governs. The seed is
not sitting in a file; it is sitting inside a memory-hard KDF and an authenticated cipher, and the device
refuses every malformed or tampered path rather than leaking a hint.

---

### 7.8 · Shipped vs roadmap — the honest ledger

Per the SECURITY.md legend, every control names its real state; a device-trust section that blurred this would
itself be a doctrine violation.

- ✅ **Shipped and tested** (`packages/core`, covered by the device-core conformance + unit suites; `apps/web`):
  the scrypt+AES-256-GCM sealed vault; password unlock with NFKD normalization; direct-decrypt
  re-authentication for sensitive reveals (`verifyPassword`); the `SessionManager` auto-lock (configurable,
  deterministic, fail-closed) with keyring destruction on lock; on-device signing across EVM (1559/712/191),
  Bitcoin PSBT, and Solana with per-op key zeroization; SIWE session auth (`personal_sign`, no key on the wire)
  with constant-time, fail-closed JWT verification and principal binding; `wipe()` that removes the vault
  ciphertext from the device.
- ⏭ **Roadmap (labeled, not claimed):** biometric/passkey unlock and OS-secure-element (Secure Enclave /
  StrongBox / Keychain / Keystore) wrapping of the vault key, plus app certificate pinning — **Phase 8,
  ADR-0029**. Hardware co-signing / MPC to shrink the single-device blast radius belongs to Recovery (§6);
  ERC-4337 session keys that scope on-device authority live in §2; keeping the same identity across devices
  without any server holding a secret is §8. None of these ship today.

---

### 7.9 · What §7 commits, and how it holds the chapter's line

- **The device is the root of trust.** Only signatures and opaque vault ciphertext ever leave it; `packages/core`
  has zero network I/O, so no key *can* be transmitted. A server breach is a privacy incident, never fund loss.
- **The keystore is a sealed vault, opened only into memory, only to sign.** scrypt+AES-256-GCM; the seed is
  never persisted in the clear; the OS secure store is a *second* layer over already-encrypted ciphertext.
- **Unlock is a local password today; biometric/passkey is roadmap** — and even then a biometric gates *access
  to* the key, it never *is* the key. Re-auth is a real re-decrypt, never a cached flag.
- **Auto-lock shrinks the unlocked window** with a pure, deterministic, fail-closed timer that destroys the
  keyring on lock — honestly a mitigation, not an elimination.
- **Every signature happens on-device**, per-op key derived and zeroized, across BTC / EVM / SOL; the AI has no
  signing authority, and the active-account key is the only one that can move money.
- **The server may know public addresses and a SIWE session — never a secret.** Auth is a proof, not a
  credential; the session is a read/coordinate token, and the spend token is the local signature.
- **The compromised-device residual is named, not hidden:** a locked stolen device is a bounded brute-force
  problem; an unlocked, malware-owned device is game over for any hot wallet, and we say so while building the
  hardware-backed path (Phase 8) that shrinks it.

This is the device half of the non-custodial promise §1 opened and §6/§8 will carry between devices: the seed
is generated, sealed, unlocked, and signed *here*, on the user's own machine, and the only thing that ever
crosses the boundary is a signature that spends money without ever revealing the key that made it. Recovery
(§6) and sync (§8) inherit this floor and may never lower it — if either ever required a server to hold
seed-equivalent material, the feature would be redesigned, not the doctrine.


## §8 · Multi-Device Sync

> *Two phones, one identity — and never a key on a wire. The seed is not "in the cloud"; it is rederived
> on each device from the twelve words the user already holds (§1, §5). What legitimately travels between
> devices is not the secret but the **settledness around it** — contacts, labels, preferences, automation
> rules — and even that leaves the device only as ciphertext the server cannot read. This section is
> **roadmap**; its job is to design sync so that shipping it can never quietly turn a non-custodial wallet
> custodial.*

Every section of Chapter 5 so far has been able to lean on a single fact: the identity is *rederived, never
transported* (§1.5). A seed produces the same three-address triple (§1) and the same device-independent
identity id (§1.4) on any machine that holds the phrase, and it produces a practically unbounded column of
those identities (§5) — all without a server ever seeing a secret. Multi-device is where that fact stops being
a convenience and becomes the *entire* design constraint. The naïve product answer to "I want my wallet on my
laptop too" is "sync it to the cloud" — and that answer, taken literally, is the one thing this wallet may
never do. A wallet you can "sync" by uploading a decryptable key is a **custodial** wallet with a
non-custodial marketing page. So §8 does not ask "how do we move the wallet to the second device"; it asks the
two questions that keep custody on the device: **what actually has to be the same on both devices, and which
of those things is a secret?** The keys are a secret and they never move. Almost nothing else is, and that
"almost nothing else" is what sync is allowed to touch.

This section is tagged **⏭ Mandated (roadmap)** as a whole, in the shared legend of [`SECURITY.md`](../../SECURITY.md)
and [`DATABASE.md`](../../DATABASE.md): no sync *service* runs today. But the foundation it stands on is
**✅ shipped** and cited below — deterministic rederivation (§1, §5), per-device encrypted vaults
(`packages/core`, [`apps/web/src/wallet.ts`](../../apps/web/src/wallet.ts)), a device-independent identity id
(`computeIdentityId`, `packages/identity/src/identity.ts`), and deterministic, dedupe-safe contact ids
(`packages/identity/src/contacts.ts`). The roadmap here is a small, honest layer on solid ground, not a leap.

---

### 8.1 · The hard constraint — the seed never syncs, in any form

State this first, because everything else is a consequence of it. **Private key material — the seed, the
mnemonic, any derived key, and the encrypted vault that seals them — is never carried by the sync channel.**
Not in plaintext (obviously), and not as ciphertext either. This is Doctrine #1 and [`SECURITY.md`](../../SECURITY.md)
§1.1 restated at the multi-device boundary: *if a feature needs the server to hold a secret, the feature is
redesigned, not the doctrine.* The trust-boundary invariant from SECURITY.md §2.3 is the exact rule sync must
obey — the only bytes that ever leave Zone 0 (the device) are **signatures** and **opaque, non-key
ciphertext**, and neither can be reversed into a key. A sync design that puts anything else on the wire has
crossed the line that the whole architecture exists to hold.

The subtle part is the phrase *"not as ciphertext either,"* because a reader who has absorbed the vault design
(SECURITY.md §3.2) will object: the vault is already `AES-256-GCM(scrypt(password), mnemonic)` — opaque
ciphertext the server can't read — so why not just sync *that*? Two reasons, and they are the difference
between a backup and a custody hazard:

- **A synced vault centralizes a phishable brute-force target.** A vault's confidentiality rests entirely on
  the user's password through scrypt (N=2¹⁵). That is a strong at-*rest* guard on a device an attacker must
  first steal. Upload that same ciphertext to a shared store and you have handed every attacker who breaches
  that store an *offline* oracle against every user's password at once — no device theft required. On-device,
  compromise is retail (one stolen phone); in a synced blob store, it is wholesale. The doctrine's whole point
  is that a server breach is a *privacy* incident, never a path to funds (SECURITY.md §2.1); syncing vaults
  would convert exactly that guarantee into "a privacy incident, unless the attacker also cracks a password,
  in which case it is fund loss" — a downgrade we refuse.
- **A backup is not a sync, and they have different owners.** There *is* a sanctioned way to put an
  encrypted-seed blob on our infrastructure: an **opt-in, client-encrypted backup** the server stores as
  ciphertext it cannot decrypt (`backup_blobs` holds `s3_key + content_hash + size_bytes`, never plaintext —
  DATABASE.md §7). That is a *recovery* mechanism, owned by **§6 (Recovery Architecture)**, with its own
  explicit consent and its own honest warning ("lose the seed *and* the backup password and no one, including
  us, can recover your funds"). §8's sync channel is a *different pipe with a stricter rule*: it never carries
  key material even as ciphertext, so that "is my seed on their servers?" has one answer for the routine
  multi-device experience — **no** — and the only exception is a recovery feature the user turned on
  deliberately and understood. Keeping these lanes separate is what lets us describe each one honestly.

So the seed's multi-device story is already told and needs no server: **rederivation** (§1.5). The open design
space in §8 is everything that is *not* the seed.

---

### 8.2 · Decomposing "the same on both devices" — three layers, one of them secret

"Make my wallet the same on both devices" is really three requests wearing one sentence. Pulling them apart is
the whole architecture, because they have three different answers.

| Layer | What it is | How it becomes "the same" on device B | Secret? |
|---|---|---|---|
| **Keys & signing authority** | seed → the 3-address triple, private keys, the vault | **Rederived on-device** from the phrase (§1, §5). Never transmitted. | **Yes — never syncs** |
| **Identity & derived facts** | identity id, the receive addresses, account indices | **Recomputed deterministically** from the seed (`computeIdentityId`, `derivationPaths`) — identical on every device by construction, no sync at all. | No (public), no sync needed |
| **Non-secret state** | contacts, labels, display preferences, network mode, automation rules, watch-lists | The **only** thing sync exists to move — and only as E2EE ciphertext (§8.4). | No — but private metadata |

The middle row is the quiet win that §1.4 already paid for and this section simply collects. Because the
identity id is `sha256(btc | evm.toLowerCase() | sol).slice(0, 32)` — a pure function of addresses that are a
pure function of the seed — **device A and device B compute the same identity id with zero coordination.** No
sync record establishes "these two devices are the same person"; the seed already did, deterministically. That
is why the identity module's own docstring can state, correctly, that *"multi-device needs no server sync of
the identity itself — only preferences/contacts sync, and those are optional"*
(`packages/identity/src/identity.ts`). §8 is the design of that parenthetical, and nothing more.

The top row is closed (§8.1). So the entire remaining surface of multi-device sync is the **bottom row** —
and the two honest models below differ only in how far they go into it.

---

### 8.3 · Model A — Independent Vaults (re-import per device) · shipped-adjacent

The first model is the one that is essentially *already here*, and it is the one every self-custody wallet the
user respects — MetaMask, Phantom, Rabby, Ledger Live — uses as its baseline: **each device is a full,
standalone wallet that independently derived the same identity from the same phrase.** There is no sync service
at all. The user reveals the recovery phrase on device A (through the re-auth-gated reveal flow —
`revealMnemonic()` in [`apps/web/src/wallet.ts`](../../apps/web/src/wallet.ts), guarded per SECURITY.md §3.4
and §6), and *imports* it on device B (`importWallet(mnemonic, password)`), which generates its **own** fresh
vault, sealed under a password the user chooses **for that device**.

What makes this genuinely non-custodial, and not merely offline, is what the two vaults do *not* share:

- **Two vaults, two passwords, two salts, two nonces.** Device B's `importWallet` runs the same
  `scrypt + AES-256-GCM` seal (SECURITY.md §3.2) over the same mnemonic but with a fresh random 32-byte salt
  and 12-byte nonce and, if the user wishes, a different password. The ciphertext on device B is *unrelated* to
  the ciphertext on device A even though the plaintext seed is identical. There is no shared vault to steal and
  no server that ever saw either.
- **The identity is provably the same without anything being transmitted.** Both devices independently derive
  the identical triple (§1's conformance guarantee is what makes this a guarantee and not a hope) and therefore
  the identical identity id (§8.2). The user sees the same Bitcoin, EVM, and Solana addresses on both screens
  because the standards say they must — not because a record synced.
- **Revoking a device is local and total.** "Remove device B" is `wipeWallet()` on device B
  ([`apps/web/src/wallet.ts`](../../apps/web/src/wallet.ts)) — it destroys that device's vault and keyring
  (SECURITY.md §3.5). It cannot and need not reach across to device A, because the two never shared state. The
  funds live on-chain under the identity, reachable from any device that holds the phrase; wiping one device
  removes *that device's* ability to sign, nothing else.

The honest limitation of Model A is precisely that it syncs *nothing*: a contact you add on your phone does not
appear on your laptop, a spending rule you set in one place is not enforced in the other, and adding device B
requires exposing the phrase — the single most dangerous moment in the product, which is why it sits behind
re-auth and the §6/§7 device-trust flow rather than a casual button. Model A is the **correct floor**: it is
maximally safe (no server, no synced state, no new attack surface) and minimally convenient. Model B exists to
add convenience *without* stepping over the §8.1 line — and it does so by refusing to touch the top two rows of
§8.2 at all.

**Status:** the primitives are ✅ shipped (`importWallet`, `revealMnemonic`, `wipeWallet`, per-device vault
sealing, deterministic identity). What is ⏭ roadmap is the *guided* "add a device" experience (a QR/handoff
flow, §7's device attestation) that makes re-import feel like a designed feature rather than a manual restore.

---

### 8.4 · Model B — End-to-end-encrypted sync of non-secret state only · roadmap

Model B adds exactly one thing to Model A: it keeps the **bottom row of §8.2** in step across devices —
contacts, labels, display preferences, network mode, and automation rules — through a server that stores
**ciphertext it cannot decrypt**. Keys are still rederived (§1), signing is still per-device (§8.5), and the
server's role is reduced to a dumb, encrypted mailbox keyed by an opaque handle. This is the same posture as
Signal's encrypted account data, 1Password's E2EE vaults, and Apple's iCloud Keychain: the sync provider is a
courier for sealed envelopes, never a reader. The design below is buildable and specified against
[`DATABASE.md`](../../DATABASE.md) so that when it lands it lands as spec, not improvisation.

**The sync key — derived on-device, one-way, and unable to sign.** Sync needs a symmetric key that every one of
the user's devices can reproduce with no coordination, and that the server never sees. The seed already has
that property, so we derive from it — with strict domain separation so the result can never be confused with,
or reversed into, a signing key or the seed:

```
K_sync = HKDF-SHA512(ikm = seed, salt = 0, info = "intent-wallet/sync/v1")   →  32 bytes (AES-256 key)
```

Three properties make this safe and coherent with the rest of the chapter. It is **one-way**: HKDF cannot be
inverted, so `K_sync` reveals nothing about the seed — it is *strictly less* sensitive than the seed that
generated it (indeed, anyone who already has your seed can move your funds, so seed-derived sync adds no new
*catastrophic* exposure; the worst it can leak is your contact list). It is **domain-separated**: the
`info = "intent-wallet/sync/v1"` tag guarantees `K_sync` is not, and can never collide with, any BIP-32/SLIP-0010
signing key (§1.2) — it lives in a different derivation namespace entirely and **never signs anything**. And it
is **deterministic**: device B rederives the identical `K_sync` the instant it imports the seed, so synced state
"just reappears" with no account, no login, no server-side linkage. `K_sync` stays in Zone 0 exactly like a
signing key; only ciphertext leaves.

> **Conservative variant (opt-in).** A user who wants the sync channel's compromise to be *independent* of the
> seed can supply a separate **sync passphrase**, from which `K_sync = scrypt(NFKD(passphrase), salt)` instead.
> The cost is honest: a new device then needs the seed *and* the sync passphrase to restore preferences (the
> seed alone still restores the funds — the passphrase only gates the metadata). We default to seed-derived for
> zero-friction restore and offer the passphrase for users who want the metadata sealed under a second factor.

**The record shape — the server sees an opaque handle and a blob.** Each syncable object (one contact, the
settings document, a label map, one automation rule) is serialized canonically and sealed per-record with
`K_sync`, binding its coordinates as AAD so a record can't be silently retargeted:

```
sync_id     = HMAC-SHA256(K_sync, "sync-id/v1" ‖ identity_id)         // blinded, per-identity, server-visible handle
ciphertext  = AES-256-GCM(K_sync, nonce, canonical(record),
                          aad = ⟨sync_id, record_type, record_id, schema_version, clock⟩)
```

Keying by a **blinded `sync_id`** rather than the raw public identity id is a deliberate privacy choice: the
sync store holds `sync_id`, not your addresses, so a breach of that store cannot be trivially joined to
on-chain activity (the identity id is a function of your addresses — §1.4 — so exposing it as the sync key
would hand a database thief the link for free). A device that imports the seed rederives `K_sync`, hence the
same `sync_id`, hence finds and decrypts its records — no server-side "account" ever links the two devices.
The persisted shape follows the `backup_blobs` precedent (DATABASE.md §7) and the naming conventions of
DATABASE.md §4 — an ⏭ **mandated** table, specified here so it isn't improvised later:

```sql
CREATE TABLE IF NOT EXISTS sync_records (          -- ⏭ roadmap; server stores ciphertext it CANNOT read
  sync_id        TEXT        NOT NULL,             -- blinded per-identity handle; NOT the identity id, NOT an address
  record_type    TEXT        NOT NULL,             -- 'contact' | 'settings' | 'label' | 'automation_rule'
  record_id      TEXT        NOT NULL,             -- deterministic within (sync_id, record_type)
  ciphertext     BYTEA       NOT NULL,             -- AES-256-GCM output; opaque to the server
  nonce          BYTEA       NOT NULL,             -- 12 B, fresh per seal
  clock          BIGINT      NOT NULL,             -- Lamport clock for last-writer-wins merge
  deleted        BOOLEAN     NOT NULL DEFAULT false,-- tombstone; deletes propagate, never resurrect
  content_hash   TEXT        NOT NULL,             -- integrity/dedupe over the ciphertext
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sync_id, record_type, record_id)
);
```

Note what a full breach of `sync_records` yields: a set of blinded handles, per-record sizes, and update
timestamps — **opaque bytes, never a contact name, never an address, never a key.** That is the same honest
posture as the vault and the backup blob: the server holds ciphertext it cannot read, so the highest-severity
sync incident is a *metadata* leak (this `sync_id` exists, has ~N records, last changed at time T), never a
funds or contents leak. We name that residual rather than hide it.

**Merge is deterministic, because the data was designed to be.** Multiple devices write the same store, so §8
needs a conflict rule — and the shipped code already made it easy. Contacts are keyed by a **deterministic**
`contactId = sha256(ecosystem : normalizedAddress).slice(0, 24)` (`packages/identity/src/contacts.ts`), so two
devices that independently add "Rahul → the same address" converge on the *same* `record_id` with no collision;
last-writer-wins on the Lamport `clock` (tie-broken by a stable device id) then keeps the latest *name*.
Deletions are **tombstones** (`deleted = true` with a clock), so a contact removed on the phone stays removed
rather than being resurrected by a laptop's stale copy. Because the merge keys are content-derived and the
resolution is a total order, sync converges to the same state on every device regardless of message order — the
CRDT-lite discipline every serious E2EE-sync system uses, made almost free by choices §5's shipped code already
made for other reasons.

**What syncs, and what never does.** The allowlist is explicit and closed — sync carries a value only if it is
non-secret *and* on this list:

| Syncs via Model B (E2EE, non-secret) | Never syncs (stays device-local or is rederived) |
|---|---|
| Contacts / address book (`packages/identity/src/contacts.ts`) | Seed, mnemonic, any private key |
| Display labels & account nicknames (identity `metadata.label`) | The encrypted vault (§8.1) |
| Preferences: theme, currency, **network mode** | Live private keys in memory / signing sessions |
| Automation rules & their caps (subject to §8.5) | Passwords, biometric material, OS-keystore handles |
| Watch-lists / non-secret UI state | Identity id & addresses (rederived, no sync needed — §8.2) |

Everything on the left is *reconstructable inconvenience* if lost; nothing on it can move a coin. Everything on
the right is either catastrophic (a key) or free to recompute (the identity). Sync only ever touches the left
column — that is the one sentence that makes Model B non-custodial.

---

### 8.5 · Signing stays per-device — always

Neither model ever lets one device sign with another device's keys, and this is worth stating as its own rule
because it is where a lazy "sync" design would leak custody through the back door. **Signing authority is not
syncable state; it is a physical property of holding the seed.** A signature is produced only by a device that
has independently derived the private key in its own memory and wiped it after the call
(`manager.getSigner().signEvmTransaction(...)`, per-op zeroize — SECURITY.md §3.3). There is no "sign on my
laptop from my phone," no key transport, no server-mediated co-signing, and no synced session that authorizes
device B to spend using device A's material. If device B is to sign, device B must hold the seed (Model A); if
it does not, it is a read-only or propose-only surface, and the confirm-sheet trust boundary (SECURITY.md
§2.3) still lives on whichever device actually holds the key.

This has a sharp consequence for the one item that looks dangerous on the "syncs" list — **automation rules.** A
rule can *sync* (its text and caps are non-secret preferences), but a synced rule does **not** grant a device
signing power it lacked. Automation still executes only on a device that holds the keys and only within the
guard's hard caps — mainnet acknowledgement, the `MAINNET_SPEND_CAP_USD` ceiling, per-tx/daily automation caps,
fail-safe-to-manual when a USD value is unknown (SECURITY.md §5; never weaken `autoDecision`). Syncing the rule
keeps the user's *intent* consistent across devices; it never syncs the *authority* to act on it. The gate is
always local, and always the deterministic guard — exactly as everywhere else in the system.

> **The remote-approval question (roadmap, and still per-device).** A future convenience — "approve this on my
> phone" while browsing on a laptop — is a *signing-device handoff*, not a sync feature: the laptop proposes,
> the **phone that holds the key** signs and broadcasts, the key never leaves the phone. That belongs to the
> device-trust and execution surfaces (§7 and Chapter 6), and it changes nothing here: the key stays on the
> device that signs. §8 will not smuggle signing across the sync channel.

---

### 8.6 · The forbidden pattern — custody by the back door

Because "sync your wallet to the cloud" is the single most common way self-custody quietly dies, §8 names the
anti-patterns explicitly and marks them as review-blocking. Any of these in a design or a PR is a Doctrine #1
violation and triggers the Principal Security Engineer's veto (SECURITY.md §13), *even if it works*:

| Forbidden pattern | Why it is custody | The compliant alternative |
|---|---|---|
| Upload the seed/private key to enable "restore on any device" | The server can now move funds → custodial | Rederive on-device from the phrase (§1.5); no server involved |
| Sync the **encrypted vault** through the sync channel | Centralized offline brute-force oracle over every user's password (§8.1) | Per-device vault (Model A); or an *opt-in* client-encrypted **backup** owned by §6, on a separate pipe |
| Server holds a "sync passphrase" or the sync key to "help decrypt" | The server can read your data / bootstrap toward keys | `K_sync` is derived on-device and never transmitted (§8.4) |
| A server-side key-escrow "so we can recover for you" | Recoverable-by-us = custodial by definition | We hold nothing; recovery is the seed (§6). We say so plainly |
| Sync raw contacts/labels as plaintext "for convenience" | Leaks a user's social/financial graph to a breach | E2EE only; the server sees ciphertext + a blinded handle (§8.4) |
| Let a synced session grant device B signing power | Authority without the key = custody by delegation | Signing is per-device; only key-holding devices sign (§8.5) |

The litmus test mirrors SECURITY.md §4's test for AI features: **if our entire server infrastructure were fully
controlled by an attacker, could they move a user's funds, or read a user's synced contents?** For a compliant
§8 the answer to both is *no* — funds are unreachable without the on-device key, and contents are unreadable
without the on-device `K_sync`. If any proposed sync design answers "yes" to either, it is wrong and is
redesigned, not shipped.

---

### 8.7 · The user-facing flow — states and the safety gate

Sync is a money-adjacent trust decision, so its UX obeys the same honesty and comprehension-before-consent bar
as every other flow in the product (Chapter 4; Design Review Gate). Two flows, each with its designed states.

**Adding a device (Model A).** The safety gate *is* the reveal gate. Because adding a device means exposing the
phrase, the flow reuses the re-auth-gated reveal (SECURITY.md §3.4, §6) — it is never a one-tap action.

- **Empty / prompt:** "Add another device" explains, in plain language, that the second device will hold *its
  own copy* of your keys and that you'll type your recovery phrase there — with the standard phishing warning
  ("we will never ask for your phrase; only you, on your own device").
- **Gate:** re-authenticate (password / biometric) → reveal phrase once → the phrase is shown, never
  transmitted, and the reveal surface is cleared on exit.
- **Success:** the new device, after `importWallet`, shows the *identical* identity (same addresses, same id) —
  the honest confirmation that both devices are the same person, proven by rederivation, not by a synced record.
- **Error / partial:** a wrong phrase on device B fails closed with the vault's indistinguishable
  `VAULT_DECRYPT_FAILED`-class honesty (SECURITY.md §3.2) — no hint about *which* word was wrong.

**Enabling non-secret sync (Model B).** Opt-in, explicit, and specific about the boundary:

- **Off (default):** sync is not on. The wallet is fully usable; devices simply don't share preferences.
- **Enabling — the consent state:** the sheet states exactly **what will sync** (contacts, labels,
  preferences, network mode, rules) and, with equal weight, **what will never sync** (keys, seed, vault) — plus
  the one-line truth: *"Our server stores this as encrypted data it cannot read."* This is informed consent per
  the gate, not a buried toggle; entering personal data into a shared store is exactly the class of action that
  requires explicit approval.
- **On — steady state:** a clear indicator that sync is active and *what* is covered; changes converge across
  devices (§8.4). Provisional/unsynced local changes are labelled as such — never shown as "synced" until the
  seal is acknowledged (never-fake-data, DATABASE.md §10).
- **Turning off / wiping synced state:** one action disables sync locally; a second, confirmed action requests
  deletion of the `sync_records` for this `sync_id` server-side (a DSAR-shaped erase, DATABASE.md §8) — with the
  honest note that other devices still holding `K_sync` retain their local copies until they too are wiped.
- **Error honesty:** a sync-server outage degrades to *local-only*, labelled, and **never** silently drops a
  user's contact or presents stale state as fresh. A failed sync read is *unknown*, not empty (never-fake-data).

Across both flows the invariant the user can verify is the one that matters: **the same identity appears on
every device, and at no point were they asked to send their phrase anywhere.** That is the felt experience of
non-custodial multi-device — calm sameness, zero secret in flight.

---

### 8.8 · Shipped vs. roadmap — the honest ledger

| Capability | State | Where |
|---|---|---|
| Deterministic rederivation → same triple & identity id on any device, no server | ✅ Shipped | §1, §5; `keyring.ts`, `identity.ts` |
| Per-device import + independent encrypted vault (Model A primitives) | ✅ Shipped | `wallet.ts` (`importWallet`, `wipeWallet`); `packages/core` |
| Re-auth-gated phrase reveal for adding a device | ✅ Shipped | `revealMnemonic()`; SECURITY.md §3.4 |
| Deterministic, dedupe-safe contact ids (merge-ready) | ✅ Shipped | `contacts.ts` (`contactId`) |
| Guided "add a device" handoff (QR/attestation) experience | ⏭ Roadmap | §7; this section |
| Model B: E2EE sync of non-secret state (`K_sync`, `sync_records`, merge) | ⏭ Roadmap | §8.4; DATABASE.md §7 precedent |
| Per-device signing invariant (no remote/co-signing over sync) | ✅ Doctrine (by construction) | §8.5; SECURITY.md §2.3, §3.3 |
| Encrypted-seed **backup** blob (distinct from sync) | ⏭ Roadmap (owned by §6) | DATABASE.md §7 `backup_blobs` |

The line to hold when any of the ⏭ rows is built: promote its tag in the *same* PR that ships it, and re-run
the SECURITY.md §13 checklist — because every one of these rows touches the boundary between "the user's device
holds the keys" and "a server does," and that boundary is the product.

---

### 8.9 · What §8 commits, and how it hands off

- **The seed never syncs — in any form.** Not plaintext, not as the encrypted vault. Multi-device sameness of
  the keys is achieved by **rederivation** (§1.5), never by transport; a synced-vault design is a
  brute-force-oracle hazard and is forbidden (§8.1).
- **Two honest models, one line between them.** *Model A* (re-import per device, independent vaults) is
  shipped-adjacent, maximally safe, and syncs nothing. *Model B* (roadmap) adds only **E2EE sync of non-secret
  state** — contacts, labels, preferences, rules — where the server stores ciphertext under an on-device
  `K_sync` (HKDF-from-seed, domain-separated, one-way, never signs) keyed by a blinded `sync_id` it cannot join
  to an address.
- **Signing is per-device, always.** Authority is a property of holding the seed, not syncable state; a synced
  automation rule never grants signing power, and the deterministic guard's caps still gate every automated act
  (§8.5; SECURITY.md §5).
- **Custody-by-the-back-door is named and blocked.** Any "sync my wallet" that uploads a decryptable key, an
  escrow, or a server-held sync secret is a Doctrine #1 violation and a Security veto (§8.6, SECURITY.md §13).
- **The felt experience is calm sameness with zero secret in flight**, delivered through designed, honest
  states and a reveal-gated add-device flow (§8.7).

This hands off cleanly to its siblings. **§6 (Recovery Architecture)** owns the *opt-in* encrypted-seed backup
blob and social/MPC recovery — the one place an encrypted seed may (deliberately) sit on our infrastructure, on
a pipe that is explicitly *not* the sync channel. **§7 (Device Trust Model)** owns how a new device is attested
and enrolled, which is the guided front-end to Model A's re-import and the trust anchor for any future signing
handoff. **§9 (Enterprise Identity)** composes multi-device sync under organizational policy — where "the
team's devices share non-secret treasury state" is Model B at organizational scale, still with every key on its
own device. Every one of them inherits §8's single non-negotiable: **the sync channel carries settledness, never
secrets.**


## §9 · Enterprise Identity

> *A company treasury is not a bigger wallet — it is a fundamentally different question. A personal wallet
> asks "does the owner authorize this?" and one device answers. A treasury asks "do **enough of the right
> people** authorize this, within the limits their **roles** allow, with a **record** a regulator can
> later read?" — and no single person may answer alone. The industry's default answer to that question is
> to take custody: hand your keys to a vendor whose servers hold them and whose dashboard enforces the
> rules. We refuse that answer on the same Doctrine that governs the single-user wallet. This section
> designs enterprise identity as **threshold authority over a non-custodial base** — where the multisig
> contract or the MPC protocol enforces "no one alone," where per-role limits are enforced by the
> deterministic policy engine that already ships, and where **no server ever holds a key or a share that
> can sign by itself.** Almost all of this is **roadmap** — a future volume-level build. The
> authorization, governance, and audit seams it plugs into are **shipped, pure, tested code**. We are
> scrupulous about which is which, and scrupulous that today the product is single-user.*

Chapter 5 has, up to here, described the identity of **one person**: three receive addresses under one
identity (§1), the programmable-account upgrade path (§2), a human-readable name (§3), the cross-chain
mapping that hides the machinery (§4), the multi-account tree one seed produces (§5), how that seed is
recovered (§6), which devices are trusted (§7), and how a person's own devices agree on shared state (§8).
This section asks the organizational question those sections deliberately did not: **what happens when the
funds belong to a company, and moving them requires several people?** Enterprise identity is the layer that
sits *above* the personal identity model — it composes the same on-device keys, the same shipped policy and
compliance engines, and the same audit chains, into a structure where authority is **shared, bounded, and
recorded**. It introduces no new signer and no new secret store; it changes *who must agree* before the
device signatures of §1 dispose of funds.

To be honest in the language of [SECURITY.md §0](../../SECURITY.md)'s status legend before we design a
line of it: the enterprise **product** — teams, a treasury account, a roles UI, multi-signer flows — is
**⏭ roadmap**, a build large enough to be its own volume. The **substrate it needs** is a mix:
on-device multi-account keys are **✅ shipped** ([`keyring.ts`](../../packages/core/src/keyring.ts), §5);
the deterministic **authorization** layer it plugs into is **✅ shipped and tested**
([`packages/policy`](../../packages/policy/src/engine.ts)), already carrying an `enterprise` policy type
and `second_approver` / `guardian_quorum` requirements; the **governance and audit** layer is **✅ shipped**
([`packages/compliance`](../../packages/compliance/src/engine.ts)) with RBAC, maker-checker approvals,
and a hash-chained log; and the **threshold accounts** themselves — on-chain multisig and MPC signing — are
**⏭ roadmap**. This section owns the **organizational identity model**. It does not re-derive keys (§1, §5),
re-specify smart accounts or session keys (§2), or redesign recovery (§6) or sync (§8). It references those
siblings and duplicates none of them.

---

### §9.1 · What an enterprise treasury actually needs

Strip the marketing off "enterprise crypto" and five concrete requirements remain. Each is a real
operational need, and each maps onto a seam that is either shipped or specified here.

| Need | What it means operationally | Where it lands |
|---|---|---|
| **A shared treasury account** | Company funds live at an address (or address set) that belongs to the *organization*, not to any one employee. | Threshold account — §9.3 *(roadmap)* |
| **Multiple signers, no single point of control** | Moving funds requires *m-of-n* people; losing or compromising one person's device does not lose or leak the treasury. | On-chain multisig / MPC threshold — §9.3 *(roadmap)* |
| **Role-based permissions** | An analyst may *propose*; a treasurer may *approve up to $X*; only the board may move above a floor. Authority is scoped to a job, not a person. | Deterministic policy engine — §9.4 *(✅ engine shipped)* |
| **Spend policies** | Per-role and per-treasury limits, allowlisted counterparties, time windows, dual-control above thresholds — enforced, not advisory. | Policy rules + threshold gate — §9.4 *(✅ engine; ⏭ on-chain enforcement)* |
| **Audit & compliance** | Every proposal, approval, denial, and policy change is recorded immutably and exportable to a regulator or auditor. | Hash-chained audit + RBAC export — §9.5 *(✅ shipped)* |

The benchmark set is instructive because it splits cleanly along the custody line. **Safe** (formerly Gnosis
Safe, the incumbent EVM multisig), **Squads** (the Solana multisig standard), and Bitcoin's native
**P2WSH** script multisig are *non-custodial* — each signer holds their own key, and an on-chain contract
or script enforces the threshold. **Fireblocks**, **Copper**, and **Coinbase Prime** are *custodial or
semi-custodial* — an MPC/HSM infrastructure the vendor operates holds the key material, and the "policy
engine" is the vendor's server. Our position is unambiguous: we build the **non-custodial** enterprise, the
same way §1 built the non-custodial personal wallet. The vendor-holds-the-keys model is not an option we
consider slow — it is one the Doctrine forbids.

---

### §9.2 · The custody trap — why "enterprise" usually means "give us your keys," and why we don't

The reason most enterprise crypto is custodial is not laziness; it is that the requirements in §9.1 are
*easy* if a server holds the key. A central service can enforce any policy, collect any approvals, and
produce any audit trail, because it is the thing that signs. The moment you insist — as we do — that **no
server ever holds a key or a share that can sign alone** (Doctrine #1), the problem gets genuinely harder,
and that difficulty is exactly what this section spends itself on.

The design constraint is a single sentence, and it is non-negotiable:

> **Authority may be shared, bounded, delegated, and recorded — but the ability to *produce a signature*
> must remain distributed across on-device keys or key-shares that no single party, server included, can
> assemble alone.**

This is the enterprise-scale restatement of the invariant from
[SECURITY.md §2.3](../../SECURITY.md): the only bytes that ever leave a signer's Zone 0 are
**signatures** (and opaque vault ciphertext) — never key material, never a usable share. A treasury built
this way inherits the whole trust model for free: a breach of the coordination service is a
privacy/availability incident, **never** a fund-loss one, because the coordinator holds no signing power.
If any proposed enterprise design would require a server to hold, reconstruct, or co-sign with a secret that
alone moves funds, it is the wrong design and is redrawn — the same veto the Principal Security Engineer
holds over a smart-account backdoor in §2.

---

### §9.3 · How it maps onto the identity system — threshold accounts *(roadmap)*

The organizational treasury is built by *composing* personal identities, not by inventing a new key custody
model. Each signer is a full Universal Identity from §1 — their BTC key at `m/84'/{0|1}'/0'/0/i`, their EVM
key at `m/44'/60'/0'/0/i`, their Solana key at `m/44'/501'/i'/0'`, each generated and used on their own
device, encrypted at rest (scrypt + AES-256-GCM). The treasury is a **rule about how many of those
independent signatures are required**, enforced by one of two substrates:

- **On-chain multisig (preferred where a good standard exists).** The threshold is enforced by the chain
  itself. On EVM this is a **Safe** smart-account contract — which is exactly the smart-account substrate of
  §2, configured with *n* owner keys and an *m* threshold; the treasury address is the contract, and each
  owner is a §1 EVM identity. On Solana it is the **Squads** program (or a native multisig). On Bitcoin it
  is a **P2WSH *m*-of-*n* script** — a different script than the single-sig BIP-84 P2WPKH of §1, but derived
  from the same on-device keys. In every case: each key stays on its owner's device, the contract/script
  holds no key, and *m* independent device signatures are required to move funds. No server participates in
  signing at all.
- **MPC threshold signing / TSS (for a single-address footprint, or chains lacking good on-chain multisig).**
  Here the treasury is *one* ordinary address whose private key **never exists in one place at any time**.
  It is split into *n* shares held on *n* separate devices; an interactive protocol lets any *t* of them
  co-produce a valid signature without ever assembling the key — **threshold ECDSA** (GG20-family) for the
  secp256k1 chains (BTC, EVM), **threshold EdDSA / FROST** for ed25519 (Solana). The honest, load-bearing
  caveat: MPC is only non-custodial if **every share lives on a participant's own device and the platform
  holds none that can sign**. A "convenient" MPC design where the vendor holds a share that, combined with
  one more, reaches the threshold is custody wearing an MPC label — and is vetoed. (Recovery of a lost share
  is a §6 concern and follows §6's no-server-secret rule; multi-device share placement is a §8 concern.)
- **Policy-bound session keys for operational spend.** Not every treasury action needs the full board. A
  bounded, expiring, revocable **session key** (§2.5) lets an *operations* role execute routine, capped spend
  (e.g. "pay listed vendors, up to $5,000/day, this quarter") without convening the quorum — while the grant
  itself is minted by a threshold-signed, policy-gated action. This is the enterprise use of the exact
  mechanism §2.5 specifies; it is **⏭ roadmap** on-chain and **🔶 partial** as today's app-layer caps.

The choice between on-chain multisig and MPC is the same Doctrine-driven trade-off as EIP-7702-vs-4337 in
§2: prefer the substrate that keeps the identity legible and the enforcement verifiable on-chain (multisig),
and reach for the cryptographically heavier one (MPC) only when it buys a real property the first cannot —
here, a single-signature on-chain footprint and privacy of the signer set.

---

### §9.4 · Roles and spend policies — enforced by the deterministic policy engine *(✅ engine shipped)*

This is the most concrete part of the section, because the engine that enforces it **exists today**. The
shipped [`packages/policy`](../../packages/policy/src/engine.ts) is a pure, exhaustively-tested
authorization core that answers exactly the enterprise question — *"is this principal authorized, and has
the required human approval been collected?"* — and it was built from the start with enterprise as a
first-class citizen:

- Its [`PolicyType`](../../packages/policy/src/types.ts) enumerates **`'enterprise'`** among its twelve
  domains, with a reserved priority band (400–599) documented in
  [`presets.ts`](../../packages/policy/src/presets.ts) for "enterprise / limits."
- Its [`ConfirmationRequirement`](../../packages/policy/src/types.ts) already includes the two
  multi-party step-ups a treasury needs: **`{ kind: 'second_approver'; role: string }`** (dual control) and
  **`{ kind: 'guardian_quorum'; m: number; n: number }`** (m-of-n threshold). The shipped `LIQUIDATION`
  preset rule already emits `second_approver` with `role: 'owner'` for portfolio-wide sell-offs — the
  dual-control pattern is not hypothetical, it is in the default rule library.
- Its rules carry an **`overridable: false` floor**: a non-overridable rule cannot be loosened by any child
  set or user preset, enforced both at resolve time in the registry and again in
  [`PolicyAdmin`](../../packages/policy/src/admin.ts) at write time (`assertNoLoosening`). This is
  precisely how a treasury's organizational limits survive a rogue sub-team's attempt to relax them.
- Its `PolicyRequest.principalId` is the seam a per-role, per-treasury policy set binds to, and
  `PolicyAdmin` gives every policy change a **version, an append-only history, and a rollback** path.

A role, then, is a **named policy set** bound to a principal. A minimal example — the kind of rule data an
"analyst" role and a treasury floor compile to (all money is `bigint` micro-USD, never a float):

| Rule (role/scope) | `when` condition | Effect |
|---|---|---|
| **Analyst** — may propose, never dispose alone | `always` | `escalated` → `{ second_approver, role: 'treasurer' }` |
| **Treasurer** — bounded approval authority | `amount_gte $50,000` | `escalated` → `{ guardian_quorum, m: 3, n: 5 }` |
| **Treasury floor** *(non-overridable)* | `amount_gte $250,000` | `escalated` → `{ guardian_quorum, m: 4, n: 5 }` |
| **Org hard floor** *(non-overridable)* | `recipient_trust_below: known` | `blocked` — no new counterparty without an allowlisting change |

The engine composes these exactly as it composes everything: **most-restrictive-wins**, and — critically —
it authorizes, it **never signs**. Its own header states the line it will not cross:
*"It never accesses keys and never signs — it emits an `ExecutionPermission` whose `mayProceedToSign` is the
single boolean the Execution layer reads."* So per-role limits are enforced **deterministically off-chain
today** (the engine can already return `escalated` with a `guardian_quorum` requirement), and the
**⏭ roadmap** upgrade is to move the same floor **on-chain** as the multisig threshold / a `validateUserOp`
policy in §9.3 — defense in depth, where even a fully-compromised client cannot exceed what the chain
itself enforces. Off-chain policy and on-chain threshold compose most-restrictively, the same safe-by-
construction direction as [ARCHITECTURE.md §7.5](../../ARCHITECTURE.md): a rule can only ever *tighten*.

Changing the policy set itself is a fund-adjacent act, and it is gated by **maker-checker**: the shipped
[`compliance/governance.ts`](../../packages/compliance/src/governance.ts) rejects self-approval outright —
*"the proposer cannot approve their own change"* — so no single administrator can both write and enact a
loosening of the treasury's rules. That is the enterprise-grade separation-of-duties, already in tested code.

---

### §9.5 · Audit & compliance hooks — Doctrine #8, made concrete *(✅ shipped)*

Doctrine #8 says every risky decision is logged with its inputs and reason. For a treasury this is not a
nicety — it is the compliance surface a regulated organization is *required* to produce. Two shipped,
hash-chained audit logs already record it:

- The **policy** audit log ([`policy/audit.ts`](../../packages/policy/src/audit.ts)) writes a
  `DecisionRecord` for **every** authorization — the fired rules, the outcome, the requirements, the active
  policy-set hash, the principal — each linked by `prevHash` into an append-only chain that `verifyChain`
  can replay to pinpoint any tampering. Every treasury proposal and its verdict is on this chain.
- The **compliance** audit log ([`compliance/audit.ts`](../../packages/compliance/src/audit.ts)) records
  governance and lifecycle events across categories including `governance`, `policy_change`, `admin_action`,
  and `compliance_decision`. It carries a `tip()` **anchor** (count + tip hash) so that *truncation* — the
  one attack a backward-linked chain alone cannot catch — is detectable against an externally-stored anchor,
  and its own header is honest about the threat model: a hash chain is tamper-**evident**, not
  tamper-**proof**, so production **must** inject a **keyed HMAC** (or sign the tip), run on **WORM /
  append-only** storage whose DB role revokes UPDATE/DELETE, and externally anchor the tip. Records carry
  only non-sensitive structured detail — **PII is referenced by id, never inlined** — so the trail is
  exportable to a regulator without leaking the personal data it describes.

The governance choke point ties these together. The shipped
[`CompliancePlatform`](../../packages/compliance/src/engine.ts) routes every administrative change through
`governanceAction()`, which checks the RBAC permission and **audits the outcome including a DENIED attempt** —
an unauthorized action is never silent. Its default roles (`viewer`, `operator`, `compliance_officer`,
`auditor`, `admin`) are the skeleton of a treasury's role model, and audit export is itself a privileged,
audited capability: `exportAudit()` requires the `audit.export` permission and writes its own record of the
export. For regulated treasuries, the **jurisdiction profile** — versioned *data*, never hardcoded country
logic ([`compliance/types.ts`](../../packages/compliance/src/types.ts)) — carries the reporting
obligations (`high_value_transfer`, `sanctions_hit`, …) and retention rules that a company's compliance
officer configures per deployment. All of this is shipped; what is roadmap is *wiring it to a multi-signer
treasury*, not building it.

---

### §9.6 · The treasury flow — states and the safety gate *(roadmap)*

A treasury transfer is the enterprise analogue of the personal `plan → authorize → sign → confirm` machine
of [Chapter 4 §7](../ai/conversation-ux-reference.md). It introduces exactly one new phase — **collecting
*m* independent signatures** — and it is designed now to the same standard as every fund-moving flow: honest
states end-to-end, comprehension before any signature, and a gate that can only refuse.

| State | What happens | The safety gate |
|---|---|---|
| **draft / propose** | Any authorized signer proposes a transfer (recipient, amount, memo). Proposing is not approving. | Proposer's role must permit *propose*; unknown role → **block** (fail closed). |
| **gate** | The Policy⊗Risk engine (§9.4) + the compliance gateway evaluate the proposal; the required approval shape is computed (`second_approver` or `guardian_quorum m-of-n`). | An `escalated`/`blocked` outcome is honored verbatim; a sanctioned counterparty or over-floor amount that cannot be positively cleared → **block**. |
| **collecting** | The proposal is shown to the other signers; each reviews the *decoded, simulated* transfer and signs **on their own device**. Progress shows "2 of 3 signatures." | The proposer cannot self-satisfy the threshold (maker-checker); each signer sees the literal amount/recipient before signing; no server holds a signature that alone moves funds. |
| **threshold-met** | *m* valid signatures exist; the multisig contract / MPC protocol can now assemble a valid transaction. | Below threshold, broadcast is structurally impossible — the chain/script refuses it, not merely the client. |
| **broadcast / confirmed** | The threshold-signed transaction is broadcast; confirmation is shown only when it lands on-chain. | Nothing is shown "confirmed" that did not happen on-chain (Doctrine #3); a network failure is not "$0." |
| **expired / rejected / error** | The proposal times out, a signer rejects (any rejection can void it, per the compliance approval state machine), or a signer's simulation fails. | Never a half-collected transfer that later completes silently; an expired proposal must be re-proposed and re-gated. |

Every one of these transitions is written to both audit chains of §9.5. The **fail-closed** posture is the
same as the single-user broadcast guard: below the threshold, nothing moves; an unknown role, an unpriced
asset, or a counterparty the policy cannot positively clear is **blocked**, never guessed. The device
signature — now *m* of them — remains the sole disposer of funds.

---

### §9.7 · The honest split — shipped seams, roadmap product

| Concern | ✅ Shipped today | ⏭ Roadmap (enterprise identity) |
|---|---|---|
| **Product** | Single-user, non-custodial wallet. No teams, no treasury, no roles UI. | Organizations, a shared treasury, a signer/role management surface — a volume-level build. |
| **Keys** | On-device multi-account HD keys (§1, §5), scrypt+AES-GCM at rest, known-answer conformance. | Composed into *m-of-n* threshold accounts; keys/shares still never leave a device or touch a server. |
| **Treasury account** | — | On-chain multisig (Safe / Squads / P2WSH) **or** MPC/TSS (threshold ECDSA / FROST) — §9.3. |
| **Roles & limits** | Pure `PolicyEngine` with an `enterprise` type, `second_approver` + `guardian_quorum` requirements, non-overridable floor, versioned admin — bound to one principal. | Per-role policy sets across many principals; the same floor enforced **on-chain** as the multisig threshold / `validateUserOp` policy. |
| **Separation of duties** | Maker-checker approvals (proposer ≠ approver) in `compliance/governance.ts`; RBAC with default roles. | The full treasury proposal→quorum flow of §9.6 wired to these primitives. |
| **Audit** | Two append-only hash-chained logs (policy + compliance), `verifyChain`, tip anchor, PII-by-reference, RBAC-gated audited export. | Keyed-HMAC + WORM + external anchoring hardened for production; wired to the treasury flow. |
| **Compliance** | Versioned jurisdiction profiles (reporting/retention/screening as data), consent + DSAR, emergency freeze. | Bound to org treasuries with per-jurisdiction reporting on treasury movements. |

The headline, stated plainly: **the brain of enterprise identity — deterministic authorization, role-scoped
limits, maker-checker governance, and tamper-evident audit — exists today as pure, tested code; the
organizational body around it, and the threshold-account substrate beneath it, do not.** We will not render
a "Team" or "Treasury" surface, or claim multi-signer support, until the threshold accounts are real and the
production audit hardening is done. Presenting a `⏭` as a `✅` here would be the same Doctrine-#3 lie the
smart-account section refuses in §2.

---

### What §9 commits us to

- **Non-custodial, at organizational scale.** A treasury is threshold authority over on-device keys — no
  server ever holds a key or a share that can sign alone. If a design needs one, it is redrawn, not shipped.
- **Compose identities, don't invent custody.** Each signer is a full §1 Universal Identity on their own
  device; the treasury is a *rule about how many signatures are required*, enforced by an on-chain multisig
  (preferred) or MPC/TSS (for a single-address footprint) — never by a vendor's server.
- **Roles and limits are enforced by the shipped policy engine.** `packages/policy` already carries an
  `enterprise` type, `second_approver`/`guardian_quorum` step-ups, and a non-overridable floor; it
  authorizes and never signs. Off-chain policy and on-chain threshold compose most-restrictively — a rule
  can only tighten.
- **Governance is maker-checker.** The proposer of a policy or treasury change can never be counted among
  its approvers — separation of duties in tested code.
- **Everything auditable (Doctrine #8).** Every proposal, approval, denial, and administrative change is on
  a hash-chained, tamper-evident, PII-by-reference log; export is RBAC-gated and itself audited; production
  hardening (keyed HMAC, WORM, external anchoring) is a mandated gate.
- **Honest about status.** Today the product is single-user; enterprise identity is roadmap. The
  authorization, governance, and audit seams are shipped; the treasury accounts, the multi-signer flows, and
  the team surface are not — and are labelled as such until they are real and audited.

The buildable specifics — the Safe/Squads/P2WSH integration, the MPC ceremony and share placement, the
per-role policy-set schema, the treasury proposal state store, and the production audit-anchoring service —
land with their ADRs when the substrate is implemented. Until then, this section is the target the shipped
policy, compliance, and identity engines were deliberately built to accept, marked as such.


---

## Where this sits

This is the reference behind [Chapter 5 — the Universal Identity charter](../bible/chapter-05-universal-identity.md),
and the material Volume V is built from. The shipped core — one seed → three conformance-tested addresses
(BTC BIP-84, EVM BIP-44 universal, Solana SLIP-0010), multi-account HD, on-device encrypted keys (scrypt +
AES-256-GCM), **ENS forward resolution**, and seed backup/verify recovery — is real today; account
abstraction, SNS / universal usernames, multi-device sync, and enterprise identity are roadmap, designed
here so they are built without ever crossing the non-custodial line or letting a server hold a secret.
