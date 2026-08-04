/**
 * Reporting — deterministic aggregation over audit records. The delivery pipeline
 * (schedules, S3/SFTP export, regulator portals) is infra; what lives here is the
 * pure part: given a spec + the audit records in its window, produce a report with
 * a stable summary and the underlying records. Same records + same spec → identical
 * report, which is what makes a compliance report reproducible and defensible.
 */
import type { AuditRecord, Report, ReportSpec } from './types.js';

function inWindow(r: AuditRecord, spec: ReportSpec): boolean {
  if (r.recordedAtIso < spec.fromIso || r.recordedAtIso > spec.toIso) return false;
  if (spec.jurisdiction && r.jurisdiction !== spec.jurisdiction) return false;
  return true;
}

export function generateReport(spec: ReportSpec, records: readonly AuditRecord[], nowIso: string): Report {
  const scoped = records.filter((r) => inWindow(r, spec));
  const summary: Record<string, number> = { total: scoped.length };

  switch (spec.kind) {
    case 'operational_metrics': {
      for (const r of scoped) {
        summary[`category.${r.category}`] = (summary[`category.${r.category}`] ?? 0) + 1;
        summary[`outcome.${r.outcome}`] = (summary[`outcome.${r.outcome}`] ?? 0) + 1;
      }
      break;
    }
    case 'security_events': {
      const sec = scoped.filter((r) => r.category === 'security');
      summary.total = sec.length;
      for (const r of sec) summary[`outcome.${r.outcome}`] = (summary[`outcome.${r.outcome}`] ?? 0) + 1;
      return { kind: spec.kind, spec, generatedAtIso: nowIso, summary, records: sec };
    }
    case 'compliance_summary': {
      const decisions = scoped.filter((r) => r.category === 'compliance_decision');
      // `total` stays = scoped.length so it matches the returned `records`; the decision
      // count is reported separately rather than silently overwriting `total`.
      summary.decisions = decisions.length;
      summary.denied = decisions.filter((r) => r.outcome === 'denied').length;
      summary.consentEvents = scoped.filter((r) => r.category === 'consent').length;
      summary.privacyEvents = scoped.filter((r) => r.category === 'privacy').length;
      for (const r of decisions) {
        const v = r.detail?.verdict;
        if (typeof v === 'string') summary[`verdict.${v}`] = (summary[`verdict.${v}`] ?? 0) + 1;
      }
      break;
    }
    case 'audit_export':
    default:
      break;
  }

  return { kind: spec.kind, spec, generatedAtIso: nowIso, summary, records: scoped };
}
