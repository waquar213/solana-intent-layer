/**
 * @intent-wallet/capabilities — the Capability Registry. It ANSWERS "what can this
 * chain / provider-route actually do?" from VERSIONED DATA keyed on CAIP-2 ids, so the
 * Intent Engine + Route Optimizer decide on dynamic capabilities instead of hardcoded
 * assumptions. Fail-closed: an unknown chain or capability is NOT supported. It never
 * quotes, scores, or executes — live provider health stays in @intent-wallet/providers.
 * Deterministic, offline-testable, standalone (zero internal deps).
 */

// The vocabulary + data shapes.
export type {
  Capability,
  FeeModel,
  TokenStandard,
  Ecosystem,
  ProfileStatus,
  ChainAvailability,
  PlanStepKind,
  RouteAction,
  FinalitySpec,
  NativeAsset,
  ChainCapabilityProfile,
  ProviderRouteDeclaration,
  StepFeasibility,
  StepCapabilityInput,
  PlanFeasibility,
} from './types.js';
export {
  CAPABILITIES,
  FEE_MODELS,
  TOKEN_STANDARDS,
  ECOSYSTEMS,
  PROFILE_STATUSES,
  CHAIN_AVAILABILITIES,
  PLAN_STEP_KINDS,
  ROUTE_ACTIONS,
} from './types.js';

// The determinism boundary.
export { createTestEnv, type CapabilityEnv } from './env.js';

// Versioned chain capability profiles.
export {
  ChainCapabilityRegistry,
  createChainCapabilityRegistry,
  validateChainProfile,
} from './profiles.js';

// Static provider/bridge route-class facts.
export { ProviderRouteRegistry, createProviderRouteRegistry } from './routes.js';

// The consulted facade + its factory.
export { CapabilityService, createCapabilityService, type CapabilityServiceDeps } from './service.js';

// Built-in data + a ready-to-use default service.
export { BUILTIN_CHAIN_PROFILES, BUILTIN_ROUTES, createDefaultCapabilityService } from './seed.js';

// Typed errors.
export { CapabilityError, type CapabilityErrorCode } from './errors.js';
