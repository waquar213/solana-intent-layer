[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Volume III — the long-form behind [Chapter 3](../bible/chapter-03-design-system.md)

# The Design System Reference

*The buildable expansion of Chapter 3's charter — real token values, full component state matrices, and the signature AI chat UI, grounded in the live codebase.*

**About this document.** [Chapter 3](../bible/chapter-03-design-system.md) is the memorize-it charter — the
philosophy, the scales, the laws. This is its **reference implementation spec**: every token with its real
value, every component with its full state matrix, tagged **SHIPPED** (a real class/token in the repo) or
**PROPOSED** (a gap to fill). Where a value here differs from the charter, that is a reconciliation item
named on purpose (the drift ledger) — never a silent drift.

| § | Section | Grounded in |
|---|---|---|
| 1 | Design Tokens & Foundations | `packages/ui/src/tokens`, `toCssVars()` |
| 2 | The Spacing & Layout System | `tokens.space`, `styles.css` |
| 3 | Typography | `tokens.typography`, `styles.css`, mobile `theme.ts` |
| 4 | The Color System | `tokens.colors`, both themes |
| 5 | Iconography & Depth | `styles.css` shadows/borders |
| 6 | Motion, Animation & Haptics | `tokens.motion`, reduced-motion |
| 7 | Component Library — Controls | `.btn` / inputs / `.card` |
| 8 | Component Library — Surfaces & Feedback | sheets / charts / states |
| 9 | The AI Chat UI | `PlanFlow` / `.composer` / `.stage` |

Honesty first: shipped vs proposed is tagged throughout, and the design-debt findings are real
reconciliation items, not aspirations.

---

## §1 · Design Tokens & Foundations

*The single source of truth from which every color, space, radius, type ramp, duration, and size in Intent
Wallet is derived. If a screen hardcodes a value, that screen is wrong — this section is the law it broke.*

> **Where this sits.** Chapter 2 gave the charter — the UX Laws (§2), the Animation Rules (§7), the Design
> Principles (§10), and the 30 Design Laws (D1–D30) expanded in the Product Operating Manual. Chapter 3 is
> the concrete **system** those laws produce, and §1 is its floor: the token layer every other section of
> this chapter — Spacing/Layout (§2), Typography (§3), Color (§4), Icons/Depth (§5), Motion/Haptics (§6),
> Controls (§7), Surfaces/Feedback (§8), and the AI Chat UI (§9) — cites rather than redefines. Read
> [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) (the canonical design constitution + drift ledger) and
> [`packages/ui/src/tokens/index.ts`](../../packages/ui/src/tokens/index.ts) (the machine-readable source)
> alongside this. When those two, this section, and a screen disagree, that is a **defect** — reconcile it
> on purpose (§1.9), never by drifting.

---

### 1.1 · Philosophy — three layers, one direction of flow

The design system is a **one-way pipeline**. Values flow down; they never flow back up.

```
┌────────────────────────────────────────────────────────────────┐
│  1. PRIMITIVE TOKENS   packages/ui/src/tokens/index.ts          │  ← the only place a raw value is written
│     colors · space · radius · typography · motion · sizing      │
│     riskPresentation                                            │
└───────────────┬────────────────────────────────────────────────┘
                │  toCssVars(scheme)                 mirrored by hand
                ▼                                            ▼
┌───────────────────────────────┐        ┌───────────────────────────────┐
│  2a. SEMANTIC ALIASES (web)   │        │  2b. SEMANTIC ALIASES (mobile) │
│  CSS custom properties in     │        │  Palette + type/space/radius   │
│  apps/web/src/styles.css      │        │  in apps/mobile/theme.ts       │
│  :root { --accent … }         │        │  useTheme() → Palette          │
└───────────────┬───────────────┘        └───────────────┬───────────────┘
                ▼                                          ▼
┌───────────────────────────────┐        ┌───────────────────────────────┐
│  3a. COMPONENTS (web)         │        │  3b. COMPONENTS (mobile)       │
│  .btn .flow .authz .risk-*    │        │  ui.tsx primitives             │
│  read var(--…)                │        │  StyleSheet from useTheme()    │
└───────────────────────────────┘        └───────────────────────────────┘
```

**The rule that makes it a system:** a component references a **role** (`--accent`, `theme.accent`), never a
raw hex, px, or ms. A role references a **primitive**. A primitive is the single edit-site. Change indigo
once, in `tokens/index.ts`, and it ripples to both platforms — nothing else moves. This is Design Law
territory: *no component hardcodes a raw value* (`tokens/index.ts` header; DESIGN_SYSTEM §13).

**Why one `styles.css` + `packages/ui` tokens — and not Tailwind, not a component kit.** The web app is
Vite + React + **one** hand-authored `styles.css` (2,876 lines of class-based CSS) by deliberate constraint
(CLAUDE.md §5):

- **The tokens must be platform-agnostic.** `packages/ui/tokens` is plain typed data — no CSS, no React, no
  RN. Web derives CSS custom properties from it; mobile derives a `Palette` object from the *same* values.
  A utility-class framework like Tailwind lives in the web build only and cannot be the shared truth mobile
  reads. Our source of truth is TypeScript, consumed by two renderers.
- **Premium is a discipline, not a dependency.** "Clean minimal luxe (Rabby × Linear)" (styles.css header)
  is achieved with hairline borders, restrained layered shadows, and one accent — a curated CSS layer, not
  a framework's defaults. A component kit imposes *its* opinions; we hold our own (DESIGN_SYSTEM §1.8,
  "never AI-generic").
- **Auditability.** Every risky money surface (`.authz`, `.flow`, `.risk-*`) has a fixed anatomy we can read
  in one file. Utility-class soup scattered across JSX would make the confirm surface — our trust boundary —
  unauditable. The confirm sheet *is* the security model wearing a face (DESIGN_SYSTEM §14); its CSS must be
  legible.

The cost is honest: web and mobile are **two mirrors of one source**, kept in sync by review, and they are
not yet byte-identical. That gap is not hand-waved — it is tracked in the **drift ledger** (§1.9).

---

### 1.2 · The token groups — real values from `tokens/index.ts`

Seven exports. These are the actual objects; the hexes, points, and milliseconds below are copied from the
source, not idealized.

#### `colors` — semantic color roles (light / dark pairs)

Keyed `category.role` (dot-keyed). Components reference the role; the raw hex lives here only. Full color
treatment, contrast math, and the risk scale are **§4 (Color)** — this table is the token inventory.

| Role                | Light     | Dark      |
| ------------------- | --------- | --------- |
| `bg.canvas`         | `#F7F7F8` | `#0E0E10` |
| `bg.surface`        | `#FFFFFF` | `#1A1A1E` |
| `bg.surface2`       | `#F0F0F2` | `#242429` |
| `border.subtle`     | `#E4E4E8` | `#2E2E34` |
| `border.strong`     | `#C9C9D0` | `#3F3F47` |
| `text.primary`      | `#17171B` | `#F4F4F6` |
| `text.secondary`    | `#5A5A64` | `#A3A3AE` |
| `text.tertiary`     | `#8B8B96` | `#6E6E78` |
| `text.inverse`      | `#FFFFFF` | `#17171B` |
| `accent.base`       | `#4F46E5` | `#6D66F6` |
| `accent.pressed`    | `#4038C7` | `#5B54E0` |
| `accent.subtle`     | `#EEEDFD` | `#26244B` |
| `accent.onAccent`   | `#FFFFFF` | `#FFFFFF` |
| `success.base`      | `#0F9D58` | `#34C77B` |
| `warning.base`      | `#B45309` | `#F59E0B` |
| `danger.base`       | `#DC2626` | `#F87171` |
| `info.base`         | `#0369A1` | `#38BDF8` |
| `risk.low`          | `#0F9D58` | `#34C77B` |
| `risk.medium`       | `#B45309` | `#F59E0B` |
| `risk.high`         | `#EA580C` | `#FB923C` |
| `risk.block`        | `#DC2626` | `#F87171` |

> `TypeScript` exposes `ColorScheme = keyof typeof colors` (`'light' | 'dark'`) and
> `ColorRole = keyof colors['light']` — so a role name is a compile-time-checked union. Typoing a role is a
> build error, not a runtime blank.

#### `space` — 4-pt scale (§2 owns layout)

Keyed by **step number**; value in points. The base unit is 4; the primary rhythm is 8. Compose from these
steps only — there is no `7`, no `13`.

| Step | `1` | `2` | `3` | `4` | `5` | `6` | `8` | `10` | `12` | `16` |
| ---- | --- | --- | --- | --- | --- | --- | --- | ---- | ---- | ---- |
| px   | 4   | 8   | 12  | 16  | 20  | 24  | 32  | 40   | 48   | 64   |

#### `radius`

| Token | `xs` | `sm` | `md` | `lg` | `full` |
| ----- | ---- | ---- | ---- | ---- | ------ |
| px    | 8    | 12   | 16   | 24   | 9999   |

Usage: `xs` chips · `sm` inputs/cells · `md` cards · `lg` sheet top corners · `full` pills/FAB/avatars.

#### `typography` — `{ size, line, weight }` (§3 owns type)

| Token      | size / line | weight | Use                              |
| ---------- | ----------- | ------ | -------------------------------- |
| `display`  | 40 / 46     | 700    | portfolio total (Home hero)      |
| `title1`   | 28 / 34     | 700    | screen titles                    |
| `title2`   | 22 / 28     | 600    | section / sheet titles           |
| `headline` | 17 / 22     | 600    | row titles, button labels        |
| `body`     | 17 / 24     | 400    | default copy                     |
| `callout`  | 16 / 21     | 400    | secondary copy in cards          |
| `subhead`  | 15 / 20     | 400    | list metadata                    |
| `footnote` | 13 / 18     | 400    | captions, legal, timestamps      |
| `caption`  | 11 / 13     | 500    | badges, tab labels               |
| `mono`     | 15 / 20     | 450    | addresses, hashes, seed words    |

#### `motion` — durations in ms (§6 owns motion)

| Token | `instant` | `quick` | `standard` | `celebrate` |
| ----- | --------- | ------- | ---------- | ----------- |
| ms    | 80        | 200     | 300        | 600         |

#### `sizing` — hard accessibility minimums

| Token | `touchMin` | `buttonHeight` | `rowSm` | `rowMd` | `rowLg` |
| ----- | ---------- | -------------- | ------- | ------- | ------- |
| px    | **44**     | 52             | 48      | 56      | 72      |

`touchMin: 44` is a WCAG 2.2 AA floor, not a suggestion — every interactive target is ≥ 44×44 pt including
spacing (§11 of DESIGN_SYSTEM; enforced per component in §7).

#### `riskPresentation` — level → { color role, label }

The one place the Risk Engine's four levels map to UI. **Never re-map this locally.** Risk is *always*
color **+** label **+** icon (the icon set is added at the component layer, §6.6 / this chapter §8) — never
color alone (colorblind-safe).

```ts
riskPresentation = {
  low:    { color: 'risk.low',    label: 'Low risk' },
  medium: { color: 'risk.medium', label: 'Caution'  },
  high:   { color: 'risk.high',   label: 'High risk' },
  block:  { color: 'risk.block',  label: 'Blocked'  },
} satisfies Record<string, { color: ColorRole; label: string }>
```

The `satisfies ColorRole` constraint means a risk color can only point at a color role that actually exists —
the mapping cannot silently reference a deleted token.

---

### 1.3 · `toCssVars()` — the web bridge (and its honest status)

`toCssVars(scheme)` is the specified function that flattens one color scheme into web CSS custom properties:

```ts
export function toCssVars(scheme: ColorScheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, value] of Object.entries(colors[scheme])) {
    out[`--color-${role.replace(/\./gu, '-')}`] = value;   // bg.canvas → --color-bg-canvas
  }
  return out;
}
```

So the **canonical CSS variable name** for a role is `--color-` + the dot-path with dots turned to hyphens:
`accent.base` → `--color-accent-base`, `text.primary` → `--color-text-primary`.

**Shipped vs. specified — stated plainly.** `toCssVars()` exists and is unit-testable in `packages/ui`
(SHIPPED). But `apps/web/src/styles.css` does **not** currently import it — it hand-authors its `:root`
block with a **shorter legacy alias set** (`--accent`, `--surface`, `--text`, `--text-2`, `--text-3`, …),
not the `--color-*` names `toCssVars()` emits, and `grep` finds no `toCssVars`/tokens import under
`apps/web/src`. So the pipeline in §1.1 is, today, **source → hand-mirrored `:root` → components**, with
`toCssVars()` as the *intended* generator not yet wired in. DESIGN_SYSTEM §2.3 already frames the target
state: "Web reads `var(--color-…)` (or the legacy `--accent`/`--text` aliases in `styles.css`)."

> **(proposed) Wire `toCssVars()` into the web build.** Generate both schemes' `--color-*` vars at build/
> boot, keep the legacy `--accent`/`--text-*` aliases as thin `var(--color-*)` pointers for back-compat,
> and delete the hand-copied hexes from `:root`. This closes the largest structural drift (§1.9): today the
> web `:root` is a *transcription* of the tokens and can fall out of sync by hand; after wiring, it is
> *generated* and cannot.

Legacy alias ↔ canonical role, for the values that actually ship in `styles.css` today:

| Legacy web var (shipped) | Canonical role      | `toCssVars()` name (target) |
| ------------------------ | ------------------- | --------------------------- |
| `--canvas`               | `bg.canvas`         | `--color-bg-canvas`         |
| `--surface`              | `bg.surface`        | `--color-bg-surface`        |
| `--surface2`             | `bg.surface2`       | `--color-bg-surface2`       |
| `--border`               | `border.subtle`     | `--color-border-subtle`     |
| `--border-strong`        | `border.strong`     | `--color-border-strong`     |
| `--text`                 | `text.primary`      | `--color-text-primary`      |
| `--text-2`               | `text.secondary`    | `--color-text-secondary`    |
| `--text-3`               | `text.tertiary`*    | `--color-text-tertiary`     |
| `--accent`               | `accent.base`       | `--color-accent-base`       |
| `--accent-press`         | `accent.pressed`    | `--color-accent-pressed`    |
| `--accent-subtle`        | `accent.subtle`     | `--color-accent-subtle`     |
| `--on-accent`            | `accent.onAccent`   | `--color-accent-onAccent`   |
| `--low` / `--low-bg`     | `success.base` / tint | `--color-success-base`    |
| `--medium` / `--medium-bg` | `warning.base` / tint | `--color-warning-base`  |
| `--high` / `--high-bg`   | `risk.high` / tint  | `--color-risk-high`         |
| `--block` / `--block-bg` | `danger.base` / tint | `--color-danger-base`      |

\* `--text-3` is deliberately the AA-**body** value `#6E6E79`, not the token's `#8B8B96` — see §1.9. The
`*-bg` tints (`--low-bg #E6F6EE`, `--medium-bg`, `--high-bg`, `--block-bg`) are web-authored subtle
backgrounds not yet present as first-class tokens — **(proposed)** promote them to `*.subtle` roles in
`tokens/index.ts` so §4/§8 banners derive rather than hardcode.

---

### 1.4 · The mobile mirror — `apps/mobile/theme.ts`

Mobile does not read CSS; it reads a `Palette` object. `theme.ts` **re-declares** the same values by hand as
`darkPalette` / `lightPalette`, plus theme-independent `space`, `radius`, `motion`, `type`, `mono`, and
`RISK` (the mobile twin of `riskPresentation`). Components call `useTheme()`, which returns the active
`Palette` and re-renders on change.

Mobile ↔ canon name map (mobile flattens the dot-paths to camelCase):

| Mobile `Palette` key | Canonical role     |
| -------------------- | ------------------ |
| `canvas`             | `bg.canvas`        |
| `surface`            | `bg.surface`       |
| `surface2`           | `bg.surface2`      |
| `border`             | `border.subtle`    |
| `text` / `text2` / `text3` | `text.primary` / `.secondary` / `.tertiary` |
| `accent`             | `accent.base`      |
| `accentSubtle`       | `accent.subtle`    |
| `success` / `warn` / `danger` | `success.base` / `warning.base` / `danger.base` |

The layout tokens differ in **shape** (not just value) from the canonical source, and this is intentional
for RN ergonomics — document it so no one "fixes" it into a divergence:

- `space` is **word-keyed** on mobile — `xs 4 · sm 8 · md 12 · base 16 · lg 24 · xl 32 · xxl 48` — versus
  the canon's **number-keyed** `1…16`. Same 4-pt grid, different accessor.
- `type` uses RN's `{ fontSize, fontWeight, letterSpacing }`; `display` is `40 / '800' / -1`, `body` is
  `15 / '400'`. Note `display` weight `800` vs canon `700`, and mobile carries an explicit `letterSpacing`
  the token object does not.
- `radius` = `sm 10 · md 14 · lg 20 · pill 999`; `motion` = `fast 120 · base 200 · slow 320`; `mono` is
  `Menlo` on iOS, `monospace` on Android.

`RISK.high` **hardcodes `#FB923C`** rather than reading a palette key, because there is no `high` swatch on
the `Palette` interface (only `success`/`warn`/`danger`). That is a real, small inconsistency with the
token source's dedicated `risk.high` role — logged in §1.9.

---

### 1.5 · Naming convention — the one rule for every token name

**Primitive (source):** `category.role`, dot-keyed, camelCase leaf.
`bg.canvas` · `text.primary` · `accent.pressed` · `success.base` · `risk.block`.
Space/radius/motion/typography are single-word or step-keyed (`space[4]`, `radius.md`, `motion.quick`,
`typography.headline`).

**Web CSS var (canonical, via `toCssVars`):** `--color-` + dot-path with `.`→`-`.
`--color-accent-base`. Legacy aliases (`--accent`, `--text-2`) are permitted **bridges**, never new names.

**Mobile:** camelCase flattening of the dot-path — `accent.subtle` → `accentSubtle`.

**Invariants:**
1. **Semantic, never literal.** Name by *job* (`danger.base`), never by *appearance* (`red-600`). A rose
   that becomes a coral changes one hex; the name still reads true.
2. **Category prefix is mandatory** so autocomplete groups roles and no two categories collide.
3. **Renames ripple.** A token rename touches `toCssVars()`'s consumers, the web aliases, and the mobile
   `Palette` — it is a governed, reviewed act (§1.9), not a find-replace.

---

### 1.6 · Light / dark theming mechanism

Both platforms design light **and** dark with equal care — dark is its own palette, not inverted light
(DESIGN_SYSTEM §1.9). The *mechanism* differs by platform.

**Web (shipped).** `:root` defines the **light** scheme; a single `@media (prefers-color-scheme: dark)`
block re-binds the same custom properties to the dark values. Every component reads `var(--…)`, so the swap
is free — no per-component dark styles, no class toggling.

```css
:root { --canvas:#fafafb; --surface:#fff; --accent:#4f46e5; /* …light… */ }
@media (prefers-color-scheme: dark) {
  :root { --canvas:#0b0b0e; --surface:#141418; --accent:#7c74ff; /* …dark… */ }
}
```

The web currently follows the **OS** preference only. There is **no** `data-theme` attribute in
`apps/web/src` today (`grep` returns nothing).

> **(proposed) `data-theme` override on web.** DESIGN_SYSTEM §2.3 anticipates a user-facing light/dark/system
> toggle. Implement it as a `:root[data-theme="dark"]` / `:root[data-theme="light"]` pair that **wins over**
> the media query, stamped on `<html>` by the toggle. This is the exact pattern our published Artifacts use;
> the web app has not adopted it yet, so calling it "shipped" would be a fabrication.

**Mobile (shipped).** Theming is explicit and stored, not media-only. A `ThemePref` of
`'system' | 'light' | 'dark'` is persisted (`iw.theme.v1`); `activePalette()` resolves `'system'` against
`Appearance.getColorScheme()` and returns `lightPalette` or `darkPalette`. `useTheme()` subscribes to both
the stored-pref change **and** OS scheme changes (only while on `'system'`), re-rendering components that
rebuild their `StyleSheet` from the returned palette. This is the mobile analog of the proposed web
`data-theme` toggle — mobile already has the three-way user override; web does not.

**Reduced motion is part of theming, not an afterthought.** `styles.css` ships paired
`@media (prefers-reduced-motion: reduce)` and `no-preference` blocks (lines 1693, 2017, 2077, 2152, 2204):
springs/slides collapse to ≤ 150 ms cross-fades; the wave, celebrate draw-on, and skeleton shimmer are
disabled. Full treatment is §6; noted here because it is a *foundational environment state* the token layer
serves, alongside light/dark.

**Foundation state matrix — the theme root.** §1 owns no components (controls are §7, surfaces are §8, chat
is §9 — component state matrices live there). Its stateful object is the **theme environment** itself:

| Environment signal            | Web (shipped)                          | Mobile (shipped)                     | Resolves to |
| ----------------------------- | -------------------------------------- | ------------------------------------ | ----------- |
| default / no preference       | `:root` light values                   | `activePalette()` → light or dark    | light unless OS says dark |
| OS = dark                     | `@media (prefers-color-scheme: dark)`  | `Appearance` → `darkPalette`         | dark |
| user override light           | *(proposed `data-theme="light"`)*      | `setThemePref('light')`              | light |
| user override dark            | *(proposed `data-theme="dark"`)*       | `setThemePref('dark')`               | dark |
| reduced motion                | `@media (prefers-reduced-motion)`      | RN `AccessibilityInfo` (per §6)      | motion tokens shortened/disabled |

---

### 1.7 · How components consume tokens (the contract §7–§9 inherit)

- **Web:** class-based selectors read custom properties — `.btn.primary { background: var(--accent); }`,
  `.authz`, `.flow`, `.risk-low`. Derived colors use `color-mix` **bound to a token**, never a new hex:
  the focus halo is `color-mix(in srgb, var(--accent) 20%, transparent)`; the net-worth hero wash — the one
  sanctioned violet — is `linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 72%, #a855f7))`
  (styles.css line 171). `#a855f7` is the *only* literal color permitted outside the token file, and only in
  that one gradient (§4 governs it).
- **Mobile:** `ui.tsx` primitives build `StyleSheet`s from `useTheme()`; no primitive holds a literal color.
- **Numerals everywhere:** `font-variant-numeric: tabular-nums lining-nums` on every digit so amounts don't
  reflow as they tick — a typographic rule §3 enforces, seeded here because it is a foundation-level
  invariant, not a per-component choice.

No component in either app may introduce a raw hex, px, or ms. If a needed value doesn't exist as a token,
the fix is to **add the token** (governed, §1.9), never to inline the literal.

---

### 1.8 · Where §1 hands off

| You need…                                   | Go to |
| ------------------------------------------- | ----- |
| The 4-pt grid, layout margins, row heights  | **§2 · Spacing & Layout** |
| The type ramp in use, tracking, tabular nums | **§3 · Typography** |
| Contrast math, the risk scale, the violet wash rules | **§4 · Color** |
| Icon grid, elevation levels, depth philosophy | **§5 · Icons & Depth** |
| Motion curves, reduced-motion, mobile haptics | **§6 · Motion & Haptics** |
| Buttons/inputs/chips full state matrices    | **§7 · Components: controls** |
| Cards/sheets/risk badges/skeletons/empty states | **§8 · Components: surfaces & feedback** |
| Composer, PlanCard, ConfirmSheet, timeline  | **§9 · The AI Chat UI** |

---

### 1.9 · The drift ledger — where the mirrors diverge, and which value is canon

The three surfaces (`tokens/index.ts`, web `styles.css`, mobile `theme.ts`) are **not yet byte-identical**.
This is declared, bounded, and directional: **`tokens/index.ts` is canon**; when you touch a diverging
surface, move it **toward** canon (or promote the better implementation value into the source via a governed
PR) — never widen the gap (DESIGN_SYSTEM §13).

| Token area          | Canon (`tokens/index.ts`) | Web `styles.css`            | Mobile `theme.ts`   | Resolution direction |
| ------------------- | ------------------------- | --------------------------- | ------------------- | -------------------- |
| `bg.canvas` L       | `#F7F7F8`                  | `#FAFAFB`                    | `#FFFFFF`            | web + mobile → canon |
| `bg.canvas` D       | `#0E0E10`                  | `#0B0B0E`                    | `#0E0E10` ✓          | web → canon |
| `bg.surface` L      | `#FFFFFF` ✓                | `#FFFFFF` ✓                  | `#F5F5F7`            | mobile → canon |
| `accent.base` L     | `#4F46E5`                  | `#4F46E5` ✓                  | `#5B54E6`            | mobile → canon |
| `accent.base` D     | `#6D66F6`                  | `#7C74FF`                    | `#6D66F6` ✓          | web → canon |
| `accent.pressed` L  | `#4038C7`                  | `#4338CA` (`--accent-press`) | — (n/a)             | web → canon |
| `radius.md` (card)  | `16`                       | `14` (`--radius`)            | `14`                | both → canon (or promote 14) |
| `radius.sm`         | `12`                       | `10` (`--r-sm`)              | `10`                | both → canon |
| `body` size         | `17`                       | `15` (`body` font)          | `15`                | see note ↓ |
| `display` weight    | `700`                      | — (34px hero, per §3)       | `800`               | mobile → canon (or promote 800) |
| `text.tertiary` L   | `#8B8B96` (AA-large)       | `#6E6E79` (AA-body, `--text-3`) | `#8B8B95`        | **promote web value → canon** |
| `warning.base` D    | `#F59E0B`                  | `#F59E0B` ✓                  | `#F5A623` (`warn`)  | mobile → canon |
| `risk.high`         | `#EA580C`/`#FB923C`        | `#C2410C`/`#FB923C`          | hardcoded `#FB923C` (no palette key) | give mobile a `risk.high` key |
| `toCssVars()` usage | emits `--color-*`          | **not wired** — hand `:root`| n/a                 | wire the generator (§1.3) |
| `data-theme` toggle | pattern anticipated        | **absent** — media-query only | 3-way pref shipped | add web override (§1.6) |

**Reading the ledger:**
- A `✓` means that surface already matches canon.
- Most rows are **cosmetic and intentional-until-reconciled** — a ~2px-tighter radius, a hair-cooler canvas.
  They are safe to converge whenever the surface is next edited.
