/**
 * Sign-In With Ethereum (EIP-4361) — the server half. The wallet signs a
 * server-issued challenge with its EVM key IN THE BROWSER (personal_sign); the
 * server recovers the signer address and checks it against a one-time nonce.
 * No key ever reaches the server — this is authentication over the same
 * non-custodial signature the wallet already produces.
 */
import { randomBytes } from 'node:crypto';
import { hashPersonalMessage, hexToBytes, recoverEvmAddress } from '@intent-wallet/core';

export interface SiweFields {
  /** The domain the message was scoped to — verified against THIS server (anti-phishing). */
  domain: string;
  address: string;
  nonce: string;
  expirationTime: string;
}

export function buildSiweMessage(args: {
  domain: string;
  address: string;
  uri: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  chainId?: number;
}): string {
  return [
    `${args.domain} wants you to sign in with your Ethereum account:`,
    args.address,
    '',
    'Sign in to Intent Wallet (non-custodial). This request will not trigger a transaction or cost any fees.',
    '',
    `URI: ${args.uri}`,
    'Version: 1',
    `Chain ID: ${args.chainId ?? 1}`,
    `Nonce: ${args.nonce}`,
    `Issued At: ${args.issuedAt}`,
    `Expiration Time: ${args.expirationTime}`,
  ].join('\n');
}

// The first line of an EIP-4361 message is `<domain> wants you to sign in with your
// Ethereum account:` — capture the domain so /verify can bind it to THIS server.
const DOMAIN_RE = /^(\S+) wants you to sign in with your Ethereum account:$/m;
const NONCE_RE = /^Nonce: (\S+)$/m;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/m;
const EXPIRY_RE = /^Expiration Time: (\S+)$/m;

/** Extract the fields we authenticate against; null if the message is malformed. */
export function parseSiwe(message: string): SiweFields | null {
  const domain = DOMAIN_RE.exec(message)?.[1];
  const nonce = NONCE_RE.exec(message)?.[1];
  const address = ADDRESS_RE.exec(message)?.[0];
  const expirationTime = EXPIRY_RE.exec(message)?.[1];
  if (!domain || !nonce || !address || !expirationTime) return null;
  return { domain, address, nonce, expirationTime };
}

/** Recover the EVM address that produced a personal_sign signature over `message`. */
export function recoverSiweSigner(message: string, signatureHex: string): string {
  const sig = hexToBytes(signatureHex.startsWith('0x') ? signatureHex.slice(2) : signatureHex);
  if (sig.length !== 65) throw new Error('signature must be 65 bytes');
  const normalized = sig.slice();
  const v = normalized[64] as number;
  if (v >= 27) normalized[64] = v - 27; // EIP-191 v (27/28) → recovery bit (0/1)
  const digest = hashPersonalMessage(new TextEncoder().encode(message));
  return recoverEvmAddress(digest, normalized);
}

interface NonceRecord {
  address: string;
  expiresAt: number;
}

/**
 * The one-time SIWE challenge store. Async so the implementation can be a shared
 * Redis (multi-replica: a nonce issued by pod A must be consumable — once — by pod
 * B) or an in-memory Map (local). Nonces are ephemeral; the JWT session is the
 * durable, stateless credential.
 */
export interface NonceStore {
  issue(address: string, ttlMs: number): Promise<{ nonce: string; expiresAt: number }>;
  /** Consume (delete) a nonce; true only if it existed, matched the address, and hadn't expired. */
  consume(nonce: string, address: string): Promise<boolean>;
}

/** In-memory one-time nonce store — for local dev + tests (single process). */
export class InMemoryNonceStore implements NonceStore {
  readonly #nonces = new Map<string, NonceRecord>();

  issue(address: string, ttlMs: number): Promise<{ nonce: string; expiresAt: number }> {
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + ttlMs;
    this.#nonces.set(nonce, { address: address.toLowerCase(), expiresAt });
    return Promise.resolve({ nonce, expiresAt });
  }

  consume(nonce: string, address: string): Promise<boolean> {
    const record = this.#nonces.get(nonce);
    if (!record) return Promise.resolve(false);
    this.#nonces.delete(nonce); // one-time use, even on failure
    if (record.expiresAt < Date.now()) return Promise.resolve(false);
    return Promise.resolve(record.address === address.toLowerCase());
  }
}
