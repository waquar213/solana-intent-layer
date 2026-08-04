/**
 * Bitcoin transaction assembly — the "chains build, core signs" split for Bitcoin.
 * A spend is a PSBT (BIP-174): this module selects UTXOs, computes the fee and
 * change, and compiles an UNSIGNED native-SegWit (P2WPKH) PSBT; core applies the
 * user's key (signBitcoinPsbt) and finalizes it into a broadcastable raw tx.
 * Pure — no network I/O. Backed by the audited @scure/btc-signer (ADR-0003),
 * the same library core signs with, so the built PSBT and the signer agree.
 */
import { hex } from '@scure/base';
import { Address, NETWORK, TEST_NETWORK, p2wpkh, selectUTXO } from '@scure/btc-signer';
import { ChainError } from '../errors.js';

export type BtcNetwork = 'mainnet' | 'testnet';

/**
 * True if `address` is a valid Bitcoin address on the given network — accepts EVERY type the builder
 * can actually pay (legacy P2PKH `m`/`n`, P2SH `2`, and bech32 SegWit `tb1`), and rejects garbage, an
 * ENS name, or a wrong-network address. Uses the same audited `@scure/btc-signer` decoder the PSBT
 * builder and core's signer use, so "valid here" means "the send will actually build". A bech32-only
 * regex would false-reject the perfectly-spendable legacy/P2SH forms.
 */
export function isValidBtcAddress(address: string, network: BtcNetwork = 'testnet'): boolean {
  try {
    Address(network === 'testnet' ? TEST_NETWORK : NETWORK).decode(address.trim());
    return true;
  } catch {
    return false;
  }
}

/** A spendable output, as returned by BitcoinAdapter.getUtxos. */
export interface BtcSpendUtxo {
  txid: string;
  vout: number;
  value: bigint; // satoshis
}

export interface BuildBtcTransferArgs {
  /** 33-byte compressed secp256k1 public key of the sender (owns every input). */
  publicKey: Uint8Array;
  utxos: BtcSpendUtxo[];
  /** Recipient address (any type valid on the network). */
  toAddress: string;
  amountSats: bigint;
  /** Fee rate in satoshis per virtual byte (>= 1). */
  feeRateSatPerVb: number;
  network?: BtcNetwork;
  /** Change sink; defaults to the sender's own P2WPKH address. */
  changeAddress?: string;
  /** Optional OP_RETURN data (≤ 80 bytes) — e.g. a bridge route tag. Adds a 0-value output. */
  opReturn?: Uint8Array;
}

export interface BuiltBtcTransfer {
  /** The unsigned PSBT bytes — hand to core's signBitcoinPsbt. */
  psbt: Uint8Array;
  /** Estimated fee (satoshis) for the selected inputs. */
  fee: bigint;
  /** Number of inputs selected. */
  inputCount: number;
  /** The sender's P2WPKH address on this network (also the change sink). */
  ownAddress: string;
}

function net(network: BtcNetwork): typeof NETWORK {
  return network === 'testnet' ? TEST_NETWORK : NETWORK;
}

/** The P2WPKH (native SegWit, `bc1q…`/`tb1q…`) address for a compressed public key. */
export function p2wpkhAddressFor(publicKey: Uint8Array, network: BtcNetwork = 'mainnet'): string {
  if (publicKey.length !== 33) {
    throw new ChainError('INVALID_RESPONSE', `expected a 33-byte compressed public key, got ${publicKey.length}`);
  }
  const address = p2wpkh(publicKey, net(network)).address;
  if (address === undefined) throw new ChainError('INVALID_RESPONSE', 'could not derive a P2WPKH address');
  return address;
}

/**
 * Build an UNSIGNED P2WPKH transfer PSBT: select inputs (largest-first), add the
 * recipient output, compute the fee at `feeRateSatPerVb`, and return change to
 * the sender. Throws INSUFFICIENT_FUNDS when the UTXO set can't cover
 * amount + fee. The result is deterministic (BIP-69 ordered) and must still be
 * signed + finalized by the key that owns `publicKey`.
 */
export function buildBtcTransfer(args: BuildBtcTransferArgs): BuiltBtcTransfer {
  const network = args.network ?? 'mainnet';
  if (args.amountSats <= 0n) throw new ChainError('INVALID_RESPONSE', 'amount must be positive');
  if (!Number.isFinite(args.feeRateSatPerVb) || args.feeRateSatPerVb < 1) {
    throw new ChainError('INVALID_RESPONSE', 'fee rate must be at least 1 sat/vByte');
  }
  if (args.utxos.length === 0) throw new ChainError('INSUFFICIENT_FUNDS', 'no spendable UTXOs for this address');

  const spend = p2wpkh(args.publicKey, net(network));
  if (spend.address === undefined) throw new ChainError('INVALID_RESPONSE', 'could not derive the sender address');

  const inputs = args.utxos.map((u) => ({
    ...spend, // carries the P2WPKH witness script/type
    txid: hex.decode(u.txid),
    index: u.vout,
    witnessUtxo: { script: spend.script, amount: u.value },
  }));
  const outputs: Array<{ address: string; amount: bigint } | { script: Uint8Array; amount: bigint }> = [
    { address: args.toAddress, amount: args.amountSats },
  ];
  if (args.opReturn && args.opReturn.length > 0) {
    const len = args.opReturn.length;
    if (len > 80) throw new ChainError('INVALID_RESPONSE', 'OP_RETURN data exceeds 80 bytes');
    // OP_RETURN <pushdata>: a DIRECT push (opcodes 0x01–0x4b) carries ≤ 75 bytes; 76–80 bytes
    // MUST use OP_PUSHDATA1 (0x4c, then a length byte). Emitting a raw length prefix of 76–80
    // (= 0x4c–0x50) would be read by any parser as a pushdata OPCODE, not a length, producing
    // a malformed / non-standard script that relays reject — silently breaking a long memo.
    const push = len <= 75 ? [len] : [0x4c, len];
    outputs.push({ script: new Uint8Array([0x6a, ...push, ...args.opReturn]), amount: 0n });
  }

  const selected = selectUTXO(inputs, outputs, 'default', {
    changeAddress: args.changeAddress ?? spend.address,
    feePerByte: BigInt(Math.ceil(args.feeRateSatPerVb)),
    bip69: true,
    createTx: true,
    network: net(network),
    // Accept the OP_RETURN output: its script is a valid but "unknown" (non-address,
    // provably unspendable, 0-value) type the coin-selector otherwise refuses. Without
    // this, ANY transfer carrying an opReturn memo (e.g. a bridge route tag) throws
    // "unknown output script type" here. Safe because the only non-address output this
    // function ever builds is that OP_RETURN — no untrusted script reaches the selector.
    allowUnknownOutputs: true,
  });
  if (!selected || !selected.tx) {
    throw new ChainError('INSUFFICIENT_FUNDS', 'balance cannot cover the amount plus the network fee');
  }

  return {
    psbt: selected.tx.toPSBT(),
    fee: selected.fee ?? 0n,
    inputCount: selected.tx.inputsLength,
    ownAddress: spend.address,
  };
}
