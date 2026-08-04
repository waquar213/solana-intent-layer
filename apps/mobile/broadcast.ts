/**
 * Real broadcast — the last mile, on the phone. The wallet signs entirely on-device
 * (non-custodial, via @intent-wallet/core), and here we push the signed transaction to a
 * real testnet node over the fetch-based `@intent-wallet/chains` adapters. For EVM this
 * reads the live nonce + fees from the RPC, signs a real EIP-1559 transaction with the
 * unlocked wallet, and calls `eth_sendRawTransaction` — a genuine on-chain broadcast (given
 * a funded address). Endpoints are overridable via EXPO_PUBLIC_* env vars.
 *
 * This is a faithful port of apps/web/src/broadcast.ts — identical logic, only the env
 * accessor differs (Expo's process.env.EXPO_PUBLIC_* vs Vite's import.meta.env.VITE_*).
 */
import {
  BitcoinAdapter,
  EvmAdapter,
  HttpJsonRpcTransport,
  HttpRestTransport,
  ProviderPool,
  SolanaAdapter,
  assertBroadcastAllowed,
  assembleSolTransaction,
  buildBtcTransfer,
  buildSolTransferMessage,
  buildSplTransferMessage,
  decodeQuotedAmountOut,
  encodeErc20Approve,
  encodeErc20Transfer,
  encodeExactInputSingle,
  encodeQuoteExactInputSingle,
  getChain,
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
import { btcExplorerTx, isMainnet, netCfg, solExplorerTx } from './network';
import { timedFetch } from './api';
import { knownGoodAddresses } from './recents';

// Each default falls back to a public, keyless endpoint but can be overridden by an
// EXPO_PUBLIC_* env var (in a gitignored .env) to use your own keyed node.
/** A public Sepolia RPC that permits browser/RN fetch. Override with your own for reliability. */
export const DEFAULT_SEPOLIA_RPC = process.env.EXPO_PUBLIC_SEPOLIA_RPC ?? 'https://ethereum-sepolia-rpc.publicnode.com';
/** The Solana devnet RPC (public default; override with a keyed node for reliable sendTransaction). */
export const DEFAULT_DEVNET_RPC = process.env.EXPO_PUBLIC_SOLANA_DEVNET_RPC ?? 'https://api.devnet.solana.com';
/** A Bitcoin testnet esplora REST API (public default). */
export const DEFAULT_BTC_TESTNET_REST = process.env.EXPO_PUBLIC_BTC_TESTNET_REST ?? 'https://blockstream.info/testnet/api';

/**
 * Optional caller confirmation for the mainnet guardrails. The wallet is testnet-only
 * today, so this is normally absent and the guard simply validates the recipient.
 */
export interface GuardAck {
  acknowledgeMainnet?: boolean;
  acknowledgeHighValue?: boolean;
  /** The transfer's USD value, when known — enables the mainnet spend cap. */
  amountUsd?: number;
}

/** Build a guard input, threading only the acks that are actually set
 *  (exactOptionalPropertyTypes forbids explicit `undefined`). */
function guardInput(chain: ChainId, toAddress: string, ack?: GuardAck): BroadcastGuardInput {
  // Saved contacts + prior recipients are the reference set the ADDRESS-POISONING check measures a
  // lookalike against. Mobile passed nothing here, so that check could never fire on this platform
  // even though the guard implements it — the protection was silently web-only.
  const known = knownGoodAddresses();
  return {
    chain,
    toAddress,
    ...(known.length > 0 ? { knownAddresses: known } : {}),
    ...(ack?.amountUsd !== undefined ? { amountUsd: ack.amountUsd } : {}),
    ...(ack?.acknowledgeMainnet !== undefined ? { acknowledgeMainnet: ack.acknowledgeMainnet } : {}),
    ...(ack?.acknowledgeHighValue !== undefined ? { acknowledgeHighValue: ack.acknowledgeHighValue } : {}),
  };
}

/** Parse a decimal ETH string into exact wei (bigint) — no float rounding. */
export function parseEther(input: string): bigint {
  const [whole = '0', frac = ''] = input.trim().split('.');
  const fracPadded = (frac + '0'.repeat(18)).slice(0, 18);
  return BigInt(whole || '0') * 10n ** 18n + BigInt(fracPadded || '0');
}

function evmAdapter(chain: ChainId, rpcUrl: string): EvmAdapter {
  return new EvmAdapter(chain, new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]));
}

