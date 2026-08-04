/**
 * FIRST-TIME address-poisoning detection — the on-chain half. (Ported from apps/web/src/poison.ts;
 * only the env accessor + fetch wrapper differ. Mobile previously had no on-chain poison check.)
 *
 * The local check (`recents.ts` + `guardBroadcast`) can only catch a lookalike of an address the
 * user already saved or already paid FROM THIS DEVICE. That leaves the dangerous case open: a
 * freshly pasted address on a fresh install. This module closes it by reading the reference set
 * off the CHAIN instead of off the device:
 *
 *   1. the wallet's own transaction history gives every address it has really PAID — a grafted
 *      lookalike of any of them is caught the very first time it is pasted; and
 *   2. the wallet's token-transfer history contains the attacker's PLANTED entry, because
 *      poisoning requires seeding the lookalike into the victim's history first (zero-value
 *      `transferFrom`, a sub-$10 dust transfer, or a counterfeit token).
 *   3. a direct RPC read of the target itself (nonce / code) shows whether it has ever
 *      transacted — poisoning addresses are passive recipients by design.
 *
 * Calibrated to the measured attack corpus (Tsuchiya et al., "Blockchain Address Poisoning",
 * USENIX Security '25 / arXiv:2501.16681): 270M attacks, 17M victims, ≥$83.8M stolen, with
 * zero-value and counterfeit-token transfers making up the overwhelming majority of seeding.
 *
 * All judgement lives in the PURE assessor in `@intent-wallet/chains` (`assessRecipientOnChain`
 * + `classifyHistoryForPoisoning`); this file only fetches facts. Every source is individually
 * fail-soft: a rate-limited or CORS-blocked explorer degrades the verdict to fewer signals
 * rather than inventing a clean bill of health — `checked` reports whether anything answered.
 */
import {
  HttpJsonRpcTransport,
  ProviderPool,
  assessRecipientOnChain,
  classifyHistoryForPoisoning,
  decodeUint,
  type ChainId,
  type HistoryTransfer,
} from '@intent-wallet/chains';
import { DEFAULT_SEPOLIA_RPC } from './broadcast';
import { timedFetch } from './api';

/** Keyless, CORS-enabled Blockscout v2 explorers — the same ones the activity feed reads. */
const EXPLORER: Partial<Record<ChainId, string>> = {
  'giwa-sepolia': process.env.EXPO_PUBLIC_GIWA_EXPLORER || 'https://sepolia-explorer.giwa.io',
  sepolia: 'https://eth-sepolia.blockscout.com',
};
const RPC: Partial<Record<ChainId, string>> = {
  'giwa-sepolia': process.env.EXPO_PUBLIC_GIWA_RPC ?? 'https://sepolia-rpc.giwa.io',
  sepolia: DEFAULT_SEPOLIA_RPC,
};

/** How many history rows to consider per source. Poisoning is seeded close to a real transfer. */
const PAGE = 50;
/**
 * Below this, an UNPRICED native amount is treated as dust. Testnet coins have no exchange rate,
 * so a USD threshold can't judge them — and the distinction matters for safety, not cosmetics: a
 * dust-shaped inbound transfer must never promote its sender into the known-good reference set,
 * or an attacker could whitelist their own lookalike by sending the victim a few wei.
 */
const NATIVE_DUST_FLOOR = 5_000_000_000_000_000n; // 0.005 ETH

export interface RecipientAssessment {
  /** True when at least one on-chain source answered — false ⇒ verdict is "unknown", not "safe". */
  checked: boolean;
  /** Hard reasons the send must not proceed. */
  blocked: string[];
  /** Non-fatal cautions worth surfacing before signing. */
  warnings: string[];
  /** How many genuine counterparties the chain gave us to compare against. */
  referenceCount: number;
}

const UNKNOWN: RecipientAssessment = { checked: false, blocked: [], warnings: [], referenceCount: 0 };

