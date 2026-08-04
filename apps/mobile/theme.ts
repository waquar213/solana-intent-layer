/**
 * Design tokens + the light/dark theme system. Layout tokens (space, radius, type, mono) are
 * theme-independent; only the COLOR palette swaps. Components read the active palette with
 * `useTheme()` and rebuild their StyleSheet from it, so a theme change re-renders the whole app.
 *
 * `C` stays exported as the DARK palette for the few theme-independent consumers (RISK, and any
 * value read outside a component). Inside components, always use `useTheme()` — never `C`.
 */
import { useEffect, useState } from 'react';
import { Appearance, Platform } from 'react-native';
import { storage } from './storage';

export interface Palette {
  canvas: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accentSubtle: string;
  success: string;
  danger: string;
  warn: string;
}

/** Dark — the original near-black surface + indigo accent. */
export const darkPalette: Palette = {
  canvas: '#0E0E10',
  surface: '#1A1A1E',
  surface2: '#242429',
  border: '#2E2E34',
  text: '#F4F4F6',
  text2: '#A3A3AE',
  text3: '#6E6E78',
  accent: '#6D66F6',
  accentSubtle: '#26244B',
  success: '#34C77B',
  danger: '#F87171',
  warn: '#F5A623',
};

/** Light — soft off-white surfaces, near-black ink, the same indigo accent (tuned for contrast). */
export const lightPalette: Palette = {
  canvas: '#FFFFFF',
  surface: '#F5F5F7',
  surface2: '#ECECEF',
  border: '#E3E3E8',
  text: '#0D0D12',
  text2: '#55555F',
  text3: '#8B8B95',
  accent: '#5B54E6',
  accentSubtle: '#ECEBFD',
  success: '#12A150',
  danger: '#DC3B3B',
  warn: '#B7791F',
};

/** The static dark palette — theme-independent consumers (RISK) and non-component reads. */
export const C = darkPalette;

// ── theme preference store (mirrors mode.ts) ─────────────────────────────────
export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'iw.theme.v1';
const listeners = new Set<() => void>();

export function getThemePref(): ThemePref {
  const v = storage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function setThemePref(p: ThemePref): void {
  storage.setItem(KEY, p);
  listeners.forEach((l) => l());
}

/** The palette to render with right now, resolving 'system' against the OS color scheme. */
export function activePalette(): Palette {
  const pref = getThemePref();
  const scheme = pref === 'system' ? Appearance.getColorScheme() : pref;
  return scheme === 'light' ? lightPalette : darkPalette;
}

/** True when the active palette is the light one (for StatusBar style, etc.). */
export function isLight(): boolean {
  return activePalette() === lightPalette;
}

/** Subscribe to the active palette — re-renders on setThemePref and on OS scheme change (when 'system'). */
export function useTheme(): Palette {
  const [, force] = useState(0);
  useEffect(() => {
    const bump = (): void => force((n) => n + 1);
    listeners.add(bump);
    const sub = Appearance.addChangeListener(() => {
      if (getThemePref() === 'system') bump();
    });
    return () => {
      listeners.delete(bump);
      sub.remove();
    };
  }, []);
  return activePalette();
}

export const THEME_PREFS: ThemePref[] = ['system', 'light', 'dark'];
export const THEME_LABEL: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/** 4-based spacing scale. gutter = base (16), card pad = base, section gap = lg (24). */
export const space = { xs: 4, sm: 8, md: 12, base: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
export const motion = { fast: 120, base: 200, slow: 320 } as const;
export const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

/** Apple-like type scale — numbers big, labels small + gray, one label per card. */
export const type = {
  display: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  caption: { fontSize: 12.5, fontWeight: '500' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
} as const;

/** Risk semantics — the only non-neutral color besides the accent, and only on state. */
export const RISK: Record<string, { label: string; color: string }> = {
  low: { label: 'Low risk', color: C.success },
  medium: { label: 'Caution', color: C.warn },
  high: { label: 'High risk', color: '#FB923C' },
  block: { label: 'Blocked', color: C.danger },
};
