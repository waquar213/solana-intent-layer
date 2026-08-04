/**
 * Jurisdiction profiles as VERSIONED DATA. The registry is the single place a
 * deployment's regulatory posture lives — loaded, not coded. Rules:
 *  - versions are monotonic per id (a new posture is PUBLISHED, never mutated in
 *    place) so every past decision can be replayed against the exact version that
 *    produced it;
 *  - at most ONE active version per id at a time (publishing a new active version
 *    retires the previous one), so "which rules apply now" is unambiguous;
 *  - a profile is validated on register, so a malformed posture can't go live.
 *
 * The template profiles below are GENERIC starting points (conservative / standard
 * / minimal) — deliberately NOT country rules. A real deployment customizes them
 * per jurisdiction and publishes them as config; no code changes.
 */
import { ComplianceError } from './errors.js';
import type { JurisdictionProfile } from './types.js';

export function validateProfile(p: JurisdictionProfile): void {
  if (!p.id) throw new ComplianceError('INVALID_PROFILE', 'profile id is required');
  if (!Number.isInteger(p.version) || p.version < 1) {
    throw new ComplianceError('INVALID_PROFILE', `profile ${p.id}: version must be a positive integer`);
  }
  if (!(p.riskThreshold >= 0 && p.riskThreshold <= 1)) {
    throw new ComplianceError('INVALID_PROFILE', `profile ${p.id}: riskThreshold must be in [0,1]`);
  }
  if (p.highValueThresholdMicroUsd < 0n) {
    throw new ComplianceError('INVALID_PROFILE', `profile ${p.id}: highValueThreshold must be >= 0`);
  }
  // The list fields are required by the type but may be omitted in loaded JSON config;
  // a missing array would crash the gateway (`.includes` / `.find`), so reject it here.
  for (const [name, arr] of [
    ['disabledFeatures', p.disabledFeatures],
    ['consents', p.consents],
    ['retention', p.retention],
    ['reporting', p.reporting],
  ] as const) {
    if (!Array.isArray(arr)) throw new ComplianceError('INVALID_PROFILE', `profile ${p.id}: ${name} must be an array`);
  }
  const consentKeys = new Set<string>();
  for (const c of p.consents) {
    if (!c.key) throw new ComplianceError('INVALID_PROFILE', `profile ${p.id}: a consent requirement has an empty key`);
    if (consentKeys.has(c.key))
      throw new ComplianceError('INVALID_PROFILE', `profile ${p.id}: duplicate consent ${c.key}`);
    consentKeys.add(c.key);
  }
  for (const r of p.retention) {
    if (!Number.isFinite(r.retainDays) || r.retainDays < 0) {
      throw new ComplianceError(
        'INVALID_PROFILE',
        `profile ${p.id}: retainDays for ${r.dataClass} must be a finite, non-negative number`,
      );
    }
  }
}

interface Stored {
  profile: JurisdictionProfile;
}

export class ProfileRegistry {
  /** id → version → stored profile. */
  private readonly byId = new Map<string, Map<number, Stored>>();

  /** Publish a profile version. Enforces monotonic versions + single-active-per-id. */
  register(input: JurisdictionProfile): JurisdictionProfile {
    validateProfile(input);
    // DEEP copy: a shallow `{...input}` would alias the nested arrays (consents,
    // retention, reporting, disabledFeatures) with the caller's object, so a later
    // mutation of the caller's arrays would silently rewrite a published version —
    // breaking the "never mutated in place / replayable" invariant.
    const profile: JurisdictionProfile = structuredClone(input);
    const versions = this.byId.get(profile.id) ?? new Map<number, Stored>();

    if (versions.has(profile.version)) {
      throw new ComplianceError('VERSION_CONFLICT', `profile ${profile.id}@${profile.version} already exists`);
    }
    const maxVersion = Math.max(0, ...versions.keys());
    if (profile.version <= maxVersion) {
      throw new ComplianceError(
        'VERSION_CONFLICT',
        `profile ${profile.id}: version ${profile.version} is not greater than current max ${maxVersion}`,
      );
    }

    // Publishing a new ACTIVE version retires the previously active one.
    if (profile.status === 'active') {
      for (const stored of versions.values()) {
        if (stored.profile.status === 'active') stored.profile = { ...stored.profile, status: 'retired' };
      }
    }

    versions.set(profile.version, { profile });
    this.byId.set(profile.id, versions);
    return structuredClone(profile);
  }

