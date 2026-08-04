/**
 * Address book — named recipients saved on this device (localStorage). Lets the user
 * send to "alice" instead of a 42-char hex string: the Send panel resolves a saved name
 * to its address (client-side, like ENS). Only public data (name + address) is stored;
 * nothing here touches keys. Addresses are validated on add so a typo can't be saved.
 */
export interface Contact {
  name: string;
  address: string;
  /** Rough chain family for display: evm / sol / btc. */
  kind: 'evm' | 'sol' | 'btc' | 'other';
}

const KEY = 'iw.contacts.v1';

const EVM = /^0x[0-9a-fA-F]{40}$/u;
const BTC = /^(bc1|tb1)[0-9a-z]{20,80}$/u;
const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;

/** Classify an address into a rough chain family, or null if it looks invalid. */
export function classify(address: string): Contact['kind'] | null {
  const a = address.trim();
  if (EVM.test(a)) return 'evm';
  if (BTC.test(a)) return 'btc';
  if (SOL.test(a)) return 'sol';
  return null;
}

function read(): Contact[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    // Validate FIELD TYPES, not just object shape: a malformed element (e.g. {} or {name:123}) from a
    // legacy/tampered store parses fine but then crashes consumers that do name.localeCompare /
    // address.trim on the chat-planning + send-preview paths. Drop bad entries instead.
    return arr.filter(
      (c): c is Contact =>
        !!c && typeof c === 'object' && typeof (c as Contact).name === 'string' && typeof (c as Contact).address === 'string',
    );
  } catch {
    return [];
  }
}

function write(contacts: Contact[]): void {
  localStorage.setItem(KEY, JSON.stringify(contacts));
}

/** All saved contacts, sorted by name. */
export function listContacts(): Contact[] {
  return read().sort((a, b) => a.name.localeCompare(b.name));
}

/** Add a contact. Throws on an invalid address, empty/duplicate name, or duplicate address. */
export function addContact(name: string, address: string): Contact[] {
  const n = name.trim();
  const a = address.trim();
  if (n.length === 0 || n.length > 40) throw new Error('Name must be 1–40 characters.');
  const kind = classify(a);
  if (!kind) throw new Error('That does not look like a valid address.');
  const contacts = read();
  if (contacts.some((c) => c.name.toLowerCase() === n.toLowerCase())) throw new Error('A contact with that name already exists.');
  if (contacts.some((c) => c.address.toLowerCase() === a.toLowerCase())) throw new Error('That address is already saved.');
  contacts.push({ name: n, address: a, kind });
  write(contacts);
  return listContacts();
}

/** Remove a contact by address. */
export function removeContact(address: string): Contact[] {
  write(read().filter((c) => c.address.toLowerCase() !== address.trim().toLowerCase()));
  return listContacts();
}

/** Resolve a saved contact NAME (exact, case-insensitive) to its address, or null. */
export function resolveContact(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return read().find((c) => c.name.toLowerCase() === n)?.address ?? null;
}

// Contact names that collide with an asset ticker/name, a command/connector word, or a pure number
// are NOT substituted: whole-word replacing them would corrupt the amount/asset/command region of an
// utterance (a contact named "SOL" turns "send 2 SOL to alice" into "send 2 <0x…> to alice", destroying
// the asset). The recipient-name slot is unaffected — only these reserved tokens are skipped.
const RESERVED_SUBSTITUTION = new Set([
  // Asset tickers + names/aliases the parser recognizes (KNOWN_ASSETS + NAME_ALIASES in packages/intents).
  // Keep in sync with that registry — a missing ticker lets a same-named contact corrupt the asset region.
  'eth', 'weth', 'usdc', 'gusdc', 'dusdc', 'usdt', 'dai', 'sol', 'btc', 'tbtc', 'pol', 'matic', 'bnb', 'wbtc',
  'ethereum', 'bitcoin', 'solana', 'polygon', 'tether', 'ether',
  'to', 'for', 'and', 'send', 'pay', 'transfer', 'swap', 'convert', 'change', 'exchange', 'trade', 'bridge',
  'all', 'half', 'everything', 'my',
  // Negation/deferral tokens the parser's gate keys on. A contact named exactly one of these would
  // otherwise be substituted to an ADDRESS before the parser runs, ERASING the negator — so a DECLINED
  // command ("5 eth ko mat bhejo" = do NOT send; "swap … and leave it") would parse as a confident,
  // auto-signable action. Reserve them so the negation survives. (Such a contact is still reachable by
  // address, just not by bare name — consistent with reserving asset/command tokens above.)
  'never', 'forget', 'nvm', 'cannot', 'dont', 'not', 'skip', 'avoid', 'leave', 'hold', 'instead', 'rather',
  'mat', 'mt', 'nahi', 'nahin', 'nako', 'na',
]);

/**
 * Replace any saved contact name (whole-word, case-insensitive) in `text` with its
 * address, so a chat utterance like "send 0.1 ETH to alice" reaches the planner as a
 * concrete address. Longest names first so "alice smith" wins over "alice".
 */
export function substituteContacts(text: string): string {
  const contacts = read().sort((a, b) => b.name.length - a.name.length);
  let out = text;
  for (const c of contacts) {
    const name = c.name.trim().toLowerCase();
    if (RESERVED_SUBSTITUTION.has(name) || /^\d[\d,]*(?:\.\d+)?$/u.test(name)) continue; // never corrupt an asset/command/amount token
    const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'giu'), c.address);
  }
  return out;
}
