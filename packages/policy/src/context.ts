/**
 * The Context Engine — stage 3 of the pipeline. It assembles the immutable,
 * deep-frozen `PolicyContext` the rules evaluate against, from injected sources.
 *
 * Two anti-spoofing guarantees live here:
 *  - The authoritative transaction amount is RE-DERIVED from the plan quote
 *    (the persisted `ExecutionPlan.quote`) via the injected `planQuote` source,
 *    never trusted from the caller's request. A request that claims $100 while
 *    its plan sends $10k is gated on $10k.
 *  - Recipient trust and risk come from the injected sources / the Risk engine,
 *    never from caller-supplied fields.
 *
 * It calls `RiskEngine.evaluate(subjectFor(request))` so Risk and Policy see the
 * same action, and the composition downstream is honest.
 */
import type { RiskEngine, SecurityDecision, SecuritySubject } from '@intent-wallet/risk';
import { PolicyError } from './errors.js';
import type { PolicyEnv } from './env.js';
import type { PolicyContext, PolicyRequest, TrustLevel } from './types.js';

/** A clean `allow` decision for actions with no specific risk subject (e.g. a plain swap). */
const ALLOW_DECISION: SecurityDecision = {
  verdict: 'allow',
  report: { level: 'low', score: 0, signals: [] },
  policyViolations: [],
};

/** Map a policy request to the Risk engine's subject. Returns null when no specific subject applies. */
export function subjectFor(request: PolicyRequest): SecuritySubject | null {
  if (request.approval) {
    return {
      kind: 'approval',
      token: request.approval.token,
      spender: request.approval.spender,
      amount: request.approval.amountBase,
      decimals: request.approval.decimals,
    };
  }
  if (request.recipient) {
    return { kind: 'address', address: request.recipient.address };
  }
  return null;
}

export interface ContextSources {
  /** The Risk engine — Policy always composes with it. */
  risk: RiskEngine;
  /** Authoritative amount source: reads the persisted plan quote. Absence falls back to the advisory request amount. */
  planQuote?: (planId: string) => Promise<{ youSendMicros: bigint } | null>;
  trust: (address: string, chainId: string, principalId: string) => Promise<{ level: TrustLevel; isNew: boolean }>;
  device: (principalId: string) => Promise<{ trusted: boolean; biometricAvailable: boolean }>;
  limits: (principalId: string) => Promise<{ dailyRemainingMicros: bigint }>;
  network: () => Promise<{ healthy: boolean }>;
  intelligence?: (principalId: string) => Promise<{ securityScore: number }>;
  flags?: (principalId: string) => Promise<{ emergency: boolean; recovery: boolean }>;
}

/** Recursively freeze an object graph so the context is provably immutable during evaluation. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

export interface InMemorySourceOverrides {
  planQuote?: ContextSources['planQuote'];
  trust?: ContextSources['trust'];
  device?: ContextSources['device'];
  limits?: ContextSources['limits'];
  network?: ContextSources['network'];
  intelligence?: ContextSources['intelligence'];
  flags?: ContextSources['flags'];
}

/** Permissive in-memory sources for tests: trusted device, huge daily limit, healthy network. Override per test. */
export function createInMemorySources(risk: RiskEngine, overrides: InMemorySourceOverrides = {}): ContextSources {
  return {
    risk,
    trust: overrides.trust ?? (async () => ({ level: 'trusted', isNew: false })),
    device: overrides.device ?? (async () => ({ trusted: true, biometricAvailable: true })),
    limits: overrides.limits ?? (async () => ({ dailyRemainingMicros: 10n ** 18n })),
    network: overrides.network ?? (async () => ({ healthy: true })),
    ...(overrides.planQuote ? { planQuote: overrides.planQuote } : {}),
    ...(overrides.intelligence ? { intelligence: overrides.intelligence } : {}),
    ...(overrides.flags ? { flags: overrides.flags } : {}),
  };
}

export class ContextEngine {
  constructor(
    private readonly sources: ContextSources,
    private readonly env: PolicyEnv,
  ) {}

  async assemble(request: PolicyRequest): Promise<PolicyContext> {
    let context: PolicyContext;
    try {
      const nowIso = this.env.now();

      // Risk — same subject Policy will govern.
      const subject = subjectFor(request);
      const risk = subject ? this.sources.risk.evaluate(subject) : ALLOW_DECISION;

      // Authoritative amount: re-derive from the plan quote when a plan backs the
      // request. If a plan is claimed but its quote is unresolvable, FAIL CLOSED —
      // never fall back to the request's (spoofable) amount.
      let amountMicros = request.amountMicros;
      if (request.planId !== undefined && this.sources.planQuote) {
        const quote = await this.sources.planQuote(request.planId);
        if (!quote) {
          throw new PolicyError(
            'CONTEXT_ASSEMBLY_FAILED',
            `plan "${request.planId}" quote is unresolvable — refusing to trust a request-supplied amount`,
          );
        }
        amountMicros = quote.youSendMicros;
      }

      const recipientTrust = request.recipient
        ? await this.sources.trust(request.recipient.address, request.recipient.chainId, request.principalId)
        : { level: 'trusted' as TrustLevel, isNew: false };
      const recipient = { trust: recipientTrust.level, isNew: recipientTrust.isNew };

      const device = await this.sources.device(request.principalId);
      const limits = await this.sources.limits(request.principalId);
      const network = await this.sources.network();
      const securityScore = this.sources.intelligence
        ? (await this.sources.intelligence(request.principalId)).securityScore
        : 100;
      const flags = this.sources.flags
        ? await this.sources.flags(request.principalId)
        : { emergency: false, recovery: false };

      context = {
        request: { ...request, ...(amountMicros !== undefined ? { amountMicros } : {}) },
        risk,
        securityScore,
        recipient,
        device,
        limits,
        network,
        flags,
        nowIso,
      };
    } catch (err) {
      throw new PolicyError('CONTEXT_ASSEMBLY_FAILED', `failed to assemble policy context: ${String(err)}`);
    }
    return deepFreeze(context);
  }
}
