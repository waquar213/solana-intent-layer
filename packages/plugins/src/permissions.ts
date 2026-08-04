/**
 * The capability model. Each host method is unlocked by exactly one permission; a
 * plugin may call a method only if it was GRANTED that permission. Two hard rules
 * make this the security core:
 *   1. FORBIDDEN methods (keys, signing, raw DB, security internals, self-permission)
 *      map to NO permission and are denied unconditionally — even a plugin holding
 *      every grantable permission cannot reach them.
 *   2. An unknown/ungated method is denied by DEFAULT (deny-by-default), so adding a
 *      host method without gating it fails closed rather than leaking a capability.
 */
import { FORBIDDEN_METHODS, type Permission } from './types.js';

/** Host method → the single permission that unlocks it. */
export const METHOD_PERMISSION: Readonly<Record<string, Permission>> = {
  'portfolio.get': 'portfolio.read',
  'portfolio.list': 'portfolio.read',
  'portfolio.annotate': 'portfolio.write',
  'portfolio.tag': 'portfolio.write',
  'intent.get': 'intent.read',
  'intent.list': 'intent.read',
  'intent.propose': 'intent.create',
  'notifications.send': 'notifications.send',
  'analytics.query': 'analytics.read',
  'blockchain.getBalance': 'blockchain.read',
  'blockchain.getBlock': 'blockchain.read',
  'blockchain.call': 'blockchain.read',
  'provider.getQuote': 'provider.access',
  'provider.list': 'provider.access',
  'automation.createRule': 'automation.access',
  'automation.list': 'automation.access',
  'automation.schedule': 'background.execute',
};

const FORBIDDEN = new Set(FORBIDDEN_METHODS);

export interface CallDecision {
  allowed: boolean;
  reason: string;
}

/** Own-property lookup, so an inherited key ('__proto__', 'constructor', 'toString') resolves to undefined, not a truthy prototype value. */
const gatedPermission = (method: string): Permission | undefined =>
  Object.hasOwn(METHOD_PERMISSION, method) ? METHOD_PERMISSION[method] : undefined;

/** The permission that unlocks a method, or undefined if the method is ungated/forbidden. */
export function permissionForMethod(method: string): Permission | undefined {
  if (FORBIDDEN.has(method)) return undefined;
  return gatedPermission(method);
}

/**
 * The capability gate. Deny-by-default: allow only when the method is a known, gated
 * method AND its permission is in the granted set. Forbidden methods never pass, and
 * inherited object keys resolve to "unknown method" (no prototype-lookup bypass).
 */
export function authorizeHostCall(method: string, granted: readonly Permission[]): CallDecision {
  if (FORBIDDEN.has(method)) {
    return {
      allowed: false,
      reason: `forbidden method '${method}' — plugins can never access keys/signing/db/internals`,
    };
  }
  const needed = gatedPermission(method);
  if (!needed) return { allowed: false, reason: `unknown/ungated method '${method}' — denied by default` };
  if (!granted.includes(needed)) return { allowed: false, reason: `missing permission '${needed}' for '${method}'` };
  return { allowed: true, reason: `granted via '${needed}'` };
}

/** The host methods a set of permissions unlocks (for building a scoped API surface). */
export function methodsFor(granted: readonly Permission[]): string[] {
  const set = new Set(granted);
  return Object.entries(METHOD_PERMISSION)
    .filter(([, perm]) => set.has(perm))
    .map(([method]) => method)
    .sort();
}
