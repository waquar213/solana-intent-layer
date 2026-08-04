import { describe, expect, it } from 'vitest';
import { detectConflicts, resolveConflicts, RuleEngine } from '../src/index.js';
import type { FiredRule, PolicyOutcome, PolicyRule } from '../src/index.js';
import { ctx } from './helpers.js';

const F = (ruleId: string, priority: number, outcome: PolicyOutcome, overridable = true): FiredRule => ({
  ruleId,
  type: 'transaction',
  priority,
  outcome,
  code: ruleId.toUpperCase(),
  reason: ruleId,
  matched: ['always'],
  overridable,
});

const rule = (id: string, priority: number, outcome: PolicyOutcome, enabled = true): PolicyRule => ({
  id,
  type: 'transaction',
  title: id,
  description: id,
  priority,
  enabled,
  when: { op: 'always' },
  effect: { outcome, code: id.toUpperCase(), reason: id },
  overridable: true,
  version: 1,
  createdAtIso: '2026-01-01T00:00:00.000Z',
  createdBy: 'test',
});

function shuffle<T>(xs: T[], seed: number): T[] {
  // deterministic LCG shuffle (no Math.random)
  const a = [...xs];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

describe('RuleEngine.run', () => {
  it('fires only satisfied, enabled rules in (priority desc, id asc) order', () => {
    const engine = new RuleEngine();
    const rules = [
      rule('b', 100, 'approved'),
      rule('a', 100, 'deferred'),
      rule('c', 500, 'approved_with_confirmation'),
      rule('d', 200, 'blocked', false), // disabled
    ];
    const fired = engine.run(rules, ctx());
    expect(fired.map((f) => f.ruleId)).toEqual(['c', 'a', 'b']); // 500, then 100/id-asc; d disabled
  });

  it('skips rules whose condition is not satisfied', () => {
    const engine = new RuleEngine();
    const r: PolicyRule = { ...rule('x', 100, 'blocked'), when: { op: 'device_untrusted' } };
    expect(engine.run([r], ctx()).length).toBe(0); // device is trusted
    expect(engine.run([r], ctx({ device: { trusted: false, biometricAvailable: true } })).length).toBe(1);
  });
});

describe('conflict detection', () => {
  it('detects the three conflict kinds', () => {
    expect(detectConflicts([F('a', 100, 'approved'), F('b', 200, 'deferred')])[0]?.kind).toBe('outcome_divergence');
    expect(detectConflicts([F('a', 100, 'approved'), F('b', 100, 'deferred')])[0]?.kind).toBe(
      'priority_tie_divergence',
    );
    expect(detectConflicts([F('a', 100, 'blocked', false), F('b', 300, 'approved')])[0]?.kind).toBe(
      'override_of_nonoverridable',
    );
  });
});

describe('conflict resolution', () => {
  it('a hard block wins and is terminal, even against a higher-priority approval', () => {
    const r = resolveConflicts([F('block', 100, 'blocked', false), F('approve', 999, 'approved')]);
    expect(r.winner).toBe('blocked');
    expect(r.by).toBe('hard_block');
  });

  it('a non-overridable floor cannot be lowered by a higher-priority looser rule', () => {
    const r = resolveConflicts([F('escalate', 100, 'escalated', false), F('approve', 900, 'approved')]);
    expect(r.winner).toBe('escalated');
    expect(r.by).toBe('nonoverridable_floor');
  });

  it('highest priority decides when uncontested', () => {
    const r = resolveConflicts([F('a', 900, 'approved_with_confirmation'), F('b', 100, 'deferred')]);
    expect(r.winner).toBe('approved_with_confirmation');
    expect(r.by).toBe('priority');
  });

  it('a priority tie is broken by most-restrictive', () => {
    const r = resolveConflicts([F('a', 500, 'approved'), F('b', 500, 'escalated')]);
    expect(r.winner).toBe('escalated');
    expect(r.by).toBe('most_restrictive');
  });

  it('is shuffle-invariant across 100 permutations', () => {
    const fired = [
      F('a', 300, 'approved'),
      F('b', 500, 'approved_with_confirmation'),
      F('c', 500, 'deferred'),
      F('d', 200, 'escalated', false),
      F('e', 100, 'approved'),
    ];
    const base = resolveConflicts(fired);
    for (let seed = 1; seed <= 100; seed++) {
      const r = resolveConflicts(shuffle(fired, seed));
      expect(r.winner).toBe(base.winner);
      expect(r.decidedBy).toEqual(base.decidedBy);
    }
  });
});
