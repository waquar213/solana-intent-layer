/**
 * Design tokens — the single, platform-agnostic source of truth encoded from
 * docs/design/01-tokens.md. Web (CSS vars) and React Native (StyleSheet) both
 * derive from these objects, so a token change happens in ONE place
 * (handbook 02 §3, design 01 §8). No component hardcodes a raw value.
 */

/** Semantic color roles. Light/dark pairs; components reference roles, never raw hex. */
export const colors = {
  light: {
    'bg.canvas': '#F7F7F8',
    'bg.surface': '#FFFFFF',
    'bg.surface2': '#F0F0F2',
    'border.subtle': '#E4E4E8',
    'border.strong': '#C9C9D0',
    'text.primary': '#17171B',
    'text.secondary': '#5A5A64',
    'text.tertiary': '#8B8B96',
    'text.inverse': '#FFFFFF',
    'accent.base': '#4F46E5',
    'accent.pressed': '#4038C7',
    'accent.subtle': '#EEEDFD',
    'accent.onAccent': '#FFFFFF',
    'success.base': '#0F9D58',
    'warning.base': '#B45309',
    'danger.base': '#DC2626',
    'info.base': '#0369A1',
    'risk.low': '#0F9D58',
    'risk.medium': '#B45309',
    'risk.high': '#EA580C',
    'risk.block': '#DC2626',
  },
  dark: {
    'bg.canvas': '#0E0E10',
    'bg.surface': '#1A1A1E',
    'bg.surface2': '#242429',
    'border.subtle': '#2E2E34',
    'border.strong': '#3F3F47',
    'text.primary': '#F4F4F6',
    'text.secondary': '#A3A3AE',
    'text.tertiary': '#6E6E78',
    'text.inverse': '#17171B',
    'accent.base': '#6D66F6',
    'accent.pressed': '#5B54E0',
    'accent.subtle': '#26244B',
    'accent.onAccent': '#FFFFFF',
    'success.base': '#34C77B',
    'warning.base': '#F59E0B',
    'danger.base': '#F87171',
    'info.base': '#38BDF8',
    'risk.low': '#34C77B',
    'risk.medium': '#F59E0B',
    'risk.high': '#FB923C',
    'risk.block': '#F87171',
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type ColorRole = keyof (typeof colors)['light'];

/** 4-pt spacing scale (design 01 §3). Keyed by step; value in points. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = { xs: 8, sm: 12, md: 16, lg: 24, full: 9999 } as const;

/** Type scale: [fontSize, lineHeight, weight] (design 01 §2). */
export const typography = {
  display: { size: 40, line: 46, weight: 700 },
  title1: { size: 28, line: 34, weight: 700 },
  title2: { size: 22, line: 28, weight: 600 },
  headline: { size: 17, line: 22, weight: 600 },
  body: { size: 17, line: 24, weight: 400 },
  callout: { size: 16, line: 21, weight: 400 },
  subhead: { size: 15, line: 20, weight: 400 },
  footnote: { size: 13, line: 18, weight: 400 },
  caption: { size: 11, line: 13, weight: 500 },
  mono: { size: 15, line: 20, weight: 450 },
} as const;

export const motion = {
  instant: 80,
  quick: 200,
  standard: 300,
  celebrate: 600,
} as const;

/** Minimum touch target and key sizes (design 01 §3) — hard accessibility rules. */
export const sizing = {
  touchMin: 44,
  buttonHeight: 52,
  rowSm: 48,
  rowMd: 56,
  rowLg: 72,
} as const;

/** Risk level → token role + label (design 01 §1.4). NEVER color-only in UI. */
export const riskPresentation = {
  low: { color: 'risk.low', label: 'Low risk' },
  medium: { color: 'risk.medium', label: 'Caution' },
  high: { color: 'risk.high', label: 'High risk' },
  block: { color: 'risk.block', label: 'Blocked' },
} as const satisfies Record<string, { color: ColorRole; label: string }>;

/** Flattens a color scheme into CSS custom properties (`--color-...`) for the web build. */
export function toCssVars(scheme: ColorScheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, value] of Object.entries(colors[scheme])) {
    out[`--color-${role.replace(/\./gu, '-')}`] = value;
  }
  return out;
}
