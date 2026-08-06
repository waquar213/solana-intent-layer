/**
 * Risk profile + the Portfolio Health Score — the "how exposed am I" view.
 *
 * Diversification is measured two ways, best-available:
 *  - CORRELATION basis (preferred): the diversification ratio
 *    DR = (Σ wᵢσᵢ) / σ_portfolio, where σ_portfolio = √(wᵀ Σ w) uses the real
 *    correlation matrix. Two assets that move together are NOT diversified even
 *    at different weights — only correlation captures that. Needs per-asset
 *    return series covering the book.
 *  - WEIGHTS basis (fallback): effective number of positions from the HHI.
 *
 * The Health Score is a transparent weighted blend of independent factors
 * (diversification, leverage safety, liquidity, stable buffer, stability,
 * drawdown resilience). Every factor is returned with its own score, weight and
 * a one-line reason, so a health number is always explainable — never a black box.
 */
import { pearson, stdev } from './stats.js';
import { clamp, ratio, round } from './money.js';
import type { Allocation, AssetReturnSeries, Concentration, HealthFactor, Performance, RiskProfile } from './types.js';
import type { NormalizedPortfolio } from './positions.js';

export interface HealthWeights {
  diversification: number;
  leverageSafety: number;
  liquidityHealth: number;
  stablecoinBuffer: number;
  stability: number;
  drawdownResilience: number;
}

export interface RiskParams {
  /** Leverage (debt/gross) at which leverage-safety hits zero. Default 0.5. */
  targetMaxLeverage: number;
  /** Stablecoin buffer (share of gross) that earns a full buffer score. Default 0.1. */
  targetStableBuffer: number;
  /** Annualized volatility at which the stability score hits zero. Default 1.2. */
  volCeiling: number;
  weights: HealthWeights;
}

export const DEFAULT_RISK_PARAMS: RiskParams = {
  targetMaxLeverage: 0.5,
  targetStableBuffer: 0.1,
  volCeiling: 1.2,
  weights: {
    diversification: 0.25,
    leverageSafety: 0.2,
    liquidityHealth: 0.15,
    stablecoinBuffer: 0.1,
    stability: 0.15,
    drawdownResilience: 0.15,
  },
};

interface Diversification {
  score: number; // [0,100]
  basis: 'weights' | 'correlation';
}

function correlationDiversification(
  byAssetWeights: { key: string; weight: number }[],
  assetReturns: AssetReturnSeries[],
): Diversification | null {
  const bySymbol = new Map(assetReturns.map((s) => [s.symbol.toUpperCase(), s.returns]));
  // Correlation basis is only honest if every material asset (≥1%) is covered.
  const material = byAssetWeights.filter((a) => a.weight >= 0.01);
  const covered = material.filter((a) => {
    const r = bySymbol.get(a.key.toUpperCase());
    return r !== undefined && r.length >= 2;
  });
  if (covered.length < 2 || covered.length !== material.length) return null;

  const sigmas = covered.map((a) => stdev(bySymbol.get(a.key.toUpperCase())!));
  const weights = covered.map((a) => a.weight);
  // σ_portfolio² = ΣΣ wᵢwⱼ ρᵢⱼ σᵢσⱼ  (ρ=1 on the diagonal)
  let varP = 0;
  for (let i = 0; i < covered.length; i++) {
    for (let j = 0; j < covered.length; j++) {
      const rho =
        i === j
          ? 1
          : pearson(bySymbol.get(covered[i]!.key.toUpperCase())!, bySymbol.get(covered[j]!.key.toUpperCase())!);
      varP += weights[i]! * weights[j]! * rho * sigmas[i]! * sigmas[j]!;
    }
  }
  const sigmaP = Math.sqrt(Math.max(0, varP));
  if (sigmaP === 0) return null;
  const weightedAvgSigma = weights.reduce((sum, w, i) => sum + w * sigmas[i]!, 0);
  const dr = weightedAvgSigma / sigmaP; // ≥ 1; = √N for N equal, uncorrelated assets
  const n = covered.length;
  const score = clamp((dr - 1) / (Math.sqrt(n) - 1), 0, 1) * 100;
  return { score, basis: 'correlation' };
}

function weightsDiversification(assetCount: number, effectivePositions: number): Diversification {
  if (assetCount < 2) return { score: 0, basis: 'weights' };
  const score = clamp((effectivePositions - 1) / (assetCount - 1), 0, 1) * 100;
  return { score, basis: 'weights' };
}

