/**
 * Local wallet settings (persisted via the storage shim → AsyncStorage). Only non-secret
 * preferences live here; keys are never touched. Two things live here now:
 *  - the idle auto-lock timeout (read once at wallet construction);
 *  - the TRANSACTION MODE (Manual vs Auto) + Auto-mode spend caps + a daily auto-spend ledger.
 *
 * Manual (default) confirms every transaction. Auto executes WITHIN BOUNDS with no per-transaction
 * confirmation — but a signature still happens on-device (that is how a chain accepts a tx), the
 * key never leaves the device, and the Risk/Policy gate still runs. Auto never bypasses safety;
 * it only removes the per-tx tap once the user has consented to bounded automation.
 */
import { storage } from './storage';
import { isMainnet } from './network';

export type TxMode = 'manual' | 'auto';

export interface Settings {
  /** Minutes of inactivity before the wallet auto-locks; 0 = never. */
  autoLockMinutes: number;
  /** 'manual' (default) confirms every tx; 'auto' executes within caps with no per-tx confirm. */
  txMode: TxMode;
  /** Auto mode: max USD value of a single MAINNET tx that may auto-execute. */
  autoPerTxUsd: number;
  /** Auto mode: max cumulative USD that may auto-execute in one day on MAINNET. */
  autoDailyUsd: number;
}

const KEY = 'iw.settings.v1';
const SPEND_KEY = 'iw.autospend.v1';
const DEFAULTS: Settings = { autoLockMinutes: 15, txMode: 'manual', autoPerTxUsd: 25, autoDailyUsd: 100 };
/** The auto-lock options offered in the UI (minutes; 0 = never). */
export const AUTO_LOCK_OPTIONS = [0, 5, 15, 30, 60] as const;

export function getSettings(): Settings {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      // Clamp to a finite, bounded value: a huge/Infinity minutes from corrupt/legacy/tampered storage
      // would overflow setTimeout's 32-bit ms delay and fire almost immediately — "Never" flipping to
      // "lock instantly". Cap at the largest offered option (parity with web settings.ts).
      autoLockMinutes:
        typeof s.autoLockMinutes === 'number' && Number.isFinite(s.autoLockMinutes) && s.autoLockMinutes >= 0
          ? Math.min(s.autoLockMinutes, Math.max(...AUTO_LOCK_OPTIONS))
          : DEFAULTS.autoLockMinutes,
      txMode: s.txMode === 'auto' ? 'auto' : 'manual',
      autoPerTxUsd: typeof s.autoPerTxUsd === 'number' && s.autoPerTxUsd > 0 ? s.autoPerTxUsd : DEFAULTS.autoPerTxUsd,
      autoDailyUsd: typeof s.autoDailyUsd === 'number' && s.autoDailyUsd > 0 ? s.autoDailyUsd : DEFAULTS.autoDailyUsd,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(patch: Partial<Settings>): void {
  storage.setItem(KEY, JSON.stringify({ ...getSettings(), ...patch }));
}

export function setAutoLockMinutes(minutes: number): void {
  // Only persist a value the UI actually offers — a stray/out-of-range number can't slip in and
  // produce surprise auto-lock behavior (or a corrupt stored setting).
  if (!(AUTO_LOCK_OPTIONS as readonly number[]).includes(minutes)) {
    throw new Error(`Invalid auto-lock value: ${minutes}`);
  }
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
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (device local-ish; fine for a budget)
}
interface Spend {
  day: string;
  usd: number;
}
function readSpend(): Spend {
  try {
    const raw = storage.getItem(SPEND_KEY);
    if (!raw) return { day: today(), usd: 0 };
    const s = JSON.parse(raw) as Partial<Spend>;
    if (s.day !== today()) return { day: today(), usd: 0 }; // a new day → the budget resets
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
  storage.setItem(SPEND_KEY, JSON.stringify({ day: today(), usd: cur.usd + usd }));
}

/**
 * THE auto-execute decision. Returns whether a planned tx may run WITHOUT a per-tx confirmation,
 * and (when not) a human reason to show. Fails SAFE — anything unclear falls back to Manual:
 *  - Only ever in Auto mode.
 *  - A risk BLOCK is never auto (the gate is non-overridable).
 *  - Testnet/devnet: no real funds → auto freely (the frictionless "just do it" case).
 *  - Mainnet: enforce the user's per-tx + daily USD caps; an UNKNOWN USD value → manual.
 */
export function autoDecision(usdVal: number | null, riskLevel: string): { auto: boolean; reason?: string } {
  if (getTxMode() !== 'auto') return { auto: false };
  if (riskLevel === 'block') return { auto: false, reason: 'blocked by the risk engine' };
  if (!isMainnet()) return { auto: true };
  const { perTxUsd, dailyUsd } = getAutoCaps();
  if (usdVal == null) return { auto: false, reason: 'couldn’t verify the USD value' };
  if (usdVal > perTxUsd) return { auto: false, reason: `over your $${perTxUsd} per-transaction cap` };
  if (autoSpentTodayUsd() + usdVal > dailyUsd) return { auto: false, reason: `would exceed your $${dailyUsd} daily cap` };
  return { auto: true };
}
