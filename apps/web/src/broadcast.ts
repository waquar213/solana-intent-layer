/**
 * Real broadcast — the last mile. The wallet signs entirely in the browser
 * (non-custodial), and here we push the signed transaction to a real testnet node
 * over the fetch-based `@intent-wallet/chains` adapters. For EVM this reads the live
 * nonce + fees from the RPC, signs a real EIP-1559 transaction with the unlocked
 * wallet, and calls `eth_sendRawTransaction` — a genuine on-chain broadcast (given a
 * funded address). The RPC URL is editable so a rate-limited/CORS-blocked public node
 * can be swapped for the user's own.
 */
import {
  BitcoinAdapter,
  EvmAdapter,
  HttpJsonRpcTransport,
  HttpRestTransport,
  ProviderPool,
  SolanaAdapter,
  assertBroadcastAllowed,
  checkSameRealism,
  checkEvmRecipient,
  assembleSolTransaction,
  extractSolSignableMessage,
  assessSimulatedSourceOutflow,
  SIM_NATIVE_SENTINEL,
  type SimCall,
  buildBtcTransfer,
  buildSolTransferMessage,
  buildSplTransferMessage,
  buildSwapSolForTokenMessage,
  buildSwapTokenForSolMessage,
  buildStakeSolMessage,
  buildUnstakeSolMessage,
  solammPdas,
  buildBridgeDepositMessage,
  decodeQuotedAmountOut,
  decodeUint,
  encodeAddressParam,
  encodeBalanceOf,
  encodeErc20Approve,
  encodeErc20Transfer,
  encodeExactInputSingle,
  encodeIntentExecute,
  encodeQuoteExactInputSingle,
  encodeUint256,
  intentHashOf,
  getChain,
  chainByEvmChainId,
  p2wpkhAddressFor,
  SEPOLIA_UNISWAP,
  V3_FEE_TIERS,
  type BroadcastGuardInput,
  type BtcSpendUtxo,
  type ChainId,
} from '@intent-wallet/chains';
import {
  btcPublicKey,
  currentIdentity,
  signBitcoinPsbt,
  signEvmTransaction,
  signSolanaMessage,
  solPublicKey,
  type Eip1559Transaction,
} from './wallet';
import { getNetworkMode } from './settings';
import { knownGoodAddresses } from './recents';

// Each default falls back to a public, keyless endpoint but can be overridden by
// a VITE_* env var (in a gitignored .env.local) to use your own keyed node.
/** A public Sepolia RPC that permits browser CORS. Override with your own for reliability. */
export const DEFAULT_SEPOLIA_RPC = import.meta.env.VITE_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
/** The Solana devnet RPC (public default; override with a keyed node for reliable sendTransaction). */
export const DEFAULT_DEVNET_RPC = import.meta.env.VITE_SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';
/** The Solana MAINNET RPC (the public node rate-limits + often blocks browser sendTransaction — set a
 *  keyed node, e.g. Helius, in VITE_SOLANA_MAINNET_RPC for real cross-chain swaps to broadcast). */
export const DEFAULT_SOLANA_MAINNET_RPC = import.meta.env.VITE_SOLANA_MAINNET_RPC || 'https://api.mainnet-beta.solana.com';
/** A Bitcoin testnet esplora REST API (public default). */
export const DEFAULT_BTC_TESTNET_REST = import.meta.env.VITE_BTC_TESTNET_REST || 'https://blockstream.info/testnet/api';
/** GIWA Sepolia RPC (Dunamu/Upbit OP Stack L2 testnet, chainId 91342). Override with your own keyed node. */
export const DEFAULT_GIWA_RPC = import.meta.env.VITE_GIWA_RPC || 'https://sepolia-rpc.giwa.io';
/** The deployed IntentExecutor contract on GIWA Sepolia (set via VITE_GIWA_INTENT_EXECUTOR after deploy).
 *  When present, GIWA-native sends route through it so the transfer is settled on-chain by the
 *  ownerless contract, which emits a verifiable IntentExecuted event. Empty ⇒ fall back to a plain send. */
export const GIWA_INTENT_EXECUTOR = (import.meta.env.VITE_GIWA_INTENT_EXECUTOR || '').trim();
/** Our SimpleAMM (constant-product DEX) on GIWA + its gUSDC token. ETH→USDC swap intents
 *  route through this on-chain pool when configured. */
export const GIWA_AMM = (import.meta.env.VITE_GIWA_AMM || '').trim();
export const GIWA_GUSDC = (import.meta.env.VITE_GIWA_GUSDC || '').trim();
/** Our SimpleStaking pools (native-ETH staking) — same bytecode on GIWA Sepolia and Ethereum
 *  Sepolia. "stake N ETH" intents settle on whichever chain the user is on. Empty ⇒ stake stays
 *  plan-level (honest "not executable" message) until the address is set after deploy. */
export const GIWA_STAKING = (import.meta.env.VITE_GIWA_STAKING || '').trim();
export const SEPOLIA_STAKING = (import.meta.env.VITE_SEPOLIA_STAKING || '').trim();
/** Our SimpleStaking program on Solana devnet (native-SOL staking). Set after `anchor deploy`.
 *  Empty ⇒ SOL staking stays plan-level. */
export const SOLANA_STAKING_PROGRAM = (import.meta.env.VITE_SOLANA_STAKING_PROGRAM || '').trim();
/** GIWA's canonical OP Stack L1StandardBridge on Ethereum Sepolia — deposits ETH from L1 to GIWA (L2). */
export const GIWA_L1_BRIDGE = (import.meta.env.VITE_GIWA_L1_BRIDGE || '0x77b2ffc0F57598cAe1DB76cb398059cF5d10A7E7').trim();

/** Our own constant-product SOL/dUSDC AMM on Solana devnet (the on-chain twin of the GIWA SimpleAMM).
 *  Public devnet addresses — safe as defaults; override with VITE_SOLAMM_* if you redeploy. */
export const SOLAMM_PROGRAM = (import.meta.env.VITE_SOLAMM_PROGRAM || '7BkheH6yhgDwoshMoG3rmWTaKJhez8JaLUUd14xLw2c7').trim();
export const SOLAMM_MINT = (import.meta.env.VITE_SOLAMM_MINT || '2Vm94k6FASm5UqBXWXwz3vCa7U3t67faDRyuXj2mLzEm').trim();
export const SOLAMM_DECIMALS = 6;
export const SOLAMM_TOKEN_SYMBOL = 'dUSDC';
/** An Ethereum MAINNET RPC (public, CORS-friendly default; override with your own keyed node).
 *  Only ever reached once the user has explicitly confirmed a real-funds mainnet broadcast. */
export const DEFAULT_ETHEREUM_RPC = import.meta.env.VITE_ETH_MAINNET_RPC || 'https://ethereum-rpc.publicnode.com';

/**
 * Optional caller confirmation for the mainnet guardrails. The wallet is testnet-only
 * today, so this is normally absent and the guard simply validates the recipient. It
 * is the escape hatch a future mainnet-confirm dialog fills in to authorize a real,
 * irreversible broadcast (and, above the spend cap, a high-value one).
 */
export interface GuardAck {
  acknowledgeMainnet?: boolean;
  acknowledgeHighValue?: boolean;
  /** The transfer's USD value, when known — enables the mainnet spend cap. */
  amountUsd?: number;
}

/** Build a guard input, threading only the acks that are actually set
 *  (exactOptionalPropertyTypes forbids explicit `undefined`). The user's saved contacts are
 *  attached as the known-good set so the guard can catch an ADDRESS-POISONING lookalike at the
 *  broadcast boundary (defense-in-depth behind the pre-sign Sentinel panel). */
function guardInput(chain: ChainId, toAddress: string, ack?: GuardAck): BroadcastGuardInput {
  const known = knownGoodAddresses(); // saved contacts + prior recipients (no manual saving needed)
  return {
    chain,
    toAddress,
    ...(known.length > 0 ? { knownAddresses: known } : {}),
    ...(ack?.amountUsd !== undefined ? { amountUsd: ack.amountUsd } : {}),
    ...(ack?.acknowledgeMainnet !== undefined ? { acknowledgeMainnet: ack.acknowledgeMainnet } : {}),
    ...(ack?.acknowledgeHighValue !== undefined ? { acknowledgeHighValue: ack.acknowledgeHighValue } : {}),
  };
}

/** Parse a decimal ETH string into exact wei (bigint, 18 decimals). Strict — see `decimalToBase`. */
export function parseEther(input: string): bigint {
  return BigInt(decimalToBase(input, 18));
}

function evmAdapter(chain: ChainId, rpcUrl: string): EvmAdapter {
  return new EvmAdapter(chain, new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]));
}

/** A swap's on-chain slippage floor MUST be positive — a zero/negative `amountOutMin` tells
 *  the pool "accept any output", removing slippage/MEV protection entirely. The UI always
 *  derives a positive floor from the live quote; this is a last-resort guard so no caller
 *  (present or future) can broadcast a swap with protection disabled. */
function assertPositiveMinOut(minOut: bigint): void {
  if (minOut <= 0n) throw new Error('slippage floor (amountOutMin) must be a positive amount');
}

/**
 * Session cumulative-drain assessment (PURE — no I/O, all bigint base units, no float).
 * The client-side mirror of the runtime's cumulative-drain guard: a wallet drain is often
 * executed as SEVERAL sub-threshold sends that each look harmless but together empty the
 * wallet. Given what has already left this session (`priorBase`), the pending amount, and the
 * known balance (`balanceBase`, or null when unknown), decide:
 *   - 'block' — the SESSION's cumulative outflow crosses the drain line (>= 90% of balance)
 *     AND something already left this session (priorBase > 0): the multi-send drain pattern.
 *   - 'warn'  — a single first send that is itself most of the wallet (visible to the user).
 *   - 'none'  — under the line, or balance unknown.
 * Over-counting is fail-safe: it can only make the guard stricter, never looser.
 */
export function assessSessionDrain(args: {
  priorBase: bigint;
  amountBase: bigint;
  balanceBase: bigint | null;
}): 'block' | 'warn' | 'none' {
  const { priorBase, amountBase, balanceBase } = args;
  if (balanceBase === null || balanceBase <= 0n) return 'none';
  if (amountBase < 0n || priorBase < 0n) return 'none';
  const cumulative = priorBase + amountBase;
  const drainLine = (balanceBase * 9n) / 10n; // 90% of the wallet
  if (cumulative < drainLine) return 'none';
  // Crossed the drain line: a cumulative crossing (funds already moved this session) is the
  // multi-send drain — block it. A first single large send is the user's own visible choice — warn.
  return priorBase > 0n ? 'block' : 'warn';
}

export interface EvmSendResult {
  txid: string;
  explorerUrl: string;
}

/**
 * FLOOR a base-unit integer to `dp` fractional digits (zero-padded to keep the fixed-width look) —
 * a displayed balance must never exceed what the wallet actually holds. `Number(base)/divisor` +
 * .toFixed() rounds HALF-UP, so 0.9999995 ETH would show as "1.000000"; that overstated string is
 * also re-parsed into the cumulative-drain guard, nudging its cap looser. Working on the bigint
 * string avoids both the round-up and any float precision loss on large balances.
 */
export function floorUnitsToDp(base: bigint, decimals: number, dp: number): string {
  const neg = base < 0n;
  const digits = (neg ? -base : base).toString().padStart(decimals + 1, '0');
  const intPart = digits.slice(0, digits.length - decimals);
  const frac = (decimals > 0 ? digits.slice(digits.length - decimals) : '').slice(0, dp).padEnd(dp, '0');
  const s = dp > 0 ? `${intPart}.${frac}` : intPart;
  return neg ? `-${s}` : s;
}

/** The unlocked wallet's live native balance on the testnet, as a decimal string. */
export async function getEvmTestnetBalance(chain: ChainId = 'sepolia', rpcUrl = DEFAULT_SEPOLIA_RPC): Promise<string> {
  const me = currentIdentity();
  if (!me) return '0';
  const wei = await evmAdapter(chain, rpcUrl).getNativeBalance(me.evm.address);
  return floorUnitsToDp(BigInt(wei), 18, 6);
}

/**
 * Broadcast a REAL native transfer on an EVM testnet from the unlocked wallet:
 * live nonce + fees from the RPC → sign the EIP-1559 tx in-browser → send the raw
 * bytes → return the txid + explorer link. Throws the node's real error (e.g.
 * "insufficient funds") if the address isn't funded — which itself proves the path
 * reached the actual chain.
 */
