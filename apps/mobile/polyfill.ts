/**
 * Crypto polyfill — MUST load before @intent-wallet/core / @noble / @scure. Those use Web
 * Crypto's `crypto.getRandomValues` for secure randomness (mnemonic entropy, vault salt +
 * nonce), which Hermes/React Native don't provide. expo-crypto (bundled in Expo Go) gives
 * cryptographically-secure bytes from the OS; we shim it onto globalThis.crypto so the audited
 * core runs unchanged on-device.
 */
import * as ExpoCrypto from 'expo-crypto';

type G = { crypto?: { getRandomValues?: (a: ArrayBufferView) => ArrayBufferView } };
const g = globalThis as unknown as G;
if (!g.crypto) g.crypto = {};
if (!g.crypto.getRandomValues) {
  g.crypto.getRandomValues = (array: ArrayBufferView): ArrayBufferView => {
    const bytes = ExpoCrypto.getRandomBytes(array.byteLength);
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
    return array;
  };
}
