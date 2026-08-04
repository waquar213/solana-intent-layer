/**
 * Quant primitives — pure functions over `number[]` (returns / ratios / levels).
 * These are ratio-space, so `number` is correct (see money-vs-ratio rule in
 * types.ts). Every function is total: it defines an answer for the degenerate
 * short-array cases rather than throwing, so callers can compute intelligence
 * over thin history without special-casing.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** Sample variance (n−1 denominator). 0 for fewer than 2 points. */
export function variance(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return acc / (n - 1);
}

export function stdev(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

/**
 * Periodic simple returns from a level series: rₜ = (vₜ − vₜ₋₁) / vₜ₋₁.
 * A zero (or negative) prior level yields a 0 return for that step (can't divide).
 */
export function simpleReturns(levels: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1]!;
    const cur = levels[i]!;
    out.push(prev > 0 ? cur / prev - 1 : 0);
  }
  return out;
}

/** Annualize a per-period volatility: σ_annual = σ_period × √(periodsPerYear). */
export function annualizeVol(periodVol: number, periodsPerYear: number): number {
  return periodVol * Math.sqrt(periodsPerYear);
}

/** Geometrically annualize a mean per-period return: (1 + r̄)^ppy − 1. */
export function annualizeReturn(meanPeriodReturn: number, periodsPerYear: number): number {
  return (1 + meanPeriodReturn) ** periodsPerYear - 1;
}

export interface DrawdownResult {
  /** Largest peak-to-trough decline over the window, [0,1]. */
  maxDrawdown: number;
  /** Decline from the running peak at the final point, [0,1]. */
  currentDrawdown: number;
  peakIndex: number;
  troughIndex: number;
}

/** Max and current drawdown from a level series (running-peak method). */
export function drawdown(levels: number[]): DrawdownResult {
  let peak = levels.length > 0 ? levels[0]! : 0;
  let peakIdx = 0;
  let maxDd = 0;
  let maxPeakIdx = 0;
  let troughIdx = 0;
  for (let i = 0; i < levels.length; i++) {
    const v = levels[i]!;
    if (v > peak) {
      peak = v;
      peakIdx = i;
    }
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > maxDd) {
      maxDd = dd;
      maxPeakIdx = peakIdx;
      troughIdx = i;
    }
  }
  const last = levels.length > 0 ? levels[levels.length - 1]! : 0;
  const currentDd = peak > 0 ? (peak - last) / peak : 0;
  return { maxDrawdown: maxDd, currentDrawdown: currentDd, peakIndex: maxPeakIdx, troughIndex: troughIdx };
}

/** Covariance of two equal-length series (sample, n−1). 0 if misaligned or < 2 points. */
export function covariance(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (xs[i]! - mx) * (ys[i]! - my);
  return acc / (n - 1);
}

/** Pearson correlation coefficient, [−1,1]. 0 when a series is flat or misaligned. */
export function pearson(xs: number[], ys: number[]): number {
  const sx = stdev(xs);
  const sy = stdev(ys);
  if (sx === 0 || sy === 0) return 0;
  return covariance(xs, ys) / (sx * sy);
}

/** Market beta of an asset vs a benchmark: cov(asset, bench) / var(bench). 0 if bench is flat. */
export function beta(assetReturns: number[], benchmarkReturns: number[]): number {
  const vb = variance(benchmarkReturns);
  if (vb === 0) return 0;
  return covariance(assetReturns, benchmarkReturns) / vb;
}

/** Herfindahl-Hirschman Index of a weight vector: Σwᵢ². Weights should sum to ~1; result [0,1]. */
export function hhi(weights: number[]): number {
  let acc = 0;
  for (const w of weights) acc += w * w;
  return acc;
}
