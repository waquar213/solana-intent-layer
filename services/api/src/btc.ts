/**
 * Real Bitcoin holdings via a keyless Esplora/Blockstream API — the BTC leg of the
 * Universal wallet's portfolio. The address is supplied by the CLIENT (derived on-device
 * from the same seed, non-custodial — the API can't derive it), so this reads PUBLIC
 * chain data for an address the caller already owns. Base-layer Bitcoin has no tokens,
 * so this is native BTC only.
 *
 * No-fake-data: a malformed address is REJECTED (never turned into an empty "portfolio"),
 * and the balance is read live from the mempool/UTXO set — nothing hardcoded.
 */
import type { Holding } from '@intent-wallet/runtime';

/** CAIP-2 id for Bitcoin mainnet — matches the BTC provenance used elsewhere. */
const BTC_MAINNET = 'bip122:bitcoin';
/** Basic mainnet address sanity: bech32 (bc1…) or base58 P2PKH/P2SH (1…/3…). */
const BTC_ADDRESS = /^(bc1[a-z0-9]{20,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,39})$/u;

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface EsploraAddress {
  chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
}

/** Build a reader for a principal's REAL native BTC balance over a keyless Esplora API. */
export function makeBtcHoldings(apiBase = 'https://blockstream.info/api', fetchFn?: FetchLike): (address: string) => Promise<Holding[]> {
  const doFetch: FetchLike = fetchFn ?? ((u) => fetch(u, { signal: AbortSignal.timeout(8000) }));
  const base = apiBase.replace(/\/$/u, '');
  return async (address: string): Promise<Holding[]> => {
    const addr = address.trim();
    if (!BTC_ADDRESS.test(addr)) {
      // Never query a bogus "address" and present the empty result as the user's BTC.
      return Promise.reject(new Error('BTC holdings require a valid Bitcoin mainnet address'));
    }
    const res = await doFetch(`${base}/address/${addr}`);
    if (!res.ok) throw new Error(`btc holdings failed (HTTP ${res.status})`);
    const body = (await res.json()) as EsploraAddress;
    const cs = body.chain_stats;
    // Integer-shape guard before BigInt(): a non-integer JSON number would pass `typeof === 'number'`
    // then throw a raw RangeError in BigInt(); fold it in so a malformed value is a clean typed error.
    if (
      !cs ||
      typeof cs.funded_txo_sum !== 'number' ||
      typeof cs.spent_txo_sum !== 'number' ||
      !Number.isInteger(cs.funded_txo_sum) ||
      !Number.isInteger(cs.spent_txo_sum)
    ) {
      throw new Error('btc holdings: unexpected response shape');
    }
    // Confirmed balance = funded − spent (sats). Esplora returns integer sats well within
    // Number.MAX_SAFE_INTEGER even for whale addresses; BigInt() keeps the money exact.
    const sats = BigInt(cs.funded_txo_sum) - BigInt(cs.spent_txo_sum);
    if (sats <= 0n) return [];
    return [{ symbol: 'BTC', decimals: 8, totalBase: sats, chains: [{ chainId: BTC_MAINNET, base: sats }] }];
  };
}
