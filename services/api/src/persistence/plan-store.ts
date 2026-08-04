/**
 * PlanStore — the server-side home for the plans authorize/execute act on.
 *
 * The doctrine requires authorize/execute to operate on a plan the SERVER
 * produced (looked up by planId), never one the client hands back. That cache
 * used to be an in-memory Map: it died on restart and wasn't shared across
 * replicas, so a plan issued by one pod was invisible to the next — the loop was
 * silently broken in a real deployment. This makes it a proper persisted store
 * behind a small async interface, so the same code runs over an embedded SQLite
 * file (dev — survives restart) or, in production, a networked Postgres that all
 * replicas share (a drop-in implementation of the same interface).
 */
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import type { ExecutionPlan } from '@intent-wallet/runtime';

/** A stored plan plus the principal that owns it (authorize/execute must match). */
export interface StoredPlan {
  plan: ExecutionPlan;
  /** The principal (auth subject) the plan was issued to. */
  owner: string;
}

export interface PlanStore {
  /** Persist a plan the server issued for `owner` (idempotent on planId). */
  remember(plan: ExecutionPlan, owner: string): Promise<void>;
  /** The stored plan (+owner) for `planId`, or null if it expired / never existed. */
  get(planId: string): Promise<StoredPlan | null>;
  /** Consume a plan (no-op if absent) so a completed execute can't be replayed. */
  delete(planId: string): Promise<void>;
  close(): Promise<void>;
}

/** Bounded in-memory store (the original behaviour) — for tests + single-process dev. */
export class InMemoryPlanStore implements PlanStore {
  readonly #plans = new Map<string, StoredPlan>();
  constructor(private readonly maxSize = 500) {}

  remember(plan: ExecutionPlan, owner: string): Promise<void> {
    this.#plans.set(plan.planId, { plan, owner });
    if (this.#plans.size > this.maxSize) {
      const oldest = this.#plans.keys().next().value; // insertion order
      if (oldest !== undefined) this.#plans.delete(oldest);
    }
    return Promise.resolve();
  }
  get(planId: string): Promise<StoredPlan | null> {
    return Promise.resolve(this.#plans.get(planId) ?? null);
  }
  delete(planId: string): Promise<void> {
    this.#plans.delete(planId);
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.#plans.clear();
    return Promise.resolve();
  }
}

/**
 * SQLite-backed store (embedded, file-based) — plans survive a process restart.
 * Plans are JSON (money is already decimal strings, so no bigint), keyed by
 * planId, oldest pruned past `maxSize`. The same schema + SQL maps 1:1 onto a
 * networked Postgres for the multi-replica production store.
 */
export class SqlitePlanStore implements PlanStore {
  readonly #db: DatabaseSync;
  constructor(
    path: string,
    private readonly maxSize = 5_000,
  ) {
    this.#db = new DatabaseSync(path);
    this.#db.exec(
      'CREATE TABLE IF NOT EXISTS plans (plan_id TEXT PRIMARY KEY, plan TEXT NOT NULL, owner TEXT NOT NULL, created_at INTEGER NOT NULL)',
    );
    // Migrate a legacy .plans.db created before the `owner` column existed —
    // CREATE TABLE IF NOT EXISTS won't add it, so remember/get would throw on the
    // missing column. Add it (empty owner) so an old dev file keeps working.
    const cols = this.#db.prepare('PRAGMA table_info(plans)').all() as { name: string }[];
    if (!cols.some((c) => c.name === 'owner')) {
      this.#db.exec("ALTER TABLE plans ADD COLUMN owner TEXT NOT NULL DEFAULT ''");
    }
    this.#db.exec('CREATE INDEX IF NOT EXISTS plans_created_at ON plans (created_at)');
  }

  remember(plan: ExecutionPlan, owner: string): Promise<void> {
    this.#db
      .prepare('INSERT OR REPLACE INTO plans (plan_id, plan, owner, created_at) VALUES (?, ?, ?, ?)')
      .run(plan.planId, JSON.stringify(plan), owner, Date.now());
    // Prune the oldest beyond the cap so the file can't grow without bound. The
    // (created_at DESC, plan_id DESC) order is a TOTAL order, so plans issued in the
    // same millisecond can't non-deterministically prune a just-inserted row.
    this.#db
      .prepare('DELETE FROM plans WHERE plan_id NOT IN (SELECT plan_id FROM plans ORDER BY created_at DESC, plan_id DESC LIMIT ?)')
      .run(this.maxSize);
    return Promise.resolve();
  }

