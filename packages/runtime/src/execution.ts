/**
 * The execution seam — where a proposed plan becomes on-chain reality. The
 * Execution Engine (packages/execution) owns ordering, retries, parking and
 * resumability; it drives each step through a `StepDriver` that does the actual
 * chain interaction: simulate → device-SIGN → broadcast → confirm → verify.
 *
 * `RuntimeStepDriver` composes three injected seams so it is testable without a
 * network and keeps the NON-CUSTODIAL invariant: the DEVICE signs (via `StepSigner`)
 * and neither the engine nor this driver ever sees a key. The real seams wire the
 * core signing manager + the chains AdapterRegistry; the fakes below let the whole
 * path run offline. There are deliberately NO fake defaults on the public execute
 * path — a caller must inject a signer + gateway, so nothing "executes" by accident.
 */
import type { ExecutionPlan, PlanStep } from '@intent-wallet/intents';
import {
  ExecutionEngine,
  InMemoryExecutionStore,
  type ConfirmationResult,
  type EventSink,
  type Execution,
  type SimulationResult,
  type StepDriver,
  type VerifyResult,
} from '@intent-wallet/execution';
import type { RuntimeGasPlanner, StepGasPlan } from './gas.js';

/**
 * The DEVICE-signing seam. Returns a signed, broadcast-ready payload; never exposes
 * a key. When a gas plan is supplied (EVM steps with a gas planner wired), the signer
 * uses it to fill the transaction's fee fields (maxFeePerGas / paymaster); a signer
 * that receives no plan falls back to native fees.
 */
export interface StepSigner {
  sign(step: PlanStep, plan: ExecutionPlan, gas?: StepGasPlan): Promise<{ rawTx: string }>;
}

/** The chain seam — broadcast a signed tx and read its terminal status (wraps the AdapterRegistry). */
export interface ChainGateway {
  broadcast(step: PlanStep, plan: ExecutionPlan, rawTx: string): Promise<{ txid: string }>;
  status(chainId: string, txid: string): Promise<{ confirmed: boolean; reverted: boolean }>;
}

/** The pre-broadcast simulation seam (the Execution Sandbox). Default: accept. */
export interface StepSimulator {
  simulate(step: PlanStep, plan: ExecutionPlan): Promise<SimulationResult>;
}

export interface RuntimeStepDriverDeps {
  signer: StepSigner;
  gateway: ChainGateway;
  simulator?: StepSimulator;
  /** Optional gas abstraction — decides sponsorship + bounded fees per EVM step. */
  gasPlanner?: RuntimeGasPlanner;
}

export class RuntimeStepDriver implements StepDriver {
  constructor(private readonly deps: RuntimeStepDriverDeps) {}

  simulate(step: PlanStep, plan: ExecutionPlan): Promise<SimulationResult> {
    return this.deps.simulator ? this.deps.simulator.simulate(step, plan) : Promise.resolve({ ok: true });
  }

  async broadcast(step: PlanStep, plan: ExecutionPlan): Promise<{ txid: string }> {
    // Decide gas BEFORE signing so the device signs a fee-complete tx (returns null
    // for non-EVM chains → the signer uses native fees). Gas planning never signs.
    const gas = this.deps.gasPlanner ? await this.deps.gasPlanner.planStep(step, plan) : null;
    const signed = await this.deps.signer.sign(step, plan, gas ?? undefined); // DEVICE signs — engine never sees a key
    return this.deps.gateway.broadcast(step, plan, signed.rawTx);
  }

  async confirm(step: PlanStep, txid: string): Promise<ConfirmationResult> {
    const s = await this.deps.gateway.status(step.chainId, txid);
    return { confirmed: s.confirmed, reverted: s.reverted };
  }

  verify(): Promise<VerifyResult> {
    // TODO: assert received ≥ plan.quote.youReceiveMin once the gateway returns effects.
    return Promise.resolve({ ok: true });
  }

  fundsAfter(step: PlanStep): { chainId: string; note: string } {
    return { chainId: step.chainId, note: `Funds are on ${step.chainId}.` };
  }
}

export interface ExecuteDeps {
  /** Device signer — REQUIRED (no default), so nothing executes with a stub by accident. */
  signer: StepSigner;
  /** Chain gateway — REQUIRED. */
  gateway: ChainGateway;
  simulator?: StepSimulator;
  /** Optional gas abstraction — sponsorship + bounded fees + fee-token per EVM step. */
  gasPlanner?: RuntimeGasPlanner;
  onEvent?: EventSink;
  ids?: { execution(): string };
  maxAttempts?: number;
}

/** Drive an approved plan to a terminal Execution (completed / parked / failed). */
export function executePlan(plan: ExecutionPlan, deps: ExecuteDeps): Promise<Execution> {
  const driver = new RuntimeStepDriver({
    signer: deps.signer,
    gateway: deps.gateway,
    ...(deps.simulator ? { simulator: deps.simulator } : {}),
    ...(deps.gasPlanner ? { gasPlanner: deps.gasPlanner } : {}),
  });
  let n = 0;
  const engine = new ExecutionEngine(
    {
      driver,
      store: new InMemoryExecutionStore(),
      ...(deps.onEvent ? { onEvent: deps.onEvent } : {}),
      ...(deps.maxAttempts ? { maxAttempts: deps.maxAttempts } : {}),
    },
    { ids: deps.ids ?? { execution: () => `exec-${(++n).toString(36)}` } },
  );
  return engine.execute(plan);
}

// ── Fakes for offline tests / local runs (NOT for production) ─────────────────

/** A fake device signer — produces a deterministic payload, signs nothing real. */
export const fakeStepSigner: StepSigner = {
  sign: (step) => Promise.resolve({ rawTx: `signed:${step.seq}` }),
};

/** A fake chain gateway — pretends every broadcast confirms. */
export const fakeChainGateway: ChainGateway = {
  broadcast: (step) => Promise.resolve({ txid: `0xtx${step.seq}` }),
  status: () => Promise.resolve({ confirmed: true, reverted: false }),
};
