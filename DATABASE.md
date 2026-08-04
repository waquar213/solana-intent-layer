# DATABASE.md — The Data Constitution of Intent Wallet V3

> **This is the canonical, binding data standard for the repo.** It governs every store, schema, migration,
> cache key, retention rule, and backup expectation. The **Principal Data Engineer** owns it; the **Principal
> Security Engineer** holds a **hard veto** over anything touching *user data* ([CLAUDE.md §2](CLAUDE.md)).
> Where this file and the code disagree, one of them is a defect — reconcile it on purpose, never drift.
>
> **Read this before you** create a table or column, add a store, write a migration, choose how to persist
> money, add a Redis key, cache anything, log an audit event, or decide what the server may keep about a user.
> The deep reference this constitution routes to is [`docs/architecture/03-data.md`](docs/architecture/03-data.md)
> (the full data-model field manual); the privacy/retention/DSAR field manual is
> [`docs/architecture/26-compliance-governance.md`](docs/architecture/26-compliance-governance.md), and the
> data-security field manual is [`SECURITY.md`](SECURITY.md) → [`docs/architecture/06-security.md`](docs/architecture/06-security.md).
> This is the constitution; those are the manuals. Naming/money style is fixed by
> [`docs/handbook/01-standards.md`](docs/handbook/01-standards.md).

**The one-line promise this protects:** a non-technical stranger can move real money by typing one sentence —
and *never be lied to, never lose funds, never have a secret of theirs sit on our servers.* Every rule below
exists to keep those three true at the data layer.

---

## 0 · Status legend — this document never fakes a store

Per Doctrine law #3 (*never fake data*), a data document that claims a store or table it does not run is itself
a lie. Every store, table, and control below is tagged with its **real** state. When you ship one, promote its
tag in the same PR.

| Tag | Meaning |
|---|---|
| ✅ **Shipped** | Implemented **and tested** in the repo today; a file is cited. |
| 🔶 **Partial** | The core exists (usually as a pure engine or one env), but it is not yet wired to the production data plane; the gap is named. |
| ⏭ **Mandated (roadmap)** | A **binding requirement** with a landing phase, specified in `docs/architecture/03-data.md`; not a claim that it runs yet. |

A `⏭` row is still law: the shape is decided now so we don't improvise it later under load. It is a promise,
honestly labelled as not-yet-kept — never dressed up as done.

---

## 1 · The data doctrine (the laws no change may break)

