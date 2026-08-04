/**
 * Cumulative session-drain guard — a faithful port of the web app's guard (assessSessionDrain in
 * apps/web/src/broadcast.ts + the SESSION_OUTFLOW ledger in apps/web/src/App.tsx). It tracks the outflow
 * this session keyed by ACCOUNT:chain:asset so a drain SPLIT across the Send sheet AND the AI-chat (or run
 * entirely through Auto-mode sends) is caught on whichever send crosses the line. Cleared on lock (a new
 * session). Keyed by the active account so one account's sends never count against another's balance.
 *
 * Mobile previously had NO cumulative-drain guard (web-only), so a multi-send wallet-drain that web blocks
 * would execute on mobile — worst in Auto mode, where there is no per-tx tap. This closes that parity gap.
 */
import { activeAccountIndex } from './wallet';

/**
 * Decide whether this send crosses the cumulative session-drain line:
 *   - 'block' — the session's cumulative outflow reaches the drain line (>= 90% of balance) AND something
 *     already left this session (priorBase > 0): the multi-send drain pattern.
 *   - 'warn'  — a single first send that is itself most of the wallet (the user's own visible choice).
 *   - 'none'  — under the line, or balance unknown.
 * Over-counting is fail-safe: it can only make the guard stricter, never looser.
 */
export function assessSessionDrain(args: {
  priorBase: bigint;
  amountBase: bigint;
  balanceBase: bigint | null;
}): 'block' | 'warn' | 'none' {
  const { priorBase, amountBase, balanceBase } = args;
  if (balanceBase === null || balanceBase <= 0n) return 'none';
  if (amountBase < 0n || priorBase < 0n) return 'none';
  const cumulative = priorBase + amountBase;
  const drainLine = (balanceBase * 9n) / 10n; // 90% of the wallet
  if (cumulative < drainLine) return 'none';
  return priorBase > 0n ? 'block' : 'warn';
}

const SESSION_OUTFLOW = new Map<string, bigint>();
const outflowKey = (chain: string, asset: string): string => {
  // Normalize the Bitcoin display symbol so the Send sheet ('tBTC') and the AI-chat ('BTC') feed ONE
  // bucket; other symbols are already canonical uppercase, so the upper-case is a harmless no-op that also
  // guards against casing drift. `chain` keeps same-symbol assets on different chains distinct.
  const a = asset.toUpperCase() === 'TBTC' ? 'BTC' : asset.toUpperCase();
  return `${activeAccountIndex()}:${chain}:${a}`;
};
export const priorOutflow = (chain: string, asset: string): bigint => SESSION_OUTFLOW.get(outflowKey(chain, asset)) ?? 0n;
export const recordOutflow = (chain: string, asset: string, base: bigint): void => {
  const k = outflowKey(chain, asset);
  SESSION_OUTFLOW.set(k, (SESSION_OUTFLOW.get(k) ?? 0n) + base);
};
/** Clear the ledger — call on lock, so a fresh session starts from zero. */
export const clearSessionOutflow = (): void => SESSION_OUTFLOW.clear();
