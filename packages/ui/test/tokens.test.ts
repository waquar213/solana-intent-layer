import { describe, expect, it } from 'vitest';
import { colors, radius, riskPresentation, sizing, space, toCssVars, typography } from '../src/tokens/index.js';

const HEX = /^#[0-9A-Fa-f]{6}$/u;

describe('color tokens', () => {
  it('light and dark define the exact same set of roles (no scheme drift)', () => {
    expect(Object.keys(colors.dark)).toEqual(Object.keys(colors.light));
  });

  it('every color value is a valid 6-digit hex', () => {
    for (const scheme of [colors.light, colors.dark]) {
      for (const [role, value] of Object.entries(scheme)) {
        expect(value, role).toMatch(HEX);
      }
    }
  });

  it('exposes the four risk roles required by the design system', () => {
    for (const role of ['risk.low', 'risk.medium', 'risk.high', 'risk.block']) {
      expect(colors.light).toHaveProperty(role);
    }
  });
});

describe('spacing scale', () => {
  it('follows the 4-pt grid', () => {
    for (const value of Object.values(space)) {
      expect(value % 4).toBe(0);
    }
  });
});

describe('typography scale', () => {
  it('line height is never smaller than font size', () => {
    for (const [name, t] of Object.entries(typography)) {
      expect(t.line, name).toBeGreaterThanOrEqual(t.size);
    }
  });
});

describe('accessibility sizing', () => {
  it('minimum touch target meets the 44pt rule', () => {
    expect(sizing.touchMin).toBeGreaterThanOrEqual(44);
  });
});

describe('risk presentation', () => {
  it('every level carries a color role AND a text label (never color alone)', () => {
    for (const [level, p] of Object.entries(riskPresentation)) {
      expect(colors.light, level).toHaveProperty(p.color);
      expect(p.label.length, level).toBeGreaterThan(0);
    }
  });
});

describe('toCssVars', () => {
  it('emits kebab-cased custom properties for a scheme', () => {
    const vars = toCssVars('light');
    expect(vars['--color-bg-canvas']).toBe(colors.light['bg.canvas']);
    expect(vars['--color-accent-base']).toBe(colors.light['accent.base']);
    expect(Object.keys(vars)).toHaveLength(Object.keys(colors.light).length);
  });
});

describe('radius scale', () => {
  it('is monotonically increasing up to full', () => {
    expect(radius.xs).toBeLessThan(radius.sm);
    expect(radius.sm).toBeLessThan(radius.md);
    expect(radius.md).toBeLessThan(radius.lg);
    expect(radius.full).toBeGreaterThan(radius.lg);
  });
});
