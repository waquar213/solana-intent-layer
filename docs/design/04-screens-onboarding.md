# 04 — Screens: Onboarding, Security Setup, Unlock, Recovery

Spec format per screen: Purpose · Layout (ASCII wireframe) · Components · Actions · Validation · Loading · Errors · Empty · A11y · Motion/Micro-interactions.

---

## S-01 Splash

- **Purpose:** brand beat while vault presence is checked (< 800 ms budget, never a gate).
- **Layout:** centered logomark on `bg.canvas`; no text, no spinner (that fast or we fix the code).
- **Motion:** logomark scales 0.94→1.0 with `motion.standard`; cross-fades into Welcome or Unlock.
- **A11y:** decorative; skipped by screen readers.

## S-02 Welcome

- **Purpose:** one promise + fork: create vs import. Zero crypto jargon.

```
┌──────────────────────────────┐
│                              │
│        ◆ (logomark)          │
│   Money that understands     │
│           you.               │
│  Ask in your own words —     │
│  we handle the rest.         │
│                              │
│  ● ○ ○  (3 value slides)     │
│                              │
│ ┌──────────────────────────┐ │
│ │      Create wallet       │ │  ← primary
│ └──────────────────────────┘ │
│    I already have a wallet   │  ← tertiary
│  Terms · Privacy (footnote)  │
└──────────────────────────────┘
```

- **Components:** carousel (3 slides, auto 5 s, swipeable), Button primary/tertiary.
- **Actions:** Create → S-03; Import → S-08; legal links → in-app browser.
- **A11y:** carousel announces slide x of 3; auto-advance pauses when VoiceOver active.
- **Micro:** slide illustrations parallax 8 px; reduced-motion: static.

## S-03 Create Wallet (generating)

- **Purpose:** generate keys ON DEVICE with visible honesty; set expectations for backup.
- **Layout:** full-screen moment: animated key glyph, "Creating your wallet…" then checklist ticks: "Keys generated on this phone ✓ · Never sent anywhere ✓".
- **Loading:** the generation IS the screen (~1 s incl. deliberate 600 ms floor so the promise lands).
- **Errors:** entropy/keystore failure (rare) → full error state "Couldn't create a wallet on this device" + Retry + Support; never auto-retry silently.
- **Motion:** checklist ticks stagger 120 ms with `motion.celebrate` on last; haptic notification-success.
- → auto-advances to S-04.

## S-04 Secure This Wallet (backup pitch)

- **Purpose:** convert to backup NOW; allow explicit deferral without shame-tricks.

```
│  🛡  Your wallet, your keys   │
│  A 12-word recovery phrase   │
│  is the ONLY way back in if  │
│  you lose this phone.        │
│  We can't recover it for you.│
│ [    Back up now (2 min)   ] │
│ [      Do it later        ]  │  ← secondary, honest
```

- **Actions:** Back up now → S-05; Later → biometric setup S-07 then Home with persistent banner (nudge schedule: after first deposit, then weekly — capped, respectful).
- **A11y:** the "only way back" sentence is a heading — screen readers must not skip it.

## S-05 Recovery Phrase Reveal

- **Purpose:** show the phrase for manual backup with maximal privacy hygiene.

```
│  Write these 12 words down   │
│  in order. Anyone with them  │
│  controls your money.        │
│ ┌────────┬────────┬───────┐  │
│ │1 abandon│2 ability│3 able │  │
│ │  ...        ...      ... │  │
│ └────────┴────────┴───────┘  │
│  ⚠ Screenshots are disabled  │
│ [        I wrote it down   ] │
```

- **Components:** PhraseGrid (mono, numbered wells), warning footnote.
- **Behavior/Validation:** words hidden until "Hold to reveal" (400 ms); screen flagged secure (FLAG_SECURE / capture-blocked); blur instantly on app-switcher; clipboard copy NOT offered; reveal requires biometric if set.
- **Errors:** screen-recording active → hard block panel "Stop screen recording to continue".
- **A11y:** VoiceOver reads word-by-word on explicit swipe only (never auto-read); each well is one element ("Word 3: able").
- **Micro:** reveal is a fast fade (no fancy flip — this screen is solemn).

