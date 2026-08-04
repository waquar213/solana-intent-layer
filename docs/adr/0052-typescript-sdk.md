# ADR-0052 — TypeScript SDK: a zero-dep, transport-injected typed client

- Status: Accepted
- Date: 2026-07-06
- Deciders: CTO, Principal Product Engineer, Developer Experience lead

## Context

The `/v1` API exposes the full plan → authorize → execute loop, but every consumer hand-rolls `fetch`, copies the wire types, and re-implements problem+json parsing — the web app did exactly this, and a copied type is a type that drifts. To make the platform a product developers build on (and to stop our own apps from drifting), we need one official, typed client. It must run in any JS runtime, be testable without a network, surface errors as typed values, and never silently retry a non-idempotent write.

## Decision

Ship **`packages/sdk`** (`@intent-wallet/sdk`): a zero-runtime-dependency, framework-agnostic TypeScript client for `/v1`. A judge panel of three designs (ergonomics-first, type-safety-first, minimal-robust) was scored; the **minimal-robust** core won for wire-exactness and robustness, with the fluent `createClient`/`PlanHandle` grafted from the ergonomics design and an optional `Result<T>` / `.safe.*` surface grafted from the type-safety design. Key decisions:

- **Injectable transport** whose contract mirrors global `fetch` (zero-adapter default); tests supply an in-memory function, production wraps `fetch` for auth/logging. The SDK sets no auth headers itself.
- **Retry only on idempotent GETs.** POSTs (`plan`/`authorize`/`execute`) are never auto-retried — a retried plan pollutes the server-side plan cache and a retried execute risks double execution.
- **Timeout as a `Promise.race`**, so a transport that ignores `AbortSignal` still times out.
- **Typed `ApiError`** mirroring the server's RFC 9457 wire and its exact `code` union; transport failures get `NETWORK_ERROR`/`TIMEOUT`. A malformed error body degrades gracefully.
- **Money stays a decimal string** everywhere — no numeric coercion.
- The SDK's `types.ts` becomes the **single source of truth**; `apps/web` re-exports it so client and app can't drift.
- **v1 is a network client only** — signing stays server-side (the runtime's device-signer seam). A future client-side signing flow attaches at the execute step; that is the documented v2 extension point.

## Alternatives considered

| Option | Verdict |
| --- | --- |
| **Minimal-robust core + thin fluent layer + optional Result, injected transport** | **chosen** |
| Fluent-only client (methods, no free functions) | rejected (harder to tree-shake; a blanket retryPolicy risked retrying POSTs) |
| `Result<T>`-only surface (no throwing) | rejected (taxes every call site; clashes with the fluent chain — offered as opt-in instead) |
| Codegen from an OpenAPI spec | rejected for v1 (heavier toolchain; the wire is small and stable — a hand-written mirror is clearer and zero-dep) |
| Fat client with built-in auth/caching/signing | rejected (scope creep; auth/caching are a caller's transport wrapper, signing is server-side) |

## Consequences

- **Maintenance:** the wire lives in one typed file the web app re-exports; a server-side shape change surfaces as a compile error in the SDK, not a silent runtime drift. 11 tests over a fake transport (full loop, every outcome arm, typed errors, timeout, retry-GET-not-POST, money-as-string, same-origin baseUrl).
- **Scaling:** zero deps, tree-shakeable, any-runtime; a caller adds auth/observability by wrapping the transport, so the SDK stays small as the platform grows.
- **Security:** the SDK holds no keys and never signs; it never auto-retries a non-idempotent write; errors are typed so a caller handles `NOT_FOUND` (expired plan) or a refused execution as first-class outcomes. Full design: [architecture 35](../architecture/35-typescript-sdk.md).
