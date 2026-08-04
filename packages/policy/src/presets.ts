/**
 * The shipped rule library + the three preset policy sets. Priority bands:
 *   1000+  emergency / recovery
 *   800-999 hard security (unlimited approval, risk block, device untrusted)
 *   600-799 risk composition / automation gate
 *   400-599 enterprise / limits / liquidation
 *   200-399 user step-up (amount thresholds, new recipient)
 *   1-199   convenience
 * The hard-security rules are `overridable: false` — no user preset or child set
 * can loosen them. The three presets are strict ⊇ balanced ⊇ permissive: on any
 * request, strict's outcome is at least as restrictive as balanced's, which is
 * at least as restrictive as permissive's (proven in presets.test).
 */
import { canonicalizeRules } from './registry.js';
import { stableHash } from './env.js';
import type {
  ConditionExpr,
  ConfirmationRequirement,
  PolicyBasis,
  PolicyRule,
  PolicySet,
  RuleEffect,
} from './types.js';

const EPOCH = '2026-01-01T00:00:00.000Z';
const USD = (dollars: number): bigint => BigInt(dollars) * 1_000_000n;
const biometric: ConfirmationRequirement = { kind: 'biometric' };

interface RuleSpec {
  id: string;
  type: PolicyRule['type'];
  title: string;
  description: string;
  priority: number;
  when: ConditionExpr;
  effect: RuleEffect;
  overridable?: boolean;
}

const R = (s: RuleSpec): PolicyRule => ({
  id: s.id,
  type: s.type,
  title: s.title,
  description: s.description,
  priority: s.priority,
  when: s.when,
  effect: s.effect,
  overridable: s.overridable ?? true,
  enabled: true,
  version: 1,
  createdAtIso: EPOCH,
  createdBy: 'system',
});

// --- Shared hard-security floor (identical in every preset, non-overridable) ---

const EMERGENCY_FREEZE = R({
  id: 'emergency-freeze',
  type: 'emergency',
  title: 'Emergency freeze',
  priority: 1100,
  description: 'Block all actions while an emergency freeze is active.',
  when: { op: 'emergency_active' },
  overridable: false,
  effect: { outcome: 'blocked', code: 'EMERGENCY_FREEZE', reason: 'emergency freeze is active' },
});

const UNLIMITED_APPROVAL = R({
  id: 'unlimited-approval-block',
  type: 'approval',
  title: 'Reject unlimited approvals',
  priority: 900,
  description: 'Block unlimited (max-uint) token approvals.',
  when: { op: 'approval_is_unlimited' },
  overridable: false,
  effect: { outcome: 'blocked', code: 'UNLIMITED_APPROVAL', reason: 'unlimited token approval' },
});

const RISK_BLOCK = R({
  id: 'risk-verdict-block',
  type: 'risk',
  title: 'Honor Security Engine block',
  priority: 850,
  description: 'Block whenever the Security Engine returns a block verdict.',
  when: { op: 'risk_verdict_is', verdict: 'block' },
  overridable: false,
  effect: { outcome: 'blocked', code: 'RISK_BLOCK', reason: 'Security Engine blocked this action' },
});

const AUTOMATION_UNAPPROVED = R({
  id: 'automation-not-preapproved',
  type: 'automation',
  title: 'Automation must be pre-approved',
  priority: 700,
  description: 'Block automated actions that are not backed by a pre-approved rule.',
  when: { op: 'automation_not_preapproved' },
  overridable: false,
  effect: { outcome: 'blocked', code: 'AUTOMATION_UNAPPROVED', reason: 'automation outside an approved rule' },
});

const RISK_CONFIRM = R({
  id: 'risk-verdict-confirm',
  type: 'risk',
  title: 'Confirm on elevated risk',
  priority: 650,
  description: 'Require confirmation when the Security Engine asks for it.',
  when: { op: 'risk_verdict_is', verdict: 'require_confirmation' },
  effect: {
    outcome: 'approved_with_confirmation',
    requirement: biometric,
    code: 'RISK_CONFIRM',
    reason: 'elevated security risk',
  },
});

