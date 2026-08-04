/**
 * Incentives — rewards for good execution, slashing for bad. A winning solver
 * earns a share of the cost SAVINGS it delivered vs a baseline (aligning solver
 * profit with user benefit). Misbehavior slashes a fraction of stake, scaled to
 * severity: a timeout is cheap, an invalid proposal costlier, malicious behavior
 * (an over-claim caught by simulation) the most expensive. This is the economic
 * model; the on-chain token/stake mechanics are a protocol-layer concern.
 */
import type { Reward, Slash, SlashReason, SolverProposal } from './types.js';

/** Reward = `shareBps` of the savings (baseline fee − proposal fee), or 0 if it wasn't cheaper. */
export function computeReward(winner: SolverProposal, baselineFeeMicros: bigint, shareBps = 1000): Reward {
  const savings = baselineFeeMicros - BigInt(winner.feeMicros);
  const amountMicros = savings > 0n ? (savings * BigInt(shareBps)) / 10_000n : 0n;
  return { solverId: winner.solverId, amountMicros };
}

const SLASH_BPS: Record<SlashReason, bigint> = {
  timeout: 500n, // 5% — reneged after winning
  invalid_proposal: 1000n, // 10% — wasted the marketplace's time
  malicious: 5000n, // 50% — over-claimed / caught lying by simulation
};

/** Slash a fraction of stake, scaled to severity. */
export function computeSlash(solverId: string, stakeMicros: bigint, reason: SlashReason): Slash {
  const amountMicros = (stakeMicros * SLASH_BPS[reason]) / 10_000n;
  return { solverId, amountMicros, reason };
}
