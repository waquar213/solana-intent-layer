import { describe, expect, it } from 'vitest';
import {
  approve,
  AuditLog,
  can,
  ComplianceGateway,
  createApprovalRequest,
  createCompliancePlatform,
  createProfileRegistry,
  createTestEnv,
  evaluateConsents,
  freezeFeature,
  generateReport,
  InMemoryAuditSink,
  isErasable,
  isFeatureEnabled,
  markApplied,
  minimizeFields,
  planErasure,
  reject,
  templateProfile,
  validateProfile,
  type ComplianceRequest,
  type ConsentRequirement,
  type DataInventoryItem,
  type FeatureFlagSet,
  type JurisdictionProfile,
  type RoleAssignment,
} from '../src/index.js';

const NOW = '2026-02-01T00:00:00.000Z';
const standard = templateProfile('test', 'standard');
const grantedAll = [
  { key: 'tos', grantedAtIso: '2026-01-01T00:00:00.000Z' },
  { key: 'privacy', grantedAtIso: '2026-01-01T00:00:00.000Z' },
];
const screenedClean = { screened: true, sanctioned: false, source: 'ofac' };

const req = (over: Partial<ComplianceRequest> = {}): ComplianceRequest => ({
  subjectId: 'u1',
  jurisdictionId: 'test',
  action: { feature: 'swap' },
  context: { consents: grantedAll, screening: screenedClean },
  ...over,
});

// ── Profiles / versioning ────────────────────────────────────────────────────
describe('jurisdiction profiles — versioned data, no country rules in code', () => {
  it('publishing a new active version retires the previous one (one active per id)', () => {
    const reg = createProfileRegistry([standard]);
    reg.register({ ...standard, version: 2, label: 'v2' });
    expect(reg.getActive('test')?.version).toBe(2);
    expect(reg.list('test').find((p) => p.version === 1)?.status).toBe('retired');
  });

  it('rejects non-monotonic versions', () => {
    const reg = createProfileRegistry([standard]); // v1
    expect(() => reg.register({ ...standard, version: 1 })).toThrow(/already exists/i);
    reg.register({ ...standard, version: 5 });
    expect(() => reg.register({ ...standard, version: 5 })).toThrow(/already exists/i);
    // v3 doesn't exist yet, but it is <= the current max (5) → non-monotonic
    expect(() => reg.register({ ...standard, version: 3 })).toThrow(/not greater/i);
  });

  it('validates the profile shape', () => {
    expect(() => validateProfile({ ...standard, riskThreshold: 2 })).toThrow(/riskThreshold/);
  });
});

