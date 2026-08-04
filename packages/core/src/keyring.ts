/**
 * HDKeyring — one BIP-39 mnemonic → the product's Universal Identity:
 *
 *   BTC  m/84'/{0|1}'/0'/0/i   → bech32 P2WPKH  (bc1q…)   [BIP-84]
 *   EVM  m/44'/60'/0'/0/i      → EIP-55 0x…  — one address for EVERY EVM chain
 *   SOL  m/44'/501'/i'/0'      → base58 ed25519 pubkey    [SLIP-0010]
 *
 * Paths follow ecosystem conventions so imports/exports interoperate with
 * MetaMask, Ledger, Phantom and Solflare.
 *
 * Security notes:
 * - This class holds the seed in memory while unlocked. Call destroy() on
 *   lock/background; every method throws KEYRING_DESTROYED afterwards.
 * - Per-call derived private keys are wiped immediately after use.
 * - exportPrivateKey()/mnemonic are for user-initiated backup/export flows
 *   only; callers must zeroize returned buffers.
 */
import { HDKey } from '@scure/bip32';
import { bytesToHex } from '@noble/hashes/utils';
import { WalletError } from './errors.js';
import { zeroize } from './bytes.js';
import { generateMnemonic, mnemonicToSeed, normalizeMnemonic, type MnemonicStrength } from './mnemonic.js';
import { slip10DerivePath } from './slip10.js';
import { evmAddressFromPublicKey, signEvmDigest } from './accounts/evm.js';
import { btcP2wpkhAddress, type BtcNetwork } from './accounts/bitcoin.js';
import { signSolanaMessage, solanaAddressFromPublicKey, solanaPublicKey } from './accounts/solana.js';

export type ChainKind = 'btc' | 'evm' | 'sol';

export interface AccountRef {
  /** Display/receive address in the chain's canonical format. */
  address: string;
  /** Exact derivation path used. */
  path: string;
  /** Hex-encoded public key (compressed secp256k1 for btc/evm, 32-byte ed25519 for sol). */
  publicKey: string;
}

/** The three receive identities the product exposes for one account index. */
export interface UniversalAccount {
  index: number;
  btc: AccountRef;
  evm: AccountRef;
  sol: AccountRef;
}

const MAX_INDEX = 0x7fffffff; // 2^31 - 1

export const derivationPaths = {
  btc: (index: number, network: BtcNetwork = 'mainnet'): string =>
    `m/84'/${network === 'mainnet' ? 0 : 1}'/0'/0/${index}`,
  evm: (index: number): string => `m/44'/60'/0'/0/${index}`,
  sol: (index: number): string => `m/44'/501'/${index}'/0'`,
} as const;

export interface KeyringOptions {
  /** Optional BIP-39 passphrase ("25th word"). Distinct wallet per passphrase. */
  passphrase?: string;
  /** Bitcoin network for address encoding (EVM/SOL are network-agnostic at this layer). */
  network?: BtcNetwork;
}

export class HDKeyring {
  #mnemonic: string;
  #seed: Uint8Array;
  #root: HDKey;
  #network: BtcNetwork;
  #destroyed = false;
  // Derived accounts are IMMUTABLE for a given index (a pure function of the seed) and hold only
  // PUBLIC data (addresses/paths/pubkeys — never private keys), so memoize them. Without this the
  // UI's 500ms identity poll re-runs 3 elliptic-curve HD derivations per read for the whole session.
  // The cache lives with the keyring instance, so a lock/unlock (a fresh keyring) starts clean.
  readonly #accountCache = new Map<number, UniversalAccount>();

  private constructor(mnemonic: string, seed: Uint8Array, network: BtcNetwork) {
    this.#mnemonic = mnemonic;
    this.#seed = seed;
    this.#root = HDKey.fromMasterSeed(seed);
    this.#network = network;
  }

  /** Restores a keyring from an existing mnemonic. Throws INVALID_MNEMONIC on bad input. */
  static fromMnemonic(mnemonic: string, options: KeyringOptions = {}): HDKeyring {
    const seed = mnemonicToSeed(mnemonic, options.passphrase ?? ''); // validates + normalizes
    // Store the phrase through the SAME normalizer the seed was derived from. This used to inline a
    // copy of that logic, so any future change to `normalizeMnemonic` (e.g. adding NFKD) would have
    // silently made the exported/re-sealed phrase disagree with the seed actually in use.
    return new HDKeyring(normalizeMnemonic(mnemonic), seed, options.network ?? 'mainnet');
  }

