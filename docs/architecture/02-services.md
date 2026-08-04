# 02 — Service Catalog

Format per service: **Mission · Owns (data) · API (summary — full spec in [07-api.md](07-api.md)) · Events · Scaling · Failure & degradation · SLO**. "Stage A home" says where the module lives before it becomes a service ([01 §5](01-system-overview.md)).

---

## 2.1 API Gateway

- **Mission:** one front door — TLS termination, authn (JWT verification), coarse authz, rate limiting, request shaping, routing, problem+json error normalization.
- **Owns:** nothing durable. Rate-limit counters in Redis.
- **API:** none of its own; routes `/v1/*`.
- **Scaling:** stateless; HPA on CPU + p95; the layer everything else hides behind.
- **Failure:** if Redis rate-limit store is down → fail-open with conservative in-memory limits (availability over precision), alert loudly.
- **SLO:** added latency p95 < 10 ms; 99.95%.

## 2.2 Identity & Auth Service

- **Mission:** wallet-native auth (SIWE-style challenge/response signed by the device key), session issuance (15-min JWT + rotating refresh, device-bound), device registry, revocation.
- **Owns:** `users`, `devices`, `sessions` (revocation list in Redis).
- **API:** `POST /v1/auth/challenge`, `POST /v1/auth/verify`, `POST /v1/auth/refresh`, `POST /v1/auth/revoke`.
- **Events:** `auth.session.created/revoked` → Audit.
- **Scaling:** stateless; JWT verification is distributed (JWKS to gateway), only issuance hits this service.
- **Failure:** issuance down → existing sessions keep working (verification is local at gateway); refresh fails → clients re-auth when service returns. Read-only wallet functions (view portfolio via cached data) remain.
- **SLO:** p95 < 150 ms; 99.95%.
- **Stage A home:** `api` module.

## 2.3 Wallet Registry Service (non-custodial "Wallet Service")

- **Mission:** everything a custodial wallet-service would do EXCEPT keys: registry of identities (the BTC/EVM/SOL address triple), watch-list registration for indexers, encrypted-backup blob escrow (client-encrypted, opaque to us), contacts, preferences.
- **Owns:** `identities`, `contacts`, `backup_blobs` (S3 pointers + integrity hashes), `preferences`.
- **API:** `POST /v1/identities` (register/watch), `GET /v1/identities/:id`, contacts CRUD, `PUT /v1/backups` (opaque blob), `GET /v1/backups/latest`.
- **Events:** `identity.registered` → Indexers subscribe the addresses; `identity.contact.added` → Audit.
- **Scaling:** small write volume; read-heavy lookups cached in Redis.
- **Failure:** down → new registrations pause; existing users unaffected (indexers already have their watch-lists).
- **SLO:** p95 < 200 ms; 99.9%.
- **Security note:** backup blobs are AES-GCM ciphertext produced on-device with a key derived from the user's passphrase; we cannot decrypt them, and the API enforces size/type limits + integrity hashes. Losing them loses nothing (mnemonic backup remains the root recovery).
- **Stage A home:** `api` module.

## 2.4 Intent Service

- **Mission:** natural language (or structured UI action) → validated `Intent` → orchestrate plan creation → present plan → collect approval → hand to Execution. The product's brain-stem.
- **Owns:** `intents`, `plans`, `plan_steps` (quotes embedded), clarification threads.
- **API:** `POST /v1/intents/parse`, `POST /v1/intents/:id/plan`, `POST /v1/plans/:id/approve` (carries device signatures), `GET /v1/intents/:id`.
- **Events:** `intent.parsed`, `plan.created`, `plan.approved`, `plan.expired` (key: intent_id).
- **Pipeline:** deterministic pre-parser (regex/rules for the top ~40 utterance shapes — free, instant) → AI Gateway (Claude tool-use against the versioned intent JSON schema) → resolver (contacts, asset registry, balance checks via Portfolio) → Route Optimizer for plans → Risk Engine verdict attached → quote assembled with hard 30 s expiry.
- **Scaling:** stateless workers; LLM concurrency is the bottleneck → queue with per-user fairness, deterministic fast-path bypasses the queue.
- **Failure:** AI Gateway down → structured-form fallback (client renders send/swap forms; intents API accepts pre-structured intents so the product still works). Route Optimizer down → parse succeeds, planning returns 503 with retry-after.
- **SLO:** parse p95 < 2.5 s (LLM path) / < 150 ms (fast path); plan p95 < 3 s.
- **Stage A home:** `api` module.

