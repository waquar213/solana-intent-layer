import { describe, expect, it } from 'vitest';
import { ContactBook } from '@intent-wallet/identity';
import { InMemoryThreatIntel, RiskEngine } from '@intent-wallet/risk';
import { createGasEngine, createTestEnv as createGasEnv, type FeeTokenOption } from '@intent-wallet/gas';
import {
  createCapabilityService,
  createChainCapabilityRegistry,
  createProviderRouteRegistry,
} from '@intent-wallet/capabilities';
import {
  createWalletRuntime,
  fakeChainGateway,
  fakeStepSigner,
  isEvmChain,
  RuntimeGasPlanner,
  staticFeeMarketSource,
  type ChainGateway,
  type Holding,
  type StepGasPlan,
  type StepSigner,
} from '../src/index.js';

const eth = (whole: number): bigint => BigInt(Math.round(whole * 1e6)) * 10n ** 12n; // 6dp → 18 decimals
const HOLDINGS: Holding[] = [
  { symbol: 'ETH', decimals: 18, totalBase: eth(2), chains: [{ chainId: 'eip155:1', base: eth(2) }] },
  { symbol: 'USDC', decimals: 6, totalBase: 5_000_000_000n, chains: [{ chainId: 'eip155:1', base: 5_000_000_000n }] },
];
const PRICES = { ETH: '2000', USDC: '1' };
const GOOD = '0x1111111111111111111111111111111111111111';
const SANCTIONED = '0x000000000000000000000000000000000000dead';

describe('WalletRuntime — the composition root (NL → verified plan)', () => {
  it('plans a transfer to a raw address end-to-end (parser → planner → real risk)', async () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES });
    const { intent, outcome } = await rt.plan(`send 0.1 ETH to ${GOOD}`);
    expect(intent.kind).toBe('transfer');
    expect(outcome.kind).toBe('plan');
    if (outcome.kind === 'plan') {
      expect(outcome.plan.intentKind).toBe('transfer');
      expect(outcome.plan.confirmation).toMatch(/send/i);
      expect(outcome.plan.requiresStepUp).toBe(false); // benign → no step-up
    }
  });

  it('the REAL risk engine blocks a transfer to a sanctioned address', async () => {
    const rt = createWalletRuntime({
      holdings: HOLDINGS,
      prices: PRICES,
      riskEngine: new RiskEngine({ intel: new InMemoryThreatIntel({ sanctioned: [SANCTIONED] }) }),
    });
    const { outcome } = await rt.plan(`send 0.1 ETH to ${SANCTIONED}`);
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') expect(outcome.risk.level).toBe('block');
  });

  it('the REAL risk engine blocks a SWAP-AND-SEND whose transfer leg is sanctioned', async () => {
    // Regression: recipientOf must skip the swap leg (whose `to` is the token SYMBOL "USDC") and
    // evaluate the real transfer-leg ADDRESS. If it scanned the first `to` of any step, the swap
    // leg's symbol would be checked as the recipient and a sanctioned destination would authorize
    // clean — the server gate was toothless for swap-and-send before this fix.
    const rt = createWalletRuntime({
      holdings: HOLDINGS,
      prices: PRICES,
      riskEngine: new RiskEngine({ intel: new InMemoryThreatIntel({ sanctioned: [SANCTIONED] }) }),
    });
    const { intent, outcome } = await rt.plan(`swap 1 ETH to USDC and send to ${SANCTIONED}`);
    expect(intent.kind).toBe('swap_and_send');
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') expect(outcome.risk.level).toBe('block');
  });

  it('does NOT mis-scan a swap leg token symbol as a recipient address (no false block)', async () => {
    // The mirror: a plain swap has NO transfer recipient, so even a RiskEngine that would "block"
    // the literal symbols must not reject it — proving a swap leg's `to` ("USDC"/"ETH") is never
    // evaluated as a destination address.
    const rt = createWalletRuntime({
      holdings: HOLDINGS,
      prices: PRICES,
      riskEngine: new RiskEngine({ intel: new InMemoryThreatIntel({ sanctioned: ['USDC', 'ETH'] }) }),
    });
    const { outcome } = await rt.plan('swap 100 USDC for ETH');
    expect(outcome.kind).toBe('plan');
  });

  it('plans a swap via the deterministic route stub', async () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES });
    const { intent, outcome } = await rt.plan('swap 100 USDC for ETH');
    expect(intent.kind).toBe('swap');
    expect(outcome.kind).toBe('plan');
    if (outcome.kind === 'plan') {
      expect(outcome.plan.intentKind).toBe('swap');
      expect(outcome.plan.assets).toEqual(['USDC', 'ETH']);
    }
  });

  it('resolves a named recipient through the real ContactBook', async () => {
    const contacts = new ContactBook();
    await contacts.add({ name: 'Rahul', address: GOOD });
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES, contactBook: contacts });
    const { outcome } = await rt.plan('send 0.1 ETH to Rahul');
    expect(outcome.kind).toBe('plan');
    if (outcome.kind === 'plan') expect(outcome.plan.confirmation).toMatch(/rahul/i);
  });

  it('asks to clarify an unknown recipient rather than guessing', async () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES, contactBook: new ContactBook() });
    const { outcome } = await rt.plan('send 0.1 ETH to Nobody');
    expect(outcome.kind).toBe('clarify');
  });

  it('rejects sending more than the balance', async () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES });
    const { outcome } = await rt.plan(`send 100 ETH to ${GOOD}`);
    expect(outcome.kind).toBe('rejected');
  });
});

