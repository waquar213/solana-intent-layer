/**
 * Adapters that map each engine's own API onto the interfaces the Intent planner
 * expects (ADR-0030/0032 — the planner is pure over these seams). The Risk adapter
 * is REAL: the Risk Engine is standalone and pure, so it runs live here. Prices and
 * routes need a network vendor (a price feed, a DEX aggregator) that isn't wired
 * yet, so they are deterministic stubs — clearly marked, structurally swappable for
 * the real provider plugins without touching the planner.
 */
import type { PriceProvider, RiskProvider, Route, RouteProvider } from '@intent-wallet/intents';
import type { RiskReport } from '@intent-wallet/intents';
import { RiskEngine } from '@intent-wallet/risk';
import { usdToMicros } from '@intent-wallet/portfolio';

/** Common token decimals for the deterministic route stub; defaults to 18. */
const DECIMALS: Record<string, number> = { USDC: 6, USDT: 6, DAI: 18, ETH: 18, WETH: 18, BTC: 8, WBTC: 8, SOL: 9 };
const decimalsOf = (symbol: string): number => DECIMALS[symbol.toUpperCase()] ?? 18;

/**
 * REAL wiring: the Risk Engine behind the planner's `RiskProvider`. A recipient or
 * raw address is scanned as an address subject; a token symbol as a token subject.
 * The engine's rich report collapses to the planner's `{ level, reasons }`.
 */
export class RiskEngineProvider implements RiskProvider {
  constructor(
    private readonly engine: RiskEngine,
    /** The user's known-good addresses, for address-poisoning detection. */
    private readonly knownAddresses: readonly string[] = [],
  ) {}

  scan(subject: { type: 'address' | 'token' | 'recipient'; value: string }): Promise<RiskReport> {
    const report =
      subject.type === 'token'
        ? this.engine.scan({ kind: 'token', symbol: subject.value, address: subject.value, chainId: '' })
        : this.engine.scan({ kind: 'address', address: subject.value, knownAddresses: [...this.knownAddresses] });
    return Promise.resolve({ level: report.level, reasons: report.signals.map((s) => s.reason) });
  }
}

/** In-memory USD prices (decimal string per whole token). TODO: replace with a real price-feed plugin. */
export class MapPrices implements PriceProvider {
  readonly #m: Map<string, string>;
  constructor(prices: Record<string, string> = {}) {
    this.#m = new Map(Object.entries(prices).map(([k, v]) => [k.toUpperCase(), v]));
  }
  getUsd(symbol: string): string | undefined {
    return this.#m.get(symbol.toUpperCase());
  }
}

export interface StubRouteOptions {
  slippageBps?: number;
  /** Route fee as a fraction of notional, in bps (default 30 = 0.30%). */
  feeBps?: number;
  etaSeconds?: number;
  chainId?: string;
}

/** Which chain family an asset lives on. dUSDC is the Solana dollar, not an EVM token. */
const ECOSYSTEM_OF: Record<string, 'btc' | 'sol' | 'evm'> = { BTC: 'btc', SOL: 'sol', DUSDC: 'sol' };

/** Could ONE pool on ONE chain hold both sides of this pair? Crossing families needs a bridge. */
function sameEcosystem(from: string, to: string): boolean {
  const eco = (s: string): 'btc' | 'sol' | 'evm' => ECOSYSTEM_OF[s.toUpperCase()] ?? 'evm';
  return eco(from) === eco(to);
}

/**
 * A DETERMINISTIC route stub: it prices a from→to conversion off the injected price
 * feed (min-out after slippage), so swaps produce a coherent plan for testing and
 * local runs. It is NOT a real quote — the real DEX/bridge aggregator plugs in here
 * behind the same `RouteProvider` interface. Returns null when a price is unknown,
 * or when the two assets are on different chains (one leg cannot span two families).
 */
export class StubRouteProvider implements RouteProvider {
  constructor(
    private readonly prices: PriceProvider,
    private readonly opts: StubRouteOptions = {},
  ) {}

  findRoute(input: {
    fromSymbol: string;
    toSymbol: string;
    amountBase: bigint;
    fromDecimals: number;
  }): Promise<Route | null> {
    const fromUsd = this.prices.getUsd(input.fromSymbol);
    const toUsd = this.prices.getUsd(input.toSymbol);
    if (!fromUsd || !toUsd) return Promise.resolve(null);
    // A price for both sides is NOT enough to make a swap possible. This stub emits ONE leg on ONE
    // chain, and one pool cannot hold assets from two chain families — so pricing ETH→SOL or
    // SOL→BTC produced a complete, confident plan (quote, fee, route graph, "Low risk", and under
    // AUTO even "Authorized") for something no venue can settle; it only failed at the execute
    // step. Crossing ecosystems needs a BRIDGE, which is not a route this provider can express.
    // Real Solana pairs are answered upstream by the Jupiter provider and never reach here.
    if (!sameEcosystem(input.fromSymbol, input.toSymbol)) return Promise.resolve(null);

    const slippageBps = this.opts.slippageBps ?? 50;
    const feeBps = this.opts.feeBps ?? 30;
    const chainId = this.opts.chainId ?? 'eip155:1';
    const toDecimals = decimalsOf(input.toSymbol);

    // notional in micro-USD = amountBase × price / 10^fromDecimals
    const notionalMicros = (input.amountBase * usdToMicros(fromUsd)) / 10n ** BigInt(input.fromDecimals);
    // ideal out (base units of the destination) = notional / toPrice
    const idealOutBase = (notionalMicros * 10n ** BigInt(toDecimals)) / usdToMicros(toUsd);
    const outMinBase = (idealOutBase * BigInt(10_000 - slippageBps)) / 10_000n;
    const feeMicros = (notionalMicros * BigInt(feeBps)) / 10_000n;

    return Promise.resolve({
      legs: [
        {
          kind: 'swap',
          chainId,
          venue: 'stub-dex',
          description: `Swap ${input.fromSymbol} → ${input.toSymbol} (stub route)`,
        },
      ],
      outMinBase,
      outDecimals: toDecimals,
      feeMicros,
      slippageBps,
      etaSeconds: this.opts.etaSeconds ?? 30,
    });
  }
}
