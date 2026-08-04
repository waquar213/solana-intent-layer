/**
 * The pure condition evaluator. `evaluateCondition` is total (every AST node has
 * an answer) and reads ONLY the immutable `PolicyContext` — never a clock,
 * network, or the raw request's money fields (those are re-derived into the
 * context by the ContextEngine). Each satisfied leaf records its op-code in
 * `matched`, which becomes the machine-readable "why" on a fired rule.
 */
import { TRUST_RANK } from './types.js';
import type { ConditionExpr, PolicyContext } from './types.js';

/** ERC-20 "unlimited" approval sentinel (same threshold family the Risk engine uses). */
export const UNLIMITED_APPROVAL_THRESHOLD = 2n ** 255n;

export interface ConditionResult {
  satisfied: boolean;
  matched: string[];
}

const YES = (op: string): ConditionResult => ({ satisfied: true, matched: [op] });
const NO: ConditionResult = { satisfied: false, matched: [] };

export function evaluateCondition(ctx: PolicyContext, expr: ConditionExpr): ConditionResult {
  switch (expr.op) {
    case 'always':
      return YES('always');
    case 'and': {
      const matched: string[] = [];
      for (const child of expr.all) {
        const r = evaluateCondition(ctx, child);
        if (!r.satisfied) return NO;
        matched.push(...r.matched);
      }
      return { satisfied: true, matched: matched.length > 0 ? matched : ['and'] };
    }
    case 'or': {
      const matched: string[] = [];
      let any = false;
      for (const child of expr.any) {
        const r = evaluateCondition(ctx, child);
        if (r.satisfied) {
          any = true;
          matched.push(...r.matched);
        }
      }
      return any ? { satisfied: true, matched } : NO;
    }
    case 'not': {
      const r = evaluateCondition(ctx, expr.expr);
      return r.satisfied ? NO : YES('not');
    }
    case 'amount_gte':
      return ctx.request.amountMicros !== undefined && ctx.request.amountMicros >= expr.microsUsd
        ? YES('amount_gte')
        : NO;
    case 'amount_exceeds_daily_remaining':
      return ctx.request.amountMicros !== undefined && ctx.request.amountMicros > ctx.limits.dailyRemainingMicros
        ? YES('amount_exceeds_daily_remaining')
        : NO;
    case 'recipient_is_new':
      return ctx.recipient.isNew ? YES('recipient_is_new') : NO;
    case 'recipient_trust_below':
      return TRUST_RANK[ctx.recipient.trust] < TRUST_RANK[expr.level] ? YES('recipient_trust_below') : NO;
    case 'risk_score_gte':
      return ctx.risk.report.score >= expr.score ? YES('risk_score_gte') : NO;
    case 'risk_verdict_is':
      return ctx.risk.verdict === expr.verdict ? YES('risk_verdict_is') : NO;
    case 'security_score_below':
      return ctx.securityScore < expr.score ? YES('security_score_below') : NO;
    case 'device_untrusted':
      return !ctx.device.trusted ? YES('device_untrusted') : NO;
    case 'biometric_unavailable':
      return !ctx.device.biometricAvailable ? YES('biometric_unavailable') : NO;
    case 'intent_kind_in':
      return expr.kinds.includes(ctx.request.intentKind) ? YES('intent_kind_in') : NO;
    case 'policy_type_is':
      return ctx.request.policyType === expr.type ? YES('policy_type_is') : NO;
    case 'automation_not_preapproved':
      return ctx.request.policyType === 'automation' &&
        (ctx.request.automationRuleId === undefined || ctx.request.automationRuleId === '')
        ? YES('automation_not_preapproved')
        : NO;
    case 'approval_is_unlimited':
      return ctx.request.approval !== undefined && ctx.request.approval.amountBase >= UNLIMITED_APPROVAL_THRESHOLD
        ? YES('approval_is_unlimited')
        : NO;
    case 'time_within_window': {
      const hour = new Date(ctx.nowIso).getUTCHours();
      const { startHour, endHour } = expr.window;
      const inWindow = startHour <= endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
      return inWindow ? YES('time_within_window') : NO;
    }
    case 'network_unhealthy':
      return !ctx.network.healthy ? YES('network_unhealthy') : NO;
    case 'emergency_active':
      return ctx.flags.emergency ? YES('emergency_active') : NO;
    case 'recovery_mode':
      return ctx.flags.recovery ? YES('recovery_mode') : NO;
  }
}
