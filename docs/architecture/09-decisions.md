# 09 — Technology Decisions (alternatives compared)

Numbered D-records continue memory.md's Decisions Log (D1–D10 recorded there). Scoring: ✓ good · ~ acceptable · ✗ poor, against OUR priorities (security → scalability → performance → maintainability → cost → UX).

## D11 — Event bus: Kafka (via Redis Streams on-ramp)

| Criterion                        | Redis Streams  | NATS JetStream | **Kafka (MSK)** | SQS/SNS |
| -------------------------------- | -------------- | -------------- | --------------- | ------- |
| Ordered, replayable log          | ~ (per stream) | ✓              | ✓               | ✗       |
| Throughput at 50k ev/s           | ~              | ✓              | ✓               | ~       |
| Long retention/compaction        | ✗              | ~              | ✓               | ✗       |
| Ecosystem (CH sink, MirrorMaker) | ✗              | ~              | ✓               | ~       |
| Ops burden (early team)          | ✓ trivial      | ✓              | ✗ heavy         | ✓       |
| Multi-region replication         | ✗              | ~              | ✓ MM2           | ~       |

**Decision:** Stage A = Redis Streams (we already run Redis; ops ≈ 0). Stage B+ = Kafka. The consumer API in `packages/events` abstracts the bus so migration = adapter swap + topic backfill. NATS is the recorded fallback if MSK cost/ops disappoints. **Why not Kafka day 1:** a 4-person team spending its innovation budget on ZooKeeper-less Kafka tuning instead of the intent engine is how startups die.

## D12 — System of record: PostgreSQL (Aurora), not CockroachDB/DynamoDB

Postgres wins on: transactional outbox (needs multi-row ACID), RLS, team fluency, ecosystem (Drizzle, PgBouncer, PITR). Cockroach offers global writes we deliberately don't need (execution is single-writer-region **by design** — sagas hate split-brain more than they love latency). DynamoDB's access-pattern rigidity fights an evolving product. **Escape hatch recorded:** if per-region write autonomy ever becomes mandatory, `balances` and `notifications` extract first.

## D13 — Mobile: React Native (Expo dev-client), not Flutter/native

The deciding argument is singular: **`@intent-wallet/core` is audited TypeScript.** RN runs it as-is (Hermes) with native modules only for enclave/biometrics; Flutter would force a Dart re-implementation of key management = second audit surface, drift risk, and a fund-loss bug class we simply refuse to own. Native Swift/Kotlin doubles that cost. Perf-critical screens (portfolio list) get native optimizations case-by-case. Flutter's superior raw UI perf is real and rejected consciously.

## D14 — Backend: TypeScript/Node (Fastify), Rust budgeted for hot paths

One language across core/clients/server = shared Zod contracts end-to-end (parse once, typed everywhere), one hiring pool, one toolchain. Go's goroutine model and Rust's perf are real advantages that don't outweigh contract-sharing for PRODUCT services. Standing budget: Solana indexer and route-scoring inner loop move to Rust when profiling — not fashion — demands (trigger: sustained > 60% CPU at target throughput).

## D15 — Orchestration: EKS + Karpenter, not ECS/Fly/GCP

K8s is the only option satisfying: KEDA lag-based scaling, ArgoCD GitOps, multi-region parity, admission-controlled signed images, and hiring liquidity. ECS is simpler but weaker on 3 of 5. GKE is technically excellent; AWS wins on MSK/Aurora Global/KMS adjacency (one cloud's IAM to harden, not two). Revisit only with a compelling multi-cloud compliance driver.

## D16 — LLM strategy: Claude API via our AI Gateway, deterministic-first

- Routing: claude-haiku-4-5 for classification/suggestions; claude-sonnet-5 for parse/explain; escalation only on low confidence.
- Deterministic pre-parser handles the top utterance shapes free of charge (~40–60% expected hit rate) — the LLM is the fallback, not the front line.
- Vendor abstraction at the gateway; a second provider is config, and the FORMS fallback (not another LLM) is the availability story.
- Fine-tuning deferred: prompt+schema+evals first; distill to a small model only at proven scale economics.

## D17 — Analytics: ClickHouse, not BigQuery/Snowflake

Event volume at 100M users (~10B events/mo) makes per-query-priced warehouses a CFO incident. ClickHouse Cloud early (ops ≈ 0), self-host at scale. BigQuery remains the recorded alternative if we land GCP-heavy enterprise contracts.

## D18 — Modular monolith first (Stage A), services when load demands

The catalog in [02-services.md](02-services.md) is the _logical_ architecture; deploying 16 microservices for 10k users is résumé-driven engineering. Boundaries are enforced in-repo (import-lint between modules, separate DB roles per module, events-only cross-module facts) so extraction is mechanical. Trigger metrics per service recorded in [01 §5](01-system-overview.md).

## D19 — WS fan-out: dedicated ws-gateway pods + Redis/Kafka bridge

500k concurrent connections ≈ 25–35 pods (Node, ~16k conns/pod with headroom) — boring and horizontal. Managed alternatives (API GW WebSockets, Pusher) priced out at this fan-out volume and add a vendor on the money-notification path.

## D20 — Non-custodial automation: ERC-4337 session keys, not custodial delegation or MPC co-signing

For "buy ETH every Monday": custodial delegation violates the prime constraint; MPC co-signing servers reintroduce a trusted signer + audit burden; 4337 session keys give cryptographically-bounded automation (amount caps, venue allowlist, expiry) that we can show the user as a _contract_, revocable on-chain. Cost: EVM-only initially — BTC/SOL recurring intents round-trip to the device, stated honestly in UX. Smart-account module (Safe vs Kernel vs Biconomy) is a Phase 9 ADR with a security-audit prerequisite.
