/**
 * PolicyEngine — the public entry. `evaluate` runs the full pipeline and ALWAYS
 * composes Risk internally, returning ONE `ExecutionPermission`. Callers never
 * read the Policy or Risk verdict in isolation (that would invite composition
 * drift); they read `permission.gate` and `permission.mayProceedToSign`. The
 * engine authorizes and records; it holds no keys and never signs.
 */
import { AuditLog, InMemoryAuditSink } from './audit.js';
import type { AuditSink } from './audit.js';
import { ContextEngine } from './context.js';
import type { ContextSources } from './context.js';
import { composeWithRisk, DecisionEngine } from './decision.js';
import { createTestEnv } from './env.js';
import type { PolicyEnv } from './env.js';
import { POLICY_PRESETS } from './presets.js';
import { InMemoryPolicyStore, PolicyRegistry } from './registry.js';
import type { PolicyStore } from './registry.js';
import { RuleEngine } from './rules.js';
import { PolicySimulator } from './simulate.js';
import type { SimulationRequest, SimulationResult } from './simulate.js';
import type { ExecutionPermission, PolicyRequest, PolicySet } from './types.js';

export interface PolicyEngineDeps {
  context: ContextEngine;
  registry: PolicyRegistry;
  rules: RuleEngine;
  decision: DecisionEngine;
  audit: AuditLog;
  env: PolicyEnv;
}

export class PolicyEngine {
  constructor(private readonly deps: PolicyEngineDeps) {}

  /** Assemble context → resolve active set → run rules → decide → compose with Risk → audit → permission. */
  async evaluate(request: PolicyRequest): Promise<ExecutionPermission> {
    const context = await this.deps.context.assemble(request);
    const activeSet = await this.deps.registry.activeSet(request.principalId);
    const fired = this.deps.rules.run(activeSet.rules, context);
    const decision = this.deps.decision.decide(fired, context, activeSet.contentHash);
    const permission = composeWithRisk(decision, context.risk, {
      ...(request.planId !== undefined ? { planId: request.planId } : {}),
      ...(request.intentId !== undefined ? { intentId: request.intentId } : {}),
    });
    await this.deps.audit.append(decision, {
      principalId: request.principalId,
      activeSetHash: activeSet.contentHash,
      permission,
    });
    return permission;
  }

  /** Dry-run a candidate policy set. Never writes to the store or audit log. */
  simulate(req: SimulationRequest): Promise<SimulationResult> {
    return new PolicySimulator({
      context: this.deps.context,
      rules: this.deps.rules,
      decision: this.deps.decision,
    }).simulate(req);
  }
}

export interface CreatePolicyEngineOptions {
  sources: ContextSources;
  env?: PolicyEnv;
  /** Fallback policy set when a principal has none active. Default: the balanced preset. */
  defaultSet?: PolicySet;
  store?: PolicyStore;
  auditSink?: AuditSink;
}

/** Ergonomic wiring: builds a fully-functional PolicyEngine over in-memory infra by default. */
export function createPolicyEngine(options: CreatePolicyEngineOptions): PolicyEngine {
  const env = options.env ?? createTestEnv();
  const store = options.store ?? new InMemoryPolicyStore();
  const context = new ContextEngine(options.sources, env);
  const registry = new PolicyRegistry(store, env, options.defaultSet ?? POLICY_PRESETS.balanced);
  const decision = new DecisionEngine(env);
  const audit = new AuditLog(options.auditSink ?? new InMemoryAuditSink(), env);
  return new PolicyEngine({ context, registry, rules: new RuleEngine(), decision, audit, env });
}
