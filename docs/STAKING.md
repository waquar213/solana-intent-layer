# Staking — deploy + wire (GIWA Sepolia · Ethereum Sepolia · Solana devnet)

Natural-language "stake N ETH / N SOL" intents settle on our own **SimpleStaking** contracts.
The intent flow is already wired end-to-end; the only step left is to **deploy the contracts and
paste their addresses** into the web env (the same pattern as the SimpleAMM/gUSDC deploy).

- Parser: only **PoS natives** stake (ETH / SOL / POL). `stake USDC`/`stake BTC` are rejected.
- Execution is **non-custodial**: the user signs `stake()` in-browser; nothing custodial.

---

## 1. EVM — GIWA Sepolia + Ethereum Sepolia (same contract, deploy twice)

Contract: `contracts/src/SimpleStaking.sol` · script: `contracts/script/DeployStaking.s.sol`
(native-ETH pool, linear APR reward paid from a deployer-seeded pool; `forge test` green).

```bash
cd contracts
export PRIVATE_KEY=0x<your-testnet-deployer-key>   # the key that holds GIWA/Sepolia test ETH

# GIWA Sepolia
APR_BPS=500 SEED_REWARD_WEI=20000000000000000 \
  forge script script/DeployStaking.s.sol:DeployStaking --rpc-url giwa_sepolia --broadcast

# Ethereum Sepolia (set SEPOLIA_RPC_URL to your Alchemy/Infura URL first)
export SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<key>
APR_BPS=500 SEED_REWARD_WEI=20000000000000000 \
  forge script script/DeployStaking.s.sol:DeployStaking --rpc-url sepolia --broadcast
```

Each run prints `SimpleStaking: 0x…`. Put them in `apps/web/.env.local`:

```
VITE_GIWA_STAKING=0x…      # from the GIWA run
VITE_SEPOLIA_STAKING=0x…   # from the Sepolia run
```

## 2. Solana devnet — Anchor program

Program: `solana-staking/programs/staking/src/lib.rs` (native-SOL pool, vault + per-user PDA).
Needs the **Solana CLI + Anchor** toolchain (Anchor is installed; install `solana` if missing:
`sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`).

```bash
cd solana-staking
solana config set --url devnet
solana airdrop 2 --keypair deployer.json      # fund the deploy key
anchor build
anchor keys list                              # copy the program id →
#   … into lib.rs `declare_id!` AND Anchor.toml [programs.devnet], then rebuild:
anchor build && anchor deploy --provider.cluster devnet
```

Put the program id in `apps/web/.env.local`:

```
VITE_SOLANA_STAKING_PROGRAM=<program-id>
```

> The client instruction builder (`packages/chains/src/solana/staking.ts`) is byte-matched to
> this program (discriminators `global:stake`/`global:unstake`, seeds `["stake", user]` / `["vault"]`,
> account order `[user, stake_account, vault, system_program]`). If you change the program, keep
> the two in sync (check `anchor build`'s IDL).

---

## 3. Restart + test

Restart the web dev server so Vite re-inlines the env, unlock a **funded** wallet, then:

```
stake 0.001 ETH        → real stake on GIWA Sepolia (or Sepolia)
0.001 ETH 스테이킹       → same, in Korean
stake 0.01 SOL         → real stake on Solana devnet
```

The Execute step signs in-browser and shows the tx on the chain's explorer. Until an address is
set, that chain's stake stays **plan-level** (an honest "not executable yet" message — nothing is
faked).
