import { describe, expect, it } from 'vitest';
import {
  batchCount,
  computeGasParams,
  createGasEngine,
  createTestEnv,
  decideBatch,
  decideSponsorship,
  emptySponsorshipState,
  selectFeeToken,
  type FeeTokenOption,
  type GasCaps,
  type SponsorshipPolicy,
  type SponsorshipState,
} from '../src/index.js';

const NOW = '2026-01-01T00:00:00.000Z';
const policy: SponsorshipPolicy = { enabled: true, perTxCapMicros: 500_000n, dailyCapMicros: 2_000_000n };
const caps: GasCaps = { maxFeePerGasCap: 100_000_000_000n, maxPriorityFeePerGasCap: 5_000_000_000n };
const USDC: FeeTokenOption = {
  symbol: 'USDC',
  decimals: 6,
  priceMicros: 1_000_000n,
  balanceBase: 10_000_000n,
  rank: 0,
};
const ETH: FeeTokenOption = {
  symbol: 'ETH',
  decimals: 18,
  priceMicros: 2_000_000_000n,
  balanceBase: 10n ** 18n,
  rank: 1,
};

describe('sponsorship — bounded, fails toward user_pays', () => {
  const req = (over = {}) => ({ userId: 'u1', action: 'transfer', gasCostMicros: 300_000n, ...over });

  it('sponsors within the per-tx and daily budget', () => {
    const d = decideSponsorship(req(), policy, emptySponsorshipState(), NOW);
    expect(d.verdict).toBe('sponsor');
    expect(d.sponsoredMicros).toBe(300_000n);
  });

  it('user_pays when the gas cost exceeds the per-tx cap', () => {
    expect(decideSponsorship(req({ gasCostMicros: 600_000n }), policy, emptySponsorshipState(), NOW).verdict).toBe(
      'user_pays',
    );
  });

  it('user_pays when the daily budget is exhausted', () => {
    const state: SponsorshipState = { day: '2026-01-01', spentByUser: { u1: 1_900_000n } };
    expect(decideSponsorship(req(), policy, state, NOW).verdict).toBe('user_pays'); // 1.9M + 0.3M > 2M
  });

  it('user_pays when disabled or the action is ineligible', () => {
    expect(decideSponsorship(req(), { ...policy, enabled: false }, emptySponsorshipState(), NOW).verdict).toBe(
      'user_pays',
    );
    expect(
      decideSponsorship(req(), { ...policy, eligibleActions: ['swap'] }, emptySponsorshipState(), NOW).verdict,
    ).toBe('user_pays');
  });
});

describe('fee-token selection', () => {
  it('selects the covering token, rounded up, respecting rank', () => {
    const c = selectFeeToken(300_000n, [USDC, ETH]);
    expect(c?.symbol).toBe('USDC'); // rank 0
    expect(c?.amountBase).toBe(303_000n); // 0.303 USDC = gas $0.30 + 1% margin
  });

  it('honours rank order (a lower-rank token wins even if listed later)', () => {
    const c = selectFeeToken(300_000n, [
      { ...USDC, rank: 1 },
      { ...ETH, rank: 0 },
    ]);
    expect(c?.symbol).toBe('ETH');
  });

  it('returns null when no held token can cover gas', () => {
    expect(selectFeeToken(300_000n, [{ ...USDC, balanceBase: 100n }])).toBeNull();
  });
});

describe('bounded EIP-1559 params', () => {
  const basis = { baseFeePerGas: 20_000_000_000n, priorityFeePerGas: 1_000_000_000n };

  it('scales priority by speed and covers a base-fee doubling', () => {
    const p = computeGasParams(basis, 'fast', caps);
    expect(p.maxPriorityFeePerGas).toBe(2_000_000_000n); // 1 gwei × 200%
    expect(p.maxFeePerGas).toBe(42_000_000_000n); // 20×2 + 2 gwei
    expect(p.bounded).toBe(false);
  });

  it('clamps to the cap during a fee spike (never overpays)', () => {
    const p = computeGasParams({ baseFeePerGas: 60_000_000_000n, priorityFeePerGas: 1_000_000_000n }, 'fast', caps);
    expect(p.maxFeePerGas).toBe(100_000_000_000n); // capped from 122 gwei
    expect(p.bounded).toBe(true);
    expect(p.maxFeePerGas >= p.maxPriorityFeePerGas).toBe(true); // invariant
  });
});

describe('smart-account batching', () => {
  it('groups ops by the bounded batch size', () => {
    expect(decideBatch([1, 2, 3, 4, 5], { maxBatchSize: 2 })).toEqual([[1, 2], [3, 4], [5]]);
    expect(batchCount(5, { maxBatchSize: 2 })).toBe(3);
  });
});

describe('GasEngine — one call: sponsor → fee-token → bounded params', () => {
  it('sponsors while the budget lasts, then flips to user_pays with a fee token', () => {
    const engine = createGasEngine({
      env: createTestEnv(NOW),
      sponsorship: { enabled: true, perTxCapMicros: 500_000n, dailyCapMicros: 400_000n }, // room for one
      caps,
    });
    const base = {
      basis: { baseFeePerGas: 20_000_000_000n, priorityFeePerGas: 1_000_000_000n },
      speed: 'normal' as const,
      feeTokens: [USDC],
    };

    const first = engine.quote({ userId: 'u1', action: 'transfer', gasCostMicros: 300_000n, ...base });
    expect(first.sponsorship.verdict).toBe('sponsor');
    expect(first.feeToken).toBeNull(); // sponsored → user pays nothing
    expect(engine.snapshotState().spentByUser.u1).toBe(300_000n);

    const second = engine.quote({ userId: 'u1', action: 'transfer', gasCostMicros: 300_000n, ...base });
    expect(second.sponsorship.verdict).toBe('user_pays'); // budget exhausted (300k + 300k > 400k)
    expect(second.feeToken?.symbol).toBe('USDC'); // user pays in USDC instead
  });
});
