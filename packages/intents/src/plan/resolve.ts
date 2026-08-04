/**
 * Amount resolution — turns a user-expressed `Amount` into exact base units of
 * a held asset, using its decimals, the user's balance, and (for fiat) its USD
 * price. All integer math (handbook 01 §3). Fiat is USD-only for now; other
 * currencies need an FX feed and are surfaced as a clarify, not a wrong number.
 */
import { usdToMicros } from '@intent-wallet/portfolio';
import type { Amount } from '../schema.js';
import { decimalToBase } from '../amount.js';
import { IntentError } from '../errors.js';
import type { Holding, PriceProvider } from './context.js';

export function resolveAmountToBase(amount: Amount, holding: Holding, prices: PriceProvider): bigint {
  switch (amount.kind) {
    case 'asset':
      return decimalToBase(amount.value, holding.decimals);
    case 'all':
      return holding.totalBase;
    case 'fraction':
      return (holding.totalBase * BigInt(amount.numerator)) / BigInt(amount.denominator);
    case 'percent':
      return (holding.totalBase * BigInt(amount.bps)) / 10_000n;
    case 'fiat': {
      if (amount.currency !== 'USD') {
        throw new IntentError('RESOLUTION_FAILED', `I can only handle USD amounts right now, not ${amount.currency}`, {
          currency: amount.currency,
        });
      }
      const priceStr = prices.getUsd(holding.symbol);
      if (!priceStr) {
        throw new IntentError('RESOLUTION_FAILED', `I don't have a price for ${holding.symbol} right now`);
      }
      // assetBase = usdMicros * 10^decimals / priceMicrosPerToken  (exact)
      const usdMicros = usdToMicros(amount.value);
      const priceMicros = usdToMicros(priceStr);
      if (priceMicros === 0n) throw new IntentError('RESOLUTION_FAILED', `price for ${holding.symbol} is zero`);
      return (usdMicros * 10n ** BigInt(holding.decimals)) / priceMicros;
    }
  }
}
