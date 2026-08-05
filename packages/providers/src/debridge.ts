/**
 * deBridge (DLN) cross-chain-swap provider — the SECOND top-level aggregator behind the same
 * `CrossChainSwapProvider` seam as LI.FI, so the registry can compare their quotes and pick the best net
 * deal (that is what makes this a meta-aggregator, not a single-source wrapper). deBridge's DLN is a
 * 0-TVL intent/solver network: you sign an order on the source chain, a solver fills it on the
 * destination. https://dln.debridge.finance/v1.0
 *
 * NON-CUSTODIAL: this only READS a quote and carries back deBridge's UNSIGNED `tx`. The wallet signs it
 * ON-DEVICE (EVM via executeCrossChainSwapEvm, Solana via executeCrossChainSwapSolana) — no key is ever
 * here, nothing broadcasts here. FAIL-CLOSED: an unknown chain/token, an error response, or a malformed
 * quote throws, and the registry treats a throw as "no quote", so deBridge simply doesn't compete on a
 * route it can't serve (LI.FI still can).
 *
 * deBridge needs token ADDRESSES (LI.FI took symbols), so we map only the tokens the wallet offers to
 * their VERIFIED canonical mainnet addresses. A symbol we don't have an unambiguous address for (e.g. ETH
 * on a non-ETH-native chain, DAI, WBTC) returns NO_ROUTE here and is left to LI.FI — never guessed.
 */
import { ProviderError } from './errors.js';
import { usdStringToMicros, type FetchLike } from './lifi.js';
import type { CrossChainSwapExecution, CrossChainSwapProvider, CrossChainSwapQuote, CrossChainSwapRequest } from './provider.js';

export interface DebridgeProviderOptions {
  fetchImpl?: FetchLike;
  baseUrl?: string;
  /** Optional referral code (deBridge affiliate); quotes work without it. */
  referralCode?: string;
  now?: () => number;
  timeoutMs?: number;
}

/** Canonical chain id -> deBridge chain id. EVM chains use their standard id; Solana is deBridge's 7565164. */
const DEBRIDGE_CHAIN_IDS: Record<string, number> = {
  'eip155:1': 1,
  'eip155:10': 10,
  'eip155:56': 56,
  'eip155:137': 137,
  'eip155:8453': 8453,
  'eip155:42161': 42161,
  'solana:mainnet': 7565164,
  'solana:101': 7565164,
};
const SOLANA_DEBRIDGE_ID = 7565164;

/** deBridge native-token sentinels: EVM = the zero address; Solana native SOL = the system-program id. */
const NATIVE_EVM = '0x0000000000000000000000000000000000000000';
const NATIVE_SOL = '11111111111111111111111111111111';