const LIQUIDATION = R({
  id: 'liquidation-escalate',
  type: 'transaction',
  title: 'Escalate liquidations',
  priority: 500,
  description: 'Require a second approver for portfolio liquidation.',
  when: { op: 'intent_kind_in', kinds: ['liquidate', 'sell_all', 'emergency_exit'] },
  effect: {
    outcome: 'escalated',
    requirement: { kind: 'second_approver', role: 'owner' },
    code: 'LIQUIDATION',
    reason: 'portfolio liquidation requires escalation',
  },
});

const DAILY_LIMIT = R({
  id: 'over-daily-limit',
  type: 'transaction',
  title: 'Confirm over daily limit',
  priority: 400,
  description: 'Require confirmation past the remaining daily budget.',
  when: { op: 'amount_exceeds_daily_remaining' },
  effect: {
    outcome: 'approved_with_confirmation',
    requirement: biometric,
    code: 'DAILY_LIMIT',
    reason: 'exceeds remaining daily limit',
  },
});

const NEW_RECIPIENT = R({
  id: 'new-recipient-confirm',
  type: 'transaction',
  title: 'Confirm new recipients',
  priority: 250,
  description: 'Require confirmation the first time you send to a recipient.',
  when: { op: 'recipient_is_new' },
  effect: {
    outcome: 'approved_with_confirmation',
    requirement: biometric,
    code: 'NEW_RECIPIENT',
    reason: 'first transfer to this recipient',
  },
});

const biometricThreshold = (id: string, microsUsd: bigint): PolicyRule =>
  R({
    id,
    type: 'transaction',
    title: 'Biometric above threshold',
    priority: 300,
    description: 'Require biometric confirmation above a value threshold.',
    when: { op: 'amount_gte', microsUsd },
    effect: {
      outcome: 'approved_with_confirmation',
      requirement: biometric,
      code: 'BIOMETRIC_THRESHOLD',
      reason: 'above the biometric threshold',
    },
  });

const deviceUntrusted = (block: boolean): PolicyRule =>
  R({
    id: 'device-untrusted',
    type: 'device',
    title: 'Untrusted device',
    priority: 820,
    description: block ? 'Block actions from an untrusted device.' : 'Confirm actions from an untrusted device.',
    when: { op: 'device_untrusted' },
    overridable: block,
    effect: block
      ? { outcome: 'blocked', code: 'DEVICE_UNTRUSTED', reason: 'untrusted device' }
      : {
          outcome: 'approved_with_confirmation',
          requirement: biometric,
          code: 'DEVICE_UNTRUSTED',
          reason: 'untrusted device',
        },
  });

const SHARED = [
  EMERGENCY_FREEZE,
  UNLIMITED_APPROVAL,
  RISK_BLOCK,
  AUTOMATION_UNAPPROVED,
  RISK_CONFIRM,
  LIQUIDATION,
  DAILY_LIMIT,
];

const makeSet = (id: string, name: string, basis: PolicyBasis, rules: PolicyRule[]): PolicySet => ({
  id,
  name,
  version: 1,
  basis,
  rules,
  createdAtIso: EPOCH,
  createdBy: 'system',
  contentHash: stableHash(canonicalizeRules(rules)),
});

export const POLICY_PRESETS: Record<'strict' | 'balanced' | 'permissive', PolicySet> = {
  strict: makeSet('preset-strict', 'Strict', 'strict', [
    ...SHARED,
    deviceUntrusted(true),
    biometricThreshold('biometric-threshold', USD(500)),
    NEW_RECIPIENT,
  ]),
  balanced: makeSet('preset-balanced', 'Balanced', 'balanced', [
    ...SHARED,
    deviceUntrusted(false),
    biometricThreshold('biometric-threshold', USD(2000)),
    NEW_RECIPIENT,
  ]),
  permissive: makeSet('preset-permissive', 'Permissive', 'permissive', [
    ...SHARED,
    biometricThreshold('biometric-threshold', USD(10_000)),
  ]),
};