export async function sendEvmTransfer(opts: {
  chain?: ChainId;
  rpcUrl?: string;
  to: string;
  ethAmount: string;
  guard?: GuardAck;
}): Promise<EvmSendResult> {
  const chain = opts.chain ?? 'sepolia';
  // Default the node from the CHAIN, not always Sepolia — else a caller passing chain:'giwa-sepolia'
  // with no rpcUrl would sign a GIWA (91342) tx and fire it at the Sepolia node (wrong-chain reject).
  const rpcUrl = opts.rpcUrl?.trim() || (chain === 'giwa-sepolia' ? DEFAULT_GIWA_RPC : DEFAULT_SEPOLIA_RPC);
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertBroadcastAllowed(guardInput(chain, opts.to.trim(), opts.guard));

  const info = getChain(chain);
  if (info.evmChainId === undefined) throw new Error(`${chain} is not an EVM chain`);

  const adapter = evmAdapter(chain, rpcUrl);
  const to = opts.to.trim();
  const value = parseEther(opts.ethAmount);
  const [nonce, fees] = await Promise.all([adapter.getNonce(me.evm.address), adapter.estimateFees('normal')]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');

  // 21_000 is the base cost only when the recipient is an EOA. A CONTRACT recipient (a Safe,
  // an exchange deposit address, any address with a receive()/fallback) executes code on
  // receipt and needs more — a fixed 21k would guarantee an out-of-gas revert that burns the
  // fee and moves nothing. Estimate + 20% headroom; fall back to the 21k EOA floor only when
  // the call can't be simulated (e.g. insufficient balance), letting the node be the arbiter.
  let gasLimit = 21_000n;
  try {
    gasLimit = ((await adapter.estimateGas({ from: me.evm.address, to, value })) * 12n) / 10n;
  } catch {
    /* keep the 21k EOA floor */
  }

  const tx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit,
    to,
    value,
  };
  const signed = signEvmTransaction(tx); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(signed.raw);
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

/**
 * Execute a native-ETH intent THROUGH the on-chain IntentExecutor on GIWA Sepolia:
 * the AI plans {to, amount}; this calls `execute(intentHash, [{to, amount}])` with
 * value = amount, so the transfer is settled by the OWNERLESS contract (not a plain
 * send) and emits a verifiable IntentExecuted event binding the plan hash to the result.
 * Returns the txid + GIWA explorer link. Requires VITE_GIWA_INTENT_EXECUTOR to be set.
 */
export async function executeIntentOnGiwa(opts: { rpcUrl?: string; to: string; ethAmount: string; guard?: GuardAck }): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  if (!GIWA_INTENT_EXECUTOR) throw new Error('IntentExecutor address not configured (set VITE_GIWA_INTENT_EXECUTOR).');
  const info = getChain('giwa-sepolia');
  if (info.evmChainId === undefined) throw new Error('giwa-sepolia is not an EVM chain');
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_GIWA_RPC;
  const to = opts.to.trim();
  // Guard on the final beneficiary (a testnet address here — the contract is only the router).
  assertBroadcastAllowed(guardInput('giwa-sepolia', to, opts.guard));

  const amount = parseEther(opts.ethAmount);
  const intentHash = intentHashOf(`giwa:transfer:${to.toLowerCase()}:${amount.toString()}`);
  const data = encodeIntentExecute(intentHash, [{ to, amount }]);

  const adapter = evmAdapter('giwa-sepolia', rpcUrl);
  const [nonce, fees] = await Promise.all([adapter.getNonce(me.evm.address), adapter.estimateFees('normal')]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');

  // The executor FORWARDS the value to an ARBITRARY beneficiary `to`; a contract recipient's
  // receive()/fallback can push the cost past a fixed 150k → out-of-gas revert (fee burned,
  // nothing moved). Estimate the whole call + 20% headroom; fall back to 150k if it can't be
  // simulated (e.g. insufficient balance), letting the node arbitrate.
  let gasLimit = 150_000n;
  try {
    gasLimit = ((await adapter.estimateGas({ from: me.evm.address, to: GIWA_INTENT_EXECUTOR, data, value: amount })) * 12n) / 10n;
  } catch {
    /* keep the 150k fallback */
  }

  const tx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit,
    to: GIWA_INTENT_EXECUTOR,
    value: amount,
    data,
  };
  const signed = signEvmTransaction(tx); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(signed.raw);
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

// ── GIWA swap: our on-chain SimpleAMM (ETH ⇄ gUSDC) ──────────────────────────

const AMM_SWAP_ETH_FOR_TOKEN = '0x104ca909'; // swapEthForToken(uint256 minOut)
const AMM_QUOTE_ETH_FOR_TOKEN = '0x8ca667be'; // quoteEthForToken(uint256 ethIn)
const AMM_SWAP_TOKEN_FOR_ETH = '0xf5f35d14'; // swapTokenForEth(uint256 tokenIn, uint256 minOut)
const AMM_RESERVE_ETH = '0x899b1528'; // reserveEth()
const AMM_RESERVE_TOKEN = '0xf4325d67'; // reserveToken()

/** A live ETH→gUSDC quote from the GIWA AMM (eth_call quoteEthForToken). Null if unconfigured. */
export async function quoteGiwaSwap(ethAmountBase: string, rpcUrl = DEFAULT_GIWA_RPC): Promise<SwapQuote | null> {
  if (!GIWA_AMM) return null;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const data = `${AMM_QUOTE_ETH_FOR_TOKEN}${encodeUint256(BigInt(ethAmountBase))}`;
  const res = await pool.request<string>('eth_call', [{ to: GIWA_AMM, data }, 'latest']);
  const out = res && res !== '0x' ? BigInt(res) : 0n;
  if (out <= 0n) return null;
  return { amountOut: out, decimalsOut: 6, symbolOut: 'gUSDC', fee: 3000 };
}

/**
 * Execute a REAL ETH→gUSDC swap on our GIWA SimpleAMM: call swapEthForToken(minOut) with
 * value = amountIn, signed in-browser. `amountOutMin` is a hard on-chain floor — the pool
 * reverts rather than delivering less, so slippage can never silently cost the user.
 */
export async function swapEthForGusdcOnGiwa(opts: {
  ethAmountBase: string;
  amountOutMin: bigint;
  rpcUrl?: string;
  guard?: GuardAck;
}): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertPositiveMinOut(opts.amountOutMin);
  if (!GIWA_AMM) throw new Error('GIWA AMM address not configured (set VITE_GIWA_AMM).');
  const info = getChain('giwa-sepolia');
  if (info.evmChainId === undefined) throw new Error('giwa-sepolia is not an EVM chain');
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_GIWA_RPC;
  assertBroadcastAllowed(guardInput('giwa-sepolia', GIWA_AMM, opts.guard));

  const value = BigInt(opts.ethAmountBase);
  const data = `${AMM_SWAP_ETH_FOR_TOKEN}${encodeUint256(opts.amountOutMin)}`;
  const adapter = evmAdapter('giwa-sepolia', rpcUrl);
  const [nonce, fees] = await Promise.all([adapter.getNonce(me.evm.address), adapter.estimateFees('normal')]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');

  const tx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit: 150_000n, // single swap: SLOAD reserves + transfer + event; 150k ample
    to: GIWA_AMM,
    value,
    data,
  };
  const signed = signEvmTransaction(tx); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(signed.raw);
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

/** A live gUSDC→ETH quote from the GIWA AMM (reads reserves, applies the x·y=k + 0.3% fee). */
export async function quoteGiwaSwapTokenForEth(tokenAmountBase: string, rpcUrl = DEFAULT_GIWA_RPC): Promise<SwapQuote | null> {
  if (!GIWA_AMM) return null;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const [reRes, rtRes] = await Promise.all([
    pool.request<string>('eth_call', [{ to: GIWA_AMM, data: AMM_RESERVE_ETH }, 'latest']),
    pool.request<string>('eth_call', [{ to: GIWA_AMM, data: AMM_RESERVE_TOKEN }, 'latest']),
  ]);
  const reserveEth = reRes && reRes !== '0x' ? BigInt(reRes) : 0n;
  const reserveToken = rtRes && rtRes !== '0x' ? BigInt(rtRes) : 0n;
  const amountIn = BigInt(tokenAmountBase);
  if (reserveEth === 0n || reserveToken === 0n || amountIn === 0n) return null;
  // token in → ETH out: reserveIn = token, reserveOut = eth.
  const withFee = amountIn * 997n;
  const out = (withFee * reserveEth) / (reserveToken * 1000n + withFee);
  if (out <= 0n) return null;
  return { amountOut: out, decimalsOut: 18, symbolOut: 'ETH', fee: 3000 };
}

/**
 * Execute a REAL gUSDC→ETH swap on our GIWA AMM: approve gUSDC to the pool (only if the
 * allowance is short — and WAIT for that receipt), then swapTokenForEth(tokenIn, minOut).
 * Signed in-browser; `amountOutMin` is the on-chain slippage floor.
 */
export async function swapGusdcForEthOnGiwa(opts: {
  tokenAmountBase: string;
  amountOutMin: bigint;
  rpcUrl?: string;
  guard?: GuardAck;
}): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertPositiveMinOut(opts.amountOutMin);
  if (!GIWA_AMM || !GIWA_GUSDC) throw new Error('GIWA AMM / gUSDC not configured.');
  const info = getChain('giwa-sepolia');
  if (info.evmChainId === undefined) throw new Error('giwa-sepolia is not an EVM chain');
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_GIWA_RPC;
  assertBroadcastAllowed(guardInput('giwa-sepolia', GIWA_AMM, opts.guard));

  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new EvmAdapter('giwa-sepolia', pool);
  const tokenIn = BigInt(opts.tokenAmountBase);

  const [nonce0, fees, allowance] = await Promise.all([
    adapter.getNonce(me.evm.address),
    adapter.estimateFees('normal'),
    readAllowance(pool, GIWA_GUSDC, me.evm.address, GIWA_AMM),
  ]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');
  let gasPrice = { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };
  let nonce = nonce0;

  // 1) approve gUSDC → AMM if the allowance is short, then WAIT for it to confirm.
  if (allowance < tokenIn) {
    const approveTx: Eip1559Transaction = {
      chainId: info.evmChainId,
      nonce,
      ...gasPrice,
      gasLimit: 60_000n,
      to: GIWA_GUSDC,
      value: 0n,
      data: encodeErc20Approve(GIWA_AMM, tokenIn),
    };
    const approve = await adapter.broadcastRawTransaction(signEvmTransaction(approveTx).raw);
    await waitForReceipt(pool, approve.txid); // throws on revert/timeout — swap won't fire
    nonce = nonce + 1n;
    // The approval wait can run up to ~90s; fees may have moved. Re-estimate so the swap
    // isn't broadcast at a now-underpriced fee and left stuck behind the confirmed approval.
    const fresh = await adapter.estimateFees('normal');
    if (fresh.kind === 'evm') gasPrice = { maxFeePerGas: fresh.maxFeePerGas, maxPriorityFeePerGas: fresh.maxPriorityFeePerGas };
  }

  // 2) swapTokenForEth(tokenIn, minOut).
  const data = `${AMM_SWAP_TOKEN_FOR_ETH}${encodeUint256(tokenIn)}${encodeUint256(opts.amountOutMin)}`;
  const swapTx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce,
    ...gasPrice,
    gasLimit: 150_000n,
    to: GIWA_AMM,
    value: 0n,
    data,
  };
  const { txid } = await adapter.broadcastRawTransaction(signEvmTransaction(swapTx).raw);
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

/** The result of a two-leg compound: the swap tx, the follow-on send tx, and the exact
 *  base-unit amount that was forwarded (what actually landed from the swap). */
// ── Cross-chain swap execution (aggregator route) ─────────────────────────────
// Sign + broadcast the WINNING quote's transaction from the cross-chain-swap aggregator (LI.FI, …),
// ON-DEVICE. The aggregator BUILDS the route/tx; deterministic guardrails VERIFY it; the user's device
// SIGNATURE disposes — the doctrine, applied to the highest-stakes flow in the wallet (mainnet, real
// funds, cross-chain). Non-custodial: the key never leaves the browser. Exact-amount approval (never
// unlimited). Fail-closed on an unknown chain.
//
// ⚠️ Real mainnet value. Reviewed in docs/security/crosschain-swap-security-review.md: gated behind the
// mainnet-ack + spend-cap guard, EXACT ERC-20 approval (F4), and a native-value bound (F2, below) so a
// hostile route can't sign away far more than quoted; driven only from an explicit UI ack (never auto).
// Residual F1: the route calldata is opaque, so the recipient isn't deterministically verified —
// transaction SIMULATION is the required gate before unattended real-fund GA.
export interface CrossChainSwapExecInput {
  /** LI.FI-style numeric source chain id (mapped to our ChainId via the registry). */
  evmChainId: number;
  /** The route transaction the aggregator returned: target (its router), calldata, native value, gas. */
  to: string;
  data: string;
  value: string; // hex or decimal wei
  gasLimit?: string; // hex or decimal
  /** ERC-20 source: the token to approve + the router to approve it to (absent for a native-asset source). */
  fromTokenAddress?: string;
  approvalSpender?: string;
  /** The exact input amount to approve (base units) — approval is EXACT, never unlimited. */
  approvalAmountBase: string;
  /** The route's USD value, for the mainnet spend-cap guard. */
  amountUsd?: number;
  rpcUrl?: string;
  guard?: GuardAck;
}

// Pre-broadcast SIMULATION gate for a NATIVE-source route (eth_simulateV1). Runs the exact route tx against
// live chain state with the user's native balance overridden (so it works before the wallet is funded),
// traces transfers, and asserts the simulated EFFECT via assessSimulatedSourceOutflow: no revert, ONLY the
// source asset leaves, within bound — catching a hostile route that reverts or drains a different (pre-
// approved) asset, which the opaque calldata alone hides. Fail-CLOSED on a definitive bad verdict; fail-SOFT
// (log + proceed) only when the node can't simulate at all, since the mainnet-ack + spend cap + native-value
// bound + exact approval still bind (defense-in-depth). See the security review (F1/F2).
async function simulateEvmNativeSourceEffect(pool: ProviderPool, opts: { from: string; to: string; value: bigint; data: string }): Promise<void> {
  const overrideBalance = `0x${(opts.value + 2n * 10n ** 18n).toString(16)}`; // value + generous gas headroom
  const payload = {
    blockStateCalls: [
      {
        stateOverrides: { [opts.from.toLowerCase()]: { balance: overrideBalance } },
        calls: [{ from: opts.from, to: opts.to, value: `0x${opts.value.toString(16)}`, data: opts.data }],
      },
    ],
    traceTransfers: true,
  };
  let calls: readonly SimCall[];
  try {
    const res = await pool.request<Array<{ calls?: SimCall[] }>>('eth_simulateV1', [payload, 'latest']);
    calls = res?.[0]?.calls ?? [];
    if (calls.length === 0) return; // unexpected shape — degrade to the other guards, never false-block
  } catch (e) {
    console.warn('[crosschain] eth_simulateV1 unavailable — proceeding on the other guards', e);
    return; // an infra failure is not a verdict; the other deterministic guards still bind
  }
  const verdict = assessSimulatedSourceOutflow(calls, { from: opts.from, sourceAsset: SIM_NATIVE_SENTINEL, maxSourceOutBase: opts.value });
  if (!verdict.ok) throw new Error(`Simulation refused this route: ${verdict.reason}`);
}

export async function executeCrossChainSwapEvm(opts: CrossChainSwapExecInput): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  const info = chainByEvmChainId(opts.evmChainId);
  if (!info || info.evmChainId === undefined) throw new Error(`unsupported/unknown EVM chain id ${opts.evmChainId}`);
  const chain = info.id;
  const rpcUrl = opts.rpcUrl ?? info.defaultRpcUrls[0];
  if (!rpcUrl) throw new Error(`no RPC configured for ${chain}`);

  // Guardrails BEFORE any signing: mainnet acknowledgment + spend cap (via guard.amountUsd) + recipient
  // checksum + address-poisoning check. Fail-closed — nothing is signed if the guard blocks.
  assertBroadcastAllowed(guardInput(chain, opts.to, opts.guard));

  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new EvmAdapter(chain, pool);
  const [nonce0, fees] = await Promise.all([adapter.getNonce(me.evm.address), adapter.estimateFees('normal')]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');
  let gasPrice = { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };
  let nonce = nonce0;

  // 1) ERC-20 source → approve EXACTLY the input amount to the aggregator's router if the allowance is
  //    short, then WAIT for that receipt (revert throws → the swap never fires). Never an unlimited approval.
  if (opts.fromTokenAddress && opts.approvalSpender) {
    const amount = BigInt(opts.approvalAmountBase);
    const allowance = await readAllowance(pool, opts.fromTokenAddress, me.evm.address, opts.approvalSpender);
    if (allowance < amount) {
      const approveTx: Eip1559Transaction = {
        chainId: info.evmChainId,
        nonce,
        ...gasPrice,
        gasLimit: 80_000n,
        to: opts.fromTokenAddress,
        value: 0n,
        data: encodeErc20Approve(opts.approvalSpender, amount),
      };
      const approve = await adapter.broadcastRawTransaction(signEvmTransaction(approveTx).raw);
      await waitForReceipt(pool, approve.txid);
      nonce = nonce + 1n;
      const fresh = await adapter.estimateFees('normal'); // approval can take a while; re-price the swap
      if (fresh.kind === 'evm') gasPrice = { maxFeePerGas: fresh.maxFeePerGas, maxPriorityFeePerGas: fresh.maxPriorityFeePerGas };
    }
  }

  // 2) The aggregator's swap transaction — we only SIGN (on-device) + broadcast what it built.
  const value = BigInt(opts.value || '0');
  // SECURITY (defense-in-depth for the opaque aggregator tx): for a NATIVE source the tx.value IS the funds
  // being spent, and the guard can't parse the route calldata. Bound value to a generous multiple of the
  // input the user reviewed, so a malicious/compromised route response can't get a far larger native amount
  // signed than was quoted. (An ERC-20 source moves funds via the EXACT approval above, not tx.value — there
  // value is only the small native fee — so this native bound is for native sources only.) Fail-closed.
  if (!opts.fromTokenAddress) {
    const intended = BigInt(opts.approvalAmountBase || '0');
    // Fail CLOSED: a native source's tx.value IS the funds spent, so we MUST have the reviewed input amount
    // to bound it against. Without a positive `intended` the 4× check below is inert — we could not tell an
    // inflated value from a legitimate one — so refuse rather than sign an UNBOUNDED native amount from an
    // opaque route. (Guard doctrine: block what we can't positively verify. The shipping caller always
    // supplies approvalAmountBase, so this is defense-in-depth against a future/again caller that doesn't.)
    if (value > 0n && intended <= 0n) {
      throw new Error('Cannot verify this route: the native input amount to bound its value against is missing. Re-quote and try again — nothing was signed.');
    }
    if (intended > 0n && value > intended * 4n) {
      throw new Error("Refusing this route: its native value is more than 4× the amount you entered — the provider transaction doesn't match your quote. Re-quote and try again.");
    }
    // Deterministic SIMULATION gate: assert the route's simulated on-chain effect before we sign it.
    await simulateEvmNativeSourceEffect(pool, { from: me.evm.address, to: opts.to, value, data: opts.data });
  }
  let gasLimit = opts.gasLimit ? (BigInt(opts.gasLimit) * 12n) / 10n : 0n;
  if (gasLimit <= 0n) {
    try {
      gasLimit = ((await adapter.estimateGas({ from: me.evm.address, to: opts.to, data: opts.data, value })) * 12n) / 10n;
    } catch {
      gasLimit = 500_000n; // conservative fallback for a complex aggregator route
    }
  }
  const swapTx: Eip1559Transaction = { chainId: info.evmChainId, nonce, ...gasPrice, gasLimit, to: opts.to, value, data: opts.data };
  const { txid } = await adapter.broadcastRawTransaction(signEvmTransaction(swapTx).raw); // in-browser, user's key
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

export interface CrossChainSwapSolanaExecInput {
  /** The aggregator's Solana route transaction: a base64-serialized, UNSIGNED single-signer transaction
   *  whose fee payer is THIS wallet (the aggregator built it against the wallet's `fromAddress`). */
  data: string;
  /** The route's USD value, for the mainnet spend-cap guard. */
  amountUsd?: number;
  rpcUrl?: string;
  guard?: GuardAck;
}

// The SOLANA sibling of executeCrossChainSwapEvm: sign + broadcast the winning cross-chain-swap route
// when the SOURCE chain is Solana (LI.FI routes SOL/SPL → any chain via Mayan etc.). The aggregator
// BUILDS the unsigned Solana tx; deterministic guardrails VERIFY; the device SIGNATURE disposes — same
// doctrine as the EVM path. Non-custodial: the ed25519 key never leaves the browser. Fail-closed: a
// multi-signer route (we hold only the fee payer key) is refused inside extractSolSignableMessage.
//
// ⚠️ Real mainnet value. Gated behind the mainnet-ack + spend-cap guard and only ever run from an explicit,
// informed UI confirmation (never auto). Reviewed in docs/security/crosschain-swap-security-review.md
// (finding F3): the Solana tx is opaque, so the amount isn't deterministically bounded — preflight
// SIMULATION is the required gate before unattended real-fund GA; the multi-signer refusal is fail-closed.
export async function executeCrossChainSwapSolana(opts: CrossChainSwapSolanaExecInput): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');

  // Guardrails BEFORE signing: mainnet acknowledgment + spend cap. The recipient is embedded in the
  // aggregator's opaque tx, so we guard on the wallet's OWN Solana address (a known, non-empty value) —
  // the mainnet-ack + $1,000 cap still bind; a base58 Solana address is not EIP-55 so the checksum branch
  // is a no-op. Fail-closed — nothing is signed if the guard blocks.
  const ack: GuardAck = { ...(opts.guard ?? {}), ...(opts.amountUsd !== undefined ? { amountUsd: opts.amountUsd } : {}) };
  assertBroadcastAllowed(guardInput('solana', me.sol.address, ack));

  // The aggregator returns a fully-built, UNSIGNED Solana tx (fee payer = this wallet). Extract the
  // signable message (refuses any multi-signer route), sign it ON-DEVICE, reassemble, broadcast. We do
  // NOT rebuild the message or re-fetch a blockhash — the aggregator's route is signed exactly as built
  // (a stale blockhash simply fails the broadcast, prompting a re-quote; funds never move on failure).
  const message = extractSolSignableMessage(opts.data);
  const sig = signSolanaMessage(message); // in-browser, with the user's key
  const signedTx = assembleSolTransaction(message, sig);
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_SOLANA_MAINNET_RPC;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new SolanaAdapter('solana', pool);

  // Pre-broadcast SIMULATION gate: preflight the signed tx and REFUSE if it would fail on-chain — a hostile
  // or malformed route must never reach the wire. replaceRecentBlockhash tolerates a slightly stale hash;
  // sigVerify:false because we only need the instructions' outcome. Fail-CLOSED on a definitive on-chain
  // error; fail-SOFT only when the node itself can't simulate (the mainnet-ack + spend cap + multi-signer
  // refusal still bind). See the security review (F3).
  let simRan = false;
  let simErr: unknown;
  try {
    const sim = await pool.request<{ value?: { err?: unknown } }>('simulateTransaction', [
      signedTx,
      { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed' },
    ]);
    simRan = true;
    simErr = sim?.value?.err;
  } catch (e) {
    console.warn('[crosschain] Solana simulateTransaction unavailable — proceeding on the other guards', e);
  }
  if (simRan && simErr != null) {
    const raw = JSON.stringify(simErr);
    // The overwhelmingly common cause on a fresh wallet is that it isn't funded — a Solana account only
    // exists on-chain once it holds a balance, so the fee payer (or a required token account) is missing.
    // Say that plainly + actionably; "AccountNotFound / re-quote" is neither. Other failures stay generic.
    const unfunded = /AccountNotFound|InsufficientFundsForRent|insufficient (lamports|funds)/iu.test(raw);
    throw new Error(
      unfunded
        ? `This swap can't go through — your Solana wallet isn't funded on mainnet (no SOL to swap, or to pay the fee / open the token account). Fund ${me.sol.address} with SOL, then try again.`
        : `Simulation refused this route — it would fail on-chain (${raw}). Re-quote and try again.`,
    );
  }

  const { txid } = await adapter.broadcastRawTransaction(signedTx);
  return { txid, explorerUrl: `https://explorer.solana.com/tx/${txid}` };
}

/**
 * Thrown when a compound convert-and-send's SWAP leg SETTLED on-chain but the forward (send) leg then
 * failed. Carries the completed swap so the caller persists it and NEVER re-runs the (irreversible)
 * swap on a manual retry — the converted funds are already in the user's wallet.
 */
export class SwapSendPartialError extends Error {
  readonly swap: EvmSendResult;
  readonly reason: string;
  constructor(swap: EvmSendResult, reason: string) {
    super(`Converted, but forwarding to the recipient failed: ${reason}`);
    this.name = 'SwapSendPartialError';
    this.swap = swap;
    this.reason = reason;
  }
}

export interface SwapAndSendResult {
  swap: EvmSendResult;
  send: EvmSendResult;
  receivedBase: string;
  /** The OUTPUT asset the recipient actually received — the UI must render THIS, not a hardcoded
   *  'gUSDC'. Routes output ETH (18) / SOL (9) / gUSDC·dUSDC (6) on GIWA or Solana devnet. */
  outSymbol: string;
  outDecimals: number;
  chainLabel: string;
}

/**
 * Execute a REAL compound "convert ETH → gUSDC and send to <recipient>" wholly on GIWA:
 *   1. swap ETH → gUSDC on the SimpleAMM (in-browser signature, on-chain slippage floor),
 *   2. WAIT for that swap's receipt (a revert throws — the send never fires on a failed swap),
 *   3. measure the EXACT gUSDC delta the swap delivered (balanceAfter − balanceBefore — gas is
 *      paid in ETH, so the gUSDC delta is precisely the swap output, never sweeping prior gUSDC),
 *   4. transfer that exact amount to the recipient (a second in-browser signature).
 * Both legs settle on GIWA Sepolia. The recipient passes the pre-sign Sentinel guard on its OWN
 * leg (checksum / burn / cap), so a mistyped destination is stopped before the send is signed.
 */
export async function swapEthThenSendGusdcOnGiwa(opts: {
  ethAmountBase: string;
  amountOutMin: bigint;
  recipient: string;
  rpcUrl?: string;
  guard?: GuardAck;
}): Promise<SwapAndSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  if (!GIWA_AMM || !GIWA_GUSDC) throw new Error('GIWA AMM / gUSDC not configured.');
  const recipient = opts.recipient.trim();
  const info = getChain('giwa-sepolia');
  if (info.evmChainId === undefined) throw new Error('giwa-sepolia is not an EVM chain');
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_GIWA_RPC;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);

  const balOfGusdc = async (): Promise<bigint> => {
    const res = await pool.request<string>('eth_call', [{ to: GIWA_GUSDC, data: encodeBalanceOf(me.evm.address) }, 'latest']);
    return res && res !== '0x' ? decodeUint(res) : 0n;
  };

  // Leg 1 — swap ETH → gUSDC (guards the AMM), then WAIT so the received gUSDC is on-chain.
  const before = await balOfGusdc();
  const swap = await swapEthForGusdcOnGiwa({
    ethAmountBase: opts.ethAmountBase,
    amountOutMin: opts.amountOutMin,
    rpcUrl,
    ...(opts.guard ? { guard: opts.guard } : {}),
  });
  // WAIT so the received gUSDC is on-chain before forwarding. Distinguish the two failure modes: a
  // REVERT means nothing settled → propagate a plain error (safe to retry). A TIMEOUT means the swap
  // was broadcast but couldn't be confirmed in ~90s → treat as a partial so the caller never re-swaps.
  try {
    await waitForReceipt(pool, swap.txid, 45, 2_000, 'swap');
  } catch (e) {
    if (e instanceof Error && /reverted on-chain/u.test(e.message)) throw e;
    throw new SwapSendPartialError(swap, e instanceof Error ? e.message : 'swap not confirmed');
  }

  const received = (await balOfGusdc()) - before;
  if (received <= 0n) throw new SwapSendPartialError(swap, 'swap confirmed but no gUSDC arrived — nothing forwarded'); // swap settled

  // Leg 2 — send the EXACT gUSDC received to the recipient. The recipient (not the AMM) is what
  // the Sentinel guard checks here: a mistyped/dead destination is stopped before this is signed.
  // The swap has ALREADY settled, so a leg-2 failure surfaces a SwapSendPartialError (never a plain
  // throw) — the caller must not re-run the irreversible swap on retry; the funds are in the wallet.
  let send: EvmSendResult;
  try {
    assertBroadcastAllowed(guardInput('giwa-sepolia', recipient, opts.guard));
    const adapter = evmAdapter('giwa-sepolia', rpcUrl);
    const data = encodeErc20Transfer(recipient, received);
    const [nonce, fees] = await Promise.all([adapter.getNonce(me.evm.address), adapter.estimateFees('normal')]);
    if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');
    let gasLimit = 100_000n;
    try {
      gasLimit = ((await adapter.estimateGas({ from: me.evm.address, to: GIWA_GUSDC, data })) * 12n) / 10n;
    } catch {
      /* keep the fallback and let the node be the final arbiter */
    }
    const sendTx: Eip1559Transaction = {
      chainId: info.evmChainId,
      nonce,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      gasLimit,
      to: GIWA_GUSDC,
      value: 0n,
      data,
    };
    const sent = await adapter.broadcastRawTransaction(signEvmTransaction(sendTx).raw);
    send = { txid: sent.txid, explorerUrl: `${info.explorerUrl}/tx/${sent.txid}` };
  } catch (e) {
    throw new SwapSendPartialError(swap, e instanceof Error ? e.message : 'forwarding failed');
  }
  return { swap, send, receivedBase: received.toString(), outSymbol: 'gUSDC', outDecimals: 6, chainLabel: 'GIWA Sepolia' };
}

