/**
 * deBridge (DLN) provider plugin — normalization of a real-shaped `create-tx` response into the
 * framework's CrossChainSwapQuote, and the fail-closed refusals. Uses a FAKE fetch (no network, no
 * funds): the canned bodies mirror real dln.debridge.finance responses (0.01 ETH Arbitrum -> USDC
 * Optimism, and the Solana-source variant).
 */
import { describe, expect, it, vi } from 'vitest';
import { makeDebridgeProvider, ProviderError } from '../src/index.js';
import type { CrossChainSwapExecution, FetchLike } from '../src/index.js';

// A real-shaped deBridge create-tx body (trimmed to the fields the plugin reads).
const OK_EVM = {
  estimation: {
    srcChainTokenIn: { symbol: 'ETH', amount: '10122915228529260', approximateUsdValue: 18.966458439047813 },
    dstChainTokenOut: { symbol: 'USDC', amount: '18642219', recommendedAmount: '18642219', decimals: 6, approximateUsdValue: 18.655014242591246 },
  },
  tx: { to: '0xeF4fB24aD0916217251F553c0596F8Edc630EB66', data: '0xb9303701dead', value: '1000000000000000' },
  protocolFeeApproximateUsdValue: 0.007586583375617805,
  fixFee: '1000000000000000',
  order: { approximateFulfillmentDelay: 2 },
};

const OK_SOL = {
  estimation: {
    // native SOL source (1 SOL @ $180); fixFee 0.001 SOL is priced from THIS, decimals-agnostic.
    srcChainTokenIn: { symbol: 'SOL', amount: '1000000000', approximateUsdValue: 180 },
    dstChainTokenOut: { symbol: 'USDC', amount: '73900000', recommendedAmount: '73900000', decimals: 6, approximateUsdValue: 73.9 },
  },
  tx: { data: 'AQAAAAAAAAAAAAAAAAAAsolanaBase64==' },
  fixFee: '1000000',
  order: { approximateFulfillmentDelay: 5 },
};

function fakeFetch(body: unknown, ok = true, status = 200): FetchLike {
  return vi.fn(async () => ({ ok, status, json: async () => body }));
}

const EVM_ADDR = '0x1111111111111111111111111111111111111111';
const EVM_DST = '0x2222222222222222222222222222222222222222';
const SOL_ADDR = 'So11111111111111111111111111111111111111112';

const REQ_NATIVE = {
  fromChainId: 'eip155:42161',
  toChainId: 'eip155:10',
  fromToken: 'ETH',
  toToken: 'USDC',
  amountInBase: 10_000_000_000_000_000n,
  fromDecimals: 18,
  fromAddress: EVM_ADDR,
  toAddress: EVM_DST,
  slippageBps: 50,
} as const;

