# ADR-0058 — Cross-chain swap: a pre-broadcast SIMULATION gate (the security-review GA gate)

- Status: Accepted
- Date: 2026-08-05
- Deciders: Principal Security Engineer (owns the gate), Principal Blockchain Architect, Principal Frontend Engineer

## Context

The security review (`docs/security/crosschain-swap-security-review.md`) named **transaction simulation** as
the gate before real-fund GA (findings F1/F3): the route transaction is **built by the aggregator** and
signed as-is, so the guard — which sees only the router address (EVM) or the wallet's own address (Solana) —
cannot verify the tx's actual on-chain effect. The native-value bound (F2) and exact ERC-20 approval (F4)
bound the source spend heuristically, but nothing yet **executed the tx against real state** to see what it
truly does before the user signs.

## Decision

Add a deterministic, **fail-closed** pre-broadcast simulation step to both executors.

- **EVM (native source):** `executeCrossChainSwapEvm` calls **`eth_simulateV1`** (with the user's native
  balance overridden so it works before funding, and `traceTransfers: true`) on the exact route tx, then a
  new **pure, tested** core — `assessSimulatedSourceOutflow` (`packages/chains/src/evm/simulate.ts`) — parses
  the synthetic `Transfer` logs and **refuses** if: any call reverts, the user's wallet sends **any asset
  other than the intended source token** (an approval-drain shape the opaque calldata would hide), or it
  sends **more of the source asset than authorized**. Native sources only (a balance override suffices);
  ERC-20 sources stay bound by the exact approval until a token-storage-override sim lands.
- **Solana:** `executeCrossChainSwapSolana` runs **`simulateTransaction`** (`replaceRecentBlockhash`,
  `sigVerify:false`) on the signed tx before broadcast and **refuses** a route that errors on-chain.
- **Fail-closed vs fail-soft:** a definitive bad verdict (revert / other-asset / over-bound / on-chain error)
  **blocks**. Only a node that *cannot simulate at all* (method unsupported / transient) degrades to the
  other guards (mainnet-ack + spend cap + native-value bound + exact approval + multi-signer refusal), which
  all still bind — the simulation is defense-in-depth, not the sole control. All the mainnet RPCs in the
  registry (publicnode / arbitrum / base / optimism) support `eth_simulateV1`.

## Alternatives considered

| Option | Verdict |
| --- | --- |
| **eth_simulateV1 source-effect assertion (native) + Solana preflight, fail-closed** | **chosen** |
| Trust the aggregator + rely only on the value bound / approval | rejected — the review requires simulating the real effect |
| Hard-fail when a node can't simulate | rejected — would break swaps on RPCs lacking the method; the other guards still bind |
| ERC-20 source sim via per-token balance-slot overrides | deferred — fragile slot map; exact approval covers it for now |

## Consequences

- The deterministic layer now **verifies the source-side effect** before signing, closing the source half of
  F1 and hardening F2/F3. Verified: 8 unit tests for `assessSimulatedSourceOutflow` (accept native/ERC-20
  within bound; refuse revert, other-asset drain, over-bound, cross-call aggregation; ignore non-user
  transfers) + a **live** deBridge native-ETH route on Arbitrum — happy path accepted (0.01112 ETH out, only
  native), a `value×100` tamper **refused** (the router reverts, the sim surfaces it).
- **Residual (documented, next):** the cross-chain **destination** delivery is off the source chain, so
  source simulation can't prove the dest receives — per-provider recipient decoding (deBridge `createOrder`)
  and/or dest monitoring is the follow-up; plus an EVM ERC-20 balance-delta sim and a Solana lamport/SPL
  delta bound. This ADR does not by itself certify fully-unattended real-fund GA (audit still required).
- Tests: `packages/chains` 176 pass (+8); web + chains typecheck clean.
