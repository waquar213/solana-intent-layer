/**
 * @intent-wallet/plugins — the Plugin Marketplace & Extension SDK security core. The
 * deterministic foundation that lets third parties extend the platform WITHOUT
 * modifying core, under the platform's doctrine: a plugin PROPOSES, deterministic
 * code VERIFIES, the device signature DISPOSES.
 *
 *   • types      — the SDK contract (PluginModule/PluginContext), permissions, trust
 *                  levels, and the FORBIDDEN methods (keys/signing/db) a plugin can
 *                  never reach — they aren't in the capability vocabulary.
 *   • manifest   — validation + the canonical form the signature covers.
 *   • semver     — parse/compare/satisfies + dependency resolution (compatibility).
 *   • permissions— capability gate (deny-by-default; forbidden methods never pass).
 *   • trust      — escalating permission ceilings + warnings + resource caps.
 *   • signing    — integrity + trust-claim + authorized-signer + signature + revocation.
 *   • sandbox    — resource-limit policy + the scoped capability surface + usage checks.
 *   • lifecycle  — the state machine + health-driven auto-suspend (decide-not-act).
 *   • events     — subscription authorization (events can't bypass permissions).
 *   • marketplace— trust badge + install warnings + rating aggregation.
 *   • registry   — the facade sequencing register → install → run → suspend → revoke.
 *
 * Deterministic (time/hash/verify injected), offline-testable, standalone. The
 * isolate runtime, scanners, store, and CLI are infra the policy core enforces.
 */

// Types + SDK contract
export type {
  PluginType,
  TrustLevel,
  Permission,
  EventName,
  ResourceLimits,
  PluginManifest,
  PluginSignature,
  AuthorizedSigner,
  RevocationEntry,
  LifecycleState,
  LifecycleAction,
  InstalledPlugin,
  PluginHealth,
  PluginStorage,
  PluginContext,
  PluginModule,
} from './types.js';
export { TRUST_RANK, ALL_PERMISSIONS, SENSITIVE_PERMISSIONS, FORBIDDEN_METHODS } from './types.js';

// Determinism boundary
export { createTestEnv, stableHash, fakeSignatureVerifier, type PluginEnv, type TestEnvOptions } from './env.js';

// Manifest
export { validateManifest, canonicalManifest } from './manifest.js';

// Semver
export {
  parse,
  tryParse,
  compare,
  satisfies,
  maxSatisfying,
  resolveDependencies,
  type SemVer,
  type ResolveResult,
} from './semver.js';

// Permissions (capability gate)
export {
  authorizeHostCall,
  permissionForMethod,
  methodsFor,
  METHOD_PERMISSION,
  type CallDecision,
} from './permissions.js';

// Trust levels
export { evaluateTrust, resolveLimits, TRUST_POLICY, type TrustPolicy, type TrustEvaluation } from './trust.js';

// Signing / supply chain
export { verifyPlugin, isRevoked, type VerifyResult, type VerifyInput } from './signing.js';

// Sandbox
export { sandboxPolicyFor, checkUsage, type SandboxPolicy, type ResourceUsage, type UsageCheck } from './sandbox.js';

// Lifecycle
export {
  transition,
  canTransition,
  decideHealthAction,
  emptyHealth,
  DEFAULT_HEALTH_THRESHOLDS,
  type HealthThresholds,
  type HealthDecision,
} from './lifecycle.js';

// Events
export {
  authorizeSubscription,
  authorizedSubscriptions,
  EVENT_PERMISSION,
  type SubscriptionDecision,
} from './events.js';

// Marketplace
export {
  listingSignals,
  aggregateRating,
  type ListingSignals,
  type Review,
  type RatingSummary,
} from './marketplace.js';

// Registry facade
export {
  PluginRegistry,
  createPluginRegistry,
  isCompatible,
  type RegistryDeps,
  type RegisterInput,
  type RegisterResult,
  type InstallResult,
} from './registry.js';

export { PluginError, type PluginErrorCode } from './errors.js';
