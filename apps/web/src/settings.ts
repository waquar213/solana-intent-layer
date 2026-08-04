/**
 * Local wallet settings (localStorage). Only non-secret preferences live here; keys are never
 * touched. Two things live here:
 *  - the idle auto-lock timeout (read once at wallet construction);
 *  - the TRANSACTION MODE (Manual vs Auto) + Auto-mode spend caps + a daily auto-spend ledger.
 *
 * Manual (default) confirms every transaction. Auto executes WITHIN BOUNDS with no per-transaction
 * confirmation — a signature still happens on-device (that is how a chain accepts a tx), the key
 * never leaves the browser, and the Risk/Policy gate still runs. Auto never bypasses safety; it
 * only removes the per-tx click once the user has consented to bounded automation. (This web build
 * broadcasts on testnets only, so the caps mostly protect a future mainnet path — but they bind
 * whenever a real USD value is known.)
 */
export type TxMode = 'manual' | 'auto';
/** Which network class the AI flow executes against. Default 'testnet' (doctrine: mainnet is
 *  opt-in and every mainnet broadcast is guarded by an explicit confirm + the spend cap). */
export type NetworkMode = 'testnet' | 'mainnet';

export interface Settings {
  /** Minutes of inactivity before the wallet auto-locks; 0 = never. */
  autoLockMinutes: number;
  /** 'manual' (default) confirms every tx; 'auto' executes within caps with no per-tx confirm. */
  txMode: TxMode;
  /** Auto mode: max USD value of a single tx that may auto-execute when a USD value is known. */
  autoPerTxUsd: number;
  /** Auto mode: max cumulative USD that may auto-execute in one day. */
  autoDailyUsd: number;
  /** 'testnet' (default) or 'mainnet' — where AI-flow execution broadcasts. */
  networkMode: NetworkMode;
}

const KEY = 'iw.settings.v1';
const SPEND_KEY = 'iw.autospend.v1';
const DEFAULTS: Settings = { autoLockMinutes: 15, txMode: 'manual', autoPerTxUsd: 25, autoDailyUsd: 100, networkMode: 'testnet' };
/** The auto-lock options offered in the UI (minutes; 0 = never). */
export const AUTO_LOCK_OPTIONS = [0, 5, 15, 30, 60] as const;

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      // Clamp to a finite, bounded value: a huge/Infinity minutes from corrupt/legacy/tampered
      // storage would overflow setTimeout's 32-bit ms delay and fire almost immediately — auto-lock
      // "Never" flipping to "lock instantly". Cap at the largest offered option.
      autoLockMinutes:
        typeof s.autoLockMinutes === 'number' && Number.isFinite(s.autoLockMinutes) && s.autoLockMinutes >= 0
          ? Math.min(s.autoLockMinutes, Math.max(...AUTO_LOCK_OPTIONS))
          : DEFAULTS.autoLockMinutes,
      txMode: s.txMode === 'auto' ? 'auto' : 'manual',
      autoPerTxUsd: typeof s.autoPerTxUsd === 'number' && s.autoPerTxUsd > 0 ? s.autoPerTxUsd : DEFAULTS.autoPerTxUsd,
      autoDailyUsd: typeof s.autoDailyUsd === 'number' && s.autoDailyUsd > 0 ? s.autoDailyUsd : DEFAULTS.autoDailyUsd,
      networkMode: s.networkMode === 'mainnet' ? 'mainnet' : 'testnet',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(patch: Partial<Settings>): void {
  localStorage.setItem(KEY, JSON.stringify({ ...getSettings(), ...patch }));
}

export function setAutoLockMinutes(minutes: number): void {
  save({ autoLockMinutes: minutes });
}

/** The configured auto-lock in milliseconds (0 → disabled), for the WalletManager. */
export function autoLockMs(): number {
  return getSettings().autoLockMinutes * 60_000;
}

