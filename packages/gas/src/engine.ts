/**
 * GasEngine — the facade that turns a transaction into a full gas plan in one call:
 * decide sponsorship → if the user pays, pick the fee token → compute bounded gas
 * params. It threads the per-user daily sponsorship budget across calls (so a granted
 * sponsorship actually counts against the cap) and is deterministic given the injected
 * clock. It DECIDES; it never signs a UserOperation or moves funds.
 */
import type { GasEnv } from './env.js';
import { computeGasParams } from './estimate.js';
import { selectFeeToken } from './feetoken.js';
import { decideSponsorship, emptySponsorshipState, recordSponsorship } from './sponsorship.js';
import type {
  FeeBasis,
  FeeTokenChoice,
  FeeTokenOption,
  GasCaps,
  GasParams,
  GasSpeed,
  SponsorshipDecision,
  SponsorshipPolicy,
  SponsorshipState,
} from './types.js';

export interface GasEngineOptions {
  env: GasEnv;
  sponsorship: SponsorshipPolicy;
  caps: GasCaps;
  /** Fee-token safety margin over the gas cost, in bps (default 100 = 1%). */
  feeMarginBps?: number;
}

export interface GasQuoteRequest {
  userId: string;
  action: string;
  /** Estimated gas cost in µUSD (for the sponsorship + fee-token decision). */
  gasCostMicros: bigint;
  basis: FeeBasis;
  speed: GasSpeed;
  /** Tokens the user could pay gas with (if not sponsored). */
  feeTokens: readonly FeeTokenOption[];
}

export interface GasQuote {
  sponsorship: SponsorshipDecision;
  params: GasParams;
  /** The token the user pays gas in, or null when sponsored / no token can cover it. */
  feeToken: FeeTokenChoice | null;
}

export class GasEngine {
  private state: SponsorshipState = emptySponsorshipState();

  constructor(private readonly options: GasEngineOptions) {}

  quote(req: GasQuoteRequest): GasQuote {
    const now = this.options.env.now();
    const sponsorReq = { userId: req.userId, action: req.action, gasCostMicros: req.gasCostMicros };

    const sponsorship = decideSponsorship(sponsorReq, this.options.sponsorship, this.state, now);
    if (sponsorship.verdict === 'sponsor') this.state = recordSponsorship(this.state, sponsorReq, now);

    const params = computeGasParams(req.basis, req.speed, this.options.caps);
    const feeToken =
      sponsorship.verdict === 'sponsor'
        ? null
        : selectFeeToken(req.gasCostMicros, req.feeTokens, this.options.feeMarginBps ?? 100);

    return { sponsorship, params, feeToken };
  }

  /** Read-only view of the sponsorship budget state (for observability / tests). */
  snapshotState(): SponsorshipState {
    return { day: this.state.day, spentByUser: { ...this.state.spentByUser } };
  }
}

export function createGasEngine(options: GasEngineOptions): GasEngine {
  return new GasEngine(options);
}
