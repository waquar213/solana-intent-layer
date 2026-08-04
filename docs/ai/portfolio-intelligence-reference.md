[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Volume IV — the long-form behind [Chapter 12 — Portfolio Intelligence Engine](../bible/chapter-12-portfolio-intelligence.md)

# The Portfolio Intelligence Reference

*Turn holdings into wealth intelligence — grounded in the real intelligence engine, with the AI-narrator boundary (code computes, the LLM narrates) central and estimates always labelled.*

**About this document.** [Chapter 12](../bible/chapter-12-portfolio-intelligence.md) is the memorize-it
charter. This is its **reference spec**: the net worth engine, performance & P&L, allocation & diversification,
the health score, cash flow / fees / yield, goals / benchmarks / coach, the risk dashboard & timeline,
reports / alerts / the simulator, and the narrator boundary — each tagged **SHIPPED** or **ROADMAP**. Two
lines never move: **every number is computed by deterministic code and narrated by the AI**, and **an estimate
is labelled; network-fail is never $0.**

| § | Section | Grounded in |
|---|---|---|
| 1 | Architecture & the Net Worth Engine | `packages/portfolio` (reads the Asset Engine, not the chain) |
| 2 | Real-Time Performance & P&L | `packages/intelligence` (time-series P&L roadmap) |
| 3 | Asset Allocation & Diversification | `packages/intelligence` allocation (shipped) |
| 4 | The Portfolio Health Score | `packages/intelligence` risk/health scoring (shipped) |
| 5 | Cash Flow, Fees & Yield | fee analysis (partial) · cash flow / yield (roadmap) |
| 6 | Goals, Benchmarks & the Coach | insight engine (coach) · goals/benchmarks (roadmap) |
| 7 | Risk Dashboard & Timeline | `packages/intelligence` risk (timeline roadmap) |
| 8 | Reports, Alerts & Simulator | the shipped alert + scenario engines |
| 9 | The Narrator Boundary & Definition of Done | the AI-narrator boundary + doctrine |

Honesty first: allocation/performance/health analytics + the alert/scenario/tax engines are shipped; P&L over
time, cash flow, yield, goals, benchmarks, timeline, monthly report, and the simulator product are roadmap.

---

## §1 · Portfolio Architecture & the Net Worth Engine

The product promise of Chapter 12 is a single sentence a non-technical stranger can trust: **"Your
portfolio is worth $248,540."** One number, computed — never a token list to decode, never a figure we
invented. This section builds the two things that make that sentence honest: the **layering** that decides
*where* the number comes from, and the **Net Worth Engine** that decides *what* the number is. Everything
downstream in this chapter — performance (§2), allocation (§3), the health score (§4) — is a lens on the
object this section defines. If the layering leaks or the total lies, no lens above it can be trusted, so
this is where the discipline is spent.

Two laws govern the whole section and never move. First, **a number is computed by deterministic code and
narrated by the AI — the AI never invents a figure** (Doctrine §7, the narrator boundary of Chapter 9).
Second, **an estimate is always labelled an estimate, and a network failure is never rendered as $0**
(Doctrine §3). The rest is engineering in service of those two.

---

### 1.1 · The layering — Portfolio reads the Asset Engine, never the chain

The engine sits in a fixed pipeline, and its position in that pipeline is the single most important
architectural decision in the chapter:

```
Wallet Core  →  Asset Intelligence  →  Portfolio Intelligence  →  AI Financial Brain  →  Dashboard
 (Ch5/6)          (Ch11)                 (Ch12 — HERE)              (Ch9)                 (Ch3/4)
 keys, addrs      discover · price       aggregate · net worth      narrate · coach       render
                  four-state honesty      analytics · health        never fabricate       every state
```

Each layer has exactly one job and hands a typed object to the next:

- **Wallet Core (Ch5/6)** owns the identity and the addresses. It never values anything.
- **Asset Intelligence (Ch11)** is the *only* layer that touches an RPC. It discovers what an address
  holds, reads base-unit balances, resolves prices, and stamps each value with one of four honesty states.
  Its output is the shipped `UnifiedPortfolio` from `packages/portfolio` (native discovery is shipped on
  every chain; deep token/NFT/DeFi discovery is roadmap, tagged as such in Ch11 §1.8).
- **Portfolio Intelligence (Ch12 — this chapter)** consumes that resolved object. It aggregates, computes
  net worth, and runs the analytics. It reads the Asset Engine, and **it does not fetch blockchain data
  directly.**
- **AI Financial Brain (Ch9)** narrates the verified object — and can only cite figures the engine already
  computed (the anti-fabrication guard of §9).
- **Dashboard (Ch3/4)** renders the result, honouring every state the engine reports.

The cardinal rule is the arrow that is *missing* from the diagram: **there is no arrow from Portfolio
Intelligence to the chain.** The Portfolio Engine has no RPC client, no transport, no adapter. In the
shipped web reader this is visible as a hard package boundary — `apps/web/src/balances.ts` is the layer
that imports `@intent-wallet/chains` (`EvmAdapter`, `SolanaAdapter`, `BitcoinAdapter`, the transports) and
performs the reads; `@intent-wallet/portfolio` imports *none* of them. Aggregation
(`packages/portfolio/src/aggregate.ts`) takes an array of already-read `PortfolioBalance` values plus an
already-resolved `PriceInfo` map and returns a `UnifiedPortfolio`. It cannot fetch, so it cannot fetch
dishonestly.

Why this matters beyond tidiness: **honesty is a property that must be enforced in exactly one place.** A
network failure is not "$0"; an unpriced asset is not "$0"; a partial read must be labelled partial. If two
different layers both read the chain, each has to re-implement that discipline, and the day they disagree is
the day the wallet lies to someone about their money. By forcing every valuation through the Asset Engine,
the four-state honesty model (Ch11 §1.4) is written once and *inherited* everywhere above it. The Portfolio
Engine's freedom is deliberately narrow: it may **propagate** the states it is handed and **combine** them
under integer math, but it may never **invent** a value the Asset Engine did not produce. That single
constraint is what lets the dashboard's headline number carry the weight the product puts on it.

---

### 1.2 · The Net Worth Engine — total assets, liabilities, estimated net worth

The Net Worth Engine answers *"what am I worth right now?"* It has three outputs, and the shipped code
produces all three as integer µUSD (`1 USD = 1_000_000 µUSD`, `packages/*/money.ts`) — never a float, never
until the very edge where a human reads it.

**Total assets (gross).** Aggregation groups balances by asset, merges the same asset across chains while
keeping per-chain provenance, and values each holding with exact integer arithmetic. The value of a holding
is never `amount × price` in floating point; it is
`assetValueMicros = amount * priceMicros / 10^decimals` — a bigint expression that is exact for any token
regardless of its decimal count (`packages/portfolio/src/money.ts`). Summed across assets, this is
`UnifiedPortfolio.totalValueMicros`, the gross value the dashboard headlines.

**Total liabilities (if supported).** Net worth is only trustworthy if the *sign* of debt is right, and the
shipped intelligence core gets it right structurally rather than by convention. In
`packages/intelligence/src/positions.ts`, every position carries `valueMicros` as a **positive magnitude**;
a position whose `kind` is `'borrowing'` is a liability. Normalization accumulates the two totals
separately:

```
grossAssetsMicros += value      // for every non-debt position
debtMicros        += value      // for borrowing positions (still a positive magnitude)
netWorthMicros    = grossAssetsMicros - debtMicros
```

A borrowed position's signed contribution to net worth is `-value`, and it is deliberately given a portfolio
weight of `0` (debt is scored through leverage in §4, not as an allocation slice). This is why "net worth"
can be trusted: debt is subtracted by construction, not by hoping a minus sign was typed somewhere. The
honest scoping note: **liabilities are a first-class type in the shipped core, but they are only populated
when a lending/borrowing position is discovered — and money-market position discovery is a roadmap item of
Ch11 §5.** So for a today-typical wallet of spot holdings, `debtMicros = 0` and `netWorthMicros ==
grossAssetsMicros`; the machinery to subtract debt exists and is tested, and it will light up the moment the
Asset Engine begins surfacing borrow positions. We say "if supported" honestly.

**Estimated net worth vs exact balances.** The base-unit balance is *exact* — it is read from the chain and
is ground truth. The *value* is an **estimate**, because it depends on a price that is a market quote at a
moment. The engine keeps these separate on purpose: `UnifiedAsset` carries both the exact `amount` (bigint)
and the derived `valueMicros`, plus the `priceUsd` actually used and a `stale` flag. Wherever the value is a
market estimate the UI is required to present it as one; the amount beneath it is never softened, because it
is not an estimate. This is the concrete meaning of Doctrine §3's "distinguish estimates from exact on-chain
balances": it is a property of the type, not a disclaimer bolted onto the screen.

---

### 1.3 · The four states, applied to the *total*

Ch11 defines the four-state honesty model for a single asset's value. §1 of this chapter's contribution is
to define what those states mean **when they are summed into one headline number** — because the failure
mode we most fear is precisely a total that looks confident while one of its inputs quietly failed. The
total is always in exactly one of four states, and the shipped code computes which:

| State | What it means for the headline | How the shipped code expresses it |
|---|---|---|
| **Real total (✅)** | every contributing asset was read and priced; the sum is a live estimate of real value | `totalValueMicros` with `stale = false`; `balances.ts` returns a numeric `totalUsd` |
| **Genuine zero ($0)** | reads and prices succeeded and the wallet genuinely holds nothing of value | a real `0n` total — the *only* case in which "$0" is honest |
| **Partial total (labelled)** | some inputs are missing/stale; the number shown is a floor, not the whole truth | `UnifiedPortfolio.stale = true` when any balance or price was stale; the dashboard must label it partial |
| **Network-fail (never $0)** | a read failed; the value is unknown, which is *not* zero | `balances.ts` returns `null` for the failed leg ("—"), and `totalUsd = null` when no price is available |

The discipline that makes this real is that a missing input must never silently contribute `0` to a total
that is then presented as complete. The shipped browser reader shows both halves of the rule:

- **A failed read is `null`, not `0`.** Every per-chain read is wrapped so an erroring chain becomes `null`
  ("—") rather than collapsing the whole view — `nullable(p) = p.then(n => n, () => null)`
  (`apps/web/src/balances.ts`). A chain that is down is *unknown*, and unknown is rendered as an em dash, not
  as a zero that would understate the user's wealth.
- **No price means no total, not a fake total.** The headline is gated on price availability:
  `const totalUsd = anyPrice ? assets.reduce(...) : null;`. If *no* asset could be priced, the engine
  refuses to print a number and returns `null` — an honest "we can't value this right now" — rather than
  summing a column of zeros into a confident "$0.00."

Aggregation carries the same signal structurally: `aggregatePortfolio` sets `UnifiedPortfolio.stale = true`
if *any* contributing price was flagged stale, and an unpriced asset contributes its **amount** to the asset
list but `0` to `valueMicros` — so it is visibly held without being falsely valued. The rule the dashboard
inherits: **when `stale` is true or any leg is `null`, the total is a floor labelled "partial," never a
period-ended number presented as truth.** (The multi-source fetch pattern that produces partials without
failing the whole view — `Promise.all` over independently-nullable legs — is the aggregation analogue of the
`allSettled` discipline Ch11 §1.4 mandates.)

---

### 1.4 · Change over time — and the honest line where shipped stops

"Net worth" naturally wants a companion: *how has it changed?* — the daily, weekly, monthly, and yearly
deltas the charter (§3) and the P&L engine (§2) promise. Here the section must draw its most scrupulous line,
because a change figure is not a property of *now*; it is a comparison between now and a **stored past**, and
the honesty of the comparison is only as good as the honesty of that store.

**What is shipped:** the engine can compute change *when it is given history to compute against.* A
`PortfolioSnapshot` accepts an optional `history: NetWorthPoint[]` (each point is `{ asOf, netWorthMicros }`)
and optional `flows: CashFlow[]`, and the shipped performance stage (`packages/intelligence/src/performance.ts`,
detailed in §2) derives growth and time-weighted return from them — flow-adjusted so a deposit is never
mistaken for a gain. Every one of those figures is honest about its own absence: `Performance.hasHistory` is
`false`, and `twr`, `growthPct`, `maxDrawdown` and friends are `null`, when no history was supplied. The
engine never fabricates a trend line from a single point.

**What is roadmap:** the wallet does **not yet run a long-term snapshot store.** The `SnapshotStore`
interface exists in `packages/intelligence/src/sources.ts` — `loadHistory(identityId)` and
`appendPoint(identityId, point)` — but it is a **seam, not an implementation**: an injected contract waiting
for its backing store. Concretely, this means **historical net worth and the change-over-time deltas are
roadmap, not shipped.** Today the engine computes a *live single-point* net worth honestly and completely;
it does not persist a series, so out of the box there is no yesterday to subtract from today. The moment a
`SnapshotStore` is wired (append one `NetWorthPoint` per analysis, load the series on the next), the daily /
weekly / monthly / yearly change lights up with *no change to the analytics* — the math already accepts
`history`. Until then, the discipline is to render change only where a real prior point exists, and otherwise
to show the honest empty state ("start tracking to see change"), never a fabricated "+0.0%" or an
extrapolated curve. "The engine accepts history" is not "the product ships historical net worth," and this
section refuses to conflate them.

---

### 1.5 · Shipped vs roadmap — the scrupulous ledger

| Capability | Status | Where it lives |
|---|---|---|
| Read the Asset Engine, never the chain (package boundary) | ✅ Shipped | `@intent-wallet/portfolio` imports no chain adapter; `balances.ts` is the only reader |
| Cross-chain aggregation → one asset list + one total | ✅ Shipped | `aggregatePortfolio` → `UnifiedPortfolio.totalValueMicros` |
| Integer µUSD net worth, floats only at the display edge | ✅ Shipped | `money.ts` (`assetValueMicros`, `MICRO`); bigint end-to-end |
| Net worth = gross assets − debt, by construction | ✅ Shipped | `positions.ts` `normalize()` `netWorthMicros`, signed debt, weight 0 |
| Estimate (value) vs exact (amount) kept distinct | ✅ Shipped | `UnifiedAsset { amount, valueMicros, priceUsd, stale }` |
| Four-state honesty on the *total* (real / zero / partial / fail) | ✅ Shipped | `stale` flag; `balances.ts` `null` legs + `anyPrice ? … : null` |
| Liabilities populated from discovered borrow positions | ⏭ Roadmap | type shipped; discovery is Ch11 §5 |
| Historical net worth + daily/weekly/monthly/yearly change | ⏭ Roadmap | `SnapshotStore` interface only — no snapshot store yet |
| Canonical asset registry (symbol-collision-proof grouping) | 🔶 Partial | `aggregatePortfolio` accepts an `assetKey` override; registry is a follow-up |

---

### What §1 commits us to

- **One reader of ground truth.** The Portfolio Engine consumes the Asset Engine (Ch11) and holds no RPC
  client of its own. Honesty — a failed read is not $0, an unpriced asset is not $0, a partial is labelled —
  is enforced once, below this layer, and inherited by everything above it.
- **A net worth that is computed, signed, and integer.** `netWorthMicros = grossAssetsMicros − debtMicros`,
  in bigint µUSD, with debt subtracted by construction and floats confined to the display edge. The exact
  amount and the estimated value are different fields on purpose.
- **A total that carries its own honesty.** The headline is in one of four states — real, genuine-zero,
  partial-labelled, or unknown-never-$0 — and the shipped `stale` flag and `null` legs make the state
  machine-readable so the dashboard cannot accidentally present a floor as a fact.
- **A refusal to fake history.** The analytics already accept an injected net-worth series, but no snapshot
  store ships yet, so historical net worth and change-over-time are labelled roadmap, and the product shows
  an honest empty state until a real prior point exists.

The AI's role over all of this is unchanged and non-negotiable: it **explains** the number — "your net worth
is $248,540, held mostly on two chains, and one asset couldn't be priced so this is a floor" — and it never
invents one, never instructs, and never signs. With the object defined and its honesty guaranteed, **§2**
puts it in motion: real-time performance and P&L over the exact `history`/`flows` seam this section left
open — honest about `hasHistory`, honest about the roadmap store behind it.


## §2 · Real-Time Performance & P&L

A net worth number answers *"what is it worth right now?"* Performance answers the harder, more human
question: *"am I ahead, and by how much?"* That question is where wallets lie most often — a green
percentage with no denominator, an "all-time gain" that quietly forgets the deposit you made yesterday, a
"$0" that is really a dead RPC. This section specifies how Intent Wallet computes performance and
profit/loss so that every figure is either **derived by deterministic code from stated inputs** or **honestly
absent**, and so that a user can always see *how* an estimate was made.

The defining move of this section is a split the code already enforces in
[`packages/intelligence/src/performance.ts`](../../packages/intelligence/src/performance.ts): performance is **two
independent truths**, and conflating them is how most portfolio trackers become subtly dishonest.

- **Unrealized P&L** is a *point-in-time* fact. It needs no history at all — only each position's current
  mark and its cost basis. `mark − cost`. It is computable the instant you have both numbers.
- **Time-series performance** — return, volatility, drawdown, and the daily/weekly/monthly/yearly/all-time
  changes the product promises — is a *window* fact. It requires a stored series of past net-worth points.
  Without that series, the honest answer is not zero and not a guess; it is *"not yet."*

The reference-level charter for both lives in Chapter 12 §4 (Real-Time Performance Engine) and §8 (Profit &
Loss Engine). This section is the buildable specification behind them, and it is scrupulous about what ships
today versus what waits on the historical store.

---

### 2.1 · Unrealized P&L — shipped engine, honest denominator

Unrealized P&L is computed by `computePerformance` over the normalized portfolio. The loop is deliberately
narrow:

```ts
// performance.ts — the only positions that count toward unrealized P&L
for (const p of np.positions) {
  if (p.kind === 'borrowing') continue;          // a liability is not a gain
  if (p.costBasisMicros === undefined) continue; // no cost basis → not in the numerator OR the denominator
  costBasisMicros += p.costBasisMicros;
  markMicros      += p.valueMicros;
}
const unrealizedPnlMicros = markMicros - costBasisMicros;
const unrealizedPnlPct    = costBasisMicros > 0n ? ratio(unrealizedPnlMicros, costBasisMicros) : null;
```

Three disciplines are load-bearing here, and each is a Doctrine obligation rather than a style choice:

1. **Money is integer µUSD, end to end** (Doctrine §4). `costBasisMicros`, `valueMicros`, and their
   difference are `bigint` in micro-USD (1 USD = 1,000,000 µUSD; see
   [`money.ts`](../../packages/intelligence/src/money.ts)). The percentage — a *dimensionless ratio* — is a
   `number`, produced by `ratio()`. That is not a precision compromise: a ratio is not money, and float
   rounding on a ratio is a presentation concern, not a value-integrity one. The money-vs-ratio rule is
   stated at the top of [`types.ts`](../../packages/intelligence/src/types.ts) and enforced everywhere.

2. **The numerator and denominator always describe the same set.** A position with no known cost basis is
   skipped entirely — it contributes to *neither* `markMicros` *nor* `costBasisMicros`. This prevents the
   classic lie where a "+38%" is computed against a cost basis that silently excludes the half of the
   portfolio whose acquisition price is unknown. Here, `unrealizedPnlPct` is a return on *exactly the capital
   whose cost we actually know*, and nothing else.

3. **Unknown cost basis yields `null`, never `0`.** When no position carries a cost basis, `costBasisMicros`
   is `0n`, so `unrealizedPnlPct` is `null`. The UI must render that as *"—"* or *"cost basis needed,"* never
   as "0%". A zero percent return is a claim ("you broke even"); a null is the truth ("we can't say"). The
   four-state honesty of Chapter 6 applies to derived numbers exactly as it applies to balances.

**Methodology disclosure is mandatory.** Because unrealized P&L is an *estimate* built on cost-basis
assumptions, §12 (Chapter 12) requires the figure to travel with its method. The UI shows, next to any
unrealized number: which positions are included, which were excluded for missing cost basis, and how cost
basis was determined (imported by the user, inferred from on-chain acquisition, or unknown). A number the
user cannot interrogate is a number the user cannot trust.

---

### 2.2 · Realized P&L — the lot-matching engine and its stated method

Realized P&L — gains locked in by a disposal — is not guessed from current marks; it is computed by matching
each disposal to the specific lots it consumed, in
[`packages/intelligence/src/tax.ts`](../../packages/intelligence/src/tax.ts) (`computeTaxReport`). The
same engine that produces the tax report produces realized P&L, because they are the same computation: a
realized gain *is* proceeds minus matched cost basis.

The method is not incidental — it is a *disclosed input*. The engine is parameterized over four lot-matching
strategies, each a first-class, tested code path:

| Method | Rule | Typical jurisdiction preset |
|---|---|---|
| **FIFO** | oldest lots consumed first | `us_fifo` |
| **LIFO** | newest lots first | — |
| **HIFO** | highest-cost lots first (minimizes realized gain) | `us_hifo` |
| **AVERAGE** | pooled average cost | `uk_pool` |

Two correctness properties make these figures trustworthy enough to base a tax estimate on, and both are in
the code comments and tests, not just asserted here:

- **Cost is split with exact bigint arithmetic.** When a disposal consumes part of a lot, its cost is
  apportioned as `(lot.costBasisMicros * take) / lot.amount`, and the rounding remainder is assigned to the
  final line so per-disposal totals reconcile to the penny. No float ever touches a cost basis.
- **Unmatched disposals are surfaced, never fabricated.** If a disposal can't be matched to a prior
  acquisition (missing history), the leftover quantity is pushed to `unmatched` with its share of proceeds —
  it is *reported as un-costed*, not silently assigned a cost basis of zero (which would invent a 100% gain).
  This is the anti-fabrication rule applied to tax math: the engine would rather tell you *"we can't cost
  this lot"* than manufacture a number.

The realized figure the product shows must therefore always be labelled with its method and its jurisdiction
("Realized gain, FIFO, US"), and must expose the unmatched tail. A realized-gain total whose method is hidden
is not an answer — it's a different number depending on an assumption the user never saw. Chapter 12 §8's
"include the methodology" clause is satisfied structurally: the method *is* an input to the function and rides
along on the `TaxReport`.

---

### 2.3 · Time-series performance — the engine ships, the history store is roadmap

Everything above is point-in-time and needs no history. The *changes over time* the product headlines —
**daily / weekly / monthly / yearly / all-time P&L**, plus volatility and drawdown — are a different
computation with a different, unmet dependency.

`computePerformance` already implements them. Given a `NetWorthPoint[]` history and an optional `CashFlow[]`
series, it computes:

- **Growth over the window** — `last.netWorthMicros − first.netWorthMicros` and its percentage.
- **Time-weighted return (TWR)**, flow-adjusted so deposits and withdrawals don't masquerade as performance:
  for each period `rₜ = (Vₜ − flowₜ) / Vₜ₋₁ − 1`, then `TWR = Π(1 + rₜ) − 1`. This is the difference between
  *"your portfolio grew 20%"* and *"you added cash and it looks like 20%."* Removing contribution timing is
  what makes the number measure the portfolio's performance rather than the user's deposit schedule.
- **Annualized volatility** and **max / current drawdown**, from the pure quant primitives in
  [`stats.ts`](../../packages/intelligence/src/stats.ts) (`stdev`, `annualizeVol`, `drawdown`).

And here is the honesty gate, straight from the code:

```ts
const hasHistory = history.length >= 2;
if (!hasHistory) {
  return { unrealizedPnlMicros, unrealizedPnlPct, costBasisMicros,
           hasHistory: false, twr: null, growthMicros: null, growthPct: null,
           volatilityAnnual: null, maxDrawdown: null, currentDrawdown: null, series: [] };
}
```

With fewer than two points, every time-series metric is `null` and `series` is `[]`. **The engine never
fabricates a series to fill a chart.** A flat line, a fake "0.0%", an interpolated sparkline — all forbidden.
`hasHistory: false` is a first-class result the UI must honor with an honest empty state ("Performance history
starts building now") rather than a zero.

**What is not yet shipped: the store that would make `hasHistory` true.** The seam exists —
[`sources.ts`](../../packages/intelligence/src/sources.ts) defines `SnapshotStore` with `loadHistory()` and
`appendPoint()` — but there is **no persistent implementation on the live request path today**. Concretely, the
shipped insights endpoint [`services/api/src/insights.ts`](../../services/api/src/insights.ts) builds its
`PortfolioSnapshot` from current holdings only:

```ts
// snapshotFromHoldings — no `history`, no `flows`, no `costBasisMicros`
return { identityId, asOf, positions };
```

So in production **right now**, `computePerformance` runs, but over an empty history and cost-basis-free
positions. The result is honest and unglamorous: `hasHistory: false`, all time-series metrics `null`,
`unrealizedPnlPct: null`. The analytics *pipeline* is on the wire and tested; the *P&L-over-time product
surface* is waiting on two data feeds — a net-worth snapshot store and per-position cost basis. This is the
central "the engine exists ≠ the product ships it" distinction, and it must be stated plainly wherever these
numbers appear.

> **Roadmap — tagged.** Historical net worth and P&L over time (daily / weekly / monthly / yearly /
> all-time), volatility, and drawdown as *shipped product figures* depend on: (a) a `SnapshotStore`
> implementation that appends a net-worth point on each analysis and persists the series, and (b) a
> cost-basis source that populates `costBasisMicros` and a `CashFlow` feed for flow adjustment. Until both
> land, the product shows the honest empty state, not a number. The math is done; the memory isn't.

---

### 2.4 · Efficient refresh — no unnecessary requests

"Real-time" must not mean "hammer the RPCs." Performance reads the **Asset Engine (Chapter 6 / Chapter 11),
never the chain directly** — the Portfolio layer consumes valued, deduplicated holdings; it does not open its
own sockets. Two shipped mechanisms keep refresh cheap and correct.

**Batched, fail-soft reads.** The balance layer fetches every chain in parallel and degrades per-source
rather than globally. In [`apps/web/src/balances.ts`](../../apps/web/src/balances.ts), all native balances
across mainnet and testnet plus the price feed are issued in a single `Promise.all`, and each read is wrapped
so a failing chain becomes `null` — *"—"* — instead of throwing away the whole view or, worse, reading as
`$0`:

```ts
const nullable = (p: Promise<number>): Promise<number | null> => p.then((n) => n, () => null);
```

The USD total is gated on `anyPrice`: if *every* price feed is down, `totalUsd` is `null`, not `0`. A network
failure is never a valuation. This is the four-state balance honesty (loaded / loading / partial / failed)
that Chapter 6 specifies and that performance inherits wholesale — you cannot compute an honest P&L on top of
a dishonest balance.

**The load-concurrency (liveness) guard.** Refreshes overlap — a user pulls-to-refresh while an auto-refresh
is in flight, or switches accounts mid-load. Without a guard, a slow earlier response can land *after* a fast
later one and overwrite fresh data with stale data. The shipped fix is a monotonic run id: each `load()`
increments a ref and only commits state if it is still the latest invocation. From
[`apps/mobile/ScreenHome.tsx`](../../apps/mobile/ScreenHome.tsx) (mirrored in `ScreenPortfolio.tsx`):

```ts
const my = ++runId.current;
// … await the reads …
if (my !== runId.current) return; // a newer load (or an unmount) superseded this one
```

This is not a micro-optimization; it is a *correctness* guard. It guarantees the number on screen is the
result of the most recent request, and it prevents wasted commits (and the flicker they cause) from
superseded loads. Combined with reading through the Asset Engine's own caching, it satisfies §4's "refreshing
efficiently, without unnecessary requests" without ever showing a stale or out-of-order figure.

---

### 2.5 · The narrator explains; it never promises

Every performance figure above is produced by deterministic code. The AI's only role — the narrator boundary
specified in Chapter 9 and formalized for this chapter in §9 — is to *explain* those figures in plain
language, citing them by their verified metric ids. It may say *"your portfolio is down 4% from its peak this
month,"* pointing at `currentDrawdown`. It may **not** say *"it should recover soon,"* invent a return the
engine returned `null` for, or promise a profit. The narrator's citations are reconciled against the computed
intelligence and a narrative that cites a figure the engine didn't produce is rejected outright
(`NARRATION_UNVERIFIED`). Performance is where the temptation to reassure is strongest and where the AI must
be most disciplined: it reports the number, names the method, and stops.

---

### 2.6 · Shipped vs roadmap — the honest ledger for this section

| Capability | Status | Where |
|---|---|---|
| Unrealized P&L (mark − cost), same-set denominator, `null` when cost basis unknown | **Shipped engine** | `performance.ts` |
| Realized P&L via lot matching (FIFO / LIFO / HIFO / AVERAGE), exact bigint cost split, unmatched surfaced | **Shipped engine** | `tax.ts` |
| TWR (flow-adjusted), growth, volatility, max/current drawdown | **Shipped engine**, dormant without history | `performance.ts`, `stats.ts` |
| `hasHistory: false` honest empty state (never fabricate a series) | **Shipped** | `performance.ts` |
| Fail-soft batched reads · `null`-not-`$0` valuation | **Shipped** | `balances.ts` |
| Load-concurrency / liveness guard | **Shipped** | `ScreenHome.tsx`, `ScreenPortfolio.tsx` |
| Cost basis on the live request path (so unrealized P&L renders in-product) | **Roadmap** | `insights.ts` supplies none today |
| Persistent net-worth snapshot store (so daily/weekly/monthly/yearly/all-time P&L render) | **Roadmap** | `SnapshotStore` seam defined, not implemented |
| `CashFlow` feed for flow-adjusted return in-product | **Roadmap** | seam defined (`types.ts`), not wired |

The rule that unifies the table: **a number is computed or it is absent — it is never invented.** The
performance brain is built and tested; two data feeds stand between it and a P&L-over-time product surface,
and until they land, the honest empty state is the correct answer, not a zero and not a guess.


## §3 · Asset Allocation & Diversification

Net worth (§1) answers *how much*. This section answers the next two questions a wealth command center
owes its owner: **where is the money**, and **how concentrated is it**. Both are pure, deterministic
readings over the same normalized snapshot the rest of Chapter 12 consumes — and both obey the single
discipline that governs this whole engine: a number is *computed* from real balances × real prices in
integer µUSD, never invented; an unpriced holding is *labelled*, never silently valued at $0; and when the
AI speaks about it, it **explains, it does not instruct.**

This section describes SHIPPED code. The Allocation Engine, the concentration primitives, and the
explain-not-instruct insight/narration path all exist today in `packages/intelligence`. What is *not* here
— a concentration heatmap over time, a one-tap rebalance simulator — is tagged ROADMAP where it appears and
lives in §7 (timeline) and §8 (simulator). The engine exists; the product does not ship every view of it.

---

### 3.1 · The Allocation Engine — five axes over one gross book

Allocation begins where §1 ends: with the **normalized portfolio** (`normalize()` in
`packages/intelligence/src/positions.ts`). Normalization has already resolved every position's asset class
and liquidity, computed its signed contribution to net worth, and — critically for this section — split the
book into **gross assets** and **debt**. Allocation is a view of *gross assets only*. Borrowing is not an
allocation; it is leverage, and it is scored as leverage in the risk engine (§4/§7). Excluding it is what
lets every slice be an honest *share of what you own*, with the weights summing to 1.

`computeAllocation(np)` (`allocation.ts`) groups those gross positions along **five axes** in a single pass
each, via a shared `groupBy` helper. The axes are not arbitrary — each answers a different concentration
question a real portfolio owner asks:

| Axis | Group key | The question it answers |
|---|---|---|
| **`byAsset`** | uppercased symbol (`BTC`, `ETH`, `SOL`, `USDC`…) | *What do I actually hold?* — the BTC / ETH / stablecoin / SOL / others view. |
| **`bySector`** | `AssetClass` (`native`, `stablecoin`, `bluechip`, `defi`, `meme`, `nft`, `rwa`, `lp`, `unknown`) | *What kind of thing is it?* — risk-on vs. dry powder vs. long-tail. |
| **`byChain`** | chain id | *Where does it live?* — single-chain blast radius. |
| **`byProtocol`** | protocol id, or `wallet` for spot | *What is it deployed in?* — smart-contract exposure. |
| **`byLiquidity`** | `liquid` / `locked` / `illiquid` | *Can I actually move it?* — how much is reachable now. |

Each axis produces an ordered array of `AllocationSlice` — and every slice carries **both** representations
of the money, deliberately:

```ts
interface AllocationSlice {
  key: string;
  valueMicros: bigint;   // integer µUSD — the source of truth, exact
  weight: number;        // valueMicros ÷ grossAssetsMicros, a dimensionless ratio in [0,1]
}
```

This is the money-vs-ratio rule of the engine made concrete (see `types.ts`). The **value** is a `bigint` in
µUSD (1 USD = 1,000,000 µUSD) — never a float, so no dust ever rounds into or out of existence. The
**weight** is a `number`, and that is correct: a weight is a proportion, not money, so float precision on it
is a presentation concern, not a value-integrity one. The conversion is the one-line `ratio(part, whole)`
helper, which returns `0` when the whole is `0n` — a zero-net-worth wallet produces empty slices, never a
divide-by-zero and never a fabricated 100%.

Slices sort **descending by value, ties broken by key** — so the headline slice is always the largest real
position and the order is stable across reads (no jitter between two identical snapshots). The engine also
lifts one convenience figure out of the sector axis: `stablecoinWeight`, the share of gross assets sitting in
stablecoins — the "dry powder" buffer the insight engine reasons about below.

#### Worked example — every number traced to its source

Take a real four-asset book (the wallet's native universe plus a stable):

| Holding | Amount × price | `valueMicros` (µUSD) | `weight` |
|---|---|---|---|
| BTC | 0.5 × $60,000 | `30_000_000_000n` | 0.60 |
| ETH | 4 × $2,500 | `10_000_000_000n` | 0.20 |
| USDC | 6,000 × $1 | `6_000_000_000n` | 0.12 |
| SOL | 40 × $100 | `4_000_000_000n` | 0.08 |
| **Gross** | | **`50_000_000_000n`** | **1.00** |

`byAsset` is the four rows above, in that order. `bySector` collapses BTC + ETH + SOL into `native`
(0.88) and leaves `stablecoin` at 0.12, so `stablecoinWeight = 0.12`. Nothing in this table is estimated:
each `valueMicros` is `assetValueMicros(baseUnits, decimals, priceMicros)` computed with integer math in the
portfolio money core, and each `weight` is that integer divided by the integer gross. The "60%" the UI shows
for BTC is `30_000_000_000n ÷ 50_000_000_000n` — a fact, not a guess.

**Drill-down** is just the same slice list read at a finer axis. Tapping BTC's 60% slice does not recompute
anything new; it re-groups that asset's positions `byChain` and `byLiquidity`, so the owner can see that
their 60% BTC is, say, 55% native L1 and 5% wrapped on an L2 — the "chains are invisible until you want to
see them" promise (Ch1) applied to allocation. `byAsset` merges an asset across chains into one weight
(that is the top-line answer); `byChain` and `byProtocol` are the expansions underneath it.

---

### 3.2 · The Diversification Engine — concentration, measured not asserted

"Diversified" is a word people use loosely; this engine gives it a number.
`computeConcentration(byAsset)` (`allocation.ts`) evaluates concentration over the **asset-level** weights —
and the choice of axis is load-bearing. Concentration is measured `byAsset`, not `byChain` or `byProtocol`,
because **ETH held across three chains is one bet, not three.** Splitting it across chains does not diversify
you against ETH's price; measuring at the asset level is what makes the score honest about your *real*
exposure rather than flattered by chain-spreading.

Four figures come out, all pure functions of the weight vector:

| Metric | Formula | Reads as |
|---|---|---|
| `hhi` | Σ wᵢ² (the Herfindahl-Hirschman Index) | 0 → perfectly spread; 1 → everything in one asset. |
| `effectivePositions` | 1 ÷ HHI | "You are effectively holding *N* independent bets." |
| `topAssetWeight` | max(wᵢ) | The single largest position's share. |
| `top3Weight` | Σ of the three largest wᵢ | How much rides on your top three. |

The HHI is computed by the `hhi()` primitive in `stats.ts` (`Σ wᵢ²`), the same quant core the risk engine
reuses — one definition, tested to exhaustion, shared. Its inverse, **effective positions**, is the figure
that translates the index into something a non-quant understands: an HHI of 1.0 is 1 effective position;
0.25 is 4; a truly flat ten-asset book is 10. It is the honest antidote to the "I hold twelve tokens so I'm
diversified" illusion — if eleven of them are dust and one is 95% of the book, the engine reports ~1.1
effective positions and the truth is out.

Running the §3.1 example through it:

```
weights           = [0.60, 0.20, 0.12, 0.08]
hhi               = 0.36 + 0.04 + 0.0144 + 0.0064 = 0.4208
effectivePositions= 1 / 0.4208 ≈ 2.38
topAssetWeight    = 0.60
top3Weight        = 0.60 + 0.20 + 0.12 = 0.92
```

So: four holdings, but the concentration of roughly **2.4 effective positions**, with 60% in one asset and
92% in the top three. That is the difference between counting holdings and measuring concentration — and it
is exactly the difference the owner needs to see.

A note on where the *score* lives. `computeConcentration` produces the raw concentration primitives; the
`0–100` **diversification score** (and its two bases — HHI-only `weights` vs. correlation-adjusted
`correlation` when per-asset return series are available) is assembled in the risk engine and covered in §4
(the Health Score) and §7 (the Risk Dashboard). This section owns the *measurement* of concentration; those
sections own the *scoring and grading* of it. The primitives here are what they build on.

---

### 3.3 · The hard rule: the AI explains, it does not instruct

This is the line that must never be crossed, and it is enforced in code, not left to a prompt's good
manners. The concentration numbers above are inert facts. The moment we describe them to a human, personality
(Ch2) and the narrator boundary (Ch9) take over — and both are built to **explain a risk and hand the
decision back**, never to issue a trade instruction.

The canonical shape, straight from the Financial Brain's recommendation engine (Ch9 §9), is:

> *"You currently hold 82% in one asset. If diversification is one of your goals, you may wish to review your
> allocation."*

Read what it does and does not do. It **states a computed fact** (82%, a real `topAssetWeight`). It
**conditions on the user's own goals** ("if diversification is one of your goals") rather than assuming them.
It **suggests a review**, not an action. What it never says is *"you should sell BTC,"* *"move 40% into
stablecoins,"* or *"the price will drop."* No profit promise, no urgency, no instruction. That is the Ch2
personality contract — recommendations are *explainable, relevant, non-intrusive* — written down as behavior.

This is not tone advice; it is structurally guaranteed by two mechanisms already shipped:

**1 — Insights are evidence-bearing suggestions, never commands.** When BTC crosses the configured
`maxAssetWeight`, `generateInsights` (`insights.ts`) emits `CONCENTRATION_SINGLE_ASSET`:

```ts
{
  code: 'CONCENTRATION_SINGLE_ASSET',
  severity: 'warn',                    // 'critical' only if it exceeds the threshold by > 0.2
  title: 'High single-asset concentration',
  detail: 'BTC is 60% of your portfolio — a drop here moves your whole net worth.',
  evidence: [                          // the exact metrics that fired the rule — verifiable
    { metric: 'concentration.topAssetWeight', value: 0.60 },
    { metric: 'policy.maxAssetWeight',        value: 0.40 },
  ],
  suggestedAction: 'Consider trimming this position toward a more balanced allocation.',
}
```

Three things make this safe. The rule fired on a **threshold crossing over a verified number**, not a
vibe — and it attaches the `evidence` (`topAssetWeight = 0.60` vs. the balanced preset's
`maxAssetWeight = 0.40`) so the claim is auditable to its inputs (Doctrine #8). The `suggestedAction` is
phrased *"Consider trimming…"* — advice, in the subjunctive — and it is inert data: the intelligence engine
**cannot execute**, so even a maximally assertive string can do nothing but inform (the same discipline runs
through the chain, protocol, and stablecoin-buffer rules). And the thresholds themselves are a
**configurable `InsightPolicy`** (`conservative` / `balanced` / `aggressive` presets), so "too concentrated"
is the *user's* posture, not the engine's opinion imposed on them — a conservative owner is warned at 30%, an
aggressive one not until 60%.

**2 — Narration cannot fabricate a figure.** The `'diversification'` narrative (`TemplateNarrator` in
`narrator.ts`) turns the concentration numbers into prose — "Effective positions: 2.4 (HHI 0.421). BTC
dominates at 60%." — and every figure it utters is drawn through `cite()`, which resolves the metric against
the verified `PortfolioIntelligence`. `verifyNarrative()` then re-checks **every citation** before the text
is allowed out: a diversification narrative may cite `concentration.hhi`, `concentration.topAssetWeight`,
`allocation.topAsset`, `allocation.stablecoinWeight`, and `risk.diversificationScore` — and any citation
that does not reconcile to the value the engine actually computed **fails the guard and the narrative is
rejected** (`NARRATION_UNVERIFIED`). An LLM narrator can be plugged in behind this same interface and it
still cannot invent an 84% where the engine holds 60% — the deterministic layer holds the pen on numbers;
the AI only gets to choose the words around them. This is the AI-narrator boundary of Ch9, enforced at the
allocation surface.

---

### 3.4 · Honesty: an unpriced category is labelled, never silently $0

The allocation view is a place where a lazy implementation would quietly lie, so the discipline here is
explicit. Three honesty rules bind this section, each inherited from the four-state balance doctrine (Ch6,
`apps/web/src/balances.ts`) and Doctrine #3:

**A network failure is never a slice of $0.** Balances are read fail-soft: a chain whose RPC errors comes
back `null` ("—"), not `0`. A `null` read must never be laundered into a `0n` value and dropped into the
allocation as "you hold nothing here." If a chain could not be read, the honest allocation is a **partial**
one — the reachable assets sum to their real weights and the view is labelled *"partial — one or more
sources could not be read,"* exactly as §1 labels the net-worth total. We never show a confident pie chart
computed over half the book.

**An unpriced asset is labelled, not valued at $0.** This is the subtle one. Weights are computed over
`valueMicros`, and an asset the price feed cannot quote carries `priceUsd: null` and `valueMicros: 0n`
(`UnifiedAsset`, `packages/portfolio`). If such an asset were fed into a slice unremarked, it would land as a
0% weight and effectively **vanish** from the allocation — a silent lie that says "you don't hold this."
The discipline: an unpriced holding is surfaced as its own **labelled "Unpriced" line** (the amount is
known and real; only the USD value is unknown), *excluded* from the priced-weight denominator so the priced
slices stay honest, and never folded into "others" as if it were worth nothing. Unpriced ≠ $0 is the same
truth as network-fail ≠ $0, one layer up. (Note the distinction from the `unknown` **asset class**: `unknown`
means "we couldn't classify what *kind* of asset this is" and still has a real price and weight; *unpriced*
means "we couldn't value it" — two different honesty states, never conflated.)

**Staleness is carried, not hidden.** Every level of the pipeline propagates a `stale` flag — from a stale
price on a `UnifiedAsset`, up through `NormalizedPortfolio.stale`, to `PortfolioIntelligence.stale`. If any
price feeding an allocation was flagged stale, the whole view says so. A number computed from a stale input
is still shown — refusing to show it would be its own dishonesty — but it is shown *wearing a timestamp*, so
"60% BTC" is never mistaken for "60% BTC, live" when it is "60% BTC, as of 40 minutes ago."

Together these make the allocation view answer *where is my money* with the same rigor §1 uses for *how
much* — full when it can be, labelled-partial when it can't, and never confident about money it could not
actually see.

---

### 3.5 · Shipped vs. roadmap for this section

| Capability | Status |
|---|---|
| Five-axis allocation (asset / sector / chain / protocol / liquidity), bigint-valued, weight-normalized | **SHIPPED** — `computeAllocation`, `allocation.ts` |
| Drill-down from an asset slice into its chain / protocol / liquidity composition | **SHIPPED** — re-group over the same slices |
| HHI, effective positions, top-asset, top-3 concentration | **SHIPPED** — `computeConcentration` + `hhi()` in `stats.ts` |
| Explain-not-instruct concentration insight with evidence + configurable posture | **SHIPPED** — `CONCENTRATION_SINGLE_ASSET`, `insights.ts` |
| Verified, non-fabricating diversification narrative | **SHIPPED** — `TemplateNarrator` + `verifyNarrative`, `narrator.ts` |
| Concentration / allocation **drift over time** (how my mix changed) | **ROADMAP** — needs the historical snapshot store (§1/§7); no long-term series yet |
| One-tap **rebalance simulator** ("show me at a 40% cap") | **ROADMAP** — the portfolio simulator lives in §8; today only the read-only `scenario()` what-if exists |
| Target-allocation **goals** ("stay under 50% in one asset") | **ROADMAP** — the goal engine is §6 |

The measurement is done; the diachronic and prescriptive views are named honestly as future work. What
ships today is a complete, deterministic, honest answer to *where is my money and how concentrated* — with a
voice that describes the risk and returns the decision, every time, to the person who owns the funds.

The five acceptance checks this section must pass before it is called done are enumerated in **§9 (the
Narrator Boundary & Definition of Done)**; the concentration score and health grading that build on these
primitives are in **§4 (the Health Score)** and **§7 (the Risk Dashboard)**.


## §4 · The Portfolio Health Score

Every wallet can show a balance. Almost none can answer the question a real owner actually asks: *am I
in good shape?* The Portfolio Health Score is our answer — **one honest number, always with its reasons.**
Not a vanity gauge, not a credit score borrowed from a bank, not a black box that says "68" and dares you
to argue. It is a deterministic, explainable composite that reads the risk/health analytics of the
Intelligence Engine and collapses six independent signals into a single figure between 0 and 100, where
higher is healthier — and it hands you the *why* in the same breath as the *what*.

This section specifies the shipped composite (it is real: `computeRisk` in
`packages/intelligence/src/risk.ts` produces it today), the one law that governs it — **no score without an
explanation** — how it composes its sub-signals, and how it relates to the two neighbouring scores in the
system it must never be confused with: the per-transaction **Risk Score** (Chapter 10) and the **Identity
Security Score** (Chapter 5 §15).

---

### §4.1 · The one law: a number without a why is not shippable

The Financial Brain's cardinal boundary (Chapter 9) is that the AI *narrates* deterministic facts and never
invents them. The Health Score is where that boundary earns its keep, because a score is the most
fabrication-prone object in the whole product. A number is authoritative-looking by nature; a bare "72/100"
invites the user to trust it precisely when they cannot check it. So the Health Score obeys a rule stricter
than "don't lie": **it must carry its own justification, structurally, so that an unexplained score cannot
physically exist.**

That rule is enforced in the type system, not in a guideline. The engine never returns a scalar; it returns
a `RiskProfile` whose `healthScore` is accompanied by `healthFactors: HealthFactor[]`, and every
`HealthFactor` is:

```ts
interface HealthFactor {
  key: string;      // 'diversification', 'leverageSafety', …
  score: number;    // this factor's own sub-score, [0,100]
  weight: number;   // its share of the composite, [0,1]
  detail: string;   // a human one-liner: the reason
}
```

The `detail` is not decoration — it is the contract. `leverage 0.38 vs target 0.5`,
`24.1% of assets liquid`, `weights-basis diversification, 7 assets`. Each factor states, in plain terms, the
measured value and the target it was judged against. The composite is therefore always *decomposable*: the UI
can render the headline number and, on tap, the exact ledger of contributions that produced it. A user who
distrusts the score can audit it. The AI narrator (Chapter 9, and §9 of this chapter) is permitted to
describe the score only by citing these same factors — it surfaces the **weakest factor by sub-score** and
repeats its `detail` verbatim, so the explanation the user reads is the explanation the code computed, never a
plausible-sounding paraphrase. If a factor has no honest reason to report, it is not in the array, and it
contributes nothing to the number.

---

### §4.2 · The six sub-signals (shipped)

The composite blends six independent factors. Each is scored `[0,100]` on its own axis, higher = healthier,
and each is computed from analytics that are themselves deterministic (allocation, concentration,
performance) — never from a raw chain read, and never from the AI. The defaults live in
`DEFAULT_RISK_PARAMS`; they are policy, not physics, and are tunable per user posture (§4.5).

| Factor (`key`) | Measures | Sub-score formula (from `computeRisk`) | Default weight |
|---|---|---|---|
| `diversification` | Are you spread, or is it all one bet? | correlation- or weights-basis (see §4.3) | **0.25** |
| `leverageSafety` | How close is debt to a dangerous multiple? | `clamp(1 − leverage / targetMaxLeverage, 0, 1) × 100` | **0.20** |
| `liquidityHealth` | Could you actually get out if you had to? | `liquidWeight × 100` | **0.15** |
| `stablecoinBuffer` | Do you hold dry powder for dips and gas? | `clamp(stablecoinWeight / targetStableBuffer, 0, 1) × 100` | **0.10** |
| `stability` | How violent is the ride? *(needs history)* | `clamp(1 − volatilityAnnual / volCeiling, 0, 1) × 100` | **0.15** |
| `drawdownResilience` | How far below your peak are you? *(needs history)* | `(1 − currentDrawdown) × 100` | **0.15** |

Two things are worth reading off this table directly, because they are the honesty in the design.

First, **leverage is scored, not banned.** Debt does not add to net worth (Chapter 12 §1: a `borrowing`
position is *subtracted*); here it costs you health as it approaches `targetMaxLeverage` (default `0.5`, i.e.
debt at half of gross assets scores zero on this factor). A responsible borrow at 0.1× barely dents the
number; a stretched one at 0.4× visibly does — and the `detail` says exactly where you sit.

Second, **two of the six factors are conditional on history you may not have.** `stability` needs annualized
volatility and `drawdownResilience` needs a current-drawdown figure; both come from the Performance engine
(§2), both are `null` when there is no net-worth time series. A fresh wallet, or one whose long-term snapshot
store hasn't accumulated yet (that store is roadmap — §1), simply *omits* those two factors. Which raises the
question the composite has to answer honestly.

---

### §4.3 · The composite: a weighted blend that never lies by omission

The Health Score is a weighted average of whichever factors are actually present:

```
healthScore = Σ (factorᵢ.score × factorᵢ.weight)
```

The subtlety is what happens when a factor is missing. If the code kept the default weights fixed and simply
dropped `stability` and `drawdownResilience`, the two absent 15% slices would quietly vanish into the total —
a portfolio with no history would score out of 70 but be *presented* as if out of 100, silently deflating the
number. That is a lie by arithmetic, and the doctrine forbids it. So `computeRisk` **re-normalizes the weights
of the factors that are present** before blending:

```ts
const totalWeight = raw.reduce((sum, f) => sum + f.weight, 0);
// each present factor's weight becomes f.weight / totalWeight, so they sum to 1
```

A history-less wallet is scored on four factors whose weights are rescaled to sum to 1 (diversification
becomes 0.25/0.70 ≈ 0.357, and so on). The number is out of 100 because it is *genuinely* out of 100 over the
signals we can honestly measure — and the `healthFactors` array shows precisely four entries, so the user can
see that stability and drawdown weren't scored. **The absence is disclosed, not hidden.** This is the same
principle as the four-state balance honesty (`apps/web/src/balances.ts`: a failed read is `null`/"—", never
`$0`): a signal we cannot compute is never faked as a neutral or zero contribution.

Everything in this computation obeys the money-vs-ratio discipline that governs the whole engine
(`types.ts`). **Money is integer `bigint` µUSD** — the leverage ratio is `ratio(debtMicros, grossMicros)`
over bigint magnitudes; a weight is `part / whole` over bigint magnitudes. The *outputs* — scores, weights,
the leverage ratio, volatility — are dimensionless `number`s, and that is correct: a ratio is not money, and
rounding a score to two decimals is a presentation concern, not a value-integrity one. No float ever touches a
balance; no bigint is ever asked to be a percentage.

And the whole thing is **pure.** `computeRisk` reads no clock and no network; `PortfolioIntelligenceEngine.analyze`
is a pure function of the injected snapshot. The same portfolio always scores the same number, which is what
makes the score testable to exhaustion and the same on the device as on the server.

---

### §4.4 · How diversification composes its own sub-signal

`diversification` carries the heaviest weight (0.25) and is itself the most carefully built factor, because it
is the one most easily faked. Owning ten tokens that all move with ETH is *not* diversified, and a naïve
"count the positions" score would cheerfully claim otherwise. So the factor is computed **best-available on
two bases**, and it always tells you which one it used.

- **Correlation basis (preferred).** When we have per-asset return series covering the book, we compute the
  diversification ratio `DR = (Σ wᵢσᵢ) / σ_portfolio`, where `σ_portfolio = √(wᵀ Σ w)` uses the *real*
  correlation matrix (Pearson over the return series). Two assets that move together contribute little; the
  score is `clamp((DR − 1) / (√n − 1), 0, 1) × 100` — 100 only for `n` equally-weighted, uncorrelated assets.
- **Weights basis (fallback).** Without return coverage, we fall back to the effective number of positions
  from the Herfindahl index: `clamp((effectivePositions − 1) / (assetCount − 1), 0, 1) × 100`.

The honesty gate is the rule that decides between them: correlation basis is used **only if every material
asset (≥1% of the book) has a usable return series.** If even one material holding is uncovered,
`correlationDiversification` returns `null` and the factor falls back to weights — because a correlation
number computed over *some* of the book would silently ignore the uncovered assets and overstate how spread
you are. The chosen basis is stamped onto `diversificationBasis` and echoed in the factor's `detail`
(`weights-basis diversification, 7 assets`), so a user is never shown a correlation-grade claim built on
partial data. This is the health composite in miniature: prefer the stronger measure, refuse it the moment it
would require pretending.

---

### §4.5 · The score is only as honest as its inputs — and its posture

Two disclosures keep the number truthful in the messy real world.

**Stale and partial reads propagate.** The Health Score is computed over a `PortfolioSnapshot`, and if any
position or price feeding it was stale, `analyze` sets `PortfolioIntelligence.stale = true`. A score computed
over a partial book is a *provisional* score and must be labelled one in the UI — never presented as
authoritative. A network failure that dropped a chain's balances is not a healthier (or unhealthier)
portfolio; it is an *incomplete* one, and the honest move is to say so, exactly as the balance layer says "—"
rather than "$0". Unpriced ≠ $0; a missing read ≠ a neutral input.

**Posture is a parameter, and parameters are disclosed.** `RiskParams` (`targetMaxLeverage`,
`targetStableBuffer`, `volCeiling`, and the six `HealthWeights`) define what "healthy" *means*. A conservative
user who considers 0.25× leverage the ceiling will score the same portfolio lower than an aggressive user who
tolerates 1.0× — and that is correct, because health is relative to the posture you chose. What is *not*
acceptable is comparing two scores computed under different postures as if they were the same measurement. The
number therefore travels with the posture that produced it; the composite mirrors the insight engine's
preset model (`conservative`/`balanced`/`aggressive`) so the two agree on what they penalize.

---

### §4.6 · The charter's plain language vs. what actually ships

Chapter 12's opening promise renders health as a friendly line —
*Diversification: Good · Security: Excellent · Idle assets · Backup* — and it is worth being scrupulous about
which of those the composite score computes **today** versus which are **roadmap** or **live in a sibling
score.** Overstating this would be exactly the fabrication the doctrine forbids.

| Charter dimension | Where it lives today | Status |
|---|---|---|
| Diversification | `diversification` factor (correlation/weights) | **Shipped** in the composite |
| Liquidity | `liquidityHealth` factor | **Shipped** in the composite |
| Risk / volatility | `stability` + `drawdownResilience` + `leverageSafety` | **Shipped** (history factors when available) |
| Dry-powder buffer | `stablecoinBuffer` factor | **Shipped** in the composite |
| **Idle assets** | Surfaced as *insights* (`STABLE_IMBALANCE_IDLE`, `YIELD_OPPORTUNITY`) | **Not yet a health factor** — roadmap to fold in |
| **Security** | Identity Security Score (Ch5 §15); per-tx Risk Score (Ch10) | **Separate score today** — unified-health composite is roadmap |
| **Backup** | Identity Security Score (Ch5 §15) | **Separate score today** — roadmap to fold in |

The precise, honest statement: the **composite Health Score computes six portfolio signals** — diversification,
leverage safety, liquidity, stable buffer, stability, drawdown resilience. **Idle capital is detected and
surfaced as an insight** (the engine flags a large idle stablecoin balance or an available yield on a held
asset) but does **not** currently subtract from the composite number. **Security and backup are real, actionable
scores** — but they live in the Identity Security Score (Chapter 5 §15: *"92/100 · Backup enabled · Trusted
devices · One unknown session — review recommended"*), not inside this composite. The product vision of a
*single* "financial health" figure that folds portfolio health, idle-capital efficiency, and identity/backup
security into one number is a **roadmap** convergence, and until it ships we present the two scores as the two
things they are, each with its own reasons. "The engine exists" is not "the product ships it," and the health
composite is careful to claim only the six factors it actually computes.

---

### §4.7 · Three scores, three jobs — and why they never merge by accident

The system has three numbers that all look like "N/100," and the discipline is knowing which question each
answers. Conflating them would let a user think a green Health Score means a transaction is safe, or that a
low transaction Risk Score means their portfolio is well-built. It means neither.

- **The Risk Score (Chapter 10, `packages/risk`)** scores a *single pending action* — a contract call, an
  approval, a counterparty — through threat-intel lookup and heuristic detectors combined by
  `combineSignals`, and it drives a protective **verdict**: `allow` · `require_confirmation` · `block`. It is a
  **gate**: it can refuse to let money move. It is per-transaction, forward-looking, and adversarial.
- **The Identity Security Score (Chapter 5 §15)** scores the *account's defensive posture* — backup enabled,
  trusted devices, unknown sessions, passcode — and is actionable: each deduction names the fix.
- **The Portfolio Health Score (this section)** scores the *shape of what you already own* — how spread,
  how liquid, how leveraged, how volatile. It is a **mirror**, not a gate: it never blocks anything and never
  signs anything (`RiskProfile` is data; the engine "analyzes and recommends," per `types.ts`). It answers
  "how healthy is my position," which is a reflective question, not a permission question.

Keeping these on separate axes is a doctrine choice, not an accident of packaging. A protective gate that
could be quieted by a good-looking portfolio number would be a security hole; a reflective health mirror that
tried to double as a transaction gate would fail closed on the wrong things. They inform one another — a
critical Chapter 10 verdict *should* show up as an insight, and a collapsing Health Score *should* prompt a
security review — but they are computed independently, logged independently (Doctrine #8: every risky verdict
is auditable with its inputs), and presented as the three distinct answers they are.

---

### §4.8 · What the AI is allowed to say about the score

The narrator (`packages/intelligence/src/narrator.ts`) closes the loop. When it produces the `risk` narrative,
it does not editorialize the number — it cites `risk.healthScore` and `risk.diversificationScore` through
`resolveMetric`, sorts the `healthFactors` by sub-score, and reports the **weakest factor** with its computed
`detail`: *"Health is 74/100 with a diversification score of 61. The weakest factor is leverageSafety
(40/100): leverage 0.38 vs target 0.5."* Every figure in that sentence is checked by `verifyNarrative` against
the verified intelligence before the user ever sees it; a narrative that cites a number the engine didn't
compute is rejected outright. The AI **explains** the score and points at the softest spot; it never instructs
a trade, never promises the number will go up if you act, and never signs. Comprehension, then the user's own
decision — the score's whole job is to make the position legible, not to move money.

The Definition of Done for this score — that no `healthScore` is ever emitted without a populated
`healthFactors` array, that a partial read is labelled provisional, that the number is reproducible and
posture-stamped — is consolidated with the chapter's acceptance criteria in **§9 (the Narrator Boundary &
Definition of Done).**


## §5 · Cash Flow, Fee Analytics & Yield

> **Status legend** (per [`SECURITY.md §0`](../../SECURITY.md)): ✅ **Shipped** — implemented *and* tested
> in-repo, file cited · 🔶 **Partial** — one surface/seam exists, gaps named · ⏭ **Roadmap** — a binding
> requirement with a landing phase, **not** a claim that it runs. As Principal AI Engineer I sign only what
> is true. This section is the most **⏭-heavy** in Chapter 12 by design — and, like [Chapter 11 §5](../blockchain/asset-intelligence-reference.md)
> (which it depends on), it says so on every line. The recurring sentence you will read here is the honest
> one: *the reasoning is built and tested; the sensing that would feed it is roadmap.*

Where §1–§4 answered "what do I own and how healthy is it," this section answers the three questions that
turn a balance sheet into a **flow statement**: where did my money *go*, what did moving it *cost*, and what
is it *earning*? Three lenses — **flows**, **costs**, **returns** — and they share one discipline: a number
here is either a sum of **real settlement/transaction records** computed by deterministic code, or it does
not appear. A month we never observed is a **gap**, not a `$0` month; a fee we didn't measure is **unknown**,
not zero; a projected yield is an **estimate**, never a promise. Money is integer `bigint` µUSD end-to-end
(Doctrine #4); the AI *narrates and explains* these figures, it never *instructs* and never promises profits
(Ch2 personality, Ch9 narrator boundary).

One part of this section ships as tested engine math — the **fee cost-reduction insight** and the **yield
nudge**. Everything that would visualize flows over time, sum real fees from receipts, or track your *actual*
staking rewards is roadmap, and is tagged so.

---

### 5.1 Cash Flow — money in, money out, over time (⏭ roadmap; one primitive shipped)

The product promise (Chapter 12 §9) is a chart of **money in · money out · fees paid · rewards · yield ·
transfers**, trended over time. The honest state today is that **one** cash-flow primitive ships, and it
exists for a *different* purpose than the dashboard.

**What ships (✅).** The `CashFlow` type — `{ asOf: string; amountMicros: bigint }`, a signed µUSD deposit
(`+`) or withdrawal (`−`) — is real ([`intelligence/src/types.ts:94`](../../packages/intelligence/src/types.ts)).
It is consumed by exactly one place: the performance engine's `flowInPeriod`, which strips deposit/withdrawal
*timing* out of the return series so that time-weighted return measures the **portfolio's** performance, not
the user's contribution luck ([`intelligence/src/performance.ts:20`](../../packages/intelligence/src/performance.ts),
and see §2 for the full TWR treatment). That is a correct, tested use — but it is a *correction term for return
math*, not a categorized ledger of where money went. It knows a `+$5,000` landed on a date; it does **not**
know whether that was salary, a bridge-in, a loan draw, or an internal move between your own accounts.

**What the dashboard needs (⏭).** A cash-flow view requires two things we do not ship: (1) a **persistent,
categorized activity ledger** — every inflow/outflow tagged as income · spend · fee · reward · yield ·
internal-transfer — and (2) a **time series** to trend it against. The substrate for (1) exists in adjacent
form: the **Settlement Ledger** is an append-only, replayable record of every settlement transition
([`settlement/src/ledger.ts`](../../packages/settlement/src/ledger.ts)), and on-chain history supplies the
rest. But *categorizing* a transfer — telling a fee from a transfer, an internal move from real income — is
the roadmap work, and no shipped engine does it. For (2), the same gap that limits historical P&L (§2) applies
here: the `SnapshotStore.appendPoint` seam is defined ([`intelligence/src/sources.ts:21`](../../packages/intelligence/src/sources.ts))
but no long-term persistent store implements it yet. Without a history store there is no "over time."

**The honesty rule for this lens.** When cash-flow trending lands, it inherits the four-state balance contract
(Ch6 §8): a period we could not read is rendered as a **gap** — a hole in the chart with an honest label —
never back-filled to zero-flow. Zero flow means "we observed this window and nothing moved"; a read failure
means "we don't know," and the two must look different. Booking an unread month as `$0` would let a quiet
gap masquerade as a quiet month — the exact "network failure is not `$0`" violation (Doctrine #3) this whole
chapter exists to prevent.

---

### 5.2 Fee Analytics — what your activity costs (🔶 partial: the cost-reduction math ships; the fee sensing is roadmap)

Fees are the tax on movement, and the promise (Chapter 12 §10) is to total them by kind — **gas · bridge ·
swap · protocol** — and let the AI *highlight* where they can be cut. This is the one lens with a genuinely
shipped, tested piece of intelligence at its center.

**What ships (✅).** The `GAS_COSTS_HIGH` insight is real and tested
([`intelligence/src/insights.ts:260`](../../packages/intelligence/src/insights.ts)). Given a recent
gas-spend figure, it computes `gasWeight = gasSpendMicros ÷ netWorthMicros` deterministically and fires when
that share crosses a policy threshold — `maxGasSpendWeight`, which is `0.01 / 0.02 / 0.04` across the
conservative / balanced / aggressive presets ([`insights.ts:55,69,83`](../../packages/intelligence/src/insights.ts)).
It attaches **evidence** — the exact `gasSpendWeight` and the policy bound it crossed — so the finding is
verifiable, never asserted, and its `suggestedAction` is *"Batch transactions or route through a lower-fee
chain."* That is the AI **highlighting a cost-reduction opportunity** — a *suggestion*, propose-only. The
engine cannot act on it; the user or the Intent layer decides, and only an on-device signature disposes
(Ch9 narrator boundary; §9 of this chapter).

**What is roadmap (⏭).** The *input* to that insight — `gasSpendMicros` — is an **optional injected extra**,
not something the engine senses on its own ([`intelligence/src/engine.ts:57`](../../packages/intelligence/src/engine.ts)
`AnalyzeExtras`; [`insights.ts:99`](../../packages/intelligence/src/insights.ts) `InsightContext`). The
math that *judges* a fee bill is shipped; the **aggregator that builds it** — summing gas, bridge, swap, and
protocol fees out of real transaction receipts and route records — is not wired. This is the exact asymmetry
Chapter 11 §5 names for DeFi positions: **the reasoning is done, the sensing is not.** Until a fee aggregator
feeds `gasSpendMicros`, the insight simply does not fire — no placeholder bill, no borrowed number.

**Where each fee kind is computable (the roadmap's shape, not shipped code).** The point of naming the
taxonomy is that every figure has a *real* provenance waiting to be summed — none is invented:

| Fee kind | Provenance (real read to sum) | Status |
|---|---|---|
| **Gas** | `gasUsed × effectiveGasPrice` from each L1/L2 tx receipt — the same shape the `GasEngine` already *estimates* pre-sign ([`packages/gas/src/estimate.ts`](../../packages/gas/src/estimate.ts), wired into runtime execution) | 🔶 estimated forward; not summed backward |
| **Swap** | the DEX/aggregator fee leg of a route quote ([`packages/router`, `packages/providers`](../../packages/router/src/scoring.ts)) | 🔶 route seams partial (Ch11 §5.2) |
| **Bridge** | the bridge fee leg of a cross-chain route quote | ⏭ roadmap |
| **Protocol** | protocol-charged fees, read via the same `ProtocolAdapter` gap Ch11 §5.2 owns | ⏭ roadmap (no adapters shipped) |

The illustrative figure in the main chapter — *"Last month — Gas \$42 · Bridge \$18 · Swap \$9 · Total
\$69"* — is a **mock of the target layout**, not a reading. When it becomes real, each number is a sum of
integer-µUSD receipt fees, computed by deterministic code, and a fee we could not read is labelled unknown,
never folded into the total as `$0`.

**One adjacent, forward-looking piece is real, and I will not let it be mistaken for a fee ledger.** The
scenario engine models the *future* cost of a gas spike: a `GasProfile` (`nativeSymbol`, `nativePriceMicros`,
`gasUnits`, `currentGwei`) and a `gasPrice` what-if that returns the extra USD cost of your reference
operations as `gasCostDeltaMicros` ([`intelligence/src/types.ts:272,295`](../../packages/intelligence/src/types.ts);
`scenario.ts`). That is a **prospective** "what would a gas spike cost my typical ops," fed into the risk
dashboard (§7) — categorically different from the **retrospective** "what did I actually pay last month" the
fee ledger owes. One is a labelled projection; the other is a sum of records. We keep them apart.

---

### 5.3 The Yield Dashboard — current · historical · projected (⏭ roadmap; ties to Ch11 §5)

The promise (Chapter 12 §11) is to track **staking rewards · lending interest · LP fees · farming rewards**,
shown as **current · historical · projected**, with projections **clearly labelled as estimates.** This is
the roadmap-heaviest lens in the chapter, and its dependency is explicit: a yield dashboard is a *view over
DeFi positions*, and **Chapter 11 §5.2 ships zero protocol adapters to discover them.** The engine that would
reason over your staked ETH and your Aave supply is built and tested; nothing yet reads those positions off
the chain.

**What ships (✅) — the yield *nudge*, not the dashboard.** Two propose-only insights already turn idle
capital into a suggestion:

- `YIELD_OPPORTUNITY` ([`insights.ts:276`](../../packages/intelligence/src/insights.ts)) matches injected
  `YieldOpportunity` entries (`{ asset, apr, protocol }`, [`insights.ts:87`](../../packages/intelligence/src/insights.ts))
  against assets you **already hold idle**, and fires only when `apr ≥ policy.minYieldApr` (`0.03 / 0.04 /
  0.06` across presets, [`insights.ts:32`](../../packages/intelligence/src/insights.ts)) — *"Aave offers
  4.2% APR on USDC, which you already hold idle."*
- `STABLE_IMBALANCE_IDLE` ([`insights.ts:220`](../../packages/intelligence/src/insights.ts)) flags a large
  idle stablecoin balance whose *"capital could be earning yield."*

Both carry evidence, both are advice, neither auto-deploys — consistent with the AI-narrator boundary
(Ch9) and Ch11 §5.4: **no yield suggestion becomes an action without an on-device signature.** The opportunity
feed itself arrives as an injected `MarketEvent` of kind `'yield_opportunity'`, carrying an `apr`
([`intelligence/src/types.ts:251,262`](../../packages/intelligence/src/types.ts)) — a seam, awaiting a
real market-data source.

**What is roadmap (⏭) — the dashboard proper.** Tracking your *actual* earned yield — this LST's accrued
rewards, that lending position's interest, this LP's fee income — requires **discovering the positions
first**, and per Chapter 11 §5.2 no on-chain position discovery ships. The vocabulary is ready: `PositionKind`
already models `staking`, `lending`, `lp`, `yield`, and `reward` ([`types.ts:31`](../../packages/intelligence/src/types.ts)),
`Position` carries `costBasisMicros` and underlying `legs`, and a `reward` position *is* a claimable emission.
The engine can reason over all of it. But **"the engine exists" is not "the product tracks your yield,"** and
this chapter will not blur those two sentences.

**The three tiers, and the honesty each demands:**

| Tier | What it shows | Honesty contract | Status |
|---|---|---|---|
| **Current** | live APR + position value now | a real read once discovery lands; an LP/vault mark has no single price, so it carries the **`estimate` label** + its leg breakdown (Ch11 §5.3; `scenario.ts` constant-value AMM mark) | ⏭ (needs Ch11 §5 adapters) |
| **Historical** | yield earned to date | needs the same persistent history store §5.1 and §2 lack | ⏭ |
| **Projected** | expected forward yield | a **model output**, `apr × principal` — always labelled an estimate, **never a promise** | ⏭ |

**Projected yield is the sharpest honesty test in this section, so it gets its own rule.** A projected annual
yield is `APR × principal` — a *model output*, not an observation. The AI is permitted to say *"at today's
4.2% APR this would earn about \$210/yr — an estimate that moves with the rate,"* and it is **forbidden** to
say *"you will earn \$210."* An APR is not a guarantee; a projection is a labelled estimate; the AI never
promises profits (Ch2). This is not a stylistic preference — it is enforced downstream by the narrator gate
(§5.4).

---

### 5.4 The narrator gate — how a projected number stays honest

Everything above must eventually be *narrated*, and the anti-fabrication mechanism that keeps §1–§4 honest
extends to cover fees and yield. A narrative may cite **only** figures that resolve against verified
intelligence: `resolveMetric` maps a citation's metric id to the real value the engine holds
([`intelligence/src/narrator.ts:21`](../../packages/intelligence/src/narrator.ts)), and `verifyNarrative`
**rejects the entire narrative** if any citation fails to reconcile — an LLM narrator plugged in behind that
interface *cannot* fabricate a number ([`narrator.ts:57`](../../packages/intelligence/src/narrator.ts)).

The honest, roadmap-tagged detail: `resolveMetric` today whitelists a fixed set — net worth, health score,
leverage, TWR, concentration, and peers — and does **not yet** resolve a gas-spend figure or a projected-yield
figure. So the wiring that makes this section fully narratable is **⏭**: fee and yield metrics must be added
to the resolver whitelist, at which point the guard does exactly the work it must — even the AI's *projection*
becomes a citation of a number the deterministic engine computed and labelled an estimate, or the narrative is
thrown out. That is the machine that will keep *"this would earn about \$210/yr, an estimate"* honest and stop
*"you will earn \$210"* from ever passing: the projected figure is not free text, it is a verifiable citation
of a labelled estimate.

---

### 5.5 Honest status & the roadmap

| Capability | State | Evidence / landing |
|---|---|---|
| Cash-flow **primitive** (`CashFlow` for TWR flow-adjustment) | ✅ shipped | `intelligence/src/types.ts:94`; `performance.ts:20` |
| Categorized **cash-flow ledger + trend viz** | ⏭ roadmap | needs a persistent categorized ledger + history store (`sources.ts:21` seam only) |
| Fee **cost-reduction insight** (`GAS_COSTS_HIGH`, evidence + suggestion) | ✅ shipped | `intelligence/src/insights.ts:260` (tested) |
| Prospective **gas what-if** (`GasProfile`, `gasCostDeltaMicros`) | ✅ shipped | `intelligence/src/types.ts:272,295`; `scenario.ts` |
| **Fee aggregator** (gas/bridge/swap/protocol summed from receipts) | ⏭ roadmap | `gasSpendMicros` is an injected extra (`engine.ts:57`); no summer wired |
| Yield **nudges** (`YIELD_OPPORTUNITY`, `STABLE_IMBALANCE_IDLE`) | ✅ shipped | `insights.ts:276,220` (tested); `yield_opportunity` event `types.ts:251` |
| **Yield dashboard** (current / historical / projected) | ⏭ roadmap | requires Ch11 §5 protocol adapters (**zero shipped**) + history store |
| Narrator resolver for **fee/yield metrics** | ⏭ roadmap | `narrator.ts:21` whitelist does not yet include gas-spend / projected-yield |

The roadmap, in dependency order — each a binding requirement, none a running feature:

1. **Fee aggregator** — sum gas (from receipts, the shape `packages/gas` already estimates), then swap/bridge
   fees from route records, then protocol fees; feed `gasSpendMicros` and light up `GAS_COSTS_HIGH` on real data.
2. **Persistent categorized ledger + history store** — implement `SnapshotStore` and a tagged activity ledger
   (income · spend · fee · reward · yield · internal), unlocking the cash-flow *trend* and the yield *history*
   tiers, with unread periods rendered as honest **gaps**, never `$0`.
3. **DeFi position discovery** (Chapter 11 §5.2 `ProtocolAdapter` + registry) — the precondition for a real
   yield dashboard; current/projected yield surfaces only for positions actually discovered on-chain.
4. **Yield valuation + projection wiring** — LP/vault marks with the **`estimate` label** and leg breakdown;
   projected yield as `apr × principal`, labelled an estimate, plumbed through the narrator resolver so
   `verifyNarrative` can guard it.

Benchmarks we measure against and do not pretend to match: **Rotki** for cost-basis and fee/tax rigour,
**Zerion / Zapper / DeBank** for yield-position breadth, **Koinly** for categorized transaction history. Their
moat on this axis is a large maintained library of readers and categorizers; ours today is a clean set of
seams and two tested pieces of judgment — the fee insight and the yield nudge — behind them.

The rule that governs this section is the rule that governs the chapter: **a flow we never observed is a gap,
not a zero; a fee we never measured is unknown, not free; a yield we cannot discover is not displayed; and a
projection is always a labelled estimate, never a promise.** The engine that will reason over your flows,
your fees, and your yield is built and tested. The sensing that would feed it is labelled roadmap, above —
loudly, on purpose — and nowhere in this wallet does an unmeasured cost or an undiscovered yield quietly
become a confident dollar figure. Against a product category that routinely shows users phantom APR and
fee-free fantasies, that restraint *is* the feature.


## §6 · Goals, Benchmarks & the AI Portfolio Coach

Sections §1–§5 turned raw balances into a verified picture: what you own, how it has moved, how it is spread,
how healthy it is, what it costs to run. This section turns that picture *outward and forward* — it answers
the three questions a person actually carries in their head. *Am I getting where I want to go?* (goals). *Is
this good, or just good-looking?* (benchmarks). And the one they ask out loud: *"why did my portfolio drop,
and which asset should I look at?"* (the Coach).

All three ride the same spine, and it is worth naming that spine before we split them, because it is what
keeps this section honest. The engine **computes** every figure deterministically (§1–§5); a **Narrator**
turns those figures into prose but may cite *only* numbers that reconcile against the verified
`PortfolioIntelligence`; and nothing here ever signs or executes — it explains, and hands the decision back to
the user and the Intent layer. That is the Ch9 Financial-Brain contract ("propose, never dispose; numbers
computed, never invented") made concrete in code. Of the three, **the Coach ships in spirit today** on the
analytics and narrator that already exist; **Goals and Benchmarks are roadmap** — the *math* is largely
built, but the *product* waits on data we do not yet persist. We will be scrupulous about which is which,
because "the engine can compute it" is not the same claim as "the wallet ships it."

---

### §6.1 · The AI Portfolio Coach — answer with the user's own data

The Coach is not a chatbot with opinions. It is a question-answering surface laid over the verified
intelligence object, and its entire safety story is one function.

**The narrator boundary is the product.** `packages/intelligence/src/narrator.ts` defines a `Narrator`
interface whose only job is `summarize(intel, kind) → NarrativeReport`, and every report carries `citations`:
the exact `MetricRef`s the prose leans on. Before any narrative is shown, `verifyNarrative(report, intel)`
walks every citation and resolves it back through `resolveMetric` against the *same* verified intelligence —
and if a single cited figure fails to reconcile within a hair (`Math.abs(actual − cited) > 0.01`), the whole
narrative is **rejected**. The engine facade enforces this by default: `narrate()` throws
`NARRATION_UNVERIFIED` rather than emit an unverifiable sentence (`engine.ts`; `verifyNarration` defaults
`true`). The consequence is exact and worth stating plainly: **an LLM plugged in behind this interface cannot
fabricate a number.** It can choose words; it cannot choose facts. `TemplateNarrator` — fully deterministic,
no LLM — is both the production-safe default and the reference an LLM narrator is held to.

So the Coach's answers are not "generated." They are *retrieved and narrated* from analytics that were already
computed and already checked. When a user types "what's my biggest risk right now?", the Coach does not reason
about markets — it reads `risk.healthFactors`, sorts to the weakest, and narrates the one the engine already
scored lowest (exactly the `risk` narrative does today: `narrator.ts`, `kind: 'risk'`).

**What the Coach can answer today vs. what it must wait for.** The discipline is simple: the Coach can answer a
question *iff every figure the answer needs already lives in the verified snapshot*. Where the input exists, the
answer is a fact today. Where it does not, the answer waits on the data — and the Coach **says so** rather than
inventing it.

| User asks… | Needs | Source | Status |
|---|---|---|---|
| "How concentrated am I? What's my biggest position?" | current allocation + concentration | `computeAllocation`, `computeConcentration` | **Shipped** — fact today |
| "How healthy is my portfolio, and *why*?" | health score + per-factor breakdown | `risk.healthScore`, `risk.healthFactors` | **Shipped** — fact today |
| "What should I review next?" | ranked insights with evidence | `generateInsights` (11 rules, each with `evidence`) | **Shipped** — fact today |
| "Am I over-exposed to one chain / bridge / protocol?" | allocation slices + risk exposures | `allocation.byChain/byProtocol`, `risk.bridgeExposure` | **Shipped** — fact today |
| "What's my unrealized P&L on the positions I have a cost basis for?" | cost-basis-scoped mark-to-market | `performance.unrealizedPnlMicros` (only over positions with `costBasisMicros`) | **Shipped, scoped** — fact for covered positions; honestly silent on the rest |
| "How has my allocation changed since last month?" | a *prior* snapshot to diff against | (no long-term snapshot store) | **Roadmap** — see §2 |
| "Why did my portfolio drop this week? Which asset grew most?" | net-worth history + per-asset time series | `performance.twr` is `null` without history | **Roadmap** — see §2 |
| "Where did I pay the most fees?" | a per-tx fee ledger | today only the aggregate `GAS_COSTS_HIGH` insight if `gasSpendMicros` is supplied | **Roadmap** — see §5 |

The right-hand column is the whole point. The Coach's *machinery* — insight generation, narration, the
anti-fabrication guard — is shipped. The *data* that four of these questions need (a persisted net-worth
history, a per-asset return series, a fee ledger) is roadmap, blocked on the same missing snapshot store §2
names. So the truthful statement is: **the Coach can answer, today, every question whose inputs are in the
current verified snapshot, and it refuses the rest by name.**

**Refusal is a shipped behaviour, not a TODO.** The model for every roadmap answer already exists in the
weekly narrative: when there is no history, the Coach does not print a fabricated return — it says, in as many
words, that *performance history isn't available yet, so no return is reported* (`narrator.ts`, `weekly`
branch, the `!hasHistory` path). That sentence is the template for the whole roadmap column. "Which asset grew
most?" without a history store becomes *"I can't attribute growth over time yet — I don't keep a price history
for your assets. Here's your current allocation and unrealized P&L where I know your cost basis."* A network
failure is never rendered as "$0" and an unavailable series is never rendered as "0%"; the four-state balance
honesty (§1) propagates all the way up into what the Coach is permitted to say.

**Voice: it explains, it does not instruct, and it never sells.** Every insight carries a `suggestedAction`,
and the code comment is emphatic that this is *advice, never an executable step* — "the engine cannot act; the
user or the Intent layer decides" (`insights.ts`). The Coach inherits that posture and the Ch2 personality:
no profit promises, no FOMO, no "buy the dip." It surfaces *"your top asset is 82% of the book — a drop here
moves your whole net worth"* (a fact, with `concentration.topAssetWeight` as evidence) and stops. It does not
say *"sell some and buy X."* The line between "here is what is true about your money" and "here is what you
should do with your money" is the line between a coach and a salesman, and the narrator boundary is where we
draw it in code.

---

### §6.2 · The Goal Tracker — progress as a computed fact *(roadmap)*

Ch9 §10 commits the Brain to goals — long-term investing, capital preservation, passive income, a stablecoin
emergency reserve, tax preparation — and to *tracking progress over time.* The Goal Tracker is that commitment
rendered as a Ch12 surface. It is **roadmap**, and it is important to say *why* it is roadmap, because the honest
answer is unusual: most of the arithmetic already exists; what is missing is persistence and a target model.

A goal is a **target** plus a **deterministically-computed progress metric**. For the reserve and the holding
targets, that progress metric is already computed every analysis pass:

| Goal | Progress numerator (computed today) | What's actually missing |
|---|---|---|
| Emergency stablecoin reserve of *T* µUSD | `allocation.stablecoinWeight × netWorthMicros` | a stored *target T*, and persistence of progress |
| "Hold 1 BTC" / "$X in BTC" | the BTC slice of `allocation.byAsset` (value + amount) | a stored target + goal record |
| Capital preservation (stay within *d%* of peak) | `performance.currentDrawdown` (needs history) | history store §2, + the goal record |
| Passive-income share ≥ *p%* | yield-bearing weight | yield tracking (§5, roadmap) + the goal record |

Read that table the right way. The **buffer goal and the holding goal are one target field away from shipping**
— their progress is a ratio of two numbers the engine already produces, in bigint µUSD, every pass. The
preservation and income goals additionally need data that is itself roadmap (history for drawdown-over-time;
yield tracking for income). So "Goal Tracker: roadmap" decomposes into: the *math* is mostly shipped; the
*product* — a place to store a target, a record that persists progress across sessions, and a narration of it
— is not yet built.

Two doctrine rules govern how a goal is ever shown:

1. **Progress is a fact; a completion date is an estimate — and is labelled one.** "You hold 0.62 of your 1.0
   BTC target — 62%" is a ratio of verified numbers and may be stated flatly. *"On your recent pace you'll
   reach 1 BTC by March"* is a projection off a history series; it is an **estimate**, it is shown only when a
   history series exists (roadmap, §2), and it must carry the estimate label the way every projected figure in
   this chapter does. We never let a projection wear the clothes of a fact.
2. **A goal narrates, it never nags or promises.** Progress is framed as *"you're 62% toward this goal you
   set"*, never *"you're behind — add more BTC now."* The Coach's no-hype posture (§6.1) governs goal prose in
   full: it reports the number and, at most, points at the relevant insight (*"your stablecoin buffer is thin
   relative to this reserve goal"* — which is literally the shipped `LOW_STABLE_BUFFER` insight, re-framed
   against the user's own target).

The Goal Tracker, then, is the smallest true roadmap item in this chapter: a target store, a progress record,
and a narration — over arithmetic that is, for the headline cases, already done.

---

### §6.3 · The Benchmark Engine — context, not competition *(roadmap)*

The Benchmark Engine answers *"is this good, or does it just feel good?"* by placing the portfolio's return
next to a reference: all-BTC, all-ETH, a basket index, or plain stablecoins (a flat 0% — the "did I even beat
doing nothing" line). It is **roadmap**, gated on the same missing net-worth history store as §2's P&L, plus a
benchmark price-history source.

The framing matters more than the math, so it comes first. Benchmarks here are **for context, not
competition.** The design intent — and the constraint on the narrator — is that a benchmark *informs* and
never *induces*. The Coach may say: *"Over this window your book returned 4.1%; a 100% BTC book would have
returned 9.3%; stablecoins returned 0%."* It may **not** say: *"You underperformed BTC — you should have held
more."* The first is a neutral comparison of two computed series; the second is a profit-chasing instruction,
and it is exactly the manipulation the Ch2 personality and the Ch9 recommendation rules forbid. A benchmark
that makes a user feel behind and reach for leverage has failed even if every number in it is correct.

The machinery is mostly reuse. The portfolio's own return is already computed as a **flow-adjusted
time-weighted return** — `performance.twr`, which strips deposit/withdrawal timing so the number measures the
*portfolio's* behaviour, not the user's contribution luck (`performance.ts`). A benchmark's return over the
same window is the same computation over the benchmark's price series, using the same shipped quant primitives
(`simpleReturns`, the TWR product, `stdev`, and `beta` for correlation context) already exported from `stats`.
Nothing new needs inventing on the compute side.

What is genuinely missing — and why the tag is honest — is **data**, and the engine's own honesty is the proof:
without a history series, `computePerformance` returns `hasHistory: false` and `twr: null` and *refuses to
fabricate a series* (`performance.ts`, the `!hasHistory` early return; and its file comment: "the engine never
invents financial data"). A benchmark comparison built on a null `twr` would have nothing real to compare, so
the Benchmark Engine is honestly blocked on (a) the persisted net-worth history from §2 and (b) a
benchmark-price-history source. Until both exist, the right product behaviour is not a placeholder chart with
invented percentages — it is the Coach saying *"I can't compare you to BTC yet; I don't keep your net worth
over time."* Relative performance is computed from real aligned series, or it is not shown. There is no third
option where we make up "+12% vs BTC" to fill the panel.

---

### §6.4 · What ships, what waits

| Capability | Reuses | Status |
|---|---|---|
| **Coach Q&A over the current snapshot** (concentration, health-and-why, "what to review", exposure, cost-basis P&L) | `generateInsights` + `Narrator` + `verifyNarrative` | **Shipped in spirit** — engine + narrator boundary live; surfaced via `GET /v1/portfolio/insights` (`intents.ts`) → SDK `insights()` → the web Insights panel |
| **Anti-fabrication guard** — the Coach cannot cite an unreconciled number | `verifyNarrative` / `resolveMetric` (`narrator.ts`); `narrate()` throws `NARRATION_UNVERIFIED` | **Shipped** |
| **Honest refusal** — names the missing input instead of inventing it | `hasHistory:false` / `twr:null` paths | **Shipped** |
| **Underlying math** — weights, HHI, health factors, flow-adjusted TWR, cost-basis P&L, β | analytics (§1–§4) + `stats` | **Shipped** |
| **Goal Tracker** — targets + progress over time | `allocation.stablecoinWeight`, `allocation.byAsset`, net worth (all bigint µUSD) | **Roadmap** — needs a target/goal store + progress persistence (arithmetic largely done) |
| **Benchmark Engine** — vs BTC / ETH / index / stablecoins, for context | `performance.twr` + `stats` primitives | **Roadmap** — needs the §2 net-worth history store + a benchmark-price feed |
| **Persistence** — the single shared blocker | — | **Roadmap** — no long-term snapshot store, goal store, fee ledger, or benchmark feed yet |

Read down the Status column and the shape of this section is clear. The **thinking machinery is shipped** — a
Coach that answers from verified analytics, that cannot fabricate a figure, and that refuses by name what it
cannot yet know. The **forward-looking surfaces are roadmap**, and they share one root cause: we do not yet
*remember* your portfolio across time. Persist the net-worth history (§2), the goal targets, and the fee
ledger (§5), and Goals and Benchmarks light up on machinery that is already built and already honest — because
the discipline that governs them, the narrator boundary, does not change when the data arrives. It is the same
guard in §9, at the edge of everything this chapter computes: **the engine explains only what it can prove.**

The Risk Dashboard and the Financial Timeline that place these facts in time follow in §7.


## §7 · The Risk Dashboard & Timeline Engine

A balance answers *how much*. The Health Score (§4) answers *am I in good shape right now*. Neither answers
the question a seasoned owner asks last, and worries about most: **is my exposure drifting somewhere I did
not decide to go?** Concentration creeps. A "temporary" unlimited approval outlives the transaction that
needed it. A bridge position meant for a weekend becomes a quarter of the book. The Risk Dashboard is the
standing watch over those six slow leaks — and the Timeline Engine is the story that would let a user *read*
their own financial history back to themselves. One of these ships today, computed from real analytics. The
other is honestly named roadmap, because it needs a durable history the wallet does not yet keep. This
section specifies both, and — as everywhere in this chapter — draws the line between them in ink, not pencil.

The dashboard reads two sources it does not own: the **risk/health analytics** of the Intelligence Engine
(`packages/intelligence`, §1–§4) and the **approval analysis** of the Security & Trust Engine (Chapter 10).
It reads the Asset Engine (Chapter 11), never the chain (Doctrine: Chapter 12 consumes computed positions,
not raw RPC). Every figure it renders was produced by deterministic code somewhere upstream and is quoted
here with its provenance. The dashboard invents nothing; it *arranges* verified numbers into the six views a
risk-aware owner scans.

---

### §7.1 · The six exposures the dashboard watches

The dashboard is not a wall of metrics; it is six deliberate rows, each answering one failure question. Every
one resolves to a field that already exists in `RiskProfile`, `Allocation`, or `Concentration`
(`packages/intelligence/src/types.ts`), or to a Chapter-10 approval signal.

| Row | The failure it watches for | Computed from (real field) |
|---|---|---|
| **Asset concentration** | one holding sinks the whole book | `concentration.topAssetWeight`, `top3Weight`, `hhi`, `effectivePositions` — `computeConcentration` |
| **Stablecoin allocation** | no dry powder, or too much idle capital | `allocation.stablecoinWeight` — `computeAllocation` |
| **DeFi exposure** | a protocol exploit is an outsized hit | `allocation.bySector` (`defi` class) + `allocation.byProtocol` (ex-`wallet`) |
| **Cross-chain exposure** | a chain- or bridge-level incident traps value | `allocation.byChain` + `risk.bridgeExposure` — `computeRisk` |
| **Active approvals** | a compromised spender drains an old allowance | Chapter 10 `detectUnlimitedApproval` / approval signals (`packages/risk`) |
| **Illiquid positions** | you cannot get out when you need to | `risk.liquidWeight` / `lockedWeight` / `illiquidWeight` — `computeRisk` |

Five of the six read straight from the shipped Intelligence analytics. The sixth (approvals) reads the
Security Engine's per-approval analysis, which is real; the *standing inventory* of every live allowance is
the one partly-shipped piece, and §7.5 is scrupulous about which half exists.

---

### §7.2 · Every row is a computed number, never a mood

The discipline that governs the whole chapter governs each row: a figure is **computed, labelled, and
decomposable**, or it is not shown. Walk the six.

**Asset concentration.** `computeConcentration` (`allocation.ts`) returns the Herfindahl-Hirschman Index
`hhi = Σwᵢ²`, its reciprocal `effectivePositions = 1/HHI` ("you hold twelve tokens but effectively 3.4
independent bets"), `topAssetWeight`, and `top3Weight`. These are pure functions of the weight vector, which
is itself derived from bigint µUSD values (`NormalizedPosition.weight`). The dashboard renders the headline
(`topAssetWeight`) and, on tap, the full HHI ledger — the same decomposability the Health Score demands in §4.

**Stablecoin allocation.** `allocation.stablecoinWeight ∈ [0,1]` is the share of gross assets in stablecoins
— the "dry powder" buffer. The dashboard shows it against *both* rails the insight engine already enforces: a
**thin** buffer (`< minStableBuffer`) leaves nothing to buy dips or cover gas; a **bloated** one
(`> maxStableBuffer`) is capital sitting idle (`insights.ts`: `LOW_STABLE_BUFFER` / `STABLE_IMBALANCE_IDLE`).
One number, two failure directions, both labelled.

**DeFi exposure.** Read two ways: the `defi` slice of `allocation.bySector` (the sector view), and the
largest non-wallet slice of `allocation.byProtocol`. When a single protocol crosses `maxProtocolWeight` the
`PROTOCOL_CONCENTRATION` insight fires with the protocol id and its weight as evidence — *"41.2% of value is
deployed in aave-v3; a protocol exploit would be an outsized hit."* The dashboard is the standing surface for
that same fact.

**Cross-chain exposure.** Two distinct risks, kept distinct. `allocation.byChain` answers *how lopsided is my
chain mix* (and drives `CHAIN_CONCENTRATION` at `maxChainWeight`). `risk.bridgeExposure` answers a sharper
question — **how much of my net worth is only reachable through a bridge.** `computeRisk` sums
`p.valueMicros` for every non-borrowing position carrying a `bridge` tag and divides by gross assets. Because
bridges are the most-exploited layer in crypto, that number gets its own row and its own insight
(`BRIDGE_EXPOSURE_HIGH`), never buried inside a generic "chains" tile.

**Illiquid positions.** `computeRisk` splits the book three ways from `allocation.byLiquidity`:
`liquidWeight`, `lockedWeight`, `illiquidWeight` (each rounded to four places, each a ratio over gross). The
dashboard shows the illiquid and locked shares explicitly, because "you are worth $80k" means something very
different when $30k of it is locked staking with an unbonding period. `liquidWeight` also *is*
the `liquidityHealth` sub-signal of the Health Score — the dashboard and the score read the same primitive.

Across all six, the honesty rules of §1 hold without exception. Money underneath is integer bigint µUSD;
every ratio on the surface is a dimensionless `number` derived from it (the money-vs-ratio law in `types.ts`).
A **network failure is never rendered as `$0` or `0%`** — an exposure the engine could not compute reads as
*"—, unavailable"*, and `PortfolioIntelligence.stale` propagates a timestamp so a row computed from a stale
price wears its age. **Unpriced is not zero.** A row the dashboard cannot *positively* compute fails
closed to an honest gap, never to a confident-looking figure.

---

### §7.3 · Trends, not snapshots — what "over time" honestly means

The value of a risk dashboard is not the snapshot; it is the **derivative.** A 38% top-asset weight is fine;
a top-asset weight that went 22 → 30 → 38 over three checks is a story. So the design goal is a delta on
every row — *"▲ concentration since last check"* — and here the spec must be painfully precise about what is
shipped, because "the engine can compare two readings" is not "the product plots a trend."

**Single-step deltas are shipped.** The Intelligence Engine already compares *now* against *one prior
reading* supplied by the caller:

- `insights.ts` — `RISK_INCREASING` fires when `previousHealthScore − risk.healthScore ≥ healthDropDelta`,
  citing both scores as evidence: *"health fell from 71 to 58 since the last check."*
- `alerts.ts` — `LARGE_PORTFOLIO_MOVEMENT` fires when `|Δ net worth|` versus `previousNetWorthMicros` crosses
  `largeMovePct`, and the *direction* is part of the dedup key (`movement:up` / `movement:down`).

Both take the prior value as an **input** (`AnalyzeExtras.previousHealthScore`, `AlertContext.previousNetWorthMicros`).
That is genuinely a trend signal — *risk moved, and by how much* — and it ships today. Any dashboard row whose
previous value is passed in can therefore show an honest "since last check" arrow.

**Multi-point trend curves are roadmap.** A sparkline of concentration over eight weeks, a bridge-exposure
line creeping up across a quarter, a "your illiquid share has grown every month" narrative — these need a
**durable time series of each risk dimension**, not a single remembered scalar. The seam exists:
`SnapshotStore` in `sources.ts` (`loadHistory` / `appendPoint`) is the interface a history store plugs into,
and `Performance.series` already threads net-worth points where history *is* supplied. But no long-term
snapshot store is populated in production yet (§1 says so plainly), and — critically — today's history seam
stores **net worth**, not a per-dimension risk vector. Charting concentration-over-time requires persisting
`{ asOf, topAssetWeight, bridgeExposure, illiquidWeight, healthScore, … }` per reading, which is new storage.

| Trend capability | Status |
|---|---|
| "Since last check" delta on health, net worth (now vs one supplied prior reading) | **SHIPPED** — `RISK_INCREASING`, `LARGE_PORTFOLIO_MOVEMENT` |
| Per-row delta arrow when a previous value is provided by the caller | **SHIPPED** — same mechanism, generalized to any row |
| Multi-point sparkline per risk dimension (concentration/bridge/illiquid over weeks) | **ROADMAP** — needs a populated per-dimension snapshot store |
| "Your bridge exposure has risen every month this quarter" narrative | **ROADMAP** — needs the same durable history + the Timeline Engine (§7.6) |

The honest present is a dashboard that shows *what changed since I last looked*; the honest future is one
that shows *how it has drifted for a season*. We ship the first without dressing it as the second.

---

### §7.4 · The alert layer — risk that changes announces itself

A dashboard is passive; risk that moves should not wait to be looked at. The **alert engine** (`alerts.ts`)
is the active half, and it is built to be trustworthy in two ways that matter here.

First, it is **stateful and quiet.** Insights describe a standing shape; alerts fire on a *change* and must
not spam. Every candidate carries a dedup `key`, and `evaluateAlerts` suppresses a re-fire inside a
`cooldownHours` window against the persisted `AlertState.lastFired`. Second, it is **deterministic**: `now`
is passed in, never read from a clock, so the whole engine is a pure function of
`(prevState, context, now) → (alerts, nextState)` and is exhaustively testable.

The risk-relevant alerts the dashboard surfaces:

| Alert | Fires on | Severity |
|---|---|---|
| `RISK_THRESHOLD_EXCEEDED` | `healthScore < minHealthScore` (default floor 40) | critical |
| `EXTREME_VOLATILITY` | `volatilityAnnual ≥ extremeVolAnnual` | warning |
| `LARGE_PORTFOLIO_MOVEMENT` | `|Δ net worth| ≥ largeMovePct` vs the last reading | warning |
| `BRIDGE_EXPLOIT` / `PROTOCOL_HACKED` | an injected `MarketEvent` **filtered to entities the user owns** | critical |
| `WALLET_INACTIVITY` | `daysBetween(lastActivityAt, now) ≥ inactivityDays` | info |

The event-driven alerts earn their place by a discipline worth stating: `BRIDGE_EXPLOIT` and
`PROTOCOL_HACKED` only fire when the affected subject appears in `ownedBridges` / `ownedProtocols`
(`has(...)` in `collectCandidates`). The user is told about the bridge *they* are exposed to, not every
exploit on crypto Twitter — signal, not noise. Every alert carries `evidence: MetricRef[]`: the exact metric
ids and values that tripped it, so an alert, like a score, can be audited rather than merely believed.

---

### §7.5 · Active approvals — the standing liability crypto forgets

Of the six rows, approvals is the one where the biggest risk is *forgetting*. An ERC-20 approval outlives its
transaction; an "infinite" allowance granted to a DEX router in 2023 is still a live drain vector in 2026 if
the spender is ever compromised. The dashboard's approvals row is where that latent liability becomes visible.

**What ships today: per-approval risk.** The Security & Trust Engine (Chapter 10) and `packages/risk` analyze
an approval when it is *proposed or inspected*. `detectUnlimitedApproval` (`packages/risk/src/detectors.ts`)
flags any allowance at or above `2²⁵⁵` base units as effectively unlimited, emitting an `UNLIMITED_APPROVAL`
signal — *"Unlimited USDC allowance to 0x1f…9a — a compromised spender could drain it all."* Policy can
**block** it outright (`blockUnlimitedApproval` in `policy.ts`), and Chapter 10's Approval Analyzer additionally
detects hidden approvals, dangerous spenders, expiration, and a *suggested limited amount*. That analysis is
real and shipped, per-subject.

**What is roadmap: the standing inventory.** A per-approval verdict at signing time is not the same as *a
live list of every active allowance across all my chains, with a one-tap revoke.* Building that row requires
an **allowance-enumeration read** — scanning approval/allowance state for the wallet's addresses — which is a
new Asset/Security Engine capability, not something the Intelligence analytics compute from a position
snapshot. So the honest split is:

| Approvals capability | Status |
|---|---|
| Per-approval risk scoring (unlimited / dangerous spender / suggested limit) | **SHIPPED** — Ch10 Approval Analyzer + `detectUnlimitedApproval` |
| Policy that blocks unlimited approvals before signing | **SHIPPED** — `blockUnlimitedApproval` |
| Standing inventory of all live allowances + revoke-from-dashboard | **ROADMAP** — needs an allowance-enumeration read across addresses |

And the doctrine holds at the boundary: the wallet **proposes** a revoke, it never auto-revokes. The AI
*explains* the liability — Chapter 10's voice: *"this contract can keep spending your USDC until you revoke
it; consider a limited approval"* — and hands the decision, and the on-device signature, back to the owner
(Doctrine #2: AI proposes, code verifies, the device disposes). Revoking is a fund-touching action; only a
signature the user makes can perform it.

---

### §7.6 · The Timeline Engine — a financial narrative (roadmap)

The Risk Dashboard shows the present with a whisker of the past. The **Timeline Engine** is the ambition to
show the *whole* past as a legible story: *bought BTC in March → salary deposit → staked SOL → first yield
accrued → BTC hit an all-time high → a large transfer out.* Not a raw transaction log — the block explorer
already exists and is unreadable — but a **curated financial narrative** that turns a wallet's real history
into something a person recognizes as their own. **This is roadmap, and named as such**, for one concrete
reason: it requires a durable, append-only **history and event store** the product does not yet keep.

What is *already* true is that the vocabulary of a timeline exists in the type system — the primitives are
built, only the durable store and the assembler are not:

| Timeline primitive | Where it lives (shipped type) | What it contributes |
|---|---|---|
| `Position.lastActivityAt` | `types.ts` | when a position last moved (also drives inactivity alerts) |
| `CashFlow { asOf, amountMicros }` | `types.ts` | deposits / withdrawals — *"salary in", "large transfer out"* |
| `NetWorthPoint { asOf, netWorthMicros }` | `types.ts` / `SnapshotStore` | net-worth-over-time — the spine an ATH marker sits on |
| `TaxEvent` (`acquire` / `dispose`) | `tax.ts` | *"bought BTC", "sold ETH"* with cost basis |
| `MarketEvent` | `alerts.ts` | *"bridge exploit", "yield opportunity"* — external context |

The gap between these primitives and a shipped timeline is exactly the gap §7.3 named: a **populated,
append-only event store** keyed by identity, plus a deterministic **assembler** that merges these event
streams into one time-ordered narrative. `SnapshotStore.appendPoint` is the shape of that seam, but it stores
one net-worth scalar per call — not the typed event log a timeline needs. Until that store exists and runs in
production, the Timeline Engine is a specified future, not a rendered screen.

When it is built, three doctrine rails govern it, and they are non-negotiable:

1. **Every entry is a real event.** A timeline marker is a durable record of something that actually happened
   on-chain (a `TaxEvent`, a `CashFlow`, a settled transaction) — never a synthesized or inferred "milestone."
   The "ATH" marker is a real net-worth peak read from `NetWorthPoint` history, timestamped, not a round
   number chosen for drama. A network failure that leaves a gap in the history is shown *as a gap*, never
   back-filled to zero.
2. **The AI narrates the sequence; it does not invent it.** Consistent with the narrator boundary (§9,
   Chapter 9), the LLM may only order and phrase events that already exist as verified records, and every
   figure it cites must reconcile through `verifyNarrative`. "You staked 40 SOL on May 3rd" is narratable
   *iff* that event is in the store; the model cannot conjure a plausible-sounding transaction.
3. **No counterfactuals dressed as fact, no promises.** The timeline reports what *did* happen. It does not
   say *"had you held, you'd have $X"* as though it were a fact, and it never implies future profit (Chapter 2
   personality: the AI explains, it never promises returns). A retrospective is history, not advice.

---

### §7.7 · Shipped vs. roadmap for this section

| Capability | Status |
|---|---|
| Six-exposure Risk Dashboard (concentration / stable / DeFi / cross-chain / approvals / illiquid) | **SHIPPED (reads)** — every row resolves to a real `RiskProfile` / `Allocation` / `Concentration` field |
| `bridgeExposure` as a first-class, separately-surfaced number | **SHIPPED** — `computeRisk`, `risk.ts` |
| Liquidity split (liquid / locked / illiquid) as standing exposure | **SHIPPED** — `liquidWeight` / `lockedWeight` / `illiquidWeight` |
| Standing, evidence-carrying risk insights (concentration, chain, protocol, bridge, leverage) | **SHIPPED** — `generateInsights`, `insights.ts` |
| Stateful, deduped, owned-entity-filtered risk **alerts** | **SHIPPED** — `evaluateAlerts`, `alerts.ts` |
| "Since last check" **delta** on health / net worth (now vs one supplied prior reading) | **SHIPPED** — `RISK_INCREASING`, `LARGE_PORTFOLIO_MOVEMENT` |
| Per-approval risk (unlimited / dangerous / suggested limit) + policy block | **SHIPPED** — Ch10 Approval Analyzer + `detectUnlimitedApproval` |
| Multi-point **trend curves** per risk dimension over weeks/months | **ROADMAP** — needs a populated per-dimension snapshot store |
| Standing **active-approvals inventory** + one-tap revoke | **ROADMAP** — needs an allowance-enumeration read; revoke is always user-signed |
| The **Timeline Engine** (curated financial narrative from real events) | **ROADMAP** — primitives exist; needs a durable append-only event store + assembler |

The measurement is done and honest today: six exposures, each a computed number wearing its provenance, each
able to say *"—, unavailable"* rather than lie, and a change-driven alert layer that speaks up when risk
moves. The diachronic views — the sparkline, the allowance ledger, the life-of-the-wallet story — are named
as future work built on a history store the product must first earn the right to keep. The five acceptance
checks every section of this chapter must pass before it is called done live in **§9 (the Narrator Boundary &
Definition of Done)**; the health grading these exposures roll up into is **§4 (the Health Score)**, and the
allocation primitives they read are **§3 (Allocation & Diversification)**.


## §8 · Reports, Smart Alerts & the Portfolio Simulator

The seven sections before this one answer questions the user *asks*: what do I own, how did it do, how
concentrated am I, how healthy is my position. This section is about the three things a wealth command center
must do *without being asked* — or, in one case, do only when asked but with such care that the answer is
never mistaken for reality. Three surfaces, three postures:

- **Smart Alerts** are *proactive*: the engine watches the standing analytics and speaks up when something
  crosses a line the user set. The alert engine is **shipped** (`packages/intelligence/src/alerts.ts`); the
  delivery pipe that turns a fired alert into a phone buzz is roadmap.
- **The AI Monthly Report** is *retrospective*: a once-a-month narrated statement of what changed. It is
  **roadmap** — the analytics that would fill it are real, but the historical snapshot store it reads does not
  exist yet, and we will not fake a month we didn't record.
- **The Portfolio Simulator** is *hypothetical*: "what if BTC drops 20%." The scenario engine that computes
  the answer is **shipped** (`packages/intelligence/src/scenario.ts`); the product surface around it is
  roadmap; and the one law that governs it — **a hypothetical is never mixed with real state** — is doctrine,
  not decoration.

The through-line, as everywhere in this chapter, is the narrator boundary of Chapter 9 and §9 of this
chapter: **every number here is computed by deterministic code and only *narrated* by the AI.** An alert does
not editorialize; it cites the metric that fired it. A report does not "estimate how you probably did"; it
reads a recorded series or it says the series isn't there. A simulation does not become your net worth; it is
a labelled, quarantined object with its own `before` and `after`. The AI explains, it never instructs, and it
never promises a profit (Chapter 2).

---

### §8.1 · Smart Alerts — the shipped engine

Insights (§3–§7) describe a *standing shape*: "you are 62% in one asset" is true until it isn't, and it can be
recomputed from scratch on every load. Alerts are different in kind — they fire on a **change**, and a change
has a moment. That difference is the whole design of the alert engine, and it is why alerts, alone among the
intelligence outputs, are **stateful**.

`evaluateAlerts(prevState, ctx, now, config)` is a pure function of *(previous state, context, current time)*
→ *(newly-firing alerts, next state to persist)*. Two properties fall out of that signature and both matter:

- **It is deterministic.** `now` is a parameter, never `Date.now()` read inside the function. The same inputs
  always produce the same alerts. This is the same discipline the analyze pipeline follows (§1) and it is what
  lets us test alert behaviour to exhaustion — including cooldown edges — with fixed timestamps.
- **It carries memory.** `AlertState` is `{ lastFired: Record<string, string> }` — the ISO timestamp each
  logical alert last fired at, keyed by a **dedup key**. The engine returns the *next* state; the caller
  persists it. Nothing else in the engine keeps state between calls.

What the engine watches today (`collectCandidates`) maps onto the alert types the product promises like this —
and the honest column is the rightmost one:

| Promised alert | Fires from (`code`) | Signal source | Status |
|---|---|---|---|
| Large move / "new high-water territory" | `LARGE_PORTFOLIO_MOVEMENT` | `|Δ net worth|` vs `previousNetWorthMicros` ≥ `largeMovePct` | **Shipped** (engine) |
| Concentration / risk threshold | `RISK_THRESHOLD_EXCEEDED` | `healthScore < minHealthScore` | **Shipped** (engine) |
| Extreme volatility | `EXTREME_VOLATILITY` | `volatilityAnnual ≥ extremeVolAnnual` | **Shipped** (engine) |
| Fee / gas increase | `GAS_SPIKE` | `gasGwei ≥ gasSpikeGwei` | **Shipped** (engine) |
| Price target hit | `PRICE_ALERT` | spot crosses a user `PriceTarget` | **Shipped** (engine) |
| Security change (bridge/protocol/token) | `BRIDGE_EXPLOIT` · `PROTOCOL_HACKED` · `TOKEN_DELISTED` | injected `MarketEvent`, **filtered to owned entities** | **Shipped** (engine); the event feed is roadmap |
| Yield opportunity | `YIELD_OPPORTUNITY` | injected event, `apr ≥ minYieldApr`, on an owned symbol | **Shipped** (engine); feed roadmap |
| Wallet inactivity | `WALLET_INACTIVITY` | `daysBetween(lastActivityAt, now) ≥ inactivityDays` | **Shipped** (engine) |
| **Goal milestone** | — | needs the goal engine (§6) | **Roadmap** |
| **New all-time high** | — | needs the long-term snapshot store (see §8.3) | **Roadmap** |

Two entries in that table are worth reading carefully, because they are exactly where an over-eager author
would fake something. **The all-time-high alert** sounds shipped — "portfolio moved up 18%" already fires —
but a *high* is a claim about the entire recorded past, and we have no long-term net-worth store yet (§2, §8.3).
`LARGE_PORTFOLIO_MOVEMENT` compares against the *previous reading*, which is honest; an "all-time high" that
compared against a history we never kept would be a fabricated superlative. It waits for the store. **The
goal-milestone alert** waits for the goal engine (§6), which is itself roadmap. Neither is wired to a
plausible-looking proxy. That restraint is the doctrine (#3) in its least glamorous form.

Everything an alert says is **evidence-backed**, exactly like an insight. Each candidate carries an
`evidence: MetricRef[]` — the metric ids and values that tripped it, plus the config threshold it was judged
against, e.g. `[m('healthScore', 34), m('config.minHealthScore', 40)]`. There is no free-text claim in an
alert that isn't a rendering of a cited number. This is the alert-layer instance of the narrator boundary: an
alert is a *computed* event with its receipts attached, and the prose in `title`/`detail` is a template over
those receipts, never an independent assertion.

---

### §8.2 · Notification discipline — configurable, and not excessive

An alerting system that cries wolf is worse than none: users mute it, and then it's silent when it matters.
Chapter 6 §18 sets the notification doctrine for the whole product — *earn every interruption* — and the alert
engine implements the analytics half of it structurally, in two mechanisms.

**Deduplication + cooldown.** Every candidate has a stable `key` (`movement:down`, `health`, `gas`,
`price:BTC:above:<threshold>`, `event:bridge_exploit:<subject>`). When a candidate would fire, the engine
checks `lastFired[key]`: if the last fire is inside the `cooldownHours` window, it is **suppressed** and does
not appear in the returned `alerts`. A portfolio parked below the health floor does not re-alert every poll; it
alerts once, then stays quiet for `cooldownHours` (default **24**). The key design choice is that the cooldown
is *per logical alert*, so a genuine new event of a different kind is never swallowed by an unrelated one still
cooling down.

**Configurable posture.** Thresholds are not baked in; they live in `AlertConfig`:

```ts
export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  largeMovePct: 0.15,      // ±15% net-worth move
  extremeVolAnnual: 1.0,   // 100% annualized vol
  minHealthScore: 40,      // health floor
  gasSpikeGwei: 200,
  inactivityDays: 90,
  minYieldApr: 0.05,
  cooldownHours: 24,       // silence window per alert
};
```

A cautious user tightens `largeMovePct` and raises `minHealthScore`; someone who wants near-silence widens the
thresholds and lengthens the cooldown. This mirrors the insight engine's `InsightPolicy` presets (§3) so that
one coherent "risk posture" tunes both standing insights and firing alerts.

**Relevance filtering.** Market/security events are only ever surfaced if they touch something the user
*actually owns*. `collectCandidates` filters the injected `events` against `ownedBridges`, `ownedProtocols`,
and `ownedSymbols` (`has()` is case-insensitive). A protocol hack on a protocol you hold nothing in is not an
alert; it is noise, and the engine drops it before it can become an interruption. Filtering to the owned book
is the single most effective form of not-excessiveness in a market that produces a security incident somewhere
every week.

**Ordering.** When several alerts do fire, they are returned **most-severe-first** (`critical → warning →
info`), so the surface that renders them leads with the one that matters.

What is **roadmap** here is the *transport*, and we are precise about the seam. The engine decides *whether*
an alert should fire and hands back a sorted, deduped list; it does not deliver anything. Push notifications,
email digests, per-channel routing, and quiet-hours scheduling are downstream of this pure core and are not
built yet. The honest statement is: **the decision layer of Smart Alerts is shipped and testable; the delivery
layer is roadmap.** We will not describe a "you'll get a push at 9am" experience that no code sends.

---

### §8.3 · The AI Monthly Report — *(roadmap)*

The Monthly Report is the retrospective statement a wealth manager would mail you: one narrated document, once
a month, saying *here is what happened to your money and why.* It is **roadmap**, and it is worth being exact
about why, because almost every ingredient is already real.

The intended contents, and where each is computed today:

| Report section | Computed by | Real today? |
|---|---|---|
| Net worth, start → end | performance series / net-worth history (§1–§2) | analytics real; **the recorded month is the gap** |
| Performance / P&L | `computePerformance` — TWR, growth, drawdown (§2) | engine real; needs a persisted series |
| Allocation drift | `computeAllocation` deltas month-over-month (§3) | engine real; needs two dated snapshots |
| Winners & losers | per-position `PositionDelta` over the window (§2) | engine real; needs the window |
| Fees / gas paid | `gasSpendMicros` aggregated over the month (§5) | roadmap (cash-flow / fee tracking §5) |
| Rewards & yield | claimable/`reward` positions, realized yield (§5) | roadmap (yield dashboard §5) |
| Goals progress | goal engine (§6) | roadmap |
| Security posture change | identity security score delta (Ch5 §15) | score real; delta needs history |

The single blocker is the same one that gates historical P&L in §2: **there is no long-term snapshot store
yet.** The engine can analyze any snapshot handed to it, and it can compute deltas between two snapshots — but
producing a *monthly* report means having reliably recorded net worth, allocation, and health at the start of
the month and again at the end, and persisting that for months on end. Until that store exists, a "monthly
report" would have to invent its own history, which is precisely the fabrication doctrine #3 forbids. So the
Report ships when the store ships, not before.

When it ships, its prose obeys the narrator boundary without exception. A Monthly Report is a
`NarrativeReport` writ large: every figure it states must resolve through `resolveMetric` against verified
intelligence, and `verifyNarrative` (Chapter 9; §9 of this chapter) rejects the whole document if any cited
number fails to reconcile. The `TemplateNarrator`'s `'weekly'` mode is the working prototype of exactly this
discipline — note how it *refuses to report a return* when history is absent:

```ts
// narrator.ts, 'weekly':
if (intel.performance.hasHistory && intel.performance.twr !== null) {
  text = `This period your portfolio returned ${pct(intel.performance.twr)} ...`;
} else {
  text = `... Performance history isn't available yet, so no return is reported.`;
}
```

That branch is the Monthly Report in miniature: it *has an honest empty state.* A user's first-ever month, or
a month with a gap in the recorded series, produces a report that says "we don't have a full month yet" — not
a confident number over a period we didn't observe. The Report will be **exportable** (PDF / CSV) so it can go
to an accountant, and — critically — the export carries the same provenance: figures marked as **estimates**
stay marked (an unpriced asset is never silently valued; §1), a partial read is labelled partial, and a
network failure in the month's data is a labelled gap, **never a $0**.

---

### §8.4 · The Portfolio Simulator — engine shipped, product roadmap, hypothetical always labelled

"What if BTC drops 20%? What if gas triples? What if the bridge my funds are on goes down?" These are the
questions that turn a dashboard into a decision tool, and the deterministic core that answers them —
`applyScenario` in `scenario.ts` — is **shipped**. What is roadmap is the *product*: the simulator screen, the
slider you drag, the saved scenarios. The math is real; the surface around it is not built yet. And one law
sits above both: **a simulation is never mixed with real state.**

The shipped engine models three shock kinds, and none of them is a naive linear mark:

- **`priceShock`** — a spot holding of the shocked asset moves linearly, but an **LP / vault** position
  re-prices by the constant-value AMM rule (its USD value scales by `Π (legMultiplier)^(legWeight)`), which
  for a 50/50 pool reduces to the classic `√r` — i.e. it **captures impermanent loss**, not a fictional linear
  gain. With `propagate: true`, correlated assets move by `β · shock`, where β is estimated from a *supplied*
  return series (`stats.beta`), so "BTC −20%" ripples through the book by measured correlation instead of
  moving one ticker in isolation. If no return series is supplied, propagation is off and only the named asset
  moves — the engine does not invent a correlation it wasn't given.
- **`gasPrice`** — holdings are unchanged; the result surfaces the *added cost-to-act* of the user's reference
  operations at the new gwei (`gasCostDeltaMicros`). If no `GasProfile` is supplied it says so in `notes` and
  returns a zero delta rather than guessing.
- **`bridgeUnavailable`** — holdings are unchanged; the result surfaces `trappedValueMicros`, the value that
  stays on-chain but becomes **illiquid** until the bridge is restored. Debt (`borrowing`) is excluded from the
  trapped total, because a liability is not something you're locked *out* of.

Every result re-derives net worth **through the same `normalize()`** the real pipeline uses, so debt signs
stay correct under the shock (§1) and money stays exact: shocks are applied at **micro precision on bigint**
(`scaleMicros` multiplies by an integer micro-factor and divides by `1_000_000n`), never as a float multiply
on a dollar amount.

Now the doctrine. A `ScenarioResult` is a **distinct, self-contained object** — it holds
`netWorthBeforeMicros`, `netWorthAfterMicros`, `deltaMicros`, `deltaPct`, the per-position `positionDeltas`,
and human-readable `notes`. It is **never written back** into the `PortfolioSnapshot` or the
`PortfolioIntelligence`. The real portfolio is an input the engine reads and does not mutate; the simulation is
an output alongside it. This is the structural guarantee behind the labelling rule: because the hypothetical
lives in its own return value, the UI physically cannot render "$84,000" from a simulation in the same field
that shows your actual net worth. Every simulated figure is shown against its **`before`**, tagged
**HYPOTHETICAL**, and visually separated from live state. The AI narrating a scenario says *"if this happened,
your net worth would move to X"* — conditional mood, cited numbers, and it **never promises the move will
happen** (Chapter 2): a simulation is a model of a possibility, not a forecast and never a recommendation to
trade toward it.

One honest scoping note on the flagship example. "What if **BTC → 40%** of my book" is an *allocation-target*
question, and it is subtly different from the shipped `priceShock`. The engine today answers **price / gas /
bridge** shocks directly. A "rebalance to 40% BTC" simulation is composed *on top* of the engine — construct
the hypothetical set of positions that the rebalance would produce, then re-run `analyze()` over them to read
the new allocation, concentration, and health — and that composition (the rebalancing simulator surface) is
**roadmap**. We flag it rather than imply the slider exists: the primitives are real, the "drag BTC to 40%"
screen is not built. What ships today is the shock engine; what's promised is the product woven around it.

---

### §8.5 · What "done" means for this section

This section spans the full honesty gradient of the chapter, so its definition-of-done (which rolls up into §9)
is stated plainly:

1. **Alerts are computed events with receipts.** Every fired alert carries the `evidence` that tripped it and
   the config threshold it was judged against; no alert asserts a number it can't cite. The engine is pure and
   deterministic (`now` injected), so its cooldown and dedup behaviour is proven by fixed-timestamp tests.
2. **Interruptions are earned.** Cooldown, per-key dedup, owned-entity filtering, and configurable thresholds
   are all in the shipped core; the transport that would over-notify is not built, and won't ship without the
   Chapter 6 §18 discipline attached.
3. **The Report waits for its history.** No monthly statement is rendered over a month we didn't record; the
   honest empty state (the `'weekly'` narrator branch) is the reference, and every figure passes
   `verifyNarrative` before it reaches a user or an export.
4. **Hypotheticals are quarantined.** A `ScenarioResult` is a separate object, never merged into real state,
   always shown against its `before` and labelled HYPOTHETICAL; the AI narrates it in the conditional and never
   promises the outcome.

Where each of the four touches money, money is **bigint µUSD**; where it states a derived ratio (a percent
move, a weight, a β), that is a `number` by design (§1 of `types.ts`). The narrator boundary is the spine that
holds all of it upright — specified in full in **§9**, to which this section hands off.


## §9 · The AI-Narrator Boundary & Definition of Done

Eight sections built the machinery: a net worth engine (§1), performance and P&L (§2), allocation and
diversification (§3), the health score (§4), cash flow / fees / yield (§5), goals / benchmarks / coach (§6),
the risk dashboard and timeline (§7), reports / alerts / simulator (§8). This closing section builds the one
thing that lets any of it face a user without lying: the **honesty engine** — the boundary that guarantees
every number the Portfolio Intelligence Engine speaks was *computed*, never invented — and the **bar** the
whole chapter is measured against. §9 is the closing invariant. If it fails, nothing above it is safe to
ship, no matter how clever the analytics are.

Two laws from §1 govern here, and they never move. **A number is computed by deterministic code and narrated
by the AI in words — the AI never invents a figure** (Doctrine §3/§7, the narrator boundary of Chapter 9).
And **an estimate is always labelled an estimate; a network failure is never rendered as $0; unpriced is not
$0; a partial is labelled partial** (Doctrine §3). §9 is where those two laws are enforced *at the mouth* —
the last gate a figure passes before a human reads it.

---

### 9.1 · The narrator boundary, made fully explicit

The temptation a portfolio "AI" invites is exactly the one we refuse: to let a language model *say the
numbers.* Ask an LLM "how's my portfolio?" and it will happily emit "your net worth is $248,540, up 3.2% this
week" — fluent, plausible, and, if it authored those digits, a fabrication about someone's money. Chapter 12
forbids this structurally. The engine is split into two artifacts with a hard wall between them:

1. **The computed object** — a `PortfolioIntelligence` (`packages/intelligence/src/types.ts`), produced by
   the pure `analyze()` pipeline (`engine.ts`). Every figure in it — `netWorthMicros`, `grossAssetsMicros`,
   `debtMicros`, `concentration.topAssetWeight`, `risk.healthScore`, `performance.twr` — is deterministic
   code's output over a snapshot. No clock, no network, no model.
2. **The narrated report** — a `NarrativeReport { kind, text, citations }` produced by a `Narrator`. Its job
   is *prose*, and prose only: turn the computed object into a sentence a non-technical stranger understands.

The wall between them is the anti-fabrication guard, and it is code, not a convention. A `NarrativeReport`
must declare, as structured data, **every figure it cites** — a `citations: MetricRef[]` list. Before any
narrative reaches a user, `verifyNarrative(report, intel)` (`narrator.ts`) re-resolves each citation against
the verified intelligence through a **closed whitelist**, `resolveMetric`, and rejects the whole narrative if
any citation fails to reconcile:

```ts
export function verifyNarrative(report: NarrativeReport, intel: PortfolioIntelligence): boolean {
  for (const c of report.citations) {
    const actual = resolveMetric(intel, c.metric);      // undefined = not a real metric → reject
    if (actual === undefined) return false;
    if (typeof actual === 'number' && typeof c.value === 'number') {
      if (Math.abs(actual - c.value) > 0.01) return false; // a citation must MATCH the computed value
    } else if (String(actual) !== String(c.value)) return false;
  }
  return true;
}
```

`resolveMetric` is deliberately a fixed `switch` over a known set of metric ids — `netWorth`, `grossAssets`,
`debt`, `risk.healthScore`, `concentration.topAssetWeight`, `performance.twr`, and their siblings. A citation
to a metric that does not exist returns `undefined` and fails the guard; a citation whose value drifts more
than a cent (money) or by a single character (a symbol, a label) from what the engine computed fails the
guard. The facade wires this in by default: `PortfolioIntelligenceEngine.narrate()` calls the narrator, then
**throws `IntelligenceError('NARRATION_UNVERIFIED')` unless the citations reconcile** (`engine.ts`,
`verifyNarration` defaults to `true`). The consequence is precise and total: **an LLM plugged in behind the
`Narrator` interface cannot make up a number.** It may choose *which* verified facts to mention and *how* to
phrase them; it may not invent the facts. If it hallucinates a figure, the guard catches the citation that
doesn't reconcile and the narrative is rejected before it is ever shown.

The shipped default narrator makes the boundary concrete without any model at all. `TemplateNarrator`
(`narrator.ts`) is fully deterministic: it reads the intelligence, cites only what it read (via a `cite()`
helper that pulls the value straight from `resolveMetric`), and emits prose — *"Your portfolio is worth
$248,540 across 14 positions. Your largest holding is ETH at 38% of the book. Portfolio health is 72/100."*
It is both the production-safe zero-LLM path **and** the reference every future LLM narrator is held to: same
interface, same `verifyNarrative` gate, same closed metric vocabulary. Swapping in an LLM narrator changes the
*wording*, never the *numbers*, and never the guarantee. This is the Chapter 9 narrator boundary made literal
in Chapter 12 — "AI proposes, deterministic code verifies" applied to figures instead of transactions.

One honest distinction, because it is easy to blur. The guard governs the **narrative** layer — the prose an
AI speaks. The *insight* engine (`insights.ts`) also attaches figures — its `evidence: MetricRef[]`, e.g.
`concentration.topAssetWeight` alongside `policy.maxAssetWeight` — but those are emitted by deterministic
threshold code, not narrated by a model, so they are *computed evidence*, not *narrated claims*. The
distinction matters: the anti-fabrication guard exists specifically for the boundary where a language model
touches numbers, and there it is absolute. Everywhere else, the numbers were never at risk because no model
produced them.

---

### 9.2 · The estimate-labelling rule and the four-state honesty, applied everywhere a value appears

A number can be *correct* and still *dishonest* if it is presented with more certainty than it has. §9's
second discipline is that every value carries its own epistemic status, and the narrator is forbidden from
laundering that status away.

**Exact vs estimate is a property of the type, not a disclaimer on the screen.** A base-unit balance is
ground truth — it is read from the chain and is exact. A *value* is an **estimate**, because it multiplies
that amount by a market price captured at a moment. The types keep the two apart on purpose: `UnifiedAsset`
(`packages/portfolio`) carries the exact `amount` (bigint) *and* the derived `valueMicros`, plus the
`priceUsd` used and a `stale` flag; money throughout the engine is integer µUSD (`1 USD = 1_000_000 µUSD`),
and only ratios — weights, returns, scores — are floats, correctly, because a ratio is not money (`types.ts`
header). The narrator inherits this: it may say the value is an estimate, it may never present a priced value
as if it were the exact on-chain amount.

**The four states travel all the way to the sentence.** §1 defined the four-state model for the headline
total; §9's job is to ensure the *narrator* honours it rather than papering over it. The states, and the
narrator's obligation for each:

| State | The value is… | What the narrator must do |
|---|---|---|
| **Real (✅)** | read and priced; a live estimate of real value | state it, labelled an estimate where it is a market value |
| **Genuine zero ($0)** | reads and prices succeeded; the wallet truly holds nothing | the *only* case where "$0" may be spoken as fact |
| **Partial (labelled)** | some inputs missing/stale (`stale = true`) | speak the total as a **floor**, say a part could not be valued — never a clean total |
| **Network-fail (never $0)** | a read failed; the value is *unknown* | say "unknown / couldn't read," never "$0"; `stale` in `PortfolioIntelligence` carries the signal |

The shipped code makes the difference machine-readable so the narrator cannot get it wrong by accident:
`balances.ts` wraps every per-chain read so a failed leg becomes `null` ("—"), not `0`, and gates the
headline on price availability — `const totalUsd = anyPrice ? assets.reduce(...) : null` — so no-price yields
an honest `null`, never a confident "$0.00." `aggregatePortfolio` sets `UnifiedPortfolio.stale = true` if any
contributing price was stale, and an unpriced asset contributes its **amount** to the list but `0` to
`valueMicros` — visibly held, not falsely valued. `PortfolioIntelligence.stale` propagates that signal to the
top of the object the narrator reads. And the discipline shows up in the shipped narrator itself: the
`weekly` branch of `TemplateNarrator` refuses to report a return when there is no history to compute one from
— *"Performance history isn't available yet, so no return is reported"* — instead of extrapolating a curve
from a single point. That is the estimate-labelling rule and the empty-state honesty in the same breath: when
the engine cannot *positively* verify a figure, it says so; it never fills the silence with a fabricated
number (Doctrine §5, fail closed).

This is also where the chapter's roadmap honesty lives at the narration edge. The engine's *machinery* for
historical P&L (§2), cash flow and yield (§5), goals and benchmarks (§6), the timeline (§7), and the monthly
report and simulator (§8) is real code — but several of those depend on stores and feeds that **do not ship
yet** (there is no long-term `SnapshotStore`; cash-flow tracking, the yield dashboard, goal tracking,
benchmarks, the financial timeline, the monthly report, and the portfolio simulator are roadmap). The
narrator's rule is the same as the total's: narrate a trend, a yield figure, or a goal delta **only where a
real computed input exists**, and otherwise show the honest empty state. "The engine accepts history" is not
"the product ships historical net worth," and the narrator is bound to that line as strictly as the dashboard
is.

---

### 9.3 · Propose-only — the engine informs, it never moves funds

The third invariant is the one the Doctrine is most jealous of. The Portfolio Intelligence Engine's entire
surface is **data** — facts and suggestions — and it holds no power to act on any of it. This is stated at the
top of the package and enforced by what the code *cannot* do: *"The engine ANALYZES and RECOMMENDS. It never
signs and never executes"* (`types.ts`, `index.ts`, `engine.ts`). Two arrows are deliberately missing from
the architecture, and their absence *is* the guarantee:

- **No arrow to the chain.** As §1 established, `@intent-wallet/portfolio` and `@intent-wallet/intelligence`
  import no chain adapter, no transport, no signer. They cannot fetch and they cannot broadcast. The engine
  is a pure function of a snapshot.
- **No arrow to the signer.** The strongest recommendation the engine can produce is a `suggestedAction` — a
  *string* (`Insight.suggestedAction`), advice in prose: *"Consider trimming this position toward a more
  balanced allocation,"* *"Repay part of your borrow or add collateral."* It is deliberately **not** an
  executable step, not a pre-built transaction, not a one-tap "do it." The comment in `insights.ts` is the
  law: the suggestion is *"advice, never an executable step (the engine cannot act; the user or the Intent
  layer decides)."*

So the causal chain is one-directional and gated: the Portfolio Engine *explains and suggests* → the **user**
reads and decides → if they choose to act, they express an intent that flows into the Intent layer (Ch7),
which plans it, proves it safe with deterministic guards (the Risk/Policy engines), and asks for the user's
**on-device signature** — the sole disposer of funds (Doctrine §2). The AI never signs, never authorizes, and
never nudges a transaction onto the wire. It never promises profit, either: it explains *what is* and *what
changed*, and labels risk as risk (Ch2 personality; the insight engine's `suggestedAction` is a considered
"consider," never a guaranteed outcome). A portfolio "coach" (§6) that could move money would be a custodial
back door in disguise; this section is the closing proof that it cannot. Everything auditable, too: every
insight carries its triggering `evidence`, every narrative its `citations`, so any suggestion can be traced
back to the exact computed numbers that produced it (Doctrine §8).

---

### 9.4 · The Definition of Done — a financial command center, not a token list

The bar for Chapter 12 is not "the analytics are correct." It is a **user experience**: a non-technical
stranger opens the wallet and, *in seconds*, answers the questions a person actually has about their money.
That is the difference between a token list — which shows *what rows exist* — and a command center — which
answers *how am I doing.* The chapter is Done when each of these is answerable at a glance, and every answer
obeys §9.1–§9.3 (computed, labelled, propose-only):

| The user asks… | Answered by | Status |
|---|---|---|
| **What am I worth?** (net worth) | Net Worth Engine, §1 — `netWorthMicros`, four-state honest | ✅ Shipped |
| **How am I doing?** (performance / P&L) | Performance engine, §2 — TWR, growth, drawdown *when history exists* | 🔶 Engine shipped; **historical P&L roadmap** (no snapshot store) |
| **What do I own?** (allocation) | Allocation & concentration, §3 — by asset / chain / sector / protocol | ✅ Shipped |
| **How healthy is my position?** (risk) | Health score + risk dashboard, §4/§7 — one `healthScore`, weighted factors | ✅ Shipped |
| **Is my money working?** (yield) | Yield insight, §5 — idle-stable + yield-opportunity insights | 🔶 Insight shipped; **yield dashboard roadmap** |
| **Am I on track?** (goal progress) | Coach, §6 | ⏭ **Roadmap** (goal tracking, benchmarks) |
| **What changed since yesterday?** | Alerts / timeline, §7/§8 — alert deltas *vs a prior reading* | 🔶 Alert engine shipped; **historical timeline / monthly report roadmap** |
| **What should I review next?** | Insight engine — ranked `insights[]`, most-severe first | ✅ Shipped |

Read the status column honestly and the shape of the product is clear: **the questions of the present tense —
what am I worth, what do I own, how healthy am I, what should I review — are shipped and answered by
deterministic code today.** The questions of the *past and future tense* — how have I done over time, am I on
track to a goal, what did yesterday look like — depend on a long-term store and feeds that are roadmap, and
the chapter refuses to fake them: it shows an honest "start tracking to see change" empty state rather than an
extrapolated curve or a borrowed number. A command center that lies about the past is worse than a token
list that stays silent about it.

The failure the whole design is built against is the token list that *looks* like intelligence: fifteen rows,
each a symbol and a balance, leaving the user to be their own analyst. Chapter 12's Done state replaces that
with a single computed net worth, a health score that summarizes risk in one glance, a ranked list of what to
review, and prose that explains the number in a sentence — every figure of it computed, none of it invented.

---

### What §9 commits us to — the command-center bar

- **The AI narrates; it never authors a figure.** Deterministic `analyze()` computes every number; a
  `Narrator` turns numbers into prose; `verifyNarrative` rejects any narrative whose citations don't
  reconcile against the verified `PortfolioIntelligence`, and `engine.narrate()` throws rather than speak an
  unverifiable figure. An LLM behind this wall can phrase the truth; it cannot invent it.
- **Every value carries its honesty to the sentence.** Exact `amount` and estimated `valueMicros` are
  different fields; a market value is labelled an estimate; `stale`, `null` legs, and the `anyPrice` gate
  make the four states machine-readable so the narrator speaks a floor as a floor, an unknown as unknown, and
  a genuine zero as the only honest "$0."
- **Propose-only, absolutely.** The engine holds no arrow to the chain and no arrow to the signer; its
  strongest output is a `suggestedAction` string. It explains and recommends; the user's on-device signature
  alone disposes of funds; the AI never signs and never promises profit.
- **Done is a command center, not a token list.** In seconds the user answers net worth, allocation, health,
  and what-to-review — shipped today, computed and honest — while performance-over-time, yield, goals,
  benchmarks, the timeline, the monthly report, and the simulator are labelled roadmap and shown as honest
  empty states, never faked.

This is the closing invariant of Chapter 12. Every lens the chapter built — §1 through §8 — points at one
promise the user can trust without being an analyst: *here is what you're worth, here is what you own, here is
how healthy you are, here is what to look at next* — every figure of it computed by deterministic code, spoken
by an AI that can explain but can never lie, and acted on by no one but the user holding the key. A financial
command center that is never allowed to fabricate, and never allowed to move your money. That is the bar.


---

## Where this sits

This is the reference behind [Chapter 12 — the Portfolio Intelligence charter](../bible/chapter-12-portfolio-intelligence.md),
and the material Volume IV is built from. Shipped: allocation / performance / health analytics, the insight /
alert / scenario / tax engines, the `/v1/portfolio/insights` path, and the AI-narrator boundary (code
computes, the LLM narrates); roadmap: historical net worth & P&L-over-time, cash flow, the yield dashboard,
goals, benchmarks, the timeline, the monthly report, and the simulator product. The engine proposes and
explains — it never signs, and never fabricates a number.
