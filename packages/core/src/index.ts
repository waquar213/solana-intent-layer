/**
 * @intent-wallet/core — device-only wallet core.
 *
 * Owns: mnemonics, HD derivation, the Universal Identity (BTC + universal EVM
 * + SOL addresses), the encrypted vault, and signing primitives.
 *
 * Hard boundaries (enforced by review + lint in later phases):
 * - Zero network I/O in this package.
 * - Key material never crosses this package's public API except via the
 *   explicitly SENSITIVE members (`mnemonic`, `exportPrivateKey`) that exist
 *   for user-initiated backup/export flows.
 */
export { WalletError, isWalletError, type WalletErrorCode } from './errors.js';
export { bytesToHex, hexToBytes, concatBytes, randomBytes, utf8ToBytes, zeroize, constantTimeEqual } from './bytes.js';
export {
  generateMnemonic,
  normalizeMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  type MnemonicStrength,
} from './mnemonic.js';
export {
  HARDENED_OFFSET,
  parseHardenedPath,
  slip10MasterFromSeed,
  slip10DeriveHardened,
  slip10DerivePath,
  type Slip10Node,
} from './slip10.js';
export {
  evmAddressFromPublicKey,
  toChecksumAddress,
  isChecksumAddress,
  signEvmDigest,
  recoverEvmAddress,
  hashPersonalMessage,
} from './accounts/evm.js';
export { btcP2wpkhAddress, hash160, type BtcNetwork } from './accounts/bitcoin.js';
export {
  solanaPublicKey,
  solanaAddressFromPublicKey,
  signSolanaMessage,
  verifySolanaSignature,
} from './accounts/solana.js';
export {
  HDKeyring,
  derivationPaths,
  type AccountRef,
  type UniversalAccount,
  type ChainKind,
  type KeyringOptions,
} from './keyring.js';
export {
  sealVault,
  openVault,
  looksLikeVaultEnvelope,
  DEFAULT_SCRYPT_PARAMS,
  type ScryptParams,
  type SealVaultOptions,
} from './vault.js';

// --- Transaction signing (EVM / Bitcoin / Solana) ---
export { rlpEncode, bigintToMinimalBytes, type RlpInput } from './signing/rlp.js';
export {
  signEip1559Transaction,
  eip1559UnsignedPayload,
  type Eip1559Transaction,
  type AccessListEntry,
  type SignedEvmTransaction,
} from './signing/evm-transaction.js';
export {
  hashTypedData,
  signTypedData,
  encodeType,
  type TypedData,
  type TypedDataTypes,
  type TypedDataField,
  type TypedDataDomain,
} from './signing/evm-typed-data.js';
export { signPsbt, type SignPsbtOptions, type SignPsbtResult } from './signing/bitcoin-psbt.js';
export { signSolanaTransactionMessage } from './signing/solana-transaction.js';
export { SigningManager, type WalletSigner } from './signing/signer.js';

// --- Wallet manager layer ---
export { InMemorySecureStore, STORE_KEYS, type SecureStore } from './wallet/secure-store.js';
export { SessionManager, type Scheduler, type SessionOptions } from './wallet/session.js';
export { WalletManager, type WalletManagerOptions, type CreateWalletResult } from './wallet/wallet-manager.js';
