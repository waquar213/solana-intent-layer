# DESIGN_SYSTEM.md — The Design Language of Intent Wallet V3

> **Read this before you touch a pixel, add a color, name a class, or build a screen.** This is the
> canonical design language for Intent Wallet V3 — the concrete tokens, components, and rules that make
> the product feel like *one* thing across web and mobile. It is the root authority; the deep reference
> lives in [`docs/design/`](docs/design) (screen-by-screen specs, journeys) and the machine-readable
> source of truth is the code in [`packages/ui/src/tokens/index.ts`](packages/ui/src/tokens/index.ts).
> When this document, the token code, and a screen disagree, that is a **defect** — reconcile it on
> purpose (§13), never by drifting. This is an engineering constitution section: dense, opinionated,
> and true to what actually ships. No aspirational UI, no fabricated components.

**Doctrine this document enforces** (from [`CLAUDE.md`](CLAUDE.md) §3): *never fake data* (honest
empty/loading/error/stale — a network failure is **never "$0"**); *Apple-grade craft + WCAG 2.2 AA +
reduced-motion-aware motion are acceptance criteria, not polish*; *AI proposes, deterministic code
verifies, the device signature disposes* — which is why the confirm surface (§7, ConfirmSheet) has one
immutable anatomy and a pure client-side decode. Design serves trust first, delight second, never at
trust's expense.

---

## 1 · Design principles — the feeling, in nine lines

1. **Calm, not clever.** The screen is mostly quiet neutrals; color means something. If everything is
   emphasized, nothing is.
2. **The number is the hero.** Amounts get the largest type, the tightest tracking, and tabular figures
   so they never jitter as they update.
3. **One accent.** A single indigo carries brand, action, and focus. Violet is a *gradient partner* on
   the net-worth wash only — never a second button color.
4. **Depth is restraint, not decoration.** Hairline borders + layered low-opacity shadows in light;
   surface *steps* (not shadows) in dark. No glass, no neon, no drop-shadow soup.
5. **Honest states are designed states.** Loading, empty, error, stale, offline, and *degraded-AI* each
   have a real design — the fallback is intentional (§9), never an accident.
6. **Recognition is safety.** Money surfaces (PlanCard, ConfirmSheet) use a **fixed anatomy** everywhere
   so a user learns the shape once and can trust it forever.
7. **Motion explains, then gets out of the way.** 150–250 ms for meaningful transitions; nothing blocks
   input past 300 ms; everything respects `prefers-reduced-motion`.
8. **Never flat-cheap, never AI-generic.** No default-Bootstrap gradients, no purple-on-purple hero
   clichés, no stock "glassmorphism," no emoji-as-UI. Benchmark: Linear's restraint, Stripe's clarity,
   Apple Wallet's materials, Phantom/Rabby's crypto-native honesty.
9. **Light and dark are designed with equal care** — dark is not "light with inverted colors"; it is its
   own palette (§2).

---

## 2 · Color

### 2.1 Philosophy

Near-monochrome surfaces · **one** brand accent (indigo) · semantic hues reserved strictly for meaning.
The palette is small **by policy** — adding a color requires deleting or justifying one (§13). Components
reference **roles**, never raw hex. Every text/background pair below is chosen to meet **WCAG 2.2 AA**
(≥ 4.5:1 body text, ≥ 3:1 large text / icons / focus rings). The families the brand speaks in:
**indigo** (accent) + **violet** (gradient partner) · **emerald** (success) · **amber** (warning /
caution) · **orange** (high risk) · **rose** (danger / blocked).

### 2.2 Canonical tokens — Light & Dark

These are the source-of-truth values from `packages/ui/src/tokens/index.ts`. Role naming is
`category.role` (dot-keyed in code; `--color-category-role` as CSS vars via `toCssVars()`).

#### Neutrals — surface & text

| Role                 | Light     | Dark      | Use                                   |
| -------------------- | --------- | --------- | ------------------------------------- |
| `bg.canvas`          | `#F7F7F8` | `#0E0E10` | app background                        |
| `bg.surface`         | `#FFFFFF` | `#1A1A1E` | cards, cells, sheets                  |
| `bg.surface2`        | `#F0F0F2` | `#242429` | nested surfaces, input fills, tracks  |
| `border.subtle`      | `#E4E4E8` | `#2E2E34` | hairlines, dividers                   |
| `border.strong`      | `#C9C9D0` | `#3F3F47` | input borders, resting focus edge     |
| `text.primary`       | `#17171B` | `#F4F4F6` | headings, amounts, primary copy       |
| `text.secondary`     | `#5A5A64` | `#A3A3AE` | supporting copy, metadata             |
| `text.tertiary`      | `#8B8B96` | `#6E6E78` | captions, placeholders — **see note** |
| `text.inverse`       | `#FFFFFF` | `#17171B` | text/icon on accent & danger fills    |