export interface EvmSendResult {
  txid: string;
  explorerUrl: string;
}

/** The unlocked wallet's live native balance on the ACTIVE network's EVM chain, as a decimal string. */
/**
 * Format a base-unit bigint to `dp` decimals by TRUNCATING (never rounding up) — string math, no float.
 * .toFixed() rounds HALF-UP, so 0.9999995 ETH would display "1.000000"; that overstated string then
 * feeds "Max" and the over-balance check and yields an unsendable amount that fails at the node. Ported
 * from web (apps/web/src/broadcast.ts) so mobile balances stay honest and ≤ the real holding.
 */
export function floorUnitsToDp(base: bigint, decimals: number, dp: number): string {
  const neg = base < 0n;
  const digits = (neg ? -base : base).toString().padStart(decimals + 1, '0');
  const intPart = digits.slice(0, digits.length - decimals);
  const frac = (decimals > 0 ? digits.slice(digits.length - decimals) : '').slice(0, dp).padEnd(dp, '0');
  const s = dp > 0 ? `${intPart}.${frac}` : intPart;
  return neg ? `-${s}` : s;
}

export async function getEvmTestnetBalance(chain: ChainId = netCfg().evm.chain, rpcUrl: string = netCfg().evm.rpc): Promise<string> {
  const me = currentIdentity();
  if (!me) return '0';
  const wei = await evmAdapter(chain, rpcUrl).getNativeBalance(me.evm.address);
  return floorUnitsToDp(BigInt(wei), 18, 6);
}

/**
 * Broadcast a REAL native transfer on an EVM testnet from the unlocked wallet: live nonce +
 * fees from the RPC → sign the EIP-1559 tx on-device → send the raw bytes → return the txid
 * + explorer link. Throws the node's real error (e.g. "insufficient funds") if the address
 * isn't funded — which itself proves the path reached the actual chain.
 */
export async function sendEvmTransfer(opts: {
  chain?: ChainId;
  rpcUrl?: string;
  to: string;
  ethAmount: string;
  guard?: GuardAck;
}): Promise<EvmSendResult> {
  const chain = opts.chain ?? netCfg().evm.chain;
  const rpcUrl = opts.rpcUrl?.trim() || netCfg().evm.rpc;
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertBroadcastAllowed(guardInput(chain, opts.to.trim(), opts.guard));

  const info = getChain(chain);
  if (info.evmChainId === undefined) throw new Error(`${chain} is not an EVM chain`);

  const adapter = evmAdapter(chain, rpcUrl);
  const [nonce, fees] = await Promise.all([adapter.getNonce(me.evm.address), adapter.estimateFees('normal')]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');

  const value = parseEther(opts.ethAmount);
  // 21_000 is the base cost ONLY for an EOA recipient. A CONTRACT recipient (a Safe, an exchange
  // deposit address, any address with a receive()/fallback) runs code on receipt and needs more — a
  // fixed 21k would guarantee an out-of-gas revert that burns the fee and moves nothing, while the UI
  // still shows "Sent ✓" (mempool acceptance). Estimate with 20% headroom; keep 21k as the fallback.
  let gasLimit = 21_000n;
  try {
    gasLimit = ((await adapter.estimateGas({ from: me.evm.address, to: opts.to.trim(), value })) * 12n) / 10n;
  } catch {
    /* estimation unavailable — keep the 21k fallback and let the node be the final arbiter */
  }
  const tx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit,
    to: opts.to.trim(),
    value,
  };
  const signed = signEvmTransaction(tx); // on-device, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(signed.raw);
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

// ── Solana devnet ────────────────────────────────────────────────────────────

/** Parse a decimal SOL string into exact lamports (bigint, 9 decimals). */
export function parseLamports(input: string): bigint {
  const [whole = '0', frac = ''] = input.trim().split('.');
  const fracPadded = (frac + '0'.repeat(9)).slice(0, 9);
  return BigInt(whole || '0') * 1_000_000_000n + BigInt(fracPadded || '0');
}

/** The unlocked wallet's live SOL balance on the active network's Solana cluster, as a decimal string. */
export async function getSolTestnetBalance(rpcUrl: string = netCfg().sol.rpc): Promise<string> {
  const me = currentIdentity();
  if (!me) return '0';
  const adapter = new SolanaAdapter(netCfg().sol.chain, new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]));
  const lamports = await adapter.getNativeBalance(me.sol.address);
  return floorUnitsToDp(BigInt(lamports), 9, 6);
}