describe('capability gate — the planner decides on dynamic capabilities, not assumptions', () => {
  it('rejects a plan the capability registry says is infeasible (fail-closed)', async () => {
    // A capability service that knows NO chains ⇒ every network is unsupported.
    const noChains = createCapabilityService({
      chains: createChainCapabilityRegistry([]),
      routes: createProviderRouteRegistry([]),
    });
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES, capabilities: noChains });
    const { outcome } = await rt.plan(`send 0.1 ETH to ${GOOD}`); // would normally plan
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') expect(outcome.reason).toMatch(/not possible|not supported/i);
  });

  it('still plans normally with the default (built-in) capability registry', async () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES });
    expect((await rt.plan(`send 0.1 ETH to ${GOOD}`)).outcome.kind).toBe('plan'); // eip155:1 supports transfer
    expect((await rt.plan('swap 100 USDC for ETH')).outcome.kind).toBe('plan'); // and swap
  });
});

describe('portfolio — the read side', () => {
  it('folds holdings × prices into per-asset USD values + a total, highest first', () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES });
    const p = rt.portfolio();
    expect(p.totalValueMicros).toBe('9000000000'); // 2 ETH×$2000 + 5000 USDC×$1 = $9,000
    expect(p.holdings.map((h) => h.symbol)).toEqual(['USDC', 'ETH']); // $5k before $4k
    expect(p.holdings.find((h) => h.symbol === 'ETH')?.valueMicros).toBe('4000000000');
  });
});

describe('authorization gate — intent proposes, policy authorizes, device signs', () => {
  it('authorizes a benign, in-policy plan (mayProceedToSign)', async () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES });
    const { outcome } = await rt.plan(`send 0.1 ETH to ${GOOD}`);
    if (outcome.kind !== 'plan') throw new Error('expected a plan');
    const perm = await rt.authorize(outcome.plan, { principalId: 'user-1' });
    expect(perm.mayProceedToSign).toBe(true);
    expect(perm.planId).toBe(outcome.plan.planId); // bound to this exact plan
  });

  it('does NOT authorize when the amount exceeds the daily limit', async () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES });
    const { outcome } = await rt.plan(`send 0.1 ETH to ${GOOD}`); // ~$200 = 200_000_000 µUSD
    if (outcome.kind !== 'plan') throw new Error('expected a plan');
    const perm = await rt.authorize(outcome.plan, {
      principalId: 'user-1',
      limits: () => Promise.resolve({ dailyRemainingMicros: 1_000_000n }), // only $1 left
    });
    expect(perm.mayProceedToSign).toBe(false);
  });
});

