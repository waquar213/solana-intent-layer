import { afterAll, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { newDb } from 'pg-mem';
import type { ExecutionPlan } from '@intent-wallet/runtime';
import { InMemoryPlanStore, PostgresPlanStore, SqlitePlanStore, type PgQueryable } from '../src/persistence/plan-store.js';

// The store only reads plan.planId and JSON-round-trips the rest.
const fakePlan = (id: string): ExecutionPlan => ({ planId: id, intentKind: 'transfer', note: id } as unknown as ExecutionPlan);

describe('InMemoryPlanStore', () => {
  it('remembers, gets, and evicts the oldest past the cap', async () => {
    const store = new InMemoryPlanStore(2);
    await store.remember(fakePlan('a'), 'alice');
    await store.remember(fakePlan('b'), 'alice');
    expect((await store.get('a'))?.plan.planId).toBe('a');
    await store.remember(fakePlan('c'), 'alice'); // evicts 'a'
    expect(await store.get('a')).toBeNull();
    expect((await store.get('c'))?.plan.planId).toBe('c');
  });

  it('records the owner so ownership can be enforced', async () => {
    const store = new InMemoryPlanStore();
    await store.remember(fakePlan('p'), 'alice');
    expect((await store.get('p'))?.owner).toBe('alice');
  });
});

describe('SqlitePlanStore', () => {
  const path = join(tmpdir(), `iw-plans-test-${process.pid}.db`);
  afterAll(() => {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try {
        rmSync(path + suffix);
      } catch {
        /* ignore */
      }
    }
  });

  it('persists a plan + owner across a "restart" (a fresh instance on the same file)', async () => {
    const store = new SqlitePlanStore(path);
    await store.remember(fakePlan('plan-xyz'), 'alice');
    await store.close();

    // Simulate a process restart: a brand-new store over the same file.
    const reopened = new SqlitePlanStore(path);
    const got = await reopened.get('plan-xyz');
    expect(got?.plan.planId).toBe('plan-xyz');
    expect(got?.owner).toBe('alice');
    expect(await reopened.get('missing')).toBeNull();
    await reopened.close();
  });

  it('migrates a legacy .plans.db (no owner column) instead of throwing', async () => {
    const legacyPath = join(tmpdir(), `iw-plans-legacy-${process.pid}.db`);
    // Seed a pre-owner-column schema, exactly as an old build left it.
    const legacy = new DatabaseSync(legacyPath);
    legacy.exec('CREATE TABLE plans (plan_id TEXT PRIMARY KEY, plan TEXT NOT NULL, created_at INTEGER NOT NULL)');
    legacy.prepare('INSERT INTO plans (plan_id, plan, created_at) VALUES (?, ?, ?)').run('old-1', JSON.stringify(fakePlan('old-1')), 1);
    legacy.close();

    // Opening with the current store must ALTER-add owner and keep working.
    const store = new SqlitePlanStore(legacyPath);
    expect((await store.get('old-1'))?.plan.planId).toBe('old-1'); // legacy row readable
    await store.remember(fakePlan('new-1'), 'alice'); // new writes carry an owner
    expect((await store.get('new-1'))?.owner).toBe('alice');
    await store.close();
    rmSync(legacyPath, { force: true });
  });

  it('prunes beyond the cap, keeping the newest', async () => {
    const capped = new SqlitePlanStore(join(tmpdir(), `iw-plans-cap-${process.pid}.db`), 2);
    await capped.remember(fakePlan('1'), 'alice');
    await capped.remember(fakePlan('2'), 'alice');
    await capped.remember(fakePlan('3'), 'alice');
    expect(await capped.get('1')).toBeNull(); // oldest pruned
    expect((await capped.get('3'))?.plan.planId).toBe('3');
    await capped.close();
    rmSync(join(tmpdir(), `iw-plans-cap-${process.pid}.db`), { force: true });
  });
});

describe('PostgresPlanStore (against an in-process Postgres via pg-mem)', () => {
  /** A pg-mem-backed pool speaking the same SQL a real Postgres would. */
  const makePool = (): PgQueryable => {
    const { Pool } = newDb().adapters.createPg();
    return new Pool() as unknown as PgQueryable;
  };

  it('round-trips plan + owner and enforces the JSONB/owner columns', async () => {
    const store = new PostgresPlanStore(makePool());
    await store.remember(fakePlan('pg-1'), 'alice');
    const got = await store.get('pg-1');
    expect(got?.plan.planId).toBe('pg-1');
    expect(got?.owner).toBe('alice');
    expect(await store.get('nope')).toBeNull();
    await store.close();
  });

  it('upserts on conflict (idempotent on planId)', async () => {
    const store = new PostgresPlanStore(makePool());
    await store.remember(fakePlan('dup'), 'alice');
    await store.remember(fakePlan('dup'), 'bob'); // same id, new owner
    expect((await store.get('dup'))?.owner).toBe('bob');
    await store.close();
  });

  it('prunes beyond the cap, keeping the newest', async () => {
    const store = new PostgresPlanStore(makePool(), 2);
    await store.remember(fakePlan('1'), 'alice');
    await store.remember(fakePlan('2'), 'alice');
    await store.remember(fakePlan('3'), 'alice');
    expect(await store.get('1')).toBeNull(); // oldest pruned
    expect((await store.get('3'))?.plan.planId).toBe('3');
    await store.close();
  });
});
