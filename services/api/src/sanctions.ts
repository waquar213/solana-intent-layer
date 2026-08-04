/**
 * OFAC sanctions screening — the compliance data-half of the Risk Engine's threat intel.
 *
 * We fetch OFAC's published list of sanctioned digital-currency addresses and seed it into
 * the Risk Engine's `ThreatIntel`. Because a `SANCTIONED_ADDRESS` signal is a HARD (severity
 * 1) hit, any plan whose recipient is on the list is BLOCKED — and a block is non-overridable
 * (a permissive policy can't un-block a sanctioned address). This is the deterministic-code
 * "disposes" half of the doctrine applied to compliance: the AI never decides sanctions; the
 * engine does, from a real government list.
 *
 * No-fake-data: every address is a REAL entry on OFAC's SDN list — nothing is hardcoded. The
 * default source is the 0xB10C mirror (OFAC's SDN crypto addresses, refreshed via CI, one
 * address per line); a production deployment can point `sources` at OFAC's official
 * `sdn_advanced.xml` parser or an internal feed instead.
 */
import { InMemoryThreatIntel, RiskEngine } from '@intent-wallet/risk';

/** The origin (scheme+host) of a URL, or '<feed>' if unparseable — never the full URL, so a keyed feed's
 *  api-key (which would live in the query/path) can't reach a boot log line. */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '<feed>';
  }
}

/**
 * OFAC-derived sanctioned address lists (newline-delimited, one address per line). The wallet moves
 * ETH, BTC AND SOL, so screen ALL THREE — an ETH-only list silently passed sanctioned Bitcoin/Solana
 * recipients (e.g. via convert-and-send). The 0xB10C mirror publishes a per-chain file for each.
 */
const DEFAULT_SOURCES = [
  'https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.txt',
  'https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_BTC.txt',
  'https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_SOL.txt',
] as const;

// Accept an address-shaped line on ANY of the supported chains; a comment/blank/header matches none.
// (The RiskEngine's InMemoryThreatIntel lowercases on both seed AND lookup, so matching is symmetric
// across chains — case-sensitive BTC/SOL still match their own entries; a lowercase collision between
// two distinct base58 addresses is astronomically unlikely and fails SAFE by over-blocking.)
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const BTC_ADDRESS = /^(bc1[a-z0-9]{25,87}|tb1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|[mn2][a-km-zA-HJ-NP-Z1-9]{25,39})$/u;
const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const isSanctionedAddressLine = (a: string): boolean => EVM_ADDRESS.test(a) || BTC_ADDRESS.test(a) || SOL_ADDRESS.test(a);

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface SanctionsOptions {
  /** Injected fetch (tests); defaults to the global `fetch`. */
  fetchFn?: FetchLike;
  /** Feed URLs (newline-delimited address lists). Defaults to the OFAC ETH list. */
  sources?: readonly string[];
  /** Per-source fetch timeout (ms) so a slow feed never blocks boot. Default 8000. */
  timeoutMs?: number;
}

/**
 * Fetch + parse the OFAC-sanctioned EVM address list(s) into a deduped, lowercased array.
 * Non-address lines (comments/blanks/headers) are ignored; a source that fails HTTP throws.
 */
export async function fetchSanctionedAddresses(options: SanctionsOptions = {}): Promise<string[]> {
  const doFetch: FetchLike = options.fetchFn ?? ((u, init) => fetch(u, init));
  const sources = options.sources ?? DEFAULT_SOURCES;
  const timeoutMs = options.timeoutMs ?? 8000;
  const set = new Set<string>();
  for (const url of sources) {
    const res = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    // Origin only (never the full URL) in the error — this message is logged at boot, and if an operator
    // ever points a source at a KEYED feed the api-key lives in the query/path. Mirrors the status-only
    // discipline of the other upstream fetchers.
    if (!res.ok) throw new Error(`sanctions feed ${originOf(url)} failed (HTTP ${res.status})`);
    for (const raw of (await res.text()).split('\n')) {
      const addr = raw.trim();
      if (isSanctionedAddressLine(addr)) set.add(addr.toLowerCase());
    }
  }
  return [...set];
}

/**
 * Build a RiskEngine whose threat intel is seeded with the OFAC sanctions list, so a plan to
 * a sanctioned address is HARD-BLOCKED by the risk gate. Returns the engine + the count loaded.
 */
export async function loadOfacRiskEngine(
  options: SanctionsOptions = {},
): Promise<{ riskEngine: RiskEngine; count: number }> {
  const sanctioned = await fetchSanctionedAddresses(options);
  return { riskEngine: new RiskEngine({ intel: new InMemoryThreatIntel({ sanctioned }) }), count: sanctioned.length };
}
