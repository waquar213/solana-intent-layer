/**
 * @intent-wallet/gas — the Gas Abstraction & Smart-Account engine. The deterministic
 * decision core behind "users shouldn't have to think about gas":
 *
 *   • sponsorship — decide whether the platform pays a user's gas, BOUNDED by a
 *                   per-tx + per-user-per-day budget (a bug can't drain the paymaster);
 *                   fails toward user_pays.
 *   • feetoken    — pick the token a user pays gas in (USDC/any), min-preference,
 *                   rounded up so the paymaster is never short.
 *   • estimate    — EIP-1559 params bounded by hard caps (never overpay on a spike).
 *   • batch       — fold N ops into fewer UserOperations (bounded size).
 *
 * It DECIDES; the ERC-4337 UserOperation construction + paymaster signing is
 * execution/infra. Deterministic (clock injected), offline-testable, standalone.
 */
export type {
  SponsorshipPolicy,
  SponsorshipVerdict,
  SponsorshipRequest,
  SponsorshipDecision,
  SponsorshipState,
  FeeTokenOption,
  FeeTokenChoice,
  FeeBasis,
  GasSpeed,
  GasCaps,
  GasParams,
  BatchPolicy,
} from './types.js';

export { createTestEnv, dayKey, type GasEnv } from './env.js';
export { decideSponsorship, recordSponsorship, emptySponsorshipState } from './sponsorship.js';
export { selectFeeToken } from './feetoken.js';
export { computeGasParams } from './estimate.js';
export { decideBatch, batchCount } from './batch.js';
export { GasEngine, createGasEngine, type GasEngineOptions, type GasQuoteRequest, type GasQuote } from './engine.js';
export { GasError, type GasErrorCode } from './errors.js';