// Verified canonical mainnet token addresses, keyed [deBridgeChainId][SYMBOL]. Native only where the UI's
// symbol truly IS the chain's native asset. Anything missing => NO_ROUTE (fail-closed; LI.FI handles it).
const TOKEN_ADDRESSES: Record<number, Record<string, string>> = {
  1: { ETH: NATIVE_EVM, USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  10: { ETH: NATIVE_EVM, USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' },
  56: { USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', USDT: '0x55d398326f99059fF775485246999027B3197955' },
  137: { USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
  8453: { ETH: NATIVE_EVM, USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
  42161: { ETH: NATIVE_EVM, USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
  [SOLANA_DEBRIDGE_ID]: {
    SOL: NATIVE_SOL,
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  },
};

// deBridge charges a flat native fixFee (~$1-2 EVM, ~cents on Solana) that isn't reflected in the quoted
// OUTPUT and which the response doesn't price in USD. We subtract a CONSERVATIVE per-ecosystem floor so
// deBridge is never made to look cheaper than reality (fail-closed for real money); the exact source gas
// is estimated on-device at signing regardless. Documented in ADR-0057. Micro-USD.
const FIXFEE_FLOOR_MICROS_EVM = 2_000_000n; // $2.00
const FIXFEE_FLOOR_MICROS_SOL = 50_000n; // $0.05

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const numOrStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);

/**
 * Build a deBridge DLN cross-chain-swap provider. `quote()` calls `create-tx` (which returns BOTH the
 * estimation and the executable order tx), normalizes it, and attaches the unsigned tx for on-device
 * signing — mirroring the LI.FI plugin so the registry can rank them head-to-head.
 */
export function makeDebridgeProvider(options: DebridgeProviderOptions = {}): CrossChainSwapProvider {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  const baseUrl = options.baseUrl ?? 'https://dln.debridge.finance/v1.0';
  const now = options.now ?? ((): number => Date.now());
  const timeoutMs = options.timeoutMs ?? 15_000;

  const resolveChain = (canonical: string): number | undefined => DEBRIDGE_CHAIN_IDS[canonical];
  const resolveToken = (dbChainId: number, symbol: string): string | undefined => TOKEN_ADDRESSES[dbChainId]?.[symbol.toUpperCase()];

  return {
    id: 'debridge',
    kind: 'crosschain-swap',
    async quote(request: CrossChainSwapRequest): Promise<CrossChainSwapQuote> {
      if (!fetchImpl) throw new ProviderError('PROVIDER_UNAVAILABLE', 'no fetch implementation available');
      const srcChainId = resolveChain(request.fromChainId);
      const dstChainId = resolveChain(request.toChainId);
      if (srcChainId === undefined || dstChainId === undefined) {
        throw new ProviderError('NO_ROUTE', `deBridge: unsupported route ${request.fromChainId} -> ${request.toChainId}`);
      }
      const srcToken = resolveToken(srcChainId, request.fromToken);
      const dstToken = resolveToken(dstChainId, request.toToken);
      if (!srcToken || !dstToken) {
        throw new ProviderError('NO_ROUTE', `deBridge: unmapped token ${request.fromToken}/${request.toToken} on this route`);
      }
      // deBridge requires a destination recipient + order authorities. The wallet is the source authority;
      // the destination recipient/authority is the same identity's address ON THE DEST CHAIN.
      const recipient = request.toAddress ?? request.fromAddress;
      const ecosystem: CrossChainSwapExecution['ecosystem'] = srcChainId === SOLANA_DEBRIDGE_ID ? 'solana' : 'evm';
      const isNativeSrc = srcToken === NATIVE_EVM || srcToken === NATIVE_SOL;

      const params = new URLSearchParams({
        srcChainId: String(srcChainId),
        srcChainTokenIn: srcToken,
        srcChainTokenInAmount: request.amountInBase.toString(),
        dstChainId: String(dstChainId),
        dstChainTokenOut: dstToken,
        dstChainTokenOutAmount: 'auto',
        dstChainTokenOutRecipient: recipient,
        srcChainOrderAuthorityAddress: request.fromAddress,
        dstChainOrderAuthorityAddress: recipient,
        prependOperatingExpenses: 'true',
      });
      if (options.referralCode) params.set('referralCode', options.referralCode);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let body: Json;
      try {
        const res = await fetchImpl(`${baseUrl}/dln/order/create-tx?${params.toString()}`, { headers: { accept: 'application/json' }, signal: controller.signal });
        body = obj(await res.json().catch(() => ({})));
        // deBridge reports failures in-band as `errorId` (HTTP may still be 200 for some).
        if (body.errorId || !res.ok) {
          throw new ProviderError('HTTP_ERROR', `deBridge quote failed: ${str(body.errorMessage) ?? str(body.errorId) ?? `HTTP ${res.status}`}`);
        }
      } finally {
        clearTimeout(timer);
      }

      const estimation = obj(body.estimation);
      const out = obj(estimation.dstChainTokenOut);
      // recommendedAmount already accounts for slippage; fall back to amount. Both are base-unit strings.
      const toAmountRaw = numOrStr(out.recommendedAmount) ?? numOrStr(out.amount);
      const decimals = typeof out.decimals === 'number' ? out.decimals : undefined;
      if (!toAmountRaw || decimals === undefined) {
        throw new ProviderError('INVALID_QUOTE', 'deBridge: malformed quote (no dst amount/decimals)');
      }
      let toAmountBase: bigint;
      try {
        toAmountBase = BigInt(toAmountRaw);
      } catch {
        throw new ProviderError('INVALID_QUOTE', 'deBridge: non-integer dst amount');
      }

      const tx = obj(body.tx);
      const txData = str(tx.data);
      if (!txData) throw new ProviderError('INVALID_QUOTE', 'deBridge: quote carried no executable tx');
      if (ecosystem === 'evm' && !str(tx.to)) throw new ProviderError('INVALID_QUOTE', 'deBridge: EVM route missing tx.to');

      const execution: CrossChainSwapExecution =
        ecosystem === 'evm'
          ? {
              ecosystem,
              raw: { chainId: srcChainId, to: str(tx.to), data: txData, value: numOrStr(tx.value) ?? '0' },
              // ERC-20 source: the DlnSource router (tx.to) must be approved to pull `fromToken` (exact amount).
              ...(isNativeSrc ? {} : { approvalSpender: str(tx.to)!, fromTokenAddress: srcToken }),
            }
          : { ecosystem, raw: { data: txData } };

      const feeMicros = (usdStringToMicros(numOrStr(body.protocolFeeApproximateUsdValue)) ?? 0n) + (ecosystem === 'solana' ? FIXFEE_FLOOR_MICROS_SOL : FIXFEE_FLOOR_MICROS_EVM);

      return {
        providerId: 'debridge',
        toAmountBase,
        toDecimals: decimals,
        toTokenSymbol: str(out.symbol) ?? request.toToken,
        toValueMicros: usdStringToMicros(numOrStr(out.approximateUsdValue)),
        feeMicros,
        gasMicros: 0n, // source gas is not separately reported; the conservative fixFee floor sits in feeMicros
        etaSeconds: typeof obj(body.order).approximateFulfillmentDelay === 'number' ? (obj(body.order).approximateFulfillmentDelay as number) : 0,
        tool: 'dln',
        steps: ['deBridge DLN'],
        execution,
        quotedAt: now(),
      };
    },
  };
}
