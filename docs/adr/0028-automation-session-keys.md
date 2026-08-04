# ADR-0028 — Automation via ERC-4337 session keys (not custodial delegation or MPC co-signing)

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Security Lead

## Context

Recurring/automated intents ("buy ETH every Monday") require the platform to act without a live device signature each time — while preserving the non-custodial invariant absolutely.

## Decision

Bounded automation via **ERC-4337 session keys**: the user signs ONCE to grant a key with hard on-chain limits (amount/period, venue allowlist, expiry ≤ 90d), revocable on-chain. EVM-only initially; **BTC/SOL recurring intents round-trip to the device** and the UX says so honestly ([design 07 S-34](../design/07-screens-settings.md)).

## Alternatives considered

| Option                               | Pros                                                                                      | Cons                                                                      | Verdict                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------- |
| **4337 session keys**                | cryptographically bounded, on-chain revocable, non-custodial, shown to user as a contract | EVM-only; needs smart-account infra                                       | **chosen**                |
| Custodial delegation (we hold a key) | works on all chains                                                                       | violates the prime non-custodial constraint                               | rejected (non-negotiable) |
| MPC co-signing server                | flexible policy                                                                           | reintroduces a trusted signer + audit/HSM burden; a partial-custody smell | rejected                  |
| Pre-signed transaction bundles       | simple                                                                                    | can't adapt to price/nonce changes; unsafe for open-ended schedules       | rejected                  |

## Consequences

- **Maintenance:** automation depth = authorization depth is a single, testable rule; the session-key module ships with Foundry fuzz/invariant tests ([ADR-0026](0026-smart-contract-framework.md)).
- **Scaling:** session keys execute without device round-trips within bounds; out-of-bounds runs fall back to a "needs you" notification.
- **Security:** the platform can NEVER exceed the user's on-chain grant; caps + expiry + venue allowlist bound the worst case; one-tap on-chain revocation; the UI never implies capability beyond the grant ([architecture 09 D20](../architecture/09-decisions.md)).
