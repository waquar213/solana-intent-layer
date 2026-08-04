# 05 — Screens: Home, Portfolio, Assets, Send/Receive, Contacts

## S-11 Home / Portfolio (the living room)

- **Purpose:** answer "how much do I have, is anything happening, what can I do" in one glance; host the command bar.

```
┌──────────────────────────────┐
│  Wallet ·da94        🔔  ⬒   │ ← NavBar: identity chip, notifications, QR-scan
│                              │
│        $4,281.44             │ ← type.display, tabular
│        ▲ $61.20 (1.4%) today │ ← success/neutral, hidden in privacy mode
│  [Receive] [Send] [Convert]  │ ← 3 quick actions (h44 pills)
│                              │
│ ┌──────────────────────────┐ │
│ │ ✦ Ask anything…          │ │ ← CommandBar (S-20 on focus)
│ └──────────────────────────┘ │
│  1 in progress ▸             │ ← execution pill (only when active)
│  ── Assets ────────────────  │
│  ⬤ Bitcoin      $2,100  ▲2% │ ← AssetRow list, sorted by value
│  ⬤ Ethereum     $1,420  ▲1% │
│  ⬤ USDT           $761   —  │
│  + 3 small balances ▸        │ ← dust folded (< $1 or spam-flagged)
└─[Home][Ask][Activity][Sett.]─┘
```

- **Components:** NavBar, AmountDisplay hero, quick-action pills, CommandBar, execution pill, AssetRow list, dust folder, TabBar.
- **Actions:** pull-to-refresh (rubber band + "Updated just now"); long-press hero → privacy mode toggle (•••• everywhere, persists); asset tap → S-12; eye icon in NavBar overflow for privacy mode too.
- **Validation:** n/a (read surface).
- **Loading ⭘:** first-ever load = skeleton hero + 4 skeleton rows; subsequent = last-known values instantly + shimmer only on rows being refreshed. NEVER blank-then-pop.
- **Errors ⭘:** offline → warning banner "Balances as of 2:41 PM"; partial chain failure → affected rows get clock glyph, others live (per-chain provenance from Portfolio Service `stale` flags).
- **Empty ⭘:** zero balances → hero shows $0.00, assets area becomes EmptyState: "Add your first crypto" + [Receive] CTA + "Buy" (when ramps ship). Command bar stays — asking questions works with an empty wallet.
- **A11y:** hero is one element ("Total balance four thousand two hundred eighty-one dollars, up 1.4% today"); privacy mode announces "balances hidden".
- **Micro:** value changes tick-animate digits (200 ms, tabular so no jitter); received-funds moment: row glows `success.subtle` once + haptic.

## S-12 Asset Detail

