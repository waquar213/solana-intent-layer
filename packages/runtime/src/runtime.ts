/**
 * `createWalletRuntime` — the composition root. It instantiates the engines and
 * wires them into a single `EngineContext`, then hands back a runtime whose one
 * method turns natural language into a verified plan. This is the first place the
 * pieces actually talk to each other: the parser → planner → (holdings · prices ·
 * routes · REAL risk · identity recipient resolution). It PROPOSES a plan; it never
 * signs — execution needs the plan plus a device signature downstream.
 */
import {
  CompositeParser,
  IntentEngine,
  MapHoldings,
  type EngineContext,
  type EngineResult,
  type ExecutionPlan,
  type Holding,
  type LlmClient,
  type ParseContext,
  type RouteProvider,
} from '@intent-wallet/intents';
import { RiskEngine } from '@intent-wallet/risk';
import { ContactBook, classifyAddress, type RecipientResolution } from '@intent-wallet/identity';
import type { Execution } from '@intent-wallet/execution';
import type { ExecutionPermission } from '@intent-wallet/policy';
import {
  createDefaultCapabilityService,
  type CapabilityService,
  type StepCapabilityInput,
} from '@intent-wallet/capabilities';
import { MapPrices, RiskEngineProvider, StubRouteProvider } from './adapters.js';
import { executePlan, type ExecuteDeps } from './execution.js';
import { authorizePlan, type AuthorizeDeps } from './policy.js';
import { summarizePortfolio, type PortfolioSummary } from './portfolio.js';

export interface WalletRuntimeConfig {
  /** The user's holdings (from the Portfolio engine; in-memory here). */
  holdings?: Holding[];
  /** USD prices by symbol (decimal string). */
  prices?: Record<string, string>;
  /** A pre-seeded Risk Engine (e.g. with threat intel); defaults to a fresh one. */
  riskEngine?: RiskEngine;
  /**
   * The principal's known-good recipients — the reference set the Risk engine's ADDRESS_POISONING
   * detector measures a candidate against.
   *
   * Without it that detector is structurally DEAD: a lookalike is only detectable relative to
   * something the user actually deals with, so an empty set can never produce a signal. It was
   * previously never supplied at the single construction site, so every plan reported "no threats"
   * even for a deliberately poisoned recipient. (The browser/mobile clients run the same check
   * on-device at sign time, where the address book lives; this seam lets a server supply it too.)
   */
  knownAddresses?: readonly string[];
  /**
   * The per-principal cumulative-outflow ledger the drain guard reads.
   *
   * Pass one in when runtimes are built PER REQUEST (the deployed path): the ledger must outlive a
   * single request or the guard is dead — `sessionOutflowBase` would return 0 every time and a
   * drain split across several sends could never be detected. Balances are still resolved fresh
   * per request; only this ledger is shared. Omit it and each runtime gets its own (fine when one
   * long-lived runtime serves everything, as in local/dev).
   */
  sessionOutflow?: Map<string, bigint>;
  /** Plan ids already counted into `sessionOutflow`, shared the SAME way and for the SAME reason: when
   *  runtimes are built PER REQUEST, this must outlive a single request or the per-plan idempotency guard
   *  is dead (each request gets a fresh set → no dedup) and re-authorizing one plan double-counts the
   *  ledger, self-DoSing later sends. Pair it with `sessionOutflow` so the two can never desync. */
  countedPlans?: Set<string>;
  /** Real recipient resolution; without it, only raw addresses resolve. */
  contactBook?: ContactBook;
  /** Resolve an ENS name (`name.eth`) to an EVM address; without it, ENS names don't resolve. */
  resolveEns?: (name: string) => Promise<string | null>;
  /** The AI Gateway for the parser's LLM fallback; without it, non-deterministic phrasings clarify. */
  llm?: LlmClient;
  /** Override the route provider (default: the deterministic price-based stub). */
  routes?: RouteProvider;
  /** A real DEX aggregator tried BEFORE the default provider; it answers the pairs it
   *  knows (e.g. Jupiter for Solana) and returns null otherwise, falling through. */
  extraRoutes?: RouteProvider;
  /** Capability registry consulted to reject provably-infeasible plans (default: built-in profiles). */
  capabilities?: CapabilityService;
  /** Symbol → chain id for defaults. */
  defaultChains?: Record<string, string>;
  /** Chain id → network-fee estimate (micro-USD). */
  feeMicrosByChain?: Record<string, bigint>;
  /** A LIVE per-chain fee estimator (e.g. EVM gas price × ETH price); when it returns
   *  null for a chain (or errors), the static `feeMicrosByChain`/default baseline is used. */
  liveFeeMicros?: (chainId: string) => Promise<bigint | null>;
  ids?: { plan(): string; intent(): string };
}

const chainForSymbol = (symbol: string): string => {
  const s = symbol.toUpperCase();
  if (s === 'BTC') return 'bip122:bitcoin';
  if (s === 'SOL') return 'solana:mainnet';
  return 'eip155:1';
};