// ── Generic swap-and-send: two real legs, one chain, every wired pair ─────────

/** The in-browser venues that can settle BOTH legs of a swap-and-send on a single chain. */
export type SwapSendVenue = 'giwa' | 'solamm';

/** On GIWA the AMM's quote asset is gUSDC; the planner names it either gUSDC or USDC. */
const GIWA_STABLES = new Set(['GUSDC', 'USDC']);

/**
 * Which venue can settle a swap-and-send of `fromSym → toSym` for a plan on `chainId` — or null,
 * in which case the plan stays plan-level and NOTHING is signed.
 *
 * Keyed on the PLANNER's own chainId, so the executor can never settle on a chain the plan didn't
 * choose. Sepolia's Uniswap pools are deliberately absent: the planner routes every EVM pair it
 * produces to GIWA (verified against the live service), so a Sepolia branch here would be
 * unreachable code dressed up as a feature.
 *
 * Both legs always land on ONE chain. This wallet has no cross-chain route — the bridge is
 * Sepolia→GIWA ETH only — so e.g. gUSDC (GIWA) → SOL (Solana) is correctly refused here.
 */
export function swapSendVenue(chainId: string, fromSym: string, toSym: string): SwapSendVenue | null {
  const a = fromSym.toUpperCase();
  const b = toSym.toUpperCase();
  if (a === b) return null;
  if (chainId === 'eip155:91342') {
    if (!GIWA_AMM || !GIWA_GUSDC) return null;
    if (a === 'ETH' && GIWA_STABLES.has(b)) return 'giwa';
    if (GIWA_STABLES.has(a) && b === 'ETH') return 'giwa';
    return null;
  }
  if (chainId.startsWith('solana:') && SOLAMM_PROGRAM && isSolammPair(a, b)) return 'solamm';
  return null;
}

/**
 * Poll `getSignatureStatuses` until a Solana tx is confirmed — the Solana mirror of
 * `waitForReceipt`. Throws when the cluster reports an error, so leg 2 can never fire on a swap
 * that actually failed.
 */
async function waitForSolConfirmed(pool: ProviderPool, sig: string, attempts = 45, delayMs = 2_000): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await pool.request<{ value: Array<{ confirmationStatus?: string; err?: unknown } | null> }>('getSignatureStatuses', [
        [sig],
        { searchTransactionHistory: true },
      ]);
      const st = r?.value?.[0];
      if (st) {
        if (st.err) throw new Error('the swap failed on-chain — nothing was sent');
        if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') return;
      }
    } catch (e) {
      // Mirror waitForReceipt: a DEFINITIVE on-chain failure still throws, but a transient transport
      // error (RPC 429 / timeout) must not abort the wait — otherwise a settled swap surfaces a plain
      // error and the compound becomes retryable → a double-swap. Keep polling unless it's an on-chain fail.
      if (e instanceof Error && /failed on-chain/u.test(e.message)) throw e;
    }
    await new Promise((res) => setTimeout(res, delayMs));
  }
  throw new Error('the swap was not confirmed in time — nothing was sent');
}

/** The owner's total balance of one SPL mint, summed across its token accounts (base units). */
async function splBalanceOf(pool: ProviderPool, owner: string, mint: string): Promise<bigint> {
  const r = await pool.request<{ value: Array<{ account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }> }>(
    'getTokenAccountsByOwner',
    [owner, { mint }, { encoding: 'jsonParsed' }],
  );
  // Defensive against an unexpected RPC shape: validate the numeric string before BigInt() and skip a
  // malformed account rather than throwing — this reader is called AFTER an irreversible swap settles
  // (swapThenSend), where a raw throw could look retryable to the caller and trigger a re-swap.
  return (r?.value ?? []).reduce((sum, acc) => {
    const amt = acc?.account?.data?.parsed?.info?.tokenAmount?.amount;
    return typeof amt === 'string' && /^\d+$/u.test(amt) ? sum + BigInt(amt) : sum;
  }, 0n);
}

/**
 * Execute a swap-and-send as TWO REAL legs on ONE chain, for any pair `swapSendVenue` accepts.
 *
 * The safety shape is identical at every venue, and that shape is the whole point:
 *   1. read the output balance BEFORE (token outputs only),
 *   2. swap, then WAIT for confirmation — a reverted or timed-out swap throws, and leg 2 never fires,
 *   3. decide exactly how much to forward (below),
 *   4. re-run the Sentinel guard against the RECIPIENT — leg 1 only ever guarded the pool — then send.
 *
 * How much gets forwarded:
 *   • token output  → the EXACT measured delta, so the recipient receives everything the swap made.
 *   • native output → `amountOutMin`, the swap's own on-chain floor. A native balance also pays gas,
 *     so a measured delta would under-report by the fee; forwarding the guaranteed floor can never
 *     overdraw, and any positive slippage simply stays in the user's wallet.
 */
