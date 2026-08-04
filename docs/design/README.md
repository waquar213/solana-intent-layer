# Product Design — "Calm Money" Design Language

> **Status:** v1.0 (2026-07-05) · Owners: CPO/Design · Pairs with [requirements.md](../../requirements.md) §3 and [docs/architecture/](../architecture/README.md).
> **Goal:** the easiest crypto wallet in the world — closer to Apple Wallet than to MetaMask. Detailed enough to build directly in Figma and code without follow-up questions.
>
> **Founder Bible · Volume III:** the [Design System Reference](design-system-reference.md) (~34.9k words) is the buildable expansion of [Chapter 3 — the Apple-Level Design System charter](../bible/chapter-03-design-system.md) — real token values + full component state matrices + the AI chat UI, tagged shipped/proposed. This "Calm Money" set (below) is the V2 design language it consolidates and grounds against.

## Document map

| Doc                                                  | Contents                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [01-tokens.md](01-tokens.md)                         | Color, typography, spacing, radius, elevation, motion, haptics, icons — the token source of truth |
| [02-components.md](02-components.md)                 | Reusable component library: anatomy, variants, states, accessibility per component                |
| [03-navigation.md](03-navigation.md)                 | Information architecture, tab model, navigation flows, deep links                                 |
| [04-screens-onboarding.md](04-screens-onboarding.md) | Splash → create/import → backup → biometric/PIN → unlock → recovery                               |
| [05-screens-home.md](05-screens-home.md)             | Home/portfolio, asset detail, NFTs, send, receive, QR, contacts, watchlist                        |
| [06-screens-intent.md](06-screens-intent.md)         | Intent chat, plan confirmation, execution progress, activity, notifications                       |
| [07-screens-settings.md](07-screens-settings.md)     | Settings, security center, devices, connected apps, automation, alerts, staking, developer mode   |
| [08-standards.md](08-standards.md)                   | Validation rules, loading/empty/error state system, error→UI mapping, accessibility, i18n         |
| [09-journeys.md](09-journeys.md)                     | End-to-end user journeys with edge cases (Mermaid)                                                |

Wireframe notation: screen layouts use ASCII frames (unambiguous, diffable); every _flow_ (navigation, journeys) uses Mermaid.

## Design principles (binding — reviews cite these by number)

1. **One thing per screen.** Every screen has exactly one primary action. If a screen needs two, it's two screens or a sheet.
2. **Assets, not chains.** Chain names never appear at the top level. They live one tap deep (asset detail → "where it lives") and inside technical receipts. A user can complete every core journey without reading a chain name.
3. **Numbers you can trust.** Amounts use tabular figures, defined rounding ([08-standards.md](08-standards.md) §1.4), and full precision on tap. We never round in the user's disfavor on a confirm screen.
4. **The confirm sheet is sacred.** One anatomy for every value-moving confirmation, everywhere ([02-components.md](02-components.md) §ConfirmSheet). Users must be able to recognize it with their eyes half-closed — that recognition IS the anti-phishing defense.
5. **Risk is loud; everything else is quiet.** The interface is near-monochrome so that semantic color (risk, success, danger) carries unmissable meaning. Never color-only: always icon + label + color.
6. **Feels native.** System fonts, platform navigation conventions, platform biometric prompts. The wallet should feel like the OS made it.
7. **Never a dead end.** Every error state names the problem in plain language and offers the next step. Every empty state teaches the one action that fills it.
8. **Perceived speed is speed.** Skeletons within 100 ms, optimistic UI where safe (never for money movement), spinners only inside buttons, stale data labeled rather than hidden.
9. **Trust through transparency, not jargon.** Fees are totals in fiat first ("Total cost: $21.30 (1.01%)"), decomposable on tap. "We route through 2 steps" — not "bridging via canonical wBTC."
10. **Automation depth = authorization depth.** The UI never implies the wallet can act beyond what the user cryptographically granted ([architecture 09 D20](../architecture/09-decisions.md)).

## Platform conventions

| Concern    | iOS                                                       | Android                                        |
| ---------- | --------------------------------------------------------- | ---------------------------------------------- |
| Typeface   | SF Pro (system)                                           | Roboto / system                                |
| Navigation | edge-swipe back, large titles collapse on scroll          | predictive back, Material top app bar behavior |
| Biometrics | Face ID sheet (system)                                    | BiometricPrompt (system)                       |
| Haptics    | UIFeedbackGenerator map ([01-tokens.md](01-tokens.md) §7) | VibrationEffect equivalents                    |
| Share/QR   | system share sheet                                        | system share sheet                             |

One design language, two accent behaviors: platform components are used where the OS provides them (biometric prompts, share sheets, permission dialogs) — we never re-skin OS security surfaces.
