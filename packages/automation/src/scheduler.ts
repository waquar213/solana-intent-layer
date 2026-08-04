/**
 * Scheduler helpers for the dashboard. Time (`schedule`) triggers have a
 * predictable next fire (`nextFireTime`); event triggers do not, so only
 * scheduled workflows appear in "upcoming tasks". Firing itself is the engine's
 * job — this is read-only projection.
 */
import { nextFireTime } from './triggers.js';
import type { Workflow } from './types.js';

export interface UpcomingRun {
  workflowId: string;
  title: string;
  nextFireIso: string;
}

/** Upcoming scheduled runs, soonest first, for the automation dashboard. */
export function upcomingRuns(workflows: Workflow[], fromIso: string): UpcomingRun[] {
  const out: UpcomingRun[] = [];
  for (const wf of workflows) {
    if (wf.status !== 'active' || wf.trigger.kind !== 'schedule') continue;
    out.push({ workflowId: wf.id, title: wf.title, nextFireIso: nextFireTime(wf.trigger, fromIso) });
  }
  return out.sort((a, b) => Date.parse(a.nextFireIso) - Date.parse(b.nextFireIso));
}
