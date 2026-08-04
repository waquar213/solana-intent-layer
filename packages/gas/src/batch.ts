/**
 * Smart-account batching — fold N operations into fewer UserOperations (ERC-4337), so
 * a multi-step intent costs one signature + one bundle instead of N. The engine only
 * DECIDES the grouping (bounded by a max batch size); the actual UserOperation
 * construction + paymaster signing is execution/infra. Pure and deterministic.
 */
import type { BatchPolicy } from './types.js';

export function decideBatch<T>(ops: readonly T[], policy: BatchPolicy): T[][] {
  const size = Math.max(1, Math.floor(policy.maxBatchSize));
  const groups: T[][] = [];
  for (let i = 0; i < ops.length; i += size) groups.push(ops.slice(i, i + size));
  return groups;
}

/** How many UserOperations a set of ops will collapse into, given the batch policy. */
export function batchCount(opCount: number, policy: BatchPolicy): number {
  const size = Math.max(1, Math.floor(policy.maxBatchSize));
  return Math.ceil(Math.max(0, opCount) / size);
}
