/**
 * Recent recipients — addresses this wallet has actually sent to, kept on-device.
 *
 * It exists so ADDRESS-POISONING detection works without the user manually saving contacts: the
 * moment you send to a real address it becomes a known-good reference, and any later lookalike
 * (same visible ends, different middle) is refused by the chains-package guard.
 *
 * Mobile previously passed NO reference set to `guardBroadcast`, so the lookalike check could
 * never fire here even though the web app had it — a security-feature parity gap on an attack
 * measured at ≥$83.8M stolen (Tsuchiya et al., USENIX Security '25).
 *
 * Only public data (the address) is stored, capped and de-duplicated.
 * (Ported from apps/web/src/recents.ts — localStorage swapped for the storage shim.)
 */
import { storage } from './storage';
import { listContacts } from './contacts';

const KEY = 'iw.recent_recipients.v1';
const CAP = 50;

/** Addresses sent to before, most-recent first. */
export function recentRecipients(): string[] {
  try {
    const raw = storage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    // Bound on READ too (parity with web): the write caps at CAP, but a tampered/legacy oversized array
    // would else be scanned in full by knownGoodAddresses on every send-preview.
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
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — non-fatal; detection falls back to contacts alone */
  }
}

/** The known-good set for poisoning comparison: saved contacts + prior recipients, de-duped. */
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
