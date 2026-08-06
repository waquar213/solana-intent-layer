import { describe, expect, it } from 'vitest';
import { computeTaxReport, TAX_PRESETS } from '../src/tax.js';
import type { TaxEvent } from '../src/types.js';

const BTC = 100_000_000n; // 1 BTC in base units (8 decimals)

// 1 BTC bought at $10k, another at $20k, then 1 BTC sold for $25k.
const twoLotsThenSell: TaxEvent[] = [
  { type: 'acquire', asset: 'BTC', amount: BTC, costBasisMicros: 10_000_000_000n, asOf: '2024-01-01' },
  { type: 'acquire', asset: 'BTC', amount: BTC, costBasisMicros: 20_000_000_000n, asOf: '2024-06-01' },
  { type: 'dispose', asset: 'BTC', amount: BTC, proceedsMicros: 25_000_000_000n, asOf: '2026-01-01' },
];

describe('tax lot matching', () => {
  it('FIFO sells the oldest (cheapest here) lot first', () => {
    const report = computeTaxReport(twoLotsThenSell, TAX_PRESETS.us_fifo);
    expect(report.disposals).toHaveLength(1);
    expect(report.disposals[0]!.costBasisMicros).toBe(10_000_000_000n);
    expect(report.disposals[0]!.gainMicros).toBe(15_000_000_000n);
    expect(report.disposals[0]!.term).toBe('long'); // held ~2 years
    expect(report.totals.longTermGainMicros).toBe(15_000_000_000n);
  });

  it('HIFO sells the highest-cost lot first (smallest gain)', () => {
    const report = computeTaxReport(twoLotsThenSell, TAX_PRESETS.us_hifo);
    expect(report.disposals[0]!.costBasisMicros).toBe(20_000_000_000n);
    expect(report.disposals[0]!.gainMicros).toBe(5_000_000_000n);
  });

  it('AVERAGE pools cost basis (UK Section-104 style)', () => {
    const report = computeTaxReport(twoLotsThenSell, TAX_PRESETS.uk_pool);
    expect(report.disposals[0]!.costBasisMicros).toBe(15_000_000_000n); // (10k + 20k) / 2
    expect(report.disposals[0]!.gainMicros).toBe(10_000_000_000n);
  });

  it('classifies short-term when held under the threshold', () => {
    const report = computeTaxReport(
      [
        { type: 'acquire', asset: 'ETH', amount: 10n ** 18n, costBasisMicros: 2_000_000_000n, asOf: '2025-12-01' },
        { type: 'dispose', asset: 'ETH', amount: 10n ** 18n, proceedsMicros: 2_500_000_000n, asOf: '2026-01-01' },
      ],
      TAX_PRESETS.us_fifo,
    );
    expect(report.disposals[0]!.term).toBe('short'); // 31 days < 365
    expect(report.totals.shortTermGainMicros).toBe(500_000_000n);
  });

  it('long-term boundary is EXCLUSIVE: exactly one year is short-term, one more day is long-term', () => {
    const evt = (dispOn: string): TaxEvent[] => [
      { type: 'acquire', asset: 'ETH', amount: 10n ** 18n, costBasisMicros: 2_000_000_000n, asOf: '2025-01-01' },
      { type: 'dispose', asset: 'ETH', amount: 10n ** 18n, proceedsMicros: 2_500_000_000n, asOf: dispOn },
    ];
    // 2025 has 365 days → 2025-01-01 → 2026-01-01 is exactly 365 days = exactly one year → SHORT (not "more
    // than one year"). One day later is 366 days → LONG. `>= 365` wrongly made the exact-year hold long-term.
    expect(computeTaxReport(evt('2026-01-01'), TAX_PRESETS.us_fifo).disposals[0]!.term).toBe('short');
    expect(computeTaxReport(evt('2026-01-02'), TAX_PRESETS.us_fifo).disposals[0]!.term).toBe('long');
  });

  it('surfaces unmatched disposals instead of guessing a cost basis', () => {
    const report = computeTaxReport(
      [
        { type: 'acquire', asset: 'BTC', amount: BTC, costBasisMicros: 10_000_000_000n, asOf: '2024-01-01' },
        { type: 'dispose', asset: 'BTC', amount: 2n * BTC, proceedsMicros: 50_000_000_000n, asOf: '2026-01-01' },
      ],
      TAX_PRESETS.us_fifo,
    );
    expect(report.disposals).toHaveLength(1);
    expect(report.disposals[0]!.gainMicros).toBe(15_000_000_000n); // 25k proceeds − 10k cost on the matched BTC
    expect(report.unmatched).toHaveLength(1);
    expect(report.unmatched[0]!.amount).toBe(BTC);
    expect(report.unmatched[0]!.proceedsMicros).toBe(25_000_000_000n);
  });
});
