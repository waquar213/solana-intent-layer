/**
 * eth_simulateV1 result assessment — the deterministic half of the cross-chain-swap SIMULATION gate.
 *
 * Given the synthetic transfer logs a node returns for a simulated route transaction (`traceTransfers`),
 * this computes exactly what the USER's address sends out and REFUSES if the transaction reverts, if the
 * user sends an asset OTHER than the intended source token, or if it sends MORE of it than authorized.
 * That closes the gap the guard can't reach on its own: the route calldata is opaque, but its simulated
 * EFFECT is not. Pure + total — the I/O (the actual eth_simulateV1 call) lives in the app; this only
 * judges the returned result, so it is exhaustively testable and can never itself be an attack surface.
 * Fail-closed: anything it cannot positively verify as safe is refused.
 */

/** eth_simulateV1's synthetic token "address" for NATIVE value moves under traceTransfers. */
export const SIM_NATIVE_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
/** keccak256("Transfer(address,address,uint256)") — the topic0 of every traced transfer. */
const TRANSFER_TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface SimLog {
  readonly address?: string;
  readonly topics?: readonly string[];
  readonly data?: string;
}
/** One simulated call in an eth_simulateV1 block result. */
export interface SimCall {
  readonly status?: string; // '0x1' success, '0x0' revert
  readonly logs?: readonly SimLog[];
}

export interface SourceOutflowPolicy {
  /** The user's address — only transfers FROM this address count as the user's spend. */
  readonly from: string;
  /** The intended source asset: an ERC-20 token address, or SIM_NATIVE_SENTINEL for the native token. */
  readonly sourceAsset: string;
  /** The most of the source asset (base units) the user authorized to leave (input + fee headroom). */
  readonly maxSourceOutBase: bigint;
}

export interface SimVerdict {
  readonly ok: boolean;
  readonly reason?: string;
  /** Per-token totals the user's address sent, for logging/UI. */
  readonly outflows: ReadonlyArray<{ token: string; amountBase: bigint }>;
}

const lc = (s: string | undefined): string => (s ?? '').trim().toLowerCase();
/** The 20-byte address encoded in a 32-byte indexed topic. */
const addrFromTopic = (t: string | undefined): string => `0x${lc(t).replace(/^0x/u, '').slice(-40).padStart(40, '0')}`;

/**
 * Judge a simulated route transaction's effect on the USER's balances. Fail-closed:
 *  1. Any call that reverts (status ≠ 0x1) → refuse (never sign a tx that fails on-chain).
 *  2. The user must send ONLY the intended source asset — a transfer of any OTHER token FROM the user
 *     (e.g. the router draining a pre-existing approval) → refuse.
 *  3. …and no MORE of it than authorized (input + fee headroom) → refuse.
 */
export function assessSimulatedSourceOutflow(calls: readonly SimCall[], policy: SourceOutflowPolicy): SimVerdict {
  for (const c of calls) {
    if (lc(c.status) !== '0x1') return { ok: false, reason: 'the route transaction reverts in simulation — refusing to sign it', outflows: [] };
  }
  const from = lc(policy.from);
  const totals = new Map<string, bigint>();
  for (const c of calls) {
    for (const lg of c.logs ?? []) {
      if (lc(lg.topics?.[0]) !== TRANSFER_TOPIC0) continue;
      if (addrFromTopic(lg.topics?.[1]) !== from) continue; // only what the USER sends out
      const token = lc(lg.address);
      let amt: bigint;
      try {
        amt = BigInt(lg.data ?? '0x0');
      } catch {
        amt = 0n;
      }
      totals.set(token, (totals.get(token) ?? 0n) + amt);
    }
  }
  const outflows = [...totals].map(([token, amountBase]) => ({ token, amountBase }));
  const src = lc(policy.sourceAsset);
  for (const { token, amountBase } of outflows) {
    if (token !== src) {
      return { ok: false, reason: `simulation shows your wallet ALSO sending a different asset (${token}) — refusing this route`, outflows };
    }
    if (amountBase > policy.maxSourceOutBase) {
      return { ok: false, reason: `simulation shows ${amountBase.toString()} of the source asset leaving — more than the ${policy.maxSourceOutBase.toString()} you authorized`, outflows };
    }
  }
  return { ok: true, outflows };
}
