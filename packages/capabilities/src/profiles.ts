/**
 * Chain capability profiles as VERSIONED DATA — the single place a deployment's
 * per-chain feature posture lives, loaded not coded. Same invariants as the
 * compliance ProfileRegistry:
 *  - versions are monotonic per id (a new posture is PUBLISHED, never mutated), so a
 *    past decision replays against the exact version that produced it;
 *  - at most ONE active version per id, so "what can this chain do now" is unambiguous;
 *  - a profile is validated on register, so a malformed posture can't go live;
 *  - every stored/returned value is `structuredClone`d, so a caller can never alias
 *    and later rewrite a published version (readonly arrays included).
 *
 * A new chain is a new profile — never new code.
 */
import { CapabilityError } from './errors.js';
import {
  CAPABILITIES,
  CHAIN_AVAILABILITIES,
  ECOSYSTEMS,
  FEE_MODELS,
  PROFILE_STATUSES,
  TOKEN_STANDARDS,
  type ChainCapabilityProfile,
} from './types.js';

/** CAIP-2 shape: `namespace:reference` (e.g. eip155:1, bip122:bitcoin, solana:mainnet). */
const CAIP2 = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/u;

const FINALITY_KINDS = new Set(['confirmations', 'evm_finalized_tag', 'solana_commitment']);

export function validateChainProfile(p: ChainCapabilityProfile): void {
  const bad = (msg: string): never => {
    throw new CapabilityError('INVALID_PROFILE', msg);
  };

  if (!p.id) bad('profile id is required');
  if (!CAIP2.test(p.id)) bad(`profile ${p.id}: id must be a CAIP-2 id like 'eip155:1'`);
  if (!Number.isInteger(p.version) || p.version < 1) bad(`profile ${p.id}: version must be a positive integer`);
  if (!PROFILE_STATUSES.includes(p.status)) bad(`profile ${p.id}: unknown status '${p.status}'`);
  if (!CHAIN_AVAILABILITIES.includes(p.availability)) bad(`profile ${p.id}: unknown availability '${p.availability}'`);
  if (!ECOSYSTEMS.includes(p.ecosystem)) bad(`profile ${p.id}: unknown ecosystem '${p.ecosystem}'`);
  if (!FEE_MODELS.includes(p.feeModel)) bad(`profile ${p.id}: unknown feeModel '${p.feeModel}'`);
  if (!TOKEN_STANDARDS.includes(p.tokenStandard)) bad(`profile ${p.id}: unknown tokenStandard '${p.tokenStandard}'`);

  // Required string fields — validated so a malformed profile can't register (interface says string).
  if (typeof p.label !== 'string' || !p.label) bad(`profile ${p.id}: label must be a non-empty string`);
  if (typeof p.effectiveFromIso !== 'string' || !p.effectiveFromIso) {
    bad(`profile ${p.id}: effectiveFromIso must be a non-empty string`);
  }
  if (p.notes !== undefined && typeof p.notes !== 'string') bad(`profile ${p.id}: notes must be a string when present`);

  if (!p.nativeAsset || typeof p.nativeAsset.symbol !== 'string' || !p.nativeAsset.symbol) {
    bad(`profile ${p.id}: nativeAsset.symbol is required`);
  }
  if (typeof p.nativeAsset.name !== 'string' || !p.nativeAsset.name) {
    bad(`profile ${p.id}: nativeAsset.name must be a non-empty string`);
  }
  if (!Number.isInteger(p.nativeAsset.decimals) || p.nativeAsset.decimals < 0) {
    bad(`profile ${p.id}: nativeAsset.decimals must be a non-negative integer`);
  }

  if (!p.finality || !FINALITY_KINDS.has(p.finality.kind)) bad(`profile ${p.id}: invalid finality.kind`);
  // A confirmations-based chain must state HOW MANY; a Solana chain must state its commitment level.
  if (p.finality.kind === 'confirmations' && p.finality.confirmations === undefined) {
    bad(`profile ${p.id}: finality.confirmations is required when kind is 'confirmations'`);
  }
  if (
    p.finality.confirmations !== undefined &&
    (!Number.isInteger(p.finality.confirmations) || p.finality.confirmations < 0)
  ) {
    bad(`profile ${p.id}: finality.confirmations must be a non-negative integer`);
  }
  if (
    p.finality.kind === 'solana_commitment' &&
    p.finality.commitment !== 'confirmed' &&
    p.finality.commitment !== 'finalized'
  ) {
    bad(`profile ${p.id}: finality.commitment must be 'confirmed' or 'finalized' for a solana_commitment chain`);
  }

  if (!Array.isArray(p.capabilities)) bad(`profile ${p.id}: capabilities must be an array`);
  const seen = new Set<string>();
  for (const c of p.capabilities) {
    if (!CAPABILITIES.includes(c)) bad(`profile ${p.id}: unknown capability '${c}'`);
    if (seen.has(c)) bad(`profile ${p.id}: duplicate capability '${c}'`);
    seen.add(c);
  }

  // Shape-guard the nested objects BEFORE reading their booleans, so a null/wrong-typed
  // sub-object fails with a precise CapabilityError instead of a raw TypeError.
  const isObj = (v: unknown): boolean => typeof v === 'object' && v !== null;
  if (!isObj(p.staking) || typeof p.staking.supported !== 'boolean') bad(`profile ${p.id}: staking must be { supported: boolean }`);
  if (!isObj(p.smartAccount) || typeof p.smartAccount.supported !== 'boolean') {
    bad(`profile ${p.id}: smartAccount must be { supported: boolean }`);
  }
  if (!isObj(p.addressing)) bad(`profile ${p.id}: addressing must be an object`);

  // Cross-checks: a boolean sub-fact and its capability flag must agree, so a profile
  // can't claim `stake` in the vocabulary while saying staking.supported === false.
  if (p.staking.supported !== p.capabilities.includes('stake')) {
    bad(`profile ${p.id}: staking.supported must match the presence of the 'stake' capability`);
  }
  if (p.smartAccount.supported !== p.capabilities.includes('smart_account')) {
    bad(`profile ${p.id}: smartAccount.supported must match the presence of the 'smart_account' capability`);
  }
  if (typeof p.addressing?.memoRequired !== 'boolean' || typeof p.addressing?.destTagRequired !== 'boolean') {
    bad(`profile ${p.id}: addressing.memoRequired and destTagRequired must be booleans`);
  }
}

