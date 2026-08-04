/**
 * Trust levels drive capability. The four levels form an ESCALATING permission
 * ceiling — an experimental plugin simply cannot hold `background.execute` no matter
 * what the user approves, while an official (first-party) plugin can. This gives
 * users an informed, visible signal AND enforces a hard cap the UI can't override:
 *
 *   experimental (L4): read-only + notifications  — loud warnings, tiny resources
 *   community    (L3): + propose-intent, provider  — reviewed; warnings on sensitive
 *   verified     (L2): + portfolio annotate, automation — trusted partner
 *   official     (L1): + background execution (all)  — first-party, auto-approvable
 *
 * A permission a plugin requests above its trust ceiling is REJECTED (not merely
 * warned) — the ceiling is a wall, the user's approval is a second, independent gate.
 */
import {
  ALL_PERMISSIONS,
  SENSITIVE_PERMISSIONS,
  type Permission,
  type ResourceLimits,
  type TrustLevel,
} from './types.js';

const EXPERIMENTAL: readonly Permission[] = [
  'portfolio.read',
  'intent.read',
  'analytics.read',
  'blockchain.read',
  'notifications.send',
];
const COMMUNITY: readonly Permission[] = [...EXPERIMENTAL, 'intent.create', 'provider.access'];
const VERIFIED: readonly Permission[] = [...COMMUNITY, 'portfolio.write', 'automation.access'];
const OFFICIAL: readonly Permission[] = ALL_PERMISSIONS; // includes background.execute

export interface TrustPolicy {
  ceiling: readonly Permission[];
  /** First-party plugins are pre-approved; everything else needs explicit user approval. */
  autoApprovable: boolean;
  /** Show a prominent trust warning at install. */
  requiresWarning: boolean;
  resourceCeiling: ResourceLimits;
}

export const TRUST_POLICY: Record<TrustLevel, TrustPolicy> = {
  official: {
    ceiling: OFFICIAL,
    autoApprovable: true,
    requiresWarning: false,
    resourceCeiling: { memoryMb: 512, cpuMs: 10_000, storageMb: 500, timeoutMs: 30_000 },
  },
  verified: {
    ceiling: VERIFIED,
    autoApprovable: false,
    requiresWarning: false,
    resourceCeiling: { memoryMb: 256, cpuMs: 3_000, storageMb: 100, timeoutMs: 10_000 },
  },
  community: {
    ceiling: COMMUNITY,
    autoApprovable: false,
    requiresWarning: true,
    resourceCeiling: { memoryMb: 128, cpuMs: 1_000, storageMb: 20, timeoutMs: 5_000 },
  },
  experimental: {
    ceiling: EXPERIMENTAL,
    autoApprovable: false,
    requiresWarning: true,
    resourceCeiling: { memoryMb: 64, cpuMs: 500, storageMb: 5, timeoutMs: 2_000 },
  },
};

export interface TrustEvaluation {
  trustLevel: TrustLevel;
  /** Requested permissions that are within the trust ceiling (candidates for user approval). */
  grantable: Permission[];
  /** Requested permissions that EXCEED the ceiling — hard-rejected. */
  rejected: Permission[];
  /** Sensitive grantable permissions the user must be warned about. */
  warnings: Permission[];
  autoApprovable: boolean;
  requiresTrustWarning: boolean;
  resourceCeiling: ResourceLimits;
}

/** Split a plugin's requested permissions against its trust ceiling. */
export function evaluateTrust(trustLevel: TrustLevel, requested: readonly Permission[]): TrustEvaluation {
  const policy = TRUST_POLICY[trustLevel];
  const ceiling = new Set(policy.ceiling);
  const sensitive = new Set(SENSITIVE_PERMISSIONS);
  const grantable: Permission[] = [];
  const rejected: Permission[] = [];
  for (const p of requested) (ceiling.has(p) ? grantable : rejected).push(p);
  return {
    trustLevel,
    grantable,
    rejected,
    warnings: grantable.filter((p) => sensitive.has(p)),
    autoApprovable: policy.autoApprovable,
    requiresTrustWarning: policy.requiresWarning,
    resourceCeiling: policy.resourceCeiling,
  };
}

/** Clamp a plugin's requested resource limits to its trust ceiling. */
export function resolveLimits(trustLevel: TrustLevel, requested?: Partial<ResourceLimits>): ResourceLimits {
  const ceil = TRUST_POLICY[trustLevel].resourceCeiling;
  const pick = (req: number | undefined, cap: number): number =>
    req === undefined || !Number.isFinite(req) || req <= 0 ? cap : Math.min(req, cap);
  return {
    memoryMb: pick(requested?.memoryMb, ceil.memoryMb),
    cpuMs: pick(requested?.cpuMs, ceil.cpuMs),
    storageMb: pick(requested?.storageMb, ceil.storageMb),
    timeoutMs: pick(requested?.timeoutMs, ceil.timeoutMs),
  };
}
