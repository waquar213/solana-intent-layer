/**
 * Position normalization — the first pipeline stage. Resolves each position's
 * asset class + liquidity, computes its SIGNED contribution to net worth
 * (borrowing is a liability, subtracted), and its weight as a share of gross
 * assets. Net worth = gross assets − debt; getting the sign of debt right is
 * the whole reason a "net worth" number can be trusted.
 *
 * Classification falls back to a small built-in map of well-known natives and
 * stablecoins; an injected `Classifier` (from an AssetCatalog) supersedes it.
 */
import { ratio } from './money.js';
import type { AssetClass, Liquidity, NormalizedPosition, Position } from './types.js';

export type Classifier = (position: Position) => AssetClass | undefined;

export interface NormalizedPortfolio {
  positions: NormalizedPosition[];
  grossAssetsMicros: bigint;
  debtMicros: bigint;
  netWorthMicros: bigint;
  stale: boolean;
}

// Well-known symbol sets — a safe fallback the AssetCatalog overrides. Kept small
// and stable; these are not a price or trust signal, only a display classification.
const STABLES = new Set([
  'USDC',
  'USDT',
  'DAI',
  'USDS',
  'FRAX',
  'TUSD',
  'USDP',
  'GUSD',
  'LUSD',
  'PYUSD',
  'USDE',
  'FDUSD',
  'SUSD',
]);
const NATIVES = new Set([
  'ETH',
  'BTC',
  'SOL',
  'MATIC',
  'POL',
  'BNB',
  'AVAX',
  'ARB',
  'OP',
  'ATOM',
  'DOT',
  'ADA',
  'NEAR',
]);
const BLUECHIP = new Set(['WBTC', 'WETH', 'STETH', 'WSTETH', 'RETH', 'CBETH', 'WBETH', 'JITOSOL', 'MSOL']);

/** Default asset classifier: LP/NFT by position kind, then symbol (stable → native → bluechip), else unknown. */
export function defaultClassifier(position: Position): AssetClass {
  if (position.kind === 'lp') return 'lp';
  if (position.kind === 'nft') return 'nft';
  const sym = position.symbol.toUpperCase();
  if (STABLES.has(sym)) return 'stablecoin';
  if (NATIVES.has(sym)) return 'native';
  if (BLUECHIP.has(sym)) return 'bluechip';
  return 'unknown';
}

/** Default liquidity classification from position kind (locked in a protocol vs freely movable). */
function defaultLiquidity(position: Position): Liquidity {
  switch (position.kind) {
    case 'token':
    case 'reward':
    case 'borrowing':
      return 'liquid';
    case 'nft':
      return 'illiquid';
    default:
      // staking / lending / lp / yield are locked in a protocol
      return 'locked';
  }
}

export function normalize(positions: Position[], classify: Classifier = () => undefined): NormalizedPortfolio {
  let grossAssetsMicros = 0n;
  let debtMicros = 0n;
  let stale = false;

  // First pass: resolve class/liquidity/sign, accumulate gross + debt.
  const partial = positions.map((p) => {
    const assetClass = p.assetClass ?? classify(p) ?? defaultClassifier(p);
    const liquidity = p.liquidity ?? defaultLiquidity(p);
    const isDebt = p.kind === 'borrowing';
    const value = p.valueMicros < 0n ? 0n : p.valueMicros; // defensive: value is a magnitude
    if (isDebt) debtMicros += value;
    else grossAssetsMicros += value;
    if (p.stale) stale = true;
    return { p, assetClass, liquidity, isDebt, value };
  });

  // Second pass: weights need the gross total.
  const normalized: NormalizedPosition[] = partial.map(({ p, assetClass, liquidity, isDebt, value }) => ({
    ...p,
    assetClass,
    liquidity,
    signedValueMicros: isDebt ? -value : value,
    weight: isDebt ? 0 : ratio(value, grossAssetsMicros),
  }));

  return {
    positions: normalized,
    grossAssetsMicros,
    debtMicros,
    netWorthMicros: grossAssetsMicros - debtMicros,
    stale,
  };
}