export async function swapThenSend(opts: {
  chainId: string;
  fromSym: string;
  toSym: string;
  amountInBase: string;
  amountOutMin: bigint;
  recipient: string;
  guard?: GuardAck;
}): Promise<SwapAndSendResult> {
  const venue = swapSendVenue(opts.chainId, opts.fromSym, opts.toSym);
  if (!venue) {
    throw new Error(`No in-browser pool can settle ${opts.fromSym} → ${opts.toSym} on ${opts.chainId}. Nothing was signed or sent.`);
  }
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertPositiveMinOut(opts.amountOutMin);
  const recipient = opts.recipient.trim();
  const ack = opts.guard ? { guard: opts.guard } : {};

  if (venue === 'giwa') {
    // ETH → gUSDC already has a dedicated implementation that has settled on-chain; reuse it.
    if (opts.fromSym.toUpperCase() === 'ETH') {
      return swapEthThenSendGusdcOnGiwa({ ethAmountBase: opts.amountInBase, amountOutMin: opts.amountOutMin, recipient, ...ack });
    }
    // gUSDC → ETH — the reverse leg, with a NATIVE output.
    const pool = new ProviderPool([new HttpJsonRpcTransport(DEFAULT_GIWA_RPC)]);
    const swap = await swapGusdcForEthOnGiwa({
      tokenAmountBase: opts.amountInBase,
      amountOutMin: opts.amountOutMin,
      rpcUrl: DEFAULT_GIWA_RPC,
      ...ack,
    });
    try {
      await waitForReceipt(pool, swap.txid, 45, 2_000, 'swap');
    } catch (e) {
      if (e instanceof Error && /reverted on-chain/u.test(e.message)) throw e; // reverted — nothing settled, safe to retry
      throw new SwapSendPartialError(swap, e instanceof Error ? e.message : 'swap not confirmed'); // broadcast, unconfirmed — never re-swap
    }
    let send: EvmSendResult;
    try {
      send = await sendEvmTransfer({
        chain: 'giwa-sepolia',
        to: recipient,
        ethAmount: baseToDecimal(opts.amountOutMin.toString(), 18),
        rpcUrl: DEFAULT_GIWA_RPC,
        ...ack,
      });
    } catch (e) {
      throw new SwapSendPartialError(swap, e instanceof Error ? e.message : 'forwarding failed'); // swap settled — never re-swap on retry
    }
    return { swap, send, receivedBase: opts.amountOutMin.toString(), outSymbol: 'ETH', outDecimals: 18, chainLabel: 'GIWA Sepolia' };
  }

  // solAMM on Solana devnet.
  const pool = new ProviderPool([new HttpJsonRpcTransport(DEFAULT_DEVNET_RPC)]);
  if (opts.toSym.toUpperCase() === 'SOL') {
    // dUSDC → SOL — NATIVE output, so forward the floor.
    const swap = await swapDusdcForSol({ tokenBase: opts.amountInBase, amountOutMin: opts.amountOutMin, rpcUrl: DEFAULT_DEVNET_RPC, ...ack });
    try {
      await waitForSolConfirmed(pool, swap.txid);
    } catch (e) {
      if (e instanceof Error && /failed on-chain/u.test(e.message)) throw e; // failed on-chain — nothing settled, safe to retry
      throw new SwapSendPartialError(swap, e instanceof Error ? e.message : 'swap not confirmed'); // broadcast, unconfirmed — never re-swap
    }
    let send: EvmSendResult;
    try {
      send = await sendSolTransfer({
        to: recipient,
        solAmount: baseToDecimal(opts.amountOutMin.toString(), 9),
        rpcUrl: DEFAULT_DEVNET_RPC,
        ...ack,
      });
    } catch (e) {
      throw new SwapSendPartialError(swap, e instanceof Error ? e.message : 'forwarding failed'); // swap settled — never re-swap on retry
    }
    return { swap, send, receivedBase: opts.amountOutMin.toString(), outSymbol: 'SOL', outDecimals: 9, chainLabel: 'Solana devnet' };
  }
  // SOL → dUSDC — TOKEN output, so forward the exact measured delta.
  const before = await splBalanceOf(pool, me.sol.address, SOLAMM_MINT);
  const swap = await swapSolForDusdc({ lamportsBase: opts.amountInBase, amountOutMin: opts.amountOutMin, rpcUrl: DEFAULT_DEVNET_RPC, ...ack });
  try {
    await waitForSolConfirmed(pool, swap.txid);
  } catch (e) {
    if (e instanceof Error && /failed on-chain/u.test(e.message)) throw e; // failed on-chain — nothing settled, safe to retry
    throw new SwapSendPartialError(swap, e instanceof Error ? e.message : 'swap not confirmed'); // broadcast, unconfirmed — never re-swap
  }
  // The swap has SETTLED — from here every failure is a partial (funds already in the wallet), so read the
  // post-swap balance INSIDE the partial guard: a thrown error here must never look retryable (would re-swap).
  let received: bigint;
  try {
    received = (await splBalanceOf(pool, me.sol.address, SOLAMM_MINT)) - before;
  } catch (e) {
    throw new SwapSendPartialError(swap, e instanceof Error ? e.message : 'could not read the post-swap balance');
  }
  if (received <= 0n) throw new SwapSendPartialError(swap, 'swap confirmed but no dUSDC arrived — nothing forwarded');
  let send: EvmSendResult;
  try {
    send = await sendSplTransfer({
      mint: SOLAMM_MINT,
      decimals: SOLAMM_DECIMALS,
      toOwner: recipient,
      amountBase: received.toString(),
      rpcUrl: DEFAULT_DEVNET_RPC,
      ...ack,
    });
  } catch (e) {
    throw new SwapSendPartialError(swap, e instanceof Error ? e.message : 'forwarding failed');
  }
  return { swap, send, receivedBase: received.toString(), outSymbol: 'dUSDC', outDecimals: SOLAMM_DECIMALS, chainLabel: 'Solana devnet' };
}

// ── Staking: our SimpleStaking pool on GIWA Sepolia + Ethereum Sepolia ────────

// SimpleStaking selectors (cast sig).
const STAKE = '0x3a4b66f1'; // stake()
const UNSTAKE = '0x2e17de78'; // unstake(uint256)
const STAKED_OF = '0xaf500ba3'; // stakedOf(address)

/** The SimpleStaking address + RPC for a given EVM chain (empty address ⇒ not deployed there). */
function stakingFor(chain: ChainId): { address: string; rpcUrl: string } | null {
  if (chain === 'giwa-sepolia' && GIWA_STAKING) return { address: GIWA_STAKING, rpcUrl: DEFAULT_GIWA_RPC };
  if (chain === 'sepolia' && SEPOLIA_STAKING) return { address: SEPOLIA_STAKING, rpcUrl: DEFAULT_SEPOLIA_RPC };
  return null;
}

/** Is a real, on-chain stake of ETH possible on this chain (a SimpleStaking pool is configured)? */
export function canStakeOn(chain: ChainId): boolean {
  return stakingFor(chain) !== null;
}

/** The wallet's currently-staked ETH on `chain`, as a decimal string (0 when nothing/none configured). */
export async function stakedBalanceEvm(chain: ChainId, rpcUrl?: string): Promise<string> {
  const me = currentIdentity();
  const cfg = stakingFor(chain);
  if (!me || !cfg) return '0';
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl?.trim() || cfg.rpcUrl)]);
  const res = await pool.request<string>('eth_call', [{ to: cfg.address, data: `${STAKED_OF}${encodeAddressParam(me.evm.address)}` }, 'latest']);
  return baseToDecimal((res && res !== '0x' ? decodeUint(res) : 0n).toString(), 18);
}

/**
 * Execute a REAL native-ETH stake on `chain` (giwa-sepolia | sepolia): call `stake()` on the
 * SimpleStaking pool with value = the amount, signed in-browser (non-custodial). Returns the tx.
 * A "stake N ETH" intent routes here; the wallet's key disposes, nothing custodial.
 */
export async function stakeEvm(opts: { chain: ChainId; amountBase: string; rpcUrl?: string; guard?: GuardAck }): Promise<EvmSendResult> {
  return stakeTx(opts.chain, `${STAKE}`, BigInt(opts.amountBase), opts.rpcUrl, opts.guard);
}

/** Execute a REAL unstake of `amountBase` (base-unit wei) of principal from the pool on `chain`. */
export async function unstakeEvm(opts: { chain: ChainId; amountBase: string; rpcUrl?: string; guard?: GuardAck }): Promise<EvmSendResult> {
  return stakeTx(opts.chain, `${UNSTAKE}${encodeUint256(BigInt(opts.amountBase))}`, 0n, opts.rpcUrl, opts.guard);
}

/** Shared builder: sign+broadcast a call to the SimpleStaking pool on `chain` (value for stake, 0 for unstake). */
async function stakeTx(chain: ChainId, data: string, value: bigint, rpcUrlOverride: string | undefined, guard: GuardAck | undefined): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  const cfg = stakingFor(chain);
  if (!cfg) throw new Error(`Staking isn't configured on ${chain} yet (deploy SimpleStaking + set VITE_${chain === 'sepolia' ? 'SEPOLIA' : 'GIWA'}_STAKING).`);
  const info = getChain(chain);
  if (info.evmChainId === undefined) throw new Error(`${chain} is not an EVM chain`);
  const rpcUrl = rpcUrlOverride?.trim() || cfg.rpcUrl;
  assertBroadcastAllowed(guardInput(chain, cfg.address, guard));

  const adapter = evmAdapter(chain, rpcUrl);
  const [nonce, fees] = await Promise.all([adapter.getNonce(me.evm.address), adapter.estimateFees('normal')]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');
  let gasLimit = 120_000n;
  try {
    gasLimit = ((await adapter.estimateGas({ from: me.evm.address, to: cfg.address, data, value })) * 12n) / 10n;
  } catch {
    /* keep the fallback and let the node be the final arbiter */
  }
  const tx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit,
    to: cfg.address,
    value,
    data,
  };
  const { txid } = await adapter.broadcastRawTransaction(signEvmTransaction(tx).raw);
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

/** Is a real on-chain SOL stake possible (our Solana staking program is configured)? */
export function canStakeSol(): boolean {
  return SOLANA_STAKING_PROGRAM !== '';
}

/**
 * Execute a REAL native-SOL stake on our devnet staking program: build `stake(amount)`, sign
 * in-browser, broadcast. `lamportsBase` is the stake amount in lamports (base units).
 */
export async function stakeSol(opts: { lamportsBase: string; rpcUrl?: string; guard?: GuardAck }): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  if (!SOLANA_STAKING_PROGRAM) throw new Error('Solana staking program not configured (set VITE_SOLANA_STAKING_PROGRAM).');
  assertBroadcastAllowed(guardInput('solana-devnet', SOLANA_STAKING_PROGRAM, opts.guard));
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_DEVNET_RPC;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new SolanaAdapter('solana-devnet', pool);
  const bh = await pool.request<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const message = buildStakeSolMessage({
    ownerPubkey: solPublicKey(),
    programId: SOLANA_STAKING_PROGRAM,
    amount: BigInt(opts.lamportsBase),
    recentBlockhash: bh.value.blockhash,
  });
  const sig = signSolanaMessage(message); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(assembleSolTransaction(message, sig));
  return { txid, explorerUrl: `https://explorer.solana.com/tx/${txid}?cluster=devnet` };
}

/** Execute a REAL native-SOL unstake: build `unstake(amount)`, sign in-browser, broadcast. */
export async function unstakeSol(opts: { lamportsBase: string; rpcUrl?: string; guard?: GuardAck }): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  if (!SOLANA_STAKING_PROGRAM) throw new Error('Solana staking program not configured (set VITE_SOLANA_STAKING_PROGRAM).');
  assertBroadcastAllowed(guardInput('solana-devnet', SOLANA_STAKING_PROGRAM, opts.guard));
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_DEVNET_RPC;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new SolanaAdapter('solana-devnet', pool);
  const bh = await pool.request<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const message = buildUnstakeSolMessage({
    ownerPubkey: solPublicKey(),
    programId: SOLANA_STAKING_PROGRAM,
    amount: BigInt(opts.lamportsBase),
    recentBlockhash: bh.value.blockhash,
  });
  const sig = signSolanaMessage(message);
  const { txid } = await adapter.broadcastRawTransaction(assembleSolTransaction(message, sig));
  return { txid, explorerUrl: `https://explorer.solana.com/tx/${txid}?cluster=devnet` };
}

// ── GIWA bridge: Ethereum Sepolia (L1) → GIWA (L2) via the OP Stack bridge ────

const BRIDGE_DEPOSIT_ETH = '0xb1a1a882'; // depositETH(uint32 minGasLimit, bytes extraData)

/**
 * Bridge ETH from Ethereum Sepolia (L1) to GIWA (L2) through GIWA's canonical OP Stack
 * L1StandardBridge — the SAME contract the official bridge UI uses, no third party. The
 * deposit tx is signed + broadcast on SEPOLIA (so the wallet needs Sepolia ETH); the ETH
 * arrives at the same address on GIWA after the deposit is picked up (~1–3 min on testnet).
 * Calls depositETH(200000, "0x") with value = amount.
 */
export async function bridgeEthToGiwa(opts: { ethAmount: string; rpcUrl?: string; guard?: GuardAck }): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  const info = getChain('sepolia'); // the deposit is an L1 (Sepolia) transaction
  if (info.evmChainId === undefined) throw new Error('sepolia is not an EVM chain');
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_SEPOLIA_RPC;
  assertBroadcastAllowed(guardInput('sepolia', GIWA_L1_BRIDGE, opts.guard));

  const value = parseEther(opts.ethAmount);
  if (value <= 0n) throw new Error('Enter an amount greater than 0 to bridge.'); // never sign a 0-value deposit
  // depositETH(uint32 minGasLimit=200000, bytes extraData="0x"): head = [minGasLimit, offset=0x40], then length=0.
  const data = `${BRIDGE_DEPOSIT_ETH}${encodeUint256(200_000n)}${encodeUint256(64n)}${encodeUint256(0n)}`;
  const adapter = evmAdapter('sepolia', rpcUrl);
  const [nonce, fees] = await Promise.all([adapter.getNonce(me.evm.address), adapter.estimateFees('normal')]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');

  // The OP-Stack L1StandardBridge deposit (cross-domain message + portal event) is borderline
  // at a fixed 200k on real L1 gas; a modest cost bump would OOG-revert and burn the deposit.
  // Estimate + 25% headroom; fall back to 200k only if the call can't be simulated.
  let gasLimit = 200_000n;
  try {
    gasLimit = ((await adapter.estimateGas({ from: me.evm.address, to: GIWA_L1_BRIDGE, data, value })) * 125n) / 100n;
  } catch {
    /* keep the 200k fallback */
  }

  const tx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit,
    to: GIWA_L1_BRIDGE,
    value,
    data,
  };
  const signed = signEvmTransaction(tx); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(signed.raw);
  // The deposit tx lives on Sepolia (L1); link the Sepolia explorer.
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

// ── Solana devnet ────────────────────────────────────────────────────────────

/** Parse a decimal SOL string into exact lamports (bigint, 9 decimals). Strict — see `decimalToBase`. */
export function parseLamports(input: string): bigint {
  return BigInt(decimalToBase(input, 9));
}

/** The unlocked wallet's live SOL balance on devnet, as a decimal string. */
export async function getSolTestnetBalance(rpcUrl = DEFAULT_DEVNET_RPC): Promise<string> {
  const me = currentIdentity();
  if (!me || !me.sol.address) return '0'; // imported EVM-only accounts have no Solana address
  const adapter = new SolanaAdapter('solana-devnet', new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]));
  const lamports = await adapter.getNativeBalance(me.sol.address);
  return floorUnitsToDp(BigInt(lamports), 9, 6);
}

/**
 * Broadcast a REAL native SOL transfer on devnet: fetch a recent blockhash → compile
 * the transfer message → sign it in-browser with the wallet's ed25519 key → assemble
 * and send the wire transaction. Returns the signature + explorer link.
 */