const DEFAULT_FEE_MICROS: Record<string, bigint> = {
  'eip155:1': 500_000n, // ~$0.50
  'bip122:bitcoin': 2_000_000n, // ~$2.00
  'solana:mainnet': 5_000n, // ~$0.005
};

function addressResolver(query: string): Promise<RecipientResolution> {
  const info = classifyAddress(query.trim());
  if (info) return Promise.resolve({ kind: 'address', ecosystem: info.ecosystem, address: info.normalized });
  return Promise.resolve({ kind: 'not_found', query });
}

export class WalletRuntime {
  constructor(
    readonly engine: IntentEngine,
    readonly context: EngineContext,
    private readonly riskEngine: RiskEngine,
    private readonly capabilities: CapabilityService,
    /** Per-session outflow ledger (base units per asset) — the SAME map the context's
     *  sessionOutflowBase reads, so the cumulative-drain guard sees what's been authorized. */
    private readonly outflow: Map<string, bigint> = new Map(),
    /** Plan ids already counted into `outflow`, so re-authorizing the SAME plan (a UI preview/retry, or
     *  an authorize→execute round) can't double-count it into the cumulative-drain guard and self-DoS a
     *  later legitimate send. */
    private readonly countedPlans: Set<string> = new Set(),
  ) {}

  /**
   * Natural language → parsed intent + planned outcome. After the planner proposes a
   * plan, the Capability Registry is consulted (fail-closed): a plan whose step needs
   * a capability the target network doesn't have — a stake on a non-staking chain, a
   * bridge to an unsupported chain — is turned into a rejection BEFORE it can be
   * authorized or signed. So the planner decides on dynamic capabilities, not
   * hardcoded assumptions.
   */
  async plan(utterance: string, parseContext?: ParseContext): Promise<EngineResult> {
    const result = await this.engine.handle(utterance, parseContext);
    if (result.outcome.kind !== 'plan') return result;

    const plan = result.outcome.plan;
    // Prefer explicit per-step params (a multi-leg plan carries its own toChainId/asset)
    // and fall back to plan-level fields only as a heuristic. Crucially there is NO
    // self-loop fallback for a bridge's destination: if none can be derived, toChainId
    // stays undefined so checkStep rejects with a clear "missing destination network"
    // instead of masking a malformed plan as a self-bridge routing error.
    const strParam = (params: Record<string, unknown>, key: string): string | undefined => {
      const v = params[key];
      return typeof v === 'string' && v.length > 0 ? v : undefined;
    };
    const steps: StepCapabilityInput[] = plan.steps.map((s) => {
      const toChainId =
        s.kind === 'bridge' ? (strParam(s.params, 'toChainId') ?? plan.destChains.find((c) => c !== s.chainId)) : undefined;
      const symbol = strParam(s.params, 'symbol') ?? strParam(s.params, 'asset') ?? plan.assets[0];
      return {
        seq: s.seq,
        kind: s.kind,
        chainId: s.chainId,
        ...(toChainId ? { toChainId } : {}),
        ...(symbol ? { symbol } : {}),
      };
    });

    const feasibility = this.capabilities.checkPlan({ steps });
    if (feasibility.feasible) return result;

    const reason = feasibility.unsupported.map((u) => u.reason).join('; ');
    return { intent: result.intent, outcome: { kind: 'rejected', reason: `Not possible: ${reason}.`, risk: plan.risk } };
  }

  /** The wallet's holdings folded into per-asset USD values + a total (the read side). */
  portfolio(): PortfolioSummary {
    return summarizePortfolio(this.context);
  }

  /**
   * Authorize an approved plan BEFORE signing — the doctrine's middle step: intent
   * proposes, policy (composed with the same Risk Engine used at plan time)
   * authorizes, the device signs. Sign only if `permission.mayProceedToSign`.
   */
  async authorize(plan: ExecutionPlan, deps: Omit<AuthorizeDeps, 'riskEngine'>): Promise<ExecutionPermission> {
    const permission = await authorizePlan(plan, { ...deps, riskEngine: this.riskEngine });
    // Feed the cumulative-drain guard: when a transfer is authorized (anything but a hard policy
    // BLOCK — a require_confirmation send still executes once the user confirms, and a split-drain
    // attack rides exactly that step-up path), add its amount to this session's outflow ledger (the
    // SAME map context.sessionOutflowBase reads), so a LATER plan that would complete a whole-wallet
    // drain across several sends is caught at plan time. Over-counting an unexecuted plan only makes
    // the guard stricter, never looser.
    // A convert-and-send (swap_and_send) SPENDS its input asset and forwards to an EXTERNAL recipient, so it
    // drains the wallet exactly like a transfer — and its recipient is already treated as external by
    // risk/sanctions. Omitting it let a swap_and_send + a later transfer empty the wallet across two typed
    // messages, each individually under the cumulative-drain bar. Record the DRAINED source asset for both.
    if (permission.gate !== 'block' && (plan.intentKind === 'transfer' || plan.intentKind === 'swap_and_send') && !this.countedPlans.has(plan.planId)) {
      let asset: string | undefined;
      let amt: string | undefined;
      if (plan.intentKind === 'transfer') {
        const p = plan.steps[0]?.params ?? {};
        asset = typeof p['asset'] === 'string' ? p['asset'].toUpperCase() : undefined;
        amt = typeof p['amountBase'] === 'string' ? p['amountBase'] : undefined;
      } else {
        // swap_and_send: the drained asset is the INPUT (plan.assets[0] = fromAsset), amount = youSend.base.
        asset = typeof plan.assets[0] === 'string' ? plan.assets[0].toUpperCase() : undefined;
        amt = plan.quote?.youSend?.base;
      }
      if (asset && amt) {
        try {
          this.outflow.set(asset, (this.outflow.get(asset) ?? 0n) + BigInt(amt));
          this.countedPlans.add(plan.planId); // count each plan ONCE — a re-authorize/preview must not inflate the ledger
        } catch {
          /* ignore a malformed amount — never let bookkeeping break authorization */
        }
      }
    }
    return permission;
  }

