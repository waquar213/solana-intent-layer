# ADR-0018 — Observability: OpenTelemetry + Prometheus/Grafana/Loki/Tempo + Sentry

- Status: Accepted
- Date: 2026-07-05
- Deciders: SRE Lead, CTO

## Context

Money must be traceable end-to-end across every hop. We need metrics, logs, and traces with correlation ids, vendor-neutral, without lock-in — covering both "logging" and "monitoring" as one coherent stack.

## Decision

**OpenTelemetry** SDK everywhere → OTel Collector → **Prometheus** (metrics), **Tempo** (traces), **Loki** (logs), **Grafana** (dashboards), **Sentry** (client + server error tracking), **PagerDuty** (alerting). Logging is via `packages/observability` (`createLogger`, redaction built in); `console.*` is banned in shipped code.

## Alternatives considered

| Option                            | Pros                                                        | Cons                                  | Verdict                                 |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------- | --------------------------------------- |
| **OTel + Grafana stack + Sentry** | vendor-neutral, self-hostable, one instrumentation standard | assemble the stack                    | **chosen**                              |
| Datadog                           | turnkey, excellent UX                                       | cost balloons at scale; lock-in       | rejected (recorded alt for early speed) |
| ELK stack                         | mature logs                                                 | heavier ops, weaker tracing story     | rejected                                |
| Cloud-native (CloudWatch only)    | zero setup                                                  | weak tracing/correlation, AWS lock-in | rejected                                |

## Consequences

- **Maintenance:** OTel means instrumentation is portable if a backend changes; golden dashboards (RED per service, money-path, chain-health, AI) are generated from `slo.yaml`.
- **Scaling:** sampling on traces; Prometheus federation / Mimir if metric cardinality grows.
- **Security:** logger redaction guarantees secrets never serialize; correlation ids enable incident forensics; the audit stream ([architecture 06 §4](../architecture/06-security.md)) is separate and tamper-evident, not just logs.
