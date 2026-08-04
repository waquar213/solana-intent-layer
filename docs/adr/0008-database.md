# ADR-0008 — Database: PostgreSQL (Aurora), Drizzle ORM

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Backend Lead, Data Lead

## Context

System of record for intents, plans, executions, and the audit log. Requires multi-row ACID (transactional outbox), row-level security, and partitioning at scale. Execution is single-writer-region by design ([ADR-0027](0027-deployment-topology.md)), so global multi-writer is explicitly NOT required.

## Decision

**PostgreSQL 16**, managed as **Aurora** (Global Database for cross-region read replicas). **Drizzle** for schema + forward-only migrations. Money amounts stored as `numeric(78,0)` base units.

## Alternatives considered

| Option                | Pros                                                 | Cons                                                                                      | Verdict                          |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------- |
| **PostgreSQL/Aurora** | ACID outbox, RLS, PITR, huge ecosystem, team fluency | single write region (acceptable by design)                                                | **chosen**                       |
| CockroachDB           | global multi-writer                                  | solves a problem we don't have; sagas hate split-brain more than they need global writes  | rejected (recorded escape hatch) |
| DynamoDB              | serverless scale                                     | access-pattern rigidity fights an evolving product; no ad-hoc queries; weak multi-row txn | rejected                         |
| MySQL/Vitess          | proven sharding                                      | weaker JSON/RLS story than PG; less pleasant for our access patterns                      | rejected                         |

## Consequences

- **Maintenance:** migrations-as-code (expand→migrate→contract for zero downtime); one well-understood engine.
- **Scaling:** read replicas + PgBouncer; hash-partition `balances`, range-partition time-series tables; Aurora Global for regional reads. If per-region _writes_ ever become mandatory, `balances`/`notifications` extract first (documented in [architecture 09 D12](../architecture/09-decisions.md)).
- **Security:** row-level security per identity as a backstop under app authz; scoped roles per service; no superuser in app paths; audit log on an append-only role.