export async function sendSolTransfer(opts: { rpcUrl?: string; to: string; solAmount: string; guard?: GuardAck; chain?: 'solana' | 'solana-devnet' }): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  // Network follows `chain` (default devnet). The guard is keyed on it — 'solana' is a mainnet (testnet:false)
  // registry chain, so a mainnet send is automatically gated by the mainnet-ack + $1,000 spend cap; devnet
  // waves through. Nothing else about the (self-built, non-opaque) transfer changes between the two.
  const chain: ChainId = opts.chain === 'solana' ? 'solana' : 'solana-devnet';
  const mainnet = chain === 'solana';
  assertBroadcastAllowed(guardInput(chain, opts.to.trim(), opts.guard));
  const rpcUrl = opts.rpcUrl?.trim() || (mainnet ? DEFAULT_SOLANA_MAINNET_RPC : DEFAULT_DEVNET_RPC);
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new SolanaAdapter(chain, pool);

  const bh = await pool.request<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const message = buildSolTransferMessage({
    fromPubkey: solPublicKey(),
    toAddress: opts.to.trim(),
    lamports: parseLamports(opts.solAmount),
    recentBlockhash: bh.value.blockhash,
  });
  const signature = signSolanaMessage(message); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(assembleSolTransaction(message, signature));
  return { txid, explorerUrl: mainnet ? `https://explorer.solana.com/tx/${txid}` : `https://explorer.solana.com/tx/${txid}?cluster=devnet` };
}

/** Known SPL tokens on Solana devnet (symbol → mint + decimals). Verified on-chain. */
const DEVNET_SPL_TOKENS: Record<string, { mint: string; decimals: number }> = {
  // A real devnet USDC mint (6 decimals) — confirmed to exist via getAccountInfo.
  USDC: { mint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', decimals: 6 },
};

export function splToken(symbol: string): { mint: string; decimals: number } | null {
  return DEVNET_SPL_TOKENS[symbol.toUpperCase()] ?? null;
}

/**
 * Broadcast a REAL SPL token transfer on devnet: fetch a recent blockhash, build a
 * message that idempotently creates the recipient's ATA and does a checked transfer
 * from the sender's ATA, sign it in-browser with the wallet's ed25519 key, and send
 * it. `amountBase` is in the token's base units.
 */
export async function sendSplTransfer(opts: {
  rpcUrl?: string;
  mint: string;
  decimals: number;
  toOwner: string;
  amountBase: string;
  guard?: GuardAck;
}): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertBroadcastAllowed(guardInput('solana-devnet', opts.toOwner.trim(), opts.guard));
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_DEVNET_RPC;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new SolanaAdapter('solana-devnet', pool);

  const bh = await pool.request<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const { message } = buildSplTransferMessage({
    ownerPubkey: solPublicKey(),
    mint: opts.mint,
    toOwner: opts.toOwner.trim(),
    amount: BigInt(opts.amountBase),
    decimals: opts.decimals,
    recentBlockhash: bh.value.blockhash,
  });
  const sig = signSolanaMessage(message); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(assembleSolTransaction(message, sig));
  return { txid, explorerUrl: `https://explorer.solana.com/tx/${txid}?cluster=devnet` };
}

// ── solAMM swap: our on-chain SOL ⇄ dUSDC AMM on Solana devnet ────────────────

const SOLAMM_FEE_NUM = 997n;
const SOLAMM_FEE_DEN = 1000n;

/** Constant-product output with the 0.30% fee — the exact mirror of the program's `amount_out`. */
function solammAmountOut(reserveIn: bigint, reserveOut: bigint, amountIn: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const inFee = (amountIn * SOLAMM_FEE_NUM) / SOLAMM_FEE_DEN;
  const out = (reserveOut * inFee) / (reserveIn + inFee);
  return out >= reserveOut ? 0n : out;
}

/** Read the pool's live reserves straight from its account (reserve_sol lamports, reserve_token base units). */
async function solammReserves(pool: ProviderPool): Promise<{ sol: bigint; token: bigint } | null> {
  const poolAddr = solammPdas(SOLAMM_PROGRAM, SOLAMM_MINT).pool;
  const res = await pool.request<{ value: { data: [string, string] } | null }>('getAccountInfo', [poolAddr, { encoding: 'base64' }]);
  if (!res?.value) return null;
  // Guard the account-data SHAPE before decoding (parity with the other RPC readers): a degraded RPC
  // could return a non-array `data`, a non-base64 string, or a short buffer — `atob(undefined)` or an
  // out-of-range `raw[88]` would otherwise throw. Return null so the caller shows "quote unavailable".
  const b64 = Array.isArray(res.value.data) ? res.value.data[0] : undefined;
  if (typeof b64 !== 'string') return null;
  let raw: Uint8Array;
  try {
    raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (raw.length < 89) return null; // need bytes through reserve_token u64 @81..88
  // layout: 8 disc | mint 32 | vault 32 | bump 1 | reserve_sol u64 @73 | reserve_token u64 @81
  const u64at = (off: number): bigint => {
    let v = 0n;
    for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(raw[off + i]);
    return v;
  };
  return { sol: u64at(73), token: u64at(81) };
}

/** A live SOL→dUSDC quote from the pool's on-chain reserves. `lamportsBase` is the input in lamports. */
export async function quoteSolammBuy(lamportsBase: string, rpcUrl = DEFAULT_DEVNET_RPC): Promise<SwapQuote | null> {
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const r = await solammReserves(pool);
  if (!r) return null;
  const out = solammAmountOut(r.sol, r.token, BigInt(lamportsBase));
  if (out <= 0n) return null;
  // Use the pool's ACTUAL token symbol (dUSDC) so the live-quote line, the cost table, and the receipt
  // (which prints res.outSymbol = 'dUSDC') all name the same token — not "USDC" here vs "dUSDC" there.
  return { amountOut: out, decimalsOut: SOLAMM_DECIMALS, symbolOut: SOLAMM_TOKEN_SYMBOL, fee: 3000 };
}

/** A live dUSDC→SOL quote from the pool's on-chain reserves. `tokenBase` is the input in dUSDC base units. */
export async function quoteSolammSell(tokenBase: string, rpcUrl = DEFAULT_DEVNET_RPC): Promise<SwapQuote | null> {
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const r = await solammReserves(pool);
  if (!r) return null;
  const out = solammAmountOut(r.token, r.sol, BigInt(tokenBase));
  if (out <= 0n) return null;
  return { amountOut: out, decimalsOut: 9, symbolOut: 'SOL', fee: 3000 };
}

/**
 * The unlocked wallet's dUSDC balance (base units) on devnet — the token the REVERSE (dUSDC→SOL)
 * solAMM swap sells. Its on-chain SPL-Token transfer reverts with `custom program error: 0x1`
 * (Token::InsufficientFunds) if the wallet holds less than it is selling, so the UI reads this
 * FIRST and refuses to let the user sign a swap that could only fail — comprehension before
 * signature, fail closed. Returns 0n when the wallet is locked or has no dUSDC token account
 * (an honest "you hold none"); an RPC error propagates so the caller can leave the preflight
 * unknown (best-effort) rather than falsely block — the on-chain revert stays the guarantee.
 */
export async function solDusdcBalanceBase(rpcUrl = DEFAULT_DEVNET_RPC): Promise<bigint> {
  const me = currentIdentity();
  if (!me) return 0n;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  return splBalanceOf(pool, me.sol.address, SOLAMM_MINT);
}

/**
 * Execute a REAL SOL→dUSDC swap on our solAMM: build the `swap_sol_for_token` anchor
 * message (with an idempotent ATA create), sign it in-browser with the wallet's ed25519
 * key, and broadcast. `amountOutMin` is a hard on-chain floor — the program reverts
 * rather than delivering less.
 */
export async function swapSolForDusdc(opts: { lamportsBase: string; amountOutMin: bigint; rpcUrl?: string; guard?: GuardAck }): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertPositiveMinOut(opts.amountOutMin);
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_DEVNET_RPC;
  assertBroadcastAllowed(guardInput('solana-devnet', SOLAMM_PROGRAM, opts.guard));
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new SolanaAdapter('solana-devnet', pool);

  const bh = await pool.request<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const { message } = buildSwapSolForTokenMessage({
    ownerPubkey: solPublicKey(),
    programId: SOLAMM_PROGRAM,
    mint: SOLAMM_MINT,
    amountIn: BigInt(opts.lamportsBase),
    minOut: opts.amountOutMin,
    recentBlockhash: bh.value.blockhash,
  });
  const sig = signSolanaMessage(message); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(assembleSolTransaction(message, sig));
  return { txid, explorerUrl: `https://explorer.solana.com/tx/${txid}?cluster=devnet` };
}

/**
 * Execute a REAL dUSDC→SOL swap on our solAMM via `swap_token_for_sol`, signed in-browser.
 * `dusdcAmount` is a decimal string; the trader's dUSDC ATA must already hold the tokens.
 */
export async function swapDusdcForSol(opts: { tokenBase: string; amountOutMin: bigint; rpcUrl?: string; guard?: GuardAck }): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertPositiveMinOut(opts.amountOutMin);
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_DEVNET_RPC;
  assertBroadcastAllowed(guardInput('solana-devnet', SOLAMM_PROGRAM, opts.guard));
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new SolanaAdapter('solana-devnet', pool);

  const bh = await pool.request<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const { message } = buildSwapTokenForSolMessage({
    ownerPubkey: solPublicKey(),
    programId: SOLAMM_PROGRAM,
    mint: SOLAMM_MINT,
    amountIn: BigInt(opts.tokenBase),
    minOut: opts.amountOutMin,
    recentBlockhash: bh.value.blockhash,
  });
  const sig = signSolanaMessage(message); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(assembleSolTransaction(message, sig));
  return { txid, explorerUrl: `https://explorer.solana.com/tx/${txid}?cluster=devnet` };
}

// ── Advanced bridge: our operator/relayer liquidity bridge (any ⇄ any) ────────
// Real txs on BOTH sides. The wallet deposits to the bridge operator on the source
// chain, tagged `BRDG:<dest>:<recipient>` (EVM: as calldata; Solana: as a memo); an
// off-chain relayer sees the deposit and RELEASES the asset on the destination chain
// (another real tx). Operator-secured — the same bonded-relayer model Hop/Across use,
// NOT trustless (no trustless bridge exists across these testnets).

export const BRIDGE_TAG = 'BRDG';
export const BRIDGE_FEE_BPS = 10; // 0.10% operator fee
const BRIDGE_EVM_OPERATOR = (import.meta.env.VITE_BRIDGE_EVM_OPERATOR || '0x09f84F0245DcAd28bF217B58159EC4d69089a035').trim();
const BRIDGE_SOL_OPERATOR = (import.meta.env.VITE_BRIDGE_SOL_OPERATOR || '6AMsE2VWMc8uDCbmUG9kih5w9iMA6eaF4p2vk3Zph6QX').trim();
const BRIDGE_BTC_OPERATOR = (import.meta.env.VITE_BRIDGE_BTC_OPERATOR || 'tb1qnzvypta5ayv4d7lgshs8kz5q4qvramwcley0hu').trim();

export interface BridgeChain {
  id: 'sepolia' | 'giwa' | 'solana' | 'bitcoin';
  kind: 'evm' | 'solana' | 'bitcoin';
  evmChain?: ChainId;
  label: string;
  asset: 'ETH' | 'SOL' | 'BTC';
  decimals: number;
  operator: string;
  explorer: string;
  rpc: string;
}

export const BRIDGE_CHAINS: Record<string, BridgeChain> = {
  sepolia: { id: 'sepolia', kind: 'evm', evmChain: 'sepolia', label: 'Sepolia', asset: 'ETH', decimals: 18, operator: BRIDGE_EVM_OPERATOR, explorer: 'https://eth-sepolia.blockscout.com', rpc: DEFAULT_SEPOLIA_RPC },
  giwa: { id: 'giwa', kind: 'evm', evmChain: 'giwa-sepolia', label: 'GIWA Sepolia', asset: 'ETH', decimals: 18, operator: BRIDGE_EVM_OPERATOR, explorer: 'https://sepolia-explorer.giwa.io', rpc: DEFAULT_GIWA_RPC },
  solana: { id: 'solana', kind: 'solana', label: 'Solana devnet', asset: 'SOL', decimals: 9, operator: BRIDGE_SOL_OPERATOR, explorer: 'https://explorer.solana.com', rpc: DEFAULT_DEVNET_RPC },
  bitcoin: { id: 'bitcoin', kind: 'bitcoin', label: 'Bitcoin testnet', asset: 'BTC', decimals: 8, operator: BRIDGE_BTC_OPERATOR, explorer: 'https://mempool.space/testnet', rpc: DEFAULT_BTC_TESTNET_REST },
};

/** Operator bridge opt-in. The committed default is OFF — fail-closed, so a shared build can never
 *  invite a deposit down a path whose relayer isn't running (exactly how 0.05 SOL + 0.031 ETH were
 *  lost). The operator flips this on in their gitignored .env.local ONLY while they run
 *  services/relayer with funded operator liquidity. */
const BRIDGE_OPERATOR_ENABLED = String(import.meta.env.VITE_BRIDGE_OPERATOR_ENABLED ?? '').trim() === 'true';

/** The registry ChainId behind a bridge chain, so realism (testnet vs mainnet) is read from the ONE
 *  source of truth (registry `testnet`) rather than re-hardcoded here. */
function bridgeRegistryId(bc: BridgeChain): ChainId {
  if (bc.evmChain) return bc.evmChain;
  return bc.kind === 'solana' ? 'solana-devnet' : 'bitcoin-testnet';
}

/**
 * Is this bridge route actually DELIVERABLE end-to-end right now? Two mechanisms:
 *
 *  1. CANONICAL — Ethereum Sepolia → GIWA, ETH, to your own address: the OP-Stack L1StandardBridge
 *     deposit, delivered by the chain's own messenger whether or not anything of ours runs. No
 *     operator, no custody, no trust. Always on. (Proven on-chain: L1 0xb1c8d047… → L2 0x9565a720….)
 *  2. OPERATOR — every other same-realism route (incl. Solana): the bonded-relayer model. The deposit
 *     is a REAL on-chain tx to the operator; services/relayer releases it on the destination (or
 *     refunds it). OFF unless the operator opts in (VITE_BRIDGE_OPERATOR_ENABLED), because a route
 *     whose relayer isn't running strands the deposit — the doctrine's fail-closed law, and the
 *     literal history here (0.05 SOL, 0.031 ETH lost down un-serviced paths).
 *
 * NEVER crosses realism: a testnet↔mainnet leg is refused by the same-realism guard (packages/chains),
 * so free test funds can never be bridged against real value. Same-chain is a SWAP, not a bridge.
 */
