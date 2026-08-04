/**
 * The Settlement Ledger — an append-only, replayable record of every transition.
 * It is the observability + auditability substrate: a settlement's entire life
 * (created → each stage ok/failed/recovery → terminal) is reconstructable from
 * its ledger, in order, deterministically.
 */
import type { SettlementEnv } from './env.js';
import type { LedgerEntry, Settlement, SettlementStage } from './types.js';

export function ledgerEntry(
  seq: number,
  settlement: Settlement,
  stage: SettlementStage | 'lifecycle',
  event: string,
  detail: string,
  env: SettlementEnv,
): LedgerEntry {
  return {
    seq,
    settlementId: settlement.id,
    correlationId: settlement.correlationId,
    stage,
    event,
    detail,
    atIso: env.now(),
  };
}

/** Replay a settlement from its ledger — the deterministic, ordered history. */
export function replay(
  entries: LedgerEntry[],
): Array<{ seq: number; stage: string; event: string; detail: string; atIso: string }> {
  return [...entries]
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({ seq: e.seq, stage: e.stage, event: e.event, detail: e.detail, atIso: e.atIso }));
}