  /** Creates a brand-new wallet. Read `mnemonic` once for the backup flow, then never persist it outside the vault. */
  static generate(options: KeyringOptions & { strength?: MnemonicStrength } = {}): HDKeyring {
    return HDKeyring.fromMnemonic(generateMnemonic(options.strength ?? 128), options);
  }

  get network(): BtcNetwork {
    return this.#network;
  }

  /** SENSITIVE. For the user-initiated backup flow and vault sealing only. */
  get mnemonic(): string {
    this.#assertAlive();
    return this.#mnemonic;
  }

  /** The Universal Identity (three receive addresses) for `index`. Pure derivation — no key material is returned. */
  getAccount(index = 0): UniversalAccount {
    this.#assertAlive();
    validateIndex(index);
    const cached = this.#accountCache.get(index);
    if (cached) return cached;

    const btcPath = derivationPaths.btc(index, this.#network);
    const btcNode = this.#deriveSecp(btcPath);
    const btcPub = btcNode.publicKey as Uint8Array;
    const btc: AccountRef = {
      address: btcP2wpkhAddress(btcPub, this.#network),
      path: btcPath,
      publicKey: bytesToHex(btcPub),
    };
    btcNode.wipePrivateData();

    const evmPath = derivationPaths.evm(index);
    const evmNode = this.#deriveSecp(evmPath);
    const evmPub = evmNode.publicKey as Uint8Array;
    const evm: AccountRef = {
      address: evmAddressFromPublicKey(evmPub),
      path: evmPath,
      publicKey: bytesToHex(evmPub),
    };
    evmNode.wipePrivateData();

    const solPath = derivationPaths.sol(index);
    const solNode = slip10DerivePath(this.#seed, solPath);
    const solPub = solanaPublicKey(solNode.privateKey);
    const sol: AccountRef = {
      address: solanaAddressFromPublicKey(solPub),
      path: solPath,
      publicKey: bytesToHex(solPub),
    };
    zeroize(solNode.privateKey, solNode.chainCode);

    const account: UniversalAccount = { index, btc, evm, sol };
    this.#accountCache.set(index, account);
    return account;
  }

  /** Signs a 32-byte EVM digest (tx hash / EIP-191 / EIP-712). Returns r||s||recovery (65B). */
  signEvmDigest(digest: Uint8Array, index = 0): Uint8Array {
    this.#assertAlive();
    validateIndex(index);
    const node = this.#deriveSecp(derivationPaths.evm(index));
    try {
      return signEvmDigest(digest, node.privateKey as Uint8Array);
    } finally {
      node.wipePrivateData();
    }
  }

  /** Signs a Solana message/serialized transaction message. Returns a 64-byte ed25519 signature. */
  signSolanaMessage(message: Uint8Array, index = 0): Uint8Array {
    this.#assertAlive();
    validateIndex(index);
    const node = slip10DerivePath(this.#seed, derivationPaths.sol(index));
    try {
      return signSolanaMessage(message, node.privateKey);
    } finally {
      zeroize(node.privateKey, node.chainCode);
    }
  }

  /**
   * SENSITIVE. Returns the raw private key for export/import features and for
   * PSBT signing integration (Phase 5). Caller MUST zeroize the buffer.
   */
  exportPrivateKey(chain: ChainKind, index = 0): Uint8Array {
    this.#assertAlive();
    validateIndex(index);
    if (chain === 'sol') {
      const node = slip10DerivePath(this.#seed, derivationPaths.sol(index));
      zeroize(node.chainCode);
      return node.privateKey;
    }
    const path = chain === 'btc' ? derivationPaths.btc(index, this.#network) : derivationPaths.evm(index);
    const node = this.#deriveSecp(path);
    const key = (node.privateKey as Uint8Array).slice();
    node.wipePrivateData();
    return key;
  }

  /** Wipes seed material. The instance is unusable afterwards (KEYRING_DESTROYED). */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    zeroize(this.#seed);
    this.#root.wipePrivateData();
    this.#mnemonic = '';
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  #deriveSecp(path: string): HDKey {
    const node = this.#root.derive(path);
    if (!node.privateKey || !node.publicKey) {
      // Unreachable for hardened-capable master keys; guard stays for type safety.
      throw new WalletError('INVALID_PATH', `derivation produced no key for "${path}"`);
    }
    return node;
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new WalletError('KEYRING_DESTROYED', 'keyring has been destroyed (wallet locked); unlock again to proceed');
    }
  }
}

function validateIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) {
    throw new WalletError('INVALID_INPUT', `account index must be an integer in [0, 2^31), got ${index}`);
  }
}
