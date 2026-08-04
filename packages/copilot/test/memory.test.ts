import { describe, expect, it } from 'vitest';
import { defaultPreferences, PreferenceLearner, sanitizePreferences } from '../src/index.js';

describe('UserPreferences — structurally secret-incapable', () => {
  it('keeps only symbol-shaped assets, dropping key/mnemonic-shaped strings', () => {
    const p = sanitizePreferences({
      preferredAssets: [
        'ETH',
        'USDC',
        '0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890',
        'lowercase',
      ],
    });
    expect(p.preferredAssets).toEqual(['ETH', 'USDC']); // the 64-hex key and lowercase are dropped
  });

  it('coerces invalid enums back to safe defaults', () => {
    const p = sanitizePreferences({ language: 'klingon' as never, riskTolerance: 'reckless' as never });
    expect(p.language).toBe('en');
    expect(p.riskTolerance).toBe('balanced');
  });

  it('only accepts target allocations that are symbol → ratio in [0,1]', () => {
    const p = sanitizePreferences({ targetAllocation: { ETH: 0.6, USDC: 0.4, BAD: 5, lowercase: 0.1 } });
    expect(p.targetAllocation).toEqual({ ETH: 0.6, USDC: 0.4 });
  });
});

describe('PreferenceLearner', () => {
  it('flips only the matching opt-in on an accepted suggestion', () => {
    const next = new PreferenceLearner().onAccepted(defaultPreferences(), 'dca');
    expect(next.automationPrefs.dcaOptIn).toBe(true);
    expect(next.automationPrefs.stopLossOptIn).toBe(false);
  });
});
