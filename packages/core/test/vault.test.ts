import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { utf8ToBytes } from '@noble/hashes/utils';
import { DEFAULT_SCRYPT_PARAMS, looksLikeVaultEnvelope, openVault, sealVault } from '../src/vault.js';

/** Fast params for tests — production default (2^15) is exercised once below. */
const FAST = { scrypt: { n: 2 ** 15 } }; // 2^15 == the vault's MIN_SCRYPT_N (its cheapest ACCEPTED cost)
const SECRET = utf8ToBytes(
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
);

describe('vault seal/open', () => {
  it('roundtrips a secret', () => {
    const envelope = sealVault(SECRET, 'correct horse battery staple', FAST);
    expect(looksLikeVaultEnvelope(envelope)).toBe(true);
    const opened = openVault(envelope, 'correct horse battery staple');
    expect(Buffer.from(opened)).toEqual(Buffer.from(SECRET));
  });

  it('roundtrips with production-default scrypt params', () => {
    const envelope = sealVault(SECRET, 'strong password 42');
    const parsed = JSON.parse(envelope) as { kdf: { n: number; r: number; p: number } };
    expect(parsed.kdf.n).toBe(DEFAULT_SCRYPT_PARAMS.n);
    expect(Buffer.from(openVault(envelope, 'strong password 42'))).toEqual(Buffer.from(SECRET));
  });

  it('produces a unique salt and nonce per seal (same input → different envelopes)', () => {
    const a = JSON.parse(sealVault(SECRET, 'pw-123456', FAST)) as {
      kdf: { salt: string };
      cipher: { nonce: string };
      ct: string;
    };
    const b = JSON.parse(sealVault(SECRET, 'pw-123456', FAST)) as {
      kdf: { salt: string };
      cipher: { nonce: string };
      ct: string;
    };
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.nonce).not.toBe(b.cipher.nonce);
    expect(a.ct).not.toBe(b.ct);
  });

  it('fails with VAULT_DECRYPT_FAILED on a wrong password', () => {
    const envelope = sealVault(SECRET, 'right password', FAST);
    expect(() => openVault(envelope, 'wrong password')).toThrowError(
      expect.objectContaining({ code: 'VAULT_DECRYPT_FAILED' }),
    );
  });

  it('treats NFC/NFD unicode passwords as equivalent (NFKD normalization)', () => {
    const composed = 'café-secret'; // é as one code point
    const decomposed = 'café-secret'; // e + combining accent
    const envelope = sealVault(SECRET, composed, FAST);
    expect(Buffer.from(openVault(envelope, decomposed))).toEqual(Buffer.from(SECRET));
  });

  it('rejects empty secrets and empty passwords', () => {
    expect(() => sealVault(new Uint8Array(0), 'pw-123456', FAST)).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(() => sealVault(SECRET, '', FAST)).toThrowError(expect.objectContaining({ code: 'INVALID_PASSWORD' }));
  });

  it('rejects out-of-bounds scrypt params at seal time (and DoS params at open time)', () => {
    expect(() => sealVault(SECRET, 'pw-123456', { scrypt: { n: 2 ** 23 } })).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
    expect(() => sealVault(SECRET, 'pw-123456', { scrypt: { n: 12345 } })).toThrowError(
      expect.objectContaining({ code: 'INVALID_INPUT' }), // not a power of two
    );
    const envelope = JSON.parse(sealVault(SECRET, 'pw-123456', FAST)) as Record<string, any>;
    envelope['kdf'].n = 2 ** 30; // hostile envelope demanding ~128 GiB
    expect(() => openVault(JSON.stringify(envelope), 'pw-123456')).toThrowError(
      expect.objectContaining({ code: 'VAULT_CORRUPTED' }),
    );
  });
});

describe('vault tamper resistance (GCM + AAD binding)', () => {
  const password = 'tamper-test-password';

  function tampered(mutate: (env: any) => void): string {
    const env = JSON.parse(sealVault(SECRET, password, FAST));
    mutate(env);
    return JSON.stringify(env);
  }

  it('detects ciphertext tampering', () => {
    const env = tampered((e) => {
      const ct: string = e.ct;
      e.ct = (ct[0] === '0' ? '1' : '0') + ct.slice(1);
    });
    expect(() => openVault(env, password)).toThrowError(expect.objectContaining({ code: 'VAULT_DECRYPT_FAILED' }));
  });

  it('detects nonce tampering', () => {
    const env = tampered((e) => {
      e.cipher.nonce = '00'.repeat(12);
    });
    expect(() => openVault(env, password)).toThrowError(expect.objectContaining({ code: 'VAULT_DECRYPT_FAILED' }));
  });

  it('detects salt tampering', () => {
    const env = tampered((e) => {
      e.kdf.salt = 'ab'.repeat(32);
    });
    expect(() => openVault(env, password)).toThrowError(expect.objectContaining({ code: 'VAULT_DECRYPT_FAILED' }));
  });

  it('detects KDF-parameter tampering (params are AAD-bound AND change the key)', () => {
    // Tamper to another IN-BOUNDS cost (2^16: power of two, ≥ MIN_SCRYPT_N). An out-of-bounds
    // value would be rejected by the params check before any decryption is attempted, which would
    // prove nothing about the AAD binding this test exists to prove.
    const env = tampered((e) => {
      e.kdf.n = 2 ** 16;
    });
    expect(() => openVault(env, password)).toThrowError(expect.objectContaining({ code: 'VAULT_DECRYPT_FAILED' }));
  });

  it('rejects unsupported versions and structurally corrupt envelopes', () => {
    const future = tampered((e) => {
      e.v = 2;
    });
    expect(() => openVault(future, password)).toThrowError(
      expect.objectContaining({ code: 'VAULT_UNSUPPORTED_VERSION' }),
    );
    expect(() => openVault('not json at all', password)).toThrowError(
      expect.objectContaining({ code: 'VAULT_CORRUPTED' }),
    );
    expect(() => openVault('{"v":1}', password)).toThrowError(expect.objectContaining({ code: 'VAULT_CORRUPTED' }));
    expect(() =>
      openVault(
        JSON.stringify({
          v: 1,
          kdf: { algo: 'scrypt', n: 2 ** 15, r: 8, p: 1, salt: 'zz' },
          cipher: { algo: 'aes-256-gcm', nonce: '00'.repeat(12) },
          ct: 'aa',
        }),
        password,
      ),
    ).toThrowError(expect.objectContaining({ code: 'VAULT_CORRUPTED' }));
    expect(looksLikeVaultEnvelope('not json at all')).toBe(false);
  });
});

describe('vault property tests', () => {
  // scrypt is deliberately expensive; each run does 2 derivations. The explicit
  // timeout gives headroom under v8 coverage instrumentation (which slows scrypt
  // ~10×) so `test:coverage` stays green without weakening the property.
  it('roundtrips arbitrary secrets and passwords', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 128 }),
        // ≥ 8 chars: the vault's contract REFUSES shorter passwords (see the dedicated floor test),
        // so generating them here would only re-assert that rule, not the round-trip property.
        fc.string({ minLength: 8, maxLength: 64 }),
        (secret, password) => {
          const envelope = sealVault(secret, password, FAST);
          expect(Buffer.from(openVault(envelope, password))).toEqual(Buffer.from(secret));
        },
      ),
      { numRuns: 15 },
    );
  }, 60_000);
});
