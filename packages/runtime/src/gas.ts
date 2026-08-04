/**
 * The gas seam — where the Gas Abstraction engine (packages/gas) plugs into the
 * execution path so a user "shouldn't have to think about gas". Before the device
 * signs an EVM step, the driver asks the `RuntimeGasPlanner` for a gas plan:
 *
 *   sponsorship decision (bounded paymaster budget) → bounded EIP-1559 params →
 *   fee-token selection (pay gas in USDC/any when not sponsored).
 *
 * The engine only DECIDES; the resulting `StepGasPlan` is an INPUT to the device
 * signer (it fills maxFeePerGas / paymaster fields). Non-custodial is preserved:
 * gas planning never touches a key and never signs. Live fee-market data arrives
 * through the injected `FeeMarketSource`; a deterministic source lets the whole
 * path run offline. Gas abstraction is EVM-only (ERC-4337 / EIP-1559) — for a
 * non-EVM chain the planner returns `null` and the signer uses native fees.
 */
import type { ExecutionPlan, PlanStep } from '@intent-wallet/intents';
import {
  type FeeBasis,
  type FeeTokenChoice,
  type FeeTokenOption,
  type GasEngine,
  type GasParams,
  type GasSpeed,
} from '@intent-wallet/gas';

/** CAIP-2 EVM chain ids look like `eip155:1`; only these have an EIP-1559 gas market. */
export function isEvmChain(chainId: string): boolean {
  return chainId.startsWith('eip155:');
}

/**
 * The live fee-market seam. A real implementation reads the chain's base/priority
 * fee, an estimate of THIS step's gas cost (µUSD, for the sponsorship + fee-token
 * decision), and the tokens the user could pay gas in. Everything is per-chain so
 * one source can serve every EVM network the wallet touches.
 */
export interface FeeMarketSource {
  /** Current EIP-1559 fee basis for a chain. */
  feeBasis(chainId: string): Promise<FeeBasis>;
  /** Estimated gas COST of this step, in µUSD (sizes sponsorship + the fee token). */
  gasCostMicros(step: PlanStep, plan: ExecutionPlan): Promise<bigint>;
  /** Tokens the user could pay gas in on this chain (empty = native only). */
  feeTokens(chainId: string): Promise<readonly FeeTokenOption[]>;
}

/** The gas decision handed to the signer for one step. */
export interface StepGasPlan {
  chainId: string;
  /** True when the platform paymaster covers this step's gas. */
  sponsored: boolean;
  /** µUSD the platform sponsors (0 unless sponsored). */
  sponsoredMicros: bigint;
  /** Bounded EIP-1559 params — never overpay past the caps during a spike. */
  params: GasParams;
  /** The token the user pays gas in, or null when sponsored / nothing can cover it. */
  feeToken: FeeTokenChoice | null;
  /** Why the sponsorship verdict came out the way it did (for the confirm sheet / audit). */
  reason: string;
}

export interface RuntimeGasPlannerDeps {
  engine: GasEngine;
  source: FeeMarketSource;
  /** The user whose per-day sponsorship budget this planner draws down. */
  userId: string;
  /** Fee speed the wallet targets (default 'normal'). */
  speed?: GasSpeed;
}

/**
 * Turns one plan step into a `StepGasPlan` by driving the GasEngine over live
 * fee-market data. Deterministic given the engine's injected clock + the source.
 * The engine threads the user's daily sponsorship budget across calls, so a
 * granted sponsorship on step N counts against step N+1 — a batch can't each be
 * sponsored past the daily cap.
 */
export class RuntimeGasPlanner {
  constructor(private readonly deps: RuntimeGasPlannerDeps) {}

  /**
   * A planner bound to a SPECIFIC user that SHARES this planner's long-lived GasEngine + source.
   *
   * The GasEngine keys the daily sponsorship budget by userId (its `spentByUser` ledger), so a
   * single planner reused across requests draws EVERY user's sponsorship from its one fixed
   * `deps.userId` bucket — collapsing the per-user daily cap into a single global one (one busy user
   * exhausts everyone's budget; unrelated users share a spend line). ExecutionPlan carries no userId,
   * so `planStep` can't recover the real principal on its own. Call this at the execution boundary
   * with the authenticated principal to get a planner that draws down THAT user's budget, while the
   * engine state that actually enforces the cap stays shared and long-lived across all users.
   */
  forUser(userId: string): RuntimeGasPlanner {
    return userId === this.deps.userId ? this : new RuntimeGasPlanner({ ...this.deps, userId });
  }

  /** Plan gas for one step, or `null` for a non-EVM chain (native fees, no abstraction). */
  async planStep(step: PlanStep, plan: ExecutionPlan): Promise<StepGasPlan | null> {
    if (!isEvmChain(step.chainId)) return null;

    const [basis, gasCostMicros, feeTokens] = await Promise.all([
      this.deps.source.feeBasis(step.chainId),
      this.deps.source.gasCostMicros(step, plan),
      this.deps.source.feeTokens(step.chainId),
    ]);

    const quote = this.deps.engine.quote({
      userId: this.deps.userId,
      action: plan.intentKind,
      gasCostMicros,
      basis,
      speed: this.deps.speed ?? 'normal',
      feeTokens,
    });

    return {
      chainId: step.chainId,
      sponsored: quote.sponsorship.verdict === 'sponsor',
      sponsoredMicros: quote.sponsorship.sponsoredMicros,
      params: quote.params,
      feeToken: quote.feeToken,
      reason: quote.sponsorship.reason,
    };
  }
}

// ── Offline / deterministic source (NOT for production) ──────────────────────

export interface StaticFeeMarketConfig {
  /** Fee basis per chain id (default: a modest EVM basis). */
  basisByChain?: Record<string, FeeBasis>;
  /** Estimated gas cost per chain id in µUSD (default 500_000n ≈ $0.50). */
  gasCostMicrosByChain?: Record<string, bigint>;
  /** Fee tokens per chain id (default: none → native). */
  feeTokensByChain?: Record<string, readonly FeeTokenOption[]>;
}

const DEFAULT_BASIS: FeeBasis = { baseFeePerGas: 20_000_000_000n, priorityFeePerGas: 1_500_000_000n };

/**
 * A deterministic fee-market source for local runs and tests — the gas analogue of
 * the fake signer/gateway. Swap in a live source (RPC eth_feeHistory + a price
 * oracle) in production.
 */
export function staticFeeMarketSource(config: StaticFeeMarketConfig = {}): FeeMarketSource {
  return {
    feeBasis: (chainId) => Promise.resolve(config.basisByChain?.[chainId] ?? DEFAULT_BASIS),
    gasCostMicros: (step) =>
      Promise.resolve(config.gasCostMicrosByChain?.[step.chainId] ?? 500_000n),
    feeTokens: (chainId) => Promise.resolve(config.feeTokensByChain?.[chainId] ?? []),
  };
}
