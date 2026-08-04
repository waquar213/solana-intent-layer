/**
 * Static provider/bridge route-class facts. A declaration says a route class EXISTS
 * ("Stargate CAN bridge eip155:1 → eip155:137 for USDC") — a precondition the planner
 * checks BEFORE the router spends a quote. It carries NO liveness: successRate,
 * latency, and circuit state are the job of @intent-wallet/providers and change every
 * request; this registry never imports those types. `enabled` is an integration-time
 * toggle ("we are configured to offer this class"), not health.
 *
 * Fail-closed: a route class not declared here does not exist. v1 models DIRECT edges
 * only — no transitive multi-hop bridge inference.
 */
import { CapabilityError } from './errors.js';
import { ROUTE_ACTIONS, type ProviderRouteDeclaration, type RouteAction } from './types.js';

/** Dedup/identity key for a route class. */
const keyOf = (d: Pick<ProviderRouteDeclaration, 'providerId' | 'action' | 'fromChainId' | 'toChainId' | 'symbol'>): string =>
  `${d.providerId}|${d.action}|${d.fromChainId}|${d.toChainId}|${d.symbol.toUpperCase()}`;

export class ProviderRouteRegistry {
  private readonly byKey = new Map<string, ProviderRouteDeclaration>();

  registerRoute(decl: ProviderRouteDeclaration): void {
    if (!decl.providerId) throw new CapabilityError('INVALID_REQUEST', 'route declaration requires a providerId');
    if (!ROUTE_ACTIONS.includes(decl.action)) {
      throw new CapabilityError('INVALID_REQUEST', `unknown route action '${decl.action}'`);
    }
    if (!decl.fromChainId || !decl.toChainId || !decl.symbol) {
      throw new CapabilityError('INVALID_REQUEST', 'route declaration requires fromChainId, toChainId, symbol');
    }
    if (decl.action === 'swap_same_chain' && decl.fromChainId !== decl.toChainId) {
      throw new CapabilityError('INVALID_REQUEST', 'a same-chain swap must have fromChainId === toChainId');
    }
    if (decl.action === 'bridge_cross_chain' && decl.fromChainId === decl.toChainId) {
      throw new CapabilityError('INVALID_REQUEST', 'a cross-chain bridge must have distinct from/to chains');
    }
    // structuredClone keeps the registry's copy independent of the caller's object.
    this.byKey.set(keyOf(decl), structuredClone(decl));
  }

  /**
   * Route classes matching (action, from, to, symbol) that are ENABLED. Empty ⇒ no
   * provider even claims this route class exists (a fail-closed precondition).
   */
  routesFor(action: RouteAction, fromChainId: string, toChainId: string, symbol: string): ProviderRouteDeclaration[] {
    const wantSymbol = symbol.toUpperCase();
    return [...this.byKey.values()]
      .filter(
        (d) =>
          d.enabled &&
          d.action === action &&
          d.fromChainId === fromChainId &&
          d.toChainId === toChainId &&
          d.symbol.toUpperCase() === wantSymbol,
      )
      .map((d) => structuredClone(d));
  }

  /**
   * Static adjacency of declared, enabled bridge routes: fromChainId → set of
   * reachable toChainIds (direct edges only). For a planner "which chains can I reach"
   * query — NOT a live routing table.
   */
  bridgeConnectivity(): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    for (const d of this.byKey.values()) {
      if (!d.enabled || d.action !== 'bridge_cross_chain') continue;
      const to = graph.get(d.fromChainId) ?? new Set<string>();
      to.add(d.toChainId);
      graph.set(d.fromChainId, to);
    }
    return graph;
  }
}

export function createProviderRouteRegistry(seed: readonly ProviderRouteDeclaration[] = []): ProviderRouteRegistry {
  const reg = new ProviderRouteRegistry();
  for (const d of seed) reg.registerRoute(d);
  return reg;
}
