/**
 * Amount parsing and base-unit conversion — float-free (handbook 01 §3).
 * Text like "$100", "₹50,000", "0.021 BTC", "everything", "half", "50%" becomes
 * a typed `Amount`; decimal strings convert to/from base-unit bigints exactly.
 */
import type { Amount } from './schema.js';

/** Symbols the deterministic parser recognizes without the LLM (extend via registry later). */
export const KNOWN_ASSETS = new Set([
  'BTC',
  'ETH',
  'SOL',
  'USDC',
  'USDT',
  'DAI',
  'POL',
  'MATIC',
  'BNB',
  'WBTC',
  'WETH',
  'GUSDC', // GIWA-native stablecoin (SimpleAMM quote/settlement asset)
  'DUSDC', // Solana devnet stablecoin (solAMM)
]);

const CURRENCY_SYMBOL: Record<string, string> = { $: 'USD', '₹': 'INR', '€': 'EUR', '£': 'GBP' };

/** Parses a decimal string into base units (exact; extra fractional digits are truncated). */
export function decimalToBase(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/u.test(value)) throw new Error(`invalid decimal: "${value}"`);
  const [whole, frac = ''] = value.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole as string) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}

/** Formats base units back to a trimmed decimal string. */
export function baseToDecimal(base: bigint, decimals: number): string {
  if (decimals === 0) return base.toString();
  const s = base.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/u, '');
  return frac ? `${whole}.${frac}` : whole;
}

/**
 * Normalizes a numeric token that may carry thousands separators ("1,234" → "1234").
 * Commas are accepted ONLY as valid 3-digit group separators; ambiguous placements —
 * the European decimal "0,5", or "1,23" — return null so the caller can ask the user
 * instead of silently signing a wrong amount. Callers must treat null as "no amount".
 */
export function normalizeGroupedAmount(raw: string): string | null {
  // A leading-dot decimal (".5", ".021") is unambiguous — give it the implicit "0".
  const s = raw.startsWith('.') ? `0${raw}` : raw;
  if (!s.includes(',')) return /^\d+(?:\.\d+)?$/u.test(s) ? s : null;
  const [whole, frac, ...rest] = s.split('.');
  if (rest.length > 0 || whole === undefined) return null; // more than one decimal point
  if (!/^\d{1,3}(?:,\d{3})+$/u.test(whole)) return null; // commas must be clean 3-digit groups
  if (frac !== undefined && !/^\d+$/u.test(frac)) return null;
  const stripped = whole.replace(/,/gu, '');
  return frac === undefined ? stripped : `${stripped}.${frac}`;
}

