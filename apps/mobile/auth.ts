/**
 * SIWE sign-in from the phone — the client half of non-custodial auth. It asks the server
 * for a challenge, signs it on-device with the wallet's EVM key (personal_sign — no
 * transaction, no fee, key never leaves the device), and exchanges the signature for a
 * session token. The token is the credential the app attaches to protected requests.
 * (Port of apps/web/src/auth.ts — same-origin → API_BASE, localStorage → storage shim,
 * signPersonalMessage → the wallet's signMessage.)
 */
import { API_BASE } from './config';
import { timedFetch } from './api';
import { storage } from './storage';
import { evmAddress, signMessage } from './wallet';

const SESSION_KEY = 'iw.session.v1';

export interface Session {
  token: string;
  address: string;
  expiresAt: number;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await timedFetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(problem.detail ?? `sign-in failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Challenge → on-device signature → session token. Persists the session locally. */
export async function signIn(): Promise<Session> {
  const address = evmAddress();
  if (!address) throw new Error('Unlock your wallet first.');
  const { message } = await postJson<{ message: string }>('/v1/auth/nonce', { address });
  const signature = signMessage(message);
  const session = await postJson<Session>('/v1/auth/verify', { message, signature });
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

/** The current non-expired session, or null. */
export function currentSession(): Session | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

/**
 * The current session's token, but ONLY when it belongs to the ACTIVE account. A SIWE session is bound
 * to the EVM address that signed it; switching/adding an account (or wiping + creating a new wallet)
 * changes the active address, so a prior/other account's token must NOT authorize requests — the server
 * keys identity, portfolio and the spend-cap/outflow ledger by the token's principal, so a mismatch would
 * read/plan/authorize under the WRONG account. Returns null on a mismatch (→ no Bearer → 401 → the app
 * re-signs-in for the active account). Mirrors the account-bound resolver in apps/web/src/api.ts.
 */
export function activeSessionToken(): string | null {
  const session = currentSession();
  const active = evmAddress();
  return session && active && session.address.toLowerCase() === active.toLowerCase() ? session.token : null;
}

/** Best-effort server-side revocation of the current token before dropping it. */
async function revoke(path: '/v1/me/logout' | '/v1/me/logout-all'): Promise<void> {
  const token = currentSession()?.token;
  if (!token) return;
  try {
    await timedFetch(`${API_BASE}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  } catch {
    // Network failure shouldn't block a local sign-out; the token still expires on its own.
  }
}

/** Sign out THIS session — revoke it server-side (so a stolen copy dies), then clear locally. */
export async function signOut(): Promise<void> {
  await revoke('/v1/me/logout');
  storage.removeItem(SESSION_KEY);
}

/** Sign out EVERYWHERE — invalidate every session for this wallet, then clear locally. */
export async function signOutEverywhere(): Promise<void> {
  await revoke('/v1/me/logout-all');
  storage.removeItem(SESSION_KEY);
}
