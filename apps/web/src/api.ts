/**
 * The web app's data layer — now a thin adapter over the official @intent-wallet/sdk
 * client. One module-level client is bound to the same-origin base ('' → '/v1/...'
 * through the Vite proxy). The exported wrappers keep their original signatures so the
 * UI (App.tsx) is untouched; errors now arrive as a typed ApiError, and we surface its
 * `.detail` exactly as before.
 */
import { createClient, isApiError } from '@intent-wallet/sdk';
import { currentSession } from './auth';
import { evmAddress } from './wallet';
import type { ExecuteResult, Identity, Permission, PlanResponse, PortfolioInsights, PortfolioSummary } from './types';

// same-origin; the browser's fetch is the transport. The SIWE session token (when
// the user has signed in) is attached to every request as a Bearer credential —
// resolved FRESH per call, so a sign-in / sign-out / expiry is always reflected.
// ACCOUNT-BOUND: a SIWE session belongs to the address that signed it. Only attach the token when it
// matches the ACTIVE account — otherwise "Add account" / "Import key" (which change the active account
// WITHOUT a switchAccount sign-out) or an imported Solana account (empty EVM address) would keep sending
// the PREVIOUS account's token, so the server would authorize/plan/read under the wrong principal. A
// mismatch is treated as "no token" → the server 401s → the UI prompts a fresh sign-in for this account.
const client = createClient({
  baseUrl: '',
  authToken: () => {
    const s = currentSession();
    const a = evmAddress();
    return s && a && s.address.toLowerCase() === a.toLowerCase() ? s.token : null;
  },
});

const message = (err: unknown): string =>
  isApiError(err) ? err.detail : err instanceof Error ? err.message : 'Something went wrong';

/**
 * A 401 means the SIWE session is missing or expired — a distinct, RECOVERABLE state (sign in), not a
 * generic intent rejection. Collapsing it to a plain string made the AI-Chat flow render a red
 * "rejected" card with a raw "missing Authorization header" detail and no hint to sign in. Callers
 * detect this type and surface the sign-in path instead.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('Sign in to continue — your session is missing or has expired.');
    this.name = 'SessionExpiredError';
  }
}
export function isSessionExpired(err: unknown): boolean {
  return err instanceof SessionExpiredError;
}
function rethrow(err: unknown): never {
  if (isApiError(err) && (err.code === 'UNAUTHORIZED' || err.status === 401)) throw new SessionExpiredError();
  throw new Error(message(err));
}

/** Natural language → a plan (or clarify / rejected). */
export async function planIntent(utterance: string): Promise<PlanResponse> {
  try {
    return (await client.plan(utterance)).response;
  } catch (err) {
    rethrow(err);
  }
}

/** Run a plan through Risk + Policy → a permission. */
export async function authorizeIntent(planId: string): Promise<Permission> {
  try {
    return await client.authorize(planId);
  } catch (err) {
    rethrow(err);
  }
}

/** Drive an authorized plan to a terminal execution. */
export async function executeIntent(planId: string): Promise<ExecuteResult> {
  try {
    return await client.execute(planId);
  } catch (err) {
    rethrow(err);
  }
}

/** The wallet's holdings folded into USD values. */
export async function getPortfolio(): Promise<PortfolioSummary> {
  return client.portfolio();
}

/** Portfolio intelligence (allocation / risk / health / insights), or null if unavailable. */
export async function getInsights(): Promise<PortfolioInsights | null> {
  const res = await client.safe.insights();
  return res.ok ? res.value : null;
}

/** The Universal Identity — BTC / EVM / Solana receive addresses. */
export async function getIdentity(): Promise<Identity | null> {
  const res = await client.safe.identity();
  return res.ok ? res.value : null;
}

/** Is the API reachable? Used for the connection indicator. */
export async function apiHealthy(): Promise<boolean> {
  const res = await client.safe.status();
  return res.ok;
}

export interface HistoryItem {
  hash: string;
  timeStamp: number;
  failed: boolean;
  /** Which chain this transaction is on. */
  chain: 'GIWA' | 'Sepolia' | 'Solana' | 'Bitcoin';
  /** Direct link to this tx on the chain's explorer. */
  explorerUrl: string;
  /** The primary line to show (a method label, "Sent"/"Received", or the chain op). */
  label: string;
  /** A human amount when known (e.g. "0.001 ETH"). */
  amount?: string;
}

