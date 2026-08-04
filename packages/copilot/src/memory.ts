/**
 * Privacy-preserving preferences. `UserPreferences` is a CLOSED, enumerated
 * shape — enums, symbol-shaped strings, ratios and booleans only — so it is
 * structurally incapable of holding a private key, mnemonic, or address. Nothing
 * here stores a secret, and `sanitizePreferences` drops anything that doesn't
 * fit the enums/symbol pattern (defense in depth against a bad writer).
 */
export type Language = 'en' | 'es' | 'hi' | 'zh' | 'fr';
export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive';
export type RoutePreference = 'cheapest' | 'fastest' | 'safest' | 'balanced';

export interface UserPreferences {
  version: 1;
  language: Language;
  riskTolerance: RiskTolerance;
  /** Asset symbols only — validated against SYMBOL_RE. */
  preferredAssets: string[];
  avoidAssets: string[];
  /** symbol → target weight [0,1]. */
  targetAllocation?: Record<string, number>;
  automationPrefs: { dcaOptIn: boolean; stopLossOptIn: boolean; stableSweepOptIn: boolean };
  notificationPrefs: { alertsOptIn: boolean; weeklyReportOptIn: boolean };
  routePreference: RoutePreference;
}

export const SYMBOL_RE = /^[A-Z0-9]{1,10}$/;
const LANGUAGES: Language[] = ['en', 'es', 'hi', 'zh', 'fr'];
const TOLERANCES: RiskTolerance[] = ['conservative', 'balanced', 'aggressive'];
const ROUTES: RoutePreference[] = ['cheapest', 'fastest', 'safest', 'balanced'];

export function defaultPreferences(): UserPreferences {
  return {
    version: 1,
    language: 'en',
    riskTolerance: 'balanced',
    preferredAssets: [],
    avoidAssets: [],
    automationPrefs: { dcaOptIn: false, stopLossOptIn: false, stableSweepOptIn: false },
    notificationPrefs: { alertsOptIn: true, weeklyReportOptIn: true },
    routePreference: 'balanced',
  };
}

/** Coerce arbitrary input into valid preferences, dropping anything non-enumerated or secret-shaped. */
export function sanitizePreferences(input: Partial<UserPreferences>): UserPreferences {
  const base = defaultPreferences();
  const symbols = (xs: unknown): string[] =>
    Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string' && SYMBOL_RE.test(x)) : [];
  const out: UserPreferences = {
    ...base,
    language: input.language && LANGUAGES.includes(input.language) ? input.language : base.language,
    riskTolerance:
      input.riskTolerance && TOLERANCES.includes(input.riskTolerance) ? input.riskTolerance : base.riskTolerance,
    routePreference:
      input.routePreference && ROUTES.includes(input.routePreference) ? input.routePreference : base.routePreference,
    preferredAssets: symbols(input.preferredAssets),
    avoidAssets: symbols(input.avoidAssets),
    automationPrefs: { ...base.automationPrefs, ...(input.automationPrefs ?? {}) },
    notificationPrefs: { ...base.notificationPrefs, ...(input.notificationPrefs ?? {}) },
  };
  if (input.targetAllocation) {
    const alloc: Record<string, number> = {};
    for (const [k, v] of Object.entries(input.targetAllocation)) {
      if (SYMBOL_RE.test(k) && typeof v === 'number' && v >= 0 && v <= 1) alloc[k] = v;
    }
    if (Object.keys(alloc).length > 0) out.targetAllocation = alloc;
  }
  return out;
}

export interface PreferenceStore {
  load(preferencesId: string): Promise<UserPreferences | null>;
  save(preferencesId: string, prefs: UserPreferences): Promise<void>;
}

export class InMemoryPreferenceStore implements PreferenceStore {
  private readonly prefs = new Map<string, UserPreferences>();
  load(id: string): Promise<UserPreferences | null> {
    const p = this.prefs.get(id);
    return Promise.resolve(p ? structuredClone(p) : null);
  }
  save(id: string, prefs: UserPreferences): Promise<void> {
    this.prefs.set(id, sanitizePreferences(prefs));
    return Promise.resolve();
  }
}

/** Deterministic preference learning — writes only enumerated values, never free text. */
export class PreferenceLearner {
  /** Record an accepted suggestion, flipping the matching opt-in. */
  onAccepted(prefs: UserPreferences, kind: 'dca' | 'stop_loss' | 'stable_sweep'): UserPreferences {
    const next = structuredClone(prefs);
    if (kind === 'dca') next.automationPrefs.dcaOptIn = true;
    if (kind === 'stop_loss') next.automationPrefs.stopLossOptIn = true;
    if (kind === 'stable_sweep') next.automationPrefs.stableSweepOptIn = true;
    return next;
  }
}