The data-load-bearing subset of the [Doctrine](CLAUDE.md#3--the-doctrine--laws-no-change-may-break). A change
that violates one is **wrong even if it works**, and is reverted.

1. **No secret ever lives server-side.** Non-custodial is absolute. Seeds, mnemonics, and private keys are
   generated and used **on-device**; **no** column, cache, log, blob, or backup on our infrastructure may ever
   contain one — not encrypted, not "temporarily," not in a debug dump. If a feature needs the server to hold a
   secret, the feature is redesigned. (§7)
2. **Money is integer, never a float.** Base-unit `bigint` in cores, integer-string on the wire, `numeric(78,0)`
   (or a base-unit/decimal **string** inside JSONB) at rest. A `float`/`double`/`real` in any money column or a
   JS `number` in a money path is a **CI-grep failure**, not a code-review nicety. (§6)
3. **Never fake data — a failed read is not `$0`.** A store that can't be reached returns *unknown*, never a
   zero, never a stale value dressed as fresh. Caches must not persist an error as a value. (§10)
4. **Fail closed on reads that gate money.** If a lookup a guard depends on (owner of a plan, sanctions flag,
   token metadata) can't be *positively* resolved, the operation is **blocked**, not waved through. (§5, §8)
5. **The server produces the plan; the client never hands one back.** `authorize`/`execute` act **only** on a
   plan the server persisted and looked up by `planId`, scoped to the authenticated principal. (§5)
6. **Everything money-touching is auditable.** Every plan, execution step, risk verdict, and policy decision is
   recorded with its inputs, append-only, so any outcome can be reconstructed. (§13)
7. **Deterministic cores, effects at the edge.** Persistence lives behind small async interfaces
   (`PlanStore`, `ExecutionStore`, `NonceStore`, `SessionRevoker`) so the domain stays testable and a store is a
   swappable implementation — not a hard dependency baked through the code.

---

## 2 · Stores in use — and exactly when each

**One logical job per store.** We do not overload one database with unrelated duties, and we never reach for a
new engine when an existing one fits. The shipped footprint is deliberately small; the larger catalog is
mandated in `docs/architecture/03-data.md` and lands by phase.

| Store | Role | When | Reached via | State |
|---|---|---|---|---|
| **PostgreSQL 16** | Networked **system of record**, shared by every API replica | Any **deployed** env (`IW_ENV` ≠ `local`) | `IW_DB_URL`, `pg` pool | ✅ (the `plans` table; broader schema ⏭) |
| **SQLite** (embedded, `node:sqlite`) | Single-file local system of record — survives restart, needs no daemon | **Local dev only** (`IW_ENV=local`) | `IW_PLAN_DB_PATH` / `.plans.db` | ✅ |
| **Redis 7** | Ephemeral shared state: SIWE nonces, session revocation, cross-replica rate-limit counters | **Deployed** envs (local falls back to in-memory) | `IW_REDIS_URL`, `ioredis` | ✅ (auth + rate-limit families; cache/price/dedupe families ⏭) |
| **ClickHouse** | Columnar analytics (funnels, route quality, LLM-quality proxies) — no PII by schema review | Analytics plane, Stage B+ | Kafka sink | ⏭ |
| **Kafka** | Durable event bus between services (Stage A uses Redis Streams) | Stage B+ | `packages/events` topics | ⏭ |
| **Object storage (S3)** | Client-encrypted backup blobs, chain archive, audit anchors, GDPR exports | Backup/DR + compliance | KMS-guarded buckets | ⏭ |

**Non-negotiable placement rules**

- **The system of record is Postgres.** SQLite is a same-shape *local* stand-in so a laptop needs no Docker to
  run the loop — it is never the store of record for a deployed environment.
- **Redis is never the source of truth for anything durable.** Everything in Redis is either reconstructable
  (cache) or ephemeral-by-design (nonces, rate counters, revocation TTLs). Flushing Redis must never lose money,
  history, or ownership — only performance and open sign-in challenges.
- **Datastores are backend-only.** Client apps (`apps/web`, `apps/mobile`) receive **PUBLIC** config only and
  **never** a DB/Redis URL or credential. `IW_DB_URL`/`IW_REDIS_URL` are mandatory outside `local` and validated
  at boot (`packages/config` `superRefine` — boot fails loudly rather than serving without them).
- **No service reads `process.env` directly.** Every var flows through the typed, Zod-validated `@intent-wallet/config`
  schema (handbook 02 §4), so a missing/invalid store URL crashes startup with a clear message, not a mystery
  mid-request.

---

## 3 · PostgreSQL — the system of record

### 3.1 What is shipped today ✅

Exactly one table exists in code — the **plan store** that makes the `plan → authorize → execute` doctrine
work across replicas (`services/api/src/persistence/plan-store.ts`). It is the reference for how every future
table must be written: parameterized SQL, idempotent DDL, an interface a test double can satisfy.

```sql
CREATE TABLE IF NOT EXISTS plans (
  plan_id    TEXT   PRIMARY KEY,     -- server-issued plan id (never client-chosen)
  plan       JSONB  NOT NULL,        -- the ExecutionPlan; money inside is base-unit/decimal STRINGS
  owner      TEXT   NOT NULL,        -- the authenticated principal the plan was issued to
  created_at BIGINT NOT NULL         -- epoch ms; used for bounded pruning
);
CREATE INDEX IF NOT EXISTS plans_created_at ON plans (created_at);
```

- **Ownership is enforced, not advisory.** `authorize`/`execute` load `{plan, owner}` and refuse if `owner`
  ≠ the caller's principal — so one user can't act on another's plan (doctrine law #5; task #92).
- **Writes are parameterized** (`$1…$n`) — a `planId`/`owner` can never inject SQL. This is the standard for
  *all* SQL in the repo; string-built queries are a review block.
- **Bounded, not unbounded.** The store prunes past `maxSize` using a **total** order (`created_at DESC,
  plan_id DESC`) so a same-millisecond tie can't non-deterministically evict a just-inserted row. Upserts are
  `ON CONFLICT (plan_id) DO UPDATE` — idempotent on `planId`.
- **The exact same shape runs on SQLite locally** (`INSERT OR REPLACE`, a `PRAGMA table_info` guard that
  ALTER-adds a legacy-missing column). One store interface, two backends, one test suite — `pg-mem` stands in
  for a live Postgres so the SQL is unit-tested without a server (`services/api/test/plan-store.test.ts`).

> **Note the deliberate divergences from the mandated schema below:** the plan store uses `BIGINT` epoch-ms
> (not `timestamptz`) and a `JSONB` document (not normalized `plan_steps`), because it is an *operational,
> pruned cache of server-issued plans*, not the long-term financial record. That is a conscious scope choice,
> documented here — not schema drift.

### 3.2 The mandated system-of-record schema ⏭

The full entity model — `users`, `devices`, `identities`, `contacts`, `intents`, `plans`, `plan_steps`,
`executions`, `execution_steps`, `recovery_actions`, `balances`, `tokens`, `risk_flags`, `backup_blobs`,
`notifications`, `api_keys`, `webhook_endpoints`, `audit_log` — is specified as an ER diagram with column types
in [`docs/architecture/03-data.md §1.1`](docs/architecture/03-data.md). Build tables against that spec; do not
re-invent shapes here. Its binding policies:

| Concern | Policy |
|---|---|
| **Amounts** | `numeric(78,0)` base units only (fits `uint256`); floats banned by lint + CI grep; display conversion is client-side. |
| **Partitioning** | `intents`, `plans`, `executions`, `execution_steps`, `notifications`, `audit_log` → range-partitioned by month; `balances` → hash-partitioned by `identity_id` (16 → 64 partitions). |
| **Multi-tenancy** | Row-level security on `identity_id` for user-facing roles; services use scoped roles; **no superuser in app paths**. |
| **PII** | Raw intent text is stored **only** with an explicit consent flag, app-layer encrypted (KMS envelope), 90-day TTL; addresses are pseudonymous but treated as PII for erasure flows (§7, §8). |
| **Scale path** | Stage A: primary + 2 replicas → Stage B: regional read replicas + PgBouncer → Stage C: Aurora Global (single writer region). CockroachDB is the recorded escape hatch if multi-region *writes* ever become mandatory ([09-decisions.md](docs/architecture/09-decisions.md) D-DB). |

---

## 4 · Naming & schema conventions

Fixed by [handbook 01 §1](docs/handbook/01-standards.md); non-negotiable, enforced by review.

| Object | Convention | Example |
|---|---|---|
| Table | `snake_case`, **plural** | `execution_steps`, `risk_flags` |
| Column | `snake_case` | `tx_hash`, `created_at`, `identity_id` |
| Primary key | `uuid` `id` (app-generated UUIDv7-preferred) for entities; natural key where it is genuinely unique (`plan_id`, `(chain_id, address)` for `tokens`) | `id uuid PK` |
| Foreign key | `<entity>_id` referencing `<entities>.id` | `plan_id` → `plans.id` |
| Timestamp | `timestamptz` (UTC), suffix `_at`; store instants, never local time | `finished_at`, `expires_at` |
| Money | `numeric(78,0)` base units, suffix by meaning; **never** `float`/`double`/`numeric(_, >0)` | `amount numeric(78,0)` |
| Boolean | positive sense, no negations | `provisional`, not `not_final` |
| Enum-ish | `text` with a documented value set (or a Postgres `enum` where stable) | `status text -- offered\|approved\|expired` |
| Semi-structured | `jsonb` (never `json`); document the shape in the owning package's schema | `parsed_intent jsonb` |
| Index | `<table>_<cols>[_idx]` | `plans_created_at` |

**JSONB discipline.** `jsonb` is for genuinely open/evolving shapes (a parsed intent, a route, a risk report),
not an excuse to skip columns you'll filter or join on. Anything you query by, order by, or enforce a
constraint on becomes a real column. Money inside JSONB is a **string** (base-unit or decimal) — never a JSON
number, whose IEEE-754 parse would silently corrupt a `uint256`. The domain vocabulary is fixed
(Intent, Plan, Leg/Step, Identity, Vault, Adapter, Solver — [requirements.md §15](requirements.md)): don't
name a column `transaction` where the domain means `step`, or `wallet` where it means `identity`.

---

## 5 · Money — integer bigint, end to end

Money is the one type we refuse to get wrong. There is exactly one representation per layer, and a boundary
function to move between them. This is the Stripe rule (integer minor units, no floats) taken to `uint256`
scale.

| Layer | Representation | Why | Reference |
|---|---|---|---|
| **In-core logic** | `bigint`, base units (wei, satoshi, lamports, µUSD) | Exact; no rounding; arithmetic is total | `packages/intents/src/amount.ts` |
| **On the wire (JSON)** | **string** — base-unit integer string inside plans, decimal string for user-facing amounts | JSON numbers lose precision > 2^53; a string round-trips exactly | `packages/intents/src/schema.ts` |
| **At rest (columns)** | `numeric(78,0)` base units | Fits `uint256`; integer-only; DB math stays exact | arch 03 §1.2 |
| **At rest (inside JSONB)** | base-unit / decimal **string** | A JSONB number is a float; a string is not | `plans.plan` |
| **At the UI edge only** | formatted decimal for humans | Display is the *only* place a value becomes human-readable | `baseToDecimal()` |

**The laws:**

- **No float in a money path — ever.** No `float`/`double`/`real` column, no JS `number` holding an amount, no
  `parseFloat` on a value. This is a **CI-grep security gate** ([handbook 04](docs/handbook/04-quality.md)),
  not a style preference.
- **Convert only at named boundaries.** `decimalToBase(value, decimals)` and `baseToDecimal(base, decimals)`
  are the *only* sanctioned conversions; extra fractional digits truncate (never round up into money that
  doesn't exist).
- **Ambiguity refuses, it doesn't guess.** A grouped/localized amount that can't be parsed unambiguously
  (`"0,5"`, `"1,23"`) returns `null` so the caller asks the user — we never sign a maybe-wrong amount
  (`normalizeGroupedAmount`).
- **`decimals` travels with the amount.** A base-unit integer is meaningless without its `decimals`; store or
  pass both, always.

---

## 6 · Migrations — expand → migrate → contract, forward-only

Schema change is a production event, treated with Linear/Vercel-grade discipline: additive, reversible in
practice, and never a big-bang.

**Rules**

- **Forward-only, zero-downtime.** Every change is **expand → migrate → contract**: add the new column/table
  (nullable/defaulted), backfill and dual-write, cut reads over, *then* in a later release drop the old.
  Application code must run against **both** the pre- and post-migration schema during rollout.
- **Idempotent DDL.** `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` —
  a migration (or a fresh boot) must be safe to re-run. The shipped stores demonstrate this: the SQLite store
  self-heals a legacy file by `PRAGMA table_info` → `ALTER TABLE ADD COLUMN` when the `owner` column is missing,
  and the Postgres store `CREATE TABLE IF NOT EXISTS` on init.
- **Every migration PR carries a rollback note.** How to reverse it (or why it is forward-only-safe), and the
  backfill/verification plan. Money-path migrations get two reviewers (handbook 01 §4).
- **No blocking locks on hot tables.** Create indexes `CONCURRENTLY`; add `NOT NULL` via a validated `CHECK`
  then promote; never rewrite a large table under an `ACCESS EXCLUSIVE` lock in the request path.
- **Additive JSONB.** Growing a JSONB shape is versioned via a `schema_version` field, additive within a major;
  consumers tolerate unknown keys.

**Tooling.** The mandated migration tool is **Drizzle** (forward-only), specified in arch 03 §1.2 — ⏭ *not yet
present in the repo* (no `drizzle-*` dependency or `migrations/` directory exists today; the shipped stores run
idempotent DDL at boot). When Drizzle lands, migrations become versioned files under the service, CI-checked,
applied on deploy — and the boot-time `CREATE TABLE IF NOT EXISTS` shims retire.

---

## 7 · The non-custodial data rule — no secret, ever, server-side

This is the load-bearing wall. Intent Wallet is non-custodial in the same sense as Phantom or Rabby: **we
never hold the keys, so we can never move — or lose — a user's funds, and neither can an attacker who owns our
database.** The data layer is where that promise is kept or broken.

**What the server may store**

- Pseudonymous chain **addresses** (BTC/EVM/SOL) — public by nature, but treated as PII for deletion (§8).
- **Server-issued plans**, executions, and their steps (the money *record*, not the money *authority*).
- **Session metadata**: SIWE nonces, JWT `jti`/revocation markers, device push tokens, `last_seen_at`.
- **Public** token metadata, risk flags, and portfolio *projections* (rebuildable from chain state).
- **KMS references** and **hashes** — pointers and one-way digests, never the secret they stand for.

**What the server must NEVER store — in any column, cache, log, blob, backup, or crash dump**

- A **seed / mnemonic** or any **private key**, in any form, encrypted or not. These exist only on-device
  (`packages/core`, encrypted vault at rest, RAM only while unlocked — see [SECURITY.md](SECURITY.md)).
- A **plaintext password or API key.** Enterprise API keys are stored as an **argon2 hash** (`key_hash`) and
  compared, never reversibly (arch 03 §1.1); webhook signing secrets are **KMS refs**, not the secret bytes.
- **User raw intent text** without an explicit consent flag — and even then, app-layer (KMS-envelope) encrypted
  with a 90-day TTL (§8).
- Any secret in a **log line, error message, or analytics event** (handbook 01 §3; enforced per error class).

**How auth works without a secret.** Sign-in is **SIWE** (EIP-4361): the wallet signs a server-issued nonce
**in the browser** with its EVM key; the server *recovers the signer address* and checks it against a one-time,
atomically-consumed nonce (Redis `GETDEL`). No key, no password, no shared secret ever reaches the server —
authentication rides the same non-custodial signature the wallet already produces (`services/api/src/auth/siwe.ts`,
`auth/redis.ts`).

**Backups can't leak funds.** User **backup blobs** are **client-encrypted before upload** (`backup_blobs` holds
an `s3_key` + `content_hash` + `size_bytes` — never plaintext); the server stores ciphertext it *cannot decrypt*.
A total breach of `iw-backups` yields opaque bytes, not seeds. The corollary is the honest one we tell users:
if they lose their seed *and* their client backup password, **no one — including us — can recover their funds.**

---

## 8 · PII classification, retention & DSAR

Non-custodial makes privacy tractable: because we never held keys or funds, *"delete my data"* is always about
**metadata/PII, never money.** The tension every real system faces — a user's right to **erasure** vs. a
regulator's demand for **retention** — is resolved **deterministically and fail-safe** by the shipped privacy
engine (`packages/compliance/src/privacy.ts`) 🔶 *(pure core shipped and tested; not yet wired to a live DSAR
endpoint over the production data plane)*.

### 8.1 Data classes

| Class | Examples | Sensitivity |
|---|---|---|
| **Secret** | seed, private keys | **Never server-side** (§7) — out of scope for storage entirely |
| **Credential** | JWT `jti`, SIWE nonce, `key_hash` | High — hashed/ephemeral, TTL-bounded |
| **PII (pseudonymous)** | addresses, contacts, device/push tokens | High — deletable on request |
| **PII (sensitive, consent-gated)** | raw intent text | Highest metadata — encrypted, 90-day TTL, consent flag required |
| **Financial record** | executions, steps, receipts | Retained (AML posture) — *pseudonymized*, not erased |
| **Rebuildable projection** | balances, portfolio snapshots | Low — dropped freely, reconstructable from chain |
| **Analytics** | funnel/quality events | Pseudonymous, no PII by schema review |

### 8.2 Retention & deletion map (GDPR / DPDP) — arch 03 §6

| Data | Retention | On user deletion |
|---|---|---|
| Sessions / devices | until revoked + 90 d | cascade-deleted |
| Intents (parsed JSON) | 24 mo | cascade; raw text 90 d + consent-gated |
| Executions / steps | 7 y (financial-records posture) | **pseudonymized** (identity unlink), **not erased** — documented in the privacy policy |
| Balances projection | rebuildable | dropped on identity unwatch |
| Analytics | 13 mo, pseudonymous | salt rotation makes re-identification infeasible |
| Audit log | 7 y, append-only | actor **pseudonymized**; entries never removed (§13) |

### 8.3 The DSAR contract

- **Access/export**: assemble a per-subject `ExportManifest` and drop it to `iw-exports` behind a 7-day-TTL
  pre-signed URL. Exports carry no other user's data and no secret.
- **Erasure, fail-safe**: an erasure request erases everything **except** data under an active **legal hold** or
  still inside its **retention window**, and returns exactly *what was retained and why*. A data class with **no
  retention rule defined** is **retained, not deleted** (`retentionScheduleFor` returns an indefinite
  `deleteAfterIso: null`) — erasing on a missing rule would silently destroy records we're required to keep. A
  negative/overflowing `retainDays` also resolves to "retain," never to "already deletable."
- **Timestamps are UTC ISO-8601**; a timezone-ambiguous string parses host-dependently, so ingestion normalizes
  to UTC before any retention math.

---

## 9 · Redis — one role per instance group

Redis holds only ephemeral or reconstructable state (§2). Never one giant shared Redis; each **group** owns one
job, sized and evicted for that job. Every key is namespaced and built through the central registry
(`packages/events/src/redis-keys.ts`) — **no ad-hoc string concatenation at call sites**, so key shapes, TTLs,
and owning group stay documented in one place. Key format is `ns:{scope}:{id}` (handbook 01 §1).

| Group | Keys | Pattern | TTL | Eviction | State |
|---|---|---|---|---|---|
| `redis-rt` | rate-limit counters `rl:{scope}:{key}`; session revocation `rev:{jti}`, `siwe:signedout:{sub}` | counters / markers | window / token life | `noeviction` | ✅ |
| *(auth)* | SIWE one-time nonce `siwe:nonce:{nonce}` | set-PX + atomic `GETDEL` | challenge TTL | expiry | ✅ |
| `redis-cache` | portfolio `pf:{identity}`, token meta `tok:{chain}:{addr}`, route quote `rt:{hash}`, singleflight `lock:{key}` | cache-aside | 60 s / 24 h / 30 s / 2 s | `allkeys-lru` | ⏭ |
| `redis-prices` | latest tick `px:{asset}` + pub/sub fan-out to the WS gateway | pub/sub + hot keys | 60 s | `allkeys-lru` | ⏭ |
| `redis-dedupe` | consumer idempotency `seen:{group}:{eventId}` | set-with-TTL | 7 d | `noeviction` | ⏭ |
| `redis-streams` (Stage A only) | the event bus before Kafka | streams + consumer groups | trim by size | — | ⏭ |

**Rules**

- **Every key has a TTL** except the two bounded-by-design families (`rl`, `seen`). An un-TTL'd cache key is a
  memory leak and a staleness bug — both are review blocks. TTL/group policy is codified in `REDIS_KEY_SPEC`.
- **Atomicity where correctness depends on it.** The SIWE nonce is consumed with `GETDEL` (Redis 6.2+) so two
  concurrent verifies of the same nonce can never both succeed — one-time-use is enforced by the store, not by a
  read-then-delete race.
- **Shared, not per-process, in deployed envs.** Nonces, revocation, and the rate limiter live in the shared
  Redis so a challenge issued on pod A verifies on pod B and the rate limit is *global*. Local dev uses in-memory
  equivalents (`InMemory*`) behind the same interface.
- **A dead Redis degrades, it doesn't crash.** The client MUST register an `error` listener (else ioredis
  re-emits and Node exits); on a blip the client reconnects and `/readyz` pulls the pod from rotation until Redis
  returns.

