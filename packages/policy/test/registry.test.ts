import { describe, expect, it } from 'vitest';
import {
  createTestEnv,
  InMemoryPolicyStore,
  InMemoryPolicyVersionStore,
  PolicyAdmin,
  PolicyRegistry,
  POLICY_PRESETS,
} from '../src/index.js';
import type { PolicyRule, PolicySet } from '../src/index.js';

const env = createTestEnv();

const rule = (id: string, outcome: PolicyRule['effect']['outcome'], overridable: boolean): PolicyRule => ({
  id,
  type: 'transaction',
  title: id,
  description: id,
  priority: 500,
  enabled: true,
  when: { op: 'always' },
  effect: { outcome, code: id.toUpperCase(), reason: id },
  overridable,
  version: 1,
  createdAtIso: '2026-01-01T00:00:00.000Z',
  createdBy: 'test',
});

const set = (id: string, rules: PolicyRule[], parentSetId?: string): PolicySet => ({
  id,
  name: id,
  version: 1,
  rules,
  basis: 'custom',
  createdAtIso: '2026-01-01T00:00:00.000Z',
  createdBy: 'test',
  contentHash: 'x',
  ...(parentSetId ? { parentSetId } : {}),
});

describe('PolicyRegistry — inheritance + non-overridable floor', () => {
  it('merges parent rules and content-hashes the resolved set', async () => {
    const store = new InMemoryPolicyStore();
    await store.save(set('parent', [rule('base', 'approved_with_confirmation', true)]));
    await store.save(set('child', [rule('extra', 'deferred', true)], 'parent'));
    await store.setActive('user-1', 'child');

    const registry = new PolicyRegistry(store, env, POLICY_PRESETS.balanced);
    const active = await registry.activeSet('user-1');
    expect(active.rules.map((r) => r.id).sort()).toEqual(['base', 'extra']);
    expect(active.contentHash).not.toBe('x'); // recomputed
    expect(Object.isFrozen(active)).toBe(true);
  });

  it('a child cannot loosen a non-overridable parent rule', async () => {
    const store = new InMemoryPolicyStore();
    await store.save(set('parent', [rule('hard', 'blocked', false)]));
    await store.save(set('child', [rule('hard', 'approved', true)], 'parent')); // tries to loosen
    await store.setActive('user-1', 'child');

    const registry = new PolicyRegistry(store, env, POLICY_PRESETS.balanced);
    await expect(registry.activeSet('user-1')).rejects.toThrow(/non-overridable/i);
  });

  it('a child cannot NEUTRALIZE a non-overridable rule by disabling it (enabled:false)', async () => {
    const store = new InMemoryPolicyStore();
    await store.save(set('parent', [rule('hard', 'blocked', false)]));
    // Same id, same outcome — but enabled:false, which would be dropped at resolve time.
    await store.save(set('child', [{ ...rule('hard', 'blocked', false), enabled: false }], 'parent'));
    await store.setActive('user-1', 'child');

    const registry = new PolicyRegistry(store, env, POLICY_PRESETS.balanced);
    await expect(registry.activeSet('user-1')).rejects.toThrow(/disables non-overridable|LOOSENS/);
  });

  it('falls back to the default set when a principal has none active', async () => {
    const registry = new PolicyRegistry(new InMemoryPolicyStore(), env, POLICY_PRESETS.strict);
    const active = await registry.activeSet('nobody');
    expect(active.basis).toBe('strict');
  });
});

describe('PolicyAdmin — versioning, loosening guard, rollback', () => {
  it('bumps the version on update and refuses to loosen a non-overridable rule', async () => {
    const store = new InMemoryPolicyStore();
    const versions = new InMemoryPolicyVersionStore();
    const admin = new PolicyAdmin(store, versions, env);
    const created = await admin.create(set('s1', [rule('hard', 'blocked', false)]));
    expect(created.version).toBe(1);

    const updated = await admin.update('s1', {
      rules: [rule('hard', 'blocked', false), rule('soft', 'approved', true)],
    });
    expect(updated.version).toBe(2);
    expect((await versions.history('s1')).length).toBe(2);

    await expect(admin.update('s1', { rules: [rule('hard', 'approved', true)] })).rejects.toThrow(/non-overridable/i);
    // …nor by disabling it…
    await expect(
      admin.update('s1', { rules: [{ ...rule('hard', 'blocked', false), enabled: false }] }),
    ).rejects.toThrow(/non-overridable/i);
    // …nor by removing it entirely.
    await expect(admin.update('s1', { rules: [rule('soft', 'approved', true)] })).rejects.toThrow(/non-overridable/i);
  });

  it('rollback restores an old version as a new version (history immutable)', async () => {
    const store = new InMemoryPolicyStore();
    const versions = new InMemoryPolicyVersionStore();
    const admin = new PolicyAdmin(store, versions, env);
    await admin.create(set('s1', [rule('a', 'approved', true)]));
    await admin.update('s1', { rules: [rule('a', 'blocked', true)] }); // v2
    const restored = await admin.rollback('s1', 1);
    expect(restored.version).toBe(3);
    expect(restored.rules[0]!.effect.outcome).toBe('approved'); // back to v1's rule
    expect((await versions.history('s1')).map((v) => v.version)).toEqual([1, 2, 3]);
  });
});
