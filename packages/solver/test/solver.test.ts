import { describe, expect, it } from 'vitest';
import {
  computeReward,
  computeSlash,
  createSolverNetwork,
  createTestEnv,
  ScriptedSolver,
  signProposal,
  type SolveRequest,
  type SolverProposal,
  scoreProposals,
  selectWinner,
} from '../src/index.js';

const env = createTestEnv();

function request(over: Partial<SolveRequest> = {}): SolveRequest {
  return {
    id: 'req-1',
    principalId: 'user-1',
    fromAsset: 'ETH',
    toAsset: 'USDC',
    amountInBase: '1000000000000000000',
    fromDecimals: 18,
    toDecimals: 6,
    minOutBase: '1900000000', // require ≥ 1900 USDC
    maxSlippageBps: 100,
    fromChain: 'ethereum',
    toChain: 'ethereum',
    deadlineIso: '2026-01-01T01:00:00.000Z',
    ...over,
  };
}

function proposal(solverId: string, over: Partial<Omit<SolverProposal, 'hash'>> = {}): SolverProposal {
  return signProposal(
    {
      requestId: 'req-1',
      solverId,
      outMinBase: '2000000000',
      feeMicros: '100000',
      slippageBps: 30,
      etaSeconds: 30,
      providers: ['0x'],
      confidence: 0.9,
      fallback: 'park on the source chain',
      legs: [{ kind: 'swap', chainId: 'ethereum', venue: '0x', description: 'swap ETH→USDC' }],
      submittedAtIso: '2026-01-01T00:30:00.000Z',
      ...over,
    },
    env,
  );
}

describe('SolverNetwork — competitive selection', () => {
  it('selects the cheapest + fastest valid proposal', async () => {
    const net = createSolverNetwork({ env });
    net.register({ id: 'A', stakeMicros: 1_000_000n, banned: false });
    net.register({ id: 'B', stakeMicros: 1_000_000n, banned: false });
    const out = await net.solve(request(), [
      new ScriptedSolver('A', () => proposal('A', { feeMicros: '200000', etaSeconds: 60 })),
      new ScriptedSolver('B', () => proposal('B', { feeMicros: '100000', etaSeconds: 20 })),
    ]);
    expect(out.winner?.solverId).toBe('B');
  });

  it('is deterministic regardless of proposal order', async () => {
    const net = createSolverNetwork({ env });
    net.register({ id: 'A', stakeMicros: 1_000_000n, banned: false });
    net.register({ id: 'B', stakeMicros: 1_000_000n, banned: false });
    const a = new ScriptedSolver('A', () => proposal('A', { feeMicros: '200000' }));
    const b = new ScriptedSolver('B', () => proposal('B', { feeMicros: '100000' }));
    const w1 = (await net.solve(request(), [a, b])).winner?.solverId;
    const w2 = (await net.solve(request(), [b, a])).winner?.solverId;
    expect(w1).toBe(w2);
  });
});

