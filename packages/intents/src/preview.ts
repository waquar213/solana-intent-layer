/**
 * Pre-sign balance preview — the "you send X, you receive Y" a user sees BEFORE
 * a signature exists, instead of a hex blob. Given the concrete asset movements a
 * transaction will cause, it nets them into one line per asset for the owner:
 * negative deltas are what leaves, positive deltas are what arrives. Multi-hop
 * routes (the owner appears as sender AND receiver of an asset) collapse to a
 * single net line; movements that never touch the owner are not shown.
 *
 * Pure, deterministic, integer base-unit math (never a float). This is the
 * comprehension layer the UX doctrine requires — a user authorizes an effect
 * they can read, not a payload they can't.
 */

/** A single concrete asset movement a transaction will cause, in base units. */
export interface AssetMovement {
  /** Asset symbol or address (matched case-insensitively). */
  asset: string;
  from: string;
  to: string;
  /** Amount moved, base units. Non-positive movements are ignored. */
  amountBase: bigint;
}

/** The net effect on one asset for the owner. `deltaBase` < 0 leaves, > 0 arrives. */
export interface BalanceChange {
  asset: string;
  deltaBase: bigint;
}

export function previewBalanceChanges(owner: string, movements: readonly AssetMovement[]): BalanceChange[] {
  const o = owner.trim().toLowerCase();
  const byAsset = new Map<string, { asset: string; delta: bigint }>();

  for (const m of movements) {
    if (m.amountBase <= 0n) continue; // fail-safe: a preview never invents value
    const key = m.asset.trim().toLowerCase();
    const entry = byAsset.get(key) ?? { asset: m.asset, delta: 0n };
    if (m.from.trim().toLowerCase() === o) entry.delta -= m.amountBase;
    if (m.to.trim().toLowerCase() === o) entry.delta += m.amountBase;
    byAsset.set(key, entry);
  }

  // Only assets that actually change; outflows (negative) before inflows (positive).
  return [...byAsset.values()]
    .filter((e) => e.delta !== 0n)
    .sort((a, b) => (a.delta < b.delta ? -1 : a.delta > b.delta ? 1 : a.asset.localeCompare(b.asset)))
    .map((e) => ({ asset: e.asset, deltaBase: e.delta }));
}
