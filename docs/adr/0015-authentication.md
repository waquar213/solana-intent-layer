# ADR-0015 — Authentication: SIWE + short JWT + rotating, device-bound refresh

- Status: Accepted
- Date: 2026-07-05
- Deciders: Security Lead, Backend Lead

## Context

A non-custodial wallet has no password to check server-side; the user already holds a key. Auth must prove address ownership without ever touching the private key, and sessions must be resistant to token theft.

## Decision

**Sign-In-With-Ethereum-style** challenge/response: server issues a single-use nonce, the device signs it (EIP-191), server verifies signature==address. On success, a short-lived **JWT (15 min, ES256, JWKS-rotated)** + a **rotating refresh token bound to a per-device keypair** (proof-of-possession on refresh). Optional passkey/email for notification-only profiles.

## Alternatives considered

| Option                          | Pros                                                    | Cons                                                              | Verdict                                              |
| ------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| **SIWE + JWT + PoP refresh**    | no shared secret, proves key ownership, theft-resistant | custom flow to build/audit                                        | **chosen**                                           |
| Email/password                  | familiar                                                | a password on a non-custodial wallet is theater + a breach target | rejected                                             |
| OAuth/social login as primary   | easy onboarding                                         | custodial-feeling, IdP dependency for a self-custody product      | rejected (optional secondary only)                   |
| Long-lived API tokens for users | simple                                                  | catastrophic if stolen; no rotation                               | rejected (enterprise keys are scoped+hashed instead) |

## Consequences

- **Maintenance:** stateless JWT verification at the gateway (JWKS); only issuance/refresh hit the auth service; revocation list in Redis.
- **Scaling:** verification is distributed (no per-request auth-service call); refresh rotation with reuse-detection (reuse → family revoke).
- **Security:** private key never leaves the device; short JWT limits blast radius; device-bound refresh makes a stolen refresh token useless without the device key ([architecture 06 §2.1](../architecture/06-security.md)).
