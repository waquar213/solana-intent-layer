/**
 * Real Solana holdings via a keyless public RPC — the SOL leg of the Universal wallet's
 * portfolio. Native SOL (`getBalance`) today; SPL tokens (`getTokenAccountsByOwner`) are a
 * documented follow-up. The address is supplied by the CLIENT (derived on-device from the
 * same seed — the API can't derive it non-custodially), so this reads PUBLIC chain data
 * for an address the caller already owns.
 *
 * No-fake-data: a malformed address is REJECTED (never an empty "portfolio"); the balance
 * is read live from the cluster.
 */
import type { Holding } from '@intent-wallet/runtime';

/** CAIP-2-ish id for Solana mainnet — matches the SOL provenance used elsewhere. */
const SOL_MAINNET = 'solana:mainnet';
/** base58 Solana public key (32–44 chars, no 0/O/I/l). */
const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface RpcResponse {
  result?: { value?: number | null };
  error?: { message?: string };
}

/** Build a reader for a principal's REAL native SOL balance over a keyless public RPC. */
export function makeSolHoldings(rpcUrl = 'https://api.mainnet-beta.solana.com', fetchFn?: FetchLike): (address: string) => Promise<Holding[]> {
  const doFetch: FetchLike = fetchFn ?? ((u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(8000) }));
  return async (address: string): Promise<Holding[]> => {
    const addr = address.trim();
    if (!SOL_ADDRESS.test(addr)) {
      return Promise.reject(new Error('SOL holdings require a valid Solana address'));
    }
    const res = await doFetch(rpcUrl, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'getBalance', params: [addr] }),
    });
    if (!res.ok) throw new Error(`sol holdings failed (HTTP ${res.status})`);
    const body = (await res.json()) as RpcResponse;
    if (body.error) throw new Error(`sol holdings: ${body.error.message ?? 'rpc error'}`);
    const lamports = body.result?.value;
    // Guard the integer SHAPE before BigInt(): a non-integer JSON number (e.g. 1.5 from a broken RPC)
    // passes `typeof === 'number'` but BigInt(1.5) throws a raw RangeError. Fold it into the existing
    // shape check so a malformed value fails as a clean typed error, not a stray 500. (Mirrors jupiter.ts.)
    if (typeof lamports !== 'number' || !Number.isInteger(lamports)) throw new Error('sol holdings: unexpected response shape');
    const base = BigInt(lamports);
    if (base <= 0n) return [];
    return [{ symbol: 'SOL', decimals: 9, totalBase: base, chains: [{ chainId: SOL_MAINNET, base }] }];
  };
}
