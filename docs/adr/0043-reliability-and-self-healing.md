# ADR-0043 — Reliability & Self-Healing: a bounded decide-not-act SRE engine

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Site Reliability Engineer, Principal Cloud Architect, Principal Observability Engineer, Principal Distributed Systems Engineer

## Context

At 100M+ users, reliability can't depend on humans watching dashboards. Failures must be detected automatically and recovered automatically where safe. But naive auto-remediation is dangerous — a restart loop, a scale-storm, or an auto-action taken blind can cause a worse outage than the original fault, and auto-"healing" a security incident can destroy evidence or mask an attack. We need automatic recovery that is provably bounded.

## Decision

Split the platform into telemetry (OpenTelemetry + Prometheus/Tempo/Loki, per [ADR-0018](0018-observability.md) — instrumentation + infra) and a **standalone `packages/reliability`** SRE brain: a pure, deterministic engine that turns SLIs into error-budget burn, fires burn-rate + threshold ALERTS (dedup + cooldown), and produces **bounded self-healing DECISIONS**. Critically, it **decides but does not act** — an injected `Actuator` performs the action, so the engine cannot restart/scale/drain anything itself. Safety is structural: a change freeze disables all auto-recovery; a security incident is contained AND escalated (never silently healed); repeated failures and a per-service rate limit escalate to a human instead of looping; a cooldown throttles actions. Time is injected, so decisions are deterministic and auditable.

## Alternatives considered

| Option                                                       | Pros                                                                 | Cons                                                                                   | Verdict                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Bounded decide-not-act engine + injected actuator**        | automatic recovery that can't loop or act blind; testable; auditable | more structure than a script                                                           | **chosen**                                                |
| Auto-remediation that acts directly (engine restarts/scales) | fewer moving parts                                                   | a bug in the engine has destructive power; restart loops / scale storms                | rejected (decide-not-act; actuator is the only actor)     |
| Alert-only (page a human for everything)                     | safe                                                                 | doesn't scale to 100M users; slow recovery; alert fatigue                              | rejected (auto-recover the safe cases, escalate the rest) |
| Auto-heal security incidents like any other failure          | uniform                                                              | destroys evidence / masks attacks; a compromised path gets "restarted" back to serving | rejected (contain + escalate, never silently heal)        |
| Non-deterministic controller (reads the clock inline)        | simpler                                                              | irreproducible decisions; cooldown/rate-limit untestable                               | rejected (injected env; deterministic + replayable)       |

## Consequences

- **Maintenance:** a new failure→action mapping is one entry; a new alert is one candidate; SLO/health/healing are pure functions, each tested (burn math, alert cooldown, security-escalate, freeze, rate-limit escalate, no-loop-after-N).
- **Scaling:** the brain is stateless CPU over injected telemetry → horizontal; the load lives in the collectors (sharded infra); escalation caps the blast radius of any single fault.
- **Security:** the engine holds no actuation power (decide-not-act); security incidents are contained and escalated, never silently auto-healed; a change freeze halts automation; determinism makes every recovery decision auditable. Full design: [architecture 24](../architecture/24-observability-sre.md).
