/**
 * @intent-wallet/chains — chain abstraction layer.
 *
 * Phase 2 scope: registry + provider pooling (this file), then balance
 * readers, fee estimation, and nonce/UTXO management per requirements.md §14.
 */
export { ChainError, JsonRpcError, type ChainErrorCode } from './errors.js';
export {
  CHAINS,
  getChain,
  listChains,
  chainByEvmChainId,
  type ChainId,
  type ChainInfo,
  type Ecosystem,
  type FinalityRule,
  type NativeAsset,
} from './registry.js';
export {
  ProviderPool,
  HttpJsonRpcTransport,
  redactRpcUrl,
  type JsonRpcTransport,
  type ProviderPoolOptions,
  type EndpointStats,
} from './provider.js';
export type {
  BlockchainAdapter,
  AssetBalance,
  AssetMetadata,
  TokenRef,
  FeeEstimate,
  FeeSpeed,
  BroadcastResult,
  TxStatus,
  TxState,
} from './adapter.js';
export { EvmAdapter } from './evm/adapter.js';
export { SolanaAdapter } from './solana/adapter.js';
export {
  buildSolTransferMessage,
  assembleSolTransaction,
  encodeShortVec,
  SYSTEM_PROGRAM_ID,
  type SolTransfer,
} from './solana/transaction.js';
export {
  buildSplTransferMessage,
  findAssociatedTokenAddress,
  findProgramAddress,
  compileMessage,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  type SplTransfer,
  type BuiltSplTransfer,
} from './solana/spl.js';
export {
  buildSwapSolForTokenMessage,
  buildSwapTokenForSolMessage,
  solammPdas,
  type SolammSwap,
  type BuiltSolammSwap,
} from './solana/solamm.js';
export { buildStakeSolMessage, buildUnstakeSolMessage, stakingPdas, type SolStake } from './solana/staking.js';
export { buildBridgeDepositMessage, MEMO_PROGRAM_ID, type SolBridgeDeposit } from './solana/bridge.js';
export { BitcoinAdapter, type Utxo } from './bitcoin/adapter.js';
export { HttpRestTransport, type RestTransport } from './bitcoin/rest.js';
export {
  buildBtcTransfer,
  isValidBtcAddress,
  p2wpkhAddressFor,
  type BtcNetwork,
  type BtcSpendUtxo,
  type BuildBtcTransferArgs,
  type BuiltBtcTransfer,
} from './bitcoin/transaction.js';
export { AdapterRegistry, type AdapterRegistryOptions } from './adapter-registry.js';
export {
  encodeBalanceOf,
  encodeAddressParam,
  encodeUint256,
  encodeErc20Transfer,
  decodeUint,
  decodeDecimals,
  decodeString,
  SELECTOR,
} from './evm/abi.js';
export {
  encodeIntentExecute,
  intentHashOf,
  keccak256Hex,
  type IntentStep,
} from './evm/intent.js';
export {
  encodeQuoteExactInputSingle,
  decodeQuotedAmountOut,
  encodeExactInputSingle,
  encodeErc20Approve,
  SEPOLIA_UNISWAP,
  V3_FEE_TIERS,
} from './evm/uniswap.js';
export {
  guardBroadcast,
  assertBroadcastAllowed,
  checkEvmRecipient,
  detectPoisoningLookalike,
  assessRecipientOnChain,
  classifyHistoryForPoisoning,
  POISON_PREFIX_MIN,
  POISON_SUFFIX_MIN,
  POISON_DUST_USD,
  POISONER_DUST_SENDERS_BLOCK,
  type RecipientOnChainFacts,
  type HistoryTransfer,
  MAINNET_SPEND_CAP_USD,
  type BroadcastGuardInput,
  type GuardDecision,
} from './guard.js';