export function bridgeRouteDeliverable(route: {
  fromId: string;
  toId: string;
  asset: string;
  recipient?: string | undefined;
  sender?: string | undefined;
}): { ok: true; note?: string } | { ok: false; reason: string } {
  const asset = route.asset.toUpperCase();
  const from = BRIDGE_CHAINS[route.fromId];
  const to = BRIDGE_CHAINS[route.toId];

  // 1. CANONICAL: Sepolia → GIWA, ETH, credited to YOUR OWN address on GIWA. An empty recipient means
  // "to self"; an explicit recipient is fine ONLY when it is your own address (the modal prefills it).
  if (route.fromId === 'sepolia' && route.toId === 'giwa' && asset === 'ETH') {
    const r = (route.recipient ?? '').trim().toLowerCase();
    const s = (route.sender ?? '').trim().toLowerCase();
    if (!r || (s !== '' && r === s)) {
      return { ok: true, note: 'Canonical OP-Stack bridge (~60s) — non-custodial, credited to your own address on GIWA.' };
    }
    return {
      ok: false,
      reason:
        'The canonical bridge always credits YOUR own address on GIWA — it cannot deliver to a different recipient. Bridge to yourself, then send on GIWA (an instant, real transfer).',
    };
  }

  // 2. OPERATOR: everything else. Fail closed unless the operator has explicitly turned it on.
  if (!BRIDGE_OPERATOR_ENABLED) {
    return {
      ok: false,
      reason:
        `The operator bridge is off in this build, so ${from?.label ?? route.fromId} → ${to?.label ?? route.toId} isn't available ` +
        `(only the canonical Ethereum Sepolia → GIWA is). Nothing has been signed. Turn it on by running services/relayer and ` +
        `setting VITE_BRIDGE_OPERATOR_ENABLED=true.`,
    };
  }
  if (!from || !to) return { ok: false, reason: `Unknown bridge chain: ${route.fromId} → ${route.toId}.` };
  if (from.id === to.id) return { ok: false, reason: `${from.label} → ${to.label} is the same chain — that's a swap, not a bridge. Use Swap.` };
  // The operator relayer (services/relayer) has NO Bitcoin support — it never scans, releases, or
  // REFUNDS a BTC leg (its CHAINS map is sepolia/giwa/solana; decodeMemo returns null for `BRDG:bitcoin:…`).
  // So a Bitcoin route would deposit on-chain and then strand PERMANENTLY — not even refundable — the exact
  // silent loss this subsystem exists to prevent. Refuse it (fail-closed) until the relayer can service BTC.
  if (from.kind === 'bitcoin' || to.kind === 'bitcoin') {
    return {
      ok: false,
      reason: `Bitcoin bridge routes aren't deliverable yet — the operator relayer has no Bitcoin support, so a deposit would strand (and can't even be refunded). Use an EVM or Solana route.`,
    };
  }
  // Never cross realism (testnet↔mainnet). Structural guard from packages/chains, keyed on the
  // registry `testnet` flag — a devnet↔mainnet route would move real value against valueless test funds.
  const realism = checkSameRealism(bridgeRegistryId(from), bridgeRegistryId(to));
  if (!realism.ok) return { ok: false, reason: realism.reason };
  // The deposit leg is always the SOURCE chain's native asset.
  if (asset !== from.asset.toUpperCase()) {
    return { ok: false, reason: `From ${from.label} you can only bridge its native ${from.asset}, not ${asset}.` };
  }
  return {
    ok: true,
    note:
      `Operator-assisted bridge (bonded relayer). Your deposit is a REAL on-chain tx to the operator; ` +
      `services/relayer releases ${to.asset} on ${to.label} after ${from.kind === 'solana' ? '32 slots' : '6 blocks'}, ` +
      `or refunds you if it can't. Delivery needs the operator relayer running — not trustless.`,
  };
}

export interface BridgeQuote {
  destAmountBase: string;
  destAsset: string;
  destDecimals: number;
  rate: number; // dest units per 1 source unit
  feeBps: number;
  sameAsset: boolean;
}

async function bridgePrices(): Promise<Record<string, number | null>> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana,bitcoin&vs_currencies=usd', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ETH: null, SOL: null, BTC: null };
    const j = (await res.json()) as Record<string, { usd?: number }>;
    return { ETH: j.ethereum?.usd ?? null, SOL: j.solana?.usd ?? null, BTC: j.bitcoin?.usd ?? null };
  } catch {
    return { ETH: null, SOL: null, BTC: null };
  }
}

/** Quote a bridge: 1:1 minus fee for same-asset routes, live USD-rate for cross-asset. */
export async function bridgeQuote(fromId: string, toId: string, amountBase: string): Promise<BridgeQuote | null> {
  const from = BRIDGE_CHAINS[fromId];
  const to = BRIDGE_CHAINS[toId];
  if (!from || !to || from.id === to.id) return null;
  let amt: bigint;
  try {
    amt = BigInt(amountBase);
  } catch {
    return null;
  }
  if (amt <= 0n) return null;
  const afterFee = (amt * BigInt(10_000 - BRIDGE_FEE_BPS)) / 10_000n;
  const sameAsset = from.asset === to.asset;
  let rate = 1;
  if (!sameAsset) {
    const px = await bridgePrices();
    const pf = px[from.asset];
    const pt = px[to.asset];
    if (!pf || !pt) return null;
    rate = pf / pt;
  }
  const rateScaled = BigInt(Math.round(rate * 1e9));
  const destBase = (afterFee * rateScaled * 10n ** BigInt(to.decimals)) / (10n ** BigInt(from.decimals) * 1_000_000_000n);
  if (destBase <= 0n) return null;
  return { destAmountBase: destBase.toString(), destAsset: to.asset, destDecimals: to.decimals, rate, feeBps: BRIDGE_FEE_BPS, sameAsset };
}

function utf8Hex(s: string): string {
  return '0x' + Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function bridgeDepositEvm(from: BridgeChain, amountBase: string, memo: string, guard?: GuardAck): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  const chain = from.evmChain as ChainId;
  const info = getChain(chain);
  if (info.evmChainId === undefined) throw new Error(`${chain} is not an EVM chain`);
  assertBroadcastAllowed(guardInput(chain, from.operator, guard));
  const adapter = evmAdapter(chain, from.rpc);
  const value = BigInt(amountBase);
  if (value <= 0n) throw new Error('Enter an amount greater than 0 to bridge.'); // never sign a 0-value deposit
  const data = utf8Hex(memo);
  const [nonce, fees] = await Promise.all([adapter.getNonce(me.evm.address), adapter.estimateFees('normal')]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');
  // 45k assumes an EOA operator; if VITE_BRIDGE_EVM_OPERATOR is ever a contract/Safe, its
  // payable fallback exceeds that → OOG-revert. Estimate + 25% headroom; fall back to 45k.
  let gasLimit = 45_000n;
  try {
    gasLimit = ((await adapter.estimateGas({ from: me.evm.address, to: from.operator, data, value })) * 125n) / 100n;
  } catch {
    /* keep the 45k EOA fallback */
  }
  const tx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit,
    to: from.operator,
    value,
    data,
  };
  const signed = signEvmTransaction(tx); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(signed.raw);
  return { txid, explorerUrl: `${from.explorer}/tx/${txid}` };
}

async function bridgeDepositSolana(from: BridgeChain, amountBase: string, memo: string, guard?: GuardAck): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertBroadcastAllowed(guardInput('solana-devnet', from.operator, guard));
  const pool = new ProviderPool([new HttpJsonRpcTransport(from.rpc)]);
  const adapter = new SolanaAdapter('solana-devnet', pool);
  const bh = await pool.request<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const message = buildBridgeDepositMessage({
    ownerPubkey: solPublicKey(),
    operator: from.operator,
    lamports: BigInt(amountBase),
    memo,
    recentBlockhash: bh.value.blockhash,
  });
  const sig = signSolanaMessage(message); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(assembleSolTransaction(message, sig));
  return { txid, explorerUrl: `https://explorer.solana.com/tx/${txid}?cluster=devnet` };
}

async function bridgeDepositBtc(from: BridgeChain, amountBase: string, memo: string, guard?: GuardAck): Promise<EvmSendResult> {
  const address = btcTestnetAddress();
  if (!address) throw new Error('Unlock your wallet first.');
  assertBroadcastAllowed(guardInput('bitcoin-testnet', from.operator, guard));
  const adapter = btcAdapter(from.rpc);
  const [utxos, fee] = await Promise.all([adapter.getUtxos(address), adapter.estimateFees('normal')]);
  if (fee.kind !== 'btc') throw new Error('unexpected non-BTC fee estimate');
  const spend: BtcSpendUtxo[] = utxos.map((u) => ({ txid: u.txid, vout: u.vout, value: u.value }));
  const built = buildBtcTransfer({
    publicKey: btcPublicKey(),
    utxos: spend,
    toAddress: from.operator,
    amountSats: BigInt(amountBase),
    feeRateSatPerVb: fee.satPerVByte,
    network: 'testnet',
    opReturn: new TextEncoder().encode(memo), // the route tag, as an OP_RETURN output
  });
  const signed = signBitcoinPsbt(built.psbt); // in-browser, with the user's key
  if (!signed.finalized || !signed.txHex) throw new Error('PSBT was not fully signed');
  const { txid } = await adapter.broadcastRawTransaction(signed.txHex);
  return { txid, explorerUrl: `https://mempool.space/testnet/tx/${txid}` };
}

/**
 * Execute a bridge deposit on the SOURCE chain — a real tx that sends the asset to the
 * operator tagged with the route. The relayer then releases on the destination chain.
 */
/** Validate a bridge recipient against the DESTINATION chain's address format. The
 *  recipient rides in an unauthenticated tag the relayer trusts, so a malformed or
 *  wrong-chain address must be rejected here (cross-chain, a bad release is unrecoverable). */
function validBridgeRecipient(to: BridgeChain, recipient: string): boolean {
  const r = recipient.trim();
  // EVM: reuse the hardened broadcast-guard check rather than a bare hex regex — it also
  // enforces the EIP-55 checksum (catching a typo'd recipient) and rejects the zero/burn
  // address. Both matter MORE here than for a normal send: the recipient rides in an
  // unauthenticated tag the relayer trusts, and a cross-chain release is unrecoverable.
  if (to.kind === 'evm') return checkEvmRecipient(r).valid;
  if (to.kind === 'solana') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r);
  if (to.kind === 'bitcoin') return /^(tb1[a-z0-9]{25,87}|[mn2][a-km-zA-HJ-NP-Z1-9]{25,39})$/.test(r);
  return false;
}

export async function bridgeDeposit(opts: { fromId: string; toId: string; amountBase: string; recipient: string; guard?: GuardAck }): Promise<EvmSendResult> {
  const from = BRIDGE_CHAINS[opts.fromId];
  const to = BRIDGE_CHAINS[opts.toId];
  if (!from || !to || from.id === to.id) throw new Error('Unsupported bridge route.');
  // Defense-in-depth: re-run the SAME deliverability gate the UI uses, so a route that isn't
  // deliverable (operator bridge off, or a cross-realism testnet↔mainnet leg) can never be signed
  // even if a caller reaches this function directly. Fail closed — nothing is signed on a refusal.
  const gate = bridgeRouteDeliverable({
    fromId: opts.fromId,
    toId: opts.toId,
    asset: from.asset,
    recipient: opts.recipient.trim() || undefined,
    sender: currentIdentity()?.evm.address,
  });
  if (!gate.ok) throw new Error(gate.reason);
  if (!validBridgeRecipient(to, opts.recipient)) throw new Error(`Invalid recipient address for ${to.label}.`);
  const memo = `${BRIDGE_TAG}:${to.id}:${opts.recipient.trim()}`;
  if (from.kind === 'evm') return bridgeDepositEvm(from, opts.amountBase, memo, opts.guard);
  if (from.kind === 'bitcoin') return bridgeDepositBtc(from, opts.amountBase, memo, opts.guard);
  return bridgeDepositSolana(from, opts.amountBase, memo, opts.guard);
}

