# Deploying the public demo (100+ testers, safely)

The wallet is a **static Vite SPA + one serverless proxy**. It is safe to hand to
many testers at once *by construction* — the only thing you must get right is
keeping keyed RPC URLs off the client. That is what `apps/web/api/solana-rpc.ts`
is for.

## Why it's safe for a crowd

- **Non-custodial.** Every tester's keys are generated and sealed **in their own
  browser** and never sent anywhere. You never hold funds, so there is no single
  place that can lose everyone's money. 100 testers = 100 independent wallets.
- **Testnet only.** No real value is at risk.
- **Relayer process not running.** The operator relayer in `services/relayer/`
  is a roadmap prototype and is **not run** for the demo. Note: the in-app bridge
  does deposit TESTNET funds to an operator address (release stays manual until
  the relayer ships) — testnet-only, no mainnet, no real-value custody.

## The one real risk: keyed RPC in the bundle

Anything in a `VITE_*` env var is **inlined into the shipped JavaScript** and
readable by every visitor. So a Helius/Alchemy URL with an API key in
`VITE_SOLANA_*_RPC` would leak your key to all 100 testers.

Fix (already scaffolded): the client calls a same-origin proxy path; the real
keyed URL lives in a **server-side** env var the browser never sees.

```
browser ──POST /api/solana-rpc?net=devnet──▶ serverless fn ──▶ Helius (key here)
         (only a path in the bundle)          (key in server env)
```

## "Will my code leak?"

A frontend's JavaScript is **always** downloaded by the browser — that is true of
every web app, and cannot be avoided. But:

- The shipped bundle is **minified** — no comments, no tests, no server code, no
  git history. It is not your repository.
- Keep the **repo private**, deploy **only the build output** (`dist/`), never a
  `.env` or `.git`. In this repo `.env` and `.env.*` are already gitignored and
  there is no git remote, so nothing is online yet.

So testers can read minified JS (unavoidable) but not your source, secrets, or
server. The keyed RPC — the one thing that would be a genuine leak — is proxied.

## Deploy on Vercel

1. Push this repo to a **private** GitHub repo (or use `vercel` CLI without a repo).
2. Import it in Vercel and set **Root Directory = `apps/web`** (Vercel detects the
   npm workspace and installs from the repo root). `apps/web/vercel.json` pins the
   Vite build + the `/api/solana-rpc` function.
3. In **Settings → Environment Variables**, add:

   Client (safe — just paths; these ARE inlined, but contain no key):
   ```
   VITE_SOLANA_DEVNET_RPC   = /api/solana-rpc?net=devnet
   VITE_SOLANA_MAINNET_RPC  = /api/solana-rpc?net=mainnet
   ```
   Server-side (NO `VITE_` prefix → never reaches the browser):
   ```
   SOLANA_DEVNET_RPC_URL    = https://devnet.helius-rpc.com/?api-key=YOUR_KEY
   SOLANA_MAINNET_RPC_URL   = https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
   ```
   Plus your deployed contract addresses (`VITE_GIWA_*`, etc.) — all public.
   GIWA and Ethereum Sepolia RPC default to public keyless endpoints, so no proxy
   is needed for them.
4. Deploy. Share the URL. Point testers at a GIWA Sepolia faucet
   (`faucet.giwa.io`) so they have testnet ETH to transact.

Local dev is unaffected: `.env.local` (gitignored, never deployed) can keep a
direct keyed URL, or leave the Solana vars blank to use public RPCs. To exercise
the proxy locally, run `vercel dev`.

## Cloudflare Pages (alternative)

Same idea, different convention: put the proxy at `functions/api/solana-rpc.ts`
(export `onRequestPost`), read the key from `env.SOLANA_DEVNET_RPC_URL`, set client
`VITE_*` to the same proxy paths. Static output stays `apps/web/dist`.

## Pre-launch security checklist

- [ ] Keyed RPC only in **server-side** env (`SOLANA_*_RPC_URL`), never `VITE_*`
- [ ] Client `VITE_SOLANA_*_RPC` point at `/api/solana-rpc?net=…`
- [ ] Repo private; deploy only `dist/` + `api/` — no `.git`, no `.env`
- [ ] `services/relayer` process stays off (bridge deposits are testnet-only, manual release)
- [ ] Testnet endpoints only; no mainnet path exposes real value
- [ ] (Optional, for heavier load) front the proxy with Vercel WAF or an
      Upstash rate limiter — the in-function throttle is best-effort only
