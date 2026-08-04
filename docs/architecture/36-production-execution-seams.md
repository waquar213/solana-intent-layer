# 36 — Production Execution Seams

## Why this exists

The whole loop runs today on a **demo executor** — a fake signer + fake gateway + a real gas planner — so `plan → authorize → execute` works offline with no key, no node, no funds at risk. This doc is the map from that demo to a **real** deployment: the exact seams a production wallet fills to actually sign and broadcast on chain. Everything on the runtime side is already built and tested; going live is a matter of injecting three things, not rewriting the pipeline.

`packages/runtime/src/live.ts` provides the production-side building blocks, all offline-testable against fakes.

## The three plug-in points

A production executor is `createLiveExecutor(deps)`. It composes a **real EVM step signer** with the adapter-backed `AdapterChainGateway` and an optional gas planner. The only things a deployment supplies:

| # | Seam | What it is | What it needs to go live |
| --- | --- | --- | --- |
| ① | **`EvmDevice`** | The wallet that holds the key. Receives a fully-formed EIP-1559 tx, returns the signed bytes — **the key never crosses this seam**. | A WalletConnect provider, a hardware wallet, or the on-device core keyring. `createLocalEvmDevice(privateKey)` is the keyring/test implementation. |
| ② | **`adapterFor(chainId)`** | An RPC-backed `BlockchainAdapter` (broadcast + status over a real node). | A real **RPC URL** per chain (Alchemy/Infura/self-hosted). The `@intent-wallet/chains` adapters already speak the protocol; wire them to a live HTTP transport. |
| ③ | **`nonceFor(chainId, from)`** | The account nonce. | `eth_getTransactionCount` over that RPC. |

## The real signer

`createEvmStepSigner` is the piece that flips "fake signature" into a genuine transaction. Given a plan step it:

1. parses the recipient / value / calldata from `step.params` and the chain id from the CAIP-2 `eip155:N`;
2. takes the **bounded EIP-1559 fees from the gas plan** (the same `StepGasPlan` the gas engine produced) and the **live nonce** from ③;
3. builds a real `Eip1559Transaction` and hands it to the ① device to sign;
4. returns a broadcastable `rawTx` (a `0x02…` typed envelope).

It is EVM-only by design — a multi-ecosystem deployment composes it with BTC/SOL signers by chain. The test proves it: the signer produces **byte-for-byte the same signed transaction** `@intent-wallet/core` would sign directly, so the signature is real and recoverable; a different nonce yields a different signature; a non-EVM chain is refused.

## Non-custodial invariant

The private key lives inside the `EvmDevice` implementation and is handed a fully-formed transaction to sign — it is never passed to the runtime, the gateway, or the server. This is the doctrine end to end: **AI proposes, deterministic code verifies, the device signature disposes.** The demo's `createLocalEvmDevice` holds the key in a closure for offline runs/tests; production swaps in a device that holds it in secure hardware.

## Balance discovery

`discoverHoldings(accounts)` reads each configured chain's native + token balances for its address (in parallel, over the same `BlockchainAdapter` interface) and merges them by symbol into the planner's `Holding[]` — so the wallet plans against **real, discovered balances** instead of a seeded map. Fake adapters in tests; live RPC adapters in production, unchanged.

See [ADR-0053](../adr/0053-production-execution-seams.md).
