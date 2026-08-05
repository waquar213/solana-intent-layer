# ADR-0059 — In-chat MAINNET swap: route SOL⇄USDC to the aggregator (not the devnet solAMM)

- Status: Accepted
- Date: 2026-08-05
- Deciders: Founder & CEO, Principal Frontend Engineer, Principal Security Engineer (reuses the audited seam)

## Context

ADR (the mainnet swap-gate fix) made the AI-chat *fail closed* on mainnet — a SOL⇄USDC chat swap showed a
disabled "Use the Swap tab" button instead of silently signing a **devnet** solAMM tx. Honest, but the
flagship "talk to your money" surface still couldn't actually swap on mainnet; the user had to leave chat.

The cross-chain aggregator already does the real thing: LI.FI serves a **same-chain Solana** SOL⇄USDC swap
on mainnet (via Jupiter/etc.), returning a base64 Solana tx that the **audited** `executeCrossChainSwapSolana`
signs (mainnet-ack + $1,000 cap + pre-broadcast simulation gate, ADR-0055/0058). So the mainnet path exists;
it just wasn't wired into chat.

## Decision

- **New `MainnetChatSwap` component** (self-contained, isolated from the fragile testnet `PlanFlow`). For a
  `onMainnet && solanaSwap` intent, `PlanFlow` early-returns `MainnetChatSwap` instead of the devnet plan.
  It quotes with `makeLifiProvider` (same-chain `solana:mainnet`), ranks via `bestCrossChainQuote`, shows the
  real quote (real **USDC**, provider, fee), an explicit real-funds ack, and executes via the audited
  `executeCrossChainSwapSolana`. Non-custodial — the device signs; the aggregator only proposes.
- **Scope: SOL⇄USDC only** (the home chain, unambiguous chain). EVM in-chat swaps (GIWA AMM) and
  convert-and-send have no unambiguous mainnet chain from a bare "swap ETH for USDC", so they still redirect
  to the Swap tab (fail-closed) until a chain is specified.
- **Isolation for safety:** the new flow is a separate component reached by an early return AFTER all
  `PlanFlow` hooks — it cannot alter or break the testnet plan path, and testnet mode is byte-for-byte
  unchanged.

## Alternatives considered

| Option | Verdict |
| --- | --- |
| **Inline `MainnetChatSwap` via the aggregator (SOL⇄USDC), reuse the audited Solana executor** | **chosen** |
| Keep the "Use the Swap tab" redirect | rejected — the user wanted it to work IN chat |
| Re-plumb the whole testnet PlanFlow to be network-mode-aware | rejected — huge, fragile, unnecessary; isolation is safer |
| Route EVM chat swaps too, defaulting to a chain (Ethereum) | rejected — guessing the chain risks the wrong-chain swap; require the Swap tab where the user picks it |

## Consequences

- "Swap 2 SOL for USDC" in chat, on mainnet, now returns a **real** quote — verified live: **2 SOL →
  147.087447 USDC ($147.38)** via lifi/fly, real USDC, honest ack, disabled-until-acknowledged execute
  button; no console errors. Execution was **not** run against real funds (doctrine: the user's device
  signs). The same residual as ADR-0058 applies (the cross-chain/opaque-tx destination trust — here it's a
  same-chain swap, so the source simulation + guard cover the spend; the aggregator still builds the tx).
- Web typecheck clean. The change is confined to `apps/web/src/App.tsx` (a new component + an early return +
  the mode flag); no core/provider changes.
