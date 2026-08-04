/**
 * Append-only, hash-chained audit log. Every decision is recorded with the hash
 * of the previous record, so any later tampering breaks the chain and
 * `verifyChain` pinpoints exactly where. There is no update or delete surface;
 * the backing store's DB role revokes UPDATE/DELETE. The hash comes from the
 * injected `env`, so tamper-evidence is offline-testable with a fake hash.
 */
import type { PolicyEnv } from './env.js';
import type { DecisionRecord, ExecutionPermission, PolicyDecision } from './types.js';

const GENESIS = 'GENESIS';

export interface AuditSink {
  append(record: DecisionRecord): Promise<void>;
  readTail(n: number): Promise<DecisionRecord[]>;
}

/** In-memory sink with structuredClone isolation (no aliasing of stored records). */
export class InMemoryAuditSink implements AuditSink {
  private readonly records: DecisionRecord[] = [];
  append(record: DecisionRecord): Promise<void> {
    this.records.push(structuredClone(record));
    return Promise.resolve();
  }
  readTail(n: number): Promise<DecisionRecord[]> {
    return Promise.resolve(this.records.slice(-n).map((r) => structuredClone(r)));
  }
  all(): DecisionRecord[] {
    return this.records.map((r) => structuredClone(r));
  }
}

const canonicalize = (record: Omit<DecisionRecord, 'hash'>): string =>
  JSON.stringify(record, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));

export interface AuditMeta {
  principalId: string;
  activeSetHash: string;
  permission?: ExecutionPermission;
}

export interface ChainCheck {
  intact: boolean;
  brokenAt?: number;
}

export class AuditLog {
  private seq = 0;
  private lastHash = GENESIS;

  constructor(
    private readonly sink: AuditSink,
    private readonly env: PolicyEnv,
  ) {}

  async append(decision: PolicyDecision, meta: AuditMeta): Promise<DecisionRecord> {
    const sansHash: Omit<DecisionRecord, 'hash'> = {
      seq: this.seq++,
      requestId: decision.requestId,
      decision,
      principalId: meta.principalId,
      activeSetHash: meta.activeSetHash,
      recordedAtIso: this.env.now(),
      prevHash: this.lastHash,
      ...(meta.permission ? { permission: meta.permission } : {}),
    };
    const hash = this.env.hash(canonicalize(sansHash));
    const record: DecisionRecord = { ...sansHash, hash };
    this.lastHash = hash;
    await this.sink.append(record);
    return record;
  }

  /** Pure: recompute each record's hash and verify the prev-hash linkage. */
  verifyChain(records: DecisionRecord[]): ChainCheck {
    let prev = GENESIS;
    for (let i = 0; i < records.length; i++) {
      const { hash, ...sansHash } = records[i]!;
      if (this.env.hash(canonicalize(sansHash)) !== hash) return { intact: false, brokenAt: i };
      if (sansHash.prevHash !== prev) return { intact: false, brokenAt: i };
      prev = hash;
    }
    return { intact: true };
  }
}