interface BsAddr {
  hash?: string;
}
interface BsTx {
  from?: BsAddr;
  to?: BsAddr;
  value?: string;
}
interface BsTokenTransfer {
  from?: BsAddr;
  to?: BsAddr;
  total?: { value?: string; decimals?: string };
  token?: { exchange_rate?: string | null; symbol?: string };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await timedFetch(url, {}, 8000);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // rate-limited / offline / CORS — degrade to fewer signals, never to "safe"
  }
}

/** The wallet's native transfers, normalized. Outbound value transfers are the reference set. */
async function nativeHistory(explorer: string, me: string): Promise<HistoryTransfer[]> {
  const body = await getJson<{ items?: BsTx[] }>(`${explorer}/api/v2/addresses/${encodeURIComponent(me)}/transactions`);
  if (!body) return [];
  const mine = me.toLowerCase();
  const out: HistoryTransfer[] = [];
  for (const t of (Array.isArray(body.items) ? body.items : []).slice(0, PAGE)) {
    const from = String(t.from?.hash ?? '').toLowerCase();
    const to = String(t.to?.hash ?? '').toLowerCase();
    if (!from || !to) continue;
    const outbound = from === mine;
    const counterparty = outbound ? to : from;
    if (counterparty === mine) continue; // self-transfer tells us nothing
    let valueBase = 0n;
    try {
      valueBase = BigInt(t.value ?? '0');
    } catch {
      valueBase = 0n;
    }
    // `dust` is set EXPLICITLY either way: the classifier fails closed on `undefined`, so an
    // above-floor native receipt must positively assert dust:false to count as a reference.
    out.push({ counterparty, outbound, valueBase, dust: valueBase < NATIVE_DUST_FLOOR });
  }
  return out;
}

/**
 * The TARGET's own poisoner fingerprint — the one signal that needs NO prior relationship with
 * this wallet, and therefore the only one that can fire on a genuinely first-time recipient.
 *
 * A poisoning address is sprayed at many victims: the attacker emits a zero-value `transferFrom`
 * (or dust) between each victim and the lookalike, so the lookalike accumulates dust transfers
 * with a crowd of mutually unrelated addresses. An ordinary wallet has none of this. We count the
 * DISTINCT dust counterparties rather than the raw transfer count, so one noisy contract can't
 * trip it.
 */
async function targetDustFingerprint(explorer: string, target: string): Promise<{ senders: number; zeroValue: number } | null> {
  const [txs, toks] = await Promise.all([
    getJson<{ items?: BsTx[] }>(`${explorer}/api/v2/addresses/${encodeURIComponent(target)}/transactions`),
    getJson<{ items?: BsTokenTransfer[] }>(`${explorer}/api/v2/addresses/${encodeURIComponent(target)}/token-transfers`),
  ]);
  // BOTH explorer fetches failed (rate-limited/offline/CORS) → we have NO dust-spray evidence, which is
  // the ONLY poison BLOCK signal for a first-time recipient. Return null (not an empty {0,0}) so the
  // caller can tell "explorer down" apart from "genuinely clean" and refuse to MEMOIZE the verdict.
  if (txs === null && toks === null) return null;
  const t = target.toLowerCase();
  const dustPeers = new Set<string>();
  let zeroValue = 0;

  for (const x of (Array.isArray(txs?.items) ? txs.items : []).slice(0, PAGE)) {
    const from = String(x.from?.hash ?? '').toLowerCase();
    const to = String(x.to?.hash ?? '').toLowerCase();
    if (!from || !to) continue;
    let v = 0n;
    try {
      v = BigInt(x.value ?? '0');
    } catch {
      v = 0n;
    }
    if (v === 0n) zeroValue++;
    if (v < NATIVE_DUST_FLOOR) {
      const peer = from === t ? to : from;
      if (peer && peer !== t) dustPeers.add(peer);
    }
  }
  for (const x of (Array.isArray(toks?.items) ? toks.items : []).slice(0, PAGE)) {
    const from = String(x.from?.hash ?? '').toLowerCase();
    const to = String(x.to?.hash ?? '').toLowerCase();
    if (!from || !to) continue;
    let v = 0n;
    try {
      v = BigInt(x.total?.value ?? '0');
    } catch {
      v = 0n;
    }
    if (v !== 0n) continue; // only zero-value token transfers are unambiguous poisoning shape
    zeroValue++;
    const peer = from === t ? to : from;
    if (peer && peer !== t) dustPeers.add(peer);
  }
  return { senders: dustPeers.size, zeroValue };
}

