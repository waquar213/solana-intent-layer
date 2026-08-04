/**
 * The PluginRegistry — the orchestration facade. It sequences the whole trust
 * pipeline so no stage can be skipped:
 *
 *   register: validate manifest → host-API compatibility → signature/supply-chain
 *             gauntlet → trust evaluation → store (state 'registered').
 *   install : grant only permissions that are (a) within the trust ceiling AND
 *             (b) user-approved (official is auto-approvable) → state 'installed'.
 *   enable  : re-checks revocation (a plugin revoked after install can't run).
 *   authorizeCall / authorizeEvent: only for an ENABLED plugin, via the capability
 *             gate; a denied call is a permission VIOLATION fed to health.
 *   health  : decide-not-act — suspend a crash-looping / violating plugin.
 *   revoke  : automatic revocation — instantly suspends a running matched plugin.
 *
 * The registry can gate, grant, suspend and revoke; it can never hand a plugin a
 * key, a signer, or DB access — those aren't in the capability vocabulary at all.
 */
import type { PluginEnv } from './env.js';
import { PluginError } from './errors.js';
import { authorizeSubscription, type SubscriptionDecision } from './events.js';
import { decideHealthAction, emptyHealth, transition, type HealthThresholds } from './lifecycle.js';
import { validateManifest } from './manifest.js';
import { authorizeHostCall, type CallDecision } from './permissions.js';
import { sandboxPolicyFor } from './sandbox.js';
import { satisfies } from './semver.js';
import { isRevoked, verifyPlugin } from './signing.js';
import { evaluateTrust, type TrustEvaluation } from './trust.js';
import type {
  AuthorizedSigner,
  EventName,
  InstalledPlugin,
  Permission,
  PluginHealth,
  PluginManifest,
  PluginSignature,
  RevocationEntry,
} from './types.js';

interface Record {
  plugin: InstalledPlugin;
  trust: TrustEvaluation;
  health: PluginHealth;
}

export interface RegistryDeps {
  env: PluginEnv;
  /** The host API version this platform provides (semver). */
  hostApiVersion: string;
  signers: readonly AuthorizedSigner[];
  revocations?: RevocationEntry[];
  healthThresholds?: HealthThresholds;
}

export interface RegisterInput {
  manifest: PluginManifest;
  signature: PluginSignature;
  deliveredCodeHash: string;
}

export interface RegisterResult {
  ok: boolean;
  reasons: string[];
  trust?: TrustEvaluation;
}

export interface InstallResult {
  ok: boolean;
  granted: Permission[];
  rejected: Permission[];
  reasons: string[];
}

/** A plugin is compatible if the host API is caret-compatible with what it targets. */
export function isCompatible(hostApiVersion: string, targetApiVersion: string): boolean {
  try {
    return satisfies(hostApiVersion, `^${targetApiVersion}`);
  } catch {
    return false;
  }
}

export class PluginRegistry {
  private readonly records = new Map<string, Record>();
  private readonly revocations: RevocationEntry[];

  constructor(private readonly deps: RegistryDeps) {
    this.revocations = [...(deps.revocations ?? [])];
  }

  register(input: RegisterInput): RegisterResult {
    validateManifest(input.manifest); // throws INVALID_MANIFEST
    // Deep-copy so a caller cannot mutate the stored manifest (permissions / trust /
    // codeHash) after registration. The clone is byte-identical, so the signature —
    // computed over the canonical manifest — still verifies.
    const manifest = structuredClone(input.manifest);

    if (!isCompatible(this.deps.hostApiVersion, manifest.apiVersion)) {
      return {
        ok: false,
        reasons: [`incompatible: plugin targets host API ${manifest.apiVersion}, host is ${this.deps.hostApiVersion}`],
      };
    }

    const verified = verifyPlugin(
      {
        manifest,
        signature: input.signature,
        deliveredCodeHash: input.deliveredCodeHash,
        signers: this.deps.signers,
        revocations: this.revocations,
      },
      this.deps.env,
    );
    if (!verified.verified) return { ok: false, reasons: verified.reasons };

    const trust = evaluateTrust(manifest.trustLevel, manifest.permissions);
    const limits = sandboxPolicyFor(manifest.trustLevel, [], manifest.resources).limits;
    this.records.set(manifest.id, {
      plugin: {
        manifest,
        state: 'registered',
        grantedPermissions: [],
        limits,
        installedAtIso: this.deps.env.now(),
      },
      trust,
      health: emptyHealth(),
    });
    return { ok: true, reasons: [], trust };
  }

