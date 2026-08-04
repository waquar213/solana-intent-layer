# ADR-0020 — Cloud provider: AWS

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, SRE Lead

## Context

We want one cloud's IAM to harden (not two), managed building blocks that match our other ADRs (Aurora Global, MSK, KMS, EKS), multi-region capability, and hiring liquidity.

## Decision

**AWS** as the single primary cloud. Single-cloud by default; multi-cloud only with a compelling compliance/enterprise driver (recorded as a future decision, not a launch goal).

## Alternatives considered

| Option                 | Pros                                                                             | Cons                                                     | Verdict                               |
| ---------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------- |
| **AWS**                | Aurora Global, MSK, KMS, EKS adjacency; deepest managed set; biggest talent pool | not the cheapest line-by-line                            | **chosen**                            |
| GCP                    | excellent K8s (GKE), BigQuery, networking                                        | our data ADRs lean AWS; second IAM model if mixed        | rejected (strong, but coherence wins) |
| Azure                  | enterprise reach                                                                 | weaker fit for our stack; smaller crypto-infra community | rejected                              |
| Multi-cloud from day 1 | resilience, no lock-in                                                           | doubles the security surface + ops for a startup         | rejected (premature)                  |

## Consequences

- **Maintenance:** one IAM/security model, one Terraform provider surface, one on-call skill set; managed services reduce undifferentiated ops.
- **Scaling:** Aurora Global + MSK + EKS + Global Accelerator deliver the multi-region topology ([architecture 05](../architecture/05-infrastructure.md)) without cross-cloud glue.
- **Security:** a single, deeply-hardened IAM boundary; KMS as the root of secret/key-wrapping trust; egress allowlists per service. Lock-in mitigated by portable choices elsewhere (K8s, OTel, Postgres, Terraform).
