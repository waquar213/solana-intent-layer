/**
 * Pipeline order helpers. The settlement runs the stages in `SETTLEMENT_STAGES`
 * order; these pure functions let the coordinator find where a resumed
 * settlement left off and which stages remain, without duplicating the order.
 */
import { SETTLEMENT_STAGES } from './types.js';
import type { SettlementStage, StageRecord } from './types.js';

export function stageIndex(stage: SettlementStage): number {
  return SETTLEMENT_STAGES.indexOf(stage);
}

/** The stages not yet recorded `ok` — i.e. what a fresh-or-resumed settlement still needs to run. */
export function remainingStages(done: StageRecord[]): SettlementStage[] {
  const okStages = new Set(done.filter((s) => s.status === 'ok').map((s) => s.stage));
  return SETTLEMENT_STAGES.filter((s) => !okStages.has(s));
}
