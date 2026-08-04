/**
 * Progressive disclosure — the 3-mode model. Default Simple (~95% of users): amounts + status
 * only, mechanism hidden. Pro adds INLINE detail (route/gas/slippage/chain/approvals) to the
 * same screens. Developer adds the Console tab (logs/RPC/testnet/raw). Persisted per-device via
 * the storage shim; a lightweight listener set re-renders subscribers on change.
 */
import { useEffect, useState } from 'react';
import { storage } from './storage';

export type Mode = 'simple' | 'pro' | 'developer';

const KEY = 'iw.mode.v1';
const listeners = new Set<() => void>();

export function getMode(): Mode {
  const m = storage.getItem(KEY);
  return m === 'pro' || m === 'developer' ? m : 'simple';
}

export function setMode(m: Mode): void {
  storage.setItem(KEY, m);
  listeners.forEach((l) => l());
}

/** Subscribe to the active mode; re-renders on setMode. */
export function useMode(): Mode {
  const [m, setM] = useState<Mode>(getMode());
  useEffect(() => {
    const l = (): void => setM(getMode());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return m;
}

/** Pro-or-higher — mechanism detail is allowed. */
export const isPro = (m: Mode): boolean => m === 'pro' || m === 'developer';
/** Developer — the Console tab + raw data. */
export const isDev = (m: Mode): boolean => m === 'developer';

export const MODE_LABEL: Record<Mode, string> = { simple: 'Simple', pro: 'Pro', developer: 'Developer' };
export const MODES: Mode[] = ['simple', 'pro', 'developer'];