/** Extracts an amount + optional asset symbol from a text fragment. Returns null if no amount is found. */
export function extractAmountAndAsset(fragment: string): { amount: Amount; asset?: string } | null {
  const text = fragment.trim();
  const lower = text.toLowerCase();
  const asset = detectAsset(text);

  // A leading sign or scientific-notation exponent means the magnitude the user typed is NOT the
  // trailing digit run the matchers below latch onto: "-0.5 ETH" would become +0.5, "1e3 ETH" would
  // become 3. Refuse (→ clarify) rather than silently coerce a malformed amount into a plausible one.
  // Both patterns anchor the NUMBER to a word boundary so an EVM hex address (which can contain a
  // "digit-E-digit" run like …046E82c8) is never mistaken for scientific notation. The mantissa
  // alternation also covers a LEADING-DOT form (".5e3"), which normalizeGroupedAmount accepts as a
  // valid amount (".5"→"0.5") and would otherwise slip past the guard and coerce ".5e3 ETH" → 3 ETH.
  if (/(?:^|\s)[-+]\.?\d/u.test(text) || /(?:^|\s)(?:\d[\d,]*(?:\.\d+)?|\.\d+)[eE][-+]?\d/u.test(text)) return null;

  // A magnitude SUFFIX ("5k", "$10k", "2 million") means the number is 1,000×/1,000,000× the leading
  // digit run the matchers below would grab — "5k USDC" would silently become 5, not 5000. We do NOT
  // guess the scale (a bare "m"/"k" could be part of a token symbol on some chain); refuse → clarify
  // rather than sign a truncated magnitude. The suffix must directly follow the number and END at a
  // word boundary, so a base58/asset run like "5mSOL" is never matched.
  if (/(?:^|[\s$])\d[\d,]*(?:\.\d+)?\s*(?:thousand|million|billion|grand|bn|k|m)\b/iu.test(text)) return null;

  // A hyphenated RANGE ("5-10 ETH", "50-60%") is ambiguous — the matchers below can't bind the first
  // number (a "-" follows it, not letters/space) so they latch onto the SECOND, silently picking the
  // UPPER bound ("5-10 eth" → 10 ETH), a silent OVER-spend. The sign guard above doesn't catch it (the
  // "-" sits between two digits, not after whitespace/start). Refuse → clarify rather than guess.
  if (/\d\s*[-–—]\s*\d/u.test(text)) return null;

  // A malformed DOUBLE-decimal ("0.0.1", "1.2.3") is not a single number — the matchers below can't span
  // two dots, so they latch onto a SUB-number ("0.0.1" → "0.1", a silent 10× over-send if the user's
  // stray-dot typo meant 0.01). normalizeGroupedAmount's own multi-dot check never sees it because only
  // the sub-number is passed in. Refuse → clarify, same class as the sign/exponent/range guards above.
  if (/\d\.\d+\.\d/u.test(text)) return null;

  // A vulgar-fraction glyph (½, ¼, ⅓ …) NFKC-folds to "<num>⁄<den>" (U+2044 FRACTION SLASH); the matchers
  // below can't span the slash and latch onto the DENOMINATOR ("½ ETH" → 2 ETH, a silent 4x over-send).
  // Refuse → clarify, same class as the range/double-decimal guards. (ASCII "1/2" already clarifies via
  // the multi-clause "/" split; this makes the NFKC-folded glyph behave the same.)
  if (/[\u2044\u2215\u29f8\u00f7]/u.test(text)) return null; // \u2044 (NFKC of \u00bd) + \u2215 \u29f8 \u00f7 \u2014 the matcher would else latch onto the DENOMINATOR ("1\u22152 ETH" -> 2, a 4x over-send)

  // European "dot-thousands + comma-decimal" ("1.234,56") \u2014 the bare matcher below grabs the leftmost
  // "1.234" (reading the dot as a decimal point) and drops ",56", a silent UNDER-parse to 1.234. Same
  // ambiguity the comma guards refuse ("0,5"/"1,23"); refuse this form too so the caller clarifies.
  if (/\d\.\d{3},\d/u.test(text)) return null;

  // Space-grouped thousands ("1 500" = 1500, or a normal/NBSP/thin/figure space between a digit and a
  // 3-digit group). The bare matcher latches onto the TRAILING group ("1 500" -> 500), a silent wrong
  // amount that auto-signs. As ambiguous as "0,5" (space could be a separator OR two numbers), so refuse
  // it the same way -> clarify. (Amounts never legitimately contain an inter-digit space here.)
  if (/\d\s\d{3}(?:\D|$)/u.test(text)) return null;

  // Apostrophe-grouped thousands ("1'000" = Swiss 1000) — the bare matcher grabs the trailing "000" (=0).
  // Refuse (ambiguous, and never a legit inline amount).
  if (/\d['’]\d/u.test(text)) return null;
  // A digit glued to a Cyrillic/Greek letter is a magnitude/decimal homoglyph ("5к" for 5k, "0٫"-style):
  // never legitimate in an amount, and it would silently under/over-scale. Refuse.
  if (/\d[\p{Script=Cyrillic}\p{Script=Greek}]|[\p{Script=Cyrillic}\p{Script=Greek}]\d/u.test(text)) return null;

  // "everything" / "all" / "all my X"
  if (/\b(everything|all)\b/u.test(lower)) {
    return asset ? { amount: { kind: 'all' }, asset } : { amount: { kind: 'all' } };
  }
  // "half"
  if (/\bhalf\b/u.test(lower)) {
    return asset
      ? { amount: { kind: 'fraction', numerator: 1, denominator: 2 }, asset }
      : { amount: { kind: 'fraction', numerator: 1, denominator: 2 } };
  }
  // "50%" / "50 percent" / "25 pct" — the WORD forms must resolve to a fraction too, not fall through to
  // the bare-number matcher (which would read "50 percent of my ETH" as a LITERAL 50-token transfer — an
  // auto-signable over-send whenever the balance isn't exactly 2x). `\b` after the word so "percentile"
  // etc. don't match.
  const pct = lower.match(/(\d+(?:\.\d+)?)\s*(?:%|(?:percent|pct)\b)/u);
  if (pct) {
    const bps = Math.round(Number(pct[1]) * 100);
    if (bps >= 1 && bps <= 10_000) {
      return asset ? { amount: { kind: 'percent', bps }, asset } : { amount: { kind: 'percent', bps } };
    }
    // A "%" was unmistakably typed but it's outside 1–100% (e.g. "150%"). Refuse rather than fall
    // through to the bare-number matcher, which would re-read "150" as a LITERAL 150-token transfer —
    // turning "a fraction of balance" into an absolute amount.
    return null;
  }
  // Fiat: a currency symbol followed by a number ("$100", "₹50,000").
  const fiat = text.match(/([$₹€£])\s*([\d,]+(?:\.\d+)?)/u);
  if (fiat) {
    const value = normalizeGroupedAmount(fiat[2] as string);
    if (value !== null) {
      const currency = CURRENCY_SYMBOL[fiat[1] as string] as string;
      const result: { amount: Amount; asset?: string } = { amount: { kind: 'fiat', currency, value } };
      if (asset) result.asset = asset;
      return result;
    }
  }
  // Fiat by currency WORD ("100 dollars", "50,000 rupees", "20 usd", "€ omitted"). Must
  // come before the asset-amount check so "100 dollars of ETH" is $100, not 100 ETH.
  const fiatWord = lower.match(/(\d[\d,]*(?:\.\d+)?)\s*(dollars?|bucks?|usd|rupees?|inr|euros?|eur|pounds?|gbp)\b/u);
  if (fiatWord) {
    const value = normalizeGroupedAmount(fiatWord[1] as string);
    if (value !== null) {
      const WORD_CCY: Record<string, string> = {
        dollar: 'USD', dollars: 'USD', buck: 'USD', bucks: 'USD', usd: 'USD',
        rupee: 'INR', rupees: 'INR', inr: 'INR', euro: 'EUR', euros: 'EUR', eur: 'EUR',
        pound: 'GBP', pounds: 'GBP', gbp: 'GBP',
      };
      const currency = WORD_CCY[fiatWord[2] as string] ?? 'USD';
      const result: { amount: Amount; asset?: string } = { amount: { kind: 'fiat', currency, value } };
      if (asset) result.asset = asset;
      return result;
    }
  }
  // Asset amount: a number (optionally comma-grouped) tied to a known symbol ("0.5 BTC", "1,234 usdc").
  const assetAmt = text.match(/((?:\d[\d,]*\d|\d)(?:\.\d+)?|\.\d+)\s*([A-Za-z]{2,10})/u);
  if (assetAmt && KNOWN_ASSETS.has((assetAmt[2] as string).toUpperCase())) {
    const value = normalizeGroupedAmount(assetAmt[1] as string);
    if (value !== null) {
      const symbol = (assetAmt[2] as string).toUpperCase();
      return { amount: { kind: 'asset', symbol, value }, asset: symbol };
    }
  }
  // Bare number (optionally comma-grouped) with a nearby asset ("buy 2 ETH", "buy 2,500 ethereum").
  const bare = lower.match(/((?:\d[\d,]*\d|\d)(?:\.\d+)?|\.\d+)/u);
  if (bare && asset) {
    const value = normalizeGroupedAmount(bare[1] as string);
    if (value !== null) return { amount: { kind: 'asset', symbol: asset, value }, asset };
  }
  return null;
}

/** Common full names → tickers, so "bitcoin"/"ethereum"/"solana" resolve like their symbols. */
const NAME_ALIASES: Record<string, string> = {
  BITCOIN: 'BTC',
  ETHEREUM: 'ETH',
  ETHER: 'ETH',
  SOLANA: 'SOL',
  POLYGON: 'POL',
  TETHER: 'USDT',
};

/** Finds the first known asset (ticker or full name) in a text fragment, case-insensitive. */
export function detectAsset(fragment: string): string | undefined {
  for (const word of fragment.toUpperCase().split(/[^A-Z]+/u)) {
    if (KNOWN_ASSETS.has(word)) return word;
    const alias = NAME_ALIASES[word];
    if (alias) return alias;
  }
  return undefined;
}
