# ADR-0054 — Honest cross-chain bridge enablement + same-realism guard; Solana as the home chain

- Status: Accepted
- Date: 2026-08-04
- Deciders: Founder & CEO, Principal Blockchain Engineer, Principal Security Engineer

## Context

The operator/relayer liquidity bridge already existed end-to-end — in-browser deposit builders
(`packages/chains/src/solana/bridge.ts` + the EVM/BTC deposit paths) tagging `BRDG:<dest>:<recipient>`,
and a safety-hardened relayer (`services/relayer`: idempotent O_EXCL ledger, finality gates, dry-run
default, refund path). But `bridgeRouteDeliverable` **hard-refused every route except the canonical
Ethereum Sepolia → GIWA** (OP-Stack L1StandardBridge). The reason was doctrinal, not incidental:
shipping a route whose relayer isn't running strands the deposit, and that had already lost real funds
(0.05 SOL, 0.031 ETH to operator addresses no key held). The gate therefore refused rather than warned.

The user — who is the bridge operator (their own funded address, keys in hand) — asked to (a) turn on
all bridges and (b) make Solana the wallet's home chain. Two hazards had to be closed first:

1. A naive flag-flip would make the UI claim deliverability for routes that can't deliver → a
   no-fake-data (#3) / fail-closed (#5) violation, and a repeat of the stranded-deposit history.
2. "devnet to mainnet" as a literal value peg is forbidden: a testnet leg (free faucet value) against a
   mainnet leg (real value) mints real value from nothing (or strands it).

## Decision

1. **Same-realism guard** — `checkSameRealism(from, to)` / `assertSameRealism` in
   `packages/chains/src/guard.ts`, pure and keyed on the registry `testnet` flag. Any devnet↔mainnet
   route is refused fail-closed (unknown chains throw → caught as blocked). Wired into
   `bridgeRouteDeliverable` and re-checked as defense-in-depth inside `bridgeDeposit`, so a mixed-realism
   route can never be signed even by a direct caller. 9 unit tests.

2. **Honest operator-bridge enablement** — `bridgeRouteDeliverable` rewritten:
   - Canonical Sepolia → GIWA (to your own address): always on, non-custodial.
   - Every other **same-realism** route (incl. Solana ⇄ EVM): enabled **only** when the operator opts
     in via `VITE_BRIDGE_OPERATOR_ENABLED`, with an explicit *operator-assisted, deposit-is-real,
     refundable-if-undelivered, delivery-needs-the-relayer-running* disclosure rendered before signing.
   - **Committed default is OFF (fail-closed)** — a shared/prod build never invites a strand. The
     operator flips the flag on in gitignored `.env.local` while running `services/relayer` with funded
     liquidity. The Bridge nav item is resurfaced now that routes are honestly deliverable.

3. **Solana as the home chain** — `ID_CHAINS` home row is Solana (badge/hero/first), GIWA folds the
   shared EVM/L1 address as a secondary row; default send chain is `solana-devnet` (EVM-only imports
   still open on GIWA, which they alone can sign); example intents lead with SOL.

4. **Mainnet real-value bridging is deferred to Phase 2** — it needs the user's explicit real-funds
   go-ahead and a Principal Security Engineer review (a trust-based operator holding real funds).

## Alternatives considered

| Option | Verdict |
| --- | --- |
| **Flag-gated honest enablement + same-realism guard (committed default OFF)** | **chosen** |
| Flip `bridgeRouteDeliverable` to allow-all | rejected (strands deposits when the relayer is down — fake deliverability, repeats the loss) |
| Keep only the canonical route | rejected (does not satisfy "turn on all bridges"; operator bridge already exists) |
| A literal devnet→mainnet value bridge | rejected (mints real value from free test funds — breaks #3/#5; the guard makes it structurally impossible) |
| Verify operator liquidity async in the gate | deferred (keeps `bridgeRouteDeliverable` pure/sync; the disclosure + refund path carry the honesty for now) |

## Consequences

- For the operator (flag on + relayer running), Solana ⇄ EVM and other same-realism testnet routes are
  live; deposits are real on-chain and are delivered — or refunded — by `services/relayer`. A dry-run
  `pending` scan confirmed the pipeline end-to-end (found a real payable 0.01 SOL → GIWA deposit).
- The same-realism guard makes a testnet↔mainnet bridge structurally impossible regardless of the flag,
  so introducing mainnet bridge chains in Phase 2 cannot accidentally create a cross-realism peg.
- Shared/prod builds are unchanged (flag off → only the canonical route), so no strand risk ships.
- Tests: +9 cross-realism guard, +10 byte-level Solana bridge-deposit (`solana/bridge.ts` was a
  previously untested money path). `packages/chains` 161 green; web typecheck clean.
- Follow-ups: surface operator destination-liquidity in the gate; land a confirmed devnet SPL/bridge tx;
  Phase 2 mainnet realism behind an explicit go + security review.