  /** The single active version for a jurisdiction, or undefined (⇒ callers must fail closed). */
  getActive(id: string): JurisdictionProfile | undefined {
    const versions = this.byId.get(id);
    if (!versions) return undefined;
    for (const { profile } of versions.values()) {
      if (profile.status === 'active') return structuredClone(profile);
    }
    return undefined;
  }

  getVersion(id: string, version: number): JurisdictionProfile | undefined {
    const p = this.byId.get(id)?.get(version)?.profile;
    return p ? structuredClone(p) : undefined;
  }

  latest(id: string): JurisdictionProfile | undefined {
    const versions = this.byId.get(id);
    if (!versions) return undefined;
    const max = Math.max(...versions.keys());
    const p = versions.get(max)?.profile;
    return p ? structuredClone(p) : undefined;
  }

  list(id: string): JurisdictionProfile[] {
    return [...(this.byId.get(id)?.values() ?? [])]
      .map((s) => structuredClone(s.profile))
      .sort((a, b) => a.version - b.version);
  }
}

export function createProfileRegistry(seed: readonly JurisdictionProfile[] = []): ProfileRegistry {
  const reg = new ProfileRegistry();
  for (const p of seed) reg.register(p);
  return reg;
}

// ── Generic template profiles (NOT country rules — starting points to customize) ──

type Tier = 'conservative' | 'standard' | 'minimal';

export function templateProfile(
  id: string,
  tier: Tier,
  effectiveFromIso = '2026-01-01T00:00:00.000Z',
): JurisdictionProfile {
  const base = {
    id,
    version: 1,
    status: 'active' as const,
    effectiveFromIso,
    consents: [
      { key: 'tos', purpose: 'Terms of service acceptance', required: true },
      { key: 'privacy', purpose: 'Privacy policy acknowledgement', required: true },
    ],
    retention: [
      { dataClass: 'audit' as const, retainDays: 2555, legalHold: true }, // ~7y, legal hold
      { dataClass: 'financial' as const, retainDays: 1825, legalHold: true }, // ~5y
      { dataClass: 'identity' as const, retainDays: 365, legalHold: false },
      { dataClass: 'behavioral' as const, retainDays: 90, legalHold: false },
    ],
  };
  if (tier === 'conservative') {
    return {
      ...base,
      label: `${id} (conservative template)`,
      disabledFeatures: ['high_value_transfer', 'fiat_onramp'],
      riskThreshold: 0.5,
      highValueThresholdMicroUsd: 1_000_000_000n, // $1,000
      reporting: [
        { key: 'ctr', trigger: 'high_value_transfer', withinHours: 24 },
        { key: 'sar', trigger: 'suspicious_activity', withinHours: 72 },
        { key: 'sanctions', trigger: 'sanctions_hit', withinHours: 24 },
        { key: 'incident', trigger: 'security_incident', withinHours: 24 },
      ],
      screeningRequired: true,
      blockOnSanctions: true,
    };
  }
  if (tier === 'minimal') {
    return {
      ...base,
      label: `${id} (minimal template)`,
      disabledFeatures: [],
      riskThreshold: 0.85,
      highValueThresholdMicroUsd: 100_000_000_000n, // $100,000
      reporting: [{ key: 'sanctions', trigger: 'sanctions_hit', withinHours: 72 }],
      screeningRequired: false,
      blockOnSanctions: true,
    };
  }
  return {
    ...base,
    label: `${id} (standard template)`,
    disabledFeatures: [],
    riskThreshold: 0.7,
    highValueThresholdMicroUsd: 10_000_000_000n, // $10,000
    reporting: [
      { key: 'ctr', trigger: 'high_value_transfer', withinHours: 48 },
      { key: 'sanctions', trigger: 'sanctions_hit', withinHours: 48 },
      { key: 'incident', trigger: 'security_incident', withinHours: 48 },
    ],
    screeningRequired: true,
    blockOnSanctions: true,
  };
}
