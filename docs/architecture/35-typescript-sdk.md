# 35 — TypeScript SDK

## Why this exists

The `/v1` API already exposes the whole loop (plan → authorize → execute + portfolio + status), but every consumer was left to hand-roll its own `fetch` calls, copy the wire types, and re-invent problem+json parsing — exactly what `apps/web` did. That's how a client and a server drift. `@intent-wallet/sdk` is the **one official client**: a typed, framework-agnostic wrapper that makes the API a product a third party (or our own web/mobile app) builds on without touching HTTP details.

The web app now consumes it — `apps/web/src/types.ts` is a re-export from the SDK, so the app and the SDK share a single wire-type source that can never drift.

## What it owns (and deliberately doesn't)

It owns a **pure typed HTTP client** for `/v1`: the request/response types (mirroring the wire exactly), the five endpoint calls, RFC 9457 problem+json → a typed `ApiError`, timeouts, and bounded retry. It deliberately does **not** own auth (a caller injects a custom transport to add `Authorization`), caching, streaming, or signing — **signing stays server-side** (the runtime's device-signer seam); the SDK holds no keys. Money is never coerced: every µUSD field is a decimal string on the wire and stays one in the SDK.

## The shape

A **boring functional core** with a **thin fluent layer** on top — the design a judge panel of three approaches converged on (minimal-robust core + grafted ergonomics + optional typed-`Result`):

- **Functions** — `plan`, `authorize`, `execute`, `getPortfolio`, `getStatus`, each a thin wrapper over one `request` engine. Tree-shakeable; import just what you use.
- **`createClient(config)`** — binds the base URL + transport once and returns an `IntentClient` with `.plan()/.authorize()/.execute()/.portfolio()/.status()`. `client.plan(utterance)` returns a **`PlanHandle`** carrying the discriminated `outcome` plus, when it *is* a plan, its `planId` and chained `.authorize()` / `.execute()`. Calling those on a non-plan outcome rejects with a typed `ApiError` rather than guessing.
- **`.safe.*` + `toResult()`** — a non-throwing mirror returning `Result<T> = { ok: true; value } | { ok: false; error: ApiError }` for callers who prefer typed results over `try/catch`.

```ts
const client = createClient({ baseUrl: 'https://api.example.com' });
const plan = await client.plan('swap 100 USDC for ETH');
if (plan.planId) {
  const perm = await plan.authorize();
  if (perm.mayProceedToSign) {
    const { execution } = await plan.execute();
    console.log(execution?.status); // 'completed'
  }
}
```

## The three seams that make it robust

- **Injectable transport.** `TransportFetch` mirrors the global `fetch` signature, so the default is a zero-adapter passthrough, yet a test supplies an in-memory table (no network) and production can wrap `fetch` to add auth/logging. `resolveTransport` fails loudly if no `fetch` exists.
- **Timeout as a race.** Each request races the transport against a deadline (`AbortController` + a rejecting timer), so even a transport that ignores the `AbortSignal` still times out → a typed `TIMEOUT` error.
- **Retry gated to idempotent GETs.** `getPortfolio` / `getStatus` get bounded exponential backoff on transient failures (network, 429/502/503/504). **`plan` / `authorize` / `execute` are POSTs and are never auto-retried** — a retried `plan` would pollute the server-side plan cache and a retried `execute` risks double execution.

## Error model

One typed `ApiError extends Error` is the only thing thrown. It mirrors the server's RFC 9457 wire (`{ code, status, type, title, detail, details? }`), so a caller branches on a typed `code` — `NOT_FOUND` for an expired plan, `BAD_REQUEST` for a bad utterance. The `code` union is the server's `AppErrorCode` verbatim, plus `NETWORK_ERROR` / `TIMEOUT` (status 0) for failures that never reached the server. A non-JSON or malformed error body degrades to a generic `ApiError` carrying the HTTP status rather than crashing.

See [ADR-0052](../adr/0052-typescript-sdk.md).
