/**
 * Composite risk scoring — the fail-closed guarantee. A corrupt severity must never soften the
 * verdict; the whole point of this layer is that it can only ever refuse.
 */
import { describe, expect, it } from 'vitest';
import { combineSignals } from '../src/scoring.js';

describe('risk scoring — a corrupt severity must FAIL CLOSED, never open', () => {
  // clamp01 was `x < 0 ? 0 : x > 1 ? 1 : x` — both comparisons are false for NaN, so a corrupt
  // severity escaped the clamp. Then `NaN >= HARD_BLOCK_SEVERITY` is false (no hard block) and
  // both level thresholds are false, so the report came back 'high' — which PROCEEDS with
  // confirmation. A sanctions/blacklist hit arriving with a bad severity was silently downgraded
  // from 'block' to 'allowed-with-confirmation'.
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    it(`treats severity=${String(bad)} as a hard block, not 'high'`, () => {
      const report = combineSignals([
        { code: 'SANCTIONED_ADDRESS', category: 'intel', severity: bad, reason: 'sanctions hit' },
      ]);
      expect(Number.isFinite(report.score), `score=${report.score}`).toBe(true);
      expect(report.level).toBe('block');
    });
  }

  it('one corrupt signal does not mask the others', () => {
    const report = combineSignals([
      { code: 'BAD', category: 'intel', severity: Number.NaN, reason: 'corrupt' },
      { code: 'MINOR', category: 'token', severity: 0.2, reason: 'small risk' },
    ]);
    expect(Number.isFinite(report.score)).toBe(true);
    expect(report.level).toBe('block'); // the corrupt one still forces the safe outcome
  });

  it('normal severities are unaffected', () => {
    expect(combineSignals([{ code: 'X', category: 'token', severity: 0.2, reason: 'ok' }]).level).toBe('low');
    expect(combineSignals([{ code: 'X', category: 'token', severity: 0.7, reason: 'ok' }]).level).toBe('high');
  });
});
