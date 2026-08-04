import { describe, expect, it } from 'vitest';
import { AuditLog, createTestEnv, InMemoryAuditSink } from '../src/index.js';
import type { PolicyDecision } from '../src/index.js';

const decision = (requestId: string, outcome: PolicyDecision['outcome']): PolicyDecision => ({
  requestId,
  outcome,
  firedRules: [],
  decidedBy: [],
  conflicts: [],
  requirements: [],
  summary: outcome,
  decisionHash: `dh-${requestId}`,
  evaluatedAtIso: '2026-01-01T00:00:00.000Z',
});

describe('AuditLog — tamper-evident hash chain', () => {
  const build = async () => {
    const sink = new InMemoryAuditSink();
    const log = new AuditLog(sink, createTestEnv());
    await log.append(decision('r1', 'approved'), { principalId: 'p', activeSetHash: 'h' });
    await log.append(decision('r2', 'approved_with_confirmation'), { principalId: 'p', activeSetHash: 'h' });
    await log.append(decision('r3', 'blocked'), { principalId: 'p', activeSetHash: 'h' });
    return { sink, log };
  };

  it('builds a valid, verifiable chain', async () => {
    const { sink, log } = await build();
    const records = sink.all();
    expect(records).toHaveLength(3);
    expect(records[0]!.prevHash).toBe('GENESIS');
    expect(records[1]!.prevHash).toBe(records[0]!.hash);
    expect(log.verifyChain(records).intact).toBe(true);
  });

  it('detects a tampered record and pinpoints it', async () => {
    const { sink, log } = await build();
    const records = sink.all();
    records[1]!.decision.outcome = 'blocked'; // tamper the middle record's content
    const check = log.verifyChain(records);
    expect(check.intact).toBe(false);
    expect(check.brokenAt).toBe(1);
  });

  it('detects a deleted record (broken linkage)', async () => {
    const { sink, log } = await build();
    const records = sink.all();
    records.splice(1, 1); // remove the middle record
    const check = log.verifyChain(records);
    expect(check.intact).toBe(false);
    expect(check.brokenAt).toBe(1);
  });
});