describe('execution seam — plan → sign → broadcast → confirm', () => {
  it('drives an approved plan to completion (device-signed; the engine never holds a key)', async () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES });
    const { outcome } = await rt.plan(`send 0.1 ETH to ${GOOD}`);
    if (outcome.kind !== 'plan') throw new Error('expected a plan');
    const exec = await rt.execute(outcome.plan, { signer: fakeStepSigner, gateway: fakeChainGateway });
    expect(exec.status).toBe('completed');
  });

  it('PARKS (never strands funds) when a broadcast reverts on-chain', async () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES });
    const { outcome } = await rt.plan(`send 0.1 ETH to ${GOOD}`);
    if (outcome.kind !== 'plan') throw new Error('expected a plan');
    const reverting: ChainGateway = {
      broadcast: fakeChainGateway.broadcast,
      status: () => Promise.resolve({ confirmed: false, reverted: true }),
    };
    const exec = await rt.execute(outcome.plan, { signer: fakeStepSigner, gateway: reverting });
    expect(exec.status).toBe('parked');
    expect(exec.fundsLocation).toBeDefined();
  });
});

describe('gas seam — sponsorship + bounded fees + fee-token, wired into execute', () => {
  const USDC: FeeTokenOption = {
    symbol: 'USDC',
    decimals: 6,
    priceMicros: 1_000_000n, // 1 USDC = $1
    balanceBase: 100_000_000n, // 100 USDC
    rank: 0,
  };

  const gasPlanner = (opts: {
    perTxCapMicros?: bigint;
    dailyCapMicros?: bigint;
    maxFeePerGasCap?: bigint;
    gasCostMicros?: bigint;
    feeTokens?: readonly FeeTokenOption[];
  } = {}): RuntimeGasPlanner => {
    const engine = createGasEngine({
      env: createGasEnv(),
      sponsorship: {
        enabled: true,
        perTxCapMicros: opts.perTxCapMicros ?? 1_000_000n, // $1
        dailyCapMicros: opts.dailyCapMicros ?? 2_000_000n, // $2
      },
      caps: {
        maxFeePerGasCap: opts.maxFeePerGasCap ?? 100_000_000_000n, // 100 gwei
        maxPriorityFeePerGasCap: 5_000_000_000n, // 5 gwei
      },
    });
    const source = staticFeeMarketSource({
      ...(opts.gasCostMicros !== undefined ? { gasCostMicrosByChain: { 'eip155:1': opts.gasCostMicros } } : {}),
      ...(opts.feeTokens ? { feeTokensByChain: { 'eip155:1': opts.feeTokens } } : {}),
    });
    return new RuntimeGasPlanner({ engine, source, userId: 'user-1' });
  };

  const evmTransferPlan = async () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES });
    const { outcome } = await rt.plan(`send 0.1 ETH to ${GOOD}`);
    if (outcome.kind !== 'plan') throw new Error('expected a plan');
    return { rt, plan: outcome.plan, step: outcome.plan.steps[0]! };
  };

  it('gates gas abstraction to EVM chains', () => {
    expect(isEvmChain('eip155:1')).toBe(true);
    expect(isEvmChain('eip155:137')).toBe(true);
    expect(isEvmChain('bip122:bitcoin')).toBe(false);
    expect(isEvmChain('solana:mainnet')).toBe(false);
  });

  it('sponsors a cheap EVM step within budget (fee token null)', async () => {
    const { plan, step } = await evmTransferPlan();
    const gas = await gasPlanner({ gasCostMicros: 500_000n }).planStep(step, plan); // $0.50 < $1 cap
    expect(gas).not.toBeNull();
    expect(gas?.sponsored).toBe(true);
    expect(gas?.sponsoredMicros).toBe(500_000n);
    expect(gas?.feeToken).toBeNull();
    expect(gas?.params.maxFeePerGas).toBeGreaterThan(0n);
  });

  it('falls back to user_pays over the per-tx cap and picks a fee token', async () => {
    const { plan, step } = await evmTransferPlan();
    const gas = await gasPlanner({ gasCostMicros: 5_000_000n, feeTokens: [USDC] }).planStep(step, plan); // $5 > $1 cap
    expect(gas?.sponsored).toBe(false);
    expect(gas?.reason).toMatch(/per-transaction sponsorship cap/i);
    expect(gas?.feeToken?.symbol).toBe('USDC');
    expect(gas?.feeToken?.amountBase).toBeGreaterThan(5_000_000n); // ≥ $5 worth + margin
  });

  it('bounds EIP-1559 params to the caps during a fee spike', async () => {
    const { plan, step } = await evmTransferPlan();
    const gas = await gasPlanner({ maxFeePerGasCap: 1_000_000_000n }).planStep(step, plan); // 1 gwei cap vs 20 gwei base
    expect(gas?.params.bounded).toBe(true);
    expect(gas?.params.maxFeePerGas).toBe(1_000_000_000n);
    expect(gas?.params.maxPriorityFeePerGas).toBeLessThanOrEqual(gas!.params.maxFeePerGas);
  });

  it('returns null for a non-EVM step (native fees, no abstraction)', async () => {
    const { plan, step } = await evmTransferPlan();
    const btcStep = { ...step, chainId: 'bip122:bitcoin' };
    expect(await gasPlanner().planStep(btcStep, plan)).toBeNull();
  });

  it('threads the gas plan into the device signer on the execute path', async () => {
    const { rt, plan } = await evmTransferPlan();
    let called = false;
    let captured: StepGasPlan | undefined;
    const capturingSigner: StepSigner = {
      sign: (step, _plan, gas) => {
        called = true;
        captured = gas;
        return Promise.resolve({ rawTx: `signed:${step.seq}` });
      },
    };
    const exec = await rt.execute(plan, {
      signer: capturingSigner,
      gateway: fakeChainGateway,
      gasPlanner: gasPlanner({ gasCostMicros: 500_000n }),
    });
    expect(exec.status).toBe('completed');
    expect(called).toBe(true);
    expect(captured?.chainId).toBe('eip155:1'); // an EVM step received a gas plan
    expect(captured?.sponsored).toBe(true);
  });

  it('daily budget carries across steps — a second sponsored step past the cap flips to user_pays', async () => {
    const { plan, step } = await evmTransferPlan();
    // perTx $1, daily $1: first step ($0.80) sponsors, second ($0.80) exceeds the remaining $0.20.
    const planner = gasPlanner({ perTxCapMicros: 1_000_000n, dailyCapMicros: 1_000_000n, gasCostMicros: 800_000n });
    const first = await planner.planStep(step, plan);
    const second = await planner.planStep(step, plan);
    expect(first?.sponsored).toBe(true);
    expect(second?.sponsored).toBe(false);
    expect(second?.reason).toMatch(/daily sponsorship budget/i);
  });

  it("forUser draws each principal's sponsorship from its OWN daily bucket over the shared engine (F5)", async () => {
    const { plan, step } = await evmTransferPlan();
    // perTx $1, daily $1, cost $0.80. A single shared planner reused across users would draw EVERY
    // user's sponsorship from one bucket → the per-user cap collapses to a global one (alice exhausting
    // hers would starve bob). forUser gives each principal its own bucket while sharing the engine state.
    const shared = gasPlanner({ perTxCapMicros: 1_000_000n, dailyCapMicros: 1_000_000n, gasCostMicros: 800_000n });
    const alice = shared.forUser('alice');
    const bob = shared.forUser('bob');
    const aliceFirst = await alice.planStep(step, plan);
    const aliceSecond = await alice.planStep(step, plan); // alice's 2nd exceeds HER daily cap
    const bobFirst = await bob.planStep(step, plan); // bob is untouched by alice's spend
    expect(aliceFirst?.sponsored).toBe(true);
    expect(aliceSecond?.sponsored).toBe(false);
    expect(aliceSecond?.reason).toMatch(/daily sponsorship budget/i);
    expect(bobFirst?.sponsored).toBe(true); // the fix: bob's bucket is independent, not collapsed into alice's
  });
});