/**
 * The wallet's TOKEN transfers, normalized. This is where poisoning actually lands: a zero-value
 * `transferFrom` (the ERC-20 standard permits an arbitrary from/to when the value is 0) or a
 * counterfeit token minted purely to emit a Transfer event. A token with no exchange rate is
 * treated as unverified — the counterfeit signal — and a priced token yields a real USD amount
 * so the sub-$10 dust threshold can apply.
 */
async function tokenHistory(explorer: string, me: string): Promise<HistoryTransfer[]> {
  const body = await getJson<{ items?: BsTokenTransfer[] }>(
    `${explorer}/api/v2/addresses/${encodeURIComponent(me)}/token-transfers`,
  );
  if (!body) return [];
  const mine = me.toLowerCase();
  const out: HistoryTransfer[] = [];
  for (const t of (Array.isArray(body.items) ? body.items : []).slice(0, PAGE)) {
    const from = String(t.from?.hash ?? '').toLowerCase();
    const to = String(t.to?.hash ?? '').toLowerCase();
    if (!from || !to) continue;
    const outbound = from === mine;
    const counterparty = outbound ? to : from;
    if (counterparty === mine) continue;
    let valueBase = 0n;
    try {
      valueBase = BigInt(t.total?.value ?? '0');
    } catch {
      valueBase = 0n;
    }
    const rate = Number(t.token?.exchange_rate ?? NaN);
    const decimals = Number(t.total?.decimals ?? NaN);
    const priced = Number.isFinite(rate) && Number.isFinite(decimals);
    const row: HistoryTransfer = {
      counterparty,
      outbound,
      valueBase,
      ...(priced ? { valueUsd: (Number(valueBase) / 10 ** decimals) * rate } : { unverifiedToken: true }),
    };
    out.push(row);
  }
  return out;
}

interface TargetProfile {
  nonce?: number;
  balanceBase?: bigint;
  isContract?: boolean;
}

/** The target's own profile, read trustlessly over RPC (no explorer, no key). */
async function targetProfile(rpcUrl: string, target: string): Promise<TargetProfile> {
  try {
    const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
    const [nonceHex, balanceHex, code] = await Promise.all([
      pool.request<string>('eth_getTransactionCount', [target, 'latest']),
      pool.request<string>('eth_getBalance', [target, 'latest']),
      pool.request<string>('eth_getCode', [target, 'latest']),
    ]);
    return {
      nonce: Number(decodeUint(nonceHex)),
      balanceBase: balanceHex && balanceHex !== '0x' ? decodeUint(balanceHex) : 0n,
      isContract: typeof code === 'string' && code.length > 2,
    };
  } catch {
    return {}; // an unreachable node judges nothing
  }
}

/** Cache verdicts so re-renders and keystrokes don't refetch the same address. */
const cache = new Map<string, Promise<RecipientAssessment>>();

/**
 * Assess a recipient using ONLY on-chain evidence — works on a first-ever send from a fresh
 * install, with no saved contacts and no local send history. Returns `checked: false` when no
 * source answered, so callers can say "couldn't verify" instead of implying safety.
 */