// ── Gateway ──────────────────────────────────────────────────────────────────
describe('compliance gateway — fail-closed, most-restrictive', () => {
  const reg = createProfileRegistry([
    standard,
    { ...standard, id: 'ns', disabledFeatures: ['staking'] },
    { ...standard, id: 'lenient', blockOnSanctions: false },
  ]);
  const gw = new ComplianceGateway(reg);

  it('allows a clean action within policy', () => {
    expect(gw.evaluate(req(), NOW).verdict).toBe('allow');
  });

  it('FAILS CLOSED on an unknown jurisdiction', () => {
    const d = gw.evaluate(req({ jurisdictionId: 'nowhere' }), NOW);
    expect(d.verdict).toBe('block');
    expect(d.reasons.join(' ')).toMatch(/no active compliance profile/i);
  });

  it('blocks a feature disabled in the jurisdiction', () => {
    const d = gw.evaluate(req({ jurisdictionId: 'ns', action: { feature: 'staking' } }), NOW);
    expect(d.verdict).toBe('block');
  });

  it('blocks when required screening was not performed', () => {
    const d = gw.evaluate(req({ context: { consents: grantedAll } }), NOW); // no screening
    expect(d.verdict).toBe('block');
    expect(d.reasons.join(' ')).toMatch(/screening/i);
  });

  it('blocks a sanctioned counterparty and obliges a report (blockOnSanctions)', () => {
    const d = gw.evaluate(
      req({ context: { consents: grantedAll, screening: { screened: true, sanctioned: true, source: 'ofac' } } }),
      NOW,
    );
    expect(d.verdict).toBe('block');
    expect(d.obligations.some((o) => o.kind === 'report' && o.reportKey === 'sanctions')).toBe(true);
  });

  it('reports-and-discloses a sanctioned counterparty where blockOnSanctions is false', () => {
    const d = gw.evaluate(
      req({
        jurisdictionId: 'lenient',
        context: { consents: grantedAll, screening: { screened: true, sanctioned: true, source: 'ofac' } },
      }),
      NOW,
    );
    expect(d.verdict).toBe('require_disclosure');
    expect(d.requiredDisclosures).toContain('sanctions_exposure');
  });

  it('requires consent when a required consent is missing', () => {
    const d = gw.evaluate(req({ context: { consents: [], screening: screenedClean } }), NOW);
    expect(d.verdict).toBe('require_consent');
    expect(d.missingConsents).toEqual(['tos', 'privacy']);
  });

  it('obliges a report + disclosure for a high-value transfer', () => {
    const d = gw.evaluate(req({ action: { feature: 'swap', amountMicroUsd: 20_000_000_000n } }), NOW);
    expect(d.verdict).toBe('require_disclosure');
    expect(d.obligations.some((o) => o.kind === 'report' && o.reportKey === 'ctr')).toBe(true);
  });

  it('takes the MOST-restrictive verdict when several gates fire', () => {
    const d = gw.evaluate(
      req({
        action: { feature: 'swap', amountMicroUsd: 20_000_000_000n },
        context: { consents: [], screening: screenedClean },
      }),
      NOW,
    );
    expect(d.verdict).toBe('require_consent'); // consent (rank 2) beats disclosure (rank 1)
    expect(d.requiredDisclosures).toContain('high_value_notice'); // ...but the disclosure obligation still stands
  });
});

// ── Gateway regressions pinned from the adversarial review ───────────────────
describe('gateway review regressions', () => {
  const reg = createProfileRegistry([
    { ...standard, id: 'lenient', blockOnSanctions: false },
    templateProfile('min', 'minimal'), // screeningRequired:false + blockOnSanctions:true
  ]);
  const gw = new ComplianceGateway(reg);

  it('discloses BOTH sanctions and PEP when a counterparty is both (independent flags)', () => {
    const d = gw.evaluate(
      req({
        jurisdictionId: 'lenient',
        context: { consents: grantedAll, screening: { screened: true, sanctioned: true, pep: true, source: 'x' } },
      }),
      NOW,
    );
    expect(d.requiredDisclosures).toContain('sanctions_exposure');
    expect(d.requiredDisclosures).toContain('pep_exposure'); // was dropped by the else-if chain
  });

  it('honours a sanctions hit even when screening is NOT mandated (blockOnSanctions independent of screeningRequired)', () => {
    const d = gw.evaluate(
      req({
        jurisdictionId: 'min', // screeningRequired:false
        context: { consents: grantedAll, screening: { screened: true, sanctioned: true, source: 'ofac' } },
      }),
      NOW,
    );
    expect(d.verdict).toBe('block'); // was 'allow' — a sanctioned party slipped through
    expect(d.obligations.some((o) => o.kind === 'report' && o.reportKey === 'sanctions')).toBe(true);
  });
});