  get(planId: string): Promise<StoredPlan | null> {
    const row = this.#db.prepare('SELECT plan, owner FROM plans WHERE plan_id = ?').get(planId) as
      | { plan: string; owner: string }
      | undefined;
    if (!row) return Promise.resolve(null);
    // A row that cannot be parsed is unusable. Plans are a short-lived, re-creatable cache of
    // proposals, so report it as a MISS (the caller re-plans) instead of letting a corrupt or
    // tampered row throw out of the route as a 500.
    try {
      return Promise.resolve({ plan: JSON.parse(row.plan) as ExecutionPlan, owner: row.owner });
    } catch {
      return Promise.resolve(null);
    }
  }

  delete(planId: string): Promise<void> {
    this.#db.prepare('DELETE FROM plans WHERE plan_id = ?').run(planId);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.#db.close();
    return Promise.resolve();
  }
}

/**
 * The minimal Postgres surface the store needs. Depending on this — not pg's
 * concrete `Pool` — lets the real `pg` Pool AND an in-process test double (pg-mem)
 * both satisfy it, so the SQL is testable without a live server.
 */
export interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

/**
 * Postgres-backed store — the MULTI-REPLICA production home. Every API pod shares
 * one networked Postgres, so a plan issued by pod A is visible to pod B (which
 * SqlitePlanStore, being a single-file embedded DB, cannot do). Same table shape as
 * SQLite: (plan_id PK, plan JSONB, owner, created_at), owner enforced by the routes,
 * pruned past `maxSize`. Values are parameterized ($1…) — never string-built — so a
 * planId/owner can't inject SQL.
 */
export class PostgresPlanStore implements PlanStore {
  readonly #pool: PgQueryable;
  readonly #ready: Promise<void>;

  /** Accepts a connection string (prod) or an injected pool (tests use pg-mem). */
  constructor(
    poolOrUrl: PgQueryable | string,
    private readonly maxSize = 50_000,
  ) {
    this.#pool = typeof poolOrUrl === 'string' ? (new Pool({ connectionString: poolOrUrl }) as unknown as PgQueryable) : poolOrUrl;
    this.#ready = this.#init();
  }

  async #init(): Promise<void> {
    await this.#pool.query(
      'CREATE TABLE IF NOT EXISTS plans (plan_id TEXT PRIMARY KEY, plan JSONB NOT NULL, owner TEXT NOT NULL, created_at BIGINT NOT NULL)',
    );
    await this.#pool.query('CREATE INDEX IF NOT EXISTS plans_created_at ON plans (created_at)');
  }

  async remember(plan: ExecutionPlan, owner: string): Promise<void> {
    await this.#ready;
    await this.#pool.query(
      `INSERT INTO plans (plan_id, plan, owner, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (plan_id) DO UPDATE SET plan = EXCLUDED.plan, owner = EXCLUDED.owner, created_at = EXCLUDED.created_at`,
      [plan.planId, JSON.stringify(plan), owner, Date.now()],
    );
    // Keep only the newest `maxSize`; the (created_at DESC, plan_id DESC) TOTAL order
    // prevents a same-millisecond tie from non-deterministically pruning a fresh row.
    await this.#pool.query(
      'DELETE FROM plans WHERE plan_id NOT IN (SELECT plan_id FROM plans ORDER BY created_at DESC, plan_id DESC LIMIT $1)',
      [this.maxSize],
    );
  }

  async get(planId: string): Promise<StoredPlan | null> {
    await this.#ready;
    const res = await this.#pool.query('SELECT plan, owner FROM plans WHERE plan_id = $1', [planId]);
    const row = res.rows[0] as { plan: ExecutionPlan | string; owner: string } | undefined;
    if (!row) return null;
    // JSONB comes back parsed from pg; pg-mem may hand back a string — accept both. An unparseable
    // row is treated as a MISS (plans are a re-creatable cache) rather than thrown as a 500.
    let plan: ExecutionPlan;
    if (typeof row.plan === 'string') {
      try {
        plan = JSON.parse(row.plan) as ExecutionPlan;
      } catch {
        return null;
      }
    } else {
      plan = row.plan;
    }
    return { plan, owner: row.owner };
  }

  async delete(planId: string): Promise<void> {
    await this.#ready;
    await this.#pool.query('DELETE FROM plans WHERE plan_id = $1', [planId]);
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
