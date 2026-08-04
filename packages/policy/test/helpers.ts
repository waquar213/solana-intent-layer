import { RiskEngine, InMemoryThreatIntel } from '@intent-wallet/risk';
import type { FiredRule, PolicyContext, PolicyOutcome, PolicyRequest, SecurityDecision } from '../src/index.js';

/** A fired-rule fixture. */
export const F = (ruleId: string, priority: number, outcome: PolicyOutcome, overridable = true): FiredRule => ({
  ruleId,
  type: 'transaction',
  priority,
  outcome,
  code: ruleId.toUpperCase(),
  reason: ruleId,
  matched: ['always'],
  overridable,
});

export const ALLOW: SecurityDecision = {
  verdict: 'allow',
  report: { level: 'low', score: 0, signals: [] },
  policyViolations: [],
};

/** A clean Risk engine (nothing flagged). */
export const cleanRisk = (): RiskEngine => new RiskEngine();

/** A Risk engine that blocks one sanctioned address. */
export const sanctioningRisk = (address: string): RiskEngine =>
  new RiskEngine({ intel: new InMemoryThreatIntel({ sanctioned: [address] }) });

export const req = (over: Partial<PolicyRequest> = {}): PolicyRequest => ({
  requestId: 'req-1',
  policyType: 'transaction',
  intentKind: 'transfer',
  principalId: 'user-1',
  ...over,
});

export interface CtxOverrides {
  request?: Partial<PolicyRequest>;
  risk?: SecurityDecision;
  securityScore?: number;
  recipient?: { trust: PolicyContext['recipient']['trust']; isNew: boolean };
  device?: { trusted: boolean; biometricAvailable: boolean };
  limits?: { dailyRemainingMicros: bigint };
  network?: { healthy: boolean };
  flags?: { emergency: boolean; recovery: boolean };
  nowIso?: string;
}

export const ctx = (over: CtxOverrides = {}): PolicyContext => ({
  request: req(over.request),
  risk: over.risk ?? ALLOW,
  securityScore: over.securityScore ?? 100,
  recipient: over.recipient ?? { trust: 'trusted', isNew: false },
  device: over.device ?? { trusted: true, biometricAvailable: true },
  limits: over.limits ?? { dailyRemainingMicros: 1_000_000_000_000n },
  network: over.network ?? { healthy: true },
  flags: over.flags ?? { emergency: false, recovery: false },
  nowIso: over.nowIso ?? '2026-01-01T12:00:00.000Z',
});
