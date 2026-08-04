/**
 * On-chain transaction history — the wallet's "activity feed". We proxy a public EVM
 * explorer (Blockscout by default, no key required) server-side and normalize its
 * `txlist` into a small, stable shape the web renders. Proxying keeps the vendor URL +
 * response quirks on the server (and avoids browser CORS), and normalizing means the UI
 * never couples to Blockscout's exact fields.
 *
 * No-fake-data: every row is a real on-chain transaction the explorer returned; an address
 * with no history yields an empty list (never invented rows). The default explorer targets
 * Sepolia (the wallet's EVM testnet); a deployment points `IW_EVM_EXPLORER_API` at the
 * network it serves.
 */
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface EvmTxItem {
  hash: string;
  /** Lowercased sender. */
  from: string;
  /** Lowercased recipient (empty for contract-creation). */
  to: string;
  /** Native value moved, in wei (decimal string). */
  valueWei: string;
  /** Block timestamp, unix seconds. */
  timeStamp: number;
  /** True if the tx reverted on-chain. */
  failed: boolean;
}

/**
 * Build an EVM history reader over an Etherscan-compatible `txlist` API (Blockscout's is
 * key-free). Returns the address's most-recent transactions, newest first.
 */
export function makeEvmHistory(apiBase: string, fetchFn?: FetchLike): (address: string, limit?: number) => Promise<EvmTxItem[]> {
  const doFetch: FetchLike = fetchFn ?? ((u) => fetch(u, { signal: AbortSignal.timeout(8000) }));
  return async (address: string, limit = 15): Promise<EvmTxItem[]> => {
    const addr = address.trim();
    if (!EVM_ADDRESS.test(addr)) return [];
    const url = `${apiBase}?module=account&action=txlist&address=${addr}&page=1&offset=${limit}&sort=desc`;
    const res = await doFetch(url);
    if (!res.ok) throw new Error(`explorer txlist failed (HTTP ${res.status})`);
    const body = (await res.json()) as { result?: unknown };
    // Blockscout returns `result: []` (or a string message) when there is no history.
    if (!Array.isArray(body.result)) return [];
    return body.result
      .slice(0, limit)
      .map((entry): EvmTxItem => {
        const row = entry as Record<string, unknown>;
        return {
          hash: String(row.hash ?? ''),
          from: String(row.from ?? '').toLowerCase(),
          to: String(row.to ?? '').toLowerCase(),
          valueWei: String(row.value ?? '0'),
          timeStamp: Number(row.timeStamp ?? 0),
          failed: String(row.isError ?? '0') === '1',
        };
      })
      .filter((item) => EVM_ADDRESS.test(item.from) && item.hash.length > 0);
  };
}