/**
 * Broadcast a REAL native SOL transfer on devnet: fetch a recent blockhash → compile the
 * transfer message → sign it on-device with the wallet's ed25519 key → assemble and send the
 * wire transaction. Returns the signature + explorer link.
 */
export async function sendSolTransfer(opts: { rpcUrl?: string; to: string; solAmount: string; guard?: GuardAck }): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  assertBroadcastAllowed(guardInput(netCfg().sol.chain, opts.to.trim(), opts.guard));
  const rpcUrl = opts.rpcUrl?.trim() || netCfg().sol.rpc;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new SolanaAdapter(netCfg().sol.chain, pool);

  const bh = await pool.request<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const message = buildSolTransferMessage({
    fromPubkey: solPublicKey(),
    toAddress: opts.to.trim(),
    lamports: parseLamports(opts.solAmount),
    recentBlockhash: bh.value.blockhash,
  });
  const signature = signSolanaMessage(message); // on-device, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(assembleSolTransaction(message, signature));
  return { txid, explorerUrl: solExplorerTx(txid) };
}

/** Known SPL tokens per cluster (symbol → mint + decimals). Canonical, verified mints. */
const SPL_TOKENS: Record<'mainnet' | 'devnet', Record<string, { mint: string; decimals: number }>> = {
  // Circle's official mainnet USDC mint.
  mainnet: { USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 } },
  // A real devnet USDC mint (6 decimals) — confirmed to exist via getAccountInfo.
  devnet: { USDC: { mint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', decimals: 6 } },
};

/** The SPL token entry for a symbol on the ACTIVE cluster, or null. */
export function splToken(symbol: string): { mint: string; decimals: number } | null {
  return SPL_TOKENS[netCfg().sol.cluster][symbol.toUpperCase()] ?? null;
}

/**
 * Broadcast a REAL SPL token transfer on devnet: fetch a recent blockhash, build a message
 * that idempotently creates the recipient's ATA and does a checked transfer from the
 * sender's ATA, sign it on-device with the wallet's ed25519 key, and send it. `amountBase`
 * is in the token's base units.
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
  assertBroadcastAllowed(guardInput(netCfg().sol.chain, opts.toOwner.trim(), opts.guard));
  const rpcUrl = opts.rpcUrl?.trim() || netCfg().sol.rpc;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new SolanaAdapter(netCfg().sol.chain, pool);

  const bh = await pool.request<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const { message } = buildSplTransferMessage({
    ownerPubkey: solPublicKey(),
    mint: opts.mint,
    toOwner: opts.toOwner.trim(),
    amount: BigInt(opts.amountBase),
    decimals: opts.decimals,
    recentBlockhash: bh.value.blockhash,
  });
  const sig = signSolanaMessage(message); // on-device, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(assembleSolTransaction(message, sig));
  return { txid, explorerUrl: solExplorerTx(txid) };
}

// ── Bitcoin testnet ──────────────────────────────────────────────────────────

/** Parse a decimal BTC string into exact satoshis (bigint, 8 decimals). */
export function parseSats(input: string): bigint {
  const [whole = '0', frac = ''] = input.trim().split('.');
  const fracPadded = (frac + '0'.repeat(8)).slice(0, 8);
  return BigInt(whole || '0') * 100_000_000n + BigInt(fracPadded || '0');
}

function btcAdapter(restUrl: string): BitcoinAdapter {
  return new BitcoinAdapter(netCfg().btc.chain, new HttpRestTransport(restUrl));
}

/** The wallet's own P2WPKH address on testnet (its BTC key, `tb1q…`-encoded). */
export function btcTestnetAddress(): string | null {
  const me = currentIdentity();
  if (!me) return null;
  return p2wpkhAddressFor(btcPublicKey(), 'testnet');
}

/**
 * The wallet's own P2WPKH address on the ACTIVE network — `bc1…` on mainnet (the identity's
 * canonical BTC address, from the same key) or `tb1…` on testnet. Same key, network-specific
 * encoding — so switching networks never changes ownership, only the address form.
 */
export function btcActiveAddress(): string | null {
  const me = currentIdentity();
  if (!me) return null;
  return netCfg().btc.network === 'mainnet' ? me.btc.address : p2wpkhAddressFor(btcPublicKey(), 'testnet');
}

/** The unlocked wallet's live native BTC balance on the active network, as a decimal string. */
export async function getBtcTestnetBalance(restUrl: string = netCfg().btc.rest): Promise<string> {
  const address = btcActiveAddress();
  if (!address) return '0';
  const sats = await btcAdapter(restUrl).getNativeBalance(address);
  return floorUnitsToDp(BigInt(sats), 8, 8);
}

/**
 * Broadcast a REAL native BTC transfer on testnet: fetch the address's UTXOs + the live fee
 * rate → build an unsigned P2WPKH PSBT (coin selection, fee, change) → sign + finalize it
 * on-device with the wallet's key → push the raw tx to the esplora node. Returns the txid +
 * explorer link. Throws the node's real error (or "insufficient funds").
 */
export async function sendBtcTransfer(opts: {
  restUrl?: string;
  to: string;
  btcAmount: string;
  feeRateSatPerVb?: number;
  guard?: GuardAck;
}): Promise<EvmSendResult> {
  const address = btcActiveAddress();
  if (!address) throw new Error('Unlock your wallet first.');
  assertBroadcastAllowed(guardInput(netCfg().btc.chain, opts.to.trim(), opts.guard));
  const restUrl = opts.restUrl?.trim() || netCfg().btc.rest;
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
    network: netCfg().btc.network,
  });

  const signed = signBitcoinPsbt(built.psbt); // on-device, with the user's key
  if (!signed.finalized || !signed.txHex) throw new Error('PSBT was not fully signed');
  const { txid } = await adapter.broadcastRawTransaction(signed.txHex);
  return { txid, explorerUrl: btcExplorerTx(txid) };
}

