/**
 * Portfolio summary — the read side of the wallet. It folds the runtime's holdings
 * and prices into per-asset USD values and a total, using the same money discipline
 * as the planner (integer micro-USD, decimal-string amounts). Pure over the injected
 * context, so it reflects whatever holdings source is wired (in-memory today, live
 * chain balances tomorrow) without changing here.
 */
import { baseToDecimal, type EngineContext } from '@intent-wallet/intents';
import { usdToMicros } from '@intent-wallet/portfolio';

export interface PortfolioHolding {
  symbol: string;
  /** Decimal-string amount held (across chains). */
  amount: string;
  /** USD price per whole token, or null if unknown. */
  priceUsd: string | null;
  /** Position value in micro-USD (string), or null when the price is unknown. */
  valueMicros: string | null;
}

export interface PortfolioSummary {
  totalValueMicros: string;
  holdings: PortfolioHolding[];
}

export function summarizePortfolio(context: EngineContext): PortfolioSummary {
  let total = 0n;
  const holdings: PortfolioHolding[] = context.holdings.list().map((h) => {
    const price = context.prices.getUsd(h.symbol);
    let valueMicros: string | null = null;
    if (price) {
      const v = (h.totalBase * usdToMicros(price)) / 10n ** BigInt(h.decimals);
      total += v;
      valueMicros = v.toString();
    }
    return { symbol: h.symbol, amount: baseToDecimal(h.totalBase, h.decimals), priceUsd: price ?? null, valueMicros };
  });
  // Highest-value first.
  holdings.sort((a, b) => {
    const av = BigInt(a.valueMicros ?? '0');
    const bv = BigInt(b.valueMicros ?? '0');
    return av < bv ? 1 : av > bv ? -1 : 0;
  });
  return { totalValueMicros: total.toString(), holdings };
}