export function computeRisk(
  np: NormalizedPortfolio,
  allocation: Allocation,
  concentration: Concentration,
  performance: Performance,
  assetReturns: AssetReturnSeries[] = [],
  params: RiskParams = DEFAULT_RISK_PARAMS,
): RiskProfile {
  const gross = np.grossAssetsMicros;

  // Diversification: correlation basis when the book is covered, else weights.
  const assetCount = allocation.byAsset.filter((a) => a.weight > 0).length;
  const div =
    correlationDiversification(allocation.byAsset, assetReturns) ??
    weightsDiversification(assetCount, concentration.effectivePositions);

  // Liquidity split.
  const liquidWeight = allocation.byLiquidity.find((s) => s.key === 'liquid')?.weight ?? 0;
  const lockedWeight = allocation.byLiquidity.find((s) => s.key === 'locked')?.weight ?? 0;
  const illiquidWeight = allocation.byLiquidity.find((s) => s.key === 'illiquid')?.weight ?? 0;

  // ratio() returns 0 when the denominator is 0 (correct for weights) — but for LEVERAGE that MASKS an
  // insolvent book (debt against ZERO visible gross assets, e.g. collateral on an unsupported chain) as
  // "no leverage / perfectly safe". Fail closed: zero gross with positive debt is maximal leverage, so the
  // leverageSafety factor floors to 0 and HIGH_LEVERAGE fires (critical) instead of a false all-clear.
  const leverage =
    gross === 0n ? (np.debtMicros > 0n ? Math.max(params.targetMaxLeverage, 1) * 4 : 0) : ratio(np.debtMicros, gross);

  let bridged = 0n;
  for (const p of np.positions) {
    if (p.kind === 'borrowing') continue;
    if (p.bridge !== undefined) bridged += p.valueMicros;
  }
  const bridgeExposure = ratio(bridged, gross);

  // --- Health factors, each [0,100]; only include history-based ones when we have history. ---
  const w = params.weights;
  const raw: { key: string; score: number; weight: number; detail: string }[] = [
    {
      key: 'diversification',
      score: div.score,
      weight: w.diversification,
      detail: `${div.basis}-basis diversification, ${assetCount} assets`,
    },
    {
      key: 'leverageSafety',
      score: clamp(1 - leverage / params.targetMaxLeverage, 0, 1) * 100,
      weight: w.leverageSafety,
      detail: `leverage ${round(leverage, 2)} vs target ${params.targetMaxLeverage}`,
    },
    {
      key: 'liquidityHealth',
      score: liquidWeight * 100,
      weight: w.liquidityHealth,
      detail: `${round(liquidWeight * 100, 1)}% of assets liquid`,
    },
    {
      key: 'stablecoinBuffer',
      score: clamp(allocation.stablecoinWeight / params.targetStableBuffer, 0, 1) * 100,
      weight: w.stablecoinBuffer,
      detail: `${round(allocation.stablecoinWeight * 100, 1)}% stable buffer vs target ${round(params.targetStableBuffer * 100, 0)}%`,
    },
  ];
  if (performance.volatilityAnnual !== null) {
    raw.push({
      key: 'stability',
      score: clamp(1 - performance.volatilityAnnual / params.volCeiling, 0, 1) * 100,
      weight: w.stability,
      detail: `annual volatility ${round(performance.volatilityAnnual, 2)}`,
    });
  }
  if (performance.currentDrawdown !== null) {
    raw.push({
      key: 'drawdownResilience',
      score: (1 - performance.currentDrawdown) * 100,
      weight: w.drawdownResilience,
      detail: `current drawdown ${round(performance.currentDrawdown * 100, 1)}%`,
    });
  }

  // Re-normalize the weights of the factors actually present, so a missing
  // history factor doesn't silently deflate the score.
  const totalWeight = raw.reduce((sum, f) => sum + f.weight, 0);
  const healthFactors: HealthFactor[] = raw.map((f) => ({
    key: f.key,
    score: round(f.score, 2),
    weight: totalWeight > 0 ? round(f.weight / totalWeight, 4) : 0,
    detail: f.detail,
  }));
  const healthScore = round(
    healthFactors.reduce((sum, f) => sum + f.score * f.weight, 0),
    2,
  );

  return {
    diversificationScore: round(div.score, 2),
    diversificationBasis: div.basis,
    liquidWeight: round(liquidWeight, 4),
    lockedWeight: round(lockedWeight, 4),
    illiquidWeight: round(illiquidWeight, 4),
    leverage: round(leverage, 4),
    bridgeExposure: round(bridgeExposure, 4),
    healthScore,
    healthFactors,
  };
}