// ── ERC-20 tokens (Sepolia) ──────────────────────────────────────────────────

export interface TokenInfo {
  address: string;
  decimals: number;
}

/** Known ERC-20 tokens per network (symbol → contract). Circle's official USDC on each. */
const EVM_TOKENS: Record<'ethereum' | 'sepolia', Record<string, TokenInfo>> = {
  ethereum: { USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 } },
  sepolia: { USDC: { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6 } },
};

/** The token registry entry for a symbol on the ACTIVE network's EVM chain, or null. */
export function tokenInfo(symbol: string): TokenInfo | null {
  const chain = netCfg().evm.chain === 'ethereum' ? 'ethereum' : 'sepolia';
  return EVM_TOKENS[chain][symbol.toUpperCase()] ?? null;
}

/** The unlocked wallet's live ERC-20 balance (decimal string) on the active network. */
export async function getErc20Balance(symbol: string, rpcUrl: string = netCfg().evm.rpc): Promise<string> {
  const me = currentIdentity();
  const token = tokenInfo(symbol);
  if (!me || !token) return '0';
  const balances = await evmAdapter(netCfg().evm.chain, rpcUrl).getTokenBalances(me.evm.address, [
    { address: token.address, symbol: symbol.toUpperCase(), decimals: token.decimals },
  ]);
  // The adapter DROPS a per-token read that failed (network/RPC), so `undefined` here means the read
  // failed — NOT a genuine zero (a real 0 balance comes back as a defined entry with amount '0').
  // Throw so callers treat it as "balance unknown" (fail-soft) instead of a fabricated 0 that would
  // wrongly block a legitimate token send.
  const bal = balances[0];
  if (!bal) throw new Error(`Couldn't read ${symbol.toUpperCase()} balance — try again.`);
  return floorUnitsToDp(BigInt(bal.amount), token.decimals, Math.min(token.decimals, 6));
}