- Two rows are **structural**, not cosmetic, and are the highest-value fixes: **`toCssVars()` is not wired
  into the web** (so the web `:root` is a hand transcription that *can* drift), and **web has no `data-theme`
  override** (so users can't pick a theme independent of the OS). Both are (proposed) in §1.3 / §1.6.
- One row runs **the other direction on purpose:** the web's `text.tertiary` = `#6E6E79` is *better* than
  the token's `#8B8B96` because `#8B8B96` on white is only ≈ 3.1:1 (AA for large text/icons, **not** body),
  while `#6E6E79` is ≈ 4.9:1 (AA body). The correct reconciliation is to **promote the web value into
  `tokens/index.ts`**, not to drag the web back to the failing one (DESIGN_SYSTEM §2.2 AA note).

**Governance.** Tokens change only via PR to `packages/ui/tokens`, with before/after **light + dark**
screenshots. Adding a color requires deleting or justifying one — the palette stays small **by policy**. A
rename is deliberate because it ripples through `toCssVars()` consumers and the mobile `Palette`. The
standing instruction for anyone editing a diverging surface is one line: **close drift, never widen it.**


## §2 · The Spacing & Layout System

> *Consistent spacing is one of the eight things Chapter 2's Design Principles (§10) demand of **every**
> screen — alongside 3-second clarity, one dominant action, and excellent one-handed usability. This
> section is the concrete grid those principles stand on. Spacing is not decoration; it is how the eye
> parses hierarchy in the 5 seconds UX Law 5 gives us. Where §1 fixed the token foundation and §3–§4 own
> type and color, this section owns **rhythm and structure**: the unit, the scale, the touch floor, the
> content column, the safe area, and the thumb.*

The whole system rests on **one base unit — 4 pt — with an 8 pt primary rhythm** ("the 8px system," per
`DESIGN_SYSTEM.md` §4). Every margin, pad, gap, and gutter is a multiple of 4 drawn from one scale, so
that two screens built by two people a year apart still breathe on the same grid. Crucially, **the spacing
and layout scale is theme-independent** — unlike color, it does not swap between light and dark. The mobile
theme states this in code: *"Layout tokens (space, radius, type, mono) are theme-independent; only the
COLOR palette swaps"* (`apps/mobile/theme.ts`). A `24 pt` section gap is `24 pt` in both modes; a `44 pt`
touch target never shrinks in the dark.

---

### 2.1 · The base unit & the space scale

The scale is **shipped** in `packages/ui/src/tokens/index.ts` as `tokens.space` — a 10-step, 4-pt-based
ramp keyed by its step number (the key *is* roughly the value ÷ 4 for the dense end). It is the single
source of truth; web CSS and React Native both derive from it.

| Token (`space.N`) | Value | Common alias | Usage |
| ----------------- | ----- | ------------ | ----- |
| `space.1`  | **4 px**  | `xs`   | hairline gaps, icon-to-label micro-gap, badge inset |
| `space.2`  | **8 px**  | `sm`   | intra-component gap (icon↔text), chip padding, list-item gap |
| `space.3`  | **12 px** | `md`   | **the card gutter** (`layout.gutter`), row inner gap, id-row gap |
| `space.4`  | **16 px** | `base` | card internal padding, screen margin (mobile), input pad |
| `space.5`  | **20 px** | —      | screen horizontal margin (`layout.margin`), card pad (comfortable) |
| `space.6`  | **24 px** | `lg`   | **section gap**, hero vertical padding, view padding (desktop) |
| `space.8`  | **32 px** | `xl`   | large block separation |
| `space.10` | **40 px** | —      | major vertical breaks, empty-state top spacing |
| `space.12` | **48 px** | —      | screen-level whitespace |
| `space.16` | **64 px** | —      | page section dividers, hero breathing room |

**Composition rule (D-law / `DESIGN_SYSTEM.md` §4):** *compose only from these steps — no `7px`, no
`13px`.* Odd values are how a design goes off-grid and starts to look hand-made in the wrong way.

> **Honesty — the scale is shipped, but web does not yet consume it as variables.** `toCssVars(scheme)`
> flattens **only the color palette** into `--color-*` custom properties; it emits **no** `--space-*`,
> `--radius-*`, or `--size-*` variables. As a result `apps/web/src/styles.css` **hand-authors** its spacing
> as raw pixels (`padding: 18px 20px`, `gap: 12px`, …). Most values land on the 4-pt grid, but several
> drift off it (`18`, `22`, `9`, `11`, `13`, `7`, `6` all appear). **(proposed)** Extend `toCssVars()` (or
> a sibling `toSpaceVars()`) to emit `--space-1 … --space-16`, `--radius-*`, and `--size-*`, then replace
> the raw px in `styles.css` with `var(--space-N)`. Until then, treat `tokens.space` as canon and move the
> off-grid literals **toward** it (§2.9), never widen the gap.

**Mobile alias set (`theme.ts`, shipped):** `space = { xs:4, sm:8, md:12, base:16, lg:24, xl:32, xxl:48 }`.
Note this is a **coarser 7-step** set — it omits the canonical `20 / 40 / 64` steps. New mobile work that
needs `20 pt` should not invent `sm+md`; add the step. (Tracked drift, §2.9.)

---

### 2.2 · Rhythm rules

Four rules turn the scale into vertical and horizontal rhythm. All values below are real, from
`tokens` + `styles.css`.

- **Touch floor — 44×44, a hard rule.** `sizing.touchMin = 44` (`tokens.ts`). Every interactive target is
  ≥ 44 pt **including** its padding, per WCAG 2.2 AA (Chapter 2 §10 "one-handed usability"). The shipped
  mobile bottom-tab honors it (`.bnav-item { min-height: 44px }`; mobile `tabItem { minWidth: 56 }`). A
  visual glyph may be smaller than 44 as long as its **hit area** reaches 44 — e.g. the identity row's icon
  is `26×26` but the row is a full-width button padded `9px 12px`, so its height ≈ `26 + 18 = 44`. Pointer-
  only surfaces (the desktop sidebar `.nav-item`, ≈ 40 pt tall) may sit below 44 because a mouse is not a
  thumb; **any touch surface must not.**
- **Gutters — 12.** `layout.gutter = 12` = `space.3`. Card-to-card gaps use it: `.pf { gap: 12px }`,
  `.pf-assets { gap: 12px }`, `.id { margin-top: 12px }`. *(Mobile drift: `theme.ts` comments "gutter =
  base (16)" and uses `16`; converge to 12 — §2.9.)*
- **Section spacing — 24.** `space.6 = 24` separates logical sections; the hero uses `padding: 24px 0` and
  the desktop `.view` uses `padding: 24px 24px 44px`. *(The Home stack `.hv { gap: 18px }` is off-grid;
  canon is 20 or 24 — §2.9.)*
- **Card internal padding — the 16–22 band.** Cards pad between `space.4` (16) and ~22: `.pf-net` `20px
  22px`, `.pf-asset` `14px 16px`, `.id` `16px 18px`, `.activity` `14px 16px`, mobile `card` `space.base`
  (16). Pick one value per card family and hold it; never mix 14 and 20 on sibling cards.

**The vertical rhythm ladder** (apply top-to-bottom on any screen):

| Relationship | Token | Value |
| ------------ | ----- | ----- |
| Label ↔ its value (inside a card) | `space.0.5`–`space.1` | 2–4 px (`.pf-net { gap: 2px }`, `.pf-asset { gap: 4px }`) |
| Icon ↔ label (a row) | `space.2`–`space.3` | 8–12 px (`.id-row { gap: 12px }`, `.activity-row { gap: 10px }`) |
| Item ↔ item (within a list) | `space.1.5`–`space.2` | 6–8 px (`.activity-list { gap: 6px }`, `.id-rows { gap: 8px }`) |
| Card ↔ card | `space.3` | 12 px |
| Section ↔ section | `space.6` | 24 px |

---

### 2.3 · Sizing tokens — the height floor

Heights are **shipped** in `tokens.sizing`. They are floors and family constants, not arbitrary.

| Token | Value | Usage | Reality check |
| ----- | ----- | ----- | ------------- |
| `sizing.touchMin`   | **44** | minimum touch target — hard rule | ✓ honored on all touch surfaces |
| `sizing.buttonHeight` | **52** | primary button height (canon) | mobile `primary` (padV 16) ≈ **52** ✓; web `.btn.primary` (padV 11) ≈ **40** ✗ (§2.9) |
| `sizing.rowSm`      | **48** | settings rows | — |
| `sizing.rowMd`      | **56** | asset rows (`AssetRow` canon height) | web `.pf-asset` is a mini-**card** in a grid, not a fixed-56 row — §2.7 |
| `sizing.rowLg`      | **72** | activity / rich rows | — |

---

### 2.4 · Layout primitives

#### Content column & max width (shipped)

Intent Wallet is a **reading-width column**, never a full-bleed dashboard — a deliberate anti-"crypto
terminal" choice (Chapter 2 "Apple → Minimal").

| Context | Selector | Max width | Padding |
| ------- | -------- | --------- | ------- |
| Legacy / auth screen | `.app` | **760 px**, centered | `18px 20px 0` |
| Unlocked shell (desktop) | `.app.entered` → `.shell` | `grid-template-columns: 244px minmax(0,1fr)` | sidebar `16px 12px` |
| Content view (desktop) | `.view` | **920 px**, centered | `24px 24px 44px` |
| Content view (≤ 900 px) | `.view` | `100%` | `16px 16px 92px` (extra 92 clears the bottom bar) |
| Mobile app | RN `ScrollView` | full-bleed single column | `padding: space.base` (16), `gap: space.md` (12) |

The `244 px` sidebar + `minmax(0,1fr)` content is the desktop skeleton; below `900 px` the sidebar is
replaced by a fixed bottom tab bar and the grid collapses to one column.

#### Safe-area insets

- **Mobile (shipped):** screens are wrapped in `SafeAreaView` (`apps/mobile/App.tsx`), which keeps content
  clear of the notch, status bar, and home indicator on all four edges.
- **Web bottom bar (shipped):** the mobile-web tab bar respects the iOS home indicator explicitly:
  `.navbar-bottom { padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px)) }`.
- **(proposed)** Web currently handles only the **bottom** inset. For installed-PWA / notched landscape,
  add `env(safe-area-inset-top/left/right)` to `.app.entered header` and `.view`, and a
  `viewport-fit=cover` meta. Until then, top/side insets are unhandled on web (acceptable in a normal
  browser chrome, a gap for standalone PWA).

#### The card grid (shipped)

Responsive card grids use CSS Grid auto-fit so cards reflow without media queries:

```css
.pf-assets { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.hv-actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }  /* → repeat(2,1fr) ≤480px */
```

Quick-action tiles are 4-up on desktop, 2-up below 480 px; asset cards flow as many-across as fit at a
`150 px` minimum, single gutter `12 px`.

#### Breakpoints (shipped)

| Breakpoint | Change |
| ---------- | ------ |
| `≤ 900 px` | sidebar → fixed bottom tab bar; `.view` full-width + `92 px` bottom pad; account chip moves to `.view-top` |
| `≤ 560 px` | dense-composer / compact adjustments |
| `≤ 480 px` | `.hv-actions` 4-up → 2-up |

The system is **mobile-adaptive with three breakpoints** — no per-device pixel-pushing; the auto-fit grid
absorbs the middle.

---

### 2.5 · One-handed usability & the thumb zone

Chapter 2 Design Principle §10 lists *"excellent one-handed usability"* as a per-screen requirement; UX
Law 4 sends everything secondary into a bottom sheet. Both are spatial commitments.

**The thumb-zone map** (portrait phone, right thumb — mirror for left):

```
┌─────────────────────────┐
│  HARD REACH             │  ← titles, net-worth hero, read-only status.
│  (top ~25%)             │     Nothing tappable-critical lives here.
├─────────────────────────┤
│  OK REACH               │  ← content, cards, list rows (all ≥44 targets).
│  (middle ~50%)          │
├─────────────────────────┤
│  NATURAL THUMB ZONE     │  ← the primary CTA, the composer, the bottom
│  (bottom ~25%)          │     tab bar. Where money-moving actions live.
└─────────────────────────┘
```

Rules the layout enforces:

- **Primary CTA is bottom-reachable.** The intent composer is `position: sticky; bottom: 0` (`.composer`,
  padded `14px 0 18px`) so the product's front door sits under the thumb on every scroll position.
- **The bottom tab bar is the navigation home base** on mobile (`.navbar-bottom`, fixed, `44 pt` items),
  not a top bar the thumb can't reach.
- **Destructive actions never sit under a resting thumb** (`DESIGN_SYSTEM.md` §4). Wipe / remove / high-risk
  confirms are placed away from the natural-zone default position, or gated behind hold-to-confirm (see §7 /
  the ConfirmSheet), so a fat-finger tap can't dispose of funds.
- **Reach beats density.** When a screen would push a primary action into the hard-reach top, the action
  moves to a bottom sheet (Law 4) rather than shrinking or crowding.

---

### 2.6 · Density

**Shipped: a single, comfortable density.** The system deliberately ships **one** spacing density — a
calm, Apple-Wallet-grade amount of air — rather than a compact/comfortable toggle. Two *component-local*
compact variants exist and are the only exceptions:

- `.account-chip.compact` — `padding: 7px 12px` (vs `9px 11px`) for the header-mounted chip.
- The button "compact" height `44` (vs `52`) for secondary/in-row placement (§7).

**(proposed) A formal density system is not built.** If a genuine power-user need appears (a Pro-mode dense
portfolio, per Chapter 2 Rule 3 "complexity must be earned"), introduce a single `--density` scalar
multiplying the `space` scale (e.g. `compact ×0.75`, `comfortable ×1`) rather than a second hand-tuned set
of literals. Do **not** ship a density mode speculatively — it must earn its place.

---

### 2.7 · Worked layout examples (exact spacing)

Three real surfaces, specified to the pixel from `styles.css`. A developer should be able to rebuild these
without opening the file.

#### A · Home hero (`.hv` / `.hero`)

```
.hv               display:flex; flex-direction:column; gap: 18px      ← section rhythm (→ canon 20/24, §2.9)
└ .hv-greet       gap: 6px
  ├ .hv-title     font 26/680, letter-spacing -0.02em, margin 0
  └ .hv-sub       max-width 56ch, color text-2
└ .composer       sticky bottom; padding 14px 0 18px
  └ form          gap 8px; padding 6px 6px 6px 18px; radius 999px (pill); shadow-lg
└ .examples       gap 8px; margin-top 12px         ← suggestion chips (.ex: padding 7px 13px, gap 6px)
```

Standalone hero (auth/empty): `.hero { padding: 24px 0 }`, title `30/680 -0.02em` with `10px` below,
sub `15px` capped at `46ch`, `26px` before the CTA. One purpose, one primary CTA (UX Laws 1–2).

#### B · A list row (the identity row `.id-row`, representative)

```
.id                 card; padding 16px 18px
├ .id-head          margin-bottom 10px; gap 10px   (title 14/650 ↔ sub 12/text-3)
└ .id-rows          display:grid; gap 8px
   └ .id-row        button; padding 9px 12px; gap 12px; radius 11px; surface2 fill, hairline border
      ├ .id-icon    26×26; radius 8px               → row height ≈ 26+18 = 44 (touch floor met via padding)
      ├ .id-chain   flex:1; min-width:0             (name 13/600 ↔ net 11/text-3)
      └ .id-addr    mono 12; nowrap                 (truncated 0x…; never wraps)
└ .id-foot          margin-top 10px; 11/text-3
```

Compare the **activity row** — a 4-column grid, no per-row card: `.activity-row { grid-template-columns:
18px auto 1fr auto; gap: 10px }` inside `.activity-list { gap: 6px }`, the whole panel padded `14px 16px`.

#### C · A modal / sheet (Receive `.rcv-modal`; and the authorize gate `.authz`)

```
.rcv-overlay   fixed inset:0; padding 20px; flex-center; scrim color-mix(black 45%)
└ .rcv-modal   width 100%; max-width 360px; padding 18px; radius 16px; strong border; heavy shadow
```

Modal max-widths hold a consistent family: `.rcv-modal 360`, `.account-menu 460`, `.wl-send-modal 560`.
The **authorize gate** (the trust boundary, §8 / ConfirmSheet) is tighter and inline:
`.authz { margin-top: 6px; padding: 10px 12px; border-radius: 12px }`, its head a baseline-aligned
space-between row with `gap: 10px`. Its fixed anatomy and per-risk CTA belong to §8 — here only its box
metrics are in scope.

---

### 2.8 · Spacing across states (why the grid never moves)

Spacing is a **recognition** feature: a row must occupy the *same* footprint whether resting, hovered,
focused, or pressed, so the eye trusts the shape (Doctrine — recognition is safety). Full control/surface
state matrices live in §7–§8; the table below documents only the **spatial** invariant.

| Component | default | hover | focus-visible | pressed | disabled | loading | notes |
| --------- | ------- | ----- | ------------- | ------- | -------- | ------- | ----- |
| `.btn.primary` | pad `11px 18px`, radius 12 | pad **unchanged** (fill → `accent.pressed`) | pad unchanged (+2px ring **outside** box) | pad unchanged (`translateY(1px)` only) | pad unchanged (opacity ~0.5) | pad unchanged (label stays, spinner swaps icon) | geometry constant; only paint/transform change |
| `.id-row` | pad `9px 12px`, gap 12 | pad unchanged (border → accent) | pad unchanged (ring outside) | pad unchanged (transform ~1px) | n/a | n/a | 44 pt height held in every state |
| `.ex` (chip) | pad `7px 13px`, gap 6 | pad unchanged (fill `accent.subtle`) | pad unchanged (ring) | pad unchanged | opacity ~0.5, pad unchanged | n/a | reflow only from wrap, never state |

**Invariant:** no state changes box padding or gap. Focus rings render **outside** the box (a `2px` ring +
halo per §5 / a11y), so focus never reflows neighbors. Pressed uses `transform`, not margin. Empty/error
states change *content*, not the container's spacing.

---

### 2.9 · Drift ledger — spacing & layout slice

Extends `DESIGN_SYSTEM.md` §13 with the spacing-specific deltas. **Canon = `tokens/index.ts`.** Close
these when you touch the surface; never widen them.

| Item | Canon (`tokens`) | Web `styles.css` | Mobile `theme.ts` | Action |
| ---- | ---------------- | ---------------- | ----------------- | ------ |
| Spacing as CSS vars | `tokens.space` (SoT) | **none** — raw px hand-authored | RN reads `space` directly ✓ | **(proposed)** emit `--space-*` via `toCssVars`, replace literals |
| Off-grid literals | multiples of 4 only | `18, 22, 9, 11, 13, 7, 6` appear | mostly on-grid ✓ | snap to nearest step (`18→16/20`, `22→20/24`, `9→8`, `11→12`, `13→12`, `7→8`, `6→8`) |
| Card radius | `md = 16` | `--radius: 14` | `radius.md: 14` | move both toward 16 (also §5.1) |
| Screen margin | `layout.margin = 20` | `.app 20` ✓ / `.view 24` (desktop), `16` (mobile) | `space.base 16` | pick one canon margin per surface class; document the two intentionally |
| Card gutter | `layout.gutter = 12` | `12` ✓ | `16` ("gutter = base") | mobile → **12** |
| Primary button height | `sizing.buttonHeight = 52` | `.btn.primary` ≈ **40** (padV 11) | ≈ **52** ✓ (padV 16) | web → raise padV so height ≥ 52 (or 44 compact) |
| Mobile scale steps | 10 steps incl `20/40/64` | full | **7 steps**, omits `20/40/64` | add the missing steps when needed |
| Row height family | `rowSm/Md/Lg = 48/56/72` | `.pf-asset` is a grid card, not a fixed row | rows via padding | keep card-grid for portfolio; use `rowMd 56` where a true list row is built |

---

### 2.10 · DO / DON'T (spacing & layout)

**DO**
- Build every gap, pad, and gutter from `tokens.space` — 4-pt steps only; no `7px`, no `13px`.
- Keep touch targets **≥ 44 pt** including padding; put the primary CTA and nav in the bottom thumb zone.
- Hold a component's box geometry **constant across all states** — animate paint/transform, never padding.
- Use the auto-fit card grid (`minmax(…, 1fr)`, `gap: 12`) so layouts reflow without per-device code.
- Honor safe-area insets — `SafeAreaView` on mobile, `env(safe-area-inset-bottom)` on the web bottom bar.

**DON'T**
- Don't hardcode a raw pixel that isn't on the scale, and don't widen the drift in §2.9.
- Don't place a destructive or money-moving action under a resting thumb, or a critical tap in the top
  hard-reach band.
- Don't let a hover/focus/pressed state reflow neighbors — focus rings render **outside** the box.
- Don't invent a compact density with a second set of literals; scale the one system (proposed `--density`).
- Don't ship a full-bleed "terminal" layout; the product is a reading-width column (760 / 920 / mobile-full).

> **Sibling sections:** the radius/elevation values referenced here are owned by **§5 (Icons & Depth)**;
> type sizes by **§3**; color roles by **§4**; motion (the `translateY(1px)` press, the sticky-composer
> reveal) by **§6**; the full control and surface **state matrices** by **§7–§8**. This section is the
> grid they all stand on.


## §3 · Typography

> *The number is the hero.* Chapter 2's Design Principles (§10) demand "accessible typography" and
> "3-second clarity"; Doctrine #4 demands that money is an integer bigint until the very last pixel, where
> it is formatted for a human. Type is where those two laws meet the eye. This section is the concrete type
> system that Laws **D-scale** (one scale, no ad-hoc sizes), **D-tabular** (figures never jitter), and
> **D-honest** (a clipped balance is a lie) produce. It is grounded in `packages/ui/src/tokens/index.ts`
> (`typography`), `apps/web/src/styles.css`, and `apps/mobile/theme.ts` (`type`, `mono`). Where the three
> surfaces drift, the drift is named and the canon is declared — this section does not paper over it.

Cross-refs: the type scale's *rhythm* (baseline, vertical spacing) lives in **§2 · Spacing/Layout**; the
*contrast* of every text-on-surface pair is verified in **§4 · Color**; the chat transcript's bubble type
is specialized in **§9 · AI Chat UI**. This section owns the scale, the stacks, the numeral mandate, and
the wrap/truncation contract.

---

### 3.1 · Font stacks — and why

We ship **no web fonts.** There is no `@font-face`, no Google Fonts link, no bundled Inter binary. This is
a deliberate performance and honesty choice: the system UI font (SF Pro on Apple, Segoe/Roboto elsewhere)
is already installed, renders at zero network cost, zero layout-shift, and is the typeface the user's OS
optimizes for their screen. A wallet's first paint must be instant (Chapter 2 §10, "smooth performance");
a 200 KB font download that reflows the net-worth number is the opposite of calm.

| Role | Stack (as shipped) | Source | Notes |
| --- | --- | --- | --- |
| **Sans (UI)** | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` | `styles.css` L71 (`body`) | Resolves to **SF Pro Text/Display** on Apple, **Segoe UI** on Windows, **Roboto** on Android/ChromeOS. |
| **Mono** | `ui-monospace, SFMono-Regular, Menlo, monospace` | `styles.css` (`.id-addr`, `.addr`, seed classes) | **SF Mono** on Apple, platform monospace elsewhere. Addresses, tx hashes, seed words. |
| **Sans (mobile)** | RN system default (unset `fontFamily`) → **SF Pro** (iOS) / **Roboto** (Android) | `apps/mobile/theme.ts` `type` | Mobile never names a family for body/UI — it inherits the OS default, which is correct. |
| **Mono (mobile)** | `Platform.OS === 'ios' ? 'Menlo' : 'monospace'` | `theme.ts` L114 (`mono`) | iOS falls back to Menlo (SF Mono is not directly nameable in RN); Android uses `monospace`. |

**SF Pro's optical split is free and we rely on it.** Apple ships SF Pro as two optical masters — **SF Pro
Text** (< 20 px, wider spacing, taller x-height for legibility at UI sizes) and **SF Pro Display** (≥ 20 px,
tighter spacing, refined for headlines). `-apple-system` selects the correct master **per size
automatically**, which is exactly why our large tokens (`display`, `title1`, `pf-net-value`) can carry
negative tracking without looking cramped and our small tokens (`caption`, `footnote`) stay open and
readable. This is a reason to *keep* the system stack, not replace it.

**Honest drift — Inter is named in the doc but not shipped on web.** `DESIGN_SYSTEM.md` §3 lists the stack
as `… Roboto, Inter, Helvetica, …`. The shipped `styles.css` L71 stack has **no `Inter`** entry. Because we
bundle no font file, an `Inter` keyword only resolves if the user happens to have Inter installed locally —
so its absence changes almost nothing in practice, but the doc and the code disagree. **Canon:** Inter is
the *intended* non-Apple fallback; either add `Inter` to the CSS stack (proposed) *or* remove it from the
doc. Do not leave the two disagreeing. Mono is `SF Mono / Menlo` on both surfaces; `Roboto Mono` named in
the doc is **not** in either stack — same reconciliation applies.

**Weights available without a font download.** SF Pro exposes the full weight axis natively, so our four
shipped weights (400 / 500 / 600 / 700) render true, not synthetically bolded. On the rare platform whose
system font lacks a weight, the browser synthesizes it — acceptable, never our target. We use **weight, not
italic, for emphasis** (§3.4); italic is reserved for nothing in this product.

---

### 3.2 · The canonical type scale

The single source of truth is `tokens.typography` — ten roles, each `{ size, line, weight }` in px/unitless.
Components reference a **role**, never a raw size (governance §13). Tracking (letter-spacing) is **not yet in
the token object** — it is specified in prose here and applied ad-hoc in CSS; tokenizing it is a named gap
(§3.6, *proposed*).

| Token | Size / Line | Weight | Tracking *(proposed to tokenize)* | Optical master | Use |
| --- | --- | --- | --- | --- | --- |
| `display` | **40 / 46** | 700 | −0.02em | SF Pro Display | Portfolio total — the one hero number |
| `title1` | **28 / 34** | 700 | −0.02em | SF Pro Display | Screen titles ("Send", "Portfolio") |
| `title2` | **22 / 28** | 600 | −0.01em | SF Pro Display | Section & bottom-sheet titles |
| `headline` | **17 / 22** | 600 | 0 | SF Pro Text | Row titles, **button labels**, asset name |
| `body` | **17 / 24** | 400 | 0 | SF Pro Text | Default running copy |
| `callout` | **16 / 21** | 400 | 0 | SF Pro Text | Secondary copy inside cards |
| `subhead` | **15 / 20** | 400 (600 for emphasis) | 0 | SF Pro Text | List metadata, holdings sub-line |
| `footnote` | **13 / 18** | 400 | 0 | SF Pro Text | Timestamps, legal, captions |
| `caption` | **11 / 13** | 500 | +0.02em | SF Pro Text | Badge text, tab labels, uppercase eyebrows |
| `mono` | **15 / 20** | 450 | 0 | SF Mono | Addresses, tx hashes, seed words |

TypeScript consumers read the object directly; the web *should* project it into custom properties (it does
not yet — see drift below):

```ts
import { typography } from '@intent-wallet/ui/tokens';
// typography.display → { size: 40, line: 46, weight: 700 }
// mobile theme.ts `type` is a hand-authored subset of this object (§3.3)
```

**Ten roles, no more.** If a screen "needs" a size between two tokens, the screen is wrong, not the scale
(Law D-scale). The gap between `body` 17 and `callout` 16 is intentional — one is prose, one is supporting;
they are not interchangeable and you do not get a 16.5.

#### Shipped reality vs. canon — the typography drift ledger

The three surfaces are **not** byte-identical to the token scale. Per `DESIGN_SYSTEM.md` §13, the canon
above governs new work; existing surfaces move **toward** it, never away.

| Role / concern | Canon (`tokens/index.ts`) | Web (`styles.css`) | Mobile (`theme.ts`) | Verdict |
| --- | --- | --- | --- | --- |
| `body` size / line | 17 / 24 | **15 / 1.55** (≈15 / 23.25) on `body` L71 | **15 / 400** (`type.body`) | Known drift; web+mobile ship a *denser* 15px body. Canon = 17. |
| Hero total | `display` 40 / 46 | **`.pf-net-value` 34px** / weight 700 / −0.03em | **`netWorth` 46px** / 800 / −1.5 (ScreenHome) | Both diverge: web is *smaller* (34), mobile is *larger* (46) than 40. |
| Display weight | 700 | 700 (hero) | **800** (`type.display`, `netWorth`) | Mobile is one step heavier than canon. |
| Tracking | *(absent from token)* | Ad-hoc per selector (−0.01 to −0.03em) | In `type` (`display -1`, `title -0.3`, `label 0.6`) | Not tokenized on canon; **proposed** to add. |
| Type as classes | roles | **Hardcoded `font-size` per selector** — no `.t-*` utility layer | `type` object spread into StyleSheet | Web under-tokenizes type (see below). |
| Mobile-only role | — | — | **`label` 11 / 700 / +0.6** (uppercase eyebrows) | Mobile `label` ≈ canon `caption` but 700 not 500; reconcile toward `caption`. |

**The load-bearing honesty point: web typography is *not* tokenized.** Governance §13 says "no component
hardcodes a raw value" — that rule is honored for **color** (`var(--color-…)`), **space**, and **radius**,
but **not for type**. `styles.css` declares `font-size: 12px`, `13px`, `12.5px`, `14px`, `19px`, `30px`,
`34px` directly on ~60 selectors; there is no `--fs-body` / `.t-headline` layer projecting
`tokens.typography` into the web. So the ten-role scale above is **fully realized only on mobile** (via the
`type` object) and is an **aspirational canon on web**. This is the single biggest type gap in the product.

> **Proposed (fills the gap):** emit type tokens from `toCssVars()`-style helper as
> `--fs-{role}` / `--lh-{role}` / `--fw-{role}` custom properties, add a `.t-{role}` utility class layer,
> and migrate `styles.css` selectors onto them. Until then, treat any raw `font-size` in `styles.css` as
> **tech debt pinned to the nearest token**, and add new web type only via the (proposed) utility classes.

---

### 3.3 · Mobile scale — the shipped `type` object

Mobile is the surface where the scale is real code. `apps/mobile/theme.ts` ships a **six-role** subset —
the roles a phone screen actually uses — plus a mobile-only `label`:

| `type` key | fontSize | fontWeight | letterSpacing | Maps to canon | Use |
| --- | --- | --- | --- | --- | --- |
| `display` | 40 | '800' | −1 | `display` (weight drift: 800 vs 700) | Hero numbers (but Home overrides — below) |
| `title` | 22 | '700' | −0.3 | `title2` (weight drift: 700 vs 600) | Sheet & section titles |
| `headline` | 17 | '600' | — | `headline` ✓ | Row titles, button labels |
| `body` | 15 | '400' | — | `body` (size drift: 15 vs 17) | Running copy |
| `caption` | 12.5 | '500' | — | between `footnote`/`caption` | Metadata, sub-lines |
| `label` | 11 | '700' | +0.6 | `caption` (weight drift: 700 vs 500) | Uppercase eyebrows ("NET WORTH") |

**Bespoke hero exceeds the display token — on purpose, and it must stay tabular.** `ScreenHome.tsx` L450
sets the net-worth number to a **custom 46 / 800 / −1.5**, *larger* than `type.display` (40). This is the
one sanctioned override: the Home total is the product's single hero moment (Design Principle #2, "the
number is the hero") and earns a size above the scale. Because it is a money number it carries
`fontVariant: ['tabular-nums']` (§3.4) and `adjustsFontSizeToFit` + `numberOfLines={1}` — it **shrinks to
fit, it never clips** (§3.5). No other number is allowed to exceed `display`.

Mobile line-heights are **unset in `type`** — React Native derives a sensible default from the platform
font. When a specific rhythm is needed it is set at the call site. New mobile roles should carry the
canon's `line` value explicitly rather than relying on the platform default.

---

### 3.4 · The tabular-numeral mandate (Doctrine #4)

**The law:** *every numeral the user reads — balance, amount, delta, fee, countdown, percentage, address
digit-run — renders with lining, tabular figures so digits occupy identical advance width and never reflow
as a value ticks.* A balance that jitters horizontally while it updates reads as untrustworthy; a wallet
cannot afford that. This is the type-layer expression of Doctrine #4 (money is bigint, formatted only at
the edge): the moment a bigint becomes glyphs, those glyphs must be tabular.

**Target declaration (what "everywhere" means):**

```css
/* proposed global default — the mandate, made real */
body { font-variant-numeric: tabular-nums lining-nums; }
```

`lining-nums` forces uppercase-height figures (SF Pro defaults to lining already, but we state it so a
future font swap cannot silently introduce old-style/text figures); `tabular-nums` forces the monospaced
advance. Mono (`ui-monospace`) is inherently tabular, so addresses and hashes are covered by the family
choice itself.

#### State matrix — numeral rendering (what actually ships)

| Surface / context | Mandate | Shipped state | Token / selector |
| --- | --- | --- | --- |
| Web — global body | tabular everywhere | ❌ **not set on `body`** | `styles.css` L67–73 |
| Web — net-worth hero | tabular | ✅ shipped | `.pf-net-value` `font-variant-numeric: tabular-nums` (L1775) |
| Web — account avatar initials | tabular | ✅ shipped | `.acct-item-ava` (L2842) |
| Web — asset rows, fees, deltas, countdown | tabular | ❌ **relies on SF Pro's default**, not declared | `.pf-asset`, `.cost-v`, `.route-*` (no `font-variant-numeric`) |
| Mobile — Home net worth | tabular | ✅ shipped | `netWorth … fontVariant: ['tabular-nums']` (ScreenHome L450) |
| Mobile — holdings value | tabular | ✅ shipped | `holdVal` (ScreenHome L464) |
| Mobile — send balance / review amount | tabular | ✅ shipped | `balanceVal`, `reviewValueBig` (FlowSend L613/627) |
| Mobile — allocation legend % | tabular | ✅ shipped | `legendPct` (ScreenPortfolio L248) |
| Mobile — activity amount | tabular | ✅ shipped | `amount` (ScreenActivity L181) |
| Mobile — identity / settings address | tabular | ✅ shipped | `heroAddr`, `addrMono` (ScreenSettings L738/758) |

**Honest verdict.** Mobile **fulfills the mandate** thoroughly — `fontVariant: ['tabular-nums']` is applied
per money-bearing `Text` across Home, Send, Portfolio, Activity, and Settings. **Web does not** — only
**two** selectors (`.pf-net-value`, `.acct-item-ava`) declare `font-variant-numeric`; every other web
number renders tabular *only because SF Pro's default figures happen to be tabular-friendly*, which is luck,
not a guarantee, and breaks the instant a non-SF system font (Segoe, Roboto) applies its own proportional
default. **This is the mandate's largest hole and it is on web.**

> **Proposed fix (do this):** add the global `body { font-variant-numeric: tabular-nums lining-nums; }`
> rule above, and — for the few places English words share a line with numbers where tabular spacing looks
> odd (rare) — opt *out* locally with `font-variant-numeric: normal`. Global-on / local-off is safer than
> the current local-on / global-absent. Do **not** solve this by hardcoding per selector; that is how we
> got two selectors instead of a rule.

**Rounding is a sibling law, not a type law.** *Which* digits appear (down for "you receive", up for "you
pay" — `docs/design/08-standards.md` §1.4) is decided upstream in the deterministic core; type only renders
what it is handed. Type must never re-round, truncate to fit, or `toLocaleString()` a value it did not
receive already-formatted from bigint at the edge.

---

### 3.5 · Truncation & wrapping — a clipped balance is a lie

The governing rule (Design Principle #5, Accessibility §11): **money and amounts wrap or shrink; they never
truncate.** A `…`-clipped balance hides the very digit a user is about to commit funds against. Everything
else falls on a strict ladder by content type.

| Content type | Rule | Shipped mechanism |
| --- | --- | --- |
| **Amounts / balances** (money) | **Never clip.** Wrap to a second line; the hero may *shrink to fit* (still shows all digits) but must not ellipsize. | Web `.pf-net-value` has no `text-overflow` → wraps. Mobile `netWorth` uses `adjustsFontSizeToFit` + `numberOfLines={1}` → shrinks, never clips (ScreenHome L291). |
| **Addresses** (mono) | **Pre-shorten** to `6…4` at the data layer, then it fits without CSS clipping. Full value on tap/copy, never auto-copied (§8 AddressChip). | Web `.id-addr` `white-space: nowrap` on an already-`0x9858…da94`-shortened string (L337). Mobile `numberOfLines={1}` + `ellipsizeMode="middle"` (App L528, Portfolio L217). |
| **Full addresses / seed words** (when shown in full) | **Break to wrap** — never nowrap-scroll a full hash out of view. | Web `word-break: break-all` on full-address/seed classes (L421, 658, 700, 906, 2787). |
| **Metadata / titles** (non-money copy) | Ellipsis is acceptable — a truncated step subtitle or contact name loses no money. | Web `.step-sub` `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` (L1445–1447). |
| **Headings / hero titles** | Balance line lengths for even ragging; never center long sentences (§3.6). | Web auth title `text-wrap: balance` (L1947). |

**`ellipsizeMode="middle"` for addresses, `"tail"` for names.** A middle ellipsis preserves both the `0x`
prefix and the trailing checksum digits a user visually verifies; a tail ellipsis on an address would hide
the very characters that confirm identity. Names and labels tail-truncate; addresses middle-truncate; money
does neither.

**Shrink-to-fit is not truncation.** Mobile's `adjustsFontSizeToFit` on the Home hero reduces the font size
until the full number fits on one line — every digit stays visible, so it honors the no-clip law. Web has no
equivalent and instead lets the hero wrap; both are legal. What is illegal on either surface is a money
value with `text-overflow: ellipsis`.

---

### 3.6 · Hierarchy & composition rules

- **One hero per screen.** Exactly one `display` (or the sanctioned mobile 46px override) per view — the
  portfolio total on Home. No other number reaches that size. Competing heroes destroy the "3-second
  clarity" contract (Chapter 2 §10, Law 5).
- **Weight, not italic, carries emphasis.** 400 body → 600 to emphasize inline; 500 for labels/captions;
  700 only for titles/display. There is no italic in the product.
- **One uppercase eyebrow per card region.** `caption`/`label` uppercase text ("NET WORTH", "YOU RECEIVE")
  is seasoning — **one** per region, with its positive tracking (+0.02 to +0.06em) to stay legible at caps.
  A paragraph of uppercase is banned (it reads as shouting and tanks legibility).
- **Tracking scales inversely with size.** Large type tightens (`display`/`title` ≈ −0.02em, web hero as
  tight as −0.03em); small caps-y labels open up (+0.02 to +0.06em); body sits at 0. SF Pro's optical
  masters already do much of this; our tracking values *fine-tune*, they don't fight the font. *(Tracking is
  prose today; §3.2 proposes tokenizing it as `--tracking-{role}`.)*
- **Never center long copy.** Titles and standalone amounts may center; any sentence left-aligns (LTR) and
  mirrors under RTL. Centered running text is a legibility and scanning failure.
- **Mono for anything a machine reads back.** Addresses, tx hashes, and seed words are always `mono` with
  **EIP-55 casing preserved** — mixed-case is a checksum, not decoration; a mono face keeps the case legible
  and the columns aligned for visual verification.

---

### 3.7 · Accessibility (WCAG 2.2 AA — gated, not optional)

Type accessibility is an **acceptance criterion** (Doctrine #6), verified in light *and* dark.

- **Minimum readable size = `footnote` 13px.** Nothing carrying information the user must read drops below
  13px. `caption`/`label` at 11px is permitted **only** for non-essential eyebrows, badge text, and tab
  labels — never for a value, warning, or instruction. A user must never need to read an 11px string to
  operate on money.
- **Dynamic Type / browser zoom → scale to XXL; amounts wrap, never truncate (§3.5).** On mobile, RN `Text`
  honors OS text-size (`allowFontScaling` defaults true) — decorative/animated strings that should *not*
  scale are explicitly opted out (e.g. `ScreenHome` command sub-line marks
  `importantForAccessibility="no"`), but every value and label scales. Layouts must **reflow**, never
  fixed-height-clip, as type grows. On web, all sizes are px today; honoring `rem`/user-zoom cleanly is part
  of the (proposed) type-token migration (§3.2).
- **Contrast is a §4 pairing, enforced here.** Body-size essential copy meets **≥ 4.5:1**; large text
  (≥ `title2`/22px or ≥ 18px bold) and icons meet **≥ 3:1**. The known trap: `text.tertiary` (`#8B8B96` on
  white ≈ 3.1:1) is **AA-large only** and must never carry body-size essential copy — the web ships
  `--text-3: #6E6E79` (≈ 4.9:1) precisely so muted body copy stays AA-body. See **§4 · Color** for every
  verified pair; the type layer's duty is simply to never place essential body copy in a large-only tone.
- **Screen readers read numerals as coherent sentences, not digit soup.** An amount is announced as
  "Ethereum, 0.61 ETH, 2,079 dollars, up 2.1 percent today" via an `.sr-only` (`styles.css` L2249–2254,
  the clip-rect visually-hidden pattern) / RN `accessibilityLabel`, **not** as the raw glyph run. Tabular
  rendering is a visual concern; the spoken form is authored separately and is the source of truth for AT.
- **`prefers-reduced-motion`** governs the type that *animates* (ticking totals, shimmer on skeleton text):
  under reduce, numbers snap to final value rather than rolling. Wired in §6 · Motion; noted here because a
  rolling-odometer total is a type animation.

---

### 3.8 · Do / Don't (type-specific)

**DO**
- Reference a **role** (`typography.headline`, mobile `type.headline`) — on web, a `.t-*` class once the
  proposed layer lands; until then pin any raw `font-size` to the nearest token in a comment.
- Make **every** numeral tabular (§3.4) — and fix the web hole with a global rule, not more per-selector
  patches.
- Let money **wrap or shrink**; ellipsis is for metadata only, never a value.
- Pre-shorten addresses to `6…4`, keep them `mono`, preserve EIP-55 casing.
- Use **weight** for emphasis; keep one hero and one eyebrow per region.

**DON'T**
- **Don't add a size between two tokens** — the gap is the design (Law D-scale).
- **Don't `text-overflow: ellipsis` a balance, amount, or fee** — a clipped number is a lie.
- **Don't rely on the font's default figures** for tabular alignment on web — declare it.
- **Don't use `text.tertiary` for body-size essential copy** (AA-large only).
- **Don't italicize** for emphasis, **don't center** a sentence, **don't** put a paragraph in uppercase.
- **Don't hardcode** a new raw `font-size` on web outside the (proposed) token layer — that is the very
  drift §3.2 is closing; do not widen it.

---

*Next: **§4 · Color** — the palette these letterforms sit on, and every contrast pair verified AA.*


## §4 · The Color System

> **Source of truth:** [`packages/ui/src/tokens/index.ts`](../../packages/ui/src/tokens/index.ts) → the
> `colors` object (light + dark) and `riskPresentation`, flattened to `--color-*` CSS custom properties by
> `toCssVars()`. Web ships a hand-tuned alias layer in [`apps/web/src/styles.css`](../../apps/web/src/styles.css)
> (`--accent / --text / --low / --medium / --high / --block …`); mobile ships `Palette` in
> [`apps/mobile/theme.ts`](../../apps/mobile/theme.ts). Where the three drift, this section names the canonical
> value and cites the [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) §13 drift ledger. Every ratio quoted below is
> computed WCAG 2.2 relative-luminance contrast on the real hex.

This is the concrete color layer that Chapter 2's Design Laws produce. It upholds **D3 calm-not-clever** (color
means something; if everything is colored, nothing is), **D-color one-accent** (a single indigo carries brand,
action, and focus — violet is a gradient *partner*, never a second button), and the Doctrine's non-negotiable:
**Apple-grade craft + WCAG AA are acceptance criteria, not polish** (CLAUDE.md #6). Color also carries the honesty
doctrine — a semantic hue is *reserved for meaning*, so red can never appear except where the system means danger.

Foundational token mechanics (naming, `toCssVars()`, the role-not-hex rule) live in **§1 · Tokens/Foundations**;
elevation *shadows* live in **§5 · Icons/Depth**; the full focus-ring geometry lives in **§7 · Controls**. This
section owns the **hues, the surface/text/semantic/risk color roles, and their AA pairings**.

---

### §4.1 · Principles — the four rules color obeys

1. **Roles, never raw hex.** A component reads `var(--color-accent-base)` / `var(--accent)` (web) or `useTheme().accent`
   (mobile). No component hardcodes a hex. A hex in a component is a defect (§1, DESIGN_SYSTEM §13).
2. **One accent, one hero.** Indigo is the *only* interactive color. Violet appears in exactly one place: the net-worth
   hero wash (§4.3). Semantic hues (emerald/amber/orange/rose/blue) appear *only* on meaning.
3. **Light and dark are two designed palettes, not an inversion.** Dark is not "light with the lightness flipped" — it
   has its own accent (an electric-violet-leaning indigo), its own semantic ramp, and depth by **surface step**, not
   shadow (§4.4).
4. **Every text/background pair is AA-verified.** Body text ≥ **4.5:1**; large text (≥ 24px, or ≥ 18.66px bold) and
   icons/focus rings ≥ **3:1**. Color is *never* the sole channel (risk = icon + label + color, §4.6).

---

### §4.2 · Neutrals — surfaces & text (the near-monochrome base)

The product is mostly quiet neutrals so that color can *mean* something. Surfaces climb in three color steps
(`canvas → surface → surface2`); text descends in three tiers (`primary → secondary → tertiary`).

#### Canonical tokens — LIGHT

| Role (`tokens`)  | CSS var          | Hex        | Web alias / value       | Use                                        |
| ---------------- | ---------------- | ---------- | ----------------------- | ------------------------------------------ |
| `bg.canvas`      | `--color-bg-canvas`  | `#F7F7F8`  | `--canvas: #FAFAFB` ⚠   | app background (the field behind cards)    |
| `bg.surface`     | `--color-bg-surface` | `#FFFFFF`  | `--surface: #FFFFFF` ✓  | cards, cells, sheets                       |
| `bg.surface2`    | `--color-bg-surface2`| `#F0F0F2`  | `--surface2: #F3F3F6`   | nested fills, input tracks, chips          |
| `border.subtle`  | `--color-border-subtle` | `#E4E4E8` | `--border: #ECECEF`   | hairlines, dividers                        |
| `border.strong`  | `--color-border-strong` | `#C9C9D0` | `--border-strong: #DBDBE1` | input borders, resting edges           |
| `text.primary`   | `--color-text-primary`  | `#17171B` | `--text: #191920`     | headings, amounts, primary copy            |
| `text.secondary` | `--color-text-secondary`| `#5A5A64` | `--text-2: #5A5A65`   | supporting copy, metadata                  |
| `text.tertiary`  | `--color-text-tertiary` | `#8B8B96` | `--text-3: #6E6E79` ⚠ | captions, placeholders — **see caveat**    |
| `text.inverse`   | `--color-text-inverse`  | `#FFFFFF` | `--on-accent: #FFFFFF`| text/icon on accent & danger fills         |

#### Canonical tokens — DARK

| Role (`tokens`)  | Hex        | Web alias / value      | Use                                     |
| ---------------- | ---------- | ---------------------- | --------------------------------------- |
| `bg.canvas`      | `#0E0E10`  | `--canvas: #0B0B0E`    | app background                          |
| `bg.surface`     | `#1A1A1E`  | `--surface: #141418`   | cards, cells, sheets                    |
| `bg.surface2`    | `#242429`  | `--surface2: #1C1C22`  | nested fills, tracks                    |
| `border.subtle`  | `#2E2E34`  | `--border: #26262D`    | hairlines                               |
| `border.strong`  | `#3F3F47`  | `--border-strong: #34343D` | input borders                       |
| `text.primary`   | `#F4F4F6`  | `--text: #F2F2F5`      | headings, amounts                       |
| `text.secondary` | `#A3A3AE`  | `--text-2: #ADADB8`    | supporting copy                         |
| `text.tertiary`  | `#6E6E78`  | `--text-3: #8B8B97`    | captions, placeholders                  |
| `text.inverse`   | `#17171B`  | —                      | text/icon on light-on-dark fills        |

#### Text-tier contrast — the AA table you build against

| Tier            | Light pair (on `bg.surface`)  | Ratio    | Dark pair (on `bg.surface`) | Ratio    | AA verdict                    |
| --------------- | ----------------------------- | -------- | --------------------------- | -------- | ----------------------------- |
| `text.primary`  | `#17171B` on `#FFFFFF`        | **17.5:1** | `#F4F4F6` on `#1A1A1E`     | **16.4:1** | ✅ body + large               |
| `text.secondary`| `#5A5A64` on `#FFFFFF`        | **6.8:1**  | `#A3A3AE` on `#1A1A1E`     | **7.0:1**  | ✅ body + large               |
| `text.tertiary` (canon) | `#8B8B96` on `#FFFFFF`| **3.4:1**  | `#6E6E78` on `#1A1A1E`     | **3.4:1**  | ⚠ **large/icon only** — not body |
| `text.tertiary` (web `--text-3`) | `#6E6E79` on `#FFFFFF` | **5.0:1** | `#8B8B97` on `#141418` | **5.5:1** | ✅ body — the AA-safe variant |

> **⚠ The `text.tertiary` caveat (the single most important AA footnote in the system).** The *canonical*
> `text.tertiary` (`#8B8B96` light / `#6E6E78` dark) resolves to ≈ **3.4:1** on its surface — this clears AA for
> **large text and icons only**. It is legitimate for placeholders, decorative captions, and disabled hints; it must
> **never** carry body-size information a user needs to read (an address, a fee, a status). The web already promotes a
> body-AA-safe variant — `--text-3: #6E6E79` (**5.0:1**) — for exactly this reason. **Canon action (proposed):** promote
> the web's readable value into `tokens/index.ts`, either by retuning `text.tertiary` to the 5:1 variant or by adding a
> distinct `text.quaternary` role for the ≤ 3.4:1 decorative tone. Until reconciled, treat `--text-3` as "tertiary, but
> readable" (DESIGN_SYSTEM §13).

**Drift callouts (⚠ above, per DESIGN_SYSTEM §13):** `bg.canvas` light is canon `#F7F7F8`, web `#FAFAFB`, mobile
`#FFFFFF` — three values; converge toward canon. The web's surface/border neutrals sit within ~2 points of canon
(cosmetic). When you touch these surfaces, move **toward** canon; never widen the delta.

---

### §4.3 · The brand ramp — indigo primary + the electric-violet secondary

Indigo is the whole interactive identity: primary buttons, active nav, links, and the focus ring all draw from one
`accent` family. The "secondary" electric-violet is **not a second token** — it is (a) the natural hue-shift of the
*dark* accent, and (b) the one literal violet in the system, living only in the net-worth hero gradient.

#### Accent tokens

| Role (`tokens`)   | CSS var             | Light     | Dark      | Web light / dark          | Use                                    |
| ----------------- | ------------------- | --------- | --------- | ------------------------- | -------------------------------------- |
| `accent.base`     | `--color-accent-base`   | `#4F46E5` | `#6D66F6` | `#4F46E5` ✓ / `#7C74FF` ⚠ | primary fill, active nav, links, focus |
| `accent.pressed`  | `--color-accent-pressed`| `#4038C7` | `#5B54E0` | `#4338CA` / `#6A62F0`     | pressed / active fills                 |
| `accent.subtle`   | `--color-accent-subtle` | `#EEEDFD` | `#26244B` | `#EEF0FE` / `#201F42`     | selected rows, chips, ghost fills, focus halo |
| `accent.onAccent` | `--color-accent-onAccent`| `#FFFFFF`| `#FFFFFF` | `#FFFFFF` / `#FFFFFF`     | label/icon on the accent fill          |

The dark `accent.base` (`#6D66F6`) leans **electric violet** by design — *that hue shift is the secondary color*, not a
separate token. Mobile's light accent is `#5B54E6` (drift; canon `#4F46E5`); mobile's dark accent is `#6D66F6` ✓ (byte-
exact to canon).

#### Accent-fill state matrix (Button `.btn.primary`, active nav)

Full control geometry (height, press transform, focus geometry, loading) is in **§7 · Controls**; here are only the
*color* transitions.

| State           | Fill (L / D)                    | Label (L / D)          | Ring / halo                                  | Contrast (label on fill)                 |
| --------------- | ------------------------------- | ---------------------- | -------------------------------------------- | ---------------------------------------- |
| **default**     | `accent.base` `#4F46E5` / `#6D66F6` | `onAccent` `#FFFFFF` | —                                          | L **6.3:1** ✅ · D **4.3:1** (see note)   |
| **hover**       | `accent.pressed` `#4038C7` / `#5B54E0` | `#FFFFFF`         | —                                          | L **7.9:1** ✅ · D ≈ **5.3:1** ✅          |
| **focus-visible** | `accent.base`                 | `#FFFFFF`              | 2px `accent.base` + `color-mix(accent 20%, transparent)` halo (canon); web ships `0 0 0 3px color-mix(accent 18–20%, transparent)` | ring ≥ 3:1 vs canvas ✅ |
| **pressed**     | `accent.pressed`               | `#FFFFFF`              | —                                            | as hover                                 |
| **loading**     | `accent.base` (label persists, e.g. "Approving…") | `#FFFFFF` | —                                     | as default                               |
| **disabled**    | `accent.base` @ ~0.5 opacity   | `#FFFFFF` @ inherit    | none                                         | decorative — non-essential (WCAG exempt) |

> **Dark-accent AA note (tightest fill pair in the system).** White on the *canon* dark accent `#6D66F6` = **4.3:1**;
> on the web's brighter `#7C74FF` = **3.6:1**. Button labels are set in `headline` **17px / 600** — which does *not*
> qualify as WCAG "large text" (that needs ≥ 18.66px **bold**), so the strict body bar of 4.5:1 applies. This is the one
> pair that sits *under* it. **Resolution:** converge the web value to canon `#6D66F6` (raises 3.6 → 4.3) and treat the
> remaining gap as the reason we never use accent-on-white-label for anything smaller or lighter than a 17/600 button;
> the **hover** state (`accent.pressed`) is comfortably AA. This is a tracked watch-item, not a shipped violation — flag
> it in any PR that touches the dark accent (DESIGN_SYSTEM §13).

#### The violet hero wash (the one and only violet)

The net-worth hero (`.pf-net`, `.hero`) is the single deliberately-branded object. Its wash is **shipped** in
`styles.css`:

```css
/* the ONE place violet appears — nowhere else, ever */
background: linear-gradient(135deg,
  var(--accent) 0%,
  color-mix(in srgb, var(--accent) 72%, #a855f7) 100%);   /* indigo → electric violet */
box-shadow: 0 12px 32px color-mix(in srgb, var(--accent) 32%, transparent); /* the one colored shadow */
color: #fff;   /* onAccent — the hero total is always white on wash */
```

Rules: violet (`#A855F7`) appears **only** inside this `color-mix`; never on a button, text, icon, border, or badge.
White (`#FFFFFF`) is the only foreground on the wash. The colored shadow is the only non-neutral shadow in the system
(§5 owns all other elevation). Reduced-motion and the parked/degraded hero states are covered in §5/§8.

---

### §4.4 · Surface & elevation-by-color

Depth is communicated **twice**: by a color step *and* (in light) by a shadow. In **dark**, shadow is near-invisible on
near-black, so the color step *is* the depth cue — a "raised" element climbs `bg.canvas → bg.surface → bg.surface2`.
Shadow tokens (`--shadow`, `--shadow-lg`, the `e1/e2/e3` scale) belong to **§5 · Icons/Depth**; this table is the
*color* ladder only.

| Elevation intent | Light color        | Dark color         | Depth cue (light)        | Depth cue (dark)              |
| ---------------- | ------------------ | ------------------ | ------------------------ | ----------------------------- |
| **Canvas** (L0)  | `bg.canvas` `#F7F7F8` | `bg.canvas` `#0E0E10` | — (the floor)          | — (the floor)                 |
| **Panel** (L1)   | `bg.surface` `#FFFFFF` | `bg.surface` `#1A1A1E` | hairline + `e1` shadow | **surface step** (no shadow)  |
| **Raised** (L2)  | `bg.surface2` `#F0F0F2` | `bg.surface2` `#242429` | inset fill / `e2`   | **second surface step**       |
| **Overlay** (sheets, menus) | `bg.surface` `#FFFFFF` + `e3` | `bg.surface` `#1A1A1E` + strong border | `e3` shadow | border `border.strong` + step |

Every raised surface pairs its color step with **one hairline border** (`border.subtle`) — the discipline *is* the
aesthetic (Linear/Rabby lineage): no glass, no neon, no gradient-on-everything. A screen that looks flat-cheap is fixed
with contrast and spacing, not more shadow (D-depth-is-restraint).

---

### §4.5 · Semantic colors — meaning only (and the `.base` vs on-tint distinction)

Four semantic families carry meaning: **emerald** success · **amber** warning · **rose** danger · **blue** info. Each is
used *only* on state — never decoratively. There are **two roles per hue** and confusing them is the most common AA bug
in the codebase, so read this carefully:

- **`*.base` = the signal color** — the hue at full saturation, tuned for **icons, dots, sparklines, and fills**
  (needs ≥ **3:1**). On a white/near-black canvas these are vivid but *not always body-AA*.
- **on-tint text = the darkened variant** — used for **text sitting on the matching subtle tint** (needs ≥ **4.5:1**).
  The web ships these as `--low / --medium / --high / --block` (light), deliberately *darker* than canon `*.base`.

#### Semantic `*.base` (signal) tokens

| Role (`tokens`) | Light `.base` | Dark `.base` | `.base` on canvas — L / D            | Meaning                        |
| --------------- | ------------- | ------------ | ------------------------------------ | ------------------------------ |
| `success.base`  | `#0F9D58`     | `#34C77B`    | **3.5:1** (large/icon) / **8.8:1** ✅ | confirmations, received funds  |
| `warning.base`  | `#B45309`     | `#F59E0B`    | **5.0:1** ✅ / large-icon             | caution, stale data            |
| `danger.base`   | `#DC2626`     | `#F87171`    | **4.8:1** ✅ / **7.0:1** ✅            | destructive, failures          |
| `info.base`     | `#0369A1`     | `#38BDF8`    | **5.9:1** ✅ / **9.0:1** ✅            | neutral notices                |

> **`success.base` light (`#0F9D58`) is a 3.5:1 signal color — icon/large only.** For *green text* (a "+$12.40 received"
> label, a "Low risk" word) you must use the darkened on-tint value, not `.base`. This is exactly why the web darkens it.

#### On-tint pairs — text on subtle background (all AA-body verified)

These `*-bg` tints and darkened foregrounds are **shipped in `styles.css`** but are **not yet in `tokens/index.ts`**
(**proposed** to promote them — see gap below). They power `.risk-*`, `.authz-*`, `.exec-*`, banners, and badges.

| Family      | Light fg / bg (`--x` / `--x-bg`) | Ratio    | Dark fg / bg           | Ratio    |
| ----------- | -------------------------------- | -------- | ---------------------- | -------- |
| **success** | `#0F7A45` on `#E6F6EE`           | **4.8:1** ✅ | `#34C77B` on `#0E2B1D` | **7.0:1** ✅ |
| **warning** | `#9A5309` on `#FEF3E2`           | **5.3:1** ✅ | `#F59E0B` on `#33230A` | **7.1:1** ✅ |
| **high**    | `#C2410C` on `#FFF1E8`           | **4.7:1** ✅ | `#FB923C` on `#351A0B` | **7.1:1** ✅ |
| **danger**  | `#B91C1C` on `#FDEBEB`           | **5.6:1** ✅ | `#F87171` on `#351111` | **6.1:1** ✅ |

Note the light foregrounds (`#0F7A45 / #9A5309 / #C2410C / #B91C1C`) are the *darkened text* variants — 1–3 shades below
`*.base` so they clear 4.5:1 on their own tint. Dark foregrounds equal `*.base` (a light hue on a very dark tint already
clears AA). Every `*.subtle` background is a ~5–8% mix of the hue into the surface.

> **Balance deltas are NOT semantic red.** A *loss* in a balance uses `text.primary` with a "−" sign, **not** danger red
> (DESIGN_SYSTEM §6.7). Rose is reserved for danger/risk. A gain uses `success` + "+". Sign + color together — never
> color alone.

**Proposed gaps to close (honesty — these are not shipped in the token file):**
- `info` is **shipped in `tokens/index.ts`** (`info.base`) but has **no web `--info` variable and no mobile palette
  entry** — wire `--info: #0369A1 / #38BDF8` and add `info` to `Palette` (proposed).
- The eight `*-bg` subtle tints + four darkened on-tint foregrounds are web-only; **promote them into `tokens/index.ts`**
  as `success.subtle / warning.subtle / danger.subtle / info.subtle` and `*.onTint` (or `*.text`) roles so mobile and web
  derive one set (proposed). Today mobile has no tint token and no `high` role at all (§4.6).

---

### §4.6 · The risk color scale — Risk Engine level → UI

Risk is the highest-stakes use of color in the product, so it is the most disciplined: **never color-only**. The mapping
`level → { color, label }` is encoded **once** in `tokens.riskPresentation` (and mirrored in mobile `RISK`,
`theme.ts`) and consumed by the web `.risk-low / .risk-medium / .risk-high / .risk-block` classes. Never re-map it
locally.

```ts
// packages/ui/src/tokens/index.ts — the single mapping (SHIPPED)
export const riskPresentation = {
  low:    { color: 'risk.low',    label: 'Low risk' },
  medium: { color: 'risk.medium', label: 'Caution'  },
  high:   { color: 'risk.high',   label: 'High risk' },
  block:  { color: 'risk.block',  label: 'Blocked'  },
} as const;
```

| Level      | `risk.*` L / D (`tokens`) | Web class fg / bg (L)        | Required icon      | Label       | On-tint AA (L / D)      |
| ---------- | ------------------------- | ---------------------------- | ------------------ | ----------- | ----------------------- |
| **LOW**    | `#0F9D58` / `#34C77B`      | `.risk-low` `#0F7A45` on `#E6F6EE` | shield-check   | "Low risk"  | **4.8:1** / **7.0:1** ✅ |
| **MEDIUM** | `#B45309` / `#F59E0B`      | `.risk-medium` `#9A5309` on `#FEF3E2` | shield-alert | "Caution"   | **5.3:1** / **7.1:1** ✅ |
| **HIGH**   | `#EA580C` / `#FB923C`      | `.risk-high` `#C2410C` on `#FFF1E8` | alert-triangle | "High risk" | **4.7:1** / **7.1:1** ✅ |
| **BLOCK**  | `#DC2626` / `#F87171`      | `.risk-block` `#B91C1C` on `#FDEBEB` | octagon-x     | "Blocked"   | **5.6:1** / **6.1:1** ✅ |

**Three hard rules:**
1. **Icon + label + color, always** — every risk surface renders the glyph *and* the text *and* the hue. Color is a
   redundant channel, never the only one (colorblind-safe; the four hues are luminance-distinct too). See §5 for the
   glyph grid, §8 for the RiskBadge/RiskSheet surfaces.
2. **BLOCK is a full-width banner, not a badge** — and carries **no primary CTA**, only "Why blocked" + "Report
   mistake" (the deterministic gate refused; DESIGN_SYSTEM §6.6, doctrine #2/#5).
3. **Risk red ≠ balance red.** `risk.block` rose is the *only* red in the product's meaning-space; it never leaks onto a
   balance loss (§4.5).

Risk-tinted component surfaces reuse this scale by class: `.authz-allow` (low tint), `.authz-deny` (block tint),
`.exec-completed` (low), `.exec-parked` (medium), `.exec-failed` (block) — all cite `--low/--medium/--block` + a
`color-mix(… 40%, transparent)` border. Their full state matrices live in **§8 · Surfaces/Feedback**.

> **Drift (DESIGN_SYSTEM §13):** mobile `RISK` has no `risk.high` palette token — it hardcodes `#FB923C` inline. Dark
> `risk.*` values are byte-exact to canon across web + mobile; light risk foregrounds diverge only via the intentional
> on-tint darkening (§4.5). **Canon action (proposed):** add a `high` field to mobile `Palette` so nothing is hardcoded.

#### Asset brand colors — quarantined from meaning

Chain/token brand colors (BTC `#F7931A`, ETH, SOL, …) are used **only** inside asset icons and sparklines — never for
text, backgrounds, borders, or state. This quarantine is a *color-system rule*: a chain's brand can never collide with
a semantic hue, so orange-the-Bitcoin can never be misread as amber-the-caution.

---

### §4.7 · The hard AA rules (the gate, not the guideline)

Contrast is a **merge-blocking acceptance gate** (CLAUDE.md Design Review Gate #5), verified on real hex, in **both**
themes:

| Rule                                                        | Threshold | Enforced on                                            |
| ----------------------------------------------------------- | --------- | ------------------------------------------------------ |
| Body text / essential copy                                  | **≥ 4.5:1** | every `text.*` pair except decorative-tertiary (§4.2) |
| Large text (≥ 24px, or ≥ 18.66px bold), icons, focus rings  | **≥ 3:1** | headings, glyphs, the `accent` focus ring/halo         |
| Non-text UI boundaries where meaning depends on them        | **≥ 3:1** | risk borders, input `border.strong`, selected states   |
| Color is never the only channel                             | n/a       | risk/status/deltas = icon **+** label **+** sign **+** color |

**Verified tight spots to remember when you build:**
- `text.tertiary` canon = **3.4:1** → large/icon only; use `--text-3` (5.0:1) for body (§4.2).
- White on dark `accent.base` = **4.3:1** (canon) / 3.6:1 (web) → 17/600 button labels only; converge web to canon (§4.3).
- `success.base` light = **3.5:1** → signal/icon only; use the on-tint `#0F7A45` for green text (§4.5).

Everything else in the token set clears its bar with headroom (primary text ≥ 16.4:1, secondary ≥ 6.8:1, all on-tint
semantic pairs 4.7–7.1:1). When adding *any* new color pairing, compute the ratio before you ship it — an unverified
pair is a red gate, not a "later."

---

### §4.8 · DO / DON'T (color)

**DO** — reference roles (`--color-*` / `useTheme()`), never hex · use `.base` for icons/dots, the darkened on-tint for
text-on-tint · keep violet inside the one hero wash · pair every risk color with icon + label · verify ≥ 4.5:1 (body) /
≥ 3:1 (large) on both themes before shipping · move a drifted value **toward** canon.

**DON'T** — add a color without deleting/justifying one (palette stays small by policy) · use a semantic hue
decoratively or `success.base` for green *text* · put violet on a button/text/icon/border · color balance losses red ·
convey risk/status by color alone · hardcode a hex or widen the drift ledger (§13).


## §5 · Iconography & Depth

> *Two systems that must never shout.* Icons are the product's smallest words — a wallet that moves
> real money cannot afford a glyph that is ambiguous, off-grid, or the *only* thing carrying a meaning.
> Depth is the product's quietest grammar — it says "this is a distinct object you can act on," and
> nothing more. Both obey the same law the rest of Chapter 3 obeys: **calm, not clever**
> (DESIGN_SYSTEM §1.1), and Chapter 2's charter — *Apple → Minimal → Fast → Trustworthy → Invisible →
> Helpful* (Ch.2 §5), motion and material that only ever *Explain · Guide · Confirm · Reduce anxiety*
> (Ch.2 §7), 3-second clarity and dark-mode parity (Ch.2 §10). This section specifies the icon grid,
> the elevation ramp, and the exact tokens each state uses, in light **and** dark, grounded in
> `packages/ui/src/tokens/index.ts`, `apps/web/src/styles.css`, and `apps/mobile/theme.ts`. Where the
> three surfaces drift, the value is named and the canon is declared (per the DESIGN_SYSTEM drift
> ledger §13). Sibling sections own their neighbours: color roles are §4, spacing is §2, controls are
> §7, surfaces & feedback are §8, motion is §6 — this section references them, never re-specifies them.

---

### 5.1 · The icon system — one grid, one stroke, one meaning

Icons are drawn as **inline SVG on a 24 × 24 artboard**, `fill="none"`, `stroke="currentColor"`, with
**rounded caps and joins**. Because the stroke is `currentColor`, an icon takes the color role of the
element it sits in — a nav item's icon is `--text-2` at rest and `--accent` when active, an icon
inside a `.btn.primary` is `--on-accent`, a risk glyph is its `risk.*` role. There is no icon palette;
there is the **text/role palette**, and icons borrow it. This is why the system can hold a large glyph
set on a two-color budget.

**Shipped (`apps/web/src/App.tsx`, the shared `Icon` primitive):**

```tsx
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
     strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {d.map((p, i) => <path key={i} d={p} />)}
</svg>
```

#### 5.1.1 · Stroke weight — the one drift to close

| Property        | Canon (DESIGN_SYSTEM §8) | Shipped web (`Icon`) | Verdict                                  |
| --------------- | ----------------------- | -------------------- | ---------------------------------------- |
| Grid            | `24 × 24`               | `viewBox 0 0 24 24` ✓ | aligned                                  |
| **Stroke width**| **`1.75`**              | **`2`**              | **drift — converge to `1.75`**           |
| Cap / join      | rounded                 | `round` / `round` ✓   | aligned                                  |
| Fill            | line (none)             | `fill="none"` ✓       | aligned                                  |

The canonical grid keeps a **1px keyline of padding** on every side — a **22 × 22 live area** inside the
24 grid — so no stroke ever kisses the bounding box and icons optically match at 16–48px. The shipped
web `Icon` currently strokes at **2px**; the canon is **1.75px** (DESIGN_SYSTEM §8). At the small end
(16px rendered) a 2px stroke reads a touch heavier than SF Symbols / Material Symbols set beside it —
converge new work to **1.75** and reconcile the `Icon` primitive in a governed pass. *Do not widen this
drift by adding a third stroke value.*

#### 5.1.2 · 2px-grid keyline alignment

Every path is authored so its **primary strokes land on even (2px) coordinates** of the 24-grid. With a
1.75px stroke centred on a 2px gridline, the ink straddles crisp device pixels at the canonical render
sizes (all multiples of 4 → integer scale factors from the 24 artboard). Concretely:

- **Keylines:** cardinal strokes on the `2 / 4 / 6 … 22` columns and rows; the optical centre is `12,12`.
- **Terminals:** open ends snap to the 2px grid so a rounded cap sits on a whole pixel.
- **Corner radii inside glyphs:** `2px` (matches the cap radius at stroke 1.75) — never a hairline
  fillet that vanishes at 16px.

This is what makes a hand-drawn crypto glyph sit in the same visual family as an OS symbol without
looking heavier or blurrier.

#### 5.1.3 · Sizes — tied to the spacing scale

Icon sizes are **not** free values; they are pulled from `tokens.space` (§2) so an icon always aligns to
the 4/8 rhythm of the row it sits in.

| Size  | Token source            | Usage                                   | Shipped example                     |
| ----- | ----------------------- | --------------------------------------- | ----------------------------------- |
| 16    | `space.4`               | inline with body text, chips, meta      | asset **network mini-badge**        |
| 20    | `space.5`               | list rows, button leading icon          | `.btn` leading icon (DESIGN_SYSTEM §6.1) |
| 24    | `space.6`               | **default** / toolbar / standalone      | the `Icon` artboard 1:1             |
| 28    | `space.6 + space.1`     | bottom **tab bar** (mobile)             | `.navbar-bottom` active glyph       |
| 48    | `space.12`              | **empty states**, the one hero glyph    | `.sect-empty` / `.ai-empty` (§8)    |

> **Shipped drift to note (honesty).** Three in-repo glyphs sit off this ladder: the web overlay
> **Back** chevron renders at **18px** (between `16` and `20` — nudge to `20` for a row context, `16`
> inline); the brand mark's SVG is **15px** inside a 26px `.logo` tile; the `.auth-spark` SVG is **29px**
> inside a 54px tile. The two brand marks are *optical* sizes chosen to seat a glyph inside a fixed tile
> (§5.1.5) and are acceptable as brand exceptions; the 18px Back chevron is genuine drift — snap it to
> the ladder.

#### 5.1.4 · Filled vs. line — a binary, not a spectrum

- **Line is the default, everywhere.** The entire UI — toolbars, rows, inputs, actions — is line icons
  at the stroke and grid above.
- **Filled is reserved for exactly one thing: the *active* navigation / tab state.** An active nav item
  = **filled glyph + `--accent`** (DESIGN_SYSTEM §6.10, §8); inactive = line glyph at `--text-2`. The
  fill *is* the "you are here" signal, paired with the accent tint and (on mobile) the label — never
  fill alone. There is no "filled button icon," no "filled to mean emphasis." If you reach for a filled
  glyph outside active-nav, you are inventing a meaning the system does not have.

#### 5.1.5 · The brand spark / logo mark — flat by decree

The brand mark is a **spark tile**, and it is deliberately **not a gradient** — a hedge against the
"AI-generic purple-gradient logo" cliché (DESIGN_SYSTEM §1.8, §14 DON'T).

**Shipped (`.logo`, `styles.css`):**

| Property     | Value                          | Note                                          |
| ------------ | ------------------------------ | --------------------------------------------- |
| Tile         | `26 × 26`, `border-radius: 8px`| `radius.xs` family                            |
| Fill         | `var(--accent-subtle)`         | flat tint — **no gradient** (comment in source)|
| Glyph color  | `var(--accent)`                | spark on tint                                 |
| Glyph size   | `15px` SVG                     | optical centre in the tile                    |

The larger onboarding instance (`.auth-spark`) scales the same recipe: **54px** tile, `border-radius:
16px` (`radius.md`), `--accent-subtle` fill, `--accent` glyph, 29px SVG. The violet in the system lives
**only** in the net-worth hero wash (§4 / §5.2.4); the logo never borrows it. The `--spark-a`/`--spark-b`
and `--grad-brand` variables in the premium layer exist for chat bubbles and the send affordance — **not**
for the logo mark, which stays flat by decree.

#### 5.1.6 · Chain & asset glyphs — the only place brand color is allowed

Token/chain brand colors (BTC `#F7931A`, ETH, SOL, …) are quarantined: they appear **only inside asset
icons and sparklines**, **never** in text, backgrounds, or state (DESIGN_SYSTEM §2.2). This is a
safety rule, not a taste rule — it guarantees a chain's brand hue can never be mistaken for a semantic
signal (a green token logo is not a "success"; an orange one is not a "warning").

- **Asset icon:** 32px coin/token mark (`.pf-asset` row, DESIGN_SYSTEM §6.7) drawn or supplied per token;
  brand color lives *inside* the mark only.
- **Chain mini-badge:** a **16px** network glyph overlaid on the lower-right of the 32px asset icon,
  shown **only in asset-detail context** (DESIGN_SYSTEM §6.7) — never on every home row, where it would
  add noise without adding a decision.
- **Risk glyphs** are the opposite of brand glyphs: they are line icons that take a `risk.*` role, and
  they are *always* label-paired (§5.1.7). The canonical mapping (DESIGN_SYSTEM §2.2, `tokens.riskPresentation`):

| Level  | Glyph            | Role token   | Label       |
| ------ | ---------------- | ------------ | ----------- |
| LOW    | `shield-check`   | `risk.low`   | "Low risk"  |
| MEDIUM | `shield-alert`   | `risk.medium`| "Caution"   |
| HIGH   | `alert-triangle` | `risk.high`  | "High risk" |
| BLOCK  | `octagon-x`      | `risk.block` | "Blocked"   |

#### 5.1.7 · Accessibility — an icon is never the sole signifier

This is doctrine, not preference (DESIGN_SYSTEM §11, Ch.2 §10 accessible-typography / minimal-cognitive-load):

- **Meaning never rides on a glyph alone.** Risk, status, provisional/stale, success/failure = **icon +
  text label + color** — three redundant channels, colorblind-safe. A bare colored dot with no label is
  a bug.
- **Decorative glyphs are hidden from AT.** When an adjacent visible label already carries the meaning,
  the SVG is `aria-hidden="true"` (as the shipped `Icon` primitive is) so a screen reader is not made to
  read "image, image."
- **Icon-only controls carry a name.** The rare label-free icons — the universally learned **back, close,
  copy, QR, settings-gear** (DESIGN_SYSTEM §8) — must still expose an accessible name
  (`aria-label="Copy address"`) and hit a **≥ 44 × 44** target (`sizing.touchMin`, §2), even when the
  glyph itself is 16–24px. Everything else gets a visible text label.
- **Focus is visible on any focusable icon control** — the §5.3 focus token, not a browser default.
- **Icons scale with Dynamic Type** and never become the load-bearing element that a zoom or a
  reduced-motion setting can strip.

**Icon state matrix** (the glyph's own appearance; the *chrome* around it is §7):

| State                | Stroke color                          | Fill    | Notes                                                        |
| -------------------- | ------------------------------------- | ------- | ----------------------------------------------------------- |
| default (in text)    | inherits `--text` / `--text-2`        | none    | `currentColor` follows the container role                   |
| in primary button    | `--on-accent` (`#FFFFFF`)             | none    | contrast pre-verified on `--accent` fill (§4)               |
| nav — inactive       | `--text-2` (L `#5a5a65` / D `#adadb8`)| none    | line glyph                                                  |
| nav — **active**     | `--accent` (L `#4f46e5` / D `#7c74ff`)| **solid** | the one filled case (§5.1.4)                               |
| risk / status        | `risk.*` role                         | none    | **always** with text label (§5.1.7)                         |
| disabled             | `currentColor` @ opacity ~`0.4`       | none    | inherits the control's disabled treatment (§7); not color-only |
| decorative           | inherits                              | none    | `aria-hidden="true"`                                        |

---

### 5.2 · The depth model — restraint made into tokens

**Depth communicates hierarchy and interactivity, and nothing else** (DESIGN_SYSTEM §5.3). A raised
surface means "distinct, actionable object." We earn it with **one hairline border + one soft shadow** in
light, and with **surface *steps* — not shadows —** in dark. No glass on content, no neon, no
hard-black drop-shadow soup (DESIGN_SYSTEM §1.4, §1.8). The discipline *is* the aesthetic (the
Linear / Rabby lineage cited in Ch.2 §5's "Minimal").

#### 5.2.1 · Elevation levels

| Level        | Semantic                              | Light treatment                                  | Dark treatment                                 | Shipped anchor                    |
| ------------ | ------------------------------------- | ------------------------------------------------ | ---------------------------------------------- | --------------------------------- |
| **e0**       | flush — the page itself               | `bg.canvas`, no border, no shadow                | `bg.canvas`, no border, no shadow              | `body` / `.app`                   |
| **e1**       | resting card / cell (default object)  | `bg.surface` + `border.subtle` + `--shadow`      | **surface step** to `bg.surface`, ~no shadow   | `.card` (`styles.css` L160)       |
| **e2**       | sticky bar / command region          | `0 2px 8px …/.08` *(canon; proposed web token)*  | surface step + hairline, ~no shadow            | `.composer` region                |
| **e3**       | sheet · dialog · menu · popover       | `bg.surface` + `--shadow-lg`                      | surface step to `bg.surface`, faint edge       | `.composer form`, `.reveal` (`--shadow-lg`) |
| **e-hero**   | the one brand elevation (net worth)   | violet wash + **colored** accent shadow          | violet wash + colored accent shadow            | `.pf-net` (`styles.css` L166)     |
| **e-premium**| premium modal / spark affordances     | `--shadow-xl` + `--glow` on accent objects       | `--shadow-xl` (heavier) + `--glow`             | premium layer (`styles.css` §1962+) |

Levels are **not additive** — an object is at exactly one level. You do not stack e1 on e3; a menu on a
card is e3 *over* an e1 field, each single-shadowed.

#### 5.2.2 · Light mode — the layered low-opacity shadow ramp (real values)

Light elevation is **two stacked shadows** — a tight contact shadow plus a soft ambient one — at very low
opacity, so depth is *felt*, not seen. Shipped tokens (`styles.css` `:root`):

| Token           | Level | Value (light)                                                          |
| --------------- | ----- | ---------------------------------------------------------------------- |
| `--shadow`      | e1    | `0 1px 2px rgba(24,24,40,.04), 0 4px 10px rgba(24,24,40,.04)`          |
| *(proposed)* `--shadow-md` | e2 | `0 2px 8px rgba(24,24,40,.08)` — canon e2 (DESIGN_SYSTEM §5.2); web currently jumps e1→e3 |
| `--shadow-lg`   | e3    | `0 1px 3px rgba(24,24,40,.05), 0 12px 28px rgba(24,24,40,.09)`         |
| `--shadow-xl`   | e-premium | `0 2px 8px rgba(24,24,40,.06), 0 24px 60px rgba(24,24,40,.14)`      |

The **rgb base is `24,24,40`** — a faint indigo-black, not pure black — so shadows read as cool ambient
light, never as dirty gray. **e2 is a real canonical level with no discrete web token yet** (the web
composer borrows `--shadow-lg`); ship `--shadow-md` to close the gap. Opacity climbs *slowly* — `.04 →
.08 → .09 → .14` — because a wallet is a document surface, not a game HUD.

#### 5.2.3 · Dark mode — surface steps, not shadows (and the drift to close)

On near-black, a drop shadow is invisible; **elevation is carried by stepping the surface lighter.** The
canonical ramp (`tokens.colors.dark`, DESIGN_SYSTEM §2.2/§2.3):

| Step           | Canon (`tokens`) | Web (`styles.css`) | Role                                   |
| -------------- | ---------------- | ------------------ | -------------------------------------- |
| canvas (e0)    | `#0E0E10`        | `#0b0b0e`          | page background                        |
| surface (e1)   | `#1A1A1E`        | `#141418`          | cards, cells, sheets — **+ one step**  |
| surface2 (e2+) | `#242429`        | `#1c1c22`          | nested / sticky / input fills          |
| border.subtle  | `#2E2E34`        | `#26262d`          | hairline that separates equal surfaces |
| border.strong  | `#3F3F47`        | `#34343d`          | input edge / resting focus edge        |

Each step lifts the surface ~`+0x0C` per channel — an even, legible ramp where "higher = lighter." The
web dark surfaces run **slightly darker than canon** (`#0b0b0e/#141418/#1c1c22` vs
`#0E0E10/#1A1A1E/#242429`) — tracked drift (DESIGN_SYSTEM §13); converge toward the token values.

> **⚠ Drift to reconcile — dark shadows.** DESIGN_SYSTEM §2.3/§5.2 declares dark = "surface steps,
> **effectively no shadow**." But the shipped web `--shadow` / `--shadow-lg` still apply **strong** dark
> shadows —
> `--shadow` dark = `0 1px 2px rgba(0,0,0,.35), 0 6px 16px rgba(0,0,0,.4)`,
> `--shadow-lg` dark = `0 1px 3px rgba(0,0,0,.45), 0 14px 34px rgba(0,0,0,.55)`.
> Those `.35–.55` opacities contradict the "no-shadow in dark" doctrine and can read as a black halo on
> `#0b0b0e`. **Canon:** in dark, depth = surface step + a `border.subtle` hairline; any dark shadow
> should be a *faint* `≤ .25` ambient at most (for genuinely floating e3 sheets), never the primary cue.
> Reconcile the dark `--shadow*` values down; do not add new heavy dark shadows.

#### 5.2.4 · The one loud object — the net-worth hero

Exactly one surface is *allowed* to be brand-loud, because it *is* the brand moment (DESIGN_SYSTEM §5.2):

**Shipped `.pf-net`:**
```css
background: linear-gradient(135deg, var(--accent) 0%,
            color-mix(in srgb, var(--accent) 72%, #a855f7) 100%); /* the ONLY literal violet */
border: none;
box-shadow: 0 12px 32px color-mix(in srgb, var(--accent) 32%, transparent); /* colored, not black */
color: var(--on-accent);
```

Its shadow is **colored** (32% accent) rather than neutral — the single deliberate exception to the
"quiet shadow" rule. It works *because* everything around it is e1-quiet. If a second surface competes
with the hero, the hero stops being the hero. The `--glow-sm` (`0 6px 20px` accent 26%) / `--glow`
(`0 14px 40px` accent 34%; **dark 40% / 50%**) tokens extend this colored-elevation family to the spark
send affordance only — never to ordinary cards.

#### 5.2.5 · Elevation vs. hairline border — the decision rule

Depth and borders are two tools for one job (separating objects); pick the *cheapest* that reads:

| Situation                                            | Use                                    | Why                                                        |
| ---------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Object over the same-color surface, **not floating** | **hairline** `border.subtle` only      | cheapest separation; no fake lift (e.g. list dividers, settings rows) |
| Resting card that *could* be picked up (e1)          | hairline **+** `--shadow` (light) / surface step (dark) | "distinct, actionable object"                     |
| Genuinely floating layer — sheet/menu/dialog (e3)    | `--shadow-lg` (light) / step + faint edge (dark), **+ scrim** | it is *above* the page, not *on* it              |
| Input at rest                                        | `border.strong`, **no** shadow         | an input is inset, not raised — border, not lift          |
| Dark mode, any raised object                         | **surface step first**, border second, shadow last | shadows don't read on black (§5.2.3)              |

**Never** use a shadow to fake a border on a flat fill, and **never** use both a heavy border *and* a
heavy shadow on the same object — that is the "flat-cheap made worse" failure. One hairline, one soft
shadow, done.

#### 5.2.6 · Radius pairs with depth (and its own tracked drift)

Elevation and corner radius move together — a higher level gets a larger radius so the object reads as a
bigger, softer card. Canon (`tokens.radius`): `xs 8` chips · `sm 12` inputs/cells · `md 16` cards ·
`lg 24` sheet top corners · `full 9999` pills/avatars. **Shipped web** (`styles.css`) runs ~2px tighter —
`--radius: 14 / --r-sm: 10 / --r-lg: 16` — and mobile matches web (`radius sm:10 / md:14 / lg:20`); both
are tracked drift (DESIGN_SYSTEM §13). New surfaces use the **canon**; never mix `8` and `16` on sibling
corners of one component.

#### 5.2.7 · "Never flat-cheap, never AI-generic" — made concrete

The DON'Ts (DESIGN_SYSTEM §1.4/§1.8/§14) as buildable checks:

- **No un-bordered gray box.** Every resting surface has *either* a `border.subtle` hairline *or* an
  `--shadow` — a naked `#F0F0F2` rectangle on `#FFFFFF` with neither is banned.
- **No glassmorphism on content.** `--glass-*` exists in the premium layer for chrome accents; content
  cards are opaque `bg.surface`. No frosted balances, no blur behind numbers.
- **No purple-gradient-on-everything.** Violet appears in **exactly one** place: the `.pf-net` wash.
  Buttons, cards, icons, and the logo are flat accent or neutral.
- **No hard-black drop-shadow.** Light shadows are `rgba(24,24,40, ≤.14)`; dark depth is a surface step,
  not a `rgba(0,0,0,.5)` halo (the §5.2.3 reconciliation).
- **No neon glow as decoration.** `--glow` is scoped to the accent send/spark affordance and the hero —
  it is a brand moment, not a hover treatment on ordinary rows.
- **No emoji as UI, no stock hero cliché.** The sparkle/wave brand marks are the only expressive glyphs,
  used sparingly (DESIGN_SYSTEM §8).

If a screen still looks flat-cheap after all this, the fix is **contrast and spacing** (§2, §4) — *not
more shadow* (DESIGN_SYSTEM §5.3).

#### 5.2.8 · Elevation state matrix (a raised, interactive surface)

How an e1 actionable surface (e.g. a tappable `.pf-asset` / `.card` acting as a button) changes its
depth across states. Motion timings are §6; colors are §4.

| State            | Light depth                                          | Dark depth                                   | Border                                  |
| ---------------- | ---------------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| default          | `--shadow` (e1)                                       | surface step to `bg.surface`, ~no shadow     | `border.subtle`                         |
| hover            | lift toward e2 (`--shadow-md` proposed / `--shadow-lg`); `translateY(-1px)` | step to `surface2` tint or accent-tinted border | `border.subtle` → `color-mix(accent 30%, border)` |
| focus-visible    | keep resting shadow **+** focus ring (§5.3)          | same + focus ring                            | ring is additive, not a border swap     |
| pressed          | drop to e1 / flat; `translateY(1px)`, ~80ms (`motion.instant`) | flatten step slightly                 | unchanged                               |
| loading          | resting depth held (no lift); spinner lives *inside* per §8 | same                                   | unchanged                               |
| disabled         | **no** shadow, opacity ~`0.5`, no pointer events     | flatten to canvas step, opacity ~`0.5`       | `border.subtle` @ reduced opacity       |
| dragging (sheet) | e3 `--shadow-lg` + scrim beneath                     | step to `bg.surface` + faint edge + scrim    | none (sheet uses `radius.lg` top only)  |

> **`prefers-reduced-motion`:** the `translateY` lift/press are decorative easing, not meaning — under
> reduced motion the *depth* still changes (shadow/step) but the transform is dropped to a ≤150ms
> cross-fade (§6). Depth is never conveyed by motion alone.

---

### 5.3 · Focus & the seam with color/motion

The focus ring is depth-adjacent (it is an additive outer glow, not a border swap) and is specified in
full in §4 (color) and §11 of DESIGN_SYSTEM. For this section's purposes: every focusable icon or raised
surface shows a **`:focus-visible`** ring of **2px `accent.base` + a `color-mix(accent 20%, transparent)`
halo**, meeting ≥ 3:1 against its background. Shipped web uses `box-shadow: 0 0 0 3px var(--accent-subtle)`
and `0 0 0 3px color-mix(in srgb, var(--accent) 18–20%, transparent)` as the halo. The ring is **stacked
on top of** any resting elevation — it never replaces the object's shadow or border, so a focused card
still reads as a card.

**Haptics are mobile-only** (Expo/React Native) — an icon press or a hold-to-confirm on an elevated sheet
pairs with the haptic map in `docs/design/01-tokens.md` §7; the web has **no** haptic channel and must
never imply one. Motion tokens (`motion.instant 80ms` press · `motion.quick 200ms` lift) and the
reduced-motion contract are owned by §6.

---

### 5.4 · Checklist — before an icon or a surface merges

1. **Grid & stroke:** 24×24 artboard, 1.75px stroke (canon), rounded caps, 2px-grid keylines, 22×22 live
   area. *(Reconcile the web `Icon` from 2px → 1.75px.)*
2. **Size on the ladder:** 16 / 20 / 24 / 28 / 48, pulled from `space.*`. *(Snap the 18px Back chevron.)*
3. **Line by default; filled only for active nav.** Brand color only inside asset/chain glyphs.
4. **Never the sole signifier:** risk/status = icon + label + color; icon-only controls have `aria-label`
   and a ≥44px target; decorative glyphs `aria-hidden`.
5. **One level of depth per object:** hairline *or* shadow (light) / surface step (dark) — never both
   heavy, never a shadow faking a border.
6. **Dark = step, not shadow.** *(Reconcile the heavy dark `--shadow*` down toward the doctrine.)*
7. **One loud object only** — the net-worth hero. Everything else is quiet e1.
8. **Focus ring is additive**, `:focus-visible`, ≥3:1. Reduced-motion drops transforms, keeps depth.
9. **Tokens, not raw values** — reference `--shadow*` / `--border*` / `radius.*` / `space.*`; do not widen
   drift (DESIGN_SYSTEM §13).

> Icons and depth are where "Apple-grade craft" stops being a slogan and becomes a 1.75px stroke on a 2px
> gridline and a `rgba(24,24,40,.04)` contact shadow. Get these two systems right and the whole product
> reads as **one** premium thing; get them wrong and no amount of color or copy will rescue it.


## §6 · Motion, Animation & Haptics

*Motion made a system.* Every animation in Intent Wallet is spent, not sprinkled. Chapter 2 §7 is the
governing law — **animations exist only to Explain · Guide · Confirm · Reduce anxiety; they never merely
decorate** — and Chapter 2 §5 sets the feeling motion must protect: *Apple → Minimal → Fast → Trustworthy →
Invisible*. A wallet that jitters, blocks, or celebrates the wrong thing feels *slow* even when it is fast,
and *untrustworthy* even when it is honest. So this section turns "tasteful motion" into a buildable
contract: the real duration and easing tokens, the four verbs that authorize a motion at all, a
moment-by-moment motion state matrix, the reduced-motion degradation, the 60fps performance budget, and the
mobile haptic vocabulary — with **shipped** (a real class/keyframe in the repo) rigorously separated from
**(proposed)** (a gap this spec fills). Controls' full visual state matrices live in §7, surfaces &
feedback in §8, the AI chat UI in §9 — this section owns only what *moves*.

---

### 6.1 The motion tokens — durations & easings

#### Durations — the canonical scale

The source of truth is `tokens.motion` in [`packages/ui/src/tokens/index.ts`](../../packages/ui/src/tokens/index.ts).
Four durations plus a sheet spring cover the whole product; a motion that needs a fifth value is a motion
that needs a second look.

| Token              | Value  | Curve (canon)                 | Purpose                                         | Status |
| ------------------ | ------ | ----------------------------- | ----------------------------------------------- | ------ |
| `motion.instant`   | 80 ms  | linear                        | pressed states, toggles, tap feedback           | shipped token |
| `motion.quick`     | 200 ms | ease-out                      | fades, chips, row expand/collapse               | shipped token |
| `motion.standard`  | 300 ms | standard `cubic-bezier(0.2,0,0,1)` | screen / section transitions               | shipped token |
| `motion.celebrate` | 600 ms | ease-in-out                   | success checkmark draw-on (**once**)            | token only — animation **(proposed)** |
| sheet              | spring `mass 1 · damping 26 · stiffness 300` | bottom-sheet present / dismiss  | **(proposed)** |

> **Honesty note.** `motion.celebrate` (600 ms) exists as a *value* in the token file but no draw-on
> checkmark keyframe consumes it yet. What ships today for "confirmed" is the shorter `pop` (340 ms, spring)
> on `.authz-allow` / `.stage.done .stage-dot` (§6.3). The 600 ms celebrate draw-on and the sheet spring are
> **(proposed)** — do not describe them as present.

**The sweet-spot rule (DESIGN_SYSTEM §7, Ch2 principle 7).** *Meaningful* transitions — the ones a user
reads as "this changed" — land in the **150–250 ms** band. This is a rule about **communication**, not a cap
on entrances. Two hard ceilings bound it:

- **Nothing blocks input longer than 300 ms.** Non-blocking entrances (opacity/transform reveals) may run
  longer — the plan card's `cardIn` is 400 ms, the auth `riseUp` is 500 ms — because they never gate a tap.
- **Loading states hold a minimum ~400 ms** to defeat flicker (a spinner that flashes for 90 ms reads as a
  glitch, not as work). See the button `loading` moment in §6.3 and §7.

#### Easings — the shipped web curves

The web defines its curves as CSS custom properties in [`apps/web/src/styles.css`](../../apps/web/src/styles.css)
and reuses them everywhere; no component inlines a raw bezier except the two documented specialty curves.

| Token / literal                      | Value                              | Character                    | Where it's used (shipped)                                   |
| ------------------------------------ | ---------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `--ease`                             | `cubic-bezier(0.22, 1, 0.36, 1)`   | decelerate (ease-out-expo)   | the workhorse — reveals, hovers, presses, `rise`/`cardIn`/`revealIn`/`riseUp` |
| `--ease-spring`                      | `cubic-bezier(0.34, 1.4, 0.5, 1)`  | gentle overshoot (1.4 > 1)   | `.btn.primary` press, the `pop` success mark                |
| `linear`                             | —                                  | constant                     | `spin` (button spinner), `blink` (typing dots)              |
| `cubic-bezier(0.2, 0.7, 0.2, 1)`     | —                                  | ease-out, no overshoot       | `grow` — the allocation / `.pf-bar-fill` bar fill           |
| `ease-in-out`                        | —                                  | symmetric                    | `wave` (hero greeting), `floaty` (auth orb)                 |
| standard `cubic-bezier(0.2,0,0,1)`   | canon `motion.standard`            | Material standard            | screen transitions — **(proposed for web adoption)**        |

#### Mobile durations

`apps/mobile/theme.ts` ships `motion = { fast: 120, base: 200, slow: 320 }`.

> **Drift to reconcile (DESIGN_SYSTEM §13).** Three things are honest to state: (1) the mobile `motion`
> token has **zero consumers** in the mobile source today — the one live animation (`ScreenHome`'s skeleton)
> hardcodes 750 ms and its placeholder cross-fade hardcodes 260 ms; (2) mobile `120/200/320` and web
> `~150 ms + --ease` both diverge from the canon `80/200/300/600`; (3) the canon governs new work. When you
> touch a mobile animation, thread it through `motion.*`; when you touch a web curve, keep it on `--ease`.
> Move *toward* the canon (or promote the better implementation value into `tokens/index.ts` via governed
> PR) — never widen the gap.

---

### 6.2 The taxonomy — motion earns its place with one of four verbs

Chapter 2 §7 authorizes motion for exactly four reasons. A proposed animation that cannot name its verb is
deleted, not tuned. Every shipped animation below maps to one:

| Verb              | What it does                                   | Real moment in the product                                  | Shipped class / keyframe                                        |
| ----------------- | ---------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| **Explain**       | shows *cause → effect*, makes a sequence legible | the AI **builds a plan** — route segments stagger in left-to-right so the path reads as a path, not a dump | `.route-seg` `rise`, `animation-delay: calc(var(--i) * 80ms + 120ms)` |
| **Guide**         | directs the eye to the one thing that changed  | a **new surface arrives** — the PlanCard and each async result fade+rise into focus below the message | `.flow` `cardIn` 400 ms; `.authz/.exec/.tx-review/.swap-quote` `revealIn` 320 ms |
| **Confirm**       | marks that a committed action *happened*        | an **approval lands / a step completes** — the allow button and the done dot spring to full size | `pop` 340 ms `--ease-spring` on `.authz-allow`, `.stage.done .stage-dot`, `.st-done` |
| **Reduce anxiety**| says "still working, nothing is stuck / lost"   | **execution is in flight** — the active stage dot breathes; the composer/typing shows thought; skeletons hold the layout | `.stage-active` `pulse` 1.4 s; `.typing i` `blink` 1.2 s; `.skeleton::after` `shimmer` 1.3 s |

Three concrete sequences show the verbs composing across Chapter 2 §8's fixed planning lifecycle
(*Understand → Research → Build Plan → … → Execution → Confirmation*):

**A. Plan building (Explain + Reduce-anxiety).** The user sends an intent. The composer shows the `typing`
blink (**reduce-anxiety** — the AI is thinking, cancellable). When the plan resolves, `.flow` mounts with
`cardIn` (**guide** — here is the answer), and inside it the `.route-seg` chain staggers via `rise` with an
80 ms per-index delay (**explain** — the route is *built* in front of you, node by node), while the
`.pf-bar`/`grow` cost bars sweep to width. Nothing blocks input; the user can read top-to-bottom as the
card assembles.

**B. State transitions (Guide + Reduce-anxiety).** As execution runs, `StepTracker` (`.stages`) advances.
The active step carries `pulse` (**reduce-anxiety** — a heartbeat that says "confirming 2 of 3, ~4 min, not
frozen"). Each finished step flips to `.stage-done` and its dot fires `pop` (**confirm**). A recovering or
parked step re-reveals with `revealIn` (**guide** — attention moves to the new status), never by silently
swapping text. Because the tracker reads from server truth, a reopened app re-renders the *same* state — the
motion never implies progress that didn't happen (doctrine #3).

**C. Execute confirmation (Confirm).** On the ConfirmSheet (`.authz`, §8) the user authorizes; `.authz-allow`
springs with `pop` (**confirm** — the tap registered) and the result reveals with `revealIn`. Today that is
the full confirm gesture. The **(proposed)** escalation — HIGH-risk **hold-to-confirm** (800 ms progress
ring + escalating haptic) and the 600 ms `celebrate` checkmark draw-on — layers *more* confirm motion onto
exactly this moment; see §6.3 and §6.6 for their proposed specs.

---

### 6.3 Motion state matrix — every moving moment, specified

For each animated moment: its trigger, the property that animates, duration, easing, the real class/keyframe,
its reduced-motion fallback (§6.4), and shipped vs proposed. A developer implements pixel-correct from this
table. All values are the live values in `styles.css` unless tagged **(proposed)**.

| Moment                         | Trigger                    | Property animated        | Duration | Easing            | Class / keyframe                         | Reduced-motion fallback | Status |
| ------------------------------ | -------------------------- | ------------------------ | -------- | ----------------- | ---------------------------------------- | ----------------------- | ------ |
| Button press                   | `:active` on `.btn.primary`| `transform` (`translateY(1px) scale(.99)`) | 120 ms | `--ease-spring` | `.btn.primary:active` transition | transition survives (short, non-keyframe) | shipped |
| Button hover                   | `:hover:not(:disabled)`    | `filter` + `box-shadow` + `transform(-1px)` | 180–200 ms | `--ease` | `.btn.primary:hover` transition | survives | shipped |
| Button loading                 | request in-flight          | `transform: rotate` (spinner) | 700 ms/turn, ∞ | `linear` | `.spin` → `@keyframes spin` | spinner **killed** → static ring; label ("Approving…") carries state | shipped |
| Composer / typing indicator    | AI thinking                | `opacity` (3 dots)       | 1.2 s ∞  | `linear` ease-in-out | `.typing i` → `@keyframes blink`, 0.2 s/0.4 s stagger | animation killed → static dots; live-region text "working on it" carries it | shipped |
| Hero greeting wave             | landing mount              | `transform: rotate`      | 1.6 s ×**2** | `ease-in-out` | `.wave` → `@keyframes wave` (runs twice, **not** infinite) | killed → no wave | shipped |
| Page-load reveal (auth/hero)   | mount                      | `opacity` + `translateY(10px)` | 500 ms | `--ease` | `riseUp`, gated in `@media (no-preference)` | not emitted (gate off) → instant | shipped |
| Auth orb float                 | on AuthGate                | `transform: translateY(-5px)` | 5 s ∞ | `--ease` | `.auth-spark` → `@keyframes floaty` | explicit `animation: none` | shipped |
| PlanCard mount                 | plan resolves              | `opacity` + `translateY(12px) scale(.99)` | 400 ms | `--ease` | `.flow` → `cardIn`, gated `no-preference` | not emitted → instant | shipped |
| Route segment stagger          | inside PlanCard            | `opacity` + `translateY(8px)` | 400 ms | ease | `.route-seg` → `rise`, `delay = i*80ms+120ms` | animation killed → all visible at once | shipped |
| Cost / allocation bar fill     | value known                | `transform: scaleX(0→1)` | 700 ms | `cubic-bezier(0.2,0.7,0.2,1)` | `.pf-bar-fill` → `grow` | killed → full width instantly | shipped |
| Async result reveal            | authz/exec/tx/swap mounts  | `opacity` + `translateY(6px)` | 320 ms | `--ease` | `.authz,.exec,.wl-signed,.err-line,.tx-review,.swap-quote` → `revealIn`, gated | not emitted → instant | shipped |
| Execution step: active         | step running               | `box-shadow` ring pulse  | 1.4 s ∞  | ease | `.stage-active .stage-dot` → `pulse` | killed → static accent dot; "active" read by label | shipped |
| Execution step: done           | step completes             | `transform: scale(0.7→1)` + `opacity` | 340 ms | `--ease-spring` | `.stage.done .stage-dot`,`.st-done` → `pop`, gated | not emitted → instant done state | shipped |
| Approval confirm               | `.authz-allow` tap         | `transform: scale` + `opacity` | 340 ms | `--ease-spring` | `.authz-allow` → `pop`, gated | not emitted → instant | shipped |
| Card / asset-row hover lift    | `:hover` on `.pf-asset`    | `transform: translateY(-2px)` + shadow | 200 ms | `--ease` | `.pf-asset:hover` transition | survives (short) | shipped |
| Skeleton shimmer (web)         | loading                    | `transform: translateX(-100%→100%)` | 1.3 s ∞ | linear | `.skeleton::after` → `shimmer` | explicit `animation: none` → static `surface2` block | shipped |
| Skeleton pulse (mobile)        | loading                    | `opacity` 0.35↔0.8       | 750 ms/leg ∞ | linear (`Animated.timing`) | `ScreenHome` `Skeleton` (`useNativeDriver`) | `isReduceMotionEnabled()` → static `opacity 0.5` | shipped |
| Rotating placeholder (mobile)  | idle composer              | `opacity` 1→0→1 (text swap) | 260 ms/leg | `Animated.timing` | `ScreenHome` command sub | **(gap)** not yet reduced-motion-gated | shipped |
| Hold-to-confirm ring (HIGH)    | press-and-hold             | `stroke-dashoffset` ring + escalating haptic | 800 ms | linear | ConfirmSheet HIGH CTA | ring → instant fill; **switch-control path required** | **(proposed)** |
| Success checkmark draw-on      | terminal success           | SVG `stroke-dashoffset`  | 600 ms `motion.celebrate` | ease-in-out | (none yet) | draw-on **killed** → static ✓ | **(proposed)** |
| Bottom-sheet present / dismiss | open/close sheet           | `transform: translateY` spring | spring `1/26/300` | spring | (web uses reveal; mobile modal) | spring → ≤150 ms cross-fade | **(proposed)** |

---

### 6.4 The reduced-motion contract

`prefers-reduced-motion: reduce` is an **acceptance gate**, not a courtesy (CLAUDE.md doctrine #6,
DESIGN_SYSTEM §7 & §11). Vestibular safety is non-negotiable, and — the load-bearing invariant — **nothing
is ever conveyed by motion alone**: every pulse, shimmer, and reveal has a static twin (a label, a color, a
`.sr-only` live region) so the reduced-motion experience is *complete*, never degraded in meaning.

**Web — what ships (`styles.css`).** Two mechanisms, working together:

```css
/* 1 · Blanket kill of every keyframe animation */
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }

/* 2 · The showy reveals are *opt-in* — emitted ONLY when motion is welcome */
@media (prefers-reduced-motion: no-preference) {
  .flow { animation: cardIn .4s var(--ease) both; }         /* PlanCard */
  .authz, .exec, .tx-review, .swap-quote { animation: revealIn .32s var(--ease) both; }
  .stage.done .stage-dot, .st-done, .authz-allow { animation: pop .34s var(--ease-spring) both; }
}
@media (prefers-reduced-motion: reduce) { .auth-spark, .skeleton::after { animation: none; } }
```

The design is deliberately **belt-and-suspenders**: the reveals live inside a `no-preference` block (so under
reduced motion they are *never emitted* — the content simply appears in final position with `both` fill),
**and** the blanket rule kills any keyframe that slipped through. Infinite motions (`shimmer`, `pulse`,
`floaty`, `spin`, `blink`) all stop; the elements fall back to their static painted state — the skeleton to a
plain `surface2` block, the spinner to a static ring behind its still-present label.

> **Honest divergence to reconcile (DESIGN_SYSTEM §13).** DESIGN_SYSTEM §7 promises springs/slides "become
> **≤ 150 ms cross-fades**." The web today degrades keyframes to **instant** (`animation: none`) rather than
> to a cross-fade — which is *stronger* (zero motion) and fully safe, but not literally a cross-fade. Two
> further truths: (a) the blanket rule kills **keyframe animations only** — CSS `transition`s on
> hover/press/focus are **not** disabled; they are ≤ 220 ms transform/opacity/color changes and are
> acceptable under the "reduce, not eliminate" reading, but this should be stated in the spec, not left
> implicit; (b) **(proposed)** if a true ≤150 ms cross-fade is desired on any specific surface, add it inside
> the `reduce` block explicitly rather than relying on instant. Either way: close the wording gap, don't
> widen it.

**Mobile — what ships.** `ScreenHome`'s `Skeleton` calls `AccessibilityInfo.isReduceMotionEnabled()`; when
reduced, it sets a **static `opacity: 0.5`** instead of starting the `Animated.loop`, and cleans the loop up
on unmount:

```ts
AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
  if (reduced) op.setValue(0.5);      // static, honest "loading" tone
  else start();                        // 750ms opacity breathe
});
```

> **(proposed) mobile gap.** The pattern above is correct but only wired into the Home skeleton. The rotating
> composer placeholder (260 ms opacity swap) is **not** yet reduced-motion-gated, and there is no shared
> `useReduceMotion()` hook. Proposed: a `useReduceMotion()` hook (subscribing to
> `AccessibilityInfo.addEventListener('reduceMotionChanged', …)`) that every mobile `Animated` consumer reads,
> mirroring the web's global gate. Until then, treat any new mobile animation as required to check
> `isReduceMotionEnabled` at start.

**Testing (the gate).** Reduced-motion is verified, not asserted: (1) manual — toggle *Settings → Accessibility
→ Reduce Motion* (macOS/iOS) and *emulate `prefers-reduced-motion`* in DevTools, then drive plan →
authorize → execute and confirm no infinite motion runs and every state is still legible; (2) automated —
the reveal/skeleton assertions belong in the a11y test pass (§11 / [`TESTING.md`](../../TESTING.md)); a
red check here blocks merge.

---

### 6.5 Performance budget — 60fps or it doesn't ship

Motion at 60fps means **≤ 16.7 ms per frame**, which means the compositor does the work and the main thread
stays free (CLAUDE.md §5: interaction < 100 ms, no main-thread jank).

**The rule: animate `transform` and `opacity` only.** These are compositor-only properties — they never
trigger layout or paint. Animating `width`, `height`, `top`, `left`, `margin`, or `box-shadow`-geometry
forces layout/paint on every frame and drops frames. The shipped animations are audited against this:

| Animation                | Property                        | Compositor-safe? | Note                                                        |
| ------------------------ | ------------------------------- | ---------------- | ----------------------------------------------------------- |
| `rise` / `cardIn` / `revealIn` / `riseUp` | `opacity` + `transform: translateY` | ✅ | the entrance workhorses — pure compositor                   |
| `grow` (bar fill)        | `transform: scaleX`             | ✅               | scaleX, **not** `width` — correct choice                     |
| `pop` / press / hover-lift | `transform: scale/translateY`  | ✅               | compositor                                                  |
| `spin` / `wave` / `floaty` / `shimmer` | `transform: rotate/translateX` | ✅ | shimmer sweeps via `translateX`, not `background-position`   |
| `pulse` (active step)    | `box-shadow` ring               | ⚠️ paint         | acceptable — a 26 px dot, tiny paint area, 1.4 s cadence; **do not** scale this pattern to large surfaces |

**Additional budget rules:**

- **Mobile drives on the native thread.** Every `Animated` uses `useNativeDriver: true` (see `ScreenHome`),
  so animation runs off the JS thread — mandatory for anything that must stay smooth during work.
- **No unbounded work behind motion.** An animation never awaits a network call to finish; loading motion
  (skeleton/spinner) is decoupled from the request and self-terminates on state change (min ~400 ms).
- **Stagger is capped.** The route stagger (`i*80ms`) is fine for ~2–4 segments; a list of 30 rows does
  **not** get a 30-deep cascade (it would exceed the 300 ms input ceiling and read as slow). Cap perceptible
  stagger at ~5 items; beyond that, one group reveal.
- **(proposed) `will-change` hygiene.** Add `will-change: transform` only to elements about to animate, and
  remove it after — a permanent `will-change` on many nodes wastes GPU memory. Not yet applied; add per-surface
  where profiling shows a promotion is needed, never globally.
- **No layout thrash.** Never read layout (`offsetWidth`, `getBoundingClientRect`) and write style in the same
  frame; batch reads then writes. Entrances use `both` fill so there is no first-frame flash from an
  un-styled → styled reflow.

---

### 6.6 Haptics — the mobile-only vocabulary

> **Status banner — read first.** Haptics are **NOT shipped.** `expo-haptics` is not a dependency, and there
> are **zero** haptic calls (`Haptics.*`, `Vibration`, `navigator.vibrate`) anywhere in `apps/mobile` or
> `apps/web`. Everything in §6.6 is **(proposed)** — the specification for the haptic layer to build, not a
> description of current behavior. **Haptics are mobile-only by nature**; the web has no equivalent and this
> spec proposes none for it (`navigator.vibrate` is coarse, poorly supported, and off-brand — do not add it).

Haptics obey one law above all: **haptics accompany, they never replace.** A buzz is always paired with a
visual (and, where relevant, a spoken) change — never the sole signal of an outcome (the same "never by one
channel alone" rule as color and motion, §11). They also respect the system: honor the OS haptic/vibration
setting, and never fire during passive scrolling.

**Proposed vocabulary** — a thin wrapper over `expo-haptics`, five semantic events mapped to the real moments
of the trust lifecycle:

| Semantic event      | `expo-haptics` API                                | Fires at (real moment)                                                              | Paired visual (the primary signal) |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| **selection**       | `selectionAsync()`                                | picking a chip / token / account; toggling Simple↔Pro; slippage step               | selected fill (`accent.subtle`)    |
| **impact-light**    | `impactAsync(ImpactFeedbackStyle.Light)`          | composer send tap; AddressChip copy; primary CTA press                             | button press `pop`; "Copied" toast |
| **impact-medium**   | `impactAsync(ImpactFeedbackStyle.Medium)`         | **approval registered** on the ConfirmSheet; each tick of HIGH-risk hold-to-confirm (escalating) | `.authz-allow` `pop`; hold ring fills |
| **success (notify)**| `notificationAsync(NotificationFeedbackType.Success)` | **execute success** — a step completes / the tx confirms on-chain                | `.stage.done` `pop`; celebrate ✓   |
| **warning (notify)**| `notificationAsync(NotificationFeedbackType.Warning)` | MEDIUM/HIGH risk surfaced; quote re-quoted-worse; entering a mainnet real-funds guard | RiskBadge (icon+label+color)       |
| **error (notify)**  | `notificationAsync(NotificationFeedbackType.Error)`   | **guard BLOCK** (no CTA); simulation-mismatch; broadcast failure                   | BLOCK banner / danger panel        |

**Escalation, mapped to risk (proposed, mirrors §8 ConfirmSheet CTA-by-risk):**

- **LOW** → single `impact-light` on confirm.
- **MEDIUM** → `warning` on surface + `impact-medium` on confirm.
- **HIGH** → `warning` on surface; during the 800 ms **hold-to-confirm**, `selection` ticks that *escalate*
  in cadence as the ring fills, then `success` on completion (or `error` if released early).
- **BLOCK** → a single `error` the instant the sheet opens — the body *feels* the wall the same moment it
  sees "Blocked."

**Proposed implementation sketch** — one `haptics.ts` wrapper so no screen calls `expo-haptics` directly, so
the OS setting and a global disable are honored in one place, and so it is trivially mockable in tests:

```ts
// apps/mobile/haptics.ts  (proposed)
import * as Haptics from 'expo-haptics';
export const haptic = {
  select:  () => Haptics.selectionAsync(),
  tap:     () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  confirm: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warn:    () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error:   () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};
// every call is fire-and-forget and no-ops if the OS setting is off.
```

Acceptance for the haptic layer, when built: it never fires the sole signal of an outcome; it never fires on
scroll; `error` fires on **every** BLOCK and simulation-mismatch (the body must feel a refusal); and it is
gated so that a user who disables system haptics gets a fully functional, fully honest wallet with no buzz.
Until this ships, do not depict or claim haptic feedback in any flow — that would fabricate a capability
(doctrine #3, DESIGN_SYSTEM §12).

---

*Motion and haptics are the wallet's body language: it moves only to explain, guide, confirm, or calm; it
falls perfectly still when a user asks it to; and it will one day let a user feel the difference between an
approval and a refusal. That restraint is the craft — see §7 for how these tokens animate the controls, §8
for surfaces & feedback, and §9 for the AI chat UI's motion.*


## §7 · The Component Library — Controls

*The three controls a user touches on every screen: the **Button**, the **Input**, and the **Card**. This
section is the buildable contract for each — anatomy, a full state matrix, the exact token per state in
light **and** dark, the a11y rules, and a short do/don't. It is the concrete system that Chapter 2's Design
Laws produce: one primary CTA per screen (Ch2 §2 **Law 2**), 3-second clarity (Ch2 §10), and motion that
only ever **confirms** an action (Ch2 §7). It cites the real classes in
[`apps/web/src/styles.css`](../../apps/web/src/styles.css) and the real primitives in
[`apps/mobile/ui.tsx`](../../apps/mobile/ui.tsx); tokens are the source-of-truth values from
[`packages/ui/src/tokens/index.ts`](../../packages/ui/src/tokens/index.ts) and
[`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md).*

> **Honesty legend.** **SHIPPED** = a real class/token in the repo today (cited). **(proposed)** = a gap
> this section specifies to fill; it is *not* built yet — do not treat it as present. **(drift)** = shipped,
> but diverges from the canon in the [DESIGN_SYSTEM drift ledger](../../DESIGN_SYSTEM.md) §13; the canon
> value is named. **Haptics are mobile-only** and, where noted, not yet wired.

Sibling sections own the rest: motion curves/durations and the haptic map → **§6**; surfaces (Card *as a
layout container*, Chip, Sheet, RiskBadge, Skeleton, EmptyState) and feedback → **§8**; the Composer / chat
controls → **§9**. This section covers the *control* semantics of Buttons, Inputs, and the interactive
Card; it references those siblings rather than restating them.

---

### 7.0 · Token shorthand used below

The values every control state references, so the matrices stay readable. Canon = `tokens/index.ts`; the
web `--var` and mobile `Palette` key are given where they differ.

| Meaning              | Canon role (`tokens`) | Web `styles.css` var        | Light → Dark            | Mobile key      |
| -------------------- | --------------------- | --------------------------- | ----------------------- | --------------- |
| Accent fill          | `accent.base`         | `--accent`                  | `#4F46E5` → `#7C74FF` ⚠ | `accent`        |
| Accent pressed       | `accent.pressed`      | `--accent-press`            | `#4338CA` → `#6A62F0`    | —               |
| Accent tint (halo)   | `accent.subtle`       | `--accent-subtle`           | `#EEF0FE` → `#201F42`    | `accentSubtle`  |
| Text on accent       | `accent.onAccent`     | `--on-accent`               | `#FFFFFF` → `#FFFFFF`    | `'#fff'`        |
| Input fill           | `bg.surface2`         | `--surface2`                | `#F3F3F6` → `#1C1C22`    | `surface2`      |
| Card fill            | `bg.surface`          | `--surface`                 | `#FFFFFF` → `#141418`    | `surface`       |
| Resting border       | `border.strong`       | `--border-strong`           | `#DBDBE1` → `#34343D`    | `border`        |
| Hairline             | `border.subtle`       | `--border`                  | `#ECECEF` → `#26262D`    | `border`        |
| Muted / placeholder  | `text.tertiary` (AA-body variant) | `--text-3`      | `#6E6E79` → `#8B8B97`    | `text3`         |
| Danger / invalid     | `danger.base`         | `--block`                   | `#B91C1C` → `#F87171`    | `danger`        |

> ⚠ **`accent.base` dark is (drift).** Canon is `#6D66F6`; web ships `#7C74FF`, mobile ships `#6D66F6` ✓.
> Per the drift ledger, new work converges on the canon `#6D66F6`. Both remain AA for white label text.

---

### 7.1 · Buttons — `.btn` / `PrimaryButton`

The button is where an intent becomes an action. Ch2 **Law 2** is law here: **one screen → one primary
CTA.** Everything else on the screen is a secondary, tertiary, or text button — never a second filled
indigo. Emphasis is carried by **variant**, not by two competing fills.

#### Anatomy

```
┌───────────────────────────────────────────┐
│  [leading icon 20]   Label (headline 17/600)│   ← container: h 52 (canon) · radius md
└───────────────────────────────────────────┘       label centered · icon optional · full-width in gates
```

- **Container:** min height **52** (`sizing.buttonHeight`), horizontal padding `space.4`–`space.5` (16–20),
  radius `radius.md` 16 (canon). Full-width inside the AuthGate and inside sheets; intrinsic width in rows.
- **Label:** `headline` (17 / 600) — a verb or verb+object ("Send $100", "Approve", "Get new quote").
  **Never** a bare glyph on a text button (the `.btn.send` icon button is the one exception, and it carries
  an `aria-label`).
- **Leading icon:** optional, 20px, inherits label color. Trailing content is reserved for the loading
  spinner only.

#### Variants — what's shipped vs. what the canon names

| Variant           | Purpose / when                        | Web (SHIPPED)                     | Mobile (SHIPPED)         |
| ----------------- | ------------------------------------- | --------------------------------- | ------------------------ |
| **primary**       | the one CTA per screen                | `.btn.primary`                    | `PrimaryButton`          |
| **secondary**     | the alternate, equal-weight action    | *(proposed `.btn.secondary`)* — web currently uses `.wl-act` tiles / `.chip` | `SecondaryButton`        |
| **tertiary / text** | low-emphasis, inline                | `.wl-link` (text link)            | `TextButton`             |
| **destructive**   | irreversible / dangerous              | `.wl-act-danger` (`--block`)      | `PrimaryButton danger`   |
| **send (icon)**   | submit the Composer                   | `.btn.send` (40px circle)         | — (Composer, §9)         |
| **hold-to-confirm** | HIGH-risk authorize (§8 ConfirmSheet) | *(ConfirmSheet, see §8)*         | *(ConfirmSheet, §8)*     |

> **(proposed) — canonical `.btn` variant set on web.** Web ships only `.btn.primary` + `.btn.send`;
> secondary/tertiary/destructive are today expressed through *other* class families (`.wl-act`, `.wl-link`,
> `.wl-act-danger`). To reach the one-language bar, add `.btn.secondary` (fill `--surface2`, text `--text`,
> 1px `--border-strong`) and `.btn.danger` (fill `--block`, text `--on-accent`) so every button is one
> family. Mobile already has this shape (`SecondaryButton`, `TextButton`, `danger`).

#### ⭐ Primary button — state matrix (SHIPPED, exact tokens)

The web `.btn.primary` is resolved through three cascading layers in `styles.css` (base → minimal-luxe →
premium); the **premium layer wins**, so the *shipped reality* is a brand **gradient**, not a flat fill:

| State             | Fill                                                   | Text / icon      | Border | Shadow                | Transform / motion                              |
| ----------------- | ------------------------------------------------------ | ---------------- | ------ | --------------------- | ----------------------------------------------- |
| **default**       | `--grad-brand` (135° `--accent`→`#7C3AED` L / `--accent-press`→`#6D28D9` D) | `--on-accent` `#FFF` | none | `--glow-sm` (accent 26% L / 40% D) | — |
| **hover**         | same gradient, `filter: brightness(1.06)`              | `#FFF`           | none   | `--glow` (accent 34% L / 50% D) | `translateY(-1px)` · 120 ms spring (`--ease-spring`) |
| **focus-visible** | *(gap — see below)*                                    | `#FFF`           | —      | UA default outline    | — |
| **pressed**       | same gradient                                          | `#FFF`           | none   | `--glow-sm`           | `translateY(1px) scale(0.99)` · 120 ms |
| **loading**       | same gradient, held disabled                           | label **stays** + `.spin` (15px, 2px `--on-accent`) | none | `--glow-sm` | spinner spins 0.7 s linear; **min ~400 ms** dwell (no flicker) |
| **disabled**      | same gradient @ `opacity: 0.5`                         | `#FFF` @ 0.5     | none   | none                  | `cursor: default`; no pointer events |

The **flat-fill canon** (DESIGN_SYSTEM §6.1: primary = `accent.base`, hover → `accent.pressed`) is the
*documented* intent; the premium gradient is what ships. **(drift)** — both are AA-white and acceptable;
if a screen must read flatter (dense forms, Pro mode), drop back to the flat `--accent` fill. Never invent a
third fill.

Mobile `PrimaryButton` (`s.primary`) is the **flat** form: `backgroundColor: accent`, `radius.md` 14,
`paddingVertical: 16`, label `#fff` 15/700; `danger` swaps fill to `Palette.danger`; disabled/busy →
`opacity: 0.5`.

#### Loading — the label must not vanish

DESIGN_SYSTEM §6.1: *spinner replaces the icon, the **label stays*** ("Approving…", not a bare spinner),
and it dwells **≥ 400 ms** to avoid flicker (§6 motion). Web keeps the label and shows `.spin` inline.

> **(gap) — mobile drops the label while busy.** `PrimaryButton` renders `busy ? <ActivityIndicator/> :
> <Text>{label}</Text>` — a **bare** spinner. Fix to keep the label beside the indicator (e.g. "Approving…"
> + `ActivityIndicator`) so the loading state stays legible and matches the web. Until fixed, this is a
> known deviation from the spec.

#### Focus — the biggest control gap on web

> **(proposed) — `:focus-visible` ring on `.btn`.** There is **no `:focus-visible` rule anywhere in
> `styles.css`**; keyboard focus on a button falls back to the browser's default outline, which the premium
> gradient + glow can visually swallow. This violates DESIGN_SYSTEM §11 (every interactive element has a
> **visible** focus ring: 2px `accent.base` + a `color-mix(accent 20%, transparent)` halo, ≥ 3:1). Ship:
> ```css
> .btn:focus-visible {
>   outline: 2px solid var(--accent);
>   outline-offset: 2px;
>   box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 20%, transparent);
> }
> ```
> Note the halo token: the spec names a **semi-transparent 20% accent** halo; inputs today use the opaque
> `--accent-subtle` tint (§7.2). For buttons on colored/gradient fills, use the 20% color-mix — it reads on
> any background. This is the single highest-priority a11y fix in this section.

#### Sizing / touch — a real sub-44 gap on web

- Canon: `sizing.touchMin` **44×44**, `sizing.buttonHeight` **52**.
- **(drift/a11y)** Web `.btn.primary` ships **`height: 42px`** and `.btn.send` is a **40px** circle — both
  **below** the 44px minimum. Raise the primary to **≥ 44** (canon 52), and give `.btn.send` ≥ 44 of tap
  area via padding/`hit-area` even if the visual stays 40. Mobile `PrimaryButton` (16px vertical padding +
  15px label ≈ 50px) and `TextButton` (`hitSlop={8}`) already clear 44.

#### Accessibility

- Native `<button>` (web) / `Pressable accessibilityRole="button"` (mobile) — never a clickable `<div>`.
- Loading announces progress (`aria-busy` / live region "Approving…"); the icon-only `.btn.send` carries a
  text `aria-label`.
- **Double-submit guard:** disable on first tap (money buttons) so a fast double-click cannot fire twice.
- Target ≥ 44 including margin (see gap above).

#### Do / Don't

- **Do** keep exactly **one** primary per screen (Ch2 Law 2); demote the rest to secondary/text.
- **Do** keep the label visible in the loading state; hold ≥ 400 ms.
- **Don't** let a spinner replace the label (DESIGN_SYSTEM §14) — mobile busy is the bug to fix, not to copy.
- **Don't** ship a button with no visible focus state — wire `:focus-visible` before merge.
- **Don't** introduce a second filled indigo, a third fill, or a button under a resting thumb for a
  destructive action.

---

### 7.2 · Inputs — `.wl-input` / `.wl-area` / `Field`

Text, amount, and search share one field shell; the differences are keyboard, formatting, and validation.
The field is calm by default and only ever raises its voice for a **real, explained** error (Ch2 §7:
motion/feedback only to *confirm* or *reduce anxiety*).

#### Anatomy

```
Label (subhead 15 · --text-2)                    ← .wl-flabel — always present, associated to the field
┌───────────────────────────────────────────┐
│  value / placeholder (--text-3)             │   ← .wl-input · fill --surface2 · 1px --border-strong · radius
└───────────────────────────────────────────┘
Help text (footnote 13 · --text-3)   |   Error (footnote · --block)   ← one or the other, never both
```

- **Label** (`.wl-flabel`, mobile inline `<Text>`) sits above the field; it is **never** placeholder-only
  (a placeholder disappears on type and is not a label — DESIGN_SYSTEM §11).
- **Field** (`.wl-input`): fill `--surface2`, 1px `--border-strong`, radius **`--radius` 14** (minimal-luxe
  layer; the base `.wl-input` declares `10px` → **(drift)** vs canon `radius.sm` 12), height **42px**,
  padding `10px 12px`, font 14px. Textarea variant `.wl-area`: `min-height: 64px`, monospace, resizable.
- **Help / Error:** `.wl-err` (`--block`, footnote) below the field; help is `--text-3`. Show **one** at a
  time.

#### Input variants

| Variant     | Web (SHIPPED)                                  | Keyboard / mode                     | Notes                                             |
| ----------- | ---------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| **text**    | `.wl-input`                                    | default; `spellCheck={false}` for handles | names, RPC URLs, contact labels             |
| **mono**    | `.wl-input.wl-mono` / `.wl-area`               | default, `autoCapitalize` off       | addresses, recovery phrase — EIP-55 casing kept   |
| **password**| `.wl-input type="password"`                    | `autoComplete="new-password"`       | unlock / seed — never logged                      |
| **amount**  | `.wl-input inputMode="decimal"`                | decimal keypad                      | see the deep dive below                           |
| **fee-rate**| `.wl-input inputMode="numeric"`                | numeric keypad                      | sat/vB                                            |
| **search**  | *(proposed `.wl-input.wl-search`)* — leading 16px search glyph + clear affordance | — | not a distinct class yet |

Mobile `Field` maps 1:1: `secure`, `mono`, `multiline` (min-height 76), `keyboardType`, with
`autoCapitalize="none"` + `autoCorrect={false}` baked in.

#### State matrix (SHIPPED, exact tokens · light & dark)

| State           | Fill        | Border                                 | Text / placeholder                   | Ring / feedback                                      |
| --------------- | ----------- | -------------------------------------- | ------------------------------------ | --------------------------------------------------- |
| **default**     | `--surface2`| `--border-strong` `#DBDBE1`/`#34343D`  | value `--text`; placeholder `--text-3`| none                                                |
| **hover**       | `--surface2`| `--border-strong`                      | —                                    | cursor text; no border change (calm)                |
| **focus**       | `--surface2`| `--accent` `#4F46E5`/`#7C74FF`         | `--text`                             | `box-shadow: 0 0 0 3px --accent-subtle` (halo)      |
| **filled**      | `--surface2`| `--border-strong`                      | `--text`                             | none                                                |
| **invalid / error** | `--surface2` | `--block` `#B91C1C`/`#F87171` (`.wl-input-bad`) | `--text`; `.wl-err` message in `--block` | on blur when the value is present-and-wrong |
| **disabled**    | `--surface2`| `--border-strong`                      | `--text-3`                           | `opacity ~0.5` *(proposed explicit `:disabled`)*    |
| **placeholder** | `--surface2`| `--border-strong`                      | `--text-3` `#6E6E79`/`#8B8B97`, `opacity:1` | placeholder is obviously placeholder, never a fake value (§12) |

> **Focus-halo note (drift-adjacent).** Inputs use `box-shadow: 0 0 0 3px var(--accent-subtle)` — the
> **opaque** accent tint (`#EEF0FE`/`#201F42`), *not* the `color-mix(accent 20%, transparent)` halo the a11y
> spec (§11) names. On `--surface2` this is visible and AA; converge inputs and the proposed button ring on
> **one** halo definition so focus looks identical across controls.

#### The amount input — bigint discipline at the edge

Money is **integer bigint end-to-end** (Doctrine #4); the amount *field* is the single place a human decimal
string meets that rule, so it carries specific obligations:

- **Entry is a string**, not a JS number. `inputMode="decimal"` on web / `keyboardType` on mobile shows the
  right keypad. The raw string is converted to base units **only at submit** via `decimalToBase(value,
  decimals)` (see `App.tsx`) — never parsed to a float mid-edit. Display back to the user rounds per
  [`docs/design/08-standards.md`](../../docs/design/08-standards.md) §1.4: **"you receive" rounds down,
  "you pay" rounds up** — we never flatter a number the user is about to commit to.
- **Validation:** reject non-numeric / multiple-dot input; over-precision beyond the asset's `decimals` is
  clamped, not silently truncated to a wrong value; "amount > balance" is a **warn**, blocked at the CTA,
  not a red field mid-type.
- **(proposed) `tabular-nums` on the amount field.** Display amounts already use
  `font-variant-numeric: tabular-nums` (e.g. `.pf-net-value`), but the amount **entry** `.wl-input` does
  not — so digits can reflow as the user types. Add `font-variant-numeric: tabular-nums lining-nums` to
  amount/fee inputs so entry matches the tabular hero rule (Typography §3).
- **Never a spinner `<input type="number">`** with up/down steppers — they fight decimal precision and are
  not touch-friendly. Use a plain text input + decimal `inputMode` (as shipped).

#### Accessibility

- **Label association** is mandatory: `<label htmlFor>` or `aria-label` (shipped on the identity/address
  fields: `aria-label="EVM address"`, etc.). A placeholder is **not** an accessible name.
- **(proposed) `aria-invalid` + `aria-describedby`.** `.wl-input-bad` sets the *visual* error border but no
  code sets `aria-invalid="true"` or links the `.wl-err` message via `aria-describedby` — a screen-reader
  user hears the field but not that it's wrong or why. Wire both when the invalid state is set.
- Error is conveyed by **border color + text**, never color alone (§11). Focus ring meets ≥ 3:1.
- Target ≥ 44: the 42px field height needs its label/hit area to total ≥ 44 (see §7.1 gap).

#### Do / Don't

- **Do** keep a visible, associated label; show help **or** error, never both.
- **Do** treat the amount as a string until submit; round honestly (down for receive, up for pay).
- **Don't** validate mid-keystroke into a red field — validate on blur / submit; empty ≠ error.
- **Don't** use `type="number"` steppers for money; don't let a placeholder impersonate a real balance (§12).
- **Don't** ship an invalid state that only changes color — pair it with `.wl-err` text and `aria-invalid`.

---

### 7.3 · Cards — `.card` / `.pf-asset` / `.id-row` / `Card`

A card is a **distinct object** the user reads or acts on. Depth means interactivity, not decoration
(DESIGN_SYSTEM §5.3): one hairline border + one soft shadow in light, a **surface step** in dark. The key
distinction for *this* section is **static vs. interactive** — an interactive card is a control and must
answer hover/press/focus like a button.

#### Anatomy

```
┌─────────────────────────────────────────────┐
│  [optional CardLabel — caption, one per card] │   ← e.g. "NET WORTH", "YOU RECEIVE"
│                                               │
│   content (rows / amount / identity)          │   ← padding 14–22 · gap from spacing scale
│                                               │
└─────────────────────────────────────────────┘   ← fill --surface · 1px --border · radius · shadow (light)
```

- **Fill** `--surface`; **border** 1px `--border` (hairline); **radius** `--radius` 14 (web) / `radius.lg`
  20 (mobile Card) — canon `radius.md` 16 for cards **(drift)**, converge upward.
- **Elevation** `--shadow` (`e1`) in light; in dark, depth is the **surface step** `canvas → surface →
  surface2`, shadows near-invisible (§5.2). Mobile exposes an opt-in `elevated` prop
  (`cardElevatedLight`/`cardElevatedDark`) with a **brand-tinted** (not black) shadow in light.
- **One `CardLabel`** max per card region (caption, uppercase, `--text-3`) — a seasoning, not a paragraph
  (Typography §3).

#### Static vs. interactive — the real classes

| Card                | Kind          | Fill / border                        | Interactive states                                        |
| ------------------- | ------------- | ------------------------------------ | --------------------------------------------------------- |
| `.card`             | **static** container | `--surface` · 1px `--border` · `--shadow` | none — it is a surface, not a control                     |
| `.pf-asset`         | **interactive** (asset row → detail) | `--surface` · 1px `--border` | hover: `translateY(-2px)` + `--shadow-lg` + border `--border-strong` |
| `.id-row`           | **interactive** (identity address row) | transparent · 1px `--border` | hover: border `--accent` + fill `--surface2`             |
| `.id`               | static container (universal identity) | `--surface` · border | contains interactive `.id-row`s + `AddressChip`s          |
| `.pf-net`           | **the hero** (net-worth wash) | violet gradient (§4) · colored shadow | not a button — it is the one brand moment (§5.2)          |
| mobile `Card`       | static **or** interactive | `--surface` · hairline `--border` | interactive when `onPress` is passed → renders a `Pressable` |

Chip, Sheet, RiskBadge, Skeleton, and the Card's role as a **feedback/layout surface** are specified in
**§8** — this section only defines the *control* behavior of the interactive cards above.

#### State matrix — interactive card (SHIPPED, `.pf-asset` / `.id-row`)

| State             | `.pf-asset`                                                    | `.id-row`                                             |
| ----------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| **default**       | fill `--surface` · 1px `--border` · `--shadow`                | transparent · 1px `--border`                          |
| **hover**         | `translateY(-2px)` · `--shadow-lg` · border `--border-strong` · 200 ms `--ease` | border `--accent` · fill `--surface2` · 160 ms `--ease` |
| **focus-visible** | *(proposed — same ring as §7.1)*                              | *(proposed — same ring as §7.1)*                      |
| **pressed**       | settles to `translateY(0)` (spring)                           | fill `--surface2` held                                |
| **loading**       | `.skeleton` shimmer variant (matches final layout, §8)        | skeleton rows                                         |
| **empty**         | `.sect-empty` — one 48 glyph · one line · one CTA (§8)        | never invents an address it hasn't derived (§12)      |
| **stale / error** | dim ~70% + clock glyph ("as of …") — a failed read is **not $0** (§7 5-state, DESIGN_SYSTEM §7) | partial read → stale treatment, never a confident wrong value |

> **(proposed) — focusable interactive cards.** `.pf-asset` and `.id-row` respond to `:hover` but expose no
> keyboard focus/activation. If a card navigates or opens a sheet, it is a control: give it `role="button"`
> (or wrap a native `<button>`), `tabindex="0"`, Enter/Space activation, and the shared `:focus-visible`
> ring. Today a keyboard user cannot reach these — this is required for AA (§11).

#### Interactive vs. static — the rule

- If tapping the card **does something**, it is a control: it must have hover **and** press **and** a
  visible focus state, a `role`/`accessibilityRole` of button, and a ≥ 44 target.
- If it is purely a container (`.card`, `.id`, `.pf-net`), it has **no** interactive states — don't add a
  hover lift to a thing that can't be clicked (a false affordance is a lie about interactivity).

#### Accessibility

- Interactive card → focusable, keyboard-activatable, labeled by its content read as a **coherent sentence**
  ("Ethereum, 0.61 ETH, $2,079, up 2.1% today" — §11), not as disconnected fragments.
- The static `.pf-net` hero is **not** a button; its net-worth number is read as one amount, and small white
  labels on the gradient are held ≥ 4.5:1 (the AA layer in `styles.css` drops the light radial for exactly
  this reason).
- Never convey a card's state (stale, provisional, error) by color/motion alone — pair with a glyph + text
  (§11, §12).

#### Do / Don't

- **Do** give every interactive card hover **+** press **+** focus, and a real `role`.
- **Do** use surface **steps** for depth in dark; keep one hairline + one soft shadow in light.
- **Don't** put a hover lift on a non-interactive container — it fakes an affordance.
- **Don't** show `$0` for a failed card read; show the stale/error treatment (Doctrine #3, §7 5-state).
- **Don't** stack two competing elevations or a second colored shadow — the `.pf-net` hero is the *only*
  colored shadow in the system (§5.2).

---

### 7.4 · Section summary — the control contract

1. **Buttons** — one primary per screen (Ch2 Law 2); shipped primary is the `--grad-brand` gradient
   **(drift** vs the flat `accent.base` canon**)**; label persists in loading; **`:focus-visible` and the
   ≥ 44px height are (proposed/drift) fixes**, plus mobile's bare-spinner busy state.
2. **Inputs** — one field shell (`.wl-input`/`Field`) across text/amount/search; focus = accent border +
   halo; error = `--block` border + `.wl-err` text; **amount is a bigint-safe string** rounded honestly;
   **`tabular-nums` on entry, `aria-invalid`/`aria-describedby`, and an explicit `:disabled` are (proposed)**.
3. **Cards** — static container vs. interactive control is the line that matters; interactive cards
   (`.pf-asset`, `.id-row`) must earn their hover with **press + a (proposed) focus ring + keyboard
   reach**; a failed read is a designed stale/error state, **never `$0`**.

Every state above is designed in **light and dark**, keyboard-reachable, AA, and reduced-motion-safe — the
five checks of the Design Review Gate ([`CLAUDE.md`](../../CLAUDE.md) §4) applied to the three controls a
user touches most.


## §8 · The Component Library — Surfaces & Feedback

> *Where §7 documented the controls a user **touches**, §8 documents the surfaces those touches
> **open onto** and the feedback the product **gives back**.* Two families live here: **surfaces**
> (the bottom sheets and modals that hold secondary content — Chapter 2 **Law 4**) and **feedback**
> (charts, and the four honest non-content states — empty, loading, skeleton, error). Both families
> exist to serve one doctrine above all others: **never lie to the user** (CLAUDE.md Doctrine #3;
> Chapter 2 §9 Trust Rules). A sheet must never hide what an action will do; a chart must never draw
> a number that isn't real; a "$0" must never mean "the network failed." This section is the concrete
> system that makes those guarantees buildable pixel-for-pixel.
>
> **Sibling references — read, don't duplicate.** Color roles and the risk scale: **§4**. Depth,
> elevation `e1–e3`, hairlines: **§5**. Motion tokens (`instant/quick/standard/celebrate`, the sheet
> spring) and the `prefers-reduced-motion` contract: **§6**. Buttons, the composer, and in-button
> spinners: **§7**. The AI chat surface and its thinking/streaming states: **§9**. The money-surface
> anatomy (PlanCard, ConfirmSheet, StepTracker) is fixed in `DESIGN_SYSTEM.md` §6.3–§6.5 and is
> *out of scope here* — those are trust boundaries, not generic surfaces.

Everything below is tagged **SHIPPED** (a real class/token in the repo — cited by selector and file)
or **(proposed)** (a gap this spec fills). Haptics are called out as **mobile-only** wherever they
appear. Where web and the token source-of-truth drift, the drift is named and the canon declared
(per the `DESIGN_SYSTEM.md` §13 drift ledger).

---

### 8.1 · Bottom Sheets & Modals — where secondary content lives (Law 4)

Chapter 2 **Law 4** is absolute: *everything secondary belongs inside a Bottom Sheet or Details.*
A screen keeps **one purpose, one primary CTA** (Laws 1–2) by exiling the rest to a sheet. This is
also a trust mechanism — a sheet is a **modal focus boundary**: it dims the world, traps focus, and
returns the user exactly where they were.

#### 8.1.1 · The platform split (state this honestly)

The two apps implement Law 4 with **different primitives**, and the spec must not pretend otherwise:

| Platform | Primitive | Reality | Status |
| --- | --- | --- | --- |
| **Mobile** (`apps/mobile/ui.tsx`) | A true **bottom sheet** — `Sheet()` over RN `<Modal transparent animationType="slide">` | Slides up from the bottom edge, rounded top corners, content scrolls | **SHIPPED** |
| **Web** (`apps/web/src/styles.css`, `App.tsx`) | A **centered dialog** — `.rcv-modal` / `.wl-send-modal` / `.account-menu` with `role="dialog"` | Centers in the viewport; there is **no** `.sheet`/bottom-drawer class on web today | **SHIPPED** (as a modal, not a sheet) |

> **Honesty note.** `DESIGN_SYSTEM.md` §6.10 lists "`.modal/.sheet`" as if both exist on web. The
> repo reality is a **centered `.rcv-modal` dialog** on web — Law 4 is satisfied by *modality*
> (dim + focus-trap + one job), not by bottom-anchored geometry. A bottom-anchored web sheet for
> thumb-reachability on narrow viewports is **(proposed)**, not shipped. Do not document the web
> surface as a bottom sheet.

#### 8.1.2 · Anatomy

**Mobile bottom sheet** (`Sheet`, `ui.tsx`) — top to bottom:

1. **Backdrop** — full-bleed scrim, `rgba(0,0,0,0.6)`, `justifyContent: flex-end` pins the sheet to the bottom.
2. **Sheet container** — `backgroundColor: canvas`, `borderTopLeftRadius / borderTopRightRadius: radius.lg (20)`, `maxHeight: 92%`, hairline (`StyleSheet.hairlineWidth`) `border` in `border`.
3. **Header row** (`sheetHead`) — title (`T.headline`, `text`) on the left, a `Close` `TextButton` on the right; hairline bottom divider; padding `space.base (16)`.
4. **Scroll body** — `ScrollView`, `contentContainerStyle: { padding: space.base, gap: space.md (12) }`, `keyboardShouldPersistTaps="handled"` (a tap on a control inside the sheet does not first dismiss the keyboard).
5. **(proposed) Grabber** — a 36×4 `full`-radius handle in `border.strong`, centered `space.2 (8)` below the top edge, as the visible drag affordance. Not shipped today.

**Web modal** (`.rcv-modal`, `styles.css`) — the concrete dialog shell reused for Receive, Send, Account switcher, Activity, and Import:

1. **Backdrop wrapper** — the dialog's parent; a click on it dismisses (the dialog itself calls `stopPropagation`). A scrim token is **(proposed)** — today the wrapper relies on the shell dimming.
2. **`ModalBack` control** (`.modal-back`) — a persistent top-left back button on every overlay so the user can always step back one level (mirrors Escape / tap-outside, but always visible; `aria-label="Back"`).
3. **Dialog card** — `max-width: 360` (`.rcv-modal`; `.wl-send-modal` 560, `.account-menu` 460), `background: surface`, `border: 1px border.strong`, `border-radius: 16`, `padding: 18`, `box-shadow: 0 20px 60px color-mix(black 30%, transparent)`.
4. **Head** (`.rcv-head`) — title (`.rcv-title`, 16/700) + a close/dismiss affordance.
5. **Body** (`.rcv-body`) — the sheet's actual content, `gap: 10`.

#### 8.1.3 · Tokens

| Token | Mobile sheet | Web modal | Canon (`tokens/index.ts`) |
| --- | --- | --- | --- |
| Backdrop | `rgba(0,0,0,0.6)` **SHIPPED** | wrapper dim; scrim token **(proposed)** | scrim **(proposed)** — spec: `color-mix(black 55%, transparent)` |
| Surface | `bg.canvas` | `bg.surface` | `bg.surface` for sheets/dialogs |
| Top-corner radius | `radius.lg` = **20** | `16` (full card, `.rcv-modal`) | `radius.lg` = **24** |
| Border | hairline `border.subtle` | `1px border.strong` | hairline `border.subtle` |
| Elevation | slide (no shadow needed on scrim) | `0 20px 60px color-mix(black 30%)` ≈ `e3` | `e3` (`0 1px 3px…, 0 12px 28px…`) |
| Max height | `92%` | intrinsic (content-sized) | ≤ `92%` viewport |
| Body padding | `space.base (16)`, gap `space.md (12)` | `18` | 16–20 per §2 |

> **Drift to close (§13).** Sheet top-corner radius is canon **24**, mobile ships **20**, web modal
> ships **16**. When you next touch either surface, move it **toward 24** (the web modal keeps a
> full-card `16` because it is a centered dialog, not a top-anchored sheet — that is a different
> object, not drift). The **backdrop scrim** on web is genuinely missing and should be added as a
> reduced-motion-safe `color-mix(black 55%, transparent)` overlay.

#### 8.1.4 · Behavior — dismiss, focus, backdrop, safe-area

- **Present / dismiss motion.** Mobile uses `animationType="slide"` (RN default). The canon is the
  **sheet spring** from §6 (`mass 1, damping 26, stiffness 300`); replacing the stock slide with the
  spring is **(proposed)**. Under `prefers-reduced-motion` the present/dismiss must degrade to a
  ≤ 150 ms cross-fade (§6) — **(proposed)** on both platforms; the shell honors reduced motion but the
  sheet transition does not yet opt in.
- **Drag-to-dismiss.** Mobile `<Modal>` gives hardware/gesture back via `onRequestClose` (Android
  back button ⇒ `onClose`) **SHIPPED**. A downward **pan-to-dismiss** on the grabber, with a
  velocity threshold and a rubber-band past the top, is **(proposed)**.
- **Focus trap — web is real and correct.** `useDialog()` (`App.tsx`) is the shipped trap: on open it
  focuses the first focusable, **Tab / Shift+Tab wrap** within the dialog, **Escape** calls `onClose`,
  and on unmount **focus is restored to the opener**. This is WCAG 2.2 AA compliant and is the
  reference implementation — every web overlay uses it (`role="dialog"`, `aria-modal="true"`). Mobile
  `<Modal>` traps focus natively.
- **Backdrop.** Tap-outside dismisses (mobile scrim; web wrapper via `stopPropagation` on the card).
  A **money-bearing** sheet (Send, Confirm) must **not** dismiss on backdrop tap — accidental loss of
  a half-entered transaction is a footgun; those require the explicit Close/Back (**(proposed)** to
  enforce; the trust surfaces in §6.4 already gate this).
- **Safe-area.** Mobile bottom padding must clear the home indicator: add `paddingBottom:
  max(space.base, insets.bottom)` to the scroll body. Today the sheet uses a flat `space.base` —
  **(proposed)** to wire `useSafeAreaInsets()`.

#### 8.1.5 · State matrix — Sheet / Modal

| State | Trigger | Visual | Tokens | A11y |
| --- | --- | --- | --- | --- |
| **closed** | default | not mounted | — | — |
| **presenting** | open | slide-up / center-in | `motion.standard 300ms` → sheet spring **(proposed)** | focus moves to first focusable (`useDialog`) |
| **open** | mounted | scrim + card, focus trapped | backdrop `rgba(0,0,0,.6)`; surface `canvas`/`surface` | `role="dialog"`, `aria-modal="true"`, labelled by title |
| **scrolling** | body overflow | header pinned, body scrolls; keyboard persists taps | `maxHeight 92%`, `keyboardShouldPersistTaps` | scroll region reachable |
| **dismissing** | Close / Esc / back / backdrop | slide-down / fade-out | reduced-motion → ≤150ms fade **(proposed)** | focus returns to opener |
| **reduced-motion** | OS pref | cross-fade, no slide | §6 contract **(proposed for the sheet transition)** | unchanged |

---

### 8.2 · Charts — honest data or no data

The product ships exactly **two** chart primitives, and both are deliberately minimal — a wallet is
not a trading terminal (Chapter 2 §5: *Minimal · Trustworthy · Invisible*). The governing rule is
Doctrine #3: **a chart may only draw data that is real.** No projected lines, no smoothed-over gaps,
no borrowed demo series.

#### 8.2.1 · Sparkline — the price/value trend line

**SHIPPED on mobile** (`Sparkline`, `ui.tsx`); **not present on web** (state this — the web Home has
no sparkline; the web allocation view uses horizontal bars, §8.2.2). Do not document a web sparkline.

- **Render.** An SVG `<Polyline>`, `fill: none`, `stroke: accent` (or a caller-supplied color from
  §4's asset-brand set — brand colors are legal *only* inside sparklines and asset icons, never for
  text/state), `strokeWidth: 2`, round join + cap. Default `220 × 44`.
- **Normalization.** `min/max` over the series; y is padded by `height − 4` and offset `2` so the
  extremes never clip the stroke box.
- **The honest-empty rule (the important one).** `if (data.length < 2) return <View style={{width,
  height}} />` — with fewer than two real points it renders an **empty box, not a flat or invented
  line.** A single reading is not a trend, so we draw nothing. This is the sparkline's version of
  "network-fail ≠ $0."

#### 8.2.2 · Allocation — the portfolio breakdown

Two shipped renderings, one per platform, both fed only by real holdings:

- **Web — horizontal allocation bars** (`.ins-alloc` / `.ins-slice`, `styles.css`). A `56px 1fr 40px`
  grid per slice: label (`.ins-slice-k`, weight 650) · track (`.ins-slice-bar`, `height 8`,
  `radius 999`, `background: surface2`, `overflow: hidden`) · weight % (`.ins-slice-w`, right-aligned,
  `text.secondary`). The fill (`.ins-slice-fill`) is `background: accent` at `width: max(2%,
  weight × 100%)` — the **2% floor** guarantees a tiny holding is still visibly drawn rather than
  vanishing (honest: a nonzero position is never invisible). **One accent** for every bar (§4's
  one-accent law), not a rainbow. Native hover tooltip via `title={usd(valueMicros)}`.
- **Mobile — allocation ring** (`AllocationRing`, `ui.tsx`). A stacked-stroke donut: a track
  `<Circle stroke=surface2 strokeWidth=14>` under per-slice `<Circle>`s using `strokeDasharray`
  (`${dash} ${circ − dash}`) + `strokeDashoffset`, each rotated `-90°`, `strokeLinecap: butt`.
  Default `size 120`, `stroke 14`; weights are **normalized by their own total** (they need not sum
  to 1). Slice colors are caller-supplied (§4 asset-brand set).

> **Cross-platform note.** Web draws allocation with a **single accent** (calm, monochrome bars);
> mobile draws it with **per-slice brand colors** (a ring reads better colored). Both are legitimate
> under §4 — the accent bar is the more conservative default and is what a new *web* allocation view
> should copy. A colored web ring is **(proposed)**, not required.

#### 8.2.3 · Honest-data rules — the chart half of Doctrine #3

Charts inherit the **five-state contract** (`DESIGN_SYSTEM.md` §7) and the honesty invariant. The
Insights surface (`InsightsPanel`, `App.tsx`) is the reference:

- **Stale.** A `.ins-stale` badge — "some data stale" — renders when `intel.stale`: `11px/600`,
  `color: warn`, `1px border color-mix(warn 40%, transparent)`, `radius 999`, `padding 2px 8px`. The
  data still shows; it is **labelled**, never hidden.
- **Trust gate (network-fail ≠ wrong-number).** `InsightsPanel` fetches the engine's computed net
  worth *and* the wallet's real on-chain net worth, and **renders only if they agree** —
  `Math.abs(intelUsd − realUsd) ≤ max(1, realUsd × 0.02)`; otherwise `return null`. Borrowed or
  other-principal figures are **never** shown as the user's. This is the doctrine expressed as a guard.
- **Partial read.** When some balances load and others fail, the total is annotated and the delta/
  change pill is suppressed — a partial total is never presented as complete (see §8.3).
- **Empty.** Fewer than two points ⇒ empty sparkline; zero holdings ⇒ the empty state (§8.3.1), not a
  zero-height chart.

#### 8.2.4 · Axis, tooltip, color

- **Axis.** Both primitives are **axis-less** by design (a sparkline/ring shows *shape*, not exact
  reads — the exact numbers live in the adjacent rows). A labelled axis is **(proposed)** and only for
  a future full-history chart, never for the trend glyph.
- **Tooltip.** Web slices expose value on `title` hover (native). A styled tooltip using `e3` +
  `radius.sm` is **(proposed)**; on touch there is no hover, so the number must also be present as
  visible text (it is — `.ins-slice-w`).
- **Color.** Sparkline/ring stroke = `accent` or the §4 **asset-brand** palette (brand colors are
  *scoped to charts and icons*); the track is always `surface2`. Never encode meaning by chart color
  alone — the label + percentage carry it (WCAG, §11).

#### 8.2.5 · A11y — the chart alternative

Per `DESIGN_SYSTEM.md` §11, **every chart has a data-table read-out**. The allocation bars already
pair each slice with a text label + percentage (a de-facto table). The sparkline is decorative and
**must** be `importantForAccessibility="no"` / `aria-hidden`, with the trend summarized in the
adjacent labelled value ("up 2.1% today") — **(proposed)** to add the explicit `sr-only` sentence on
the sparkline container.

#### 8.2.6 · State matrix — Charts

| State | Sparkline (mobile) | Allocation (web bars / mobile ring) | Tokens |
| --- | --- | --- | --- |
| **default** | polyline, `stroke accent`, w2 | bars fill `accent` / ring per-slice colors | `accent`, `surface2` track |
| **empty** | `< 2 pts` → empty box (no line) | no slices → empty state (§8.3.1) | — |
| **partial** | draws only real points; no interpolation | total annotated, change pill hidden | `.ub-note` warn tint |
| **stale** | shown + `.ins-stale` label near it | shown + "some data stale" badge | `warn`, `color-mix(warn 40%)` |
| **network-fail** | not drawn; error state owns the region | `InsightsPanel` returns null (trust gate) | — (error state, §8.3.4) |
| **reduced-motion** | no draw-on animation | fills static (no grow) | §6 |

---

### 8.3 · The four honest non-content states — as a system

This is the heart of the section. Empty, Loading, Skeleton, and Error are not four unrelated
placeholders — they are **one honesty system** enforced by a real state machine. The reference is the
**five-way balance derivation** in `apps/mobile/ScreenPortfolio.tsx` (mirrored on Home and in the web
`LiveBalancesPanel`), which proves the doctrine that *a network failure is not "$0."*

**The balance state matrix (SHIPPED, `ScreenPortfolio.tsx`):**

| Derived state | Condition | What renders | Why it is distinct |
| --- | --- | --- | --- |
| **loading** | `data === undefined` (first read) | Skeleton (§8.3.3) | not yet known ≠ known-zero |
| **errored** | `data === null` **or every read failed** | "Couldn't reach the network" + **Retry** | a failed read is **not** a balance |
| **funded** | `hasFunds` | balances; `degradedNote` if `!trustworthy` | real money, possibly partial |
| **emptyGenuine** | reads OK **and** truly zero | "No holdings yet" (§8.3.1) | a real, verified zero |
| **partialEmpty** | some reads failed, the rest zero | "Some balances unavailable" + **Retry** | can't claim zero if we didn't read everything |

The four visual states below are the **rendering** of that machine. The cardinal rule threads all of
them: **`errored` and `partialEmpty` must never look like `emptyGenuine`.** A user whose RPC hiccuped
must never read "No holdings yet."

#### 8.3.1 · Empty states — informative & actionable

Empty ≠ error. Tone is **inviting**, and the anatomy is fixed (`DESIGN_SYSTEM.md` §6.10): **one glyph,
one sentence, exactly ONE primary CTA.**

- **Web full empty** (`.ai-empty`, `styles.css`): `flex` column, centered, `gap 10`, `padding 60px
  20px`, `text-align: center`, `color: text.secondary`. Glyph `.ai-empty-spark` `40×40` in `accent`;
  heading `.ai-empty-h` `18px/620` in `text.primary`; body `.ai-empty-sub` `max-width: 44ch`, `14px`,
  `text.secondary`. **SHIPPED.**
- **Web inline empty** (`.sect-empty`): the lightweight variant — `color: text.secondary`, `14px` —
  for an empty section (e.g. no recent activity) that doesn't warrant the full centered treatment.
- **Mobile empty** (`ScreenPortfolio.tsx`, `empty` card): `Card`, centered, `paddingVertical:
  space.xl (32)`, `gap: space.xs (4)`; `emptyTitle` (`T.headline`, `text`) + `emptyBody` (`T.body`,
  `text2`, centered). Copy: **"No holdings yet" / "Fund an address to see your portfolio."** **SHIPPED.**

> **Drift to close.** Canon empty-state glyph is **48** (§6.10, §8 iconography); web `.ai-empty-spark`
> ships **40**. Move to 48 when next touched. The single-CTA rule is honored (the empty state offers
> exactly one path forward — fund / start an intent).

**Empty state matrix**

| State | Glyph | Copy | CTA | Tokens |
| --- | --- | --- | --- | --- |
| **empty (full)** | 40 spark (→48) `accent` | heading + one sentence | exactly one primary | `.ai-empty*`, `accent`, `text` / `text.secondary` |
| **empty (inline)** | none | one line | contextual | `.sect-empty`, `text.secondary` 14px |
| **empty (mobile)** | none (title-led) | "No holdings yet" | Receive / fund | `T.headline`, `T.body`, `text2` |
| **must-not-be** | — | never "$0" for a failed read | — | (that is the **error** state, §8.3.4) |

#### 8.3.2 · Loading states — spinner / progress + the single-announcement rule

**When to use which** (from the five-state contract, §7 of `DESIGN_SYSTEM.md`):

- **Skeleton** for content with a known final layout (net worth, asset rows) — §8.3.3.
- **Spinner** **only inside a button or a small refresh control** — never as a full-screen page
  spinner (a blank page that spins is the anti-pattern the skeleton exists to kill).
- **Progress** (determinate) for the hold-to-confirm ring and the execution timeline — those live in
  §7 / §6.5, not here.

**Shipped loading affordances:**

- Web in-button / refresh spinner: `@keyframes spin { to { transform: rotate(360deg) } }`
  (`styles.css`). The net-worth **refresh** control (`.lb-refresh`) swaps its glyph `↻ → …` and sets
  `aria-busy={loading}` — it does **not** replace the number with a spinner (the skeleton does that).
- The AI "thinking" bubble (`.bubble.ai.thinking`, `role="status"`, `aria-live="polite"`) is the chat
  surface's loading state — documented in **§9**, not here.

**The single-announcement a11y rule (this is the load-bearing part).** A loading region announces
itself **once**, at the wrapper — never once per skeleton bar (which would spam a screen reader with
"loading, loading, loading…").

- **Mobile** (`ScreenHome.tsx`): the hero wrapper carries `accessible accessibilityLabel="Loading
  your balance" accessibilityState={{ busy: true }}`; every child `Skeleton` is
  `importantForAccessibility="no"`. The comment in code is explicit: *"the loading wrapper carries the
  single busy announcement."* **SHIPPED.**
- **Web** (`App.tsx`): the refresh button carries `aria-busy`; the net-worth skeleton carries one
  `aria-label="Loading net worth"`. One region, one announcement. **SHIPPED.**

**Loading state matrix**

| Surface | Affordance | Announcement | Tokens |
| --- | --- | --- | --- |
| net worth (first load) | skeleton (§8.3.3) | **one** wrapper `busy` / `aria-label` | `surface2`, shimmer |
| refresh (has data) | glyph `↻→…`, `aria-busy` | `aria-busy` on the control | `.lb-refresh` |
| in-button (§7) | spinner, **label stays** ("Approving…") | button announces "in progress" | `@keyframes spin` |
| page / section | **never** a bare full-screen spinner | — | use skeleton instead |
| reduced-motion | shimmer/spin off; static dim | unchanged | §6 |

#### 8.3.3 · Skeleton screens — when skeleton, shimmer, reduced-motion

A skeleton is the honest "known layout, unknown value" state: it matches the final layout within
100 ms so content **fades in place** rather than blank→pop (§7 contract).

- **Web** (`.skeleton`, `styles.css`): `position: relative`, `overflow: hidden`, `background:
  surface2`, `border-radius: 8`, `color: transparent !important` (so any placeholder text is invisible
  but occupies real space). The shimmer is a `::after` sweep — `linear-gradient(90deg, transparent,
  color-mix(text.tertiary 20%, transparent), transparent)`, `translateX(-100%)`, `animation: shimmer
  1.3s infinite` (`@keyframes shimmer { 100% { transform: translateX(100%) } }`). **SHIPPED.**
- **The hero variant** (`.sk-nw`): `128 × 34`, `radius 10`, `background: rgba(255,255,255,0.22)` with a
  white-tint sweep (`rgba(255,255,255,0.28)`) — because the net-worth skeleton sits **on the accent
  gradient wash**, a neutral `surface2` skeleton would be invisible there. This is a real,
  intentional token override, not drift.
- **Mobile** (`Skeleton`, `ScreenHome.tsx`): an `Animated` opacity **pulse** `0.35 ↔ 0.8`, `750 ms`
  each direction, `borderRadius: radius.sm (10)`, `background: surface2`. (Mobile pulses opacity;
  web sweeps a gradient — both read as "loading.") **SHIPPED.**

**Reduced-motion (a hard §6 gate, SHIPPED both platforms):**

- Web: `@media (prefers-reduced-motion: reduce) { .skeleton::after { animation: none } }` — the box
  stays, the shimmer stops.
- Mobile: `AccessibilityInfo.isReduceMotionEnabled()` → the pulse is replaced by a **static
  `opacity: 0.5`**; the animation loop never starts.

**Skeleton state matrix**

| State | Web | Mobile | Reduced-motion |
| --- | --- | --- | --- |
| **default (on canvas)** | `surface2`, radius 8, shimmer 1.3s | `surface2`, radius 10, pulse 0.35↔0.8 @750ms | box only / static 0.5 |
| **on accent wash** | `.sk-nw` white-tint (0.22 / sweep 0.28) | white-tint variant **(proposed)** | box only |
| **content arrives** | fade content in place (no pop) | fade/opacity settle | instant swap |
| **a11y** | `aria-label` on region (once) | wrapper `busy`; children `importantForAccessibility="no"` | unchanged |

#### 8.3.4 · Error states — network vs genuine-zero, and retry

The error state is where the honesty doctrine is most easily violated and most carefully defended.
Two shipped truths:

**1 · A network error is calm, not catastrophic — and it is NOT red.** Red (`danger` / `--block`) is
reserved for **risk and validation failure**, not a transient RPC hiccup. The degraded-read note uses
**amber/warn**, and the retry action uses the **accent** primary — the message is "this is a display
issue, your funds are safe," not "something is wrong with your money."

- **Web degraded note** (`.ub-note`, `styles.css`): `border: 1px color-mix(warn 40%, border)`,
  `background: color-mix(warn 10%, transparent)`, `color: text.secondary`, `radius 11`, `padding 11px
  13px`, `role="alert"`. Copy: *"Couldn't reach the balance service just now (…). Your funds are safe
  — try Refresh."* Partial: *"⚠ {X} and {Y} couldn't be reached — the total excludes …"* **SHIPPED.**
- **Web field/validation error** (`.wl-err`, `role="alert"`): `color: --block` (danger), `12.5px` —
  this **is** red, because it marks a genuine input/action failure, not a network read. The two are
  deliberately different colors. **SHIPPED.**
- **Mobile error card** (`ScreenPortfolio.tsx`): `stateTitle` (`T.title`, `text` — **neutral, not
  red**) + `stateBody` (`T.body`, `text2`) + `retry` (`background: accent`, `radius.md (14)`,
  `paddingVertical: space.md`). Copy: *"Couldn't reach the network" / "We couldn't read your
  balances. Your funds are safe — this is only a display issue."* + **Retry**. **SHIPPED.**

**2 · Network-fail, partial, and genuine-zero are three different screens.**

| Case | Copy | Action | Distinct from |
| --- | --- | --- | --- |
| **network-fail** (every read failed) | "Couldn't reach the network" | **Retry** (accent) | genuine-zero — never "No holdings" |
| **partial** (some reads failed) | "Some balances unavailable" / total annotated | **Retry**; change pill hidden | funded-complete — never a confident total |
| **genuine-zero** (reads OK) | "No holdings yet" | Fund / Receive | error — inviting, not alarmed |

**Retry rules (SHIPPED):** error copy is plain-language (raw codes go under "Details", never in the
face); the state distinguishes **retryable** (network — offers Retry) from **terminal** (offers the
next real action, not a dead Retry). Auto-execute never auto-retries a failed authorize/execute —
`autoExecTriedRef` fires once; the manual button reappears so the user retries **deliberately**
(`App.tsx` — "we do NOT auto-retry (that would spin the RPC forever)").

**Error state matrix**

| State | Color family | Anatomy | Retry | A11y |
| --- | --- | --- | --- | --- |
| **network-fail** | neutral card + accent CTA | title (neutral) + body + Retry | yes (accent) | card focusable; button labelled "Retry loading balances" |
| **partial-read** | **warn** tint (`.ub-note`) | inline note + annotated total | yes; pill hidden | `role="alert"` |
| **validation/action fail** | **danger** (`.wl-err` `--block`) | inline red line | contextual | `role="alert"` |
| **terminal** | neutral | plain reason + next action (not Retry) | no | — |
| **offline** (proposed) | neutral banner | global "You're offline"; money actions pre-disabled | — | live-region announce |

---

### 8.4 · Acceptance checklist — the Design Review Gate for surfaces & feedback

No surface/feedback component is "done" until all five pass (`CLAUDE.md` §4, `DESIGN_SYSTEM.md` §6):

1. **Product** — the sheet holds only *secondary* content (Law 4); the chart draws only *real* data; a
   state exists for every reality (loading/empty/error/partial/stale), not just the happy path.
2. **UX** — empty is inviting with exactly one CTA; error is calm ("funds are safe"), retryable-vs-
   terminal is clear; **network-fail never looks like genuine-zero**; a partial total is never shown
   as complete.
3. **Security / honesty** — no fabricated chart, no borrowed demo series, no "$0" for a failed read;
   the Insights trust gate (`agreesWithReal`) or an equivalent guards any number that could be wrong.
4. **Performance** — skeleton within 100 ms; sheet present ≤ 300 ms and never blocks input; no
   unbounded shimmer/pulse work off-screen.
5. **Accessibility** — sheet traps focus (`useDialog`) and restores it; **one** loading announcement
   per region; charts have a text read-out; shimmer/pulse/slide honor `prefers-reduced-motion`; error
   uses `role="alert"`, targets ≥ 44×44.

> A surface that lies — a sheet that hides an effect, a chart that invents a line, a "$0" that was
> really a timeout — fails the gate even if it renders perfectly. In this wallet, the honest error
> state **is** the product working correctly.


## §9 · The AI Chat UI

*The signature screen — where "talk to your money" stops being a tagline and becomes a surface you can
touch.* Chapter 2 Rule 2 is absolute: **the AI is the primary interface, not a feature in a tab** — Home is
AI, Portfolio second, Settings last. This section is where §1–§8 combine: the tokens (§1), the 8px rhythm
(§2), the type scale (§3), the color roles (§4), the depth (§5), the motion (§6), the controls (§7), and the
surfaces & feedback (§8) all converge into one flow — *sentence in, proven outcome out*. It is also where
the Doctrine becomes visible: **AI proposes, deterministic code verifies, the device signature disposes**
(CLAUDE.md #2), and **explain every decision — never "best route selected"** (Ch2 Rule 4). The AI here does
not chat; it *shows its work* and then gets out of the way of a signature.

This section owns the conversational surface end-to-end: the composer, the conversation, the **PlanCard**
(the plan → risk → cost → min-received presentation), the RiskBadge, the execution timeline, the
thinking/loading states, the 5xx error path, and the mainnet real-funds treatment. Controls' full visual
state matrices live in §7, generic surfaces & feedback in §8, motion tokens in §6 — referenced here, not
re-derived. Every component below separates **shipped** (a real class in
[`apps/web/src/styles.css`](../../apps/web/src/styles.css) + a real element in
[`apps/web/src/App.tsx`](../../apps/web/src/App.tsx)) from **(proposed)** (a gap this spec fills). Where
the shipped web drifts from the canon, it is named as drift with the canonical fix — never smoothed over.

---

### 9.1 · The shape of the surface

The AI surface is **two entry points into one conversation**, both shipped:

1. **The Home hero composer** (`.hv-ai` + `.hv-examples`) — a single input on the Home screen ("Home =
   AI", Ch2 Rule 2). Submitting it calls `submit()`, which does `setSection('ai')` and pushes the first
   turn — the intent *becomes* the conversation. It is a launch pad, not a second inbox.
2. **The AI section** (`.hv.ai-sec`) — a full-height column: a scrolling **`.feed`** on top, a **sticky
   `.composer`** pinned to the bottom. This is the ChatGPT-shaped home of the product.

```
.ai-sec  (flex column, min-height 100%)
├── .feed            ← flex:1 1 auto — the conversation scrolls here
│   ├── ActivityPanel (session receipts, when present)
│   └── .turn ×N     ← one per intent
└── .composer        ← position: sticky; bottom: 0 — always reachable
    ├── form (pill: input + .btn.send)
    ├── .examples    ← seed chips
    └── .composer-note ← the doctrine line
```

**The load-bearing honesty stance of the whole surface:** *the AI never emits free-text prose into the
conversation.* There is exactly **one** transient AI chat bubble — the "Planning…" thinking indicator
(§9.4). Every real AI "response" renders as a **structured, deterministic card** (`OutcomeView` → PlanFlow /
clarify / answer / automation / rejected), never as chatter. This is doctrine, not stylistic preference: a
verifiable plan card can be checked by the risk/policy gate and read top-to-bottom before a signature; a
paragraph of model prose cannot. The AI's voice is **Professional · Calm · Clear · Confident** (Ch2 §4) and
it speaks in *outcomes*, not opinions.

---

### 9.2 · The Composer — the front door `(.composer)`

The intent input is the product's front door (DESIGN_SYSTEM §6.2). It is a full-width **pill**, sticky to
the bottom, floating over a canvas-fade so the conversation scrolls *under* it rather than colliding with
it.

#### Shipped tokens

| Property | Value (shipped) | Token / note |
| --- | --- | --- |
| container fade | `linear-gradient(to top, var(--canvas) 72%, transparent)` | scroll-under mask; padding `14px 0 18px` |
| form fill | `var(--surface)` | `#FFFFFF` L / `#141418` D |
| form border | `1px solid var(--border-strong)` | `#DBDBE1` L / `#34343D` D |
| form radius | `999px` (`radius.full`) | pill — never a boxy input |
| form padding | `6px 6px 6px 18px` | asymmetric: text breathes left, button hugs right |
| form shadow | `var(--shadow)` | effective value — the later `.composer form` rule (styles.css ~L1862) overrides the initial `--shadow-lg` |
| input font | `15px`, `color: var(--text)` | matches web body (`--text` = `#17171B` L / `#F4F4F6` D) |
| placeholder | `var(--text-3)`, `opacity: 1` | AA-safe: web `--text-3` = `#6E6E79` L (≈4.9:1), not the canon AA-large `text.tertiary` |
| transition | `border-color 0.16s var(--ease), box-shadow 0.2s var(--ease)` | `--ease` = `cubic-bezier(0.22,1,0.36,1)` |

**Placeholder copy (shipped):** `"Type naturally… e.g. Swap 100 USDC for ETH"` (AI section) and
`"Ask AI… e.g. Swap 100 USDC for ETH"` (Home hero). It is *obviously* a placeholder, never a borrowed demo
balance (DESIGN_SYSTEM §12). The rotating-placeholder concept from DESIGN_SYSTEM §6.2 is **(proposed)** —
today the placeholder is static.

**Send control** — `.btn.send`: a **40×40** circular icon button, `background: var(--accent)`,
`color: var(--on-accent)`, `font-size: 19px`, glyph `↑`. `flex: none` so it never squeezes the input. It is
`disabled` whenever `loading || !utterance.trim()` — you cannot fire an empty intent, and you cannot
double-fire while one is in flight.

#### Composer state matrix

| State | Trigger | Treatment (tokens) | Light / Dark |
| --- | --- | --- | --- |
| **idle** | no focus, empty | pill: surface + `border-strong` + `--shadow`; send disabled (opacity 0.5) | both designed |
| **focus-within** | caret in input | `form:focus-within` → `border-color: var(--accent)` **+ `box-shadow: 0 0 0 3px var(--accent-subtle)`** (the focus halo); input `outline: none` (pill carries focus) | accent `#4F46E5`/halo `#EEF0FE` L · `#7C74FF`/`#201F42` D |
| **typed** | `utterance.trim()` non-empty | send enabled → full accent fill; hover `:hover:not(:disabled)` → `--accent-press` (`#4338CA` L / `#6A62F0` D) | both |
| **pressed** | active on send | inherits `.btn` `transform: translateY(1px)` on `:active` (~50 ms) | both |
| **loading** | `submit()` in flight | send glyph `↑` is **replaced by `<span className="spin">`** — legitimate because the send is an *icon* button with no text label to lose (DESIGN_SYSTEM §14 protects *labeled* buttons); input stays editable but a re-submit is blocked by `loading` guard | both |
| **disabled** | empty or loading | `opacity: 0.5`, no pointer events | both |

> **`:focus-visible` gap (proposed).** The pill uses `:focus-within` for the input, which is correct. But
> `.btn.send` and the seed chips (`.ex`) currently fall back to the UA default outline — the **designed** 2px
> `accent.base` + `color-mix(accent 20%, transparent)` halo mandated by DESIGN_SYSTEM §11 is not yet applied
> to the chat controls. Ship a single token-driven `:focus-visible` ring across `.btn.send` / `.ex` /
> `.btn.primary` to close this. **(proposed)**

#### Seed suggestion chips `(.examples / .ex)`

Below the pill sits a fixed row of **four** seed intents (`EXAMPLES` in App.tsx) — the "what can I even say?"
answer, one tap away:

| Seed (shipped) | Prompt |
| --- | --- |
| `🔄 Swap 100 USDC for ETH` | `Swap 100 USDC for ETH` |
| `💸 Send 0.1 ETH` | `Send 0.1 ETH to 0x1111…1111` |
| `⚖️ Rebalance to stablecoins` | `Move everything to stablecoins` |
| `🌱 Stake 1 ETH` | `Stake 1 ETH` |

`.ex` chip: inline-flex, `font-size: 13px`, `color: var(--text-2)`, `background: var(--surface)`,
`border: 1px solid var(--border)`, `border-radius: 999px`, `padding: 7px 13px`.

| Chip state | Treatment |
| --- | --- |
| **default** | text-2 label on surface, subtle border |
| **hover** | `:hover:not(:disabled)` → `border-color: var(--accent)`, `color: var(--accent)`, `background: var(--accent-subtle)` |
| **disabled** | while `loading` → `opacity: 0.5`, no pointer events |

> **Chip drift vs canon (proposed).** DESIGN_SYSTEM §6.2 specifies **max 3, context-aware** suggestions.
> Shipped is **4 static** seeds. Context-aware chips (surfaced from the user's real holdings, capped at 3)
> are **(proposed)** — but note the doctrine constraint: a suggestion must never imply a capability or a
> balance the wallet cannot back (DESIGN_SYSTEM §12).

**Composer note (shipped):** `.composer-note`, `11.5px`, `text-3`, centered:
*"Non-custodial · AI proposes, deterministic code verifies, the device signature disposes."* — the doctrine,
worn on the face of the front door.

**Proposed composer states** (named in DESIGN_SYSTEM §6.2, not yet shipped — do **not** depict them as
present): **listening** (voice waveform + live transcript), **thinking-border** (1.2 s shimmer border on the
pill), and **degraded** (LLM down → placeholder becomes "Try: Send · Swap · Receive", chips open the
deterministic forms). The degraded state is the important one: it is how the composer stays honest when the
model is unreachable — the wallet must never *look* broken because the AI edge is down (§9.9).

---

### 9.3 · The Conversation `(.feed / .turn / .bubble)`

The feed is a vertical column, `gap: 22px`, each intent a **`.turn`** (`gap: 10px`). A turn is modeled as
`{ q, res?, error?, pending? }` and renders exactly one of three outcomes.

#### The user bubble `(.bubble.you)`

The user's literal utterance, echoed back so the conversation reads as a dialogue.

| Property | Value |
| --- | --- |
| max-width | `82%` (never full-bleed) |
| padding / radius | `11px 15px` / `16px`, with `border-bottom-right-radius: 6px` (the "tail" toward the sender) |
| align / fill | `align-self: flex-end`; `background: var(--accent)`; `color: var(--on-accent)` |
| font | `14.5px` |
| entrance | `animation: rise 0.35s ease both` (opacity + 8px translateY) |

#### The AI "message" — a card, not a bubble

There is no `.bubble.ai` prose. The AI's response is `OutcomeView`, which switches on `outcome.kind`:

| `outcome.kind` | Renders | Class |
| --- | --- | --- |
| `plan` | **PlanFlow** — the signature card (§9.4) | `.flow.card` |
| `clarify` | "Needs a detail" + question + option chips | `.card.info` + `.chips`/`.chip` |
| `answer` | a plain answer to a question | `.card.info` + `.flow-lead` |
| `automation` | "This becomes a recurring rule" | `.card.info` |
| `rejected` | "Not possible" + reason + risk reasons | `.card.rejected` |

The one exception — the **thinking bubble** (`turn.pending === true`):

```jsx
<div className="bubble ai thinking" role="status" aria-live="polite">
  <span className="typing" aria-hidden="true"><i/><i/><i/></span>
  Planning…
</div>
```

`.bubble.ai`: `align-self: flex-start`, `background: var(--surface2)`, `color: var(--text-2)`,
`border: 1px solid var(--border)`, `border-bottom-left-radius: 6px`. The `.typing` dots are three `6px`
`--text-3` circles running `animation: blink 1.2s infinite ease-in-out`, staggered `0.2s` / `0.4s`. The
dots are `aria-hidden`; the spoken signal is the `role="status"` region announcing *"Planning…"* once —
motion is never the sole channel (§9.12).

#### Conversation state matrix

| State | Condition | Treatment |
| --- | --- | --- |
| **empty** | `turns.length === 0` (`started === false`) | `.ai-empty`: one `40px` accent sparkle glyph + `.ai-empty-h` "Ask your wallet anything" (`18px`/620) + `.ai-empty-sub` (max-width `44ch`) example phrasings. One glyph, one line, invites — exactly the EmptyState contract (DESIGN_SYSTEM §7). |
| **pending** | `turn.pending` | user bubble + the `.bubble.ai.thinking` "Planning…" indicator |
| **resolved** | `turn.res` | user bubble + `OutcomeView` card |
| **error** | `turn.error` | user bubble + `.card.rejected` with the plain-language message (§9.9) |

**Scroll behavior (shipped):** a `feedRef` sentinel `div` at the tail is `scrollIntoView({ behavior:
'smooth', block: 'end' })`-ed on new turns; under `prefers-reduced-motion` the browser honors the reduced
setting. New turns arrive at the bottom, the composer stays pinned, the eye stays where the action is.

---

### 9.4 · The PlanCard `(.flow / .stages / .cost)` — the differentiator

This is the flagship of the flagship: the AI **showing its work**. It has a **fixed anatomy** — recognition
is safety (DESIGN_SYSTEM §6.3), so the order never changes. Rendered by `PlanFlow` as `.flow.card`.

```
.flow.card
├── .flow-top      → .kind pill  +  [⚡ AUTO]?  +  RiskBadge
├── .flow-lead     → the confirmation sentence (with LIVE min-received substituted)
├── .flow-reasoning→ 🧠 "N steps · <risk> · ~$fee network fee · ~N min"   ← shows its work
├── .stages        → the six-stage timeline (0–3 reasoning, 4 authorize, 5 execute)
├── .flow-actions  → the primary CTA for the current phase
├── .mn-confirm?   → mainnet real-funds alertdialog (§9.10)
├── .err-line?     → honest execution error (§9.9)
└── .flow-foot     → mono: "plan <id> · real signing in your browser … → <chain>"
```

#### Header `(.flow-top)`

- **`.kind`** — an uppercase pill (`12px`/650, `color: var(--accent)`, `background: var(--accent-subtle)`,
  radius `999px`): the intent class (`Swap`, `Send`, `Stake`), title-cased. It labels *what this is* before
  any number is read.
- **`⚡ AUTO`** — shown only when `getTxMode() === 'auto'`; a small accent flag that this plan may drive
  itself within caps. Honest disclosure of an automation policy, never a hidden mode.
- **RiskBadge** — §9.5.

#### Lead + reasoning — the "explain every decision" rule, made visual

`.flow-lead` (`16px`/550) is the plan's confirmation sentence. `.flow-reasoning` (`13px`/text-2) is the
one-line rationale: `🧠 {steps · risk · fee · eta}`. This is the concrete answer to Ch2 Rule 4 — the AI
does **not** say "Best route selected"; it states step count, risk verdict, network fee, and ETA, and the
stages below expand each into evidence.

> **The live-quote consistency rule (shipped, critical).** For a real swap, `.flow-lead` does **not** show
> the plan-time estimate. It string-replaces the confirmation's `"to at least X"` with the **live on-chain
> quote** (`minOutDisplay` from the actual `quoteSwap()` that will be signed). The *same* live minimum
> appears in the lead, in the cost grid's "You receive (min)", and in the execute stage's slippage floor.
> The number the user reads is the number that will be enforced on-chain — one truth, three places, never a
> thin-pool estimate that drifts from reality.

#### The stages timeline `(.stages / .stage)`

Six stages. **Stages 0–3 render `state="done"` on mount** — the plan was computed before the card
appeared, so its reasoning is presented as a *completed* audit trail, not a fake live crawl. Only **4
(Authorize)** and **5 (Execute)** are live, interactive gates whose state advances with the user.

| # | Icon | Title | State | Content (shipped) |
| --- | --- | --- | --- | --- |
| 0 | `✦` | Understood your intent | `done` | "Parsed as a **{kind}** on {chain}." |
| 1 | `🛡` | Security checked | `done` | `plan.risk.reasons` as a `.reasons` list, or "No threats flagged by the risk engine." + a `.stepup` warning when `requiresStepUp` |
| 2 | `🧭` | Best route | `done` | **RouteGraph** (`.route`) |
| 3 | `⛽` | Estimated cost | `done` | **Cost grid** (`.cost`) |
| 4 | `🔐` | Authorize (Risk + Policy) | `authzState` | AuthzView, or "Checking risk & policy…", or "Not yet authorized…" (§9.6) |
| 5 | `🚀` | Execute (sign → broadcast → confirm) | `execState` | terminal receipt / "Signing…" / ready-state (§9.7) |

`.stage` is a `30px / 1fr` grid with a `.stage-rail` (a `26px` `.stage-dot` + a connecting `2px` rail
`::after` that hides on `:last-child`). Stages stagger in: `animation: rise 0.45s ease both` with
`animation-delay: calc(var(--i) * 90ms)`.

| Stage state | `.stage-dot` treatment | Tokens |
| --- | --- | --- |
| `done` | `background: var(--low-bg)`, `border-color: color-mix(low 45%, transparent)`, `color: var(--low)`, glyph `✓` | low `#0F7A45`/`#E6F6EE` L · `#34C77B`/`#0E2B1D` D |
| `active` | `background: var(--accent-subtle)`, `border-color: var(--accent)`, `color: var(--accent)`, `animation: pulse 1.4s infinite` | accent subtle |
| `pending` | `.stage-pending { opacity: 0.55 }` | dimmed, honest "not yet" |

#### RouteGraph `(.route / .route-node)`

The route as a horizontal, wrapping graph of nodes joined by `→` (`.route-arrow`, text-3). Each
`.route-node` is a bordered surface pill; the terminal **asset** node (`.route-node.asset`) is tinted
`accent-subtle` with an accent label — the destination stands out. Segments stagger:
`animation-delay: calc(var(--i) * 80ms + 120ms)`. This is Ch2 Rule 3 in action — the *route* is the earned
complexity, shown because the AI is proving the plan, not because the user must operate it.

#### Cost grid `(.cost / .cost-k / .cost-v)`

A responsive grid — `grid-template-columns: repeat(auto-fit, minmax(110px, 1fr))`, `gap: 12px 16px`. Each
cell is a `.cost-k` label (`11px` uppercase, text-3) over a `.cost-v` value (`15px`/600). Shipped fields:

| Field | Value source | Rounding rule |
| --- | --- | --- |
| **You send** | `usd(quote.youSend.valueMicros)` or the bare symbol when unpriced | rounds **up** (never flatter what you commit — DESIGN_SYSTEM §6.7) |
| **You receive (min)** | live `minOutDisplay` when a swap quote exists, else `youReceiveMin.symbol` | rounds **down** |
| **Network fee** | `usd(quote.totalFeeMicros)` | — |
| **Slippage** | `(quote.slippageBps / 100).toFixed(2)%` | — |
| **ETA** | `~{max(1, round(etaSeconds/60))} min` | — |

Numbers must be `tabular-nums` (DESIGN_SYSTEM §3) so they never jitter as the live quote ticks.

> **PlanCard states not yet shipped (proposed).** DESIGN_SYSTEM §6.3 specifies an **expiry ring** (30 s
> countdown on the CTA), **expiring** (< 10 s → amber ring), **expired** (dim + "Get new quote"), and
> **re-quoted-worse / better** highlight states. The web PlanFlow refreshes the *swap* quote on input change
> but shows **no visible TTL / expiry ring** and no re-quote-delta highlight. Ship the countdown ring + the
> re-quote-worse "requires re-read" treatment. **(proposed)** — until then, do not draw an expiry ring the
> plan does not enforce. Likewise the **itemized fee expand** (tap "Network fee" → network / partner / our
> fee) is **(proposed)**; the fee shows as one honest total today.

---

### 9.5 · RiskBadge `(.badge.risk-*)`

Risk is **always icon + label + color, never color alone** (DESIGN_SYSTEM §2.2, §11). The shipped
`RiskBadge` renders `<span className="badge risk-{level}">{label}</span>` — the mapping (App.tsx `RISK`):

| Level | Label (shipped) | Class | Color / bg — Light | Color / bg — Dark |
| --- | --- | --- | --- | --- |
| low | "Low risk" | `.risk-low` | `#0F7A45` / `#E6F6EE` | `#34C77B` / `#0E2B1D` |
| medium | "Caution" | `.risk-medium` | `#9A5309` / `#FEF3E2` | `#F59E0B` / `#33230A` |
| high | "High risk" | `.risk-high` | `#C2410C` / `#FFF1E8` | `#FB923C` / `#351A0B` |
| block | "Blocked" | `.risk-block` | `#B91C1C` / `#FDEBEB` | `#F87171` / `#351111` |

`.badge`: `12px`/600, `padding: 3px 9px`, radius `999px`.

> **Two honest notes.** (1) **The risk color is a *tuned tint*, not the raw semantic hue** — web `--low`
> `#0F7A45` is darkened from the canon `risk.low` `#0F9D58` to clear AA on the light `--low-bg` fill; that is
> deliberate AA tuning, tracked as drift (DESIGN_SYSTEM §13), reconcile toward canon via governed PR. (2)
> **The badge ships label + color but not yet the canonical glyph.** DESIGN_SYSTEM §2.2 names the icons —
> LOW shield-check, MEDIUM shield-alert, HIGH alert-triangle, BLOCK octagon-x. Because the **label** is a
> full text channel, the shipped badge is *colorblind-safe* (it is not color-alone), so it meets the §11
> floor — but the icon is **(proposed)** and should be added on the §5/§8 24×24 grid. Note also that a
> `block` badge should escalate to a **full-width banner** (DESIGN_SYSTEM §6.6), not a pill; the banner form
> is **(proposed)** for the web PlanCard.

---

### 9.6 · Authorize — the Risk + Policy verdict, made visual `(.authz)`

Stage 4 is the trust boundary of the conversation: the deterministic gate's verdict, rendered honestly.
`AuthzView` renders `.authz` with a variant by outcome:

| Variant | Condition | Tokens |
| --- | --- | --- |
| `.authz-allow` | `permission.mayProceedToSign` | `background: var(--low-bg)`, `border-color: color-mix(low 40%, transparent)`, `.gate` in `--low` |
| `.authz-deny` | gate refuses | `background: var(--block-bg)`, `border-color: color-mix(block 40%, transparent)`, `.gate` in `--block` |

The `.authz-head` shows the **gate label** (`GATE_LABEL`: Authorized · Needs step-up · Deferred · Escalated
for review · Blocked by policy) beside **`.drivenby`** — *"checked by {drivenBy.join(' + ')}"* (e.g.
"checked by Risk + Policy"). That single line is doctrine #8 (**everything auditable**) worn on the face:
the user is told *which deterministic engines* produced the verdict, not asked to trust a black box. Below,
`.reasons` (a plain-language list) and `.chips` (required confirmation factors — Biometric, Device PIN,
Passkey, Second approver) spell out *why* and *what's still needed*.

| Authorize stage state | `authzState` | Content |
| --- | --- | --- |
| pending | `permission == null && phase !== 'authorizing'` | "Not yet authorized — review the plan, then authorize." (muted) |
| active | `phase === 'authorizing'` | "Checking risk & policy…" (muted) + the dot pulses |
| done | `permission != null` | `AuthzView` (allow or deny) |

**Authorize CTA (`.flow-actions`):** phase `planned` → **"Review & authorize"** (`.btn.primary`). This is
the informed step: the plan is fully readable *before* the button that asks the gate to rule on it.

---

### 9.7 · The execution timeline `(.stage / .exec / .wl-signed)` — each state honest

Stage 5 is the live money moment: `authorize → sign → execute → confirm`, and **nothing here is ever
faked** (doctrine #3). The stage advances through `FlowPhase` (`planned → authorizing → authorized →
executing → done`).

| Execute stage state | `execState` | Content (shipped) |
| --- | --- | --- |
| ready — real transfer | `canReal && real` | "Ready to sign with your wallet · your {ASSET} on {chain}: **{balance}**" — shows the real on-device balance it will spend |
| ready — real swap | `canSwap && swap` | live Uniswap quote + **slippage control** (below) |
| active | `phase === 'executing'` | "Signing in your browser & broadcasting…" (or "Signing on device…") + the dot pulses |
| done | `realTx != null` | **RealExecView / RealSwapExecView** (`.wl-signed`): "✓ Signed in your browser & broadcast to {chain}" + the mono `txid` + an "View on explorer →" link |
| not executable | authorized but `!canReal && !canSwap` | "This plan isn't executable from the browser wallet yet — nothing will be signed or broadcast." |

**The no-fake-execution rule (shipped, load-bearing).** If the on-device wallet cannot *really*
sign + broadcast a plan, `runExecute()` throws a plain-language refusal — *"This {kind} can't be broadcast
from the browser wallet yet. Nothing was signed or sent."* — instead of animating a fake success. The
execute CTA even hides itself (replaced by the honest muted line) when the plan isn't executable. Nothing
reads "confirmed" that did not happen on-chain; the `.flow-foot` states the truth in mono ("real signing in
your browser (non-custodial) → Sepolia" vs "not executable in-browser yet").

**Slippage control on a real swap `(.slippage / .slippage-opt)`.** Before a real swap signs, the user sees
the **live** quote and picks a **max slippage** — three segmented options `10 / 50 / 100 bps` (0.1% / 0.5% /
1%), default 50. The chosen bound computes the on-chain `amountOutMinimum` (a hard floor), surfaced as
*"You receive at least **{minOut} {SYMBOL}**"*. The `.slippage-opt.active` state:
`border-color: var(--accent)`, `background: color-mix(accent 14%, transparent)`, accent text, 650 weight.
There is no invisible fixed slippage on a real-fund swap — the floor is chosen, shown, and enforced on-chain
(it reverts rather than delivering less), so MEV/slippage can never silently cost the user.

**Execute CTA (`.flow-actions`):** phase `authorized` **and** `mayProceedToSign` **and**
`(canReal || canSwap)` → **"Sign on device & execute"** (`.btn.primary`). If the gate refused
(`!mayProceedToSign`), the button is replaced by "Can't proceed until the requirements above are met." — the
gate can only refuse; it never hides a refusal behind a live button.

> **StepTracker states not yet shipped (proposed).** The rich `.exec` recovery states named in
> DESIGN_SYSTEM §6.5 — `.exec-parked` ("Your 0.021 wBTC is safe on Ethereum" + Resume), recovering ("Finding
> a new route…"), and multi-step "Confirming 2 of 3 · ~4 min" progress — have **CSS classes present**
> (`.exec-parked`, `.exec-completed`, `.exec-failed`, `.exec-status`) but the browser wallet's single-step
> real broadcast doesn't yet drive them. Multi-step live execution + park/resume is **(proposed)**; the
> classes are the scaffolding for it.

---

### 9.8 · Thinking / streaming / loading

What ships today is a **discrete** think-then-answer, not token streaming:

| Moment | Shipped treatment |
| --- | --- |
| intent submitted | `.btn.send` glyph → `.spin` (a 15px accent-ring spinner, `animation: spin 0.7s linear infinite`) |
| planning in flight | the `.bubble.ai.thinking` "Planning…" bubble with `.typing` dots (`blink 1.2s`), announced once via `role="status"` |
| plan arrives | the whole `.flow.card` enters via `cardIn` (§9.11); stages stagger in |
| authorize / execute in flight | the relevant stage dot goes `active` (pulse) + a muted "Checking…/Signing…" line |

> **Token streaming (proposed).** There is no live token-by-token stream of the model's reasoning — planning
> is one async round-trip (`planIntent()`), and the model output is schema-forced into a deterministic
> `Outcome` before anything renders (AI at the edges, deterministic core in the middle — CLAUDE.md #7). A
> streamed "thinking" transcript is **(proposed)**; if built, it must remain *decorative-until-verified* —
> the plan card, not the stream, is the artifact the user acts on, and the stream can never imply the plan
> is final before the gate has ruled.

---

### 9.9 · Error + retry — 5xx honesty

Two error surfaces, both plain-language, neither a dead end (DESIGN_SYSTEM §7 Error contract):

1. **Planning failed** (network / 5xx / parse) → the turn resolves to `turn.error`, rendered as
   `.card.rejected` (`border-color: color-mix(block 40%, border)`, `background: var(--block-bg)`) with the
   message. On failure the composer `loading` guard releases so the user can immediately retry — the seed
   chips and input come back live.
2. **Execution failed** → `.err-line` (styled `.authz-deny`) inside the PlanFlow, and `phase` drops back to
   `authorized` so the **"Sign on device & execute"** button reappears — a *retryable* terminal state, not a
   spinner that spins forever. In Auto mode, a failed execute does **not** auto-retry (that would loop the
   RPC); the manual button returns so the retry is deliberate.

The message is always human — the raw error string is shown in-line only as the plain cause, never a bare
HTTP code in the user's face. And the deepest honesty: a `rejected` outcome (feasibility, e.g. "you don't
hold any BNB") is *not* dressed as a risk failure — the RiskBadge is suppressed on a feasibility rejection
unless risk is actually the reason (App.tsx: `outcome.risk.level !== 'low'`), so a "Low risk" badge never
lies next to "Not possible".

---

### 9.10 · Mainnet / real-funds safety `(.mn-confirm)`

The single most safety-critical treatment on the surface. A real **mainnet** broadcast — `canReal &&
real.isMainnet` — **never** fires from the execute button alone. `execute()` intercepts it and opens
`.mn-confirm`, a `role="alertdialog"` panel, and *that explicit confirm click is the `GuardAck` the
deterministic guard demands* — the UI cannot hand the guard an acknowledgement the user did not physically
give.

| Element | Treatment (tokens) |
| --- | --- |
| container `.mn-confirm` | `border: 1px solid color-mix(block 55%, border)`, `background: color-mix(block 8%, surface)` — danger-tinted, unmistakable |
| `.mn-h` | `14px`/700, `color: var(--block)`: "⚠️ Real mainnet transaction — this moves REAL funds" |
| `.mn-lead` | `13px`/text-2: "Sending **{amount} {ASSET}** on **Ethereum mainnet** to `{addr}` · ≈ **${usd}**. It is signed on your device and cannot be undone." — the `.mn-addr` is full, `word-break: break-all` mono (never truncated on the irreversible screen) |
| `.mn-hv` | shown only when `amountUsd > 1000`: a required checkbox — "I understand this exceeds the $1,000 mainnet spend cap." The confirm button is `disabled` until it is checked |
| actions | **"Confirm & sign real-funds transaction"** (`.btn.primary.wl-danger-btn`) + a plain **"Cancel"** link that returns to `authorized` with nothing sent |

Testnet / devnet run straight through (the guard waves them through) — but they are **labeled** testnet
everywhere (`chainLabel`: "Sepolia", "Solana devnet", "Bitcoin testnet"), never dressed as mainnet
(DESIGN_SYSTEM §12). This is the doctrine's whole thesis in one panel: irreversible, real-money actions
require **explicit, informed** confirmation, stated once, clearly, before they happen (CLAUDE.md #5) — and
the confirmation *is* the ack the deterministic guard verifies. Haptics would escalate here on mobile
(§6), but haptics are **mobile-only** and are **(proposed)** — the web relies wholly on the visual danger
treatment.

---

### 9.11 · Motion — spent, not sprinkled (§6 applied)

Every animation on this surface earns its place under Ch2 §7 (Explain · Guide · Confirm · Reduce anxiety),
all gated behind `@media (prefers-reduced-motion: no-preference)`:

| Motion | Where | Curve / duration | Verb |
| --- | --- | --- | --- |
| `rise` | `.bubble`, `.stage`, `.route-seg` | 0.35–0.45 s ease + `translateY(8px)`; stages stagger `var(--i)*90ms`, route segs `var(--i)*80ms+120ms` | Guide (order of appearance) |
| `cardIn` | `.flow` | 0.4 s `--ease` + `translateY(12px) scale(.99)` | Confirm (the plan *arrives*) |
| `revealIn` | `.authz`, `.exec`, `.wl-signed`, `.err-line`, `.swap-quote` | 0.32 s `--ease` | Explain (a result appeared) |
| `pop` | `.stage.done .stage-dot`, `.authz-allow` | 0.34 s `--ease-spring` | Confirm (a step completed) |
| `pulse` | `.stage-active .stage-dot` | 1.4 s infinite | Guide (this is happening now) |
| `blink` | `.typing i` | 1.2 s infinite | Reduce anxiety ("it's working") |
| `spin` | `.btn.send .spin` | 0.7 s linear | Guide (in flight) |

Under **`prefers-reduced-motion: reduce`** the entrances collapse to instant, `pulse`/`blink`/shimmer stop,
and nothing on this surface is conveyed by motion alone — the stage `✓`/state, the risk label, the gate
text, and the `role="status"` announcements all carry the meaning without a single frame of animation.

---

### 9.12 · Accessibility matrix (WCAG 2.2 AA — gated)

| Concern | Shipped | Gap (proposed) |
| --- | --- | --- |
| **Thinking announced** | `.bubble.ai.thinking` is `role="status" aria-live="polite"` → "Planning…" once; `.typing` dots `aria-hidden` | — |
| **Composer labels** | `aria-label` on both inputs ("Tell your wallet what you want" / "Ask your wallet"); send `aria-label="Send"` | — |
| **Contrast** | risk tints AA-tuned (`--low` darkened for AA on tint); placeholder uses AA-body `--text-3` | verify HIGH/BLOCK tints against `.badge` fill in both schemes |
| **Focus** | composer pill `:focus-within` ring (2px accent + `accent-subtle` halo) | **`:focus-visible` ring on `.ex` / `.btn.send` / `.btn.primary`** — (proposed, §9.2) |
| **Color never sole channel** | RiskBadge label + gate text + stage `✓`; feasibility rejection suppresses false risk badge | risk **glyph** — (proposed, §9.5) |
| **Amounts** | must be `tabular-nums`; "wrap, never truncate"; `.mn-addr` full mono | audit that live-quote ticks don't reflow the cost grid |
| **Reduced motion** | all §9.11 motion gated; meaning survives without it | — |
| **Plan read-order** | stages read top-to-bottom as the plan summary before the CTA | announce the whole PlanCard as one summary *before* the CTA gains focus (DESIGN_SYSTEM §6.3) — (proposed) |

---

### 9.13 · The honesty ledger — shipped vs proposed

The one-glance truth about this surface, so no one paints a capability that isn't wired:

**Shipped (real classes + elements today):** two-entry-point conversation (`.hv-ai` + `.ai-sec`), sticky
pill composer with focus-within ring + spinner send, four seed chips, the doctrine note, user bubbles +
the "Planning…" thinking bubble, the empty state, `OutcomeView` (plan/clarify/answer/automation/rejected),
the fixed-anatomy **PlanCard** with `.kind` + RiskBadge + live-quote lead + `🧠` reasoning + the six-stage
timeline, RouteGraph, cost grid, AuthzView with "checked by Risk + Policy", the real execute timeline with
in-browser signing + explorer receipt, user-chosen slippage with an enforced on-chain floor, the
no-fake-execution refusal, the 5xx `.card.rejected` + retryable `.err-line`, and the mainnet `.mn-confirm`
GuardAck with the $1k-cap acknowledgement.

**Proposed (specified here, not yet built — do not depict as present):**

- a token-driven `:focus-visible` ring across `.ex` / `.btn.send` / `.btn.primary` (§9.2, §9.12);
- context-aware suggestion chips capped at 3, and a rotating placeholder (§9.2);
- composer **degraded** state (LLM-down → deterministic-form fallback), listening/voice, thinking-border
  (§9.2, §9.8);
- token-by-token streaming (§9.8);
- PlanCard **expiry ring / countdown**, expired + re-quote-worse states, and the itemized-fee expand (§9.4);
- the RiskBadge **glyph** and the BLOCK **full-width banner** form (§9.5);
- multi-step **park / resume / recovering** execution states driving `.exec-parked` et al. (§9.7);
- announce-the-whole-card-before-CTA read order (§9.12);
- **mobile** haptic escalation on confirm/hold/BLOCK (§6 — mobile-only, never on web).

**Named drift to reconcile (DESIGN_SYSTEM §13), not to widen:**

- **Emoji-as-UI.** The stage icons (`✦ 🛡 🧭 ⛽ 🔐 🚀`), the `🧠` reasoning marker, `⚡ AUTO`, the `⚠️`
  mainnet header, and the seed-chip icons (`🔄 💸 ⚖️ 🌱`) are **emoji**, which DESIGN_SYSTEM §8 forbids ("no
  emoji as UI"). They read acceptably today but they are not on the 24×24 custom grid and they render
  differently per-OS. **Fix:** replace with the §5/§8 custom glyph set (the same stroke-1.75 family as the
  rest of the product). This is the single largest craft gap on the flagship surface — close it before GA.
- **Risk tint vs canon** (`--low #0F7A45` vs `risk.low #0F9D58`) — AA-tuned, reconcile toward canon per §13.

---

*This is the screen the whole product is for. It is where a non-technical stranger types one sentence and
watches the wallet prove — step by step, in a shape they can learn once and trust forever — exactly what
will happen, what it costs, how risky it is, and what they'll receive, and then signs on their own device
or walks away with nothing moved. The AI shows its work; the deterministic gate can only refuse; the
signature disposes. Build the proposed items, kill the emoji drift, and this surface is world-class. See
§7 for the controls it composes, §8 for the surfaces & feedback it borrows, and §6 for every millisecond it
moves.*


---

## Where this sits

This is the reference behind [Chapter 3 — the Design System charter](../bible/chapter-03-design-system.md),
and the material Volume III is built from. The honest design-debt it surfaced — web typography not yet
tokenized (~60 selectors hardcode `font-size`), the `tabular-nums` money mandate applied to only two web
selectors, and a `body` font-stack that omits the `Inter`/`Roboto Mono` fallbacks the charter names — are
real reconciliation items for the design system's own build loop, not aspirations. Fix them against this
reference; keep the charter and the code in agreement.