describe('SolverNetwork — security (claims are verified, not trusted)', () => {
  it('catches an over-claimed output by simulation, rejects it, and slashes the solver', async () => {
    const net = createSolverNetwork({ env, simulator: { simulate: () => Promise.resolve({ outBase: '1950000000' }) } });
    net.register({ id: 'liar', stakeMicros: 1_000_000n, banned: false });
    net.register({ id: 'honest', stakeMicros: 1_000_000n, banned: false });
    const out = await net.solve(request(), [
      new ScriptedSolver('liar', () => proposal('liar', { outMinBase: '2100000000' })), // claims 2100, reality 1950
      new ScriptedSolver('honest', () => proposal('honest', { outMinBase: '1950000000', feeMicros: '150000' })),
    ]);
    expect(out.winner?.solverId).toBe('honest');
    const liar = out.evaluations.find((e) => e.proposal.solverId === 'liar');
    expect(liar?.validation.valid).toBe(false);
    expect(net.registry.info('liar')!.stakeMicros).toBeLessThan(1_000_000n); // slashed for the over-claim
  });

  it('rejects a proposal that poisons the auction with a negative ETA/slippage; the honest route still wins', async () => {
    const net = createSolverNetwork({ env });
    net.register({ id: 'evil', stakeMicros: 1_000_000n, banned: false });
    net.register({ id: 'honest', stakeMicros: 1_000_000n, banned: false });
    const out = await net.solve(request(), [
      // Unfiltered, this hostile entry (impossible eta/slippage) would drive every honest proposal's
      // time + slippage sub-score to ~0 via the min/max normalization and win a route it can't deliver.
      new ScriptedSolver('evil', () => proposal('evil', { etaSeconds: -1_000_000, slippageBps: -1_000_000 })),
      new ScriptedSolver('honest', () => proposal('honest', { etaSeconds: 30, slippageBps: 30 })),
    ]);
    const evil = out.evaluations.find((e) => e.proposal.solverId === 'evil');
    expect(evil?.validation.valid).toBe(false); // rejected at the validation boundary
    expect(out.winner?.solverId).toBe('honest'); // honest route wins — the auction is not poisoned
  });

  it('excludes an under-staked solver (anti-Sybil / anti-spam)', async () => {
    const net = createSolverNetwork({ env, options: { minStakeMicros: 500_000n } });
    net.register({ id: 'poor', stakeMicros: 0n, banned: false });
    const out = await net.solve(request(), [new ScriptedSolver('poor', () => proposal('poor'))]);
    expect(out.winner).toBeNull();
    expect(out.reason).toMatch(/no valid proposal/);
  });

  it('rejects a tampered proposal (content hash mismatch)', async () => {
    const net = createSolverNetwork({ env });
    net.register({ id: 'A', stakeMicros: 1_000_000n, banned: false });
    const tampered = proposal('A');
    tampered.feeMicros = '1'; // mutate AFTER signing → hash no longer matches
    const out = await net.solve(request(), [new ScriptedSolver('A', () => tampered)]);
    expect(out.winner).toBeNull();
    expect(out.evaluations[0]!.validation.checks.find((c) => c.name === 'integrity')?.ok).toBe(false);
  });

  it('rejects a proposal that under-delivers the required output', async () => {
    const net = createSolverNetwork({ env });
    net.register({ id: 'A', stakeMicros: 1_000_000n, banned: false });
    const out = await net.solve(request(), [
      new ScriptedSolver('A', () => proposal('A', { outMinBase: '1000000000' })),
    ]);
    expect(out.winner).toBeNull();
  });
});

describe('SolverNetwork — reputation breaks close calls', () => {
  it('prefers the higher-reputation solver when proposals are otherwise identical', async () => {
    const net = createSolverNetwork({ env });
    net.register({ id: 'proven', stakeMicros: 1_000_000n, banned: false });
    net.register({ id: 'newbie', stakeMicros: 1_000_000n, banned: false });
    for (let i = 0; i < 10; i++) net.reportSettlement('proven', { success: true, latencyMs: 50 });
    const out = await net.solve(request(), [
      new ScriptedSolver('proven', () => proposal('proven')),
      new ScriptedSolver('newbie', () => proposal('newbie')),
    ]);
    expect(out.winner?.solverId).toBe('proven');
  });
});

describe('incentives', () => {
  it('rewards a solver a share of the savings it delivered', () => {
    const r = computeReward(proposal('A', { feeMicros: '100000' }), 200_000n, 1000);
    expect(r.amountMicros).toBe(10_000n); // 10% of the 100k savings
  });
  it('slashes proportionally to severity', () => {
    expect(computeSlash('A', 1_000_000n, 'timeout').amountMicros).toBe(50_000n); // 5%
    expect(computeSlash('A', 1_000_000n, 'malicious').amountMicros).toBe(500_000n); // 50%
  });
});

