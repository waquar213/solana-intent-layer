import { describe, expect, it } from 'vitest';
import {
  detectAddressPoisoning,
  detectBurnAddress,
  detectAdminPrivileges,
  detectFreshToken,
  detectHoneypot,
  detectLowLiquidity,
  detectOwnershipConcentration,
  detectUnaudited,
  detectUnlimitedApproval,
} from '../src/detectors.js';
import { combineSignals, HARD_BLOCK_SEVERITY } from '../src/scoring.js';
import type { TokenSubject } from '../src/types.js';

const token = (meta: NonNullable<TokenSubject['meta']>): TokenSubject => ({
  kind: 'token',
  symbol: 'X',
  address: '0xabc',
  chainId: 'ethereum',
  meta,
});

describe('detectors', () => {
  it('flags unlimited approvals only', () => {
    expect(
      detectUnlimitedApproval({ kind: 'approval', token: 'USDC', spender: '0xdead', amount: 2n ** 255n, decimals: 6 }),
    ).toMatchObject({ code: 'UNLIMITED_APPROVAL', severity: 0.7 });
    expect(
      detectUnlimitedApproval({ kind: 'approval', token: 'USDC', spender: '0xdead', amount: 100_000000n, decimals: 6 }),
    ).toBeNull();
  });

  it('flags fresh tokens by age', () => {
    expect(detectFreshToken(token({ ageDays: 0.5 }))?.code).toBe('BRAND_NEW_TOKEN');
    expect(detectFreshToken(token({ ageDays: 3 }))?.code).toBe('FRESH_TOKEN');
    expect(detectFreshToken(token({ ageDays: 400 }))).toBeNull();
    expect(detectFreshToken(token({}))).toBeNull(); // unknown age → no signal
  });

  it('flags low liquidity in tiers', () => {
    expect(detectLowLiquidity(token({ liquidityUsd: 5_000 }))?.code).toBe('VERY_LOW_LIQUIDITY');
    expect(detectLowLiquidity(token({ liquidityUsd: 30_000 }))?.code).toBe('LOW_LIQUIDITY');
    expect(detectLowLiquidity(token({ liquidityUsd: 5_000_000 }))).toBeNull();
  });

  it('flags a honeypot (high sell tax) as a HARD block signal', () => {
    const sig = detectHoneypot(token({ feeOnTransferBps: 3000 }));
    expect(sig?.severity).toBeGreaterThanOrEqual(HARD_BLOCK_SEVERITY);
    expect(detectHoneypot(token({ feeOnTransferBps: 100 }))).toBeNull();
  });

  it('flags ownership concentration, admin privileges, and unaudited', () => {
    expect(detectOwnershipConcentration(token({ ownershipConcentrationBps: 6000 }))?.code).toBe(
      'OWNERSHIP_CONCENTRATION',
    );
    expect(detectAdminPrivileges(token({ upgradeable: true }))?.code).toBe('ADMIN_PRIVILEGES');
    expect(detectAdminPrivileges(token({ hasAdminKey: false, upgradeable: false }))).toBeNull();
    expect(detectUnaudited(token({ audited: false }))?.code).toBe('UNAUDITED');
    expect(detectUnaudited(token({ audited: true }))).toBeNull();
  });

  it('detects address poisoning (lookalike of a known address)', () => {
    const real = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'; // lowercases to ...da94, prefix 0x9858
    const lookalike = `0x9858${'0'.repeat(32)}da94`; // 42 chars: same first 6 + last 4, different middle
    const sig = detectAddressPoisoning({ kind: 'address', address: lookalike, knownAddresses: [real] });
    expect(sig?.code).toBe('ADDRESS_POISONING');
    // the exact known address is not flagged
    expect(detectAddressPoisoning({ kind: 'address', address: real, knownAddresses: [real] })).toBeNull();
    // an unrelated address is not flagged
    expect(
      detectAddressPoisoning({
        kind: 'address',
        address: '0x1111111111111111111111111111111111111111',
        knownAddresses: [real],
      }),
    ).toBeNull();
  });

  it('flags burn / null addresses as unrecoverable', () => {
    const burn = (address: string) => detectBurnAddress({ kind: 'address', address });
    // the null address — the classic fat-finger sink
    expect(burn('0x0000000000000000000000000000000000000000')).toMatchObject({ code: 'BURN_ADDRESS', severity: 0.9 });
    // the canonical dead sink, case-insensitively
    expect(burn('0x000000000000000000000000000000000000dEaD')?.code).toBe('BURN_ADDRESS');
    // a malformed all-zero address still fails closed
    expect(burn('0x0')?.code).toBe('BURN_ADDRESS');
    // a real recipient is left alone
    expect(burn('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBeNull();
    expect(burn('0xdead000000000000000000000000000000000000')).toBeNull(); // leading, not the dead sink
  });
});

describe('composite scoring', () => {
  it('compounds independent risks (probabilistic OR)', () => {
    const one = combineSignals([{ code: 'a', category: 'token', severity: 0.4, reason: 'a' }]);
    const two = combineSignals([
      { code: 'a', category: 'token', severity: 0.4, reason: 'a' },
      { code: 'b', category: 'liquidity', severity: 0.4, reason: 'b' },
    ]);
    expect(two.score).toBeGreaterThan(one.score); // two moderate risks > one
    expect(two.score).toBe(0.64); // 1 − 0.6·0.6
  });

  it('maps score to level and forces block on a hard signal', () => {
    expect(combineSignals([{ code: 'x', category: 'token', severity: 0.1, reason: 'x' }]).level).toBe('low');
    expect(combineSignals([{ code: 'x', category: 'token', severity: 0.45, reason: 'x' }]).level).toBe('medium');
    expect(combineSignals([{ code: 'x', category: 'token', severity: 0.7, reason: 'x' }]).level).toBe('high');
    expect(combineSignals([{ code: 'x', category: 'intel', severity: 1, reason: 'x' }]).level).toBe('block');
  });

  it('an empty signal set is low risk', () => {
    expect(combineSignals([])).toMatchObject({ level: 'low', score: 0 });
  });
});