> **AA note on `text.tertiary`.** `#8B8B96` on `#FFFFFF` is ≈ 3.1:1 — AA for **large text / icons only**,
> **not** for body-size essential copy. It is legitimate for placeholders and decorative captions; it must
> never carry information a user needs to read at body size. Where the web needs an AA-body-safe muted
> tone it uses `#6E6E79` (≈ 4.9:1) as `--text-3`; treat that as the "tertiary, but readable" variant.

#### Accent (indigo) & the violet partner

| Role              | Light     | Dark      | Use                                       |
| ----------------- | --------- | --------- | ----------------------------------------- |
| `accent.base`     | `#4F46E5` | `#6D66F6` | primary buttons, active nav, links, focus |
| `accent.pressed`  | `#4038C7` | `#5B54E0` | pressed / active fills                    |
| `accent.subtle`   | `#EEEDFD` | `#26244B` | selected rows, chips, ghost fills         |
| `accent.onAccent` | `#FFFFFF` | `#FFFFFF` | text/icon on the accent fill              |

The dark `accent.base` (`#6D66F6`) naturally leans **electric violet** — that hue shift *is* the secondary
color, not a separate token. The only literal violet in the system is the **net-worth hero wash**: a
135° gradient `accent.base → color-mix(accent 72%, #A855F7)`. Violet appears **nowhere else** — not on
buttons, not on text, not on icons.

#### Semantic — meaning only

| Role            | Light               | Dark                | Meaning                        |
| --------------- | ------------------- | ------------------- | ------------------------------ |
| `success.base`  | `#0F9D58` (emerald) | `#34C77B`           | confirmations, received funds  |
| `warning.base`  | `#B45309` (amber)   | `#F59E0B`           | caution, stale data            |
| `danger.base`   | `#DC2626` (rose)    | `#F87171`           | destructive, failures          |
| `info.base`     | `#0369A1`           | `#38BDF8`           | neutral notices                |

Each semantic hue has a `*.subtle` background tint (e.g. success `#E6F6EE` / `#0E2B1D`) for banners and
badge fills — see `styles.css` `--low-bg / --medium-bg / --high-bg / --block-bg`.

#### Risk scale — Risk Engine level → UI (NEVER color-only)

| Level      | `risk.*` (Light / Dark) | Icon             | Label       |
| ---------- | ----------------------- | ---------------- | ----------- |
| **LOW**    | `#0F9D58` / `#34C77B`    | shield-check     | "Low risk"  |
| **MEDIUM** | `#B45309` / `#F59E0B`    | shield-alert     | "Caution"   |
| **HIGH**   | `#EA580C` / `#FB923C`    | alert-triangle   | "High risk" |
| **BLOCK**  | `#DC2626` / `#F87171`    | octagon-x        | "Blocked"   |

Risk is **always** icon **+** label **+** color — never color alone (colorblind-safe; §11). The mapping
is encoded once in `tokens.riskPresentation` and `RISK` (mobile `theme.ts`); do not re-map it locally.

#### Asset brand colors

Token brand colors (BTC `#F7931A`, ETH, SOL, …) are used **only** inside asset icons and sparklines —
never for text, backgrounds, or state — so a chain's brand can never collide with semantic meaning.

### 2.3 Using color

- **Roles, not hex.** Web reads `var(--color-…)` (or the legacy `--accent`/`--text` aliases in
  `styles.css`); mobile reads `useTheme()`. No component hardcodes a hex value.
- **Elevation via surface, not shadow, in dark.** In dark mode a "raised" element steps from `bg.canvas`
  → `bg.surface` → `bg.surface2`; shadows are near-invisible on black and are not the depth cue.
- **`color-mix` for tints** (rings, translucent chips) keeps derived colors bound to the token, e.g.
  `color-mix(in srgb, var(--accent) 20%, transparent)` for the focus halo.

