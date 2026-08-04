# ADR-0019 — Object storage: Amazon S3

- Status: Accepted
- Date: 2026-07-05
- Deciders: SRE Lead, Security Lead

## Context

We store client-encrypted backup blobs, the raw indexer event archive (replay source), audit anchor hashes (WORM), signed release artifacts, and short-lived user data exports.

## Decision

**Amazon S3** with per-purpose buckets and controls: SSE-KMS, versioning, Object Lock (COMPLIANCE mode for audit anchors), lifecycle to Glacier for cold archives, per-identity prefix IAM.

## Alternatives considered

| Option            | Pros                                                               | Cons                                             | Verdict                                    |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------ |
| **S3**            | durability (11 nines), Object Lock/WORM, lifecycle, KMS, ecosystem | AWS-coupled (already our cloud)                  | **chosen**                                 |
| Cloudflare R2     | no egress fees                                                     | fewer compliance/WORM features; second vendor    | rejected (revisit for egress-heavy assets) |
| GCS               | comparable                                                         | second cloud's IAM to harden                     | rejected (single-cloud principle)          |
| Self-hosted MinIO | control                                                            | we'd operate durability ourselves — not worth it | rejected                                   |

## Consequences

- **Maintenance:** lifecycle policies automate cold-tiering; cross-region replication for DR is a config.
- **Scaling:** effectively unbounded; per-identity prefixes keep access scoping simple at 100M users.
- **Security:** backup blobs are already client-encrypted (we hold opaque ciphertext) with SSE-KMS on top; audit anchors are WORM-locked (tamper-evident); exports are pre-signed, 7-day TTL ([architecture 03 §5](../architecture/03-data.md)).
