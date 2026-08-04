# ADR-0024 — Infrastructure as Code: Terraform

- Status: Accepted
- Date: 2026-07-05
- Deciders: SRE Lead

## Context

All infrastructure (VPC, EKS, RDS/Aurora, MSK, ElastiCache, S3, IAM, WAF) must be declarative, reviewed, reproducible across environments, and taggable for FinOps.

## Decision

**Terraform** (with remote state in S3 + DynamoDB locking), organized as `infra/terraform/{modules,envs}`. Kubernetes workloads are declarative separately via kustomize + ArgoCD ([ADR-0021](0021-kubernetes-strategy.md)); Terraform owns cloud primitives, Argo owns cluster workloads.

## Alternatives considered

| Option        | Pros                                                              | Cons                                              | Verdict                                                      |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| **Terraform** | de-facto standard, huge provider set, mature modules, hiring pool | HCL quirks; state management                      | **chosen**                                                   |
| Pulumi        | real languages (TS!)                                              | smaller ecosystem; state service or self-manage   | rejected (tempting for TS-shop, but ecosystem/maturity wins) |
| CDK           | TS, AWS-native                                                    | CloudFormation underneath (drift, slow); AWS-only | rejected                                                     |
| Crossplane    | K8s-native infra                                                  | early for our needs; another control plane        | rejected (revisit)                                           |

## Consequences

- **Maintenance:** modules reused across envs; every change is a reviewed PR with a plan; tagging enforced (untagged = CI failure) for cost attribution.
- **Scaling:** environments (dev/staging/prod-region) are module instantiations; adding a region is a new env composition, not new code.
- **Security:** infra changes go through the same review + audit as app code; least-privilege IAM defined as code and diffable; state encrypted with locking to prevent concurrent corruption.
