/**
 * Solver registry — who is allowed to compete, and their stake. Staking gates
 * eligibility (a Sybil would need real capital per identity) and is the pool
 * that slashing draws from. Ban removes a solver entirely.
 */
import type { SolverInfo } from './types.js';

export interface SolverRegistry {
  info(solverId: string): SolverInfo | null;
  register(info: SolverInfo): void;
  ban(solverId: string): void;
  /** Reduce a solver's stake (slashing); bans it if stake hits zero. */
  slash(solverId: string, amountMicros: bigint): void;
  all(): SolverInfo[];
}

export class InMemorySolverRegistry implements SolverRegistry {
  private readonly solvers = new Map<string, SolverInfo>();

  info(solverId: string): SolverInfo | null {
    const s = this.solvers.get(solverId);
    return s ? { ...s } : null;
  }
  register(info: SolverInfo): void {
    this.solvers.set(info.id, { ...info });
  }
  ban(solverId: string): void {
    const s = this.solvers.get(solverId);
    if (s) s.banned = true;
  }
  slash(solverId: string, amountMicros: bigint): void {
    const s = this.solvers.get(solverId);
    if (!s) return;
    s.stakeMicros = s.stakeMicros > amountMicros ? s.stakeMicros - amountMicros : 0n;
    if (s.stakeMicros === 0n) s.banned = true;
  }
  all(): SolverInfo[] {
    return [...this.solvers.values()].map((s) => ({ ...s }));
  }
}
