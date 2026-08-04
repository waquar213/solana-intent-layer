# 09 — User Journeys

End-to-end journeys tying screens together, including the edge cases that separate a real product from a demo. Screen ids reference [04](04-screens-onboarding.md)–[07](07-screens-settings.md).

## J-1 First run → first deposit (the "aha")

```mermaid
flowchart TD
    A["S-02 Welcome"] --> B["S-03 Create (keys on device)"]
    B --> C{"Back up now?"}
    C -- yes --> D["S-05 Reveal → S-06 Quiz"]
    C -- later --> E["Home + backup banner"]
    D --> F["S-07 Biometric + PIN"]
    F --> G["S-13 Receive — 3 addresses reveal ✨"]
    G --> H["Home (empty state)"]
    E --> H
    H --> I["Funds arrive → Indexer → push"]
    I --> J["Row glows, balance ticks up, haptic"]
    J --> K["Contextual nudge: 'Back up now to keep it safe' (if deferred)"]
```

Success metric: time-to-first-receive-address < 60 s; the address-reveal is the designed wow moment (only 3, chains invisible).

## J-2 Flagship intent: "Convert my BTC to ETH"

```mermaid
flowchart TD
    A["S-20 type/say intent"] --> B["Assistant mirrors: 'all BTC ~$2,100 → ETH?'"]
    B --> C{"Confident?"}
    C -- no --> D["Clarify chip: amount? all/half/custom"]
    C -- yes --> E["PlanCard renders (route, fees, risk, 30s ring)"]
    D --> E
    E --> F["S-21 ConfirmSheet (simulation-gated)"]
    F --> G{"Approve (Face ID)"}
    G -- decline --> E
    G -- approve --> H["S-22 StepTracker: move BTC"]
    H --> I{"Leg 2 pre-authorized?"}
    I -- yes --> J["auto swap"]
    I -- no --> K["push: 'Step 2 ready' → sign"]
    J --> L["S-23 Receipt: received ≥ min"]
    K --> L
    L --> M["Home updates; 'Do this weekly?' seed"]
```

## J-3 Intent with a scam token (risk journey)

```mermaid
flowchart TD
    A["'Swap my USDC for MOONX'"] --> B["Resolver finds MOONX token"]
    B --> C["Risk Engine: created 2d ago, 12% sell tax, low liq"]
    C --> D{"Level"}
    D -- HIGH --> E["PlanCard with HIGH RiskBadge + reasons"]
    E --> F["ConfirmSheet: hold-to-confirm 800ms + typed word"]
    F --> G{"User proceeds?"}
    G -- no --> H["Cancelled, no funds moved"]
    G -- yes --> I["Executes (user informed & consented)"]
    D -- BLOCK --> J["Block banner, no CTA, 'Why' + Report"]
```

Design intent: friction scales with risk; BLOCK is honest and unoverridable on default policy; we never hide a bad token behind a smooth flow.

## J-4 Mid-route failure → park → resume

```mermaid
flowchart TD
    A["Executing leg 2 (swap)"] --> B{"Failure"}
    B -- quote expired --> C["Auto re-quote remaining route"]
    C --> D{"Within slippage?"}
    D -- yes, worse --> E["Inline mini-ConfirmSheet: 'You'll get 0.002 less — ok?'"]
    D -- yes, same/better --> F["Continue silently (never worse silently)"]
    D -- no route --> G["PARK: funds safe as wBTC on Ethereum"]
    E -- approve --> F
    E -- decline --> G
    G --> H["S-22 parked card + push 'Paused safely'"]
    H --> I["User taps Resume anytime → fresh quote → finish"]
    F --> J["S-23 Receipt"]
```

The promise encoded: funds location is ALWAYS known and shown; parking is calm, not an error; resume is one tap.

## J-5 Send to a saved contact ("Send $100 to Rahul")

```mermaid
flowchart TD
    A["Intent or S-14 form"] --> B{"'Rahul' resolves?"}
    B -- one match --> C["Use Rahul ·da94 (verified ✓)"]
    B -- multiple --> D["Chip: which Rahul?"]
    B -- none --> E["'No contact named Rahul — scan or paste?'"]
    C --> F["Amount $100 → ConfirmSheet"]
    D --> F
    F --> G["Face ID → send → receipt"]
    G --> H["Contact marked 'verified by prior send'"]
```

## J-6 Recurring buy (honest automation)

```mermaid
flowchart TD
    A["'Buy $50 of ETH every Monday'"] --> B["S-34 recurring template pre-filled"]
    B --> C["Authorization: create session key<br/>bounds: ≤$50/wk, ETH-buy only, 90d"]
    C --> D["User signs ONCE"]
    D --> E["Each Monday: fresh quote + risk scan"]
    E --> F{"Within bounds & risk ok?"}
    F -- yes --> G["Execute via session key (no prompt) → receipt push"]
    F -- no --> H["'Needs you' notification → manual confirm"]
    D --> I["Anytime: Pause / Edit(re-auth) / Revoke(on-chain)"]
```

## J-7 Lost phone → recovery

```mermaid
flowchart TD
    A["New phone, S-02"] --> B["'I already have a wallet'"]
    B --> C["S-08 enter recovery phrase"]
    C --> D["Derive identities → sweep balances<br/>'Your money is already safe'"]
    D --> E{"Cloud backup blob found?"}
    E -- yes --> F["Passphrase → restore contacts/prefs"]
    E -- no --> G["Skip — funds already restored"]
    F --> H["Re-register device + 'sign out old phone' ON"]
    G --> H
    H --> I["S-07 biometric/PIN → Home restored"]
```

## Cross-journey guarantees (tested as journeys, not just screens)

- Any journey can be abandoned before signature with zero consequence and no scary dialog.
- Any money-moving journey shows the same ConfirmSheet anatomy (recognition = safety).
- Backgrounding any execution continues it server-side and reports via push + Live Activity.
- Every journey has a defined offline behavior and a defined LLM-down behavior (forms fallback).