// ── Privacy regressions ──────────────────────────────────────────────────────
describe('privacy review regressions — erasure must fail SAFE (retain)', () => {
  it('retains data whose class has NO retention rule (never erases on a missing rule)', () => {
    const item: DataInventoryItem = { dataClass: 'contact', ref: 'c1', createdAtIso: '2020-01-01T00:00:00.000Z' };
    const plan = planErasure('u1', [item], standard, NOW); // standard has no 'contact' rule
    expect(plan.erase).toHaveLength(0);
    expect(plan.retained[0]?.reason).toMatch(/no defined retention window/i);
  });

  it('rejects a negative retainDays at register (config sign-flip)', () => {
    expect(() =>
      validateProfile({ ...standard, retention: [{ dataClass: 'financial', retainDays: -30, legalHold: false }] }),
    ).toThrow(/retainDays/i);
  });

  it('does not throw on a pathological retainDays that overflows the Date range — it retains', () => {
    const wild: JurisdictionProfile = {
      ...standard,
      retention: [{ dataClass: 'device', retainDays: 3_650_000_000, legalHold: false }],
    };
    const item: DataInventoryItem = { dataClass: 'device', ref: 'd1', createdAtIso: '2025-01-01T00:00:00.000Z' };
    expect(() => planErasure('u1', [item], wild, NOW)).not.toThrow();
    expect(planErasure('u1', [item], wild, NOW).erase).toHaveLength(0); // retained, not erased or crashed
  });
});

// ── Profiles / governance / audit regressions (2nd review wave) ──────────────
describe('profile immutability', () => {
  it('deep-copies on register and read — a caller cannot mutate a published version', () => {
    const reg = createProfileRegistry();
    const input: JurisdictionProfile = { ...standard, id: 'imm', disabledFeatures: ['staking'] };
    reg.register(input);
    input.disabledFeatures = [...input.disabledFeatures, 'INJECTED']; // mutate the caller's copy after publish
    const got = reg.getActive('imm')!;
    (got.consents as ConsentRequirement[]).push({ key: 'HACK', purpose: 'x', required: true }); // mutate a returned copy
    expect(reg.getActive('imm')!.disabledFeatures).toEqual(['staking']); // stored version untouched
    expect(reg.getActive('imm')!.consents.some((c) => c.key === 'HACK')).toBe(false);
  });

  it('rejects a profile missing a required list field', () => {
    const { reporting: _reporting, ...noReporting } = standard; // omit the reporting array
    expect(() => validateProfile(noReporting as JurisdictionProfile)).toThrow(/reporting/i);
  });
});

describe('governance regressions', () => {
  it('emergency freeze is case-insensitive (a casing variant cannot bypass the kill switch)', () => {
    const flags: FeatureFlagSet = { global: { Swap: true }, emergencyFrozen: ['swap'] };
    expect(isFeatureEnabled('Swap', 'eu', flags)).toBe(false);
  });

  it('can fail CLOSED for unlisted features when defaultEnabled is false', () => {
    expect(isFeatureEnabled('brand_new_feature', 'eu', { global: {} })).toBe(true); // default open
    expect(isFeatureEnabled('brand_new_feature', 'eu', { global: {}, defaultEnabled: false })).toBe(false);
  });

  it('clamps a non-finite requiredApprovals so the workflow cannot deadlock', () => {
    const env = createTestEnv();
    const r = createApprovalRequest(env, 'x', 'maker', Number.NaN);
    expect(r.requiredApprovals).toBe(1);
    expect(approve(r, 'checker').request.state).toBe('approved'); // reachable, not stuck
  });
});

describe('audit truncation detection', () => {
  it('catches a dropped trailing record via the external tip anchor', async () => {
    const sink = new InMemoryAuditSink();
    const log = new AuditLog(sink, createTestEnv());
    await log.record({ category: 'login', action: 'a', actorId: 'u', outcome: 'success' });
    await log.record({ category: 'admin_action', action: 'b', actorId: 'u', outcome: 'denied' }); // incriminating
    const anchor = log.tip(); // externally stored (count 2)

    const truncated = (await sink.all()).slice(0, 1); // insider drops the denied record
    expect(log.verifyChain(truncated).intact).toBe(true); // linkage alone is fooled...
    expect(log.verifyChain(truncated, anchor).intact).toBe(false); // ...the anchor catches it
  });

  it('catches a reordered/deleted middle record via seq contiguity', async () => {
    const sink = new InMemoryAuditSink();
    const log = new AuditLog(sink, createTestEnv());
    for (const a of ['a', 'b', 'c'])
      await log.record({ category: 'login', action: a, actorId: 'u', outcome: 'success' });
    const all = await sink.all();
    const missingMiddle = [all[0]!, all[2]!]; // drop seq 1
    expect(log.verifyChain(missingMiddle).intact).toBe(false);
  });
});