/**
 * Broadcast a REAL ERC-20 transfer on Sepolia: encode transfer(to, amount), estimate gas (a
 * revert here is usually "insufficient token balance"), sign the EIP-1559 contract call
 * on-device, and send it. `amountBase` is already in the token's base units.
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
  const evmChain = netCfg().evm.chain;
  assertBroadcastAllowed(guardInput(evmChain, opts.to.trim(), opts.guard));
  const rpcUrl = opts.rpcUrl?.trim() || netCfg().evm.rpc;
  const info = getChain(evmChain);
  if (info.evmChainId === undefined) throw new Error(`${evmChain} is not an EVM chain`);
  const adapter = evmAdapter(evmChain, rpcUrl);

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
  const signed = signEvmTransaction(tx); // on-device, with the user's key
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
  const rpcUrl = opts.rpcUrl?.trim() || netCfg().evm.rpc;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const allowance = await readAllowance(pool, opts.token.trim(), me.evm.address, opts.spender.trim());
  return { allowance, unlimited: allowance >= UNLIMITED_ALLOWANCE };
}

/**
 * Revoke a token approval: sign + broadcast `approve(spender, 0)` on-device (non-custodial).
 * The tx sets the allowance to zero so the spender can no longer pull the token.
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
  const evmChain = netCfg().evm.chain;
  assertBroadcastAllowed(guardInput(evmChain, token, opts.guard));
  const info = getChain(evmChain);
  if (info.evmChainId === undefined) throw new Error(`${evmChain} is not an EVM chain`);
  const rpcUrl = opts.rpcUrl?.trim() || netCfg().evm.rpc;
  const adapter = evmAdapter(evmChain, rpcUrl);

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
  const signed = signEvmTransaction(tx); // on-device, with the user's key
  const { txid } = await adapter.broadcastRawTransaction(signed.raw);
  return { txid, explorerUrl: `${info.explorerUrl}/tx/${txid}` };
}

// ── Stuck-transaction recovery ───────────────────────────────────────────────

/**
 * Is a transaction stuck? Compare the mined nonce (`latest`) with the nonce that includes
 * the mempool (`pending`): if `pending > latest`, txs are queued but unmined, and the oldest
 * stuck one sits at nonce = `latest`.
 */
export async function checkStuckTx(opts: { rpcUrl?: string } = {}): Promise<{ pending: number; stuckNonce: number | null }> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  const rpcUrl = opts.rpcUrl?.trim() || netCfg().evm.rpc;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const [latest, pending] = await Promise.all([
    pool.request<string>('eth_getTransactionCount', [me.evm.address, 'latest']),
    pool.request<string>('eth_getTransactionCount', [me.evm.address, 'pending']),
  ]);
  const latestN = Number(BigInt(latest));
  const count = Number(BigInt(pending)) - latestN;
  return { pending: count, stuckNonce: count > 0 ? latestN : null };
}

/**
 * Cancel the oldest stuck transaction: broadcast a 0-ETH self-transfer at the SAME nonce
 * with a bumped fee (2×), so it outbids the underpriced stuck tx and mines first — which
 * drops the original. Non-custodial (signed on-device).
 */
export async function cancelStuckTx(opts: { rpcUrl?: string; guard?: GuardAck } = {}): Promise<EvmSendResult> {
  const me = currentIdentity();
  if (!me) throw new Error('Unlock your wallet first.');
  const status = await checkStuckTx({ ...(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}) });
  if (status.stuckNonce === null) throw new Error('No pending transaction to cancel.');
  const evmChain = netCfg().evm.chain;
  assertBroadcastAllowed(guardInput(evmChain, me.evm.address, opts.guard));
  const info = getChain(evmChain);
  if (info.evmChainId === undefined) throw new Error(`${evmChain} is not an EVM chain`);
  const rpcUrl = opts.rpcUrl?.trim() || netCfg().evm.rpc;
  const adapter = evmAdapter(evmChain, rpcUrl);
  const fees = await adapter.estimateFees('fast');
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');

  const tx: Eip1559Transaction = {
    chainId: info.evmChainId,
    nonce: BigInt(status.stuckNonce),
    maxFeePerGas: fees.maxFeePerGas * 2n, // outbid the underpriced stuck tx
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas * 2n,
    gasLimit: 21_000n,
    to: me.evm.address, // self-send — moves nothing, just replaces the nonce
    value: 0n,
  };
  const signed = signEvmTransaction(tx); // on-device, with the user's key
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

