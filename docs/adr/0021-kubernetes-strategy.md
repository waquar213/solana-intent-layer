# ADR-0021 — Kubernetes: EKS + Karpenter + KEDA + ArgoCD

- Status: Accepted
- Date: 2026-07-05
- Deciders: SRE Lead, CTO

## Context

We need lag-based autoscaling (Kafka consumers), GitOps, multi-region parity, admission-controlled signed images, and hiring liquidity — with the money plane isolated from batch workloads.

## Decision

**EKS** (3 AZs/region, cluster-per-env; admin plane in its own cluster). **Karpenter** for node autoscaling, **KEDA** for Kafka-lag-based scaling of workers, **HPA** for latency/CPU, **ArgoCD** for GitOps. No service mesh initially (OTel + network policies cover the need).

## Alternatives considered

| Option                          | Pros                                                                         | Cons                                               | Verdict                                      |
| ------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| **EKS + Karpenter/KEDA/ArgoCD** | KEDA lag-scaling, GitOps, signed-image admission, portable, deep talent pool | K8s operational complexity                         | **chosen**                                   |
| ECS/Fargate                     | simpler                                                                      | weaker on lag-scaling, GitOps, multi-region parity | rejected                                     |
| Nomad                           | lighter                                                                      | smaller ecosystem, fewer managed integrations      | rejected                                     |
| Fly.io/Render                   | fast start                                                                   | not built for our multi-region money-path control  | rejected (fine for a prototype, not Stage C) |

## Consequences

- **Maintenance:** GitOps means `infra/k8s` is the only source of truth (manual kubectl is alert-worthy); one orchestration skill set.
- **Scaling:** KEDA scales execution/portfolio/notification workers on queue depth (not just CPU); Karpenter right-sizes nodes; spot pools for non-money batch only.
- **Security:** default-deny network policies between namespaces; IRSA (pod-level IAM, no static creds); cosign signature verified at admission; `money-path` priorityClass preempts batch; admin plane fully isolated ([architecture 05 §2](../architecture/05-infrastructure.md)).
