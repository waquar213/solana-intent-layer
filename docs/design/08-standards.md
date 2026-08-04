# 08 — Cross-cutting Standards: Validation, States, Accessibility, i18n

The rules every screen inherits. Screen specs reference these by number instead of repeating them.

## 1. Validation rules

### 1.1 Recovery phrase (import)

Normalize: trim, collapse internal whitespace, lowercase (BIP-39 English is ASCII). Per-word: must be in the 2048-word list (autosuggest after 2 chars). Full phrase: length ∈ {12,15,18,21,24}, BIP-39 checksum must pass. Paste: accept the whole phrase, then CLEAR the clipboard and toast it. Errors are specific: unknown word (which one), bad checksum ("check word order"), wrong length.

### 1.2 Addresses (per ecosystem, before it ever reaches a confirm)

| Ecosystem                                                                                                                                                                                         | Checks                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| EVM                                                                                                                                                                                               | `0x` + 40 hex; if mixed-case, EIP-55 checksum MUST validate (reject silent-corruption); not the burn address `0x0…0`; warn if == user's own address |
| Bitcoin                                                                                                                                                                                           | valid bech32/bech32m (`bc1…`) or base58check (1…/3…); network matches active (no testnet address on mainnet); checksum valid                        |
| Solana                                                                                                                                                                                            | valid base58, 32-byte, on-curve check for system transfers                                                                                          |
| Cross-cutting: unknown recipient → "first time" tag propagated to confirm; contact match → show name + verified marker; screen against Risk Engine (flagged → RiskBadge, BLOCK → cannot proceed). |

### 1.3 Amounts

Parse in the input unit; store/compare as base-unit `bigint` (never float). Reject: > available balance (minus estimated fees for native-asset sends), ≤ 0, more decimals than the asset allows. "Max" = balance − estimated fee, always labeled with what it reserved. Dust threshold warnings for sends below network-relay minimums (BTC).

### 1.4 Number formatting (one rule, everywhere)

- **Fiat:** locale currency format, 2 decimals for values ≥ $1; `< $0.01` shown as "<$0.01"; large values grouped.
- **Crypto:** significant-figure based — up to 6 sig-figs, trailing zeros trimmed; full precision on tap. Never show 18 decimals raw.
- **Deltas:** explicit sign; 24h % to 1 decimal. Tabular figures always.
- **Rounding direction on confirms:** "you receive" rounds DOWN (conservative), "you send/pay" rounds UP. We never flatter a number the user is about to commit to.

## 2. State system (every data surface implements all five)

| State       | Rule                                                                                                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Loading** | Skeleton matching final layout within 100 ms; keep last-known data visible with shimmer for refreshes (no blank-then-pop); spinners only inside buttons; hard operations get a labeled progress moment, never a frozen screen.            |
| **Empty**   | One illustration (48 glyph), one sentence of what goes here, exactly ONE primary CTA that creates the first item. Empty ≠ error — tone is inviting.                                                                                       |
| **Error**   | Name the problem in plain language (no codes in the face; code available in "details"), state the cause if known, offer the next action. Never a dead end. Distinguish retryable (offer Retry) from terminal (offer alternative/support). |
| **Stale**   | Show the data, dim to ~70%, add a clock glyph + "as of <time>", auto-refresh with a quiet "reconnecting". Wallets must never silently show wrong/zero numbers.                                                                            |
| **Offline** | Global banner; cached reads work; any money action that needs the network is disabled with "You're offline" (not a failure after the fact).                                                                                               |

## 3. Error → UI mapping (from API `code` strings, [architecture 07](../architecture/07-api.md))

| `code`                                                                                                                                  | User-facing copy                             | UI treatment                         | Action                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------ | --------------------------- |
| `INTENT_AMBIGUOUS`                                                                                                                      | "Which one did you mean?"                    | clarification chips                  | pick                        |
| `INTENT_UNSUPPORTED`                                                                                                                    | "I can't do that yet — here's what I can do" | assistant message + capability chips | —                           |
| `PLAN_EXPIRED`                                                                                                                          | "This quote expired"                         | PlanCard dim + refresh               | [Get new quote]             |
| `NO_ROUTE`                                                                                                                              | "No good route right now"                    | inline notice                        | [Try again later]           |
| `RISK_BLOCKED`                                                                                                                          | "Blocked for your safety" + reasons          | block banner                         | [Why] / [Report]            |
| `SIMULATION_MISMATCH`                                                                                                                   | "This would do something unexpected"         | danger panel                         | [Cancel] only               |
| `INSUFFICIENT_FUNDS`                                                                                                                    | "Not enough — Max is $X"                     | inline on amount                     | [Use Max]                   |
| `RATE_LIMITED` (429)                                                                                                                    | "Give it a moment"                           | toast + auto-retry w/ backoff        | auto                        |
| network/5xx                                                                                                                             | "Something went wrong on our side"           | error state                          | [Retry] + [Contact support] |
| Rule: the user NEVER sees a raw code, stack, hash, or provider name in a primary error surface; those live under "Details" for support. |

## 4. Accessibility (WCAG 2.2 AA, non-negotiable — gated in CI)

- **Contrast:** ≥ 4.5:1 text, ≥ 3:1 large text/icons/focus rings (token pairs pre-verified [01-tokens.md](01-tokens.md)).
- **Touch:** ≥ 44×44 pt targets incl. spacing; primary actions bottom-reachable (thumb zone).
- **Screen readers:** every interactive element labeled; amounts/status as coherent sentences; live regions for thinking/stale/countdown/error; focus order matches visual order; focus trapped in sheets; focus moves to the meaningful element on navigation.
- **Dynamic Type:** scale to XXL; amounts wrap, never truncate; layouts reflow (no fixed-height text clipping) — tested at largest size in CI snapshot.
- **Motion:** `prefers-reduced-motion` → cross-fades, no parallax/spring/celebrate; nothing conveyed by motion alone.
- **Color:** never the sole channel — risk/status always icon + label + color; colorblind-safe semantic hues verified (deuteranopia/protanopia sims in review).
- **Alternatives:** charts have data-table read-out; hold-to-confirm has a switch-control alternative; voice intent has full typed parity; QR/scan flows have manual entry.
- **Captions:** NFT video/audio players support captions where present.

## 5. Internationalization

- **Launch languages:** English, Hindi, Hinglish (romanized) recognition in the intent parser (input); UI strings in English + Hindi at launch, framework ready for more. All copy externalized (no hardcoded strings — CI check).
- **Formatting:** numbers/dates/currency via ICU per locale; Indian grouping (1,00,000) supported; RTL layout support built into components (mirror on `dir=rtl`) even before an RTL language ships.
- **Copy constraints:** components tested at +40% string length (German/Tamil expansion) — no clipped buttons.
- **Currency display:** user's chosen display currency (fiat) is independent of asset; conversion rates carry source + staleness.

## 6. Content & tone

Voice: calm, plain, honest, second-person. Say "recovery phrase" not "seed"; "network fee" not "gas"; "convert" not "swap" in user copy (swap remains an internal term). Never hype in system surfaces. Numbers never dramatized. Errors apologize without groveling and always give the next step. Every irreversible action states its irreversibility once, clearly, before it happens.
