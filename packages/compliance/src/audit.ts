/**
 * Append-only, hash-chained audit log. Every governance/compliance event is
 * recorded with the hash of the previous record, so any later tampering breaks the
 * chain and `verifyChain` pinpoints exactly where. There is no update or delete
 * surface; in production the backing store's DB role revokes UPDATE/DELETE and
 * ships records to WORM archival. The hash comes from the injected `env`, so
 * tamper-evidence is offline-testable with a fake hash.
 *
 * Records carry only non-sensitive structured detail; PII is referenced by id,
 * never inlined — an audit trail must be exportable to a regulator without leaking
 * the personal data it describes.
 *
 * THREAT MODEL — a hash chain is tamper-EVIDENT, not tamper-PROOF. An attacker who
 * can rewrite the store AND compute the hash could forge a self-consistent chain,
 * and simply dropping a trailing suffix leaves a shorter, still-valid chain. So
 * production MUST: (1) inject a KEYED hash (HMAC with a server-held key) or sign the
 * tip, so a forger without the key can't recompute hashes; (2) run on append-only /
 * WORM storage (DB role revokes UPDATE/DELETE); and (3) externally anchor the tip
 * (`tip()`), which `verifyChain` checks against to detect truncation. The default
 * `stableHash` is UNKEYED — adequate for tests, NOT for production integrity.
 */
import type { ComplianceEnv } from './env.js';
import type { AuditCategory, AuditEventInput, AuditRecord } from './types.js';

const GENESIS = 'GENESIS';

export interface AuditSink {
  append(record: AuditRecord): Promise<void>;
  all(): Promise<AuditRecord[]>;
}

export class InMemoryAuditSink implements AuditSink {
  private readonly records: AuditRecord[] = [];
  append(record: AuditRecord): Promise<void> {
    this.records.push(structuredClone(record));
    return Promise.resolve();
  }
  all(): Promise<AuditRecord[]> {
    return Promise.resolve(this.records.map((r) => structuredClone(r)));
  }
}

const canonicalize = (record: Omit<AuditRecord, 'hash'>): string => JSON.stringify(record);

export interface ChainCheck {
  intact: boolean;
  brokenAt?: number;
}

/** An externally-stored anchor (count + tip hash) used to detect log TRUNCATION. */
export interface ChainAnchor {
  count: number;
  tipHash: string;
}

export interface AuditFilter {
  category?: AuditCategory;
  subjectId?: string;
  jurisdiction?: string;
  fromIso?: string;
  toIso?: string;
}

export class AuditLog {
  private seq = 0;
  private lastHash = GENESIS;

  constructor(
    private readonly sink: AuditSink,
    private readonly env: ComplianceEnv,
  ) {}

  async record(event: AuditEventInput): Promise<AuditRecord> {
    const sansHash: Omit<AuditRecord, 'hash'> = {
      ...event,
      seq: this.seq++,
      id: this.env.ids.event(),
      recordedAtIso: this.env.now(),
      prevHash: this.lastHash,
    };
    const hash = this.env.hash(canonicalize(sansHash));
    const record: AuditRecord = { ...sansHash, hash };
    this.lastHash = hash;
    await this.sink.append(record);
    return record;
  }

  /** The current chain tip. Store this externally (WORM / notary) to later detect truncation. */
  tip(): ChainAnchor {
    return { count: this.seq, tipHash: this.lastHash };
  }

  /**
   * Pure: recompute each record's hash, verify the prev-hash linkage AND the seq
   * contiguity (which catches a deleted/reordered middle record that would otherwise
   * still form a valid backward-linked chain). An optional `anchor` (an externally
   * stored count + tip hash) additionally detects TRUNCATION — dropping a trailing
   * suffix leaves a valid shorter chain that the linkage alone cannot catch.
   */
  verifyChain(records: readonly AuditRecord[], anchor?: ChainAnchor): ChainCheck {
    let prev = GENESIS;
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (!rec) return { intact: false, brokenAt: i };
      if (rec.seq !== i) return { intact: false, brokenAt: i }; // seq must be contiguous from 0
      const { hash, ...sansHash } = rec;
      if (this.env.hash(canonicalize(sansHash)) !== hash) return { intact: false, brokenAt: i };
      if (sansHash.prevHash !== prev) return { intact: false, brokenAt: i };
      prev = hash;
    }
    if (anchor) {
      if (records.length !== anchor.count) return { intact: false, brokenAt: records.length };
      if (prev !== anchor.tipHash) return { intact: false, brokenAt: Math.max(0, records.length - 1) };
    }
    return { intact: true };
  }

  /**
   * Secure export: a chain-integrity proof over the FULL log (anchored against the
   * live tip, so truncation is caught) plus the filtered records and the tip anchor.
   * The `chain` proof covers the whole log; `records` is a filtered VIEW — a consumer
   * relies on `chain`/`tip` for integrity, not on re-linking the filtered slice.
   */
  async export(
    filter: AuditFilter = {},
  ): Promise<{ records: AuditRecord[]; chain: ChainCheck; tip: ChainAnchor; exportedAtIso: string }> {
    const all = await this.sink.all();
    const anchor = this.tip();
    const chain = this.verifyChain(all, anchor);
    const records = all.filter((r) => matches(r, filter));
    return { records, chain, tip: anchor, exportedAtIso: this.env.now() };
  }
}

function matches(r: AuditRecord, f: AuditFilter): boolean {
  if (f.category && r.category !== f.category) return false;
  if (f.subjectId && r.subjectId !== f.subjectId) return false;
  if (f.jurisdiction && r.jurisdiction !== f.jurisdiction) return false;
  if (f.fromIso && r.recordedAtIso < f.fromIso) return false;
  if (f.toIso && r.recordedAtIso > f.toIso) return false;
  return true;
}
