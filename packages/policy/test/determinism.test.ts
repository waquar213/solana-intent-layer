import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createInMemorySources, createPolicyEngine, createTestEnv } from '../src/index.js';
import { cleanRisk, req } from './helpers.js';

describe('determinism', () => {
  it('identical inputs yield an identical decision hash across many runs', async () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const engine = createPolicyEngine({ sources: createInMemorySources(cleanRisk()) });
      const p = await engine.evaluate(req({ amountMicros: 5_000_000_000n }));
      hashes.add(p.policy.decisionHash);
    }
    expect(hashes.size).toBe(1);
  });

  it('the decision hash is independent of the clock; only timestamps change', async () => {
    const mk = (nowIso: string) =>
      createPolicyEngine({ sources: createInMemorySources(cleanRisk()), env: createTestEnv({ nowIso }) });
    const a = await mk('2026-01-01T00:00:00.000Z').evaluate(req({ amountMicros: 5_000_000_000n }));
    const b = await mk('2029-12-31T23:59:59.000Z').evaluate(req({ amountMicros: 5_000_000_000n }));
    expect(a.policy.decisionHash).toBe(b.policy.decisionHash);
    expect(a.policy.evaluatedAtIso).not.toBe(b.policy.evaluatedAtIso);
  });

  it('the evaluator modules reach no clock/RNG/network/env', () => {
    const banned = /Date\.now|Math\.random|require\(['"]crypto|from ['"]node:crypto|fetch\(|process\.env/;
    for (const mod of ['conditions.ts', 'rules.ts', 'decision.ts', 'metrics.ts', 'presets.ts']) {
      const src = readFileSync(fileURLToPath(new URL(`../src/${mod}`, import.meta.url)), 'utf8');
      expect(src, `${mod} must be clock/RNG/network free`).not.toMatch(banned);
    }
  });
});
