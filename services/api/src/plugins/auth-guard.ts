/**
 * Authentication guard — FOUNDATION SKELETON.
 *
 * Scope now: enforce that protected routes carry a syntactically valid
 * `Authorization: Bearer <token>` header and attach a typed `auth` context.
 * Scope later (M7, `packages/auth`, ADR-0015): real SIWE-issued JWT
 * verification via JWKS + device-bound refresh + revocation checks. The seam is
 * `verifyToken`, injected here so the real verifier drops in without touching
 * call sites. This is intentionally NOT a placeholder that fakes success — with
 * the default verifier every token is rejected as unverified, so nothing is
 * silently trusted before real auth lands.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '@intent-wallet/observability';

export interface AuthContext {
  subject: string;
  scopes: string[];
  /** The token's unique id (when present) — used to revoke this single session. */
  tokenId?: string;
  /** The token's issued-at (unix seconds) — the sign-out-everywhere cutoff compares against it. */
  issuedAt?: number;
  /** The token's expiry (unix seconds) — bounds how long a revocation entry must live. */
  expiresAt?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

/** Injected token verifier. Returns the auth context or throws. */
export type TokenVerifier = (token: string) => Promise<AuthContext>;

/** Default verifier: refuses everything until real auth is wired (M7). Fail-closed by design. */
export const rejectingVerifier: TokenVerifier = async () => {
  throw unauthorized('authentication is not yet enabled on this build');
};

export function makeAuthGuard(verifyToken: TokenVerifier) {
  return async function authGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw unauthorized('missing or malformed Authorization header');
    }
    const token = header.slice('Bearer '.length).trim();
    if (token.length === 0) throw unauthorized('empty bearer token');
    request.auth = await verifyToken(token);
  };
}
