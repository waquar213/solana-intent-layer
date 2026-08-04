# Bridge relayer

The missing half of the operator bridge. The wallet deposits to an operator address with the route
encoded **on-chain**; this reads those deposits and settles them.

```
memo   BRDG:<destChainId>:<recipient>
       EVM / Bitcoin → transaction calldata
       Solana        → spl-memo instruction
```

Verified on a real deposit: `0x3ae6446e…` on GIWA decodes to
`BRDG:sepolia:0xB81cbD5Bba32C44FdF851B2a6C1F5501046E82c8`.

## Why it exists

Deposits worked; releases never did, because nothing was watching. The first `pending` run found
**four** stranded deposits on the operator addresses — 0.001 + 0.01 + 0.02 ETH and 0.05 SOL — two of
which were previously unknown.

## Commands

```bash
node relayer.mjs pending                     # scan every chain, classify every deposit
node relayer.mjs release <sourceTxid>        # dry run
node relayer.mjs release <sourceTxid> --execute
node relayer.mjs refund  <sourceTxid> --execute   # return to sender (same-asset, no oracle)
node relayer.mjs watch [--execute] [--interval 30]
```

States `pending` reports: `PAYABLE`, `WAITING (n/m conf)`, `REFUSED` (with the reason and a refund
command), `CLAIMED-UNPAID` (needs a human — see idempotency), `PAID`.

## Safety properties

A broken relayer does not fail safely: it either eats the deposit (what happened here) or pays it
twice (worse). Each property is enforced in code, not by care.

| # | Property | How |
|---|---|---|
| 1 | **Idempotency** | Every payout is keyed by its source txid in a ledger file created with `O_EXCL` **before** signing. A crash between claim and broadcast can only *leak* a payout — never duplicate it — and shows up as `CLAIMED-UNPAID`. |
| 2 | **Finality** | A deposit is invisible until it has confirmations behind it (EVM 6, Solana 32), so a reorged deposit cannot be paid. |
| 3 | **Dry run** | Default is dry-run. Broadcasting needs `--execute`, every time. |
| 4 | **No oracle** | Same-asset routes pay 1:1 minus the 0.10% fee. Cross-asset routes (SOL→ETH) are **refused** — a stale or manipulated rate is a silent loss. Use `refund` to return those to the sender. |

## Keys

Read from the environment, never logged. Read-only commands work with just the operator addresses.

```bash
RELAYER_EVM_KEY=0x…            # 32-byte hex — operator on Sepolia + GIWA
RELAYER_SOL_KEY=…              # base58 64-byte keypair, or 0x 32-byte seed
RELAYER_EVM_OPERATOR=0x…       # address only, for `pending` without keys
RELAYER_SOL_OPERATOR=…
```

## Honest limits

- **Not trustless.** The operator holds funds between deposit and release. Call it
  *operator-assisted*, never *trustless*. On mainnet an aggregator replaces this entirely — the
  wallet's `RouteProvider` seam already composes GIWA SimpleAMM + Jupiter + Uniswap.
- **Bitcoin is not wired.** Deposits carrying an OP_RETURN memo are not scanned; BTC release needs
  UTXO selection and PSBT signing.
- **`watch --execute` has never been run against a live deposit.** `pending`, and both dry-run
  paths, are verified against the four real stranded deposits. Signing paths are not.
- **Ethereum ⇄ GIWA does not need this at all.** That route uses the canonical OP Stack bridge
  (deposits ~60s, proven on-chain). Withdrawals there take 7 days by protocol
  (`proofMaturityDelaySeconds = 604800`), which no relayer can shorten.
