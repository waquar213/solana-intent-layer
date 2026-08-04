# 02 — Component Library

Every component ships in `packages/ui` with stories covering ALL states listed here. Format: **Anatomy · Variants · States · Behavior · A11y**. States marked ⭘ are mandatory to design AND test.

## Buttons

- **Anatomy:** container (h 52 / 44 sm), label `type.headline`, optional leading icon 20.
- **Variants:** `primary` (accent fill) · `secondary` (surface2 fill, text.primary) · `tertiary` (text-only accent) · `destructive` (danger fill) · `hold-to-confirm` (see ConfirmSheet).
- **States ⭘:** default · pressed (fill.pressed + impact-light) · disabled (38% opacity, no events) · **loading** (spinner replaces icon, LABEL STAYS — "Approving…" not a bare spinner).
- **Behavior:** loading buttons stay loading min 400 ms (no flicker); double-tap guarded by disable-on-first-tap.
- **A11y:** role=button; loading announces "in progress"; min target 44 pt incl. margins.

## AmountInput (the money keyboard)

- **Anatomy:** giant amount `type.display` center; currency toggle chip (⇄ fiat/asset); helper line ("≈ 0.0123 BTC" / "Balance: $2,100 · Max"); custom NumericKeypad; inline validation line.
- **Variants:** fiat-first (default) · asset-first · read-only (plan review).
- **States ⭘:** empty (0 placeholder, tertiary) · typing · valid · invalid (shake 3×4 px, danger helper: "More than your balance — Max is $2,100") · max-applied (chip highlights).
- **Behavior:** typing in fiat converts live at display rate (rate + staleness shown); "Max" computes balance − estimated fees and labels it ("Max keeps $1.20 for fees"); decimals capped per asset; leading-zero and thousands formatting per locale.
- **A11y:** amount announced on every keystroke batch ("one hundred dollars"); toggle announces active unit.

## AmountDisplay

Rounding rules from [08-standards.md](08-standards.md) §1.4; tap toggles full precision (tooltip on web, expand in place on mobile); tabular nums; sign and color for deltas (+ success / − text.primary — losses are NOT red in balances, only in risk contexts).

## AssetRow (h 56)

- **Anatomy:** asset icon 32 (with 16 network mini-badge ONLY inside asset detail contexts), name `headline`, holdings `subhead` secondary; right: fiat value `headline` + 24h delta `footnote`.
- **States ⭘:** default · pressed · provisional (subtle pulse dot + "confirming") · stale (values dimmed 70% + clock glyph) · hidden-balance mode (••••).
- **A11y:** single element: "Ethereum, 0.61 ETH, $2,079, up 2.1% today".

## ChainChip / AddressChip

- **AddressChip anatomy:** identicon 20, mono truncated `0x9858…da94` (6…4), copy icon; EIP-55 casing preserved in display.
- **Behavior:** tap = copy + toast "Address copied" + haptic; long-press = QR quick look; NEVER auto-copy on render.
- **A11y:** reads grouped: "address starting 0x 98 58, ending d a 9 4, double-tap to copy".

## CommandBar (intent input — the product's signature)

- **Anatomy:** pill container (radius.full, surface, e2), sparkle glyph, placeholder rotating through 3 localized examples ("Convert my BTC to ETH…"), mic icon, send arrow (appears on text).
- **States ⭘:** idle · focused (accent border, suggestions rise) · listening (waveform, live transcript) · thinking (shimmer border 1.2 s, cancellable) · degraded (LLM down: placeholder becomes "Try: Send · Swap · Receive" and taps open forms — the fallback is designed, not accidental).
- **Suggestion chips:** max 3, context-aware ("Swap ETH→USDC", "Send to Rahul again"), `accent.subtle` fill.
- **A11y:** textbox role; thinking state announces "working on it"; mic flow fully usable via keyboard/screen reader alternative (type-only).

## PlanCard (quote presentation)

- **Anatomy (fixed order — recognition is safety):**
  1. Route summary line ("2 steps · ~12 min · via 2 partners")
  2. **You send** row: asset icon, amount, fiat
  3. **You receive (min)** row: asset icon, amount with "at least" prefix, fiat
  4. Fee row: "Total cost $21.30 (1.01%)" → tap expands: network fees, partner fees, our fee — each line itemized
  5. RiskBadge row
  6. Expiry ring: 30 s countdown circle on the CTA
