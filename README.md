# Universal Intent Wallet (INTENT LAYER)

The world's first AI-Native Universal Intent Wallet. Users describe what they want
("Convert my BTC to ETH", "Send $100 USDT to Rahul") — the wallet plans and executes
the complete cross-chain workflow. Chains become invisible; users think in assets.

- **What we're building:** [requirements.md](requirements.md) (PRD, phase plan)
- **How it's architected:** [docs/architecture/](docs/architecture/README.md) (system design for the 100M-user target)
- **How it looks & feels:** [docs/design/](docs/design/README.md) ("Calm Money" design system, every screen)
- **How we build:** [docs/handbook/](docs/handbook/README.md) (engineering standards, quality gates, milestones, team)
- **Why we chose each tool:** [docs/adr/](docs/adr/README.md) (53 Architecture Decision Records — the locked stack)
- **Where we are:** [memory.md](memory.md) (progress, decisions, next action)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

## Repo layout

```
packages/core       Keys, vault, signing, universal identity (device-only, zero network I/O)
packages/chains     Chain registry, RPC pooling, balances, fees            (Phase 2)
packages/portfolio  Aggregation, price engine, unified portfolio           (Phase 3)
packages/intents    Intent schema, NL parser (Claude), planner             (Phase 4)
packages/execution  Swap/bridge adapters, route optimizer, step machine    (Phase 5)
packages/risk       Token verification, scam detection, policies           (Phase 6)
services/api        Backend services                                       (Phase 7)
apps/web, mobile    Clients                                                (Phase 8)
```

## Development

```bash
pnpm install
pnpm test        # all workspace tests
pnpm typecheck
```

**Security invariant:** private keys and seed phrases exist only inside `packages/core`
on the user's device, encrypted at rest. Nothing outside `core` may import key material.
