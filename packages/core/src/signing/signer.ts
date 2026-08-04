/**
 * SigningManager — the unified signing interface over the HD keyring.
 *
 * One abstraction, every ecosystem, each respecting its own rules: EVM signs
 * transactions/typed-data/personal-messages; Bitcoin signs PSBTs; Solana signs
 * serialized transaction messages. Every operation derives the account key on
 * demand, signs, and ZEROIZES the key immediately — private keys have the
 * shortest possible lifetime in memory and never leave this device
 * (the signing half of the non-custodial trust boundary).
 */
import { WalletError } from '../errors.js';
import { zeroize } from '../bytes.js';
import type { HDKeyring } from '../keyring.js';
import { hashPersonalMessage, signEvmDigest } from '../accounts/evm.js';
import { signEip1559Transaction, type Eip1559Transaction, type SignedEvmTransaction } from './evm-transaction.js';
import { signTypedData, type TypedData } from './evm-typed-data.js';
import { signPsbt, type SignPsbtOptions, type SignPsbtResult } from './bitcoin-psbt.js';
import { signSolanaTransactionMessage } from './solana-transaction.js';

/** The signing surface every consumer (execution engine, dApp bridge) uses. */
export interface WalletSigner {
  signEvmTransaction(tx: Eip1559Transaction, accountIndex?: number): SignedEvmTransaction;
  signEvmTypedData(typed: TypedData, accountIndex?: number): Uint8Array;
  /** EIP-191 personal_sign. Returns 65-byte r‖s‖v with v ∈ {27,28}. */
  signEvmPersonalMessage(message: Uint8Array, accountIndex?: number): Uint8Array;
  signBitcoinPsbt(psbt: Uint8Array, accountIndex?: number, options?: SignPsbtOptions): SignPsbtResult;
  signSolanaTransactionMessage(message: Uint8Array, accountIndex?: number): Uint8Array;
}

export class SigningManager implements WalletSigner {
  readonly #keyring: HDKeyring;

  constructor(keyring: HDKeyring) {
    this.#keyring = keyring;
  }

  signEvmTransaction(tx: Eip1559Transaction, accountIndex = 0): SignedEvmTransaction {
    return this.#withEvmKey(accountIndex, (key) => signEip1559Transaction(tx, key));
  }

  signEvmTypedData(typed: TypedData, accountIndex = 0): Uint8Array {
    return this.#withEvmKey(accountIndex, (key) => signTypedData(typed, key));
  }

  signEvmPersonalMessage(message: Uint8Array, accountIndex = 0): Uint8Array {
    if (message.length === 0) throw new WalletError('INVALID_INPUT', 'refusing to sign an empty message');
    return this.#withEvmKey(accountIndex, (key) => {
      const sig = signEvmDigest(hashPersonalMessage(message), key);
      const out = sig.slice();
      out[64] = (out[64] as number) + 27; // personal_sign convention
      return out;
    });
  }

  signBitcoinPsbt(psbt: Uint8Array, accountIndex = 0, options?: SignPsbtOptions): SignPsbtResult {
    const key = this.#keyring.exportPrivateKey('btc', accountIndex);
    try {
      return signPsbt(psbt, key, options ?? {});
    } finally {
      zeroize(key);
    }
  }

  signSolanaTransactionMessage(message: Uint8Array, accountIndex = 0): Uint8Array {
    const key = this.#keyring.exportPrivateKey('sol', accountIndex);
    try {
      return signSolanaTransactionMessage(message, key);
    } finally {
      zeroize(key);
    }
  }

  /** Runs `fn` with the freshly-derived EVM key and guarantees zeroization. */
  #withEvmKey<T>(accountIndex: number, fn: (key: Uint8Array) => T): T {
    const key = this.#keyring.exportPrivateKey('evm', accountIndex);
    try {
      return fn(key);
    } finally {
      zeroize(key);
    }
  }
}
