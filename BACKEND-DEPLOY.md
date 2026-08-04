# Deploying the backend (services/api) on Railway

The wallet's **core flows run entirely client-side** (create wallet, AI intents,
GIWA AMM swap, send, stake, bridge — all signed in the browser). The backend only
powers a few extras, and everything except the net-worth card degrades gracefully
without it:

| Feature | Without backend |
| --- | --- |
| Net-worth / portfolio card (`/v1/portfolio/balances`) | **unavailable** (the one thing that needs it) |
| ENS name resolution | falls back to `null` — use raw addresses |
| LLM fallback parsing | deterministic parser handles common asks |
| SIWE sign-in | optional; execution never needs it |

So the backend is a polish layer, not a dependency of the demo's security or
execution. Host it if you want the net-worth card live.

## Minimal mode = one Node service, no databases

`services/api` requires Postgres + Redis only when `IW_ENV` is a deployed tier
(`preview`/`staging`/`prod`). Running it with **`IW_ENV=local`** uses in-memory
stores — no Postgres, no Redis, no API keys — which is exactly right for a
single-instance testnet demo. It is non-custodial (the server never holds keys or
funds), so the relaxed local session secret carries no fund risk here.

## Deploy on Railway

1. **New Project → Deploy from GitHub repo** → pick `waquar213/giwa-intent-wallet`.
   Railway reads `railway.json` (repo root): it installs the pnpm workspace, builds
   `@intent-wallet/api` + its dependencies, and starts `services/api/dist/main.js`
   on Railway's assigned port (`IW_HTTP_PORT=$PORT` in the start command).
2. **Variables** — add:
   ```
   IW_ENV=local
   ```
   Optional (both server-side only — never in the client):
   ```
   IW_LLM_API_KEY=<anthropic key>   # enables LLM fallback parsing
   IW_ALCHEMY_API_KEY=<alchemy key> # ERC-20 auto-discovery in the portfolio (else native-only)
   IW_RPC_SOLANA=<helius mainnet url>   # faster SOL balance reads (public default works too)
   ```
3. **Deploy**, then **Settings → Networking → Generate Domain**. Copy the URL
   (e.g. `https://giwa-intent-wallet-production.up.railway.app`).

## Point the frontend at it (Vercel rewrite)

The client calls the backend at same-origin `/v1/*` (its `baseUrl` is `''`). So
proxy `/v1/*` from Vercel to Railway — no CORS, no client code change.

In `apps/web/vercel.json`, replace the placeholder with your Railway URL:
```json
"rewrites": [
  { "source": "/v1/(.*)", "destination": "https://giwa-intent-wallet-production.up.railway.app/v1/$1" }
]
```
Commit + redeploy the Vercel frontend. The browser now sees same-origin `/v1/*`;
Vercel forwards to Railway. (The `/api/solana-rpc` proxy is under `/api`, untouched.)

## Verify

```bash
curl -s -X POST https://YOUR-RAILWAY-URL/v1/portfolio/balances \
  -H 'content-type: application/json' \
  -d '{"evm":"0xB81cbD5Bba32C44FdF851B2a6C1F5501046E82c8"}' | head -c 300
```
A JSON body with `holdings` / `totalValueMicros` means it's live. Then open the
Vercel site — the net-worth card should populate.

## Notes

- `IW_ENV=local` is single-instance + in-memory (rate-limit, nonce, plan store).
  Fine for a demo; for production-grade, set `IW_ENV=prod` and add `IW_DB_URL`
  (Postgres), `IW_REDIS_URL` (Redis), a strong `IW_AUTH_SECRET`, `IW_REQUIRE_AUTH=true`,
  and `IW_CORS_ORIGINS=<your vercel domain>` — Railway offers one-click Postgres + Redis.
- Keep every keyed value (`IW_LLM_API_KEY`, `IW_ALCHEMY_API_KEY`, keyed RPC) in
  Railway's **server-side** variables only — never in a `VITE_*` var.