---

## 3 · Typography

System stack — **SF Pro** (Apple) / **Inter** or **Roboto** (elsewhere), via
`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif`. Mono is
**SF Mono / Menlo / Roboto Mono** for addresses, hashes, and seed words.

**One hard rule, everywhere: `font-variant-numeric: tabular-nums lining-nums` on every numeral.** Amounts,
balances, deltas, countdowns — all tabular, so digits do not reflow as values tick.

### 3.1 Type scale

Canonical scale from `tokens.typography` (`size / line / weight`):

| Token      | Size / Line | Weight | Tracking  | Use                                  |
| ---------- | ----------- | ------ | --------- | ------------------------------------ |
| `display`  | 40 / 46     | 700    | -0.02em   | portfolio total (Home hero)          |
| `title1`   | 28 / 34     | 700    | -0.02em   | screen titles                        |
| `title2`   | 22 / 28     | 600    | -0.01em   | section / sheet titles               |
| `headline` | 17 / 22     | 600    | 0         | row titles, button labels            |
| `body`     | 17 / 24     | 400    | 0         | default copy                         |
| `callout`  | 16 / 21     | 400    | 0         | secondary copy in cards              |
| `subhead`  | 15 / 20     | 400/600| 0         | list metadata                        |
| `footnote` | 13 / 18     | 400    | 0         | captions, legal, timestamps          |
| `caption`  | 11 / 13     | 500    | +0.02em   | badges, tab labels                   |
| `mono`     | 15 / 20     | 450    | 0         | addresses, hashes, seed words        |

**Weights:** 400 body · 500 caption/label · 600 headline/emphasis · 700 titles/display. Weight, not
italic, carries emphasis. Tracking tightens as size grows (large text goes negative; small caps-y labels
go slightly positive) — the display/title tokens use ≈ -0.02em; caption/label ≈ +0.02–0.06em.

> **Implementation note.** The web (`styles.css`) sets body at **15px/1.55** and the hero total at 34px —
> a slightly denser scale than the canonical `body 17 / display 40`. Mobile (`theme.ts`) matches the
> canon (display 40/800, body 15). This is known drift (§13); the canonical scale above governs new work.

### 3.2 Type rules

- **Dynamic Type / zoom:** scale to XXL; amounts **wrap, never truncate** (a clipped balance is a lie —
  §11). Layouts reflow; no fixed-height text clipping.
- **One label per card.** Small uppercase `caption` labels are a seasoning, not a paragraph — one per
  card region ("NET WORTH", "YOU RECEIVE").
- **Never center long copy.** Titles and amounts may center; sentences left-align (LTR) / mirror on RTL.
- **Mono for anything a machine reads back** (addresses, tx hashes, seed words) — EIP-55 casing preserved.

---

## 4 · Spacing & layout

**Base unit 4; primary rhythm 8** ("the 8px system"). Steps: `1`=4 · `2`=8 · `3`=12 · `4`=16 · `5`=20 ·
`6`=24 · `8`=32 · `10`=40 · `12`=48 · `16`=64 (from `tokens.space`; mobile `space` aliases
`xs/sm/md/base/lg/xl/xxl` = 4/8/12/16/24/32/48). Compose spacing from these steps only — no `7px`,
no `13px`.

| Token             | Value    | Use                                              |
| ----------------- | -------- | ------------------------------------------------ |
| `layout.margin`   | 20       | screen horizontal margins (web `.app` uses 20)   |
| `layout.gutter`   | 12       | grid gutters between cards                        |
| `size.row.sm/md/lg` | 48/56/72 | rows: settings / assets / activity              |
| `size.touch.min`  | **44×44**| minimum touch target — **hard rule**             |
| `size.button.h`   | 52       | primary button height (canon)                     |

- **Content column:** the web app centers on `max-width: 760px` (`.app`) — a reading-width column, not a
  full-bleed dashboard. Mobile is single-column, thumb-reachable.
- **Vertical rhythm:** card internal padding 16–22; card-to-card gap 12; section gap 24.
- **Thumb zone:** primary actions live bottom-reachable on mobile; destructive actions never sit under a
  resting thumb.

---

## 5 · Radius, elevation & depth

### 5.1 Radius

