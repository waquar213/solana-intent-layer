/**
 * Policy Engine — turns a risk report into an authorization verdict under
 * CONFIGURABLE rules. Policies are the user/enterprise's security posture:
 * "never unaudited contracts", "never unlimited approvals", "reject above risk
 * score X", "require confirmation for high-risk". A `block`-level report (a hard
 * intel/honeypot hit) is NEVER overridable; policies can only make things
 * stricter (turn an allow into a confirmation/block), never looser.
 */
import type { RiskReport, SecurityVerdict } from './types.js';

export interface PolicyConfig {
  /** Block when the composite score exceeds this. Default 0.85. */
  maxRiskScore?: number;
  /** Require confirmation when the score exceeds this (and it's below maxRiskScore). Default 0.5. */
  requireConfirmationAboveScore?: number;
  /** Block any subject carrying an UNAUDITED signal. */
  blockUnaudited?: boolean;
  /** Block any UNLIMITED_APPROVAL. */
  blockUnlimitedApproval?: boolean;
  /** Block a provider whose health is below this [0,1]. Applies to PROVIDER subjects. */
  minProviderHealth?: number;
}

export const RISK_POLICY_PRESETS = {
  strict: {
    maxRiskScore: 0.6,
    requireConfirmationAboveScore: 0.3,
    blockUnaudited: true,
    blockUnlimitedApproval: true,
    minProviderHealth: 0.6,
  },
  balanced: {
    maxRiskScore: 0.85,
    requireConfirmationAboveScore: 0.5,
    blockUnaudited: false,
    blockUnlimitedApproval: false,
    minProviderHealth: 0.3,
  },
  permissive: {
    maxRiskScore: 0.95,
    requireConfirmationAboveScore: 0.75,
    blockUnaudited: false,
    blockUnlimitedApproval: false,
    minProviderHealth: 0.1,
  },
} as const satisfies Record<string, PolicyConfig>;

export type PolicyPreset = keyof typeof RISK_POLICY_PRESETS;

export interface PolicyResult {
  verdict: SecurityVerdict;
  violations: string[];
}

export function evaluatePolicy(report: RiskReport, config: PolicyConfig = RISK_POLICY_PRESETS.balanced): PolicyResult {
  const violations: string[] = [];

  // 1. A hard-block report is final — no policy can loosen it.
  if (report.level === 'block') {
    return { verdict: 'block', violations: report.signals.filter((s) => s.severity >= 0.99).map((s) => s.reason) };
  }

  const maxScore = config.maxRiskScore ?? 0.85;
  const confirmAbove = config.requireConfirmationAboveScore ?? 0.5;

  // 2. Hard policy rules → block.
  if (config.blockUnaudited && report.signals.some((s) => s.code === 'UNAUDITED')) {
    violations.push('Policy: unaudited contracts are not allowed.');
  }
  if (config.blockUnlimitedApproval && report.signals.some((s) => s.code === 'UNLIMITED_APPROVAL')) {
    violations.push('Policy: unlimited approvals are not allowed.');
  }
  if (config.minProviderHealth !== undefined) {
    const lowHealth = report.signals.find((s) => s.code === 'LOW_PROVIDER_HEALTH');
    if (lowHealth) violations.push('Policy: provider health is below your threshold.');
  }
  if (report.score > maxScore) {
    violations.push(`Policy: risk score ${report.score} exceeds your limit of ${maxScore}.`);
  }
  if (violations.length > 0) return { verdict: 'block', violations };

  // 3. Confirmation zone.
  if (report.level === 'high' || report.score > confirmAbove) {
    return {
      verdict: 'require_confirmation',
      violations: [`Elevated risk (score ${report.score}) — confirm you understand before proceeding.`],
    };
  }

  return { verdict: 'allow', violations: [] };
}
