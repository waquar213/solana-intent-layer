/**
 * CapabilityService — the single deterministic surface the runtime / Intent Engine /
 * Route Optimizer consult. Every query FAILS CLOSED: an unknown chain, a chain whose
 * active profile isn't `availability: 'supported'`, or a capability absent from the
 * profile all return false / infeasible. This is the gate that stops a plan the
 * platform provably cannot execute (a bridge to an undeclared route, a stake on a
 * chain with no staking) before it ever reaches signing.
 *
 * It answers "CAN it?" from static profiles + route declarations; it never quotes,
 * scores, or executes. Live provider health stays in @intent-wallet/providers.
 */
import type { ChainCapabilityRegistry } from './profiles.js';
import type { ProviderRouteRegistry } from './routes.js';
import type {
  Capability,
  FeeModel,
  PlanFeasibility,
  PlanStepKind,
  StepCapabilityInput,
  StepFeasibility,
} from './types.js';

/** Each plan step kind maps to the ONE capability its chain must have. Exhaustive over PlanStepKind. */
const STEP_CAPABILITY: Record<PlanStepKind, Capability> = {
  transfer: 'transfer',
  swap: 'swap',
  bridge: 'bridge',
  approve: 'approve',
  stake: 'stake',
};

export interface CapabilityServiceDeps {
  chains: ChainCapabilityRegistry;
  routes: ProviderRouteRegistry;
}

export class CapabilityService {
  constructor(private readonly deps: CapabilityServiceDeps) {}

  /** True only when an ACTIVE profile exists AND its availability is 'supported'. */
  supportsChain(chainId: string): boolean {
    const p = this.deps.chains.getActive(chainId);
    return p !== undefined && p.availability === 'supported';
  }

  /** Fail-closed: unknown chain, unsupported chain, or capability absent ⇒ false. */
  supportsCapability(chainId: string, cap: Capability): boolean {
    const p = this.deps.chains.getActive(chainId);
    if (!p || p.availability !== 'supported') return false;
    return p.capabilities.includes(cap);
  }

  /** The chain's gas-pricing model. Fail-closed: undefined for an unknown OR non-'supported' chain. */
  feeModelFor(chainId: string): FeeModel | undefined {
    const p = this.deps.chains.getActive(chainId);
    return p && p.availability === 'supported' ? p.feeModel : undefined;
  }

  /** Can this chain hold/move a recipient of the given ecosystem? (network-match + transfer). */
  canTransfer(chainId: string, ecosystem: 'evm' | 'btc' | 'sol'): boolean {
    const p = this.deps.chains.getActive(chainId);
    if (!p || p.availability !== 'supported') return false;
    return p.ecosystem === ecosystem && p.capabilities.includes('transfer');
  }

  canSwap(chainId: string): boolean {
    return this.supportsCapability(chainId, 'swap');
  }

  /**
   * Both endpoints supported + the source chain declares `bridge` + a declared bridge
   * route exists. With a symbol, the route must match it; without, any enabled bridge
   * edge from→to suffices. Direct edges only (no multi-hop inference).
   */
  canBridge(fromChainId: string, toChainId: string, symbol?: string): boolean {
    if (fromChainId === toChainId) return false;
    if (!this.supportsChain(fromChainId) || !this.supportsChain(toChainId)) return false;
    if (!this.supportsCapability(fromChainId, 'bridge')) return false;
    if (symbol) {
      return this.deps.routes.routesFor('bridge_cross_chain', fromChainId, toChainId, symbol).length > 0;
    }
    return this.deps.routes.bridgeConnectivity().get(fromChainId)?.has(toChainId) ?? false;
  }

  /** Is one step executable? Maps its kind → required capability; bridges also need a route. */
  checkStep(step: StepCapabilityInput): StepFeasibility {
    if (!this.supportsChain(step.chainId)) {
      return { supported: false, reason: `network '${step.chainId}' is not supported` };
    }
    const cap = STEP_CAPABILITY[step.kind];
    if (!this.supportsCapability(step.chainId, cap)) {
      return { supported: false, reason: `network '${step.chainId}' does not support '${step.kind}'` };
    }
    if (step.kind === 'bridge') {
      const to = step.toChainId;
      if (!to) return { supported: false, reason: 'bridge step is missing a destination network' };
      if (!this.supportsChain(to)) return { supported: false, reason: `destination network '${to}' is not supported` };
      if (!this.canBridge(step.chainId, to, step.symbol)) {
        return {
          supported: false,
          reason: `no bridge route from '${step.chainId}' to '${to}'${step.symbol ? ` for ${step.symbol}` : ''}`,
        };
      }
    }
    return { supported: true };
  }

  /** Every step must pass, or the plan is infeasible — with the exact offending steps. */
  checkPlan(plan: { steps: readonly StepCapabilityInput[] }): PlanFeasibility {
    const unsupported: { seq: number; kind: PlanStepKind; chainId: string; reason: string }[] = [];
    plan.steps.forEach((step, i) => {
      const r = this.checkStep(step);
      if (!r.supported) {
        unsupported.push({ seq: step.seq ?? i, kind: step.kind, chainId: step.chainId, reason: r.reason ?? 'unsupported' });
      }
    });
    return { feasible: unsupported.length === 0, unsupported };
  }
}

export function createCapabilityService(deps: CapabilityServiceDeps): CapabilityService {
  return new CapabilityService(deps);
}
