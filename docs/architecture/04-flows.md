# 04 — Key Flows (Sequence Diagrams)

## 1. Onboarding & wallet-native auth (SIWE-style)

```mermaid
sequenceDiagram
    autonumber
    participant App as App (device)
    participant Core as core (keys)
    participant GW as Gateway
    participant Auth as Identity/Auth
    participant Reg as Wallet Registry
    participant Idx as Indexers

    App->>Core: generate mnemonic + universal identity
    Core-->>App: 3 addresses (BTC / EVM / SOL)
    Note over App,Core: backup flow + vault seal happen on-device only
    App->>GW: POST /v1/auth/challenge {evm_address}
    GW->>Auth: forward
    Auth-->>App: nonce challenge (5 min TTL)
    App->>Core: sign challenge (EIP-191)
    Core-->>App: signature
    App->>GW: POST /v1/auth/verify {signature, device_pubkey}
    GW->>Auth: verify sig == address owner
    Auth-->>App: JWT (15 min) + refresh (device-bound)
    App->>GW: POST /v1/identities {btc, evm, sol}
    GW->>Reg: register
    Reg--)Idx: identity.registered.v1 (watch these addresses)
    Reg-->>App: identity_id
    Idx->>Idx: backfill history + subscribe
```

Failure notes: challenge replay is blocked by single-use nonce; verify failures rate-limit by address+IP; registration is idempotent on the address triple.

## 2. Portfolio load (hot read path)

```mermaid
sequenceDiagram
    autonumber
    participant App
    participant GW as Gateway
    participant Por as Portfolio
    participant R as Redis
    participant PG as Postgres (projection)
    participant Pr as Price

    App->>GW: GET /v1/portfolio/:id (JWT)
    GW->>Por: forward (authz: identity ownership)
    Por->>R: HGETALL pf:{id}
    alt cache hit (common)
        R-->>Por: balances snapshot
    else miss
        Por->>PG: read projection
        PG-->>Por: rows (+ as_of)
        Por->>R: fill cache (60 s TTL, singleflight)
    end
    Por->>Pr: batch prices (gRPC, 50 ms budget)
    Pr-->>Por: prices + staleness flags
    Por-->>App: unified portfolio {total, assets[], as_of, stale?}
    Note over App: WS pushes portfolio.changed + price ticks afterwards
```

## 3. Intent execution — "Convert my BTC to ETH" (the flagship flow)

```mermaid
sequenceDiagram
    autonumber
    participant App
    participant Core as core (signs)
    participant Int as Intent Svc
    participant AI as AI Gateway
    participant Ro as Route Optimizer
    participant Ri as Risk
    participant Ex as Execution Engine
    participant Ch as Chains (via ProviderPools)
    participant Idx as Indexers

    App->>Int: POST /v1/intents/parse {"convert my BTC to ETH"}
    Int->>Int: deterministic fast-path? (no — LLM path)
    Int->>AI: parse-intent (schema-forced tool use)
    AI-->>Int: Intent{swap, from: BTC(all), to: ETH} | clarification
    Int->>Int: resolve balances, validate against portfolio
    Int-->>App: parsed intent (mirrors amounts verbatim)

    App->>Int: POST /v1/intents/:id/plan
    Int->>Ro: route search (BTC→ETH)
    Ro->>Ro: quote venues (bridge + swap legs, 1.5 s budget)
    Ro-->>Int: top route: BTC→wBTC (bridge), wBTC→ETH (swap)
    Int->>Ri: scan route (venues, tokens, addresses)
    Ri-->>Int: RiskReport LOW
    Int-->>App: Plan {steps, fees, minReceived, ETA, risk, expires 30 s}

    App->>App: render confirm sheet (decoded effects)
    App->>Core: sign leg 1 (PSBT) + auth for leg 2 mode
    Core-->>App: signatures
    App->>Int: POST /v1/plans/:id/approve {signatures}
    Int--)Ex: plan.approved (outbox → bus)
    Int-->>App: execution_id

    Ex->>Ch: simulate + broadcast leg 1 (BTC bridge deposit)
    Ch-->>Ex: txid
    Ex--)App: step 1 broadcast (WS)
    Idx--)Ex: chain.events: deposit confirmed
    Ex->>Ex: verify invariant (bridged amount ≥ quoted min)
    alt leg 2 pre-authorized (exact build possible)
        Ex->>Ch: broadcast pre-signed swap
    else device round-trip required
        Ex--)App: "Step 2 ready — confirm" (push)
        App->>Core: sign leg 2
        App->>Ex: submit signature
        Ex->>Ch: broadcast swap
    end
    Idx--)Ex: swap confirmed
    Ex->>Ex: final invariant: received ETH ≥ minReceived
    Ex--)App: execution.completed (WS + push)
    Ex--)Ex: emit events → Portfolio updates, Audit, Analytics
```

## 4. Recurring intent — "Buy ETH every Monday" (honest automation)

```mermaid
sequenceDiagram
    autonumber
    participant App
    participant Core
    participant Int as Intent Svc
    participant Sch as Scheduler (in Execution Engine)
    participant Ex as Execution Engine

    App->>Int: parse "buy ETH every Monday with 50 USDC"
    Int-->>App: RecurringIntent {schedule: weekly Mon, cap 50 USDC}
    Note over App,Core: automation requires bounded authorization
    App->>Core: create session key (ERC-4337 smart account)<br/>limits: 50 USDC/week, venue allowlist, 90-day expiry
    Core-->>App: session key authorization (user signs ONCE)
    App->>Int: approve recurring plan template + session key ref
    Int--)Sch: schedule created
    loop every Monday
        Sch->>Int: instantiate plan (fresh quote, fresh risk scan)
        Int->>Ex: plan within session-key bounds?
        alt within bounds
            Ex->>Ex: execute via session key (no device round-trip)
            Ex--)App: receipt push
        else out of bounds (price moved, risk raised)
            Ex--)App: "needs your confirmation" push
        end
    end
```

The rule stated to users plainly: **no session key → every execution asks the device.** Automation depth always equals authorization depth; BTC/SOL legs (no session keys) always round-trip.

## 5. Mid-route failure & recovery (park, never strand)

```mermaid
sequenceDiagram
    autonumber
    participant Ex as Execution Engine
    participant Ro as Route Optimizer
    participant Ch as Chains
    participant App

    Note over Ex: leg 1 done (funds now wBTC on Ethereum),<br/>leg 2 (swap) fails: quote expired + venue degraded
    Ex->>Ex: classify: retryable? quote-expired
    Ex->>Ro: re-quote remaining route (wBTC→ETH)
    alt fresh route within slippage policy
        Ro-->>Ex: new quote
        Ex--)App: "route updated: you'll receive 0.610 ETH (was 0.612) — approve?"
        App->>Ex: approve (device signature)
        Ex->>Ch: execute new leg
    else no acceptable route
        Ex->>Ex: PARK: funds stay as wBTC (documented safe state)
        Ex--)App: "Paused: your 0.021 wBTC is safe on Ethereum.<br/>Resume when you're ready." + resume CTA
        Ex--)Ex: execution.parked event → Audit + Analytics
    end
    Note over Ex: invariant record: pre/post balances per step —<br/>funds location is ALWAYS known and shown
```

Design commitments encoded above: re-quotes that worsen the user's outcome always re-confirm; parking is a first-class terminal state with a resume path, not an error; every state transition is an event (auditable, replayable).