// ── Consent ──────────────────────────────────────────────────────────────────
describe('consent', () => {
  it('treats a lapsed consent as missing (re-consent required)', () => {
    const e = evaluateConsents(
      [{ key: 'kyc', purpose: 'x', required: true, expiresDays: 30 }],
      [{ key: 'kyc', grantedAtIso: '2026-01-01T00:00:00.000Z' }],
      '2026-03-01T00:00:00.000Z', // 59 days later
    );
    expect(e.satisfied).toBe(false);
    expect(e.expired).toContain('kyc');
  });
});

// ── Privacy: retention + DSAR ────────────────────────────────────────────────
describe('privacy — erasure reconciled against retention holds', () => {
  const inventory: DataInventoryItem[] = [
    { dataClass: 'audit', ref: 'a1', createdAtIso: '2020-01-01T00:00:00.000Z' }, // legal hold
    { dataClass: 'behavioral', ref: 'b1', createdAtIso: '2020-01-01T00:00:00.000Z' }, // past 90d window
    { dataClass: 'identity', ref: 'i1', createdAtIso: '2026-01-15T00:00:00.000Z' }, // within 365d window
  ];

  it('erases only what is past retention AND not under a legal hold', () => {
    const plan = planErasure('u1', inventory, standard, NOW);
    expect(plan.erase.map((i) => i.ref)).toEqual(['b1']);
    const retainedRefs = plan.retained.map((r) => r.item.ref).sort();
    expect(retainedRefs).toEqual(['a1', 'i1']);
    expect(plan.retained.find((r) => r.item.ref === 'a1')?.untilIso).toBeNull(); // indefinite hold
  });

  it('isErasable honours legal holds', () => {
    expect(isErasable(inventory[1]!, standard, NOW)).toBe(true); // behavioral, past window
    expect(isErasable(inventory[0]!, standard, NOW)).toBe(false); // audit, legal hold
  });

  it('minimizeFields flags excess fields for a purpose', () => {
    expect(minimizeFields(['name', 'email', 'ssn'], ['name', 'email'])).toEqual({
      permitted: ['name', 'email'],
      excess: ['ssn'],
    });
  });
});

// ── Governance ───────────────────────────────────────────────────────────────
describe('governance — RBAC + maker-checker', () => {
  const assignments: RoleAssignment[] = [
    { subjectId: 'admin1', roleId: 'admin' },
    { subjectId: 'off1', roleId: 'compliance_officer' },
  ];

  it('RBAC: admin wildcard, scoped roles, and deny-by-default', () => {
    expect(can('admin1', 'anything.at.all', assignments)).toBe(true);
    expect(can('off1', 'profile.propose', assignments)).toBe(true);
    expect(can('off1', 'audit.export', assignments)).toBe(false); // officer can view, not export
    expect(can('nobody', 'report.view', assignments)).toBe(false);
  });

  it('maker-checker: the proposer cannot approve their own change', () => {
    const env = createTestEnv();
    const request = createApprovalRequest(env, 'profile.publish:eu@2', 'proposer1', 1);
    expect(approve(request, 'proposer1').error).toMatch(/maker-checker/i);
    const ok = approve(request, 'checker1');
    expect(ok.request.state).toBe('approved');
    expect(markApplied(ok.request).request.state).toBe('applied');
  });

  it('a rejection kills the request; a double-approval is refused', () => {
    const env = createTestEnv();
    const two = createApprovalRequest(env, 'x', 'p1', 2);
    const a1 = approve(two, 'c1');
    expect(a1.request.state).toBe('pending');
    expect(approve(a1.request, 'c1').error).toMatch(/already approved/i);
    expect(reject(two, 'c9').request.state).toBe('rejected');
  });

  it('emergency freeze overrides every other feature flag', () => {
    const flags: FeatureFlagSet = { global: { swap: true } };
    expect(isFeatureEnabled('swap', 'test', flags)).toBe(true);
    expect(isFeatureEnabled('swap', 'test', freezeFeature(flags, 'swap'))).toBe(false);
  });
});

