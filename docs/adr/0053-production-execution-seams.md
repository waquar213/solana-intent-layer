# ADR-0053 — Production execution seams: real EVM signer + injected device/RPC

- Status: Accepted
- Date: 2026-07-06
- Deciders: CTO, Principal Blockchain Engineer, Principal Security Engineer

## Context

The runtime executes plans through a demo executor (fake signer + fake gateway) so the whole loop runs offline. To go live we must actually sign and broadcast — without breaking the non-custodial invariant (keys never leave the device) and without rewriting the execution pipeline for each wallet integration (WalletConnect, hardware, embedded keyring).

## Decision

Add `packages/runtime/src/live.ts` with three composable, injectable seams:

- **`EvmDevice`** — the key-holding boundary. It receives a fully-formed `Eip1559Transaction` and returns signed bytes; the key never crosses the seam. `createLocalEvmDevice(privateKey)` implements it for the on-device keyring/tests; a WalletConnect or hardware provider implements the same interface in production.
- **`createEvmStepSigner`** — builds a REAL EIP-1559 transaction from a plan step (recipient/value/calldata from `step.params`, bounded fees from the gas plan, nonce from an injected source) and hands it to the device. Returns a broadcastable `rawTx`. EVM-only; composed per-ecosystem.
- **`createLiveExecutor`** — composes the real signer with the existing `AdapterChainGateway` (broadcast/status over an RPC-backed adapter) + optional gas planner, producing the `{ signer, gateway, gasPlanner? }` `WalletRuntime.execute` already accepts.

Plus `discoverHoldings` for multi-chain balance discovery over the same adapter interface. All of it is offline-testable against fakes; a deployment supplies exactly three things: the device (①), an RPC-backed adapter (②), and a nonce source (③).

## Alternatives considered

| Option | Verdict |
| --- | --- |
| **Injected `EvmDevice` + `createEvmStepSigner` + `createLiveExecutor`** | **chosen** |
| Sign inside the runtime with a raw private key | rejected (key would cross the runtime boundary — breaks non-custodial) |
| A bespoke integration per wallet (MetaMask, Ledger, WalletConnect) | rejected (one `EvmDevice` seam; each wallet implements it) |
| Only broadcast, keep the fake signer | rejected (never produces a real transaction) |

## Consequences

- **Maintenance:** the execution pipeline is unchanged; a new wallet is a new `EvmDevice`, a new chain is a new RPC adapter. 5 tests prove the signer is byte-identical to a direct core sign, refuses non-EVM chains, and drives a plan to completion through the gateway.
- **Security:** non-custodial preserved — the key stays inside the device implementation and is only ever handed a fully-formed tx. Fees are the gas engine's bounded values; the signer never invents them.
- **Going live:** needs a real RPC URL (②/③) and a real device (①). The demo `createLocalEvmDevice` + fake adapter are the offline counterparts. Full design: [architecture 36](../architecture/36-production-execution-seams.md).