## 2.5 AI Gateway

- **Mission:** the only service allowed to talk to LLM vendors. Model routing (sonnet for parse, haiku for classification), prompt-template registry (versioned, reviewed like code), response schema validation, prompt-injection defenses, per-user budgets, caching, eval telemetry.
- **Owns:** `prompt_templates` (versioned), `llm_calls` metadata (tokens, latency, template version — NEVER raw user text without consent flag), golden-set eval results.
- **API (internal only):** `POST /internal/ai/parse-intent`, `POST /internal/ai/classify`, `POST /internal/ai/explain-plan`.
- **Security:** user text is DATA — wrapped in delimited content blocks; no fund-moving tools exposed; output must validate against the intent Zod schema or it retries once then returns `clarification_needed`. Token metadata (names/symbols from chain data) is sanitized (length caps, unicode confusable stripping) before entering any prompt.
- **Failure:** vendor 5xx/timeout → single retry → degrade to `fast-path-only` mode flag consumed by Intent Service. Budget exhausted → forms fallback for that user with clear UI messaging.
- **SLO:** availability 99.9% for the _gateway_ (vendor availability is degradation-managed, not promised).
- **Stage A home:** `api` module.

## 2.6 Portfolio Service

- **Mission:** the unified "one number, one asset list" view: balances across all chains per identity, merged per-asset, priced, with per-chain provenance on expand. Serves the highest-QPS read path.
- **Owns:** balance projections (`balances` table + Redis hot cache), token metadata cache, activity timeline projection.
- **API:** `GET /v1/portfolio/:identityId`, `GET /v1/portfolio/:identityId/asset/:assetId`, `GET /v1/activity/:identityId`.
- **Events:** consumes `chain.events.v1` (balance deltas), `execution.steps.v1` (optimistic pending states), `price.ticks.v1`; produces `portfolio.changed.v1`.
- **Read path:** Redis hash per identity (TTL 60 s) → on miss, projection table → on cold identity, live RPC sweep via chain layer with a `stale: true` flag while it fills.
- **Scaling:** read replicas + Redis; projections are rebuildable from Kafka (disaster = replay, not restore).
- **Failure:** indexer lag → serve last projection with `as_of` timestamp and staleness banner; never fabricate zero balances (the #1 way wallets terrify users).
- **SLO:** p95 < 300 ms warm / < 2 s cold; 99.95%.
- **Stage A home:** `api` module (service from Stage B).

## 2.7 Blockchain Indexer (per ecosystem)

- **Mission:** chains → normalized `chain.events.v1`. Watches registered addresses: transfers (native, ERC-20, SPL), confirmations, reorgs.
- **Design:** one deployment per chain. Checkpointed cursor (block/slot) in PG; at-least-once emission (consumers dedupe). EVM: `eth_getLogs` windows + head tracking with `finalized` tag; BTC: block scan + mempool watch for incoming; SOL: websocket account subscriptions + slot polling with `finalized` commitment.
- **Reorg handling:** events below finality carry `provisional: true`; a reorg emits compensating `chain.event.reverted` — Portfolio projections apply/unapply; UI shows "confirming (n/m)".
- **Owns:** cursors, watch-lists (synced from Wallet Registry), raw event archive (S3, for replay).
- **Scaling:** partition watch-lists across pods per chain (consistent hashing on address); Solana is the throughput driver — budgeted for a Rust rewrite if the TS pipeline can't hold 50 k events/s (D-record in [09-decisions.md](09-decisions.md)).
- **Failure:** pod crash → resume from cursor; RPC vendor degraded → ProviderPool failover ([packages/chains](../../packages/chains)); sustained lag → `indexer.lag` metric trips staleness banners downstream.
- **SLO:** event visible ≤ 15 s after chain confirmation (EVM/SOL), ≤ 1 block (BTC).

## 2.8 Price Service

- **Mission:** asset prices with provable freshness: multi-source (aggregator APIs + Chainlink where available), median-of-3, staleness metadata, circuit breaker on single-tick moves > 20%.
- **Owns:** `price_ticks` (hot in Redis, history in ClickHouse), source-health table.
- **API (internal + public):** `GET /v1/prices?assets=…` (batch), WS channel `prices:{asset}`.
- **Events:** `price.ticks.v1` (throttled to 5 s cadence per asset).
- **Failure:** a source diverges > 5% from median → excluded + alert; all sources stale → serve last price with `stale: true`; **quoting is blocked on stale prices** (plans require fresh quotes; portfolio display does not).
- **SLO:** tick staleness < 15 s p99 for top-500 assets.
- **Stage A home:** `worker` module.

## 2.9 Gas Service

- **Mission:** fee estimation and fee-asset strategy per ecosystem: EVM `eth_feeHistory` percentiles + priority-fee model, BTC sat/vB tiers from mempool distribution, SOL priority-fee percentiles; publishes "fee weather" (cheap/normal/congested).
- **API (internal):** `GET /internal/gas/:chainId/estimate?speed=normal`.
- **Events:** `gas.conditions.v1` (feeds route scoring + UI fee badges).
- **Failure:** estimation down for a chain → planning on that chain pauses (correctness over availability: never let a user broadcast with a guessed fee).
- **SLO:** estimate p95 < 100 ms (cached model, refreshed per block).
- **Stage A home:** `worker` module.

## 2.10 Route Optimizer

- **Mission:** (fromAsset, toAsset, amount, constraints) → top-3 executable routes. Graph search over (chain, asset) nodes; edges = swap/bridge legs from adapter quotes; score = expected output − gas − fees − risk premium − time penalty.
- **Owns:** route cache (30 s hard expiry), adapter health/latency stats, historical fill-quality per venue (feeds risk premium).
- **API (internal):** `POST /internal/routes/search`.
- **Adapters:** swap (0x, 1inch, Jupiter) and bridge (LiFi-class) behind one interface: `quote() / build() / track()`. Venue allowlist is config + 4-eyes reviewed.
- **Scaling:** fan-out quote calls with 1.5 s budget; hedged requests to slow venues; stateless.
- **Failure:** a venue times out → dropped from that search (log fill-quality miss); ALL venues fail for a leg → plan fails with a user-readable reason ("no route right now"), never a silent worse route.
- **SLO:** route search p95 < 2 s.
- **Stage A home:** `api` module.

## 2.11 Execution Engine

- **Mission:** the single writer for money-movement state. Consumes `plan.approved`, runs the persisted step machine per leg: build → simulate → request device signature (or use pre-signed/session-key authorization) → broadcast → confirm → verify invariants → next leg. Owns recovery.
- **Owns:** `executions`, `execution_steps`, `recovery_actions`.
- **Events:** `execution.step.started/broadcast/confirmed/failed`, `execution.completed/parked`.
- **Non-custodial mechanics:** single-leg plans ship with the signature collected at approval. Multi-leg plans: legs that can be exactly pre-built are pre-signed at approval (bounded validity); legs depending on prior outputs trigger a device round-trip ("Step 2 of 2 ready — confirm") or, if the user enabled a session key (ERC-4337, Phase 9), execute within its spend/expiry bounds. This is stated honestly in UX: automation depth follows authorization depth.
- **Recovery policy (per failed step):** retry idempotently (same tx, re-broadcast) → re-quote remaining legs if quote expired → if unrecoverable, PARK: leave funds in the safest asset on the current chain, notify with exact location, open a resume path. Funds are never in an unknown state: every step records pre/post balances.
- **Scaling:** shard by execution_id; each execution is a lightweight saga actor; horizontal scale is trivial (executions are independent). Single-writer REGION at Stage C (multi-region reads, one execution home region per identity — avoids cross-region saga split-brain).
- **SLO:** step state push < 1 s after chain confirmation; zero lost executions (crash-resume proven by chaos tests).
- **Stage A home:** `worker` module.

## 2.12 Risk Engine

- **Mission:** RiskReport {LOW/MED/HIGH/BLOCK, reasons[]} for token / address / transaction-simulation subjects. Blocking is policy: HIGH needs typed confirmation, BLOCK is not overridable by default.
- **Owns:** `risk_flags`, token verification registry (multi-list cross-check + contract heuristics: honeypot probes on fork, fee-on-transfer detection, SOL mint/freeze authority), screening-list mirrors, approval-scanner results.
- **API:** `POST /v1/risk/scan`, internal batch for planning.
- **Events:** `risk.flags.v1`; consumes `chain.events.v1` (fresh-token detection).
- **Failure:** engine down → planning **fails closed for HIGH-risk-surface actions** (new token, unknown contract) and open for known-good assets (config-listed majors). Stated plainly in the plan UI.
- **SLO:** scan p95 < 250 ms cached / < 2 s cold.
- **Stage A home:** `api` module.

## 2.13 Notification Service

- **Mission:** one delivery brain for push (APNs/FCM), in-app inbox, email, and enterprise webhooks. Consumes lifecycle events, applies user preferences + rate collapse (5 price alerts → 1 digest), renders templates (i18n).
- **Owns:** `notifications`, device push tokens, webhook endpoints + signing secrets, delivery receipts.
- **Events:** consumes most topics; produces `notify.outbox.v1` (WS Gateway) and webhook deliveries (HMAC-signed, retried with backoff).
- **SLO:** execution-critical notifications p95 < 5 s end-to-end.
- **Stage A home:** `worker` module.

## 2.14 Analytics Service

- **Mission:** product + business telemetry into ClickHouse: funnels, retention, intent success rates, route quality, LLM parse accuracy. Pseudonymous by default (identity_id hashed with rotating salt for product analytics).
- **Owns:** ClickHouse schemas, event taxonomy (`packages/events` analytics namespace).
- **Never:** analytics events must not contain amounts+address pairs that deanonymize; reviewed via schema PRs.
- **Stage A home:** `worker` module.

## 2.15 Audit Service

- **Mission:** append-only, hash-chained audit log of every privileged action and every money-path state change. The log every incident review and every regulator conversation starts from.
- **Design:** consumes all lifecycle topics + admin-plane actions; writes to `audit_log` (PG, append-only role) with `entry_hash = H(prev_hash ‖ entry)`; daily anchor hash published to S3 object-lock (WORM). Tamper-evidence without blockchain theater.
- **Stage A home:** `worker` module.

## 2.16 Admin & Ops Plane (separate deployment)

- **Mission:** internal console: registry management (venues, tokens, chains), feature flags, risk overrides, incident tooling, replay tools.
- **Isolation:** separate cluster/namespace + separate IdP (SSO w/ hardware keys), zero shared credentials with user plane, every action 4-eyes for money-adjacent config, all actions → Audit.

## 2.17 Monitoring & Logging (platform capability, not one service)

- **Stack:** OpenTelemetry SDK everywhere → OTel Collector → Prometheus (metrics), Tempo (traces), Loki (logs), Grafana (dashboards), Sentry (client + server errors), PagerDuty (alerting).
- **Golden dashboards:** per-service RED; money-path board (executions in flight, step latencies, park rate, DLQ depth); chain-health board (indexer lag, RPC pool health per chain); AI board (parse accuracy proxy, fallback rate, token spend).
- **Alert policy:** page only on user-impacting SLO burn (multi-window burn rates); everything else is a ticket. Alert runbooks live next to the service code (`services/*/runbook.md`).