describe('makeDebridgeProvider.quote', () => {
  it('normalizes a real-shaped EVM native-source response', async () => {
    const p = makeDebridgeProvider({ fetchImpl: fakeFetch(OK_EVM), now: () => 12_345 });
    const q = await p.quote(REQ_NATIVE);
    expect(q.providerId).toBe('debridge');
    expect(q.toAmountBase).toBe(18_642_219n);
    expect(q.toDecimals).toBe(6);
    expect(q.toTokenSymbol).toBe('USDC');
    expect(q.toValueMicros).toBe(18_655_014n); // 18.655014… -> micros (truncated at 6dp)
    // feeMicros = the fixFee priced EXACTLY from deBridge's own native srcChainTokenIn (0.001 ETH @ the
    // response-implied price ≈ $1.8736). protocol/taker/opex/slippage are already in the output, not here.
    expect(q.feeMicros).toBe(1_873_616n);
    expect(q.gasMicros).toBe(0n);
    expect(q.etaSeconds).toBe(2);
    expect(q.tool).toBe('dln');
    expect(q.quotedAt).toBe(12_345);
    // native source -> no approval; EVM raw carries chainId/to/data/value for the on-device EVM signer
    const ex = q.execution as CrossChainSwapExecution;
    expect(ex.ecosystem).toBe('evm');
    expect(ex.approvalSpender).toBeUndefined();
    expect(ex.fromTokenAddress).toBeUndefined();
    expect(ex.raw).toMatchObject({ chainId: 42161, to: '0xeF4fB24aD0916217251F553c0596F8Edc630EB66', value: '1000000000000000' });
  });

  it('sets an EXACT-amount approval to the DLN router (tx.to) for an ERC-20 source', async () => {
    const p = makeDebridgeProvider({ fetchImpl: fakeFetch(OK_EVM) });
    const q = await p.quote({ ...REQ_NATIVE, fromToken: 'USDC', amountInBase: 20_000_000n, fromDecimals: 6 });
    const ex = q.execution as CrossChainSwapExecution;
    expect(ex.ecosystem).toBe('evm');
    expect(ex.approvalSpender).toBe('0xeF4fB24aD0916217251F553c0596F8Edc630EB66'); // the DLN source router = tx.to
    expect(ex.fromTokenAddress).toBe('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'); // USDC on Arbitrum
    // ERC-20 source can't derive the native price from the (USDC) srcChainTokenIn and no feed was injected
    // → the CONSERVATIVE floor ($2.00), never understated.
    expect(q.feeMicros).toBe(2_000_000n);
  });

  it('prices the fixFee EXACTLY from the injected native feed for an ERC-20 source', async () => {
    // 0.001 ETH fixFee @ an injected $1500/ETH = $1.50; the floor is NOT used when a feed is available.
    const p = makeDebridgeProvider({ fetchImpl: fakeFetch(OK_EVM), nativeUsdMicros: () => 1_500_000_000n });
    const q = await p.quote({ ...REQ_NATIVE, fromToken: 'USDC', amountInBase: 20_000_000n, fromDecimals: 6 });
    expect(q.feeMicros).toBe(1_500_000n);
  });

  it('normalizes a Solana-source response as ecosystem=solana with the base64 tx, no approval', async () => {
    const p = makeDebridgeProvider({ fetchImpl: fakeFetch(OK_SOL) });
    const q = await p.quote({ ...REQ_NATIVE, fromChainId: 'solana:mainnet', fromToken: 'SOL', fromAddress: SOL_ADDR });
    expect(q.toValueMicros).toBe(73_900_000n);
    // native SOL source → fixFee (0.001 SOL) priced from srcChainTokenIn (1 SOL @ $180) = $0.18, exact.
    expect(q.feeMicros).toBe(180_000n);
    const ex = q.execution as CrossChainSwapExecution;
    expect(ex.ecosystem).toBe('solana');
    expect(ex.approvalSpender).toBeUndefined();
    expect(ex.raw).toMatchObject({ data: 'AQAAAAAAAAAAAAAAAAAAsolanaBase64==' });
  });

  it('fails closed (NO_ROUTE) on an unsupported chain', async () => {
    const p = makeDebridgeProvider({ fetchImpl: fakeFetch(OK_EVM) });
    await expect(p.quote({ ...REQ_NATIVE, fromChainId: 'eip155:999' })).rejects.toMatchObject({ code: 'NO_ROUTE' });
  });

  it('fails closed (NO_ROUTE) on an unmapped token — never guesses an address', async () => {
    const p = makeDebridgeProvider({ fetchImpl: fakeFetch(OK_EVM) });
    await expect(p.quote({ ...REQ_NATIVE, fromChainId: 'eip155:1', fromToken: 'DAI' })).rejects.toMatchObject({ code: 'NO_ROUTE' });
  });

  it('fails closed (HTTP_ERROR) on an in-band deBridge errorId', async () => {
    const p = makeDebridgeProvider({ fetchImpl: fakeFetch({ errorId: 'ERROR_LOW_GIVE_AMOUNT', errorMessage: 'amount too low' }) });
    await expect(p.quote(REQ_NATIVE)).rejects.toBeInstanceOf(ProviderError);
  });

  it('fails closed (INVALID_QUOTE) when the dst amount/decimals are missing', async () => {
    const p = makeDebridgeProvider({ fetchImpl: fakeFetch({ estimation: { dstChainTokenOut: { symbol: 'USDC' } }, tx: { to: '0xAbc', data: '0x1' } }) });
    await expect(p.quote(REQ_NATIVE)).rejects.toMatchObject({ code: 'INVALID_QUOTE' });
  });

  it('fails closed (INVALID_QUOTE) when no executable tx is carried', async () => {
    const p = makeDebridgeProvider({ fetchImpl: fakeFetch({ estimation: { dstChainTokenOut: { amount: '1', decimals: 6, approximateUsdValue: 1 } }, tx: {} }) });
    await expect(p.quote(REQ_NATIVE)).rejects.toMatchObject({ code: 'INVALID_QUOTE' });
  });
});
