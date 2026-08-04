/**
 * SIWE auth routes — replaces the reject-everything auth stub with a real,
 * non-custodial sign-in:
 *
 *   POST /v1/auth/nonce   — issue a one-time challenge bound to an address
 *   POST /v1/auth/verify  — recover the signer + check the nonce → issue a JWT
 *   GET  /v1/me           — a PROTECTED route proving the guard actually enforces
 *
 * The wallet signs the challenge in the browser; the server only ever recovers a
 * public address from the signature. The issued HS256 JWT is the session.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { badRequest, unauthorized } from '@intent-wallet/observability';
import { InMemoryNonceStore, buildSiweMessage, parseSiwe, recoverSiweSigner, type NonceStore } from '../../auth/siwe.js';
import { signJwt, verifyJwt } from '../../auth/jwt.js';
import { InMemorySessionRevoker, type SessionRevoker } from '../../auth/revoker.js';
import { makeAuthGuard, type AuthContext, type TokenVerifier } from '../../plugins/auth-guard.js';

const NONCE_TTL_MS = 5 * 60_000;

const AddressSchema = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/u, 'address must be 0x + 40 hex') });
const VerifySchema = z.object({ message: z.string().min(1).max(4000), signature: z.string().min(1).max(300) });

/**
 * A real token verifier: validates an HS256 SIWE session, fail-closed, and — when a
 * revoker is wired — rejects a token that has been individually revoked or predates a
 * sign-out-everywhere for its subject. The recovered jti/iat/exp ride on the auth
 * context so the logout routes can revoke the exact session.
 */
export function makeJwtVerifier(secret: string, revoker?: SessionRevoker): TokenVerifier {
  return async (token: string): Promise<AuthContext> => {
    const payload = verifyJwt(token, secret);
    if (!payload) throw unauthorized('invalid or expired session');
    if (revoker && (await revoker.isRevoked({ sub: payload.sub, iat: payload.iat, ...(payload.jti ? { jti: payload.jti } : {}) }))) {
      throw unauthorized('session has been revoked');
    }
    return {
      subject: payload.sub,
      scopes: ['wallet'],
      issuedAt: payload.iat,
      expiresAt: payload.exp,
      ...(payload.jti ? { tokenId: payload.jti } : {}),
    };
  };
}

export interface AuthRouteOptions {
  /** HS256 secret that signs session tokens. */
  secret: string;
  /** SIWE domain (the app origin). */
  domain?: string;
  /** Session lifetime (seconds). */
  sessionTtlSec?: number;
  nonces?: NonceStore;
  /** Session revoker (Redis in prod). Enables logout / sign-out-everywhere. */
  revoker?: SessionRevoker;
}

export function registerAuthRoutes(app: FastifyInstance, opts: AuthRouteOptions): void {
  const domain = opts.domain ?? 'localhost';
  const sessionTtlSec = opts.sessionTtlSec ?? 24 * 3600;
  const nonces = opts.nonces ?? new InMemoryNonceStore();
  const revoker = opts.revoker ?? new InMemorySessionRevoker();

  // Unauthenticated + cheap-to-abuse (nonce issuance, ECDSA recovery) → a tighter
  // per-route rate limit on top of the global one.
  const authRateLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  // 1) Challenge — bind a fresh nonce to the address and return the message to sign.
  app.post('/v1/auth/nonce', authRateLimit, async (request) => {
    const parsed = AddressSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest('a valid EVM address is required', { issues: parsed.error.issues });
    const address = parsed.data.address;
    const { nonce, expiresAt } = await nonces.issue(address, NONCE_TTL_MS);
    const message = buildSiweMessage({
      domain,
      address,
      uri: `https://${domain}`,
      nonce,
      issuedAt: new Date().toISOString(),
      expirationTime: new Date(expiresAt).toISOString(),
    });
    return { message, nonce, expiresAt };
  });

  // 2) Verify — recover the signer, check it matches + the nonce is fresh, issue a JWT.
  app.post('/v1/auth/verify', authRateLimit, async (request) => {
    const parsed = VerifySchema.safeParse(request.body);
    if (!parsed.success) throw badRequest('message + signature are required', { issues: parsed.error.issues });
    const fields = parseSiwe(parsed.data.message);
    if (!fields) throw badRequest('malformed SIWE message');
    // EIP-4361 anti-phishing binding: the signed message MUST be scoped to THIS server's
    // domain. Without this, a phishing page could show its own name while smuggling one of
    // our nonces, get the victim to personal_sign it, and replay the signature here for a
    // session. The nonce is one-time, but only the domain check ties it to our origin.
    if (fields.domain !== domain) throw unauthorized('SIWE domain does not match this server');

    let recovered: string;
    try {
      recovered = recoverSiweSigner(parsed.data.message, parsed.data.signature);
    } catch {
      throw unauthorized('signature could not be verified');
    }
    if (recovered.toLowerCase() !== fields.address.toLowerCase()) throw unauthorized('signature does not match the address');
    if (!(await nonces.consume(fields.nonce, fields.address))) throw unauthorized('invalid or already-used nonce');
    // Fail CLOSED on a malformed expiry: `new Date('garbage').getTime()` is NaN, and
    // `NaN < now` is false — so without the finite check a junk expiry would read as "not
    // expired". (The nonce TTL already bounds freshness; this removes the latent trap.)
    const expiryMs = new Date(fields.expirationTime).getTime();
    if (!Number.isFinite(expiryMs) || expiryMs < Date.now()) throw unauthorized('challenge expired or malformed');

    const iat = Math.floor(Date.now() / 1000);
    // A per-token jti makes this exact session individually revocable.
    const token = signJwt({ sub: recovered, iat, exp: iat + sessionTtlSec, jti: randomUUID() }, opts.secret);
    return { token, address: recovered, expiresAt: (iat + sessionTtlSec) * 1000 };
  });

  // Protected routes — need a valid (non-revoked) session. The guard honors the revoker.
  const guard = makeAuthGuard(makeJwtVerifier(opts.secret, revoker));
  app.get('/v1/me', { preHandler: guard }, async (request) => ({
    address: request.auth?.subject ?? '',
    scopes: request.auth?.scopes ?? [],
  }));

  // Sign out THIS session — revoke its jti until it would have expired anyway.
  app.post('/v1/me/logout', { preHandler: guard }, async (request, reply) => {
    const auth = request.auth;
    if (auth?.tokenId && auth.expiresAt) {
      await revoker.revoke(auth.tokenId, auth.expiresAt - Math.floor(Date.now() / 1000));
    }
    return reply.code(204).send();
  });

  // Sign out EVERYWHERE — invalidate every token for this subject issued up to now.
  app.post('/v1/me/logout-all', { preHandler: guard }, async (request, reply) => {
    if (request.auth?.subject) await revoker.revokeAllFor(request.auth.subject, Math.floor(Date.now() / 1000));
    return reply.code(204).send();
  });
}
