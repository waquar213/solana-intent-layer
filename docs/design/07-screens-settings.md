# 07 — Screens: Settings, Security, Automation, Alerts, Staking, Developer

## S-30 Settings Root

```
│  Settings                    │
│  🧑 Wallet ·da94        edit ▸│
│  ── Security ──────────────  │
│  🛡 Security Center         ▸│
│  📱 Devices                 ▸│
│  🔗 Connected apps          ▸│
│  ── Money ─────────────────  │
│  🔁 Automation              ▸│
│  🔔 Price alerts            ▸│
│  🥩 Staking                 ▸│
│  👤 Contacts                ▸│
│  ── Preferences ───────────  │
│  💱 Currency (USD)          ▸│
│  🌐 Language                ▸│
│  🎨 Appearance (System)     ▸│
│  ── Advanced ──────────────  │
│  ⚙ Networks (advanced)      ▸│ ← hidden unless "advanced" toggled on
│  </> Developer mode         ▸│
│  ── About ─────────────────  │
│  Help · Legal · v1.0 (build) │
└──────────────────────────────┘
```

- **A11y:** grouped lists with header semantics; version row long-press copies diagnostics (support).

## S-31 Security Center

- **Rows:** Backup status (green ✓ / amber "Not backed up" → S-05) · Change PIN · Biometric toggle · Auto-lock (Immediately / 1 / 5 / 15 min / 1 hr) · App-switcher privacy blur (on) · Wipe-after-10-fails (off, with stern explainer) · Transaction guard threshold ("Require typed confirm above $___") · Reveal recovery phrase (biometric + 3 s hold gate, secure screen S-05 rules) · Export private keys (advanced, heavy friction: biometric + typed "EXPORT" + solemn copy).
- **Validation:** destructive toggles (wipe-after-10) show consequence copy and require a confirm sheet.
- **A11y:** each security state is a labeled switch/row with current value spoken.

## S-32 Devices

- **List:** this device (highlighted) + other signed-in devices: name, platform, last active, location-ish (city from IP, clearly "approximate").
- **Actions:** "Sign out" per device; "Sign out all others" (prominent) → revokes sessions ([architecture 06](../architecture/06-security.md)); this cannot move funds, only ends read/notification sessions — copy says so.
- **Empty:** single device → "Only this phone is signed in."

## S-33 Price Alerts

- **Create:** asset picker → condition (above/below price, or % move) → AmountInput/percent → save.
- **List:** per-alert row with live distance-to-trigger; toggle on/off; swipe delete.
- **Behavior:** rate-collapsed notifications ([architecture 02 §2.13](../architecture/02-services.md)); triggered alert deep-links to asset detail.
- **Empty:** "Get notified when a price hits your target."

## S-34 Automation / Recurring

- **Purpose:** recurring buys, DCA, rules ("exit to stables if BTC drops 15%") — the honest-automation surface.

```
│  Automation                  │
│  🔁 Buy ETH · $50 weekly     │
│     Mon · via session key ✓  │
│     next: Mon → uses ≤$50    │
│  + New automation            │
```

- **Create flow:** template (Recurring buy / DCA / Rule) → parameters → **authorization step**: for EVM, create/confirm a session key with visible bounds ("Allows: up to $50/week to buy ETH · expires in 90 days · revoke anytime"); for BTC/SOL, explain "we'll ask you to confirm each time" (no false automation). One user signature grants it.
- **Detail:** bounds, next run, run history (each = an Activity entry), [Pause] [Edit bounds → re-auth] [Revoke] (revoke is one tap, on-chain for session keys, confirmed).
- **Errors:** a scheduled run that exceeds bounds or hits raised risk → does NOT auto-execute → "Needs you" notification.
- **A11y:** bounds read as a plain sentence; revoke is clearly destructive.
- **Emotion/Trust:** this screen exists to make automation legible — never a black box. Every automation states exactly what it may do and its expiry.

## S-35 Staking

- **Discover:** eligible assets with est. APR (source + "estimate, not guaranteed" footnote), risk level per option.
- **Stake flow:** amount → ConfirmSheet with unbonding period, rewards cadence, risk clearly stated → execution (StepTracker).
- **Positions:** staked amount, accrued rewards, unstake (with unbonding countdown), claim.
- **Validation:** keep-gas reservation; min-stake handling; slashing/lockup disclosures required before CTA.
- **Empty:** "Put idle assets to work — safely. We only list vetted options."

## S-36 Connected Apps (dApp sessions — later phase, designed now)

- Sessions list (dapp icon, domain, permissions granted, last used); per-session revoke; incoming connection request sheet (domain verification, requested permissions, risk check on the dapp); signing requests route through the standard ConfirmSheet with decoded effects.
- **Empty:** "Apps you connect to will appear here."

## S-37 Developer Mode

- **Gated:** off by default; enabling shows a "for advanced users" explainer.
- **Reveals:** testnet networks (Sepolia, Base Sepolia, BTC testnet, SOL devnet — switcher), raw transaction data view on confirms (hex + decoded side by side), custom RPC entry (with a security warning + validation), export logs (redacted), feature-flag inspector (read-only), address derivation-path viewer.
- **Networks (advanced) screen S-38:** enable/disable individual chains, reorder, add custom EVM chain (chainId + RPC + symbol validation, EIP-3085-style), reset to defaults. Hidden from normal users entirely (principle #2).
- **A11y/Safety:** custom RPC and testnet toggles carry persistent "you're in advanced mode" banners so users don't get lost outside the calm defaults.
