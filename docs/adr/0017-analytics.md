# ADR-0017 — Analytics: ClickHouse

- Status: Accepted
- Date: 2026-07-05
- Deciders: Data Lead, CTO

## Context

At 100M users we expect ~10B events/month (funnels, retention, route quality, parse accuracy). Per-query-priced warehouses become a finance incident; we need cheap, fast aggregation over huge event volumes.

## Decision

**ClickHouse** (ClickHouse Cloud early for zero-ops, self-hosted cluster at scale). Ingest via a Kafka engine table from `analytics.raw.v1`. Pseudonymous by default (identity hashed with a rotating salt).

## Alternatives considered

| Option                     | Pros                                                                     | Cons                                          | Verdict                                         |
| -------------------------- | ------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------- |
| **ClickHouse**             | column-store built for event analytics, cheap at volume, fast aggregates | ops at self-host scale; not a txn store       | **chosen**                                      |
| BigQuery                   | serverless, powerful                                                     | per-query cost explodes at our volume         | rejected (recorded alt if GCP-heavy enterprise) |
| Snowflake                  | great warehouse                                                          | expensive for high-frequency event analytics  | rejected                                        |
| Postgres for analytics too | one DB                                                                   | crushes the OLTP system of record; wrong tool | rejected (keep OLTP and OLAP separate)          |

## Consequences

- **Maintenance:** materialized views for funnels/retention/route-quality; schema changes reviewed to prevent de-anonymizing payloads.
- **Scaling:** built for this exact workload; separates analytics load entirely from the money-path DB.
- **Security & privacy:** no PII columns by schema review; pseudonymous by default; salt rotation makes re-identification infeasible; 13-month TTL ([architecture 03 §6](../architecture/03-data.md)).
