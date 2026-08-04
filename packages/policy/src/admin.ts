/**
 * Policy administration — CRUD, version history, rollback. Every mutation bumps
 * the version and appends to the immutable version store, so history is
 * append-only and any prior version can be restored. Writes enforce the same
 * non-overridable floor the registry enforces at resolve time (defense in
 * depth): an update may not loosen a non-overridable rule.
 */
import { PolicyError } from './errors.js';
import type { PolicyEnv } from './env.js';
import { assertDoesNotLoosen, contentHashOf } from './registry.js';
import type { PolicyStore, PolicyVersionStore } from './registry.js';
import type { PolicyBasis, PolicyRule, PolicySet } from './types.js';

function validateRules(rules: PolicyRule[]): void {
  const ids = new Set<string>();
  for (const r of rules) {
    if (!r.id) throw new PolicyError('INVALID_RULE', 'rule id is required');
    if (ids.has(r.id)) throw new PolicyError('INVALID_RULE', `duplicate rule id "${r.id}"`);
    ids.add(r.id);
    if (!Number.isFinite(r.priority)) throw new PolicyError('INVALID_RULE', `rule "${r.id}" has a non-finite priority`);
  }
}

/**
 * Reject a next-rule-set that loosens a non-overridable rule present in the
 * previous set — by lowering its rank, DISABLING it, dropping it entirely, or
 * flipping it to overridable. (Removal is caught by requiring every prior
 * non-overridable rule to still be present.)
 */
function assertNoLoosening(previous: PolicyRule[], next: PolicyRule[]): void {
  const nextById = new Map(next.map((r) => [r.id, r]));
  for (const p of previous) {
    if (p.overridable) continue;
    const n = nextById.get(p.id);
    if (!n) throw new PolicyError('LOOSENS_NONOVERRIDABLE', `update removes non-overridable rule "${p.id}"`);
    assertDoesNotLoosen(p, n);
  }
}

export interface UpdatePatch {
  rules?: PolicyRule[];
  basis?: PolicyBasis;
}

export class PolicyAdmin {
  constructor(
    private readonly store: PolicyStore,
    private readonly versions: PolicyVersionStore,
    private readonly env: PolicyEnv,
  ) {}

  async create(set: PolicySet): Promise<PolicySet> {
    validateRules(set.rules);
    const created: PolicySet = { ...set, version: 1, contentHash: contentHashOf(set.rules, this.env) };
    await this.store.save(created);
    await this.versions.append(created);
    return created;
  }

  async update(setId: string, patch: UpdatePatch): Promise<PolicySet> {
    const current = await this.store.load(setId);
    if (!current) throw new PolicyError('SET_NOT_FOUND', `policy set "${setId}" not found`);
    const rules = patch.rules ?? current.rules;
    validateRules(rules);
    assertNoLoosening(current.rules, rules);
    const next: PolicySet = {
      ...current,
      rules,
      basis: patch.basis ?? current.basis,
      version: current.version + 1,
      contentHash: contentHashOf(rules, this.env),
      createdAtIso: this.env.now(),
    };
    await this.store.save(next);
    await this.versions.append(next);
    return next;
  }

  async rollback(setId: string, toVersion: number): Promise<PolicySet> {
    const target = await this.versions.at(setId, toVersion);
    if (!target) throw new PolicyError('VERSION_NOT_FOUND', `version ${toVersion} of "${setId}" not found`);
    const current = await this.store.load(setId);
    const nextVersion = (current?.version ?? target.version) + 1;
    // Re-save the old rules as a NEW version; history stays immutable.
    const restored: PolicySet = {
      ...target,
      version: nextVersion,
      contentHash: contentHashOf(target.rules, this.env),
      createdAtIso: this.env.now(),
    };
    await this.store.save(restored);
    await this.versions.append(restored);
    return restored;
  }
}
