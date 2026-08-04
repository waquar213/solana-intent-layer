/**
 * The PRODUCTION execution seams — the plug-in points a real deployment fills to move
 * from the demo (fake signer + fake gateway) to actually signing and broadcasting on
 * chain. Everything here is REAL: `createEvmStepSigner` turns a plan step into a
 * genuine, broadcastable EIP-1559 transaction using core's cryptography, and
 * `createLiveExecutor` composes it with the adapter-backed chain gateway.
 *
 * NON-CUSTODIAL is preserved: the private key never crosses the `EvmDevice` seam — a
 * hardware wallet, a WalletConnect provider, or the on-device core keyring implements
 * it, receiving a fully-formed tx and returning the signed bytes. This module signs
 * offline (no network); the three things a deployment must inject are marked below:
 *
 *   ① EvmDevice   — the wallet that holds the key (WalletConnect / hardware / keyring)
 *   ② adapterFor  — an RPC-backed BlockchainAdapter (needs a real RPC URL)
 *   ③ nonceFor    — the account nonce (eth_getTransactionCount over that RPC)
 */
import { signEip1559Transaction, type Eip1559Transaction, type SignedEvmTransaction } from '@intent-wallet/core';
import type { BlockchainAdapter, TokenRef } from '@intent-wallet/chains';
import type { Holding, PlanStep } from '@intent-wallet/intents';
import { AdapterChainGateway, mergeHoldings, readChainHoldings } from './chains.js';
import type { ChainGateway, StepSigner } from './execution.js';
import type { RuntimeGasPlanner } from './gas.js';

/**
 * ① The device boundary. It receives a fully-formed EIP-1559 transaction and returns
 * the signed, broadcastable bytes. The key stays inside the implementation, so the
 * runtime never sees it (non-custodial).
 */
export interface EvmDevice {
  signEip1559(tx: Eip1559Transaction): Promise<SignedEvmTransaction>;
}

/**
 * A local EvmDevice backed by a raw private key — for the on-device browser keyring
 * (core) or tests. The key never leaves this closure. Production uses a WalletConnect
 * or hardware device implementing the same interface; the caller must zeroize the key.
 */
export function createLocalEvmDevice(privateKey: Uint8Array): EvmDevice {
  return { signEip1559: (tx) => Promise.resolve(signEip1559Transaction(tx, privateKey)) };
}

export interface EvmStepSignerDeps {
  /** ① The wallet holding the key. */
  device: EvmDevice;
  /** The sender address (0x…), used to fetch the nonce. */
  from: string;
  /** ③ Live nonce source (eth_getTransactionCount). */
  nonceFor: (chainId: number, from: string) => Promise<bigint>;
  /** Gas limit per step (default 21000 — a native transfer; a token/contract step overrides). */
  gasLimitFor?: (step: PlanStep) => bigint;
  /** Fallback EIP-1559 fees when no gas plan is supplied (wei). */
  fallbackMaxFeePerGas?: bigint;
  fallbackMaxPriorityFeePerGas?: bigint;
}

const DEFAULT_GAS_LIMIT = 21_000n;

function evmChainId(chainId: string): number {
  const m = /^eip155:(\d+)$/u.exec(chainId);
  if (!m?.[1]) throw new Error(`createEvmStepSigner only handles EVM chains, got '${chainId}'`);
  return Number(m[1]);
}

function strParam(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * A production EVM `StepSigner`: build a real EIP-1559 transaction from the plan step
 * (recipient, value, calldata from `step.params`) + the gas plan's bounded fees + the
 * live nonce, then hand it to the device to sign. Returns a broadcastable rawTx.
 * EVM-only — a multi-ecosystem deployment composes this with BTC/SOL signers by chain.
 */
export function createEvmStepSigner(deps: EvmStepSignerDeps): StepSigner {
  return {
    sign: async (step, _plan, gas) => {
      const chainId = evmChainId(step.chainId);
      const nonce = await deps.nonceFor(chainId, deps.from);
      const tx: Eip1559Transaction = {
        chainId,
        nonce,
        maxPriorityFeePerGas: gas?.params.maxPriorityFeePerGas ?? deps.fallbackMaxPriorityFeePerGas ?? 1_500_000_000n,
        maxFeePerGas: gas?.params.maxFeePerGas ?? deps.fallbackMaxFeePerGas ?? 30_000_000_000n,
        gasLimit: deps.gasLimitFor?.(step) ?? DEFAULT_GAS_LIMIT,
        to: strParam(step.params, 'to') ?? null,
        value: BigInt(strParam(step.params, 'value') ?? strParam(step.params, 'amountBase') ?? '0'),
        ...(strParam(step.params, 'data') ? { data: strParam(step.params, 'data') as string } : {}),
      };
      const signed = await deps.device.signEip1559(tx);
      return { rawTx: signed.raw };
    },
  };
}

/** The production executor seam — a real signer + adapter-backed gateway + gas planner. */
export interface LiveExecutor {
  signer: StepSigner;
  gateway: ChainGateway;
  gasPlanner?: RuntimeGasPlanner;
}

export interface LiveExecutorDeps extends EvmStepSignerDeps {
  /** ② An RPC-backed adapter per chain id (broadcast + status over a real node). */
  adapterFor: (chainId: string) => BlockchainAdapter;
  /** Optional bounded gas planner (sponsorship + EIP-1559 caps + fee-token). */
  gasPlanner?: RuntimeGasPlanner;
}

/**
 * Compose a production-style executor: the real EVM step signer + the adapter-backed
 * `AdapterChainGateway` (broadcast/status over live RPC) + an optional gas planner.
 * Drop the result into `WalletRuntime.execute(plan, executor)` in place of the demo
 * executor. The only things a deployment supplies are the three ①②③ seams.
 */
export function createLiveExecutor(deps: LiveExecutorDeps): LiveExecutor {
  const signer = createEvmStepSigner(deps);
  const gateway = new AdapterChainGateway(deps.adapterFor);
  return { signer, gateway, ...(deps.gasPlanner ? { gasPlanner: deps.gasPlanner } : {}) };
}

export interface ChainAccount {
  adapter: BlockchainAdapter;
  address: string;
  tokens?: readonly TokenRef[];
}

/**
 * Multi-chain balance discovery: read every configured chain's native + token
 * balances for its address, in parallel, and merge them by symbol into the planner's
 * `Holding[]`. Runs over the same `BlockchainAdapter` interface (fake in tests, live
 * RPC in production), so the wallet plans against real, discovered balances.
 */
export async function discoverHoldings(accounts: readonly ChainAccount[]): Promise<Holding[]> {
  const lists = await Promise.all(accounts.map((a) => readChainHoldings(a.adapter, a.address, a.tokens ?? [])));
  return mergeHoldings(...lists);
}
