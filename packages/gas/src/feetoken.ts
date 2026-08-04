/**
 * Fee-token selection — let a user pay gas in USDC (or any held token) instead of the
 * native asset. Given the gas cost in µUSD and the user's tokens, pick the preferred
 * token that can cover gas + a safety margin, and compute the exact base-unit amount.
 * Preference order (a token's `rank`, then input order) lets a deployment put
 * stablecoins first. Pure integer math; rounds UP so the paymaster is never short.
 */
import type { FeeTokenChoice, FeeTokenOption } from './types.js';

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

export function selectFeeToken(
  gasCostMicros: bigint,
  options: readonly FeeTokenOption[],
  marginBps = 100,
): FeeTokenChoice | null {
  if (gasCostMicros <= 0n) return null;
  // gas + margin (default +1%), so a small price move between quote and execution doesn't underpay.
  const needMicros = (gasCostMicros * BigInt(10_000 + Math.max(0, marginBps))) / 10_000n;

  const ranked = [...options].map((t, i) => ({ t, i })).sort((a, b) => (a.t.rank ?? a.i) - (b.t.rank ?? b.i));

  for (const { t } of ranked) {
    if (t.priceMicros <= 0n) continue;
    // amountBase = ceil(needMicros × 10^decimals / priceMicros)
    const amountBase = ceilDiv(needMicros * 10n ** BigInt(t.decimals), t.priceMicros);
    if (amountBase <= t.balanceBase) {
      const valueMicros = (amountBase * t.priceMicros) / 10n ** BigInt(t.decimals);
      return { symbol: t.symbol, amountBase, valueMicros };
    }
  }
  return null; // no held token can cover gas
}
