# 01 — Design Tokens

Tokens are the single source of truth, exported from `packages/ui/tokens` as JSON → consumed by Figma variables, React Native, and web CSS custom properties. Naming: `category.role.variant`.

## 1. Color system

Philosophy: near-monochrome surfaces; ONE brand accent; semantic colors reserved for meaning (principle #5). All pairs meet WCAG 2.2 AA (≥ 4.5:1 body text, ≥ 3:1 large text/icons).

### 1.1 Neutrals (surface & text)

| Token                  | Light       | Dark        | Use                          |
| ---------------------- | ----------- | ----------- | ---------------------------- |
| `color.bg.canvas`      | #F7F7F8     | #0E0E10     | app background               |
| `color.bg.surface`     | #FFFFFF     | #1A1A1E     | cards, cells, sheets         |
| `color.bg.surface2`    | #F0F0F2     | #242429     | nested surfaces, input fills |
| `color.bg.scrim`       | #000000 60% | #000000 70% | behind sheets                |
| `color.border.subtle`  | #E4E4E8     | #2E2E34     | hairlines, dividers          |
| `color.border.strong`  | #C9C9D0     | #3F3F47     | input borders, focus rest    |
| `color.text.primary`   | #17171B     | #F4F4F6     | headings, amounts            |
| `color.text.secondary` | #5A5A64     | #A3A3AE     | supporting copy              |
| `color.text.tertiary`  | #8B8B96     | #6E6E78     | captions, placeholders       |
| `color.text.inverse`   | #FFFFFF     | #17171B     | on accent/danger fills       |

### 1.2 Accent (brand)

| Token                   | Light   | Dark    | Use                                |
| ----------------------- | ------- | ------- | ---------------------------------- |
| `color.accent.base`     | #4F46E5 | #6D66F6 | primary buttons, active tab, links |
| `color.accent.pressed`  | #4038C7 | #5B54E0 | pressed fills                      |
| `color.accent.subtle`   | #EEEDFD | #26244B | selected backgrounds, chips        |
| `color.accent.onAccent` | #FFFFFF | #FFFFFF | text/icon on accent                |

### 1.3 Semantic

| Token                         | Light             | Dark              | Meaning                       |
| ----------------------------- | ----------------- | ----------------- | ----------------------------- |
| `color.success.base / subtle` | #0F9D58 / #E6F6EE | #34C77B / #0E2B1D | confirmations, received funds |
| `color.warning.base / subtle` | #B45309 / #FEF3E2 | #F59E0B / #33230A | caution, stale data           |
| `color.danger.base / subtle`  | #DC2626 / #FDEBEB | #F87171 / #351111 | destructive, failures         |
| `color.info.base / subtle`    | #0369A1 / #E6F3FA | #38BDF8 / #0B2735 | neutral notices               |

### 1.4 Risk scale (Risk Engine levels → UI; NEVER color-only)

| Level  | Color token                           | Icon           | Label       |
| ------ | ------------------------------------- | -------------- | ----------- |
| LOW    | `color.risk.low` = success.base       | shield-check   | "Low risk"  |
| MEDIUM | `color.risk.medium` = warning.base    | shield-alert   | "Caution"   |
| HIGH   | `color.risk.high` = #EA580C / #FB923C | alert-triangle | "High risk" |
| BLOCK  | `color.risk.block` = danger.base      | octagon-x      | "Blocked"   |

### 1.5 Asset colors

Token-metadata brand colors (BTC #F7931A etc.) are used ONLY in asset icons/sparklines — never for text, backgrounds, or state, so they can't collide with semantic meaning.

## 2. Typography

System stack (SF Pro / Roboto). **All numerals everywhere: `font-variant-numeric: tabular-nums lining-nums`** — amounts must not jitter as they update.

| Token           | Size/Line | Weight                         | Use                           |
| --------------- | --------- | ------------------------------ | ----------------------------- |
| `type.display`  | 40/46     | 700                            | portfolio total (Home hero)   |
| `type.title1`   | 28/34     | 700                            | screen titles                 |
| `type.title2`   | 22/28     | 600                            | section titles, sheet titles  |
| `type.headline` | 17/22     | 600                            | row titles, buttons           |
| `type.body`     | 17/24     | 400                            | default copy                  |
| `type.callout`  | 16/21     | 400                            | secondary copy in cards       |
| `type.subhead`  | 15/20     | 400/600                        | list metadata                 |
| `type.footnote` | 13/18     | 400                            | captions, legal, timestamps   |
| `type.caption`  | 11/13     | 500                            | badges, tab labels            |
| `type.mono`     | 15/20     | 450 mono (SF Mono/Roboto Mono) | addresses, hashes, seed words |

Dynamic Type: all tokens scale with the OS setting up to XXL; amounts may wrap to two lines but NEVER truncate ([08-standards.md](08-standards.md) §4).

## 3. Spacing & layout

4-pt base grid. `space.1`=4 · `2`=8 · `3`=12 · `4`=16 · `5`=20 · `6`=24 · `8`=32 · `10`=40 · `12`=48 · `16`=64.

| Token               | Value        | Use                                      |
| ------------------- | ------------ | ---------------------------------------- |
| `layout.margin`     | 20           | screen horizontal margins                |
| `layout.gutter`     | 12           | grid gutters                             |
| `size.row.sm/md/lg` | 48 / 56 / 72 | list rows (settings / assets / activity) |
| `size.touch.min`    | 44×44        | minimum touch target (hard rule)         |
| `size.button.h`     | 52           | primary button height                    |

## 4. Radius & elevation

Radius: `xs` 8 (chips) · `sm` 12 (inputs, cells) · `md` 16 (cards) · `lg` 24 (sheets top corners) · `full` (pills, FAB).

Elevation (light mode shadows / dark mode = surface steps, no shadows):
`e1` card 0 1 2 rgba(0,0,0,.06) · `e2` sticky bars 0 2 8 .08 · `e3` sheets/dialogs 0 8 24 .16.

## 5. Iconography

- Grid 24×24, stroke 1.75, rounded caps/joins; filled variants only for active tab states.
- Source: SF Symbols (iOS) / Material Symbols (Android) for OS concepts; custom crypto set (assets, chains, risk glyphs) drawn on the same grid, shipped as icon font + SVG.
- Sizes: 16 (inline), 20 (rows), 24 (default), 28 (tab bar), 48 (empty states).
- Icons never appear without a text label except: back, close, copy, QR, settings-gear (universally learned).

## 6. Motion

| Token              | Value                                      | Use                       |
| ------------------ | ------------------------------------------ | ------------------------- |
| `motion.instant`   | 80 ms, linear                              | pressed states, toggles   |
| `motion.quick`     | 200 ms, ease-out                           | fades, chips, row expand  |
| `motion.standard`  | 300 ms, standard curve (0.2,0,0,1)         | screen transitions        |
| `motion.sheet`     | spring (mass 1, damping 26, stiffness 300) | sheet present/dismiss     |
| `motion.celebrate` | 600 ms, ease-in-out                        | success checkmark draw-on |

Rules: nothing blocks input > 300 ms; `prefers-reduced-motion` swaps springs/slides for 150 ms cross-fades and disables celebrate; skeleton shimmer 1.2 s loop, disabled under reduced motion.

## 7. Haptics map

| Event                              | iOS                       | Android            |
| ---------------------------------- | ------------------------- | ------------------ |
| Tap on primary action              | impact-light              | CLICK              |
| Toggle / selection change          | selection                 | TICK               |
| Plan approved (signed)             | notification-success      | double TICK        |
| Execution completed                | notification-success      | double TICK        |
| Risk HIGH revealed / warning sheet | notification-warning      | HEAVY_CLICK        |
| Error (failed unlock, failed tx)   | notification-error        | double HEAVY_CLICK |
| Hold-to-confirm progress           | impact-light every 200 ms | TICK ramp          |

## 8. Token governance

Tokens change via PR to `packages/ui/tokens` with before/after screenshots; adding a NEW color requires deleting or justifying an old one (palette stays small by policy). Figma variables sync from the JSON export — Figma is a consumer, not the source.
