# 07 — API Specification (v1)

OpenAPI is generated from Zod schemas in `packages/api-contracts` (single source of truth — handlers and clients both derive from it). This page defines the contract semantics.

## 1. Conventions

| Concern     | Rule                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base URL    | `https://api.intentwallet.xyz/v1` (region-routed)                                                                                                                  |
| Auth        | `Authorization: Bearer <JWT>` (user) or `X-Api-Key` (enterprise)                                                                                                   |
| Idempotency | ALL POSTs accept `Idempotency-Key` (UUID); replays return the original response with `Idempotent-Replay: true`                                                     |
| Errors      | RFC 9457 problem+json: `{type, title, status, detail, instance, code}` — `code` is a stable machine string (`INTENT_AMBIGUOUS`, `PLAN_EXPIRED`, `RISK_BLOCKED`, …) |
| Pagination  | cursor: `?cursor=…&limit=50` → `{items, next_cursor}`                                                                                                              |
| Rate limits | `RateLimit-Limit/Remaining/Reset` headers; 429 + `Retry-After`                                                                                                     |
| Versioning  | URL major (`/v1`); additive changes only within a major; deprecation ≥ 90 days with `Sunset` header                                                                |
| Amounts     | strings of base units + explicit `decimals` (`{"amount": "2100000", "decimals": 8}`) — no floats on the wire                                                       |
| Tracing     | `X-Request-Id` accepted/echoed                                                                                                                                     |

## 2. Auth

```
POST /v1/auth/challenge          {evm_address}                    → {nonce, expires_at}
POST /v1/auth/verify             {evm_address, signature, device: {platform, pubkey}}
                                                                  → {access_token, refresh_token, identity_hint?}
POST /v1/auth/refresh            {refresh_token, dpop_proof}      → rotated pair (reuse ⇒ family revoked)
POST /v1/auth/revoke             {all_devices?: bool}             → 204
```

## 3. Identities & contacts

```
POST /v1/identities              {btc_address, evm_address, sol_address} → {identity_id}   (idempotent on triple)
GET  /v1/identities/:id                                           → identity + watch status
PUT  /v1/backups                 raw ciphertext (≤ 64 KiB) + X-Content-Hash → {backup_id}
GET  /v1/backups/latest                                           → ciphertext blob
GET/POST/DELETE /v1/contacts                                      → contact CRUD (name, address, ecosystem)
```

## 4. Intents & plans (the product core)

```
POST /v1/intents/parse
  {text: "convert my btc to eth", context: {locale, currency}}
  → 200 {intent_id, status: "parsed", intent: {kind: "swap", from: {asset:"BTC", amount:"all"},
         to: {asset:"ETH"}, confidence, schema_version}}
  → 200 {intent_id, status: "clarifying", question: "Which asset do you want to convert to?",
         options: ["ETH","SOL"]}                           // never guesses
  → 422 {code: "INTENT_UNSUPPORTED"}                       // e.g. "short BTC with 10x leverage"

POST /v1/intents                 {intent: {...}}           // pre-structured (forms fallback / SDK)
POST /v1/intents/:id/plan        {constraints?: {max_slippage_bps, speed}}
  → 200 {plan_id, steps: [{seq, chain, kind, venue, in, out, fee}],
         quote: {you_send, you_receive_min, total_fee, fee_pct, eta_seconds},
         risk: {level: "low", reasons: []},
         signing: [{step: 1, mode: "device", payload_b64, decoded}],
         expires_at}                                        // 30 s hard
  → 409 {code: "RISK_BLOCKED", reasons}
  → 503 {code: "NO_ROUTE"}

POST /v1/plans/:id/approve       {signatures: [{step, signature_b64}], session_key_ref?}
  → 201 {execution_id}
  → 410 {code: "PLAN_EXPIRED"}                              // quote too old — re-plan

GET  /v1/intents/:id             → intent + latest plan + execution summary
```

## 5. Executions

```
GET /v1/executions/:id
  → {status: "running|completed|parked|failed",
     steps: [{seq, chain, kind, status, tx_hash?, explorer_url?, confirmations, timestamps}],
     funds_location: {chain, asset, amount},                // ALWAYS present — the park guarantee
     resume?: {action: "requote"|"sign_step", step}}
POST /v1/executions/:id/resume   {accept_new_quote?: bool, signatures?} → 200
GET  /v1/executions?identity_id=…&cursor=…                  → history
```

## 6. Portfolio, activity, prices

```
GET /v1/portfolio/:identityId
  → {total: {currency: "USD", value: "4281.44"}, as_of, stale: false,
     assets: [{asset_id: "ETH", symbol, value_usd, amount: {...},
               chains: [{chain_id, amount, provisional}]}]}
GET /v1/portfolio/:identityId/asset/:assetId                → per-chain detail + history sparkline
GET /v1/activity/:identityId?cursor=…                       → unified timeline (grouped per intent)
GET /v1/prices?assets=BTC,ETH,SOL&currency=USD              → [{asset, price, change_24h_pct, as_of, stale}]
```

## 7. Risk

```
POST /v1/risk/scan   {subject_type: "token"|"address"|"plan", subject}
  → {level: "low"|"medium"|"high"|"block", reasons: [{code, detail}], as_of}
```

## 8. WebSocket (`wss://stream.intentwallet.xyz/v1`)

```
→ {op: "auth", token}                                       // first frame, 5 s deadline
→ {op: "sub", channels: ["portfolio:{id}", "executions:{id}", "prices:BTC,ETH"]}
← {ch: "executions:…", ev: "step.confirmed", data: {...}, seq}
← {ch: "portfolio:…", ev: "changed", data: {as_of}}         // client refetches (thin events)
← {op: "ping"}/{op: "pong"}                                 // 30 s heartbeat
```

`seq` is per-channel monotonic; clients detect gaps → refetch. Server sheds load by dropping `prices` before `executions` (criticality ordering).

## 9. Enterprise API & webhooks

```
POST /v1/enterprise/intents/parse|plan|simulate             // same shapes, key-scoped, metered
Webhooks: execution.step.*, execution.completed|parked, risk.flagged
  Delivery: POST, headers X-IW-Signature: t=…,v1=HMAC-SHA256(secret, t ‖ body)
  Retries: 1m→5m→30m→2h→6h (max 24 h), then dead-lettered + dashboard alert; 2xx = ack
```

## 10. SDK surface (`@intent-wallet/sdk`)

`parseIntent()`, `plan()`, `approve()` (bring-your-own-signer callback), `watchExecution()` (async iterator over WS), typed errors mirroring `code` strings. The SDK never touches private keys — signing is always a callback the integrator controls.