`tokens.radius`: `xs` 8 (chips) · `sm` 12 (inputs, cells) · `md` 16 (cards) · `lg` 24 (sheet top
corners) · `full` 9999 (pills, FAB, avatars). *(Web `styles.css` currently ships `--radius:14 / --r-sm:10
/ --r-lg:16`; mobile `radius` = `sm:10 / md:14 / lg:20 / pill:999`. Both are ~2px tighter than canon —
tracked drift, §13. New surfaces use the canonical scale.)* Radius is consistent within a component
family; never mix 8 and 16 on sibling corners.

### 5.2 Elevation

Light mode = **layered, low-opacity shadows**; dark mode = **surface steps, effectively no shadow**.

| Level | Light shadow                                            | Use                          |
| ----- | ------------------------------------------------------ | ---------------------------- |
| `e1`  | `0 1px 2px rgba(24,24,40,.04), 0 4px 10px …/.04`        | cards, cells (default)       |
| `e2`  | `0 2px 8px …/.08`                                       | sticky bars, command bar     |
| `e3`  | `0 1px 3px …/.05, 0 12px 28px …/.09`                    | sheets, dialogs, menus       |

The net-worth hero is the one deliberately elevated object: it carries a **colored** shadow
`0 12px 32px color-mix(accent 32%, transparent)` because it *is* the brand moment. Everything else stays
quiet.

### 5.3 Depth philosophy

Depth communicates **hierarchy and interactivity**, nothing more. A raised surface means "this is a
distinct object you can act on." We earn depth with **one hairline border + one soft shadow**, never with
gradients-on-everything, glassmorphism, or hard black drop-shadows. The discipline *is* the aesthetic
(Linear/Rabby lineage): if a screen looks flat-cheap, the fix is contrast and spacing, not more shadow.

---

## 6 · Component inventory

Every component ships with **all** states below designed **and** verified in light + dark, keyboard-
reachable, AA, reduced-motion-safe. States marked ⭘ are mandatory to build and test. Class names in
`(mono)` are the real selectors in `apps/web/src/styles.css` / primitives in `apps/mobile/ui.tsx`.

### 6.1 Button `(.btn)`

- **Anatomy:** container (h 52 / 44 compact), label `headline`, optional leading icon 20.
- **Variants:** `primary` (accent fill, `.btn.primary`) · `secondary` (surface2 fill, primary text) ·
  `tertiary` (text-only accent) · `destructive` (danger fill) · `send` (40px circular icon button,
  `.btn.send`) · `hold-to-confirm` (see ConfirmSheet).
- **States ⭘:** default · **hover** (`primary` → `accent.pressed`) · **focus-visible** (2px accent ring
  + halo, §11) · **press** (`transform: translateY(1px)`, ~50 ms) · **loading** (spinner replaces icon,
  **label stays** — "Approving…", not a bare spinner; stays ≥ 400 ms to avoid flicker) · **disabled**
  (opacity ~0.5, no pointer events) · empty/error N/A.
- **Behavior:** double-tap guarded by disable-on-first-tap. **A11y:** `role=button`; loading announces
  "in progress"; target ≥ 44 pt including margin.

### 6.2 CommandBar / Composer — the signature `(.composer)`

The intent input is the product's front door.

- **Anatomy:** pill container (`radius.full`, surface, `e2`), sparkle glyph, rotating placeholder
  ("Convert my BTC to ETH…"), send arrow (`.btn.send`, appears on text), example chips (`.examples`,
  `.ex`).
- **States ⭘:** idle · **focused** (accent border via `:focus-within`, suggestions rise) · listening
  (waveform + live transcript, when voice is present) · **thinking** (shimmer border ~1.2 s,
  cancellable) · **degraded** (LLM down → placeholder becomes "Try: Send · Swap · Receive" and taps open
  forms — the fallback is *designed*, §9).
- **Suggestion chips `(.ex / .chip)`:** max 3, context-aware, `accent.subtle` fill.
- **A11y:** `textbox` role; thinking announces "working on it"; fully usable type-only (voice never
  required).

### 6.3 PlanCard — quote presentation `(.flow / .route / .cost)`

**Fixed order — recognition is safety; never reorder:**

1. Route summary (`.route`, `.route-node`, `.route-arrow`) — "2 steps · ~12 min · via 2 partners"
2. **You send** row — asset icon, amount, fiat
3. **You receive (min)** row — "at least" prefix, amount, fiat
4. Fee row (`.cost`, `.cost-k/.cost-v`) — "Total cost $21.30 (1.01%)" → taps expand itemized network /
   partner / our fee