interface Stored {
  profile: ChainCapabilityProfile;
}

export class ChainCapabilityRegistry {
  /** id → version → stored profile. */
  private readonly byId = new Map<string, Map<number, Stored>>();

  /** Publish a profile version. Enforces monotonic versions + single-active-per-id. */
  register(input: ChainCapabilityProfile): ChainCapabilityProfile {
    validateChainProfile(input);
    // DEEP copy so the caller cannot alias the stored profile (its readonly arrays /
    // nested objects) and later rewrite a published version.
    const profile: ChainCapabilityProfile = structuredClone(input);
    const versions = this.byId.get(profile.id) ?? new Map<number, Stored>();

    if (versions.has(profile.version)) {
      throw new CapabilityError('VERSION_CONFLICT', `profile ${profile.id}@${profile.version} already exists`);
    }
    const maxVersion = Math.max(0, ...versions.keys());
    if (profile.version <= maxVersion) {
      throw new CapabilityError(
        'VERSION_CONFLICT',
        `profile ${profile.id}: version ${profile.version} is not greater than current max ${maxVersion}`,
      );
    }

    // Publishing a new ACTIVE version retires the previously active one. Mutate the
    // stored clone's status IN PLACE — a shallow spread (`{ ...stored.profile }`)
    // would alias the nested arrays with the discarded object, and since every public
    // read structuredClone()s, the stored copy is never handed out anyway.
    if (profile.status === 'active') {
      for (const stored of versions.values()) {
        if (stored.profile.status === 'active') stored.profile.status = 'retired';
      }
    }

    versions.set(profile.version, { profile });
    this.byId.set(profile.id, versions);
    return structuredClone(profile);
  }

  /** The single active version for a chain, or undefined ⇒ callers MUST fail closed. */
  getActive(id: string): ChainCapabilityProfile | undefined {
    const versions = this.byId.get(id);
    if (!versions) return undefined;
    for (const { profile } of versions.values()) {
      if (profile.status === 'active') return structuredClone(profile);
    }
    return undefined;
  }

  getVersion(id: string, version: number): ChainCapabilityProfile | undefined {
    const p = this.byId.get(id)?.get(version)?.profile;
    return p ? structuredClone(p) : undefined;
  }

  latest(id: string): ChainCapabilityProfile | undefined {
    const versions = this.byId.get(id);
    if (!versions || versions.size === 0) return undefined;
    const max = Math.max(...versions.keys());
    const p = versions.get(max)?.profile;
    return p ? structuredClone(p) : undefined;
  }

  list(id: string): ChainCapabilityProfile[] {
    return [...(this.byId.get(id)?.values() ?? [])]
      .map((s) => structuredClone(s.profile))
      .sort((a, b) => a.version - b.version);
  }

  /** Every known CAIP-2 chain id. */
  ids(): string[] {
    return [...this.byId.keys()];
  }
}

export function createChainCapabilityRegistry(
  seed: readonly ChainCapabilityProfile[] = [],
): ChainCapabilityRegistry {
  const reg = new ChainCapabilityRegistry();
  for (const p of seed) reg.register(p);
  return reg;
}