const env = (import.meta as { env?: Record<string, string> }).env ?? {};
const GIWA_EXPLORER = env.VITE_GIWA_EXPLORER || 'https://sepolia-explorer.giwa.io';
const SEPOLIA_EXPLORER = 'https://eth-sepolia.blockscout.com';
const SOL_DEVNET_RPC = env.VITE_SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';
const BTC_TESTNET_API = env.VITE_BTC_TESTNET_REST || 'https://blockstream.info/testnet/api';

const METHOD_LABEL: Record<string, string> = {
  swapEthForToken: '🔄 Swap ETH → gUSDC',
  swapTokenForEth: '🔄 Swap gUSDC → ETH',
  approve: '✓ Approve',
  execute: '⚡ Intent execute',
  '0x68cd9bdd': '⚡ Intent execute',
  depositETH: '🌉 Bridge → GIWA',
};

interface BlockscoutTx {
  hash: string;
  from?: { hash?: string };
  value?: string;
  timestamp?: string;
  status?: string;
  result?: string;
  method?: string | null;
}

/** EVM history from a Blockscout v2 explorer (GIWA or Sepolia), tagged with the chain. */
async function fetchEvm(explorer: string, address: string, chain: HistoryItem['chain']): Promise<HistoryItem[]> {
  try {
    const res = await fetch(`${explorer}/api/v2/addresses/${encodeURIComponent(address.trim())}/transactions`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const body = (await res.json()) as { items?: BlockscoutTx[] };
    const me = address.trim().toLowerCase();
    return (Array.isArray(body.items) ? body.items : []).slice(0, 15).map((t) => {
      const eth = Number(t.value ?? '0') / 1e18;
      const sent = String(t.from?.hash ?? '').toLowerCase() === me;
      const method = typeof t.method === 'string' && t.method ? t.method : null;
      return {
        hash: String(t.hash),
        timeStamp: t.timestamp ? Math.floor(new Date(t.timestamp).getTime() / 1000) : 0,
        failed: t.status === 'error' || t.result === 'execution reverted',
        chain,
        explorerUrl: `${explorer}/tx/${t.hash}`,
        label: method ? (METHOD_LABEL[method] ?? `⚙ ${method}`) : sent ? '↑ Sent' : '↓ Received',
        ...(eth > 0 ? { amount: `${eth.toFixed(5)} ETH` } : {}),
      };
    });
  } catch {
    return [];
  }
}

interface BlockscoutInternalTx {
  transaction_hash?: string;
  from?: { hash?: string };
  to?: { hash?: string };
  value?: string;
  timestamp?: string;
}

/**
 * EVM INTERNAL transactions (value moved by a contract, e.g. the IntentExecutor
 * forwarding ETH to the wallet). These never appear in the regular tx list, so an
 * incoming contract transfer — a real "receive" — is invisible without this.
 */
async function fetchEvmInternal(explorer: string, address: string, chain: HistoryItem['chain']): Promise<HistoryItem[]> {
  try {
    const res = await fetch(`${explorer}/api/v2/addresses/${encodeURIComponent(address.trim())}/internal-transactions`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const body = (await res.json()) as { items?: BlockscoutInternalTx[] };
    const me = address.trim().toLowerCase();
    return (Array.isArray(body.items) ? body.items : [])
      .filter((t) => Number(t.value ?? '0') > 0 && t.transaction_hash)
      .slice(0, 15)
      .map((t) => {
        const eth = Number(t.value ?? '0') / 1e18;
        const sent = String(t.from?.hash ?? '').toLowerCase() === me;
        return {
          hash: String(t.transaction_hash),
          timeStamp: t.timestamp ? Math.floor(new Date(t.timestamp).getTime() / 1000) : 0,
          failed: false,
          chain,
          explorerUrl: `${explorer}/tx/${t.transaction_hash}`,
          label: sent ? '↑ Sent' : '↓ Received',
          amount: `${eth.toFixed(5)} ETH`,
        };
      });
  } catch {
    return [];
  }
}

/** Solana devnet signatures for the address (the tx list, newest-first). */
async function fetchSol(address: string): Promise<HistoryItem[]> {
  if (!address) return [];
  try {
    const res = await fetch(SOL_DEVNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [address, { limit: 12 }] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { result?: Array<{ signature: string; blockTime?: number; err?: unknown }> };
    return (body.result ?? []).map((s) => ({
      hash: s.signature,
      timeStamp: s.blockTime ?? 0,
      failed: s.err != null,
      chain: 'Solana' as const,
      explorerUrl: `https://explorer.solana.com/tx/${s.signature}?cluster=devnet`,
      label: 'Solana transaction',
    }));
  } catch {
    return [];
  }
}

/** Bitcoin testnet transactions for the address, via an Esplora REST API. */
async function fetchBtc(address: string): Promise<HistoryItem[]> {
  if (!address) return [];
  try {
    const res = await fetch(`${BTC_TESTNET_API}/address/${encodeURIComponent(address)}/txs`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const txs = (await res.json()) as Array<{ txid: string; status?: { block_time?: number } }>;
    return (Array.isArray(txs) ? txs : []).slice(0, 12).map((t) => ({
      hash: t.txid,
      timeStamp: t.status?.block_time ?? 0,
      failed: false,
      chain: 'Bitcoin' as const,
      explorerUrl: `https://mempool.space/testnet/tx/${t.txid}`,
      label: 'Bitcoin transaction',
    }));
  } catch {
    return [];
  }
}

/**
 * The wallet's recent activity across ALL its chains — GIWA + Ethereum Sepolia (EVM),
 * Solana devnet, and Bitcoin testnet — merged and sorted newest-first. Each source is
 * read straight from a public, CORS-enabled explorer/RPC; a failing chain just drops out.
 */
export async function fetchActivity(addrs: { evm: string; sol: string; btc: string }): Promise<HistoryItem[]> {
  const [giwa, giwaInt, sepolia, sepoliaInt, sol, btc] = await Promise.all([
    fetchEvm(GIWA_EXPLORER, addrs.evm, 'GIWA'),
    fetchEvmInternal(GIWA_EXPLORER, addrs.evm, 'GIWA'),
    fetchEvm(SEPOLIA_EXPLORER, addrs.evm, 'Sepolia'),
    fetchEvmInternal(SEPOLIA_EXPLORER, addrs.evm, 'Sepolia'),
    fetchSol(addrs.sol),
    fetchBtc(addrs.btc),
  ]);
  // Regular txs first so they win the dedup — a tx and its internal transfer share a
  // hash; the regular row carries the method/status, the internal one only value.
  const seen = new Set<string>();
  return [...giwa, ...sepolia, ...giwaInt, ...sepoliaInt, ...sol, ...btc]
    .filter((h) => {
      const k = `${h.chain}:${h.hash}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    // A missing/0 block time means "not yet mined" = NEWEST, not oldest. Sort those to the TOP (as
    // MAX_SAFE_INTEGER) so a just-broadcast BTC/SOL tx isn't buried at the bottom — and, worse, sliced
    // off by the 30-item cap. (MAX_SAFE, not Infinity, so two pending rows compare to 0, not NaN.)
    .sort((a, b) => (b.timeStamp || Number.MAX_SAFE_INTEGER) - (a.timeStamp || Number.MAX_SAFE_INTEGER))
    .slice(0, 30);
}

export interface BalanceHoldingDto {
  symbol: string;
  amount: string;
  decimals: number;
  chains: { chainId: string; base: string }[];
  priceUsd: string | null;
  valueMicros: string | null;
}
export interface BalancesDto {
  holdings: BalanceHoldingDto[];
  totalValueMicros: string;
  /** Value split by ecosystem (micro-USD strings). */
  byEcosystem?: { evm: string; bitcoin: string; solana: string };
  /** Requested ecosystems whose data couldn't be fetched — excluded from the total. */
  unavailable?: string[];
  /** Held symbols the price feed couldn't value — excluded from the total (so it's a partial sum). */
  unpricedSymbols?: string[];
}

/**
 * Real cross-ecosystem holdings (EVM multi-chain + BTC + SOL) for the given PUBLIC
 * addresses, valued live. Read-only; discovers whatever addresses are provided.
 */
export async function fetchBalances(addrs: { evm?: string; btc?: string; sol?: string }): Promise<BalancesDto> {
  const res = await fetch('/v1/portfolio/balances', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(addrs),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`balances lookup failed (HTTP ${res.status})`);
  return (await res.json()) as BalancesDto;
}

/** Resolve an ENS name (`name.eth`) to an EVM address via the API — null if unresolvable. */
export async function resolveEnsName(name: string): Promise<string | null> {
  try {
    const res = await fetch(`/v1/resolve/ens?name=${encodeURIComponent(name.trim())}`, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: string | null };
    return body.address ?? null;
  } catch {
    return null;
  }
}
