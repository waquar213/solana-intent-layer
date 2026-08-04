# API.md — The API & SDK Constitution of Intent Wallet V3

> **Read this before you add, rename, or change any endpoint, error code, wire field, header, or SDK
> method.** This is the canonical contract for the HTTP surface (`services/api`, Fastify) and the
> official client (`packages/sdk`). It is the authoritative standard the constitution ([`CLAUDE.md`](CLAUDE.md)
> §7) routes to for "the API / SDK / webhooks." The deep design rationale lives in
> [`docs/architecture/07-api.md`](docs/architecture/07-api.md); this file is the enforceable law and the
> honest map of what actually ships today. When code and this doc disagree, **that is a defect in one of
> them — fix it on purpose, never drift.**

The API exists to serve one product promise: *talk to your money, and the device signs.* Every rule below
protects that promise — non-custodial keys, honest data, integer money, fail-closed gates — over HTTP.

---

## 0 · Status legend — what is real vs. what is designed

This document is TRUE to the V2 codebase. We never dress up a design as a shipped feature, on the wire or
on paper. Every section is tagged:

| Tag | Meaning |
|---|---|
| **[Shipped]** | Implemented in `services/api` / `packages/sdk` today and covered by tests. It is the live contract. |
| **[Designed]** | Specified here and in `docs/architecture/07-api.md` as the forward standard, **not yet implemented**. Build it to this spec; do not claim it works until it does. |

If you are about to reference a feature to a client, integrator, or teammate, check the tag first. A
**[Designed]** feature returns `404`/`INTERNAL` today, not the behavior described.

---

## 1 · The laws every endpoint obeys

These derive from the Doctrine ([`CLAUDE.md`](CLAUDE.md) §3). An endpoint that breaks one is wrong even if
it passes tests.

1. **No endpoint ever handles a private key, seed, or signature-producing material.** Not in a request
   body, not in a query string, not in a header, not in a log, not "just for dev." The server's entire
   relationship to signing is: it produces an *unsigned* `ExecutionPlan` with `params` the on-device signer
   consumes, and it *recovers* a public address from a signature the browser already made (SIWE). If a
   proposed endpoint needs the server to know a secret, the endpoint is redesigned. This is enforced by
   construction: `POST /v1/intents/execute` exists only where a device-signer *seam* is injected, and in
   deployed environments **that seam is absent** — signing happens in the browser/mobile client, never in
   the API process (`services/api/src/main.ts`).
2. **AI proposes, deterministic code verifies, the device disposes.** `plan` is a proposal; `authorize`
   is a pure Risk+Policy gate that can only *refuse or permit*; `execute` **re-runs the gate server-side**
   and touches the signer seam only if `mayProceedToSign`. The client's opinion of a permission is never
   trusted.
