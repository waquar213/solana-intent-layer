[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · deep reference for **Chapter 11 — Universal Asset Intelligence Engine** ([charter pending](../bible/README.md))

# The Universal Asset Intelligence Reference

*Understanding everything a user owns as one unified financial view — grounded in the real portfolio / chains / intelligence engines, with the four-state valuation honesty central and NFT / yield / DeFi / history honestly tagged roadmap.*

**About this document.** This is the deep reference for **Chapter 11 — the Universal Asset Intelligence
Engine**, authored one step ahead of its canonical charter. Each section is tagged **SHIPPED** or
**ROADMAP**. The honesty core: a value is **never $0** for a network failure or an unpriced asset; a number
is **computed by deterministic code, never invented**; money is bigint, formatted only at the edge.

| § | Section | Grounded in |
|---|---|---|
| 1 | Universal Asset Discovery | `packages/chains` adapters + `packages/portfolio` |
| 2 | Token Classification & Spam Filtering | the token-balance path (DB classification roadmap) |
| 3 | Real-Time Portfolio Valuation | `packages/portfolio` + `balances.ts` (four-state honesty) |
| 4 | NFT Intelligence | roadmap; fungible-asset-first today |
| 5 | Yield & DeFi Position Tracking | partial RM integrations (roadmap) |
| 6 | Cross-Chain Asset Aggregation | `packages/portfolio` aggregation + Ch5 3-address |
| 7 | Portfolio Analytics & Historical Snapshots | `packages/intelligence` (snapshots roadmap) |
| 8 | AI-Powered Asset Insights | `packages/intelligence` insight engine + narrator boundary |
| 9 | Tax-Ready Transaction Categorization | `packages/intelligence` tax engine (partial; not tax advice) |

Honesty first: portfolio aggregation + the four-state valuation + analytics + tax engine are shipped;
NFT intelligence, yield/DeFi tracking, historical snapshots, and deep classification are roadmap.

---

## §1 · Universal Asset Discovery

> **This section is the floor the rest of Chapter 11 stands on.** Every downstream capability —
> classification (§2), valuation (§3), NFT intelligence (§4), yield/DeFi tracking (§5), cross-chain
> aggregation (§6), analytics and history (§7), AI asset insights (§8), and tax categorization (§9) — is
> only ever as honest as the *discovery* underneath it. You cannot value, classify, or narrate what you
> have not found; and the single fastest way to lie to a user is to mistake *"I could not read the chain"*
> for *"you own nothing there."* This section defines how the wallet finds everything a user owns across
> Bitcoin, EVM, and Solana under one identity — and, just as importantly, how it stays truthful about the
> edges of what it has found.
>
> **Status legend (carried from [`SECURITY.md §0`](../../SECURITY.md) and used across the Bible):**
> ✅ **Shipped** — implemented *and tested* in-repo, cited by file. 🔶 **Partial** — real on one
> surface/env, gaps named. ⏭ **Mandated (roadmap)** — a binding requirement with a landing phase, *not* a
> claim it runs today. Per Doctrine law #3, a document that claims coverage it does not have is itself a
> lie. Every capability below carries its **real** state.

---

### 1.1 · The thesis — discovery is ground truth, and a failed read is not a zero

A portfolio view is a chain of inferences: *find* the assets, *price* them, *classify* them, *aggregate*
them, *narrate* them. Each link multiplies the errors of the one before it. If discovery invents a
holding, valuation prices a ghost; if discovery drops a real holding, the net-worth number is quietly
wrong and the user has no way to know. So the discovery layer earns a stricter standard than anything
above it: **it may only report what a chain actually told it, and it must distinguish "the chain said
zero" from "the chain did not answer."**

That distinction is the entire ethic of this chapter compressed to one sentence. A balance viewer that
renders a timed-out RPC as `$0.00` is not merely imprecise — it is dangerous, because a user who believes
their funds vanished may panic-move, double-spend, or abandon a wallet that is working perfectly. The
Doctrine states it plainly (law #3): *a network failure is not "$0."* The mechanism that keeps that
promise is not a disclaimer in the UI; it is a **type**. In the shipped browser reader
([`apps/web/src/balances.ts`](../../apps/web/src/balances.ts)) a native balance is
`amount: number | null` — a successful read of an empty account is `0`, a *failed* read is `null` (`"—"`
in the UI), and the two are never collapsed. Everything in §1.4 is an elaboration of that one honest
`null`.

Benchmarks worth naming: Zerion, Zapper, and DeBank set the bar for *breadth* of aggregation — thousands
of tokens, dozens of chains, DeFi positions decoded from raw contract state. We admire that breadth and
we are honest that we do not yet match it (§1.8). Where we intend to lead is *honesty under failure*: the
best aggregators still, on a bad RPC day, show a confidently wrong total. Our design makes that a
type-level impossibility on every surface where a value appears.

---

### 1.2 · The discovery surface — one door, every chain

Discovery does not talk to blockchains. It talks to the **adapter registry**, which is the single place
the platform obtains chain access. This is the "OS ↔ printer-driver" abstraction from Chapter 6: business
logic references a chain by `ChainId` and depends only on the `BlockchainAdapter` interface; adding a
chain means implementing that interface, not touching discovery.

The interface is the contract discovery is written against
([`packages/chains/src/adapter.ts`](../../packages/chains/src/adapter.ts)):

```ts
interface BlockchainAdapter {
  getNativeBalance(address: string): Promise<bigint>;                       // the chain's gas asset
  getTokenBalances(address: string, tokens: TokenRef[]): Promise<AssetBalance[]>; // probed tokens
  getAssetMetadata(tokenAddress: string): Promise<AssetMetadata>;           // symbol/decimals enrichment
  validateAddress(address: string): boolean;
  // …fees, broadcast, tracking — not discovery's concern
}
interface AssetBalance {
  assetId: string;       // symbol for native, `${chainId}:${address}` for tokens
  amount: bigint;        // ALWAYS base units, never a float
  decimals: number;
  symbol: string;
  tokenAddress: string | null;  // null ⇒ native asset
}
```

Two properties of this contract matter for discovery. First, **every amount is `bigint` base units** —
satoshis, wei, lamports — never a JavaScript float; precision is preserved from the wire all the way to
the µUSD valuation in §1.5. Second, the registry hands back a *memoized, pooled* adapter per chain
([`packages/chains/src/adapter-registry.ts`](../../packages/chains/src/adapter-registry.ts)): EVM and
Solana adapters ride a `ProviderPool` with priority-ordered failover (keyed endpoints first, public
keyless nodes last); Bitcoin rides an esplora REST transport. Discovery inherits that resilience for free
— a single flaky node degrades to the next, and only a total failure of every endpoint produces the
`null` of §1.4.

The registry today covers twelve networks across three ecosystems
([`packages/chains/src/registry.ts`](../../packages/chains/src/registry.ts)):

| Ecosystem | Mainnets | Testnets | Native unit (decimals) | Token model |
|---|---|---|---|---|
| **EVM** | Ethereum, Arbitrum, Base, Optimism, Polygon, BNB | Sepolia, Base Sepolia | wei (18) / POL, BNB (18) | ERC-20 |
| **Bitcoin** | Bitcoin | Bitcoin Testnet | satoshi (8) | none (UTXO only) |
| **Solana** | Solana | Solana Devnet | lamport (9) | SPL |

Everything downstream keys off `ChainId`; nothing else is permitted to hardcode a chain fact. That is why
"add a chain" and "add a protocol" (§1.8, and the roadmap of §5–§6) are *bounded* tasks and not rewrites.

---

### 1.3 · How a new asset is discovered — three enumeration strategies

Finding "everything a user owns" is not one algorithm; it is three, applied per ecosystem according to
what that chain can actually answer. The wallet composes them and merges the results.

**Strategy A — Native balance read (universal, ✅ shipped).** Every address on every chain has exactly one
native asset. Discovery reads it directly: `eth_getBalance` for EVM, `getBalance` for Solana, and
`funded − spent` over the esplora address stats for Bitcoin
([`getNativeBalance` in each adapter](../../packages/chains/src/evm/adapter.ts)). This is the one path
that is complete by construction — there is nothing to enumerate, so nothing can be missed. The shipped
browser reader uses exactly this path for ETH/SOL/BTC on both mainnet and testnet
([`balances.ts`](../../apps/web/src/balances.ts)).

**Strategy B — Known-token probing (✅ shipped, 🔶 list-bounded).** For fungible tokens, the safe baseline
is to *ask about tokens we already trust.* Discovery hands the adapter a `TokenRef[]` — a curated list of
canonical contracts/mints — and the adapter returns balances for the ones actually held. On EVM this is a
`balanceOf` call per ref, each wrapped `.catch(() => null)` and filtered, so one bad token never sinks the
batch ([`EvmAdapter.getTokenBalances`](../../packages/chains/src/evm/adapter.ts)). The runtime's live
holdings source reads native + a per-chain token list this way and keeps only positive balances
([`readChainHoldings` in `packages/runtime/src/chains.ts`](../../packages/runtime/src/chains.ts)); the
API wires vetted L2 token lists per chain
([`makeLiveHoldingsSource` / L2 sources in `services/api/src/runtime-provider.ts`](../../services/api/src/runtime-provider.ts)).
The strength is safety — every discovered token is one we can name and price. The limit is honestly a
limit: a token *not on the list* is **not-yet-scanned**, not absent (§1.4), and we say so rather than imply
completeness.

**Strategy C — On-chain enumeration (🔶 partial: Solana native, EVM via indexer).** The frontier is
discovering assets we were *not* told to look for. Two real paths exist today:

- **Solana** enumerates natively. `getTokenAccountsByOwner` returns *every* SPL token account an address
  holds in a single call; the adapter maps them by mint and returns the requested set, omitting zero
  balances ([`SolanaAdapter.getTokenBalances`](../../packages/chains/src/solana/adapter.ts)). The RPC
  itself is the enumerator — no list required — though symbol resolution still needs a registry (the mint
  supply gives decimals, not a symbol; `getAssetMetadata` returns `symbol: ''`), which is the enrichment
  gap noted in §1.8.
- **EVM** has no native "list my tokens" RPC, so full enumeration rides an indexer. The shipped Alchemy
  reader calls `alchemy_getTokenBalances`, which **auto-discovers the address and balance of every ERC-20
  an account holds** with no pre-supplied list
  ([`services/api/src/alchemy.ts`](../../services/api/src/alchemy.ts)). Crucially, discovered does not
  mean trusted: on-chain token *metadata* is attacker-controllable — a spam airdrop can name itself
  `USDC` with 18 decimals — and because holdings are merged and priced *by symbol*, a spoofed symbol would
  corrupt a real holding of the same name. So an auto-discovered token is surfaced **only** if it sits at a
  vetted canonical address, stamped with that entry's trusted symbol/decimals; anything else is *omitted*
  (§1.6). The reader is rate-limit aware — `429`/`5xx` retried with exponential backoff — because a real
  RPC client must be.

**Bitcoin** is the honest exception: there are no tokens. `getTokenBalances` returns `[]` by design; the
UTXO set *is* the asset ([`BitcoinAdapter`](../../packages/chains/src/bitcoin/adapter.ts)).

| Ecosystem | Native (A) | Known-token (B) | Enumeration (C) |
|---|---|---|---|
| EVM | ✅ `eth_getBalance` | ✅ `balanceOf` per `TokenRef` | 🔶 Alchemy auto-discovery, allowlist-gated |
| Solana | ✅ `getBalance` | ✅ via `getTokenAccountsByOwner` filter | 🔶 native enumeration; symbol registry pending |
| Bitcoin | ✅ esplora address stats | — (no tokens) | — |

---

### 1.4 · The four-state honesty model — the discipline that governs this whole chapter

Wherever a discovered asset's value can appear, it is in exactly one of four states. This is not a UI
convention bolted on at the end; it is the shape of the data the discovery layer produces, so no surface
*can* accidentally render a failure as a number.

```
                       ┌─────────────────────────────────────────────┐
   read the chain ───▶ │ did the read succeed?                        │
                       └───────────────┬──────────────────┬──────────┘
                                    no │               yes│
                                       ▼                  ▼
                            ┌────────────────┐   ┌──────────────────────┐
                            │ 4. READ-FAILED │   │ balance = 0 ?        │
                            │   value = null │   └───────┬──────────┬───┘
                            │   UI: "—"      │        yes│       no │
                            │  NEVER $0      │           ▼          ▼
                            └────────────────┘   ┌──────────────┐  ┌──────────────────────┐
                                                 │ GENUINE ZERO │  │ price known ?         │
                                                 │  a real 0    │  └──────┬────────────┬──┘
                                                 └──────────────┘      no │         yes│
                                                                          ▼            ▼
                                                            ┌───────────────────┐ ┌──────────────────┐
                                                            │ 2. DISCOVERED-    │ │ 1. DISCOVERED-   │
                                                            │    UNPRICED       │ │    AND-PRICED    │
                                                            │  amount shown,    │ │  full µUSD value │
                                                            │  value withheld,  │ │                  │
                                                            │  flagged `stale`  │ │                  │
                                                            └───────────────────┘ └──────────────────┘

   plus:  NOT-YET-SCANNED  — an asset/chain outside the current scan set: absent, not zero (Strategy B/C gaps)
```

Each state maps to a concrete mechanism already in the code:

1. **Discovered-and-priced (✅)** — a successful base-unit read × a live price → an exact µUSD value
   (§1.5). The only state that contributes a real number to net worth.
2. **Discovered-unpriced (✅)** — the *balance* read succeeded but no trusted price exists. The amount is
   shown; the value is **not invented**. The server folds this into the intelligence snapshot as a
   position carrying `valueMicros: 0n` **and** `stale: true`, and that staleness propagates to the
   top-level analysis
   ([`snapshotFromHoldings` in `services/api/src/insights.ts`](../../services/api/src/insights.ts)).
   The browser reader mirrors it: a per-asset `priceUsd` may be `null` while the amount is real, and
   `totalUsd` becomes `null` rather than under-counting when prices are unavailable
   ([`balances.ts`](../../apps/web/src/balances.ts)).
3. **Genuine zero (✅)** — the read succeeded and the answer is truly `0` (or the account is absent). A
   real empty holding. Discovery generally *omits* an empty position from the aggregated list
   (`readChainHoldings` pushes only balances `> 0n`; the SPL reader omits zero accounts) so the list shows
   what is owned — but where a specific asset is asked about, a genuine `0` is reported as `0`, never as
   `—`.
4. **Read-failed (✅) — the load-bearing one.** No endpoint answered. The value is `null`, rendered `"—"`.
   In the browser this is the `nullable(p) → p.then(n => n, () => null)` wrapper around every balance
   promise ([`balances.ts`](../../apps/web/src/balances.ts)); on the server, one chain source rejecting
   is dropped via `Promise.allSettled` so the *rest* of the portfolio still renders as a labelled
   **partial**, never as a smaller-but-confident total
   ([`runtime-provider.ts`](../../services/api/src/runtime-provider.ts)). **This state may never be
   coerced to `0`.**

Plus a fifth, structural state — **not-yet-scanned** — for the honest edges of Strategies B and C: a
long-tail ERC-20 off the allowlist, an SPL token pending symbol resolution, a chain not in the current
scan set. It is neither owned-zero nor read-failed; it is *out of scope of this scan*, and the product
labels it as such rather than implying the portfolio is complete. Naming this state is what keeps §1.8's
roadmap from masquerading as coverage.

---

### 1.5 · Money is integer bigint — base units in, µUSD out, floats only at the edge

Discovery reads base units and never leaves them until the very last formatting step. Valuation converts a
`bigint` amount and a decimal price string into integer **micro-USD** (µUSD; 1 USD = 1,000,000 µUSD) with
exact integer math — no float ever touches a value:

```ts
value_µUSD = amount × priceMicros / 10^decimals        // assetValueMicros(), all bigint
```

The price string (`"2100.55"`) is parsed to µUSD by `usdToMicros`, the product is taken in `bigint`, and
only `formatUsd` at the presentation edge renders `"$2,100.55"`
([`packages/portfolio/src/money.ts`](../../packages/portfolio/src/money.ts)). Aggregation sums holdings
of the same asset by normalizing each to the group's max decimals with `scaleAmount` (a pure `×10ⁿ`, so no
rounding) before summing
([`aggregatePortfolio` in `packages/portfolio/src/aggregate.ts`](../../packages/portfolio/src/aggregate.ts)).
This is Doctrine law #4 realized end-to-end: satoshis and wei are compared and totaled without ever
becoming `Number`, and the four states above are preserved through the arithmetic — an unpriced asset
contributes `0n` to the *value* total while still appearing in the *amount* list, and a read-failed asset
never enters the sum at all.

---

### 1.6 · Dust and spam — hide, never delete; omit, never misattribute

Discovery finds real dust and hostile spam alike. The rule for both is the same and it is a Doctrine
consequence, not a preference: **the wallet may fold noise out of the headline view, but it never destroys
a user's asset and never presents an asset under a name it cannot vouch for.**

- **Dust (✅).** Aggregation values every asset, then splits the list at a threshold — anything below
  **$1** (`1_000_000n` µUSD, configurable) is flagged `isDust` and moved to a separate `dust` array rather
  than dropped ([`aggregate.ts`](../../packages/portfolio/src/aggregate.ts)). The dust is still counted
  in `totalValueMicros`; it is merely *folded* in the UI, expandable on demand. Nothing is deleted, and the
  net-worth number stays whole.
- **Spam (🔶).** The dangerous case is a token that *lies about its identity.* Because holdings merge and
  price by symbol, a spoofed `USDC`/18-dec airdrop could inflate or mis-scale a real position. The shipped
  defense is allow-listing at the discovery boundary: an auto-discovered EVM token is surfaced **only** at
  a vetted canonical address and stamped with that entry's trusted symbol/decimals; an unverifiable token
  is **omitted** — the no-fake-data choice, strictly better than showing a value under a symbol we can't
  trust ([`services/api/src/alchemy.ts`](../../services/api/src/alchemy.ts)). Deeper heuristic spam
  scoring — approval traps, honeypot transfer behavior, zero-liquidity contracts — is the domain of §2 and
  the Security & Trust Engine ([Chapter 10](../bible/chapter-10-security-trust-engine.md)); §1's job is the hard
  gate that a discovered asset is never *misattributed*.

Two invariants hold across both: hidden ≠ deleted (a user can always reveal), and the totals stay honest —
dust is counted, spam is excluded from value because it *has* no trustworthy value.

---

### 1.7 · From many reads to one identity — discovery feeds aggregation

A user has one identity spanning three addresses (BTC + SOL + EVM; [Chapter 5](../bible/chapter-05-universal-identity.md)),
and discovery's final act is to collapse many per-chain reads into one asset list without losing where each
holding lives. Reads are merged by asset (uppercased symbol as the MVP key), summing totals and
concatenating per-chain provenance
([`mergeHoldings` in `packages/runtime/src/chains.ts`](../../packages/runtime/src/chains.ts);
[`aggregatePortfolio`](../../packages/portfolio/src/aggregate.ts)), so the same asset held on Ethereum,
Arbitrum, and Base becomes one row whose expansion still shows the three chains. The `stale` bit rides
along: if *any* contributing read or price was stale, the aggregate is flagged, so partiality is never
silently absorbed. The mechanics of cross-chain merge, symbol-collision safety, and per-chain provenance
are §6's subject; §1 guarantees only that the inputs handed to it are individually honest and correctly
typed.

---

### 1.8 · Shipped vs roadmap — the scrupulous ledger

| Capability | State | Where / note |
|---|---|---|
| Native balance discovery, BTC + EVM + SOL, mainnet + testnet | ✅ Shipped | `adapter.getNativeBalance`; browser `balances.ts` |
| Known-token (list-based) ERC-20 / SPL discovery | ✅ Shipped | `readChainHoldings`, L2 token lists in `runtime-provider.ts` |
| Four-state honesty (priced / unpriced / genuine-zero / read-failed) | ✅ Shipped | `balances.ts` `null`; `snapshotFromHoldings` `stale`; `allSettled` partials |
| Base-unit `bigint` → µUSD integer valuation | ✅ Shipped | `portfolio/money.ts`, `aggregate.ts` |
| Dust fold (hide, not delete) | ✅ Shipped | `aggregate.ts` `isDust` / `dust[]` |
| EVM full token enumeration (auto-discovery) | 🔶 Partial | Alchemy `alchemy_getTokenBalances`, allowlist-gated to vetted majors |
| Solana SPL enumeration | 🔶 Partial | native `getTokenAccountsByOwner`; **symbol registry** pending |
| Spoofed-symbol spam gate | 🔶 Partial | address allowlist omits unverifiable tokens; heuristic scoring → §2 / Ch10 |
| Long-tail token coverage (vetted list / paid indexer) | ⏭ Roadmap | documented follow-up in `alchemy.ts` |
| Canonical asset registry (`(chain,address)→assetId`, decouple from symbol) | ⏭ Roadmap | `aggregate.ts` accepts an `assetKey` override for exactly this |
| NFT enumeration | ⏭ Roadmap | §4 |
| Yield / DeFi position discovery (decode protocol state) | ⏭ Roadmap | §5 |
| Historical balance snapshots (long-term store) | ⏭ Roadmap | §7 |
| More chains / protocols | ⏭ Roadmap | bounded by the registry + adapter interface |

The honest headline: **native discovery is complete and shipped on every supported chain; fungible-token
discovery is real but bounded** — safe by allow-list today, breadth-limited until a vetted token list /
paid indexer and a canonical asset registry land. NFTs, DeFi positions, and history are *not yet
discovered* and are covered as roadmap in their own sections. "The engine exists" is not "the product
ships it," and this ledger keeps the two apart.

---

### 1.9 · The contract — discovery as an injected seam

Discovery is pure at its core and pluggable at its edges, so it is offline-testable with fixtures and
swaps a fake adapter for a live RPC-backed one unchanged. The seams are small interfaces:

```ts
// packages/portfolio/src/source.ts — the aggregation input
interface BalanceSource { getBalances(identityId: string): Promise<PortfolioBalance[]>; }

// services/api/src/runtime-provider.ts — the live holdings seam (identical shape to the runtime's)
type HoldingsSource = (principal: string) => Promise<Holding[]>;
```

The end-to-end pipeline these compose is: **`AdapterRegistry.get(chainId)` → (native read ‖ token probe ‖
enumeration) → fail-soft per read (`null` / `allSettled` drop) → merge by asset with provenance → value in
µUSD → split dust → flag `stale`.** Every arrow preserves the four states; no arrow may invent a number.
That pipeline is what §2–§9 build on.

---

### What §1 commits us to

- **Find everything, on the door we control.** Discovery goes through the `AdapterRegistry` and the
  `BlockchainAdapter` interface only — native on every chain (shipped), tokens by trusted list (shipped)
  and by enumeration (partial) — so adding a chain or protocol is an implementation, never a rewrite.
- **A failed read is `null`, never `$0`.** The four-state model (priced / unpriced / genuine-zero /
  read-failed) is a type, not a tooltip; partial reads render as labelled partials; not-yet-scanned is
  named, not hidden as completeness.
- **Money stays `bigint` until the edge.** Base units in, exact µUSD out; unpriced contributes amount but
  not value; read-failed contributes nothing to the sum.
- **Hide noise, never destroy or misattribute it.** Dust is folded and still counted; spoofed-symbol spam
  is omitted rather than shown under a name we can't vouch for.
- **Honest about the frontier.** Native discovery is done; token breadth is bounded; NFTs, DeFi, and
  history are roadmap and labelled as such — so the numbers above discovery are only ever as complete as
  discovery truthfully is.

---

### 🔜 §2 Preview — Token Classification & Spam Filtering

With assets *found*, the next question is *what are they* — native vs stablecoin vs bluechip vs unknown,
trustworthy vs hostile. §2 details the classifier that the discovery layer feeds
([`defaultClassifier` in `packages/intelligence/src/positions.ts`](../../packages/intelligence/src/positions.ts))
and the spam/scam heuristics that harden the allow-list gate of §1.6 into a scored, explainable verdict.


## §2 · Token Classification & Spam Filtering

> *As the Principal Data Engineer:* Discovery (§1) hands us a raw set of things a set of addresses "hold."
> Most of it is real. Some of it is decoration a stranger sprinkled into the user's wallet to phish them.
> The job of this section is to **sort the real from the junk without ever lying about either** — never
> silently value what we can't understand, never silently hide what the user might want to see, and never
> render a scam clone as the asset it is impersonating. Classification is a *display and safety* concern; it
> is deterministic code, and — per Doctrine 7 and Ch9 — **the AI never decides what a token is.**

---

### 2.1 · The problem: every responder is a "token," and most of the noise is hostile

On an account model, "owning a token" is not a privilege the chain grants — it is simply that some contract
or mint reports a non-zero balance for your address. Anyone can deploy an ERC-20 that airdrops itself to a
million addresses, name it `USDC`, give it a logo-shaped name, and quote a fake price on an obscure pool. A
naïve wallet renders that line item next to the real USDC and the user's net worth is now a lie. This is not
a rare edge; on EVM mainnet and Solana it is the *median* new token a busy address receives. Zerion, DeBank,
and Rabby all earn their trust primarily on how well they fold this noise away; MetaMask's static token lists
are the low bar. Our contract with the user is sharper than "usually right": **an unverified or spam token is
labelled and never counted toward real net worth, and its metadata is surfaced honestly — decimals are never
guessed, and a wrong decimal is treated as a money-display bug, not a rounding nit.**

Classification therefore runs on **three orthogonal axes**, and conflating them is the classic bug. We keep
them separate on purpose:

| Axis | Question it answers | Values | Owner |
|---|---|---|---|
| **Identity** | *Which asset is this, canonically?* | a stable id per `(chain, address/mint)`, deduped across chains | §2 + the Asset Engine (roadmap registry) |
| **Display class** | *What kind of asset is it?* | `native · stablecoin · bluechip · defi · meme · nft · rwa · lp · unknown` | `packages/intelligence` (`defaultClassifier`) |
| **Trust verdict** | *Is it real, unknown, or a scam?* | `verified · unverified · spam/impersonation` | **Ch10 Token Intelligence** (§2 consumes it) |

The **Display class** is explicitly *"not a price or trust signal, only a display classification"* — that
sentence is a comment in the shipped code (`packages/intelligence/src/positions.ts`). A token being classed
`meme` does not make it spam, and being classed `stablecoin` does not make it trusted. The **Trust verdict**
— fake/impersonation/low-liquidity/suspicious-metadata/unknown — is owned by the Security & Trust Engine
(**Ch10 → Token Intelligence**), which already commits to *"Detect: fake tokens · spam tokens · impersonation
· low liquidity · suspicious metadata · unknown assets… Allow users to hide or ignore spam assets."* This
section does the **data plumbing** that turns that verdict into an honest unified view: resolve identity,
attach metadata, hold the unknown state honestly, and fold spam away reversibly. §3 values what survives; §4
handles NFTs; the AI only narrates the result (Ch9).

---

### 2.2 · Metadata: symbol, decimals, logo — and why **decimals are load-bearing**

Every asset carries three pieces of presentation metadata, and they are not equally dangerous to get wrong.

**Decimals are the one that moves money.** A balance is an integer of base units (Doctrine 4); the human
amount and every fiat value are computed by dividing by `10^decimals`. The shipped valuation core makes this
literal:

```
value = amount * priceMicros / 10^decimals        // packages/portfolio/src/money.ts → assetValueMicros
```

A decimals off by one is a value off by 10×. So decimals are **read from the chain or asserted by a trusted
source, never guessed**, and the read path is defensive end-to-end:

- The adapter interface documents it — `TokenRef.decimals` is *"used to interpret the returned base-unit
  amount"* (`packages/chains/src/adapter.ts`). It is load-bearing, not cosmetic.
- EVM reads `decimals()` over minimal ABI and **clamps**: `decodeDecimals` throws `implausible token decimals`
  above 36 (`packages/chains/src/evm/abi.ts`), and `assetValueMicros` independently rejects `< 0 || > 36`. A
  malformed or adversarial `decimals()` return cannot silently corrupt a value — it fails closed (Doctrine 5).
- Solana takes decimals from the mint itself (`getTokenAccountsByOwner` returns `tokenAmount.decimals`;
  `getAssetMetadata` reads `getTokenSupply`) — authoritative by construction
  (`packages/chains/src/solana/adapter.ts`).
- Aggregation never mixes scales: when the same symbol appears on two chains it normalizes to the group's
  **max** decimals with exact integer `scaleAmount` before summing (`packages/portfolio/src/aggregate.ts`).
  No float ever touches the sum.

**Symbol is where honesty about our own coverage begins.** On EVM we decode `symbol()` handling *both* wire
shapes tokens use — the modern dynamic string and the legacy `bytes32` packed form (e.g. MKR) — via
`decodeString` (`abi.ts`). On Solana **there is no on-chain symbol**: `SolanaAdapter.getAssetMetadata` returns
`symbol: ''` with the explicit note *"SPL symbols require a token registry (enriched upstream)."* That empty
string is not a bug to paper over — it is the honest signal that the name must come from a catalog we trust,
and until it does, the asset is shown by mint, not by an invented ticker. A symbol is also **never a trust
signal**: two tokens can both call themselves `USDC`, which is exactly why identity (2.4) resolves on
`(chain, address)`, not on the string.

**Logo is not on-chain at all** — there is no logo today, and that is stated, not faked. **[ROADMAP]** logos
arrive from the canonical Asset Engine registry alongside name and price-key. Until then the surface renders a
neutral, deterministic placeholder (e.g. a monogram of the resolved symbol). **We never show a wrong or
borrowed logo**, because a real-looking logo on a fake token is precisely the impersonation attack (Ch10).

---

### 2.3 · The honest "unknown asset" state — shown, flagged, never silently valued or hidden

The defining discipline of the whole chapter is the **four-state model**: every place a value appears, it is
one of *real value · genuine-zero · partial · network-fail (≠ $0)*. Classification adds a fourth question
next to "what is it worth" — **"how sure are we what it is"** — and it must never be answered by pretending.
The states, and what each is allowed to do to the headline:

| State | What we know | Rendered as | Counts toward net worth? |
|---|---|---|---|
| **Verified + priced** | canonical id, decimals, trusted price | full value, real logo | ✅ yes |
| **Known asset, unpriced** | id + decimals, **no price** | quantity shown, value `—` (not `$0`) | ❌ no — honestly excluded |
| **Unknown asset** | held, decimals read, class `unknown`, no verdict | quantity shown, value `—`, flagged *"unrecognized"* | ❌ not until identified/priced |
| **Unread** | RPC failed for this asset | `—`, labelled *partial read* | ❌ never rendered as `$0` |
| **Spam / impersonation** | Ch10 verdict = spam | folded away, inspectable on reveal | ❌ counted as $0 (it *is* a lie) |

Two of these already exist in shipped code and are worth naming precisely, because they look similar and mean
opposite things:

- **Unpriced ≠ zero.** `aggregatePortfolio` sets `valueMicros = 0n` and `priceUsd = null` for an asset with no
  price, and `stale = true` propagates when any contributing quote was flagged stale
  (`packages/portfolio/src/types.ts` → `UnifiedAsset`). The `0n` is a *sentinel the UI must read as "—", not
  "$0."* A held asset we can't price is a **known quantity of unknown value**, never a zero.
- **Unread ≠ not-held.** The EVM reader wraps each token in `.catch(() => null)` and filters nulls, and the
  live-balance surface uses the same `nullable()` pattern to turn a failed native read into `null → "—"`
  (`apps/web/src/balances.ts`, `packages/chains/src/evm/adapter.ts`). Dropping a *failed* read is correct at
  the adapter layer — but the discovery surface (§1) and the Balance Engine (**Ch6 §8**) must then label the
  view **partial**, so a network failure never masquerades as "you hold nothing." *We didn't read it* and
  *you don't own it* are different truths and must render differently.

The **consent rule** on the unknown state is absolute: an unknown or unpriced asset is **shown and flagged**,
never silently dropped from the list and never silently assigned a value. The user always sees that something
is there and that we are honest about not fully understanding it yet.

---

### 2.4 · Identity resolution: closing the symbol-collision hole

Today aggregation groups by **uppercased symbol** — the pragmatic MVP key — and the code says so plainly,
including the hazard: *"a canonical asset registry (mapping (chain, address) → asset id, so two different
tokens sharing a symbol don't collide) is a documented follow-up"* (`aggregate.ts`). Crucially, the seam for
the fix already ships: `aggregatePortfolio` accepts an optional `assetKey: (balance) => string` override, and
the intelligence engine accepts an injected `Classifier` / `AssetCatalog` (`sources.ts`,
`positions.ts`). The registry plugs into these **without an API change**.

**[ROADMAP — DB-backed] The canonical Asset Engine.** The Master Spec module card defines the target: a
registry mapping `(chain, contract/mint) → { stable asset id, authoritative decimals, symbol, name, logo,
price-key, spam classification }`, exposing `classifyAsset(ref) → { verified | unverified | spam }`, with
allow/deny lists and a reputation signal. When it lands, the grouping key becomes the canonical id instead of
the symbol, and the collision — a real USDC merging with a scam clone that also calls itself USDC — is closed
structurally: they are different ids, so they never sum. Until then we are explicit that grouping-by-symbol is
a known, documented limitation, not a solved problem. *"The engine exists" ≠ "the product ships it."*

---

### 2.5 · Spam & scam-airdrop filtering: **fold, disclose, reveal — never delete**

The trust verdict comes from Ch10; **what §2 does with it** is a data-shaping pattern the codebase already
uses for dust, lifted one level up. `aggregatePortfolio` splits sub-threshold assets into a separate `dust[]`
array (default `$1`), keeps them fully computed, and lets the UI fold them away and reveal on demand — the
value is not destroyed, only demoted (`aggregate.ts`, `UnifiedPortfolio.dust`). Spam gets the **same
mechanic, stronger stance**:

1. **Fold away by default.** An asset with a `spam` verdict is moved into a hidden bucket and **counted as $0
   toward headline net worth** — not because we failed to price it, but because its "value" is a fabricated
   quote on a worthless honeypot. This is Doctrine 3 in force: it is never counted toward *real* net worth.
2. **Always inspectable.** The hidden set is disclosed (*"N hidden items"*) and one tap reveals it in full,
   with the reason it was hidden and the Ch10 signals behind the verdict. Hiding is a **view state, never a
   deletion** — we do not delete tokens, and per our own action rules we never permanently destroy user data.
3. **User override wins.** Allow/deny lists let the user say *"this is real, un-hide it"* or *"this is junk,
   hide it"* and that decision persists. Human judgment supersedes the heuristic in both directions.
4. **Honeypot / no-liquidity is a valuation trap, not just a label.** An asset showing a large balance that
   cannot actually be sold must never inflate net worth. §2's contribution is to mark *no price / no
   liquidity* so §3 refuses to value it; Ch10 owns the "unsellable / honeypot" detection itself.

Benchmark: this is the Rabby standard — airdrop dust and honeypot clones folded away by default and never
counted as real value — but held to our honesty bar, where *folded* is always *disclosed and reversible*,
never silent.

---

### 2.6 · The pipeline: deterministic, code-decides, AI-narrates

Classification resolves in a **fixed precedence**, most-authoritative first, so the outcome is reproducible
from its inputs (Doctrine 7; the Master Spec DoD: *"classification is deterministic and testable; the AI layer
never decides what a token is"*):

```
resolve(assetRef):
  1. USER OVERRIDE        (allow/deny list)         → wins outright
  2. CATALOG / REGISTRY   AssetCatalog.classify()   → canonical id, class, trust verdict   [ROADMAP registry]
  3. CHAIN-READ METADATA  decimals()/symbol(), mint → authoritative decimals; raw symbol   [SHIPPED]
  4. BUILT-IN FALLBACK    defaultClassifier()       → STABLES / NATIVES / BLUECHIP sets     [SHIPPED]
  5. UNKNOWN              (nothing matched)          → class 'unknown', flagged, unvalued   [SHIPPED]
```

Steps 3–5 ship today: `defaultClassifier` maps a small, stable, audited set of well-known symbols to a class
and falls back to `unknown` (`positions.ts`), and the chain adapters read decimals/symbol as described. Steps
1–2 are the injectable seams (`assetKey`, `Classifier`, `AssetCatalog`) waiting on the registry. At **every**
step the decision is made by pure, testable code; the LLM is handed the *result* to explain — it never picks
the class, never overrides a spam verdict, and never invents metadata. That boundary is the same one Ch9 draws
for every number in the wallet.

---

### 2.7 · Shipped vs roadmap — the scrupulous ledger

| Capability | Status | Where |
|---|---|---|
| Chain-read **decimals** (EVM ABI + clamp; SPL mint) | ✅ **SHIPPED** | `evm/abi.ts`, `solana/adapter.ts`, `money.ts` |
| Chain-read **symbol** (EVM dynamic + `bytes32`) | ✅ **SHIPPED** | `evm/abi.ts` `decodeString` |
| Failed-read → `null`/`—` (never `$0`); stale propagation | ✅ **SHIPPED** | `evm/adapter.ts`, `balances.ts`, `types.ts` |
| **Display class** (native/stable/bluechip/…/unknown) | ✅ **SHIPPED** | `intelligence/positions.ts` |
| Unpriced/unknown honesty (`valueMicros 0n`, `priceUsd null`) | ✅ **SHIPPED** | `portfolio/aggregate.ts` |
| **Dust fold + reveal** (the spam-fold mechanic) | ✅ **SHIPPED** | `aggregate.ts` `dust[]` |
| Injectable `assetKey` / `Classifier` / `AssetCatalog` seams | ✅ **SHIPPED** | `aggregate.ts`, `sources.ts` |
| Trust verdict: fake/impersonation/low-liquidity | 🔶 **PARTIAL** — Ch10 owns; §2 consumes | Ch10 Token Intelligence |
| **Canonical registry** `(chain,addr)→id` + `classifyAsset()` | 🚧 **ROADMAP (DB-backed)** | Master Spec — Asset Engine card |
| Authoritative symbol/name/**logo** enrichment | 🚧 **ROADMAP (DB-backed)** | Asset Engine registry |
| Live reputation, community allow/deny, honeypot checks | 🚧 **ROADMAP** | Asset Engine + Ch10 |
| Symbol-collision elimination (real vs clone dedup) | 🚧 **ROADMAP** — seam ready, key still symbol | `aggregate.ts` `assetKey` |

We aim to beat Zerion/DeBank on asset resolution and Rabby on spam-folding — but we do **not** claim their
coverage today. Today's classification is a small audited fallback plus honest empty/unknown states plus the
seams the registry drops into; the live registry, logos, and reputation are the follow-up that turns "the
engine exists" into "the product ships it."

---

### 2.8 · Definition of Done — the laws this section holds

1. **Decimals are never guessed.** Read from chain or asserted by a trusted source, clamped `0–36`; if
   decimals can't be established, the asset is shown as an honest unknown quantity, **never valued wrong**.
2. **A scam clone is never rendered as the real asset.** Identity resolves on `(chain, address)`, never on the
   symbol string; the collision is closed by canonical id (roadmap), not by trusting the ticker.
3. **Spam and unpriced never touch headline net worth.** Spam is counted as `$0`; unpriced is `—`, not `$0`;
   both are excluded from the real number and both remain inspectable.
4. **Nothing is silently hidden or deleted.** Filtering is a disclosed, reversible view state (*"N hidden"*)
   with one-tap reveal and user override; we never permanently remove a user's tokens.
5. **The unknown state is first-class.** An unrecognized asset is shown, flagged, and never assigned an
   invented value, symbol, or logo.
6. **Code decides, AI narrates.** Classification is deterministic and unit-tested to exhaustion; the LLM
   explains the verdict but never sets it (Doctrine 7, Ch9).

> **See also:** §1 Universal Asset Discovery (the raw set we classify) · §3 Real-Time Portfolio Valuation (what
> we do with a verified, priced asset) · §4 NFT Intelligence · **Ch5** Universal Identity (the 3-address model
> whose holdings we sort) · **Ch6 §8** Balance Engine (four-state honesty at the read layer) · **Ch9** AI
> Financial Brain (the narrator boundary) · **Ch10 → Token Intelligence** (the scam/impersonation verdict this
> section consumes).


## §3 · Real-Time Portfolio Valuation

> *"What is it worth?"* is the first question every wallet must answer and the easiest one to answer
> dishonestly. A balance viewer that shows **$0** when the network hiccups has not failed gracefully —
> it has told a funded user their money is gone. This section is the honesty core of Chapter 11: the
> deterministic path from base-unit balances to a headline number, and the discipline that a number is
> only ever *computed*, never *invented*. Discovery (§1) found the assets; classification (§2) told us
> which are real and which are spam. Here we price them — and we refuse, on doctrine, to price them
> wrongly.

The valuation engine is **largely shipped and doctrine-critical**. It rests on three of the constitution's
laws at once: money is integer `bigint` end-to-end (Doctrine #4), a failure is never rendered as `$0`
(Doctrine #3), and anything a guard cannot positively verify is shown as unknown rather than guessed
(Doctrine #5). Everything below is grounded in real code: the pure aggregation core in
`packages/portfolio`, the shipped server valuation in `services/api/src/balances.ts`, and the two live
net-worth heroes in `apps/web/src/balances.ts` + `apps/web/src/App.tsx` and `apps/mobile/ScreenHome.tsx`.

---

### 3.1 · The valuation equation — base units × price, in integer µUSD

A position's value is conceptually trivial — *amount × price* — and this is exactly where floating-point
math quietly corrupts a wallet. `0.1 + 0.2 !== 0.3` in IEEE-754, and a portfolio that sums thousands of
such products drifts by cents that a user *will* notice against their exchange statement. So the engine
does no float math on value. It works in **micro-USD (µUSD)**, an integer where `1 USD = 1_000_000 µUSD`
(`packages/portfolio/src/money.ts`, `MICRO = 1_000_000n`).

Three pure functions carry the whole equation:

| Function (`portfolio/src/money.ts`) | Contract |
|---|---|
| `usdToMicros(price: string): bigint` | Parses a decimal price string (`"2100.55"`) into integer µUSD (`2_100_550_000n`), rejecting anything non-numeric. Prices arrive as **strings**, never floats, so no precision is lost before the boundary. |
| `assetValueMicros(amount, decimals, priceMicros): bigint` | The value equation: `value = amount × priceMicros / 10^decimals`, computed entirely in `bigint`. Rejects implausible decimals (`< 0` or `> 36`). |
| `formatUsd(micros): string` | The **only** float-free presentation step: `3_150_825_000n → "$3,150.82"`, rounding at the display edge and never before. |

The load-bearing detail is that `amount` is the raw on-chain base-unit integer produced by the chain
adapters (`AssetBalance.amount: bigint` in `packages/chains/src/adapter.ts`), and `priceMicros` is an
integer. Their product divided by `10^decimals` is exact integer arithmetic. A user holding
`1_234_567_890_000_000_000n` wei of ETH (1.23456789 ETH) at `"2100.55"` is worth precisely
`2_593_146_...n` µUSD — the same number on every machine, in every test run, forever. Formatting to
`"$2,593.15"` happens once, at the very last inch of the pipeline, for a human's eyes only.

When two chains report the same asset at different decimal scales (USDC is 6 decimals on Ethereum, but a
bridged representation might differ), the engine normalizes **up** to the group's maximum decimals with
`scaleAmount` before summing (`aggregate.ts:44–45`) — multiplying by `10^(to−from)`, never dividing, so no
low-order digit is ever truncated. This is verified by the conformance test *"merges assets with differing
decimals by normalizing up (no float error)"* in `packages/portfolio/test/aggregate.test.ts`.

---

### 3.2 · The Four-State Value Model — the honesty core

A displayed value is not a number; it is a claim about reality. Every place a value appears in the product
resolves to **exactly one of four states**, and the entire section exists to keep these four apart. The
cardinal sins — the two we refuse on doctrine — are collapsing state ③ or ④ into a `$0`.

| State | Meaning | What the user sees | Never |
|---|---|---|---|
| ① **Real value** | Balance read succeeded **and** every held asset is priced. | The computed number, e.g. `$3,150.82`. | — |
| ② **Genuine zero** | Reads succeeded; every balance is truly `0` on-chain. | An honest `$0` + a warm "add funds" moment. | Never dressed up as an error. |
| ③ **Partial valuation** | Some assets/chains read or priced, some did not. | The **partial** total, explicitly labelled as incomplete. | **Never presented as the complete total.** |
| ④ **Network / price failure** | The read itself failed (RPC down, price feed down, no identity). | A "couldn't reach the network" card with **Retry**. | **Never `$0`.** A blip is not a zero. |

This is not aspiration; it is coded. The header comment of `apps/mobile/ScreenHome.tsx` enumerates the four
states verbatim — *"A funded user whose network blipped must NEVER be shown '$0 / add crypto' — that reads
as 'your money is gone.'"* The mechanism that keeps ② and ④ apart is a discipline that runs the entire
depth of the stack: **a failed read is `null`; a genuine zero is `0`; the two are different types and are
never conflated.**

```
                    fetch balances + prices (fail-soft, per source)
                                   │
            ┌──────────────────────┼───────────────────────────┐
            │                      │                           │
      every source          every read OK               all reads failed
       failed / no id       + every held priced          / no identity
            │                      │                           │
            ▼                      ▼                           ▼
      ④ NETWORK-FAIL      ┌────────┴────────┐            ④ NETWORK-FAIL
      "couldn't reach"    all balances 0?   some read,   "couldn't reach"
      + Retry (NOT $0)    │           │      some failed  + Retry (NOT $0)
                          ▼           ▼          │
                    ② GENUINE ①  REAL VALUE      ▼
                       $0        $3,150.82   ③ PARTIAL
                                              "some balances
                                               couldn't load"
```

The seam that makes this possible is the fail-soft read. In `apps/web/src/balances.ts`, every per-chain
call is wrapped by `nullable(p)` so a chain that throws resolves to `null` rather than rejecting the whole
view; `NetBalance.amount` is `number | null` **on purpose**. The net-worth derivation then guards on it:
`totalUsd` is `null` when no price is available at all (`anyPrice` is false), and where it does sum, it
adds only assets that are *both* read *and* priced (`balances.ts:119–122`). The render layer honors the
`null`: `apps/web/src/App.tsx` shows `—` (or a skeleton while loading) for a null net worth and **never a
`$0`** (the `netWorth == null ? … '—'` branch at `App.tsx:2224–2231`); the per-asset card does the same
(`mUsd == null ? '—'`).

`apps/mobile/ScreenHome.tsx` derives the four states explicitly and is the clearest reference:

- `readOk` — at least one balance read succeeded; `allReadOk` — every chain read succeeded.
- `funded` / `emptyGenuine` — separates a real balance from a genuine on-chain zero.
- `partialEmpty` — *"some chains read, some failed, no funds seen."*
- `errored` — *"data === null or EVERY read failed (total outage)."*

Only when **every** chain read **and** every held asset is priced does the code set `trustworthy = true`;
only then does it permit a 24-hour change chip, and even then it suppresses it below one cent so a dust
rounding never renders as *"$0 ▲ 2.3%"* (`ScreenHome.tsx`, `showChange` gate). This is the four-state model
applied not just to the headline but to every derived figure hanging off it.

---

### 3.3 · Partial valuation — never a false total

State ③ is the subtle one and the one most aggregators get wrong. A portfolio of ten assets where the
price feed returns nine out of ten prices has a *knowable partial value* and an *unknowable true total*.
The wrong move — the industry-common move — is to sum the nine and present it as **the** number. That
silently under-counts and lies by omission.

The engine's rule: **an unpriced asset carries a `null` value and is excluded from the total, and the
total is labelled as partial whenever anything was excluded.** Concretely, on the shipped server path
(`services/api/src/balances.ts`, `makeBalancesReader`):

- Each ecosystem source is run under `Promise.allSettled`; a source whose network is down is **dropped**,
  and its label is pushed onto an `unavailable: string[]` array returned to the caller — *"so the caller
  can say so instead of implying it is the full picture."*
- If addresses were provided but **every** source rejected, the reader **throws** rather than returning an
  empty portfolio — state ④, surfaced honestly (`balances.ts:82–84`).
- An asset with no price gets `priceUsd: null` and `valueMicros: null`, is **excluded from
  `totalValueMicros`**, and sinks to the bottom of the sort (unpriced last).

On the client, the same truth is surfaced as UX: `apps/mobile/ScreenHome.tsx` computes `heldPriced` (is
*every held* asset priced?) and a `degradedNote` — *"Some balances couldn't load — pull to refresh"* or
*"Live prices unavailable — pull to refresh"* — shown precisely when `funded && !trustworthy`. The partial
card in web/mobile is a distinct visual state from both the empty state and the error state. A partial
total may be shown (it is useful — *"at least $X"*), but it is **always** wearing a label that says it is
not the whole story.

This is our sharpest differentiator against Zerion / Zapper / DeBank-class aggregators. They ship excellent
multi-chain aggregation and we match its *shape* (§3.4); what they do not do is refuse to render a
degraded read as a confident number. Our four-state model is a product promise, not a rendering
convenience.

---

### 3.4 · Unified net worth + per-account / per-chain breakdown

"Chains are invisible" is the product promise, and its pure core is
`aggregatePortfolio(balances, options)` in `packages/portfolio/src/aggregate.ts`. Given a flat list of
`PortfolioBalance` (one asset on one chain, base-unit `bigint`), it:

1. **Groups** by asset key (MVP: uppercased symbol; a canonical `(chain, address) → assetId` registry is a
   documented follow-up plugged in via the `assetKey` override — see §2 and §3.7).
2. **Merges** the same asset across chains into one `UnifiedAsset`, summing base amounts after
   `scaleAmount` normalization, while **keeping per-chain provenance** in `chains: ChainHolding[]` so the
   expand-view can show *"3.1 ETH: 2.0 on Ethereum, 1.1 on Arbitrum."*
3. **Values** each merged asset with `assetValueMicros` (or `0n` + `priceUsd: null` if unpriced).
4. **Sorts** by value descending, ties broken by symbol for a stable order among equal/unpriced assets.
5. **Sums** `totalValueMicros` across all assets and returns `{ totalValueMicros, assets, dust, stale }`.

The shipped server reader (`services/api/src/balances.ts`) delivers the same unified number **plus the
breakdown the product surfaces**: `byEcosystem: { evm, bitcoin, solana }` (µUSD strings) — the universal
total, broken down by ecosystem, computed by routing each priced position's value into its ecosystem
subtotal via `ecosystemOf(chainId)`. Because a symbol lives in exactly one ecosystem (BTC → bitcoin,
SOL → solana, ETH/USDC → evm), no cross-ecosystem double-count is possible. All of this is `bigint` µUSD:
`v = (h.totalBase * usdToMicros(price)) / 10n ** BigInt(h.decimals)` (`balances.ts:103`).

**Per-account** breakdown follows from identity: the same three addresses derived on-device from one seed
(Ch5) define one identity's net worth; multi-account HD switching (task #107) re-runs the read against the
active account's addresses. The **per-chain** breakdown is the `ChainHolding[]` provenance already carried
on every `UnifiedAsset`. Net worth is therefore *one number* at the top and *fully decomposable* on the
way down — the Apple-Wallet-simple headline over a Stripe-precise ledger.

One correctness subtlety worth stating: net worth is **gross assets − debt**, and the sign of debt is the
whole reason a net-worth number can be trusted. The `packages/portfolio` aggregation core sums holdings
(assets); the richer intelligence layer (`packages/intelligence/src/positions.ts`, §7/§8) is where a
`borrowing` position becomes a *negative* signed contribution. This section owns the *asset* valuation;
liability-aware net worth is computed there and must never be duplicated here.

---

### 3.5 · Pricing sources + staleness labelling

Prices are the one input this engine does not compute itself, so they are the one input it treats with
suspicion. The `PriceInfo` type (`packages/portfolio/src/types.ts`) is deliberately richer than a bare
number:

```
interface PriceInfo { usd: string; asOf?: string; stale?: boolean; }
```

- **`usd` is a string.** Prices enter the system as decimal strings and are converted to integer µUSD by
  `usdToMicros`. There is no float on the value path, ever.
- **`stale` is first-class.** When a price source flags a quote as stale, `aggregatePortfolio` sets that
  asset's `stale: true` and rolls it up into the portfolio-level `stale` flag (`anyStale`,
  `aggregate.ts:40,49,51`). A stale valuation is still *shown* — a five-minute-old ETH price is far better
  than `—` — but it is **labelled** stale so the UI can badge it. Staleness is a fourth honesty axis
  layered on top of the four-state model, not a replacement for it.
- **`asOf` carries provenance.** The ISO timestamp of the quote is opaque to the pure engine but available
  to the UI for an "as of 14:32" caption.

The sources themselves sit behind injected seams (`packages/portfolio/src/source.ts`): `PriceSource` and
`BalanceSource` are interfaces, which keeps the aggregation core pure and offline-testable while letting
the real feeds plug in. In the shipped client today, live spot prices come from CoinGecko's free,
CORS-enabled `simple/price` endpoint (`apps/web/src/balances.ts`, `fetchPrices`), and the function is
fail-soft per asset: any failure returns `{ ETH: null, SOL: null, BTC: null }`, which flows straight into
state ③/④ rather than a fabricated price. A price feed is a dependency, not an oracle of truth — when it is
silent, we say so.

---

### 3.6 · The dust threshold

A wallet accumulates dust — sub-dollar fragments of a dozen tokens, airdrop residue, rounding
leftovers — and a headline asset list cluttered with `$0.003` positions is noise, not signal. The engine
folds dust away **without hiding value**.

- The threshold is `DEFAULT_DUST = 1_000_000n` µUSD (**$1**), configurable via
  `AggregateOptions.dustThresholdMicros` (`aggregate.ts:24,28`).
- Every asset gets an `isDust: boolean` flag: `valueMicros < dustThreshold` (`aggregate.ts:60`).
- The result splits into `assets` (the headline list) and `dust` (folded into an expandable pill), but —
  critically — **`totalValueMicros` sums over *all* assets, dust included** (`aggregate.ts:70–72`). Dust is
  *collapsed in the UI*, never *subtracted from your net worth*. Your $1,000.40 does not become $1,000 just
  because forty cents live in a fragment.
- An **unpriced** asset has `valueMicros: 0n`, so it classifies as dust and lands in the folded list —
  correct behavior: we don't know it's worth anything yet, so it doesn't clutter the headline, but it's
  never *claimed* to be worthless (its `priceUsd` is `null`, shown as `—`, not `$0`). This is exactly the
  conformance case *"handles unpriced assets (value 0, still listed as dust)"* in the aggregate test suite.

There is one more dust-adjacent guard worth calling out because it is a real footgun the code closes: the
24h-change chip is suppressed unless the rounded total is at least one cent (`totalRounded >= 0.01` in
`ScreenHome.tsx`). Without it, a genuinely-empty or all-dust portfolio could flash *"$0 ▲ 2.3%"* — a
number that is both meaningless and alarming. Change is only shown on a trustworthy, non-trivial total.

---

### 3.7 · Shipped vs. roadmap — the scrupulous ledger

The engine exists and the honesty discipline ships; some of the *breadth* of what it can value is still
being wired. Stated plainly, because "the engine exists" ≠ "the product ships it":

**Shipped today (cited above):**
- Integer-µUSD `bigint` valuation math end-to-end (`packages/portfolio/src/money.ts`), formatted only at
  the edge.
- The **four-state value model** — real / genuine-zero / partial / network-fail-≠-$0 — enforced from the
  fail-soft read (`balances.ts`) through the render (`App.tsx`, `ScreenHome.tsx`).
- Unified net worth + **per-ecosystem** and **per-chain** breakdown with per-chain provenance
  (`packages/portfolio/aggregate.ts`, `services/api/src/balances.ts`).
- Live pricing with **staleness** labelling and fail-soft price feeds.
- The **$1 dust threshold** with dust-folding that never subtracts from the total.
- A conformance test suite for the aggregation core (`packages/portfolio/test/aggregate.test.ts`).

**Roadmap / partial (labelled, never implied as shipped):**
- **Canonical asset-registry keying.** Grouping is by uppercased symbol today; the `assetKey` override is
  the documented seam for a `(chain, address) → assetId` registry so two tokens sharing a symbol never
  collide (ties into §2 classification).
- **Full token-level bigint valuation in the browser Home hero.** The live *native* hero in
  `apps/web/src/balances.ts` reads three native balances and, for that 3-asset live view, sums in a
  fail-soft `number` at the presentation edge; the doctrine-grade `bigint` path and the multi-asset/token
  breakdown route through the server balances reader / SDK. Converging the browser Home hero onto the
  server's `bigint` reader is in flight.
- **Historical value snapshots & price-history store.** The `SnapshotStore` seam exists
  (`packages/intelligence/src/sources.ts`), but there is no long-term price-history store yet — time-series
  net worth, TWR, drawdown, and the 24h-change baseline are §7's domain and depend on this store.
- **NFT floor valuation** (§4) and **yield/DeFi position valuation** (§5) are separate, partially-integrated
  tracks; this section values fungible spot holdings and does not claim NFT or LP-leg valuation as shipped.

---

### Definition of Done — §3 acceptance

A value is correctly rendered only when **all** of these hold:

1. **No float on the value path.** Every value is `bigint` µUSD from read to `formatUsd`; the only float is
   final display. (`money.ts`, `aggregate.ts`, server `balances.ts`.)
2. **Four states, never collapsed.** Network-fail renders as a Retry card (not `$0`); an unpriced asset
   renders `—` (not `$0`); a partial total is labelled partial (never presented as complete); a genuine
   on-chain zero renders `$0`.
3. **Null ≠ zero, end to end.** A failed read is `null`; a real zero is `0`; the two are distinct types and
   are never conflated at any layer.
4. **Total is honest about coverage.** Unpriced/unavailable assets are excluded from the total, and their
   exclusion is surfaced (`unavailable[]`, `degradedNote`, stale badge) — the total never silently
   under-counts.
5. **Dust folds, never subtracts.** Sub-$1 positions collapse in the UI but remain in `totalValueMicros`;
   change chips are suppressed on trivial or untrustworthy totals.
6. **Provenance survives aggregation.** Per-chain and per-ecosystem breakdown reconstruct the headline
   exactly; the number is decomposable, not a black box.

> Sibling sections: universal discovery feeds this engine its balances (§1); classification decides what is
> real enough to value (§2); NFT (§4) and yield/DeFi (§5) valuation extend it; historical snapshots and
> performance over time build on it (§7); the AI narrator may only cite figures this engine computed —
> never invent one (§8, and the narrator boundary in Ch9).


## §4 · NFT Intelligence

Everything before this section values assets the way an accountant would: a balance is a fact read
off-chain, a price is a quote from a market, and their product is a number you can defend. §1
(Universal Asset Discovery) finds the holdings, §2 (Token Classification & Spam) decides which are
real, and §3 (Real-Time Portfolio Valuation) turns them into the one honest net-worth figure. **A
non-fungible token breaks that chain at the last link.** You can read that a wallet owns *CryptoPunk
#3100* as cleanly as you read that it owns 1.4 ETH — ownership is on-chain fact. But *what #3100 is
worth* has no on-chain answer. There is no price feed for a thing of which exactly one exists. The
"floor price" everyone quotes is the lowest current **ask** across a collection — not a fill, not a
mark, not a promise anyone will pay it — and it says nothing about a specific token whose traits make
it worth ten floors or a tenth of one.

So this section is written under a single, load-bearing discipline: **an NFT's contribution to a
portfolio value is always an estimate, always labelled as one, and never silently folded into the
headline net worth.** That headline comes from §3's fungible mark-to-market and stays clean.
Collectibles sit in their own, clearly-estimated band beside it. Break that rule and we have violated
Doctrine #3 (never fake data — an unpriced or speculative value is *not* a confirmed dollar) in the
one place users are most likely to be flattered by a fabricated number.

We are also honest about maturity. **NFT intelligence is roadmap.** Today the wallet is
*fungible-asset-first* by deliberate choice, and this section is the design we will build against, not
a description of shipped behaviour. Where the seams already exist in code, we cite them; everywhere
else we tag it ⏭ **roadmap** and mean it.

> **Benchmark.** Zerion, Zapper, and DeBank all render NFTs and attach a floor-price estimate; OpenSea
> and Blur publish the floors themselves; Reservoir/Alchemy/Helius expose the indexes that make
> discovery possible. We adopt the *honest subset* of what they do — show the item, estimate the value
> with a visible basis and confidence — and refuse the dishonest part: quietly summing speculative
> floors into a number that reads like cash.

---

### 4.1 Where NFTs sit today — the honest baseline

The wallet does not read NFTs yet, and the code says so plainly. The chain abstraction —
[`packages/chains/src/adapter.ts`](../../packages/chains/src/adapter.ts) — gives every ecosystem
exactly two read paths for holdings: `getNativeBalance(address)` and
`getTokenBalances(address, tokens)`, both returning **fungible** `bigint` base-unit amounts. There is
no `getNfts` on the `BlockchainAdapter` interface, and the browser balance reader
([`apps/web/src/balances.ts`](../../apps/web/src/balances.ts)) reads only the three native assets.
The wallet has never shown a user an NFT it could not value honestly, because it has never shown one at
all. That is the correct place to have started.

What *does* already exist is the **seat at the table**. The intelligence engine's type system reserves
a first-class, non-fungible slot throughout
([`packages/intelligence/src/types.ts`](../../packages/intelligence/src/types.ts)): `AssetClass`
includes `'nft'`, `PositionKind` includes `'nft'`, and the position normalizer
([`packages/intelligence/src/positions.ts`](../../packages/intelligence/src/positions.ts))
classifies a `kind: 'nft'` position as `assetClass: 'nft'` and, crucially, `liquidity: 'illiquid'`.
The consequence is that **the day an NFT position is fed to `normalize`, the whole brain already treats
it correctly** — it counts toward gross assets only if it carries a value, contributes zero to the
liquid buffer, and drags the diversification/liquidity health scores the way an illiquid holding
honestly should (§6, §7, §8; risk math in `risk.ts`). The pipeline is ready; nothing feeds it.

| Capability | State | Where |
|---|---|---|
| NFT position type + illiquid classification | ✅ shipped | `types.ts`, `positions.ts` |
| Illiquid-weight risk/health treatment once fed | ✅ shipped | `risk.ts` via `normalize` |
| NFT discovery (which tokens does this identity own?) | ⏭ roadmap | needs an `NftSource` seam (§4.3) |
| Metadata + media (collection, tokenId, image) | ⏭ roadmap | §4.3 |
| Floor / last-sale valuation | ⏭ roadmap | §4.4 |
| Spam / malicious-airdrop handling | ⏭ roadmap; **rule stands today** | Ch10 §NFT Protection (§4.5) |

---

### 4.2 The valuation caveat — why an NFT is not a balance

For a fungible asset the value equation is total: `amount (bigint) × price ÷ 10^decimals`, computed in
integer micro-USD exactly as [`packages/portfolio/src/money.ts`](../../packages/portfolio/src/money.ts)'s
`assetValueMicros` does it. Both inputs are facts — an on-chain balance and a market-clearing price —
so the output is a fact. **None of that holds for an NFT:**

- **The floor is an ask, not a fill.** It is the cheapest thing currently *offered*, which no one is
  obliged to buy. In a thin collection one listing moves it; in a dead collection the "floor" is a
  ghost quote against zero demand.
- **The floor is collection-wide; the token is specific.** Trait rarity means a single token can be
  worth a large multiple of, or a small fraction of, its collection floor. Applying the floor to *your*
  token is already an approximation before liquidity even enters.
- **Reported activity can be manufactured.** Wash trading inflates last-sale prices between an owner's
  own wallets. A "last sale" is not automatically a fair value.
- **A missing quote is not a zero, and a real zero is not a failure.** An indexer outage must never
  render as $0 (Doctrine #3), and a collection with genuinely no market *is* honestly worth ~$0 — but
  only when we can positively say so, with a reason. These two must never be conflated.

From this, the doctrine of the section — stated once, never relaxed:

> **NFT value is estimated, labelled, and quarantined from the headline.** Every NFT value the product
> displays is tagged an **estimate**, shows its **basis** (floor / last-sale) and **as-of** time, and
> is **excluded from the §3 net-worth figure**. Collectibles are presented in a separate band labelled
> *estimated* — a user can see "~$X in collectibles (estimated, floor-based)" and know, at a glance,
> that it is a different kind of number from their cash-equivalent net worth. Money stays `bigint`
> micro-USD end-to-end (Doctrine #4); an unpriceable NFT **fails closed** to *unpriced*, never to a
> confident dollar (Doctrine #5).

---

### 4.3 Discovery & metadata — the roadmap design ⏭

Discovery follows the exact pattern the rest of the engine already uses for its data: a **pure core
behind an injected source interface**, so the intelligence stays offline-testable and the network lives
at the edge. `@intent-wallet/portfolio` injects `BalanceSource`/`PriceSource`
([`source.ts`](../../packages/portfolio/src/source.ts)); `@intent-wallet/intelligence` injects
`PositionSource`/`AssetCatalog` ([`sources.ts`](../../packages/intelligence/src/sources.ts)). NFT
discovery adds one more seam in the same shape:

```ts
// roadmap — the seam, not yet implemented
export interface NftSource {
  /** Every non-fungible an identity's addresses hold, across chains. */
  getNfts(identityId: string): Promise<DiscoveredNft[]>;
}

export interface DiscoveredNft {
  chainId: string;
  standard: 'erc721' | 'erc1155' | 'metaplex'; // EVM 721/1155; Solana Metaplex
  contract: string;      // collection contract / mint authority
  tokenId: string;       // string: token ids exceed Number range
  balance: bigint;       // 1 for 721; N for 1155 editions
  collection?: { name: string; verified: boolean };
  name?: string;
  media?: MediaRef;      // pointer, NOT fetched content (see below)
  stale?: boolean;       // source flagged this read as stale — surfaces as §4.4 state 4
}
```

The concrete `NftSource` will be backed by an ownership indexer (a Reservoir/Alchemy-class service for
EVM, Helius/Metaplex DAS for Solana), obtained the same way chain access is: through injection, never
constructed by business logic (the dependency-injection rule of `AdapterRegistry`,
[`adapter-registry.ts`](../../packages/chains/src/adapter-registry.ts)). Two non-negotiables shape it:

- **Indexer output is data, not truth.** A collection name, a "verified" flag, or an image URL from an
  indexer is an *unverified claim* until §2's classification and Ch10's checks pass judgement on it.
  Discovery populates; it does not bless.
- **Media is a pointer, never an inline auto-load.** `MediaRef` carries a URI and a declared type — it
  is **not** fetched on a portfolio screen. A media URL in an airdropped NFT is a plausible tracking
  beacon or malicious payload, so media is resolved lazily, through a sandboxed/proxied fetch,
  size- and content-type-capped, and never executed. Content-addressed media (IPFS/Arweave) is
  preferred and can be integrity-checked; arbitrary HTTP media is treated as hostile-by-default. This
  is a privacy rule (Doctrine, Ch10) as much as a security one.

---

### 4.4 The four-state model for a non-fungible

The four-state honesty that governs every value in this chapter (real / genuine-zero / partial /
source-fail — §3, Ch6 §8 Balance Engine) applies to NFTs with one twist: **state 1 is not "real
value," it is "estimated value."** There is no fourth state that produces a fact. The model:

| # | State | NFT meaning | What the user sees |
|---|---|---|---|
| 1 | **Estimated value** | A floor or last-sale reference resolved | `~$X` with an **estimate** tag, basis (floor/last-sale), as-of time, and a confidence pill |
| 2 | **Genuine-zero** | Positively no market / no floor exists | `$0` **with a reason** ("no floor price"), shown, not hidden |
| 3 | **Partial** | Ownership + metadata resolved, price unknown *or* media unresolved | The item is listed; value shows `unpriced` (never `$0`); media shows a placeholder |
| 4 | **Source-fail** | Indexer/price feed errored or stale | `—` in the collectibles band ("couldn't load collectibles"); **net worth is unaffected** |

The valuation the engine attaches is explicitly an estimate, in `bigint` micro-USD, carrying its own
provenance:

```ts
// roadmap
export interface NftValuation {
  basis: 'floor' | 'lastSale' | 'none';
  estMicros: bigint;                    // µUSD; 0 iff basis === 'none'
  confidence: 'low' | 'medium' | 'unpriced';
  asOf: string;                         // ISO-8601 of the reference quote
  stale: boolean;
}
```

Three rules make this honest rather than decorative. **First, `basis: 'none'` ⇒ `estMicros: 0n` and
`confidence: 'unpriced'`** — state 2 and state 3 both refuse to invent a number, and the UI
distinguishes "no market → $0 with reason" from "price unknown → unpriced." **Second, confidence is
never `'high'`** — an NFT estimate tops out at `'medium'` by construction, because we will not offer a
confidence we cannot earn. **Third, a source failure sets `stale`/surfaces state 4 and leaves the
headline net worth untouched** — the collectibles band degrades on its own, exactly as a failed chain
read becomes `—` and not `$0` in `balances.ts` today.

---

### 4.5 Spam & malicious NFTs — the rule stands even before the feature ships

The dominant NFT threat is not a mispriced blue-chip; it is the **airdropped scam**. Anyone can send
any wallet an NFT for free, and attackers do it at scale: a token whose name or image is a phishing
lure ("You've won — claim at evil.site"), or whose contract is engineered so that *interacting* with it
— approving, listing, "claiming" — routes into a drainer. An NFT gallery that renders every airdrop
faithfully is an attack surface with a paintbrush.

The governing rule is already written in [Chapter 10 §NFT Protection](../bible/chapter-10-security-trust-engine.md):
*scan for malicious NFTs, suspicious metadata, and fake collections, and never recommend interacting
with an unknown NFT without an explanation.* Composed with §2 (Token Classification & Spam), the NFT
intelligence engine will therefore:

- **Hide unknown/unverified NFTs by default** into a quarantine band, separate from recognized
  collections — the same spam-folder posture §2 gives fungible tokens. They are discoverable, never
  in the user's face.
- **Never auto-load their media** (§4.3) and **never auto-interact** — no auto-approve, no
  auto-list/sell, no "tap to claim." The wallet's non-custodial posture (Doctrine #1/#2) means it
  proposes and the user's device disposes; a spam NFT gets *no* automated action, ever.
- **Contribute exactly `$0`** to any value, estimated or otherwise. A quarantined NFT is excluded from
  the collectibles band's estimate — spam cannot inflate a portfolio, and a "valuable"-looking scam
  cannot lure a user by appearing to add net worth.
- **Fail closed on ambiguity.** An NFT the classifier cannot positively vouch for is treated as
  untrusted, not as safe-until-proven-bad (Doctrine #5). Ch10 owns the verdict; this section consumes
  it and renders the honest, cautious default.

---

### 4.6 How a valued NFT flows through the rest of the engine

Because the type slot already exists (§4.1), a discovered-and-valued NFT needs no new plumbing to
participate in analytics — only the discipline of §4.2 to keep it labelled. A fed position looks like:

```ts
// a discovered, valued, non-spam NFT as an intelligence Position
{
  kind: 'nft', assetClass: 'nft', liquidity: 'illiquid',
  chainId, symbol: collectionName, amount: 1n, decimals: 0,
  valueMicros: valuation.estMicros,   // the LABELLED estimate, 0 if unpriced/spam
  stale: valuation.stale,
}
```

Run through [`normalize`](../../packages/intelligence/src/positions.ts) it contributes its estimate
to **gross assets** but nothing to the **liquid buffer**, so §7's liquidity and diversification health
read an NFT-heavy identity as illiquid and concentrated — honestly. Cross-chain aggregation (§6) folds
collectibles across BTC-adjacent, EVM, and Solana identities under the one universal identity of Ch5.
The AI insight layer (§8) may *narrate* NFT exposure ("~18% of gross assets is in illiquid
collectibles, floor-estimated"), but only ever by citing the estimate **and its confidence** through
the narrator's verification boundary (Ch9) — an insight can quote an NFT figure, never mint one, and
never present it as liquid net worth. The moment an NFT value would touch the headline number in §3,
the §4.2 quarantine rule stops it: collectibles are their own labelled band, adjacent to net worth,
never inside it.

---

### 4.7 Honest status & definition of done

| Piece | State |
|---|---|
| NFT position type + illiquid classification | ✅ shipped (`types.ts`, `positions.ts`) |
| Correct risk/health treatment once fed | ✅ shipped (`risk.ts` via `normalize`) |
| Discovery (`NftSource`) + metadata | ⏭ roadmap (§4.3) |
| Sandboxed/lazy media resolution | ⏭ roadmap (§4.3) |
| Floor / last-sale estimate (`NftValuation`) | ⏭ roadmap (§4.4) |
| Four-state, estimate-labelled valuation | ⏭ roadmap (§4.4) |
| Spam quarantine + no-auto-interact | ⏭ roadmap; **Ch10 rule binds today** (§4.5) |

**Definition of done — NFT intelligence ships when:**

- an NFT is discovered and shown with its collection, tokenId, and (lazily, safely) its media — and a
  network failure to load any of it reads as `—`, never as absence or as `$0`;
- every NFT value is a `bigint`-micro-USD **estimate** carrying a visible basis, as-of time, and
  confidence — with `'high'` confidence structurally impossible and `basis: 'none' ⇒ $0 with a reason`;
- collectibles occupy a **separately-labelled estimated band** and never move the §3 headline net-worth
  figure by a single micro-dollar;
- unknown/airdropped NFTs are quarantined, media-suppressed, valued at `$0`, and **never** auto-interacted
  with, per Ch10 §NFT Protection;
- an NFT-heavy portfolio is scored *illiquid and concentrated* by the existing risk engine, with no
  special-casing — the truth falls out of the honest classification.

The one line to remember: **the engine has reserved the seat; the product does not yet seat the guest —
and when it does, the guest wears an "estimate" badge and is never mistaken for cash.**


## §5 · Yield & DeFi Position Tracking

> **Status legend** (per [`SECURITY.md §0`](../../SECURITY.md)): ✅ Shipped — implemented **and** tested in-repo, file cited · 🔶 Partial — one surface/seam exists, gaps named · ⏭ Roadmap — a binding requirement with a landing phase, **not** a claim that it runs. As Principal Blockchain Architect I sign only what is true; a position we cannot yet *discover* is not a position we get to *show* (Doctrine #3). This section is **mostly ⏭/🔶 by design** — and it says so, loudly, in every paragraph.

A balance answers "what tokens sit in my wallet?" A **position** answers a harder question: "what do I *own* that isn't sitting in my wallet at all?" The ETH you staked into Lido is no longer an ETH balance — it left your address and became a claim on a protocol. The USDC you supplied to Aave is now a lending position earning interest, plus a `transferFrom`-able aToken. The wETH/USDC you deposited into a Uniswap v3 range is two assets fused into one NFT whose value depends on a price you are not looking at. The 3% you borrowed against your collateral is a **negative** number that a naïve balance reader will never see, and whose omission makes every "net worth" figure a lie by overstatement.

Everything §1–§3 built — discovery, classification, valuation — reads the **wallet surface**: native and token balances at an address. This section owns the layer *beneath* that surface: **protocol positions as a first-class asset class.** It is the single largest honesty gap in the chapter, and the discipline here is to be scrupulous about it. The analytical **engine** that reasons over positions is real and tested; the **discovery** that would feed it live on-chain positions is not shipped. "The engine exists" is not "the product tracks your DeFi." We will keep those two sentences apart on every line.

---

### 5.1 A position is not a balance — the asset class we must model

A wallet balance is a scalar: `(chain, asset, amount)`. A DeFi position is a *structured claim* with properties a balance never has — a protocol it lives inside, a sign (asset or liability), a liquidity that is not "freely movable," underlying legs, a claimable reward stream, and a bridge or contract it is trapped behind. The wallet must treat these as their own class, sitting **beside** the spot balances of §1–§3, never conflated with them.

The taxonomy we commit to — every one of these already has a discriminant in the shipped `PositionKind` union ([`packages/intelligence/src/types.ts:31`](../../packages/intelligence/src/types.ts)):

| Position kind | What it is | Sign | Liquidity (default) | The trap a balance reader falls into |
|---|---|---|---|---|
| `staking` | native/LST staked (Lido, Jito, Marinade, native SOL/ETH) | asset (+) | `locked` | staked ETH left your address — invisible as a balance |
| `lending` | supplied to a money market (Aave, Compound) | asset (+) | `locked` | the aToken/cToken looks like spam to §2 |
| `borrowing` | debt drawn against collateral | **liability (−)** | `liquid` | **omitting it overstates net worth** |
| `lp` | AMM liquidity share (Uni v3 range, Curve) | asset (+) | `locked` | value is two fused legs, not one token |
| `yield` | vault / farm / auto-compounder | asset (+) | `locked` | the share token is unpriced by a spot feed |
| `reward` | pending, claimable emissions | asset (+) | `liquid` | not in any balance until claimed |
| `token` / `nft` | plain wallet spot (§1–§3 / §4) | asset (+) | `liquid` / `illiquid` | — |

Two properties in that table are the whole reason positions cannot be bolted onto the balance path:

- **Debt has a sign, and getting it wrong is a value-integrity bug, not a display bug.** The normalizer computes net worth as `grossAssets − debt`; a `borrowing` position's `valueMicros` is stored as a **positive magnitude** and *subtracted* — `signedValueMicros: isDebt ? -value : value` ([`positions.ts:106`](../../packages/intelligence/src/positions.ts)), with `debtMicros` accumulated separately and `netWorthMicros = grossAssetsMicros − debtMicros` ([`positions.ts:114`](../../packages/intelligence/src/positions.ts)). A wallet that lists your Aave supply but silently drops your Aave borrow shows you richer than you are — the exact "never lie to the user" failure Doctrine #3 forbids.
- **Liquidity is not binary.** A staked or LP'd asset is `locked` — real, but not spendable this block; an NFT floor is `illiquid`; only spot and claimable rewards are `liquid`. `defaultLiquidity` ([`positions.ts:70`](../../packages/intelligence/src/positions.ts)) maps `staking/lending/lp/yield → locked` precisely so the risk layer (§5.5) can tell "I have $50k" from "I have $50k I can't touch without unwinding three protocols."

This model is **shipped and tested** in `packages/intelligence`. `Position` carries `protocol`, `costBasisMicros`, `liquidity`, `legs` (underlying assets for LP/vault re-pricing), `bridge`, `lastActivityAt`, and a `stale` flag ([`types.ts:49`](../../packages/intelligence/src/types.ts)); `NormalizedPosition` adds the signed value and the gross-asset weight ([`types.ts:78`](../../packages/intelligence/src/types.ts)). The vocabulary to describe your entire DeFi footprint honestly already compiles. What it lacks is a mouth to be fed.

---

### 5.2 Discovery — the protocol-adapter gap (⏭ roadmap)

Here is the hard, honest truth of this section. **Nothing in the shipping product discovers a DeFi position on-chain.** The balance path reads exactly two things: the native balance and enumerated token balances — `getNativeBalance` / `getTokenBalances` on the `BlockchainAdapter` ([`packages/chains/src/adapter.ts:69`](../../packages/chains/src/adapter.ts)), and in the browser wallet, native balances only ([`apps/web/src/balances.ts`](../../apps/web/src/balances.ts)). Neither knows what Aave *is*. A supplied-to-Aave position surfaces, if at all, as an aToken balance the classifier (§2) will most likely tag `unknown` or filter as noise — it will **not** be understood as "3.2 ETH lent at 2.1% APR, withdrawable."

Why the balance path structurally cannot find positions: a position's value does not live at your address as a fungible amount you can `balanceOf`. It lives in the *protocol's* accounting — `getUserAccountData(user)` on Aave, `positions(tokenId)` on the Uniswap v3 `NonfungiblePositionManager`, a validator's stake account on Solana. Reading it requires **per-protocol knowledge**: which contract, which method, how to convert a share token to underlying, how to price an LP NFT from its ticks. That knowledge is a **protocol adapter**, and we do not ship one.

What *does* exist is the **seam**, deliberately cut so the adapter can plug in without touching the engine. `PositionSource.getPositions(identityId)` is defined today ([`packages/intelligence/src/sources.ts:11`](../../packages/intelligence/src/sources.ts)) — its doc comment already names the target: *"Every position for an identity across chains/protocols (wallet, LP, staking, lending, …)."* The engine's whole pipeline is a pure function of the `Position[]` this source returns ([`engine.ts:79`](../../packages/intelligence/src/engine.ts)). So the roadmap is not a rewrite; it is *filling an interface*.

The adapter model we will build to is the same "OS ↔ printer-driver" abstraction that lets the chain layer add a chain without touching callers (Ch6 §7, the `BlockchainAdapter` contract). A `ProtocolAdapter` is its DeFi analogue:

```
interface ProtocolAdapter {                         // ⏭ roadmap — the shape, not shipped code
  readonly protocol: string;                        // 'aave-v3', 'uniswap-v3', 'lido', 'marinade'
  readonly ecosystem: Ecosystem;                    // reuse @intent-wallet/chains
  discover(address: string): Promise<Position[]>;   // read protocol accounting → typed positions
}
```

Each adapter reads one protocol's on-chain state for an address and emits already-typed `Position`s (kind, protocol, legs, sign). A `ProtocolAdapterRegistry` — mirroring the shipped `AdapterRegistry` gateway ([`packages/chains/src/adapter-registry.ts`](../../packages/chains/src/adapter-registry.ts)) — fans out across the registered protocols per chain, and the union of results *is* the `PositionSource`. This is the exact aggregation pattern Zerion, Zapper, and DeBank are built on: a library of per-protocol readers behind one query. We are honest that they ship hundreds of these adapters and we ship **zero** today; the difference between us and them on this axis is not architecture, it is coverage — and coverage is the roadmap.

**One adjacent thing is real, and I will not let it be mistaken for position tracking.** The wallet can *initiate* a stake: `stake` is a first-class capability ([`packages/capabilities/src/types.ts:19`](../../packages/capabilities/src/types.ts)), a plan-step kind ([`types.ts:50`](../../packages/capabilities/src/types.ts)), and an intent ([`packages/intents/src/schema.ts:50`](../../packages/intents/src/schema.ts)). The swap/bridge **route integrations** ([`packages/providers`, `packages/router`](../../packages/providers/src/route.ts)) are the closest thing to protocol integrations we have — and they are themselves **partial** (aggregation seams over injected quotes; no DEX or bridge hardcoded). But every one of those is **execution-side** — getting *into* a position. Reading the position *back* — the `discover` half — has no shipped adapter. We can help you stake; we cannot yet show you the stake. That asymmetry is the honest state of §5.

---

### 5.3 Valuation — the four-state model, plus the estimate a mark demands

When positions *are* discovered, they must be valued under the same honesty contract as every other number in this chapter (§3, and the four-state balance engine of Ch6 §8). A value shown is **computed by deterministic code from a real read**, never invented, and every failure mode is a distinct, labelled state — not a silent `$0`:

| State | Meaning for a position | What the user sees | Never |
|---|---|---|---|
| **Real value** | protocol read + price both succeeded | `$4,210` supplied, `−$1,090` borrowed | — |
| **Genuine zero** | position closed / fully withdrawn | "No open positions" | hidden behind a spinner |
| **Partial** | position read, price missing/stale | amount + `unpriced` / `stale` chip | a fabricated USD figure |
| **Network-fail ≠ $0** | protocol read failed | "—" / "couldn't reach Aave" | **counted as `$0`** |

The engine already carries the machinery for the last two: an unpriced position values to `valueMicros = 0` only as a *magnitude*, and a `stale` flag propagates from any contributing read up through the whole analysis ([`positions.ts:97`](../../packages/intelligence/src/positions.ts) → `PortfolioIntelligence.stale`), exactly as the spot aggregator flags staleness ([`packages/portfolio/src/aggregate.ts:49`](../../packages/portfolio/src/aggregate.ts)). A protocol-read failure must map to **network-fail, not zero** — dropping an unreachable Aave position to `$0` would silently *inflate* health (less apparent debt) or *deflate* net worth (less apparent asset) depending on its sign, and either is the "network failure is not `$0`" violation this whole engine exists to prevent.

Positions add a **fifth honesty state that spot balances never need: the estimate.** An LP or vault position has no single on-chain price. Its value is a **model output** — the constant-value AMM mark, `Πlegs (legMultiplier)^(legWeight)`, that the scenario engine already implements ([`scenario.ts:61`](../../packages/intelligence/src/scenario.ts)). A 50/50 pool whose value we *derive* from its two legs is not the same epistemic object as an ETH balance we *read*; presenting a derived mark with the same confidence as a direct read would be a subtler lie. So an LP/vault value carries an **`estimate` label** and its `PositionLeg[]` breakdown ([`types.ts:44`](../../packages/intelligence/src/types.ts)) is one tap away — "this $8,400 is a mark from 2.1 ETH + $4,100 USDC, not a quote." Claimable `reward` positions get the same treatment: an unclaimed emission is an *estimate at current price*, labelled as such, never booked as settled value. Money stays `bigint` µUSD end-to-end through all of this (Doctrine #4); the label lives in the presentation layer, the integer in the core.

---

### 5.4 The risk surface positions add (see Ch10)

Positions do not just add value to the picture — they add **exposure the balance view is blind to**, and surfacing that exposure is the point of tracking them at all. The intelligence engine's risk layer already turns positions into the metrics the security posture (Ch10) needs; discovery is what would make these metrics reflect a user's *real* DeFi rather than a supplied fixture:

- **Leverage.** `leverage = debt ÷ grossAssets` ([`risk.ts:122`](../../packages/intelligence/src/risk.ts)), scored into the health factor `leverageSafety` and flagged by the `HIGH_LEVERAGE` insight when it crosses policy ([`insights.ts:181`](../../packages/intelligence/src/insights.ts)) — *"a market drop could trigger liquidations."* This number is *only* meaningful if `borrowing` positions are discovered; without §5.2, leverage reads a false `0`.
- **Liquidity risk.** The `liquid / locked / illiquid` split ([`risk.ts:118`](../../packages/intelligence/src/risk.ts)) tells a user how much of their net worth is trapped in protocols and can't be reached in a hurry — the difference between "solvent" and "solvent but frozen."
- **Protocol concentration.** `PROTOCOL_CONCENTRATION` ([`insights.ts:149`](../../packages/intelligence/src/insights.ts)) fires when too much value sits in one protocol — *"a protocol exploit would be an outsized hit."* Aggregation across protocols is what makes "you have 60% in one lending market" sayable.
- **Bridge-trapped value.** A position's `bridge` field feeds `bridgeExposure` ([`risk.ts:124`](../../packages/intelligence/src/risk.ts)) and the `bridgeUnavailable` scenario, which sums the value that becomes illiquid if a bridge fails ([`scenario.ts:153`](../../packages/intelligence/src/scenario.ts)) — the most-exploited layer in crypto, made visible.
- **Impermanent loss, honestly modelled.** The `priceShock` scenario re-prices LP positions by the constant-value AMM rule rather than a naïve linear mark, so a "BTC −20%" what-if captures the IL an LP would actually suffer ([`scenario.ts:61,108`](../../packages/intelligence/src/scenario.ts)) — an exposure a spot view cannot even represent.
- **Idle-capital and yield nudges.** `STABLE_IMBALANCE_IDLE` ([`insights.ts:220`](../../packages/intelligence/src/insights.ts)) and `YIELD_OPPORTUNITY` ([`insights.ts:276`](../../packages/intelligence/src/insights.ts)) are *propose-only* (Ch9): they surface, they never auto-deploy. Consistent with the AI-narrator boundary, no yield suggestion becomes an action without an on-device signature.

Every one of these is **shipped engine math, tested** — and every one is only as truthful as its input positions. That is the recurring theme: the reasoning is done; the sensing is not.

---

### 5.5 Honest status & the roadmap (⏭)

| Capability | State | Evidence / landing |
|---|---|---|
| Position **model** (kinds, signed debt, legs, liquidity) | ✅ shipped | `intelligence/src/types.ts:31,49`; `positions.ts` |
| Position **analytics** (leverage, liquidity split, IL, bridge, insights) | ✅ shipped | `risk.ts`, `scenario.ts`, `insights.ts` (tested) |
| `PositionSource` **seam** | ✅ interface only | `intelligence/src/sources.ts:11` — awaits an implementation |
| Staking as an **execution action** | 🔶 partial | `capabilities/types.ts:19`, `intents/schema.ts:50` — *initiate*, not *read back* |
| Swap/bridge **route** integrations | 🔶 partial | `packages/providers`, `packages/router` — aggregation seams, execution-side |
| **Protocol adapters** (`discover`) for staking/lending/LP/vault | ⏭ roadmap | none shipped — the core gap |
| Live **DeFi position tracking** end-to-end | ⏭ roadmap | requires the adapters above + §5.3 valuation wiring |

The roadmap, in dependency order — each a binding requirement, none a running feature:

1. **`ProtocolAdapter` interface + registry** — the DeFi analogue of the shipped `AdapterRegistry`, fanning per-protocol readers behind the `PositionSource` seam (§5.2).
2. **The first three adapters** — a staking reader (Lido/native-ETH, Marinade/Jito on Solana), a lending reader (Aave v3), an AMM-LP reader (Uniswap v3 `positions(tokenId)` + tick→value), because those three cover the bulk of most users' non-spot value.
3. **Valuation wiring** — LP/vault marks surfaced with the **`estimate` label** and leg breakdown (§5.3); protocol-read failures mapped to **network-fail, never `$0`**.
4. **Reward accrual** — pending emissions as labelled, at-current-price estimates, distinct from settled value.
5. **Read-back of positions the wallet itself opened** — close the loop so a stake we *executed* (§5.2) becomes a position we *track*.

Benchmarks we measure against — and do not pretend to match yet — are Zerion / Zapper / DeBank for breadth of position adapters and Rotki for cost-basis rigour on the way to §9's tax categorization. Their moat on this axis is a large, maintained library of protocol readers; ours today is one clean seam and a tested engine behind it. That is a genuine head start on the *hard* part (correct signed valuation, IL modelling, liquidity-aware risk) and an honest deficit on the *broad* part (coverage).

The rule that governs this section is the rule that governs the chapter: **a position we cannot yet discover on-chain is not a position we get to display.** Until a protocol adapter reads it, it does not appear — no placeholder, no borrowed number, no fabricated APR. The engine that will reason over your staked ETH, your Aave loan, and your Uniswap range is built and tested and waiting. The adapters that would feed it are labelled roadmap, above, and nowhere in this wallet does an undiscovered position quietly become a confident dollar figure. That restraint is not the weakness of §5 — against a product category that routinely shows users phantom yield and mis-signed net worth, it *is* the feature.


## §6 · Cross-Chain Asset Aggregation

> **This section is the spine of Chapter 11's promise:** *one identity, one view, many chains.* Everything
> the other sections produce — the assets §1 discovers, the spam §2 strips, the live valuation §3 computes,
> the NFT (§4) and DeFi (§5) positions we will one day fold in, the analytics §7 charts, the insights §8
> narrates, the tax lots §9 categorizes — is only ever *worth* something once it has been **aggregated into
> a single, honest financial picture that hides the chains without hiding the truth.** This section is the
> engine that does the folding: how per-chain reads from the three-address identity (Ch5) compose into one
> `UnifiedPortfolio`, how a partial read on one chain degrades gracefully instead of poisoning the whole,
> and how "assets, not chains" (Ch1) is presented without ever throwing away the per-chain provenance a
> power user needs one tap deep.
>
> **Status legend (carried from the security/spec convention):** ✅ **Shipped** — implemented *and tested*
> in-repo, cited by file. 🔶 **Partial** — real on one surface/env, gaps named. ⏭ **Roadmap** — a binding
> requirement with a landing phase, *not* a claim it runs today. Per Doctrine #3, a spec that claims coverage
> it does not have is itself a lie; every capability below carries its **real** state.

---

### 6.1 · The thesis — chains are an implementation detail; a person's net worth is not

A user has one financial life. They do not think "I have 0.4 ETH on Arbitrum, 0.1 ETH on Base, and 0.6 ETH on
mainnet" — they think *"I have about 1.1 ETH."* Every incumbent aggregator (Zerion, Zapper, DeBank) understood
this and built the same headline: one net-worth number, one asset list, chains collapsed. We hold ourselves
to that bar for the *view* and to a higher bar for the *honesty*, and the two are in tension exactly where it
matters most — the moment a chain is unreachable or a token is unpriced. That is the moment a lesser
aggregator quietly renders `$0`, and the moment our whole promise — *"never be lied to"* — is won or lost.

So this section's job is narrow and load-bearing: take the honest, per-chain reads produced upstream and
**merge them into one picture without inventing a single number.** The merge is pure, deterministic, and
integer-exact; the honesty is a four-state contract carried on every value the merge emits; and the "one
number" is only ever shown as complete when it *is* complete. The one structural advantage we have over the
incumbents is architectural, not cosmetic: their aggregation is a **server** that must be handed your
addresses; ours is a **pure core** ([`packages/portfolio`](../../packages/portfolio)) fed by sources that
read from the *device's own* three addresses ([ADR-0030](../adr/0030-universal-identity-and-portfolio-layering.md)).
The wallet aggregates your money without a server ever needing to know it is yours.

---

### 6.2 · The input — three addresses, many chains (Ch5)

Aggregation begins with the **three-address identity** (Ch5): one `btc` address, one `evm` address, one `sol`
address, derived on-device and carried on `UniversalIdentity.addresses`
([`packages/identity/src/identity.ts`](../../packages/identity/src/identity.ts)). That triple is the entire
surface the balance readers scan — and the second address in it is the quiet superpower of the whole model.

**The universal-EVM-address advantage.** ✅ One EVM address is *the same address on every EVM chain.* The
identity model states this literally: the `evm` receive-address's `worksOn` field reads
`"Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain"` — six networks, one address, one derivation path.
The [chain registry](../../packages/chains/src/registry.ts) enumerates all six as first-class `ChainId`s
(`ethereum`, `arbitrum`, `base`, `optimism`, `polygon`, `bnb`), and the
[`AdapterRegistry`](../../packages/chains/src/adapter-registry.ts) will hand back a wired
`BlockchainAdapter` for any of them. So discovering an EVM user's holdings across six chains is a **fan-out
over one address**: ask the registry for each chain's adapter, call `getNativeBalance(evmAddress)` and
`getTokenBalances(evmAddress, …)`, and every read keys off the *identical* string. Bitcoin and Solana each
contribute their one address to the same fan-out. This is why the aggregation problem is tractable at all:
we are not reconciling dozens of addresses, we are reading three addresses across a registry of chains.

**What reads today.** ✅ The web edge ([`apps/web/src/balances.ts`](../../apps/web/src/balances.ts)) drives
the real, live version of this fan-out for **native assets**: it reads ETH on `ethereum` + `sepolia` from
`me.evm.address`, SOL on `solana` + `solana-devnet` from `me.sol.address`, and BTC on `bitcoin` +
`bitcoin-testnet` from `me.btc.address` — all in one `Promise.all`, all straight from public/keyed RPCs in
the browser, no server, no demo data. 🔶 The *full* EVM fan-out — the same `evm.address` read across all six
L2s in one pass, plus ERC-20/SPL token balances folded in at this edge — is a wiring step, not a new
capability: the registry, the adapters, and `getTokenBalances` all exist and are tested; the web edge today
samples ETH-mainnet + Sepolia rather than sweeping every registered EVM chain. The engine supports the sweep;
the shipped edge demonstrates it on the canonical set. We do not claim a six-chain L2 sweep runs at the web
edge today — it does not yet.

---

### 6.3 · The aggregation model — merge in a common unit, keep the provenance

The pure core is [`aggregatePortfolio()`](../../packages/portfolio/src/aggregate.ts). It takes a flat list
of `PortfolioBalance` — *one asset on one chain*, the exact shape the chain adapters produce — and returns one
`UnifiedPortfolio`. Every step is deterministic and integer-exact; there is no clock, no randomness, no float.

```
  PortfolioBalance[]  (ETH·ethereum, ETH·arbitrum, ETH·base, USDC·base, SOL·solana, BTC·bitcoin, …)
        │
        │  1. GROUP by asset key            keyOf(b) = b.symbol.toUpperCase()   (registry override ⏭)
        ▼
  Map<key, PortfolioBalance[]>   { ETH → [·ethereum, ·arbitrum, ·base], USDC → [·base], SOL → […], … }
        │
        │  2. MERGE across chains, EXACT    decimals = max(group.decimals)
        │                                   amount   = Σ scaleAmount(b.amount, b.decimals, decimals)
        ▼
  UnifiedAsset  { symbol, amount, decimals, valueMicros, priceUsd|null,
        │          chains: ChainHolding[]  ←── per-chain provenance preserved
        │          isDust, stale }
        │  3. VALUE in µUSD                  valueMicros = amount × usdToMicros(price) / 10^decimals
        │  4. SPLIT dust / SORT by value desc
        ▼
  UnifiedPortfolio  { totalValueMicros, assets[], dust[], stale }
```

Four properties of this merge are worth stating precisely, because each is a guardrail:

- **Grouping is by asset, across chains.** ✅ The default key is the uppercased symbol, so ETH held on
  Ethereum, Arbitrum, and Base collapses into *one* `UnifiedAsset` — the "assets, not chains" headline (Ch1),
  realized in the data model rather than faked in the view. 🔶 The MVP key is the symbol, which cannot tell
  two distinct tokens that share a ticker apart; the function already exposes an `assetKey` override so a
  **canonical asset registry** (mapping `(chain, address) → asset id`) can plug in *without an API change*.
  That registry is the ⏭ landing point for §2's classification work — until it lands, symbol-collision is a
  named limitation, not a hidden one.
- **Summation is integer-exact.** ✅ Amounts arrive as `bigint` base units in each chain's own `decimals`.
  The merge normalizes every contribution *up* to the group's maximum decimals with
  [`scaleAmount`](../../packages/portfolio/src/money.ts) (which throws rather than ever scale *down* and
  lose precision) and sums with `bigint` addition. No float touches a balance, ever. This is Doctrine #4 made
  mechanical: money is integer bigint end-to-end, formatted for humans only at the very edge with `formatUsd`.
- **Valuation is integer µUSD.** ✅ Prices arrive as decimal *strings* ("2100.55") and are converted to
  integer micro-USD (1 USD = 1,000,000 µUSD) by `usdToMicros`; `assetValueMicros` computes
  `amount × priceMicros / 10^decimals` in exact `bigint` arithmetic. The headline `totalValueMicros` is a
  `bigint` sum of per-asset values. A dollar figure is never a float until the display edge.
- **Provenance survives the merge.** ✅ Collapsing ETH-across-three-chains into one row does **not** discard
  where it lives. Each `UnifiedAsset` carries `chains: ChainHolding[]`, and every holding keeps its
  `{ chainId, amount, tokenAddress }`. The headline is one asset; the truth of which chains it sits on is one
  field away (§6.6). Concentration analytics honor the same rule — [allocation.ts](../../packages/intelligence/src/allocation.ts)
  measures concentration at the *asset* level ("ETH held on 3 chains is one asset") while still offering a
  `byChain` view for the per-chain lens.

Defensive minima the core enforces: a negative balance is dropped (`amount < 0n` → skip — holdings are never
negative), and an aggregate that sums to exactly `0n` is dropped from the list (a genuinely-empty position is
genuinely nothing). Values strictly below the dust threshold (default $1) are separated into a `dust` bucket
so the headline list stays legible without deleting anything the user owns.

---

### 6.4 · The four-state model — a value is computed, never invented

This is the discipline that separates us from every incumbent. **Wherever a value appears, it is in exactly
one of four states, and the three non-happy states are never collapsed into `$0`.**

| State | What it means | How the engine encodes it | How the edge must render it |
|---|---|---|---|
| **Real value** | read succeeded, asset is priced | `amount > 0`, `priceUsd != null`, `valueMicros` computed | the number, e.g. `$3,150.82` |
| **Genuine zero** | read succeeded, balance is truly zero | aggregate `amount === 0n` → dropped; a live read of `0` is a real `0` | `0`, or omitted — an honest nothing |
| **Partial / unpriced** | read succeeded, but a price or a contributing input is missing/stale | `priceUsd: null` and/or `stale: true` on the asset; `stale` on the portfolio | `"—"` / *"unpriced"* — **never `$0`** |
| **Network failure** | the chain read itself failed | the source yields `null` for that leg (`nullable()` at the web edge); the total is `null` when no price is available | `"—"` for that chain/total — **never `$0`** |

The shipped proof of this contract lives at the web edge
([`apps/web/src/balances.ts`](../../apps/web/src/balances.ts)): ✅ every balance read is wrapped in
`nullable(p) = p.then(n => n, () => null)`, so a chain that throws becomes `null` (rendered `"—"`), *not* a
zero that silently drags the total down. The USD total is gated on `anyPrice` — `const totalUsd = anyPrice ?
… : null` — so if the price feed is entirely unavailable the net worth is honestly `null` ("we don't know
right now"), never a fabricated `$0`. Per-asset, a chain that failed and a chain that returned zero are
*different values* (`null` vs `0`) and are shown differently. A network failure is not `$0`; an unpriced
asset is not `$0`; a partial read is labelled, not hidden — the Doctrine #3 obligations, encoded.

**One honest seam, named on purpose.** In the pure core, an *unpriced-but-real* asset is pushed with
`valueMicros = 0n` and `priceUsd = null`, which means (a) it contributes `0` to `totalValueMicros`, and (b)
because its computed value is below the dust threshold it currently sorts into the `dust` bucket rather than
the headline list. That is a *ranking* artifact, not a lie — the asset is still present, and `priceUsd ===
null` is the unambiguous flag that its value is *unknown*. The contract on the consuming edge is therefore
explicit and binding: **`priceUsd === null` must render as "unpriced / value unknown," never as "≈ $0
dust," and a portfolio whose total omits a real-but-unpriced holding must carry a "partial valuation"
label.** The engine tells the truth (`null`, `stale`); the UI must not round that truth away. Closing the
ranking artifact — so an unpriced real holding is surfaced in the headline with an explicit "—" rather than
folded into dust — is tracked with the ⏭ price-coverage/canonical-registry work in §2/§3.

---

### 6.5 · Graceful degradation — one chain fails, the rest still tells the truth

The failure model is the whole reason the input is a *flat list of independent per-chain balances* rather than
a monolithic "give me everything" call. Each chain is read on its own leg, and each leg degrades on its own:

- ✅ **Independent legs.** At the web edge the reads run as one `Promise.all` of individually-`nullable`
  promises, so Bitcoin being unreachable cannot stop Ethereum and Solana from resolving. The user sees BTC as
  `"—"` and their ETH and SOL as real numbers — a *labelled-partial* picture, never a *fabricated-whole* one.
- ✅ **The aggregator sums what it is given.** `aggregatePortfolio` is pure over whatever `PortfolioBalance[]`
  it receives; a chain that failed simply contributes no rows, and a stale price flips the asset's and the
  portfolio's `stale` flag so the whole view can be marked "as of the last good read." The engine never
  back-fills a missing chain with a guess.
- ✅ **Failure vs emptiness is a source-boundary decision.** The critical distinction — "the chain returned
  an empty holding set" (genuine) versus "the chain read threw" (partial) — is made at the source boundary
  (`nullable()` at the edge; the `BalanceSource`/`PriceSource` seams in
  [`source.ts`](../../packages/portfolio/src/source.ts) in the composed path) and then carried forward as
  `null` / `stale`. Aggregation preserves that distinction; it is architecturally incapable of manufacturing
  a value the source didn't hand it.

The governing rule, stated once: **a partial read degrades to a partial view.** The chain that failed is
labelled failed, the assets we *could* read are shown with their real values, and the headline total is either
computed from complete data or flagged as partial — there is no fourth option where a hole becomes a `$0`.

---

### 6.6 · Presentation — "assets, not chains," with the chains one tap deep

The data model makes the Ch1 presentation nearly free. ✅ The headline is `UnifiedPortfolio.assets` — one row
per asset, sorted by `valueMicros` descending (ties broken by symbol for a stable order), dust folded into a
separate drawer. That is the "one asset list" a non-technical user reads. ✅ The per-chain truth is never more
than one interaction away: expanding any asset row reveals its `chains: ChainHolding[]` — *"1.1 ETH = 0.6 on
Ethereum + 0.4 on Arbitrum + 0.1 on Base"* — each holding with its own base-unit `amount` and (for tokens)
`tokenAddress`. For the power user who wants the chain-first lens instead, the intelligence layer's `byChain`
allocation slice ([allocation.ts](../../packages/intelligence/src/allocation.ts)) re-groups the same
positions by chain without a second read. The default is calm (assets); the detail is faithful (chains); the
user chooses the altitude.

**Benchmark, honestly.** Zerion, Zapper, and DeBank set the bar for *breadth* — thousands of tokens, deep
DeFi position decoding, NFT floors — and we do not claim to match that breadth today; that coverage is the
explicit scope of §2 (classification), §4 (NFT, ⏭), and §5 (DeFi/yield, 🔶). Where we intend to be *better*
than all of them is on the two axes this section owns: **non-custodial aggregation** (the merge is a pure core
fed from the device's own three addresses — ADR-0030 — not a server that must be handed your wallet), and
**never lying at the edges** (the four-state model of §6.4, versus the incumbent habit of rendering an
unreachable chain or an unpriced token as `$0`). We aggregate less than they do, and we lie less than they do,
and we are explicit about both.

---

### 6.7 · Shipped vs roadmap — the honest ledger for this section

| Capability | State | Where |
|---|---|---|
| Pure cross-chain merge (group→sum→value→split), integer-exact | ✅ Shipped | [`aggregate.ts`](../../packages/portfolio/src/aggregate.ts) |
| Per-chain provenance preserved through the merge (`ChainHolding[]`) | ✅ Shipped | [`types.ts`](../../packages/portfolio/src/types.ts) |
| Integer µUSD valuation, bigint end-to-end, format-at-edge only | ✅ Shipped | [`money.ts`](../../packages/portfolio/src/money.ts) |
| Four-state honesty at the live edge (`nullable`, `anyPrice`-gated total) | ✅ Shipped | [`balances.ts`](../../apps/web/src/balances.ts) |
| Three-address fan-out; one EVM address across six L2s (identity + registry) | ✅ Shipped | [identity](../../packages/identity/src/identity.ts) · [registry](../../packages/chains/src/registry.ts) |
| Injected `BalanceSource` / `PriceSource` seams for the composed path | ✅ Shipped | [`source.ts`](../../packages/portfolio/src/source.ts) |
| Full six-chain EVM sweep + token balances folded in *at the web edge* | 🔶 Partial | adapters/`getTokenBalances` tested; edge samples ETH+Sepolia |
| Canonical asset registry (`(chain,address)→id`) to end symbol-collision | ⏭ Roadmap | `assetKey` override seam already present |
| Unpriced-real assets surfaced in headline (not folded into dust) | ⏭ Roadmap | tied to price-coverage / §2–§3 |
| NFT / DeFi-yield positions in the aggregate; historical snapshots | ⏭ Roadmap | scope of §4 · §5 · §7 |

> **The litmus test for this section:** hand the aggregator a Bitcoin read that threw, an Arbitrum ETH balance
> that succeeded, and a freshly-listed token with no price. The honest engine returns: BTC absent and the view
> flagged partial; ETH merged into its cross-chain row with an exact `bigint` sum and a real µUSD value; the
> unpriced token present with `priceUsd: null`. What it must *never* return is a single confident number that
> quietly treats the missing chain and the missing price as zero. One identity, one view, many chains — and
> not one invented dollar among them.


## §7 · Portfolio Analytics & Historical Snapshots

The sections before this one build the wallet's answer to *"what do I own, right now?"* — §1 discovers the
holdings, §2 decides which are real, §3 marks them to one honest net-worth figure, §6 folds the three
address-worlds of Ch5 into a single number. This section asks the harder question users actually feel:
**"is that number good, and is it getting better?"** Those are two questions, and the wallet answers them
with two very different confidences.

The first — *is this portfolio well-shaped and how exposed is it* — is answered **today, in shipped code**,
and answered from a single snapshot: no clock, no stored history, no network. That is the analytics engine,
[`packages/intelligence`](../../packages/intelligence/src), and it is the spine of this section. The
second — *how has it changed over time* — needs something the wallet does **not** yet have: a recorded,
persisted series of past net worths. There is no long-term price-history store in the product. So the honest
posture of §7 is the same discipline §4 held for NFTs: **the engine reserves the seat; the product does not
yet seat the guest.** Where the code exists we cite it; historical snapshots we tag ⏭ **roadmap** and mean
it — and, most importantly, we **never draw a history we did not record.**

> **Benchmark.** Zerion, Zapper, and DeBank all render a portfolio-value curve — 24h / 7d / 30d / 1y — and a
> percentage change beside the headline; Rotki keeps a local, user-owned balance history and computes
> period returns and tax from it. Those curves are the feature users expect. We adopt the *honest* half:
> the deterministic, snapshot-pure analytics (allocation, concentration, PnL, risk/health) ship now; the
> **curve ships only once we are recording the points that draw it** — never sooner, never faked, and never
> reconstructed backwards from "we probably had roughly this."

---

### 7.1 What ships today — snapshot-pure analytics ✅

The analytics engine is a **pure function of one `PortfolioSnapshot`** plus injected classification/policy.
The facade [`PortfolioIntelligenceEngine.analyze`](../../packages/intelligence/src/engine.ts) runs a
fixed pipeline — *normalize → allocation → concentration → performance → risk/health → insights* — with **no
`Date.now()`, no `Math.random()`, no I/O** (Doctrine #7: deterministic cores, AI at the edges). The snapshot
carries its own `asOf` timestamp; the engine never reads the clock. Three families of number come out, and
each is computed, not asserted:

| Analytic | What it answers | Basis | Where |
|---|---|---|---|
| **Allocation** (5 axes) | where the money sits — by asset, sector, chain, protocol, liquidity | current positions only | [`allocation.ts`](../../packages/intelligence/src/allocation.ts) |
| **Concentration** | how spread vs. clumped — HHI, effective #positions, top-1 / top-3 weight | current asset weights | [`allocation.ts`](../../packages/intelligence/src/allocation.ts) · [`stats.ts`](../../packages/intelligence/src/stats.ts) |
| **Unrealized PnL** | am I up or down vs. cost | cost basis on held positions — **no history needed** | [`performance.ts`](../../packages/intelligence/src/performance.ts) |
| **Risk / Health score** | how exposed am I — a transparent [0,100] blend | diversification, leverage, liquidity, stable buffer, (+ history factors when present) | [`risk.ts`](../../packages/intelligence/src/risk.ts) |

Two properties make these trustworthy rather than decorative. **First, the money-vs-ratio discipline**
([`types.ts`](../../packages/intelligence/src/types.ts)): every *amount* is integer `bigint` micro-USD
(µUSD) — allocation slice values, PnL, cost basis — while every *dimensionless* quantity derived from money
(a weight, an HHI, a volatility, a score) is a `number`, because a ratio is not money and float rounding on a
ratio is a presentation concern, not a value-integrity one (Doctrine #4). **Second, the health score is never
a black box**: `computeRisk` returns each `HealthFactor` with its own sub-score, weight, and one-line
`detail` ("leverage 0.12 vs target 0.5"), so a health number is always explainable. When a history-only
factor (stability, drawdown-resilience) is absent, the remaining factors' weights are **re-normalized**
(`risk.ts`, `totalWeight`) so a missing series doesn't silently deflate the score — it just isn't counted.

The critical honesty point for this section is the **unrealized PnL / historical split**. Unrealized PnL is
computed from *cost basis on current positions* — it needs no time-series at all, and it is careful to sum
mark and cost **over the same set** (only positions whose `costBasisMicros` is known), so the numerator and
denominator always refer to the same holdings (`performance.ts`). That is why PnL can ship today: it is a
snapshot fact. Everything that requires *change over time* — time-weighted return, volatility, drawdown — is
a different animal, handled next.

---

### 7.2 The line drawn in code — history-derived metrics fail to `null`, never to `$0`

`computePerformance` is where "right now" ends and "over time" begins, and the boundary is enforced by the
code itself, not by a UI convention. It accepts an optional `history: NetWorthPoint[]` and `flows:
CashFlow[]`. With fewer than two points it takes the honest exit:

```ts
// performance.ts — the anti-fabrication guard, verbatim in shape
const hasHistory = history.length >= 2;
if (!hasHistory) {
  return {
    unrealizedPnlMicros, unrealizedPnlPct, costBasisMicros,   // snapshot truths still returned
    hasHistory: false,
    twr: null, growthMicros: null, growthPct: null,
    volatilityAnnual: null, maxDrawdown: null, currentDrawdown: null,
    series: [],
  };
}
```

Read what that does: with no recorded history the time-series metrics are **`null` — not `0`, not an
invented series.** `hasHistory: false` is a first-class flag the UI must branch on. This is the four-state
honesty of Ch6 §Balance Engine and §3 expressed for a *derived* number: a metric we cannot compute is
absent, and absence renders as "—" / "not enough history yet," never as a confident `0%` return or a flat
line at the current value. The engine's own header says it plainly — *"When no history is supplied we return
nulls and `hasHistory: false` rather than fabricating a series — the engine never invents financial data."*

When history *is* supplied, the math is real and flow-aware: period returns are **flow-adjusted**
(`rₜ = (Vₜ − flowₜ)/Vₜ₋₁ − 1`) so deposits and withdrawals are removed and the number measures the
**portfolio's** performance, not the user's contribution timing; TWR is the product of `(1+rₜ)`; volatility
is the period-return stdev annualized by `√ppy`; drawdown is the running-peak method from
[`stats.ts`](../../packages/intelligence/src/stats.ts). The engine is *correct and tested* for history —
**it is simply data-starved**, because nothing persists the points. That is the whole of the roadmap gap.

---

### 7.3 Historical snapshots — the roadmap, and the seat already reserved ⏭

Exactly as §4 found the NFT `AssetClass` slot already carved into the type system, the snapshot store already
exists as an **injected seam** — [`sources.ts`](../../packages/intelligence/src/sources.ts):

```ts
// sources.ts — SHIPPED as an interface; NO concrete implementation ships
export interface SnapshotStore {
  /** Historical net-worth series for performance/volatility/drawdown. */
  loadHistory(identityId: string): Promise<NetWorthPoint[]>;
  /** Append the latest net-worth point (called after an analysis). */
  appendPoint(identityId: string, point: NetWorthPoint): Promise<void>;
}

export interface NetWorthPoint { asOf: string; netWorthMicros: bigint; }  // types.ts
```

The shape is deliberate and it is the entire contract: `loadHistory` feeds `computePerformance`;
`appendPoint` is the periodic write that would, over time, *earn* a real curve. **What does not exist is any
class that implements `SnapshotStore`.** Grep the product and you find the interface exported from the
package index and consumed by tests — but the API's snapshot path
([`services/api/src/insights.ts`](../../services/api/src/insights.ts) → `snapshotFromHoldings` →
`analyzeSnapshot(snapshot)`) builds a snapshot **without `history`**, so every live `analyze` today runs the
`hasHistory: false` branch by construction. The product has never shown a user a portfolio curve, because it
has never stored the second point of one. That is the correct place to have started (§3's *one honest number*
before §7's *honest trend*), and it is why "the engine exists" must never be read as "the product ships it."

A snapshot store, when built, must satisfy four constraints that fall straight out of the Doctrine:

- **Periodic and bounded.** Append one `NetWorthPoint` per cadence (`periodsPerYear` names the interval:
  365 daily, 52 weekly, 12 monthly), not one per read. No unbounded write amplification; a retention window,
  not an infinite log.
- **Consented.** A stored history of a user's net worth over time is *sensitive*, and recording it is a
  choice the user makes, not a default we assume — surfaced through the consent posture Ch10/compliance owns.
- **Non-secret by construction.** A `NetWorthPoint` is `{ asOf, netWorthMicros }` — a timestamp and one
  integer dollar figure. It holds **no keys, no seed, no addresses, no per-position holdings**. It could sit
  in device-local storage or a consented, encrypted server row without ever touching Doctrine #1: there is no
  secret in it to leak. The store records *the number*, never *how the number is made*.
- **Integer and integrity-checked.** Points are µUSD `bigint`, appended, monotonic in `asOf`, and ideally
  device-recorded so the series is the user's own truth (the Rotki posture) rather than a vendor's
  reconstruction. A gap in the series is a gap — shown as one — not interpolated into a smooth lie.

---

### 7.4 The honesty rule — never draw a history you did not record

This is the load-bearing sentence of the section, and unlike §4's it is **already enforced in the shipping
product**, not merely designed:

> **A chart may only plot points the wallet actually recorded. A sparkline of real recent reads is honest; a
> long-term curve we did not measure is fabrication — and fabrication is forbidden even when it would look
> better (Doctrine #3).**

The product lives this rule today by *refusing the chart it cannot back*. The mobile Portfolio screen carries
the law in its own header — *"We have a current value but NO time-series, so we OMIT any trend/sparkline
rather than invent one"* ([`apps/mobile/ScreenPortfolio.tsx`](../../apps/mobile/ScreenPortfolio.tsx)) — and
it shows a big honest number with **no curve at all**, because it has no series to draw. The `Sparkline`
primitive that does exist ([`apps/mobile/ui.tsx`](../../apps/mobile/ui.tsx)) is guarded: fewer than two
points renders **nothing** (`if (data.length < 2) return …empty`). A sparkline is only ever drawn from a
genuine multi-point series (e.g. real recent activity), never from a single reading padded out to look like a
trend. The absence of a chart is not a missing feature — it is the honesty rule working.

The four-state model (§3, Ch6 §Balance Engine) governs a *series* the same way it governs a *value*, per
point and in aggregate:

| # | State of the series | Meaning | What the user sees |
|---|---|---|---|
| 1 | **Recorded** | ≥2 real points exist | the real curve/sparkline + TWR / volatility / drawdown from those points |
| 2 | **Genuinely flat** | multiple points, unchanged value | a flat line that is *true* — because we measured it flat |
| 3 | **Insufficient history** | 0–1 points recorded so far | **no curve**; `hasHistory:false` → "not enough history yet," never a fabricated line |
| 4 | **Load-fail / stale** | the store errored or a point is stale | "—" for the trend; the **current** net worth (§3) is unaffected — a broken history never zeroes the headline |

The forbidden move is treating state 3 as state 2: drawing a flat (or worse, a plausibly-wavy) line when we
simply have not recorded anything. `hasHistory:false` exists precisely so the UI can never make that mistake
by accident.

---

### 7.5 How analytics and history compose with the rest of the engine

Analytics are not an island; they are consumed downstream, and the shipped/roadmap split propagates cleanly.
The **risk/health score** already *conditionally* absorbs history: `computeRisk` adds a `stability` factor
only when `performance.volatilityAnnual !== null` and a `drawdownResilience` factor only when
`currentDrawdown !== null` (`risk.ts`), then re-normalizes — so the same identity scored today (weights-basis,
snapshot-only) and scored later (with a recorded series) both produce an honest number, the later one simply
richer. **Insights and alerts** (§8) may *narrate* a trend — but only by citing verified analytics through the
narrator's verification boundary (Ch9): `narrate` rejects any narrative whose `citations` don't reconcile with
the computed intelligence (`engine.ts`, `verifyNarrative`). An insight can therefore say *"your health score is
72, driven by 41% ETH concentration"* (snapshot facts) today, but it **cannot** say *"up 12% this month"*
until a `SnapshotStore` has recorded the month — because there is no verified `growthPct` to cite, only `null`,
and the boundary would reject the claim. The anti-fabrication guard that protects §3's net worth protects
§7's trend by the same mechanism.

Cross-chain aggregation (§6) matters here too: the `NetWorthPoint` a store would append is the **unified**
net worth across BTC + EVM + SOL under one Ch5 identity, keyed by `identityId` — one curve for the whole
person, not three per-chain curves the user must reconcile. That is the correct atomic unit to record, and
`SnapshotStore.appendPoint(identityId, …)` already encodes it.

---

### 7.6 Honest status & definition of done

| Piece | State |
|---|---|
| Allocation (asset/sector/chain/protocol/liquidity) + HHI concentration | ✅ shipped (`allocation.ts`, `stats.ts`) |
| Unrealized PnL from cost basis (snapshot-pure, no history) | ✅ shipped (`performance.ts`) |
| Risk / Portfolio-Health score — transparent, explainable factors | ✅ shipped (`risk.ts`) |
| Deterministic, clock-free, network-free `analyze` pipeline | ✅ shipped (`engine.ts`) |
| TWR / volatility / drawdown **math** (given history) | ✅ shipped, **data-starved** (`performance.ts`) |
| `hasHistory:false` → `null` metrics, never fabricated `$0`/flat line | ✅ shipped (`performance.ts`) |
| Product refuses to draw a trend it lacks (Portfolio omits sparkline) | ✅ shipped (`ScreenPortfolio.tsx`, `ui.tsx`) |
| `SnapshotStore` seam (`loadHistory` / `appendPoint`) | ✅ interface only — **no implementation** (`sources.ts`) |
| A persisted long-term net-worth history / portfolio-value curve | ⏭ roadmap (§7.3) |
| Consent + retention posture for a stored history | ⏭ roadmap (§7.3; Ch10 / compliance owns the verdict) |

**Definition of done — historical snapshots ship when:**

- a concrete `SnapshotStore` records one `NetWorthPoint` per cadence, **consented**, holding only
  `{ asOf, netWorthMicros }` — no keys, no addresses, no per-position holdings (Doctrine #1 untouched, because
  there is no secret in the row);
- `computePerformance` is fed that real series and the product renders TWR / volatility / drawdown **and** a
  curve drawn *only* from recorded points — with `hasHistory:false` still yielding "not enough history yet,"
  never a fabricated line;
- the four-state model holds on the series: insufficient history (state 3) never masquerades as a genuine flat
  line (state 2), and a store failure (state 4) shows "—" for the trend while leaving §3's current net worth
  intact;
- flows are captured so time-weighted return stays honest — a deposit lifts the balance but not the *return*;
- every narrated trend (§8) cites a *verified* `growthPct` / `twr` through the Ch9 boundary, so the AI can
  quote a change it can never mint one.

The one line to remember: **the analytics that describe your portfolio right now are shipped, deterministic,
and honest to the micro-dollar; the history that would describe its journey is a seat we have reserved and
will not fake to fill — a wallet that has not measured yesterday will tell you so, and draw nothing, rather
than draw a beautiful lie.**


## §8 · AI-Powered Asset Insights

> **This section is where Chapter 11 stops describing a portfolio and starts *understanding* one.** §1–§7
> answer *what you own* and *how much it is worth*; §8 answers the only question a person actually asks —
> ***so what?*** Is one asset too big a share of my life? Is my whole net worth sitting on one chain? Is
> capital rotting idle while it could earn? Am I quietly more exposed than I was last week? The engine that
> answers these is **shipped and tested** — [`packages/intelligence`](../../packages/intelligence) — and
> it obeys the two laws that make the answer trustworthy rather than merely clever: **every number is
> computed by deterministic code, never invented by a model** (the AI-narrator boundary, restated and
> *mechanically enforced* below), and **an insight can only *propose* — it never signs and never executes**
> (Ch9's "propose, never dispose"). An insight, in this system, is not an opinion. It is a *threshold
> crossing on a verified number, carrying the exact evidence that triggered it, and a suggestion the user is
> free to ignore.*
>
> **Status legend (carried from the Chapter 11 convention):** ✅ **Shipped** — implemented *and tested*
> in-repo, cited by file. 🔶 **Partial** — real, but gated on an injected seam or a single surface, gaps
> named. ⏭ **Roadmap** — a binding requirement with a landing phase, *not* a claim it runs today. Per
> Doctrine #3, a spec that claims coverage it lacks is itself a lie; every capability below carries its
> **real** state.

---

### 8.1 · The thesis — from "what I own" to "what it means"

The incumbents win the *display* problem and stop there. Zerion, Zapper, and DeBank will draw you a
gorgeous allocation ring and a net-worth curve; Rotki will compute your realized gains locally. None of them
close the loop from *chart* to *counsel* — a plain-language, evidence-backed observation that a specific,
verified condition holds and here is one thing you might do about it — and none can, because their analysis
lives on a **server** that must be handed your addresses. Ours is a **pure core** fed from the device's own
three-address identity (Ch5); the same architectural advantage that lets §6 aggregate your money without a
server knowing it is yours lets §8 *advise* on it the same way.

The discipline that makes an "insight" honest is that it is never a vibe. It is a rule with three
non-negotiable properties, all present in the shipped type:

1. **It is a threshold crossing on a verified metric** — `concentration.topAssetWeight > policy.maxAssetWeight`,
   `risk.bridgeExposure > policy.maxBridgeExposure` — not a model's hunch.
2. **It carries its evidence** — the exact metric ids and values that fired it, so any figure it states can
   be reconciled against the analytics that produced it.
3. **It suggests, it does not act** — its action field is prose advice; the type has *no executable field at
   all* (§8.2). The engine, by construction, cannot move a coin.

Everything in this section is a consequence of those three properties.

---

### 8.2 · The shape of an insight — evidence-bound and structurally inert ✅

The whole contract is the `Insight` type
([`packages/intelligence/src/types.ts`](../../packages/intelligence/src/types.ts)):

```ts
export interface Insight {
  code: string;               // stable machine id, e.g. 'CONCENTRATION_SINGLE_ASSET'
  severity: InsightSeverity;  // 'info' | 'warn' | 'critical'
  title: string;              // human headline
  detail: string;             // one sentence, in-voice, citing the number
  evidence: MetricRef[];      // the exact metrics that triggered it — verifiable, never invented
  suggestedAction?: string;   // "A non-executable suggestion. The engine never executes."
}
```

Read what is *absent*. There is no `execute`, no `txRequest`, no `intentId`, no callback. An `Insight` is a
data record, and the strongest possible guarantee that a recommendation cannot silently become a transaction
is that **there is nothing in the record to run.** `suggestedAction` is a `string` — advice a human reads —
and its own docstring states the rule: *the engine never executes; the user or the Intent layer decides.*
This is propose-only enforced by *type*, not by *policy* (§8.7).

Every entry in `evidence` is a `MetricRef` — a dotted metric id plus the value it held at fire time
(`{ metric: 'concentration.topAssetWeight', value: 0.62 }`). That is what makes an insight *auditable* in the
Doctrine-#8 sense: the claim "your top asset is 62% of the book" ships *with* the metric that says so, so a
reviewer, a test, or the narrator (§8.6) can check the sentence against the arithmetic.

---

### 8.3 · The rule set — eleven deterministic detectors ✅ / 🔶

`generateInsights(ctx, policy)`
([`packages/intelligence/src/insights.ts`](../../packages/intelligence/src/insights.ts)) is a pure
function of an `InsightContext` (the already-computed allocation, concentration, risk, and performance from
§7's analytics) and an `InsightPolicy`. It runs eleven independent detectors, each of which either stays
silent or emits one evidence-bound `Insight`, then sorts the result most-severe-first
(`critical → warn → info`). No clock, no network, no randomness — the same context yields the same insights,
byte for byte, which is why the whole thing is testable to exhaustion.

| # | Code | Reads (verified metric) | Fires when | Severity |
|---|------|-------------------------|------------|----------|
| 1 | `CONCENTRATION_SINGLE_ASSET` | `concentration.topAssetWeight` | top asset > `maxAssetWeight` | warn → **critical** if far over |
| 2 | `CHAIN_CONCENTRATION` | `allocation.byChain[0].weight` | top chain > `maxChainWeight` | warn |
| 3 | `PROTOCOL_CONCENTRATION` | `allocation.byProtocol` (excl. `wallet`) | top protocol > `maxProtocolWeight` | warn |
| 4 | `BRIDGE_EXPOSURE_HIGH` | `risk.bridgeExposure` | > `maxBridgeExposure` | warn |
| 5 | `HIGH_LEVERAGE` | `risk.leverage` | > `maxLeverage` | warn → **critical** if ≥1.5× over |
| 6 | `LOW_DIVERSIFICATION` | `risk.diversificationScore` | < `minDiversification` | info |
| 7 | `LOW_STABLE_BUFFER` / `STABLE_IMBALANCE_IDLE` | `allocation.stablecoinWeight` | below min *or* above max buffer | info |
| 8 | `HIGH_DRAWDOWN` | `performance.currentDrawdown` | > `maxDrawdown` (needs history) | warn |
| 9 | `RISK_INCREASING` 🔶 | `risk.healthScore` vs `previousHealthScore` | drop ≥ `healthDropDelta` | warn |
| 10 | `GAS_COSTS_HIGH` 🔶 | `gasSpendMicros ÷ netWorthMicros` | > `maxGasSpendWeight` | info |
| 11 | `YIELD_OPPORTUNITY` 🔶 | injected `yieldOpportunities` ∩ held assets | APR ≥ `minYieldApr` on an idle holding | info |

Detectors 1–8 run on the **core snapshot** and ship live today. Detectors **9–11 are gated on optional live
context** — `previousHealthScore`, a `gasSpendMicros` window, and a `yieldOpportunities` feed — carried on
`AnalyzeExtras` ([`engine.ts`](../../packages/intelligence/src/engine.ts)). The *rules exist and are
tested*; they only *speak* when their seam is fed. That seam is exactly where the roadmap plugs in: rule 9
needs the historical-snapshot store (§7, ⏭ — no long-term store yet), rule 10 needs a gas-history seam, and
rule 11 needs the yield feed the DeFi integrations (§5, 🔶) will supply. We do **not** claim the gas, yield,
or trend insights fire in production today; they light up the moment their honest data source lands, and not
a moment before — a silent detector is the correct behavior for a fact we cannot yet verify (Doctrine #5,
fail closed).

A detail worth naming: each `detail` string states its number *and* the policy line it crossed
(`"…is 62% of your portfolio…"` beside `evidence: [topAssetWeight=0.62, maxAssetWeight=0.4]`). The user is
never told "this is bad" without being shown *the threshold that defines "bad,"* which they can change (§8.4).

---

### 8.4 · Policy is a parameter, not a hardcode ✅

There is no universal "too concentrated." A retiree and a degen have different postures, and baking one into
the engine would be a lie of omission. So every threshold lives in an `InsightPolicy`, shipped with three
presets that mirror the risk engine's posture model:

| Preset | `maxAssetWeight` | `maxChainWeight` | `maxBridgeExposure` | `maxLeverage` | `minDiversification` |
|--------|------------------|------------------|----------------------|----------------|-----------------------|
| `conservative` | 0.30 | 0.50 | 0.15 | 0.25 | 45 |
| `balanced` (default) | 0.40 | 0.60 | 0.25 | 0.50 | 30 |
| `aggressive` | 0.60 | 0.80 | 0.40 | 1.00 | 15 |

The engine defaults to `balanced` ([`engine.ts`](../../packages/intelligence/src/engine.ts)); a user — or,
for a team account, an enterprise — sets their own. This is what keeps an insight from moralizing: it does
not assert a truth about *the market*, it reports a **crossing of a line the user chose.** The same posture
knobs are the natural home for the Ch9 personalization roadmap: today the preset is explicit; learning a
user's preferred posture from behavior is a later chapter, and until it lands the posture is whatever the
user set, visibly.

---

### 8.5 · The four-state honesty, carried *into* the insight ✅

The defining discipline of Chapter 11 — **a network failure is not "$0," and an unpriced asset is not
"$0"** — does not stop at the valuation layer; it rides all the way into the insight engine, because an
insight computed over a lie is a laundered lie.

The seam is [`snapshotFromHoldings()`](../../services/api/src/insights.ts): when it folds the user's real
holdings into the engine's `PortfolioSnapshot`, an asset with **no known price is not invented at some
guessed value and is not silently dropped** — it is given `valueMicros: 0n` *and flagged* `stale: true`. The
position normalizer ([`positions.ts`](../../packages/intelligence/src/positions.ts)) propagates any stale
input to the portfolio's top-level `stale` bit, which `analyze()` carries onto the
`PortfolioIntelligence.stale` field, which the web `InsightsPanel`
([`apps/web/src/App.tsx`](../../apps/web/src/App.tsx)) renders as a visible **"some data stale"** badge
beside the intelligence. The four states of §3 — *real value · genuine zero · partial · network-fail ≠ $0* —
therefore survive into every insight:

- A **genuine zero** (you truly hold none of an asset) yields no position and no false insight.
- An **unpriced** asset contributes `0` value *but sets `stale`*, so the whole intelligence is labelled
  "partial," and a concentration or buffer insight computed over an incomplete book is never presented as
  the complete truth.
- A **failed read** is never rendered as a poorer portfolio — upstream (§6) a chain read that throws is not
  a `$0` chain; the honesty contract there means §8 simply reasons over less, labelled, rather than over a
  fabricated shrinkage.

Two guards in `generateInsights` make the same point in miniature: the gas-cost detector runs *only* when
`netWorthMicros > 0n` (no divide-by-a-fiction), and money stays integer `bigint` throughout — the only place
a ratio becomes a float is a genuinely dimensionless quantity (a weight, a health score), per the
money-vs-ratio rule at the top of [`types.ts`](../../packages/intelligence/src/types.ts). An insight
percentage is formatted for humans at the very edge; the value behind it was integer-exact.

---

### 8.6 · The AI-narrator boundary — the model narrates, the code computes ✅

This is the section's spine, restated from Ch9 and, crucially, **mechanically enforced** here rather than
merely promised. The rule: *deterministic code computes every figure; the AI only turns those figures into
prose.* The enforcement lives in [`narrator.ts`](../../packages/intelligence/src/narrator.ts).

A `Narrator` is any implementation of `summarize(intel, kind) → NarrativeReport`, and a `NarrativeReport`
must carry **`citations: MetricRef[]`** — every figure the prose states, tagged with the metric id it claims
to be. Two functions turn that shape into a wall:

- **`resolveMetric(intel, metric)`** is a *whitelist*. It maps a fixed set of metric ids
  (`netWorth`, `risk.healthScore`, `concentration.topAssetWeight`, …) to the value the verified intelligence
  actually holds. A metric id outside the whitelist resolves to `undefined` — there is no way to name a
  figure the engine did not compute.
- **`verifyNarrative(report, intel)`** walks every citation and rejects the whole narrative if *any*
  citation names an unknown metric (`undefined`) or states a value that does not reconcile with the verified
  one (numbers must agree within `±0.01`; strings must match exactly).

The engine's `narrate()` runs this guard by default (`verifyNarration = true`) and **throws
`NARRATION_UNVERIFIED`** rather than return a narrative whose numbers do not check out. The consequence is the
whole point: *you can plug a large-language model in behind the `Narrator` interface, and it still cannot
fabricate a number* — the instant its prose cites a figure that does not reconcile against the deterministic
analytics, the guard rejects it. The LLM chooses **words**; the engine owns **arithmetic**; the boundary
between them is a function that fails closed.

```
  PortfolioIntelligence (verified, deterministic numbers)
        │
        ▼
  Narrator.summarize(intel, kind)  ──►  NarrativeReport { text, citations[] }
        │                                        │
        │                        verifyNarrative(report, intel)
        │                                        │
        │             every citation resolves (whitelist) AND reconciles (±0.01)?
        │                         ┌──────── yes ────────┐        └── no ──┐
        ▼                         ▼                              ▼
   the words                 return report            throw NARRATION_UNVERIFIED
```

What ships **today** is `TemplateNarrator` — a fully deterministic, no-LLM narrator that cites only what it
read and is *itself* the reference the guard holds any future narrator to. A **schema-forced LLM narrator
behind this same guard is roadmap (⏭)**, and the guard is precisely the reason we can adopt one later without
weakening the honesty promise. (Note the separation of concerns: the raw `Insight.detail` strings in §8.3 are
composed by deterministic template code from the evidence values — they are already un-fabricatable. The
narrator is the layer that would let a *model* summarize the whole intelligence in fluent prose, and it is
that layer the citation guard exists to police.)

---

### 8.7 · Propose-only — an insight can *seed* an intent, never sign it ✅ / ⏭

The engine's own header states the boundary as law: *"The engine ANALYZES and RECOMMENDS; it never signs and
never executes"* ([`engine.ts`](../../packages/intelligence/src/engine.ts)). §8.2 showed this is enforced
structurally — an `Insight` has no executable field — so there is no code path from "insight fires" to "coin
moves." That is the shipped guarantee.

Where an insight *does* connect to action is as the **seed of a reviewable intent**, and the flow is exactly
the wallet's spine: an insight's `suggestedAction` ("Consider trimming this position toward a more balanced
allocation") is prose a human reads; if the human decides to act, that phrasing becomes the *input* to the
Universal Intent Engine (Ch7), which parses it deterministically, plans it, runs it through the safety and
risk gates (Ch10), and surfaces a confirmation the user must approve before the **device** signs (Ch8). The
disposer of funds is never the insight and never the model — it is the user's on-device signature, every
time (Doctrine #2).

The honest split: the insight-as-inert-suggestion is **shipped**; the one-tap *"turn this suggestion into a
pre-filled intent I can review"* wiring — auto-composing a draft `Intent` object from a `suggestedAction` and
handing it to Ch7 — is **roadmap (⏭)**. We describe it because the seam is deliberate, but a suggestion you
must retype is still a suggestion you must *approve*, and we will not describe the convenience wiring as if it
already ships.

---

### 8.8 · The voice of honesty — a fact or a labelled estimate, never a guarantee ✅

The last discipline is tone, and it is a doctrine, not a style choice. An insight is allowed to state exactly
two kinds of thing:

- **A computed fact.** "You are 34% below your portfolio's peak." "Debt is 60% of your assets." These are
  arithmetic over verified numbers; the evidence array proves them.
- **A clearly-labelled estimate.** A yield APR is *an offered rate from an injected feed*, framed as an
  opportunity to consider, never a promise of return. A projected gas saving is a modelled figure, not a
  quote.

What an insight is **never** allowed to do is hype or guarantee. The shipped copy shows the register: every
`suggestedAction` is hedged and optional — *"Consider trimming…," "Spread holdings…," "Repay part of your
borrow…"* — framed as choices, not commands. There are no "you will earn," no "guaranteed," no price
predictions, and no bare "buy/sell" imperatives. This is the same reason Ch9 forbids personalized investment
advice: the engine reports *your* verified condition against *your* chosen posture and names an option — it
does not tell you what the market will do or promise you an outcome. A recommendation that cannot be proven
from the evidence array is not shipped as an insight at all.

---

### 8.9 · What ships, and where — the live surface ✅

The insight engine is not a diagram; it is on the request path today.

- **Core:** `PortfolioIntelligenceEngine.analyze()` runs the full pipeline
  (normalize → allocation → concentration → performance → risk/health → **insights**) as a pure function of a
  snapshot ([`engine.ts`](../../packages/intelligence/src/engine.ts)), and `narrate()` applies the
  citation guard on demand.
- **API:** `GET /v1/portfolio/insights` folds the authenticated user's **real** holdings and live prices
  through the *same two seams the runtime uses* into a snapshot and returns the full intelligence
  ([`services/api/src/insights.ts`](../../services/api/src/insights.ts)) — bigints projected as decimal
  strings, `stale` bit intact, so the analytics can never drift from a second copy of the data.
- **Web:** the `InsightsPanel` ([`apps/web/src/App.tsx`](../../apps/web/src/App.tsx)) renders health,
  diversification, buffer, allocation slices, and the top insights — behind a hard honesty gate:
  because this is a **non-custodial** wallet whose real holdings live only on the device, the panel fetches
  the server's per-principal intelligence *and* the wallet's real on-chain net worth and **only shows the
  insights if the two agree** (within 2%). Borrowed or demo figures are refused, not displayed. Its footer
  says the quiet part out loud: *"computed by the intelligence engine over the API portfolio · analyzes only,
  never signs."*

The engineering record is [`docs/architecture/18-portfolio-intelligence.md`](../architecture/18-portfolio-intelligence.md)
and [ADR-0037](../adr/0037-portfolio-intelligence-engine.md).

---

### 8.10 · Roadmap — the seams already cut ⏭

Everything below is a *binding requirement with the seam already present in the type system* — not vaporware,
but not shipped either:

| Capability | State | The seam that exists today |
|------------|-------|-----------------------------|
| Trend insight (rule 9) | ⏭ | `AnalyzeExtras.previousHealthScore` — needs the §7 historical-snapshot store |
| Gas-cost insight (rule 10) | ⏭ | `AnalyzeExtras.gasSpendMicros` — needs a gas-history seam |
| Yield insight (rule 11) | 🔶 | `AnalyzeExtras.yieldOpportunities` — fed by §5 DeFi integrations (partial) |
| Correlation-basis risk | 🔶 | `PriceHistorySource.getReturnSeries` — falls back to weights basis honestly until fed |
| LLM narrator | ⏭ | the `Narrator` interface + `verifyNarrative` guard (§8.6) — adoptable *without* weakening honesty |
| Insight → pre-filled intent | ⏭ | `suggestedAction` → Ch7 Intent Engine (§8.7) |

The through-line: **the engine exists and is tested; the product surfaces it as fast as an *honest* data
source for each seam lands.** We would rather ship a silent detector than a confident lie — which is the
whole of Chapter 11, said one more way.


## §9 · Tax-Ready Transaction Categorization

> **This section makes a portfolio's *activity* tax-legible.** §1–§8 answered *"what do you own and what is
> it worth?"* — a point-in-time picture. Tax is the other axis: *"what happened, and what did it cost or
> earn?"* — the historical, event-level record a person must hand to an accountant every year. Our job here
> is to turn the wallet's honest activity trail into a clean, auditable, lot-level accounting of cost basis
> and realized gains — computed by deterministic code, never invented — and to do it under a discipline the
> incumbents mostly skip: **an unmatched or unpriced lot is surfaced, never silently zeroed.** The math is
> shipped and tested. The *sourcing* that feeds it — turning on-chain activity into priced, categorized tax
> events — is the honest gap, and this section is scrupulous about which is which.
>
> **⚠️ Not tax advice — the governing disclaimer of this section.** Every figure this engine produces is an
> **estimate for the user to verify with a qualified tax professional.** It is *never* presented as filed,
> authoritative, or a substitute for a return. Intent Wallet is **not a tax advisor**, does not know the
> user's full off-wallet financial picture, and computes gains under a *chosen* accounting method that may
> not be the one their jurisdiction or their accountant requires. This disclaimer is not fine print — it is
> a first-class product surface (§9.4) and it rides on every export.
>
> **Status legend (carried from the chapter convention):** ✅ **Shipped** — implemented *and tested* in-repo,
> cited by file. 🔶 **Partial** — real on one surface, gaps named. ⏭ **Roadmap** — a binding requirement with
> a landing phase, *not* a claim it runs today.

---

### 9.1 · The thesis — a record you can hand to an accountant, not a number you must trust

Crypto tax is where "never lie to the user" has teeth, because the lie has a dollar cost that lands on a
government form. The failure mode of the category is specific and well-documented: an aggregator sees a
disposal (a sell, a swap) but cannot find the matching acquisition — the coins arrived from an exchange it
does not index, or before the wallet existed — so it assumes a **cost basis of zero**. Zero basis means the
*entire* proceeds are taxed as gain. A user who actually broke even can be shown, and can unknowingly file,
a fabricated five-figure "profit." That is the exact shape of harm Doctrine #3 exists to forbid, transposed
from a balance screen onto a tax line.

So our thesis inverts the incumbent default. We do not produce *a tax number the user must trust*; we produce
**a lot-level record the user (and their accountant) can audit** — every disposal traced to the specific
acquisition lot it consumed, with the acquisition date, the cost paid, the proceeds received, the
holding-period term, and the gain, all reconciling to the penny. And where the record is *incomplete* — a
disposal with no matching lot, an acquisition whose price we never had — we say so **explicitly, as a
first-class output**, rather than papering over the hole with a zero. The benchmark is Rotki, the
open-source crypto-tax engine whose credibility rests on exactly this rigour (multiple accounting methods,
exact per-lot matching, honest surfacing of gaps). We match Rotki on the *engine*; we are candid below about
where we do not yet match Koinly/CoinTracker on *import breadth*.

---

### 9.2 · What is shipped — the lot-matching engine (✅)

The tax engine [`packages/intelligence/src/tax.ts`](../../packages/intelligence/src/tax.ts) is a pure,
deterministic function `computeTaxReport(events, config)` ([`tax.ts:99`](../../packages/intelligence/src/tax.ts)),
exported from the intelligence index ([`index.ts:110`](../../packages/intelligence/src/index.ts)) and
covered by its own suite ([`test/tax.test.ts`](../../packages/intelligence/test/tax.test.ts)). It is the
*mechanism* of cost-basis accounting; rates, forms, and jurisdiction rules are a thin config layer on top.
Its contract is entirely bigint-and-facts:

| Input `TaxEvent[]` | ([`types.ts:307`](../../packages/intelligence/src/types.ts)) | |
|---|---|---|
| `{ type:'acquire', asset, amount, costBasisMicros, asOf }` | a lot entering the book | cost basis in **µUSD** (integer, 6-dp) |
| `{ type:'dispose', asset, amount, proceedsMicros, asOf }` | a lot leaving the book | proceeds in **µUSD** |

| Output `TaxReport` | ([`types.ts:342`](../../packages/intelligence/src/types.ts)) | |
|---|---|---|
| `disposals: RealizedGain[]` | one line **per lot consumed** | `{ amount, proceedsMicros, costBasisMicros, gainMicros, term, acquiredAt, disposedAt }` |
| `totals` | proceeds / cost / net gain, **split short- vs long-term** | ([`tax.ts:195`](../../packages/intelligence/src/tax.ts)) |
| `unmatched: TaxDisposal[]` | disposal quantity with **no matching lot** — surfaced, never guessed | ([`types.ts:353`](../../packages/intelligence/src/types.ts)) |

Four properties of this engine are load-bearing and worth stating precisely, because each is a place a
sloppier implementation quietly lies:

**1 · Four accounting methods, one engine.** `TAX_PRESETS` ([`tax.ts:18`](../../packages/intelligence/src/tax.ts))
carries `us_fifo`, `us_hifo`, and `uk_pool`; the engine supports `FIFO | LIFO | HIFO | AVERAGE`
([`types.ts:304`](../../packages/intelligence/src/types.ts)). FIFO/LIFO/HIFO are the same lot-consumption
loop under a different pre-sort of the lots ([`tax.ts:164`](../../packages/intelligence/src/tax.ts)); the
UK-style pooled average is a separate `Pool` accumulator ([`tax.ts:133`](../../packages/intelligence/src/tax.ts)).
Method choice materially changes the reported gain, which is *precisely why it must be the user's explicit,
labelled choice* and never an invisible default — the same figure under FIFO and HIFO is two different
numbers, and honesty means naming which one is on screen.

**2 · Chronological causality.** Events are sorted by timestamp before processing
([`tax.ts:101`](../../packages/intelligence/src/tax.ts)), so a disposal can only ever match lots acquired
*before* it. You cannot sell a coin you have not yet bought. The engine never reads a clock
([`money.ts:31`](../../packages/intelligence/src/money.ts) `daysBetween` parses the given ISO strings) —
consistent with the deterministic-core rule (CLAUDE.md §5), the same events always produce the same report.

**3 · Exact bigint arithmetic, remainder assigned so totals reconcile.** A disposal that spans several lots
splits its cost proportionally with integer math ([`tax.ts:62`](../../packages/intelligence/src/tax.ts)),
and proceeds are allocated across the resulting lines with the **rounding remainder pushed onto the last
line** ([`tax.ts:83`](../../packages/intelligence/src/tax.ts)) so that the per-disposal proceeds sum back
to the exact input to the penny. Money is µUSD bigint end-to-end (Doctrine #4); no float ever touches a
basis or a gain. A gain can be negative — a loss is a first-class value ([`types.ts:335`](../../packages/intelligence/src/types.ts)),
not clamped away.

**4 · Holding-period term is computed, not assumed.** Each realized line is tagged `short` or `long` by
comparing its acquisition and disposal dates against the jurisdiction's threshold
([`tax.ts:45`](../../packages/intelligence/src/tax.ts) `termOf`; US = 365 days). The totals carry the
short/long split ([`tax.ts:200`](../../packages/intelligence/src/tax.ts)) because in most jurisdictions
the two are taxed at different rates — a report that collapses them is not tax-ready.

**The unmatched channel is the crown jewel.** When a disposal quantity cannot be matched to a lot — the
acquisition history is missing — the engine does **not** invent a zero-basis lot (the incumbent lie of §9.1).
It matches what it can, and pushes the leftover quantity, with its share of the proceeds, into
`unmatched` ([`tax.ts:180`](../../packages/intelligence/src/tax.ts) for lot methods,
[`tax.ts:159`](../../packages/intelligence/src/tax.ts) for the pool). That array *is* the honesty
contract of this section: it is the four-state model (§9.4) applied to a tax lot. A gap in the record is
shown as a gap, quantified, and left for the user to resolve — never rendered as a confident, and possibly
tax-inflating, gain.

---

### 9.3 · Categorization — mapping activity to tax events (🔶 partial)

The engine above is fed `TaxEvent[]`. The question §9's title poses is: *where do those events come from, and
how does raw wallet activity become "this was a disposal, that was a fee"?* The **taxonomy is specced and
grounded in the wallet's real semantics; the pipeline that builds priced events from activity is roadmap** —
we are explicit about the seam.

Every fund-moving action in this wallet is already a *typed* thing, not an opaque hash. The intent layer
(Ch7) classifies user actions into a closed set — `transfer | swap | buy | stake | rebalance`
([`intents/schema.ts:86`](../../packages/intents/src/schema.ts)) — and every approved plan decomposes into
typed steps `transfer | swap | bridge | approve | stake`
([`intents/schema.ts:102`](../../packages/intents/src/schema.ts)), which the Settlement engine drives to a
recorded outcome (Ch8): its ledger is an **append-only, replayable record of every transition**
([`settlement/src/ledger.ts`](../../packages/settlement/src/ledger.ts)), and its `reconcile` stage exists
precisely to reconcile *actual on-chain effects against the plan*
([`settlement/src/types.ts`](../../packages/settlement/src/types.ts) `SETTLEMENT_STAGES`). That typed,
reconciled trail is the raw material tax categorization maps from — we are not guessing intent from a bag of
transfers, the way a pure block-explorer indexer must.

The mapping — the taxonomy this section defines — is:

| Activity (intent / plan step) | Tax category | Event(s) emitted | Rationale |
|---|---|---|---|
| **`buy`** (fiat/stable → asset) | acquisition | `acquire` at fiat cost | a new lot enters the book at what was paid |
| **`swap`** A → B | **disposal + acquisition** | `dispose` A (proceeds = swap value), `acquire` B | a crypto-to-crypto swap is a taxable disposal of A in most jurisdictions — the single most-missed event in naïve trackers |
| **`transfer` out** to *own* address | non-taxable move | *none* (basis travels with the coin) | moving between your own wallets is not a disposal |
| **`transfer` out** to a *third party* | disposal *or* gift/spend | `dispose` at fair value | a payment or gift can realize gain; jurisdiction-dependent — flagged for user classification, never auto-assumed |
| **`transfer` in** (received) | acquisition *or* income | `acquire`; income if earned | airdrop/salary/reward received is often income at fair value on receipt |
| **`approve`** (ERC-20 allowance) | **fee only** | *no disposal* | an approval moves no value; its only tax surface is the gas spent |
| **gas** paid on any step | fee (and, strictly, a micro-disposal of the gas asset) | fee line; `dispose` of gas asset ⏭ | fees reduce net proceeds / add to basis; gas-as-disposal is a roadmap nuance (§9.6) |
| **`stake` / unstake / reward** | varies by jurisdiction | reward → income `acquire`; principal move → none | staking rewards are commonly income on receipt; depends on §5's position read-back |

Two rules make this a categorization *engine* and not a lookup table. First, **swap = disposal** is the
non-negotiable default, because it is the event users and lesser tools most often miss and the one most
likely to be under-reported. Second, **ambiguous outbound transfers are flagged, not decided**: whether a
transfer to an address the wallet does not recognize is a self-custody move, a gift, or a taxable payment is
a fact only the user holds, so categorization surfaces the choice rather than silently picking the one that
happens to minimize (or maximize) tax.

**What is not yet built (🔶→⏭):** the *event-sourcing pipeline* that walks the settlement ledger and on-chain
history and emits a priced `TaxEvent[]` does not ship today. Two hard inputs are missing: (a) a complete,
indexed **activity history** across all three chains (the wallet surfaces recent activity per Ch6, but a
full historical index is roadmap), and (b) the **acquisition-time price** needed for `costBasisMicros` —
which depends directly on the historical price store that §7 flags as roadmap (there is no long-term
price-history store yet). Until both land, the engine runs on events supplied to it; it does not yet
manufacture them from a user's raw chain history end-to-end.

---

### 9.4 · The honesty discipline — the four-state model on a tax value

Everywhere §3 and §6 render a *balance*, a value is in one of four states — **real / genuine-zero / partial /
network-fail (never `$0`)**. Tax carries the identical discipline onto a *basis* and a *gain*, and the stakes
are higher because the number lands on a filing:

| State | On a balance (§3/§6) | On a tax lot (§9) |
|---|---|---|
| **Real** | priced holding | matched lot: basis + proceeds + gain, penny-exact |
| **Genuine zero** | a truly empty wallet | a break-even disposal (gain = 0) — a *computed* zero, shown as zero |
| **Partial** | some chains read, others pending | disposal partly matched: matched lines emitted **and** the leftover in `unmatched` |
| **Network-fail ≠ $0** | a chain errored → `—`, not `$0` | acquisition price unavailable → **basis unknown, not basis = 0** |

That last row is the whole game. **An unpriced acquisition must never become a zero-basis lot**, because a
zero basis silently *overstates* the eventual gain and inflates tax owed — the mirror image of the
network-fail-is-not-$0 rule, and arguably more dangerous because the error flows onto a government form
rather than a dashboard. Unpriced acquisitions and unmatchable disposals both resolve to the **unmatched /
unknown** channel ([`tax.ts:159,180`](../../packages/intelligence/src/tax.ts)), where they are counted and
shown as work the user must complete — not absorbed into a confident total.

**Everything the AI says about tax, it reads; it does not compute.** Consistent with the AI-narrator boundary
(Ch9), the numbers here are produced by deterministic code and the LLM may only *narrate verified figures*.
The narration guard `verifyNarrative` ([`intelligence/src/narrator.ts:57`](../../packages/intelligence/src/narrator.ts))
rejects any citation that does not reconcile against computed intelligence — so a model cannot volunteer a
gain figure the engine did not produce. (Today `resolveMetric` exposes portfolio-level metrics only; wiring
the `TaxReport` totals into the narratable metric set is a small, honest follow-on — until then the AI does
not narrate tax figures at all, which is the safe default.)

**And the disclaimer is a surface, not a footnote.** The estimate-only, not-tax-advice, verify-with-a-
professional statement from the top of this section is a product requirement: it appears wherever a tax
figure or export appears, it names the *chosen accounting method* alongside the number (so "$4,120 gain" is
always "$4,120 gain, **FIFO, your estimate to verify**"), and it never lets a computed estimate wear the
costume of a filed, authoritative result. We are not a tax advisor; the engine's honesty about *what it is*
is as important as its honesty about *what it computes*.

---

### 9.5 · Export-readiness — the clean, auditable record

"Tax-ready" ultimately means *a record you can export and defend*. Two shipped properties make the output
export-shaped, and one surface is roadmap.

**The `RealizedGain` line is already form-shaped.** Each disposal line carries exactly the columns a US Form
8949 row (or its equivalent elsewhere) wants — description (asset + amount), date acquired (`acquiredAt`),
date sold (`disposedAt`), proceeds, cost basis, gain/loss, and the short/long term
([`types.ts:330`](../../packages/intelligence/src/types.ts)). The report is a per-lot ledger, not a
lump-sum headline, which is what makes it auditable: a reviewer can walk every line back to the acquisition
it consumed.

**Provenance is anchored in the settlement ledger.** Because every fund-moving action is recorded as an
append-only, replayable settlement trail ([`settlement/src/ledger.ts`](../../packages/settlement/src/ledger.ts))
with reconciled on-chain effects and txids, each tax line can — by construction — be traced to the concrete
on-chain event and block that produced it. Doctrine #8 (everything auditable) is what makes the tax record
defensible rather than merely plausible: the number is not asserted, it is *derived from a recorded event you
can replay*.

**The export *surface* is roadmap (⏭).** A downloadable CSV / 8949-shaped file, and a per-jurisdiction
formatter, are not shipped — the report structure supports them, and rendering them is a formatting layer at
the very edge (bigint µUSD → the jurisdiction's currency string, exactly like `formatUsd`
[`portfolio/src/money.ts:36`](../../packages/portfolio/src/money.ts) formats for display and nowhere
earlier). Until that surface lands, the tax record is a computed, inspectable object, not yet a one-tap file.

---

### 9.6 · Honest status & the roadmap

| Capability | State | Evidence / landing |
|---|---|---|
| Lot-matching engine (FIFO/LIFO/HIFO/AVERAGE), exact bigint, penny-reconciling | ✅ shipped | [`tax.ts`](../../packages/intelligence/src/tax.ts) + [`test/tax.test.ts`](../../packages/intelligence/test/tax.test.ts) |
| Short/long-term split; jurisdiction as `{method, threshold, name}` | ✅ shipped | [`tax.ts:45,195`](../../packages/intelligence/src/tax.ts); presets `tax.ts:18` |
| **Unmatched / unknown-basis surfacing** (never zero-basis) | ✅ shipped | [`tax.ts:159,180`](../../packages/intelligence/src/tax.ts) |
| Activity → tax-event **categorization taxonomy** (swap=disposal, fee, income…) | 🔶 specced | §9.3 table, grounded in [`intents/schema.ts:86,102`](../../packages/intents/src/schema.ts) |
| **Event-sourcing pipeline** (ledger + chain history → priced `TaxEvent[]`) | ⏭ roadmap | needs full activity index + acquisition-time prices |
| Acquisition-time cost basis from a **price-history store** | ⏭ roadmap | blocked on §7's price-history store (none yet) |
| Gas-as-disposal, wash-sale, income-on-receipt fair-value rules | ⏭ roadmap | jurisdiction nuances not modelled |
| **CSV / Form-8949 export** + per-jurisdiction formatter | ⏭ roadmap | report is export-shaped (§9.5); the file surface isn't built |
| More jurisdictions beyond US/UK presets | ⏭ roadmap | engine is parameterized; presets are the work |

The roadmap, in dependency order — each a binding requirement, none a running feature:

1. **The activity indexer** — a complete, honest cross-chain history behind the Ch6 activity surface, so every
   acquisition and disposal is *seen*. Nothing downstream is tax-ready until the events are complete.
2. **The price-history store (shared with §7)** — the acquisition-time price that turns a seen transfer into a
   `costBasisMicros`. Missing prices resolve to **unknown basis**, per §9.4 — never to zero.
3. **The categorizer** — the §9.3 taxonomy implemented over the settlement ledger, emitting `TaxEvent[]` with
   ambiguous outbound transfers *flagged for user classification*, not auto-decided.
4. **Jurisdiction & rule depth** — more presets, plus gas-as-disposal, income-on-receipt fair-valuation, and
   wash-sale handling where applicable — each added as an explicit, labelled rule, never a silent default.
5. **The export surface** — CSV / 8949 / accountant-ready file, each stamped with the method and the
   not-tax-advice disclaimer at the point of export.

The benchmark we measure against is **Rotki** for engine rigour (multiple methods, exact lots, honest gaps —
which we already match) and **Koinly / CoinTracker** for import breadth (hundreds of exchange and chain
connectors — which we do not, and do not pretend to). Their moat is a large maintained library of importers;
ours is a tested, exact, honesty-first accounting core waiting behind a clean event seam. That is a genuine
head start on the *hard, correctness-critical* part and a candid deficit on the *broad, coverage* part.

The rule that governs this section is the chapter's rule, transposed onto the highest-stakes number in the
product: **a gain we cannot substantiate to a lot is not a gain we get to assert.** Where the record is
complete, we compute it to the penny; where it is not, we show the gap and name it; and nowhere — not once —
does a missing acquisition quietly become a zero-basis, tax-inflating "profit." Against a category that
routinely does exactly that, and against the reality that this number lands on a government form, that
restraint is not §9's weakness. It is the entire point.


---

## Where this sits

This is the engineering reference for **Chapter 11 — the Universal Asset Intelligence Engine**. Shipped: the
portfolio aggregation engine (unified net worth across BTC/EVM/SOL, per-account/per-chain), balance discovery
via the adapter registry, the **four-state valuation honesty** (network-fail ≠ $0, unpriced ≠ $0, partial
labelled), the analytics + insight + tax engines, and the AI-narrator boundary (code computes, the LLM
narrates); roadmap: full NFT intelligence, yield/DeFi position tracking, historical snapshots, deep token
classification, and complete tax-lot categorization. When the founder's Chapter 11 charter lands, it becomes
the canonical front of this reference.
