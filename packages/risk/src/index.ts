/**
 * @intent-wallet/risk — the Universal Security & Risk Engine (the immune
 * system). Threat intelligence + heuristic detectors + composite risk scoring +
 * a configurable policy engine → an authorize/confirm/block decision on every
 * action. It evaluates and authorizes; it never signs and never holds funds.
 * Standalone (no wallet/chain deps) — the real backing for the `RiskProvider`
 * the Intent/Execution/Route layers depend on, and a security-as-a-service API.
 */
export type {
  RiskLevel,
  RiskCategory,
  RiskSignal,
  RiskReport,
  SecuritySubject,
  TokenSubject,
  AddressSubject,
  ApprovalSubject,
  ProviderSubject,
  SecurityVerdict,
  SecurityDecision,
} from './types.js';
export { combineSignals, HARD_BLOCK_SEVERITY } from './scoring.js';
export { InMemoryThreatIntel, emptyThreatIntel, type ThreatIntel, type ThreatIntelSeed } from './intel.js';
export {
  detectUnlimitedApproval,
  detectFreshToken,
  detectLowLiquidity,
  detectHoneypot,
  detectOwnershipConcentration,
  detectAdminPrivileges,
  detectUnaudited,
  detectAddressPoisoning,
  detectBurnAddress,
} from './detectors.js';
export {
  evaluatePolicy,
  RISK_POLICY_PRESETS,
  type PolicyConfig,
  type PolicyPreset,
  type PolicyResult,
} from './policy.js';
export { RiskEngine, type RiskEngineOptions } from './engine.js';
export { RiskError, type RiskErrorCode } from './errors.js';
