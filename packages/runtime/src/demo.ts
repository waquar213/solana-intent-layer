/**
 * The DEMO executor — a fully-wired, offline execution seam for local runs and the
 * dev web UI. It composes the fake device signer + fake chain gateway with a REAL
 * gas planner (bounded sponsorship + EIP-1559 caps + fee-token) over a deterministic
 * fee-market source. It is the honest way to demonstrate the whole
 * plan → authorize → execute loop without a network, a real key, or a real paymaster.
 *
 * It is NOT for production: `createDemoExecutor` signs nothing and broadcasts to no
 * chain. A production deployment wires a real device signer (core) + adapter-backed
 * gateway (chains) + a live fee-market source instead. Because the executor is passed
 * in explicitly, a server that omits it simply has no execute route (honest surface).
 */
import { createGasEngine, type GasCaps, type SponsorshipPolicy } from '@intent-wallet/gas';
import {
  fakeChainGateway,
  fakeStepSigner,
  type ChainGateway,
  type StepSigner,
  type StepSimulator,
} from './execution.js';
import { RuntimeGasPlanner, staticFeeMarketSource } from './gas.js';

export interface DemoExecutor {
  signer: StepSigner;
  gateway: ChainGateway;
  gasPlanner: RuntimeGasPlanner;
  simulator: StepSimulator;
}

/**
 * The execution SANDBOX — a real pre-broadcast simulation. It re-checks the step's
 * structural invariants before anything is signed; on a rejection the ExecutionEngine
 * PARKS (never strands funds), so a completed execution proves this passed. A
 * production simulator calls the chain's `eth_call`/simulate RPC; this deterministic
 * one runs offline.
 */
export const demoSimulator: StepSimulator = {
  simulate: (step, plan) => {
    if (!step.chainId) return Promise.resolve({ ok: false, reason: 'step has no target chain' });
    // A swap or bridge must carry a minimum-received guarantee before we sign it.
    if ((step.kind === 'swap' || step.kind === 'bridge') && !plan.quote.youReceiveMin) {
      return Promise.resolve({ ok: false, reason: `${step.kind} has no minimum-received guarantee` });
    }
    return Promise.resolve({ ok: true });
  },
};

export interface DemoExecutorOptions {
  /** The user whose daily sponsorship budget the demo draws down (default 'demo-user'). */
  userId?: string;
  /** Override the demo sponsorship policy. */
  sponsorship?: SponsorshipPolicy;
  /** Override the demo EIP-1559 caps. */
  caps?: GasCaps;
  /** Injected clock (default: system clock). Kept injectable so tests are deterministic. */
  now?: () => string;
}

const DEMO_SPONSORSHIP: SponsorshipPolicy = {
  enabled: true,
  perTxCapMicros: 1_000_000n, // sponsor up to $1 of gas per tx
  dailyCapMicros: 10_000_000n, // and up to $10 per user per day
};

const DEMO_CAPS: GasCaps = {
  maxFeePerGasCap: 200_000_000_000n, // 200 gwei hard ceiling
  maxPriorityFeePerGasCap: 5_000_000_000n, // 5 gwei
};

/** Build the demo execution seam: fake signer + fake gateway + a real, bounded gas planner. */
export function createDemoExecutor(options: DemoExecutorOptions = {}): DemoExecutor {
  const engine = createGasEngine({
    env: { now: options.now ?? (() => new Date().toISOString()) },
    sponsorship: options.sponsorship ?? DEMO_SPONSORSHIP,
    caps: options.caps ?? DEMO_CAPS,
  });
  const gasPlanner = new RuntimeGasPlanner({
    engine,
    source: staticFeeMarketSource(),
    userId: options.userId ?? 'demo-user',
  });
  return { signer: fakeStepSigner, gateway: fakeChainGateway, gasPlanner, simulator: demoSimulator };
}
