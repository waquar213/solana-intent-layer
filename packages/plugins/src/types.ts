/**
 * Plugin platform vocabulary + the stable SDK contract. The security model is
 * capability-based: a plugin can only ever do what a permission it was GRANTED
 * unlocks, and the most dangerous capabilities (keys, signing, internal DB, security
 * internals) are simply NOT in the permission vocabulary — a plugin cannot request
 * what the host will never expose. Trust levels cap which permissions a plugin may
 * hold at all. Everything here is deterministic data; the isolate runtime is infra.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Plugin taxonomy
// ─────────────────────────────────────────────────────────────────────────────

export type PluginType =
  | 'blockchain'
  | 'provider'
  | 'dex'
  | 'bridge'
  | 'portfolio'
  | 'analytics'
  | 'automation'
  | 'ai'
  | 'tax'
  | 'notification'
  | 'enterprise'
  | 'identity'
  | 'risk'
  | 'compliance'
  | 'payment';

// ─────────────────────────────────────────────────────────────────────────────
// Trust levels (the user's addition): official > verified > community > experimental
// ─────────────────────────────────────────────────────────────────────────────

export type TrustLevel = 'official' | 'verified' | 'community' | 'experimental';

/** Lower = more trusted. Used to compare and to cap capabilities. */
export const TRUST_RANK: Record<TrustLevel, number> = {
  official: 1,
  verified: 2,
  community: 3,
  experimental: 4,
};

// ─────────────────────────────────────────────────────────────────────────────
// Permissions — GRANTABLE capabilities only. Keys/signing/DB are NOT here by design.
// ─────────────────────────────────────────────────────────────────────────────

export type Permission =
  | 'portfolio.read'
  | 'portfolio.write' // annotate/tag holdings — NOT move funds
  | 'intent.read'
  | 'intent.create' // PROPOSE an intent for user approval — never auto-execute
  | 'notifications.send'
  | 'analytics.read'
  | 'blockchain.read'
  | 'provider.access'
  | 'automation.access'
  | 'background.execute';

export const ALL_PERMISSIONS: readonly Permission[] = [
  'portfolio.read',
  'portfolio.write',
  'intent.read',
  'intent.create',
  'notifications.send',
  'analytics.read',
  'blockchain.read',
  'provider.access',
  'automation.access',
  'background.execute',
];

/** Permissions considered SENSITIVE — always require a loud warning + explicit approval. */
export const SENSITIVE_PERMISSIONS: readonly Permission[] = [
  'portfolio.write',
  'intent.create',
  'automation.access',
  'background.execute',
];

/**
 * Host methods a plugin may NEVER reach, regardless of permissions. These map to NO
 * permission, so the capability gate denies them unconditionally, and the sandbox
 * host does not put them on the API surface in the first place. This is the
 * structural guarantee behind "a plugin can't compromise security".
 */
export const FORBIDDEN_METHODS: readonly string[] = [
  'signTransaction',
  'sign',
  'exportPrivateKey',
  'exportSeedPhrase',
  'getSigner',
  'getSigningEngine',
  'getKeystore',
  'queryDatabase',
  'rawDbAccess',
  'getSecurityInternals',
  'getRiskEngineInternals',
  'setPermission',
  'elevateTrust',
];

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

export type EventName =
  | 'portfolio.updated'
  | 'intent.created'
  | 'execution.completed'
  | 'execution.failed'
  | 'security.alert'
  | 'automation.triggered'
  | 'price.updated'
  | 'plugin.installed'
  | 'plugin.updated';

// ─────────────────────────────────────────────────────────────────────────────
// Resource limits
// ─────────────────────────────────────────────────────────────────────────────

export interface ResourceLimits {
  memoryMb: number;
  cpuMs: number;
  storageMb: number;
  timeoutMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest + signature
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginManifest {
  /** Reverse-DNS id, e.g. 'com.acme.tax-helper'. */
  id: string;
  name: string;
  /** Semantic version. */
  version: string;
  type: PluginType;
  publisher: string;
  /** Host API version this plugin targets (semver) — checked for compatibility. */
  apiVersion: string;
  /** Requested permissions (user must approve; trust level caps them). */
  permissions: readonly Permission[];
  /** Events the plugin wants to subscribe to. */
  events: readonly EventName[];
  entry: string;
  /** Hash of the plugin bundle — verified against the delivered code (integrity). */
  codeHash: string;
  /** Requested resource limits (clamped to the trust-level ceiling). */
  resources?: Partial<ResourceLimits>;
  /** pluginId → semver range. */
  dependencies?: Record<string, string>;
  /** The trust level the plugin CLAIMS; the signature must authorize it. */
  trustLevel: TrustLevel;
}

export interface PluginSignature {
  signer: string;
  publicKey: string;
  signature: string;
  /** The trust level the signer attests to — must match the manifest's claim. */
  signedTrustLevel: TrustLevel;
}

/** A signer authorized to attest plugins up to a maximum trust level. */
export interface AuthorizedSigner {
  signer: string;
  publicKey: string;
  /** The most-trusted level this signer may attest (e.g. an official key → 'official'). */
  maxTrust: TrustLevel;
  revoked?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Revocation
// ─────────────────────────────────────────────────────────────────────────────

export interface RevocationEntry {
  pluginId: string;
  /** A specific version, or a semver range, or '*' for all versions. */
  versionRange: string;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export type LifecycleState = 'registered' | 'installed' | 'enabled' | 'disabled' | 'suspended' | 'removed';
export type LifecycleAction =
  'install' | 'enable' | 'disable' | 'suspend' | 'resume' | 'update' | 'rollback' | 'remove';

export interface InstalledPlugin {
  manifest: PluginManifest;
  state: LifecycleState;
  grantedPermissions: readonly Permission[];
  limits: ResourceLimits;
  installedAtIso: string;
}

export interface PluginHealth {
  crashes: number;
  permissionViolations: number;
  /** Sustained memory over the limit (samples). */
  memoryOverLimitSamples: number;
  /** p95 host-call latency ms. */
  p95LatencyMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// The SDK contract a plugin implements + the capability-scoped host surface
// ─────────────────────────────────────────────────────────────────────────────

/** Per-plugin, permission-scoped storage (quota-limited by the sandbox). */
export interface PluginStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * The context the host injects into a plugin. It carries ONLY what the plugin was
 * granted — there is no `signer`, no `keystore`, no `db` field to reach for.
 */
export interface PluginContext {
  pluginId: string;
  permissions: readonly Permission[];
  storage: PluginStorage;
  log(message: string): void;
  /** Propose an intent for the USER to approve + device-sign. Never executes. */
  proposeIntent?(utterance: string): Promise<{ proposalId: string }>;
}

/** The stable interface a plugin module implements. */
export interface PluginModule {
  activate(ctx: PluginContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;
  onEvent?(event: EventName, payload: unknown): Promise<void> | void;
}
