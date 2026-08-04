/**
 * EIP-1559 gas parameters, BOUNDED. The priority fee scales with the chosen speed;
 * maxFeePerGas covers a base-fee doubling plus the priority tip — the standard safe
 * formula. Both are then clamped to hard caps, so during a fee spike the wallet never
 * silently overpays past what the user/deployment allowed. Pure bigint math.
 */
import type { FeeBasis, GasCaps, GasParams, GasSpeed } from './types.js';

/** Priority multiplier (percent) per speed. */
const SPEED_PCT: Record<GasSpeed, bigint> = { slow: 100n, normal: 150n, fast: 200n };

export function computeGasParams(basis: FeeBasis, speed: GasSpeed, caps: GasCaps): GasParams {
  let bounded = false;

  let maxPriority = (bigMax(0n, basis.priorityFeePerGas) * SPEED_PCT[speed]) / 100n;
  if (maxPriority > caps.maxPriorityFeePerGasCap) {
    maxPriority = caps.maxPriorityFeePerGasCap;
    bounded = true;
  }

  // Cover a base-fee doubling (EIP-1559 can rise ~12.5%/block) plus the tip.
  let maxFee = bigMax(0n, basis.baseFeePerGas) * 2n + maxPriority;
  if (maxFee > caps.maxFeePerGasCap) {
    maxFee = caps.maxFeePerGasCap;
    bounded = true;
  }

  // Invariant: maxFeePerGas must be >= maxPriorityFeePerGas.
  if (maxPriority > maxFee) maxPriority = maxFee;

  return { maxFeePerGas: maxFee, maxPriorityFeePerGas: maxPriority, bounded };
}

const bigMax = (a: bigint, b: bigint): bigint => (a > b ? a : b);
