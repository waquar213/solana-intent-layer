/**
 * RiskEngine — the immune system's entry point. Every action is evaluated here
 * BEFORE execution. The pipeline:
 *
 *   subject → threat-intel lookup → heuristic detectors → composite score
 *   → policy → SecurityDecision (allow / require_confirmation / block)
 *
 * It EVALUATES and AUTHORIZES; it never signs and never holds funds. It is the
 * real implementation behind the `RiskProvider` the Intent planner, Execution
 * Engine, and Route Optimizer depend on. Standalone (no wallet/chain deps) so
 * it can also be a security-as-a-service API.
 */
import type { RiskReport, RiskSignal, SecurityDecision, SecuritySubject } from './types.js';
import { combineSignals } from './scoring.js';
import { emptyThreatIntel, type ThreatIntel } from './intel.js';
import {
  detectAddressPoisoning,
  detectBurnAddress,
  detectAdminPrivileges,
  detectFreshToken,
  detectHoneypot,
  detectLowLiquidity,
  detectOwnershipConcentration,
  detectUnaudited,
  detectUnlimitedApproval,
} from './detectors.js';
import { evaluatePolicy, RISK_POLICY_PRESETS, type PolicyConfig } from './policy.js';

const HARD = 1;

export interface RiskEngineOptions {
  intel?: ThreatIntel;
  policy?: PolicyConfig;
}

export class RiskEngine {
  readonly #intel: ThreatIntel;
  readonly #policy: PolicyConfig;

  constructor(options: RiskEngineOptions = {}) {
    this.#intel = options.intel ?? emptyThreatIntel;
    this.#policy = options.policy ?? RISK_POLICY_PRESETS.balanced;
  }

  /** The composite risk report for a subject (no policy applied). */
  scan(subject: SecuritySubject): RiskReport {
    return combineSignals(this.#collect(subject));
  }

  /** The full security decision: report + policy verdict. */
  evaluate(subject: SecuritySubject): SecurityDecision {
    const report = this.scan(subject);
    const policy = evaluatePolicy(report, this.#policy);
    return { verdict: policy.verdict, report, policyViolations: policy.violations };
  }

  #collect(subject: SecuritySubject): RiskSignal[] {
    switch (subject.kind) {
      case 'token':
        return this.#tokenSignals(subject);
      case 'address':
        return this.#addressSignals(subject);
      case 'approval':
        return this.#approvalSignals(subject);
      case 'provider':
        return this.#providerSignals(subject);
    }
  }

  #tokenSignals(subject: Extract<SecuritySubject, { kind: 'token' }>): RiskSignal[] {
    const signals: RiskSignal[] = [];
    if (this.#intel.isKnownScamToken(subject.chainId, subject.address)) {
      signals.push({
        code: 'KNOWN_SCAM_TOKEN',
        category: 'intel',
        severity: HARD,
        reason: `${subject.symbol} is a known scam token.`,
      });
    }
    if (this.#intel.isMaliciousContract(subject.chainId, subject.address)) {
      signals.push({
        code: 'MALICIOUS_CONTRACT',
        category: 'intel',
        severity: HARD,
        reason: 'Contract is flagged as malicious.',
      });
    }
    for (const d of [
      detectHoneypot,
      detectFreshToken,
      detectLowLiquidity,
      detectOwnershipConcentration,
      detectAdminPrivileges,
      detectUnaudited,
    ]) {
      const s = d(subject);
      if (s) signals.push(s);
    }
    return signals;
  }

  #addressSignals(subject: Extract<SecuritySubject, { kind: 'address' }>): RiskSignal[] {
    const signals: RiskSignal[] = [];
    if (this.#intel.isSanctioned(subject.address)) {
      signals.push({
        code: 'SANCTIONED_ADDRESS',
        category: 'intel',
        severity: HARD,
        reason: 'Recipient is on a sanctions list.',
      });
    }
    if (this.#intel.isBlacklisted(subject.address)) {
      signals.push({
        code: 'BLACKLISTED_ADDRESS',
        category: 'intel',
        severity: HARD,
        reason: 'Recipient is blacklisted (known theft/scam address).',
      });
    }
    const burn = detectBurnAddress(subject);
    if (burn) signals.push(burn);
    const poison = detectAddressPoisoning(subject);
    if (poison) signals.push(poison);
    return signals;
  }

  #approvalSignals(subject: Extract<SecuritySubject, { kind: 'approval' }>): RiskSignal[] {
    const signals: RiskSignal[] = [];
    if (this.#intel.isMaliciousContract('', subject.spender) || this.#intel.isBlacklisted(subject.spender)) {
      signals.push({
        code: 'MALICIOUS_SPENDER',
        category: 'intel',
        severity: HARD,
        reason: 'Approval spender is a flagged contract.',
      });
    }
    const unlimited = detectUnlimitedApproval(subject);
    if (unlimited) signals.push(unlimited);
    return signals;
  }

  #providerSignals(subject: Extract<SecuritySubject, { kind: 'provider' }>): RiskSignal[] {
    const threshold = this.#policy.minProviderHealth ?? 0.3;
    if (subject.healthScore < threshold) {
      return [
        {
          code: 'LOW_PROVIDER_HEALTH',
          category: 'provider',
          severity: clamp01(1 - subject.healthScore),
          reason: `${subject.role ?? 'Provider'} ${subject.providerId} health ${subject.healthScore.toFixed(2)} is below the ${threshold} threshold.`,
        },
      ];
    }
    return [];
  }
}

/** Clamp to [0,1], FAILING CLOSED: an unreadable value is the worst case, not the best.
 *  (`x < 0 ? 0 : x > 1 ? 1 : x` let NaN through entirely and folded -Infinity to "no risk".) */
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 1;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
