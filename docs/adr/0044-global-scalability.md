# ADR-0044 — Global Scalability: bounded, decide-not-act scaling engines + regionally-isolated infra

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Distributed Systems Architect, Principal Cloud Architect, Principal Database Engineer, Principal SRE, Principal Performance Engineer

## Context

The platform must grow from 1k to 100M+ users, billions of API requests/month and millions of chain transactions, multi-region and zero-downtime — **without an architectural rewrite**. Two failure modes to avoid: (1) infrastructure that only scales vertically or has a single point of failure, forcing a redesign at the next order of magnitude; and (2) naive elasticity — an autoscaler that oscillates, storms to the cost ceiling, or scales to zero, and resilience bolted on per-service inconsistently. Auto-scaling and auto-degradation are, like auto-healing (ADR-0043), automation with the power to cause a worse outage than the fault they answer.

## Decision

Split the platform into **infrastructure** (deployed, not coded — global DNS, Anycast LB, edge/CDN, regional Kubernetes, service mesh, distributed data, Kafka, multi-region active-active) and a **standalone `packages/scale`** decision core: pure, deterministic engines that make scale a _bounded, testable behaviour_.

- **Autoscaler** — multi-signal demand (CPU/memory/queue/latency/RPS/inflight/chain-congestion) → desired replicas, taking the **max** (most-stressed dimension wins), then **bounded** three ways: clamp to `[min,max]`, rate-limited step (up fast, down slow), and anti-flap (no scale-down inside the post-scale-up stabilization window; cooldown between actions).
- **Resilience toolkit** — token-bucket rate limiter, concurrency bulkhead (reject = backpressure), generic circuit breaker, backoff+retry with terminal/deadline guards, and priority load-shedding (degrade bottom-up; `critical` protected).
- **Regional routing** — active-active weighted / active-passive failover; never routes to an unhealthy region, never invents a primary when all are down.
- **Cache invalidation** — dependency-cascade planning, cycle-safe.

Doctrine, applied to infrastructure: the engine **decides**; an injected **actuator acts** (the HPA/cluster API, the invalidator). The engine never scales, drops, reroutes, or evicts anything itself, and every decision is bounded — so a bug can propose a bad action but cannot cause a scale-storm or a brown-out. Time is injected → deterministic and replayable. Consistency is chosen per-domain: **strong** for money/authorization (small, serialized), **eventual** for everything users read (huge, cached, replicated).

## Alternatives considered

| Option                                                        | Pros                                               | Cons                                                                       | Verdict                                                     |
| ------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Bounded decide-not-act scale engines + regional isolation** | scales without rewrite; can't storm/flap; testable | more structure up front                                                    | **chosen**                                                  |
| Cloud-managed autoscaling only (HPA defaults, no policy core) | least code                                         | oscillates, storms to ceiling, no multi-signal max, no deterministic tests | rejected (keep HPA as the _actuator_; own the _decision_)   |
| Autoscaler that calls the cluster API directly                | fewer moving parts                                 | a bug has destructive power (scale storm / scale-to-zero)                  | rejected (decide-not-act; actuator is the only actor)       |
| Strong consistency everywhere                                 | simplest mental model                              | the write path can't scale to 100M; every read pays coordination cost      | rejected (strong for money/authz, eventual for reads)       |
| Single-region + big instances (scale up)                      | simple ops                                         | single point of failure; a hard ceiling; no DR                             | rejected (regional isolation + horizontal from the start)   |
| Unbounded ret/queue on overload                               | no dropped work                                    | moves the outage, exhausts memory; no backpressure                         | rejected (bulkhead rejects; shed by priority; DLQ terminal) |

## Consequences

- **Maintenance:** a new scale signal is one `ScaleSignal`; a new resilience guard is one primitive; region/cache/shed are pure functions, each tested (max-wins, clamp+step, anti-flap, cooldown, burst≤capacity, breaker half-open, terminal-never-retried, critical-never-shed, dead-region→null, cascade cycle-safe — 27 tests).
- **Scaling:** every tier is horizontal and regionally isolated; the decision core is stateless CPU; consistency chosen per-domain keeps the write path small and the read path cacheable at 100:1.
- **Security & safety:** the engine holds no actuation power (decide-not-act); bounds make a scale-storm/brown-out structurally impossible; `critical` traffic (in-flight settlement, security) is never shed by load; because keys never leave the device, worst-case regional loss is a liveness event, never loss of funds. Full design: [architecture 25](../architecture/25-global-scalability.md); infra in [05-infrastructure.md](../architecture/05-infrastructure.md) and [10-cost-and-scale.md](../architecture/10-cost-and-scale.md).
