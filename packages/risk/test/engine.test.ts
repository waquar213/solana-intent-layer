import { describe, expect, it } from 'vitest';
import { RiskEngine } from '../src/engine.js';
import { InMemoryThreatIntel } from '../src/intel.js';
import { evaluatePolicy, RISK_POLICY_PRESETS } from '../src/policy.js';
import { combineSignals } from '../src/scoring.js';
import type { SecuritySubject } from '../src/types.js';

const SCAM = '0xscamtoken000000000000000000000000000scam';
const SANCTIONED = '0x1111111111111111111111111111111111111111';

describe('RiskEngine — threat intelligence (hard blocks)', () => {
  it('blocks a known scam token', () => {
    const intel = new InMemoryThreatIntel({ scamTokens: [{ chainId: 'ethereum', address: SCAM }] });
    const engine = new RiskEngine({ intel });
    const decision = engine.evaluate({ kind: 'token', symbol: 'SCAM', address: SCAM, chainId: 'ethereum' });
    expect(decision.verdict).toBe('block');
    expect(decision.report.level).toBe('block');
  });

  it('blocks a sanctioned recipient — not overridable by a permissive policy', () => {
    const intel = new InMemoryThreatIntel({ sanctioned: [SANCTIONED] });
    const engine = new RiskEngine({ intel, policy: RISK_POLICY_PRESETS.permissive });
    const decision = engine.evaluate({ kind: 'address', address: SANCTIONED });
    expect(decision.verdict).toBe('block');
  });

  it('allows a clean address', () => {
    const engine = new RiskEngine();
    expect(engine.evaluate({ kind: 'address', address: '0xabcabcabcabcabcabcabcabcabcabcabcabcabca' }).verdict).toBe(
      'allow',
    );
  });
});

describe('RiskEngine — token heuristics + policy interaction', () => {
  const riskyToken: SecuritySubject = {
    kind: 'token',
    symbol: 'RISK',
    address: '0xrisk',
    chainId: 'ethereum',
    meta: { ageDays: 2, liquidityUsd: 30_000, audited: false, upgradeable: true },
  };

  it('accumulates heuristic signals into an elevated score', () => {
    const report = new RiskEngine().scan(riskyToken);
    expect(report.signals.map((s) => s.code).sort()).toEqual([
      'ADMIN_PRIVILEGES',
      'FRESH_TOKEN',
      'LOW_LIQUIDITY',
      'UNAUDITED',
    ]);
    expect(report.score).toBeGreaterThan(0.5);
  });

  it("a 'strict' policy requires confirmation or blocks where 'balanced' would allow", () => {
    const strict = new RiskEngine({ policy: RISK_POLICY_PRESETS.strict }).evaluate(riskyToken);
    const balanced = new RiskEngine({ policy: RISK_POLICY_PRESETS.balanced }).evaluate(riskyToken);
    // strict blocks unaudited outright; balanced tolerates it (confirmation at most).
    expect(strict.verdict).toBe('block');
    expect(['require_confirmation', 'allow']).toContain(balanced.verdict);
  });

  it('a honeypot is blocked under every policy', () => {
    const honey: SecuritySubject = {
      kind: 'token',
      symbol: 'HONEY',
      address: '0xhoney',
      chainId: 'ethereum',
      meta: { feeOnTransferBps: 3000 },
    };
    for (const preset of ['strict', 'balanced', 'permissive'] as const) {
      expect(new RiskEngine({ policy: RISK_POLICY_PRESETS[preset] }).evaluate(honey).verdict).toBe('block');
    }
  });
});

describe('RiskEngine — approvals & providers', () => {
  it('requires confirmation for an unlimited approval, blocks it under strict policy', () => {
    const approval: SecuritySubject = {
      kind: 'approval',
      token: 'USDC',
      spender: '0xspender',
      amount: 2n ** 255n,
      decimals: 6,
    };
    expect(new RiskEngine({ policy: RISK_POLICY_PRESETS.strict }).evaluate(approval).verdict).toBe('block');
    expect(new RiskEngine({ policy: RISK_POLICY_PRESETS.balanced }).evaluate(approval).verdict).toBe(
      'require_confirmation',
    );
  });

  it('flags a low-health provider against the policy threshold', () => {
    const engine = new RiskEngine({
      policy: { minProviderHealth: 0.6, maxRiskScore: 0.85, requireConfirmationAboveScore: 0.5 },
    });
    const decision = engine.evaluate({ kind: 'provider', providerId: 'flakyBridge', healthScore: 0.2, role: 'bridge' });
    expect(decision.report.signals[0]?.code).toBe('LOW_PROVIDER_HEALTH');
    expect(decision.policyViolations.length).toBeGreaterThan(0);
    // a healthy provider passes
    expect(engine.evaluate({ kind: 'provider', providerId: 'goodBridge', healthScore: 0.95 }).verdict).toBe('allow');
  });
});

describe('policy engine directly', () => {
  it('never loosens a hard-block report', () => {
    const blocked = combineSignals([{ code: 'x', category: 'intel', severity: 1, reason: 'sanctioned' }]);
    expect(evaluatePolicy(blocked, RISK_POLICY_PRESETS.permissive).verdict).toBe('block');
  });

  it('blocks when the score exceeds the configured maximum', () => {
    const high = combineSignals([
      { code: 'a', category: 'token', severity: 0.8, reason: 'a' },
      { code: 'b', category: 'liquidity', severity: 0.6, reason: 'b' },
    ]);
    expect(evaluatePolicy(high, { maxRiskScore: 0.7 }).verdict).toBe('block');
  });

  it('allows low risk and asks for confirmation on medium-high', () => {
    expect(evaluatePolicy(combineSignals([{ code: 'a', category: 'token', severity: 0.1, reason: 'a' }])).verdict).toBe(
      'allow',
    );
    expect(
      evaluatePolicy(combineSignals([{ code: 'a', category: 'token', severity: 0.65, reason: 'a' }])).verdict,
    ).toBe('require_confirmation');
  });
});