- **States ⭘:** fresh · expiring (<10 s: ring amber) · expired (card dims, CTA becomes "Get new quote") · re-quoted-worse (delta highlighted: "You'll receive 0.002 ETH less than before" + requires re-read) · re-quoted-better (success tint on delta).
- **A11y:** announced top-to-bottom as one summary before CTA gains focus.

## StepTracker (execution progress)

- **Anatomy:** vertical timeline; per step: status glyph (pending ○ / active spinner / done ✓ draw-on / failed ✕ / waiting-signature ✍), title ("Moving BTC"), sub ("Confirming 2 of 3 · ~4 min left"), receipt link when confirmed.
- **States ⭘:** running · waiting-for-signature (step pulses + CTA "Confirm step 2") · recovering ("Finding a new route…") · parked (info panel: "Your 0.021 wBTC is safe on Ethereum" + Resume) · completed (celebrate motion once) · failed (plain-language reason + support link).
- **Behavior:** survives app kill — reopens to the same state from server truth; background completion → push + Live Activity/Dynamic Island (iOS) update.

## RiskBadge

Levels per [01-tokens.md](01-tokens.md) §1.4. Anatomy: icon + label + optional "Why?" link → RiskSheet listing reasons in plain language ("Token created 2 days ago", "Sell tax detected: 12%"). BLOCK variant is a full-width banner, not a badge.

## ConfirmSheet (THE trust boundary — one anatomy, everywhere)

- **Anatomy (never reordered):**
  1. Grabber + title: verb + object ("Send $100" / "Convert BTC → ETH")
  2. Effects list: what leaves, what arrives (client-side decoded — server text is never trusted for this)
  3. Destination row (AddressChip + contact name if known + "first time" tag when new)
  4. Fee + ETA row
  5. RiskBadge row (LOW may collapse; MEDIUM+ always expanded)
  6. CTA area
- **CTA by risk:** LOW → primary button + system biometric. MEDIUM → button labeled "I understand, continue" + biometric. HIGH → **hold-to-confirm 800 ms** (progress ring + escalating haptic) + typed word for amounts > user-set threshold. BLOCK → no CTA; "Why blocked" + "Report mistake".
- **States ⭘:** loading-simulation (skeleton effects rows, CTA disabled: "Checking exactly what will happen…") · simulation-mismatch (danger panel: "This would do something different than expected" + only [Cancel]) · expired · declined-biometric (returns to sheet, nothing sent).
- **A11y:** focus trapped; full content announced before CTA is focusable; hold-to-confirm has an accessible alternative (double-tap + confirm dialog) under switch control.

## Sheets, Toasts, Banners

- **Sheet:** detents 40/90%; grabber; scrim tap dismisses ONLY when no money action pending.
- **Toast:** bottom, 3 s, one at a time, never covers CTAs; action toasts ("Copied", "Undo") 5 s.
- **Banner (persistent, top of content):** `warning.subtle` for staleness ("Balances as of 2:41 PM — reconnecting…"), `info.subtle` for degraded modes ("Assistant unavailable — forms still work"). Banners are system-truth, never marketing.

## Supporting set (same rigor, condensed)

**SearchField** (cancel button, recent chips) · **SegmentedControl** (2–4 options) · **ListCell** (leading icon, title/sub, trailing value/chevron/switch) · **EmptyState** (illustration 48 glyph, one line, ONE CTA) · **Skeleton** (per-layout shapes; text lines 60/90/40%) · **QRDisplay** (ecosystem tabs, brightness boost, share) · **QRScanner** (viewfinder, torch, gallery import, permission-denied state with settings link) · **NumericKeypad** (large targets, biometric key slot) · **PhraseGrid** (12/24 numbered wells; blur-on-background; screenshot warning) · **Tag/Pill** · **Stepper dots** (onboarding) · **NavBar** (large title → collapses) · **TabBar** (4 items, active = filled icon + label always visible).
