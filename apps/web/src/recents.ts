/**
 * Recent recipients — a client-side memory of addresses this wallet has actually sent to.
 * It exists so ADDRESS-POISONING detection works WITHOUT the user manually saving contacts:
 * the moment you send to a real address, it becomes a known-good reference, and any later
 * lookalike (same visible ends, different middle) is caught by the Sentinel guard.
 *
 * Only public data (the address) is stored, in localStorage, capped and de-duplicated. There is
 * no reference to compare against on a brand-new address you've never sent to — that's inherent
 * to poisoning (a lookalike is "alike" to something); for that first send the UI shows a caution.
 */
import { listContacts } from './contacts';

const KEY = 'iw_recent_recipients';
const CAP = 50;

/** Addresses sent to before, most-recent first. */
export function recentRecipients(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    // Bound on READ too: recordRecipient caps at CAP, but a tampered/legacy oversized array would else be
    // scanned in full by knownGoodAddresses on every send-preview.
    return Array.isArray(list) ? (list.filter((x) => typeof x === 'string') as string[]).slice(0, CAP) : [];
  } catch {
    return [];
  }
}

/** Record a successful send's recipient (idempotent, case-insensitive de-dupe, capped). */
export function recordRecipient(address: string): void {
  const a = address.trim();
  if (!a) return;
  try {
    const next = [a, ...recentRecipients().filter((x) => x.toLowerCase() !== a.toLowerCase())].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal, detection just falls back to contacts */
  }
}

/** The full known-good set for poisoning comparison: saved contacts + prior recipients, de-duped. */
export function knownGoodAddresses(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of [...listContacts().map((c) => c.address), ...recentRecipients()]) {
    const k = a.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

/** True when `address` is neither a saved contact nor a prior recipient — a first-time send. */
export function isNewRecipient(address: string): boolean {
  const a = address.trim().toLowerCase();
  if (!a) return false;
  return !knownGoodAddresses().some((k) => k.toLowerCase() === a);
}
