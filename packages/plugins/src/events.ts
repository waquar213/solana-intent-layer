/**
 * Event-subscription authorization. An event delivers platform data to a plugin, so
 * subscribing to it requires the same read permission that would let the plugin fetch
 * that data directly — otherwise events would be a permission-bypass side channel.
 * Ecosystem meta-events (a plugin was installed/updated) carry no user data and are
 * public. Deny-by-default: an unmapped event is denied.
 */
import type { EventName, Permission } from './types.js';

/** Event → the permission required to subscribe. `null` = public (no user data). */
export const EVENT_PERMISSION: Readonly<Record<EventName, Permission | null>> = {
  'portfolio.updated': 'portfolio.read',
  'intent.created': 'intent.read',
  'execution.completed': 'intent.read',
  'execution.failed': 'intent.read',
  'security.alert': 'analytics.read',
  'automation.triggered': 'automation.access',
  'price.updated': 'analytics.read',
  'plugin.installed': null,
  'plugin.updated': null,
};

export interface SubscriptionDecision {
  allowed: boolean;
  reason: string;
}

export function authorizeSubscription(event: EventName, granted: readonly Permission[]): SubscriptionDecision {
  // Own-property lookup, so an inherited key ('__proto__', 'constructor') resolves to
  // "unknown event", not a truthy prototype value that could slip past the gate.
  const required = Object.hasOwn(EVENT_PERMISSION, event) ? EVENT_PERMISSION[event] : undefined;
  if (required === undefined) return { allowed: false, reason: `unknown event '${event}' — denied by default` };
  if (required === null) return { allowed: true, reason: 'public lifecycle event' };
  if (!granted.includes(required))
    return { allowed: false, reason: `missing permission '${required}' for event '${event}'` };
  return { allowed: true, reason: `granted via '${required}'` };
}

/** The subset of requested events a plugin is actually authorized to subscribe to. */
export function authorizedSubscriptions(events: readonly EventName[], granted: readonly Permission[]): EventName[] {
  return events.filter((e) => authorizeSubscription(e, granted).allowed);
}