/** Can this pair be swapped? Only on testnet — mainnet Uniswap routing isn't wired yet (honest). */
export function isSwappablePair(fromSym: string, toSym: string): boolean {
  if (isMainnet()) return false;
  return SEPOLIA_SWAP_TOKENS[fromSym.toUpperCase()] !== undefined && SEPOLIA_SWAP_TOKENS[toSym.toUpperCase()] !== undefined;
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
  if (isMainnet()) return null; // mainnet swap routing not wired — honest no-quote
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
 * Poll `eth_getTransactionReceipt` until the tx is mined (or a bounded timeout). Throws if
 * the receipt reports a revert (status 0x0) — so a failed approval is never mistaken for
 * success. Returns nothing; presence of a 0x1 receipt is the win.
 */
async function waitForReceipt(pool: ProviderPool, txid: string, attempts = 45, delayMs = 2_000): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const receipt = await pool.request<{ status?: string } | null>('eth_getTransactionReceipt', [txid]);
    if (receipt) {
      if (receipt.status === '0x0') throw new Error('approval transaction reverted on-chain');
      return;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('approval not confirmed in time — not broadcasting the swap');
}

/**
 * Execute a REAL Uniswap v3 swap on Sepolia, SETTLEMENT-SAFELY:
 *   1. read the existing allowance; only approve if it's short of amountIn,
 *   2. if approving, WAIT for the approval receipt (a revert throws) — the swap is NOT
 *      broadcast until the router can actually pull the token,
 *   3. eth_call-preflight the swap so a guaranteed revert fails cheaply BEFORE gas,
 *   4. sign + broadcast the swap.
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
  if (isMainnet()) throw new Error('Swaps are available on testnet only right now — switch to Testnet to swap.');
  // Defense-in-depth slippage floor (parity with web's assertPositiveMinOut): a non-positive
  // amountOutMinimum means "accept any output", disabling slippage/MEV protection. The UI always
  // computes a positive minOut, but a dust swap (amountOut ≤ 1 base unit) can round it to 0 — refuse.
  if (opts.amountOutMin <= 0n) throw new Error('slippage floor (amountOutMin) must be a positive amount');
  assertBroadcastAllowed(guardInput('sepolia', me.evm.address, opts.guard));
  const from = SEPOLIA_SWAP_TOKENS[opts.fromSym.toUpperCase()];
  const to = SEPOLIA_SWAP_TOKENS[opts.toSym.toUpperCase()];
  if (!from || !to) throw new Error(`can't swap ${opts.fromSym}→${opts.toSym} on Sepolia`);
  const info = getChain('sepolia');
  if (info.evmChainId === undefined) throw new Error('sepolia is not an EVM chain');
  const rpcUrl = opts.rpcUrl?.trim() || netCfg().evm.rpc;
  const pool = new ProviderPool([new HttpJsonRpcTransport(rpcUrl)]);
  const adapter = new EvmAdapter('sepolia', pool);
  const amountIn = BigInt(opts.amountInBase);

  const [nonce0, fees, allowance] = await Promise.all([
    adapter.getNonce(me.evm.address),
    adapter.estimateFees('normal'),
    readAllowance(pool, from.address, me.evm.address, SEPOLIA_UNISWAP.swapRouter02),
  ]);
  if (fees.kind !== 'evm') throw new Error('unexpected non-EVM fee estimate');
  const gasPrice = { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };

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

/** Convert a decimal amount string to integer base units (bigint string) for `decimals`.
 *  STRICT (ported verbatim from apps/web/src/broadcast.ts): a malformed amount is REJECTED, never
 *  silently mis-parsed — the old split-on-`.` parser turned "1.05.5"→1.05 (dropped ".5"), "-0.5"→+0.5
 *  (lost the sign), "0x10"→16, ""→0. The UI gates amounts, but the on-chain value must never diverge
 *  from what the user saw, so the guard belongs at the parser boundary too (defense-in-depth). */
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

/** The native testnet asset symbols the wallet can actually sign + broadcast. */
const NATIVE_DECIMALS: Record<string, number> = { ETH: 18, SOL: 9, BTC: 8 };

/** Can this planned asset be executed on-device today (native transfer or known ERC-20)? */
export function isExecutableAsset(asset: string): boolean {
  return asset.toUpperCase() in NATIVE_DECIMALS || tokenInfo(asset) !== null;
}

/** Best-effort USD spot for an asset (native via CoinGecko; USD stablecoins ≈ 1). null on failure. */
export async function spotUsd(symbol: string): Promise<number | null> {
  const s = symbol.toUpperCase();
  if (s === 'USDC' || s === 'USDT' || s === 'DAI') return 1;
  const id = s === 'ETH' ? 'ethereum' : s === 'SOL' ? 'solana' : s === 'BTC' ? 'bitcoin' : null;
  if (!id) return null;
  try {
    const res = await timedFetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, {}, 8000);
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, { usd?: number }>;
    return j[id]?.usd ?? null;
  } catch {
    return null;
  }
}

