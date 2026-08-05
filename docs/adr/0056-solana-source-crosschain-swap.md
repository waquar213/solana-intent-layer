# ADR-0056 — Cross-chain swap: Solana as a first-class source AND destination (home-chain-centered)

- Status: Accepted
- Date: 2026-08-05
- Deciders: Founder & CEO (home chain = Solana), Principal Blockchain Architect, Principal Security Engineer (guardrails + fail-closed), Principal Frontend Engineer

## Context

Solana is the wallet's **home chain**, but the cross-chain-swap aggregator (ADR-0053/0055, `CrossChainSwapView`
+ `executeCrossChainSwapEvm`) was **EVM-execution-only**: it could quote and sign a swap whose *source* was an
EVM chain, but not one whose source was Solana. So the home chain could not actually drive a cross-chain swap —
the highest-stakes surface silently excluded it.

LI.FI already routes Solana ⇄ EVM (via Mayan / near / relaydepository etc.). The gap was purely on our side:
(1) the UI offered only EVM source/destination chains, and (2) there was no on-device **Solana** signer for an
aggregator-built route. A Solana route's `transactionRequest` is not an EVM `{to,data,value}` — it is a single
`data` field carrying a **base64-serialized, unsigned Solana transaction** whose fee payer is the wallet.

## Decision

- **Sign the aggregator's Solana transaction on-device, non-custodially.** New pure, byte-exact helpers in the
  tested `chains` core — `decodeShortVec` (inverse of `encodeShortVec`) and `extractSolSignableMessage` — parse
  the unsigned wire tx `[shortvec(numSignatures)][sig slots][message]` and return the signable **message**.
  `executeCrossChainSwapSolana` (web `broadcast.ts`) extracts that message, signs it with the wallet's ed25519
  key in the browser, reassembles via the existing `assembleSolTransaction`, and broadcasts to a Solana mainnet
  RPC. The aggregator **proposes**, deterministic code **verifies**, the device **signature disposes** — the
  Doctrine, applied to Solana.
- **Fail-closed on multi-signer routes.** The wallet holds only the fee payer's key (Solana's sole/first
  required signer). `extractSolSignableMessage` **refuses** any route needing more than one signature rather
  than producing a tx it cannot complete. The message is treated as opaque bytes, so legacy and v0 versioned
  messages both sign correctly.
- **Same guard, every mode.** Execution runs behind `assertBroadcastAllowed(guardInput('solana', …))` — the
  mainnet acknowledgment + `$1,000` spend cap (keyed on the route's USD value) + recipient checks, identical to
  the EVM path. `'solana'` is a `testnet: false` registry chain, so the mainnet-ack binds. The UI's real-funds
  checkbox is that acknowledgment; nothing signs without it.
- **UI: Solana is a first-class source AND destination, listed first.** `CrossChainSwapView` now carries a
  chain list tagged by ecosystem (`evm | solana`); token menus switch per ecosystem (SOL native only on Solana;
  ETH/WBTC/DAI only on EVM; USDC/USDT either way) and coerce an invalid selection on chain change. The wallet's
  address is chosen per ecosystem for BOTH legs, and the destination address is now passed explicitly so a
  SOL→EVM route pays out to the EVM address and an EVM→SOL route pays out to the base58 Solana address (never
  the wrong-ecosystem default). Execution dispatches to the Solana or EVM executor by the winning quote's
  `ecosystem`.

## Alternatives considered

| Option | Verdict |
| --- | --- |
| **On-device Solana signer + Solana as source/dest, guarded, fail-closed** | **chosen** |
| Rebuild the swap message ourselves instead of signing the aggregator's tx | rejected — we'd have to re-implement Mayan/near routing; the whole point is to sign what the aggregator built |
| Put the wire-parsing in the app (`broadcast.ts`) | rejected — funds-critical byte manipulation belongs in the tested `chains` core (`decodeShortVec`/`extractSolSignableMessage`, unit-tested round-trip + multi-sig refusal) |
| Sign multi-signer routes with a placeholder for the extra signer | rejected — we don't hold that key; fail closed |

## Consequences

- The home chain can now originate a real cross-chain swap. Verified live (read-only quotes): **1 SOL → 0.039437
  ETH ($73.83)** on Arbitrum (via near) and **0.05 ETH → 1.259816 SOL ($93.30)** on Solana (via relaydepository).
- Execution was **not** run against real funds here (doctrine: the user's device signs; Claude never executes a
  trade). The seam is wired and guarded; a funded end-to-end signature is the user's to perform.
- **Security review still pending per ADR-0055**, now extended to the Solana execution seam specifically:
  the mainnet RPC endpoint (`VITE_SOLANA_MAINNET_RPC` — the public node often blocks browser `sendTransaction`),
  the aggregator's opaque-tx **destination-recipient trust** assumption (we sign a tx we did not build — the
  guard cannot inspect the embedded recipient the way it does an EVM `to`), and blockhash-staleness UX (a stale
  route fails the broadcast and must be re-quoted; funds never move on failure).
- Tests: `packages/chains` 168 pass (incl. 12 for the new wire helpers — round-trip, offset decode, over-long
  refusal, single-signer extract, multi-signer refusal, truncation); `packages/providers` 31 pass. Web + chains
  typecheck clean.
