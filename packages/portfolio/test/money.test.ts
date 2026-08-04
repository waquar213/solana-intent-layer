import { describe, expect, it } from 'vitest';
import { assetValueMicros, formatUsd, MoneyError, scaleAmount, usdToMicros } from '../src/money.js';

describe('usdToMicros', () => {
  it('parses decimal USD strings to integer micro-USD', () => {
    expect(usdToMicros('2100.55')).toBe(2_100_550_000n);
    expect(usdToMicros('1')).toBe(1_000_000n);
    expect(usdToMicros('0.000001')).toBe(1n);
    expect(usdToMicros('0.5')).toBe(500_000n);
  });

  it('truncates beyond micro precision and rejects junk', () => {
    expect(usdToMicros('1.2345678')).toBe(1_234_567n); // 7th+ digit dropped
    for (const bad of ['', '-1', '1.', 'abc', '1,000', '1e3']) {
      expect(() => usdToMicros(bad), bad).toThrowError(MoneyError);
    }
  });
});

describe('assetValueMicros', () => {
  it('computes value with exact integer math', () => {
    // 1.5 ETH (18 decimals) at $2100.55 → $3150.825 → 3_150_825_000 µUSD
    expect(assetValueMicros(1_500_000_000_000_000_000n, 18, usdToMicros('2100.55'))).toBe(3_150_825_000n);
    // 761.23 USDC (6 decimals) at $1.00 → 761_230_000 µUSD
    expect(assetValueMicros(761_230_000n, 6, usdToMicros('1'))).toBe(761_230_000n);
  });

  it('rejects implausible decimals', () => {
    expect(() => assetValueMicros(1n, 99, 1n)).toThrowError(MoneyError);
  });
});

describe('formatUsd', () => {
  it('formats with thousands separators and 2dp', () => {
    expect(formatUsd(3_150_825_000n)).toBe('$3,150.82');
    expect(formatUsd(0n)).toBe('$0.00');
    expect(formatUsd(999_999n)).toBe('$0.99');
    expect(formatUsd(1_234_567_890_000n)).toBe('$1,234,567.89');
  });

  it('handles negatives', () => {
    expect(formatUsd(-500_000n)).toBe('-$0.50');
  });
});

describe('scaleAmount', () => {
  it('scales base amounts up to a common decimals', () => {
    expect(scaleAmount(5n, 6, 18)).toBe(5n * 10n ** 12n);
    expect(scaleAmount(7n, 18, 18)).toBe(7n);
    expect(() => scaleAmount(1n, 18, 6)).toThrowError(MoneyError);
  });
});
