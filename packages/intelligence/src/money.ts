/**
 * Money + ratio helpers. Money math is reused wholesale from
 * @intent-wallet/portfolio (integer µUSD, no floats). This module adds the
 * dimensionless-ratio helpers the analytics need — see the money-vs-ratio rule
 * at the top of `types.ts`: a ratio is a `number` on purpose.
 */
export { usdToMicros, assetValueMicros, formatUsd, scaleAmount, MICRO, MoneyError } from '@intent-wallet/portfolio';

/** µUSD → a Number of whole USD, for ratio-space statistics only (never for value storage). */
export function microsToUsd(micros: bigint): number {
  return Number(micros) / 1_000_000;
}

/** part ÷ whole as a ratio in [0,1]-ish; 0 when whole is 0. Safe for weights (magnitudes, not precision). */
export function ratio(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number(part) / Number(whole);
}

/** Round a ratio/score to `dp` decimal places (presentation of a dimensionless number). */
export function round(x: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

/** Clamp to [lo,hi]. `Math.min(hi, Math.max(lo, NaN))` is NaN — the comparison never clamps —
 *  so a non-finite input folds to `lo` instead of leaking NaN into a projection. */
export function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

/** Whole days between two ISO timestamps (b − a), floored. Deterministic (parses given strings). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.floor(ms / 86_400_000);
}
