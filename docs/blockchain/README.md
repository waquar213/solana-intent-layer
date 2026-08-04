# docs/blockchain — Volume V — Blockchain Bible

> The on-chain machine, correct to the last base unit.
>
> Part of the **[Founder Bible](../../FOUNDER_BIBLE.md)**. Canonical root doc: [`ARCHITECTURE.md`](../../ARCHITECTURE.md).
> This volume holds the long-form depth behind the Core-Product chapters (5–8, 14–17).

## Written

- ✅ [`universal-identity-reference.md`](universal-identity-reference.md) — **The Universal Identity Reference**
  (~32k words): the buildable expansion of [Chapter 5](../bible/chapter-05-universal-identity.md) — the
  3-address architecture (exact BIP-84/44 + SLIP-0010 paths, conformance-tested) · account abstraction ·
  human-readable identity (ENS forward resolution **shipped**) · address virtualization · HD accounts ·
  recovery · device trust · multi-device sync · enterprise identity. Grounded in the real identity engine;
  shipped-vs-roadmap tagged; keys never leave the device.
- ✅ [`wallet-core-reference.md`](wallet-core-reference.md) — **The Wallet Core Reference** (~26k words): the
  deep reference for Chapter 6 (the production wallet engine) — lifecycle · key management · signing engine ·
  transaction builder · balance engine (four-state honesty) · multi-chain sync & indexing · sessions ·
  offline & error recovery · performance & production standards. Grounded in `packages/core` + `portfolio` +
  `execution`. Expands [Chapter 6](../bible/chapter-06-wallet-core-architecture.md).
- ✅ [`execution-engine-reference.md`](execution-engine-reference.md) — **The Universal Execution Engine
  Reference** (~27.5k words): the deep reference for Chapter 8 — execution graph & state machine · DEX
  routing · bridge/multi-chain orchestration · provider selection & health · retry/partial/rollback ·
  monitoring & settlement · the signing/safety boundary · analytics · reliability. Grounded in
  `packages/execution` + `router` + `providers` + `settlement`; shipped-vs-roadmap tagged; on-chain is
  irreversible (rollback = compensation). Expands [Chapter 8](../bible/chapter-08-universal-execution-engine.md).
- ✅ [`asset-intelligence-reference.md`](asset-intelligence-reference.md) — **The Universal Asset Intelligence
  Reference** (~25.9k words): the deep reference for Chapter 11 — asset discovery · token classification ·
  real-time valuation (the four-state honesty: network-fail ≠ $0) · NFT intelligence · yield/DeFi tracking ·
  cross-chain aggregation · analytics & snapshots · AI asset insights · tax categorization. Grounded in
  `packages/portfolio` + `chains` + `intelligence`. *(Chapter 11 charter pending from the founder.)*
- ✅ [`liquidity-engine-reference.md`](liquidity-engine-reference.md) — **The Universal Liquidity Engine
  Reference** (~23k words): the deep reference for Chapter 13 — the liquidity graph · DEX aggregation · bridge
  & cross-chain planning · RFQ & solver architecture · provider health & failover · order splitting &
  best-execution · MEV-aware routing · forecasting & reliability · the safety boundary. Grounded in
  `packages/router` + `providers` + `solver`; the engine finds, the gate refuses, the device signs. Expands
  [Chapter 13](../bible/chapter-13-universal-liquidity-engine.md).
- ✅ [`automation-engine-reference.md`](automation-engine-reference.md) — **The Automation Engine Reference**
  (~24k words): the deep reference for Chapter 14 — architecture & the safety gate · conditional intents ·
  scheduled & recurring · auto invest/bridge/stake/rebalance · yield optimization · AI suggestions · safety
  policies & approval rules · simulation/monitoring/transparency · the boundary. Grounded in
  `packages/automation` + `policy` + the Auto/Manual mode; **automation depth = authorization depth** — the
  AI never signs. Expands [Chapter 14](../bible/chapter-14-automation-engine.md).
- ✅ [`defi-operating-system-reference.md`](defi-operating-system-reference.md) — **The DeFi Operating System
  Reference** (~21.9k words): the deep reference for Chapter 17 — the universal DeFi dashboard & cross-protocol
  position model · lending/borrowing · staking · yield optimization · LP management · perps/derivatives · the
  AI DeFi advisor · position health & liquidation-risk alerts · one-click strategies · unified analytics · the
  safety boundary. Every DeFi action is a gated, device-signed, non-custodial **intent**; principal is always
  at risk and the wallet says so. Grounded in `packages/intelligence` + `risk` + `automation` + `portfolio`;
  protocol integrations tagged **roadmap**, the read/verify rails **shipped**. *(Chapter 17 charter forthcoming.)*

## Planned chapters

- **01.** Wallet & keys — ⬜
- **02.** Identity — ⬜
- **03.** Intent — ⬜
- **04.** Execution — ⬜
- **05.** Settlement — ⬜
- **06.** Providers & plugins — ⬜
- **07.** Enterprise — ⬜

_Nothing here yet describes a feature that does not exist. Roadmap is labelled roadmap (Doctrine §3)._
