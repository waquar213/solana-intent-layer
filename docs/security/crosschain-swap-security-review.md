# Security Review — Cross-chain swap (mainnet, real funds) execution flows

- Reviewer: Principal Security Engineer (Council)
- Date: 2026-08-05
- Scope: the on-device signing paths for the cross-chain-swap aggregator — `executeCrossChainSwapEvm`
  and `executeCrossChainSwapSolana` (`apps/web/src/broadcast.ts`), the provider quote seam (LI.FI +
  deBridge), the broadcast guard (`packages/chains/src/guard.ts`), and the `CrossChainSwapView` UI ack.
- Trigger: the standing "full Security review before real-fund GA" item from ADR-0055 / 0056 / 0057.
- Verdict: **enabled per the CEO opt-in (ADR-0055) with the guardrails below; NOT yet certified for
  unattended real-fund GA.** The GA gate is transaction **simulation** (F1/F3). Non-custodial key handling
  holds absolutely (F6).

> **Update (2026-08-05): the SIMULATION gate is now implemented** for the highest-risk paths —
> `eth_simulateV1` source-effect assertion for native EVM routes (F1/F2) and a `simulateTransaction`
> preflight for Solana routes (F3), both fail-closed. See ADR-0058. The residual narrows to the cross-chain
> **destination** delivery (off this chain) and EVM **ERC-20** source balance-delta (relies on the exact
> approval). Verified: 8 unit tests for the assessor + a live deBridge native tx (happy path accepted, a
> value×100 tamper refused).

## Method

Wearing the Principal Security Engineer hat, I ran the doctrine's *Challenge* step against the two signing
seams: how does this **leak a key**, **lose funds**, **lie to the user**, or **break on failure**? Each
finding below is a concrete failure scenario with a severity and a verdict. The guiding law: *AI proposes,
deterministic code verifies, the device signature disposes* — the question is how much the deterministic
layer can actually verify when the transaction is **built by a third-party aggregator**.

## Findings

### F1 — Opaque aggregator tx: the real recipient is not deterministically verified · **HIGH** · residual (GA gate)

The winning route's transaction is **built by the aggregator** (LI.FI / deBridge) and signed as-is. The
guard runs on `guardInput(chain, opts.to, …)` where `opts.to` is the aggregator's **router** (EVM) — and on
the wallet's **own** address for Solana — never the swap's true destination, which lives inside opaque
calldata (EVM) or a serialized message (Solana). So the guard **cannot** confirm the funds actually land at
the user's own destination address.

- **Failure scenario:** a malicious or compromised aggregator response (or a broken TLS assumption) returns
  a tx that pays an attacker. The user reviews an honest-looking quote, acks, and signs a tx that does
  something else. The key is never exposed (non-custodial holds), but the funds move to the attacker.
- **Current mitigations:** HTTPS/TLS to reputable endpoints (`li.quest`, `dln.debridge.finance`); the
  `toAddress` we send in the quote request is the user's own dest address; the user sees the quote (output,
  provider, route, fees) and gives an explicit real-funds ack; the $1,000 spend cap bounds a single move.
- **Residual:** trust still rests on the aggregator being honest and uncompromised — the deterministic layer
  does not verify the tx's net effect.
- **Verdict / status:** **source-side simulation LANDED** (ADR-0058). `executeCrossChainSwapEvm` now runs
  `eth_simulateV1` (traceTransfers) on a native-source route before signing, and `assessSimulatedSourceOutflow`
  refuses a revert, an unexpected other-asset outflow, or an over-bound source spend — closing the
  source-side of F1. **Residual:** the cross-chain **destination** delivery is off this chain, so source
  simulation can't prove the dest receives; **per-provider recipient decoding** (deBridge `createOrder`)
  and/or dest-chain monitoring remain the follow-up before unattended GA.

### F2 — Native EVM `value` was unbounded → **FIXED (defense-in-depth)** · was HIGH

For a **native** EVM source the signed `tx.value` is the funds spent, and it previously came straight from
the aggregator with no bound.