// ── Transaction mode (Manual / Auto) ──────────────────────────────────────────
export function getTxMode(): TxMode {
  return getSettings().txMode;
}
export function setTxMode(mode: TxMode): void {
  save({ txMode: mode === 'auto' ? 'auto' : 'manual' });
}

// ── Network mode (Testnet / Mainnet) ──────────────────────────────────────────
export function getNetworkMode(): NetworkMode {
  // This build broadcasts on TESTNETS ONLY (the mainnet toggle is disabled in the UI). Clamp to
  // 'testnet' so a 'mainnet' value persisted by a prior build can never route a real-funds tx,
  // no matter which screen a returning user opens first. Revert to reading the setting when
  // mainnet ships.
  return 'testnet';
}
export function setNetworkMode(mode: NetworkMode): void {
  save({ networkMode: mode === 'mainnet' ? 'mainnet' : 'testnet' });
}

/** Auto-mode spend caps (USD). Both are clamped ≥ 1; daily is clamped ≥ per-tx. */
export function getAutoCaps(): { perTxUsd: number; dailyUsd: number } {
  const s = getSettings();
  return { perTxUsd: s.autoPerTxUsd, dailyUsd: s.autoDailyUsd };
}
export function setAutoCaps(perTxUsd: number, dailyUsd: number): void {
  const per = Math.max(1, Math.round(perTxUsd));
  const day = Math.max(per, Math.round(dailyUsd)); // a daily cap below the per-tx cap is nonsensical
  save({ autoPerTxUsd: per, autoDailyUsd: day });
}

// ── Daily auto-spend ledger — a real-USD budget that resets each calendar day ──
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
interface Spend {
  day: string;
  usd: number;
}
function readSpend(): Spend {
  try {
    const raw = localStorage.getItem(SPEND_KEY);
    if (!raw) return { day: today(), usd: 0 };
    const s = JSON.parse(raw) as Partial<Spend>;
    if (s.day !== today()) return { day: today(), usd: 0 };
    return { day: today(), usd: typeof s.usd === 'number' && s.usd >= 0 ? s.usd : 0 };
  } catch {
    return { day: today(), usd: 0 };
  }
}
export function autoSpentTodayUsd(): number {
  return readSpend().usd;
}
export function recordAutoSpendUsd(usd: number): void {
  if (!(usd > 0)) return;
  const cur = readSpend();
  localStorage.setItem(SPEND_KEY, JSON.stringify({ day: today(), usd: cur.usd + usd }));
}

/**
 * THE auto-execute decision — may a planned tx run WITHOUT a per-tx confirmation? Fails SAFE:
 *  - Only ever in Auto mode.
 *  - A risk BLOCK is never auto (the gate is non-overridable).
 *  - The per-tx + daily caps must be CHECKABLE. An UNKNOWN USD value — an unpriced asset (the testnet
 *    stablecoins gUSDC/dUSDC carry no price feed) or a price-feed outage — stays MANUAL, so a
 *    valuable-but-unpriced plan (e.g. a 10,000 gUSDC → ETH convert-and-send) can never slip past both
 *    caps and auto-execute. Every priced native (ETH/SOL/BTC/USDC) still runs frictionlessly.
 */
export function autoDecision(usdVal: number | null, riskLevel: string): { auto: boolean; reason?: string } {
  if (getTxMode() !== 'auto') return { auto: false };
  if (riskLevel === 'block') return { auto: false, reason: 'blocked by the risk engine' };
  if (usdVal == null) return { auto: false, reason: 'this asset is unpriced, so your spend caps can’t be checked' };
  const { perTxUsd, dailyUsd } = getAutoCaps();
  if (usdVal > perTxUsd) return { auto: false, reason: `over your $${perTxUsd} per-transaction cap` };
  if (autoSpentTodayUsd() + usdVal > dailyUsd) return { auto: false, reason: `would exceed your $${dailyUsd} daily cap` };
  return { auto: true };
}