- **Purpose:** one asset in depth; the ONLY place per-chain location appears (principle #2).

```
│ ← Ethereum                   │
│  ⬤ 0.612 ETH                 │
│     $2,079.14   ▲ 2.1%       │
│  [sparkline 1D|1W|1M|1Y|All] │
│  [Receive] [Send] [Convert]  │
│  ── Where it lives ───────── │ ← collapsed by default
│  ▸ Ethereum  0.4 ETH         │
│  ▸ Base      0.212 ETH       │
│  ── Activity ──────────────  │
│  ↓ Received 0.2 ETH  · 2d    │
│  ⇄ Converted from BTC · 5d   │
```

- **Components:** header AmountDisplay, sparkline (scrubbing sets a floating value+date label), range SegmentedControl, quick actions, "Where it lives" disclosure (ChainChips + per-chain amounts), activity slice (3 rows + "See all").
- **Loading:** sparkline skeleton wave; price scrub disabled until data.
- **Errors:** price feed stale → sparkline dims + "Price updated 4 min ago"; per-chain balance stale → row clock.
- **Empty:** no activity yet → "Transactions with ETH will show up here."
- **A11y:** sparkline scrub announces "March 3rd, $1,890"; chart has a data-table alternative (long-press → "Read values").
- **Micro:** range switch cross-fades line 200 ms; scrub haptic selection ticks.

## S-13 Receive (Universal Address Reveal)

- **Purpose:** the product's "wow" — exactly three addresses, ever.

```
│  Receive                     │
│  [ Bitcoin | Ethereum+ | Solana ]│ ← segmented (Ethereum+ = "all EVM networks")
│ ┌──────────────────────────┐ │
│ │        ▦ QR (240pt)      │ │
│ └──────────────────────────┘ │
│  bc1q cr8t e4kr 609g …       │ ← mono, grouped 4s
│  [Copy]        [Share]       │
│  ⓘ Works on Ethereum, Base,  │ ← only on Ethereum+ tab
│    Arbitrum, Optimism, …     │
```

- **Components:** SegmentedControl, QRDisplay (brightness boost while visible), grouped mono address, Copy/Share, network info footnote.
- **Actions:** copy → toast + haptic; share → system sheet; optional "Request amount" (appends BIP-21/EIP-681/Solana Pay params, regenerates QR).
- **Validation:** request-amount input follows AmountInput rules.
- **Errors:** none (fully offline-capable — addresses are local). This screen MUST work with no network.
- **A11y:** address reads grouped by fours; QR labeled "QR code for your Bitcoin address".
- **Micro:** tab switch: QR cross-dissolves 200 ms; copy icon → checkmark morph.

## S-14 Send (structured form — also the LLM-down fallback)

- **Purpose:** deterministic send path; same rails the intent flow uses.
- **Flow:** (1) recipient → (2) amount → (3) ConfirmSheet. One decision per step.

```
│  Send to                     │
│ ┌ 🔍 Name, address, or scan ┐ │
│  Recents: 🧑 Rahul · 🧑 Maa    │
│  Contacts A–Z …              │
```

- **Step 1 recipient:** SearchField + QR scan; paste detection auto-classifies ecosystem; new address → "First time sending here" tag carries into confirm; risk screen runs inline (spinner-in-row ≤ 400 ms; flagged → RiskBadge on the row).
- **Step 2 amount:** AmountInput with asset selector row (defaults to searched asset or largest sendable); fee preview line updates live ("Network fee ≈ $0.42").
- **Step 3:** ConfirmSheet (standard anatomy) — note when we auto-picked the cheapest network for same-address multichain assets: "via Base (cheapest for you)" with "change" link (progressive disclosure, not a chain quiz).
- **Validation:** address per-ecosystem ([08-standards.md](08-standards.md) §1.2 — checksum, not-self, burn-address block); amount vs balance-minus-fees; memo/tag field appears ONLY where required (e.g., exchange deposits detection) with "Required by recipient" helper.
- **Loading:** fee estimation shimmer on the fee line only.
- **Errors:** fee estimation down on that chain → send blocked with "Network busy — try again shortly" (correctness rule, [architecture 02 §2.9](../architecture/02-services.md)); insufficient-for-fees → inline "Max is $98.90 (keeps $1.10 for the network fee)" + [Use Max].
- **Empty:** no contacts → recents area teaches "People you send to appear here."
- **A11y:** steps announce progress ("Send, step 2 of 3, amount").

## S-15 QR Scanner

- **Purpose:** scan address / payment request / (later) WalletConnect.
- **Layout:** full-bleed camera, viewfinder cutout, torch, gallery import, close.
- **Behavior:** decoded payment URI pre-fills S-14 (amount locked if specified, editable toggle); unknown QR → "This isn't a payment code" inline.
- **Errors ⭘:** permission denied → EmptyState with [Open Settings]; low light → torch hint pulses once.
- **A11y:** torch/gallery labeled; screen announces "Camera viewfinder — point at a payment code"; manual-entry escape hatch always visible.

## S-16 NFT Gallery & Detail

- **Gallery:** 2-col grid (radius.md, 1:1 crop), collection sections; spam-flagged NFTs auto-hidden folder ("Hidden (12)"); skeleton grid; EmptyState "Your collectibles will appear here."
- **Detail:** full-bleed media (pinch zoom, video/audio players), traits table, floor/last price (footnote + source), [Send] → S-14 recipient step, verified-collection check; report-as-spam action → hides + trains Risk.
- **A11y:** NFT media alt = collection + token name; traits as table semantics.

## S-17 Contacts / Address Book

- **List:** search, A–Z, per-contact avatars (initials/identicon).
- **Contact card:** name (editable), one or more addresses with ecosystem chips, "Verified by prior send ✓" marker, activity-with-this-contact slice, [Send].
- **Add/edit validation:** name 1–50 chars; address validated per ecosystem; duplicate detection ("This address is already saved as Rahul").
- **Empty:** "Save people you send to — 'Send $50 to Maa' becomes possible." (ties contacts to the intent promise).

## S-18 Watchlist

- Assets user tracks without holding; AssetRow variant (no holdings line); star/unstar from any asset detail; price alerts entry point per row → [07-screens-settings.md](07-screens-settings.md) S-33.
- **Empty:** "Track assets you're curious about."