3. **Money is integer base units, serialized as strings.** Never a float, never a JS `number`, never a
   raw `bigint` on the wire (JSON can't carry it). See §6.
4. **Never fake data.** A network failure is an error status, **not an empty/`$0` success.** Partial reads
   are labelled partial (`stale: true`, dropped sources). Testnet is testnet.
5. **Fail closed.** Anything a validator cannot positively verify is rejected with a 4xx. Deployed
   environments *refuse to boot* without auth enforcement (`IW_REQUIRE_AUTH=true`) — see §4.6.
6. **Everything auditable.** Every request carries a correlation id and a trace id; every 5xx is logged
   with context; risky decisions are logged by the engines behind the endpoint.

---

## 2 · REST conventions

Benchmarks: **Stripe** (resource clarity, idempotency, error taxonomy), **Vercel/Linear** (versioning
discipline, terse typed surfaces), **Phantom/Rabby** (the wallet never holds what it doesn't need to).

| Concern | Rule |
|---|---|
| **Base URL** | `https://api.intentwallet.xyz/v1` in prod; `http://localhost:8080` in local dev. The SDK defaults to localhost and accepts `baseUrl: ''` for same-origin (browser behind the Vite proxy). |
| **Transport** | HTTPS only in every deployed env (HSTS via `@fastify/helmet`). Plain HTTP is local-only. |
| **Methods** | `GET` for safe, idempotent reads (no side effects, retryable). `POST` for actions and non-idempotent writes. `PUT`/`PATCH`/`DELETE` are reserved for **[Designed]** CRUD resources (contacts, backups) and are not yet mounted. |
| **Content type** | Requests: `application/json`. Success responses: `application/json`. Errors: `application/problem+json` (§9). `/metrics` returns Prometheus text. |
| **Body limit** | 1 MiB hard cap (`bodyLimit`), rejected early as a DoS floor. |
| **Field casing** | `camelCase` on the JSON wire (e.g. `planId`, `totalValueMicros`, `mayProceedToSign`). This matches the SDK's TypeScript types 1:1. *(Note: the older design doc `07-api.md` sketches `snake_case`; the shipped surface is `camelCase` — the SDK types in `packages/sdk/src/types.ts` are the source of truth.)* |
| **Statelessness** | Every request is authenticated on its own bearer token; there is no server session affinity. The one piece of server-issued state — an `ExecutionPlan` — is looked up by `planId` from a shared store, so any replica can serve any follow-up (§5.2). |
| **Nulls vs. absence** | A field that is *unknown* is `null` and explicit (e.g. `priceUsd: null` when a price feed is down). A field that is *inapplicable* is omitted. We never coerce unknown to zero. |
| **Time** | ISO-8601 UTC strings (`asOf`, `occurredAt`). Never a locale-formatted or ambiguous timestamp. |
| **Trailing slashes** | No. Routes are exact (`/v1/intents/plan`). |

### 2.1 Resource modeling

The product core is **not** classic CRUD — it is a **verb pipeline over one durable server object**, the
`ExecutionPlan`. Model accordingly:

- **The intent loop is three POSTs on `/v1/intents/*`** — `plan` → `authorize` → `execute` — because each
  is an *action* with distinct authority (propose / gate / dispose), not a mutation of a REST noun. The
  plan they share is created by `plan`, owned by the authenticated principal, and referenced by `planId`.
- **Read models are `GET` nouns** — `/v1/portfolio`, `/v1/portfolio/insights`, `/v1/identity`,
  `/v1/history/evm`.
- **Public, keyless reads** that operate on the caller's *own* public addresses or public chain data are
  their own endpoints (`/v1/resolve/ens`, `/v1/history/evm`, `/v1/portfolio/balances`) so the web app can
  use them before sign-in without leaking anything private.
- **Never** expose a "raw signing" or "submit-signed-blob-we-built" resource that would make the server a
  co-signer. The plan carries `params`; the client signs and broadcasts (deployed) — that boundary is the
  product.

---

## 3 · The public API surface [Shipped]

This is the **complete** list of endpoints mounted today. There are **no placeholder routes** — a business
route is registered only when its dependency is wired (`registerV1Routes`, `registerIntentRoutes`), so the
surface is always honest about what actually works. The OpenAPI document (`GET /v1/openapi.json`) is
introspected from the live Fastify route table and can never claim an endpoint that isn't mounted.

### 3.1 The intent loop — `POST /v1/intents/*` (auth-gated when `IW_REQUIRE_AUTH=true`)

| Method · Path | Role | Body | Success |
|---|---|---|---|
| `POST /v1/intents/plan` | **PROPOSE** — natural language → a verified `ExecutionPlan` (or `clarify` / `answer` / `automation` / `rejected`) | `{ utterance: string(1..500) }` | `{ intentKind, outcome }` |
| `POST /v1/intents/authorize` | **AUTHORIZE** — run a server-issued plan through Risk + Policy → a permission | `{ planId }` | `Permission` |
| `POST /v1/intents/execute` | **DISPOSE** — re-authorize server-side, then drive the plan to a terminal execution | `{ planId }` | `{ executed, permission, execution? }` |

`execute` is mounted **only** where an executor seam is injected (local dev demo). In deployed
environments it is **absent** — the browser/mobile wallet signs and broadcasts. `authorize`/`execute` act
only on a plan the server produced and the caller owns; a forged or foreign `planId` returns the same
`404 NOT_FOUND` (§4.5), so one user can neither act on nor probe another's plan.

### 3.2 Read models — `GET` (auth-gated like the loop)

| Method · Path | Returns |
|---|---|
| `GET /v1/portfolio` | Holdings folded into USD values — `{ totalValueMicros, holdings[] }` (money as strings) |
| `GET /v1/portfolio/insights` | Full intelligence — allocation / concentration / risk / health / insights (µUSD as strings, `stale` flag) |
| `GET /v1/identity` | The Universal Identity — BTC / EVM / SOL **receive addresses + derivation paths only** (never keys) |

### 3.3 Auth & session — `/v1/auth/*`, `/v1/me*`

| Method · Path | Role |
|---|---|
| `POST /v1/auth/nonce` | Issue a one-time SIWE challenge bound to an EVM address (tight per-route rate limit) |
| `POST /v1/auth/verify` | Recover the signer, check nonce + expiry → issue an HS256 session token |
| `GET /v1/me` | The authenticated session identity (protected — proves the guard enforces) |
| `POST /v1/me/logout` | Revoke **this** session (by `jti`) → `204` |
| `POST /v1/me/logout-all` | Revoke **every** session for the subject issued up to now → `204` |

### 3.4 Public, keyless utilities

| Method · Path | Role |
|---|---|
| `POST /v1/portfolio/balances` | Cross-ecosystem real balances for the caller's **own** public addresses `{ evm?, btc?, sol? }`, valued live. Partial results on a down network; all-fail surfaces an error, never a fake-empty portfolio. |
| `GET /v1/resolve/ens?name=` | Resolve `vitalik.eth` → address or `null` (read-only public data) |
| `GET /v1/history/evm?address=&limit=` | EVM activity feed from a public explorer (`limit` clamped 1..50, default 15) |

### 3.5 Meta & operations

| Method · Path | Role |
|---|---|
| `GET /v1/status` | Liveness/version — `{ service, apiVersion, status }` |
| `GET /v1/openapi.json` | OpenAPI 3.1 document, introspected from live routes + enriched schemas |
| `GET /healthz` | Liveness — process is up (never touches dependencies; k8s liveness) |
| `GET /readyz` | Readiness — runs injected dependency probes (DB, Redis); `503` if any fail (k8s readiness) |
| `GET /metrics` | Prometheus RED metrics + Node process metrics (§8) |

**[Designed] and NOT yet mounted:** `POST /v1/auth/refresh`, `X-Api-Key` enterprise auth, identity/backup/
contacts CRUD, `/v1/executions/:id` polling + resume, `/v1/activity`, `/v1/prices`, cursor pagination, and
webhooks (§10). These are specified in `docs/architecture/07-api.md`; do not reference them as live.

---

## 4 · Authentication & authorization [Shipped]

The wallet is non-custodial, so **auth is a proof of address control, never a password**. We use
**Sign-In With Ethereum (EIP-4361 / SIWE)**: the wallet signs a server-issued challenge in the browser
with its EVM key; the server only ever *recovers a public address* from the signature. No key, seed, or
private material is ever transmitted. (`services/api/src/auth/siwe.ts`)

### 4.1 The handshake

```
1. POST /v1/auth/nonce   { address: "0x…40hex" }
     → { message, nonce, expiresAt }        # message is the EIP-4361 text to sign
2. <wallet signs `message` in-browser via personal_sign — key never leaves the device>
3. POST /v1/auth/verify  { message, signature }
     → { token, address, expiresAt }        # token is the session bearer
```

`verify` enforces, in order, all fail-closed: the recovered signer **matches** the message address; the
nonce is **fresh, one-time, and address-bound** (consumed even on failure); the challenge has **not
expired** (5-minute TTL). Any failure → `401 UNAUTHORIZED` with a specific detail.

### 4.2 The session token — bearer, HS256 JWT

- Sent on every authenticated request as `Authorization: Bearer <token>`. The guard rejects a missing or
  malformed header (`401 UNAUTHORIZED`) before any handler runs (`plugins/auth-guard.ts`).
- The token is a minimal HS256 JWT (`node:crypto` HMAC-SHA256, no dependency): claims are `sub` (the
  authenticated EVM address), `iat`, `exp`, and a per-token `jti` for individual revocation. Verification
  is **constant-time** (`timingSafeEqual`) and fail-closed: bad signature, malformed token, or expired
  `exp` → `null` → `401`. (`services/api/src/auth/jwt.ts`)
- Default session lifetime is 24h (`sessionTtlSec`). There is **no refresh token yet** — re-run SIWE to
  renew. Refresh-with-rotation is **[Designed]** (`07-api.md` §2).
- Scopes are coarse today (`['wallet']`) and ride on the auth context; fine-grained scopes are **[Designed]**.

### 4.3 Principal binding — the anti-confused-deputy rule

**Never trust a client-supplied principal.** Every intent handler derives the acting principal from the
authenticated subject: `principalOf(request) = request.auth?.subject`. The `authorize` request accepts an
optional `principalId`, but the handler **ignores it for authority** and binds to the session subject — it
exists only for the localhost-open path. In a deployed env (auth on), the principal is always the real
wallet address. This is why a deployed env **must** enforce auth (§4.6): with auth off, every caller
collapses to one shared principal and could act on another's plan and holdings.

### 4.4 Revocation & sign-out [Shipped]

- `POST /v1/me/logout` revokes the current `jti` until its natural expiry.
- `POST /v1/me/logout-all` records a per-subject cutoff so **every** token issued at/before now is
  rejected (sign-out-everywhere).
- One `SessionRevoker` instance backs both the auth routes and the intent guard, so a token killed via
  logout is dead on the intent routes in the same instant. Redis-backed across replicas in prod;
  in-memory locally. (`auth/revoker.ts`)

### 4.5 Authorization outcomes

- **Wrong/absent token** → `401 UNAUTHORIZED`.
- **Valid token, plan not found or owned by a different principal** → `404 NOT_FOUND` with an identical
  message for both cases (no existence oracle).
- **Valid token, gate refuses** → the request *succeeds* (`200`) with `mayProceedToSign: false` — refusal
  is a normal, honest outcome of the pipeline, not an HTTP error.

### 4.6 Enforcement is mandatory outside local

`IW_REQUIRE_AUTH` gates the intent routes. Config (`packages/config`) **fails boot** in any non-`local`
environment unless `IW_REQUIRE_AUTH=true` *and* `IW_AUTH_SECRET` (≥16 chars) is set — a deployed env may
never sign sessions with a known secret or serve a shared-principal surface.

---

## 5 · Versioning & compatibility

- **URL-major versioning.** The version is in the path (`/v1`). A breaking change ships as `/v2`, never a
  silent mutation of `/v1`. This is the mount point every route attaches to (`routes/v1/index.ts`).
- **Additive-only within a major.** You may add an endpoint, add an *optional* request field, or add a
  response field. You may **not**, within `/v1`: remove/rename a field, change a field's type, tighten
  validation on an existing field, change an error `code`'s meaning, or change money-string semantics.
  Clients (and the SDK) are built to ignore unknown response fields, so additions are safe.
- **The SDK is versioned with the surface.** `@intent-wallet/sdk` types mirror `/v1` exactly. A wire
  change and its SDK-type change land together.
- **Deprecation [Designed]:** a removed capability gets ≥90 days' notice and a `Sunset` header before a
  `/v2` cutover. Not exercised yet (we are pre-`/v2`).

---

## 6 · Money on the wire — integer base units, serialized as strings

Doctrine 4: **money is integer `bigint` base units end-to-end.** JSON cannot represent `bigint` and JS
`number` silently loses precision past 2^53, so the wire rule is absolute:

> **Every monetary quantity is a decimal *string* of the smallest integer unit. Never a JSON number, never
> a float, never a bare `bigint`.** The SDK and every client must treat these as opaque strings and do
> `BigInt(...)` math, never `Number(...)`.

| Kind on the wire | What it is | Example |
|---|---|---|
| **Base-unit amount** | The integer count of an asset's smallest unit, paired with `decimals` so the client can format | `{ "base": "2100000", "decimals": 8 }` (0.021 BTC) |
| **µUSD (micro-USD) value** | USD value in millionths of a dollar, integer, as a string | `"netWorthMicros": "4281440000"` = $4,281.44 |
| **Price** | Decimal USD string (human units, exact) or `null` when unpriced | `"priceUsd": "2000"`, or `null` |
| **Fee** | µUSD string | `"totalFeeMicros": "1500000"` |

Rules:
- **`null` means "unknown," not "zero."** An unpriced asset is `priceUsd: null` / `valueMicros: null` — the
  UI shows a dash, never `$0`.
- **Symbol + decimals travel with amounts** so nothing has to guess an asset's precision.
- Formatting to a human string happens **only at the very edge** (the UI), never in a core or on the wire.
- Server-side, these strings are produced from `bigint` (`toJsonSafe` projections in `insights.ts`,
  `PlanAmount` serialization). The SDK's `PortfolioSummary`, `PortfolioInsights`, and `ExecutionPlan`
  types type every such field as `string` on purpose (`packages/sdk/src/types.ts`).

---

## 7 · Idempotency

### 7.1 What ships today [Shipped]

- **`plan`/`authorize`/`execute` are POSTs and are NEVER auto-retried by the SDK.** A flaky network can't
  double-plan or double-execute (`packages/sdk/src/request.ts`). Only idempotent `GET`s get bounded retry.
- **`execute` is idempotent-by-authority, not by key.** It acts on a *server-issued* `planId`; the server
  re-authorizes on every call and refuses unless `mayProceedToSign`. The downstream **settlement** engine
  derives a deterministic settlement id from the plan id and claims it once, preventing double-execution of
  the same plan (`packages/settlement`).
- **The plan store is idempotent on `planId`** (`remember` upserts).

### 7.2 The standard for unsafe writes [Designed]

All non-idempotent POSTs will accept an **`Idempotency-Key`** header (a client-generated UUID):

- The server stores the first response keyed by `(principal, route, Idempotency-Key)` for a bounded window
  and **replays it** on a repeat, adding `Idempotent-Replay: true`.
- A repeat with the **same key but a different body** is a `409 CONFLICT`.
- Keys are per-principal — one user's key never collides with another's.

Until this lands, integrators must rely on §7.1: generate the plan once, don't retry the action POSTs.

---

## 8 · Rate limits & observability

### 8.1 Rate limits [Shipped]

- **Global per-IP floor:** `IW_RATE_LIMIT_MAX` requests/minute (default 300), across replicas when Redis
  is wired (`@fastify/rate-limit`).
- **Tighter per-route limits** on cheap-to-abuse unauthenticated endpoints: `/v1/auth/nonce` and
  `/v1/auth/verify` cap at 20/minute (ECDSA recovery + nonce issuance are the expensive, abusable ops).
- **A 429 is shaped as `application/problem+json`** with `code: RATE_LIMITED`, routed through the same
  error handler as everything else — never a bare Fastify default.

**[Designed]:** standard `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` headers and
`Retry-After` on 429s. Not emitted yet — clients should back off on `429` regardless.

### 8.2 Observability contract [Shipped]

Every request participates in tracing and metrics:

- **`x-request-id`** — accepted inbound (trusted only for correlation, never authz) or minted, echoed on
  the response, and threaded into every log line.
- **`traceparent`** (W3C) — an upstream trace id is preserved so a request stays one trace across
  services; a fresh span id is minted per hop and echoed for the next service.
- **`GET /metrics`** — Prometheus RED signals (`http_requests_total`, `http_request_duration_seconds`)
  labelled by method, **route pattern** (never the concrete URL — bounded cardinality), and status, plus
  Node process metrics. Each app instance has its own registry.
- **Every 5xx is logged at error level** with the request context; 4xx at warn.

---

## 9 · Error envelope — RFC 9457 problem+json [Shipped]

**Every** error the platform returns — validation, auth, not-found, rate-limit, upstream, or unexpected —
has one shape: **RFC 9457 `application/problem+json`** (`packages/observability/src/problem.ts`,
`plugins/error-handler.ts`). No endpoint invents its own error format.

```jsonc
// Content-Type: application/problem+json
{
  "type": "https://errors.intentwallet.xyz/NOT_FOUND", // stable URI, one per code
  "title": "NOT_FOUND",
  "status": 404,
  "code": "NOT_FOUND",          // the machine-branchable field — switch on THIS
  "detail": "no such plan 'p_…' (expired or never issued)",
  "instance": "/v1/intents/authorize", // the request path
  "details": { "issues": [ /* optional, safe context — never secrets */ ] }
}
```

### 9.1 The code taxonomy — `AppErrorCode`

`code` is the stable contract; clients branch on it, never on `detail` (which is human-readable and may
change) or `status` alone. (`packages/observability/src/errors.ts`)

| `code` | Default status | Meaning |
|---|---|---|
| `BAD_REQUEST` | 400 | Malformed/invalid request (includes Zod validation failures with `details.issues`) |
| `VALIDATION_FAILED` | 422 | Semantically invalid but well-formed |
| `UNAUTHORIZED` | 401 | Missing/invalid/expired/revoked session |
| `FORBIDDEN` | 403 | Authenticated but not permitted |
| `NOT_FOUND` | 404 | No such resource — **including a plan you don't own** (no existence oracle) |
| `CONFLICT` | 409 | State conflict (e.g. future `Idempotency-Key` reuse with a different body) |
| `RATE_LIMITED` | 429 | Over the rate limit |
| `UPSTREAM_FAILED` | 502 | A dependency (RPC, price feed) failed |
| `INTERNAL` | 500 | Unexpected — details are **flattened**, see §9.2 |

### 9.2 The leak rule — 5xx never expose internals

- **Expected (4xx) `AppError`s** expose their `message` (as `detail`) and safe `details`.
- **Unexpected (5xx) or any non-`AppError` throwable** is flattened to `detail: "An unexpected error
  occurred."` — no stack, no message, no internal shape ever reaches the client. The real error is logged
  server-side with the request id.
- **Never put a secret, key fragment, seed, raw address list, or PII in `detail` or `details`.**

### 9.3 The SDK mirrors this exactly

`@intent-wallet/sdk` surfaces every problem as a typed `ApiError` carrying `code`, `status`, `type`,
`title`, `detail`, `details` — verbatim from the wire, never invented. Transport failures that never
reached the server get synthetic codes outside the wire union: `NETWORK_ERROR` and `TIMEOUT`, both with
`status: 0`. (`packages/sdk/src/errors.ts`)

---

## 10 · Webhooks [Designed]

> **Status: designed, not yet implemented.** No webhook delivery exists in `services/api` today. The
> substrate it will build on — a validated, versioned event envelope with a dedupe id — **does** exist
> (`packages/events`). This section is the standard to build to; do not advertise webhooks as live.

The wallet already emits internal domain events on a bus with a common envelope
(`packages/events/src/envelope.ts`):

```ts
EventEnvelope = {
  id: string;             // globally unique — consumers dedupe on this
  type: string;           // dotted, versioned: "execution.step.confirmed.v1"
  occurredAt: string;     // ISO-8601 UTC
  key: string;            // partition/order key (identity, intent, execution id)
  correlationId?: string; // the originating intent id
  payload: unknown;       // validated against the per-type schema
}
```

Outbound webhooks deliver these envelopes to integrator endpoints under these **required** rules:

**Signing (non-negotiable).** Every delivery carries an HMAC-SHA256 signature the receiver **must**
verify before trusting the body:
- Header `X-IW-Signature: t=<unix>,v1=<hex>` where `v1 = HMAC_SHA256(secret, "<t>.<raw_body>")`.
- Sign the **raw bytes** of the body, before any parsing. Compare in constant time.
- Reject if `|now − t|` exceeds a tolerance (default 5 min) to bound replay. This is the Stripe model, and
  it reuses the exact HMAC-SHA256 discipline already in `auth/jwt.ts`.
- Each endpoint has its own rotgatable secret; support two live secrets during rotation.

**Retries & delivery semantics.**
- **At-least-once** delivery. Consumers **must** be idempotent, deduping on `EventEnvelope.id`.
- A delivery is successful only on a `2xx` within a short timeout. Non-2xx/timeout → retry with
  **exponential backoff + jitter** (e.g. ~8 attempts over ~24h).
- Ordering is **not** guaranteed across events; within a `key`, best-effort. Never assume order — use
  `occurredAt` and the entity's own state.
- After the final failed attempt the event is parked to a dead-letter log and surfaced for manual replay,
  never silently dropped (fail-loud).

**Payload honesty.** A webhook reports only what actually happened on-chain/in-engine; it never asserts a
"confirmed" state that didn't occur (Doctrine 3).

---

## 11 · The SDK contract — `@intent-wallet/sdk` [Shipped]

The official TypeScript client is the reference integration and the enforced contract. Its guarantees are
part of the API's public promise (`packages/sdk`).

- **Zero-dependency, framework-agnostic, runtime-agnostic.** The HTTP transport is *injected* (defaults to
  global `fetch`), so it runs and unit-tests in any runtime with no network.
- **It mirrors the wire exactly.** `packages/sdk/src/types.ts` is the single source of truth for every
  request/response shape. **Money is `string`** on every type — the SDK must never coerce a money field to
  `number`.
- **It never holds keys.** Signing stays server-side behind the runtime's device-signer seam (local) or
  in the on-device wallet (deployed). The SDK has no signing surface, by design.
- **Two layers, same core.** A boring **functional core** (one function per endpoint,
  `plan`/`authorize`/`execute`/`getPortfolio`/`getInsights`/`getIdentity`/`getStatus`) and a thin
  **fluent client** (`createClient(config)`), which returns a `PlanHandle` you can walk:

  ```ts
  const c = createClient({ baseUrl: '', authToken: () => store.token });
  const h = await c.plan('send 0.1 ETH to alice.eth');
  if (h.planId) {                    // outcome.kind === 'plan'
    const perm = await h.authorize();
    if (perm.mayProceedToSign) await h.execute();
  } else if (h.outcome.kind === 'clarify') {
    // surface h.outcome.question — the wallet never guesses
  }
  ```

- **`.safe.*` mirrors every method** as a non-throwing `Result<T>` for callers that prefer branching over
  `try/catch`.
- **Auth token is resolved fresh per request.** Pass `authToken` as a value *or a resolver* `() => string
  | null | undefined`; a token issued, refreshed, or cleared (sign-out) after the client is created is
  always picked up — the client is bound once, the credential is not.
- **Retry only on idempotent GETs** (bounded, default 3, backoff+jitter). POSTs are never auto-retried
  (§7). Per-request timeout defaults to 30s (`TIMEOUT` `ApiError` on expiry).
- **Errors are typed `ApiError`** (§9.3). Calling `.authorize()`/`.execute()` on a non-`plan` outcome
  rejects with a typed `BAD_REQUEST` rather than silently guessing.

---

## 12 · Contract source of truth & OpenAPI [Shipped]

- **`GET /v1/openapi.json`** serves an OpenAPI **3.1** document. Paths are **introspected from the live
  Fastify route table** (`onRoute`), so the spec physically cannot claim an endpoint that isn't mounted;
  each known operation is enriched with real request/response schemas, the shared `ProblemDetails` error
  shape, and a `bearerAuth` (HTTP bearer, JWT) security scheme (`services/api/src/openapi.ts`).
- **The SDK types (`packages/sdk/src/types.ts`) are the hand-authored source of truth** the wire and the
  OpenAPI schemas are kept consistent with. *(The architecture doc's aspiration of generating everything
  from a `packages/api-contracts` Zod module is **[Designed]**; that package does not exist yet — today the
  Zod request schemas live in the route handlers and the OpenAPI schemas are curated in `openapi.ts`.)*
- **When you add or change an endpoint, you update, in the same change:** the route handler + its Zod
  request schema, the `OPERATIONS`/`COMPONENTS` entries in `openapi.ts`, and the SDK types + function +
  client method + tests.

---

## 13 · Extending the API — the checklist

Before a new endpoint merges, it must satisfy the build loop ([`CLAUDE.md`](CLAUDE.md) §4) and:

1. **Key-safety review.** Prove the endpoint cannot receive, store, log, or emit any private material.
   Pull in the Principal Security Engineer for anything touching keys, funds, auth, or a signer seam
   (**hard veto**).
2. **It's honest.** Registered only when its real dependency is wired; no placeholder that fakes success;
   network failure is an error, not a fake-empty `200`.
3. **Auth & principal binding.** Reads/writes over per-user data carry the session guard and bind to
   `request.auth.subject` — never a client-supplied principal.
4. **Money is base-unit strings** (§6); validated request via Zod; `400 BAD_REQUEST` with `details.issues`
   on failure.
5. **Errors go through the problem+json handler** (throw an `AppError` / a convenience constructor) — never
   hand-roll a response body; never leak internals on 5xx.
6. **Idempotency & method semantics** are correct (§2, §7): GET is safe+retryable, action POSTs aren't
   auto-retried.
7. **Observability:** it inherits request-id/traceparent and RED metrics automatically — keep the route
   *pattern* low-cardinality (no ids in the path segment used as a metric label).
8. **OpenAPI + SDK + tests** updated in the same change (§12); integration-tested over the real request
   path (`app.inject()`), including the failure and refusal states.

---

## 14 · Cross-references

| Topic | Read |
|---|---|
| API design rationale, target surface, resource sketches | [`docs/architecture/07-api.md`](docs/architecture/07-api.md) |
| Keys, signing, SIWE threat model, session security | [`SECURITY.md`](SECURITY.md), `docs/security/` |
| The intent pipeline behind `plan`/`authorize`/`execute` | [`AI.md`](AI.md), Master Spec Phase 3 & 5 |
| Money/`bigint`, storage, the plan store | [`ARCHITECTURE.md`](ARCHITECTURE.md), `packages/observability`, `services/api/src/persistence` |
| The constitution & doctrine every rule here serves | [`CLAUDE.md`](CLAUDE.md) |

> **The one-line test for any API change:** *does it keep the key on the device, the money exact, the data
> honest, and the gate closed by default?* If not, it doesn't ship.
