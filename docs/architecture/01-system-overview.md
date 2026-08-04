# 01 — System Overview

## 1. Context diagram (who talks to the system)

```mermaid
flowchart TD
    U["User (mobile / web / extension)"]
    DEV["3rd-party developers (SDK / Enterprise API)"]
    subgraph IW["Universal Intent Wallet Platform"]
        CLIENT["Client apps (keys live HERE)"]
        PLATFORM["Cloud platform (plans, observes, relays - CANNOT sign)"]
    end
    CHAINS["Blockchains: BTC, 6 EVM chains, Solana"]
    VENDORS["External: RPC providers, swap/bridge APIs, price feeds, LLM API, push services, screening lists"]

    U --> CLIENT
    DEV --> PLATFORM
    CLIENT <--> PLATFORM
    CLIENT -- "signed txs (via platform relay)" --> CHAINS
    PLATFORM <--> VENDORS
    PLATFORM -- "read + broadcast only" --> CHAINS
```

The one sentence that defines the trust model: **the client holds keys and signs; the platform parses, plans, quotes, relays, and watches — it can never move funds.**

## 2. Container diagram (Stage C target)

```mermaid
flowchart TD
    subgraph DEVICE["User device - trust zone 0"]
        APP["Mobile / Web app"]
        CORE["@intent-wallet/core<br/>keys, vault, signing"]
        APP --> CORE
    end

    subgraph EDGE["Edge - trust zone 1"]
        CDN["CDN (static, token metadata)"]
        WAF["WAF + DDoS shield"]
        GW["API Gateway<br/>authn, rate limit, routing"]
        WSG["WS Gateway<br/>500k conns, fan-out"]
    end

    subgraph SVC["Services - trust zone 2"]
        INT["Intent Service"]
        AIG["AI Gateway"]
        POR["Portfolio Service"]
        WAL["Wallet Registry Service"]
        EXE["Execution Engine"]
        ROU["Route Optimizer"]
        RIS["Risk Engine"]
        PRI["Price Service"]
        GAS["Gas Service"]
        NOT["Notification Service"]
        AUD["Audit Service"]
        ANA["Analytics Ingest"]
    end

    subgraph DATA["Data plane - trust zone 3"]
        PG[("PostgreSQL<br/>system of record")]
        RED[("Redis<br/>cache, rate limits, sessions")]
        KAF[("Kafka<br/>event backbone")]
        CH[("ClickHouse<br/>analytics")]
        S3[("Object storage<br/>encrypted backups, exports, models")]
    end

    subgraph CHAINACC["Chain access layer"]
        IDX["Indexers (per chain)"]
        RPCPOOL["ProviderPools (per chain)"]
        SIM["Simulation nodes (anvil fleet, sol sim)"]
    end

    LLM["Claude API"]
    AGG["Swap/bridge aggregators"]
    FEEDS["Price feeds"]
    CHAINSX["Blockchains"]

    APP --> CDN
    APP --> WAF --> GW
    APP <--> WSG
    GW --> INT & POR & WAL & RIS & NOT
    INT --> AIG --> LLM
    INT --> ROU
    ROU --> AGG
    ROU --> GAS & PRI & RIS
    EXE --> RPCPOOL --> CHAINSX
    EXE --> SIM
    IDX --> CHAINSX
    IDX --> KAF
    PRI --> FEEDS
    SVC <--> PG & RED
    SVC --> KAF
    KAF --> POR & NOT & AUD & ANA & EXE
    ANA --> CH
    KAF -- "push topics" --> WSG
```

## 3. Service communication rules

| Path                            | Mechanism                                                            | Why                                                         |
| ------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Client → platform               | HTTPS/JSON + WSS                                                     | ubiquity, debuggability                                     |
| Gateway → services              | HTTP/JSON (internal), gRPC only where profiled hot (Portfolio→Price) | one mental model; gRPC is an optimization, not a default    |
| Service → service (commands)    | direct HTTP with circuit breakers, timeouts, retries w/ jitter       | synchronous only when the caller truly needs the answer now |
| Service → service (facts)       | Kafka events via outbox                                              | facts are broadcast, never point-to-point                   |
| Anything → money-movement state | ONLY via Execution Engine consuming `plan.approved` events           | single writer for execution state                           |

Communication invariants:

- Every request carries `x-request-id` (trace id) end-to-end; every event carries `correlation_id` = originating intent id.
- Sync calls have a per-hop timeout budget that sums to less than the edge timeout (edge 10 s → gateway 9 s → service 7 s → dependency 5 s).
- No service reads another service's tables. Ever. Data crosses boundaries as APIs or events.

## 4. Event flow overview

```mermaid
flowchart LR
    subgraph Producers
        IDX2["Indexers"]
        INT2["Intent Svc"]
        EXE2["Execution Engine"]
        RIS2["Risk Engine"]
        PRI2["Price Svc"]
    end
    subgraph KafkaTopics["Kafka topics (partition key)"]
        T1["chain.events.v1 (identity)"]
        T2["intent.lifecycle.v1 (intent_id)"]
        T3["execution.steps.v1 (execution_id)"]
        T4["risk.flags.v1 (subject)"]
        T5["price.ticks.v1 (asset)"]
        T6["notify.outbox.v1 (identity)"]
    end
    subgraph Consumers
        POR2["Portfolio (projections)"]
        NOT2["Notifications"]
        AUD2["Audit (append-only)"]
        ANA2["Analytics to ClickHouse"]
        WSG2["WS Gateway (user push)"]
        EXE3["Execution Engine (sagas)"]
    end
    IDX2 --> T1 --> POR2 & EXE3 & ANA2
    INT2 --> T2 --> AUD2 & ANA2 & NOT2
    EXE2 --> T3 --> POR2 & NOT2 & AUD2 & ANA2
    RIS2 --> T4 --> NOT2 & AUD2
    PRI2 --> T5 --> POR2 & WSG2
    NOT2 --> T6 --> WSG2
```

Bus discipline (full topic catalog in [03-data.md](03-data.md)):

- **Outbox pattern** — producers write event + state in one Postgres tx; a relay publishes to Kafka. No dual-write bugs.
- **Consumer idempotency** — every consumer keeps a processed-set keyed by event id (Redis + periodic compaction to PG).
- **DLQ per consumer group** with replay tooling; alerts on DLQ depth > 0 for money-path topics.
- **Schema registry** — Zod schemas versioned in `packages/events`; producers may only add optional fields within a major version.

## 5. What runs where per evolution stage

| Component                       | Stage A (monolith)      | Stage B           | Stage C                                             |
| ------------------------------- | ----------------------- | ----------------- | --------------------------------------------------- |
| Gateway/auth/rate-limit         | module in `api`         | dedicated gateway | dedicated + regional                                |
| Intent, Wallet Registry, Risk   | modules in `api`        | modules in `api`  | services                                            |
| Portfolio                       | module in `api`         | service           | service, regional read replicas                     |
| Execution Engine                | `worker` process        | service           | service, single-writer region                       |
| Indexers                        | pods (already separate) | pods              | pods + Rust rewrite for Solana if profiling demands |
| Price, Gas                      | modules in `worker`     | service (shared)  | services                                            |
| Bus                             | Redis Streams           | Kafka (MSK)       | Kafka multi-region (MirrorMaker)                    |
| Notifications, Analytics, Audit | modules in `worker`     | worker split      | services                                            |

The monolith is a _packaging_ choice, not an architecture choice: module boundaries, event contracts, and data ownership are identical across stages, so splitting is a deploy change plus a bus migration — not a rewrite.
