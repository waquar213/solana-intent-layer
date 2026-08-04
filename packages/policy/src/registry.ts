/**
 * Policy Registry — storage, versioning, and inheritance resolution. `activeSet`
 * resolves a principal's set by walking the parent-set chain, merging rules
 * (child overrides parent by id), enforcing that a child may only be
 * equal-or-more-restrictive than a non-overridable parent, then content-hashing
 * and deep-freezing the result. Stores isolate with structuredClone (the same
 * pattern the Execution store uses) so a caller can never mutate stored state.
 */
import { PolicyError } from './errors.js';
import type { PolicyEnv } from './env.js';
import { OUTCOME_RANK } from './types.js';
import type { PolicyRule, PolicySet } from './types.js';

const bigintSafe = (_k: string, v: unknown): unknown => (typeof v === 'bigint' ? `${v}n` : v);

/** Canonical serialization of a rule list (order-independent), for hashing + diffing. */
export function canonicalizeRules(rules: PolicyRule[]): string {
  return JSON.stringify(
    [...rules].sort((a, b) => a.id.localeCompare(b.id)),
    bigintSafe,
  );
}

export function contentHashOf(rules: PolicyRule[], env: PolicyEnv): string {
  return env.hash(canonicalizeRules(rules));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/**
 * A child override may not weaken a non-overridable parent rule in ANY way:
 * not by lowering its outcome rank, not by DISABLING it (which would drop it at
 * resolve time), and not by flipping it to overridable. Anything else is fine.
 */
export function assertDoesNotLoosen(parent: PolicyRule, child: PolicyRule): void {
  if (parent.overridable) return;
  if (!child.enabled) {
    throw new PolicyError('LOOSENS_NONOVERRIDABLE', `rule "${child.id}" disables non-overridable rule`);
  }
  if (child.overridable) {
    throw new PolicyError('LOOSENS_NONOVERRIDABLE', `rule "${child.id}" makes a non-overridable rule overridable`);
  }
  if (OUTCOME_RANK[child.effect.outcome] < OUTCOME_RANK[parent.effect.outcome]) {
    throw new PolicyError('LOOSENS_NONOVERRIDABLE', `rule "${child.id}" loosens non-overridable rule`);
  }
}

/** Merge parent rules with child overrides (child wins by id); enforce the non-overridable floor. */
export function mergeRules(parent: PolicyRule[], child: PolicyRule[]): PolicyRule[] {
  const byId = new Map<string, PolicyRule>();
  for (const r of parent) byId.set(r.id, r);
  for (const c of child) {
    const p = byId.get(c.id);
    if (p) assertDoesNotLoosen(p, c);
    byId.set(c.id, c);
  }
  return [...byId.values()];
}

export interface PolicyStore {
  load(setId: string): Promise<PolicySet | null>;
  save(set: PolicySet): Promise<void>;
  activeSetIdFor(principalId: string): Promise<string | null>;
  setActive(principalId: string, setId: string): Promise<void>;
}

export interface PolicyVersionStore {
  append(set: PolicySet): Promise<void>;
  history(setId: string): Promise<PolicySet[]>;
  at(setId: string, version: number): Promise<PolicySet | null>;
}

export class InMemoryPolicyStore implements PolicyStore {
  private readonly sets = new Map<string, PolicySet>();
  private readonly active = new Map<string, string>();
  load(setId: string): Promise<PolicySet | null> {
    const s = this.sets.get(setId);
    return Promise.resolve(s ? structuredClone(s) : null);
  }
  save(set: PolicySet): Promise<void> {
    this.sets.set(set.id, structuredClone(set));
    return Promise.resolve();
  }
  activeSetIdFor(principalId: string): Promise<string | null> {
    return Promise.resolve(this.active.get(principalId) ?? null);
  }
  setActive(principalId: string, setId: string): Promise<void> {
    this.active.set(principalId, setId);
    return Promise.resolve();
  }
}

export class InMemoryPolicyVersionStore implements PolicyVersionStore {
  private readonly versions = new Map<string, PolicySet[]>();
  append(set: PolicySet): Promise<void> {
    const list = this.versions.get(set.id) ?? [];
    list.push(structuredClone(set));
    this.versions.set(set.id, list);
    return Promise.resolve();
  }
  history(setId: string): Promise<PolicySet[]> {
    return Promise.resolve((this.versions.get(setId) ?? []).map((s) => structuredClone(s)));
  }
  at(setId: string, version: number): Promise<PolicySet | null> {
    const found = (this.versions.get(setId) ?? []).find((s) => s.version === version);
    return Promise.resolve(found ? structuredClone(found) : null);
  }
}

export class PolicyRegistry {
  constructor(
    private readonly store: PolicyStore,
    private readonly env: PolicyEnv,
    /** Fallback when a principal has no active set. */
    private readonly defaultSet: PolicySet,
  ) {}

  /** Resolve the principal's effective, inheritance-flattened, content-hashed, frozen policy set. */
  async activeSet(principalId: string): Promise<PolicySet> {
    const activeId = await this.store.activeSetIdFor(principalId);
    if (activeId === null) return deepFreeze(this.rehash(this.defaultSet));
    const resolved = await this.resolve(activeId, new Set());
    if (!resolved) return deepFreeze(this.rehash(this.defaultSet));
    return deepFreeze(this.rehash(resolved));
  }

  private async resolve(setId: string, seen: Set<string>): Promise<PolicySet | null> {
    if (seen.has(setId)) throw new PolicyError('INVALID_POLICY_SET', `cyclic parentSet chain at "${setId}"`);
    seen.add(setId);
    const set = await this.store.load(setId);
    if (!set) return null;
    if (set.parentSetId === undefined) return set;
    const parent = await this.resolve(set.parentSetId, seen);
    const parentRules = parent?.rules ?? [];
    const { parentSetId: _dropped, ...rest } = set;
    return { ...rest, rules: mergeRules(parentRules, set.rules) };
  }

  private rehash(set: PolicySet): PolicySet {
    const enabled = set.rules.filter((r) => r.enabled);
    return { ...set, rules: enabled, contentHash: contentHashOf(enabled, this.env) };
  }
}