5. RiskBadge row (§6.6)
6. Expiry ring — 30 s countdown on the CTA

- **States ⭘:** fresh · **expiring** (< 10 s → ring amber) · **expired** (card dims, CTA → "Get new
  quote") · **re-quoted-worse** (delta highlighted, requires re-read) · re-quoted-better (success tint).
- **A11y:** announced top-to-bottom as one summary *before* the CTA gains focus.

### 6.4 ConfirmSheet / Authorize — THE trust boundary `(.authz)`

One anatomy, everywhere. This is where the doctrine ("deterministic code verifies, the signature
disposes") becomes UI. Effects are **decoded client-side** — server text is never trusted here.

- **Anatomy (never reordered):** grabber + title (verb+object: "Send $100") → effects list (what leaves,
  what arrives) → destination row (AddressChip + contact name + "first time" tag) → fee + ETA →
  RiskBadge (LOW may collapse; MEDIUM+ always expanded) → CTA (`.authz-allow` / `.authz-deny`).
- **CTA by risk:** LOW → primary + biometric · MEDIUM → "I understand, continue" + biometric · HIGH →
  **hold-to-confirm 800 ms** (progress ring + escalating haptic) + typed word above a threshold · BLOCK →
  **no CTA**, only "Why blocked" + "Report mistake".
- **States ⭘:** loading-simulation (skeleton effect rows, CTA disabled: "Checking exactly what will
  happen…") · **simulation-mismatch** (danger panel: "This would do something different than expected" —
  only [Cancel]) · expired · declined-biometric (returns to sheet, nothing sent).
- **A11y:** focus trapped; full content announced before CTA is focusable; hold-to-confirm has a
  switch-control alternative.

### 6.5 StepTracker / Execution timeline `(.stages / .stage / .exec)`

- **Anatomy:** vertical rail (`.stage-rail`, `.stage-dot`); per step: status glyph (pending ○ / active
  spinner / done ✓ draw-on / failed ✕ / waiting-signature ✍), title, sub ("Confirming 2 of 3 · ~4 min").
- **States ⭘:** running (`.stage-active`) · waiting-for-signature (pulses + "Confirm step 2") ·
  recovering ("Finding a new route…") · **parked** (`.exec-parked` — "Your 0.021 wBTC is safe on
  Ethereum" + Resume) · completed (`.exec-completed`, celebrate once) · **failed** (`.exec-failed`,
  plain-language reason + support).
- **Behavior:** survives app kill — reopens to the same state from **server truth**, not local optimism.

### 6.6 RiskBadge `(.risk-low/.risk-medium/.risk-high/.risk-block)`

Icon + label + color (§2.2). BLOCK is a **full-width banner**, not a badge. A "Why?" link opens a
RiskSheet with plain-language reasons ("Token created 2 days ago", "Sell tax detected: 12%").

### 6.7 AssetRow `(.pf-asset)` & AmountDisplay

- **AssetRow anatomy (h 56):** asset icon 32 (16 network mini-badge only inside asset-detail context),
  name `headline`, holdings `subhead`; right: fiat value + 24h delta.
- **States ⭘:** default · pressed · **provisional** (pulse dot + "confirming") · **stale** (dim ~70% +
  clock glyph) · **hidden-balance** (••••).
- **AmountDisplay:** tabular nums; tap toggles full precision; **sign + color for deltas** (+ success /
  − primary text — a loss in *balances* is not red; red is reserved for *risk*). Rounding per
  [`docs/design/08-standards.md`](docs/design/08-standards.md) §1.4 — "you receive" rounds **down**, "you
  pay" rounds **up**; we never flatter a number the user is about to commit to.

### 6.8 AddressChip / ChainChip

- **Anatomy:** identicon 20, mono truncated `0x9858…da94` (6…4), copy icon; EIP-55 casing preserved.
- **Behavior:** tap = copy + toast "Address copied" + haptic; long-press = QR quick look. **Never**
  auto-copy on render.
- **A11y:** reads grouped — "address starting 0x 98 58, ending d a 9 4, double-tap to copy".

### 6.9 Identity card `(.id)` & Insights `(.ins)`

- **Identity `(.id / .id-row / .id-chain)`:** the universal identity — BTC + EVM + SOL addresses under
  one card, each with its AddressChip and network label. Never invents an address it hasn't derived.
- **Insights `(.ins / .ins-slice / .ins-health)`:** portfolio intelligence — allocation slices, health
  stat, alerts. **Honesty rule (project memory):** Insights only render when their net worth matches the
  real wallet read; a partial/failed read shows the stale/partial treatment, never a confident wrong
  number.

### 6.10 Supporting set (same rigor, condensed)

**Card `(.card)`** · **Chip / Pill `(.chip / .badge)`** · **AccountChip + switcher `(.account-chip /
.account-menu / .acct-item)`** · **NetworkLabel `(.lb-net / .lb-testnet)`** (testnet/capped labeled
honestly — §12) · **Slippage control `(.slippage / .slippage-opt)`** · **Receive/QR `(.rcv-modal /
.qr-img)`** (ecosystem-specific address, copy, share) · **Nav `(.nav / .nav-item / .navbar-bottom)`**
(sidebar on web, bottom tab bar on mobile; active = filled icon + accent) · **Settings rows `(.set-row /
.set-group)`** · **Activity `(.activity-row)`** (expand to reveal chain / fee / risk / explorer link) ·
**Skeleton `(.skeleton / .sk-nw)`** · **EmptyState `(.sect-empty / .ai-empty)`** (one 48 glyph, one
sentence, exactly ONE CTA) · **AuthGate `(.auth / .gate)`** · **PhraseGrid / reveal `(.reveal-auth)`**
(re-auth to reveal; blur-on-background; screenshot warning) · **`.sr-only`** (visually-hidden live-region
text). Full screen-by-screen specs: [`docs/design/`](docs/design) 02–07.

---

## 7 · The 5-state contract (every data surface implements all of them)

Non-negotiable — a wallet that shows a wrong or zero number is worse than one that shows nothing. Deep
rules in [`docs/design/08-standards.md`](docs/design/08-standards.md) §2.

| State       | Rule                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| **Loading** | Skeleton matching final layout within 100 ms; keep last-known data + shimmer on refresh (no blank→pop); spinners only inside buttons. |
| **Empty**   | One 48 glyph, one sentence, exactly ONE primary CTA. Empty ≠ error — tone is inviting.               |
| **Error**   | Plain-language problem (no raw codes in the face — code under "Details"); state the cause; offer the next action. Never a dead end; distinguish retryable from terminal. |
| **Stale**   | **Show the data**, dim to ~70%, add clock glyph + "as of <time>", quietly auto-refresh. **Never** silently show wrong/zero. |
| **Offline** | Global banner; cached reads work; any money action needing the network is disabled up front ("You're offline"), not failed after the fact. |

**The honesty invariant** (doctrine #3): a **network failure is not `$0`.** A genuine on-chain zero and a
failed read are **different states** and must look different on every balance surface (this is enforced
across Home and Portfolio in both apps — see project memory "balances fail-soft honesty").

---

## 8 · Iconography

- **Grid** 24×24, **stroke 1.75**, rounded caps/joins. Filled variants **only** for active tab/nav state.
- **Source:** SF Symbols (iOS) / Material Symbols (Android) for OS concepts; a custom crypto set (assets,
  chains, risk glyphs) drawn on the same grid.
- **Sizes:** 16 inline · 20 rows · 24 default · 28 tab bar · 48 empty states.
- **Labels:** an icon never stands alone **except** the universally-learned few — back, close, copy, QR,
  settings-gear. Risk and status icons are **always** paired with a text label (§11).
- **No emoji as UI.** The sparkle/wave brand marks are the only expressive glyphs, used sparingly.

---

## 9 · Motion

Motion clarifies causality and state; it is never ornament. Canonical durations (`tokens.motion`):

| Token             | Value                                  | Use                              |
| ----------------- | -------------------------------------- | -------------------------------- |
| `motion.instant`  | 80 ms, linear                          | pressed states, toggles          |
| `motion.quick`    | 200 ms, ease-out                       | fades, chips, row expand         |
| `motion.standard` | 300 ms, standard curve (0.2,0,0,1)     | screen transitions               |
| `motion.celebrate`| 600 ms, ease-in-out                    | success checkmark draw-on (once) |
| sheet             | spring (mass 1, damping 26, stiff 300) | sheet present / dismiss          |

**Meaningful transitions land in the 150–250 ms sweet spot** (the web uses a 150 ms `background`
transition + a `cubic-bezier(0.22,1,0.36,1)` ease token `--ease`; mobile `motion` = 120/200/320). The
progress-bar/allocation grow uses `cubic-bezier(0.2,0.7,0.2,1)`.

**Rules:**

- Nothing blocks input longer than **300 ms**.
- Loading buttons stay loading a **minimum ~400 ms** (no flicker).
- **`prefers-reduced-motion: reduce`** → springs/slides become ≤ 150 ms cross-fades; parallax, the wave,
  the celebrate draw-on, and skeleton shimmer are **disabled**. Nothing is conveyed by motion alone. This
  is wired in `styles.css` (`@media (prefers-reduced-motion: reduce)` and the paired
  `no-preference` block) and is a CI/manual acceptance gate, not optional.
- Skeleton shimmer = ~1.2 s loop (off under reduced motion).

Haptics map (mobile) lives in [`docs/design/01-tokens.md`](docs/design/01-tokens.md) §7.

---

## 10 · Content & tone

Voice: **calm, plain, honest, second-person.** Say "recovery phrase" not "seed"; "network fee" not "gas";
"convert" not "swap" in user copy (swap stays an internal term). Never hype in system surfaces. Numbers
are never dramatized. Errors apologize without groveling and always give the next step. Every irreversible
action states its irreversibility **once**, clearly, before it happens. Full rules:
[`docs/design/08-standards.md`](docs/design/08-standards.md) §6.

---

## 11 · Accessibility — WCAG 2.2 AA, gated, non-negotiable

- **Contrast:** ≥ 4.5:1 text · ≥ 3:1 large text / icons / focus rings. Token pairs pre-verified (§2.2);
  the tightest is `text.tertiary` — never use it for body-size essential copy.
- **Focus:** every interactive element has a **visible** `:focus-visible` ring — 2px `accent.base` + a
  `color-mix(accent 20%, transparent)` halo — meeting 3:1 against its background. Focus order matches
  visual order; sheets trap focus; navigation moves focus to the meaningful element.
- **Touch:** ≥ 44×44 pt targets including spacing; primary actions bottom-reachable.
- **Screen readers:** amounts and status read as **coherent sentences** ("Ethereum, 0.61 ETH, $2,079, up
  2.1% today"); live regions announce thinking / stale / countdown / error; `.sr-only` carries the
  spoken-only text.
- **Color is never the sole channel:** risk/status = icon + label + color; colorblind-safe hues verified.
- **Dynamic Type / zoom:** scale to XXL; amounts **wrap, never truncate**.
- **Motion:** honors `prefers-reduced-motion` (§9).
- **Alternatives:** charts have a data-table read-out; hold-to-confirm has a switch-control path; voice
  intent has full typed parity; QR/scan has manual entry.

Deep spec: [`docs/design/08-standards.md`](docs/design/08-standards.md) §4.

---

## 12 · Honesty in the UI (design's half of the doctrine)

Design carries doctrine #3 as much as the engines do:

- **Never fabricate UI.** No screen, button, chart, or metric for a feature that does not exist. If the
  engine can't do it, the UI doesn't pretend it can. (Empty and degraded states are how we say "not yet"
  honestly.)
- **Network-labeled truth.** Testnet is **labeled testnet** (`.lb-testnet`); capped mainnet is **labeled
  capped**; a mainnet real-funds action is guarded and labeled. Some labels are intentionally fixed and
  **honest** — e.g. EVM history shown as Sepolia and Home net worth shown as mainnet are true statements
  about what the data *is*; do **not** "fix" them to a dynamic label (project memory "network-labeling
  truths").
- **No borrowed demo numbers**, ever. Placeholder text is obviously placeholder; it never mimics a real
  balance.
- **Provisional vs confirmed** are visually distinct (AssetRow §6.7); nothing reads "confirmed" that is
  not on-chain.

---

## 13 · Token governance & the drift ledger

**Source of truth = [`packages/ui/src/tokens/index.ts`](packages/ui/src/tokens/index.ts)** — the
platform-agnostic `colors / space / radius / typography / motion / sizing / riskPresentation` objects,
with `toCssVars()` flattening a scheme into `--color-*` custom properties for web. Web CSS variables and
mobile `theme.ts` **derive** from these; **no component hardcodes a raw value.**

**Governance:** tokens change via PR to `packages/ui/tokens` with before/after light+dark screenshots.
Adding a **new** color requires deleting or justifying an old one — the palette stays small by policy. A
token rename ripples through `toCssVars()` consumers and the mobile `Palette`, so it is a deliberate,
reviewed act.

**Known drift to reconcile (do not add to it):** the three surfaces are not yet byte-identical, and this
document declares the canon they converge to.

| Token area          | Canon (`tokens/index.ts`)      | Web `styles.css`               | Mobile `theme.ts`              |
| ------------------- | ------------------------------ | ------------------------------ | ------------------------------ |
| `bg.canvas` light   | `#F7F7F8`                       | `#FAFAFB`                       | `#FFFFFF`                       |
| `accent.base` light | `#4F46E5`                       | `#4F46E5` ✓                     | `#5B54E6`                       |
| `accent.base` dark  | `#6D66F6`                       | `#7C74FF`                       | `#6D66F6` ✓                     |
| radius `md` (card)  | `16`                            | `14`                            | `14`                            |
| `body` size         | `17`                            | `15`                            | `15`                            |
| `text.tertiary` L   | `#8B8B96` (AA-large)            | `#6E6E79` (AA-body) as `--text-3`| `#8B8B95`                      |

These deltas are cosmetic and intentional-until-reconciled; when you touch one of these surfaces, move it
**toward** the canon (or, if the implementation value is the better one — e.g. the web's AA-body
`text.tertiary` — promote it into `tokens/index.ts` via governed PR). Either way, close drift; never widen
it.

---

## 14 · DO / DON'T

**DO**

- Reference **roles/tokens**, never raw hex, size, or duration.
- Design **every** state (§7) — including degraded-AI and stale — before writing the happy path.
- Keep the **ConfirmSheet / PlanCard anatomy fixed**; recognition is a security feature.
- Make numbers **tabular** and let them **wrap, never truncate**.
- Give **one** accent, **one** hero moment (net-worth wash), **quiet** everything else.
- Design **light and dark with equal care**; use surface steps for depth in dark.
- Honor `prefers-reduced-motion`; keep meaningful motion 150–250 ms.
- Label testnet/capped/provisional honestly; distinguish a failed read from a real zero.

**DON'T**

- **Don't go flat-cheap** — no un-bordered gray boxes, no missing hover/focus/press states, no default
  system fonts-and-blue.
- **Don't go AI-generic** — no glassmorphism, no purple-gradient-on-everything, no neon glow, no emoji as
  buttons, no stock hero clichés.
- **Don't fabricate UI** — never a control or metric for a feature that doesn't exist; never a borrowed
  demo number; never "$0" for a network failure.
- **Don't add a color** without deleting/justifying one; don't use a semantic hue decoratively; don't use
  violet outside the hero wash.
- **Don't convey meaning by color or motion alone** (§11).
- **Don't reorder** a money surface, auto-copy an address, or let a spinner replace a button label.
- **Don't hardcode** a hex/px/ms, and don't widen token drift (§13).

---

## 15 · Where to go deeper

| You're working on…              | Read                                                             |
| ------------------------------- | --------------------------------------------------------------- |
| Exact token values / haptics    | [`packages/ui/src/tokens/index.ts`](packages/ui/src/tokens/index.ts), [`docs/design/01-tokens.md`](docs/design/01-tokens.md) |
| A component's full state matrix  | [`docs/design/02-components.md`](docs/design/02-components.md)   |
| Navigation / IA                  | [`docs/design/03-navigation.md`](docs/design/03-navigation.md)  |
| A specific screen                | `docs/design/04-…` onboarding · `05-…` home · `06-…` intent · `07-…` settings |
| Validation / states / a11y / i18n / tone | [`docs/design/08-standards.md`](docs/design/08-standards.md) |
| End-to-end user journeys         | [`docs/design/09-journeys.md`](docs/design/09-journeys.md)      |
| The broader UX contract          | [`UX_GUIDELINES.md`](UX_GUIDELINES.md)                           |
| Why any of this — the doctrine   | [`CLAUDE.md`](CLAUDE.md) §3                                      |

> Design is not the paint at the end. In Intent Wallet, the confirm sheet, the honest stale state, and
> the labeled testnet **are** the security model wearing a face the user can trust. Ship world-class or
> don't ship.
