/**
 * Scheduling-level safety — cooldown and daily-run caps. Authorization safety
 * (amount limits, trusted recipients, biometric thresholds, automation
 * pre-approval) is the Policy Engine's job and is NOT duplicated here; this layer
 * only bounds how OFTEN a workflow fires, which is a scheduler concern policy
 * doesn't see.
 */
import type { Workflow, WorkflowRun } from './types.js';

export interface SafetyCheck {
  ok: boolean;
  reason?: string;
}

/** Count same-UTC-day runs that reached the gate (a real firing, not a skip). */
export function runsTodayCount(history: WorkflowRun[], nowIso: string): number {
  const day = nowIso.slice(0, 10);
  const fired = new Set(['executed', 'awaiting_approval', 'blocked', 'failed']);
  return history.filter((r) => r.firedAtIso.slice(0, 10) === day && fired.has(r.status)).length;
}

export function checkSafety(wf: Workflow, runsToday: number, nowIso: string): SafetyCheck {
  const s = wf.safety;
  if (s.maxDailyRuns !== undefined && runsToday >= s.maxDailyRuns) {
    return { ok: false, reason: `daily run cap (${s.maxDailyRuns}) reached` };
  }
  if (s.cooldownSeconds !== undefined && wf.lastRunAtIso !== undefined) {
    const gapSeconds = (Date.parse(nowIso) - Date.parse(wf.lastRunAtIso)) / 1000;
    if (gapSeconds < s.cooldownSeconds) {
      return {
        ok: false,
        reason: `cooldown active (${Math.max(0, Math.round(s.cooldownSeconds - gapSeconds))}s remaining)`,
      };
    }
  }
  return { ok: true };
}
