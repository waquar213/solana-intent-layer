/**
 * Fiat math with NO floats (handbook 01 §3). Prices arrive as decimal strings
 * ("2100.55"); we convert to integer micro-USD (1 USD = 1_000_000 µUSD) and do
 * all value math in bigint. The only float-ish thing is final display
 * formatting, which is a presentation concern at the very edge.
 */
export const MICRO = 1_000_000n; // µUSD per USD

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Parses a non-negative decimal USD string into micro-USD (bigint). "2100.55" → 2100550000n. */
export function usdToMicros(price: string): bigint {
  const trimmed = price.trim();
  if (!/^\d+(\.\d+)?$/u.test(trimmed)) throw new MoneyError(`invalid USD amount: "${price}"`);
  const [whole, frac = ''] = trimmed.split('.');
  const fracPadded = (frac + '000000').slice(0, 6); // 6 = micro precision
  return BigInt(whole as string) * MICRO + BigInt(fracPadded);
}

/**
 * Value in micro-USD of `amount` base units of an asset with `decimals`, priced
 * at `priceMicros` µUSD per whole token. Exact integer math:
 *   value = amount * priceMicros / 10^decimals
 */
export function assetValueMicros(amount: bigint, decimals: number, priceMicros: bigint): bigint {
  if (decimals < 0 || decimals > 36) throw new MoneyError(`implausible decimals: ${decimals}`);
  return (amount * priceMicros) / 10n ** BigInt(decimals);
}

/** Formats micro-USD as a display string, e.g. 3150825000n → "$3,150.82" (round half-down at display edge). */
export function formatUsd(micros: bigint, opts: { currency?: string } = {}): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const dollars = abs / MICRO;
  const cents = (abs % MICRO) / 10_000n; // 2-dp
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  const sign = negative ? '-' : '';
  const symbol = opts.currency === 'USD' || opts.currency === undefined ? '$' : `${opts.currency} `;
  return `${sign}${symbol}${grouped}.${cents.toString().padStart(2, '0')}`;
}

/** Normalizes a base-unit amount from `fromDecimals` to `toDecimals` (toDecimals ≥ fromDecimals). */
export function scaleAmount(amount: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (toDecimals < fromDecimals) throw new MoneyError('scaleAmount only scales up');
  return amount * 10n ** BigInt(toDecimals - fromDecimals);
}
