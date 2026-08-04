# ADR-0050 — Gas Abstraction: a bounded, decide-not-act gas engine

- Status: Accepted
- Date: 2026-07-06
- Deciders: CTO, Principal Blockchain Engineer, Principal Security Engineer

## Context

Users shouldn't have to hold the native asset to transact, or overpay during a fee spike. Gas abstraction (sponsorship, fee-token payment, smart-account batching) delivers that — but anything that spends money on a user's behalf can be drained or can overpay if unbounded.

## Decision

A standalone **`packages/gas`** deterministic engine that DECIDES gas handling and nothing more: **sponsorship** bounded by a per-tx AND per-user-per-day budget (fails toward `user_pays`, never over-sponsors), **fee-token selection** that rounds up + adds a margin so the paymaster is never short, **EIP-1559 params** clamped to hard caps (never overpay on a spike), and **batching** into bounded UserOperations. The ERC-4337 UserOperation construction + paymaster signing is execution/infra; this engine produces the decisions they act on. Only the clock is injected — otherwise pure bigint math. Non-custodial preserved (it never signs or moves funds).

## Alternatives considered

| Option                                                     | Verdict                                            |
| ---------------------------------------------------------- | -------------------------------------------------- |
| **Bounded decide-not-act gas engine + injected execution** | **chosen**                                         |
| Unbounded sponsorship (sponsor all gas)                    | rejected (drainable; per-tx + daily caps)          |
| Trust the RPC's suggested fee directly                     | rejected (clamp to caps; never overpay on a spike) |
| Engine builds + signs the UserOperation                    | rejected (decide-not-act; device/execution signs)  |

## Consequences

- **Maintenance:** each decision is a pure function, tested (budget caps, fee-token rounding, param clamping, batching — 11 tests).
- **Security:** the paymaster can't be drained (bounded, fail-to-user-pays) or shorted (round-up + margin); the wallet can't overpay (capped); non-custodial preserved. Full design: [architecture 33](../architecture/33-gas-abstraction.md).