  /** Install: grant permissions within the trust ceiling AND approved (official auto-approves). */
  install(pluginId: string, approvedPermissions: readonly Permission[]): InstallResult {
    const rec = this.require(pluginId);
    if (rec.plugin.state !== 'registered') {
      return {
        ok: false,
        granted: [],
        rejected: [],
        reasons: [`plugin is '${rec.plugin.state}', expected 'registered'`],
      };
    }
    const approved = new Set(approvedPermissions);
    const auto = rec.trust.autoApprovable;
    const granted = rec.trust.grantable.filter((p) => auto || approved.has(p));
    const rejected = rec.plugin.manifest.permissions.filter((p) => !granted.includes(p));

    rec.plugin = {
      ...rec.plugin,
      state: 'installed',
      grantedPermissions: granted,
      limits: sandboxPolicyFor(rec.plugin.manifest.trustLevel, granted, rec.plugin.manifest.resources).limits,
    };
    return { ok: true, granted, rejected, reasons: [] };
  }

  /** Apply a lifecycle action. Any move INTO 'enabled' re-checks revocation; 'remove' drops the record. */
  transition(pluginId: string, action: Parameters<typeof transition>[1]): InstalledPlugin {
    const rec = this.require(pluginId);
    const next = transition(rec.plugin.state, action);
    // Guard enable AND resume (both land in 'enabled') — a plugin revoked after
    // install must never be brought back to running by any path.
    if (next === 'enabled' && this.isRevoked(rec.plugin.manifest)) {
      throw new PluginError('REVOKED', `cannot run revoked plugin ${pluginId}`);
    }
    rec.plugin = { ...rec.plugin, state: next };
    if (next === 'removed') this.records.delete(pluginId);
    return rec.plugin;
  }

  /** Gate a host method call — only for an enabled plugin, via the capability gate. */
  authorizeCall(pluginId: string, method: string): CallDecision {
    const rec = this.records.get(pluginId);
    if (!rec) return { allowed: false, reason: `unknown plugin '${pluginId}'` };
    if (rec.plugin.state !== 'enabled')
      return { allowed: false, reason: `plugin '${pluginId}' is '${rec.plugin.state}', not enabled` };
    const decision = authorizeHostCall(method, rec.plugin.grantedPermissions);
    if (!decision.allowed) rec.health = { ...rec.health, permissionViolations: rec.health.permissionViolations + 1 };
    return decision;
  }

  authorizeEvent(pluginId: string, event: EventName): SubscriptionDecision {
    const rec = this.records.get(pluginId);
    if (!rec) return { allowed: false, reason: `unknown plugin '${pluginId}'` };
    if (rec.plugin.state !== 'enabled') return { allowed: false, reason: `plugin '${pluginId}' is not enabled` };
    const decision = authorizeSubscription(event, rec.plugin.grantedPermissions);
    // A denied subscription is a permission violation too — symmetric with authorizeCall,
    // so probing the event side channel also trips the auto-suspend threshold.
    if (!decision.allowed) rec.health = { ...rec.health, permissionViolations: rec.health.permissionViolations + 1 };
    return decision;
  }

  recordCrash(pluginId: string): void {
    const rec = this.require(pluginId);
    rec.health = { ...rec.health, crashes: rec.health.crashes + 1 };
  }

  recordMemoryOverLimit(pluginId: string): void {
    const rec = this.require(pluginId);
    rec.health = { ...rec.health, memoryOverLimitSamples: rec.health.memoryOverLimitSamples + 1 };
  }

  /** Evaluate health and auto-suspend if warranted (decide-not-act at the orchestration level). */
  healthTick(pluginId: string): { suspended: boolean; reason: string } {
    const rec = this.require(pluginId);
    const decision = decideHealthAction(rec.health, this.deps.healthThresholds);
    if (decision.action === 'suspend' && (rec.plugin.state === 'enabled' || rec.plugin.state === 'disabled')) {
      rec.plugin = { ...rec.plugin, state: 'suspended' };
      return { suspended: true, reason: decision.reason };
    }
    return { suspended: false, reason: decision.reason };
  }

  /** Automatic revocation — records the entry and instantly suspends any running match. */
  revoke(entry: RevocationEntry): string[] {
    this.revocations.push(entry);
    const suspended: string[] = [];
    for (const [id, rec] of this.records) {
      if (
        this.isRevoked(rec.plugin.manifest) &&
        (rec.plugin.state === 'enabled' || rec.plugin.state === 'disabled' || rec.plugin.state === 'installed')
      ) {
        rec.plugin = { ...rec.plugin, state: 'suspended' };
        suspended.push(id);
      }
    }
    return suspended;
  }

  get(pluginId: string): InstalledPlugin | undefined {
    return this.records.get(pluginId)?.plugin;
  }

  health(pluginId: string): PluginHealth | undefined {
    return this.records.get(pluginId)?.health;
  }

  list(): InstalledPlugin[] {
    return [...this.records.values()].map((r) => r.plugin);
  }

  private isRevoked(m: PluginManifest): boolean {
    return isRevoked(m.id, m.version, this.revocations);
  }

  private require(pluginId: string): Record {
    const rec = this.records.get(pluginId);
    if (!rec) throw new PluginError('INVALID_MANIFEST', `unknown plugin '${pluginId}'`);
    return rec;
  }
}

export function createPluginRegistry(deps: RegistryDeps): PluginRegistry {
  return new PluginRegistry(deps);
}