export function assessRecipientLive(opts: { chain: ChainId; me: string; target: string }): Promise<RecipientAssessment> {
  const target = opts.target.trim();
  const me = opts.me.trim();
  if (!/^0x[0-9a-fA-F]{40}$/u.test(target) || !/^0x[0-9a-fA-F]{40}$/u.test(me)) return Promise.resolve(UNKNOWN);
  // Sending to your OWN address can never be poisoning — you can't impersonate yourself. A heavily
  // used wallet (e.g. a dev/deployer address) would otherwise trip the dust-fingerprint on itself.
  if (target.toLowerCase() === me.toLowerCase()) {
    return Promise.resolve({ checked: true, blocked: [], warnings: [], referenceCount: 0 });
  }
  const key = `${opts.chain}:${me.toLowerCase()}:${target.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let explorerAnswered = false;
  const run = (async (): Promise<RecipientAssessment> => {
    const explorer = EXPLORER[opts.chain];
    const rpcUrl = RPC[opts.chain];
    const [native, tokens, profile, fingerprintRaw] = await Promise.all([
      explorer ? nativeHistory(explorer, me) : Promise.resolve<HistoryTransfer[]>([]),
      explorer ? tokenHistory(explorer, me) : Promise.resolve<HistoryTransfer[]>([]),
      rpcUrl ? targetProfile(rpcUrl, target) : Promise.resolve<TargetProfile>({}),
      explorer ? targetDustFingerprint(explorer, target) : Promise.resolve<{ senders: number; zeroValue: number } | null>(null),
    ]);
    // The explorer is the ONLY source of the poison BLOCK signals (dust-spray fingerprint + lookalike
    // history). If it is CONFIGURED but every fetch failed, fingerprintRaw is null → no trustworthy block
    // verdict, so the result must NOT be memoized (see the cache step). No explorer configured ⇒ nothing
    // to wait for, so the RPC-only verdict is stable and cacheable.
    explorerAnswered = !explorer || fingerprintRaw !== null;
    const fingerprint = fingerprintRaw ?? { senders: 0, zeroValue: 0 };
    const history = [...native, ...tokens];
    // "Checked" if ANY provider answered — the RPC (profile) and the explorer (fingerprint) are
    // SEPARATE sources. On a fresh wallet (no local history) with the RPC down but the explorer up,
    // the target's dust-poisoning fingerprint is the ONLY signal — folding it in means a clear
    // poisoner is still blocked (the whole point of "works on a first-ever send"), instead of
    // returning UNKNOWN and waving it through.
    const checked = history.length > 0 || profile.nonce !== undefined || fingerprint.senders > 0 || fingerprint.zeroValue > 0;
    if (!checked) return UNKNOWN;

    const derived = classifyHistoryForPoisoning(target, history);
    const decision = assessRecipientOnChain(target, {
      ...derived,
      ...profile,
      targetDistinctDustSenders: fingerprint.senders,
      targetZeroValueTransfers: fingerprint.zeroValue,
    });
    // The reference set is the union of both directions — that is what a lookalike is measured
    // against, and the UI must report it honestly (0 ⇒ nothing could be compared).
    const referenceCount =
      new Set([
        ...(derived.paidCounterparties ?? []).map((a) => a.toLowerCase()),
        ...(derived.receivedFromCounterparties ?? []).map((a) => a.toLowerCase()),
      ]).size;
    return {
      checked: true,
      blocked: [...decision.blocked],
      warnings: [...decision.warnings],
      referenceCount,
    };
  })();

  // Cache ONLY a TRUSTWORTHY answer. Two cases must NOT be memoized, or a poisoning lookalike/spray is
  // waved through for the whole session even after the source recovers: (1) every source failed
  // (checked:false → sticky UNKNOWN); (2) the EXPLORER — the sole source of the BLOCK signals — didn't
  // answer, so the verdict was computed WITHOUT the dust-spray/lookalike evidence (an explorer 429 at
  // review time while the RPC answers would otherwise pin an empty `blocked` in the cache). In both, drop
  // the entry so the next review re-checks. (The IIFE never rejects — sources are try/caught.)
  void run.then((r) => {
    if (!r.checked || !explorerAnswered) cache.delete(key);
  });
  cache.set(key, run);
  return run;
}
