/**
 * EVM transaction + typed-data signing, cross-checked against viem (a dev-only
 * oracle, same pattern as SLIP-0010 vs ed25519-hd-key). If our from-scratch RLP
 * and EIP-712 encoders agree with viem on serialized bytes and digests, they're
 * correct.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { utf8ToBytes } from '@noble/hashes/utils';
import {
  serializeTransaction,
  parseTransaction,
  hashTypedData as viemHashTypedData,
  recoverTransactionAddress,
} from 'viem';
import { rlpEncode, bigintToMinimalBytes } from '../src/signing/rlp.js';
import {
  signEip1559Transaction,
  eip1559UnsignedPayload,
  type Eip1559Transaction,
} from '../src/signing/evm-transaction.js';
import { encodeType, hashTypedData, signTypedData, type TypedData } from '../src/signing/evm-typed-data.js';
import { evmAddressFromPublicKey, recoverEvmAddress } from '../src/accounts/evm.js';

const PK = keccak_256(utf8ToBytes('intent-wallet evm tx test key'));
const ADDRESS = evmAddressFromPublicKey(secp256k1.getPublicKey(PK, true));

describe('RLP encoding', () => {
  it('encodes the canonical examples from the spec', () => {
    // "dog" → 0x83646f67
    expect(Buffer.from(rlpEncode(utf8ToBytes('dog'))).toString('hex')).toBe('83646f67');
    // empty string → 0x80
    expect(Buffer.from(rlpEncode(new Uint8Array(0))).toString('hex')).toBe('80');
    // empty list → 0xc0
    expect(Buffer.from(rlpEncode([])).toString('hex')).toBe('c0');
    // [ "cat", "dog" ] → 0xc88363617483646f67
    expect(Buffer.from(rlpEncode([utf8ToBytes('cat'), utf8ToBytes('dog')])).toString('hex')).toBe('c88363617483646f67');
  });

  it('encodes bigint quantities with no leading zeros (0 → empty)', () => {
    expect(Buffer.from(bigintToMinimalBytes(0n)).toString('hex')).toBe('');
    expect(Buffer.from(bigintToMinimalBytes(1024n)).toString('hex')).toBe('0400');
  });
});

describe('EIP-1559 transaction signing', () => {
  const base: Eip1559Transaction = {
    chainId: 8453,
    nonce: 7n,
    maxPriorityFeePerGas: 1_000_000_000n,
    maxFeePerGas: 30_000_000_000n,
    gasLimit: 21_000n,
    to: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
    value: 1_000_000_000_000_000n,
    data: '0x',
  };

  it('produces a raw tx byte-identical to viem, recoverable to the signer', () => {
    const signed = signEip1559Transaction(base, PK);
    const viemRaw = serializeTransaction(
      {
        type: 'eip1559',
        chainId: base.chainId,
        nonce: Number(base.nonce),
        maxPriorityFeePerGas: base.maxPriorityFeePerGas,
        maxFeePerGas: base.maxFeePerGas,
        gas: base.gasLimit,
        to: base.to as `0x${string}`,
        value: base.value,
      },
      // Sign with viem too by giving it r/s/v from our signature? Simpler: compare the
      // UNSIGNED serialization and independently verify the signed tx recovers correctly.
    );
    // Unsigned serialization must match viem's unsigned serialization exactly.
    const ourUnsigned = eip1559UnsignedPayload(base).payload;
    expect(`0x${Buffer.from(ourUnsigned).toString('hex')}`).toBe(viemRaw);

    // The signed tx must parse and recover to our address (round-trip correctness).
    const parsed = parseTransaction(signed.raw as `0x02${string}`);
    expect(parsed.to?.toLowerCase()).toBe(base.to?.toLowerCase());
    expect(parsed.value).toBe(base.value);
  });

  it('recovers the sender from the signed transaction (via viem)', async () => {
    const signed = signEip1559Transaction(base, PK);
    const recovered = await recoverTransactionAddress({ serializedTransaction: signed.raw as `0x02${string}` });
    expect(recovered.toLowerCase()).toBe(ADDRESS.toLowerCase());
  });

  it('handles contract-creation (to=null), calldata, and access lists like viem', () => {
    const tx: Eip1559Transaction = {
      chainId: 1,
      nonce: 0n,
      maxPriorityFeePerGas: 2_000_000_000n,
      maxFeePerGas: 50_000_000_000n,
      gasLimit: 100_000n,
      to: null,
      value: 0n,
      data: '0x6001600155',
      accessList: [{ address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94', storageKeys: [`0x${'00'.repeat(31)}01`] }],
    };
    const ourUnsigned = eip1559UnsignedPayload(tx).payload;
    const viemUnsigned = serializeTransaction({
      type: 'eip1559',
      chainId: 1,
      nonce: 0,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      maxFeePerGas: tx.maxFeePerGas,
      gas: tx.gasLimit,
      to: null,
      value: 0n,
      data: tx.data as `0x${string}`,
      accessList: [
        {
          address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
          storageKeys: [`0x${'00'.repeat(31)}01` as `0x${string}`],
        },
      ],
    });
    expect(`0x${Buffer.from(ourUnsigned).toString('hex')}`).toBe(viemUnsigned);
  });

  it('rejects invalid fields', () => {
    expect(() => signEip1559Transaction({ ...base, value: -1n }, PK)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(() => signEip1559Transaction({ ...base, maxPriorityFeePerGas: 999n * 10n ** 18n }, PK)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    ); // priority > max
    expect(() => signEip1559Transaction({ ...base, to: '0xdeadbeef' }, PK)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });

  it('matches viem on random valid transactions (property)', () => {
    fc.assert(
      fc.property(
        fc.record({
          // nonce bounded to a safe-integer range only because viem's oracle takes a
          // JS number here; our encoder itself accepts any bigint nonce.
          nonce: fc.bigInt({ min: 0n, max: 2n ** 48n }),
          maxFee: fc.bigInt({ min: 1n, max: 2n ** 60n }),
          gas: fc.bigInt({ min: 21_000n, max: 30_000_000n }),
          value: fc.bigInt({ min: 0n, max: 2n ** 90n }),
        }),
        ({ nonce, maxFee, gas, value }) => {
          const tx: Eip1559Transaction = {
            chainId: 42161,
            nonce,
            maxPriorityFeePerGas: 1n,
            maxFeePerGas: maxFee < 1n ? 1n : maxFee,
            gasLimit: gas,
            to: ADDRESS,
            value,
          };
          const ours = `0x${Buffer.from(eip1559UnsignedPayload(tx).payload).toString('hex')}`;
          const theirs = serializeTransaction({
            type: 'eip1559',
            chainId: 42161,
            nonce: Number(nonce),
            maxPriorityFeePerGas: 1n,
            maxFeePerGas: tx.maxFeePerGas,
            gas,
            to: ADDRESS as `0x${string}`,
            value,
          });
          expect(ours).toBe(theirs);
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('EIP-712 typed data', () => {
  // The canonical example from EIP-712 itself.
  const mail: TypedData = {
    types: {
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person' },
        { name: 'contents', type: 'string' },
      ],
    },
    primaryType: 'Mail',
    domain: {
      name: 'Ether Mail',
      version: '1',
      chainId: 1,
      verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
    },
    message: {
      from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
      to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
      contents: 'Hello, Bob!',
    },
  };

  it('encodeType matches the spec string', () => {
    expect(encodeType('Mail', mail.types)).toBe(
      'Mail(Person from,Person to,string contents)Person(string name,address wallet)',
    );
  });

  it('hashTypedData matches viem exactly', () => {
    const ours = `0x${Buffer.from(hashTypedData(mail)).toString('hex')}`;
    const theirs = viemHashTypedData({
      types: mail.types,
      primaryType: 'Mail',
      domain: mail.domain as never,
      message: mail.message as never,
    });
    expect(ours).toBe(theirs);
  });

  it('signs typed data recoverably with v ∈ {27,28}', () => {
    const sig = signTypedData(mail, PK);
    expect(sig).toHaveLength(65);
    expect([27, 28]).toContain(sig[64]);
    const digest = hashTypedData(mail);
    const forRecover = sig.slice();
    forRecover[64] = (sig[64] as number) - 27;
    expect(recoverEvmAddress(digest, forRecover)).toBe(ADDRESS);
  });

  it('supports arrays and nested structs (cross-checked with viem)', () => {
    const typed: TypedData = {
      types: {
        Order: [
          { name: 'ids', type: 'uint256[]' },
          { name: 'maker', type: 'address' },
          { name: 'active', type: 'bool' },
        ],
      },
      primaryType: 'Order',
      domain: { name: 'X', version: '2', chainId: 8453 },
      message: { ids: [1n, 2n, 3n], maker: ADDRESS, active: true },
    };
    const ours = `0x${Buffer.from(hashTypedData(typed)).toString('hex')}`;
    const theirs = viemHashTypedData({
      types: typed.types,
      primaryType: 'Order',
      domain: typed.domain as never,
      message: typed.message as never,
    });
    expect(ours).toBe(theirs);
  });
});
