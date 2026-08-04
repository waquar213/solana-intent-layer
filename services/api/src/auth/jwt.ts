/**
 * Minimal HS256 JWT — session tokens issued after a successful SIWE sign-in.
 * Uses only node:crypto (HMAC-SHA256) so there is no dependency and no key
 * material beyond the shared server secret. Verification is constant-time and
 * fail-closed: a bad signature, malformed token, or expired `exp` returns null.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  /** The authenticated EVM address. */
  sub: string;
  /** Issued-at (unix seconds). */
  iat: number;
  /** Expiry (unix seconds). */
  exp: number;
  /** Unique token id — enables single-session revocation (optional for legacy tokens). */
  jti?: string;
}

const b64url = (buf: Buffer): string => buf.toString('base64url');
const b64urlJson = (value: unknown): string => b64url(Buffer.from(JSON.stringify(value)));

export function signJwt(payload: JwtPayload, secret: string): string {
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = b64urlJson(payload);
  const data = `${header}.${body}`;
  const sig = b64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyJwt(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  if (!header || !body || !sig) return null;

  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<JwtPayload>;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') return null;
    if (payload.exp < nowSec) return null;
    return {
      sub: payload.sub,
      iat: payload.iat,
      exp: payload.exp,
      ...(typeof payload.jti === 'string' ? { jti: payload.jti } : {}),
    };
  } catch {
    return null;
  }
}