/** Poll the destination chain for the relayer's release to `recipient` after `sinceUnix`. */
export async function findBridgeRelease(toId: string, recipient: string, sinceUnix: number): Promise<{ txid: string; explorerUrl: string } | null> {
  const to = BRIDGE_CHAINS[toId];
  if (!to) return null;
  try {
    if (to.kind === 'evm') {
      const res = await fetch(`${to.explorer}/api/v2/addresses/${recipient.trim()}/transactions`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { items?: Array<{ hash: string; from?: { hash?: string }; timestamp?: string }> };
      const op = to.operator.toLowerCase();
      const hit = (body.items ?? []).find(
        // Require a REAL timestamp inside the window — a tx with no timestamp yet (unindexed)
        // is skipped this poll and matched on the next, rather than matching ANY historical
        // operator→recipient tx (which would report a stale/wrong tx as "your release").
        (t) => String(t.from?.hash ?? '').toLowerCase() === op && (t.timestamp ? new Date(t.timestamp).getTime() / 1000 >= sinceUnix - 45 : false),
      );
      return hit ? { txid: hit.hash, explorerUrl: `${to.explorer}/tx/${hit.hash}` } : null;
    }
    if (to.kind === 'bitcoin') {
      const res = await fetch(`${to.rpc}/address/${recipient.trim()}/txs`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const txs = (await res.json()) as Array<{ txid: string; status?: { block_time?: number }; vin?: Array<{ prevout?: { scriptpubkey_address?: string } }> }>;
      const hit = txs.find(
        (t) =>
          (t.vin ?? []).some((v) => v.prevout?.scriptpubkey_address === to.operator) &&
          (t.status?.block_time ?? Math.floor(Date.now() / 1000)) >= sinceUnix - 60,
      );
      return hit ? { txid: hit.txid, explorerUrl: `https://mempool.space/testnet/tx/${hit.txid}` } : null;
    }
    // Solana: anchor on the RECIPIENT's signatures, not the operator's. The operator also
    // pays OTHER users' releases, so "the operator's newest tx" could surface a different
    // user's release txid (two concurrent bridges → wrong "complete"). A tx that touches
    // THIS recipient in the window is the release for THIS bridge.
    const pool = new ProviderPool([new HttpJsonRpcTransport(to.rpc)]);
    const sigs = await pool.request<Array<{ signature: string; blockTime?: number; err?: unknown }>>('getSignaturesForAddress', [recipient.trim(), { limit: 10 }]);
    const hit = (sigs ?? []).find((s) => s.err == null && (s.blockTime ?? 0) >= sinceUnix - 45);
    return hit ? { txid: hit.signature, explorerUrl: `https://explorer.solana.com/tx/${hit.signature}?cluster=devnet` } : null;
  } catch {
    return null;
  }
}

/**
 * Find the INCOMING transaction that credited a bridge on its destination chain.
 *
 * `findBridgeRelease` matches only the OPERATOR's release — correct for the relayed bridge, but
 * blind to the CANONICAL OP Stack deposit, which arrives as an L2 system transaction from no
 * operator address at all. That blindness is why the chat bridge could show its outgoing leg and
 * never its incoming one. So: try the precise operator match first, then any value-bearing incoming
 * transaction inside the window.
 */
export async function findBridgeCredit(
  toId: string,
  recipient: string,
  sinceUnix: number,
  opts: { l1TxHash?: string; valueBase?: string } = {},
): Promise<{ txid: string; explorerUrl: string } | null> {
  const to = BRIDGE_CHAINS[toId];
  if (!to) return null;

  // 1) CANONICAL OP Stack deposit — exact, by construction. Blockscout's OP endpoint maps our own
  //    L1 deposit hash to the L2 hash it produced, so there is no guessing and no window to widen.
  //    Verified against a real deposit: L1 0xb1c8d047… → L2 0x9565a720… (62s apart).
  if (to.kind === 'evm' && opts.l1TxHash) {
    try {
      const res = await fetch(`${to.explorer}/api/v2/optimism/deposits?items_count=50`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const body = (await res.json()) as { items?: Array<{ l1_transaction_hash?: string; l2_transaction_hash?: string }> };
        const want = opts.l1TxHash.toLowerCase();
        const hit = (body.items ?? []).find((d) => (d.l1_transaction_hash ?? '').toLowerCase() === want);
        if (hit?.l2_transaction_hash) return { txid: hit.l2_transaction_hash, explorerUrl: `${to.explorer}/tx/${hit.l2_transaction_hash}` };
      }
    } catch {
      /* fall through to the generic matchers */
    }
  }

  // 2) The relayer's release, matched on the operator address.
  const precise = await findBridgeRelease(toId, recipient, sinceUnix);
  if (precise) return precise;
  if (to.kind !== 'evm') return null;

  // 3) A credit that is not a top-level transaction. This is where the canonical deposit actually
  //    shows up on an OP-Stack Blockscout — checked against the real bridge above, the address's
  //    `transactions` list did NOT contain it at all, only `internal-transactions` did. Matching the
  //    exact value as well as the window keeps a coincidental credit from being claimed as ours.
  const inWindow = (ts?: string): boolean => (ts ? new Date(ts).getTime() / 1000 >= sinceUnix - 45 : false);
  const valueMatches = (v?: string): boolean =>
    opts.valueBase === undefined ? v !== undefined && v !== '' && BigInt(v) > 0n : v === opts.valueBase;
  try {
    const res = await fetch(`${to.explorer}/api/v2/addresses/${recipient.trim()}/internal-transactions?filter=to`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const body = (await res.json()) as { items?: Array<{ transaction_hash?: string; value?: string; timestamp?: string }> };
      const hit = (body.items ?? []).find((t) => valueMatches(t.value) && inWindow(t.timestamp));
      if (hit?.transaction_hash) return { txid: hit.transaction_hash, explorerUrl: `${to.explorer}/tx/${hit.transaction_hash}` };
    }
  } catch {
    /* fall through */
  }

  // 4) Last resort — a plain incoming transfer.
  try {
    const res = await fetch(`${to.explorer}/api/v2/addresses/${recipient.trim()}/transactions?filter=to`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: Array<{ hash: string; value?: string; timestamp?: string }> };
    const hit = (body.items ?? []).find((t) => valueMatches(t.value) && inWindow(t.timestamp));
    return hit ? { txid: hit.hash, explorerUrl: `${to.explorer}/tx/${hit.hash}` } : null;
  } catch {
    return null;
  }
}

/**
 * The wallet's own native balance on a bridge chain, in base units — the unambiguous answer to
 * "did it actually arrive?". A balance that GREW is proof of credit even when no explorer has
 * indexed the transaction yet, which is exactly the gap where the UI used to go silent.
 */
export async function bridgeChainBalanceBase(chainId: string, address: string): Promise<bigint | null> {
  const c = BRIDGE_CHAINS[chainId];
  if (!c || address.trim() === '') return null;
  try {
    if (c.kind === 'evm') {
      const pool = new ProviderPool([new HttpJsonRpcTransport(c.rpc)]);
      const hex = await pool.request<string>('eth_getBalance', [address.trim(), 'latest']);
      return hex && hex !== '0x' ? BigInt(hex) : 0n;
    }
    if (c.kind === 'solana') {
      const adapter = new SolanaAdapter('solana-devnet', new ProviderPool([new HttpJsonRpcTransport(c.rpc)]));
      return BigInt(await adapter.getNativeBalance(address.trim()));
    }
    const res = await fetch(`${c.rpc}/address/${address.trim()}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number } };
    return BigInt((j.chain_stats?.funded_txo_sum ?? 0) - (j.chain_stats?.spent_txo_sum ?? 0));
  } catch {
    return null;
  }
}

// ── Bitcoin testnet ──────────────────────────────────────────────────────────

/** Parse a decimal BTC string into exact satoshis (bigint, 8 decimals). Strict — see `decimalToBase`. */
export function parseSats(input: string): bigint {
  return BigInt(decimalToBase(input, 8));
}

function btcAdapter(restUrl: string): BitcoinAdapter {
  return new BitcoinAdapter('bitcoin-testnet', new HttpRestTransport(restUrl));
}

/** The wallet's own P2WPKH address on testnet (its BTC key, `tb1q…`-encoded).
 *  Null for imported EVM-only accounts (no BTC key) — so callers skip BTC cleanly. */
export function btcTestnetAddress(): string | null {
  const me = currentIdentity();
  if (!me || !me.btc.address) return null; // imported accounts have no BTC address
  return p2wpkhAddressFor(btcPublicKey(), 'testnet');
}

/** The unlocked wallet's live testnet BTC balance, as a decimal string. */
export async function getBtcTestnetBalance(restUrl = DEFAULT_BTC_TESTNET_REST): Promise<string> {
  const address = btcTestnetAddress();
  if (!address) return '0';
  const sats = await btcAdapter(restUrl).getNativeBalance(address);
  return floorUnitsToDp(BigInt(sats), 8, 8);
}

/**
 * Broadcast a REAL native BTC transfer on testnet: fetch the address's UTXOs +
 * the live fee rate → build an unsigned P2WPKH PSBT (coin selection, fee, change)
 * → sign + finalize it in-browser with the wallet's key → push the raw tx to the
 * esplora node. Returns the txid + explorer link. Throws the node's real error
 * (or "insufficient funds") — which itself proves the tx reached the real chain.
 */
export async function sendBtcTransfer(opts: {
  restUrl?: string;
  to: string;
  btcAmount: string;
  feeRateSatPerVb?: number;
  guard?: GuardAck;
}): Promise<EvmSendResult> {
  const address = btcTestnetAddress();
  if (!address) throw new Error('Unlock your wallet first.');
  assertBroadcastAllowed(guardInput('bitcoin-testnet', opts.to.trim(), opts.guard));
  const restUrl = opts.restUrl?.trim() || DEFAULT_BTC_TESTNET_REST;
  const adapter = btcAdapter(restUrl);

  const [utxos, fee] = await Promise.all([adapter.getUtxos(address), adapter.estimateFees('normal')]);
  if (fee.kind !== 'btc') throw new Error('unexpected non-BTC fee estimate');
  const spend: BtcSpendUtxo[] = utxos.map((u) => ({ txid: u.txid, vout: u.vout, value: u.value }));

  const built = buildBtcTransfer({
    publicKey: btcPublicKey(),
    utxos: spend,
    toAddress: opts.to.trim(),
    amountSats: parseSats(opts.btcAmount),
    feeRateSatPerVb: opts.feeRateSatPerVb ?? fee.satPerVByte,
    network: 'testnet',
  });

  const signed = signBitcoinPsbt(built.psbt); // in-browser, with the user's key
  if (!signed.finalized || !signed.txHex) throw new Error('PSBT was not fully signed');
  const { txid } = await adapter.broadcastRawTransaction(signed.txHex);
  return { txid, explorerUrl: `https://mempool.space/testnet/tx/${txid}` };
}

// ── ERC-20 tokens (Sepolia) ──────────────────────────────────────────────────

export interface TokenInfo {
  address: string;
  decimals: number;
}

/** Known ERC-20 tokens on Sepolia (symbol → contract). Circle's official testnet USDC. */
const SEPOLIA_TOKENS: Record<string, TokenInfo> = {
  USDC: { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6 },
};

/** The token registry entry for a symbol, or null if it isn't a known ERC-20. */
export function tokenInfo(symbol: string): TokenInfo | null {
  return SEPOLIA_TOKENS[symbol.toUpperCase()] ?? null;
}

/** The unlocked wallet's live ERC-20 balance (decimal string) on Sepolia. */
export async function getErc20Balance(symbol: string, rpcUrl = DEFAULT_SEPOLIA_RPC): Promise<string> {
  const me = currentIdentity();
  const token = tokenInfo(symbol);
  if (!me || !token) return '0';
  const balances = await evmAdapter('sepolia', rpcUrl).getTokenBalances(me.evm.address, [
    { address: token.address, symbol: symbol.toUpperCase(), decimals: token.decimals },
  ]);
  const bal = balances[0];
  return bal ? floorUnitsToDp(BigInt(bal.amount), token.decimals, Math.min(token.decimals, 6)) : '0';
}

/**
 * Broadcast a REAL ERC-20 transfer on Sepolia: encode transfer(to, amount),
 * estimate gas (a revert here is usually "insufficient token balance"), sign the
 * EIP-1559 contract call in-browser, and send it. `amountBase` is already in the
 * token's base units (the planner used its decimals).
 */
export async function sendErc20Transfer(opts: {
  rpcUrl?: string;
  token: TokenInfo;
  to: string;
  amountBase: string;
  guard?: GuardAck;
}): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertBroadcastAllowed(guardInput('sepolia', opts.to.trim(), opts.guard));
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_SEPOLIA_RPC;
  const info = getChain('sepolia');
  if (info.evmChainId === undefined) throw new Error('sepolia is not an EVM chain');
  const adapter = evmAdapter('sepolia', rpcUrl);

  const data = encodeErc20Transfer(opts.to.trim(), BigInt(opts.amountBase));
  const [nonce, fees] = await Promise.all([adapter.getNonce(me.evm.address), adapter.estimateFees('normal')]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');

  let gasLimit = 100_000n; // safe fallback when the call can't be simulated (e.g. low balance)
  try {
    gasLimit = ((await adapter.estimateGas({ from: me.evm.address, to: opts.token.address, data })) * 12n) / 10n;
  } catch {
    /* keep the fallback and let the node be the final arbiter */
  }

  const tx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit,
    to: opts.token.address,
    value: 0n,
    data,
  };
  const signed = signEvmTransaction(tx); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(signed.raw);
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

// ── Token approvals: read + revoke ───────────────────────────────────────────

/** ~unlimited: many dapps approve 2^256−1; anything ≥ 2^255 is effectively infinite. */
const UNLIMITED_ALLOWANCE = 2n ** 255n;

/** Read the connected wallet's current allowance to `spender` on `token` (via eth_call). */
export async function readErc20Allowance(opts: {
  rpcUrl?: string;
  token: string;
  spender: string;
}): Promise<{ allowance: bigint; unlimited: boolean }> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_SEPOLIA_RPC;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const allowance = await readAllowance(pool, opts.token.trim(), me.evm.address, opts.spender.trim());
  return { allowance, unlimited: allowance >= UNLIMITED_ALLOWANCE };
}

/**
 * Revoke a token approval: sign + broadcast `approve(spender, 0)` in-browser (non-custodial).
 * The tx sets the allowance to zero so the spender can no longer pull the token — the
 * standard defence against a stale/over-broad approval.
 */
export async function sendRevokeApproval(opts: {
  rpcUrl?: string;
  token: string;
  spender: string;
  guard?: GuardAck;
}): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  const token = opts.token.trim();
  const spender = opts.spender.trim();
  assertBroadcastAllowed(guardInput('sepolia', token, opts.guard));
  const info = getChain('sepolia');
  if (info.evmChainId === undefined) throw new Error('sepolia is not an EVM chain');
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_SEPOLIA_RPC;
  const adapter = evmAdapter('sepolia', rpcUrl);

  const data = encodeErc20Approve(spender, 0n);
  const [nonce, fees] = await Promise.all([adapter.getNonce(me.evm.address), adapter.estimateFees('normal')]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');

  let gasLimit = 80_000n; // safe fallback when the call can't be simulated (e.g. low balance)
  try {
    gasLimit = ((await adapter.estimateGas({ from: me.evm.address, to: token, data })) * 12n) / 10n;
  } catch {
    /* keep the fallback and let the node be the final arbiter */
  }

  const tx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit,
    to: token,
    value: 0n,
    data,
  };
  const signed = signEvmTransaction(tx); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(signed.raw);
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

// ── Stuck-transaction recovery ───────────────────────────────────────────────

/**
 * Is a transaction stuck? Compare the mined nonce (`latest`) with the nonce that
 * includes the mempool (`pending`): if `pending > latest`, txs are queued but unmined,
 * and the oldest stuck one sits at nonce = `latest`.
 */
export async function checkStuckTx(opts: { rpcUrl?: string } = {}): Promise<{ pending: number; stuckNonce: number | null }> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_SEPOLIA_RPC;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const [latest, pending] = await Promise.all([
    pool.request<string>('eth_getTransactionCount', [me.evm.address, 'latest']),
    pool.request<string>('eth_getTransactionCount', [me.evm.address, 'pending']),
  ]);
  const latestN = Number(BigInt(latest));
  const count = Number(BigInt(pending)) - latestN;
  return { pending: count, stuckNonce: count > 0 ? latestN : null };
}

/** The stuck tx's OWN EIP-1559 fees (read from the pending block), so a replacement can beat
 *  them by the required ≥110% floor. Null if the pending tx can't be located / has no 1559
 *  fees — the caller then falls back to a market-only bump. */
async function pendingTxFeesAt(
  pool: ProviderPool,
  address: string,
  nonce: number,
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | null> {
  try {
    const block = await pool.request<{
      transactions?: Array<{ from?: string; nonce?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string }>;
    }>('eth_getBlockByNumber', ['pending', true]);
    const mine = (block?.transactions ?? []).find(
      (t) => (t.from ?? '').toLowerCase() === address.toLowerCase() && t.nonce !== undefined && Number(BigInt(t.nonce)) === nonce,
    );
    if (!mine?.maxFeePerGas || !mine.maxPriorityFeePerGas) return null;
    return { maxFeePerGas: BigInt(mine.maxFeePerGas), maxPriorityFeePerGas: BigInt(mine.maxPriorityFeePerGas) };
  } catch {
    return null;
  }
}

/**
 * Cancel the oldest stuck transaction: broadcast a 0-ETH self-transfer at the SAME nonce
 * with a bumped fee (2×), so it outbids the underpriced stuck tx and mines first — which
 * drops the original. The standard "get unstuck" move; non-custodial (signed in-browser).
 */
export async function cancelStuckTx(opts: { chain?: 'sepolia' | 'giwa-sepolia'; rpcUrl?: string; guard?: GuardAck } = {}): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  // The stuck tx sits on a SPECIFIC chain — build the 0-ETH replacement with THAT chain's id, or a
  // GIWA-nonce cancel signed with the Sepolia chainId is invalid and never displaces the real one.
  const chain = opts.chain ?? 'sepolia';
  const rpcUrl = opts.rpcUrl?.trim() || (chain === 'giwa-sepolia' ? DEFAULT_GIWA_RPC : DEFAULT_SEPOLIA_RPC);
  const status = await checkStuckTx({ rpcUrl });
  if (status.stuckNonce === null) throw new Error('No pending transaction to cancel.');
  const stuckNonce = status.stuckNonce;
  assertBroadcastAllowed(guardInput(chain, me.evm.address, opts.guard));
  const info = getChain(chain);
  if (info.evmChainId === undefined) throw new Error(`${chain} is not an EVM chain`);
  const adapter = evmAdapter(chain, rpcUrl);
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const [fees, original] = await Promise.all([
    adapter.estimateFees('fast'),
    pendingTxFeesAt(pool, me.evm.address, stuckNonce),
  ]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');

  // A replacement must beat BOTH the live market (2× fast) AND the stuck tx's OWN fee by
  // ≥110% on maxFeePerGas AND maxPriorityFeePerGas (the EIP-1559 replacement rule). A fixed
  // 2× current can be BELOW a tx first sent when the network was hotter → the node rejects it
  // "replacement transaction underpriced" and the cancel silently fails exactly when needed.
  // Take max(2× fast, 1.2× original) on both fields — comfortably over the 110% floor.
  const bnMax = (a: bigint, b: bigint): bigint => (a > b ? a : b);
  /**
   * 1.2× rounded UP, and never equal to the input. Integer *floor* division silently defeats the
   * bump at small values — floor(v * 12 / 10) === v for every v ≤ 4 — and on an OP-Stack L2 like
   * GIWA a stuck tx's `maxPriorityFeePerGas` really can be a handful of wei. That produced a
   * "replacement" carrying the SAME fee, which the node rejects as underpriced: the cancel fails
   * exactly when it is needed, the very failure this bump exists to prevent.
   */
  const bump = (v: bigint): bigint => {
    const raised = (v * 12n + 9n) / 10n; // ceil(v * 1.2)
    return raised > v ? raised : v + 1n; // guarantee a strict increase
  };
  const maxFeePerGas = original ? bnMax(fees.maxFeePerGas * 2n, bump(original.maxFeePerGas)) : fees.maxFeePerGas * 2n;
  const maxPriorityFeePerGas = original
    ? bnMax(fees.maxPriorityFeePerGas * 2n, bump(original.maxPriorityFeePerGas))
    : fees.maxPriorityFeePerGas * 2n;

  const tx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce: BigInt(stuckNonce),
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit: 21_000n,
    to: me.evm.address, // self-send — moves nothing, just replaces the nonce
    value: 0n,
  };
  const signed = signEvmTransaction(tx); // in-browser, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(signed.raw);
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

// ── Swaps: real Uniswap v3 on Sepolia ────────────────────────────────────────

/** Tokens swappable on Sepolia Uniswap v3 (ETH is routed as WETH). */
const SEPOLIA_SWAP_TOKENS: Record<string, { address: string; decimals: number }> = {
  USDC: { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6 },
  ETH: { address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', decimals: 18 }, // WETH
  WETH: { address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', decimals: 18 },
};

/** Can this pair be swapped on the wired Sepolia Uniswap v3 pools? */
export function isSwappablePair(fromSym: string, toSym: string): boolean {
  return SEPOLIA_SWAP_TOKENS[fromSym.toUpperCase()] !== undefined && SEPOLIA_SWAP_TOKENS[toSym.toUpperCase()] !== undefined;
}

/** True if this is a SOL ⇄ USDC pair our own Solana devnet AMM can settle (dUSDC ≙ USDC on devnet). */
export function isSolammPair(fromSym: string, toSym: string): boolean {
  const isStable = (s: string): boolean => s === 'USDC' || s === 'DUSDC';
  const a = fromSym.toUpperCase();
  const b = toSym.toUpperCase();
  return (a === 'SOL' && isStable(b)) || (isStable(a) && b === 'SOL');
}

export interface SwapQuote {
  amountOut: bigint;
  decimalsOut: number;
  symbolOut: string;
  /** The v3 fee tier (in hundredths of a bip) that gave the best quote. */
  fee: number;
}

/** A REAL Uniswap v3 quote via QuoterV2 eth_call — tries each fee tier, best wins. */
export async function quoteSwap(opts: {
  rpcUrl?: string;
  fromSym: string;
  toSym: string;
  amountInBase: string;
}): Promise<SwapQuote | null> {
  const from = SEPOLIA_SWAP_TOKENS[opts.fromSym.toUpperCase()];
  const to = SEPOLIA_SWAP_TOKENS[opts.toSym.toUpperCase()];
  if (!from || !to) return null;
  const pool = new ProviderPool([new HttpJsonRpcTransport(opts.rpcUrl?.trim() || DEFAULT_SEPOLIA_RPC)]);
  let best: SwapQuote | null = null;
  for (const fee of V3_FEE_TIERS) {
    try {
      const data = encodeQuoteExactInputSingle({ tokenIn: from.address, tokenOut: to.address, amountIn: BigInt(opts.amountInBase), fee });
      const res = await pool.request<string>('eth_call', [{ to: SEPOLIA_UNISWAP.quoterV2, data }, 'latest']);
      const out = decodeQuotedAmountOut(res);
      if (out > 0n && (!best || out > best.amountOut)) best = { amountOut: out, decimalsOut: to.decimals, symbolOut: opts.toSym.toUpperCase(), fee };
    } catch {
      // no pool / no liquidity at this tier — try the next
    }
  }
  return best;
}

/** ERC-20 `allowance(address,address)` selector. */
const SELECTOR_ALLOWANCE = '0xdd62ed3e';
const wordFor = (addr: string): string => addr.toLowerCase().replace(/^0x/u, '').padStart(64, '0');

/** Read the current ERC-20 allowance `token.allowance(owner, spender)` via eth_call. */
async function readAllowance(pool: ProviderPool, token: string, owner: string, spender: string): Promise<bigint> {
  const data = `${SELECTOR_ALLOWANCE}${wordFor(owner)}${wordFor(spender)}`;
  const res = await pool.request<string>('eth_call', [{ to: token, data }, 'latest']);
  return res && res !== '0x' ? BigInt(res) : 0n;
}

/**
 * Poll `eth_getTransactionReceipt` until the tx is mined (or a bounded timeout).
 * Throws if the receipt reports a revert (status 0x0) — so a failed approval is
 * never mistaken for success. Returns nothing; presence of a 0x1 receipt is the win.
 */
async function waitForReceipt(pool: ProviderPool, txid: string, attempts = 45, delayMs = 2_000, label = 'approval'): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const receipt = await pool.request<{ status?: string } | null>('eth_getTransactionReceipt', [txid]);
      if (receipt) {
        if (receipt.status === '0x0') throw new Error(`${label} transaction reverted on-chain`);
        return;
      }
    } catch (e) {
      // A DEFINITIVE revert must still fail. But a TRANSIENT transport error (429 / timeout / blip from
      // a public node under load) must NOT abort the wait — that would surface a plain error after the
      // swap already settled and make the compound RETRYABLE → a double-swap. Keep polling on anything
      // that isn't an on-chain revert.
      if (e instanceof Error && /reverted on-chain/u.test(e.message)) throw e;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  // Name the step that actually failed — this waiter is reused for the SWAP receipt in the
  // convert-and-send flows, where an "approval" message would describe a step the user never did.
  throw new Error(`${label} not confirmed in time — not broadcasting the next step`);
}

/**
 * Execute a REAL Uniswap v3 swap on Sepolia, SETTLEMENT-SAFELY:
 *   1. read the existing allowance; only approve if it's short of amountIn,
 *   2. if approving, WAIT for the approval receipt (a revert throws) — the swap is
 *      NOT broadcast until the router can actually pull the token,
 *   3. eth_call-preflight the swap so a guaranteed revert (e.g. amountOutMin too
 *      high, no liquidity) fails cheaply BEFORE we spend gas on it,
 *   4. sign + broadcast the swap.
 * This prevents the swap from being mined before the approval and reverting while the
 * UI reports success. (On an unfunded wallet step 1's approve reverts for gas — the
 * node's honest answer — and we stop there.)
 */
export async function sendSwap(opts: {
  rpcUrl?: string;
  fromSym: string;
  toSym: string;
  amountInBase: string;
  amountOutMin: bigint;
  fee: number;
  guard?: GuardAck;
}): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertPositiveMinOut(opts.amountOutMin);
  assertBroadcastAllowed(guardInput('sepolia', me.evm.address, opts.guard));
  const from = SEPOLIA_SWAP_TOKENS[opts.fromSym.toUpperCase()];
  const to = SEPOLIA_SWAP_TOKENS[opts.toSym.toUpperCase()];
  if (!from || !to) throw new Error(`can't swap ${opts.fromSym}→${opts.toSym} on Sepolia`);
  const info = getChain('sepolia');
  if (info.evmChainId === undefined) throw new Error('sepolia is not an EVM chain');
  const rpcUrl = opts.rpcUrl?.trim() || DEFAULT_SEPOLIA_RPC;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new EvmAdapter('sepolia', pool);
  const amountIn = BigInt(opts.amountInBase);

  const [nonce0, fees, allowance] = await Promise.all([
    adapter.getNonce(me.evm.address),
    adapter.estimateFees('normal'),
    readAllowance(pool, from.address, me.evm.address, SEPOLIA_UNISWAP.swapRouter02),
  ]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');
  let gasPrice = { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };

  let nonce = nonce0;
  // 1+2) approve ONLY if the current allowance is short, then WAIT for it to confirm.
  if (allowance < amountIn) {
    const approveTx: Eip1559Transaction = {
      chainId: info.evmChainId,
      nonce,
      ...gasPrice,
      gasLimit: 60_000n,
      to: from.address,
      value: 0n,
      data: encodeErc20Approve(SEPOLIA_UNISWAP.swapRouter02, amountIn),
    };
    const approve = await adapter.broadcastRawTransaction(signEvmTransaction(approveTx).raw);
    await waitForReceipt(pool, approve.txid); // throws on revert / timeout — swap won't fire
    nonce = nonce + 1n;
    // Fees can drift during the approval wait (~up to 90s) — re-estimate so the swap tx
    // isn't underpriced and stuck behind the just-confirmed approval.
    const fresh = await adapter.estimateFees('normal');
    if (fresh.kind === 'evm') gasPrice = { maxFeePerGas: fresh.maxFeePerGas, maxPriorityFeePerGas: fresh.maxPriorityFeePerGas };
  }

  const swapData = encodeExactInputSingle({
    tokenIn: from.address,
    tokenOut: to.address,
    fee: opts.fee,
    recipient: me.evm.address,
    amountIn,
    amountOutMinimum: opts.amountOutMin,
  });

  // 3) preflight: a guaranteed revert fails here (cheap) instead of on-chain (gas burned).
  try {
    await pool.request<string>('eth_call', [{ from: me.evm.address, to: SEPOLIA_UNISWAP.swapRouter02, data: swapData }, 'latest']);
  } catch (err) {
    throw new Error(`swap would revert (${err instanceof Error ? err.message : 'simulation failed'}) — not broadcasting`);
  }

  // 4) sign + broadcast the swap.
  const swapTx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce,
    ...gasPrice,
    gasLimit: 300_000n,
    to: SEPOLIA_UNISWAP.swapRouter02,
    value: 0n,
    data: swapData,
  };
  const { txid } = await adapter.broadcastRawTransaction(signEvmTransaction(swapTx).raw);
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

// ── The bridge: execute an AI-planned transfer (native or token) with the wallet ─

/**
 * Convert a non-negative decimal amount string to integer base units (bigint STRING)
 * for `decimals`. STRICT: rejects anything that isn't a plain non-negative decimal — a
 * stray second '.', a sign, an exponent, thousands separators, or letters — so a
 * malformed input like "1.05.5" or "-0.5" can never silently produce the WRONG amount.
 * The old split-on-'.' parser dropped the extra segment ("1.05.5" → 1.05) and lost the
 * sign ("-0.5" → +0.5), so the on-chain value could diverge from the amount the user
 * saw in the review panel. Sub-unit precision beyond `decimals` is truncated (not
 * representable on-chain). The single amount parser — `parseEther`/`parseLamports`/
 * `parseSats` and the send/bridge path all route through here.
 */
export function decimalToBase(input: string, decimals: number): string {
  const s = input.trim();
  if (!/^\d*\.?\d*$/u.test(s) || s === '' || s === '.') {
    throw new Error(`invalid amount "${input}" — expected a non-negative decimal`);
  }
  const [whole = '', frac = ''] = s.split('.');
  const fracPadded = (frac.slice(0, decimals) + '0'.repeat(decimals)).slice(0, decimals);
  return (BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0')).toString();
}

/** Convert an integer base-unit amount (wei/lamports/sats) to a decimal string. */
export function baseToDecimal(base: string, decimals: number): string {
  const neg = base.startsWith('-');
  const digits = (neg ? base.slice(1) : base).replace(/^0+(?=\d)/, '').padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return (neg ? '-' : '') + (frac ? `${whole}.${frac}` : whole);
}

/** The native testnet asset symbols the browser wallet can actually sign + broadcast. */
const NATIVE_DECIMALS: Record<string, number> = { ETH: 18, SOL: 9, BTC: 8 };

/** Can this planned asset be executed in-browser today (native transfer or known ERC-20)? */
export function isExecutableAsset(asset: string): boolean {
  return asset.toUpperCase() in NATIVE_DECIMALS || tokenInfo(asset) !== null;
}

/** The unlocked wallet's live testnet balance for a planned asset (native or token), or null. */
export async function balanceForAsset(asset: string): Promise<{ amount: string; symbol: string } | null> {
  const a = asset.toUpperCase();
  if (tokenInfo(a)) return { amount: await getErc20Balance(a), symbol: a };
  // ETH transfers settle on GIWA when an IntentExecutor is configured, so read the GIWA balance there.
  if (a === 'ETH')
    return GIWA_INTENT_EXECUTOR
      ? { amount: await getEvmTestnetBalance('giwa-sepolia', DEFAULT_GIWA_RPC), symbol: 'ETH' }
      : { amount: await getEvmTestnetBalance('sepolia'), symbol: 'ETH' };
  // SOL sends settle on mainnet in Mainnet mode, so read the balance from the network the send will use —
  // showing the devnet balance under a "Solana mainnet" label would be dishonest.
  if (a === 'SOL') return { amount: await getSolTestnetBalance(getNetworkMode() === 'mainnet' ? DEFAULT_SOLANA_MAINNET_RPC : DEFAULT_DEVNET_RPC), symbol: 'SOL' };
  if (a === 'BTC') return { amount: await getBtcTestnetBalance(), symbol: 'BTC' };
  return null;
}

/**
 * Execute a planned transfer step with the REAL wallet: map the asset to its
 * testnet, convert the base-unit amount to decimal, and route through the same
 * in-browser sign+broadcast path used by the manual send. This is the bridge that
 * turns "AI plans your intent" from a demo into a real, non-custodial transaction —
 * the planner proposes {asset, amountBase, to}; the device signs and disposes.
 */
export async function executeTransferStep(step: {
  asset: string;
  amountBase: string;
  to: string;
  /** Target EVM chain for the transfer (default sepolia testnet). Mainnet requires `guard`. */
  chain?: ChainId;
  rpcUrl?: string;
  guard?: GuardAck;
}): Promise<EvmSendResult> {
  const asset = step.asset.toUpperCase();
  const to = step.to.trim();
  const g = step.guard ? { guard: step.guard } : {};
  // giwa-sepolia is a testnet (like sepolia) — only ethereum/etc. count as mainnet here.
  // "Mainnet" iff the REGISTRY says the chain is not a testnet — the source of truth. The old
  // sepolia/giwa-only allowlist wrongly flagged solana-devnet + bitcoin-testnet as mainnet, so a DEVNET
  // SOL/BTC send (even fully funded) hit the "isn't wired on mainnet" throw and never broadcast.
  const onMainnet = step.chain !== undefined && !getChain(step.chain).testnet;
  const token = tokenInfo(asset);
  if (token) {
    // ERC-20 addresses are only mapped on Sepolia today. A mainnet ERC-20 transfer needs a
    // verified mainnet token map (a wrong address burns real funds) — refuse honestly, don't fake.
    if (onMainnet) throw new Error(`${asset} transfers on ${step.chain} aren't wired yet — this build sends ${asset} on Sepolia. Use the native asset for mainnet.`);
    return sendErc20Transfer({ token, to, amountBase: step.amountBase, ...g });
  }
  const decimals = NATIVE_DECIMALS[asset];
  if (decimals === undefined) throw new Error(`${asset} isn't an asset this wallet can broadcast yet`);
  const amount = baseToDecimal(step.amountBase, decimals);
  if (asset === 'ETH') {
    // GIWA: settle native ETH THROUGH the on-chain IntentExecutor contract (emits a
    // verifiable IntentExecuted event) rather than a plain send, when one is configured.
    if (step.chain === 'giwa-sepolia' && GIWA_INTENT_EXECUTOR) {
      return executeIntentOnGiwa({ to, ethAmount: amount, ...(step.rpcUrl ? { rpcUrl: step.rpcUrl } : {}), ...g });
    }
    // ETH is native → no token address to get wrong. Real on Sepolia (testnet) or Ethereum
    // mainnet (real funds, gated by the guard's acknowledgeMainnet + spend cap).
    return sendEvmTransfer({ to, ethAmount: amount, ...(step.chain ? { chain: step.chain } : {}), ...(step.rpcUrl ? { rpcUrl: step.rpcUrl } : {}), ...g });
  }
  // Native SOL on Solana MAINNET — real funds, gated by the guard (acknowledgeMainnet + spend cap). SOL is
  // native (no token address to get wrong) and the transfer is self-built (the guard validates recipient +
  // amount), so the mainnet path is safe to wire.
  if (asset === 'SOL' && step.chain === 'solana') {
    return sendSolTransfer({ to, solAmount: amount, chain: 'solana', ...(step.rpcUrl ? { rpcUrl: step.rpcUrl } : {}), ...g });
  }
  // BTC native is still devnet/testnet only; its mainnet RPC path isn't built.
  if (onMainnet) throw new Error(`${asset} on mainnet isn't wired yet — this build broadcasts ${asset} on its testnet/devnet.`);
  if (asset === 'SOL') return sendSolTransfer({ to, solAmount: amount, ...g });
  return sendBtcTransfer({ to, btcAmount: amount, ...g });
}