describe('WalletRuntime — address-poisoning detection is actually WIRED', () => {
  // Regression: `createWalletRuntime` constructed `new RiskEngineProvider(riskEngine)` with no
  // reference set, so the engine's ADDRESS_POISONING detector (severity 0.85) could NEVER fire —
  // a lookalike is only detectable relative to an address the user really deals with. Every plan
  // therefore reported "no threats flagged" even for a deliberately poisoned recipient.
  const REAL = '0x1111111111111111111111111111111111111111';
  // Same visible ends as REAL, different middle — the poisoning shape.
  const LOOKALIKE = '0x1111abcdef0123456789abcdef012345671111111'.slice(0, 42);

  it('flags a lookalike of a known-good address once knownAddresses is supplied', async () => {
    const rt = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES, knownAddresses: [REAL] });
    const { outcome } = await rt.plan(`send 0.1 ETH to ${LOOKALIKE}`);
    // The planner surfaces risk reasons on whichever outcome it produces.
    const reasons =
      outcome.kind === 'plan' ? outcome.plan.risk.reasons : outcome.kind === 'rejected' ? outcome.risk.reasons : [];
    expect(reasons.join(' ')).toMatch(/poisoning/i);
  });

  it('stays silent for the genuine address, and when no reference set is configured', async () => {
    const withRef = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES, knownAddresses: [REAL] });
    const genuine = await withRef.plan(`send 0.1 ETH to ${REAL}`);
    const genuineReasons = genuine.outcome.kind === 'plan' ? genuine.outcome.plan.risk.reasons : [];
    expect(genuineReasons.join(' ')).not.toMatch(/poisoning/i);

    // No reference set ⇒ nothing to compare against ⇒ no signal (documents the old behaviour).
    const noRef = createWalletRuntime({ holdings: HOLDINGS, prices: PRICES });
    const out = await noRef.plan(`send 0.1 ETH to ${LOOKALIKE}`);
    const noRefReasons = out.outcome.kind === 'plan' ? out.outcome.plan.risk.reasons : [];
    expect(noRefReasons.join(' ')).not.toMatch(/poisoning/i);
  });
});

