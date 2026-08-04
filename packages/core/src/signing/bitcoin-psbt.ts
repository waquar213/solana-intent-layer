/**
 * Bitcoin transaction signing via PSBT (BIP-174), backed by the audited
 * @scure/btc-signer (same @scure family as the rest of core — ADR-0003).
 *
 * The wallet never builds fee/UTXO logic here; that lives in the chain layer,
 * which hands core a PSBT to sign. Core's job is exactly and only to apply the
 * user's key to the inputs it owns — the signing half of the trust boundary.
 * Multi-party/multi-input PSBTs are supported: we sign what we can and return
 * the updated PSBT; when every input is signed we can finalize and extract the
 * broadcastable transaction.
 */
import { Transaction } from '@scure/btc-signer';
import { WalletError } from '../errors.js';

export interface SignPsbtOptions {
  /** Finalize + extract the raw tx if all inputs are signed. Default true. */
  finalize?: boolean;
}

export interface SignPsbtResult {
  /** The updated PSBT bytes (still partial if other signers remain). */
  psbt: Uint8Array;
  /** How many inputs this key signed. */
  signedInputs: number;
  finalized: boolean;
  /** Present only when finalized: the broadcastable raw transaction hex. */
  txHex?: string;
  /** Present only when finalized: the transaction id. */
  txid?: string;
}

/**
 * Signs every input of `psbt` that matches `privateKey`. Caller must zeroize
 * `privateKey`. Throws INVALID_INPUT for a malformed PSBT.
 */
export function signPsbt(psbt: Uint8Array, privateKey: Uint8Array, options: SignPsbtOptions = {}): SignPsbtResult {
  if (privateKey.length !== 32) {
    throw new WalletError('INVALID_INPUT', `bitcoin private key must be 32 bytes, got ${privateKey.length}`);
  }
  let tx: Transaction;
  try {
    tx = Transaction.fromPSBT(psbt);
  } catch (cause) {
    throw new WalletError('INVALID_INPUT', 'not a valid PSBT', { cause });
  }

  let signedInputs = 0;
  try {
    // btc-signer's sign() returns the number of inputs it signed with this key.
    signedInputs = tx.sign(privateKey);
  } catch (cause) {
    // The library throws (rather than returning 0) when this key owns none of
    // the inputs. For a multi-party PSBT that is a valid no-op, not an error —
    // return the PSBT unchanged. Any other signing failure is a real problem.
    if (cause instanceof Error && /no inputs? signed/iu.test(cause.message)) {
      return { psbt, signedInputs: 0, finalized: false };
    }
    throw new WalletError('INVALID_INPUT', 'PSBT signing failed (bad input data)', { cause });
  }

  const shouldFinalize = (options.finalize ?? true) && allInputsSigned(tx);
  if (shouldFinalize) {
    tx.finalize();
    return {
      psbt: tx.toPSBT(),
      signedInputs,
      finalized: true,
      txHex: bytesToHex(tx.extract()),
      txid: tx.id,
    };
  }
  return { psbt: tx.toPSBT(), signedInputs, finalized: false };
}

function allInputsSigned(tx: Transaction): boolean {
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    const hasSig =
      (input.partialSig && input.partialSig.length > 0) || input.finalScriptWitness || input.finalScriptSig;
    if (!hasSig) return false;
  }
  return true;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
