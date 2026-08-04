# 10 — Cost Estimation & Scaling Roadmap

Order-of-magnitude estimates (monthly, USD), sized from the capacity model in [README](README.md). Assumptions stated so they can be re-derived; ±40% honesty band. LLM prices assume aggressive prompt caching + deterministic fast-path (>50% LLM-call avoidance).

## 1. Cost by growth stage

### Beta — 10k users (~2k DAU) · Stage A

| Line                          | Est.         | Notes                         |
| ----------------------------- | ------------ | ----------------------------- |
| EKS + nodes (1 region, small) | $600         | api, worker, indexers, ws     |
| Aurora PG + Redis             | $500         | db.r6g.large + 2 cache nodes  |
| Managed RPCs (8 chains)       | $1,200       | growth tiers; the real driver |
| LLM (Claude API)              | $700         | ~1k parses/day + explains     |
| Observability + misc SaaS     | $600         | Grafana Cloud/Sentry tiers    |
| CDN, S3, egress, WAF          | $300         |                               |
| **Total**                     | **≈ $4k/mo** |                               |

### 1M users (~50k DAU) · Stage B

| Line                                      | Est.                        | Notes                                  |
| ----------------------------------------- | --------------------------- | -------------------------------------- |
| Compute (2 regions read-active)           | $8k                         | +ws fleet, +indexer shards             |
| Aurora (writer + replicas) + Redis groups | $6k                         |                                        |
| Kafka MSK                                 | $3k                         | 3-broker × 2 regions                   |
| RPC vendors                               | $15k                        | volume tiers; start self-host eval     |
| LLM                                       | $12k                        | 25k parses/day, caching, haiku routing |
| ClickHouse Cloud                          | $2k                         |                                        |
| Observability                             | $4k                         |                                        |
| CDN/egress/WAF/misc                       | $5k                         |                                        |
| **Total**                                 | **≈ $55k/mo** ($0.055/user) |                                        |

### 10M users (~500k DAU) · Stage C entry

| Line                                           | Est.                         | Notes                                                                                      |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| Compute                                        | $45k                         |                                                                                            |
| Data (Aurora Global, Redis, MSK, CH self-host) | $40k                         |                                                                                            |
| Chain access                                   | $60k                         | **self-hosted nodes for top-4 EVM + SOL** (~$25k) + vendor overflow — crossover math below |
| LLM                                            | $70k                         | 250k parses/day; distillation eval starts                                                  |
| Observability + security tooling               | $15k                         |                                                                                            |
| CDN/egress                                     | $20k                         |                                                                                            |
| **Total**                                      | **≈ $250k/mo** ($0.025/user) |                                                                                            |

### 100M users (5M DAU) · Stage C full

| Line                                 | Est.                         | Notes                                                                                          |
| ------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Compute (2 active regions + standby) | $250k                        |                                                                                                |
| Data plane                           | $200k                        |                                                                                                |
| Chain access (node fleet + vendors)  | $250k                        |                                                                                                |
| LLM                                  | $350k                        | distilled small-model for parse fast-tier assumed; else +2×                                    |
| Observability/security               | $60k                         |                                                                                                |
| CDN/egress                           | $90k                         |                                                                                                |
| **Total**                            | **≈ $1.2M/mo** ($0.012/user) | revenue per active intent-user must exceed ~$0.30/mo — trivially true at 0.5% execution spread |

**Structural insight:** cost/user FALLS with scale (caching amortization, node self-hosting, model distillation) while revenue/user is execution-linked — the margin story improves with growth. The two lines to watch weekly from day 1: **LLM $/parse** and **RPC $/DAU**.

## 2. RPC self-host crossover (the biggest lever)

Vendor pricing ≈ $15–25/M requests at volume. A self-hosted EVM archive-ish node pair ≈ $1.5–3k/mo serving ~2–3k rps sustained (~5–8B req/mo equivalent). Crossover ≈ **300–500M req/chain/mo** → expected between 1M–5M users for ETH/Base/Arbitrum. Playbook: self-host top chains behind our ProviderPool with vendors as overflow/failover (the pool design already assumes this — priority ordering, [packages/chains](../../packages/chains)).

## 3. LLM cost control ladder (in order of leverage)

1. Deterministic pre-parser hit-rate (target 40% → 60% over time; each point ≈ 1% off LLM bill).
2. Prompt caching (static template + tools block cached; only user turn varies).
3. Model routing (haiku-class first, sonnet-class on low confidence only).
4. Per-user daily budgets with forms fallback (abuse ceiling).
5. Distilled dedicated parse model at ≥ 100k parses/day (build-vs-buy eval gate).

## 4. Scaling roadmap — what breaks at each 10× and the prepared fix

| Scale      | First bottleneck                                                 | Prepared fix (already in design)                                                                                        |
| ---------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 10k → 100k | single Postgres write head under projection churn                | balances → hash partitions + write batching (designed in [03-data.md](03-data.md))                                      |
| 100k → 1M  | Redis Streams consumer lag; RPC vendor bills                     | Kafka migration (bus abstraction ready); begin node self-hosting                                                        |
| 1M → 10M   | Solana indexer CPU; WS fan-out; LLM spend                        | Rust indexer (D14 budget); ws-gateway horizontal shards by identity hash; distillation eval                             |
| 10M → 50M  | Aurora writer IOPS on execution burst; cross-region read latency | executions partition-by-month + hot/cold split; regional read replicas + edge caches (Stage C)                          |
| 50M → 100M | single execution writer region throughput; audit table growth    | per-identity home-region sharding (already in schema: `identities.home_region`); audit → partitioned + anchored archive |

## 5. FinOps practice

- Cost per: DAU, parse, execution, indexed-event — on the money dashboard next to SLOs (cost is an SLO).
- Tagging enforced by Terraform (service, env, team); untagged = CI failure.
- Spot for every non-money workload; Graviton by default; monthly cost review with the same rigor as incident review.