/**
 * Best-effort USD value of a send (base-unit amount). Powers the mainnet high-value spend-cap
 * confirmation: on mainnet a transfer above the guard's cap needs a second, explicit acknowledgement.
 * Returns null if the price or decimals are unknown — the caller then falls back to the base
 * mainnet ack (fail-open on the *secondary* cap only; the primary mainnet ack always applies).
 */
export async function estimateSendUsd(asset: string, amountBase: string): Promise<number | null> {
  const a = asset.toUpperCase();
  const dec = tokenInfo(a)?.decimals ?? NATIVE_DECIMALS[a];
  if (dec === undefined) return null;
  const px = await spotUsd(a);
  if (px == null) return null;
  const n = Number(BigInt(amountBase)) / 10 ** dec;
  return Number.isFinite(n) ? n * px : null;
}

/** Best-effort USD value of a send given a DECIMAL amount string (the manual Send wizard's form). */
export async function estimateUsdDecimal(symbol: string, amountDecimal: string): Promise<number | null> {
  const px = await spotUsd(symbol);
  if (px == null) return null;
  const n = Number(amountDecimal);
  return Number.isFinite(n) ? n * px : null;
}

/** The unlocked wallet's live testnet balance for a planned asset (native or token), or null. */
export async function balanceForAsset(asset: string): Promise<{ amount: string; symbol: string } | null> {
  const a = asset.toUpperCase();
  if (tokenInfo(a)) return { amount: await getErc20Balance(a), symbol: a };
  if (a === 'ETH') return { amount: await getEvmTestnetBalance(), symbol: 'ETH' };
  if (a === 'SOL') return { amount: await getSolTestnetBalance(), symbol: 'SOL' };
  if (a === 'BTC') return { amount: await getBtcTestnetBalance(), symbol: 'BTC' };
  return null;
}

/**
 * Execute a planned transfer step with the REAL wallet: map the asset to its testnet,
 * convert the base-unit amount to decimal, and route through the same on-device sign+broadcast
 * path used by the manual send. This is the bridge that turns "AI plans your intent" from a
 * demo into a real, non-custodial transaction — the planner proposes {asset, amountBase, to};
 * the device signs and disposes.
 */
export async function executeTransferStep(
  step: { asset: string; amountBase: string; to: string },
  guard?: GuardAck,
): Promise<EvmSendResult> {
  const asset = step.asset.toUpperCase();
  const to = step.to.trim();
  const g = guard ? { guard } : {};
  const token = tokenInfo(asset);
  if (token) return sendErc20Transfer({ token, to, amountBase: step.amountBase, ...g });
  const decimals = NATIVE_DECIMALS[asset];
  if (decimals === undefined) throw new Error(`${asset} isn't an asset this wallet can broadcast yet`);
  const amount = baseToDecimal(step.amountBase, decimals);
  if (asset === 'ETH') return sendEvmTransfer({ to, ethAmount: amount, ...g });
  if (asset === 'SOL') return sendSolTransfer({ to, solAmount: amount, ...g });
  return sendBtcTransfer({ to, btcAmount: amount, ...g });
}