describe('WalletRuntime — the cumulative-drain ledger survives a per-request runtime', () => {
  // Deployed builds construct a FRESH runtime per request (so balances are never stale). The
  // outflow ledger therefore has to be injected — otherwise every request starts with an empty
  // history, `sessionOutflowBase` always returns 0, and a drain split across several sends is
  // never caught. The guard worked locally (one long-lived runtime) and was dead in production.
  const holdings: Holding[] = [
    { symbol: 'ETH', decimals: 18, totalBase: 2n * 10n ** 18n, chains: [{ chainId: 'eip155:1', base: 2n * 10n ** 18n }] },
  ];
  const to = '0x1111111111111111111111111111111111111111';

  it('catches the split drain when the ledger is shared across runtimes', async () => {
    const ledger = new Map<string, bigint>();
    const fresh = (): ReturnType<typeof createWalletRuntime> =>
      createWalletRuntime({ holdings, prices: PRICES, sessionOutflow: ledger });

    // Request 1: 1.5 of 2 ETH — on its own this is NOT a whole-wallet move, so it plans.
    const first = await fresh().plan(`send 1.5 ETH to ${to}`);
    expect(first.outcome.kind).toBe('plan');
    ledger.set('ETH', 1_500_000_000_000_000_000n); // what authorize() records

    // Request 2 on a BRAND-NEW runtime: 0.5 alone is harmless, but 1.5 + 0.5 empties the wallet.
    const second = await fresh().plan(`send 0.5 ETH to ${to}`);
    expect(second.outcome.kind).toBe('rejected');
    if (second.outcome.kind === 'rejected') expect(second.outcome.reason).toMatch(/already sent this session/i);
  });

  it('without a shared ledger the second send slips through (the old behaviour)', async () => {
    // Documents exactly what regressing this would cost.
    const first = await createWalletRuntime({ holdings, prices: PRICES }).plan(`send 1.5 ETH to ${to}`);
    expect(first.outcome.kind).toBe('plan');
    const second = await createWalletRuntime({ holdings, prices: PRICES }).plan(`send 0.5 ETH to ${to}`);
    expect(second.outcome.kind).toBe('plan'); // no memory ⇒ not caught
  });
});
