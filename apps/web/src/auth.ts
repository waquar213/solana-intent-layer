/**
 * SIWE sign-in from the browser — the client half of non-custodial auth. It asks
 * the server for a challenge, signs it in-browser with the wallet's EVM key
 * (personal_sign — no transaction, no fee, key never leaves the device), and
 * exchanges the signature for a session token. The token is the credential the
 * app attaches to protected requests.
 */
import { evmAddress, signPersonalMessage } from './wallet';

const SESSION_KEY = 'iw.session.v1';

export interface Session {
  token: string;
  address: string;
  expiresAt: number;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(problem.detail ?? `sign-in failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Challenge → in-browser signature → session token. Persists the session locally. */
export async function signIn(): Promise<Session> {
  const address = evmAddress();
  if (!address) throw new Error('Unlock your wallet first.');
  const { message } = await postJson<{ message: string }>('/v1/auth/nonce', { address });
  const signature = signPersonalMessage(message);
  const session = await postJson<Session>('/v1/auth/verify', { message, signature });
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

/** The current non-expired session, or null. */
export function currentSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

/** Best-effort server-side revocation of a captured token. */
async function revoke(path: '/v1/me/logout' | '/v1/me/logout-all', token: string | undefined): Promise<void> {
  if (!token) return;
  try {
    await fetch(path, { method: 'POST', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
  } catch {
    // Network failure shouldn't block a local sign-out; the token still expires on its own.
  }
}

/** Sign out THIS session — drop it LOCALLY FIRST (so no stale token can be read during the async
 *  server round-trip — e.g. an authorize() racing an account switch), THEN revoke it server-side. */
export async function signOut(): Promise<void> {
  const token = currentSession()?.token;
  localStorage.removeItem(SESSION_KEY);
  await revoke('/v1/me/logout', token);
}

/** Sign out EVERYWHERE — drop locally first, then invalidate every session for this wallet server-side. */
export async function signOutEverywhere(): Promise<void> {
  const token = currentSession()?.token;
  localStorage.removeItem(SESSION_KEY);
  await revoke('/v1/me/logout-all', token);
}