describe('solver auction — a hostile proposal cannot crash or scramble it', () => {
  // `feeMicros` is supplied by third-party solvers competing in the marketplace, so it is
  // ADVERSARIAL input. A malformed value used to (a) make feeMin/feeMax NaN, poisoning every
  // HONEST solver's score too, and (b) throw SyntaxError from BigInt() in the tie-breaker.
  const proposal = (solverId: string, feeMicros: string): SolverProposal =>
    ({
      solverId,
      requestId: 'r1',
      intentId: 'i1',
      feeMicros,
      etaSeconds: 30,
      slippageBps: 10,
      confidence: 0.9,
      outMinBase: '1000',
      outputBase: '1000',
      providers: [],
      submittedAtIso: new Date(0).toISOString(),
      hash: 'x',
    }) as unknown as SolverProposal;

  it('one malformed fee does not poison the honest solvers scores', () => {
    const scored = scoreProposals([proposal('honest', '100'), proposal('evil', 'abc'), proposal('other', '900')], () => 0.5);
    const honest = scored.find((s) => s.proposal.solverId === 'honest');
    expect(Number.isFinite(honest?.score ?? NaN), `honest score=${honest?.score}`).toBe(true);
    expect(scored.every((s) => Number.isFinite(s.score))).toBe(true);
  });

  it('a malformed fee scores WORST on cost, never best', () => {
    const scored = scoreProposals([proposal('honest', '100'), proposal('evil', 'abc')], () => 0.5);
    const evil = scored.find((s) => s.proposal.solverId === 'evil');
    const honest = scored.find((s) => s.proposal.solverId === 'honest');
    expect((evil?.score ?? 1) < (honest?.score ?? 0)).toBe(true);
  });

  it('selectWinner does not THROW on a malformed fee in the tie-breaker', () => {
    const ev = [
      { proposal: proposal('evil', 'abc'), score: 1, validation: { valid: true, checks: [] } },
      { proposal: proposal('honest', '100'), score: 1, validation: { valid: true, checks: [] } },
    ] as unknown as Parameters<typeof selectWinner>[0];
    expect(() => selectWinner(ev)).not.toThrow();
    expect(selectWinner(ev)?.solverId).toBe('honest'); // the well-formed, cheaper bid wins the tie
  });
});

describe('proposal validation — a malformed bid never wins the auction', () => {
  it('excludes a solver whose feeMicros is not a non-negative integer string', async () => {
    // Root fix: such a bid is rejected at the validation gate, so it never reaches scoring. The
    // scoring/tie-break hardening is defence in depth behind this.
    const net = createSolverNetwork({ env });
    net.register({ id: 'EVIL', stakeMicros: 1_000_000n, banned: false });
    net.register({ id: 'HONEST', stakeMicros: 1_000_000n, banned: false });
    const out = await net.solve(request(), [
      new ScriptedSolver('EVIL', () => proposal('EVIL', { feeMicros: 'abc' } as never)),
      new ScriptedSolver('HONEST', () => proposal('HONEST', { feeMicros: '100000' })),
    ]);
    expect(out.winner?.solverId).toBe('HONEST');
    const evil = out.evaluations.find((e) => e.proposal.solverId === 'EVIL');
    expect(evil?.validation.valid).toBe(false);
    expect(evil?.validation.checks.find((c) => c.name === 'well_formed_amounts')?.ok).toBe(false);
  });

  it('accepts a well-formed fee', async () => {
    const net = createSolverNetwork({ env });
    net.register({ id: 'HONEST', stakeMicros: 1_000_000n, banned: false });
    const out = await net.solve(request(), [new ScriptedSolver('HONEST', () => proposal('HONEST', { feeMicros: '100000' }))]);
    const ok = out.evaluations.find((e) => e.proposal.solverId === 'HONEST');
    expect(ok?.validation.checks.find((c) => c.name === 'well_formed_amounts')?.ok).toBe(true);
  });
});
