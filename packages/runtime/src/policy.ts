/**
 * The authorization gate — the doctrine's middle step made real: intent PROPOSES,
 * policy (composed with risk) AUTHORIZES, the device signs. `authorizePlan` runs an
 * approved plan through the Policy Engine and returns ONE `ExecutionPermission`; the
 * caller signs only if `permission.mayProceedToSign`. The engine re-derives the
 * authoritative amount from the plan's own quote (never a spoofable request field)
 * and always composes with the Risk Engine, so policy and risk see the same subject.
 */
import {
  createInMemorySources,
  createPolicyEngine,
  POLICY_PRESETS,
  type ContextSources,
  type ExecutionPermission,
  type PolicySet,
  type PolicyType,
} from '@intent-wallet/policy';
import type { RiskEngine } from '@intent-wallet/risk';
import type { ExecutionPlan } from '@intent-wallet/intents';

function policyTypeFor(intentKind: string): PolicyType {
  if (intentKind === 'swap') return 'swap';
  if (intentKind === 'bridge') return 'bridge';
  return 'transaction';
}

/**
 * The recipient of a plan — the actual external TRANSFER destination. Only `kind:'transfer'` steps
 * carry a recipient ADDRESS in `params.to`; a swap leg's `to` is a token SYMBOL ("USDC"), and a plain
 * swap/stake has no recipient. Scanning the first `to` of ANY kind meant a `swap_and_send` had its swap
 * leg's symbol evaluated as the recipient — so the RiskEngine's burn/sanctions/blacklist detectors never
 * saw the real destination and the authoritative server gate was toothless for swap-and-send recipients.
 */
function recipientOf(plan: ExecutionPlan): { address: string; chainId: string } | undefined {
  for (const step of plan.steps) {
    if (step.kind !== 'transfer') continue; // swap/stake legs carry a token symbol in `to`, not an address
    const to = step.params['to'];
    if (typeof to === 'string' && to.length > 0) return { address: to, chainId: step.chainId };
  }
  return undefined;
}

export interface AuthorizeDeps {
  riskEngine: RiskEngine;
  principalId: string;
  /** Policy set to evaluate against; defaults to the balanced preset. */
  policySet?: PolicySet;
  limits?: ContextSources['limits'];
  device?: ContextSources['device'];
  trust?: ContextSources['trust'];
  flags?: ContextSources['flags'];
  requestId?: string;
}

export async function authorizePlan(plan: ExecutionPlan, deps: AuthorizeDeps): Promise<ExecutionPermission> {
  const youSendMicros = BigInt(plan.quote.youSend.valueMicros ?? '0');
  const sources = createInMemorySources(deps.riskEngine, {
    // Authoritative amount from THIS plan's quote (fail-closed if a plan is claimed but absent).
    planQuote: () => Promise.resolve({ youSendMicros }),
    ...(deps.limits ? { limits: deps.limits } : {}),
    ...(deps.device ? { device: deps.device } : {}),
    ...(deps.trust ? { trust: deps.trust } : {}),
    ...(deps.flags ? { flags: deps.flags } : {}),
  });
  const engine = createPolicyEngine({ sources, defaultSet: deps.policySet ?? POLICY_PRESETS.balanced });
  const recipient = recipientOf(plan);
  return engine.evaluate({
    requestId: deps.requestId ?? `req-${plan.planId}`,
    policyType: policyTypeFor(plan.intentKind),
    intentKind: plan.intentKind,
    planId: plan.planId,
    intentId: plan.intentId,
    principalId: deps.principalId,
    amountMicros: youSendMicros,
    ...(recipient ? { recipient } : {}),
  });
}