---

## 10 · Caching & invalidation

Cache is a performance layer over the system of record, and it is held to the **never-fake-data** doctrine as
strictly as the UI.

- **Cache-aside.** Read cache → on miss read source → populate with the family's TTL. TTL is the primary
  correctness bound; nothing is cached longer than it can be trusted.
- **Never cache an error as a value.** A failed upstream read returns *unknown* and is **not** written to cache.
  Caching a network failure as `$0` or `[]` would launder a transient outage into a confident lie shown to the
  user (doctrine law #3). A cache **miss** and a **network failure** are different states and stay different all
  the way to the screen.
- **Stampede control.** Hot keys use a singleflight lock (`lock:{key}`, 2 s) so a cold/expired key doesn't
  trigger a thundering herd against the source; one filler, the rest wait or serve last-good with its provenance.
- **Invalidation is event-driven, TTL is the floor.** Money-moving events invalidate proactively: a confirmed
  execution step invalidates the actor's `pf:{identity}` portfolio snapshot rather than waiting out the 60 s TTL.
  Consumers dedupe on `seen:{group}:{eventId}` so a redelivered event is idempotent (§13).
- **Provisional is labelled.** A projection built from unconfirmed/optimistic state carries a `provisional` flag
  end-to-end; it is never presented as settled.

---

## 11 · Event & audit logging

The event bus (`packages/events`) is the contract between services; producers and consumers share **Zod
schemas**, topic names, and key builders so the bus is self-documenting and evolution stays additive-only within
a major version.

- **Envelope + typed schemas** ✅. Every event is an `EventEnvelope` wrapping a schema-validated payload
  (`ChainEvent`, `ExecutionStepEvent`, `IntentLifecycleEvent`, `RiskFlagEvent`, `IdentityRegisteredEvent`).
  Money-path topics are flagged (`MONEY_PATH_TOPICS`) and get DLQ alerting.
- **Topic catalog** ⏭ (Kafka, Stage B+; Redis Streams in Stage A). Per-topic key, retention, and
  producer→consumer wiring are specified in [arch 03 §3](docs/architecture/03-data.md). Keys are chosen so
  per-entity order is **total** (order is only guaranteed within a key). Partitions start at 12 (money topics) /
  24 (`chain.events`) and scale by consumer lag.
- **The audit log is append-only and tamper-evident** ⏭ (table mandated; audit *disciplines* and event schemas
  ✅ in `packages/policy`, `packages/compliance`). `audit_log` is a hash chain: each entry carries `prev_hash`
  and `entry_hash`, daily anchors are written to `iw-audit-anchors` under object-lock **COMPLIANCE (WORM)** mode.
  Entries are **never** deleted — on user deletion the *actor* is pseudonymized, the record persists. Every risky
  decision (risk verdict, policy denial, guard block, auto-execution) lands here with its inputs, so security and
  correctness are *demonstrated*, not asserted (doctrine law #6).

---

## 12 · Backup & disaster recovery

Backup posture follows the store's role (§2): protect the system of record, treat caches as disposable, and
remember that the *user's* most precious data (their seed) is one thing we deliberately cannot back up.

| Store | Backup expectation | RPO / RTO target | Restore posture |
|---|---|---|---|
| **PostgreSQL** (system of record) | Continuous WAL archiving + PITR; ≥ 2 replicas; nightly base backup, retained per the financial-records window | **RPO ≤ 5 min, RTO ≤ 30 min** ⏭ | Restore drills are periodic and *rehearsed*, not theoretical — an untested backup is not a backup |
| **Redis** | **None required** — reconstructable/ephemeral by design (§2). A cold Redis re-warms; open sign-in challenges are simply re-issued | RPO n/a | Flush-safe: never a source of truth for money, history, or ownership |
| **SQLite** (`.plans.db`) | Local dev only; not backed up | n/a | Disposable — re-created on next boot |
| **Object storage** (`iw-backups`, archives, anchors) | Versioned + SSE-KMS; `iw-backups` object-locked 30 d; audit anchors WORM | RPO ≈ 0 (versioned) | Client-encrypted blobs restore as opaque ciphertext (§7) |

**DR laws**

- **The system of record is authoritative; everything else is rebuildable.** Balances/portfolio projections,
  caches, and analytics can be regenerated from chain state + the event archive (`iw-chain-archive`, replay
  source), so DR planning centers on Postgres and object storage, not Redis or projections.
- **Backups inherit the no-secret rule.** No backup — Postgres dump, Redis snapshot, log archive — may contain a
  seed, private key, plaintext credential, or un-consented raw intent text. A backup is just another place data
  lives, and §7 governs all of them.
- **We cannot restore a user's funds.** By design. A lost seed with a lost client-backup password is
  unrecoverable by anyone, including us — this is stated plainly to users, not buried. Our DR restores *our*
  metadata; it never touches *their* keys because we never had them.

---

## 13 · Before-you-ship checklist

Run this before merging anything that adds or changes a store, table, column, key, or cache.

- [ ] **Right store, right role?** Durable & authoritative → Postgres. Ephemeral/reconstructable → Redis.
      Local dev parity → SQLite behind the same interface. No new engine without an ADR.
- [ ] **No secret anywhere near it.** No seed/key/plaintext-credential/un-consented-PII in the column, cache,
      log, or backup. Credentials are hashed; secrets are KMS refs. (§7)
- [ ] **Money is integer.** `numeric(78,0)` or base-unit/decimal **string** in JSONB. No float, no JS `number`.
      Passes the CI money-grep. (§5)
- [ ] **Conventions hold.** `snake_case` plural tables, `_at` `timestamptz`, `_id` FKs, `jsonb` (not `json`),
      documented enum value sets. (§4)
- [ ] **Migration is expand→migrate→contract**, idempotent DDL, forward-only, with a rollback note; code runs
      against both schema versions during rollout. (§6)
- [ ] **Query is parameterized.** No string-built SQL. Ownership/tenancy is enforced, not assumed. (§3)
- [ ] **New Redis key is in the registry** with a TTL and a group; no ad-hoc key strings. (§9)
- [ ] **Cache never stores an error as a value**; miss ≠ failure ≠ `$0`; invalidation on the relevant event. (§10)
- [ ] **PII is classified** with a retention rule and an erasure/pseudonymization path; a missing rule means
      *retain*, never silently delete. (§8)
- [ ] **Money-touching change emits an auditable event** with its inputs. (§11)
- [ ] **Backup/DR implication considered** — and it still can't leak a secret or fake a value. (§12)

> If a rule here blocks something the product needs, the answer is an ADR that changes the rule on purpose —
> **not** a quiet exception in a migration. The data layer is where "never lied to, never lose funds" is either
> kept or quietly broken; keep it.
