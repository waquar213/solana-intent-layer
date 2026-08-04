/**
 * Manifest validation — the first gate. A manifest that doesn't parse cleanly never
 * reaches signature verification. Pure and deterministic; throws `PluginError` with a
 * precise code so a publishing pipeline can surface exactly what's wrong.
 */
import { PluginError } from './errors.js';
import { tryParse } from './semver.js';
import { ALL_PERMISSIONS, TRUST_RANK, type EventName, type PluginManifest, type PluginType } from './types.js';

const TYPES = new Set<PluginType>([
  'blockchain',
  'provider',
  'dex',
  'bridge',
  'portfolio',
  'analytics',
  'automation',
  'ai',
  'tax',
  'notification',
  'enterprise',
  'identity',
  'risk',
  'compliance',
  'payment',
]);

const EVENTS = new Set<EventName>([
  'portfolio.updated',
  'intent.created',
  'execution.completed',
  'execution.failed',
  'security.alert',
  'automation.triggered',
  'price.updated',
  'plugin.installed',
  'plugin.updated',
]);

const PERMS = new Set<string>(ALL_PERMISSIONS);

export function validateManifest(m: PluginManifest): void {
  const bad = (msg: string): never => {
    throw new PluginError('INVALID_MANIFEST', msg);
  };
  if (!m.id || /\s/.test(m.id)) bad('manifest.id is required and must not contain whitespace');
  if (!m.name) bad(`plugin ${m.id}: name is required`);
  if (!tryParse(m.version)) bad(`plugin ${m.id}: version '${m.version}' is not semver`);
  if (!tryParse(m.apiVersion)) bad(`plugin ${m.id}: apiVersion '${m.apiVersion}' is not semver`);
  if (!TYPES.has(m.type)) bad(`plugin ${m.id}: unknown type '${m.type}'`);
  if (!(m.trustLevel in TRUST_RANK)) bad(`plugin ${m.id}: unknown trustLevel '${m.trustLevel}'`);
  if (!m.codeHash) bad(`plugin ${m.id}: codeHash is required (bundle integrity)`);
  if (!Array.isArray(m.permissions)) bad(`plugin ${m.id}: permissions must be an array`);
  const seen = new Set<string>();
  for (const p of m.permissions) {
    if (!PERMS.has(p)) bad(`plugin ${m.id}: unknown permission '${p}'`);
    if (seen.has(p)) bad(`plugin ${m.id}: duplicate permission '${p}'`);
    seen.add(p);
  }
  if (!Array.isArray(m.events)) bad(`plugin ${m.id}: events must be an array`);
  for (const e of m.events) if (!EVENTS.has(e)) bad(`plugin ${m.id}: unknown event '${e}'`);
  for (const [dep, range] of Object.entries(m.dependencies ?? {})) {
    if (typeof range !== 'string' || range.trim() === '')
      bad(`plugin ${m.id}: empty version range for dependency '${dep}'`);
  }
}

/**
 * The canonical, order-independent string the signature is computed over. EVERY
 * security-relevant field is included, and lists are sorted, so a signature can't be
 * evaded by reordering keys/permissions OR by swapping an unsigned field after
 * signing. Critically this includes `entry` (the executable module the isolate
 * loads) and `resources` — omitting `entry` would let an attacker co-ship a dormant
 * evil module and flip the entrypoint pointer while the signature still verified.
 */
export function canonicalManifest(m: PluginManifest): string {
  return JSON.stringify({
    id: m.id,
    name: m.name,
    version: m.version,
    type: m.type,
    publisher: m.publisher,
    apiVersion: m.apiVersion,
    entry: m.entry,
    permissions: [...m.permissions].sort(),
    events: [...m.events].sort(),
    codeHash: m.codeHash,
    trustLevel: m.trustLevel,
    resources: m.resources ?? null,
    dependencies: Object.fromEntries(Object.entries(m.dependencies ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))),
  });
}
