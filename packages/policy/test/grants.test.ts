import { describe, expect, it } from 'vitest';
import { evaluateSpendGrant, type SpendGrant } from '../src/index.js';

const T0 = 1_800_000_000_000; // fixed injected "now", unix ms

const grant = (over: Partial<SpendGrant> = {}): SpendGrant => ({
  id: 'grant-1',
  asset: 'USDC',
  maxTotalBase: 50_000000n, // 50 USDC (6 dp)
  maxPerTxBase: 20_000000n, // 20 USDC per tx
  allowlist: ['0xUniswapRouter'],
  notAfterMs: T0 + 3_600_000, // +1h
  ...over,
});

const req = (over: Record<string, unknown> = {}) => ({
  asset: 'USDC',
  amountBase: 10_000000n,
  to: '0xUniswapRouter',
  nowMs: T0,
  ...over,
});

describe('evaluateSpendGrant', () => {
  it('authorizes a spend inside cap, allowlist and window, reporting remaining', () => {
    expect(evaluateSpendGrant(grant(), 0n, req())).toEqual({ ok: true, remainingBase: 40_000000n });
  });

  it('honors the cumulative cap across prior spend — exact boundary allowed, one unit over denied', () => {
    // 45 already spent, +5 == exactly the 50 cap → ok, 0 remaining
    expect(evaluateSpendGrant(grant(), 45_000000n, req({ amountBase: 5_000000n }))).toEqual({
      ok: true,
      remainingBase: 0n,
    });
    // 45 spent, +6 = 51 > 50 → denied
    const over = evaluateSpendGrant(grant(), 45_000000n, req({ amountBase: 6_000000n }));
    expect(over.ok).toBe(false);
    expect(over).toMatchObject({ code: 'OVER_TOTAL_CAP' });
  });

  it('enforces the per-transaction ceiling', () => {
    expect(evaluateSpendGrant(grant(), 0n, req({ amountBase: 21_000000n }))).toMatchObject({
      ok: false,
      code: 'OVER_PER_TX_CAP',
    });
  });

  it('only pays the allowlist (case-insensitive), refusing anyone else', () => {
    expect(evaluateSpendGrant(grant(), 0n, req({ to: '0xUNISWAProuter' })).ok).toBe(true);
    expect(evaluateSpendGrant(grant(), 0n, req({ to: '0xAttacker' }))).toMatchObject({
      ok: false,
      code: 'RECIPIENT_NOT_ALLOWLISTED',
    });
  });

  it('refuses the wrong asset', () => {
    expect(evaluateSpendGrant(grant(), 0n, req({ asset: 'DAI' }))).toMatchObject({ code: 'WRONG_ASSET' });
  });

  it('is dead once expired (now >= notAfter) or revoked', () => {
    expect(evaluateSpendGrant(grant(), 0n, req({ nowMs: T0 + 3_600_000 }))).toMatchObject({ code: 'EXPIRED' });
    expect(evaluateSpendGrant(grant({ revoked: true }), 0n, req())).toMatchObject({ code: 'REVOKED' });
  });

  it('fails closed on malformed amounts (zero, negative spend)', () => {
    expect(evaluateSpendGrant(grant(), 0n, req({ amountBase: 0n }))).toMatchObject({ code: 'MALFORMED' });
    expect(evaluateSpendGrant(grant(), -1n, req())).toMatchObject({ code: 'MALFORMED' });
  });
});
