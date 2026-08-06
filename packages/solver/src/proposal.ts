/**
 * Proposal integrity + validation — the security core. A proposal is BELIEVED
 * only after it passes every check: the solver is registered, not banned and
 * staked (anti-Sybil / anti-spam); the content hash matches (anti-tampering);
 * it was submitted before the deadline (sealed window); it DELIVERS the required
 * minimum output; it respects the slippage cap and provider allow/deny lists.
 * Structural validation catches over-claims of shape; the marketplace adds an
 * independent SIMULATION check so a solver cannot over-claim the OUTPUT either.
 */
import type { SolverEnv } from './env.js';
import type { SolveRequest, SolverInfo, SolverProposal, ValidationCheck, ValidationResult } from './types.js';

/** Canonical serialization of a proposal's fields (excluding the hash) for integrity hashing. */
function canonical(p: Omit<SolverProposal, 'hash'>): string {
  return JSON.stringify({
    requestId: p.requestId,
    solverId: p.solverId,
    outMinBase: p.outMinBase,
    feeMicros: p.feeMicros,
    slippageBps: p.slippageBps,
    etaSeconds: p.etaSeconds,
    providers: [...p.providers].sort(),
    confidence: p.confidence,
    fallback: p.fallback,
    legs: p.legs,
    submittedAtIso: p.submittedAtIso,
  });
}

/** Stamp a proposal with its integrity hash. (A real solver signs; the platform recomputes to detect tampering.) */
export function signProposal(proposal: Omit<SolverProposal, 'hash'>, env: SolverEnv): SolverProposal {
  return { ...proposal, hash: env.hash(canonical(proposal)) };
}

export interface ValidationOptions {
  minStakeMicros: bigint;
}

export function validateProposal(
  request: SolveRequest,
  proposal: SolverProposal,
  solver: SolverInfo | null,
  env: SolverEnv,
  options: ValidationOptions,
): ValidationResult {
  const checks: ValidationCheck[] = [];
  const add = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
  };

  // Eligibility — anti-Sybil / anti-spam.
  add('registered', solver !== null, solver ? 'known solver' : 'unknown solver');
  add('not_banned', solver !== null && !solver.banned, solver?.banned ? 'solver is banned' : 'ok');
  add(
    'staked',
    solver !== null && solver.stakeMicros >= options.minStakeMicros,
    `stake vs min ${options.minStakeMicros}`,
  );

  // Integrity — anti-tampering.
  const { hash, ...rest } = proposal;
  add('integrity', hash === env.hash(canonical(rest)), 'content hash matches');

  // Binding to the request.
  add('request_match', proposal.requestId === request.id, 'requestId matches');
  add(
    'within_deadline',
    Date.parse(proposal.submittedAtIso) <= Date.parse(request.deadlineIso),
    'submitted before the deadline',
  );

  // Well-formed amounts. `feeMicros` was never checked, so a malformed value from a competing
  // solver passed validation and reached scoring — where it poisoned every honest proposal's score
  // and threw out of the tie-breaker. A bid whose numbers cannot be read is not a valid bid.
  const wellFormed = (raw: unknown): boolean => {
    if (typeof raw !== 'string' || !/^\d+$/u.test(raw)) return false;
    try {
      return BigInt(raw) >= 0n;
    } catch {
      return false;
    }
  };
  add(
    'well_formed_amounts',
    wellFormed(proposal.feeMicros) && wellFormed(proposal.outMinBase),
    'feeMicros and outMinBase are non-negative integer strings',
  );

  // Delivers the required outcome — the core structural anti-fake check.
  let deliversOk = false;
  try {
    deliversOk = BigInt(proposal.outMinBase) >= BigInt(request.minOutBase);
  } catch {
    deliversOk = false;
  }
  add('delivers_min_out', deliversOk, `outMin ${proposal.outMinBase} vs required ${request.minOutBase}`);
  add(
    'within_slippage',
    proposal.slippageBps <= request.maxSlippageBps,
    `${proposal.slippageBps} vs cap ${request.maxSlippageBps}`,
  );
  // Lower/finite bounds too: a NEGATIVE slippage or a negative/non-finite ETA is nonsensical AND poisons
  // the auction's min/max normalization — one hostile entry (etaSeconds/slippageBps = −1e6) drives every
  // honest proposal's time/slippage sub-score to ~0 and wins on a route it never actually delivers. This is
  // the same range-poisoning already blocked for feeMicros; block it here at the boundary for eta/slippage.
  add('slippage_nonneg', Number.isFinite(proposal.slippageBps) && proposal.slippageBps >= 0, `slippageBps ${proposal.slippageBps}`);
  add('eta_bounded', Number.isFinite(proposal.etaSeconds) && proposal.etaSeconds >= 0, `etaSeconds ${proposal.etaSeconds}`);

  // Provider allow / deny lists.
  const allowed = request.allowedProviders;
  add(
    'allowed_providers',
    !allowed || proposal.providers.every((p) => allowed.includes(p)),
    'only allowed providers used',
  );
  const denied = request.deniedProviders;
  add(
    'no_denied_providers',
    !denied || !proposal.providers.some((p) => denied.includes(p)),
    'no denied providers used',
  );

  add('confidence_range', proposal.confidence >= 0 && proposal.confidence <= 1, 'confidence in [0,1]');
  add('has_legs', proposal.legs.length > 0, 'has route legs');

  return { valid: checks.every((c) => c.ok), checks };
}
