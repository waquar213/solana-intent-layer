/**
 * Privacy engine: data retention + DSAR (data-subject access requests). The hard
 * part is the tension the prompt implies but every real system faces — a user's
 * right to ERASURE vs. a regulator's demand for RETENTION. This resolves it
 * deterministically: an erasure request erases everything EXCEPT data under an
 * active legal hold or still inside its retention window, and it reports exactly
 * what was retained and why. (Non-custodial makes this tractable: we never held
 * keys or funds, so "delete my data" is about metadata/PII, never money.)
 */
import type {
  DataClass,
  DataInventoryItem,
  ErasurePlan,
  ExportManifest,
  JurisdictionProfile,
  RetentionRule,
} from './types.js';

const DAY_MS = 86_400_000;
/** The largest absolute millisecond value a JS `Date` can represent (±8.64e15). */
const MAX_DATE_MS = 8.64e15;

// NOTE: all timestamps are expected to be UTC ISO-8601 (with a 'Z'/offset), as
// produced by ComplianceEnv.now(); a timezone-ambiguous string (date-only or no
// offset) parses host-dependently, so ingestion must normalize to UTC.
export interface RetentionSchedule {
  dataClass: DataClass;
  retainDays: number;
  legalHold: boolean;
  /** ISO instant after which the data may be deleted, or null if under an indefinite legal hold. */
  deleteAfterIso: string | null;
}

function ruleFor(dataClass: DataClass, profile: JurisdictionProfile): RetentionRule | undefined {
  return profile.retention.find((r) => r.dataClass === dataClass);
}

/** The retention schedule for a piece of data created at `createdAtIso`. */
export function retentionScheduleFor(item: DataInventoryItem, profile: JurisdictionProfile): RetentionSchedule {
  const rule = ruleFor(item.dataClass, profile);
  if (!rule) {
    // No retention rule for this class → we CANNOT prove erasure is safe (it may be
    // AML/KYC-relevant), so RETAIN (fail safe). deleteAfterIso null = indefinite until
    // a rule is defined. Erasing on a missing rule would silently destroy retained data.
    return { dataClass: item.dataClass, retainDays: 0, legalHold: false, deleteAfterIso: null };
  }
  // A negative retainDays (a config sign-flip) must never resolve to "already deletable".
  const retainDays = Math.max(0, rule.retainDays);
  const created = Date.parse(item.createdAtIso);
  let deleteAfterIso: string | null;
  if (rule.legalHold || !Number.isFinite(created)) {
    deleteAfterIso = null; // legal hold, or an unverifiable age → retain (fail safe)
  } else {
    const deleteAfterMs = created + retainDays * DAY_MS;
    // A pathological retainDays that overflows the representable Date range is treated
    // as an indefinite hold, NOT allowed to throw and abort the whole erasure plan.
    deleteAfterIso =
      Number.isFinite(deleteAfterMs) && Math.abs(deleteAfterMs) <= MAX_DATE_MS
        ? new Date(deleteAfterMs).toISOString()
        : null;
  }
  return { dataClass: item.dataClass, retainDays, legalHold: rule.legalHold, deleteAfterIso };
}

/** True only when the item is past its retention window AND not under a legal hold. */
export function isErasable(item: DataInventoryItem, profile: JurisdictionProfile, nowIso: string): boolean {
  const sched = retentionScheduleFor(item, profile);
  if (sched.legalHold || sched.deleteAfterIso === null) return false;
  const nowMs = Date.parse(nowIso);
  const deleteAfterMs = Date.parse(sched.deleteAfterIso);
  if (!Number.isFinite(nowMs) || !Number.isFinite(deleteAfterMs)) return false; // fail safe → retain
  return nowMs >= deleteAfterMs;
}

/**
 * Reconcile an erasure request against retention: erase what is erasable now,
 * retain the rest with a reason and (where known) a date the hold lifts.
 */
export function planErasure(
  subjectId: string,
  inventory: readonly DataInventoryItem[],
  profile: JurisdictionProfile,
  nowIso: string,
): ErasurePlan {
  const erase: DataInventoryItem[] = [];
  const retained: ErasurePlan['retained'] = [];

  for (const item of inventory) {
    const sched = retentionScheduleFor(item, profile);
    if (sched.legalHold) {
      retained.push({ item, reason: `legal hold on ${item.dataClass}`, untilIso: null });
    } else if (sched.deleteAfterIso === null) {
      // No defined retention window (missing rule / unverifiable age / overflow) → retain, fail safe.
      retained.push({
        item,
        reason: `no defined retention window for ${item.dataClass} — retained pending review`,
        untilIso: null,
      });
    } else if (isErasable(item, profile, nowIso)) {
      erase.push(item);
    } else {
      retained.push({
        item,
        reason: `within ${sched.retainDays}d retention for ${item.dataClass}`,
        untilIso: sched.deleteAfterIso,
      });
    }
  }
  return { subjectId, erase, retained };
}

/** Data portability: the subject's full inventory as an export manifest. */
export function planExport(subjectId: string, inventory: readonly DataInventoryItem[], nowIso: string): ExportManifest {
  return { subjectId, items: [...inventory], generatedAtIso: nowIso };
}

/** Data minimization: the fields permitted for a purpose, and any excess requested beyond them. */
export function minimizeFields(
  requested: readonly string[],
  allowedForPurpose: readonly string[],
): { permitted: string[]; excess: string[] } {
  const allowed = new Set(allowedForPurpose);
  const permitted: string[] = [];
  const excess: string[] = [];
  for (const f of requested) (allowed.has(f) ? permitted : excess).push(f);
  return { permitted, excess };
}