  /**
   * Drive an APPROVED plan to a terminal execution. The caller injects the device
   * signer + chain gateway (non-custodial — the device signs, the runtime never
   * holds a key). Call this only after the user has confirmed the plan.
   */
  execute(plan: ExecutionPlan, deps: ExecuteDeps): Promise<Execution> {
    return executePlan(plan, deps);
  }
}

export function createWalletRuntime(config: WalletRuntimeConfig = {}): WalletRuntime {
  const prices = new MapPrices(config.prices ?? {});
  const holdings = new MapHoldings(config.holdings ?? []);
  const riskEngine = config.riskEngine ?? new RiskEngine();
  const risk = new RiskEngineProvider(riskEngine, config.knownAddresses ?? []);
  const baseRoutes = config.routes ?? new StubRouteProvider(prices);
  // A real DEX aggregator (extraRoutes) answers the pairs it knows and returns null
  // otherwise, falling through to the base provider — so real quotes are used where
  // available without losing coverage for the rest.
  const extra = config.extraRoutes;
  const routes: RouteProvider = extra
    ? { findRoute: async (i) => (await extra.findRoute(i)) ?? baseRoutes.findRoute(i) }
    : baseRoutes;

  const contactBook = config.contactBook;
  const baseResolver = contactBook ? (q: string) => contactBook.resolveRecipient(q) : addressResolver;
  const resolveEns = config.resolveEns;
  // An `name.eth` query resolves to an EVM address via the injected ENS resolver; anything
  // else falls through to contact/address resolution. A name that doesn't resolve is
  // `not_found` (never guessed) so the planner asks the user to clarify.
  const resolveRecipient = resolveEns
    ? async (q: string): Promise<RecipientResolution> => {
        const name = q.trim().toLowerCase();
        if (name.endsWith('.eth')) {
          const address = await resolveEns(name);
          return address ? { kind: 'address', ecosystem: 'evm', address } : { kind: 'not_found', query: q };
        }
        return baseResolver(q);
      }
    : baseResolver;

  let n = 0;
  const ids = config.ids ?? {
    plan: () => `plan-${(++n).toString(36)}`,
    intent: () => `intent-${(++n).toString(36)}`,
  };

  const defaultChainFor = (symbol: string): string =>
    config.defaultChains?.[symbol.toUpperCase()] ?? chainForSymbol(symbol);

  const feeMap = config.feeMicrosByChain ?? {};
  const staticFeeMicros = (chainId: string): bigint => feeMap[chainId] ?? DEFAULT_FEE_MICROS[chainId] ?? 300_000n;
  // A live estimator (EVM gas price × ETH price) is used when it can produce a real
  // number; on null/error it falls back to the documented static baseline — so the fee
  // shown before signing tracks the network when possible and is an honest labelled
  // estimate otherwise, never an invented figure.
  const liveFee = config.liveFeeMicros;
  const estimateFeeMicros = liveFee
    ? async (chainId: string): Promise<bigint> => {
        const live = await liveFee(chainId).catch(() => null);
        return live ?? staticFeeMicros(chainId);
      }
    : (chainId: string): Promise<bigint> => Promise.resolve(staticFeeMicros(chainId));

  // Per-session outflow ledger — the planner's cumulative-drain guard reads it via
  // sessionOutflowBase, and WalletRuntime.authorize increments it as transfers are cleared.
  const outflow = config.sessionOutflow ?? new Map<string, bigint>();
  const countedPlans = config.countedPlans ?? new Set<string>();

  const context: EngineContext = {
    holdings,
    prices,
    routes,
    risk,
    resolveRecipient,
    defaultChainFor,
    estimateFeeMicros,
    sessionOutflowBase: (symbol: string) => outflow.get(symbol.toUpperCase()) ?? 0n,
    ids,
  };

  const capabilities = config.capabilities ?? createDefaultCapabilityService();

  const parser = new CompositeParser(config.llm ? { llm: config.llm } : {});
  return new WalletRuntime(new IntentEngine(parser, context), context, riskEngine, capabilities, outflow, countedPlans);
}