// ── Audit ────────────────────────────────────────────────────────────────────
describe('audit — tamper-evident hash chain', () => {
  it('detects tampering and pinpoints where', async () => {
    const sink = new InMemoryAuditSink();
    const log = new AuditLog(sink, createTestEnv());
    await log.record({ category: 'login', action: 'login', actorId: 'u1', outcome: 'success' });
    await log.record({ category: 'admin_action', action: 'publish', actorId: 'a1', outcome: 'success' });

    const all = await sink.all();
    expect(log.verifyChain(all).intact).toBe(true);

    all[0]!.action = 'tampered';
    expect(log.verifyChain(all)).toEqual({ intact: false, brokenAt: 0 });
  });

  it('secure export proves chain integrity over the full log', async () => {
    const sink = new InMemoryAuditSink();
    const log = new AuditLog(sink, createTestEnv());
    await log.record({ category: 'login', action: 'login', actorId: 'u1', outcome: 'success' });
    const out = await log.export({ category: 'login' });
    expect(out.chain.intact).toBe(true);
    expect(out.records).toHaveLength(1);
  });
});

// ── Reporting ────────────────────────────────────────────────────────────────
describe('reporting', () => {
  it('summarizes compliance decisions deterministically', async () => {
    const sink = new InMemoryAuditSink();
    const log = new AuditLog(sink, createTestEnv({ nowIso: NOW }));
    await log.record({
      category: 'compliance_decision',
      action: 'evaluate:swap',
      actorId: 'u1',
      detail: { verdict: 'allow' },
      outcome: 'success',
    });
    await log.record({
      category: 'compliance_decision',
      action: 'evaluate:staking',
      actorId: 'u2',
      detail: { verdict: 'block' },
      outcome: 'denied',
    });
    const report = generateReport(
      { kind: 'compliance_summary', fromIso: '2026-01-01T00:00:00.000Z', toIso: '2026-12-01T00:00:00.000Z' },
      await sink.all(),
      NOW,
    );
    expect(report.summary.total).toBe(2);
    expect(report.summary.denied).toBe(1);
    expect(report.summary['verdict.allow']).toBe(1);
  });
});

// ── Facade ───────────────────────────────────────────────────────────────────
describe('CompliancePlatform facade — authorize + audit every governance action', () => {
  it('records every evaluation on the audit chain', async () => {
    const sink = new InMemoryAuditSink();
    const platform = createCompliancePlatform({
      registry: createProfileRegistry([standard]),
      auditSink: sink,
      env: createTestEnv(),
    });
    const d = await platform.evaluate(req());
    expect(d.verdict).toBe('allow');
    const records = await sink.all();
    expect(records).toHaveLength(1);
    expect(records[0]?.category).toBe('compliance_decision');
  });

  it('audits a DENIED governance attempt (never silent) and gates exports on permission', async () => {
    const sink = new InMemoryAuditSink();
    const platform = createCompliancePlatform({
      registry: createProfileRegistry([standard]),
      auditSink: sink,
      env: createTestEnv(),
      roleAssignments: [{ subjectId: 'admin1', roleId: 'admin' }],
    });
    const denied = await platform.governanceAction('nobody', 'profile.publish', 'publish:test@2');
    expect(denied.allowed).toBe(false);
    expect(denied.record.outcome).toBe('denied');

    expect((await platform.governanceAction('admin1', 'profile.publish', 'publish:test@2')).allowed).toBe(true);
    expect((await platform.exportAudit('admin1')).allowed).toBe(true);
    expect((await platform.exportAudit('nobody')).allowed).toBe(false);
  });
});
