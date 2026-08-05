# ADR-0057 — deBridge (DLN) as the second cross-chain-swap aggregator: the meta-aggregator becomes real

- Status: Accepted
- Date: 2026-08-05
- Deciders: Founder & CEO, Principal Blockchain Architect, Principal Security Engineer (fail-closed + exact approval), Principal Frontend Engineer

## Context

The cross-chain-swap surface (ADR-0053/0055/0056) shipped with a single top-level provider (LI.FI). LI.FI
is itself a meta-aggregator, but the product promise was to compare *independent* top-level aggregators and
pick the best net deal. With one provider, `bestCrossChainQuote([q])` ranked a field of one — the "best
route across aggregators" copy wasn't yet true.

deBridge's DLN is a natural second: a 0-TVL intent/solver network with a simple REST API
(`dln.debridge.finance/v1.0/dln/order/create-tx`) that, like LI.FI, returns BOTH a quote estimation and an
unsigned transaction for on-device signing, and supports the same chains we do including Solana (its
internal chain id `7565164`).

## Decision

- **Add `makeDebridgeProvider` behind the existing `CrossChainSwapProvider` seam.** It calls `create-tx`
  (estimation + executable tx together), normalizes to `CrossChainSwapQuote`, and attaches the unsigned tx
  — EVM routes flow through `executeCrossChainSwapEvm`, Solana routes through `executeCrossChainSwapSolana`.
  Adding a provider is adding one plugin + one line to the UI's provider list; nothing else changes.
- **The UI fans out to ALL providers and ranks the survivors.** `CrossChainSwapView` now
  `Promise.allSettled`s every provider, drops the ones that throw (fail-closed per provider), and feeds the
  rest to `bestCrossChainQuote`. The winner is shown prominently AND a `compared N aggregators:` line lists
  every provider's output, so the pick is transparent, never a hidden decision.
- **deBridge needs token ADDRESSES (LI.FI took symbols), so we map ONLY verified canonical mainnet
  addresses** for the tokens the wallet offers, keyed `[deBridgeChainId][SYMBOL]`. Native is mapped only
  where the UI's symbol truly is the chain's native asset (so "ETH" on BNB/Polygon, DAI, WBTC return
  `NO_ROUTE` here and are left to LI.FI — never guessed). An unknown chain/token, an in-band `errorId`, or a
  malformed body all throw.
- **ERC-20 source → EXACT approval to the DLN router.** deBridge's `tx.to` is the DlnSource contract that
  pulls the input token via `transferFrom`; for an ERC-20 source we set `approvalSpender = tx.to` and
  `fromTokenAddress = srcToken`, and `executeCrossChainSwapEvm` approves EXACTLY the input amount (never
  unlimited). Native sources need no approval.

## Fee accounting (fair ranking) — now priced EXACTLY

`bestCrossChainQuote` ranks by NET value = `toValueMicros − gasMicros − feeMicros`. deBridge's quoted
OUTPUT already has the protocol/taker/operating-expense/slippage fees deducted, so those are captured in
`toValueMicros` and must NOT be subtracted again (an earlier revision double-counted the protocol fee —
fixed). The ONE cost not reflected in the output is the flat native `fixFee`, paid separately in `tx.value`.
We price it into micro-USD **exactly**:

1. **Native source** (the common case — SOL, ETH): the fixFee and the input are the SAME native token, so
   `fixFee × srcChainTokenIn.approximateUsdValue ÷ srcChainTokenIn.amount` is exact and decimals-agnostic —
   derived from deBridge's own response, no external feed.
2. **ERC-20 source**: the web app injects the source chain's native USD spot (`spotUsd`, cached 60s — ETH
   covers our ETH-native chains, SOL the home chain); `fixFee × nativeUsdMicros ÷ nativeWholeUnit`.
3. **Neither available** (BNB/Polygon native isn't in the ETH/SOL feed, or the feed is down): a
   **conservative per-ecosystem floor** ($2.00 EVM / $0.05 Solana) — never understates the cost.

`gasMicros = 0`: deBridge doesn't separately report the source-submission gas (small on L2/Solana; the
real value is estimated on-device at signing regardless). Both providers' outputs are shown to the user, so
the pick is transparent. Verified live: 2 SOL → lifi 0.078810 ETH vs debridge 0.078514 ETH, fixFee priced
exactly from the response.

## Consequences

- The meta-aggregator is real: verified live, 1 SOL → ETH (Arbitrum) returned **lifi 0.039435 ETH ($73.84)
  vs debridge 0.039264 ETH**, LI.FI won on net value and the UI showed both. deBridge also quotes
  Solana-source routes, so the home chain benefits from the competition too.
- Fail-closed everywhere: a provider that can't serve a route simply doesn't compete; LI.FI still can.
- Tests: `packages/providers` +8 deBridge cases (native/ERC-20/Solana normalization, exact-approval target,
  and the four refusals — unknown chain, unmapped token, in-band errorId, malformed) → 39 pass. Web + providers
  typecheck clean. Same open Security-review items as ADR-0055/0056 apply to deBridge's execution paths.
