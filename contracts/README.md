# IntentExecutor — on-chain intent settlement on GIWA

The on-chain half of the Intent Wallet: the wallet plans an intent off-chain
(natural language → typed, validated steps), then submits it to `IntentExecutor`
on **GIWA Sepolia** (chainId `91342`), which executes the transfer legs atomically
and emits a verifiable record binding the plan's `intentHash` to exactly what ran.

- No owner, no admin, no upgrade key — nobody can pause, drain, or re-point it.
- Stateless between calls — it never custodies funds (forwards `msg.value`, refunds dust).
- All-or-nothing — a failed leg reverts the whole intent, so a partial execution is
  never reported as done.

See [`src/IntentExecutor.sol`](src/IntentExecutor.sol).

## Prerequisites (one-time)

```bash
# 1. Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# 2. From this contracts/ dir, install forge-std
#    (newer Foundry has no --no-commit flag — it's the default now)
forge install foundry-rs/forge-std
```

## Test

```bash
forge test -vvv
```

## Deploy to GIWA Sepolia

```bash
# 1. Fund a fresh deployer key with GIWA Sepolia ETH:
#      - get Sepolia ETH:  https://alchemy.com/faucets/ethereum-sepolia
#      - bridge it to GIWA: https://bridge-giwa.vercel.app
#      - or a direct GIWA faucet: https://faucet.giwa.io
#
# 2. Export the funded key (NEVER commit it — .env is gitignored):
export PRIVATE_KEY=0x<your_funded_giwa_sepolia_key>

# 3. Deploy:
forge script script/Deploy.s.sol:Deploy --rpc-url giwa_sepolia --broadcast

# The console prints:  IntentExecutor deployed at: 0x....
# View it on the explorer: https://sepolia-explorer.giwa.io/address/0x....
```

## After deploy

Put the deployed address in the wallet's env so the AI-flow executes through it on GIWA:

```
# apps/web/.env.local
VITE_GIWA_INTENT_EXECUTOR=0x<deployed_address>
```

## Network facts

| | |
|---|---|
| Chain | GIWA Sepolia (Dunamu/Upbit OP Stack L2 testnet) |
| Chain ID | `91342` (`0x164ce`) |
| RPC | `https://sepolia-rpc.giwa.io` |
| Explorer | `https://sepolia-explorer.giwa.io` (Blockscout) |
| Native | ETH |
