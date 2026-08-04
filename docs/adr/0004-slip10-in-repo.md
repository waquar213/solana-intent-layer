# ADR-0004 — SLIP-0010 ed25519 derivation implemented in-repo

- Status: Accepted
- Date: 2026-07-05
- Deciders: Wallet Core Lead, Security Lead

## Context

Solana uses ed25519 HD derivation (SLIP-0010). The common package (`ed25519-hd-key`) is unmaintained and pulls legacy dependencies — unacceptable in the most security-critical package.

## Decision

Implement SLIP-0010 ed25519 derivation **in-repo** (~60 LOC over @noble/hashes HMAC-SHA512), validated against the official SLIP-0010 test vectors AND cross-checked against `ed25519-hd-key` (as a dev-dependency in tests only).

## Alternatives considered

| Option                       | Pros                                                   | Cons                                                            | Verdict                             |
| ---------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------- |
| **In-repo impl**             | no stale runtime dep, full control, spec-vector tested | ~60 LOC we own                                                  | **chosen**                          |
| `ed25519-hd-key` runtime dep | ready-made                                             | unmaintained, legacy transitive deps in the crown-jewel package | rejected (kept as test-only oracle) |
| Fork the package             | control                                                | maintenance of a fork, same code we'd write                     | rejected                            |

## Consequences

- **Maintenance:** 60 lines with property + vector tests; no external runtime code in the hottest security path. Cross-check test flags any divergence if we ever refactor.
- **Scaling:** trivial (pure function).
- **Security:** removes an unmaintained dependency from key derivation; correctness is pinned by official vectors 1 & 2 at all path depths ([packages/core/test/slip10.test.ts](../../packages/core/test/slip10.test.ts)).