## S-06 Phrase Quiz

- **Purpose:** verify the backup actually happened (3 random positions).
- **Layout:** "Which word was #7?" + 6 choice chips (1 correct + 5 from wordlist) × 3 rounds; progress dots.
- **Validation:** wrong pick → chip shakes, "Not quite — check your paper" (never reveals the right answer); 3 total misses → return to S-05.
- **Micro:** correct pick: chip fills success + tick draw-on; haptic selection.
- → S-07.

## S-07 Biometric & PIN Setup

- **Purpose:** local unlock factors. PIN is REQUIRED (biometric can fail); biometric optional on top.
- **Layout:** Face/Touch ID pitch card → system prompt; then PIN create (6 digits, NumericKeypad) → repeat to confirm.
- **Validation:** PIN repeat mismatch → shake + clear second entry; trivial PINs (000000, 123456, single-digit repeats) rejected with "Choose something harder to guess"; PIN never stored raw ([architecture 06](../architecture/06-security.md) — vault key derivation).
- **Errors:** biometric enrollment absent → skip card gracefully ("You can turn this on later in Security").
- **A11y:** keypad targets 64 pt; PIN dots announced as "3 of 6 entered".
- → S-13 Universal Address Reveal ([05-screens-home.md](05-screens-home.md)) → Home.

## S-08 Import Wallet

- **Purpose:** restore from a 12/24-word phrase with forgiving input.

```
│  Enter your recovery phrase  │
│ ┌──────────────────────────┐ │
│ │ [phrase input area —     │ │
│ │  chips form as you type] │ │
│ └──────────────────────────┘ │
│  suggestions: aba… abandon   │
│  12 words ✓ · checksum ✓     │
│ [         Continue         ] │
```

- **Components:** phrase input (word chips, autosuggest from BIP-39 list after 2 chars), live counter/checksum line.
- **Validation (live, per [08-standards.md](08-standards.md) §1.1):** lowercase/trim/collapse spaces automatically; non-wordlist word → chip turns danger with suggestion; paste of full phrase → chips explode in with a "Clipboard cleared" toast (we clear it); checksum fail at 12/24 → "These words aren't quite right — check word order".
- **Loading:** Continue → restoring state: "Finding your accounts…" (address derivation + balance sweep, skeleton list of discovered assets).
- **Errors:** zero balances found → still succeeds, info panel "Empty wallet imported — was that the right phrase?" with re-enter option.
- **A11y:** suggestions navigable; checksum status is a live region.
- → S-07 (biometric/PIN) → Home.

## S-09 Unlock

- **Purpose:** fast re-entry; biometric-first.
- **Layout:** logomark, masked-identity hint ("Wallet ·da94"), biometric auto-prompt on appear; PIN keypad below as fallback.
- **Validation/Errors:** failed PIN → shake + "4 attempts left"; attempt 5 → 30 s cooldown with countdown; attempt 8 → 5 min; wipe-after-10 only if user opted in (Security Center) — warning shown at attempt 8 ("2 attempts before this wallet is removed from this device").
- **A11y:** cooldown timer is a live region; biometric failure falls to PIN with focus moved.
- **Micro:** unlock success: lock glyph → checkmark morph 300 ms, haptic light.

## S-10 Recovery Flow (lost device / new phone)

- **Purpose:** the calm path back: import phrase (S-08) → detect previous cloud-registered identity → restore preferences/contacts from encrypted backup blob (passphrase prompt) → re-register device, revoke old device sessions with one switch ("Sign out my old phone — recommended ON").
- **Errors:** wrong backup passphrase → "That passphrase doesn't open this backup" (3 tries, then skip option — funds are already restored via phrase; only metadata is at stake, and we say exactly that).
- **A11y/Emotion:** copy is reassurance-first: "Your money is already safe. Let's set your phone back up."