- **Failure scenario (pre-fix):** a response sets `value` to 10× (or the wallet's whole balance) while
  reporting a small quoted amount; the user signs a far larger native spend than reviewed.
- **Fix:** `executeCrossChainSwapEvm` now **refuses** `value > 4 × the reviewed input` for native sources
  (deterministic, fail-closed; generous enough to never block real fee/opex ratios). ERC-20 sources move
  funds via the exact approval (F4), not `tx.value`.
- **Verdict:** fixed as defense-in-depth; simulation (F1) is still the fuller control.

### F3 — Solana tx fully opaque; no cheap amount bound · **MEDIUM** · residual (GA gate)

The Solana route is signed as-is (`extractSolSignableMessage` → sign → broadcast). Unlike EVM native, there
is no cheap value bound — the message can carry arbitrary instructions — and the spend cap uses the
aggregator-reported `amountUsd`.

- **Failure scenario:** a malicious Solana message drains more SOL/SPL than quoted; nothing deterministic
  bounds the amount.
- **Current mitigations:** **fail-closed multi-signer refusal** (we sign only as the sole fee payer, so a
  multi-signer construction is rejected outright); mainnet-ack + spend cap; the user's quote-review ack.
- **Verdict / status:** **preflight LANDED** (ADR-0058). `executeCrossChainSwapSolana` now runs
  `simulateTransaction` (replaceRecentBlockhash, sigVerify:false) before broadcast and **refuses** a route
  that errors on-chain — fail-closed. **Residual:** a balance-DELTA bound (fee-payer lamport/SPL deltas vs
  the quote) needs a funded-account simulation + ATA parsing; it's the follow-up. Multi-signer refusal +
  mainnet-ack + cap remain in force.

### F4 — ERC-20 approval is EXACT and consumed · **INFO / OK**

An ERC-20 source approves **exactly** the input amount to the aggregator-named spender (never unlimited).
Worst case a malicious spender pulls only the exact amount already being spent; no lingering allowance.
**OK.**

### F5 — Guard recipient/poisoning + EIP-55 checks are inert for swaps · **INFO**

Because the guard sees the router / the wallet's own address, its EIP-55 and address-poisoning layers add no
protection to the swap's real recipient. This is expected (the recipient is opaque), but it means F1/F2/F3
are the *only* controls on where swap funds go — worth stating plainly so the poisoning defense isn't
assumed to cover this surface. **Documented.**

### F6 — Non-custodial property holds absolutely · **INFO / OK (core doctrine)**

Keys are generated and used only in the browser; signing (`signEvmTransaction`, `signSolanaMessage`) is
in-memory; **nothing secret leaves the device**. Aggregators receive only public addresses + amounts. The
first doctrine law is intact. **OK.**

### F7 — chainId is aggregator-supplied · **LOW**

`executeCrossChainSwapEvm` signs for `raw.chainId`. EIP-155 binds the signature to that chain, so a wrong
value yields a tx invalid elsewhere (no cross-chain replay); worst case the tx simply fails. **Acceptable.**

### F8 — Solana blockhash staleness · **LOW**

The signed message carries the aggregator's recent blockhash; if stale, the broadcast **fails** and funds
never move (prompting a re-quote). **Acceptable, fail-safe.**

## What holds (positives)

- Non-custodial keys (F6); mainnet-ack gate + **$1,000 spend cap** that fails **closed** on an unpriced /
  NaN / negative value (`guard.ts`); same-realism guard for bridges; **fail-closed provider** model (a throw
  = no quote, so a broken/hostile provider can't win); exact ERC-20 approval (F4); fail-closed multi-signer
  refusal (Solana); the new native-value bound (F2); the deterministic best-quote core is pure + tested.

## Required before real-fund GA (the gate)

1. ~~**Transaction simulation, both ecosystems** (F1, F3)~~ — **DONE** (ADR-0058): native-EVM source-effect
   assertion (`eth_simulateV1`) + Solana preflight (`simulateTransaction`), both fail-closed.
2. **Destination-side verification** (remaining F1 residual): the cross-chain dest delivery is off the source
   chain, so add **per-provider recipient decoding** where decodable (deBridge `createOrder`) and/or a
   dest-chain receipt check; add an **EVM ERC-20 source** balance-delta sim (token-storage override) and a
   **Solana balance-delta** bound (funded-account sim + ATA deltas).
3. Keep the **$1,000 cap** conservative and surface the **aggregator-trust** note in the UI so consent is
   informed (done alongside this review).
4. Independent third-party audit of the end-to-end mainnet flow (per CLAUDE.md §5) before GA.

## Conclusion

The cross-chain-swap flows are **safe against key compromise** (F6) and, with the simulation gate now landed
(ADR-0058), the deterministic layer **verifies the source-side effect** before signing — no revert, only the
intended asset leaves, within bound (EVM native), and no on-chain failure (Solana preflight) — on top of the
native-value bound and exact approval. The **remaining open risk is the cross-chain DESTINATION delivery**,
which happens off the source chain and is not yet verified (dest-recipient decoding / monitoring is the
follow-up). The mode remains enabled under the explicit CEO opt-in (ADR-0055) with these guardrails; this
review **does not** certify fully-unattended real-fund GA until the destination check + third-party audit land.
