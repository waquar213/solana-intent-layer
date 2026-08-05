# ADR-0055 — Enable mainnet (real funds): user opt-in, the per-broadcast guard is the safety layer

- Status: Accepted
- Date: 2026-08-05
- Deciders: Founder & CEO (explicit opt-in — the written override), Principal Security Engineer (guardrails retained), Principal Frontend Engineer

## Context

The build shipped **testnet-only** with three deliberate, layered guards so a real-funds transaction
could never be routed by accident:

1. `settings.ts` `getNetworkMode()` clamped its return to `'testnet'` regardless of the stored value.
2. `App.tsx` reset any persisted `'mainnet'` back to `'testnet'` on load.
3. The Settings Network toggle rendered the **Mainnet** button `disabled` ("🔴 Mainnet · soon").

The Founder/CEO explicitly opted in to **full mainnet (real funds)** after being shown, in writing, that
enabling it removes these three guards and makes real mainnet value spendable. Per the Doctrine, a change
the Principal Security Engineer would veto (moving real funds) proceeds only on the CEO's written override —
this ADR is that record.

## Decision

- **Remove the three anti-mainnet guards.** `getNetworkMode()` now reads the stored mode; the reset-on-load
  is gone; the Mainnet toggle is enabled and persists `networkMode`.
- **RETAIN the per-broadcast guard, untouched.** `guardBroadcast` (`packages/chains/src/guard.ts`) — the
  mainnet **acknowledgment** gate, the **$1,000 spend cap** (+ high-value confirmation above it), and the
  EIP-55 recipient / address-poisoning checks — runs before **every** signature, in every mode. Enabling
  mainnet mode does **not** weaken the gate that sits between a signed tx and the wire. This is the real
  safety layer; the network-mode lock never was.
- **Bridge + Swap clear their route/quote on a network toggle.** A testnet↔mainnet switch resets the
  fetched route, quote, and any "real funds" acknowledgment in both `BridgeView` and `CrossChainSwapView`,
  so a stale cross-network route can never linger on screen.
- **Honest copy.** The Settings sub-text now reads "Mainnet moves REAL funds — every send is guard-confirmed
  (mainnet acknowledgment + $1,000 spend cap)". Testnet remains the DEFAULT for a fresh wallet.

## Alternatives considered

| Option | Verdict |
| --- | --- |
| **Enable mainnet + retain the per-broadcast guard + route-clear** | **chosen** (CEO opt-in) |
| Toggle UI only, keep real-fund broadcast blocked | rejected — the user wanted full enablement |
| Stay testnet-only | rejected — superseded by the opt-in |
| Also remove/relax the per-tx guard | rejected — the guard is the safety layer and is non-negotiable |

## Consequences

- Real mainnet balances, sends, and the cross-chain-swap aggregator become live; every broadcast is still
  gated by the mainnet-ack + spend-cap guard, and swaps additionally require the explicit real-funds
  acknowledgment in the UI.
- **A full Principal Security Engineer review of the end-to-end mainnet flows is still recommended before
  real-fund GA** — specifically: the mainnet balance/price sources + RPC endpoints, the aggregator
  execution seam (`executeCrossChainSwapEvm`), approval exactness, and the aggregator's opaque
  destination-recipient trust assumption. This ADR enables the mode; it does not certify every flow.
- The $1,000 default cap will block larger transfers until the user acknowledges high value — see the
  cross-chain UI's single-ack collapse noted for that review.
